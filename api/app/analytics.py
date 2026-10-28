"""
Turning the two exports into the numbers the Overview view shows.

The one judgement call that matters here is **what counts as a participant**.
A row is not a person: one registration can be split across several SO
numbers, a person can be registered once and refunded, and a denied debit
leaves a row behind that never became a pass. So the chain is

    rows -> bookings (grouped by TransactionId) -> people (grouped by email)

and a person counts when their live bookings, net of refunds, still carry
credits.
"""

from __future__ import annotations

import math
from datetime import date
from typing import Any

from .parsing import read_credit_pools, read_customer, read_transactions


def customer_name(paths: dict[str, Any]) -> str:
    """Whose account this console is showing, read from the workbook.

    Not configuration: the header names whoever the uploaded export belongs
    to, so replacing the workbook renames the console and no deployment
    carries another organisation's name in its source.
    """
    path = paths.get("transactions")
    if not path or not path.exists():
        return ""
    try:
        return read_customer(path)
    except Exception:  # noqa: BLE001 - an unreadable workbook is reported elsewhere
        return ""


def classify_pass(suffixes: list[str], passes: list[dict[str, Any]]) -> dict[str, Any] | None:
    """Which configured pass a registration's acronym suffixes describe.

    Patterns are tried longest-first so a short one cannot shadow a longer
    one that also matches — 'ITL-EB' must not be read as Explorer because
    'EX' happens to appear in some other pass's pattern.
    """
    ordered = sorted(
        (p for p in passes if str(p.get("match", "")).strip()),
        key=lambda p: len(str(p["match"])),
        reverse=True,
    )
    for suffix in suffixes:
        for spec in ordered:
            if str(spec["match"]).upper() in suffix.upper():
                return spec
    return None


def _bookings(rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Collapse rows into one booking per TransactionId.

    Credits are summed across the SO numbers a single booking was split
    over, which is the whole reason this step exists.
    """
    grouped: dict[str, dict[str, Any]] = {}

    for row in rows:
        key = row["transactionId"]
        booking = grouped.get(key)
        if booking is None:
            booking = grouped[key] = {
                "transactionId": key,
                "date": row["date"],
                "type": row["type"],
                "status": row["status"],
                "live": row["live"],
                "void": row["void"],
                "refund": row["refund"],
                "attendeeName": row["attendeeName"],
                "attendeeEmail": row["attendeeEmail"],
                "edition": row["edition"],
                "suffixes": list(row["suffixes"]),
                "courseName": row["courseName"],
                "credits": 0.0,
                "sos": [],
            }
        booking["credits"] += abs(row["credits"])
        if row["so"] and row["so"] not in booking["sos"]:
            booking["sos"].append(row["so"])

    return sorted(grouped.values(), key=lambda b: (b["date"] or date.min), reverse=True)


def people(rows: list[dict[str, Any]], passes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """The registered people behind a set of transaction rows.

    Identity is the attendee email where there is one, and the lowercased
    name otherwise — a handful of older rows carry no email at all.
    """
    by_person: dict[str, dict[str, Any]] = {}

    for booking in _bookings(rows):
        identity = booking["attendeeEmail"] or booking["attendeeName"].lower()
        if not identity:
            continue

        person = by_person.get(identity)
        if person is None:
            person = by_person[identity] = {
                "id": identity,
                "name": booking["attendeeName"] or booking["attendeeEmail"],
                "email": booking["attendeeEmail"],
                "credits": 0.0,
                "refunded": 0.0,
                "bookings": [],
                "sos": [],
                "pass": None,
                "registeredOn": None,
            }

        person["bookings"].append(booking)

        if booking["live"]:
            person["credits"] += booking["credits"]
            for so in booking["sos"]:
                if so not in person["sos"]:
                    person["sos"].append(so)
            # Bookings arrive newest first, so the first live one seen is the
            # current pass and the registration date.
            if person["pass"] is None:
                person["pass"] = classify_pass(booking["suffixes"], passes)
                person["registeredOn"] = booking["date"]
        elif booking["refund"]:
            person["refunded"] += booking["credits"]

    registered: list[dict[str, Any]] = []
    for person in by_person.values():
        net = person["credits"] - person["refunded"]
        # A denied or fully refunded registration leaves rows behind but no
        # pass, so it must not reach the headline count.
        if net <= 0:
            continue
        spec = person["pass"]
        registered.append(
            {
                "name": person["name"],
                "email": person["email"],
                "pass": spec["label"] if spec else "Other",
                "passId": spec["id"] if spec else None,
                "credits": round(net),
                "sos": person["sos"],
                "registeredOn": person["registeredOn"].isoformat() if person["registeredOn"] else None,
            }
        )

    registered.sort(key=lambda p: (p["registeredOn"] or "", p["name"]), reverse=True)
    return registered


def _editions(records: list[dict[str, Any]], passes: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Participants and credits per edition, newest first.

    The Overview focuses on one edition, but the previous ones are what make
    its numbers mean anything — two registrations is only low next to six.
    """
    codes = {r["edition"] for r in records if r["edition"]}
    summary = []
    for code in codes:
        rows = [r for r in records if r["edition"] == code]
        registered = people(rows, passes)
        summary.append(
            {
                "code": code,
                "participants": len(registered),
                "credits": round(sum(p["credits"] for p in registered)),
            }
        )
    # The year is the last four characters of the code, which sorts fine as
    # text and keeps editions of different families apart within a year.
    summary.sort(key=lambda e: e["code"][-4:], reverse=True)
    return summary


def _expiry(pools: list[dict[str, Any]], horizons: list[int], event_start: date | None) -> dict[str, Any]:
    """Credits still available, bucketed by how soon they die.

    Buckets are cumulative on purpose — "180 days" includes the 90-day
    credits, because the question being asked is "how much must I spend by
    then", not "how much sits in this particular slice".
    """
    live = [p for p in pools if p["balance"] > 0 and p["daysRemaining"] is not None]

    buckets = [
        {
            "days": horizon,
            "credits": round(sum(p["balance"] for p in live if p["daysRemaining"] <= horizon)),
        }
        for horizon in sorted(horizons)
    ]

    before_event = 0.0
    if event_start:
        before_event = sum(
            p["balance"] for p in live if p["expirationDate"] and p["expirationDate"] < event_start
        )

    return {
        "buckets": buckets,
        "beforeEvent": round(before_event),
        # Already written off, from previous years — the cost of not planning.
        "alreadyExpired": round(sum(p["expired"] for p in pools)),
    }


def build_overview(
    config: dict[str, Any],
    transactions: list[dict[str, Any]],
    pools: list[dict[str, Any]],
    today: date | None = None,
) -> dict[str, Any]:
    """The whole Overview payload, in one object the frontend can fan out."""
    today = today or date.today()
    event = config["event"]
    passes = config["passes"]
    code = str(event.get("code", "")).upper()

    try:
        event_start = date.fromisoformat(str(event.get("startDate", "")))
    except ValueError:
        event_start = None

    edition_rows = [r for r in transactions if r["edition"] == code]
    registered = people(edition_rows, passes)

    balance = sum(p["balance"] for p in pools)
    purchased = sum(p["purchased"] for p in pools)
    used = sum(p["used"] for p in pools)

    # Purchasing power: what the balance buys, per pass type, on top of the
    # people already registered. Balance is the whole balance — expiry is
    # reported beside it rather than silently netted out of it.
    purchasing_power = [
        {
            "id": spec["id"],
            "label": spec["label"],
            "credits": spec["credits"],
            "affordable": math.floor(balance / spec["credits"]) if spec["credits"] > 0 else 0,
            "registered": sum(1 for p in registered if p["passId"] == spec["id"]),
        }
        for spec in passes
    ]

    by_pass = [
        {
            "label": spec["label"],
            "registered": sum(1 for p in registered if p["passId"] == spec["id"]),
            "credits": round(sum(p["credits"] for p in registered if p["passId"] == spec["id"])),
        }
        for spec in passes
    ]
    # Anything whose acronym matched no configured pattern. Shown rather than
    # dropped, so a pass type missing from Settings is visible.
    unmatched = [p for p in registered if p["passId"] is None]
    if unmatched:
        by_pass.append(
            {
                "label": "Unclassified",
                "registered": len(unmatched),
                "credits": round(sum(p["credits"] for p in unmatched)),
            }
        )

    return {
        "event": {
            **event,
            "daysToStart": (event_start - today).days if event_start else None,
        },
        "participants": {
            "total": len(registered),
            "credits": round(sum(p["credits"] for p in registered)),
            "byPass": [row for row in by_pass if row["registered"]],
            "list": registered,
        },
        "credits": {
            "purchased": round(purchased),
            "used": round(used),
            "balance": round(balance),
            "expired": round(sum(p["expired"] for p in pools)),
            "pools": [
                {
                    **pool,
                    "purchaseDate": pool["purchaseDate"].isoformat() if pool["purchaseDate"] else None,
                    "expirationDate": pool["expirationDate"].isoformat() if pool["expirationDate"] else None,
                }
                for pool in pools
            ],
        },
        "purchasingPower": purchasing_power,
        "expiry": _expiry(pools, config.get("expiryHorizons", []), event_start),
        "editions": _editions(transactions, passes),
        "generatedOn": today.isoformat(),
    }


def load_overview(config: dict[str, Any], paths: dict[str, Any], today: date | None = None) -> dict[str, Any]:
    """Read whichever workbooks are present and build the payload.

    A missing workbook yields empty records rather than an error: the console
    must degrade to zeroes with a warning, not to a stack trace, because a
    fresh install has no uploads at all.
    """
    warnings: list[str] = []

    transactions: list[dict[str, Any]] = []
    pools: list[dict[str, Any]] = []

    tx_path = paths.get("transactions")
    if tx_path and tx_path.exists():
        try:
            transactions = read_transactions(tx_path)
        except Exception as err:  # noqa: BLE001 - surfaced to the UI, not swallowed
            warnings.append(f"Transaction Report could not be read: {err}")
    else:
        warnings.append("No Transaction Report uploaded yet.")

    pool_path = paths.get("credits")
    if pool_path and pool_path.exists():
        try:
            pools = read_credit_pools(pool_path, today=today)
        except Exception as err:  # noqa: BLE001
            warnings.append(f"SO History could not be read: {err}")
    else:
        warnings.append("No SO History uploaded yet.")

    payload = build_overview(config, transactions, pools, today=today)
    payload["customer"] = customer_name(paths)
    payload["warnings"] = warnings
    return payload
