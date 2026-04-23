
from fastapi import APIRouter, Depends, Query
from datetime import datetime, timezone, timedelta
from typing import Optional, List
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_

from ..database.engine import get_db
from ..database.models import (
    Trip, User, DeviationThresholdConfig, TripTimeConfig,
    ProducerConfig, ConsumerConfig, ShiftConfig
)
from ..schemas import (
    LiveOperationsResponse, LiveTripStatus, LiveOperationsSummary,
    PhaseDeviation, DeviationThresholdConfigSchema, DeviationThresholdResponse,
    ConsumerIncomingResponse, IncomingTorpedo
)
from ..utils.security import get_current_user_required, require_roles
from ..logger import logger
from ..constants import TripStatus as TripStatusEnum, TRIP_STATUS_LABELS

router = APIRouter(prefix="/api/live-ops", tags=["live-operations"])

def get_hm_matrix_time(db: Session, producer_id: str, consumer_id: str) -> dict:
    producer_config = db.query(ProducerConfig).filter(
        ProducerConfig.producer_user_id == producer_id
    ).first()

    consumer_config = db.query(ConsumerConfig).filter(
        ConsumerConfig.consumer_user_id == consumer_id
    ).first()

    trip_time = db.query(TripTimeConfig).filter(
        TripTimeConfig.source_user_id == producer_id,
        TripTimeConfig.destination_user_id == consumer_id
    ).first()

    producer_wait = producer_config.estimated_wait_time if producer_config else 0
    producer_fill = producer_config.avg_fill_time if producer_config else 0
    producer_time = producer_wait + producer_fill

    consumer_wait = consumer_config.estimated_wait_time if consumer_config else 0
    consumer_unload = consumer_config.avg_unload_time if consumer_config else 0
    consumer_time = consumer_wait + consumer_unload

    travel_time = trip_time.travel_time if trip_time else 0

    return {
        "producer_wait": producer_wait,
        "producer_fill": producer_fill,
        "producer_time": producer_time,
        "travel_time": travel_time,
        "consumer_wait": consumer_wait,
        "consumer_unload": consumer_unload,
        "consumer_time": consumer_time,
        "total_time": producer_time + travel_time + consumer_time
    }

def get_or_create_thresholds(db: Session) -> DeviationThresholdConfig:
    config = db.query(DeviationThresholdConfig).first()
    if not config:
        config = DeviationThresholdConfig(
            warning_threshold_minutes=10,
            alert_threshold_minutes=20,
            critical_threshold_minutes=30,
            auto_refresh_interval_seconds=5
        )
        db.add(config)
        db.commit()
        db.refresh(config)
    return config

def calculate_deviation_status(deviation_minutes: float, thresholds: DeviationThresholdConfig) -> str:
    if deviation_minutes < 0:
        return "early"
    if deviation_minutes >= thresholds.critical_threshold_minutes:
        return "critical"
    elif deviation_minutes >= thresholds.alert_threshold_minutes:
        return "alert"
    elif deviation_minutes >= thresholds.warning_threshold_minutes:
        return "warning"
    return "on_track"

def get_current_phase(trip: Trip) -> str:
    status_phase_map = {
        TripStatusEnum.PENDING: "pending",
        TripStatusEnum.ASSIGNED: "assigned",
        TripStatusEnum.WB_TARE_ENTRY: "weighbridge_tare",
        TripStatusEnum.WB_TARE_RECORDED: "weighbridge_tare",
        TripStatusEnum.PRODUCER_ENTERED: "at_producer",
        TripStatusEnum.LOADING_STARTED: "loading",
        TripStatusEnum.LOADING_ENDED: "loading_complete",
        TripStatusEnum.PRODUCER_EXITED: "in_transit",
        TripStatusEnum.WB_GROSS_ENTRY: "weighbridge_gross",
        TripStatusEnum.WB_GROSS_RECORDED: "weighbridge_gross",
        TripStatusEnum.CONSUMER_ENTERED: "at_consumer",
        TripStatusEnum.UNLOADING_STARTED: "unloading",
        TripStatusEnum.UNLOADING_ENDED: "unloading_complete",
        TripStatusEnum.COMPLETED: "completed",
    }
    return status_phase_map.get(trip.status, "unknown")

def get_status_label(status: int) -> str:
    return TRIP_STATUS_LABELS.get(status, "Unknown")

def get_current_shift(db: Session) -> Optional[str]:
    now = datetime.now()
    current_hour = now.hour

    shifts = db.query(ShiftConfig).filter(ShiftConfig.is_active == True).all()

    for shift in shifts:
        if shift.start_hour <= shift.end_hour:
                                     
            if shift.start_hour <= current_hour < shift.end_hour:
                return shift.shift_name.lower()
        else:
                                        
            if current_hour >= shift.start_hour or current_hour < shift.end_hour:
                return shift.shift_name.lower()

    if 6 <= current_hour < 14:
        return "day"
    elif 14 <= current_hour < 22:
        return "afternoon"
    else:
        return "night"

def calculate_phase_deviations(
    trip: Trip,
    thresholds: DeviationThresholdConfig,
    now: datetime
) -> List[PhaseDeviation]:
    phases = []

    if trip.expected_wb_tare_recorded_at and trip.assigned_at:
        wb_tare_expected = (trip.expected_wb_tare_recorded_at - trip.assigned_at).total_seconds() / 60
        wb_tare_actual = None
        wb_tare_deviation = None
        wb_tare_status = "pending"

        if trip.wb_tare_recorded_at:
                       
            wb_tare_actual = (trip.wb_tare_recorded_at - trip.assigned_at).total_seconds() / 60
            wb_tare_deviation = wb_tare_actual - wb_tare_expected
            wb_tare_status = "completed" if wb_tare_deviation <= 0 else calculate_deviation_status(wb_tare_deviation, thresholds)
        elif trip.status >= TripStatusEnum.ASSIGNED and trip.status <= TripStatusEnum.WB_TARE_RECORDED and trip.assigned_at:
                         
            wb_tare_actual = (now - trip.assigned_at).total_seconds() / 60
            if wb_tare_actual > wb_tare_expected:
                wb_tare_deviation = wb_tare_actual - wb_tare_expected
                wb_tare_status = calculate_deviation_status(wb_tare_deviation, thresholds)
            else:
                wb_tare_status = "on_track"

        phases.append(PhaseDeviation(
            phase_name="weighbridge_tare",
            phase_code=TripStatusEnum.WB_TARE_RECORDED,
            expected_duration_minutes=round(wb_tare_expected, 1),
            actual_duration_minutes=round(wb_tare_actual, 1) if wb_tare_actual else None,
            deviation_minutes=round(wb_tare_deviation, 1) if wb_tare_deviation else None,
            status=wb_tare_status,
            expected_timestamp=trip.expected_wb_tare_recorded_at,
            actual_timestamp=trip.wb_tare_recorded_at
        ))

    if trip.expected_p_loading_end_at:
                                                                   
        loading_start_expected = trip.expected_p_entered_at or trip.expected_wb_tare_recorded_at
        loading_expected = None
        loading_actual = None
        loading_deviation = None
        loading_status = "pending"

        if loading_start_expected and trip.expected_p_loading_end_at:
            loading_expected = (trip.expected_p_loading_end_at - loading_start_expected).total_seconds() / 60

        if trip.p_loading_end_at:
                       
            loading_start_actual = trip.p_entered_at or trip.wb_tare_recorded_at
            if loading_start_actual:
                loading_actual = (trip.p_loading_end_at - loading_start_actual).total_seconds() / 60
            if loading_expected and loading_actual:
                loading_deviation = loading_actual - loading_expected
            loading_status = "completed"
        elif trip.status >= TripStatusEnum.PRODUCER_ENTERED and trip.status <= TripStatusEnum.LOADING_ENDED:
                         
            loading_start_actual = trip.p_entered_at
            if loading_start_actual:
                loading_actual = (now - loading_start_actual).total_seconds() / 60
                if loading_expected and loading_actual > loading_expected:
                    loading_deviation = loading_actual - loading_expected
                    loading_status = calculate_deviation_status(loading_deviation, thresholds)
                else:
                    loading_status = "on_track"

        phases.append(PhaseDeviation(
            phase_name="loading",
            phase_code=TripStatusEnum.LOADING_ENDED,
            expected_duration_minutes=round(loading_expected, 1) if loading_expected else None,
            actual_duration_minutes=round(loading_actual, 1) if loading_actual else None,
            deviation_minutes=round(loading_deviation, 1) if loading_deviation else None,
            status=loading_status,
            expected_timestamp=trip.expected_p_loading_end_at,
            actual_timestamp=trip.p_loading_end_at
        ))

    if trip.expected_wb_gross_recorded_at and trip.expected_p_exited_at:
        wb_gross_expected = (trip.expected_wb_gross_recorded_at - trip.expected_p_exited_at).total_seconds() / 60
        wb_gross_actual = None
        wb_gross_deviation = None
        wb_gross_status = "pending"

        if trip.wb_gross_recorded_at and trip.p_exited_at:
                       
            wb_gross_actual = (trip.wb_gross_recorded_at - trip.p_exited_at).total_seconds() / 60
            wb_gross_deviation = wb_gross_actual - wb_gross_expected
            wb_gross_status = "completed" if wb_gross_deviation <= 0 else calculate_deviation_status(wb_gross_deviation, thresholds)
        elif trip.status >= TripStatusEnum.PRODUCER_EXITED and trip.status <= TripStatusEnum.WB_GROSS_RECORDED and trip.p_exited_at:
                         
            wb_gross_actual = (now - trip.p_exited_at).total_seconds() / 60
            if wb_gross_actual > wb_gross_expected:
                wb_gross_deviation = wb_gross_actual - wb_gross_expected
                wb_gross_status = calculate_deviation_status(wb_gross_deviation, thresholds)
            else:
                wb_gross_status = "on_track"

        phases.append(PhaseDeviation(
            phase_name="weighbridge_gross",
            phase_code=TripStatusEnum.WB_GROSS_RECORDED,
            expected_duration_minutes=round(wb_gross_expected, 1),
            actual_duration_minutes=round(wb_gross_actual, 1) if wb_gross_actual else None,
            deviation_minutes=round(wb_gross_deviation, 1) if wb_gross_deviation else None,
            status=wb_gross_status,
            expected_timestamp=trip.expected_wb_gross_recorded_at,
            actual_timestamp=trip.wb_gross_recorded_at
        ))

    if trip.expected_c_entered_at and trip.expected_wb_gross_recorded_at:
        transit_expected = (trip.expected_c_entered_at - trip.expected_wb_gross_recorded_at).total_seconds() / 60
        transit_actual = None
        transit_deviation = None
        transit_status = "pending"

        if trip.c_entered_at and trip.wb_gross_recorded_at:
                       
            transit_actual = (trip.c_entered_at - trip.wb_gross_recorded_at).total_seconds() / 60
            transit_deviation = transit_actual - transit_expected
            transit_status = "completed" if transit_deviation <= 0 else calculate_deviation_status(transit_deviation, thresholds)
        elif trip.status >= TripStatusEnum.WB_GROSS_RECORDED and trip.status < TripStatusEnum.CONSUMER_ENTERED:
                                                                            
            start_at = trip.wb_gross_recorded_at or trip.p_exited_at
            if start_at:
                transit_actual = (now - start_at).total_seconds() / 60
                if transit_actual > transit_expected:
                    transit_deviation = transit_actual - transit_expected
                    transit_status = calculate_deviation_status(transit_deviation, thresholds)
                else:
                    transit_status = "on_track"

        phases.append(PhaseDeviation(
            phase_name="transit",
            phase_code=TripStatusEnum.CONSUMER_ENTERED,
            expected_duration_minutes=round(transit_expected, 1),
            actual_duration_minutes=round(transit_actual, 1) if transit_actual else None,
            deviation_minutes=round(transit_deviation, 1) if transit_deviation else None,
            status=transit_status,
            expected_timestamp=trip.expected_c_entered_at,
            actual_timestamp=trip.c_entered_at
        ))
    elif trip.expected_c_entered_at and trip.expected_p_exited_at:
                                                                        
        transit_expected = (trip.expected_c_entered_at - trip.expected_p_exited_at).total_seconds() / 60
        transit_actual = None
        transit_deviation = None
        transit_status = "pending"

        if trip.c_entered_at and trip.p_exited_at:
            transit_actual = (trip.c_entered_at - trip.p_exited_at).total_seconds() / 60
            transit_deviation = transit_actual - transit_expected
            transit_status = "completed" if transit_deviation <= 0 else calculate_deviation_status(transit_deviation, thresholds)
        elif trip.status >= TripStatusEnum.PRODUCER_EXITED and trip.p_exited_at:
            transit_actual = (now - trip.p_exited_at).total_seconds() / 60
            if transit_actual > transit_expected:
                transit_deviation = transit_actual - transit_expected
                transit_status = calculate_deviation_status(transit_deviation, thresholds)
            else:
                transit_status = "on_track"

        phases.append(PhaseDeviation(
            phase_name="transit",
            phase_code=TripStatusEnum.CONSUMER_ENTERED,
            expected_duration_minutes=round(transit_expected, 1),
            actual_duration_minutes=round(transit_actual, 1) if transit_actual else None,
            deviation_minutes=round(transit_deviation, 1) if transit_deviation else None,
            status=transit_status,
            expected_timestamp=trip.expected_c_entered_at,
            actual_timestamp=trip.c_entered_at
        ))

    if trip.expected_c_unloading_end_at and trip.expected_c_entered_at:
        unload_expected = (trip.expected_c_unloading_end_at - trip.expected_c_entered_at).total_seconds() / 60
        unload_actual = None
        unload_deviation = None
        unload_status = "pending"

        if trip.c_unloading_end_at and trip.c_entered_at:
                       
            unload_actual = (trip.c_unloading_end_at - trip.c_entered_at).total_seconds() / 60
            unload_deviation = unload_actual - unload_expected
            unload_status = "completed" if unload_deviation <= 0 else calculate_deviation_status(unload_deviation, thresholds)
        elif trip.status >= TripStatusEnum.CONSUMER_ENTERED and trip.status <= TripStatusEnum.UNLOADING_ENDED and trip.c_entered_at:
                         
            unload_actual = (now - trip.c_entered_at).total_seconds() / 60
            if unload_actual > unload_expected:
                unload_deviation = unload_actual - unload_expected
                unload_status = calculate_deviation_status(unload_deviation, thresholds)
            else:
                unload_status = "on_track"

        phases.append(PhaseDeviation(
            phase_name="unloading",
            phase_code=TripStatusEnum.UNLOADING_ENDED,
            expected_duration_minutes=round(unload_expected, 1),
            actual_duration_minutes=round(unload_actual, 1) if unload_actual else None,
            deviation_minutes=round(unload_deviation, 1) if unload_deviation else None,
            status=unload_status,
            expected_timestamp=trip.expected_c_unloading_end_at,
            actual_timestamp=trip.c_unloading_end_at
        ))

    return phases

def calculate_dynamic_eta(trip: Trip, now: datetime) -> Optional[datetime]:
    if not trip.assigned_at or not trip.expected_c_exited_at:
        return None

    if trip.status >= TripStatusEnum.COMPLETED or trip.status < TripStatusEnum.ASSIGNED:
        return trip.expected_c_exited_at

    deviation_so_far = 0

    if trip.status >= TripStatusEnum.WB_TARE_RECORDED and trip.wb_tare_recorded_at and trip.expected_wb_tare_recorded_at:
                                                   
        deviation_so_far = (trip.wb_tare_recorded_at - trip.expected_wb_tare_recorded_at).total_seconds() / 60

    if trip.status >= TripStatusEnum.LOADING_ENDED and trip.p_loading_end_at and trip.expected_p_loading_end_at:
                                                                        
        deviation_so_far = (trip.p_loading_end_at - trip.expected_p_loading_end_at).total_seconds() / 60

    if trip.status >= TripStatusEnum.WB_GROSS_RECORDED and trip.wb_gross_recorded_at and trip.expected_wb_gross_recorded_at:
                                                                                  
        deviation_so_far = (trip.wb_gross_recorded_at - trip.expected_wb_gross_recorded_at).total_seconds() / 60

    if trip.status >= TripStatusEnum.CONSUMER_ENTERED and trip.c_entered_at and trip.expected_c_entered_at:
                                                                         
        deviation_so_far = (trip.c_entered_at - trip.expected_c_entered_at).total_seconds() / 60

    if deviation_so_far != 0:
        return trip.expected_c_exited_at + timedelta(minutes=deviation_so_far)

    return trip.expected_c_exited_at

@router.get("/trips", response_model=LiveOperationsResponse)
async def get_live_trip_status(
    producer_id: Optional[str] = None,
    consumer_id: Optional[str] = None,
    deviation_status: Optional[str] = Query(None, pattern="^(on_track|early|warning|alert|critical|completed)$"),
    include_completed: bool = Query(True, description="Include completed trips from today"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    now = datetime.now(timezone.utc)
    thresholds = get_or_create_thresholds(db)

    today_start = now.replace(hour=0, minute=0, second=0, microsecond=0)

    if include_completed:
        query = db.query(Trip).filter(
            or_(
                and_(Trip.status >= TripStatusEnum.ASSIGNED, Trip.status <= TripStatusEnum.UNLOADING_ENDED),                
                and_(Trip.status == TripStatusEnum.COMPLETED, Trip.c_exited_at >= today_start)                   
            )
        )
    else:
        query = db.query(Trip).filter(
            Trip.status >= TripStatusEnum.ASSIGNED,
            Trip.status <= TripStatusEnum.UNLOADING_ENDED
        )

    if current_user.role == 'producer':
        query = query.filter(Trip.producer_id == current_user.user_id)
    elif current_user.role == 'consumer':
        query = query.filter(Trip.consumer_id == current_user.user_id)
    else:
                       
        if producer_id:
            query = query.filter(Trip.producer_id == producer_id)
        if consumer_id:
            query = query.filter(Trip.consumer_id == consumer_id)

    trips = query.order_by(Trip.assigned_at.desc()).all()

    active_trips = []                              
    completed_trips_list = []                               
    summary = LiveOperationsSummary()

    total_deviation = 0

    for trip in trips:
        if not trip.assigned_at:
            continue

        is_completed = TripStatusEnum.is_completed(trip.status)

        if is_completed and trip.c_exited_at:
            elapsed = (trip.c_exited_at - trip.assigned_at).total_seconds() / 60
        else:
            elapsed = (now - trip.assigned_at).total_seconds() / 60

        deviation = 0
        if is_completed:
                                                                  
            if trip.cycle_time_minutes and trip.expected_duration_minutes:
                deviation = trip.cycle_time_minutes - trip.expected_duration_minutes
            elif trip.c_exited_at and trip.expected_c_exited_at:
                deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
        else:
                              
            if trip.expected_c_exited_at:
                if now > trip.expected_c_exited_at:
                    deviation = (now - trip.expected_c_exited_at).total_seconds() / 60
            elif trip.expected_duration_minutes:
                if elapsed > trip.expected_duration_minutes:
                    deviation = elapsed - trip.expected_duration_minutes

        if is_completed:
            status = "completed"                                      
        else:
            status = calculate_deviation_status(deviation, thresholds)

        if deviation_status:
            if deviation_status == "completed" and not is_completed:
                continue
            elif deviation_status != "completed" and (is_completed or status != deviation_status):
                continue

        phase_deviations = calculate_phase_deviations(trip, thresholds, now)

        remaining = None
        if not is_completed and trip.expected_duration_minutes:
            remaining = max(0, trip.expected_duration_minutes - elapsed)

        dynamic_eta = calculate_dynamic_eta(trip, now)

        live_trip = LiveTripStatus(
            trip_id=trip.trip_id,
            producer_id=trip.producer_id,
            consumer_id=trip.consumer_id,
            torpedo_id=trip.torpedo_id,
            status=trip.status,
            status_label=get_status_label(trip.status),
            current_phase=get_current_phase(trip),
            assigned_at=trip.assigned_at,
            expected_duration_minutes=trip.expected_duration_minutes,
            expected_completion_at=trip.expected_c_exited_at,
            elapsed_minutes=round(elapsed, 1),
            remaining_minutes=round(remaining, 1) if remaining is not None else None,
            total_deviation_minutes=round(deviation, 1),
            deviation_status=status,
            phase_deviations=phase_deviations,
                                         
            wb_tare_entry_at=trip.wb_tare_entry_at,
            wb_tare_recorded_at=trip.wb_tare_recorded_at,
            expected_wb_tare_entry_at=trip.expected_wb_tare_entry_at,
            expected_wb_tare_recorded_at=trip.expected_wb_tare_recorded_at,
                                 
            p_entered_at=trip.p_entered_at,
            p_loading_start_at=trip.p_loading_start_at,
            p_loading_end_at=trip.p_loading_end_at,
            p_exited_at=trip.p_exited_at,
            expected_p_entered_at=trip.expected_p_entered_at,
            expected_p_loading_start_at=trip.expected_p_loading_start_at,
            expected_p_loading_end_at=trip.expected_p_loading_end_at,
            expected_p_exited_at=trip.expected_p_exited_at,
                                          
            wb_gross_entry_at=trip.wb_gross_entry_at,
            wb_gross_recorded_at=trip.wb_gross_recorded_at,
            expected_wb_gross_entry_at=trip.expected_wb_gross_entry_at,
            expected_wb_gross_recorded_at=trip.expected_wb_gross_recorded_at,
                                 
            c_entered_at=trip.c_entered_at,
            c_unloading_start_at=trip.c_unloading_start_at,
            c_unloading_end_at=trip.c_unloading_end_at,
            c_exited_at=trip.c_exited_at,
            expected_c_entered_at=trip.expected_c_entered_at,
            expected_c_unloading_start_at=trip.expected_c_unloading_start_at,
            expected_c_unloading_end_at=trip.expected_c_unloading_end_at,
            expected_c_exited_at=trip.expected_c_exited_at,
                                     
            tare_weight_kg=trip.tare_weight_kg,
            gross_weight_kg=trip.gross_weight_kg,
            net_weight_kg=trip.net_weight_kg,
                              
            dynamic_eta=dynamic_eta,
            shift=trip.shift,
            is_completed=is_completed,
            completed_at=trip.c_exited_at if is_completed else None,
            actual_duration_minutes=trip.cycle_time_minutes if is_completed else None
        )

        if is_completed:
            completed_trips_list.append(live_trip)
            summary.completed += 1
        else:
            active_trips.append(live_trip)
                                                  
            summary.total_active += 1
            if status == "on_track":
                summary.on_track += 1
            elif status == "early":
                summary.early += 1
            elif status == "warning":
                summary.warning += 1
            elif status == "alert":
                summary.alert += 1
            elif status == "critical":
                summary.critical += 1

            total_deviation += max(0, deviation)

    if summary.total_active > 0:
        summary.avg_deviation_minutes = round(total_deviation / summary.total_active, 1)
        summary.on_track_percentage = round(
            ((summary.on_track + summary.early) / summary.total_active) * 100, 1
        )

    active_trips.sort(key=lambda x: x.total_deviation_minutes, reverse=True)
    completed_trips_list.sort(key=lambda x: x.completed_at if x.completed_at else datetime.min, reverse=True)

    live_trips = active_trips + completed_trips_list

    return LiveOperationsResponse(
        trips=live_trips,
        summary=summary,
        thresholds=DeviationThresholdConfigSchema(
            warning_threshold_minutes=thresholds.warning_threshold_minutes,
            alert_threshold_minutes=thresholds.alert_threshold_minutes,
            critical_threshold_minutes=thresholds.critical_threshold_minutes,
            auto_refresh_interval_seconds=thresholds.auto_refresh_interval_seconds
        ),
        last_updated=now
    )

@router.get("/thresholds", response_model=DeviationThresholdResponse)
async def get_deviation_thresholds(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    return get_or_create_thresholds(db)

@router.post("/thresholds", response_model=DeviationThresholdResponse)
async def update_deviation_thresholds(
    config: DeviationThresholdConfigSchema,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "trs"))
):
    existing = get_or_create_thresholds(db)
    existing.warning_threshold_minutes = config.warning_threshold_minutes
    existing.alert_threshold_minutes = config.alert_threshold_minutes
    existing.critical_threshold_minutes = config.critical_threshold_minutes
    existing.auto_refresh_interval_seconds = config.auto_refresh_interval_seconds

    db.commit()
    db.refresh(existing)

    logger.info(f"Deviation thresholds updated by {current_user.username}")
    return existing




@router.get("/incoming/{consumer_id}", response_model=ConsumerIncomingResponse)
async def get_incoming_torpedoes(
    consumer_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    now = datetime.now(timezone.utc)

    in_transit_statuses = [
        TripStatusEnum.PRODUCER_EXITED,
        TripStatusEnum.WB_GROSS_ENTRY,
        TripStatusEnum.WB_GROSS_RECORDED,
        TripStatusEnum.CONSUMER_ENTERED,
    ]
    trips = db.query(Trip).filter(
        Trip.consumer_id == consumer_id,
        Trip.status.in_(in_transit_statuses)
    ).order_by(Trip.expected_c_entered_at.asc()).all()

    incoming = []
    for trip in trips:
        eta_minutes = None
        is_delayed = False
        delay_minutes = None
        dynamic_arrival_at = None

        if trip.status >= TripStatusEnum.PRODUCER_EXITED and trip.status <= TripStatusEnum.WB_GROSS_RECORDED and trip.p_exited_at:
                                                                          
            travel_config = db.query(TripTimeConfig).filter(
                TripTimeConfig.source_user_id == trip.producer_id,
                TripTimeConfig.destination_user_id == trip.consumer_id
            ).first()
            travel_time = travel_config.travel_time if travel_config else 25                  

            dynamic_arrival_at = trip.p_exited_at + timedelta(minutes=travel_time)

            if now < dynamic_arrival_at:
                eta_minutes = (dynamic_arrival_at - now).total_seconds() / 60
            else:
                                                                       
                eta_minutes = 0
                is_delayed = True
                delay_minutes = (now - dynamic_arrival_at).total_seconds() / 60

        elif trip.status == TripStatusEnum.CONSUMER_ENTERED:
                                 
            eta_minutes = 0
            dynamic_arrival_at = trip.c_entered_at

        incoming.append(IncomingTorpedo(
            trip_id=trip.trip_id,
            torpedo_id=trip.torpedo_id,
            producer_id=trip.producer_id,
            current_status=trip.status,
            status_label=get_status_label(trip.status),
            departed_at=trip.p_exited_at,
            expected_arrival_at=dynamic_arrival_at or trip.expected_c_entered_at,
            eta_minutes=round(eta_minutes, 1) if eta_minutes is not None else None,
            is_delayed=is_delayed,
            delay_minutes=round(delay_minutes, 1) if delay_minutes else None
        ))

    next_arrival = None
    for inc in incoming:
        if inc.eta_minutes is not None and inc.eta_minutes > 0:
            if next_arrival is None or inc.eta_minutes < next_arrival:
                next_arrival = inc.eta_minutes

    return ConsumerIncomingResponse(
        consumer_id=consumer_id,
        incoming_torpedoes=incoming,
        total_incoming=len(incoming),
        next_arrival_minutes=next_arrival,
        last_updated=now
    )




@router.get("/executive-dashboard")
async def get_executive_dashboard(
    period: str = Query("week", pattern="^(today|week|month|all)$"),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    from ..database.models import FleetManagement

    now = datetime.now(timezone.utc)
    today = now.date()

    if period == "today":
        start_date = today
    elif period == "week":
        start_date = today - timedelta(days=7)
    elif period == "month":
        start_date = today - timedelta(days=30)
    else:       
        start_date = today - timedelta(days=365)

    thresholds = db.query(DeviationThresholdConfig).first()
    if not thresholds:
        thresholds = DeviationThresholdConfig()

    trips_query = db.query(Trip).filter(
        Trip.created_at >= datetime.combine(start_date, datetime.min.time())
    )

    if current_user.role == 'producer':
        trips_query = trips_query.filter(Trip.producer_id == current_user.user_id)
    elif current_user.role == 'consumer':
        trips_query = trips_query.filter(Trip.consumer_id == current_user.user_id)

    all_trips = trips_query.all()

    completed_trips = [t for t in all_trips if TripStatusEnum.is_completed(t.status)]
    active_trips = [t for t in all_trips if TripStatusEnum.is_active(t.status) and t.status > 0]

    on_time_count = 0
    early_count = 0
    delayed_count = 0
    total_deviation = 0
    total_cycle_time = 0
    cycle_time_count = 0
    total_expected_cycle = 0

    for trip in completed_trips:
        if trip.cycle_time_minutes:
            total_cycle_time += trip.cycle_time_minutes
            cycle_time_count += 1

        if trip.expected_duration_minutes:
            total_expected_cycle += trip.expected_duration_minutes

        deviation = None
        if trip.c_exited_at and trip.expected_c_exited_at:
            deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60

        if deviation is not None:
            total_deviation += deviation
            if deviation < 0:
                early_count += 1
            elif deviation <= thresholds.warning_threshold_minutes:
                on_time_count += 1
            else:
                delayed_count += 1

    avg_cycle_time = round(total_cycle_time / cycle_time_count, 1) if cycle_time_count > 0 else 0
    avg_expected_cycle = round(total_expected_cycle / len(completed_trips), 1) if completed_trips else 0
    avg_deviation = round(total_deviation / len(completed_trips), 1) if completed_trips else 0
    on_time_rate = round(((on_time_count + early_count) / len(completed_trips)) * 100, 1) if completed_trips else 0

    total_torpedoes = db.query(FleetManagement).filter(
        FleetManagement.type == 'torpedo',
        FleetManagement.deleted_at.is_(None)
    ).count()

    active_trip_torpedoes = db.query(Trip).filter(
        Trip.torpedo_id.isnot(None),
        Trip.status >= TripStatusEnum.ASSIGNED,
        Trip.status <= TripStatusEnum.UNLOADING_ENDED,
        Trip.deleted_at.is_(None)
    ).all()
    assigned_torpedo_ids = {t.torpedo_id for t in active_trip_torpedoes}
    assigned_torpedoes = len(assigned_torpedo_ids)

    maintenance_torpedoes = db.query(FleetManagement).filter(
        FleetManagement.type == 'torpedo',
        FleetManagement.status == 'Maintenance',
        FleetManagement.deleted_at.is_(None)
    ).count()
    fleet_utilization = round((assigned_torpedoes / total_torpedoes) * 100, 1) if total_torpedoes > 0 else 0

    avg_capacity = 150           
    active_torps = db.query(FleetManagement).filter(
        FleetManagement.type == 'torpedo',
        FleetManagement.status.in_(['Operating', 'Assigned'])
    ).all()
    if active_torps:
        avg_capacity = sum(t.capacity or 150 for t in active_torps) / len(active_torps)

    total_mt_delivered = round(len(completed_trips) * avg_capacity, 1)

    kpi_summary = {
        "total_trips": len(all_trips),
        "completed_trips": len(completed_trips),
        "active_trips": len(active_trips),
        "on_time_count": on_time_count,
        "early_count": early_count,
        "delayed_count": delayed_count,
        "on_time_rate": on_time_rate,
        "avg_cycle_time_minutes": avg_cycle_time,
        "avg_expected_cycle_minutes": avg_expected_cycle,
        "avg_deviation_minutes": avg_deviation,
        "fleet_utilization": fleet_utilization,
        "total_torpedoes": total_torpedoes,
        "assigned_torpedoes": assigned_torpedoes,
        "maintenance_torpedoes": maintenance_torpedoes,
        "total_mt_delivered": total_mt_delivered
    }

    daily_trends = []
    current_date = start_date
    while current_date <= today:
        day_start = datetime.combine(current_date, datetime.min.time())
        day_end = datetime.combine(current_date, datetime.max.time())

        day_trips = [t for t in completed_trips
                     if t.c_exited_at and day_start <= t.c_exited_at.replace(tzinfo=None) <= day_end]

        day_on_time = 0
        day_delayed = 0
        day_deviation_total = 0

        for trip in day_trips:
            if trip.c_exited_at and trip.expected_c_exited_at:
                deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
                day_deviation_total += deviation
                if deviation <= thresholds.warning_threshold_minutes:
                    day_on_time += 1
                else:
                    day_delayed += 1

        daily_trends.append({
            "date": current_date.isoformat(),
            "display_date": current_date.strftime("%d %b"),
            "completed": len(day_trips),
            "on_time": day_on_time,
            "delayed": day_delayed,
            "on_time_rate": round((day_on_time / len(day_trips)) * 100, 1) if day_trips else 0,
            "avg_deviation": round(day_deviation_total / len(day_trips), 1) if day_trips else 0,
            "mt_delivered": round(len(day_trips) * avg_capacity, 1)
        })

        current_date += timedelta(days=1)

    queue_status = []

    if current_user.role == 'producer':
                                            
        producers = [(current_user.user_id,)]
        consumers = []                                               
    elif current_user.role == 'consumer':
                                            
        producers = []                                               
        consumers = [(current_user.user_id,)]
    else:
                        
        producers = db.query(Trip.producer_id).distinct().all()
        consumers = db.query(Trip.consumer_id).distinct().all()

    for (producer_id,) in producers:
                                                              
        at_producer = db.query(Trip).filter(
            Trip.producer_id == producer_id,
            Trip.status >= TripStatusEnum.ASSIGNED,
            Trip.status <= TripStatusEnum.PRODUCER_EXITED
        ).count()

        waiting = db.query(Trip).filter(
            Trip.producer_id == producer_id,
            Trip.status >= TripStatusEnum.ASSIGNED,
            Trip.status <= TripStatusEnum.WB_TARE_RECORDED
        ).count()

        prod_config = db.query(ProducerConfig).filter(
            ProducerConfig.producer_user_id == producer_id
        ).first()
        avg_loading = (prod_config.avg_fill_time if prod_config else 30) + (prod_config.estimated_wait_time if prod_config else 10)
        estimated_wait = waiting * avg_loading

        queue_status.append({
            "location_id": producer_id,
            "location_type": "producer",
            "queue_count": at_producer,
            "waiting_count": waiting,
            "estimated_wait_minutes": estimated_wait
        })

    for (consumer_id,) in consumers:
                                                                      
        at_consumer = db.query(Trip).filter(
            Trip.consumer_id == consumer_id,
            Trip.status >= TripStatusEnum.CONSUMER_ENTERED,
            Trip.status <= TripStatusEnum.UNLOADING_ENDED
        ).count()

        waiting = db.query(Trip).filter(
            Trip.consumer_id == consumer_id,
            Trip.status == TripStatusEnum.CONSUMER_ENTERED
        ).count()

        cons_config = db.query(ConsumerConfig).filter(
            ConsumerConfig.consumer_user_id == consumer_id
        ).first()
        avg_unloading = (cons_config.avg_unload_time if cons_config else 20) + (cons_config.estimated_wait_time if cons_config else 10)
        estimated_wait = waiting * avg_unloading

        queue_status.append({
            "location_id": consumer_id,
            "location_type": "consumer",
            "queue_count": at_consumer,
            "waiting_count": waiting,
            "estimated_wait_minutes": estimated_wait
        })

    shift_configs = db.query(ShiftConfig).filter(ShiftConfig.is_active == True).all()
    shift_performance = []

    for shift in shift_configs:
        shift_trips = [t for t in completed_trips if t.shift == shift.shift_name]

        shift_on_time = 0
        shift_delayed = 0
        shift_cycle_total = 0
        shift_deviation_total = 0

        for trip in shift_trips:
            if trip.cycle_time_minutes:
                shift_cycle_total += trip.cycle_time_minutes

            if trip.c_exited_at and trip.expected_c_exited_at:
                deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
                shift_deviation_total += deviation
                if deviation <= thresholds.warning_threshold_minutes:
                    shift_on_time += 1
                else:
                    shift_delayed += 1

        shift_performance.append({
            "shift_name": shift.shift_name,
            "total_trips": len(shift_trips),
            "on_time_count": shift_on_time,
            "delayed_count": shift_delayed,
            "on_time_rate": round((shift_on_time / len(shift_trips)) * 100, 1) if shift_trips else 0,
            "avg_cycle_time": round(shift_cycle_total / len(shift_trips), 1) if shift_trips else 0,
            "avg_deviation": round(shift_deviation_total / len(shift_trips), 1) if shift_trips else 0
        })

    route_stats = {}
    for trip in completed_trips:
        route_key = f"{trip.producer_id}→{trip.consumer_id}"
        if route_key not in route_stats:
            route_stats[route_key] = {
                "producer_id": trip.producer_id,
                "consumer_id": trip.consumer_id,
                "trips": [],
                "deviations": [],
                "cycle_times": []
            }

        route_stats[route_key]["trips"].append(trip)
        if trip.cycle_time_minutes:
            route_stats[route_key]["cycle_times"].append(trip.cycle_time_minutes)
        if trip.c_exited_at and trip.expected_c_exited_at:
            deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
            route_stats[route_key]["deviations"].append(deviation)

    route_performance = []
    for route_key, data in route_stats.items():
        avg_dev = sum(data["deviations"]) / len(data["deviations"]) if data["deviations"] else 0
        avg_cycle = sum(data["cycle_times"]) / len(data["cycle_times"]) if data["cycle_times"] else 0
        on_time = sum(1 for d in data["deviations"] if d <= thresholds.warning_threshold_minutes)

        route_performance.append({
            "route": route_key,
            "producer_id": data["producer_id"],
            "consumer_id": data["consumer_id"],
            "total_trips": len(data["trips"]),
            "on_time_count": on_time,
            "on_time_rate": round((on_time / len(data["deviations"])) * 100, 1) if data["deviations"] else 0,
            "avg_cycle_time": round(avg_cycle, 1),
            "avg_deviation": round(avg_dev, 1)
        })

    route_performance.sort(key=lambda x: x["on_time_rate"], reverse=True)

    torpedo_stats = {}
    for trip in completed_trips:
        if not trip.torpedo_id:
            continue

        if trip.torpedo_id not in torpedo_stats:
            torpedo_stats[trip.torpedo_id] = {
                "trips": [],
                "deviations": [],
                "cycle_times": []
            }

        torpedo_stats[trip.torpedo_id]["trips"].append(trip)
        if trip.cycle_time_minutes:
            torpedo_stats[trip.torpedo_id]["cycle_times"].append(trip.cycle_time_minutes)
        if trip.c_exited_at and trip.expected_c_exited_at:
            deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
            torpedo_stats[trip.torpedo_id]["deviations"].append(deviation)

    torpedo_performance = []
    for torpedo_id, data in torpedo_stats.items():
        avg_dev = sum(data["deviations"]) / len(data["deviations"]) if data["deviations"] else 0
        avg_cycle = sum(data["cycle_times"]) / len(data["cycle_times"]) if data["cycle_times"] else 0
        on_time = sum(1 for d in data["deviations"] if d <= thresholds.warning_threshold_minutes)

        torpedo_performance.append({
            "torpedo_id": torpedo_id,
            "total_trips": len(data["trips"]),
            "on_time_count": on_time,
            "on_time_rate": round((on_time / len(data["deviations"])) * 100, 1) if data["deviations"] else 0,
            "avg_cycle_time": round(avg_cycle, 1),
            "avg_deviation": round(avg_dev, 1)
        })

    torpedo_performance.sort(key=lambda x: x["on_time_rate"], reverse=True)

    return {
        "period": period,
        "start_date": start_date.isoformat(),
        "end_date": today.isoformat(),
        "last_updated": now.isoformat(),
        "kpi_summary": kpi_summary,
        "daily_trends": daily_trends,
        "queue_status": queue_status,
        "shift_performance": shift_performance,
        "route_performance": route_performance[:10],                 
        "torpedo_performance": torpedo_performance[:10]                    
    }

__all__ = ['get_hm_matrix_time', 'get_current_shift']
