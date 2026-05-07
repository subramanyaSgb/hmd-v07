"""
SuVeechi MySQL → HMD FleetLiveLocation sync.

Pulls live torpedo positions from SuVeechi MySQL view `vw_unit_status_ist`
and upserts into local `fleet_live_locations` + `fleet_management` tables.

Triggered by APScheduler interval job (see main.py).

Env vars:
    SUVEECHI_HOST          (default 10.10.156.157)
    SUVEECHI_PORT          (default 3306)
    SUVEECHI_USER          (default view_user)
    SUVEECHI_PASSWORD      (no default — required)
    SUVEECHI_DB            (default suvetracg)
    SUVEECHI_VIEW          (default vw_unit_status_ist)
    SUVEECHI_SYNC_ENABLED  (default false)
"""

import os
from datetime import datetime
from typing import List, Dict, Optional

import pymysql
from sqlalchemy.orm import Session

from ..database.engine import SessionLocal
from ..database.models import FleetLiveLocation, FleetManagement
from ..logger import logger

# Cache invalidation after each sync (must match key in routes/fleet.py)
try:
    from .cache import fleet_cache
    _CACHE_KEY_LIVE_FLEET = "live_fleet_locations"
except Exception:
    fleet_cache = None
    _CACHE_KEY_LIVE_FLEET = None


# ── Config ───────────────────────────────────────────────────────

def _config() -> Dict[str, str]:
    return {
        "host":     os.getenv("SUVEECHI_HOST", "10.10.156.157"),
        "port":     int(os.getenv("SUVEECHI_PORT", "3306")),
        "user":     os.getenv("SUVEECHI_USER", "view_user"),
        "password": os.getenv("SUVEECHI_PASSWORD", ""),
        "db":       os.getenv("SUVEECHI_DB", "suvetracg"),
        "view":     os.getenv("SUVEECHI_VIEW", "vw_unit_status_ist"),
    }


# ── Mappers ──────────────────────────────────────────────────────

def normalize_fleet_id(unitname: str) -> str:
    """SuVeechi 'TLC 01' → HMD 'TLC-01'. Idempotent."""
    if not unitname:
        return unitname
    return unitname.strip().replace(" ", "-")


# Map SuVeechi unit status → FleetManagement.status
SUVEECHI_STATUS_MAP = {
    "Idle":    "Operating",
    "Moving":  "Operating",
    "Ign Off": "Maintenance",  # ignition off → temporarily out
}


def map_status(suveechi_status: Optional[str]) -> str:
    if not suveechi_status:
        return "Operating"
    return SUVEECHI_STATUS_MAP.get(suveechi_status.strip(), "Operating")


# ── Pull (sync) ──────────────────────────────────────────────────

def fetch_suveechi_rows() -> List[Dict]:
    """Open MySQL conn, fetch all rows from view, return list of dicts."""
    cfg = _config()
    if not cfg["password"]:
        raise RuntimeError("SUVEECHI_PASSWORD not set in environment")

    conn = pymysql.connect(
        host=cfg["host"], port=cfg["port"],
        user=cfg["user"], password=cfg["password"],
        db=cfg["db"], connect_timeout=10, read_timeout=10,
        cursorclass=pymysql.cursors.DictCursor,
    )
    try:
        with conn.cursor() as cur:
            cur.execute(
                f"SELECT unitname, status, location, latitude, longitude, "
                f"reporttime_gmt, reporttime_ist FROM {cfg['view']}"
            )
            return cur.fetchall()
    finally:
        conn.close()


# ── Sync logic ───────────────────────────────────────────────────

def upsert_locations(db: Session, rows: List[Dict]) -> Dict[str, int]:
    """
    For each SuVeechi row:
      - Ensure FleetManagement record exists (auto-create if new)
      - Insert FleetLiveLocation row (always append, latest wins via index)
      - Update FleetManagement.status mapping

    Returns counts: {fetched, locations_inserted, fleet_created, fleet_updated}
    """
    stats = {"fetched": len(rows), "locations_inserted": 0,
             "fleet_created": 0, "fleet_updated": 0}

    for row in rows:
        fleet_id = normalize_fleet_id(row.get("unitname"))
        if not fleet_id:
            continue

        lat = row.get("latitude")
        lon = row.get("longitude")
        reported = row.get("reporttime_ist") or row.get("reporttime_gmt") or datetime.utcnow()
        suveechi_status = row.get("status")
        mapped_status = map_status(suveechi_status)

        # 1. FleetManagement upsert
        fleet = db.query(FleetManagement).filter(
            FleetManagement.fleet_id == fleet_id
        ).first()
        if fleet is None:
            fleet = FleetManagement(
                fleet_id=fleet_id,
                type="torpedo",
                capacity=360.0,             # default until WBATNGL-derived
                status=mapped_status,
            )
            db.add(fleet)
            stats["fleet_created"] += 1
        else:
            # Don't override Maintenance/Assigned set manually unless suveechi says Ign Off
            if fleet.status not in ("Maintenance", "Assigned") or suveechi_status == "Ign Off":
                if fleet.status != mapped_status:
                    fleet.status = mapped_status
                    stats["fleet_updated"] += 1

        # 2. FleetLiveLocation insert (append-only)
        if lat is not None and lon is not None:
            db.add(FleetLiveLocation(
                fleet_id=fleet_id,
                type="torpedo",
                x=float(lat),
                y=float(lon),
                last_updated=reported,
            ))
            stats["locations_inserted"] += 1

    db.commit()
    return stats


def sync_once() -> Dict[str, int]:
    """One-shot sync. Safe to call from APScheduler thread."""
    logger.info("SuVeechi sync: tick")
    try:
        rows = fetch_suveechi_rows()
        logger.info(f"SuVeechi sync: pulled {len(rows)} rows from MySQL")
    except Exception as e:
        logger.exception(f"SuVeechi pull failed: {e}")
        return {"error": str(e)}

    db = SessionLocal()
    try:
        stats = upsert_locations(db, rows)
        # Invalidate live fleet cache so /api/fleet/live serves fresh data
        if fleet_cache is not None and _CACHE_KEY_LIVE_FLEET:
            try:
                fleet_cache.invalidate(_CACHE_KEY_LIVE_FLEET)
            except Exception:
                pass
        logger.info(
            f"SuVeechi sync OK: fetched={stats['fetched']} "
            f"locations+={stats['locations_inserted']} "
            f"fleet_created={stats['fleet_created']} "
            f"fleet_updated={stats['fleet_updated']}"
        )
        return stats
    except Exception as e:
        logger.exception(f"SuVeechi sync DB error: {e}")
        db.rollback()
        return {"error": str(e)}
    finally:
        db.close()


# ── Cleanup (optional cron) ──────────────────────────────────────

def prune_old_locations(retention_hours: int = 24) -> int:
    """Drop fleet_live_locations rows older than N hours. Run daily."""
    from datetime import timedelta
    cutoff = datetime.utcnow() - timedelta(hours=retention_hours)
    db = SessionLocal()
    try:
        deleted = db.query(FleetLiveLocation).filter(
            FleetLiveLocation.last_updated < cutoff
        ).delete()
        db.commit()
        logger.info(f"SuVeechi prune: deleted {deleted} old location rows")
        return deleted
    finally:
        db.close()
