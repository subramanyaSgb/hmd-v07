
from fastapi import APIRouter, Depends, Query, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from datetime import date, timedelta, datetime
from pydantic import BaseModel, EmailStr
from typing import Optional

from ..database.engine import get_db
from ..database.models import DailyPlan, Trip, FleetManagement, SystemConfig, User
from ..constants import TripStatus
from ..logger import logger
from ..utils.security import get_current_user_required
from ..utils.email_service import EmailService
from ..utils.analytics_helpers import get_config, get_avg_capacity

router = APIRouter(prefix="/api/statistics", tags=["statistics"])

class StatisticsEmailRequest(BaseModel):
    email: EmailStr
    range_type: str = "week"
    start_date: Optional[str] = None
    end_date: Optional[str] = None

@router.get("/trends")
async def get_logistics_trends(
    user_id: str = None,
    role: str = None,
    range_type: str = Query("day", enum=["day", "week", "month", "year", "custom"]),
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

    avg_capacity = get_avg_capacity(db)

    prod_timestamp = func.coalesce(Trip.p_exited_at, Trip.created_at)

    prod_query = db.query(
        func.date(prod_timestamp).label("date"),
        func.count(Trip.id).label("trip_count")
    ).filter(
        Trip.status == TripStatus.COMPLETED,
        prod_timestamp >= datetime.combine(start_date, datetime.min.time())
    )
    if user_id and role == "producer":
        prod_query = prod_query.filter(Trip.producer_id == user_id)

    prod_metrics = prod_query.group_by(func.date(prod_timestamp)).all()
    prod_map = {str(r.date): r.trip_count * avg_capacity for r in prod_metrics if r.date is not None}

    cons_query = db.query(
        func.date(Trip.c_exited_at).label("date"),
        func.count(Trip.id).label("trip_count")
    ).filter(
        Trip.status == 13,
        Trip.c_exited_at >= datetime.combine(start_date, datetime.min.time())
    )
    if user_id and role == "consumer":
        cons_query = cons_query.filter(Trip.consumer_id == user_id)

    cons_metrics = cons_query.group_by(func.date(Trip.c_exited_at)).all()
    cons_map = {str(r.date): r.trip_count * avg_capacity for r in cons_metrics if r.date is not None}

    prod_plan_query = db.query(
        DailyPlan.date,
        func.sum(DailyPlan.capacity).label("planned")
    ).filter(
        DailyPlan.date >= start_date,
        DailyPlan.date <= end_date,
        DailyPlan.role == "producer"
    ).group_by(DailyPlan.date)

    prod_plan_metrics = prod_plan_query.all()
    prod_plan_map = {str(r.date): r.planned or 0 for r in prod_plan_metrics if r.date is not None}

    cons_plan_query = db.query(
        DailyPlan.date,
        func.sum(DailyPlan.capacity).label("planned")
    ).filter(
        DailyPlan.date >= start_date,
        DailyPlan.date <= end_date,
        DailyPlan.role == "consumer"
    ).group_by(DailyPlan.date)

    cons_plan_metrics = cons_plan_query.all()
    cons_plan_map = {str(r.date): r.planned or 0 for r in cons_plan_metrics if r.date is not None}

    if range_type == "year":
                                            
        monthly_results = {}
        for month_num in range(1, 13):
            month_key = f"{today.year}-{month_num:02d}"
            month_date = date(today.year, month_num, 1)
            monthly_results[month_key] = {
                "date": month_key,
                "displayDate": month_date.strftime("%b"),
                "production": 0,
                "consumption": 0,
                "plannedProduction": 0,
                "plannedConsumption": 0
            }

        current_day = start_date
        while current_day <= end_date:
            date_str = current_day.isoformat()
            month_key = current_day.strftime("%Y-%m")

            if month_key in monthly_results:
                if current_day <= today:
                    monthly_results[month_key]["production"] += prod_map.get(date_str, 0)
                    monthly_results[month_key]["consumption"] += cons_map.get(date_str, 0)
                monthly_results[month_key]["plannedProduction"] += prod_plan_map.get(date_str, 0)
                monthly_results[month_key]["plannedConsumption"] += cons_plan_map.get(date_str, 0)

            current_day += timedelta(days=1)

        results = []
        for month_key in sorted(monthly_results.keys()):
            data = monthly_results[month_key]
            data["efficiency"] = round((data["consumption"] / data["production"] * 100), 1) if data["production"] > 0 else 0
            results.append(data)

        return results
    else:
                                               
        results = []
        current_day = start_date
        while current_day <= end_date:
            date_str = current_day.isoformat()

            if current_day <= today:
                day_prod = prod_map.get(date_str, 0)
                day_cons = cons_map.get(date_str, 0)
            else:
                day_prod = 0
                day_cons = 0

            day_prod_plan = prod_plan_map.get(date_str, 0)
            day_cons_plan = cons_plan_map.get(date_str, 0)

            results.append({
                "date": date_str,
                "displayDate": current_day.strftime("%d %b"),
                "production": day_prod,
                "consumption": day_cons,
                "plannedProduction": day_prod_plan,
                "plannedConsumption": day_cons_plan,
                "efficiency": round((day_cons / day_prod * 100), 1) if day_prod > 0 else 0
            })

            current_day += timedelta(days=1)

        window_size = 7
        for i, item in enumerate(results):
            item_date = date.fromisoformat(item["date"])
            if item_date > today:
                item["movingAvg"] = None
                continue

            if i >= window_size - 1:
                window_values = [results[j]["production"] for j in range(i - window_size + 1, i + 1)]
                item["movingAvg"] = round(sum(window_values) / window_size, 1)
            else:
                item["movingAvg"] = None

        return results


@router.get("/nodes-performance-summary")
async def get_nodes_performance_summary(
    range_type: str = Query("day", enum=["day", "week", "month", "year", "custom"]),
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

    plans = db.query(DailyPlan).filter(
        DailyPlan.date >= start_date,
        DailyPlan.date <= end_date
    ).all()

    trips = db.query(Trip).filter(
        Trip.status == 13,
        func.date(Trip.c_exited_at) >= start_date,
        func.date(Trip.c_exited_at) <= min(end_date, today)
    ).all()

    avg_capacity = get_avg_capacity(db)

    node_stats = {}

    for p in plans:
        if p.user_id not in node_stats:
            node_stats[p.user_id] = {"user_id": p.user_id, "role": p.role, "planned": 0, "actual": 0}
        node_stats[p.user_id]["planned"] += p.capacity

    for t in trips:
        tonnage = (t.net_weight_kg / 1000) if t.net_weight_kg else avg_capacity
        if t.producer_id in node_stats:
            node_stats[t.producer_id]["actual"] += tonnage
        if t.consumer_id in node_stats:
            node_stats[t.consumer_id]["actual"] += tonnage

    results = []
    for node_id, stats in node_stats.items():
        planned = stats["planned"]
        actual = stats["actual"]
        results.append({
            "user_id": node_id,
            "role": stats["role"],
            "planned": round(planned, 1),
            "actual": round(actual, 1),
            "fulfillment_rate": round((actual / planned * 100), 1) if planned > 0 else 0
        })

    return sorted(results, key=lambda x: x['fulfillment_rate'], reverse=True)

@router.get("/summary")
async def get_logistics_summary(
    user_id: str = None,
    role: str = None,
    range_type: str = Query("day", enum=["day", "week", "month", "year", "custom"]),
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

    avg_capacity = get_avg_capacity(db)

    def get_stats_for_role(target_role: str):
                                          
        query = db.query(DailyPlan).filter(
            DailyPlan.date >= start_date,
            DailyPlan.date <= end_date,
            DailyPlan.role == target_role
        )
        if user_id and role != 'admin' and target_role == role:
            query = query.filter(DailyPlan.user_id == user_id)

        total_planned = sum(p.capacity for p in query.all())

        trips_query = db.query(Trip).filter(
            Trip.status == 13,
            func.date(Trip.c_exited_at) >= start_date,
            func.date(Trip.c_exited_at) <= min(end_date, today)
        )
        if target_role == "producer":
            if user_id and role == "producer":
                trips_query = trips_query.filter(Trip.producer_id == user_id)
        else:
            if user_id and role == "consumer":
                trips_query = trips_query.filter(Trip.consumer_id == user_id)

        actual_trips = trips_query.all()
        total_actual = sum((t.net_weight_kg / 1000) if t.net_weight_kg else avg_capacity for t in actual_trips)

        cycle_query = db.query(func.avg(Trip.cycle_time_minutes)).filter(
            Trip.status == 13,
            func.date(Trip.c_exited_at) >= start_date,
            func.date(Trip.c_exited_at) <= min(end_date, today)
        )
        if target_role == "producer":
            if user_id and role == "producer":
                cycle_query = cycle_query.filter(Trip.producer_id == user_id)
        else:
            if user_id and role == "consumer":
                cycle_query = cycle_query.filter(Trip.consumer_id == user_id)

        average_cycle = cycle_query.scalar() or 0

        if target_role == "producer":
            active_query = db.query(Trip).filter(Trip.status >= 1, Trip.status < 8)
            if user_id and role == "producer":
                active_query = active_query.filter(Trip.producer_id == user_id)
        else:
            active_query = db.query(Trip).filter(Trip.status >= 4, Trip.status < 13)
            if user_id and role == "consumer":
                active_query = active_query.filter(Trip.consumer_id == user_id)

        active_count = active_query.count()

        lifetime_query = db.query(Trip).filter(Trip.status == 13)
        if target_role == "producer":
            if user_id and role == "producer":
                lifetime_query = lifetime_query.filter(Trip.producer_id == user_id)
        else:
            if user_id and role == "consumer":
                lifetime_query = lifetime_query.filter(Trip.consumer_id == user_id)

        lifetime_trips = lifetime_query.all()
        lifetime_total = sum((t.net_weight_kg / 1000) if t.net_weight_kg else avg_capacity for t in lifetime_trips)

        try:
            month_start = date(today.year, today.month, 1)
            if today.month == 12:
                month_end = date(today.year, 12, 31)
            else:
                month_end = date(today.year, today.month + 1, 1) - timedelta(days=1)

            month_plan_query = db.query(DailyPlan).filter(
                DailyPlan.date >= month_start,
                DailyPlan.date <= month_end,
                DailyPlan.role == target_role
            )
            if user_id and role != 'admin' and target_role == role:
                month_plan_query = month_plan_query.filter(DailyPlan.user_id == user_id)
            month_planned = sum(p.capacity for p in month_plan_query.all())

            month_actual_query = db.query(Trip).filter(
                Trip.status == 13,
                func.date(Trip.c_exited_at) >= month_start,
                func.date(Trip.c_exited_at) <= min(month_end, today)
            )
            if target_role == "producer":
                if user_id and role == "producer":
                    month_actual_query = month_actual_query.filter(Trip.producer_id == user_id)
            else:
                if user_id and role == "consumer":
                    month_actual_query = month_actual_query.filter(Trip.consumer_id == user_id)

            month_actual_trips = month_actual_query.all()
            month_actual = sum((t.net_weight_kg / 1000) if t.net_weight_kg else avg_capacity for t in month_actual_trips)
        except SQLAlchemyError as e:
            logger.error(f"Database error calculating monthly stats for {target_role}: {str(e)}")
            month_planned = 0
            month_actual = 0

        return {
            "planned": total_planned,
            "actual": total_actual,
            "efficiency": round((total_actual / total_planned * 100), 1) if total_planned > 0 else 0,
            "avg_cycle_time": round(float(average_cycle), 1),
            "active_trips": active_count,
            "lifetime_total": int(lifetime_total),
            "monthly_planned": month_planned,
            "monthly_actual": int(month_actual)
        }

    admin_like = role in ('admin', 'trs', 'ppc')
    if user_id and not admin_like:
        return {
            "producers": get_stats_for_role("producer") if role == "producer" else None,
            "consumers": get_stats_for_role("consumer") if role == "consumer" else None,
            "is_admin": False
        }
    else:
        return {
            "producers": get_stats_for_role("producer"),
            "consumers": get_stats_for_role("consumer"),
            "is_admin": True
        }

@router.get("/fleet-utilization")
async def get_fleet_utilization(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    total_torpedoes = db.query(FleetManagement).filter(
        FleetManagement.type == 'torpedo',
        FleetManagement.deleted_at.is_(None)
    ).count()

    if total_torpedoes == 0:
        return {"assigned": 0, "operating": 0, "maintenance": 0, "total": 0, "utilization_percent": 0}

    active_trips = db.query(Trip).filter(
        Trip.torpedo_id.isnot(None),
        Trip.status >= TripStatus.ASSIGNED,
        Trip.status <= TripStatus.UNLOADING_ENDED,
        Trip.deleted_at.is_(None)
    ).all()

    assigned_torpedo_ids = {t.torpedo_id for t in active_trips}
    assigned = len(assigned_torpedo_ids)

    maintenance = db.query(FleetManagement).filter(
        FleetManagement.type == 'torpedo',
        FleetManagement.status == "Maintenance",
        FleetManagement.deleted_at.is_(None)
    ).count()

    operating = total_torpedoes - assigned - maintenance

    utilization = round((assigned / total_torpedoes * 100), 1)

    return {
        "assigned": assigned,
        "operating": operating,
        "maintenance": maintenance,
        "total": total_torpedoes,
        "utilization_percent": utilization
    }


@router.post("/email")
async def email_statistics_report(
    request: StatisticsEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    try:
        today = date.today()
        range_type = request.range_type

        if range_type == "custom" and request.start_date and request.end_date:
            start_date = date.fromisoformat(request.start_date)
            end_date = date.fromisoformat(request.end_date)
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

        avg_capacity = get_avg_capacity(db)

        prod_plans = db.query(DailyPlan).filter(
            DailyPlan.date >= start_date,
            DailyPlan.date <= end_date,
            DailyPlan.role == "producer"
        ).all()
        prod_planned = sum(p.capacity for p in prod_plans)

        prod_trips_list = db.query(Trip).filter(
            Trip.status == 13,
            func.date(Trip.c_exited_at) >= start_date,
            func.date(Trip.c_exited_at) <= min(end_date, today)
        ).all()
        prod_actual = sum((t.net_weight_kg / 1000) if t.net_weight_kg else avg_capacity for t in prod_trips_list)
        prod_efficiency = round((prod_actual / prod_planned * 100), 1) if prod_planned > 0 else 0

        cons_plans = db.query(DailyPlan).filter(
            DailyPlan.date >= start_date,
            DailyPlan.date <= end_date,
            DailyPlan.role == "consumer"
        ).all()
        cons_planned = sum(p.capacity for p in cons_plans)

        cons_trips_list = db.query(Trip).filter(
            Trip.status == 13,
            func.date(Trip.c_exited_at) >= start_date,
            func.date(Trip.c_exited_at) <= min(end_date, today)
        ).all()
        cons_actual = sum((t.net_weight_kg / 1000) if t.net_weight_kg else avg_capacity for t in cons_trips_list)
        cons_efficiency = round((cons_actual / cons_planned * 100), 1) if cons_planned > 0 else 0

        fleet_total = db.query(FleetManagement).filter(FleetManagement.type == 'torpedo').count()
        fleet_assigned = db.query(FleetManagement).filter(
            FleetManagement.type == 'torpedo', FleetManagement.status == "Assigned"
        ).count()
        fleet_operating = db.query(FleetManagement).filter(
            FleetManagement.type == 'torpedo', FleetManagement.status == "Operating"
        ).count()
        fleet_maintenance = db.query(FleetManagement).filter(
            FleetManagement.type == 'torpedo', FleetManagement.status == "Maintenance"
        ).count()
        fleet_utilization = round((fleet_assigned / fleet_total * 100), 1) if fleet_total > 0 else 0

        nodes = db.query(DailyPlan).filter(
            DailyPlan.date >= start_date,
            DailyPlan.date <= end_date
        ).all()

        trips = db.query(Trip).filter(
            Trip.status == 13,
            func.date(Trip.c_exited_at) >= start_date,
            func.date(Trip.c_exited_at) <= min(end_date, today)
        ).all()

        node_stats = {}
        for p in nodes:
            if p.user_id not in node_stats:
                node_stats[p.user_id] = {"user_id": p.user_id, "role": p.role, "planned": 0, "actual": 0}
            node_stats[p.user_id]["planned"] += p.capacity

        for t in trips:
            tonnage = (t.net_weight_kg / 1000) if t.net_weight_kg else avg_capacity
            if t.producer_id in node_stats:
                node_stats[t.producer_id]["actual"] += tonnage
            if t.consumer_id in node_stats:
                node_stats[t.consumer_id]["actual"] += tonnage

        producers = [n for n in node_stats.values() if n["role"] == "producer"]
        consumers = [n for n in node_stats.values() if n["role"] == "consumer"]

        range_label = range_type.capitalize()
        if range_type == "custom":
            range_label = f"{start_date.strftime('%d %b %Y')} - {end_date.strftime('%d %b %Y')}"

        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <meta charset="utf-8">
            <style>
                body {{ font-family: 'Segoe UI', Arial, sans-serif; margin: 0; padding: 0; background: #f4f6f9; }}
                .container {{ max-width: 700px; margin: 0 auto; background: white; }}
                .header {{ background: linear-gradient(135deg, #1e3a5f 0%, #2c5282 100%); padding: 24px 32px; text-align: center; }}
                .logo {{ font-size: 28px; font-weight: 800; color: white; letter-spacing: 2px; }}
                .logo-sub {{ font-size: 10px; color: #a0c4ff; letter-spacing: 3px; margin-top: 4px; }}
                .content {{ padding: 32px; }}
                .title {{ font-size: 20px; font-weight: 700; color: #1e3a5f; margin-bottom: 8px; }}
                .subtitle {{ font-size: 13px; color: #718096; margin-bottom: 24px; }}
                .section {{ margin-bottom: 24px; }}
                .section-title {{ font-size: 14px; font-weight: 700; color: #1e3a5f; margin-bottom: 12px; padding-bottom: 8px; border-bottom: 2px solid #e2e8f0; }}
                .summary-grid {{ display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 24px; }}
                .summary-card {{ background: #f8fafc; border-radius: 8px; padding: 16px; border-left: 4px solid; }}
                .summary-card.prod {{ border-color: #3b82f6; }}
                .summary-card.cons {{ border-color: #10b981; }}
                .summary-card.fleet {{ border-color: #f59e0b; }}
                .summary-label {{ font-size: 11px; font-weight: 700; color: #718096; text-transform: uppercase; letter-spacing: 0.5px; }}
                .summary-value {{ font-size: 24px; font-weight: 800; color: #1e3a5f; margin: 4px 0; }}
                .summary-sub {{ font-size: 11px; color: #718096; }}
                table {{ width: 100%; border-collapse: collapse; font-size: 12px; }}
                th {{ background: #f1f5f9; padding: 10px 12px; text-align: left; font-weight: 700; color: #475569; text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; }}
                td {{ padding: 10px 12px; border-bottom: 1px solid #e2e8f0; }}
                .rate {{ font-weight: 700; padding: 4px 8px; border-radius: 4px; font-size: 11px; }}
                .rate.high {{ background: #dcfce7; color: #166534; }}
                .rate.medium {{ background: #fef9c3; color: #854d0e; }}
                .rate.low {{ background: #fee2e2; color: #991b1b; }}
                .footer {{ background: #f8fafc; padding: 20px 32px; text-align: center; border-top: 1px solid #e2e8f0; }}
                .footer-company {{ font-size: 12px; font-weight: 700; color: #1e3a5f; }}
                .footer-tagline {{ font-size: 10px; color: #718096; margin-top: 4px; }}
            </style>
        </head>
        <body>
            <div class="container">
                <div class="header">
                    <div class="logo">DEEVIA</div>
                    <div class="logo-sub">DEEP VISION ANALYTICS</div>
                </div>
                <div class="content">
                    <div class="title">Performance Dashboard Report</div>
                    <div class="subtitle">Period: {range_label} | Generated: {datetime.now().strftime('%d %b %Y, %H:%M')}</div>

                    <div class="section">
                        <div class="section-title">Summary Metrics</div>
                        <table style="margin-bottom: 16px;">
                            <tr>
                                <td style="background: #eff6ff; border-left: 3px solid #3b82f6;">
                                    <div class="summary-label">Production</div>
                                    <div style="font-size: 18px; font-weight: 800; color: #1e3a5f;">{prod_actual:,.0f} MT</div>
                                    <div class="summary-sub">Planned: {prod_planned:,.0f} MT | Efficiency: {prod_efficiency}%</div>
                                </td>
                                <td style="background: #ecfdf5; border-left: 3px solid #10b981;">
                                    <div class="summary-label">Consumption</div>
                                    <div style="font-size: 18px; font-weight: 800; color: #1e3a5f;">{cons_actual:,.0f} MT</div>
                                    <div class="summary-sub">Planned: {cons_planned:,.0f} MT | Efficiency: {cons_efficiency}%</div>
                                </td>
                            </tr>
                        </table>
                    </div>

                    <div class="section">
                        <div class="section-title">Fleet Status</div>
                        <table>
                            <tr>
                                <th>Status</th>
                                <th>Count</th>
                                <th>Percentage</th>
                            </tr>
                            <tr>
                                <td><strong>Assigned</strong></td>
                                <td>{fleet_assigned}</td>
                                <td>{round(fleet_assigned/fleet_total*100, 1) if fleet_total > 0 else 0}%</td>
                            </tr>
                            <tr>
                                <td><strong>Available</strong></td>
                                <td>{fleet_operating}</td>
                                <td>{round(fleet_operating/fleet_total*100, 1) if fleet_total > 0 else 0}%</td>
                            </tr>
                            <tr>
                                <td><strong>Maintenance</strong></td>
                                <td>{fleet_maintenance}</td>
                                <td>{round(fleet_maintenance/fleet_total*100, 1) if fleet_total > 0 else 0}%</td>
                            </tr>
                            <tr style="background: #f1f5f9;">
                                <td><strong>Total Fleet</strong></td>
                                <td><strong>{fleet_total}</strong></td>
                                <td><strong>Utilization: {fleet_utilization}%</strong></td>
                            </tr>
                        </table>
                    </div>

                    <div class="section">
                        <div class="section-title">Producer Performance</div>
                        <table>
                            <tr>
                                <th>Node</th>
                                <th>Planned</th>
                                <th>Actual</th>
                                <th>Fulfillment</th>
                            </tr>
        """

        for p in sorted(producers, key=lambda x: x.get("actual", 0), reverse=True):
            rate = round((p["actual"] / p["planned"] * 100), 1) if p["planned"] > 0 else 0
            rate_class = "high" if rate >= 80 else ("medium" if rate >= 50 else "low")
            html_content += f"""
                            <tr>
                                <td><strong>{p["user_id"]}</strong></td>
                                <td>{p["planned"]:,.0f} MT</td>
                                <td>{p["actual"]:,.0f} MT</td>
                                <td><span class="rate {rate_class}">{rate}%</span></td>
                            </tr>
            """

        html_content += """
                        </table>
                    </div>

                    <div class="section">
                        <div class="section-title">Consumer Performance</div>
                        <table>
                            <tr>
                                <th>Node</th>
                                <th>Planned</th>
                                <th>Actual</th>
                                <th>Fulfillment</th>
                            </tr>
        """

        for c in sorted(consumers, key=lambda x: x.get("actual", 0), reverse=True):
            rate = round((c["actual"] / c["planned"] * 100), 1) if c["planned"] > 0 else 0
            rate_class = "high" if rate >= 80 else ("medium" if rate >= 50 else "low")
            html_content += f"""
                            <tr>
                                <td><strong>{c["user_id"]}</strong></td>
                                <td>{c["planned"]:,.0f} MT</td>
                                <td>{c["actual"]:,.0f} MT</td>
                                <td><span class="rate {rate_class}">{rate}%</span></td>
                            </tr>
            """

        html_content += f"""
                        </table>
                    </div>
                </div>
                <div class="footer">
                    <div class="footer-company">DEEVIA SOFTWARE INDIA PVT LTD</div>
                    <div class="footer-tagline">Advanced Logistics Control & Operational Intelligence System</div>
                    <div style="font-size: 9px; color: #a0aec0; margin-top: 8px;">&copy; {datetime.now().year} All Rights Reserved</div>
                </div>
            </div>
        </body>
        </html>
        """

        email_service = EmailService()
        success = email_service._send_email(
            to_email=request.email,
            subject=f"Performance Dashboard Report - {range_label}",
            html_content=html_content
        )

        if not success:
            raise HTTPException(status_code=500, detail="Failed to send email")

        logger.info(f"Statistics report emailed to {request.email} by {current_user.user_id}")
        return {"success": True, "message": f"Report sent to {request.email}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error emailing statistics report: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to send email: {str(e)}")
