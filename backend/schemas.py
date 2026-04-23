from datetime import date, datetime
from typing import Optional, List, Dict, Any
from pydantic import BaseModel, Field, validator
from enum import IntEnum, Enum

class TripStatus(IntEnum):
    PENDING = 0
    ASSIGNED = 1
    WB_TARE_ENTRY = 2
    WB_TARE_RECORDED = 3
    PRODUCER_ENTERED = 4
    LOADING_STARTED = 5
    LOADING_ENDED = 6
    PRODUCER_EXITED = 7
    WB_GROSS_ENTRY = 8
    WB_GROSS_RECORDED = 9
    CONSUMER_ENTERED = 10
    UNLOADING_STARTED = 11
    UNLOADING_ENDED = 12
    COMPLETED = 13

class UserRole(str, Enum):
    ADMIN = "admin"
    PRODUCER = "producer"
    CONSUMER = "consumer"
    PPC = "ppc"
    TRS = "trs"


class FleetStatus(str, Enum):
    OPERATING = "Operating"
    ASSIGNED = "Assigned"
    MAINTENANCE = "Maintenance"

class PlanStatus(str, Enum):
    PRIMARY = "Primary"
    REVISED = "Revised"
    CONFIRMED = "Confirmed"

class LoginRequest(BaseModel):
    username: str = Field(..., min_length=1, max_length=50)
    password: str = Field(..., min_length=1, max_length=100)

class LoginResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    username: str
    role: str
    user_id: Optional[str] = None

class LogoutRequest(BaseModel):
    token: Optional[str] = None                                                                   

class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str = Field(..., min_length=6, max_length=128)

class FleetCreate(BaseModel):
    fleet_id: str = Field(..., min_length=1, max_length=50)
    type: str = Field(default="torpedo", pattern="^(torpedo|locomotive)$")
    capacity: float = Field(..., gt=0, le=1000)
    status: FleetStatus = FleetStatus.OPERATING

class FleetUpdate(BaseModel):
    fleet_id: Optional[str] = Field(None, min_length=1, max_length=50)
    type: Optional[str] = Field(None, pattern="^(torpedo|locomotive)$")
    capacity: Optional[float] = Field(None, gt=0, le=1000)
    status: Optional[FleetStatus] = None

class FleetResponse(BaseModel):
    id: int
    fleet_id: str
    type: str
    status: str
    capacity: Optional[float]
    created_at: Optional[datetime]
    last_updated: Optional[datetime]

    class Config:
        from_attributes = True

class DailyPlanResponse(BaseModel):
    id: int
    date: date
    user_id: str
    role: str
    capacity: float
    status: str
    last_updated: Optional[datetime]

    class Config:
        from_attributes = True

class DailyPlanUpsert(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=50)
    role: UserRole
    capacity: float = Field(..., ge=0, le=100000)

class DailyPlanConfirm(BaseModel):
    date: Optional[str] = None

    @validator('date', pre=True)
    def parse_date(cls, v):
        if v is None or v == '':
            return None
        return v                                            

class DistributionAssignmentItem(BaseModel):
    producer_id: str = Field(..., min_length=1, max_length=50)
    consumer_id: str = Field(..., min_length=1, max_length=50)
    quantity: float = Field(..., ge=0)
    trips: int = Field(..., ge=0)
    travel_time: int = Field(..., ge=0)

class DistributionPlanCommit(BaseModel):
    assignments: List[DistributionAssignmentItem]

class MonthlyPlanEntry(BaseModel):
    date: date
    capacity: float = Field(..., ge=0, le=100000)

class MonthlyPlanBulk(BaseModel):
    user_id: str = Field(..., min_length=1, max_length=50)
    role: UserRole
    plans: List[MonthlyPlanEntry]

class BreakdownRePlan(BaseModel):
    node_id: str = Field(..., min_length=1, max_length=50)

class TripCreate(BaseModel):
    producer_id: str = Field(..., min_length=1, max_length=50)
    consumer_id: str = Field(..., min_length=1, max_length=50)
    torpedo_id: Optional[str] = Field(None, max_length=50)


class TripAssign(BaseModel):
    trip_id: str = Field(..., min_length=1, max_length=100)
    torpedo_id: str = Field(..., min_length=1, max_length=50)

class ConverterDistributionItem(BaseModel):
    converter_id: int
    quantity_tons: float = Field(..., gt=0)

class TripStatusUpdate(BaseModel):
    trip_id: str = Field(..., min_length=1, max_length=100)
    status: int = Field(..., ge=0, le=15)
    converter_id: Optional[int] = None                                                                
    converter_distributions: Optional[List[ConverterDistributionItem]] = None

    weighbridge_id: Optional[int] = None
    weight_kg: Optional[float] = None
    cast_id: Optional[str] = None
    furnace_id: Optional[str] = None

    @validator('status')
    def validate_status(cls, v):
        if v not in [s.value for s in TripStatus]:
            raise ValueError(f'Invalid status. Must be between 0-15')
        return v


class TripTimeConfig(BaseModel):
    source_user_id: str = Field(..., min_length=1, max_length=50)
    destination_user_id: str = Field(..., min_length=1, max_length=50)
    travel_time: int = Field(..., ge=1, le=1440)                     

class ConsumerTimeConfig(BaseModel):
    consumer_user_id: str = Field(..., min_length=1, max_length=50)
    avg_unload_time: int = Field(..., ge=0, le=1440)                 
    estimated_wait_time: int = Field(..., ge=0, le=1440)

class ProducerTimeConfig(BaseModel):
    producer_user_id: str = Field(..., min_length=1, max_length=50)
    avg_fill_time: int = Field(..., ge=0, le=1440)                 
    estimated_wait_time: int = Field(..., ge=0, le=1440)


class ErrorResponse(BaseModel):
    status: str = "error"
    detail: str


class TripPerformanceSummary(BaseModel):
    total_trips: int = 0
    completed_trips: int = 0
    in_progress_trips: int = 0
    cancelled_trips: int = 0
    avg_cycle_time_minutes: float = 0.0
    on_time_delivery_rate: float = 0.0
    total_distance_travelled: float = 0.0
    avg_loading_time_minutes: float = 0.0
    avg_unloading_time_minutes: float = 0.0

class CycleTimeDistribution(BaseModel):
    range_0_30: int = 0
    range_30_45: int = 0
    range_45_60: int = 0
    range_60_90: int = 0
    range_90_plus: int = 0

class TripPerformanceDetail(BaseModel):
    trip_id: str
    producer_id: str
    consumer_id: str
    torpedo_id: Optional[str] = None
    status: int
    status_text: str
    created_at: Optional[datetime] = None
    assigned_at: Optional[datetime] = None
    p_entered_at: Optional[datetime] = None
    p_loading_end_at: Optional[datetime] = None
    p_exited_at: Optional[datetime] = None
    c_entered_at: Optional[datetime] = None
    c_unloading_end_at: Optional[datetime] = None
    c_exited_at: Optional[datetime] = None
    cycle_time_minutes: Optional[float] = None
    loading_time_minutes: Optional[float] = None
    unloading_time_minutes: Optional[float] = None
    travel_time_minutes: Optional[float] = None
    is_on_time: bool = True

class TripPerformanceReport(BaseModel):
    summary: TripPerformanceSummary
    cycle_time_distribution: CycleTimeDistribution
    trips: List[TripPerformanceDetail]
    daily_trends: List[Dict[str, Any]]
    producer_breakdown: List[Dict[str, Any]]
    consumer_breakdown: List[Dict[str, Any]]

class FleetUtilizationSummary(BaseModel):
    total_fleet: int = 0
    operating_count: int = 0
    maintenance_count: int = 0
    available_count: int = 0
    avg_capacity_utilization: float = 0.0
    total_trips_completed: int = 0
    total_distance_travelled: float = 0.0
    avg_fleet_age_days: float = 0.0

class FleetUtilizationDetail(BaseModel):
    fleet_id: str
    fleet_type: str
    capacity: Optional[float] = None
    status: str
    total_trips: int = 0
    completed_trips: int = 0
    total_distance: float = 0.0
    avg_cycle_time: Optional[float] = None
    capacity_utilization: float = 0.0
    last_active: Optional[datetime] = None

class FleetUtilizationReport(BaseModel):
    summary: FleetUtilizationSummary
    fleet_details: List[FleetUtilizationDetail]
    status_distribution: Dict[str, int]
    daily_utilization: List[Dict[str, Any]]
    type_breakdown: List[Dict[str, Any]]
    maintenance_schedule: List[Dict[str, Any]]

class ProductionConsumptionSummary(BaseModel):
    total_production: float = 0.0
    total_consumption: float = 0.0
    net_balance: float = 0.0
    avg_daily_production: float = 0.0
    avg_daily_consumption: float = 0.0
    production_targets_met: float = 0.0
    consumption_targets_met: float = 0.0
    total_trips_for_production: int = 0
    total_trips_for_consumption: int = 0


class MaintenanceImpactSummary(BaseModel):
    total_schedules: int = 0
    active_maintenance: int = 0
    completed_maintenance: int = 0
    total_downtime_hours: float = 0.0
    avg_downtime_per_event: float = 0.0
    affected_producers: int = 0
    affected_consumers: int = 0
    production_impact_tons: float = 0.0

class MaintenanceScheduleReport(BaseModel):
    schedule_id: int
    node_id: str
    node_type: str
    start_date: date
    end_date: date
    reason: Optional[str] = None
    status: str
    downtime_hours: float = 0.0
    production_impact: float = 0.0
    created_at: Optional[datetime] = None


class ActivitySummary(BaseModel):
    total_activities: int = 0
    unique_users: int = 0
    login_count: int = 0
    logout_count: int = 0
    data_modifications: int = 0
    report_generations: int = 0
    most_active_user: Optional[str] = None
    peak_activity_hour: int = 0

class ActivityDetail(BaseModel):
    id: int
    username: Optional[str] = "unknown"
    user_id: Optional[str] = None
    action: str
    details: Optional[str] = None
    ip_address: Optional[str] = None
    timestamp: Optional[datetime] = None


class AssignmentDetail(BaseModel):
    assignment_id: int
    date: date
    producer_id: str
    consumer_id: str
    quantity: float
    trips: int
    travel_time: int
    status: str
    completed_trips: int = 0
    actual_quantity_delivered: float = 0.0
    variance_percent: float = 0.0
    created_at: Optional[datetime] = None

class DistributionSummary(BaseModel):
    total_assignments: int = 0
    total_quantity: float = 0.0
    total_trips: int = 0
    completed_assignments: int = 0
    pending_assignments: int = 0
    avg_variance_percent: float = 0.0
    on_time_delivery_rate: float = 0.0
    efficiency_rate: float = 0.0


class SavedReportCreate(BaseModel):
    name: str
    report_type: str
    filters: Dict[str, Any]

class SavedReportResponse(BaseModel):
    id: int
    name: str
    report_type: str
    filters: Dict[str, Any]
    created_by: str
    is_shared: bool
    created_at: datetime
    last_accessed: Optional[datetime] = None

class ScheduleReportCreate(BaseModel):
    name: str
    report_type: str
    filters: Dict[str, Any]
    schedule_type: str
    schedule_time: str
    schedule_day: Optional[int] = None
    recipients: List[str]
    export_format: str

class ScheduleReportResponse(BaseModel):
    id: int
    name: str
    report_type: str
    schedule_type: str
    schedule_time: str
    is_active: bool
    next_run: Optional[datetime] = None
    created_by: str
    created_at: datetime

class DeviationThresholdConfigSchema(BaseModel):
    warning_threshold_minutes: int = Field(default=10, ge=1, le=120)
    alert_threshold_minutes: int = Field(default=20, ge=1, le=240)
    critical_threshold_minutes: int = Field(default=30, ge=1, le=480)
    auto_refresh_interval_seconds: int = Field(default=5, ge=1, le=60)

class DeviationThresholdResponse(BaseModel):
    id: int
    warning_threshold_minutes: int
    alert_threshold_minutes: int
    critical_threshold_minutes: int
    auto_refresh_interval_seconds: int
    last_updated: Optional[datetime]

    class Config:
        from_attributes = True

class PhaseDeviation(BaseModel):
    phase_name: str                                     
    phase_code: int                              
    expected_duration_minutes: Optional[float] = None
    actual_duration_minutes: Optional[float] = None
    deviation_minutes: Optional[float] = None
    status: str = "pending"                                                                               
    expected_timestamp: Optional[datetime] = None
    actual_timestamp: Optional[datetime] = None

class LiveTripStatus(BaseModel):
    trip_id: str
    producer_id: str
    consumer_id: str
    torpedo_id: Optional[str]
    status: int
    status_label: str
    current_phase: str                                                                                                       

    assigned_at: Optional[datetime]
    expected_duration_minutes: Optional[float]
    expected_completion_at: Optional[datetime]
    elapsed_minutes: float
    remaining_minutes: Optional[float]

    total_deviation_minutes: float
    deviation_status: str                                                       

    phase_deviations: List[PhaseDeviation]

    wb_tare_entry_at: Optional[datetime] = None
    wb_tare_recorded_at: Optional[datetime] = None
    expected_wb_tare_entry_at: Optional[datetime] = None
    expected_wb_tare_recorded_at: Optional[datetime] = None

    p_entered_at: Optional[datetime]
    p_loading_start_at: Optional[datetime]
    p_loading_end_at: Optional[datetime]
    p_exited_at: Optional[datetime]

    wb_gross_entry_at: Optional[datetime] = None
    wb_gross_recorded_at: Optional[datetime] = None
    expected_wb_gross_entry_at: Optional[datetime] = None
    expected_wb_gross_recorded_at: Optional[datetime] = None

    c_entered_at: Optional[datetime]
    c_unloading_start_at: Optional[datetime]
    c_unloading_end_at: Optional[datetime]
    c_exited_at: Optional[datetime]

    expected_p_entered_at: Optional[datetime]
    expected_p_loading_start_at: Optional[datetime]
    expected_p_loading_end_at: Optional[datetime]
    expected_p_exited_at: Optional[datetime]
    expected_c_entered_at: Optional[datetime]
    expected_c_unloading_start_at: Optional[datetime]
    expected_c_unloading_end_at: Optional[datetime]
    expected_c_exited_at: Optional[datetime]

    tare_weight_kg: Optional[float] = None
    gross_weight_kg: Optional[float] = None
    net_weight_kg: Optional[float] = None

    dynamic_eta: Optional[datetime]

    shift: Optional[str]

    is_completed: bool = False
    completed_at: Optional[datetime] = None
    actual_duration_minutes: Optional[float] = None

class LiveOperationsSummary(BaseModel):
    total_active: int = 0
    on_track: int = 0
    early: int = 0
    warning: int = 0
    alert: int = 0
    critical: int = 0
    completed: int = 0                              
    avg_deviation_minutes: float = 0
    on_track_percentage: float = 0

class LiveOperationsResponse(BaseModel):
    trips: List[LiveTripStatus]
    summary: LiveOperationsSummary
    thresholds: DeviationThresholdConfigSchema
    last_updated: datetime



class QueueStatus(BaseModel):
    location_id: str
    location_type: str
    location_name: Optional[str]
    queue_count: int
    estimated_wait_minutes: float
    status: str                                 
    torpedoes_in_queue: List[str] = []




class ShiftPerformance(BaseModel):
    shift_name: str
    total_trips: int
    completed_trips: int
    avg_cycle_time_minutes: float
    avg_deviation_minutes: float
    on_time_percentage: float
    total_delays: int








class IncomingTorpedo(BaseModel):
    trip_id: str
    torpedo_id: Optional[str]
    producer_id: str
    current_status: int
    status_label: str
    departed_at: Optional[datetime]               
    expected_arrival_at: Optional[datetime]
    eta_minutes: Optional[float]
    is_delayed: bool
    delay_minutes: Optional[float]

class ConsumerIncomingResponse(BaseModel):
    consumer_id: str
    incoming_torpedoes: List[IncomingTorpedo]
    total_incoming: int
    next_arrival_minutes: Optional[float]
    last_updated: datetime

class CurrentUserResponse(BaseModel):
    id: int
    username: str
    role: str
    user_id: Optional[str]
    email: Optional[str]
    last_login: Optional[datetime]
    created_at: Optional[datetime]

    class Config:
        from_attributes = True

class TripUpdate(BaseModel):
    producer_id: Optional[str] = Field(None, min_length=1, max_length=50)
    consumer_id: Optional[str] = Field(None, min_length=1, max_length=50)
    torpedo_id: Optional[str] = Field(None, max_length=50)

