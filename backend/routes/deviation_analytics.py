
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from datetime import date, datetime, timedelta
from typing import Optional
from pydantic import BaseModel, EmailStr

from ..database.engine import get_db
from ..database.models import Trip, User
from ..utils.security import get_current_user_required
from ..constants import DeviationThreshold
from ..logger import logger

router = APIRouter(prefix="/api/statistics", tags=["deviation-analytics"])

@router.get("/deviation-summary")
async def get_deviation_summary(
    date_from: date = Query(None),
    date_to: date = Query(None),
    producer_id: str = Query(None),
    consumer_id: str = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    today = date.today()
    if not date_from:
        date_from = today - timedelta(days=7)
    if not date_to:
        date_to = today

    query = db.query(Trip).filter(
        Trip.status == 13,
        Trip.expected_c_exited_at.isnot(None),
        Trip.c_exited_at.isnot(None),
        func.date(Trip.c_exited_at) >= date_from,
        func.date(Trip.c_exited_at) <= date_to
    )

    if producer_id:
        query = query.filter(Trip.producer_id == producer_id)
    if consumer_id:
        query = query.filter(Trip.consumer_id == consumer_id)

    trips = query.all()

    if not trips:
        return {
            "total_trips": 0,
            "early_count": 0,
            "on_time_count": 0,
            "warning_count": 0,
            "alert_count": 0,
            "critical_count": 0,
            "avg_deviation_minutes": 0,
            "min_deviation_minutes": 0,
            "max_deviation_minutes": 0,
            "on_time_percentage": 0,
            "early_percentage": 0
        }

    deviations = []
    early = 0
    on_time = 0
    warning = 0
    alert = 0
    critical = 0

    for trip in trips:
        deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
        deviations.append(deviation)

        category = DeviationThreshold.get_category(deviation)
        if category == "early":
            early += 1
        elif category == "on_time":
            on_time += 1
        elif category == "warning":
            warning += 1
        elif category == "alert":
            alert += 1
        else:
            critical += 1

    total = len(trips)
    avg_dev = sum(deviations) / total if total > 0 else 0

    return {
        "total_trips": total,
        "early_count": early,
        "on_time_count": on_time,
        "warning_count": warning,
        "alert_count": alert,
        "critical_count": critical,
        "avg_deviation_minutes": round(avg_dev, 1),
        "min_deviation_minutes": round(min(deviations), 1) if deviations else 0,
        "max_deviation_minutes": round(max(deviations), 1) if deviations else 0,
        "on_time_percentage": round((on_time / total) * 100, 1) if total > 0 else 0,
        "early_percentage": round((early / total) * 100, 1) if total > 0 else 0
    }

@router.get("/deviation-by-node")
async def get_deviation_by_node(
    date_from: date = Query(None),
    date_to: date = Query(None),
    node_type: str = Query("all", enum=["producer", "consumer", "all"]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    today = date.today()
    if not date_from:
        date_from = today - timedelta(days=7)
    if not date_to:
        date_to = today

    trips = db.query(Trip).filter(
        Trip.status == 13,
        Trip.expected_c_exited_at.isnot(None),
        Trip.c_exited_at.isnot(None),
        func.date(Trip.c_exited_at) >= date_from,
        func.date(Trip.c_exited_at) <= date_to
    ).all()

    producer_stats = {}
    consumer_stats = {}

    for trip in trips:
        deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
        is_on_time = DeviationThreshold.is_on_time(deviation)

        if trip.producer_id:
            if trip.producer_id not in producer_stats:
                producer_stats[trip.producer_id] = {
                    "total_trips": 0,
                    "on_time_count": 0,
                    "deviations": []
                }
            producer_stats[trip.producer_id]["total_trips"] += 1
            producer_stats[trip.producer_id]["deviations"].append(deviation)
            if is_on_time:
                producer_stats[trip.producer_id]["on_time_count"] += 1

        if trip.consumer_id:
            if trip.consumer_id not in consumer_stats:
                consumer_stats[trip.consumer_id] = {
                    "total_trips": 0,
                    "on_time_count": 0,
                    "deviations": []
                }
            consumer_stats[trip.consumer_id]["total_trips"] += 1
            consumer_stats[trip.consumer_id]["deviations"].append(deviation)
            if is_on_time:
                consumer_stats[trip.consumer_id]["on_time_count"] += 1

    results = []

    if node_type in ["producer", "all"]:
        for node_id, stats in producer_stats.items():
            devs = stats["deviations"]
            results.append({
                "node_id": node_id,
                "node_type": "producer",
                "total_trips": stats["total_trips"],
                "on_time_count": stats["on_time_count"],
                "delayed_count": stats["total_trips"] - stats["on_time_count"],
                "avg_deviation": round(sum(devs) / len(devs), 1) if devs else 0,
                "worst_deviation": round(max(devs), 1) if devs else 0,
                "on_time_percentage": round((stats["on_time_count"] / stats["total_trips"]) * 100, 1) if stats["total_trips"] > 0 else 0
            })

    if node_type in ["consumer", "all"]:
        for node_id, stats in consumer_stats.items():
            devs = stats["deviations"]
            results.append({
                "node_id": node_id,
                "node_type": "consumer",
                "total_trips": stats["total_trips"],
                "on_time_count": stats["on_time_count"],
                "delayed_count": stats["total_trips"] - stats["on_time_count"],
                "avg_deviation": round(sum(devs) / len(devs), 1) if devs else 0,
                "worst_deviation": round(max(devs), 1) if devs else 0,
                "on_time_percentage": round((stats["on_time_count"] / stats["total_trips"]) * 100, 1) if stats["total_trips"] > 0 else 0
            })

    return sorted(results, key=lambda x: x["on_time_percentage"])

@router.get("/deviation-by-phase")
async def get_deviation_by_phase(
    date_from: date = Query(None),
    date_to: date = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    today = date.today()
    if not date_from:
        date_from = today - timedelta(days=7)
    if not date_to:
        date_to = today

    trips = db.query(Trip).filter(
        Trip.status == 13,
        Trip.c_exited_at.isnot(None),
        func.date(Trip.c_exited_at) >= date_from,
        func.date(Trip.c_exited_at) <= date_to
    ).all()

    loading_deviations = []
    transit_deviations = []
    unloading_deviations = []

    producer_loading_devs = {}
    route_transit_devs = {}
    consumer_unloading_devs = {}

    for trip in trips:
                                 
        if trip.expected_p_loading_end_at and trip.p_loading_end_at:
            loading_dev = (trip.p_loading_end_at - trip.expected_p_loading_end_at).total_seconds() / 60
            loading_deviations.append(loading_dev)
            if trip.producer_id:
                if trip.producer_id not in producer_loading_devs:
                    producer_loading_devs[trip.producer_id] = []
                producer_loading_devs[trip.producer_id].append(loading_dev)

        if trip.expected_c_entered_at and trip.c_entered_at:
            transit_dev = (trip.c_entered_at - trip.expected_c_entered_at).total_seconds() / 60
            transit_deviations.append(transit_dev)
            route_key = f"{trip.producer_id} → {trip.consumer_id}"
            if route_key not in route_transit_devs:
                route_transit_devs[route_key] = []
            route_transit_devs[route_key].append(transit_dev)

        if trip.expected_c_exited_at and trip.c_exited_at:
            unloading_dev = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
            unloading_deviations.append(unloading_dev)
            if trip.consumer_id:
                if trip.consumer_id not in consumer_unloading_devs:
                    consumer_unloading_devs[trip.consumer_id] = []
                consumer_unloading_devs[trip.consumer_id].append(unloading_dev)

    avg_loading = sum(loading_deviations) / len(loading_deviations) if loading_deviations else 0
    avg_transit = sum(transit_deviations) / len(transit_deviations) if transit_deviations else 0
    avg_unloading = sum(unloading_deviations) / len(unloading_deviations) if unloading_deviations else 0

    total_avg = abs(avg_loading) + abs(avg_transit) + abs(avg_unloading)

    most_delayed_producer = None
    if producer_loading_devs:
        worst = max(producer_loading_devs.items(), key=lambda x: sum(x[1]) / len(x[1]) if x[1] else 0)
        most_delayed_producer = worst[0]

    most_delayed_route = None
    if route_transit_devs:
        worst = max(route_transit_devs.items(), key=lambda x: sum(x[1]) / len(x[1]) if x[1] else 0)
        most_delayed_route = worst[0]

    most_delayed_consumer = None
    if consumer_unloading_devs:
        worst = max(consumer_unloading_devs.items(), key=lambda x: sum(x[1]) / len(x[1]) if x[1] else 0)
        most_delayed_consumer = worst[0]

    return {
        "loading_phase": {
            "avg_deviation": round(avg_loading, 1),
            "delay_contribution_pct": round((abs(avg_loading) / total_avg) * 100, 1) if total_avg > 0 else 0,
            "most_delayed_producer": most_delayed_producer,
            "sample_count": len(loading_deviations)
        },
        "transit_phase": {
            "avg_deviation": round(avg_transit, 1),
            "delay_contribution_pct": round((abs(avg_transit) / total_avg) * 100, 1) if total_avg > 0 else 0,
            "most_delayed_route": most_delayed_route,
            "sample_count": len(transit_deviations)
        },
        "unloading_phase": {
            "avg_deviation": round(avg_unloading, 1),
            "delay_contribution_pct": round((abs(avg_unloading) / total_avg) * 100, 1) if total_avg > 0 else 0,
            "most_delayed_consumer": most_delayed_consumer,
            "sample_count": len(unloading_deviations)
        }
    }

@router.get("/deviation-trends")
async def get_deviation_trends(
    range_type: str = Query("week", enum=["day", "week", "month", "year", "custom"]),
    start_date: date = Query(None),
    end_date: date = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    today = date.today()

    if range_type == "custom" and start_date and end_date:
        pass
    elif range_type == "day":
        start_date = today
        end_date = today
    elif range_type == "week":
        start_date = today - timedelta(days=7)
        end_date = today
    elif range_type == "month":
        start_date = date(today.year, today.month, 1)
        if today.month == 12:
            end_date = date(today.year, 12, 31)
        else:
            end_date = date(today.year, today.month + 1, 1) - timedelta(days=1)
    else:        
        start_date = date(today.year, 1, 1)
        end_date = date(today.year, 12, 31)

    trips = db.query(Trip).filter(
        Trip.status == 13,
        Trip.expected_c_exited_at.isnot(None),
        Trip.c_exited_at.isnot(None),
        func.date(Trip.c_exited_at) >= start_date,
        func.date(Trip.c_exited_at) <= min(end_date, today)
    ).all()

    if range_type == "year":
        monthly_stats = {}
        for month_num in range(1, 13):
            month_key = f"{today.year}-{month_num:02d}"
            monthly_stats[month_key] = {
                "total_trips": 0,
                "on_time_count": 0,
                "deviations": []
            }

        for trip in trips:
            month_key = trip.c_exited_at.strftime("%Y-%m")
            deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
            is_on_time = DeviationThreshold.is_on_time(deviation)

            if month_key in monthly_stats:
                monthly_stats[month_key]["total_trips"] += 1
                monthly_stats[month_key]["deviations"].append(deviation)
                if is_on_time:
                    monthly_stats[month_key]["on_time_count"] += 1

        results = []
        for month_num in range(1, 13):
            month_key = f"{today.year}-{month_num:02d}"
            month_date = date(today.year, month_num, 1)
            stats = monthly_stats[month_key]

            if month_num <= today.month:
                results.append({
                    "date": month_key,
                    "displayDate": month_date.strftime("%b"),
                    "total_trips": stats["total_trips"],
                    "on_time_count": stats["on_time_count"],
                    "delayed_count": stats["total_trips"] - stats["on_time_count"],
                    "avg_deviation": round(sum(stats["deviations"]) / len(stats["deviations"]), 1) if stats["deviations"] else 0,
                    "on_time_percentage": round((stats["on_time_count"] / stats["total_trips"]) * 100, 1) if stats["total_trips"] > 0 else 0
                })

        return results

    stats_by_date = {}
    for trip in trips:
        trip_date = trip.c_exited_at.date().isoformat()
        deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
        is_on_time = DeviationThreshold.is_on_time(deviation)

        if trip_date not in stats_by_date:
            stats_by_date[trip_date] = {
                "total_trips": 0,
                "on_time_count": 0,
                "deviations": []
            }

        stats_by_date[trip_date]["total_trips"] += 1
        stats_by_date[trip_date]["deviations"].append(deviation)
        if is_on_time:
            stats_by_date[trip_date]["on_time_count"] += 1

    results = []
    current_day = start_date
    while current_day <= min(end_date, today):
        date_str = current_day.isoformat()
        stats = stats_by_date.get(date_str, {"total_trips": 0, "on_time_count": 0, "deviations": []})

        results.append({
            "date": date_str,
            "displayDate": current_day.strftime("%d %b"),
            "total_trips": stats["total_trips"],
            "on_time_count": stats["on_time_count"],
            "delayed_count": stats["total_trips"] - stats["on_time_count"],
            "avg_deviation": round(sum(stats["deviations"]) / len(stats["deviations"]), 1) if stats["deviations"] else 0,
            "on_time_percentage": round((stats["on_time_count"] / stats["total_trips"]) * 100, 1) if stats["total_trips"] > 0 else 0
        })

        current_day += timedelta(days=1)

    return results

@router.get("/deviation-comparison")
async def get_deviation_comparison(
    compare_type: str = Query("day", enum=["day", "week", "month", "year"]),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    today = date.today()

    def get_period_stats(start: date, end: date):
        trips = db.query(Trip).filter(
            Trip.status == 13,
            Trip.expected_c_exited_at.isnot(None),
            Trip.c_exited_at.isnot(None),
            func.date(Trip.c_exited_at) >= start,
            func.date(Trip.c_exited_at) <= end
        ).all()

        if not trips:
            return {"total_trips": 0, "on_time_pct": 0, "avg_deviation": 0}

        deviations = []
        on_time = 0
        for trip in trips:
            dev = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
            deviations.append(dev)
            if DeviationThreshold.is_on_time(dev):
                on_time += 1

        total = len(trips)
        return {
            "total_trips": total,
            "on_time_pct": round((on_time / total) * 100, 1) if total > 0 else 0,
            "avg_deviation": round(sum(deviations) / total, 1) if total > 0 else 0
        }

    if compare_type == "day":
        current_start = today
        current_end = today
        previous_start = today - timedelta(days=1)
        previous_end = today - timedelta(days=1)
        current_label = "Today"
        previous_label = "Yesterday"
    elif compare_type == "week":
        current_start = today - timedelta(days=6)
        current_end = today
        previous_start = today - timedelta(days=13)
        previous_end = today - timedelta(days=7)
        current_label = "This Week"
        previous_label = "Last Week"
    elif compare_type == "month":
        current_start = date(today.year, today.month, 1)
        current_end = today
        if today.month == 1:
            previous_start = date(today.year - 1, 12, 1)
            previous_end = date(today.year - 1, 12, 31)
        else:
            previous_start = date(today.year, today.month - 1, 1)
            previous_end = date(today.year, today.month, 1) - timedelta(days=1)
        current_label = "This Month"
        previous_label = "Last Month"
    else:        
        current_start = date(today.year, 1, 1)
        current_end = today
        previous_start = date(today.year - 1, 1, 1)
        previous_end = date(today.year - 1, 12, 31)
        current_label = "This Year"
        previous_label = "Last Year"

    current_stats = get_period_stats(current_start, current_end)
    previous_stats = get_period_stats(previous_start, previous_end)

    trips_change = 0
    on_time_change = 0
    deviation_change = 0

    if previous_stats["total_trips"] > 0:
        trips_change = round(((current_stats["total_trips"] - previous_stats["total_trips"]) / previous_stats["total_trips"]) * 100, 1)

    if previous_stats["on_time_pct"] > 0:
        on_time_change = round(current_stats["on_time_pct"] - previous_stats["on_time_pct"], 1)

    if previous_stats["avg_deviation"] != 0:
        deviation_change = round(current_stats["avg_deviation"] - previous_stats["avg_deviation"], 1)

    improved = on_time_change > 0 or (on_time_change == 0 and deviation_change < 0)

    return {
        "current_period": {'label': current_label, **current_stats},
        "previous_period": {'label': previous_label, **previous_stats},
        "change": {
            "trips_change_pct": trips_change,
            "on_time_change_pct": on_time_change,
            "deviation_change_min": deviation_change,
            "improved": improved
        }
    }

@router.get("/root-cause-analysis")
async def get_root_cause_analysis(
    date_from: date = Query(None),
    date_to: date = Query(None),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    today = date.today()
    if not date_from:
        date_from = today - timedelta(days=30)
    if not date_to:
        date_to = today

    trips = db.query(Trip).filter(
        Trip.status == 13,
        Trip.expected_c_exited_at.isnot(None),
        Trip.c_exited_at.isnot(None),
        func.date(Trip.c_exited_at) >= date_from,
        func.date(Trip.c_exited_at) <= date_to
    ).all()

    if not trips:
        return {
            "by_shift": [],
            "by_day_of_week": [],
            "worst_routes": [],
            "contributing_factors": []
        }

    shift_stats = {"Day": [], "Afternoon": [], "Night": []}
    for trip in trips:
        deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
        shift = trip.shift or "Day"
                               
        if shift.lower() in ["day", "morning"]:
            shift_key = "Day"
        elif shift.lower() in ["afternoon", "evening"]:
            shift_key = "Afternoon"
        else:
            shift_key = "Night"

        if shift_key not in shift_stats:
            shift_stats[shift_key] = []
        shift_stats[shift_key].append(deviation)

    by_shift = []
    for shift, devs in shift_stats.items():
        if devs:
            delayed = sum(1 for d in devs if not DeviationThreshold.is_on_time(d))
            by_shift.append({
                "shift": shift,
                "avg_deviation": round(sum(devs) / len(devs), 1),
                "delay_rate": round((delayed / len(devs)) * 100, 1),
                "trip_count": len(devs)
            })

    day_names = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]
    day_stats = {i: [] for i in range(7)}
    for trip in trips:
        deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
        day_of_week = trip.c_exited_at.weekday()
        day_stats[day_of_week].append(deviation)

    by_day = []
    for day_num, devs in day_stats.items():
        if devs:
            delayed = sum(1 for d in devs if not DeviationThreshold.is_on_time(d))
            by_day.append({
                "day": day_names[day_num],
                "day_num": day_num,
                "avg_deviation": round(sum(devs) / len(devs), 1),
                "delay_rate": round((delayed / len(devs)) * 100, 1),
                "trip_count": len(devs)
            })

    route_stats = {}
    for trip in trips:
        deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
        route = f"{trip.producer_id} → {trip.consumer_id}"
        if route not in route_stats:
            route_stats[route] = []
        route_stats[route].append(deviation)

    worst_routes = []
    for route, devs in route_stats.items():
        if devs and len(devs) >= 3:                                        
            worst_routes.append({
                "route": route,
                "avg_deviation": round(sum(devs) / len(devs), 1),
                "trip_count": len(devs),
                "worst_deviation": round(max(devs), 1)
            })

    worst_routes = sorted(worst_routes, key=lambda x: x["avg_deviation"], reverse=True)[:5]

    loading_total = 0
    transit_total = 0
    unloading_total = 0
    count = 0

    for trip in trips:
        if trip.expected_p_loading_end_at and trip.p_loading_end_at:
            loading_total += abs((trip.p_loading_end_at - trip.expected_p_loading_end_at).total_seconds() / 60)
        if trip.expected_c_entered_at and trip.c_entered_at:
            transit_total += abs((trip.c_entered_at - trip.expected_c_entered_at).total_seconds() / 60)
        if trip.expected_c_exited_at and trip.c_exited_at:
            unloading_total += abs((trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60)
        count += 1

    total_contribution = loading_total + transit_total + unloading_total

    contributing_factors = []
    if total_contribution > 0:
        contributing_factors = [
            {"factor": "Loading Phase", "contribution_pct": round((loading_total / total_contribution) * 100, 1)},
            {"factor": "Transit Phase", "contribution_pct": round((transit_total / total_contribution) * 100, 1)},
            {"factor": "Unloading Phase", "contribution_pct": round((unloading_total / total_contribution) * 100, 1)}
        ]

    return {
        "by_shift": sorted(by_shift, key=lambda x: x["delay_rate"], reverse=True),
        "by_day_of_week": sorted(by_day, key=lambda x: x["day_num"]),
        "worst_routes": worst_routes,
        "contributing_factors": sorted(contributing_factors, key=lambda x: x["contribution_pct"], reverse=True)
    }

class DeviationEmailRequest(BaseModel):
    email: EmailStr
    date_from: Optional[str] = None
    date_to: Optional[str] = None
    node_filter: Optional[str] = None

@router.post("/deviation-analytics/email")
async def email_deviation_analytics(
    data: DeviationEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    from ..utils.email_service import email_service, FRONTEND_URL
    from ..utils.activity_logger import log_activity

    today = date.today()

    if data.date_from:
        try:
            date_from = date.fromisoformat(data.date_from)
        except ValueError:
            date_from = today - timedelta(days=7)
    else:
        date_from = today - timedelta(days=7)

    if data.date_to:
        try:
            date_to = date.fromisoformat(data.date_to)
        except ValueError:
            date_to = today
    else:
        date_to = today

    query = db.query(Trip).filter(
        Trip.status == 13,
        Trip.expected_c_exited_at.isnot(None),
        Trip.c_exited_at.isnot(None),
        func.date(Trip.c_exited_at) >= date_from,
        func.date(Trip.c_exited_at) <= date_to
    )

    if data.node_filter and data.node_filter != 'all':
        query = query.filter(
            (Trip.producer_id == data.node_filter) | (Trip.consumer_id == data.node_filter)
        )

    trips = query.all()

    total_trips = len(trips)
    on_time = warning = alert = critical = early = 0
    total_deviation = 0
    positive_deviation = 0
    negative_deviation = 0
    positive_count = 0
    negative_count = 0

    route_stats = {}
    producer_stats = {}
    consumer_stats = {}

    trip_data = []
    for trip in trips:
        deviation = (trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60
        total_deviation += deviation

        if deviation > 0:
            positive_deviation += deviation
            positive_count += 1
        else:
            negative_deviation += abs(deviation)
            negative_count += 1

        category = DeviationThreshold.get_category(deviation)
        if category == "on_time":
            on_time += 1
        elif category == "early":
            early += 1
        elif category == "warning":
            warning += 1
        elif category == "alert":
            alert += 1
        else:
            critical += 1

        route_key = f"{trip.producer_id} → {trip.consumer_id}"
        if route_key not in route_stats:
            route_stats[route_key] = {'count': 0, 'total_dev': 0, 'on_time': 0, 'delayed': 0}
        route_stats[route_key]['count'] += 1
        route_stats[route_key]['total_dev'] += deviation
        if deviation <= 10:
            route_stats[route_key]['on_time'] += 1
        else:
            route_stats[route_key]['delayed'] += 1

        if trip.producer_id:
            if trip.producer_id not in producer_stats:
                producer_stats[trip.producer_id] = {'count': 0, 'total_dev': 0, 'on_time': 0}
            producer_stats[trip.producer_id]['count'] += 1
            producer_stats[trip.producer_id]['total_dev'] += deviation
            if deviation <= 10:
                producer_stats[trip.producer_id]['on_time'] += 1

        if trip.consumer_id:
            if trip.consumer_id not in consumer_stats:
                consumer_stats[trip.consumer_id] = {'count': 0, 'total_dev': 0, 'on_time': 0}
            consumer_stats[trip.consumer_id]['count'] += 1
            consumer_stats[trip.consumer_id]['total_dev'] += deviation
            if deviation <= 10:
                consumer_stats[trip.consumer_id]['on_time'] += 1

        loading_dev = transit_dev = unloading_dev = None
        if trip.p_exited_at and trip.expected_p_exited_at:
            loading_dev = round((trip.p_exited_at - trip.expected_p_exited_at).total_seconds() / 60, 1)
        if trip.c_entered_at and trip.expected_c_entered_at:
            transit_dev = round((trip.c_entered_at - trip.expected_c_entered_at).total_seconds() / 60, 1)
        if trip.c_exited_at and trip.expected_c_exited_at:
            unloading_dev = round((trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60, 1) - (transit_dev or 0)

        trip_data.append({
            "trip_id": trip.trip_id,
            "route": f"{trip.producer_id} → {trip.consumer_id}",
            "producer": trip.producer_id,
            "consumer": trip.consumer_id,
            "asset": trip.torpedo_id or "-",
            "completed": trip.c_exited_at.strftime("%Y-%m-%d %H:%M") if trip.c_exited_at else "-",
            "deviation": round(deviation, 1),
            "category": category,
            "loading_dev": loading_dev,
            "transit_dev": transit_dev,
            "unloading_dev": unloading_dev,
            "cycle_time": round(trip.cycle_time_minutes, 1) if trip.cycle_time_minutes else None,
            "expected_time": round(trip.expected_duration_minutes, 1) if trip.expected_duration_minutes else None
        })

    avg_deviation = round(total_deviation / total_trips, 1) if total_trips > 0 else 0
    avg_delay = round(positive_deviation / positive_count, 1) if positive_count > 0 else 0
    avg_early = round(negative_deviation / negative_count, 1) if negative_count > 0 else 0
    on_time_rate = round(((on_time + early) / total_trips * 100), 1) if total_trips > 0 else 0
    delay_rate = round((positive_count / total_trips * 100), 1) if total_trips > 0 else 0

    date_range_str = f"{date_from} to {date_to}"

    summary_html = f"""
    <div style="margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #f59e0b; padding-bottom: 8px;">📊 Deviation Summary Statistics</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
                <td style="padding: 8px 12px; background: #dcfce7; border: 1px solid #e2e8f0;"><strong>On-Time Rate</strong></td>
                <td style="padding: 8px 12px; background: #dcfce7; border: 1px solid #e2e8f0; font-weight: 700; color: #166534;">{on_time_rate}%</td>
                <td style="padding: 8px 12px; background: #fee2e2; border: 1px solid #e2e8f0;"><strong>Delay Rate</strong></td>
                <td style="padding: 8px 12px; background: #fee2e2; border: 1px solid #e2e8f0; font-weight: 700; color: #dc2626;">{delay_rate}%</td>
            </tr>
            <tr>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Total Trips</strong></td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #1e40af;">{total_trips}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Avg Deviation</strong></td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: {'#ef4444' if avg_deviation > 10 else '#f59e0b' if avg_deviation > 0 else '#16a34a'};">{'+' if avg_deviation > 0 else ''}{avg_deviation} min</td>
            </tr>
            <tr>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Avg Delay (Late)</strong></td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: #ef4444;">+{avg_delay} min ({positive_count} trips)</td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Avg Early</strong></td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: #16a34a;">-{avg_early} min ({negative_count} trips)</td>
            </tr>
        </table>
    </div>
    """

    status_html = f"""
    <div style="margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">📈 Status Distribution</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: linear-gradient(135deg, #3b82f6, #06b6d4); color: white;">
                    <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Status</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Count</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Percentage</th>
                    <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Distribution</th>
                </tr>
            </thead>
            <tbody>
                <tr style="background: #f0fdf4;">
                    <td style="padding: 8px; border: 1px solid #e2e8f0;"><span style="background: #22c55e; color: white; padding: 2px 8px; border-radius: 4px;">Early</span></td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">{early}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{round((early/total_trips)*100, 1) if total_trips > 0 else 0}%</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0;"><div style="background: #e2e8f0; border-radius: 4px; height: 16px;"><div style="background: #22c55e; height: 100%; width: {min((early/total_trips)*100*2 if total_trips > 0 else 0, 100)}%; border-radius: 4px;"></div></div></td>
                </tr>
                <tr>
                    <td style="padding: 8px; border: 1px solid #e2e8f0;"><span style="background: #22c55e; color: white; padding: 2px 8px; border-radius: 4px;">On-Time</span></td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">{on_time}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{round((on_time/total_trips)*100, 1) if total_trips > 0 else 0}%</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0;"><div style="background: #e2e8f0; border-radius: 4px; height: 16px;"><div style="background: #22c55e; height: 100%; width: {min((on_time/total_trips)*100*2 if total_trips > 0 else 0, 100)}%; border-radius: 4px;"></div></div></td>
                </tr>
                <tr style="background: #fefce8;">
                    <td style="padding: 8px; border: 1px solid #e2e8f0;"><span style="background: #f59e0b; color: white; padding: 2px 8px; border-radius: 4px;">Warning</span></td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">{warning}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{round((warning/total_trips)*100, 1) if total_trips > 0 else 0}%</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0;"><div style="background: #e2e8f0; border-radius: 4px; height: 16px;"><div style="background: #f59e0b; height: 100%; width: {min((warning/total_trips)*100*2 if total_trips > 0 else 0, 100)}%; border-radius: 4px;"></div></div></td>
                </tr>
                <tr style="background: #fff7ed;">
                    <td style="padding: 8px; border: 1px solid #e2e8f0;"><span style="background: #f97316; color: white; padding: 2px 8px; border-radius: 4px;">Alert</span></td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">{alert}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{round((alert/total_trips)*100, 1) if total_trips > 0 else 0}%</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0;"><div style="background: #e2e8f0; border-radius: 4px; height: 16px;"><div style="background: #f97316; height: 100%; width: {min((alert/total_trips)*100*2 if total_trips > 0 else 0, 100)}%; border-radius: 4px;"></div></div></td>
                </tr>
                <tr style="background: #fef2f2;">
                    <td style="padding: 8px; border: 1px solid #e2e8f0;"><span style="background: #ef4444; color: white; padding: 2px 8px; border-radius: 4px;">Critical</span></td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">{critical}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{round((critical/total_trips)*100, 1) if total_trips > 0 else 0}%</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0;"><div style="background: #e2e8f0; border-radius: 4px; height: 16px;"><div style="background: #ef4444; height: 100%; width: {min((critical/total_trips)*100*2 if total_trips > 0 else 0, 100)}%; border-radius: 4px;"></div></div></td>
                </tr>
            </tbody>
        </table>
    </div>
    """

    sorted_routes = sorted(route_stats.items(), key=lambda x: x[1]['total_dev']/x[1]['count'] if x[1]['count'] > 0 else 0, reverse=True)
    route_html = """
    <div style="margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #7c3aed; padding-bottom: 8px;">🛤️ Route Deviation Analysis</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white;">
                    <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Route</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Trips</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Avg Deviation</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">On-Time</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Delayed</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Success Rate</th>
                </tr>
            </thead>
            <tbody>
    """
    for i, (route, stats) in enumerate(sorted_routes[:15]):
        bg = '#f8fafc' if i % 2 == 0 else '#ffffff'
        avg_dev = round(stats['total_dev'] / stats['count'], 1) if stats['count'] > 0 else 0
        success = round((stats['on_time'] / stats['count']) * 100) if stats['count'] > 0 else 0
        route_html += f"""
            <tr style="background: {bg};">
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">{route}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{stats['count']}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: {'#ef4444' if avg_dev > 20 else '#f59e0b' if avg_dev > 10 else '#16a34a'};">{'+' if avg_dev > 0 else ''}{avg_dev} min</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: #16a34a;">{stats['on_time']}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; color: #ef4444;">{stats['delayed']}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: {'#16a34a' if success >= 80 else '#f59e0b' if success >= 60 else '#ef4444'};">{success}%</td>
            </tr>
        """
    route_html += "</tbody></table></div>"

    def build_node_table(node_stats, title, color, emoji):
        sorted_nodes = sorted(node_stats.items(), key=lambda x: x[1]['total_dev']/x[1]['count'] if x[1]['count'] > 0 else 0, reverse=True)
        html = f"""
        <div style="margin-bottom: 24px;">
            <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid {color}; padding-bottom: 8px;">{emoji} {title} Deviation Performance</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background: linear-gradient(135deg, {color}, {color}dd); color: white;">
                        <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Node ID</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Trips</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Avg Deviation</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">On-Time Rate</th>
                    </tr>
                </thead>
                <tbody>
        """
        for i, (node, stats) in enumerate(sorted_nodes):
            bg = '#f8fafc' if i % 2 == 0 else '#ffffff'
            avg_dev = round(stats['total_dev'] / stats['count'], 1) if stats['count'] > 0 else 0
            rate = round((stats['on_time'] / stats['count']) * 100) if stats['count'] > 0 else 0
            html += f"""
                <tr style="background: {bg};">
                    <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">{node}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{stats['count']}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: {'#ef4444' if avg_dev > 20 else '#f59e0b' if avg_dev > 10 else '#16a34a'};">{'+' if avg_dev > 0 else ''}{avg_dev} min</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: {'#16a34a' if rate >= 80 else '#f59e0b' if rate >= 60 else '#ef4444'};">{rate}%</td>
                </tr>
            """
        html += "</tbody></table></div>"
        return html

    producer_html = build_node_table(producer_stats, "Producer", "#0891b2", "🏭")
    consumer_html = build_node_table(consumer_stats, "Consumer", "#059669", "🎯")

    category_colors = {'early': '#22c55e', 'on_time': '#22c55e', 'warning': '#f59e0b', 'alert': '#f97316', 'critical': '#ef4444'}

    trip_data_sorted = sorted(trip_data, key=lambda x: x["deviation"], reverse=True)[:100]
    trips_html = """
    <div style="margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #f59e0b; padding-bottom: 8px;">📋 Detailed Trip Deviation Records</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
                <tr style="background: linear-gradient(135deg, #f59e0b, #eab308); color: white;">
                    <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Trip ID</th>
                    <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Route</th>
                    <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Asset</th>
                    <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Completed</th>
                    <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Actual</th>
                    <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Expected</th>
                    <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Deviation</th>
                    <th style="padding: 8px; text-align: center; border: 1px solid #ddd;">Status</th>
                </tr>
            </thead>
            <tbody>
    """

    for i, t in enumerate(trip_data_sorted):
        bg_color = '#f8fafc' if i % 2 == 0 else '#ffffff'
        cat_color = category_colors.get(t["category"], "#64748b")
        dev_sign = "+" if t["deviation"] > 0 else ""

        trips_html += f"""
            <tr style="background: {bg_color};">
                <td style="padding: 6px; border: 1px solid #e2e8f0; font-weight: 600; color: #1e40af; font-size: 10px;">{t["trip_id"]}</td>
                <td style="padding: 6px; border: 1px solid #e2e8f0;">{t["route"]}</td>
                <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{t["asset"]}</td>
                <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center; font-size: 10px;">{t["completed"]}</td>
                <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{t["cycle_time"]} min</td>
                <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">{t["expected_time"]} min</td>
                <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: {cat_color};">{dev_sign}{t["deviation"]} min</td>
                <td style="padding: 6px; border: 1px solid #e2e8f0; text-align: center;">
                    <span style="background: {cat_color}; color: white; padding: 2px 6px; border-radius: 4px; font-size: 9px; text-transform: uppercase;">{t["category"]}</span>
                </td>
            </tr>
        """

    trips_html += "</tbody></table>"
    if len(trips) > 100:
        trips_html += f"<p style='color: #64748b; margin-top: 10px; font-size: 11px;'>Showing top 100 trips by deviation of {len(trips)} total.</p>"
    trips_html += "</div>"

    if not trip_data:
        trips_html = "<p style='color: #64748b;'>No deviation data available for the selected criteria.</p>"

    email_content = f"""
        <h2 style="color: #0f172a; margin-bottom: 20px;">Deviation Analytics Report - Detailed Analysis</h2>
        <div style="margin-bottom: 20px; color: #64748b; font-size: 13px; background: #f8fafc; padding: 16px; border-radius: 8px;">
            <p style="margin: 4px 0;"><strong>Generated:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
            <p style="margin: 4px 0;"><strong>Requested by:</strong> {current_user.username}</p>
            <p style="margin: 4px 0;"><strong>Date Range:</strong> {date_range_str}</p>
            <p style="margin: 4px 0;"><strong>Total Trips Analyzed:</strong> {total_trips}</p>
        </div>
        {summary_html}
        {status_html}
        {route_html}
        {producer_html}
        {consumer_html}
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
                <p><a href="{FRONTEND_URL}/deviation-analytics" style="color: #3b82f6;">View Deviation Analytics</a></p>
                <p class="footer-copyright">&copy; {datetime.now().year} Deevia Software India Pvt Ltd. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        email_sent = email_service._send_email(
            to_email=data.email,
            subject="HMD System - Deviation Analytics Report (Detailed)",
            html_content=html,
            text_content=f"Deviation Analytics Report (Detailed) generated on {datetime.now().strftime('%Y-%m-%d %H:%M')} with {total_trips} trips analyzed. On-Time Rate: {on_time_rate}%, Avg Deviation: {avg_deviation} min."
        )

        if not email_sent:
            raise HTTPException(status_code=500, detail="Failed to send email. Please check SMTP configuration.")

        log_activity(
            db, current_user.username, "DEVIATION_ANALYTICS_EMAILED",
            details=f"Deviation analytics emailed to {data.email} with {total_trips} trips",
            current_user=current_user
        )

        logger.info(f"Deviation analytics emailed by {current_user.username} to {data.email}")
        return {"status": "success", "message": f"Deviation analytics sent to {data.email}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending deviation analytics email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")
