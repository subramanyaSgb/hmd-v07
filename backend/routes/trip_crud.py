
from fastapi import APIRouter, Depends, HTTPException, Query, Request
from datetime import date, datetime
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import select, func
from sqlalchemy.exc import IntegrityError, SQLAlchemyError, OperationalError
from slowapi import Limiter
from slowapi.util import get_remote_address
from pydantic import BaseModel, EmailStr

from ..database.engine import get_db
from ..database.models import (
    Trip, DistributionAssignment, FleetManagement, Notification, User
)
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.security import get_current_user_required, require_roles
from ..utils.rate_limit import rate_limit_medium, rate_limit_low
from ..utils.soft_delete import active_only, soft_delete
from ..schemas import TripCreate, TripUpdate, TripStatus
from ..constants import TripStatus as TripStatusEnum, DeviationThreshold
from ..utils.cache import fleet_cache

from .trip_lifecycle import utc_now, calculate_expected_times

router = APIRouter(prefix="/api/trips", tags=["trip-crud"])

limiter = Limiter(key_func=get_remote_address)

@router.post("/manual")
@limiter.limit(rate_limit_medium)
async def create_manual_trip(
    request: Request,
    data: TripCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "trs"))
):
    today = date.today()

    manual_count = db.query(Trip).filter(Trip.trip_id.like(f"MT_{today.strftime('%Y%m%d')}_%")).count()
    trip_id = f"MT_{today.strftime('%Y%m%d')}_{data.producer_id}_{data.consumer_id}_{manual_count + 1:03d}"

    new_trip = Trip(
        trip_id=trip_id,
        producer_id=data.producer_id,
        consumer_id=data.consumer_id,
        status=TripStatus.PENDING
    )

    if data.torpedo_id:
                                                               
        try:
            torpedo = db.execute(
                select(FleetManagement)
                .where(FleetManagement.fleet_id == data.torpedo_id)
                .with_for_update(nowait=True)
            ).scalar_one_or_none()
        except OperationalError:
            raise HTTPException(status_code=409, detail="Torpedo is currently being assigned by another request")

        if not torpedo:
            raise HTTPException(status_code=404, detail="Torpedo not found")

        if torpedo.status != "Operating":
            raise HTTPException(status_code=400, detail=f"Torpedo {data.torpedo_id} is not available (status: {torpedo.status})")

        busy = db.query(Trip).filter(
            Trip.torpedo_id == data.torpedo_id,
            Trip.status >= TripStatus.ASSIGNED,
            Trip.status <= TripStatus.UNLOADING_ENDED
        ).first()

        if busy:
            raise HTTPException(status_code=400, detail="Selected torpedo is already in an active trip")

        new_trip.torpedo_id = data.torpedo_id
        new_trip.status = TripStatus.ASSIGNED
        new_trip.assigned_at = utc_now()
        torpedo.status = "Assigned"

        calculate_expected_times(db, new_trip, new_trip.assigned_at)

        db.add(Notification(
            recipient_id=data.producer_id,
            sender="System Admin",
            message=f"Manual Trip Created & Assigned: {trip_id} with Torpedo {data.torpedo_id}"
        ))
        db.add(Notification(
            recipient_id=data.consumer_id,
            sender="System Admin",
            message=f"Manual Trip Created & Assigned: {trip_id} with Torpedo {data.torpedo_id}"
        ))

    try:
        db.add(new_trip)
        db.commit()
        db.refresh(new_trip)
        log_activity(db, current_user.username, "MANUAL_TRIP_CREATED", f"Manually created trip {trip_id}")

        if data.torpedo_id:
            fleet_cache.invalidate("fleet_management")

        return {"status": "success", "trip_id": new_trip.trip_id, "message": f"Trip {trip_id} created successfully"}
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Manual trip creation integrity error: {e}")
        raise HTTPException(status_code=409, detail="Trip ID already exists")
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error creating trip: {e}")
        raise HTTPException(status_code=500, detail="Failed to create trip")

@router.get("/active")
async def get_active_trips(
    user_id: Optional[str] = None,
    role: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                                   
    query = active_only(db.query(Trip)).filter(Trip.status < TripStatus.COMPLETED)

    if current_user.role == 'producer':
        query = query.filter(Trip.producer_id == current_user.user_id)
    elif current_user.role == 'consumer':
        query = query.filter(Trip.consumer_id == current_user.user_id)
    elif role == 'producer' and user_id:
        query = query.filter(Trip.producer_id == user_id)
    elif role == 'consumer' and user_id:
        query = query.filter(Trip.consumer_id == user_id)

    trips = query.order_by(Trip.status.desc(), Trip.created_at.desc()).all()

    result = []
    for t in trips:
        trip_dict = {c.name: getattr(t, c.name) for c in t.__table__.columns}
        trip_dict["converter_name"] = t.converter.name if t.converter else None
        result.append(trip_dict)
    return result

def calculate_trip_deviation(trip: Trip) -> tuple:
    if not trip.c_exited_at or not trip.expected_c_exited_at:
        return None, None

    deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60

    category = DeviationThreshold.get_category(deviation)
    status = "on_track" if category == "on_time" else category

    return round(deviation, 1), status

@router.get("/history")
async def get_trip_history(
    page: int = Query(1, ge=1),
    page_size: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                                   
    query = active_only(db.query(Trip)).filter(Trip.status == TripStatus.COMPLETED)

    if current_user.role == 'producer':
        query = query.filter(Trip.producer_id == current_user.user_id)
    elif current_user.role == 'consumer':
        query = query.filter(Trip.consumer_id == current_user.user_id)

    total = query.count()
    trips = query.order_by(Trip.c_exited_at.desc()).offset((page - 1) * page_size).limit(page_size).all()

    enriched_trips = []
    for trip in trips:
        deviation_minutes, deviation_status = calculate_trip_deviation(trip)

        enriched_trips.append({
            "id": trip.id,
            "trip_id": trip.trip_id,
            "assignment_id": trip.assignment_id,
            "producer_id": trip.producer_id,
            "consumer_id": trip.consumer_id,
            "torpedo_id": trip.torpedo_id,
            "status": trip.status,
            "shift": trip.shift,
                                
            "converter_id": trip.converter_id,
            "converter_name": trip.converter.name if trip.converter else None,
                               
            "created_at": trip.created_at,
            "assigned_at": trip.assigned_at,
            "wb_tare_entry_at": trip.wb_tare_entry_at,
            "wb_tare_recorded_at": trip.wb_tare_recorded_at,
            "p_entered_at": trip.p_entered_at,
            "p_loading_start_at": trip.p_loading_start_at,
            "p_loading_end_at": trip.p_loading_end_at,
            "p_exited_at": trip.p_exited_at,
            "wb_gross_entry_at": trip.wb_gross_entry_at,
            "wb_gross_recorded_at": trip.wb_gross_recorded_at,
            "c_entered_at": trip.c_entered_at,
            "c_unloading_start_at": trip.c_unloading_start_at,
            "c_unloading_end_at": trip.c_unloading_end_at,
            "c_exited_at": trip.c_exited_at,
                              
            "tare_weight_kg": trip.tare_weight_kg,
            "gross_weight_kg": trip.gross_weight_kg,
            "net_weight_kg": trip.net_weight_kg,
                                 
            "expected_duration_minutes": trip.expected_duration_minutes,
            "expected_wb_tare_entry_at": trip.expected_wb_tare_entry_at,
            "expected_wb_tare_recorded_at": trip.expected_wb_tare_recorded_at,
            "expected_p_entered_at": trip.expected_p_entered_at,
            "expected_p_loading_start_at": trip.expected_p_loading_start_at,
            "expected_p_loading_end_at": trip.expected_p_loading_end_at,
            "expected_p_exited_at": trip.expected_p_exited_at,
            "expected_wb_gross_entry_at": trip.expected_wb_gross_entry_at,
            "expected_wb_gross_recorded_at": trip.expected_wb_gross_recorded_at,
            "expected_c_entered_at": trip.expected_c_entered_at,
            "expected_c_unloading_start_at": trip.expected_c_unloading_start_at,
            "expected_c_unloading_end_at": trip.expected_c_unloading_end_at,
            "expected_c_exited_at": trip.expected_c_exited_at,
                            
            "cycle_time_minutes": trip.cycle_time_minutes,
            "total_deviation_minutes": deviation_minutes,
            "deviation_status": deviation_status,
            "last_updated": trip.last_updated
        })

    return {
        "data": enriched_trips,
        "total": total,
        "page": page,
        "page_size": page_size,
        "total_pages": (total + page_size - 1) // page_size
    }

@router.get("/progress-summary")
async def get_trip_progress(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    today = date.today()

    plans = db.query(DistributionAssignment).filter(
        DistributionAssignment.date == today,
        DistributionAssignment.status == "Committed"
    ).all()

    assigned_trips = active_only(db.query(Trip)).join(
        DistributionAssignment, Trip.assignment_id == DistributionAssignment.id
    ).filter(DistributionAssignment.date == today).all()

    manual_trips = active_only(db.query(Trip)).filter(
        Trip.assignment_id == None,
        func.date(Trip.created_at) == today
    ).all()

    all_trips = assigned_trips + manual_trips

    route_stats = {}

    for p in plans:
        route_key = f"{p.producer_id} → {p.consumer_id}"
        route_stats[route_key] = {'route': route_key, 'planned': p.trips, 'active': 0, 'completed': 0}

    for t in all_trips:
        route_key = f"{t.producer_id} → {t.consumer_id}"
        if route_key not in route_stats:
            route_stats[route_key] = {'route': route_key, 'planned': 0, 'active': 0, 'completed': 0}

        if t.status == TripStatus.COMPLETED:
            route_stats[route_key]["completed"] += 1
        elif t.status > TripStatus.PENDING:
            route_stats[route_key]["active"] += 1

    return list(route_stats.values())

class TripHistoryEmailRequest(BaseModel):
    email: EmailStr
    date_from: Optional[str] = None
    date_to: Optional[str] = None

@router.post("/history/email")
async def email_trip_history(
    data: TripHistoryEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    from ..utils.email_service import email_service, FRONTEND_URL

    date_from = None
    date_to = None
    if data.date_from:
        try:
            date_from = datetime.strptime(data.date_from, "%Y-%m-%d").date()
        except ValueError:
            pass
    if data.date_to:
        try:
            date_to = datetime.strptime(data.date_to, "%Y-%m-%d").date()
        except ValueError:
            pass

    query = active_only(db.query(Trip)).filter(Trip.status == TripStatusEnum.COMPLETED)

    if current_user.role == 'producer':
        query = query.filter(Trip.producer_id == current_user.user_id)
    elif current_user.role == 'consumer':
        query = query.filter(Trip.consumer_id == current_user.user_id)

    if date_from:
        query = query.filter(func.date(Trip.c_exited_at) >= date_from)
    if date_to:
        query = query.filter(func.date(Trip.c_exited_at) <= date_to)

    trips = query.order_by(Trip.c_exited_at.desc()).limit(200).all()                   

    date_range_str = f"{date_from or 'All'} to {date_to or 'All'}"

    total_trips = len(trips)
    on_time_early = 0
    delayed = 0
    total_deviation = 0
    total_cycle_time = 0
    deviation_count = 0
    cycle_time_count = 0

    route_stats = {}

    for trip in trips:
                             
        deviation = None
        if trip.cycle_time_minutes and trip.expected_duration_minutes:
            deviation = trip.cycle_time_minutes - trip.expected_duration_minutes
            total_deviation += deviation
            deviation_count += 1
            if deviation <= 10:
                on_time_early += 1
            else:
                delayed += 1

        if trip.cycle_time_minutes:
            total_cycle_time += trip.cycle_time_minutes
            cycle_time_count += 1

        route_key = f"{trip.producer_id} → {trip.consumer_id}"
        if route_key not in route_stats:
            route_stats[route_key] = {'count': 0, 'total_cycle': 0, 'total_deviation': 0, 'on_time': 0, 'dev_count': 0, 'cycle_count': 0}
        route_stats[route_key]['count'] += 1
        if trip.cycle_time_minutes:
            route_stats[route_key]['total_cycle'] += trip.cycle_time_minutes
            route_stats[route_key]['cycle_count'] += 1
        if deviation is not None:
            route_stats[route_key]['total_deviation'] += deviation
            route_stats[route_key]['dev_count'] += 1
            if deviation <= 10:
                route_stats[route_key]['on_time'] += 1

    avg_deviation = round(total_deviation / deviation_count, 1) if deviation_count > 0 else 0
    avg_cycle_time = round(total_cycle_time / cycle_time_count, 1) if cycle_time_count > 0 else 0
    success_rate = round((on_time_early / deviation_count) * 100) if deviation_count > 0 else 0

    def get_deviation_status(dev):
        if dev is None:
            return ('-', '#64748b')
        if dev <= 0:
            return ('Early', '#16a34a')
        if dev <= 10:
            return ('On Track', '#22c55e')
        if dev <= 20:
            return ('Warning', '#f59e0b')
        if dev <= 30:
            return ('Alert', '#f97316')
        return ('Critical', '#ef4444')

    summary_html = f"""
    <div style="margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">📊 Summary Statistics</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Total Completed</strong></td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: #1e40af;">{total_trips}</td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>On Time / Early</strong></td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: #16a34a;">{on_time_early}</td>
            </tr>
            <tr>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Delayed</strong></td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #ef4444;">{delayed}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Success Rate</strong></td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: {'#16a34a' if success_rate >= 80 else '#f59e0b' if success_rate >= 60 else '#ef4444'};">{success_rate}%</td>
            </tr>
            <tr>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Avg Deviation</strong></td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: {'#16a34a' if avg_deviation <= 10 else '#f59e0b' if avg_deviation <= 20 else '#ef4444'};">{'+' if avg_deviation > 0 else ''}{avg_deviation} min</td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Avg Cycle Time</strong></td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: #1e40af;">{avg_cycle_time} min</td>
            </tr>
        </table>
    </div>
    """

    route_html = """
    <div style="margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">🛤️ Route-wise Summary</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: linear-gradient(135deg, #3b82f6, #06b6d4); color: white;">
                    <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Route</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Trips</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Avg Cycle</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Avg Deviation</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">On-Time</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Rate</th>
                </tr>
            </thead>
            <tbody>
    """
    for i, (route, stats) in enumerate(sorted(route_stats.items())):
        bg = '#f8fafc' if i % 2 == 0 else '#ffffff'
        r_avg_cycle = round(stats['total_cycle'] / stats['cycle_count'], 1) if stats['cycle_count'] > 0 else '-'
        r_avg_dev = round(stats['total_deviation'] / stats['dev_count'], 1) if stats['dev_count'] > 0 else '-'
        r_rate = round((stats['on_time'] / stats['dev_count']) * 100) if stats['dev_count'] > 0 else '-'
        route_html += f"""
            <tr style="background: {bg};">
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">{route}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{stats['count']}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{r_avg_cycle} min</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{'+' if isinstance(r_avg_dev, (int, float)) and r_avg_dev > 0 else ''}{r_avg_dev} min</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{stats['on_time']}/{stats['dev_count'] if stats['dev_count'] > 0 else stats['count']}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: {'#16a34a' if isinstance(r_rate, (int, float)) and r_rate >= 80 else '#f59e0b' if isinstance(r_rate, (int, float)) and r_rate >= 60 else '#ef4444'};">{r_rate}%</td>
            </tr>
        """
    route_html += "</tbody></table></div>"

    trips_html = """
    <div>
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">📋 Detailed Trip Records</h3>
    """

    def format_time(dt):
        return dt.strftime("%H:%M:%S") if dt else "-"

    def format_datetime(dt):
        return dt.strftime("%d %b %Y %H:%M") if dt else "-"

    for idx, trip in enumerate(trips):
                             
        deviation = None
        if trip.cycle_time_minutes and trip.expected_duration_minutes:
            deviation = trip.cycle_time_minutes - trip.expected_duration_minutes
        status_label, status_color = get_deviation_status(deviation)

        def calc_phase(start, end):
            if start and end:
                return round((end - start).total_seconds() / 60)
            return None

        wb_tare_phase = calc_phase(trip.assigned_at, trip.wb_tare_recorded_at)
        loading_phase = calc_phase(trip.p_entered_at, trip.p_exited_at)
        wb_gross_phase = calc_phase(trip.p_exited_at, trip.wb_gross_recorded_at)
        transit_phase = calc_phase(trip.wb_gross_recorded_at, trip.c_entered_at)
        unloading_phase = calc_phase(trip.c_entered_at, trip.c_exited_at)

        trips_html += f"""
        <div style="margin-bottom: 20px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden;">
            <!-- Trip Header -->
            <div style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center;">
                <span style="font-weight: 700;">#{idx + 1} {trip.trip_id}</span>
                <span>{trip.producer_id} → {trip.consumer_id}</span>
                <span>Asset: {trip.torpedo_id or '-'}</span>
            </div>

            <!-- Trip Summary -->
            <div style="padding: 12px 16px; background: #f8fafc; display: flex; gap: 24px; flex-wrap: wrap; font-size: 12px;">
                <div><strong>Actual:</strong> <span style="color: #1e40af; font-weight: 600;">{round(trip.cycle_time_minutes, 1) if trip.cycle_time_minutes else '-'} min</span></div>
                <div><strong>Expected:</strong> <span style="color: #64748b;">{round(trip.expected_duration_minutes, 1) if trip.expected_duration_minutes else '-'} min</span></div>
                <div><strong>Deviation:</strong> <span style="color: {status_color}; font-weight: 600;">{'+' if deviation and deviation > 0 else ''}{round(deviation, 1) if deviation else '-'} min</span></div>
                <div><strong>Status:</strong> <span style="color: {status_color}; font-weight: 600;">{status_label}</span></div>
                <div><strong>Completed:</strong> <span style="color: #64748b;">{format_datetime(trip.c_exited_at)}</span></div>
            </div>

            <!-- Timeline -->
            <div style="padding: 8px 16px; font-size: 11px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background: #64748b; color: white;">
                        <th style="padding: 6px; border: 1px solid #94a3b8;">ASN</th>
                        <th style="padding: 6px; border: 1px solid #94a3b8;">WB.T</th>
                        <th style="padding: 6px; border: 1px solid #94a3b8;">P.IN</th>
                        <th style="padding: 6px; border: 1px solid #94a3b8;">L.ST</th>
                        <th style="padding: 6px; border: 1px solid #94a3b8;">L.EN</th>
                        <th style="padding: 6px; border: 1px solid #94a3b8;">P.OUT</th>
                        <th style="padding: 6px; border: 1px solid #94a3b8;">WB.G</th>
                        <th style="padding: 6px; border: 1px solid #94a3b8;">C.IN</th>
                        <th style="padding: 6px; border: 1px solid #94a3b8;">U.ST</th>
                        <th style="padding: 6px; border: 1px solid #94a3b8;">U.EN</th>
                        <th style="padding: 6px; border: 1px solid #94a3b8;">DONE</th>
                    </tr>
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.assigned_at)}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.wb_tare_recorded_at)}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.p_entered_at)}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.p_loading_start_at)}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.p_loading_end_at)}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.p_exited_at)}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.wb_gross_recorded_at)}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.c_entered_at)}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.c_unloading_start_at)}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.c_unloading_end_at)}</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{format_time(trip.c_exited_at)}</td>
                    </tr>
                </table>
            </div>

            <!-- Phase Performance -->
            <div style="padding: 8px 16px 12px; font-size: 11px;">
                <table style="width: 100%; border-collapse: collapse;">
                    <tr style="background: #7c3aed; color: white;">
                        <th style="padding: 6px; border: 1px solid #a78bfa;">Phase</th>
                        <th style="padding: 6px; border: 1px solid #a78bfa;">Duration</th>
                    </tr>
                    <tr style="background: #f8fafc;">
                        <td style="padding: 6px; border: 1px solid #e2e8f0; font-weight: 600;">WB Tare Phase</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{wb_tare_phase} min</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; font-weight: 600;">Loading Phase</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{loading_phase} min</td>
                    </tr>
                    <tr style="background: #f8fafc;">
                        <td style="padding: 6px; border: 1px solid #e2e8f0; font-weight: 600;">WB Gross Phase</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{wb_gross_phase} min</td>
                    </tr>
                    <tr>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; font-weight: 600;">Transit Phase</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{transit_phase} min</td>
                    </tr>
                    <tr style="background: #f8fafc;">
                        <td style="padding: 6px; border: 1px solid #e2e8f0; font-weight: 600;">Unloading Phase</td>
                        <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{unloading_phase} min</td>
                    </tr>
                </table>
            </div>
        </div>
        """

    trips_html += "</div>"

    if len(trips) >= 200:
        trips_html += "<p style='color: #64748b; margin-top: 10px; font-size: 11px;'>Showing first 200 records. Export CSV for complete data.</p>"

    if not trips:
        trips_html = "<p style='color: #64748b;'>No trip history data available for the selected criteria.</p>"

    email_content = f"""
        <h2 style="color: #0f172a; margin-bottom: 20px;">Trip History Report - Detailed</h2>
        <div style="margin-bottom: 20px; color: #64748b; font-size: 13px; background: #f8fafc; padding: 16px; border-radius: 8px;">
            <p style="margin: 4px 0;"><strong>Generated:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
            <p style="margin: 4px 0;"><strong>Requested by:</strong> {current_user.username}</p>
            <p style="margin: 4px 0;"><strong>Date Range:</strong> {date_range_str}</p>
            <p style="margin: 4px 0;"><strong>Total Records:</strong> {len(trips)}</p>
        </div>
        {summary_html}
        {route_html}
        {trips_html}
    """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }}
            .container {{ max-width: 1000px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
            .header {{ background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); color: white; padding: 28px 24px; text-align: center; }}
            .header-logo {{ font-size: 28px; font-weight: 800; letter-spacing: 2px; margin-bottom: 6px; }}
            .header-subtitle {{ font-size: 12px; color: #94a3b8; letter-spacing: 0.5px; text-transform: uppercase; }}
            .content {{ padding: 24px; }}
            .footer {{ background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); padding: 28px 20px; text-align: center; }}
            .footer-logo {{ font-size: 18px; font-weight: 700; color: #ffffff; margin-bottom: 8px; letter-spacing: 0.5px; }}
            .footer-tagline {{ font-size: 11px; color: #64748b; margin-bottom: 16px; }}
            .footer-divider {{ width: 60px; height: 2px; background: linear-gradient(90deg, #3b82f6, #06b6d4); margin: 16px auto; border-radius: 1px; }}
            .footer p {{ color: #94a3b8; font-size: 12px; margin: 8px 0; }}
            .footer-copyright {{ font-size: 11px; color: #94a3b8; margin-top: 12px; }}
        </style>
    </head>
    <body>
        <div class="container">
            <div class="header">
                <div class="header-logo">DEEVIA</div>
                <div class="header-subtitle">Hot Metal Distribution System</div>
            </div>
            <div class="content">
                {email_content}
            </div>
            <div class="footer">
                <div class="footer-logo">DEEVIA</div>
                <div class="footer-tagline">Advanced Logistics Control & Operational Intelligence System</div>
                <div class="footer-divider"></div>
                <p>This report was automatically generated by the HMD System.</p>
                <p><a href="{FRONTEND_URL}/trips" style="color: #3b82f6;">View Trip Management</a></p>
                <p class="footer-copyright">&copy; {datetime.now().year} Deevia Software India Pvt Ltd. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        email_sent = email_service._send_email(
            to_email=data.email,
            subject="HMD System - Trip History Report (Detailed)",
            html_content=html,
            text_content=f"Trip History Report (Detailed) generated on {datetime.now().strftime('%Y-%m-%d %H:%M')} with {len(trips)} records including summary statistics, route breakdown, and per-trip timelines."
        )

        if not email_sent:
            raise HTTPException(status_code=500, detail="Failed to send email. Please check SMTP configuration.")

        log_activity(
            db, current_user.username, "TRIP_HISTORY_EMAILED",
            details=f"Trip history emailed to {data.email} with {len(trips)} records",
            current_user=current_user
        )

        logger.info(f"Trip history emailed by {current_user.username} to {data.email}")
        return {"status": "success", "message": f"Trip history sent to {data.email}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending trip history email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")

@router.get("")
async def get_trips(
    status: Optional[int] = None,
    producer_id: Optional[str] = None,
    consumer_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    query = active_only(db.query(Trip))

    if status is not None:
        query = query.filter(Trip.status == status)
    if producer_id:
        query = query.filter(Trip.producer_id == producer_id)
    if consumer_id:
        query = query.filter(Trip.consumer_id == consumer_id)

    trips = query.order_by(Trip.id.desc()).all()

    return [
        {
            "id": t.id,
            "trip_id": t.trip_id,
            "producer_id": t.producer_id,
            "consumer_id": t.consumer_id,
            "torpedo_id": t.torpedo_id,
            "status": t.status,
            "assignment_id": t.assignment_id,
            "converter_id": t.converter_id,
            "converter_name": t.converter.name if t.converter else None,
            "created_at": t.created_at.isoformat() if t.created_at else None
        }
        for t in trips
    ]

@router.put("/{trip_id}")
@limiter.limit(rate_limit_medium)
async def update_trip(
    request: Request,
    trip_id: str,
    data: TripUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "trs"))
):
                                          
    trip = active_only(db.query(Trip)).filter(Trip.trip_id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if trip.status == TripStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot edit a completed trip")

    old_torpedo_id = trip.torpedo_id
    new_torpedo_id = data.torpedo_id

    if data.producer_id:
        trip.producer_id = data.producer_id
    if data.consumer_id:
        trip.consumer_id = data.consumer_id

    if new_torpedo_id != old_torpedo_id:
                             
        if old_torpedo_id:
            old_torpedo = db.query(FleetManagement).filter(FleetManagement.fleet_id == old_torpedo_id).first()
            if old_torpedo:
                old_torpedo.status = "Operating"

        if new_torpedo_id:
            try:
                new_torpedo = db.execute(
                    select(FleetManagement)
                    .where(FleetManagement.fleet_id == new_torpedo_id)
                    .with_for_update(nowait=True)
                ).scalar_one_or_none()
            except OperationalError:
                raise HTTPException(status_code=409, detail="Torpedo is currently being assigned")

            if not new_torpedo:
                raise HTTPException(status_code=404, detail="New torpedo not found")

            if new_torpedo.status != "Operating":
                raise HTTPException(status_code=400, detail="New torpedo is not available")

            busy = db.query(Trip).filter(
                Trip.torpedo_id == new_torpedo_id,
                Trip.status >= TripStatus.ASSIGNED,
                Trip.status <= TripStatus.UNLOADING_ENDED,
                Trip.id != trip.id
            ).first()

            if busy:
                raise HTTPException(status_code=400, detail="New torpedo is already in an active trip")

            new_torpedo.status = "Assigned"
            trip.torpedo_id = new_torpedo_id
            if trip.status == TripStatus.PENDING:
                trip.status = TripStatus.ASSIGNED
                trip.assigned_at = utc_now()
                                                                                 
                calculate_expected_times(db, trip, trip.assigned_at)
        else:
            trip.torpedo_id = None
            trip.status = TripStatus.PENDING
            trip.assigned_at = None
                                                          
            trip.expected_duration_minutes = None
            trip.expected_wb_tare_entry_at = None
            trip.expected_wb_tare_recorded_at = None
            trip.expected_p_entered_at = None
            trip.expected_p_loading_start_at = None
            trip.expected_p_loading_end_at = None
            trip.expected_p_exited_at = None
            trip.expected_wb_gross_entry_at = None
            trip.expected_wb_gross_recorded_at = None
            trip.expected_c_entered_at = None
            trip.expected_c_unloading_start_at = None
            trip.expected_c_unloading_end_at = None
            trip.expected_c_exited_at = None
            trip.shift = None

    try:
        db.commit()
        db.refresh(trip)
        log_activity(db, current_user.username, "TRIP_EDITED", f"Edited trip {trip_id}")
                                                                
        if new_torpedo_id != old_torpedo_id:
            fleet_cache.invalidate("fleet_management")
        return {"status": "success", "trip_id": trip.trip_id}
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error updating trip: {e}")
        raise HTTPException(status_code=500, detail="Failed to update trip")

@router.delete("/{trip_id}")
@limiter.limit(rate_limit_low)
async def delete_trip(
    request: Request,
    trip_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "trs"))
):
                                          
    trip = active_only(db.query(Trip)).filter(Trip.trip_id == trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if trip.status == TripStatus.COMPLETED:
        raise HTTPException(status_code=400, detail="Cannot delete a completed trip")

    if trip.torpedo_id:
        torpedo = active_only(db.query(FleetManagement)).filter(FleetManagement.fleet_id == trip.torpedo_id).first()
        if torpedo:
            torpedo.status = "Operating"

    try:
                                            
        released_torpedo = trip.torpedo_id is not None
        soft_delete(db, trip)
        db.commit()
        log_activity(db, current_user.username, "TRIP_DELETED", f"Soft deleted trip {trip_id}")
                                                        
        if released_torpedo:
            fleet_cache.invalidate("fleet_management")
        return {"status": "success", "message": f"Trip {trip_id} deleted"}
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error soft deleting trip: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete trip")

