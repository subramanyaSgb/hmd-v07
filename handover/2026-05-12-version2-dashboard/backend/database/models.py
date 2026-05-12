from sqlalchemy import Column, Integer, String, Float, Numeric, DateTime, Boolean, Date, UniqueConstraint, Index, ForeignKey
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func
from .engine import Base
from ..logger import logger

logger.info("Defining database models.")

class SoftDeleteMixin:
    deleted_at = Column(DateTime(timezone=True), nullable=True, index=True)

    def soft_delete(self):
        from datetime import datetime, timezone
        self.deleted_at = datetime.now(timezone.utc)

    def restore(self):
        self.deleted_at = None

    @property
    def is_deleted(self) -> bool:
        return self.deleted_at is not None

class User(SoftDeleteMixin, Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, unique=True, index=True)
    password = Column(String)                                            
    role = Column(String)                             
    user_id = Column(String, nullable=True)                    
    last_login = Column(DateTime(timezone=True), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    failed_login_attempts = Column(Integer, default=0)
    locked_until = Column(DateTime(timezone=True), nullable=True)

    email = Column(String(255), unique=True, index=True, nullable=True)

class LoginAttempt(Base):
    __tablename__ = "login_attempts"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)                                      
    ip_address = Column(String, index=True)
    user_agent = Column(String, nullable=True)
    success = Column(Boolean, default=False)
    failure_reason = Column(String, nullable=True)                                                 
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

    __table_args__ = (
        Index('idx_login_attempts_ip_time', 'ip_address', 'timestamp'),
        Index('idx_login_attempts_user_time', 'username', 'timestamp'),
    )

class LocationCoordinate(Base):
    __tablename__ = "locations_coordinates"

    id = Column(Integer, primary_key=True, index=True)
    location_name = Column(String, index=True)
    user_id = Column(String, index=True, nullable=True)                         
    type = Column(String)
    x = Column(Float)
    y = Column(Float)
    is_visible = Column(Boolean, default=True)
    status = Column(String, default="Operating")                                    
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class FleetLiveLocation(Base):
    __tablename__ = "fleet_live_locations"

    id = Column(Integer, primary_key=True, index=True)
    fleet_id = Column(String, index=True)
    type = Column(String)
    x = Column(Float)
    y = Column(Float)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_fleet_live_latest', "fleet_id", last_updated.desc()),
    )

class DailyPlan(Base):
    __tablename__ = "daily_plans"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, index=True)
    user_id = Column(String, index=True)
    role = Column(String)                      
    capacity = Column(Float)
    status = Column(String, default="Primary")                                                           
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('date', 'user_id', name='_date_user_uc'),
        Index('idx_daily_plan_date_user', 'date', 'user_id'),
    )

class MaintenanceSchedule(Base):
    __tablename__ = "maintenance_schedules"

    id = Column(Integer, primary_key=True, index=True)
    node_id = Column(String, index=True)                    
    start_date = Column(Date, index=True)
    end_date = Column(Date, index=True)
    reason = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class NodeStatusHistory(Base):
    __tablename__ = "node_status_history"

    id = Column(Integer, primary_key=True, index=True)
    node_id = Column(String, index=True)                                 
    old_status = Column(String, nullable=True)                                                 
    new_status = Column(String)                                                                     
    changed_by = Column(String)                                                
    changed_by_role = Column(String)                                                         
    reason = Column(String, nullable=True)                                            
    changed_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)                                                          

    __table_args__ = (
        Index('idx_node_status_history_node_time', 'node_id', 'changed_at'),
    )

class Converter(SoftDeleteMixin, Base):
    __tablename__ = "converters"

    id = Column(Integer, primary_key=True, index=True)
    consumer_id = Column(String, index=True)                                               
    name = Column(String)                                                                 
    capacity_tons = Column(Float, default=0)                               
    max_heats = Column(Integer, default=3000)                                          
    current_heats = Column(Integer, default=0)                             
    status = Column(String, default="Running")                                                  
    equipment_type = Column(String, default="BOF", index=True)                       
    status_since = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        UniqueConstraint('consumer_id', 'name', name='_consumer_converter_name_uc'),
        Index('idx_converter_consumer_status', 'consumer_id', 'status'),
    )

class TripConverterDistribution(Base):
    __tablename__ = "trip_converter_distributions"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(String, ForeignKey('trips.trip_id', ondelete='CASCADE'), index=True)
    converter_id = Column(Integer, ForeignKey('converters.id', ondelete='SET NULL'), nullable=True)
    quantity_tons = Column(Float)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    trip = relationship("Trip", back_populates="converter_distributions")
    converter = relationship("Converter")

    __table_args__ = (
        Index('idx_trip_converter_dist', 'trip_id', 'converter_id'),
    )

class ConverterStatusHistory(Base):
    __tablename__ = "converter_status_history"

    id = Column(Integer, primary_key=True, index=True)
    converter_id = Column(Integer, ForeignKey('converters.id', ondelete='CASCADE'), index=True)
    old_status = Column(String, nullable=True)
    new_status = Column(String)                                                                 
    changed_by = Column(String)
    changed_by_role = Column(String)
    reason = Column(String, nullable=True)
    changed_at = Column(DateTime(timezone=True), server_default=func.now())
    ended_at = Column(DateTime(timezone=True), nullable=True)
    heats_at_change = Column(Integer, default=0)                                                 

    __table_args__ = (
        Index('idx_converter_history_time', 'converter_id', 'changed_at'),
    )

class TripTimeConfig(Base):
    __tablename__ = "trip_time_configs"

    id = Column(Integer, primary_key=True, index=True)
    source_user_id = Column(String, index=True)
    destination_user_id = Column(String, index=True)
    travel_time = Column(Integer, default=0)

    __table_args__ = (UniqueConstraint('source_user_id', 'destination_user_id', name='_source_dest_uc'),)

class ConsumerConfig(Base):
    __tablename__ = "consumer_configs"

    id = Column(Integer, primary_key=True, index=True)
    consumer_user_id = Column(String, unique=True, index=True)                      
    avg_unload_time = Column(Integer, default=0)               
    estimated_wait_time = Column(Integer, default=0)           
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ProducerConfig(Base):
    __tablename__ = "producer_configs"

    id = Column(Integer, primary_key=True, index=True)
    producer_user_id = Column(String, unique=True, index=True)                       
    avg_fill_time = Column(Integer, default=0)                 
    estimated_wait_time = Column(Integer, default=0)           
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class FleetManagement(SoftDeleteMixin, Base):
    __tablename__ = "fleet_management"

    id = Column(Integer, primary_key=True, index=True)
    fleet_id = Column(String, unique=True, index=True)
    type = Column(String)                
    status = Column(String, default="Operating")                          
    capacity = Column(Float, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    trip_records = relationship("Trip", back_populates="torpedo")

class UserActivity(Base):
    __tablename__ = "user_activities"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String, index=True)
    user_id = Column(String, nullable=True)
    user_role = Column(String, nullable=True)                             
    action = Column(String, index=True)                                                     
    entity_type = Column(String, nullable=True, index=True)                                             
    entity_id = Column(String, nullable=True)                             
    details = Column(String, nullable=True)
    old_value = Column(String, nullable=True)                                  
    new_value = Column(String, nullable=True)                             
    ip_address = Column(String, nullable=True)
    user_agent = Column(String, nullable=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now(), index=True)

class Notification(Base):
    __tablename__ = "notifications"

    id = Column(Integer, primary_key=True, index=True)
    recipient_id = Column(String, index=True)
    sender = Column(String, default="Admin")
    message = Column(String)
    is_read = Column(Boolean, default=False)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())

class DistributionAssignment(Base):
    __tablename__ = "distribution_assignments"

    id = Column(Integer, primary_key=True, index=True)
    date = Column(Date, index=True)
    producer_id = Column(String, index=True)
    consumer_id = Column(String, index=True)
    quantity = Column(Float)
    trips = Column(Integer)                                    
    travel_time = Column(Integer)
    status = Column(String, default="Proposed")                      
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    
    trip_records = relationship("Trip", back_populates="assignment")

class Trip(SoftDeleteMixin, Base):
    __tablename__ = "trips"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(String, unique=True, index=True)                               

    assignment_id = Column(Integer, ForeignKey('distribution_assignments.id', ondelete='CASCADE'), index=True, nullable=True)
    
    producer_id = Column(String, index=True)
    consumer_id = Column(String, index=True)
    
    torpedo_id = Column(String, ForeignKey('fleet_management.fleet_id', ondelete='SET NULL'), index=True, nullable=True)
    
    status = Column(Integer, default=0, index=True)                                              
    
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    assigned_at = Column(DateTime(timezone=True), nullable=True)
    
    p_entered_at = Column(DateTime(timezone=True), nullable=True)
    p_loading_start_at = Column(DateTime(timezone=True), nullable=True)
    p_loading_end_at = Column(DateTime(timezone=True), nullable=True)
    p_exited_at = Column(DateTime(timezone=True), nullable=True)
    
    c_entered_at = Column(DateTime(timezone=True), nullable=True)
    c_unloading_start_at = Column(DateTime(timezone=True), nullable=True)
    c_unloading_end_at = Column(DateTime(timezone=True), nullable=True)
    c_exited_at = Column(DateTime(timezone=True), nullable=True)

    cycle_time_minutes = Column(Float, nullable=True)                                                            

    expected_duration_minutes = Column(Float, nullable=True)                             

    expected_p_entered_at = Column(DateTime(timezone=True), nullable=True)                                                   
    expected_p_loading_start_at = Column(DateTime(timezone=True), nullable=True)                                  
    expected_p_loading_end_at = Column(DateTime(timezone=True), nullable=True)                                            
    expected_p_exited_at = Column(DateTime(timezone=True), nullable=True)                                             
    expected_c_entered_at = Column(DateTime(timezone=True), nullable=True)                                         
    expected_c_unloading_start_at = Column(DateTime(timezone=True), nullable=True)                                 
    expected_c_unloading_end_at = Column(DateTime(timezone=True), nullable=True)                                               
    expected_c_exited_at = Column(DateTime(timezone=True), nullable=True)                                                

    wb_tare_entry_at = Column(DateTime(timezone=True), nullable=True)                                                
    wb_tare_recorded_at = Column(DateTime(timezone=True), nullable=True)                                   
    wb_gross_entry_at = Column(DateTime(timezone=True), nullable=True)                                              
    wb_gross_recorded_at = Column(DateTime(timezone=True), nullable=True)                                   

    expected_wb_tare_entry_at = Column(DateTime(timezone=True), nullable=True)
    expected_wb_tare_recorded_at = Column(DateTime(timezone=True), nullable=True)
    expected_wb_gross_entry_at = Column(DateTime(timezone=True), nullable=True)
    expected_wb_gross_recorded_at = Column(DateTime(timezone=True), nullable=True)

    tare_weight_kg = Column(Float, nullable=True)
    gross_weight_kg = Column(Float, nullable=True)
    net_weight_kg = Column(Float, nullable=True)                                  

    shift = Column(String, nullable=True)                                                          

    delay_cost = Column(Float, nullable=True)                             
    operational_cost = Column(Float, nullable=True)

    converter_id = Column(Integer, ForeignKey('converters.id', ondelete='SET NULL'), nullable=True)

    equipment_id = Column(Integer, ForeignKey('converters.id', ondelete='SET NULL'), nullable=True)

    temperature_at_loading = Column(Float, nullable=True)       
    temperature_at_unloading = Column(Float, nullable=True)     
    temperature_loss = Column(Float, nullable=True)                     

    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
    
    assignment = relationship("DistributionAssignment", back_populates="trip_records")
    torpedo = relationship("FleetManagement", back_populates="trip_records")
    converter = relationship("Converter", foreign_keys=[converter_id])
    equipment = relationship("Converter", foreign_keys=[equipment_id])
    weighbridge_records = relationship("WeighbridgeRecord", back_populates="trip")
    converter_distributions = relationship("TripConverterDistribution", back_populates="trip", cascade="all, delete-orphan")

class RoutingConstraint(Base):
    __tablename__ = "routing_constraints"

    id = Column(Integer, primary_key=True, index=True)
    producer_id = Column(String, index=True)
    consumer_id = Column(String, index=True)

    __table_args__ = (UniqueConstraint('producer_id', 'consumer_id', name='_prod_cons_uc'),)

class Weighbridge(Base):
    __tablename__ = "weighbridges"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String, unique=True, index=True)                       
    location_name = Column(String, nullable=True)                                  
    x = Column(Float, nullable=True)                                
    y = Column(Float, nullable=True)                                 
    status = Column(String, default="Operating")                                            
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class WeighbridgeRecord(Base):
    __tablename__ = "weighbridge_records"

    id = Column(Integer, primary_key=True, index=True)
    trip_id = Column(String, ForeignKey('trips.trip_id', ondelete='CASCADE'), index=True)
    torpedo_id = Column(String, ForeignKey('fleet_management.fleet_id', ondelete='SET NULL'), index=True, nullable=True)
    weighbridge_id = Column(Integer, ForeignKey('weighbridges.id', ondelete='SET NULL'), index=True, nullable=True)
    record_type = Column(String, index=True)                                 
    weight_kg = Column(Float)
    cast_id = Column(String, nullable=True)                                        
    furnace_id = Column(String, nullable=True)                                                
    recorded_by = Column(String)                                                
    recorded_at = Column(DateTime(timezone=True), server_default=func.now())
    source = Column(String, default="manual")                                                     
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    trip = relationship("Trip", back_populates="weighbridge_records")

    __table_args__ = (
        UniqueConstraint('trip_id', 'record_type', name='_trip_record_type_uc'),
        Index('idx_wb_record_trip_type', 'trip_id', 'record_type'),
    )

class SystemConfig(Base):
    __tablename__ = "system_configs"

    id = Column(Integer, primary_key=True, index=True)
    config_key = Column(String, unique=True, index=True)
    config_value = Column(String)
    description = Column(String, nullable=True)

class DeviationThresholdConfig(Base):
    __tablename__ = "deviation_threshold_configs"

    id = Column(Integer, primary_key=True, index=True)
    warning_threshold_minutes = Column(Integer, default=10)                
    alert_threshold_minutes = Column(Integer, default=20)                  
    critical_threshold_minutes = Column(Integer, default=30)
    auto_refresh_interval_seconds = Column(Integer, default=5)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class ShiftConfig(Base):
    __tablename__ = "shift_configs"

    id = Column(Integer, primary_key=True, index=True)
    shift_name = Column(String, unique=True)                               
    start_hour = Column(Integer)                           
    end_hour = Column(Integer)
    is_active = Column(Boolean, default=True)
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class NotificationPreference(Base):
    __tablename__ = "notification_preferences"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(String, unique=True, index=True)                                              
    push_enabled = Column(Boolean, default=True)
    sms_enabled = Column(Boolean, default=False)
    email_enabled = Column(Boolean, default=True)
    phone_number = Column(String, nullable=True)
    alert_on_warning = Column(Boolean, default=False)
    alert_on_alert = Column(Boolean, default=True)
    alert_on_critical = Column(Boolean, default=True)
    alert_on_queue_threshold = Column(Boolean, default=True)
    queue_threshold = Column(Integer, default=5)                                 

    whatsapp_enabled = Column(Boolean, default=False)
    whatsapp_phone = Column(String, nullable=True)                                                   
    whatsapp_language = Column(String, default="en")                                                 
    whatsapp_trip_alerts = Column(Boolean, default=True)
    whatsapp_daily_report = Column(Boolean, default=True)
    whatsapp_deviation_alerts = Column(Boolean, default=True)

    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

class SavedReport(Base):
    __tablename__ = "saved_reports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    report_type = Column(String)
    filters = Column(String)
    created_by = Column(String, index=True)
    is_shared = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_accessed = Column(DateTime(timezone=True), nullable=True)

class ScheduledReport(Base):
    __tablename__ = "scheduled_reports"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String)
    report_type = Column(String)
    filters = Column(String)
    schedule_type = Column(String)
    schedule_time = Column(String)
    schedule_day = Column(Integer, nullable=True)
    recipients = Column(String)
    export_format = Column(String)
    is_active = Column(Boolean, default=True)
    last_run = Column(DateTime(timezone=True), nullable=True)
    next_run = Column(DateTime(timezone=True), nullable=True)
    created_by = Column(String)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

class ReportHistory(Base):
    __tablename__ = "report_history"

    id = Column(Integer, primary_key=True, index=True)
    report_type = Column(String)
    filters = Column(String)
    generated_by = Column(String)
    format_used = Column(String)
    file_path = Column(String, nullable=True)
    record_count = Column(Integer)
    generated_at = Column(DateTime(timezone=True), server_default=func.now())

class WhatsAppGroupMapping(Base):
    __tablename__ = "whatsapp_group_mappings"

    id = Column(Integer, primary_key=True, index=True)
    group_jid = Column(String, index=True)                                                         
    group_name = Column(String)                                                     
    mapping_type = Column(String, index=True)                                                    
    node_id = Column(String, nullable=True, index=True)                                                  
    language_code = Column(String, default="en")                                                           
    is_active = Column(Boolean, default=True)
    notifications_enabled = Column(Boolean, default=True)

    notify_trip_assigned = Column(Boolean, default=True)
    notify_trip_started = Column(Boolean, default=True)
    notify_trip_completed = Column(Boolean, default=True)
    notify_deviations = Column(Boolean, default=True)
    notify_daily_report = Column(Boolean, default=True)

    created_at = Column(DateTime(timezone=True), server_default=func.now())
    last_updated = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    __table_args__ = (
        Index('idx_whatsapp_group_type_node', 'mapping_type', 'node_id'),
    )

class WhatsAppMessageLog(Base):
    __tablename__ = "whatsapp_message_logs"

    id = Column(Integer, primary_key=True, index=True)
    recipient_type = Column(String, index=True)                                
    recipient_id = Column(String, index=True)                                      
    recipient_name = Column(String, nullable=True)                                    
    message_type = Column(String, index=True)                                                                                   
    message_content = Column(String)                                         
    language_code = Column(String, default="en")
    related_entity_type = Column(String, nullable=True)                         
    related_entity_id = Column(String, nullable=True)                             
    status = Column(String, default="pending", index=True)                                            
    error_message = Column(String, nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    sent_at = Column(DateTime(timezone=True), nullable=True)

    __table_args__ = (
        Index('idx_whatsapp_log_status_created', 'status', 'created_at'),
    )

class WbatnglTripMirror(Base):
    """
    Read-only mirror of JSW WBATNGL trip-transaction data. Populated by the
    `wbatngl_trip_sync` background job, consumed by `/api/jsw/*` endpoints.

    NOT to be joined to or mutated from the existing manual-trip flow — see
    docs/plans/2026-05-08-wbatngl-trip-mirror-design.md (Topic 5: strict
    separation).

    Index drift note: only the `fleet_id` and `updated_date` indexes are
    declared on the ORM. The composite `(source_lab, destination)` index and
    the partial chemistry index (on `updated_date` WHERE temp/si_l/s_l IS NOT
    NULL) live exclusively in migration `8ccb1a387ca7`. The partial index is
    not expressible in declarative SQLAlchemy without raw `text()`, so we
    accept that `alembic revision --autogenerate` will propose phantom diffs
    for those two indexes — those diffs must be discarded, not applied.
    """
    __tablename__ = "wbatngl_trip_mirror"

    id = Column(Integer, primary_key=True)
    trip_id = Column(String(50), unique=True, nullable=False, index=True)
    tap_no = Column(Integer)
    ladleno_raw = Column(String(15))
    fleet_id = Column(String(15), index=True)
    source_lab = Column(String(10))
    destination = Column(String(50))
    tap_hole = Column(Integer)

    gross_weight = Column(Float)
    tare_weight = Column(Float)
    net_weight = Column(Float)

    temp = Column(Float)
    si_l = Column(Float)
    s_l = Column(Float)
    bds_temp = Column(Float)

    shift = Column(String(2))
    source_table = Column(String(60))

    first_tare_time = Column(DateTime)
    out_date = Column(DateTime)
    closetime = Column(DateTime)
    received_date = Column(DateTime)
    sms_ack_time = Column(DateTime)
    updated_date = Column(DateTime, index=True)

    synced_at = Column(DateTime, server_default=func.now())

class Alert(Base):
    """
    System-detected alerts surfaced on the Version 2 dashboard "Alerts &
    Exceptions" feed. Inserted by `utils/alert_detector.py` during the
    WBATNGL trip sync (chemistry / cold-metal / dwell / no-sms-ack) and
    the SuVeechi GPS sync (gps-stale / battery).

    Lifecycle: detector inserts a row when a sample breaches threshold,
    `acknowledged_at` / `acknowledged_by` get set when a user clicks
    Acknowledge from the dashboard, beyond that the row is immutable.

    Dedupe: detector skips insertion if a non-acknowledged alert of the
    same `(kind, torpedo_id)` exists in the last 30 minutes. Prevents
    every 60s WBATNGL tick from re-inserting the same cold-metal alert
    on an unchanged closetime row.

    NOT joined to the manual `Trip` flow — `trip_id` is a free-text
    pointer to `WbatnglTripMirror.trip_id` (which itself is a string
    like "74649TLC011205262026"). Same separation rule as the mirror
    tables (see WbatnglTripMirror docstring).
    """
    __tablename__ = "alerts"

    id              = Column(Integer, primary_key=True, index=True)
    kind            = Column(String(20), index=True)                            # cold | chem_s | chem_si | dwell | gps_stale | sms_ack | battery
    severity        = Column(String(10))                                        # high | med | low
    tag             = Column(String(40))                                        # short display label, e.g. "COLD METAL", "HIGH S", "GPS STALE"
    message         = Column(String(255))                                       # full sentence shown in the feed
    location        = Column(String(80), nullable=True)                         # "BF4 → SMS2" / "SMS3" / "Yard"
    torpedo_id      = Column(String(20), nullable=True, index=True)
    trip_id         = Column(String(50), nullable=True, index=True)
    source          = Column(String(20), nullable=True)
    destination     = Column(String(50), nullable=True)
    raw_value       = Column(Float,      nullable=True)                         # the breaching number — temp/s_l/si_l/dwell_min/battery_pct
    threshold       = Column(Float,      nullable=True)                         # the configured limit
    detected_at     = Column(DateTime(timezone=True), server_default=func.now(), index=True)
    acknowledged_at = Column(DateTime(timezone=True), nullable=True)
    acknowledged_by = Column(String(40), nullable=True)

    __table_args__ = (
        Index('idx_alerts_kind_torpedo_active', 'kind', 'torpedo_id', 'acknowledged_at'),
        Index('idx_alerts_detected_desc', detected_at.desc()),
    )


class HtsHeatMirror(Base):
    """
    Mirror of HTS.VW_HTS_HOTMETAL_DATA from JSW Oracle HTS DB.
    Populated by hts_sync.py every 5 minutes.

    HEAT_NO is the natural primary key (confirmed unique in 11-May
    inventory: 123 distinct heat_nos / 123 rows). One torpedo can pour
    to multiple heats — see HTS sample rows where TLC-22 fed both
    E2030590 and G2030594.
    """
    __tablename__ = "hts_heat_mirror"

    id = Column(Integer, primary_key=True)
    heat_no = Column(String(20), unique=True, nullable=False, index=True)
    converter_no = Column(String(1))
    sms = Column(String(10))                # Hari's new column once shipped
    torpedo_no = Column(String(15), index=True)        # normalized "TLC-22"
    torpedo_no_raw = Column(String(15))                # original "22"
    hotmetal_qty = Column(Numeric(10, 3))
    torpedo_qty = Column(Numeric(10, 3))
    torpedo_in_time = Column(DateTime, index=True)
    torpedo_out_time = Column(DateTime, index=True)
    converter_life = Column(Integer)
    synced_at = Column(DateTime, server_default=func.now())
