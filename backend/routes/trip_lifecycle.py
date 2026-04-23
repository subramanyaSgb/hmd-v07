
from fastapi import APIRouter, Depends, HTTPException, Request
from datetime import datetime, timezone, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..database.engine import get_db
from ..database.models import (
    Trip, FleetManagement, User, Notification,
    ProducerConfig, ConsumerConfig, ShiftConfig, SystemConfig,
    Converter, WeighbridgeRecord, TripConverterDistribution
)
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.security import get_current_user_required
from ..utils.rate_limit import rate_limit_medium
from ..utils.email_service import email_service
from ..utils.whatsapp_service import whatsapp_service
from ..utils.cache import fleet_cache
from ..schemas import TripStatusUpdate, TripStatus
from ..constants import (
    WeighbridgeDefaultTimes, is_valid_transition, TRIP_STATUS_LABELS
)

router = APIRouter(prefix="/api/trips", tags=["trip-lifecycle"])

limiter = Limiter(key_func=get_remote_address)

def utc_now():
    return datetime.now(timezone.utc)

def get_system_config(db: Session, key: str, default: str) -> str:
    config = db.query(SystemConfig).filter(SystemConfig.config_key == key).first()
    return config.config_value if config else default

def get_system_config_int(db: Session, key: str, default: int) -> int:
    value = get_system_config(db, key, str(default))
    try:
        return int(value)
    except (ValueError, TypeError):
        return default

def get_current_shift(db: Session, current_time: datetime) -> Optional[str]:
    shifts = db.query(ShiftConfig).filter(ShiftConfig.is_active == True).all()
    if not shifts:
        return None

    current_hour = current_time.hour
    for shift in shifts:
                                           
        if shift.start_hour <= shift.end_hour:
                                                
            if shift.start_hour <= current_hour < shift.end_hour:
                return shift.shift_name
        else:
                                                           
            if current_hour >= shift.start_hour or current_hour < shift.end_hour:
                return shift.shift_name
    return None

def calculate_expected_times(db: Session, trip: Trip, assigned_at: datetime) -> None:
                                                                     
    EXIT_BUFFER_MINUTES = get_system_config_int(db, "EXIT_BUFFER_MINUTES", 5)
    DEFAULT_WAIT_TIME = get_system_config_int(db, "DEFAULT_WAIT_TIME", 10)
    DEFAULT_FILL_TIME = get_system_config_int(db, "DEFAULT_FILL_TIME", 30)
    DEFAULT_UNLOAD_TIME = get_system_config_int(db, "DEFAULT_UNLOAD_TIME", 20)

    TRAVEL_TO_WEIGHBRIDGE = get_system_config_int(
        db, "TRAVEL_TO_WEIGHBRIDGE_MINUTES", WeighbridgeDefaultTimes.TRAVEL_TO_WEIGHBRIDGE
    )
    WEIGHBRIDGE_PROCESS_TIME = get_system_config_int(
        db, "WEIGHBRIDGE_PROCESS_TIME_MINUTES", WeighbridgeDefaultTimes.WEIGHBRIDGE_PROCESS_TIME
    )
    TRAVEL_WB_TO_PRODUCER = get_system_config_int(
        db, "TRAVEL_WB_TO_PRODUCER_MINUTES", WeighbridgeDefaultTimes.TRAVEL_WB_TO_PRODUCER
    )
    TRAVEL_PRODUCER_TO_WB = get_system_config_int(
        db, "TRAVEL_PRODUCER_TO_WB_MINUTES", WeighbridgeDefaultTimes.TRAVEL_PRODUCER_TO_WB
    )
    TRAVEL_WB_TO_CONSUMER = get_system_config_int(
        db, "TRAVEL_WB_TO_CONSUMER_MINUTES", WeighbridgeDefaultTimes.TRAVEL_WB_TO_CONSUMER
    )

    producer_config = db.query(ProducerConfig).filter(
        ProducerConfig.producer_user_id == trip.producer_id
    ).first()

    consumer_config = db.query(ConsumerConfig).filter(
        ConsumerConfig.consumer_user_id == trip.consumer_id
    ).first()

    producer_wait_time = producer_config.estimated_wait_time if producer_config else DEFAULT_WAIT_TIME
    avg_fill_time = producer_config.avg_fill_time if producer_config else DEFAULT_FILL_TIME

    consumer_wait_time = consumer_config.estimated_wait_time if consumer_config else DEFAULT_WAIT_TIME
    avg_unload_time = consumer_config.avg_unload_time if consumer_config else DEFAULT_UNLOAD_TIME

    total_duration = (
        TRAVEL_TO_WEIGHBRIDGE +
        WEIGHBRIDGE_PROCESS_TIME +
        TRAVEL_WB_TO_PRODUCER +
        producer_wait_time +
        avg_fill_time +
        EXIT_BUFFER_MINUTES +
        TRAVEL_PRODUCER_TO_WB +
        WEIGHBRIDGE_PROCESS_TIME +
        TRAVEL_WB_TO_CONSUMER +
        consumer_wait_time +
        avg_unload_time +
        EXIT_BUFFER_MINUTES
    )
    trip.expected_duration_minutes = total_duration

    trip.expected_wb_tare_entry_at = assigned_at + timedelta(minutes=TRAVEL_TO_WEIGHBRIDGE)

    trip.expected_wb_tare_recorded_at = trip.expected_wb_tare_entry_at + timedelta(minutes=WEIGHBRIDGE_PROCESS_TIME)

    trip.expected_p_entered_at = trip.expected_wb_tare_recorded_at + timedelta(minutes=TRAVEL_WB_TO_PRODUCER)

    trip.expected_p_loading_start_at = trip.expected_p_entered_at + timedelta(minutes=producer_wait_time)

    trip.expected_p_loading_end_at = trip.expected_p_loading_start_at + timedelta(minutes=avg_fill_time)

    trip.expected_p_exited_at = trip.expected_p_loading_end_at + timedelta(minutes=EXIT_BUFFER_MINUTES)

    trip.expected_wb_gross_entry_at = trip.expected_p_exited_at + timedelta(minutes=TRAVEL_PRODUCER_TO_WB)

    trip.expected_wb_gross_recorded_at = trip.expected_wb_gross_entry_at + timedelta(minutes=WEIGHBRIDGE_PROCESS_TIME)

    trip.expected_c_entered_at = trip.expected_wb_gross_recorded_at + timedelta(minutes=TRAVEL_WB_TO_CONSUMER)

    trip.expected_c_unloading_start_at = trip.expected_c_entered_at + timedelta(minutes=consumer_wait_time)

    trip.expected_c_unloading_end_at = trip.expected_c_unloading_start_at + timedelta(minutes=avg_unload_time)

    trip.expected_c_exited_at = trip.expected_c_unloading_end_at + timedelta(minutes=EXIT_BUFFER_MINUTES)

    trip.shift = get_current_shift(db, assigned_at)

    logger.info(
        f"Calculated expected times for trip {trip.trip_id}: "
        f"total={total_duration}min, shift={trip.shift}"
    )

@router.post("/update-status")
@limiter.limit(rate_limit_medium)
async def update_trip_status(
    request: Request,
    data: TripStatusUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    trip = db.query(Trip).filter(Trip.trip_id == data.trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if current_user.role == 'producer' and trip.producer_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this trip")
    if current_user.role == 'consumer' and trip.consumer_id != current_user.user_id:
        raise HTTPException(status_code=403, detail="Not authorized to update this trip")

    producer_allowed_statuses = {4, 5, 6, 7}
    consumer_allowed_statuses = {10, 11, 12, 13}
    weighbridge_statuses = {2, 3, 8, 9}

    if current_user.role == 'producer' and data.status not in producer_allowed_statuses and data.status not in weighbridge_statuses:
        raise HTTPException(
            status_code=403,
            detail=f"Producers can only update trip status to stages 2-3 (weighbridge), 4-7 (Producer Entered through Producer Exited), or 8-9 (weighbridge). Requested status: {data.status}"
        )
    if current_user.role == 'consumer' and data.status not in consumer_allowed_statuses and data.status not in weighbridge_statuses:
        raise HTTPException(
            status_code=403,
            detail=f"Consumers can only update trip status to stages 2-3 (weighbridge), 8-9 (weighbridge), or 10-13 (Consumer Entered through Completed). Requested status: {data.status}"
        )

    if not is_valid_transition(trip.status, data.status):
        logger.warning(f"Status transition rejection: {data.trip_id} from {trip.status} -> {data.status}")
        raise HTTPException(
            status_code=400,
            detail=f"Invalid status transition from {trip.status} to {data.status}. Check valid transitions."
        )

    now = utc_now()
    trip.status = data.status
    trip.last_updated = now

    status_timestamp_map = {
        TripStatus.WB_TARE_ENTRY: 'wb_tare_entry_at',
        TripStatus.WB_TARE_RECORDED: 'wb_tare_recorded_at',
        TripStatus.PRODUCER_ENTERED: 'p_entered_at',
        TripStatus.LOADING_STARTED: 'p_loading_start_at',
        TripStatus.LOADING_ENDED: 'p_loading_end_at',
        TripStatus.PRODUCER_EXITED: 'p_exited_at',
        TripStatus.WB_GROSS_ENTRY: 'wb_gross_entry_at',
        TripStatus.WB_GROSS_RECORDED: 'wb_gross_recorded_at',
        TripStatus.CONSUMER_ENTERED: 'c_entered_at',
        TripStatus.UNLOADING_STARTED: 'c_unloading_start_at',
        TripStatus.UNLOADING_ENDED: 'c_unloading_end_at',
        TripStatus.COMPLETED: 'c_exited_at'
    }

    if data.status in status_timestamp_map:
        setattr(trip, status_timestamp_map[data.status], now)

    if data.status == TripStatus.WB_TARE_RECORDED:
        weight_kg = data.weight_kg
        if weight_kg is not None:
            trip.tare_weight_kg = weight_kg
                                      
            wb_record = WeighbridgeRecord(
                trip_id=trip.trip_id,
                torpedo_id=trip.torpedo_id,
                weighbridge_id=data.weighbridge_id,
                record_type="tare",
                weight_kg=weight_kg,
                cast_id=data.cast_id,
                furnace_id=data.furnace_id,
                recorded_by=current_user.username if hasattr(current_user, 'username') else "system",
                source="manual"
            )
            db.add(wb_record)
            logger.info(f"Tare weight {weight_kg}kg recorded for trip {trip.trip_id}")

    if data.status == TripStatus.WB_GROSS_RECORDED:
        weight_kg = data.weight_kg
        if weight_kg is not None:
            trip.gross_weight_kg = weight_kg
                                       
            if trip.tare_weight_kg is not None:
                trip.net_weight_kg = weight_kg - trip.tare_weight_kg
                logger.info(f"Net weight calculated for trip {trip.trip_id}: {trip.net_weight_kg}kg (gross={weight_kg} - tare={trip.tare_weight_kg})")
                                      
            wb_record = WeighbridgeRecord(
                trip_id=trip.trip_id,
                torpedo_id=trip.torpedo_id,
                weighbridge_id=data.weighbridge_id,
                record_type="gross",
                weight_kg=weight_kg,
                cast_id=data.cast_id,
                furnace_id=data.furnace_id,
                recorded_by=current_user.username if hasattr(current_user, 'username') else "system",
                source="manual"
            )
            db.add(wb_record)
            logger.info(f"Gross weight {weight_kg}kg recorded for trip {trip.trip_id}")

    if data.converter_distributions and data.status in {TripStatus.UNLOADING_STARTED, TripStatus.UNLOADING_ENDED, TripStatus.COMPLETED}:
                                 
        for dist in data.converter_distributions:
            conv = db.query(Converter).filter(
                Converter.id == dist.converter_id,
                Converter.consumer_id == trip.consumer_id,
                Converter.status == "Running",
                Converter.deleted_at.is_(None)
            ).first()
            if not conv:
                raise HTTPException(
                    status_code=400,
                    detail=f"Invalid converter ID {dist.converter_id}: must be a Running converter belonging to this consumer"
                )

        db.query(TripConverterDistribution).filter(
            TripConverterDistribution.trip_id == trip.trip_id
        ).delete(synchronize_session=False)

        for dist in data.converter_distributions:
            db.add(TripConverterDistribution(
                trip_id=trip.trip_id,
                converter_id=dist.converter_id,
                quantity_tons=dist.quantity_tons
            ))

        trip.converter_id = data.converter_distributions[0].converter_id
        logger.info(f"Distributed load across {len(data.converter_distributions)} converters for trip {trip.trip_id}")

    elif data.converter_id is not None and data.status in {TripStatus.UNLOADING_STARTED, TripStatus.UNLOADING_ENDED, TripStatus.COMPLETED}:
        selected_converter = db.query(Converter).filter(
            Converter.id == data.converter_id,
            Converter.consumer_id == trip.consumer_id,
            Converter.status == "Running",
            Converter.deleted_at.is_(None)
        ).first()
        if not selected_converter:
            raise HTTPException(
                status_code=400,
                detail="Invalid converter: must be a Running converter belonging to this consumer"
            )
        trip.converter_id = data.converter_id
        logger.info(f"Converter {selected_converter.name} selected for trip {trip.trip_id}")

    if data.status == TripStatus.COMPLETED:
                                                                                            
        start_time = trip.p_entered_at or trip.assigned_at or trip.created_at
        if start_time:
            cycle_duration = now - start_time
            trip.cycle_time_minutes = cycle_duration.total_seconds() / 60
            logger.info(f"Trip {data.trip_id} completed with cycle time: {trip.cycle_time_minutes} minutes from {start_time}")

        if trip.torpedo_id:
            torpedo = db.query(FleetManagement).filter(FleetManagement.fleet_id == trip.torpedo_id).first()
            if torpedo:
                torpedo.status = "Operating"
                                                                                      
                fleet_cache.invalidate("fleet_management")

    old_status = trip.status - 1 if trip.status > 0 else 0

    try:
        db.commit()
        status_names = TRIP_STATUS_LABELS
        log_activity(
            db, current_user.username, "TRIP_STATUS_UPDATED",
            details=f"Trip {data.trip_id} updated to status {data.status} ({status_names.get(data.status, 'Unknown')})",
            request=None,
            current_user=current_user,
            entity_type="trip",
            entity_id=data.trip_id,
            old_value={"status": old_status, "status_name": status_names.get(old_status, 'Unknown')},
            new_value={"status": data.status, "status_name": status_names.get(data.status, 'Unknown'), "torpedo_id": trip.torpedo_id}
        )

        if data.status == TripStatus.LOADING_STARTED:
            try:
                await whatsapp_service.send_trip_notification(
                    trip=trip,
                    notification_type="trip_started",
                    db=db
                )
            except Exception as e:
                logger.warning(f"Failed to send WhatsApp notification for trip started {trip.trip_id}: {e}")

        if data.status == TripStatus.COMPLETED:
            log_activity(
                db, current_user.username, "TRIP_COMPLETED",
                details=f"Trip {data.trip_id} completed with cycle time: {trip.cycle_time_minutes:.1f} minutes",
                current_user=current_user,
                entity_type="trip",
                entity_id=data.trip_id,
                new_value={"cycle_time_minutes": round(trip.cycle_time_minutes, 1) if trip.cycle_time_minutes else None}
            )
                                                                   
            admin_users = db.query(User).filter(User.role.in_(('admin', 'trs')), User.deleted_at.is_(None)).all()
            cycle_time_str = f"{trip.cycle_time_minutes:.1f}" if trip.cycle_time_minutes else "N/A"
            net_weight_str = f", Net weight: {trip.net_weight_kg:.1f}kg" if trip.net_weight_kg else ""
            completion_message = f"Trip {data.trip_id} completed by {current_user.username}. Route: {trip.producer_id} → {trip.consumer_id}. Cycle time: {cycle_time_str} min{net_weight_str}."

            for admin in admin_users:
                notification = Notification(
                    recipient_id=admin.user_id,
                    sender=current_user.username,
                    message=completion_message,
                    is_read=False
                )
                db.add(notification)

                if admin.email:
                    try:
                        email_service.send_notification_email(
                            to_email=admin.email,
                            username=admin.username,
                            sender=current_user.username,
                            message=completion_message
                        )
                        logger.info(f"Trip completion email sent to {admin.username}")
                    except Exception as e:
                        logger.warning(f"Failed to send trip completion email to {admin.email}: {e}")

            distributions = db.query(TripConverterDistribution).filter(
                TripConverterDistribution.trip_id == trip.trip_id
            ).all()

            if distributions:
                                                                                               
                for dist in distributions:
                    conv = db.query(Converter).filter(
                        Converter.id == dist.converter_id,
                        Converter.deleted_at.is_(None)
                    ).first()
                    if conv and conv.equipment_type not in ("ZPF", "EAF"):
                        conv.current_heats += 1
                        logger.info(f"Incremented heat count for {conv.name} ({trip.consumer_id}): {conv.current_heats}/{conv.max_heats} [distributed {dist.quantity_tons}T]")

                        if conv.max_heats > 0:
                            pct = conv.current_heats / conv.max_heats * 100
                            if pct >= 95:
                                for admin in admin_users:
                                    db.add(Notification(
                                        recipient_id=admin.user_id,
                                        sender="System",
                                        message=f"RELINING OVERDUE: {conv.name} ({trip.consumer_id}) at {conv.current_heats}/{conv.max_heats} heats ({pct:.0f}%)",
                                        is_read=False
                                    ))
                            elif pct >= 85:
                                for admin in admin_users:
                                    db.add(Notification(
                                        recipient_id=admin.user_id,
                                        sender="System",
                                        message=f"Relining needed soon: {conv.name} ({trip.consumer_id}) at {conv.current_heats}/{conv.max_heats} heats ({pct:.0f}%)",
                                        is_read=False
                                    ))
                    elif conv:
                        logger.info(f"Skipping heat increment for {conv.equipment_type} equipment {conv.name} (trip {trip.trip_id})")
            else:
                                                                   
                running_converter = None
                is_sms3_equipment = False

                if trip.converter_id:
                    running_converter = db.query(Converter).filter(
                        Converter.id == trip.converter_id,
                        Converter.deleted_at.is_(None)
                    ).first()
                    if running_converter:
                        is_sms3_equipment = running_converter.equipment_type in ("ZPF", "EAF")
                else:
                    running_converter = db.query(Converter).filter(
                        Converter.consumer_id == trip.consumer_id,
                        Converter.status == "Running",
                        Converter.deleted_at.is_(None)
                    ).order_by(Converter.current_heats.asc()).first()
                    if running_converter:
                        is_sms3_equipment = running_converter.equipment_type in ("ZPF", "EAF")
                        if is_sms3_equipment:
                            trip.equipment_id = running_converter.id
                            logger.info(f"Auto-assigned {running_converter.equipment_type} equipment {running_converter.name} to trip {trip.trip_id}")
                        else:
                            trip.converter_id = running_converter.id
                            logger.info(f"Auto-assigned converter {running_converter.name} to trip {trip.trip_id}")

                if running_converter:
                    if not is_sms3_equipment:
                        running_converter.current_heats += 1
                        logger.info(f"Incremented heat count for {running_converter.name} ({trip.consumer_id}): {running_converter.current_heats}/{running_converter.max_heats}")

                        if running_converter.max_heats > 0:
                            pct = running_converter.current_heats / running_converter.max_heats * 100
                            if pct >= 95:
                                for admin in admin_users:
                                    db.add(Notification(
                                        recipient_id=admin.user_id,
                                        sender="System",
                                        message=f"RELINING OVERDUE: {running_converter.name} ({trip.consumer_id}) at {running_converter.current_heats}/{running_converter.max_heats} heats ({pct:.0f}%)",
                                        is_read=False
                                    ))
                            elif pct >= 85:
                                for admin in admin_users:
                                    db.add(Notification(
                                        recipient_id=admin.user_id,
                                        sender="System",
                                        message=f"Relining needed soon: {running_converter.name} ({trip.consumer_id}) at {running_converter.current_heats}/{running_converter.max_heats} heats ({pct:.0f}%)",
                                        is_read=False
                                    ))
                    else:
                        logger.info(f"Skipping heat increment for {running_converter.equipment_type} equipment {running_converter.name} (trip {trip.trip_id})")

            try:
                await whatsapp_service.send_trip_notification(
                    trip=trip,
                    notification_type="trip_completed",
                    db=db
                )
            except Exception as e:
                logger.warning(f"Failed to send WhatsApp notification for trip completion {trip.trip_id}: {e}")

            db.commit()

        return {"status": "success", "trip_status": trip.status, "trip_id": trip.trip_id}
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error updating trip status: {e}")
        raise HTTPException(status_code=500, detail="Failed to update trip status")
