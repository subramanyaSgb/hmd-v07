"""
One-time cleanup: remove duplicate FleetLiveLocation rows that accumulated
because SuVeechi reports the same `reporttime_ist` across many sync ticks for
idle torpedoes. Keeps only the row with the highest `id` per fleet_id.

Run on the SMS4 PC:

    cd <HMD root>
    .venv\Scripts\activate.bat       # the project venv (created by app.bat)
    python -m backend.utils.cleanup_fleet_location_dupes

Output is a one-line summary:

    [cleanup] kept 53 rows, deleted 28471 dupes (table now 53 rows)

After this, /api/fleet/live should return 53 rows again. Restart the backend
or wait 10s for the cache to invalidate.
"""

from sqlalchemy import func, delete
from ..database.engine import SessionLocal
from ..database.models import FleetLiveLocation
from ..logger import logger


def cleanup_dupes() -> dict:
    db = SessionLocal()
    try:
        # Per fleet_id, find the max id (the row we want to keep).
        keep_ids_subq = db.query(
            func.max(FleetLiveLocation.id).label('max_id')
        ).group_by(FleetLiveLocation.fleet_id).subquery()

        keep_ids = {row.max_id for row in db.query(keep_ids_subq).all()}

        if not keep_ids:
            logger.info("[cleanup] table is empty — nothing to do")
            return {"kept": 0, "deleted": 0, "remaining": 0}

        deleted = db.query(FleetLiveLocation).filter(
            ~FleetLiveLocation.id.in_(keep_ids)
        ).delete(synchronize_session=False)
        db.commit()

        remaining = db.query(func.count(FleetLiveLocation.id)).scalar() or 0
        msg = (f"[cleanup] kept {len(keep_ids)} rows, "
               f"deleted {deleted} dupes (table now {remaining} rows)")
        print(msg)
        logger.info(msg)
        return {"kept": len(keep_ids), "deleted": deleted, "remaining": remaining}
    except Exception as e:
        db.rollback()
        logger.exception(f"[cleanup] failed: {e}")
        raise
    finally:
        db.close()


if __name__ == "__main__":
    cleanup_dupes()
