"""
Paths, defaults and the settings store.

Everything the console lets you change from the Settings view lands in
`data/config.json`. The two workbooks land in `data/uploads/`. Nothing else
in the backend holds state, so deleting `data/` resets the console to the
shipped defaults and the example exports.
"""

from __future__ import annotations

import json
import shutil
from pathlib import Path
from typing import Any

# api/app/config.py -> api/app -> api -> project root
ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = ROOT / "data"
UPLOAD_DIR = DATA_DIR / "uploads"
EXAMPLE_DIR = ROOT / "examples"
CONFIG_PATH = DATA_DIR / "config.json"
DIST_DIR = ROOT / "dist"

# The two workbooks the console reads. `example` is a filename PREFIX, not a
# whole name: the portal appends an export timestamp and the account name to
# every file it produces, so matching on the prefix lets an export be dropped
# into `examples/` untouched. That directory is not in the repository — the
# exports name real people — so on a clean checkout nothing is seeded and the
# console starts empty until the first upload.
DATASETS: dict[str, dict[str, str]] = {
    "transactions": {
        "label": "Transaction Report",
        "hint": "CLC transaction export — one row per debit, credit or refund.",
        "example": "TransactionReport",
        "filename": "transactions.xlsx",
    },
    "credits": {
        "label": "SO History",
        "hint": "Credit pools — purchased, balance, expired and expiry per SO.",
        "example": "SO_History",
        "filename": "credits.xlsx",
    },
}

# Credit prices are the ones observed in the Early Bird CLEMEA2027 debits
# (Full Conference 36, IT Leadership 43); the other two come from the 2026
# and 2025 editions. All of them are editable from the Settings view.
#
# `match` is tested against whatever follows the edition code in
# `CourseAcronym` — 'ITL-EB', 'FC-STD', 'EXPGPST', 'TS8'. Longest token wins,
# so 'ITL' is never shadowed by a shorter pattern.
DEFAULT_CONFIG: dict[str, Any] = {
    "event": {
        "code": "CLEMEA2027",
        "name": "Cisco Live EMEA 2027",
        "location": "ExCeL London, United Kingdom",
        "startDate": "2027-02-08",
        "endDate": "2027-02-12",
    },
    "passes": [
        {"id": "fc", "label": "Full Conference", "credits": 36, "match": "FC"},
        {"id": "itl", "label": "IT Leadership", "credits": 43, "match": "ITL"},
        {"id": "ex", "label": "Explorer", "credits": 18, "match": "EX"},
        {"id": "ts", "label": "Technical Seminar", "credits": 11, "match": "TS"},
    ],
    # Buckets for the "credits expiring" card, in days from today.
    "expiryHorizons": [90, 180, 365],
}


def ensure_data_dir() -> None:
    """Create `data/` and seed the uploads from `examples/` on a cold start.

    Seeding only ever fills a gap: a dataset the user has uploaded is left
    alone, so this is safe to call on every boot.
    """
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    if not EXAMPLE_DIR.is_dir():
        return

    for spec in DATASETS.values():
        target = UPLOAD_DIR / spec["filename"]
        if target.exists():
            continue
        # First export whose name starts with the prefix, oldest name first
        # so the choice is stable when several are lying around.
        match = next(
            (
                path
                for path in sorted(EXAMPLE_DIR.glob("*.xlsx"))
                if path.name.lower().startswith(spec["example"].lower())
            ),
            None,
        )
        if match:
            shutil.copy2(match, target)


def _merge(base: Any, override: Any) -> Any:
    """Deep-merge saved settings over the defaults.

    A config written by an older version is missing whatever keys were added
    since. Merging rather than replacing means those keys arrive with their
    default instead of as None, so the console never has to guard for them.
    Lists are replaced wholesale — a pass catalogue of two entries must not
    inherit a third from the defaults.
    """
    if isinstance(base, dict) and isinstance(override, dict):
        out = dict(base)
        for key, value in override.items():
            out[key] = _merge(base.get(key), value) if key in base else value
        return out
    return override


def load_config() -> dict[str, Any]:
    """The current settings, defaults filled in for anything absent."""
    if not CONFIG_PATH.exists():
        return json.loads(json.dumps(DEFAULT_CONFIG))
    try:
        saved = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        # A hand-edited config that no longer parses should not take the
        # console down with it; fall back to the defaults and say nothing.
        return json.loads(json.dumps(DEFAULT_CONFIG))
    return _merge(DEFAULT_CONFIG, saved)


def save_config(config: dict[str, Any]) -> dict[str, Any]:
    """Persist settings and hand back what was actually stored."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    merged = _merge(DEFAULT_CONFIG, config)
    CONFIG_PATH.write_text(json.dumps(merged, indent=2) + "\n", encoding="utf-8")
    return merged


def dataset_path(key: str) -> Path:
    """Where a dataset's workbook lives on disk."""
    return UPLOAD_DIR / DATASETS[key]["filename"]
