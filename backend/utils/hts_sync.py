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
import os
from datetime import datetime
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database.models import HtsHeatMirror
from ..logger import logger

UPSERT_CHUNK_SIZE = 500

_WATERMARK_FLOOR = datetime(1970, 1, 1)

_ORACLE_THICK_INITIALIZED = False


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


def watermark_for_view(db: Session) -> datetime:
    """
    Return MAX(torpedo_in_time) from hts_heat_mirror, or the epoch floor
    if empty. Used as the WHERE > value in the next incremental pull.
    """
    result = db.execute(
        select(func.max(HtsHeatMirror.torpedo_in_time))
    ).scalar()
    return result or _WATERMARK_FLOOR


def _ensure_thick_mode(client_dir: str) -> bool:
    """Idempotent oracledb thick-mode init. Same pattern as wbatngl_trip_sync."""
    global _ORACLE_THICK_INITIALIZED
    if _ORACLE_THICK_INITIALIZED:
        return True
    if not os.path.isdir(client_dir):
        logger.warning(f"HTS: Oracle Instant Client not found at {client_dir}")
        return False
    try:
        import oracledb
        oracledb.init_oracle_client(lib_dir=client_dir)
        _ORACLE_THICK_INITIALIZED = True
        return True
    except Exception as e:
        if "DPI-1047" in str(e) or "already" in str(e).lower():
            _ORACLE_THICK_INITIALIZED = True
            return True
        logger.warning(f"HTS: thick-mode init failed: {e}")
        return False


def _connect_oracle():
    """Open an HTS Oracle connection."""
    cfg = {
        "host":     os.getenv("HTS_HOST", "10.10.70.227"),
        "port":     int(os.getenv("HTS_PORT", "1522")),
        "user":     os.getenv("HTS_USER", "ICT_IFACE"),
        "password": os.getenv("HTS_PASSWORD", ""),
        "service":  os.getenv("HTS_SERVICE", "JVMLPROD.JSW.IN"),
        "client":   os.getenv("ORACLE_INSTANT_CLIENT_DIR",
                              r"C:\oracle\instantclient_23_0"),
    }
    if not cfg["password"]:
        raise RuntimeError("HTS_PASSWORD not set")
    import oracledb
    _ensure_thick_mode(cfg["client"])
    return oracledb.connect(
        user=cfg["user"], password=cfg["password"],
        dsn=f"{cfg['host']}:{cfg['port']}/{cfg['service']}",
    )


def pull_and_upsert(db: Session, cursor, watermark: datetime) -> dict:
    """
    Run the incremental SELECT against HTS view, upsert into mirror.
    Returns stats dict: fetched / upserted / skipped_no_heat_no / errors.
    """
    view = os.getenv("HTS_VIEW", "HTS.VW_HTS_HOTMETAL_DATA")
    sql = f"SELECT * FROM {view} WHERE TORPEDO_IN_TIME > :wm"
    cursor.execute(sql, wm=watermark)
    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]

    stats = {"fetched": len(rows), "upserted": 0,
             "skipped_no_heat_no": 0, "errors": 0}

    mirror_rows = []
    for r in rows:
        try:
            d = row_to_mirror_dict(r, cols)
        except Exception:
            logger.exception(f"row_to_mirror_dict failed for {r!r}")
            stats["errors"] += 1
            continue
        if d is None:
            stats["skipped_no_heat_no"] += 1
            continue
        mirror_rows.append(d)

    stats["upserted"] = upsert_rows(db, mirror_rows)
    return stats


def run_once() -> dict:
    """
    One scheduler tick. Pulls all heat rows newer than the local
    watermark, UPSERTs into hts_heat_mirror.
    Returns aggregated stats, or {"error": "..."} on Oracle failure.
    """
    from ..database.engine import SessionLocal

    logger.info("HTS sync: starting")

    try:
        conn = _connect_oracle()
    except Exception as e:
        logger.exception(f"HTS connect failed: {e}")
        return {"error": str(e)}

    db = SessionLocal()
    try:
        cur = conn.cursor()
        wm = watermark_for_view(db)
        stats = pull_and_upsert(db, cur, wm)
        logger.info(
            f"HTS sync OK: fetched={stats['fetched']} "
            f"upserted={stats['upserted']} "
            f"skipped={stats['skipped_no_heat_no']} "
            f"errors={stats['errors']} watermark_was={wm}"
        )
        cur.close()
    finally:
        db.close()
        try:
            conn.close()
        except Exception:
            pass
    return stats


if __name__ == "__main__":
    print(run_once())
