from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from typing import List
from ..database.engine import get_db
from ..database.models import User, TripTimeConfig as TripTimeConfigModel, ConsumerConfig, ProducerConfig, SystemConfig
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.security import get_current_user_required, require_roles
from ..utils.redis_cache import cache
from ..schemas import (
    TripTimeConfig as TripTimeConfigSchema,
    ConsumerTimeConfig,
    ProducerTimeConfig
)
from pydantic import BaseModel

router = APIRouter(prefix="/api/config", tags=["config"])

CACHE_KEY_TRIP_TIMES = "config:trip_times"
CACHE_KEY_CONSUMER_CONFIG = "config:consumer"
CACHE_KEY_PRODUCER_CONFIG = "config:producer"
CACHE_KEY_SYSTEM_CONFIG = "config:system"
CACHE_KEY_DASHBOARD = "plans:dashboard"
CACHE_TTL_CONFIG = 30                                  

@router.get("/trip-times")
async def get_trip_time_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                 
    cached_data = cache.get(CACHE_KEY_TRIP_TIMES)
    if cached_data is not None:
        return cached_data

    logger.debug("CACHE MISS: Fetching trip config from DB.")
    producers = db.query(User).filter(User.role == 'producer').all()
    consumers = db.query(User).filter(User.role == 'consumer').all()
    configs = db.query(TripTimeConfigModel).all()

    res = {
        "producers": [{"user_id": u.user_id, "username": u.username} for u in producers if u.user_id],
        "consumers": [{"user_id": u.user_id, "username": u.username} for u in consumers if u.user_id],
        "configs": [
            {'source': c.source_user_id, 'destination': c.destination_user_id, 'time': c.travel_time} for c in configs
        ]
    }

    cache.set(CACHE_KEY_TRIP_TIMES, res, ttl=CACHE_TTL_CONFIG)

    return res

@router.post("/trip-times/bulk")
async def save_trip_time_config(
    data: List[TripTimeConfigSchema],
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
                      
    cache.delete(CACHE_KEY_TRIP_TIMES)
    cache.delete(CACHE_KEY_DASHBOARD)

    try:
        logger.info(f"Incoming bulk trip config data from {admin_user.username}: {len(data)} entries")

        for entry in data:
                          
            config = db.query(TripTimeConfigModel).filter(
                TripTimeConfigModel.source_user_id == entry.source_user_id,
                TripTimeConfigModel.destination_user_id == entry.destination_user_id
            ).first()

            if config:
                config.travel_time = entry.travel_time
            else:
                config = TripTimeConfigModel(
                    source_user_id=entry.source_user_id,
                    destination_user_id=entry.destination_user_id,
                    travel_time=entry.travel_time
                )
                db.add(config)

        db.commit()
        log_activity(
            db, admin_user.username, "CONFIG_UPDATED",
            details=f"Updated {len(data)} trip time configurations",
            current_user=admin_user,
            entity_type="config",
            entity_id="trip_times",
            new_value={"updated_count": len(data), "type": "trip_time_config"}
        )
        return {"status": "success", "message": f"Updated {len(data)} configurations"}
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error saving trip time config: {e}")
        raise HTTPException(status_code=500, detail="Failed to save trip time configurations. Please try again.")

@router.get("/consumer-times")
async def get_consumer_time_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    cached_data = cache.get(CACHE_KEY_CONSUMER_CONFIG)
    if cached_data is not None:
        return cached_data

    logger.debug("CACHE MISS: Fetching consumer config from DB.")
    consumers = db.query(User).filter(User.role == 'consumer').all()
    configs = db.query(ConsumerConfig).all()

    config_map = {c.consumer_user_id: c for c in configs}

    res = {
        "consumers": [
            {
                "user_id": u.user_id,
                "username": u.username,
                "avg_unload_time": config_map.get(u.user_id).avg_unload_time if config_map.get(u.user_id) else 0,
                "estimated_wait_time": config_map.get(u.user_id).estimated_wait_time if config_map.get(u.user_id) else 0,
                "total_time": (
                    (config_map.get(u.user_id).avg_unload_time if config_map.get(u.user_id) else 0) +
                    (config_map.get(u.user_id).estimated_wait_time if config_map.get(u.user_id) else 0)
                )
            }
            for u in consumers if u.user_id
        ]
    }

    res["consumers"].sort(key=lambda x: x["user_id"])

    cache.set(CACHE_KEY_CONSUMER_CONFIG, res, ttl=CACHE_TTL_CONFIG)

    return res

@router.post("/consumer-times/bulk")
async def save_consumer_time_config(
    data: List[ConsumerTimeConfig],
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
                      
    cache.delete(CACHE_KEY_CONSUMER_CONFIG)
    cache.delete(CACHE_KEY_DASHBOARD)

    try:
        logger.info(f"Incoming consumer config data from {admin_user.username}: {len(data)} entries")

        for entry in data:
                          
            config = db.query(ConsumerConfig).filter(
                ConsumerConfig.consumer_user_id == entry.consumer_user_id
            ).first()

            if config:
                config.avg_unload_time = entry.avg_unload_time
                config.estimated_wait_time = entry.estimated_wait_time
            else:
                config = ConsumerConfig(
                    consumer_user_id=entry.consumer_user_id,
                    avg_unload_time=entry.avg_unload_time,
                    estimated_wait_time=entry.estimated_wait_time
                )
                db.add(config)

        db.commit()
        log_activity(db, admin_user.username, "CONFIG_UPDATED", f"Updated {len(data)} consumer time configurations")
        return {"status": "success", "message": f"Updated {len(data)} configurations"}
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error saving consumer config: {e}")
        raise HTTPException(status_code=500, detail="Failed to save consumer configurations. Please try again.")

@router.get("/producer-times")
async def get_producer_time_config(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    cached_data = cache.get(CACHE_KEY_PRODUCER_CONFIG)
    if cached_data is not None:
        return cached_data

    logger.debug("CACHE MISS: Fetching producer config from DB.")
    producers = db.query(User).filter(User.role == 'producer').all()
    configs = db.query(ProducerConfig).all()

    config_map = {c.producer_user_id: c for c in configs}

    res = {
        "producers": [
            {
                "user_id": u.user_id,
                "username": u.username,
                "avg_fill_time": config_map.get(u.user_id).avg_fill_time if config_map.get(u.user_id) else 0,
                "estimated_wait_time": config_map.get(u.user_id).estimated_wait_time if config_map.get(u.user_id) else 0,
                "total_time": (
                    (config_map.get(u.user_id).avg_fill_time if config_map.get(u.user_id) else 0) +
                    (config_map.get(u.user_id).estimated_wait_time if config_map.get(u.user_id) else 0)
                )
            }
            for u in producers if u.user_id
        ]
    }

    res["producers"].sort(key=lambda x: x["user_id"])

    cache.set(CACHE_KEY_PRODUCER_CONFIG, res, ttl=CACHE_TTL_CONFIG)

    return res

@router.post("/producer-times/bulk")
async def save_producer_time_config(
    data: List[ProducerTimeConfig],
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
                      
    cache.delete(CACHE_KEY_PRODUCER_CONFIG)
    cache.delete(CACHE_KEY_DASHBOARD)

    try:
        logger.info(f"Incoming producer config data from {admin_user.username}: {len(data)} entries")

        for entry in data:
                          
            config = db.query(ProducerConfig).filter(
                ProducerConfig.producer_user_id == entry.producer_user_id
            ).first()

            if config:
                config.avg_fill_time = entry.avg_fill_time
                config.estimated_wait_time = entry.estimated_wait_time
            else:
                config = ProducerConfig(
                    producer_user_id=entry.producer_user_id,
                    avg_fill_time=entry.avg_fill_time,
                    estimated_wait_time=entry.estimated_wait_time
                )
                db.add(config)

        db.commit()
        log_activity(db, admin_user.username, "CONFIG_UPDATED", f"Updated {len(data)} producer time configurations")
        return {"status": "success", "message": f"Updated {len(data)} configurations"}
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error saving producer config: {e}")
        raise HTTPException(status_code=500, detail="Failed to save producer configurations. Please try again.")

@router.get("/hm-matrix")
async def get_hm_matrix(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    producers = db.query(User).filter(User.role == 'producer').all()
    consumers = db.query(User).filter(User.role == 'consumer').all()

    producer_configs = {c.producer_user_id: c for c in db.query(ProducerConfig).all()}
    consumer_configs = {c.consumer_user_id: c for c in db.query(ConsumerConfig).all()}
    travel_times = {
        f"{t.source_user_id}_{t.destination_user_id}": t.travel_time
        for t in db.query(TripTimeConfigModel).all()
    }

    matrix = {}
    for p in producers:
        if not p.user_id:
            continue
        p_config = producer_configs.get(p.user_id)
        p_total = (
            (p_config.avg_fill_time if p_config else 0) +
            (p_config.estimated_wait_time if p_config else 0)
        )

        for c in consumers:
            if not c.user_id:
                continue
            c_config = consumer_configs.get(c.user_id)
            c_total = (
                (c_config.avg_unload_time if c_config else 0) +
                (c_config.estimated_wait_time if c_config else 0)
            )

            travel = travel_times.get(f"{p.user_id}_{c.user_id}", 0)

            matrix[f"{p.user_id}_{c.user_id}"] = p_total + c_total + travel

    sorted_producers = sorted([p for p in producers if p.user_id], key=lambda x: x.user_id)
    sorted_consumers = sorted([c for c in consumers if c.user_id], key=lambda x: x.user_id)

    return {
        "producers": [{"user_id": p.user_id, "username": p.username} for p in sorted_producers],
        "consumers": [{"user_id": c.user_id, "username": c.username} for c in sorted_consumers],
        "matrix": matrix
    }

class SystemConfigUpdate(BaseModel):
    config_key: str
    config_value: str

class SystemConfigBulkUpdate(BaseModel):
    configs: List[SystemConfigUpdate]

SYSTEM_TIMING_CONFIGS = {
    "TRAVEL_TO_PRODUCER_MINUTES": {'default': '15', 'description': 'Time (min) for torpedo to travel from depot to producer after assignment'},
    "EXIT_BUFFER_MINUTES": {'default': '5', 'description': 'Buffer time (min) after loading/unloading completes before exit'},
    "DEFAULT_WAIT_TIME": {'default': '10', 'description': 'Default queue wait time (min) if not configured per location'},
    "DEFAULT_FILL_TIME": {'default': '30', 'description': 'Default fill/loading time (min) if not configured per producer'},
    "DEFAULT_UNLOAD_TIME": {'default': '20', 'description': 'Default unload time (min) if not configured per consumer'},
    "DEFAULT_TRAVEL_TIME": {'default': '25', 'description': 'Default travel time (min) between producer and consumer if not configured'}
}

@router.get("/system-settings")
async def get_system_settings(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    cached_data = cache.get(CACHE_KEY_SYSTEM_CONFIG)
    if cached_data is not None:
        return cached_data

    logger.debug("CACHE MISS: Fetching system config from DB.")

    existing_configs = db.query(SystemConfig).filter(
        SystemConfig.config_key.in_(SYSTEM_TIMING_CONFIGS.keys())
    ).all()
    config_map = {c.config_key: c for c in existing_configs}

    settings = []
    for key, meta in SYSTEM_TIMING_CONFIGS.items():
        existing = config_map.get(key)
        settings.append({
            "config_key": key,
            "config_value": existing.config_value if existing else meta["default"],
            "default_value": meta["default"],
            "description": meta["description"]
        })

    res = {"settings": settings}

    cache.set(CACHE_KEY_SYSTEM_CONFIG, res, ttl=CACHE_TTL_CONFIG)

    return res

@router.post("/system-settings/bulk")
async def save_system_settings(
    data: SystemConfigBulkUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
                      
    cache.delete(CACHE_KEY_SYSTEM_CONFIG)
    cache.delete(CACHE_KEY_DASHBOARD)

    try:
        logger.info(f"Incoming system config data from {admin_user.username}: {len(data.configs)} entries")

        updated_count = 0
        for entry in data.configs:
                                          
            if entry.config_key not in SYSTEM_TIMING_CONFIGS:
                continue

            config = db.query(SystemConfig).filter(
                SystemConfig.config_key == entry.config_key
            ).first()

            if config:
                config.config_value = entry.config_value
            else:
                config = SystemConfig(
                    config_key=entry.config_key,
                    config_value=entry.config_value,
                    description=SYSTEM_TIMING_CONFIGS[entry.config_key]["description"]
                )
                db.add(config)
            updated_count += 1

        db.commit()
        log_activity(db, admin_user.username, "CONFIG_UPDATED", f"Updated {updated_count} system settings")
        return {"status": "success", "message": f"Updated {updated_count} system settings"}
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error saving system settings: {e}")
        raise HTTPException(status_code=500, detail="Failed to save system settings. Please try again.")
