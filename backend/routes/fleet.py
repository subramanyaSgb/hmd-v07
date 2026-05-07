from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from ..database.engine import get_db
from ..database.models import FleetManagement, FleetLiveLocation, User, Trip
from ..constants import TripStatus
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.security import get_current_user_required, require_roles
from ..utils.cache import fleet_cache
from ..utils.soft_delete import active_only, soft_delete
from ..schemas import FleetCreate, FleetUpdate, FleetResponse

router = APIRouter(tags=["fleet"])

CACHE_KEY_LIVE_FLEET = "live_fleet_locations"
CACHE_KEY_FLEET_MGMT = "fleet_management"

CACHE_TTL_LIVE_FLEET = 10                                     
CACHE_TTL_FLEET_MGMT = 60                                      

@router.get("/api/fleet/live")
async def get_live_fleet_locations(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                       
    cached_data = fleet_cache.get(CACHE_KEY_LIVE_FLEET)
    if cached_data is not None:
        return cached_data

    logger.debug("CACHE MISS: Fetching live fleet locations from DB.")
    try:
        # Latest row per fleet_id, by row id (unique, monotonic) — NOT by last_updated.
        # SuVeechi often reports the same `reporttime_ist` across many sync ticks for an
        # idle torpedo, so multiple FleetLiveLocation rows can share the same fleet_id +
        # last_updated. Joining on last_updated returns ALL of those duplicates (28k+
        # rows after 90min for 53 torpedoes); joining on MAX(id) returns exactly one.
        latest_subquery = db.query(
            func.max(FleetLiveLocation.id).label('max_id')
        ).group_by(FleetLiveLocation.fleet_id).subquery()

        # LEFT JOIN FleetManagement to expose status + capacity per torpedo
        result = (
            db.query(FleetLiveLocation, FleetManagement)
            .join(
                latest_subquery,
                FleetLiveLocation.id == latest_subquery.c.max_id
            )
            .outerjoin(
                FleetManagement,
                FleetManagement.fleet_id == FleetLiveLocation.fleet_id
            )
            .all()
        )

        fleet_data = [
            {
                'id': loc.id,
                'fleet_id': loc.fleet_id,
                'type': loc.type,
                'x': loc.x,
                'y': loc.y,
                'last_updated': loc.last_updated.isoformat() if loc.last_updated else None,
                'status': fleet.status if fleet else None,
                'capacity': fleet.capacity if fleet else None,
            }
            for loc, fleet in result
        ]

        fleet_cache.set(CACHE_KEY_LIVE_FLEET, fleet_data, CACHE_TTL_LIVE_FLEET)

        return fleet_data
    except SQLAlchemyError as e:
        logger.error(f"Database error fetching live fleet locations: {e}")
        raise HTTPException(status_code=500, detail="Database error occurred")

@router.get("/api/fleet-management")
async def get_fleet_management(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                       
    cached_data = fleet_cache.get(CACHE_KEY_FLEET_MGMT)
    if cached_data is not None:
        return cached_data

    logger.debug("CACHE MISS: Fetching fleet management data from DB.")
                                     
    data = active_only(db.query(FleetManagement)).all()

    fleet_cache.set(CACHE_KEY_FLEET_MGMT, data, CACHE_TTL_FLEET_MGMT)

    return data

@router.post("/api/fleet-management", response_model=FleetResponse)
async def create_fleet_item(
    data: FleetCreate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
                      
    fleet_cache.invalidate(CACHE_KEY_FLEET_MGMT)

    logger.info(f"Creating new fleet item: {data.fleet_id} by {admin_user.username}")

    existing_item = db.query(FleetManagement).filter(FleetManagement.fleet_id == data.fleet_id).first()
    if existing_item:
        logger.warning(f"Attempted to register duplicate fleet ID: {data.fleet_id}")
        raise HTTPException(
            status_code=400,
            detail=f"Fleet ID '{data.fleet_id}' already exists. Please use a unique ID."
        )

    try:
        new_item = FleetManagement(
            fleet_id=data.fleet_id,
            type=data.type,
            status=data.status.value if data.status else "Operating",
            capacity=data.capacity
        )
        db.add(new_item)
        db.commit()
        db.refresh(new_item)
        log_activity(
            db, admin_user.username, "FLEET_ASSET_REGISTERED",
            details=f"Registered new {new_item.type}: {new_item.fleet_id}",
            current_user=admin_user,
            entity_type="fleet",
            entity_id=new_item.fleet_id,
            new_value={"fleet_id": new_item.fleet_id, "type": new_item.type, "status": new_item.status, "capacity": new_item.capacity}
        )
        return new_item
    except IntegrityError as e:
        logger.error(f"Integrity constraint violated creating fleet item: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="Fleet item conflicts with existing data")
    except SQLAlchemyError as e:
        logger.error(f"Database error creating fleet item: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create fleet item. Please try again.")

@router.put("/api/fleet-management/{item_id}", response_model=FleetResponse)
async def update_fleet_item(
    item_id: int,
    data: FleetUpdate,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
                      
    fleet_cache.invalidate(CACHE_KEY_FLEET_MGMT)

    logger.info(f"Updating fleet item ID: {item_id}")
                                          
    item = active_only(db.query(FleetManagement)).filter(FleetManagement.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Fleet item not found")

    try:
                                            
        old_values = {'fleet_id': item.fleet_id, 'type': item.type, 'status': item.status, 'capacity': item.capacity}

        if data.fleet_id is not None and data.fleet_id != item.fleet_id:
                                                                            
            existing = active_only(db.query(FleetManagement)).filter(
                FleetManagement.fleet_id == data.fleet_id,
                FleetManagement.id != item_id
            ).first()
            if existing:
                raise HTTPException(
                    status_code=400,
                    detail=f"Fleet ID '{data.fleet_id}' already exists. Please use a unique ID."
                )
                                                                                
            soft_deleted = db.query(FleetManagement).filter(
                FleetManagement.fleet_id == data.fleet_id,
                FleetManagement.id != item_id,
                FleetManagement.deleted_at.isnot(None)
            ).first()
            if soft_deleted:
                db.delete(soft_deleted)
                db.flush()
            item.fleet_id = data.fleet_id
        if data.type is not None:
            item.type = data.type
        if data.status is not None:
            item.status = data.status.value
        if data.capacity is not None:
            item.capacity = data.capacity

        db.commit()
        db.refresh(item)

        new_values = {'fleet_id': item.fleet_id, 'type': item.type, 'status': item.status, 'capacity': item.capacity}

        log_activity(
            db, admin_user.username, "FLEET_ASSET_UPDATED",
            details=f"Updated asset {item.fleet_id} status to {item.status}",
            current_user=admin_user,
            entity_type="fleet",
            entity_id=item.fleet_id,
            old_value=old_values,
            new_value=new_values
        )
        return item
    except IntegrityError as e:
        logger.error(f"Integrity constraint violated updating fleet item: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="Update conflicts with existing data")
    except SQLAlchemyError as e:
        logger.error(f"Database error updating fleet item: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update fleet item. Please try again.")

@router.delete("/api/fleet-management/{item_id}")
async def delete_fleet_item(
    item_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
                      
    fleet_cache.invalidate(CACHE_KEY_FLEET_MGMT)

    logger.info(f"Soft deleting fleet item ID: {item_id}")
                                          
    item = active_only(db.query(FleetManagement)).filter(FleetManagement.id == item_id).first()
    if not item:
        raise HTTPException(status_code=404, detail="Fleet item not found")

    try:
                                                        
        deleted_data = {'fleet_id': item.fleet_id, 'type': item.type, 'status': item.status, 'capacity': item.capacity}
        fleet_id = item.fleet_id

        soft_delete(db, item)
        db.commit()

        log_activity(
            db, admin_user.username, "FLEET_ASSET_DECOMMISSIONED",
            details=f"Decommissioned asset: {fleet_id}",
            current_user=admin_user,
            entity_type="fleet",
            entity_id=fleet_id,
            old_value=deleted_data
        )
        return {"status": "success", "message": f"Fleet item {fleet_id} decommissioned successfully"}
    except SQLAlchemyError as e:
        logger.error(f"Database error soft deleting fleet item: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete fleet item. Please try again.")

@router.get("/api/fleet-management/{fleet_id}/details")
async def get_torpedo_details(
    fleet_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                      
    torpedo = active_only(db.query(FleetManagement)).filter(
        FleetManagement.fleet_id == fleet_id
    ).first()

    if not torpedo:
        raise HTTPException(status_code=404, detail="Torpedo not found")

    all_trips = db.query(Trip).filter(
        Trip.torpedo_id == fleet_id,
        Trip.deleted_at.is_(None)
    ).order_by(Trip.created_at.desc()).all()

    completed_trips = [t for t in all_trips if t.status == TripStatus.COMPLETED]
    total_completed = len(completed_trips)

    current_trip = None
    if torpedo.status == "Assigned":
        active_trip = db.query(Trip).filter(
            Trip.torpedo_id == fleet_id,
            Trip.status >= TripStatus.ASSIGNED,
            Trip.status < TripStatus.COMPLETED,
            Trip.deleted_at.is_(None)
        ).first()

        if active_trip:
            current_trip = {
                "trip_id": active_trip.trip_id,
                "producer_id": active_trip.producer_id,
                "consumer_id": active_trip.consumer_id,
                "status": active_trip.status,
                "status_name": _get_status_name(active_trip.status),
                "assigned_at": active_trip.assigned_at.isoformat() if active_trip.assigned_at else None,
                "created_at": active_trip.created_at.isoformat() if active_trip.created_at else None
            }

    total_cycle_time = sum(t.cycle_time_minutes or 0 for t in completed_trips)
    avg_cycle_time = total_cycle_time / total_completed if total_completed > 0 else 0

    recent_trips = []
    for trip in completed_trips[:20]:
        recent_trips.append({
            "trip_id": trip.trip_id,
            "producer_id": trip.producer_id,
            "consumer_id": trip.consumer_id,
            "status": trip.status,
            "status_name": _get_status_name(trip.status),
            "cycle_time_minutes": round(trip.cycle_time_minutes, 1) if trip.cycle_time_minutes else None,
            "assigned_at": trip.assigned_at.isoformat() if trip.assigned_at else None,
            "completed_at": trip.c_exited_at.isoformat() if trip.c_exited_at else None,
            "created_at": trip.created_at.isoformat() if trip.created_at else None
        })

    trips_by_status = {
        "pending": len([t for t in all_trips if t.status == TripStatus.PENDING]),
        "in_progress": len([t for t in all_trips if TripStatus.ASSIGNED <= t.status < TripStatus.COMPLETED]),
        "completed": total_completed
    }

    return {
        "torpedo": {
            "id": torpedo.id,
            "fleet_id": torpedo.fleet_id,
            "type": torpedo.type,
            "status": torpedo.status,
            "capacity": torpedo.capacity,
            "created_at": torpedo.created_at.isoformat() if torpedo.created_at else None,
            "last_updated": torpedo.last_updated.isoformat() if torpedo.last_updated else None
        },
        "statistics": {
            "total_trips": len(all_trips),
            "completed_trips": total_completed,
            "in_progress_trips": trips_by_status["in_progress"],
            "pending_trips": trips_by_status["pending"],
            "total_cycle_time_minutes": round(total_cycle_time, 1),
            "avg_cycle_time_minutes": round(avg_cycle_time, 1)
        },
        "current_trip": current_trip,
        "recent_trips": recent_trips
    }

def _get_status_name(status: int) -> str:
    status_names = {
        0: "Pending",
        1: "Assigned",
        2: "WB Tare Entry",
        3: "WB Tare Recorded",
        4: "Producer Entered",
        5: "Loading Started",
        6: "Loading Ended",
        7: "Producer Exited",
        8: "WB Gross Entry",
        9: "WB Gross Recorded",
        10: "Consumer Entered",
        11: "Unloading Started",
        12: "Unloading Ended",
        13: "Completed"
    }
    return status_names.get(status, "Unknown")

@router.get("/api/fleet-management/stats")
async def get_fleet_statistics(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                              
    torpedoes = active_only(db.query(FleetManagement)).filter(
        FleetManagement.type == "torpedo"
    ).all()

    total = len(torpedoes)

    active_trips = db.query(Trip).filter(
        Trip.torpedo_id.isnot(None),
        Trip.status >= TripStatus.ASSIGNED,
        Trip.status <= TripStatus.UNLOADING_ENDED,
        Trip.deleted_at.is_(None)
    ).all()

    assigned_torpedo_ids = {t.torpedo_id for t in active_trips}

    assigned = len(assigned_torpedo_ids)

    maintenance = sum(1 for t in torpedoes if t.status == "Maintenance")

    operating = total - assigned - maintenance

    available = operating
    utilization = round((available / total) * 100) if total > 0 else 0

    total_capacity = sum(t.capacity or 0 for t in torpedoes)

    return {
        "total": total,
        "operating": operating,
        "assigned": assigned,
        "maintenance": maintenance,
        "available": available,
        "utilization": utilization,
        "total_capacity": total_capacity,
        "assigned_torpedo_ids": list(assigned_torpedo_ids)
    }
