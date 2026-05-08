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
import os
from datetime import datetime, timedelta
from typing import Optional

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from ..database.models import WbatnglTripMirror
from ..logger import logger


_WATERMARK_FLOOR = datetime(1970, 1, 1)


SOURCE_TABLES = [
    'BF3."WB_TRANS_DATA_ITRO"',
    'BF5."ZWB_TRANSACTION_DATA_ITRO_B"',
]

CACHE_KEY_JSW_DASHBOARD = "jsw_dashboard"

_ORACLE_THICK_INITIALIZED = False


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


UPSERT_CHUNK_SIZE = 500


def _dedupe_by_trip_id(rows: list[dict]) -> list[dict]:
    """
    Collapse rows that share a trip_id, keeping the one with the latest
    updated_date (None treated as oldest).

    PostgreSQL's `INSERT ... ON CONFLICT (trip_id) DO UPDATE` raises
    `cardinality_violation: ON CONFLICT DO UPDATE command cannot affect
    row a second time` when the same conflict-target row appears twice
    in the same statement. Oracle frequently returns multiple rows per
    TRIP_ID (a trip's weight gets revised → multiple UPDATED_DATE entries
    sharing one TRIP_ID), so we MUST dedupe before sending to PG.

    The latest-by-updated_date wins because that's the value the next
    sync tick's watermark will see anyway — picking the older one would
    just cause it to be overwritten on the very next pull.
    """
    if not rows:
        return rows
    by_id: dict[str, dict] = {}
    epoch = datetime(1970, 1, 1)
    for r in rows:
        tid = r["trip_id"]
        existing = by_id.get(tid)
        if existing is None:
            by_id[tid] = r
            continue
        new_ts = r.get("updated_date") or epoch
        old_ts = existing.get("updated_date") or epoch
        if new_ts >= old_ts:
            by_id[tid] = r
    return list(by_id.values())


def upsert_rows(db: Session, rows: list[dict]) -> int:
    """
    UPSERT a batch of mirror dicts into wbatngl_trip_mirror.
    Conflict target: trip_id (unique constraint).
    Update columns: everything except id, trip_id, synced_at.

    Production runs on PostgreSQL; tests run on SQLite. Both dialects
    expose `on_conflict_do_update(index_elements=...)` with identical
    semantics, so we dispatch on the bound engine's dialect.

    Behaviour:
      - Deduplicates `rows` by trip_id before sending to PG (PG rejects
        duplicates within a single ON CONFLICT statement; see _dedupe_by_trip_id).
      - Chunks at UPSERT_CHUNK_SIZE rows per statement so a 30 k-row
        backfill doesn't blow past psycopg2's 32 767-bound-parameter limit
        (3598 rows × 22 cols = ~79 k parameters → exceeded the limit on
        SMS4 2026-05-08, masked as a generic DataError).
      - Commits once at the end so all chunks land atomically.

    Returns count of rows actually persisted (post-dedup), not input length.
    """
    if not rows:
        return 0

    deduped = _dedupe_by_trip_id(rows)

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

    persisted = 0
    for i in range(0, len(deduped), UPSERT_CHUNK_SIZE):
        chunk = deduped[i:i + UPSERT_CHUNK_SIZE]
        stmt = dialect_insert(WbatnglTripMirror).values(chunk)
        stmt = stmt.on_conflict_do_update(
            index_elements=["trip_id"],
            set_={col: stmt.excluded[col] for col in update_cols},
        )
        db.execute(stmt)
        persisted += len(chunk)
    db.commit()
    return persisted


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


def pull_and_upsert_from_source(
    db: Session,
    cursor,
    source_table: str,
    watermark: datetime,
) -> dict:
    """
    Execute the incremental SELECT against `source_table`, run each row
    through row_to_mirror_dict, UPSERT the surviving torpedo rows.

    `cursor` is an oracledb cursor (already connected by the caller).
    `source_table` is 'BF3."WB_TRANS_DATA_ITRO"' / 'BF5."ZWB_TRANSACTION_DATA_ITRO_B"'
    — the qualified Oracle name (used for the SELECT and as the audit tag).
    """
    # source_table is "OWNER.\"TABLE\"" — it's already a valid Oracle reference.
    # We use it verbatim in SELECT FROM and pass the same string as the audit tag.
    sql = (
        f"SELECT * FROM {source_table} "
        f"WHERE UPDATED_DATE > :wm "
        f"  AND LADLENO LIKE 'TLC%' "
        f"  AND TRIP_ID IS NOT NULL"
    )
    cursor.execute(sql, wm=watermark)
    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]

    stats = {"fetched": len(rows),
             "upserted": 0,
             "skipped_non_torpedo": 0,
             "errors": 0}

    mirror_rows = []
    for r in rows:
        try:
            d = row_to_mirror_dict(r, cols, source_table)
        except Exception:
            logger.exception(f"row_to_mirror_dict failed for {r!r}")
            stats["errors"] += 1
            continue
        if d is None:
            stats["skipped_non_torpedo"] += 1
            continue
        mirror_rows.append(d)

    stats["upserted"] = upsert_rows(db, mirror_rows)
    return stats


def _ensure_thick_mode(client_dir: str) -> bool:
    """Initialize oracledb thick mode (idempotent). Returns True on success."""
    global _ORACLE_THICK_INITIALIZED
    if _ORACLE_THICK_INITIALIZED:
        return True
    if not os.path.isdir(client_dir):
        logger.warning(f"WBATNGL: Oracle Instant Client not found at {client_dir}")
        return False
    try:
        import oracledb
        oracledb.init_oracle_client(lib_dir=client_dir)
        _ORACLE_THICK_INITIALIZED = True
        return True
    except Exception as e:
        # Already-initialized or already-using-thick is benign
        if "DPI-1047" in str(e) or "already" in str(e).lower():
            _ORACLE_THICK_INITIALIZED = True
            return True
        logger.warning(f"WBATNGL: thick-mode init failed: {e}")
        return False


def _connect_oracle():
    """Open a WBATNGL Oracle connection. Caller is responsible for closing."""
    cfg = {
        "host":     os.getenv("WBATNGL_HOST", "10.10.1.67"),
        "port":     int(os.getenv("WBATNGL_PORT", "1522")),
        "user":     os.getenv("WBATNGL_USER", "ITROSYSP"),
        "password": os.getenv("WBATNGL_PASSWORD", ""),
        "service":  os.getenv("WBATNGL_SERVICE", "WBATNGL"),
        "client":   os.getenv("ORACLE_INSTANT_CLIENT_DIR",
                              r"C:\oracle\instantclient_23_0"),
    }
    # Fail-fast on missing creds before we even try to load the oracledb DLL —
    # makes the unconfigured-prod and no-oracledb-test cases produce the same
    # clean error.
    if not cfg["password"]:
        raise RuntimeError("WBATNGL_PASSWORD not set")
    import oracledb
    _ensure_thick_mode(cfg["client"])
    return oracledb.connect(
        user=cfg["user"], password=cfg["password"],
        dsn=f"{cfg['host']}:{cfg['port']}/{cfg['service']}",
    )


def run_once(backfill_days: int = 0) -> dict:
    """
    One scheduler tick. Iterates every entry in SOURCE_TABLES, pulls deltas
    since the per-source watermark (or NOW - backfill_days when invoked
    via CLI for initial backfill), UPSERTs into wbatngl_trip_mirror, then
    invalidates the JSW dashboard cache so the next /api/jsw/dashboard
    request recomputes from fresh data.

    Returns aggregated stats across all source tables, or
    {"error": "..."} if Oracle was unreachable.
    """
    from ..database.engine import SessionLocal
    from .cache import fleet_cache

    logger.info("WBATNGL trip sync: starting")
    total = {"fetched": 0, "upserted": 0,
             "skipped_non_torpedo": 0, "errors": 0}

    try:
        conn = _connect_oracle()
    except Exception as e:
        logger.exception(f"WBATNGL connect failed: {e}")
        return {"error": str(e)}

    db = SessionLocal()
    try:
        cursor = conn.cursor()
        for src in SOURCE_TABLES:
            if backfill_days > 0:
                wm = datetime.utcnow() - timedelta(days=backfill_days)
            else:
                wm = watermark_for_source(db, src)

            try:
                stats = pull_and_upsert_from_source(db, cursor, src, wm)
            except Exception as e:
                # Concise log — full traceback at exception level only;
                # don't dump the SQL+params blob (one source's failure
                # can otherwise produce a 1MB log line, observed
                # 2026-05-08 SMS4).
                logger.exception(
                    f"WBATNGL source {src} failed: {type(e).__name__}: {e}"
                )
                total["errors"] += 1
                # Critical: PG marks the whole transaction as aborted on
                # any error, so subsequent statements raise
                # InFailedSqlTransaction. Rollback so the next source
                # starts fresh.
                try:
                    db.rollback()
                except Exception:
                    logger.exception("WBATNGL rollback failed (non-fatal)")
                continue
            for k in total:
                total[k] += stats.get(k, 0)
            logger.info(
                f"WBATNGL {src}: fetched={stats['fetched']} "
                f"upserted={stats['upserted']} "
                f"skipped={stats['skipped_non_torpedo']} "
                f"watermark_was={wm}"
            )

        # Bust the JSW dashboard cache for every time_window so the next
        # /api/jsw/dashboard call recomputes from the fresh mirror state.
        try:
            fleet_cache.invalidate_pattern(CACHE_KEY_JSW_DASHBOARD)
        except Exception:
            logger.exception("WBATNGL: cache invalidation failed (non-fatal)")

        logger.info(
            f"WBATNGL trip sync OK: fetched={total['fetched']} "
            f"upserted={total['upserted']} errors={total['errors']}"
        )
    finally:
        db.close()
        try:
            conn.close()
        except Exception:
            pass
    return total


if __name__ == "__main__":
    import argparse
    p = argparse.ArgumentParser(description="WBATNGL trip mirror sync")
    p.add_argument("--backfill-days", type=int, default=0,
                   help="If >0, ignore watermark and pull last N days")
    args = p.parse_args()
    print(run_once(backfill_days=args.backfill_days))
