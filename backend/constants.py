
from enum import IntEnum

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
                                                    
    CANCELED = 14                                             
    ABORTED = 15                                                  

    @classmethod
    def is_completed(cls, status: int) -> bool:
        return status == cls.COMPLETED

    @classmethod
    def is_terminal(cls, status: int) -> bool:
        return status in (cls.COMPLETED, cls.CANCELED, cls.ABORTED)

    @classmethod
    def is_active(cls, status: int) -> bool:
        return cls.PENDING <= status < cls.COMPLETED

    @classmethod
    def is_at_producer(cls, status: int) -> bool:
        return cls.PRODUCER_ENTERED <= status <= cls.PRODUCER_EXITED

    @classmethod
    def is_at_consumer(cls, status: int) -> bool:
        return cls.CONSUMER_ENTERED <= status <= cls.UNLOADING_ENDED

    @classmethod
    def is_in_transit(cls, status: int) -> bool:
        return status == cls.PRODUCER_EXITED

    @classmethod
    def is_at_weighbridge(cls, status: int) -> bool:
        return status in (cls.WB_TARE_ENTRY, cls.WB_TARE_RECORDED, cls.WB_GROSS_ENTRY, cls.WB_GROSS_RECORDED)

    @classmethod
    def can_cancel(cls, status: int) -> bool:
                                                
        return status in (cls.PENDING, cls.ASSIGNED, cls.WB_TARE_ENTRY,
                         cls.WB_TARE_RECORDED, cls.PRODUCER_ENTERED,
                         cls.LOADING_STARTED, cls.LOADING_ENDED)

    @classmethod
    def can_abort(cls, status: int) -> bool:
                                          
        return cls.PENDING <= status <= cls.UNLOADING_ENDED

VALID_TRIP_TRANSITIONS = {
    TripStatus.PENDING: [TripStatus.ASSIGNED, TripStatus.CANCELED],
    TripStatus.ASSIGNED: [TripStatus.WB_TARE_ENTRY, TripStatus.CANCELED],
    TripStatus.WB_TARE_ENTRY: [TripStatus.WB_TARE_RECORDED, TripStatus.CANCELED, TripStatus.ABORTED],
    TripStatus.WB_TARE_RECORDED: [TripStatus.PRODUCER_ENTERED, TripStatus.CANCELED, TripStatus.ABORTED],
    TripStatus.PRODUCER_ENTERED: [TripStatus.LOADING_STARTED, TripStatus.CANCELED, TripStatus.ABORTED],
    TripStatus.LOADING_STARTED: [TripStatus.LOADING_ENDED, TripStatus.CANCELED, TripStatus.ABORTED],
    TripStatus.LOADING_ENDED: [TripStatus.PRODUCER_EXITED, TripStatus.CANCELED, TripStatus.ABORTED],
    TripStatus.PRODUCER_EXITED: [TripStatus.WB_GROSS_ENTRY, TripStatus.ABORTED],
    TripStatus.WB_GROSS_ENTRY: [TripStatus.WB_GROSS_RECORDED, TripStatus.ABORTED],
    TripStatus.WB_GROSS_RECORDED: [TripStatus.CONSUMER_ENTERED, TripStatus.ABORTED],
    TripStatus.CONSUMER_ENTERED: [TripStatus.UNLOADING_STARTED, TripStatus.ABORTED],
    TripStatus.UNLOADING_STARTED: [TripStatus.UNLOADING_ENDED, TripStatus.ABORTED],
    TripStatus.UNLOADING_ENDED: [TripStatus.COMPLETED, TripStatus.ABORTED],
    TripStatus.COMPLETED: [],
    TripStatus.CANCELED: [],
    TripStatus.ABORTED: [],
}

def is_valid_transition(from_status: int, to_status: int) -> bool:
    valid_next = VALID_TRIP_TRANSITIONS.get(from_status, [])
    return to_status in valid_next

TRIP_STATUS_LABELS = {
    TripStatus.PENDING: "Pending",
    TripStatus.ASSIGNED: "Assigned",
    TripStatus.WB_TARE_ENTRY: "WB Tare Entry",
    TripStatus.WB_TARE_RECORDED: "Tare Recorded",
    TripStatus.PRODUCER_ENTERED: "Producer Entered",
    TripStatus.LOADING_STARTED: "Loading Started",
    TripStatus.LOADING_ENDED: "Loading Ended",
    TripStatus.PRODUCER_EXITED: "Producer Exited",
    TripStatus.WB_GROSS_ENTRY: "WB Gross Entry",
    TripStatus.WB_GROSS_RECORDED: "Gross Recorded",
    TripStatus.CONSUMER_ENTERED: "Consumer Entered",
    TripStatus.UNLOADING_STARTED: "Unloading Started",
    TripStatus.UNLOADING_ENDED: "Unloading Ended",
    TripStatus.COMPLETED: "Completed",
    TripStatus.CANCELED: "Canceled",
    TripStatus.ABORTED: "Aborted",
}

class StuckTripThresholds:
    PENDING = 60                                         
    ASSIGNED = 45                                                  
    WB_TARE_ENTRY = 20                                                     
    WB_TARE_RECORDED = 30                                       
    PRODUCER_ENTERED = 30                                   
    LOADING_STARTED = 60                      
    LOADING_ENDED = 15                                         
    PRODUCER_EXITED = 30                                           
    WB_GROSS_ENTRY = 20                                                     
    WB_GROSS_RECORDED = 30                                      
    CONSUMER_ENTERED = 30                                     
    UNLOADING_STARTED = 60                      
    UNLOADING_ENDED = 15                                 

    @classmethod
    def get_threshold(cls, status: int) -> int:
        thresholds = {
            TripStatus.PENDING: cls.PENDING,
            TripStatus.ASSIGNED: cls.ASSIGNED,
            TripStatus.WB_TARE_ENTRY: cls.WB_TARE_ENTRY,
            TripStatus.WB_TARE_RECORDED: cls.WB_TARE_RECORDED,
            TripStatus.PRODUCER_ENTERED: cls.PRODUCER_ENTERED,
            TripStatus.LOADING_STARTED: cls.LOADING_STARTED,
            TripStatus.LOADING_ENDED: cls.LOADING_ENDED,
            TripStatus.PRODUCER_EXITED: cls.PRODUCER_EXITED,
            TripStatus.WB_GROSS_ENTRY: cls.WB_GROSS_ENTRY,
            TripStatus.WB_GROSS_RECORDED: cls.WB_GROSS_RECORDED,
            TripStatus.CONSUMER_ENTERED: cls.CONSUMER_ENTERED,
            TripStatus.UNLOADING_STARTED: cls.UNLOADING_STARTED,
            TripStatus.UNLOADING_ENDED: cls.UNLOADING_ENDED,
        }
        return thresholds.get(status, 120)                   

class DeviationThreshold:
    ON_TIME_MAX = 10                         
    WARNING_MAX = 20                          
    ALERT_MAX = 30                          
                       
    @classmethod
    def get_category(cls, deviation_minutes: float) -> str:
        if deviation_minutes < 0:
            return "early"
        elif deviation_minutes <= cls.ON_TIME_MAX:
            return "on_time"
        elif deviation_minutes <= cls.WARNING_MAX:
            return "warning"
        elif deviation_minutes <= cls.ALERT_MAX:
            return "alert"
        else:
            return "critical"

    @classmethod
    def is_on_time(cls, deviation_minutes: float) -> bool:
        return deviation_minutes <= cls.ON_TIME_MAX

class DefaultTimes:
    TRAVEL_TO_PRODUCER = 15                                                 
    EXIT_BUFFER = 5                                                       
    WAIT_TIME = 10                                           
    FILL_TIME = 30                                  
    UNLOAD_TIME = 20                                  
    TRAVEL_TIME = 25                                             

class WeighbridgeDefaultTimes:
    TRAVEL_TO_WEIGHBRIDGE = 10                                             
    WEIGHBRIDGE_PROCESS_TIME = 10                              
    TRAVEL_WB_TO_PRODUCER = 10                                     
    TRAVEL_PRODUCER_TO_WB = 10                                          
    TRAVEL_WB_TO_CONSUMER = 15                                     

class SeverityLevel:
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"

    HIGH_DELAY_THRESHOLD = 20                
    HIGH_DELAY_PERCENT = 30                     
    MEDIUM_DELAY_THRESHOLD = 10              
    MEDIUM_DELAY_PERCENT = 15                   

    @classmethod
    def calculate(cls, avg_delay: float, delay_pct: float) -> str:
        if avg_delay > cls.HIGH_DELAY_THRESHOLD or delay_pct > cls.HIGH_DELAY_PERCENT:
            return cls.HIGH
        elif avg_delay > cls.MEDIUM_DELAY_THRESHOLD or delay_pct > cls.MEDIUM_DELAY_PERCENT:
            return cls.MEDIUM
        return cls.LOW

class FleetStatus:
    OPERATING = "Operating"
    ASSIGNED = "Assigned"
    MAINTENANCE = "Maintenance"
    IDLE = "Idle"

    @classmethod
    def active_statuses(cls) -> list:
        return [cls.OPERATING, cls.ASSIGNED]

class PlanStatus:
    PRIMARY = "primary"
    REVISED = "revised"
    CONFIRMED = "confirmed"

class Pagination:
    DEFAULT_PAGE_SIZE = 50
    MAX_PAGE_SIZE = 500

class CacheTTL:
    DASHBOARD = 300                    
    ANALYTICS = 300                    
    FLEET = 600                         
    REPORTS = 900                       
