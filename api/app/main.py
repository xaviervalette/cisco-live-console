"""
The JSON backend the console reads.

The kit's frontend is a static build that fills its cards over `fetch` after
load, so everything here is plain JSON under `/api`. In development the Astro
dev server runs on 4321 and this on 8000; in production this process also
serves `dist/`, so one port serves the whole console.
"""

from __future__ import annotations

from datetime import date
from io import BytesIO
from typing import Any

from fastapi import FastAPI, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles
from openpyxl import load_workbook

from .analytics import load_overview
from .config import (
    DATASETS,
    DIST_DIR,
    dataset_path,
    ensure_data_dir,
    load_config,
    save_config,
)
from .parsing import read_sheet

# An export of this report is a few hundred kilobytes. Ten megabytes is far
# above anything legitimate and keeps a stray upload from filling the disk.
MAX_UPLOAD_BYTES = 10 * 1024 * 1024

app = FastAPI(title="Cisco Live Console API", version="1.0.0")

# The dev server is a different origin from this one. In production the
# frontend is served from here and no cross-origin request happens at all.
#
# Any localhost port, because Astro picks the next free one when its
# configured port is taken — pinning the list means the console silently
# stops loading on the day 4330 is busy. Loopback only: a deployment serves
# the frontend from this process, where no cross-origin request happens.
app.add_middleware(
    CORSMiddleware,
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1)(:\d+)?$",
    allow_methods=["*"],
    allow_headers=["*"],
)

ensure_data_dir()


def _paths() -> dict[str, Any]:
    return {key: dataset_path(key) for key in DATASETS}


def _dataset_status() -> list[dict[str, Any]]:
    """Per workbook: whether it is there, how big, and how many rows parse.

    The row count is what makes a bad upload obvious — a file that saved
    fine but holds the wrong sheet reports zero rows instead of looking
    healthy.
    """
    status = []
    for key, spec in DATASETS.items():
        path = dataset_path(key)
        exists = path.exists()
        rows: int | None = None
        error: str | None = None
        if exists:
            try:
                rows = len(read_sheet(path))
            except Exception as err:  # noqa: BLE001
                error = str(err)
        status.append(
            {
                "key": key,
                "label": spec["label"],
                "hint": spec["hint"],
                "present": exists,
                "rows": rows,
                "error": error,
                "sizeKb": round(path.stat().st_size / 1024, 1) if exists else None,
                "updatedAt": (
                    date.fromtimestamp(path.stat().st_mtime).isoformat() if exists else None
                ),
            }
        )
    return status


@app.get("/api/health")
def health() -> dict[str, Any]:
    return {"ok": True, "datasets": _dataset_status()}


@app.get("/api/overview")
def overview() -> dict[str, Any]:
    """Every number the Overview view shows."""
    return load_overview(load_config(), _paths())


@app.get("/api/settings")
def get_settings() -> dict[str, Any]:
    return {"config": load_config(), "datasets": _dataset_status()}


@app.put("/api/settings")
def put_settings(payload: dict[str, Any]) -> dict[str, Any]:
    """Save the event details, pass catalogue and expiry horizons.

    Validation is deliberately light but not absent: a pass with no label or
    a non-numeric price would otherwise reach the analytics and divide by
    zero there, far from the field that caused it.
    """
    config = payload.get("config", payload)
    if not isinstance(config, dict):
        raise HTTPException(status_code=400, detail="Expected a config object.")

    passes = config.get("passes")
    if passes is not None:
        if not isinstance(passes, list):
            raise HTTPException(status_code=400, detail="`passes` must be a list.")
        cleaned = []
        for index, spec in enumerate(passes):
            if not isinstance(spec, dict):
                raise HTTPException(status_code=400, detail=f"Pass {index + 1} is not an object.")
            label = str(spec.get("label", "")).strip()
            if not label:
                raise HTTPException(status_code=400, detail=f"Pass {index + 1} has no name.")
            try:
                credits = int(float(spec.get("credits", 0)))
            except (TypeError, ValueError):
                raise HTTPException(
                    status_code=400, detail=f"{label}: credits must be a number."
                ) from None
            if credits <= 0:
                raise HTTPException(status_code=400, detail=f"{label}: credits must be above zero.")
            cleaned.append(
                {
                    "id": str(spec.get("id") or label.lower().replace(" ", "-")),
                    "label": label,
                    "credits": credits,
                    "match": str(spec.get("match", "")).strip().upper(),
                }
            )
        config["passes"] = cleaned

    horizons = config.get("expiryHorizons")
    if horizons is not None:
        try:
            config["expiryHorizons"] = sorted({int(h) for h in horizons if int(h) > 0})
        except (TypeError, ValueError):
            raise HTTPException(status_code=400, detail="Expiry horizons must be whole days.") from None

    return {"config": save_config(config), "datasets": _dataset_status()}


@app.post("/api/upload/{dataset}")
async def upload(dataset: str, file: UploadFile) -> dict[str, Any]:
    """Replace one of the two workbooks.

    The file is validated before it replaces anything: a rejected upload
    leaves the previous workbook in place, so a mistaken drag does not take
    the dashboard down.
    """
    if dataset not in DATASETS:
        raise HTTPException(status_code=404, detail=f"Unknown dataset '{dataset}'.")

    name = (file.filename or "").lower()
    if not name.endswith((".xlsx", ".xlsm")):
        raise HTTPException(status_code=400, detail="Expected an .xlsx export from Cisco.")

    payload = await file.read()
    if not payload:
        raise HTTPException(status_code=400, detail="That file is empty.")
    if len(payload) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="That file is larger than 10 MB.")

    # Validate in memory, not from a temp file: openpyxl dispatches on the
    # file name, so anything not ending in .xlsx is refused before it is
    # even read. Nothing touches the stored workbook until this passes.
    try:
        workbook = load_workbook(BytesIO(payload), data_only=True, read_only=True)
        try:
            sheet = workbook.worksheets[0]
            header = next(sheet.iter_rows(values_only=True), None)
        finally:
            workbook.close()
    except Exception as err:  # noqa: BLE001
        raise HTTPException(status_code=400, detail=f"Not a readable workbook: {err}") from None

    if not header:
        raise HTTPException(status_code=400, detail="That workbook has no header row.")

    # Each export has a column only it has, which is enough to catch the two
    # files being dropped into each other's zone — an easy mistake to make
    # and a confusing one to debug from the dashboard.
    columns = {str(c).strip() for c in header if c is not None}
    required = {"transactions": "CourseAcronym", "credits": "Purchased"}[dataset]
    if required not in columns:
        raise HTTPException(
            status_code=400,
            detail=(
                f"This does not look like the {DATASETS[dataset]['label']}: "
                f"no '{required}' column. Are the two files the right way round?"
            ),
        )

    # Write beside the target and rename, so a crash mid-write cannot leave
    # a half-written workbook where a readable one used to be. The staging
    # name keeps the .xlsx suffix for the same reason as above.
    target = dataset_path(dataset)
    staging = target.with_name(f"{target.stem}.incoming{target.suffix}")
    try:
        staging.write_bytes(payload)
        staging.replace(target)
    finally:
        staging.unlink(missing_ok=True)

    return {"ok": True, "dataset": dataset, "datasets": _dataset_status()}


@app.delete("/api/upload/{dataset}")
def remove_upload(dataset: str) -> dict[str, Any]:
    """Drop a workbook. The next boot seeds the example back in its place."""
    if dataset not in DATASETS:
        raise HTTPException(status_code=404, detail=f"Unknown dataset '{dataset}'.")
    dataset_path(dataset).unlink(missing_ok=True)
    return {"ok": True, "dataset": dataset, "datasets": _dataset_status()}


@app.exception_handler(HTTPException)
def http_error(_request: Any, exc: HTTPException) -> JSONResponse:
    """Errors in the shape the frontend reads, so it can show the reason."""
    return JSONResponse(status_code=exc.status_code, content={"detail": exc.detail})


# Serve the built frontend when there is one. Mounted last so it cannot
# shadow /api, and skipped entirely in development where Astro serves it.
if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="console")
