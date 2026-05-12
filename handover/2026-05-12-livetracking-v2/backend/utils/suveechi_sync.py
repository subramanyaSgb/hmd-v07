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
from datetime import datetime, timezone
from typing import List, Dict, Optional

# pymysql is imported lazily inside fetch_suveechi_rows() so the rest of this
# module (helpers + upsert logic) can be unit-tested in environments that
# don't have pymysql installed (e.g., the dev laptop — only the SMS4 PC has
# DB access). See backend/tests/test_suveechi_sync.py.
from sqlalchemy import func
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


# Map SuVeechi unit status → FleetManagement.status.
#
# SMS4 prod regression 2026-05-08: torpedoes were visibly moving on the Live
# Tracking map (GPS coords updating tick-by-tick) but every label showed
# "Idle" — and the bottom counter showed MOVING 0 / IDLE 49. The UI was
# faithfully showing what we stored: "Operating" with no trip context renders
# as "Idle". Root cause was the collapse of "Moving" → "Operating" below,
# which threw away SuVeechi's already-good moving signal before it ever
# reached the database.
#
# Now we preserve "Moving" verbatim. Display mapping in the UI:
#   Operating + no trip   → "Idle"  (SuVeechi: ign on, parked)
#   Moving                → "Moving" (SuVeechi: actively driving)
#   Maintenance           → "Maint" (SuVeechi: ign off)
SUVEECHI_STATUS_MAP = {
    "Idle":    "Operating",
    "Moving":  "Moving",
    "Ign Off": "Maintenance",  # ignition off → temporarily out
}


def map_status(suveechi_status: Optional[str]) -> str:
    if not suveechi_status:
        return "Operating"
    return SUVEECHI_STATUS_MAP.get(suveechi_status.strip(), "Operating")


# ── Pull (sync) ──────────────────────────────────────────────────

def fetch_suveechi_rows() -> List[Dict]:
    """Open MySQL conn, fetch all rows from view, return list of dicts."""
    import pymysql  # lazy — only the SMS4 PC has pymysql + MySQL access
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

def _to_aware_utc(dt: Optional[datetime]) -> Optional[datetime]:
    """
    Normalize a datetime to timezone-aware UTC.

    SuVeechi MySQL sometimes returns NULL for both reporttime fields, in which
    case callers fall back to datetime.utcnow() — which is naive. Meanwhile
    FleetLiveLocation.last_updated is TIMESTAMPTZ so PG always reads back
    aware-UTC. Comparing the two raises
    `TypeError: can't compare offset-naive and offset-aware datetimes`,
    which silently kills the GPS sync (observed 2026-05-08 on SMS4 — every
    torpedo stuck on yesterday's position).

    Convention: any naive datetime that lands here is treated as UTC. This
    matches PG's behaviour when storing a naive value into TIMESTAMPTZ
    without a configured server timezone.
    """
    if dt is None:
        return None
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


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
        # _to_aware_utc handles three cases: aware passes through (converted
        # to UTC), naive is tagged as UTC, None falls back to now(UTC).
        reported = _to_aware_utc(
            row.get("reporttime_ist") or row.get("reporttime_gmt")
        ) or datetime.now(timezone.utc)
        suveechi_status = row.get("status")
        mapped_status = map_status(suveechi_status)

        # Version 2 Live Tracking — capture the textual location string
        # SuVeechi sends per torpedo (e.g. "At HMY2 - Corex Point No.125").
        # Sample rows in db inventory report show a trailing '*' and
        # padding whitespace on some entries — strip those so the UI
        # renders cleanly. Empty/None stays None so the frontend can
        # show "—" instead of an empty box.
        raw_loc = row.get("location")
        location_text = None
        if raw_loc:
            cleaned = str(raw_loc).strip().rstrip("*").strip()
            location_text = cleaned or None

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

        # 2. FleetLiveLocation insert (append-only, but skip dupes)
        # SuVeechi keeps reporting the same `reporttime_ist` for idle torpedoes
        # tick after tick. If we appended every time we'd accumulate hundreds of
        # rows per torpedo all sharing one timestamp, which then explodes the
        # /api/fleet/live response (the JOIN on last_updated matches them all).
        # Only insert when this fleet_id's latest stored timestamp is older than
        # the SuVeechi-reported one.
        if lat is not None and lon is not None:
            latest_for_fleet = db.query(
                func.max(FleetLiveLocation.last_updated)
            ).filter(FleetLiveLocation.fleet_id == fleet_id).scalar()
            # PG TIMESTAMPTZ should always return aware-UTC, but old rows from
            # earlier code paths can be naive — normalize defensively so the
            # comparison below never raises again.
            latest_for_fleet = _to_aware_utc(latest_for_fleet)

            if latest_for_fleet is None or latest_for_fleet < reported:
                db.add(FleetLiveLocation(
                    fleet_id=fleet_id,
                    type="torpedo",
                    x=float(lat),
                    y=float(lon),
                    last_updated=reported,
                    location_text=location_text,
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

        # Version 2 dashboard — flag any torpedo whose latest GPS update
        # is older than the stale threshold. Dedupe-aware, safe to call
        # every tick. Wrapped in try/except so a detector failure can
        # never poison the main sync.
        try:
            from .alert_detector import scan_fleet_rows
            alerts_added = scan_fleet_rows(db)
            if alerts_added:
                db.commit()
            stats["alerts_added"] = alerts_added
        except Exception:
            logger.exception("alert_detector.scan_fleet_rows failed (non-fatal)")
            try:
                db.rollback()
            except Exception:
                pass

        logger.info(
            f"SuVeechi sync OK: fetched={stats['fetched']} "
            f"locations+={stats['locations_inserted']} "
            f"fleet_created={stats['fleet_created']} "
            f"fleet_updated={stats['fleet_updated']} "
            f"alerts+={stats.get('alerts_added', 0)}"
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
