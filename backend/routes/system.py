from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from sqlalchemy import text
from sqlalchemy.exc import SQLAlchemyError
import psutil
import time
from datetime import datetime
from ..database.engine import get_db
from ..database.models import DailyPlan, DistributionAssignment, Trip, WeighbridgeRecord, FleetManagement, User, Converter
from ..logger import logger
from ..utils.redis_cache import cache
from ..utils.security import require_roles
from ..utils.activity_logger import log_activity
from ..utils.rate_limit import limiter

router = APIRouter(prefix="/api", tags=["system"])

START_TIME = time.time()

CACHE_KEY_SYSTEM_STATS = "system:stats"
CACHE_TTL_SYSTEM_STATS = 30                                    

@router.get("/health")
async def health():
    logger.debug("GET /api/health endpoint called.")
    return {"status": "healthy"}

@router.get("/system/stats")
async def get_system_stats(db: Session = Depends(get_db)):
                 
    cached_data = cache.get(CACHE_KEY_SYSTEM_STATS)
    if cached_data is not None:
        return cached_data

    logger.debug("CACHE MISS: Collecting system stats.")
    try:
                             
        db_start = time.time()
        db.execute(text("SELECT 1"))
        db_latency = f"{int((time.time() - db_start) * 1000)}ms"

        cpu_usage = psutil.cpu_percent(interval=None)
        memory = psutil.virtual_memory()

        uptime_seconds = int(time.time() - START_TIME)
        days, rem = divmod(uptime_seconds, 86400)
        hours, rem = divmod(rem, 3600)
        minutes, seconds = divmod(rem, 60)
        uptime_str = f"{days}d {hours}h {minutes}m" if days > 0 else f"{hours}h {minutes}m"

        res = {
            "backend": "online",
            "db": "online",
            "db_latency": db_latency,
            "cpu": cpu_usage,
            "memory": memory.percent,
            "uptime": uptime_str,
            "timestamp": datetime.now().isoformat()
        }

        cache.set(CACHE_KEY_SYSTEM_STATS, res, ttl=CACHE_TTL_SYSTEM_STATS)

        return res
    except SQLAlchemyError as e:
        logger.error(f"Database connection failed during stats collection: {e}")
        return {
            "backend": "online",
            "db": "offline",
            "db_latency": "N/A",
            "cpu": psutil.cpu_percent(interval=None),
            "memory": psutil.virtual_memory().percent,
            "uptime": "Unknown",
            "error": "Database connection error"
        }
    except OSError as e:
        logger.error(f"System stats collection failed (OS error): {e}")
        return {
            "backend": "online",
            "db": "unknown",
            "db_latency": "N/A",
            "cpu": 0,
            "memory": 0,
            "uptime": "Unknown",
            "error": "System resource unavailable"
        }

@router.get("/system/plans-data-counts")
async def get_plans_data_counts(
    current_user: User = Depends(require_roles("admin", "trs")),
    db: Session = Depends(get_db)
):
    try:
        daily_plans = db.query(DailyPlan).count()
        distributions = db.query(DistributionAssignment).count()
        trips = db.query(Trip).count()
        weighbridge_records = db.query(WeighbridgeRecord).count()
        torpedoes_to_reset = db.query(FleetManagement).filter(
            FleetManagement.status != "Operating",
            FleetManagement.status != "Maintenance",
            FleetManagement.deleted_at.is_(None)
        ).count()
        active_trip_torpedo_ids = db.query(Trip.torpedo_id).filter(
            Trip.status < 13,
            Trip.torpedo_id.isnot(None)
        ).distinct().all()
        torpedoes_to_reset = max(torpedoes_to_reset, len(active_trip_torpedo_ids))

        return {
            "daily_plans": daily_plans,
            "distribution_assignments": distributions,
            "trips": trips,
            "weighbridge_records": weighbridge_records,
            "torpedoes_to_reset": torpedoes_to_reset
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to fetch counts: {str(e)}")

@router.delete("/system/reset-plans-data")
@limiter.limit("1/minute")
async def reset_plans_data(
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    try:
        daily_plans_count = db.query(DailyPlan).count()
        distributions_count = db.query(DistributionAssignment).count()
        trips_count = db.query(Trip).count()
        weighbridge_records_count = db.query(WeighbridgeRecord).count()

        db.query(WeighbridgeRecord).delete(synchronize_session=False)
        db.query(Trip).delete(synchronize_session=False)
        db.query(DistributionAssignment).delete(synchronize_session=False)
        db.query(DailyPlan).delete(synchronize_session=False)

        torpedoes_reset = db.query(FleetManagement).filter(
            FleetManagement.status != "Maintenance",
            FleetManagement.deleted_at.is_(None)
        ).update({"status": "Operating"}, synchronize_session=False)

        db.commit()

        log_activity(
            db=db,
            username=current_user.username,
            action="system_reset_plans_data",
            details={
                "daily_plans_deleted": daily_plans_count,
                "distributions_deleted": distributions_count,
                "trips_deleted": trips_count,
                "weighbridge_records_deleted": weighbridge_records_count,
                "torpedoes_reset": torpedoes_reset
            },
            request=request
        )

        return {
            "success": True,
            "deleted": {
                "daily_plans": daily_plans_count,
                "distribution_assignments": distributions_count,
                "trips": trips_count,
                "weighbridge_records": weighbridge_records_count
            },
            "torpedoes_reset": torpedoes_reset
        }
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Reset failed: {str(e)}")

@router.post("/system/reset-converter-heats")
@limiter.limit("1/minute")
async def reset_converter_heats(
    request: Request,
    current_user: User = Depends(require_roles("admin")),
    db: Session = Depends(get_db)
):
    try:
        converters_reset = db.query(Converter).filter(
            Converter.equipment_type.notin_(["ZPF", "EAF"]),
            Converter.current_heats > 0,
            Converter.deleted_at.is_(None)
        ).update({"current_heats": 0}, synchronize_session=False)

        db.commit()

        log_activity(
            db=db,
            username=current_user.username,
            action="system_reset_converter_heats",
            details={"converters_reset": converters_reset},
            request=request
        )

        return {'success': True, 'converters_reset': converters_reset}
    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Heat reset failed: {str(e)}")
