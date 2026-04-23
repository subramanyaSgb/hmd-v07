from backend.constants import TripStatus, DeviationThreshold, SeverityLevel, FleetStatus, TRIP_STATUS_LABELS

class TestTripStatus:

    def test_trip_status_values(self):
        assert TripStatus.PENDING == 0
        assert TripStatus.ASSIGNED == 1
        assert TripStatus.WB_TARE_ENTRY == 2
        assert TripStatus.WB_TARE_RECORDED == 3
        assert TripStatus.PRODUCER_ENTERED == 4
        assert TripStatus.LOADING_STARTED == 5
        assert TripStatus.LOADING_ENDED == 6
        assert TripStatus.PRODUCER_EXITED == 7
        assert TripStatus.WB_GROSS_ENTRY == 8
        assert TripStatus.WB_GROSS_RECORDED == 9
        assert TripStatus.CONSUMER_ENTERED == 10
        assert TripStatus.UNLOADING_STARTED == 11
        assert TripStatus.UNLOADING_ENDED == 12
        assert TripStatus.COMPLETED == 13

    def test_trip_status_labels(self):
        assert TRIP_STATUS_LABELS[TripStatus.PENDING] == "Pending"
        assert TRIP_STATUS_LABELS[TripStatus.ASSIGNED] == "Assigned"
        assert TRIP_STATUS_LABELS[TripStatus.COMPLETED] == "Completed"

class TestDeviationThreshold:

    def test_threshold_values(self):
        assert DeviationThreshold.ON_TIME_MAX == 10
        assert DeviationThreshold.WARNING_MAX == 20
        assert DeviationThreshold.ALERT_MAX == 30

    def test_get_category_early(self):
        assert DeviationThreshold.get_category(-5) == "early"
        assert DeviationThreshold.get_category(-0.1) == "early"

    def test_get_category_on_time(self):
        assert DeviationThreshold.get_category(0) == "on_time"
        assert DeviationThreshold.get_category(5) == "on_time"
        assert DeviationThreshold.get_category(10) == "on_time"

    def test_get_category_warning(self):
        assert DeviationThreshold.get_category(11) == "warning"
        assert DeviationThreshold.get_category(15) == "warning"
        assert DeviationThreshold.get_category(20) == "warning"

    def test_get_category_alert(self):
        assert DeviationThreshold.get_category(21) == "alert"
        assert DeviationThreshold.get_category(25) == "alert"
        assert DeviationThreshold.get_category(30) == "alert"

    def test_get_category_critical(self):
        assert DeviationThreshold.get_category(31) == "critical"
        assert DeviationThreshold.get_category(60) == "critical"
        assert DeviationThreshold.get_category(100) == "critical"

    def test_is_on_time(self):
        assert DeviationThreshold.is_on_time(-5) is True
        assert DeviationThreshold.is_on_time(0) is True
        assert DeviationThreshold.is_on_time(10) is True
        assert DeviationThreshold.is_on_time(11) is False
        assert DeviationThreshold.is_on_time(30) is False

class TestSeverityLevel:

    def test_severity_calculation_low(self):
                                         
        assert SeverityLevel.calculate(5, 10) == SeverityLevel.LOW

    def test_severity_calculation_medium(self):
                                              
        assert SeverityLevel.calculate(12, 15) == SeverityLevel.MEDIUM
        assert SeverityLevel.calculate(8, 22) == SeverityLevel.MEDIUM

    def test_severity_calculation_high(self):
                                          
        assert SeverityLevel.calculate(25, 10) == SeverityLevel.HIGH
        assert SeverityLevel.calculate(10, 35) == SeverityLevel.HIGH
        assert SeverityLevel.calculate(25, 35) == SeverityLevel.HIGH

class TestFleetStatus:

    def test_fleet_status_values(self):
        assert FleetStatus.OPERATING == "Operating"
        assert FleetStatus.MAINTENANCE == "Maintenance"
        assert FleetStatus.IDLE == "Idle"
        assert FleetStatus.ASSIGNED == "Assigned"
