"""
WBATNGL → HMD wbatngl_trip_mirror sync.

Pulls trip-transaction rows from JSW's WBATNGL Oracle every 60 s, UPSERTs
into local PostgreSQL `wbatngl_trip_mirror`. Decoupled from the manual
trip flow — see docs/plans/2026-05-08-wbatngl-trip-mirror-design.md.

Env vars (read at runtime):
    WBATNGL_TRIP_SYNC_ENABLED   default false
    WBATNGL_HOST/PORT/USER/PASSWORD/SERVICE   shared with capacity sync
    ORACLE_INSTANT_CLIENT_DIR
"""
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database.models import WbatnglTripMirror
from ..logger import logger


_WATERMARK_FLOOR = datetime(1970, 1, 1)


_DATE_FORMATS = [
    "%d/%m/%Y %H:%M:%S",        # FIRST_TARE_TIME varchar form (DD/MM/YYYY)
    "%m/%d/%Y %I:%M:%S %p",     # RECEIVED_DATE form (MM/DD/YYYY 12-hour AM/PM)
    "%Y-%m-%d %H:%M:%S",        # ISO-like, in case Oracle returns this
]


def normalize_ladleno(raw: Optional[str]) -> Optional[str]:
    """
    Normalize a WBATNGL `LADLENO` string to HMD's canonical fleet_id form.

    "TLC 01" / "TLC-01" / "TLC01" / "TLC-1" → "TLC-01".
    Returns None for anything that isn't a torpedo (OTL, empty, etc.).

    Note: this duplicates wbatngl_capacity_sync.normalize_ladleno() to keep
    this module free of the oracledb import. If you change one, change both.
    """
    if not raw:
        return None
    s = str(raw).strip().upper()
    if not s.startswith("TLC"):
        return None
    digits = "".join(c for c in s[3:] if c.isdigit())
    if not digits:
        return None
    return f"TLC-{int(digits):02d}"


def parse_wbatngl_date(raw: Optional[str | datetime]) -> Optional[datetime]:
    """
    Parse a WBATNGL date that might already be a datetime, or a VARCHAR2
    in one of the formats JSW uses. Returns None for empty/garbage input
    (with a warning log) instead of raising — never crash the sync batch.
    """
    if raw is None:
        return None
    if isinstance(raw, datetime):
        return raw
    s = str(raw).strip()
    if not s:
        return None
    for fmt in _DATE_FORMATS:
        try:
            return datetime.strptime(s, fmt)
        except ValueError:
            continue
    logger.warning(f"parse_wbatngl_date: unparseable value {s!r}")
    return None


def _zero_to_null(value: Optional[float | int]) -> Optional[float]:
    """
    WBATNGL stores TEMP=0 / S_L=0 / SI_L=0 to mean "not measured." Storing
    those as 0 in the mirror would bias chemistry averages downward, so we
    coerce to None. Treats any value ≤ 1e-9 (and negatives) as unmeasured.
    """
    if value is None:
        return None
    try:
        v = float(value)
    except (TypeError, ValueError):
        return None
    if v <= 1e-9:
        return None
    return v


def row_to_mirror_dict(
    row: tuple,
    cols: list[str],
    source_table: str,
) -> Optional[dict]:
    """
    Map an Oracle row tuple to a dict shaped for `wbatngl_trip_mirror` UPSERT.

    Returns None for rows that should be skipped (e.g., non-torpedo LADLENOs).
    """
    r = dict(zip(cols, row))
    fleet_id = normalize_ladleno(r.get("LADLENO"))
    if fleet_id is None:
        return None    # not a torpedo; caller increments skipped counter

    return {
        "trip_id": r.get("TRIP_ID"),
        "tap_no": r.get("TAPNO"),
        "ladleno_raw": r.get("LADLENO"),
        "fleet_id": fleet_id,
        "source_lab": r.get("SOURCE_LAB"),
        "destination": (r.get("DESTINATION") or "").strip() or None,
        "tap_hole": r.get("TAPHOLE"),

        "gross_weight": r.get("GROSS_WEIGHT"),
        "tare_weight": r.get("TARE_WEIGHT"),
        "net_weight": r.get("NET_WEIGHT"),

        "temp": _zero_to_null(r.get("TEMP")),
        "si_l": _zero_to_null(r.get("SI_L")),
        "s_l":  _zero_to_null(r.get("S_L")),
        "bds_temp": _zero_to_null(r.get("BDS_TEMP") or r.get("HTS_BDS_TEMP")),

        "shift": (r.get("SHIFT") or "").strip() or None,
        "source_table": source_table,

        "first_tare_time": parse_wbatngl_date(r.get("FIRST_TARE_TIME")),
        "out_date":        parse_wbatngl_date(r.get("OUT_DATE")),
        "closetime":       parse_wbatngl_date(r.get("CLOSETIME")),
        "received_date":   parse_wbatngl_date(r.get("RECEIVED_DATE")),
        "sms_ack_time":    parse_wbatngl_date(r.get("SMS_ACK_TIME")),
        "updated_date":    parse_wbatngl_date(r.get("UPDATED_DATE")),
    }


def upsert_rows(db: Session, rows: list[dict]) -> int:
    """
    UPSERT a batch of mirror dicts into wbatngl_trip_mirror.
    Conflict target: trip_id (unique constraint).
    Update columns: everything except id, trip_id, synced_at.

    Production runs on PostgreSQL; tests run on SQLite. Both dialects
    expose `on_conflict_do_update(index_elements=...)` with identical
    semantics, so we dispatch on the bound engine's dialect.
    Returns count of rows successfully UPSERTed.
    """
    if not rows:
        return 0

    update_cols = [
        c.name for c in WbatnglTripMirror.__table__.columns
        if c.name not in ("id", "trip_id", "synced_at")
    ]

    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as dialect_insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as dialect_insert
    else:
        raise RuntimeError(
            f"upsert_rows: unsupported dialect {dialect!r} (need postgresql or sqlite)"
        )

    stmt = dialect_insert(WbatnglTripMirror).values(rows)
    stmt = stmt.on_conflict_do_update(
        index_elements=["trip_id"],
        set_={col: stmt.excluded[col] for col in update_cols},
    )
    db.execute(stmt)
    db.commit()
    return len(rows)


def watermark_for_source(db: Session, source_table: str) -> datetime:
    """
    Return MAX(updated_date) for the given source_table, or the epoch floor
    if the mirror has no rows for that source yet (used as the WHERE > value
    in the next incremental pull).
    """
    result = db.execute(
        select(func.max(WbatnglTripMirror.updated_date))
        .where(WbatnglTripMirror.source_table == source_table)
    ).scalar()
    return result or _WATERMARK_FLOOR
