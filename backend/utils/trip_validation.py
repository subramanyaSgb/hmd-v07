
from datetime import datetime, timezone, timedelta
from typing import Optional, List, Dict, Any
from sqlalchemy.orm import Session

from ..constants import (
    TripStatus,
    VALID_TRIP_TRANSITIONS,
    is_valid_transition,
    StuckTripThresholds
)
from ..database.models import Trip
from .errors import TripStatusError, ValidationError, FieldError, ErrorCode

STATUS_TIMESTAMP_FIELDS = {
    TripStatus.ASSIGNED: "assigned_at",
    TripStatus.WB_TARE_ENTRY: "wb_tare_entry_at",
    TripStatus.WB_TARE_RECORDED: "wb_tare_recorded_at",
    TripStatus.PRODUCER_ENTERED: "p_entered_at",
    TripStatus.LOADING_STARTED: "p_loading_start_at",
    TripStatus.LOADING_ENDED: "p_loading_end_at",
    TripStatus.PRODUCER_EXITED: "p_exited_at",
    TripStatus.WB_GROSS_ENTRY: "wb_gross_entry_at",
    TripStatus.WB_GROSS_RECORDED: "wb_gross_recorded_at",
    TripStatus.CONSUMER_ENTERED: "c_entered_at",
    TripStatus.UNLOADING_STARTED: "c_unloading_start_at",
    TripStatus.UNLOADING_ENDED: "c_unloading_end_at",
    TripStatus.COMPLETED: "c_exited_at",
}

TIMESTAMP_ORDER = [
    "created_at",
    "assigned_at",
    "wb_tare_entry_at",
    "wb_tare_recorded_at",
    "p_entered_at",
    "p_loading_start_at",
    "p_loading_end_at",
    "p_exited_at",
    "wb_gross_entry_at",
    "wb_gross_recorded_at",
    "c_entered_at",
    "c_unloading_start_at",
    "c_unloading_end_at",
    "c_exited_at",
]

def validate_status_transition(trip: Trip, new_status: int) -> None:
    current_status = trip.status

    if TripStatus.is_terminal(current_status):
        raise TripStatusError(
            current_status=current_status,
            target_status=new_status,
            message=f"Cannot transition from terminal status '{TRIP_STATUS_LABELS.get(current_status, 'Unknown')}'"
        )

    if not is_valid_transition(current_status, new_status):
        valid_next = VALID_TRIP_TRANSITIONS.get(current_status, [])
        valid_labels = [TRIP_STATUS_LABELS.get(s, str(s)) for s in valid_next]
        raise TripStatusError(
            current_status=current_status,
            target_status=new_status,
            message=f"Invalid transition from '{TRIP_STATUS_LABELS.get(current_status, 'Unknown')}' to "
                   f"'{TRIP_STATUS_LABELS.get(new_status, 'Unknown')}'. "
                   f"Valid transitions: {', '.join(valid_labels) if valid_labels else 'none'}"
        )

def validate_timestamp_not_set(trip: Trip, new_status: int) -> None:
    timestamp_field = STATUS_TIMESTAMP_FIELDS.get(new_status)
    if not timestamp_field:
        return

    existing_value = getattr(trip, timestamp_field, None)
    if existing_value is not None:
        raise ValidationError(
            message=f"Cannot overwrite existing timestamp for status "
                   f"'{TRIP_STATUS_LABELS.get(new_status, 'Unknown')}'. "
                   f"Timestamp was already set at {existing_value.isoformat()}",
            error_code=ErrorCode.TRIP_ALREADY_ASSIGNED,
            field_errors=[FieldError(
                field=timestamp_field,
                message=f"Already set to {existing_value.isoformat()}",
                code="timestamp_exists"
            )]
        )

def validate_timestamp_monotonicity(trip: Trip, new_status: int, new_timestamp: datetime) -> None:
    timestamp_field = STATUS_TIMESTAMP_FIELDS.get(new_status)
    if not timestamp_field:
        return

    if timestamp_field not in TIMESTAMP_ORDER:
        return

    new_index = TIMESTAMP_ORDER.index(timestamp_field)

    for i in range(new_index):
        prev_field = TIMESTAMP_ORDER[i]
        prev_value = getattr(trip, prev_field, None)

        if prev_value is not None:
                                                     
            if prev_value.tzinfo is None:
                prev_value = prev_value.replace(tzinfo=timezone.utc)
            if new_timestamp.tzinfo is None:
                new_timestamp = new_timestamp.replace(tzinfo=timezone.utc)

            if new_timestamp <= prev_value:
                raise ValidationError(
                    message=f"Timestamp for '{TRIP_STATUS_LABELS.get(new_status, 'Unknown')}' "
                           f"({new_timestamp.isoformat()}) must be after '{prev_field}' ({prev_value.isoformat()})",
                    error_code=ErrorCode.VALIDATION_DATE_RANGE,
                    field_errors=[FieldError(
                        field=timestamp_field,
                        message=f"Must be after {prev_value.isoformat()}",
                        code="timestamp_not_monotonic"
                    )]
                )

def update_trip_status(
    trip: Trip,
    new_status: int,
    timestamp: Optional[datetime] = None,
    validate_overwrite: bool = True,
    validate_monotonicity: bool = True
) -> None:
                             
    validate_status_transition(trip, new_status)

    if timestamp is None:
        timestamp = datetime.now(timezone.utc)

    if validate_overwrite:
        validate_timestamp_not_set(trip, new_status)

    if validate_monotonicity:
        validate_timestamp_monotonicity(trip, new_status, timestamp)

    trip.status = new_status

    timestamp_field = STATUS_TIMESTAMP_FIELDS.get(new_status)
    if timestamp_field:
        setattr(trip, timestamp_field, timestamp)

def detect_stuck_trips(db: Session, threshold_multiplier: float = 1.0) -> List[Dict[str, Any]]:
    now = datetime.now(timezone.utc)
    stuck_trips = []

    active_trips = db.query(Trip).filter(
        Trip.status >= TripStatus.PENDING,
        Trip.status <= TripStatus.UNLOADING_ENDED,
        Trip.deleted_at.is_(None)
    ).all()

    for trip in active_trips:
        threshold_minutes = StuckTripThresholds.get_threshold(trip.status) * threshold_multiplier
        threshold = timedelta(minutes=threshold_minutes)

        timestamp_field = STATUS_TIMESTAMP_FIELDS.get(trip.status)
        if not timestamp_field:
                                         
            check_time = trip.created_at
        else:
                                                              
            idx = list(STATUS_TIMESTAMP_FIELDS.values()).index(timestamp_field)
            prev_fields = list(STATUS_TIMESTAMP_FIELDS.values())[:idx]
            check_time = None
            for field in reversed(prev_fields):
                check_time = getattr(trip, field, None)
                if check_time:
                    break
            if not check_time:
                check_time = trip.created_at

        if check_time:
                                 
            if check_time.tzinfo is None:
                check_time = check_time.replace(tzinfo=timezone.utc)

            time_in_status = now - check_time
            if time_in_status > threshold:
                stuck_trips.append({
                    "trip_id": trip.trip_id,
                    "id": trip.id,
                    "status": trip.status,
                    "status_label": TRIP_STATUS_LABELS.get(trip.status, "Unknown"),
                    "time_in_status_minutes": time_in_status.total_seconds() / 60,
                    "threshold_minutes": threshold_minutes,
                    "producer_id": trip.producer_id,
                    "consumer_id": trip.consumer_id,
                    "torpedo_id": trip.torpedo_id,
                    "recommended_action": _get_stuck_action(trip.status),
                    "severity": _calculate_stuck_severity(time_in_status, threshold)
                })

    return stuck_trips

def _get_stuck_action(status: int) -> str:
    actions = {
        TripStatus.PENDING: "Assign a torpedo or cancel if no longer needed",
        TripStatus.ASSIGNED: "Check if torpedo has left depot; contact driver",
        TripStatus.PRODUCER_ENTERED: "Verify loading queue status; check for delays",
        TripStatus.LOADING_STARTED: "Check loading equipment status; verify hot metal availability",
        TripStatus.LOADING_ENDED: "Verify exit clearance; check for weighing issues",
        TripStatus.PRODUCER_EXITED: "Track torpedo location; check for transit issues",
        TripStatus.CONSUMER_ENTERED: "Verify unloading bay availability; contact SMS",
        TripStatus.UNLOADING_STARTED: "Check unloading progress; verify SMS capacity",
        TripStatus.UNLOADING_ENDED: "Verify exit clearance; complete trip manually if needed",
    }
    return actions.get(status, "Investigate and resolve or abort trip")

def _calculate_stuck_severity(time_in_status: timedelta, threshold: timedelta) -> str:
    ratio = time_in_status.total_seconds() / threshold.total_seconds()
    if ratio > 3:
        return "critical"
    elif ratio > 2:
        return "high"
    elif ratio > 1.5:
        return "medium"
    else:
        return "low"

from ..constants import TRIP_STATUS_LABELS
