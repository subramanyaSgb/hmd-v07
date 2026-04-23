from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from datetime import datetime, timezone
from ..database.engine import get_db
from ..database.models import (
    Converter, ConverterStatusHistory, LocationCoordinate,
    NodeStatusHistory, User, Notification
)
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.redis_cache import cache
from ..utils.security import get_current_user_required, require_roles

router = APIRouter(prefix="/api/converters", tags=["converters"])

CACHE_KEY_LOCATIONS_ALL = "locations:all"
CACHE_KEY_CONVERTERS_PREFIX = "converters:"
CACHE_TTL_CONVERTERS = 300             

VALID_STATUSES = ["Running", "Standby", "Maintenance", "Shutdown"]

def _sync_consumer_status(db: Session, consumer_id: str, changed_by: str, changed_by_role: str):
                                                               
    converters = db.query(Converter).filter(
        Converter.consumer_id == consumer_id,
        Converter.deleted_at.is_(None)
    ).all()

    if not converters:
                                                             
        return

    has_active = any(c.status in ("Running", "Standby") for c in converters)
    derived_status = "Operating" if has_active else "Shutdown"

    location = db.query(LocationCoordinate).filter(
        LocationCoordinate.user_id == consumer_id
    ).first()

    if not location:
        logger.warning(f"Consumer location not found for {consumer_id} during converter sync")
        return

    old_status = location.status
    if old_status == derived_status:
                          
        return

    location.status = derived_status

    node_id = location.user_id or location.location_name
    previous_history = db.query(NodeStatusHistory).filter(
        NodeStatusHistory.node_id == node_id,
        NodeStatusHistory.ended_at.is_(None)
    ).first()
    if previous_history:
        previous_history.ended_at = datetime.now(timezone.utc)

    history_record = NodeStatusHistory(
        node_id=node_id,
        old_status=old_status,
        new_status=derived_status,
        changed_by=changed_by,
        changed_by_role=changed_by_role,
        reason=f"Auto-derived from converter statuses"
    )
    db.add(history_record)

    admin_users = db.query(User).filter(
        User.role.in_(("admin", "trs")),
        User.deleted_at.is_(None)
    ).all()
    node_type = location.type.capitalize() if location.type else "Node"
    for admin in admin_users:
        notification = Notification(
            recipient_id=admin.user_id,
            sender="System",
            message=f"{node_type} {location.location_name} ({consumer_id}) status auto-changed from {old_status} to {derived_status} based on converter states.",
            is_read=False
        )
        db.add(notification)

    db.flush()

    cache.delete(CACHE_KEY_LOCATIONS_ALL)

    logger.info(
        f"Consumer {consumer_id} status synced: {old_status} -> {derived_status} "
        f"(based on {len(converters)} converter(s))"
    )

def _compute_lining_info(converter: Converter):
                                                                
    status_days = 0
    if converter.status_since:
        now = datetime.now(timezone.utc)
        status_since = converter.status_since
        if status_since.tzinfo is None:
            status_since = status_since.replace(tzinfo=timezone.utc)
        status_days = (now - status_since).days

    if getattr(converter, "equipment_type", "BOF") != "BOF":
                                                 
        return {'lining_percentage': None, 'lining_level': 'N/A', 'status_days': status_days}

    max_heats = converter.max_heats or 1
    current_heats = converter.current_heats or 0
    lining_percentage = round(((max_heats - current_heats) / max_heats) * 100, 1)
    lining_percentage = max(0.0, min(100.0, lining_percentage))

    if lining_percentage > 50:
        lining_level = "good"
    elif lining_percentage > 20:
        lining_level = "warning"
    else:
        lining_level = "critical"

    return {'lining_percentage': lining_percentage, 'lining_level': lining_level, 'status_days': status_days}

def _converter_to_dict(converter: Converter):
    lining_info = _compute_lining_info(converter)
    return {
        "id": converter.id,
        "consumer_id": converter.consumer_id,
        "name": converter.name,
        "equipment_type": getattr(converter, "equipment_type", "BOF"),
        "capacity_tons": converter.capacity_tons,
        "max_heats": converter.max_heats,
        "current_heats": converter.current_heats,
        "status": converter.status,
        "status_since": converter.status_since.isoformat() if converter.status_since else None,
        "lining_percentage": lining_info["lining_percentage"],
        "lining_level": lining_info["lining_level"],
        "status_days": lining_info["status_days"],
        "created_at": converter.created_at.isoformat() if converter.created_at else None,
        "last_updated": converter.last_updated.isoformat() if converter.last_updated else None,
    }

@router.get("/{consumer_id}")
async def get_converters(consumer_id: str, db: Session = Depends(get_db)):
    logger.debug(f"Fetching converters for consumer: {consumer_id}")
    try:
        converters = db.query(Converter).filter(
            Converter.consumer_id == consumer_id,
            Converter.deleted_at.is_(None)
        ).order_by(Converter.name).all()

        return [_converter_to_dict(c) for c in converters]
    except SQLAlchemyError as e:
        logger.error(f"Database error fetching converters for {consumer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch converters.")

@router.post("/{consumer_id}")
async def create_converter(
    consumer_id: str,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                                                        
    if current_user.role not in ("admin", "trs") and current_user.user_id != consumer_id:
        raise HTTPException(status_code=403, detail="Not authorized to create converters for this consumer.")

    name = data.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Converter name is required.")

    capacity_tons = data.get("capacity_tons", 0)
    max_heats = data.get("max_heats", 3000)

    equipment_type = data.get("equipment_type", "BOF")
    if equipment_type not in ("BOF", "ZPF", "EAF"):
        raise HTTPException(status_code=400, detail="equipment_type must be BOF, ZPF, or EAF")

    logger.info(f"Creating converter '{name}' (type={equipment_type}) for consumer {consumer_id}")

    try:
        new_converter = Converter(
            consumer_id=consumer_id,
            name=name,
            capacity_tons=float(capacity_tons),
            max_heats=int(max_heats),
            current_heats=0,
            status="Running",
            status_since=datetime.now(timezone.utc),
            equipment_type=equipment_type,
        )
                                                 
        if equipment_type != "BOF":
            new_converter.max_heats = data.get("max_heats", 0)
        db.add(new_converter)
        db.flush()                                      

        initial_history = ConverterStatusHistory(
            converter_id=new_converter.id,
            old_status=None,
            new_status="Running",
            changed_by=current_user.username,
            changed_by_role=current_user.role,
            reason="Converter created",
            heats_at_change=0,
        )
        db.add(initial_history)

        _sync_consumer_status(db, consumer_id, current_user.username, current_user.role)

        db.commit()
        db.refresh(new_converter)

        log_activity(
            db, current_user.username, "CONVERTER_CREATED",
            details=f"Created converter '{name}' for {consumer_id}",
            entity_type="converter",
            entity_id=str(new_converter.id),
            new_value={
                "name": name,
                "consumer_id": consumer_id,
                "capacity_tons": capacity_tons,
                "max_heats": max_heats,
                "equipment_type": equipment_type,
            }
        )

        logger.success(f"Converter '{name}' created for {consumer_id} (ID: {new_converter.id})")
                                    
        cache.delete(f"{CACHE_KEY_CONVERTERS_PREFIX}{consumer_id}")

        return _converter_to_dict(new_converter)

    except IntegrityError as e:
        logger.error(f"Integrity error creating converter: {e}")
        db.rollback()
        raise HTTPException(
            status_code=400,
            detail=f"Converter name '{name}' already exists for consumer {consumer_id}."
        )
    except SQLAlchemyError as e:
        logger.error(f"Database error creating converter: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create converter.")

@router.put("/{converter_id}")
async def update_converter(
    converter_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    converter = db.query(Converter).filter(
        Converter.id == converter_id,
        Converter.deleted_at.is_(None)
    ).first()

    if not converter:
        raise HTTPException(status_code=404, detail="Converter not found.")

    if current_user.role not in ("admin", "trs") and current_user.user_id != converter.consumer_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this converter.")

    logger.info(f"Updating converter ID {converter_id}")

    try:
        old_values = {'name': converter.name, 'capacity_tons': converter.capacity_tons, 'max_heats': converter.max_heats}

        converter.name = data.get("name", converter.name)
        converter.capacity_tons = float(data.get("capacity_tons", converter.capacity_tons))
        converter.max_heats = int(data.get("max_heats", converter.max_heats))

        db.commit()
        db.refresh(converter)

        log_activity(
            db, current_user.username, "CONVERTER_UPDATED",
            details=f"Updated converter '{converter.name}' (ID: {converter_id})",
            entity_type="converter",
            entity_id=str(converter_id),
            old_value=old_values,
            new_value={'name': converter.name, 'capacity_tons': converter.capacity_tons, 'max_heats': converter.max_heats}
        )

        logger.success(f"Converter '{converter.name}' (ID: {converter_id}) updated.")
        cache.delete(f"{CACHE_KEY_CONVERTERS_PREFIX}{converter.consumer_id}")

        return _converter_to_dict(converter)

    except IntegrityError as e:
        logger.error(f"Integrity error updating converter: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="Update conflicts with existing data.")
    except SQLAlchemyError as e:
        logger.error(f"Database error updating converter: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update converter.")

@router.delete("/{converter_id}")
async def delete_converter(
    converter_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    converter = db.query(Converter).filter(
        Converter.id == converter_id,
        Converter.deleted_at.is_(None)
    ).first()

    if not converter:
        raise HTTPException(status_code=404, detail="Converter not found.")

    if current_user.role not in ("admin", "trs") and current_user.user_id != converter.consumer_id:
        raise HTTPException(status_code=403, detail="Not authorized to delete this converter.")

    logger.info(f"Soft-deleting converter '{converter.name}' (ID: {converter_id})")

    try:
        consumer_id = converter.consumer_id
        converter_name = converter.name

        converter.soft_delete()

        _sync_consumer_status(db, consumer_id, current_user.username, current_user.role)

        db.commit()

        log_activity(
            db, current_user.username, "CONVERTER_DELETED",
            details=f"Soft-deleted converter '{converter_name}' (ID: {converter_id}) from {consumer_id}",
            entity_type="converter",
            entity_id=str(converter_id),
            old_value={"name": converter_name, "consumer_id": consumer_id}
        )

        logger.success(f"Converter '{converter_name}' (ID: {converter_id}) soft-deleted.")
        cache.delete(f"{CACHE_KEY_CONVERTERS_PREFIX}{consumer_id}")

        return {"message": f"Converter '{converter_name}' deleted successfully."}

    except SQLAlchemyError as e:
        logger.error(f"Database error deleting converter: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete converter.")

@router.put("/{converter_id}/status")
async def update_converter_status(
    converter_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    converter = db.query(Converter).filter(
        Converter.id == converter_id,
        Converter.deleted_at.is_(None)
    ).first()

    if not converter:
        raise HTTPException(status_code=404, detail="Converter not found.")

    if current_user.role not in ("admin", "trs") and current_user.user_id != converter.consumer_id:
        raise HTTPException(status_code=403, detail="Not authorized to change this converter's status.")

    new_status = data.get("status")
    reason = data.get("reason")

    if new_status not in VALID_STATUSES:
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status. Must be one of: {', '.join(VALID_STATUSES)}"
        )

    old_status = converter.status
    if old_status == new_status:
        return _converter_to_dict(converter)

    logger.info(f"Changing converter '{converter.name}' (ID: {converter_id}) status: {old_status} -> {new_status}")

    try:
        now = datetime.now(timezone.utc)

        previous_history = db.query(ConverterStatusHistory).filter(
            ConverterStatusHistory.converter_id == converter_id,
            ConverterStatusHistory.ended_at.is_(None)
        ).first()
        if previous_history:
            previous_history.ended_at = now

        history_record = ConverterStatusHistory(
            converter_id=converter_id,
            old_status=old_status,
            new_status=new_status,
            changed_by=current_user.username,
            changed_by_role=current_user.role,
            reason=reason,
            heats_at_change=converter.current_heats,
        )
        db.add(history_record)

        heats_reset = False
        if old_status == "Maintenance" and new_status == "Running":
            if getattr(converter, "equipment_type", "BOF") == "BOF":
                converter.current_heats = 0
                heats_reset = True
                logger.info(f"Converter '{converter.name}' heats reset to 0 after relining (Maintenance -> Running)")
            else:
                logger.info(f"Converter '{converter.name}' ({converter.equipment_type}) skipping heat reset (non-BOF)")

        converter.status = new_status
        converter.status_since = now

        _sync_consumer_status(db, converter.consumer_id, current_user.username, current_user.role)

        db.commit()
        db.refresh(converter)

        log_activity(
            db, current_user.username, "CONVERTER_STATUS_CHANGED",
            details=f"Converter '{converter.name}' status changed: {old_status} -> {new_status}"
                     + (" (heats reset after relining)" if heats_reset else ""),
            entity_type="converter",
            entity_id=str(converter_id),
            old_value={"status": old_status, "current_heats": converter.current_heats if not heats_reset else history_record.heats_at_change},
            new_value={"status": new_status, "current_heats": converter.current_heats}
        )

        logger.success(f"Converter '{converter.name}' status updated to {new_status}")
        cache.delete(f"{CACHE_KEY_CONVERTERS_PREFIX}{converter.consumer_id}")

        return _converter_to_dict(converter)

    except SQLAlchemyError as e:
        logger.error(f"Database error updating converter status: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update converter status.")

@router.get("/{converter_id}/history")
async def get_converter_history(converter_id: int, db: Session = Depends(get_db)):
    converter = db.query(Converter).filter(
        Converter.id == converter_id,
        Converter.deleted_at.is_(None)
    ).first()

    if not converter:
        raise HTTPException(status_code=404, detail="Converter not found.")

    try:
        history_records = db.query(ConverterStatusHistory).filter(
            ConverterStatusHistory.converter_id == converter_id
        ).order_by(ConverterStatusHistory.changed_at.desc()).all()

        now = datetime.now(timezone.utc)

        timeline = []
        running_seconds = 0
        maintenance_seconds = 0
        shutdown_seconds = 0
        standby_seconds = 0

        for record in history_records:
            changed_at = record.changed_at
            if changed_at and changed_at.tzinfo is None:
                changed_at = changed_at.replace(tzinfo=timezone.utc)

            ended_at = record.ended_at
            if ended_at and ended_at.tzinfo is None:
                ended_at = ended_at.replace(tzinfo=timezone.utc)

            end_time = ended_at or now
            duration_seconds = (end_time - changed_at).total_seconds() if changed_at else 0
            duration_hours = round(duration_seconds / 3600, 2)

            status = record.new_status
            if status == "Running":
                running_seconds += duration_seconds
            elif status == "Maintenance":
                maintenance_seconds += duration_seconds
            elif status == "Shutdown":
                shutdown_seconds += duration_seconds
            elif status == "Standby":
                standby_seconds += duration_seconds

            timeline.append({
                "id": record.id,
                "old_status": record.old_status,
                "new_status": record.new_status,
                "changed_by": record.changed_by,
                "changed_by_role": record.changed_by_role,
                "reason": record.reason,
                "heats_at_change": record.heats_at_change,
                "changed_at": changed_at.isoformat() if changed_at else None,
                "ended_at": ended_at.isoformat() if ended_at else None,
                "duration_hours": duration_hours,
            })

        running_hours = round(running_seconds / 3600, 2)
        maintenance_hours = round(maintenance_seconds / 3600, 2)
        shutdown_hours = round(shutdown_seconds / 3600, 2)
        standby_hours = round(standby_seconds / 3600, 2)
        total_seconds = running_seconds + maintenance_seconds + shutdown_seconds + standby_seconds
        availability_pct = round(
            ((running_seconds + standby_seconds) / total_seconds * 100) if total_seconds > 0 else 0, 1
        )

        return {
            "converter": _converter_to_dict(converter),
            "timeline": timeline,
            "summary": {
                "running_hours": running_hours,
                "maintenance_hours": maintenance_hours,
                "shutdown_hours": shutdown_hours,
                "standby_hours": standby_hours,
                "availability_pct": availability_pct,
            }
        }
    except SQLAlchemyError as e:
        logger.error(f"Database error fetching converter history: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch converter history.")

@router.get("/gantt/{consumer_id}")
async def get_gantt_data(consumer_id: str, db: Session = Depends(get_db)):
    try:
        converters = db.query(Converter).filter(
            Converter.consumer_id == consumer_id,
            Converter.deleted_at.is_(None)
        ).order_by(Converter.name).all()

        if not converters:
            return []

        now = datetime.now(timezone.utc)
        gantt_data = []

        for converter in converters:
            history_records = db.query(ConverterStatusHistory).filter(
                ConverterStatusHistory.converter_id == converter.id
            ).order_by(ConverterStatusHistory.changed_at.asc()).all()

            segments = []
            for record in history_records:
                changed_at = record.changed_at
                if changed_at and changed_at.tzinfo is None:
                    changed_at = changed_at.replace(tzinfo=timezone.utc)

                ended_at = record.ended_at
                if ended_at and ended_at.tzinfo is None:
                    ended_at = ended_at.replace(tzinfo=timezone.utc)

                end_time = ended_at or now
                duration_hours = round((end_time - changed_at).total_seconds() / 3600, 2) if changed_at else 0

                segments.append({
                    "status": record.new_status,
                    "start": changed_at.isoformat() if changed_at else None,
                    "end": end_time.isoformat(),
                    "duration_hours": duration_hours,
                })

            gantt_data.append({
                "converter_id": converter.id,
                "converter_name": converter.name,
                "equipment_type": getattr(converter, "equipment_type", "BOF"),
                "current_status": converter.status,
                "segments": segments,
            })

        return gantt_data

    except SQLAlchemyError as e:
        logger.error(f"Database error fetching gantt data for {consumer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch Gantt chart data.")

@router.get("/stats/{consumer_id}")
async def get_converter_stats(consumer_id: str, db: Session = Depends(get_db)):
    try:
        converters = db.query(Converter).filter(
            Converter.consumer_id == consumer_id,
            Converter.deleted_at.is_(None)
        ).all()

        total = len(converters)
        if total == 0:
            return {
                "consumer_id": consumer_id,
                "total_converters": 0,
                "active_converters": 0,
                "avg_lining_pct": 0,
                "converters_needing_relining": 0,
            }

        active_count = sum(1 for c in converters if c.status in ("Running", "Standby"))
        lining_pcts = []
        needing_relining = 0

        for c in converters:
            info = _compute_lining_info(c)
                                                         
            if info["lining_percentage"] is not None:
                lining_pcts.append(info["lining_percentage"])
                if info["lining_level"] == "critical":
                    needing_relining += 1

        avg_lining = round(sum(lining_pcts) / len(lining_pcts), 1) if lining_pcts else 0

        return {
            "consumer_id": consumer_id,
            "total_converters": total,
            "active_converters": active_count,
            "avg_lining_pct": avg_lining,
            "converters_needing_relining": needing_relining,
        }

    except SQLAlchemyError as e:
        logger.error(f"Database error fetching converter stats for {consumer_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch converter stats.")

@router.get("/admin/all")
async def get_all_converters_admin(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "trs"))
):
    try:
        converters = db.query(Converter).filter(
            Converter.deleted_at.is_(None)
        ).order_by(Converter.consumer_id, Converter.name).all()

        return [_converter_to_dict(c) for c in converters]

    except SQLAlchemyError as e:
        logger.error(f"Database error fetching all converters: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch converters.")
