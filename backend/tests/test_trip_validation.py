import pytest
from datetime import datetime, timezone, timedelta
from backend.database.models import Trip
from backend.constants import TripStatus
from backend.utils.trip_validation import (
    validate_status_transition,
    validate_timestamp_not_set,
    validate_timestamp_monotonicity,
    update_trip_status,
    detect_stuck_trips,
    _get_stuck_action,
    _calculate_stuck_severity,
)
from backend.utils.errors import TripStatusError, ValidationError

@pytest.fixture
def sample_trip():
    return Trip(
        trip_id="TEST001",
        producer_id="BF001",
        consumer_id="SMS001",
        status=TripStatus.PENDING,
        created_at=datetime.now(timezone.utc)
    )

class TestValidateStatusTransition:

    def test_valid_transition_pending_to_assigned(self, sample_trip):
                                       
        validate_status_transition(sample_trip, TripStatus.ASSIGNED)

    def test_valid_transition_assigned_to_wb_tare_entry(self, sample_trip):
        sample_trip.status = TripStatus.ASSIGNED
        validate_status_transition(sample_trip, TripStatus.WB_TARE_ENTRY)

    def test_invalid_transition_pending_to_completed(self, sample_trip):
        with pytest.raises(TripStatusError) as exc_info:
            validate_status_transition(sample_trip, TripStatus.COMPLETED)
        assert "Invalid transition" in str(exc_info.value)

    def test_invalid_transition_pending_to_consumer_entered(self, sample_trip):
        with pytest.raises(TripStatusError) as exc_info:
            validate_status_transition(sample_trip, TripStatus.CONSUMER_ENTERED)
        assert "Invalid transition" in str(exc_info.value)

    def test_transition_from_terminal_state(self, sample_trip):
        sample_trip.status = TripStatus.COMPLETED
        with pytest.raises(TripStatusError) as exc_info:
            validate_status_transition(sample_trip, TripStatus.PENDING)
        assert "terminal status" in str(exc_info.value)

class TestValidateTimestampNotSet:

    def test_timestamp_not_set_allows_update(self, sample_trip):
        sample_trip.status = TripStatus.PENDING
        sample_trip.assigned_at = None
                                       
        validate_timestamp_not_set(sample_trip, TripStatus.ASSIGNED)

    def test_timestamp_already_set_raises_error(self, sample_trip):
        sample_trip.status = TripStatus.PENDING
        sample_trip.assigned_at = datetime.now(timezone.utc)

        with pytest.raises(ValidationError) as exc_info:
            validate_timestamp_not_set(sample_trip, TripStatus.ASSIGNED)
        assert "Cannot overwrite existing timestamp" in str(exc_info.value)

    def test_status_without_timestamp_field(self, sample_trip):
                                                         
        validate_timestamp_not_set(sample_trip, TripStatus.PENDING)

class TestValidateTimestampMonotonicity:

    def test_monotonic_timestamps_valid(self, sample_trip):
        now = datetime.now(timezone.utc)
        sample_trip.created_at = now
        sample_trip.assigned_at = now + timedelta(minutes=5)

        new_timestamp = now + timedelta(minutes=10)
                                       
        validate_timestamp_monotonicity(sample_trip, TripStatus.WB_TARE_ENTRY, new_timestamp)

    def test_non_monotonic_timestamps_invalid(self, sample_trip):
        now = datetime.now(timezone.utc)
        sample_trip.created_at = now
        sample_trip.assigned_at = now + timedelta(minutes=10)

        new_timestamp = now + timedelta(minutes=5)

        with pytest.raises(ValidationError) as exc_info:
            validate_timestamp_monotonicity(sample_trip, TripStatus.WB_TARE_ENTRY, new_timestamp)
        assert "must be after" in str(exc_info.value)

    def test_equal_timestamps_invalid(self, sample_trip):
        now = datetime.now(timezone.utc)
        sample_trip.created_at = now
        sample_trip.assigned_at = now

        with pytest.raises(ValidationError) as exc_info:
            validate_timestamp_monotonicity(sample_trip, TripStatus.WB_TARE_ENTRY, now)
        assert "must be after" in str(exc_info.value)

    def test_handles_timezone_aware_timestamps(self, sample_trip):
        now = datetime.now(timezone.utc)
        sample_trip.created_at = now
        sample_trip.assigned_at = now + timedelta(minutes=5)

        new_timestamp = now + timedelta(minutes=10)
                                       
        validate_timestamp_monotonicity(sample_trip, TripStatus.WB_TARE_ENTRY, new_timestamp)

class TestUpdateTripStatus:

    def test_update_status_with_default_timestamp(self, sample_trip):
        update_trip_status(sample_trip, TripStatus.ASSIGNED)

        assert sample_trip.status == TripStatus.ASSIGNED
        assert sample_trip.assigned_at is not None
        assert isinstance(sample_trip.assigned_at, datetime)

    def test_update_status_with_custom_timestamp(self, sample_trip):
        custom_time = datetime.now(timezone.utc) + timedelta(minutes=5)
        update_trip_status(sample_trip, TripStatus.ASSIGNED, timestamp=custom_time)

        assert sample_trip.status == TripStatus.ASSIGNED
        assert sample_trip.assigned_at == custom_time

    def test_update_status_validates_transition(self, sample_trip):
        with pytest.raises(TripStatusError):
            update_trip_status(sample_trip, TripStatus.COMPLETED)

    def test_update_status_validates_overwrite(self, sample_trip):
        sample_trip.assigned_at = datetime.now(timezone.utc)

        with pytest.raises(ValidationError):
            update_trip_status(sample_trip, TripStatus.ASSIGNED)

    def test_update_status_skip_overwrite_validation(self, sample_trip):
        sample_trip.assigned_at = datetime.now(timezone.utc)
        new_time = datetime.now(timezone.utc) + timedelta(minutes=5)

        update_trip_status(sample_trip, TripStatus.ASSIGNED, timestamp=new_time, validate_overwrite=False)
        assert sample_trip.assigned_at == new_time

    def test_update_status_validates_monotonicity(self, sample_trip):
        sample_trip.status = TripStatus.ASSIGNED
        sample_trip.assigned_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        old_time = datetime.now(timezone.utc)

        with pytest.raises(ValidationError):
            update_trip_status(sample_trip, TripStatus.WB_TARE_ENTRY, timestamp=old_time)

    def test_update_status_skip_monotonicity_validation(self, sample_trip):
        sample_trip.status = TripStatus.ASSIGNED
        sample_trip.assigned_at = datetime.now(timezone.utc) + timedelta(minutes=10)
        old_time = datetime.now(timezone.utc)

        update_trip_status(sample_trip, TripStatus.WB_TARE_ENTRY, timestamp=old_time, validate_monotonicity=False, validate_overwrite=False)
        assert sample_trip.wb_tare_entry_at == old_time

class TestDetectStuckTrips:

    def test_detect_stuck_pending_trip(self, db_session):
                                                                                  
        old_time = datetime.now(timezone.utc) - timedelta(minutes=60)
        trip = Trip(
            trip_id="STUCK001",
            producer_id="BF001",
            consumer_id="SMS001",
            status=TripStatus.PENDING,
            created_at=old_time
        )
        db_session.add(trip)
        db_session.commit()

        stuck_trips = detect_stuck_trips(db_session)

        assert len(stuck_trips) > 0
        assert any(t["trip_id"] == "STUCK001" for t in stuck_trips)
        stuck = next(t for t in stuck_trips if t["trip_id"] == "STUCK001")
        assert stuck["status"] == TripStatus.PENDING
        assert stuck["time_in_status_minutes"] > 30

    def test_detect_stuck_assigned_trip(self, db_session):
        old_time = datetime.now(timezone.utc) - timedelta(minutes=90)
        trip = Trip(
            trip_id="STUCK002",
            producer_id="BF001",
            consumer_id="SMS001",
            torpedo_id="T001",
            status=TripStatus.ASSIGNED,
            created_at=old_time - timedelta(minutes=10),
            assigned_at=old_time
        )
        db_session.add(trip)
        db_session.commit()

        stuck_trips = detect_stuck_trips(db_session)

        assert len(stuck_trips) > 0
        stuck = next((t for t in stuck_trips if t["trip_id"] == "STUCK002"), None)
        assert stuck is not None
        assert stuck["status"] == TripStatus.ASSIGNED

    def test_no_stuck_trips_when_all_current(self, db_session):
                              
        trip = Trip(
            trip_id="CURRENT001",
            producer_id="BF001",
            consumer_id="SMS001",
            status=TripStatus.PENDING,
            created_at=datetime.now(timezone.utc)
        )
        db_session.add(trip)
        db_session.commit()

        stuck_trips = detect_stuck_trips(db_session)

        assert not any(t["trip_id"] == "CURRENT001" for t in stuck_trips)

    def test_stuck_trips_exclude_completed(self, db_session):
        old_time = datetime.now(timezone.utc) - timedelta(hours=5)
        trip = Trip(
            trip_id="COMPLETED001",
            producer_id="BF001",
            consumer_id="SMS001",
            torpedo_id="T001",
            status=TripStatus.COMPLETED,
            created_at=old_time,
            assigned_at=old_time,
            c_exited_at=datetime.now(timezone.utc)
        )
        db_session.add(trip)
        db_session.commit()

        stuck_trips = detect_stuck_trips(db_session)

        assert not any(t["trip_id"] == "COMPLETED001" for t in stuck_trips)

    def test_stuck_trips_exclude_soft_deleted(self, db_session):
        old_time = datetime.now(timezone.utc) - timedelta(hours=2)
        trip = Trip(
            trip_id="DELETED001",
            producer_id="BF001",
            consumer_id="SMS001",
            status=TripStatus.PENDING,
            created_at=old_time,
            deleted_at=datetime.now(timezone.utc)
        )
        db_session.add(trip)
        db_session.commit()

        stuck_trips = detect_stuck_trips(db_session)

        assert not any(t["trip_id"] == "DELETED001" for t in stuck_trips)

    def test_stuck_trips_threshold_multiplier(self, db_session):
                                                                 
        very_old_time = datetime.now(timezone.utc) - timedelta(minutes=120)
        moderately_old_time = datetime.now(timezone.utc) - timedelta(minutes=50)

        trip1 = Trip(
            trip_id="VERYOLD001",
            producer_id="BF001",
            consumer_id="SMS001",
            status=TripStatus.PENDING,
            created_at=very_old_time
        )
        trip2 = Trip(
            trip_id="MODERATE001",
            producer_id="BF001",
            consumer_id="SMS002",
            status=TripStatus.PENDING,
            created_at=moderately_old_time
        )
        db_session.add(trip1)
        db_session.add(trip2)
        db_session.commit()

        stuck_normal = detect_stuck_trips(db_session, threshold_multiplier=1.0)
        normal_count = len([t for t in stuck_normal if t["trip_id"] in ["VERYOLD001", "MODERATE001"]])

        stuck_lenient = detect_stuck_trips(db_session, threshold_multiplier=2.0)
        lenient_count = len([t for t in stuck_lenient if t["trip_id"] in ["VERYOLD001", "MODERATE001"]])

        assert lenient_count <= normal_count

class TestGetStuckAction:

    def test_get_action_for_pending(self):
        action = _get_stuck_action(TripStatus.PENDING)
        assert "Assign a torpedo" in action or "cancel" in action.lower()

    def test_get_action_for_assigned(self):
        action = _get_stuck_action(TripStatus.ASSIGNED)
        assert "torpedo" in action.lower() or "driver" in action.lower()

    def test_get_action_for_loading(self):
        action = _get_stuck_action(TripStatus.LOADING_STARTED)
        assert "loading" in action.lower() or "equipment" in action.lower()

    def test_get_action_for_unknown_status(self):
        action = _get_stuck_action(999)
        assert "Investigate" in action

class TestCalculateStuckSeverity:

    def test_severity_low(self):
        time_in_status = timedelta(minutes=40)
        threshold = timedelta(minutes=30)
        severity = _calculate_stuck_severity(time_in_status, threshold)
        assert severity == "low"

    def test_severity_medium(self):
        time_in_status = timedelta(minutes=50)
        threshold = timedelta(minutes=30)
        severity = _calculate_stuck_severity(time_in_status, threshold)
        assert severity == "medium"

    def test_severity_high(self):
        time_in_status = timedelta(minutes=70)
        threshold = timedelta(minutes=30)
        severity = _calculate_stuck_severity(time_in_status, threshold)
        assert severity == "high"

    def test_severity_critical(self):
        time_in_status = timedelta(minutes=100)
        threshold = timedelta(minutes=30)
        severity = _calculate_stuck_severity(time_in_status, threshold)
        assert severity == "critical"
