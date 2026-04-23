from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from ..database.engine import get_db
from ..database.models import LocationCoordinate, MaintenanceSchedule, User, Notification, NodeStatusHistory
from datetime import date, datetime, timedelta
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.redis_cache import cache
from ..utils.security import get_current_user

router = APIRouter(prefix="/api/locations", tags=["locations"])

CACHE_KEY_LOCATIONS_ALL = "locations:all"
CACHE_TTL_LOCATIONS = 300                                         

@router.get("")
async def fetch_all_locations_list(db: Session = Depends(get_db)):
                           
    cached_data = cache.get(CACHE_KEY_LOCATIONS_ALL)
    if cached_data is not None:
        return cached_data

    logger.debug("CACHE MISS: Fetching all locations from DB.")
    db_locations = db.query(LocationCoordinate).all()

    today = date.today()
    maintenance_nodes = db.query(MaintenanceSchedule.node_id).filter(
        MaintenanceSchedule.start_date <= today,
        MaintenanceSchedule.end_date >= today
    ).all()
    maintenance_ids = [m[0] for m in maintenance_nodes]

    locations_data = []
    for loc in db_locations:
        loc_dict = {
            "id": loc.id,
            "location_name": loc.location_name,
            "user_id": loc.user_id,
            "type": loc.type,
            "x": loc.x,
            "y": loc.y,
            "is_visible": loc.is_visible,
            "status": "Maintenance" if loc.user_id in maintenance_ids else loc.status,
            "last_updated": loc.last_updated.isoformat() if loc.last_updated else None
        }
        locations_data.append(loc_dict)

    cache.set(CACHE_KEY_LOCATIONS_ALL, locations_data, ttl=CACHE_TTL_LOCATIONS)

    return locations_data

@router.get("/id/{identifier}")
async def get_location_by_id_or_name(identifier: str, db: Session = Depends(get_db)):
    logger.info(f"RECEIVED REQUEST: GET /api/locations/id/{identifier}")
                       
    location = db.query(LocationCoordinate).filter(LocationCoordinate.user_id == identifier).first()
    
    if not location:
        location = db.query(LocationCoordinate).filter(LocationCoordinate.location_name == identifier).first()
    
    if not location:
        logger.warning(f"Location not found for identifier: {identifier}")
        raise HTTPException(status_code=404, detail="Location not found")
    
    location_data = {
        "id": location.id,
        "location_name": location.location_name,
        "user_id": location.user_id,
        "type": location.type,
        "x": location.x,
        "y": location.y,
        "is_visible": location.is_visible,
        "status": location.status,
        "last_updated": location.last_updated.isoformat() if location.last_updated else None
    }
    
    today = date.today()
    is_in_maintenance = db.query(MaintenanceSchedule).filter(
        MaintenanceSchedule.node_id == location.user_id,
        MaintenanceSchedule.start_date <= today,
        MaintenanceSchedule.end_date >= today
    ).first()

    if is_in_maintenance:
        location_data["status"] = "Maintenance"
        
    return location_data

@router.get("/name/{location_name}")
async def get_location_by_name(location_name: str, db: Session = Depends(get_db)):
    return await get_location_by_id_or_name(location_name, db)

@router.post("")
async def create_location(data: dict, db: Session = Depends(get_db)):
                      
    cache.delete(CACHE_KEY_LOCATIONS_ALL)
    
    location_name = data.get('location_name')
    logger.info(f"Creating new location: {location_name}")
    
    existing_loc = db.query(LocationCoordinate).filter(LocationCoordinate.location_name == location_name).first()
    if existing_loc:
        logger.warning(f"Attempted to create duplicate location name: {location_name}")
        raise HTTPException(
            status_code=400,
            detail=f"Location name '{location_name}' already exists. Please use a unique name."
        )

    try:
        new_loc = LocationCoordinate(
            location_name=location_name,
            user_id=data.get('user_id'),
            type=data.get('type'),
            x=float(data.get('x')),
            y=float(data.get('y')),
            is_visible=data.get('is_visible', True)
        )
        db.add(new_loc)
        db.commit()
        db.refresh(new_loc)
        logger.success(f"Location {new_loc.location_name} created successfully.")
        log_activity(
            db, "Admin", "LOCATION_CREATED",
            details=f"Created location: {new_loc.location_name}",
            entity_type="location",
            entity_id=new_loc.user_id or new_loc.id,
            new_value={
                "location_name": new_loc.location_name,
                "user_id": new_loc.user_id,
                "type": new_loc.type,
                "x": new_loc.x,
                "y": new_loc.y,
                "is_visible": new_loc.is_visible
            }
        )
        return {
            "id": new_loc.id,
            "location_name": new_loc.location_name,
            "user_id": new_loc.user_id,
            "type": new_loc.type,
            "x": new_loc.x,
            "y": new_loc.y,
            "is_visible": new_loc.is_visible,
            "status": new_loc.status,
            "last_updated": new_loc.last_updated.isoformat() if new_loc.last_updated else None
        }
    except IntegrityError as e:
        logger.error(f"Integrity constraint violated creating location: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="Location conflicts with existing data")
    except SQLAlchemyError as e:
        logger.error(f"Database error creating location: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create location. Please try again.")
    except (ValueError, TypeError) as e:
        logger.error(f"Invalid data for location: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid coordinate values provided")

@router.put("/{location_id}")
async def update_location(location_id: int, data: dict, db: Session = Depends(get_db)):
                      
    cache.delete(CACHE_KEY_LOCATIONS_ALL)

    logger.info(f"Updating location ID: {location_id}")
    location = db.query(LocationCoordinate).filter(LocationCoordinate.id == location_id).first()

    if not location:
        logger.warning(f"Location not found for update: {location_id}")
        raise HTTPException(status_code=404, detail="Location not found")

    try:
        location.location_name = data.get('location_name', location.location_name)
        location.user_id = data.get('user_id', location.user_id)
        location.type = data.get('type', location.type)
        location.x = float(data.get('x', location.x))
        location.y = float(data.get('y', location.y))
        location.is_visible = data.get('is_visible', location.is_visible)

        db.commit()
        db.refresh(location)
        logger.success(f"Location {location.location_name} updated successfully.")
        log_activity(
            db, "Admin", "LOCATION_UPDATED",
            details=f"Updated location details for {location.location_name}",
            entity_type="location",
            entity_id=location.user_id or location.id,
            new_value={
                "location_name": location.location_name,
                "user_id": location.user_id,
                "type": location.type,
                "x": location.x,
                "y": location.y,
                "is_visible": location.is_visible
            }
        )
        return {
            "id": location.id,
            "location_name": location.location_name,
            "user_id": location.user_id,
            "type": location.type,
            "x": location.x,
            "y": location.y,
            "is_visible": location.is_visible,
            "status": location.status,
            "last_updated": location.last_updated.isoformat() if location.last_updated else None
        }
    except IntegrityError as e:
        logger.error(f"Integrity constraint violated updating location: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="Update conflicts with existing data")
    except SQLAlchemyError as e:
        logger.error(f"Database error updating location: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update location. Please try again.")
    except (ValueError, TypeError) as e:
        logger.error(f"Invalid data for location update: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="Invalid coordinate values provided")

@router.put("/status/{identifier}")
async def update_location_status(
    identifier: str,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
                      
    cache.delete(CACHE_KEY_LOCATIONS_ALL)

    status = data.get('status')
    reason = data.get('reason')                                         
    if status not in ["Operating", "Maintenance", "Shutdown"]:
        raise HTTPException(status_code=400, detail="Invalid status value. Must be 'Operating', 'Maintenance', or 'Shutdown'.")

    logger.info(f"Updating status for location identifier: {identifier} to {status}")

    location = db.query(LocationCoordinate).filter(LocationCoordinate.user_id == identifier).first()

    if not location:
        location = db.query(LocationCoordinate).filter(LocationCoordinate.location_name == identifier).first()

    if not location:
        logger.warning(f"Location not found for status update: {identifier}")
        raise HTTPException(status_code=404, detail="Location not found")

    try:
        old_status = location.status
        node_id = location.user_id or location.location_name

        if old_status != status:
                                                                     
            previous_history = db.query(NodeStatusHistory).filter(
                NodeStatusHistory.node_id == node_id,
                NodeStatusHistory.ended_at.is_(None)
            ).first()
            if previous_history:
                previous_history.ended_at = datetime.now()

            history_record = NodeStatusHistory(
                node_id=node_id,
                old_status=old_status,
                new_status=status,
                changed_by=current_user.username,
                changed_by_role=current_user.role,
                reason=reason
            )
            db.add(history_record)

        location.status = status
        db.commit()
        db.refresh(location)
        logger.success(f"Location {location.location_name} (ID: {identifier}) status updated to {status} successfully.")
        log_activity(
            db, identifier, "LOCATION_STATUS_CHANGED",
            details=f"Changed {location.location_name} status to {status}",
            entity_type="location",
            entity_id=location.user_id or location.id,
            old_value={"status": old_status},
            new_value={"status": status, "location_name": location.location_name}
        )

        admin_users = db.query(User).filter(User.role.in_(('admin', 'trs')), User.deleted_at.is_(None)).all()
        node_type = location.type.capitalize() if location.type else "Node"
        for admin in admin_users:
            notification = Notification(
                recipient_id=admin.user_id,
                sender=identifier,
                message=f"{node_type} {location.location_name} ({identifier}) changed status from {old_status} to {status}.",
                is_read=False
            )
            db.add(notification)
        db.commit()

        return {
            "id": location.id,
            "location_name": location.location_name,
            "user_id": location.user_id,
            "type": location.type,
            "x": location.x,
            "y": location.y,
            "is_visible": location.is_visible,
            "status": location.status,
            "last_updated": location.last_updated.isoformat() if location.last_updated else None
        }
    except SQLAlchemyError as e:
        logger.error(f"Database error updating location status: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update location status. Please try again.")

@router.get("/operation-status/{node_id}")
async def get_operation_status(node_id: str, db: Session = Depends(get_db)):
                  
    location = db.query(LocationCoordinate).filter(
        (LocationCoordinate.user_id == node_id) | (LocationCoordinate.location_name == node_id)
    ).first()

    if not location:
        raise HTTPException(status_code=404, detail="Node not found")

    node_identifier = location.user_id or location.location_name
    today = date.today()
    now = datetime.now()

    scheduled_maintenance = db.query(MaintenanceSchedule).filter(
        MaintenanceSchedule.node_id == node_identifier,
        MaintenanceSchedule.start_date <= today,
        MaintenanceSchedule.end_date >= today
    ).first()

    current_status = location.status
    status_source = "operating"
    scheduled_info = None
    self_set_info = None

    if scheduled_maintenance:
        status_source = "admin_scheduled"
                                        
        end_datetime = datetime.combine(scheduled_maintenance.end_date, datetime.max.time())
        remaining = end_datetime - now
        days_remaining = remaining.days
        hours_remaining = remaining.seconds // 3600

        scheduled_info = {
            "start_date": scheduled_maintenance.start_date.isoformat(),
            "end_date": scheduled_maintenance.end_date.isoformat(),
            "reason": scheduled_maintenance.reason,
            "days_remaining": max(0, days_remaining),
            "hours_remaining": hours_remaining,
            "total_duration_days": (scheduled_maintenance.end_date - scheduled_maintenance.start_date).days + 1
        }
        current_status = "Maintenance"                                  
    elif current_status in ["Maintenance", "Shutdown"]:
        status_source = "self_set"
                                       
        current_history = db.query(NodeStatusHistory).filter(
            NodeStatusHistory.node_id == node_identifier,
            NodeStatusHistory.new_status == current_status,
            NodeStatusHistory.ended_at.is_(None)
        ).order_by(NodeStatusHistory.changed_at.desc()).first()

        if current_history:
            elapsed = now - current_history.changed_at.replace(tzinfo=None)
            self_set_info = {
                "status_since": current_history.changed_at.isoformat(),
                "days_elapsed": elapsed.days,
                "hours_elapsed": elapsed.seconds // 3600,
                "changed_by": current_history.changed_by,
                "reason": current_history.reason
            }
        else:
                                                           
            if location.last_updated:
                elapsed = now - location.last_updated.replace(tzinfo=None)
                self_set_info = {
                    "status_since": location.last_updated.isoformat(),
                    "days_elapsed": elapsed.days,
                    "hours_elapsed": elapsed.seconds // 3600,
                    "changed_by": None,
                    "reason": None
                }

    ninety_days_ago = now - timedelta(days=90)
    history_records = db.query(NodeStatusHistory).filter(
        NodeStatusHistory.node_id == node_identifier,
        NodeStatusHistory.changed_at >= ninety_days_ago
    ).order_by(NodeStatusHistory.changed_at.desc()).limit(20).all()

    status_history = []
    for record in history_records:
        duration_str = None
        if record.ended_at:
            duration = record.ended_at - record.changed_at
            if duration.days > 0:
                duration_str = f"{duration.days} days, {duration.seconds // 3600} hours"
            else:
                hours = duration.seconds // 3600
                minutes = (duration.seconds % 3600) // 60
                duration_str = f"{hours} hours, {minutes} minutes"

        status_history.append({
            "status": record.new_status,
            "start": record.changed_at.isoformat(),
            "end": record.ended_at.isoformat() if record.ended_at else None,
            "duration": duration_str,
            "changed_by": record.changed_by,
            "changed_by_role": record.changed_by_role,
            "reason": record.reason
        })

    past_schedules = db.query(MaintenanceSchedule).filter(
        MaintenanceSchedule.node_id == node_identifier,
        MaintenanceSchedule.end_date < today
    ).order_by(MaintenanceSchedule.end_date.desc()).limit(10).all()

    for sched in past_schedules:
        duration_days = (sched.end_date - sched.start_date).days + 1
                                                               
        sched_start = datetime.combine(sched.start_date, datetime.min.time())
        already_exists = any(
            h["start"][:10] == sched.start_date.isoformat() and h["status"] == "Maintenance"
            for h in status_history
        )
        if not already_exists:
            status_history.append({
                "status": "Maintenance",
                "start": sched.start_date.isoformat(),
                "end": sched.end_date.isoformat(),
                "duration": f"{duration_days} days",
                "changed_by": "Admin (Scheduled)",
                "changed_by_role": "admin",
                "reason": sched.reason
            })

    status_history.sort(key=lambda x: x["start"], reverse=True)

    total_maintenance_hours = 0
    total_shutdown_hours = 0
    last_maintenance_end = None

    for record in history_records:
        if record.ended_at:
            duration_hours = (record.ended_at - record.changed_at).total_seconds() / 3600
            if record.new_status == "Maintenance":
                total_maintenance_hours += duration_hours
                if not last_maintenance_end or record.ended_at > last_maintenance_end:
                    last_maintenance_end = record.ended_at
            elif record.new_status == "Shutdown":
                total_shutdown_hours += duration_hours

    for sched in past_schedules:
        if sched.start_date >= (today - timedelta(days=90)):
            duration_days = (sched.end_date - sched.start_date).days + 1
            total_maintenance_hours += duration_days * 24
            sched_end = datetime.combine(sched.end_date, datetime.max.time())
            if not last_maintenance_end or sched_end > last_maintenance_end:
                last_maintenance_end = sched_end

    summary = {
        "total_maintenance_days_90d": round(total_maintenance_hours / 24, 1),
        "total_shutdown_hours_90d": round(total_shutdown_hours, 1),
        "last_maintenance_days_ago": (now - last_maintenance_end).days if last_maintenance_end else None
    }

    return {
        "node_id": node_identifier,
        "location_name": location.location_name,
        "current_status": current_status,
        "status_source": status_source,
        "scheduled_maintenance": scheduled_info,
        "self_set_info": self_set_info,
        "status_history": status_history[:15],                           
        "summary": summary
    }

@router.delete("/{location_id}")
async def delete_location(location_id: int, db: Session = Depends(get_db)):
                      
    cache.delete(CACHE_KEY_LOCATIONS_ALL)

    logger.info(f"Deleting location ID: {location_id}")
    location = db.query(LocationCoordinate).filter(LocationCoordinate.id == location_id).first()

    if not location:
        logger.warning(f"Location not found for deletion: {location_id}")
        raise HTTPException(status_code=404, detail="Location not found")

    try:
        deleted_name = location.location_name
        db.delete(location)
        db.commit()
        logger.success(f"Location ID {location_id} deleted successfully.")
        log_activity(
            db, "Admin", "LOCATION_DELETED",
            details=f"Deleted location: {deleted_name}",
            entity_type="location",
            entity_id=location_id,
            old_value={"location_name": deleted_name}
        )
        return {"message": "Location deleted successfully"}
    except IntegrityError as e:
        logger.error(f"Cannot delete location due to foreign key constraints: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="Cannot delete location: it is referenced by other records")
    except SQLAlchemyError as e:
        logger.error(f"Database error deleting location: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete location. Please try again.")
