"""
HTS → HMD hts_heat_mirror sync.

Pulls heat-pour rows from JSW's HTS Oracle (HTS.VW_HTS_HOTMETAL_DATA)
every HTS_SYNC_INTERVAL_SECONDS (default 300 = 5 min), UPSERTs into the
local Postgres hts_heat_mirror table. Decoupled from the existing
WBATNGL sync — see docs/plans/2026-05-11-operations-live-design.md.

Env vars (read at runtime):
    HTS_SYNC_ENABLED         default false
    HTS_HOST/PORT/USER/PASSWORD/SERVICE   shared with WBATNGL pattern
    HTS_VIEW                 default HTS.VW_HTS_HOTMETAL_DATA
    HTS_SYNC_INTERVAL_SECONDS default 300
    ORACLE_INSTANT_CLIENT_DIR shared with WBATNGL sync
"""
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database.models import HtsHeatMirror
from ..logger import logger

UPSERT_CHUNK_SIZE = 500


def normalize_torpedo_no(raw: Optional[str]) -> Optional[str]:
    """
    Normalize HTS TORPEDO_NO ("22") to HMD canonical fleet_id ("TLC-22").
    Mirrors normalize_ladleno() from wbatngl_trip_sync but for the
    plain-integer form HTS uses.

    Returns None for empty / non-numeric input (validation upstream).
    """
    if not raw:
        return None
    s = str(raw).strip()
    if not s.isdigit():
        return None
    return f"TLC-{int(s):02d}"


def row_to_mirror_dict(row: tuple, cols: list) -> Optional[dict]:
    """
    Map an Oracle row tuple to a dict shaped for hts_heat_mirror UPSERT.
    Returns None if heat_no (the natural PK) is missing.
    """
    r = dict(zip(cols, row))
    heat_no = r.get("HEAT_NO")
    if not heat_no:
        return None
    raw_torpedo = r.get("TORPEDO_NO")
    sms_raw = r.get("SMS")
    return {
        "heat_no": heat_no,
        "converter_no": (r.get("CONVERTER_NO") or "").strip() or None,
        "sms": (str(sms_raw).strip() or None) if sms_raw is not None else None,
        "torpedo_no": normalize_torpedo_no(raw_torpedo),
        "torpedo_no_raw": str(raw_torpedo) if raw_torpedo is not None else None,
        "hotmetal_qty": r.get("HOTMETAL_QTY"),
        "torpedo_qty": r.get("TORPEDO_QTY"),
        "torpedo_in_time": r.get("TORPEDO_IN_TIME"),
        "torpedo_out_time": r.get("TORPEDO_OUT_TIME"),
        "converter_life": r.get("CONVERTER_LIFE"),
    }


def upsert_rows(db: Session, rows: list) -> int:
    """
    UPSERT a batch of mirror dicts into hts_heat_mirror.
    Conflict target: heat_no (unique).
    synced_at is bumped to NOW() on every upsert (insert OR update) so
    the UI's "last sync" label reflects sync activity (see
    wbatngl_trip_sync.upsert_rows for the same pattern + rationale,
    changes_tracker entry #52).

    Filters out None values (row_to_mirror_dict returns None for invalid rows).
    """
    rows = [r for r in rows if r is not None]
    if not rows:
        return 0

    update_cols = [
        c.name for c in HtsHeatMirror.__table__.columns
        if c.name not in ("id", "heat_no", "synced_at")
    ]

    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert as dialect_insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert as dialect_insert
    else:
        raise RuntimeError(f"upsert_rows: unsupported dialect {dialect!r}")

    persisted = 0
    for i in range(0, len(rows), UPSERT_CHUNK_SIZE):
        chunk = rows[i:i + UPSERT_CHUNK_SIZE]
        stmt = dialect_insert(HtsHeatMirror).values(chunk)
        set_dict = {col: stmt.excluded[col] for col in update_cols}
        set_dict["synced_at"] = func.now()
        stmt = stmt.on_conflict_do_update(
            index_elements=["heat_no"],
            set_=set_dict,
        )
        db.execute(stmt)
        persisted += len(chunk)
    db.commit()
    return persisted
