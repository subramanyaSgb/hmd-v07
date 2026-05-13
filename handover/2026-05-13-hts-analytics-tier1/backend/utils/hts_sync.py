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

from ..database.models import (
    HtsHeatMirror,
    HCasterHeatProcessMirror,
    HCasterConsumptionMirror,
    HEqupBreakdownMirror,
    HUnitCodeMirror,
)
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
    # Upstream column is SMS_UNIT (e.g. "SMS-2"); we previously read SMS which
    # never existed → sms column was always NULL. Fixed 2026-05-13 alongside the
    # Tier 1 mirror expansion. Fall back to SMS for forward-compat just in case.
    sms_raw = r.get("SMS_UNIT") if r.get("SMS_UNIT") is not None else r.get("SMS")
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


# ============================================================
# Tier 1 expansion (2026-05-13)
# 4 new HTS tables wired here: H_CASTER_HEAT_PROCESS,
# H_CASTER_CONSUMPTION, H_EQUP_BREAKDOWNS, H_UNIT_CODES.
# Each follows the same pattern as the hotmetal sync above:
# build row→dict mapper → upsert helper → pull-and-upsert.
# ============================================================

def _str_or_none(v):
    """Strip-and-null for VARCHAR fields. Returns None on '', None, or whitespace."""
    if v is None:
        return None
    s = str(v).strip()
    return s or None


def _dialect_insert(db: Session):
    """Return the dialect-specific INSERT class. Same shape as hotmetal upsert."""
    dialect = db.get_bind().dialect.name
    if dialect == "postgresql":
        from sqlalchemy.dialects.postgresql import insert
    elif dialect == "sqlite":
        from sqlalchemy.dialects.sqlite import insert
    else:
        raise RuntimeError(f"unsupported dialect {dialect!r}")
    return insert


def _generic_upsert(db: Session, model, rows: list, conflict_keys) -> int:
    """
    Generic UPSERT helper for the new mirror tables.
    `conflict_keys` is a string (single col) or list (composite unique).
    Bumps `synced_at` on every upsert like the hotmetal sync.
    """
    rows = [r for r in rows if r is not None]
    if not rows:
        return 0
    key_set = {conflict_keys} if isinstance(conflict_keys, str) else set(conflict_keys)
    update_cols = [
        c.name for c in model.__table__.columns
        if c.name not in key_set and c.name not in ("id", "synced_at")
    ]
    insert_cls = _dialect_insert(db)
    persisted = 0
    for i in range(0, len(rows), UPSERT_CHUNK_SIZE):
        chunk = rows[i:i + UPSERT_CHUNK_SIZE]
        stmt = insert_cls(model).values(chunk)
        set_dict = {c: stmt.excluded[c] for c in update_cols}
        set_dict["synced_at"] = func.now()
        idx_elements = [conflict_keys] if isinstance(conflict_keys, str) else list(conflict_keys)
        stmt = stmt.on_conflict_do_update(
            index_elements=idx_elements,
            set_=set_dict,
        )
        db.execute(stmt)
        persisted += len(chunk)
    db.commit()
    return persisted


# ------------------------------------------------------------
# H_CASTER_HEAT_PROCESS — heat lifecycle, operators, REMARKS
# ------------------------------------------------------------
_CASTER_HP_COLS = (
    "HEAT_NO, SEQUENCE, CASTER_DATE, SHIFT, SHIFT_INCHARGE, "
    "P1_OPERATOR, MOULD_OPERATOR, TCM_OPERATOR, "
    "LADLE_ON_TURRET, LADLE_OPEN, LADLE_CLOSE, "
    "CAST_SIZE, CAST_LENGTH, CAST_WEIGHT, NO_OF_SLABS, FINAL_GRADE, "
    "DELAY, REMARKS, LIQUI_ROBOTIC_REMARKS, TD_SLAG_DEPTH"
)


def row_to_caster_hp_dict(row, cols):
    r = dict(zip(cols, row))
    heat_no = r.get("HEAT_NO")
    if not heat_no:
        return None
    return {
        "heat_no":               _str_or_none(heat_no),
        "sequence_id":           _str_or_none(r.get("SEQUENCE")),
        "caster_date":           r.get("CASTER_DATE"),
        "shift":                 _str_or_none(r.get("SHIFT")),
        "shift_incharge":        _str_or_none(r.get("SHIFT_INCHARGE")),
        "p1_operator":           _str_or_none(r.get("P1_OPERATOR")),
        "mould_operator":        _str_or_none(r.get("MOULD_OPERATOR")),
        "tcm_operator":          _str_or_none(r.get("TCM_OPERATOR")),
        "ladle_on_turret":       r.get("LADLE_ON_TURRET"),
        "ladle_open":            r.get("LADLE_OPEN"),
        "ladle_close":           r.get("LADLE_CLOSE"),
        "cast_size":             r.get("CAST_SIZE"),
        "cast_length":           r.get("CAST_LENGTH"),
        "cast_weight":           r.get("CAST_WEIGHT"),
        "no_of_slabs":           r.get("NO_OF_SLABS"),
        "final_grade":           _str_or_none(r.get("FINAL_GRADE")),
        "delay_minutes":         r.get("DELAY"),
        "remarks":               r.get("REMARKS"),
        "liqui_robotic_remarks": r.get("LIQUI_ROBOTIC_REMARKS"),
        "td_slag_depth":         r.get("TD_SLAG_DEPTH"),
    }


def pull_caster_hp(db: Session, cursor) -> dict:
    wm = db.execute(
        select(func.max(HCasterHeatProcessMirror.caster_date))
    ).scalar() or _WATERMARK_FLOOR
    sql = (
        f"SELECT {_CASTER_HP_COLS} FROM HTS.H_CASTER_HEAT_PROCESS "
        f"WHERE CASTER_DATE > :wm"
    )
    cursor.execute(sql, wm=wm)
    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]
    mirror_rows = []
    skipped = 0
    for r in rows:
        d = row_to_caster_hp_dict(r, cols)
        if d is None:
            skipped += 1
            continue
        mirror_rows.append(d)
    persisted = _generic_upsert(db, HCasterHeatProcessMirror, mirror_rows, "heat_no")
    return {"fetched": len(rows), "upserted": persisted,
            "skipped_no_heat_no": skipped, "watermark": wm}


# ------------------------------------------------------------
# H_CASTER_CONSUMPTION — yield + loss breakdown
# Joined to H_CASTER_HEAT_PROCESS on the Oracle side so we only
# pull rows for heats inside the heat-process watermark window.
# ------------------------------------------------------------
_CASTER_CN_COLS = (
    "c.HEATNO, c.SEQUENCE, c.YIELD, c.PRIME_SLAB, "
    "c.LADLE_LOSS, c.TUN_LOSS, c.HEAD_CROP, c.TAIL_CROP, "
    "c.OTHER_LOSS, c.SAMPLE_LOSS, c.CUT_LOSS, c.MILL_SCALE_LOSS, "
    "c.HEAD_CROP_LOSS_TONS, c.TAIL_CROP_TONS, c.SAMPLE_LOSS_TONS, c.OTHER_LOSS_TONS, "
    "c.CASTING_POWDER, c.CP_CONSUMED, c.TUN_POWDER, "
    "c.MBS_LIFE, c.SEN_LIFE, c.SHRD_LIFE"
)


def row_to_caster_cn_dict(row, cols):
    r = dict(zip(cols, row))
    heatno = r.get("HEATNO")
    if not heatno:
        return None
    return {
        "heatno":              _str_or_none(heatno),
        "sequence_id":         _str_or_none(r.get("SEQUENCE")),
        "yield_pct":           r.get("YIELD"),
        "prime_slab":          r.get("PRIME_SLAB"),
        "ladle_loss":          r.get("LADLE_LOSS"),
        "tun_loss":            r.get("TUN_LOSS"),
        "head_crop":           r.get("HEAD_CROP"),
        "tail_crop":           r.get("TAIL_CROP"),
        "other_loss":          r.get("OTHER_LOSS"),
        "sample_loss":         r.get("SAMPLE_LOSS"),
        "cut_loss":            r.get("CUT_LOSS"),
        "mill_scale_loss":     r.get("MILL_SCALE_LOSS"),
        "head_crop_loss_tons": r.get("HEAD_CROP_LOSS_TONS"),
        "tail_crop_tons":      r.get("TAIL_CROP_TONS"),
        "sample_loss_tons":    r.get("SAMPLE_LOSS_TONS"),
        "other_loss_tons":     r.get("OTHER_LOSS_TONS"),
        "casting_powder":      _str_or_none(r.get("CASTING_POWDER")),
        "cp_consumed":         r.get("CP_CONSUMED"),
        "tun_powder":          r.get("TUN_POWDER"),
        "mbs_life":            r.get("MBS_LIFE"),
        "sen_life":            r.get("SEN_LIFE"),
        "shrd_life":           r.get("SHRD_LIFE"),
    }


def pull_caster_cn(db: Session, cursor) -> dict:
    """
    Consumption has no CASTER_DATE of its own — join to HEAT_PROCESS
    on HEATNO=HEAT_NO and use that table's CASTER_DATE as watermark.
    Use our own consumption mirror's latest synced_at as the floor so
    we don't miss late-arriving rows (consumption sometimes lags).
    """
    wm = db.execute(
        select(func.max(HCasterHeatProcessMirror.caster_date))
    ).scalar() or _WATERMARK_FLOOR
    sql = (
        f"SELECT {_CASTER_CN_COLS} "
        f"FROM HTS.H_CASTER_CONSUMPTION c "
        f"JOIN HTS.H_CASTER_HEAT_PROCESS p ON c.HEATNO = p.HEAT_NO "
        f"WHERE p.CASTER_DATE > :wm"
    )
    cursor.execute(sql, wm=wm)
    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]
    mirror_rows = []
    skipped = 0
    for r in rows:
        d = row_to_caster_cn_dict(r, cols)
        if d is None:
            skipped += 1
            continue
        mirror_rows.append(d)
    persisted = _generic_upsert(db, HCasterConsumptionMirror, mirror_rows, "heatno")
    return {"fetched": len(rows), "upserted": persisted,
            "skipped_no_heatno": skipped, "watermark": wm}


# ------------------------------------------------------------
# H_EQUP_BREAKDOWNS — equipment breakdown log
# ------------------------------------------------------------
_BREAKDOWN_COLS = (
    "EQ_CODE, UNIT_CODE, REASON, BRK_DATE, BRK_DATE_END, "
    "BRK_SHIFT, DUR_BRK_HRS_MIN, DELAY_TYPE"
)


def row_to_breakdown_dict(row, cols):
    r = dict(zip(cols, row))
    unit_code = r.get("UNIT_CODE")
    brk_date  = r.get("BRK_DATE")
    reason    = r.get("REASON")
    # Need all 3 for the composite unique to be satisfied; skip otherwise.
    if unit_code is None or brk_date is None or not reason:
        return None
    return {
        "eq_code":         r.get("EQ_CODE"),
        "unit_code":       unit_code,
        "reason":          _str_or_none(reason),
        "brk_date":        brk_date,
        "brk_date_end":    r.get("BRK_DATE_END"),
        "brk_shift":       _str_or_none(r.get("BRK_SHIFT")),
        "dur_brk_hrs_min": _str_or_none(r.get("DUR_BRK_HRS_MIN")),
        "delay_type":      _str_or_none(r.get("DELAY_TYPE")),
    }


def pull_breakdowns(db: Session, cursor) -> dict:
    wm = db.execute(
        select(func.max(HEqupBreakdownMirror.brk_date))
    ).scalar() or _WATERMARK_FLOOR
    sql = (
        f"SELECT {_BREAKDOWN_COLS} FROM HTS.H_EQUP_BREAKDOWNS "
        f"WHERE BRK_DATE > :wm"
    )
    cursor.execute(sql, wm=wm)
    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]
    mirror_rows = []
    skipped = 0
    for r in rows:
        d = row_to_breakdown_dict(r, cols)
        if d is None:
            skipped += 1
            continue
        mirror_rows.append(d)
    # Composite unique → conflict on the 3-col index
    persisted = _generic_upsert(
        db, HEqupBreakdownMirror, mirror_rows,
        ["unit_code", "brk_date", "reason"],
    )
    return {"fetched": len(rows), "upserted": persisted,
            "skipped_incomplete": skipped, "watermark": wm}


# ------------------------------------------------------------
# H_UNIT_CODES — static lookup (36 rows). Full refresh.
# ------------------------------------------------------------
def row_to_unit_code_dict(row, cols):
    r = dict(zip(cols, row))
    code = r.get("UNIT_CODE")
    if code is None:
        return None
    return {
        "unit_code": code,
        "unit_desc": _str_or_none(r.get("UNIT_DESC")),
    }


def pull_unit_codes(db: Session, cursor) -> dict:
    cursor.execute("SELECT UNIT_CODE, UNIT_DESC FROM HTS.H_UNIT_CODES")
    rows = cursor.fetchall()
    cols = [d[0] for d in cursor.description]
    mirror_rows = [row_to_unit_code_dict(r, cols) for r in rows]
    persisted = _generic_upsert(db, HUnitCodeMirror, mirror_rows, "unit_code")
    return {"fetched": len(rows), "upserted": persisted}


# ============================================================
# Orchestrator
# ============================================================
def run_once() -> dict:
    """
    One scheduler tick. Runs ALL HTS syncs in sequence on the SAME
    Oracle connection + SAME DB session:
      1) VW_HTS_HOTMETAL_DATA      (hotmetal — existing)
      2) H_CASTER_HEAT_PROCESS     (Tier 1)
      3) H_CASTER_CONSUMPTION      (Tier 1, joined-watermark)
      4) H_EQUP_BREAKDOWNS         (Tier 1)
      5) H_UNIT_CODES              (Tier 1, full refresh)
    Returns per-table stats keyed by table name, or {"error": "..."}
    on Oracle failure.

    On any single-table failure we rollback and continue with the next
    table — a stale upstream table shouldn't block the others.
    """
    from ..database.engine import SessionLocal

    logger.info("HTS sync: starting (5 tables)")

    try:
        conn = _connect_oracle()
    except Exception as e:
        logger.exception(f"HTS connect failed: {e}")
        return {"error": str(e)}

    out: dict = {}
    db = SessionLocal()
    try:
        cur = conn.cursor()
        try:
            # 1) hotmetal — keep existing behaviour
            try:
                wm = watermark_for_view(db)
                out["hotmetal"] = pull_and_upsert(db, cur, wm)
                logger.info(
                    f"HTS hotmetal OK: fetched={out['hotmetal']['fetched']} "
                    f"upserted={out['hotmetal']['upserted']} "
                    f"skipped={out['hotmetal']['skipped_no_heat_no']} "
                    f"watermark_was={wm}"
                )
            except Exception as e:
                _safe_rollback(db)
                logger.exception(f"HTS hotmetal failed: {e}")
                out["hotmetal"] = {"error": str(e)}

            # 2) caster heat process
            try:
                out["caster_hp"] = pull_caster_hp(db, cur)
                logger.info(
                    f"HTS caster_hp OK: fetched={out['caster_hp']['fetched']} "
                    f"upserted={out['caster_hp']['upserted']}"
                )
            except Exception as e:
                _safe_rollback(db)
                logger.exception(f"HTS caster_hp failed: {e}")
                out["caster_hp"] = {"error": str(e)}

            # 3) caster consumption (depends on caster_hp watermark)
            try:
                out["caster_cn"] = pull_caster_cn(db, cur)
                logger.info(
                    f"HTS caster_cn OK: fetched={out['caster_cn']['fetched']} "
                    f"upserted={out['caster_cn']['upserted']}"
                )
            except Exception as e:
                _safe_rollback(db)
                logger.exception(f"HTS caster_cn failed: {e}")
                out["caster_cn"] = {"error": str(e)}

            # 4) breakdowns + fold into V2 Dashboard Alert feed
            try:
                out["breakdowns"] = pull_breakdowns(db, cur)
                # Scan freshly-synced rows for the Alerts feed (Tier 1 #7).
                # Best-effort: a scanner failure must not roll back the
                # breakdown mirror sync — log and continue.
                try:
                    from .alert_detector import scan_hts_breakdowns
                    new_alerts = scan_hts_breakdowns(db)
                    if new_alerts:
                        db.commit()
                    out["breakdowns"]["new_alerts"] = new_alerts
                except Exception as e:
                    _safe_rollback(db)
                    logger.exception(f"scan_hts_breakdowns failed: {e}")
                    out["breakdowns"]["alert_scan_error"] = str(e)
                logger.info(
                    f"HTS breakdowns OK: fetched={out['breakdowns']['fetched']} "
                    f"upserted={out['breakdowns']['upserted']} "
                    f"new_alerts={out['breakdowns'].get('new_alerts', 0)}"
                )
            except Exception as e:
                _safe_rollback(db)
                logger.exception(f"HTS breakdowns failed: {e}")
                out["breakdowns"] = {"error": str(e)}

            # 5) unit codes (cheap; full refresh)
            try:
                out["unit_codes"] = pull_unit_codes(db, cur)
                logger.info(
                    f"HTS unit_codes OK: fetched={out['unit_codes']['fetched']} "
                    f"upserted={out['unit_codes']['upserted']}"
                )
            except Exception as e:
                _safe_rollback(db)
                logger.exception(f"HTS unit_codes failed: {e}")
                out["unit_codes"] = {"error": str(e)}
        finally:
            try:
                cur.close()
            except Exception:
                pass
    finally:
        db.close()
        try:
            conn.close()
        except Exception:
            pass
    return out


def _safe_rollback(db: Session):
    """
    PG marks the whole transaction as aborted on any error, so a pooled
    session reused without rollback would raise InFailedSqlTransaction
    on its next statement. Critical between per-table syncs in run_once.
    """
    try:
        db.rollback()
    except Exception:
        logger.exception("HTS rollback failed (non-fatal)")


if __name__ == "__main__":
    print(run_once())
