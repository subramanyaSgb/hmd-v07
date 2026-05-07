"""
WBATNGL → HMD FleetManagement.capacity backfill.

Default `FleetManagement.capacity` is seeded at 360 MT for every torpedo, but
real per-ladle capacity varies (BF3/BF4 ~350-375, BF5 ~300-320). The WBATNGL
weighbridge schemas hold the actual NET_WEIGHT per cast across two tables:

    BF3."WB_TRANS_DATA_ITRO"           (BF3 + BF4 weighbridge)
    BF5."ZWB_TRANSACTION_DATA_ITRO_B"  (BF5 weighbridge)

For each unique LADLENO ("TLC 01", "TLC-01", ...) we take MAX(NET_WEIGHT) across
both tables, normalize the LADLENO to HMD form ("TLC-NN"), and update
FleetManagement.capacity = clamp(observed × 1.05, [300, 400]) MT.

Triggered nightly at 03:00 IST by APScheduler (see main.py).

Env vars (read at runtime):
    WBATNGL_SYNC_ENABLED        (default false)
    WBATNGL_HOST                (default 10.10.1.67)
    WBATNGL_PORT                (default 1522)
    WBATNGL_USER                (default ITROSYSP)
    WBATNGL_PASSWORD            (no default — required)
    WBATNGL_SERVICE             (default WBATNGL)
    ORACLE_INSTANT_CLIENT_DIR   (default C:\\oracle\\instantclient_23_0)

Requires `oracledb` (added to backend/requirements.txt).
"""

import os
from typing import Dict, List, Optional, Tuple

import oracledb

from ..database.engine import SessionLocal
from ..database.models import FleetManagement
from ..logger import logger


# ── Config ───────────────────────────────────────────────────────

# Tables to scan for NET_WEIGHT history. Each entry is (owner, table_name).
# Owner is needed because ITROSYSP is granted SELECT on both BF3 and BF5
# schemas. Quoted identifiers are required because Oracle stores names upper-
# case but quoted use is safest.
WBATNGL_TABLES: List[Tuple[str, str]] = [
    ("BF3", "WB_TRANS_DATA_ITRO"),
    ("BF5", "ZWB_TRANSACTION_DATA_ITRO_B"),
]

# Capacity policy. observed = max NET_WEIGHT seen for a torpedo across all
# tables. We add a 5% headroom (operating margin), then clamp into [300, 400]
# so a noisy outlier or a non-torpedo row doesn't push capacity to absurd
# values. Empty observation → leave capacity untouched.
HEADROOM_PCT = 1.05
CAP_MIN_MT = 300.0
CAP_MAX_MT = 400.0

# Module-level guard so Oracle thick mode is only initialized once per
# process (oracledb raises if init_oracle_client is called twice).
_ORACLE_THICK_INITIALIZED = False


def _config() -> Dict[str, str]:
    return {
        "host":     os.getenv("WBATNGL_HOST", "10.10.1.67"),
        "port":     int(os.getenv("WBATNGL_PORT", "1522")),
        "user":     os.getenv("WBATNGL_USER", "ITROSYSP"),
        "password": os.getenv("WBATNGL_PASSWORD", ""),
        "service":  os.getenv("WBATNGL_SERVICE", "WBATNGL"),
        "client_dir": os.getenv("ORACLE_INSTANT_CLIENT_DIR",
                                r"C:\oracle\instantclient_23_0"),
    }


# ── Oracle thick-mode init (idempotent) ──────────────────────────

def _ensure_thick_mode(client_dir: str) -> bool:
    """Initialise oracledb thick mode once. Returns True if thick is active."""
    global _ORACLE_THICK_INITIALIZED
    if _ORACLE_THICK_INITIALIZED:
        return True
    if not os.path.isdir(client_dir):
        logger.warning(
            f"WBATNGL: Oracle Instant Client not found at {client_dir}; "
            "falling back to thin mode (may not work for older DBs)."
        )
        return False
    try:
        oracledb.init_oracle_client(lib_dir=client_dir)
        _ORACLE_THICK_INITIALIZED = True
        logger.info(f"WBATNGL: Oracle thick mode initialised ({client_dir})")
        return True
    except Exception as e:
        # Most likely "DPI-1047" already-initialised — treat as success.
        msg = str(e)
        if "DPI-1047" in msg or "already" in msg.lower():
            _ORACLE_THICK_INITIALIZED = True
            return True
        logger.warning(f"WBATNGL: thick-mode init failed ({e}); using thin mode")
        return False


# ── Mappers ──────────────────────────────────────────────────────

def normalize_ladleno(ladleno: Optional[str]) -> Optional[str]:
    """
    LADLENO appears in WBATNGL as 'TLC 01', 'TLC-01', 'TLC01' etc. Normalise
    to HMD canonical 'TLC-NN' (zero-padded 2 digits) so it matches
    FleetManagement.fleet_id. Returns None if it doesn't look like a torpedo.
    """
    if not ladleno:
        return None
    s = str(ladleno).strip().upper()
    # Drop any whitespace/dashes between TLC and the digits
    if not s.startswith("TLC"):
        return None
    digits = "".join(ch for ch in s[3:] if ch.isdigit())
    if not digits:
        return None
    return f"TLC-{int(digits):02d}"


def derive_capacity(observed_mt: float) -> float:
    """observed × 1.05, clamped to [CAP_MIN_MT, CAP_MAX_MT]."""
    if observed_mt is None or observed_mt <= 0:
        return CAP_MIN_MT
    return max(CAP_MIN_MT, min(CAP_MAX_MT, observed_mt * HEADROOM_PCT))


# ── Pull (Oracle) ────────────────────────────────────────────────

def fetch_max_net_weights() -> Dict[str, float]:
    """
    Connect to WBATNGL Oracle and return {fleet_id: max_observed_mt} merged
    across all configured tables. NET_WEIGHT is assumed to be in the same
    unit as FleetManagement.capacity (MT). If your WBATNGL stores in kg, the
    derive step will clamp the result up to CAP_MAX_MT — but we should fix
    the unit at source if that ever happens (see verify step in plan).
    """
    cfg = _config()
    if not cfg["password"]:
        raise RuntimeError("WBATNGL_PASSWORD not set in environment")

    _ensure_thick_mode(cfg["client_dir"])
    dsn = f"{cfg['host']}:{cfg['port']}/{cfg['service']}"

    observed: Dict[str, float] = {}
    conn = oracledb.connect(user=cfg["user"], password=cfg["password"], dsn=dsn)
    try:
        cur = conn.cursor()
        for owner, table in WBATNGL_TABLES:
            qualified = f'"{owner}"."{table}"'
            try:
                cur.execute(
                    f"SELECT LADLENO, MAX(NET_WEIGHT) "
                    f"FROM {qualified} "
                    f"WHERE LADLENO IS NOT NULL AND NET_WEIGHT IS NOT NULL "
                    f"GROUP BY LADLENO"
                )
                rows = cur.fetchall()
            except Exception as e:
                logger.warning(f"WBATNGL: failed to scan {qualified}: {e}")
                continue
            scanned = 0
            for ladleno_raw, max_nw in rows:
                fid = normalize_ladleno(ladleno_raw)
                if not fid or max_nw is None:
                    continue
                try:
                    val = float(max_nw)
                except (TypeError, ValueError):
                    continue
                if val <= 0:
                    continue
                # Take the larger across tables
                if val > observed.get(fid, 0.0):
                    observed[fid] = val
                scanned += 1
            logger.info(
                f"WBATNGL: {qualified} → {scanned} ladle rows merged "
                f"({len(observed)} total fleet_ids so far)"
            )
        cur.close()
    finally:
        conn.close()
    return observed


# ── Apply ────────────────────────────────────────────────────────

def apply_capacities(observed: Dict[str, float]) -> Dict[str, int]:
    """
    For every (fleet_id, observed_mt) in `observed`, compute the new capacity
    and update FleetManagement.capacity if it differs from the stored value.
    Logs per-torpedo updates. Returns counts.
    """
    stats = {"updated": 0, "skipped_unchanged": 0, "missing_fleet": 0}
    if not observed:
        logger.warning("WBATNGL: no observations — nothing to apply")
        return stats

    db = SessionLocal()
    try:
        for fid, val in sorted(observed.items()):
            new_cap = round(derive_capacity(val), 1)
            fleet = db.query(FleetManagement).filter(
                FleetManagement.fleet_id == fid
            ).first()
            if fleet is None:
                # Don't auto-create here — SuVeechi sync owns that lifecycle.
                stats["missing_fleet"] += 1
                continue
            old_cap = fleet.capacity
            if old_cap is not None and abs(float(old_cap) - new_cap) < 0.05:
                stats["skipped_unchanged"] += 1
                continue
            fleet.capacity = new_cap
            stats["updated"] += 1
            logger.info(
                f"WBATNGL: {fid} capacity {old_cap} → {new_cap} MT "
                f"(observed max NET_WEIGHT {val:.2f} MT)"
            )
        db.commit()
    except Exception as e:
        logger.exception(f"WBATNGL apply failed: {e}")
        db.rollback()
        raise
    finally:
        db.close()
    return stats


# ── Public entry point ───────────────────────────────────────────

def run_once() -> Dict[str, int]:
    """One-shot sync. Safe to call from APScheduler thread or manually."""
    logger.info("WBATNGL capacity sync: starting")
    try:
        observed = fetch_max_net_weights()
    except Exception as e:
        logger.exception(f"WBATNGL pull failed: {e}")
        return {"error": str(e)}

    logger.info(f"WBATNGL pull OK: observed {len(observed)} torpedoes")
    try:
        stats = apply_capacities(observed)
    except Exception as e:
        return {"error": str(e)}

    logger.info(
        f"WBATNGL capacity sync OK: updated={stats['updated']} "
        f"unchanged={stats['skipped_unchanged']} "
        f"missing_fleet={stats['missing_fleet']}"
    )
    return stats


if __name__ == "__main__":
    # Allow ad-hoc run: `python -m backend.utils.wbatngl_capacity_sync`
    print(run_once())
