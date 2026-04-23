
from fastapi import APIRouter, Depends
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, timedelta, datetime

from ..database.engine import get_db
from ..database.models import DailyPlan, Trip, DistributionAssignment, FleetManagement, SystemConfig, User
from ..utils.security import get_current_user_required
from ..utils.analytics_helpers import get_config, get_avg_capacity

router = APIRouter(prefix="/api/statistics", tags=["performance-analytics"])

@router.get("/my-performance")
async def get_my_performance(
    user_id: str,
    role: str,
    date_str: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    target_date = datetime.fromisoformat(date_str).date() if date_str else date.today()

    plan = db.query(DailyPlan).filter(
        DailyPlan.date == target_date,
        DailyPlan.user_id == user_id
    ).first()
    planned_tonnage = plan.capacity if plan else 0

    avg_capacity = get_avg_capacity(db)

    trip_query = db.query(Trip).filter(Trip.status == 13)

    if role == "producer":
        trip_query = trip_query.filter(
            Trip.producer_id == user_id,
            func.date(func.coalesce(Trip.p_exited_at, Trip.created_at)) == target_date
        )
    else:            
        trip_query = trip_query.filter(
            Trip.consumer_id == user_id,
            func.date(Trip.c_exited_at) == target_date
        )

    trips = trip_query.all()
    trips_completed = len(trips)

    total_tonnage = 0
    for trip in trips:
        if trip.net_weight_kg:
            total_tonnage += trip.net_weight_kg / 1000                             
        elif trip.assignment_id:
            assignment = db.query(DistributionAssignment).filter(
                DistributionAssignment.id == trip.assignment_id
            ).first()
            if assignment and assignment.quantity and assignment.trips:
                total_tonnage += assignment.quantity / assignment.trips
            elif assignment and assignment.quantity:
                total_tonnage += assignment.quantity
            else:
                total_tonnage += avg_capacity
        else:
            total_tonnage += avg_capacity

    if trips:
        cycle_times = []
        for trip in trips:
            start_time = trip.assigned_at or trip.p_entered_at or trip.created_at
            if trip.c_exited_at and start_time:
                cycle_time = (trip.c_exited_at - start_time).total_seconds() / 60
                cycle_times.append(cycle_time)
        avg_cycle_time = sum(cycle_times) / len(cycle_times) if cycle_times else 0
    else:
        avg_cycle_time = 0

    fulfillment_rate = round((total_tonnage / planned_tonnage * 100), 1) if planned_tonnage > 0 else 0

    return {
        "total_tonnage": round(total_tonnage, 1),
        "fulfillment_rate": fulfillment_rate,
        "trips_completed": trips_completed,
        "avg_cycle_time_minutes": round(avg_cycle_time, 1)
    }

@router.get("/my-partner-breakdown")
async def get_my_partner_breakdown(
    user_id: str,
    role: str,
    date_str: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    target_date = datetime.fromisoformat(date_str).date() if date_str else date.today()

    if role == "producer":
        trips = db.query(
            Trip.consumer_id.label("partner_id"),
            Trip.net_weight_kg,
            DistributionAssignment.quantity,
            DistributionAssignment.trips.label("assignment_trips")
        ).join(
            DistributionAssignment,
            Trip.assignment_id == DistributionAssignment.id,
            isouter=True
        ).filter(
            Trip.producer_id == user_id,
            Trip.status == 13,
            func.date(func.coalesce(Trip.p_exited_at, Trip.created_at)) == target_date
        ).all()
    else:            
        trips = db.query(
            Trip.producer_id.label("partner_id"),
            Trip.net_weight_kg,
            DistributionAssignment.quantity,
            DistributionAssignment.trips.label("assignment_trips")
        ).join(
            DistributionAssignment,
            Trip.assignment_id == DistributionAssignment.id,
            isouter=True
        ).filter(
            Trip.consumer_id == user_id,
            Trip.status == 13,
            func.date(Trip.c_exited_at) == target_date
        ).all()

    if not trips:
        return {"partners": []}

    avg_capacity = get_avg_capacity(db)

    partner_data = {}
    partner_trip_counts = {}
    for partner_id, net_weight_kg, quantity, assignment_trips in trips:
        if partner_id:
            if partner_id not in partner_data:
                partner_data[partner_id] = 0
                partner_trip_counts[partner_id] = 0
                                                                                          
            if net_weight_kg:
                per_trip_qty = net_weight_kg / 1000                             
            elif quantity and assignment_trips:
                per_trip_qty = quantity / assignment_trips
            else:
                per_trip_qty = avg_capacity
            partner_data[partner_id] += per_trip_qty
            partner_trip_counts[partner_id] += 1

    total_tonnage = sum(partner_data.values())
    partners = []

    for partner_id, tonnage in partner_data.items():
        percentage = round((tonnage / total_tonnage * 100), 1) if total_tonnage > 0 else 0
        trip_count = partner_trip_counts.get(partner_id, 0)
        partners.append({
            "partner_id": partner_id,
            "tonnage": round(tonnage, 1),
            "percentage": percentage,
            "trips": trip_count
        })

    return {"partners": sorted(partners, key=lambda x: x['tonnage'], reverse=True)}

@router.get("/my-trip-timeline")
async def get_my_trip_timeline(
    user_id: str,
    role: str,
    date_str: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    target_date = datetime.fromisoformat(date_str).date() if date_str else date.today()

    trip_query = db.query(
        func.extract('hour', Trip.c_exited_at).label("hour"),
        func.count(Trip.id).label("trips_completed")
    ).filter(
        Trip.status == 13,
        Trip.c_exited_at.isnot(None),
        func.date(Trip.c_exited_at) == target_date
    )

    if role == "producer":
        trip_query = trip_query.filter(Trip.producer_id == user_id)
    else:            
        trip_query = trip_query.filter(Trip.consumer_id == user_id)

    results = trip_query.group_by(func.extract('hour', Trip.c_exited_at)).all()

    hour_map = {int(r.hour): r.trips_completed for r in results if r.hour is not None}

    timeline = [{"hour": h, "trips_completed": hour_map.get(h, 0)} for h in range(24)]

    return {"timeline": timeline}

@router.get("/my-trips")
async def get_my_trips(
    user_id: str,
    role: str,
    date_str: str = None,
    limit: int = 50,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    target_date = datetime.fromisoformat(date_str).date() if date_str else date.today()

    status_labels = {
        0: "Pending", 1: "Assigned", 2: "WB Tare Entry", 3: "WB Tare Recorded",
        4: "Producer Entered", 5: "Producer Loading", 6: "Producer Loaded",
        7: "Producer Exited", 8: "WB Gross Entry", 9: "WB Gross Recorded",
        10: "Consumer Entered", 11: "Consumer Unloading", 12: "Consumer Unloaded",
        13: "Completed"
    }

    trip_query = db.query(Trip).filter(func.date(Trip.created_at) == target_date)

    if role == "producer":
        trip_query = trip_query.filter(Trip.producer_id == user_id)
        partner_field = "consumer_id"
    else:            
        trip_query = trip_query.filter(Trip.consumer_id == user_id)
        partner_field = "producer_id"

    trips = trip_query.order_by(Trip.created_at.desc()).limit(limit).all()

    trip_list = []
    for trip in trips:
                                           
        cycle_time_minutes = None
        start_time = trip.assigned_at or trip.p_entered_at or trip.created_at
        if trip.c_exited_at and start_time:
            cycle_time_minutes = round((trip.c_exited_at - start_time).total_seconds() / 60, 1)

        trip_list.append({
            "trip_id": trip.id,
            "partner_id": getattr(trip, partner_field),
            "torpedo_id": trip.torpedo_id,
            "status": trip.status,
            "status_label": status_labels.get(trip.status, "Unknown"),
            "cycle_time_minutes": cycle_time_minutes
        })

    return {"trips": trip_list}

@router.get("/my-monthly-plan")
async def get_my_monthly_plan(
    user_id: str,
    role: str,
    year: int = None,
    month: int = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                                               
    if year is None or month is None:
        today = date.today()
        year = today.year
        month = today.month

    first_day = date(year, month, 1)
    if month == 12:
        last_day = date(year + 1, 1, 1) - timedelta(days=1)
    else:
        last_day = date(year, month + 1, 1) - timedelta(days=1)

    plans = db.query(DailyPlan).filter(
        DailyPlan.user_id == user_id,
        DailyPlan.date >= first_day,
        DailyPlan.date <= last_day
    ).all()

    total_planned = sum(p.capacity for p in plans)

    avg_capacity = get_avg_capacity(db)

    trip_query = db.query(Trip).filter(Trip.status == 13)

    if role == "producer":
        trip_query = trip_query.filter(
            Trip.producer_id == user_id,
            func.date(func.coalesce(Trip.p_exited_at, Trip.created_at)) >= first_day,
            func.date(func.coalesce(Trip.p_exited_at, Trip.created_at)) <= last_day
        )
    else:            
        trip_query = trip_query.filter(
            Trip.consumer_id == user_id,
            func.date(Trip.c_exited_at) >= first_day,
            func.date(Trip.c_exited_at) <= last_day
        )

    completed_trips_list = trip_query.all()
    completed_trips = len(completed_trips_list)
                                                                                    
    total_actual = sum(
        (t.net_weight_kg / 1000) if t.net_weight_kg else avg_capacity
        for t in completed_trips_list
    )

    return {
        "year": year,
        "month": month,
        "planned": round(total_planned, 1),
        "actual": round(total_actual, 1),
        "remaining": round(max(0, total_planned - total_actual), 1),
        "progress_percentage": round((total_actual / total_planned * 100), 1) if total_planned > 0 else 0
    }

