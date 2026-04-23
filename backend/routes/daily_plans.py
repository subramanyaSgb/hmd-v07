
from fastapi import APIRouter, Depends, HTTPException
from datetime import date, datetime, timedelta
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError

from ..database.engine import get_db
from ..database.models import (
    DailyPlan, User, FleetManagement, DistributionAssignment,
    Trip, SystemConfig
)
from sqlalchemy import func
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.security import get_current_user_required, require_roles
from ..utils.redis_cache import cache
from ..utils.analytics_helpers import get_config
from ..schemas import DailyPlanUpsert, DailyPlanConfirm, DailyPlanResponse

CACHE_KEY_DASHBOARD = "plans:dashboard"
CACHE_TTL_DASHBOARD = 30

router = APIRouter(prefix="/api/daily-plans", tags=["daily-plans"])

@router.post("", response_model=DailyPlanResponse)
async def upsert_daily_plan(
    data: DailyPlanUpsert,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                                                      
    cache.delete(CACHE_KEY_DASHBOARD)

    plan_date = date.today()                                    

    plan = db.query(DailyPlan).filter(
        DailyPlan.date == plan_date,
        DailyPlan.user_id == data.user_id
    ).first()

    if plan:
        plan.capacity = data.capacity
        plan.role = data.role.value                                   
        logger.info(f"Updated daily plan for {data.user_id} on {plan_date}: {data.capacity}")
    else:
        plan = DailyPlan(
            date=plan_date,
            user_id=data.user_id,
            role=data.role.value,
            capacity=data.capacity
        )
        db.add(plan)
        logger.info(f"Created new daily plan for {data.user_id} on {plan_date}: {data.capacity}")

    is_new = plan.id is None

    try:
        db.commit()
        db.refresh(plan)
        action = "DAILY_PLAN_CREATED" if is_new else "DAILY_PLAN_UPDATED"
        log_activity(
            db, current_user.username, action,
            details=f"{data.role.value} plan: {data.capacity} MT for {plan_date}",
            current_user=current_user,
            entity_type="plan",
            entity_id=f"{plan.user_id}_{plan_date}",
            new_value={"user_id": plan.user_id, "role": data.role.value, "capacity": data.capacity, "date": str(plan_date)}
        )
        return plan
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error upserting daily plan: {e}")
        raise HTTPException(status_code=500, detail="Failed to save daily plan. Please try again.")

@router.get("/history/{user_id}")
async def get_plan_history(
    user_id: str,
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    try:
                                                            
        if not end_date:
            end_date = date.today().isoformat()
        if not start_date:
            start_dt = date.today() - timedelta(days=90)
            start_date = start_dt.isoformat()

        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)

        query = db.query(DailyPlan)

        if user_id.lower() != 'all':
            query = query.filter(DailyPlan.user_id == user_id)

        query = query.filter(
            DailyPlan.date >= start,
            DailyPlan.date <= end
        ).order_by(DailyPlan.date.desc())

        plans = query.all()

        return [
            {
                "id": p.id,
                "date": p.date.isoformat(),
                "capacity": p.capacity,
                "status": p.status,
                "role": p.role,
                "last_updated": p.last_updated.isoformat() if p.last_updated else None
            } for p in plans
        ]
    except SQLAlchemyError as e:
        logger.error(f"Database error retrieving planning history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve planning history. Please try again.")

@router.post("/confirm-day")
async def confirm_daily_plan(
    data: DailyPlanConfirm,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
    try:
                                                                 
        if data.date:
            plan_date = date.fromisoformat(data.date)
        else:
            plan_date = date.today()

        db.query(DailyPlan).filter(DailyPlan.date == plan_date).update({"status": "Confirmed"})

        cache.delete(CACHE_KEY_DASHBOARD)

        db.commit()
        log_activity(
            db, admin_user.username, "DAILY_PLAN_CONFIRMED",
            details=f"Confirmed plan for {plan_date}",
            current_user=admin_user,
            entity_type="plan",
            entity_id=str(plan_date),
            new_value={"date": str(plan_date), "status": "confirmed"}
        )
        return {"status": "success", "message": f"Plan for {plan_date} confirmed."}
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error confirming plan: {e}")
        raise HTTPException(status_code=500, detail="Failed to confirm daily plan. Please try again.")

@router.get("/dashboard-summary")
async def get_dashboard_summary(
    date_str: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                                                                                     
    if not date_str:
        cached_data = cache.get(CACHE_KEY_DASHBOARD)
        if cached_data is not None:
            return cached_data

    logger.debug(f"Fetching dashboard summary (Date: {date_str or 'Today'}).")

    if date_str:
        today = date.fromisoformat(date_str)
    else:
        today = date.today()

    plans = db.query(DailyPlan).filter(DailyPlan.date == today).all()
    assignments = db.query(DistributionAssignment).filter(
        DistributionAssignment.date == today,
        DistributionAssignment.status == "Committed"
    ).all()

    total_prod = sum(p.capacity for p in plans if p.role == 'producer')
    total_cons = sum(p.capacity for p in plans if p.role == 'consumer')

    active_torpedoes = db.query(FleetManagement).filter(
        FleetManagement.type == 'torpedo',
        FleetManagement.status.in_(["Operating", "Assigned"])
    ).all()
    avg_capacity = sum((f.capacity or 0) for f in active_torpedoes) / len(active_torpedoes) if active_torpedoes else float(get_config(db, "NOMINAL_CAPACITY", "150.0"))

    completed_trips_today = db.query(Trip).filter(
        Trip.status == 13,
        func.date(Trip.c_exited_at) == today
    ).all()

    node_actuals = {}                      
    for t in completed_trips_today:
        tonnage = (t.net_weight_kg / 1000) if t.net_weight_kg else avg_capacity
        if t.producer_id:
            node_actuals[t.producer_id] = node_actuals.get(t.producer_id, 0) + tonnage
        if t.consumer_id:
            node_actuals[t.consumer_id] = node_actuals.get(t.consumer_id, 0) + tonnage

    res = {
        "summary": {
            "total_production": total_prod,
            "total_consumption": total_cons,
            "total_actual_production": sum(v for k, v in node_actuals.items() if any(p.user_id == k and p.role == 'producer' for p in plans)),
            "total_actual_consumption": sum(v for k, v in node_actuals.items() if any(p.user_id == k and p.role == 'consumer' for p in plans)),
            "net": total_prod - total_cons
        },
        "individual": [
            {
                "user_id": p.user_id,
                "capacity": p.capacity,
                "role": p.role,
                "status": p.status,
                "actual": node_actuals.get(p.user_id, 0)
            } for p in plans
        ],
        "assignments": [
            {
                "producer_id": a.producer_id,
                "consumer_id": a.consumer_id,
                "quantity": a.quantity,
                "trips": a.trips,
                "travel_time": a.travel_time,
                "actual_trips": db.query(Trip).filter(Trip.assignment_id == a.id, Trip.status == 13).count()
            } for a in assignments
        ]
    }

    if not date_str:
        cache.set(CACHE_KEY_DASHBOARD, res, ttl=CACHE_TTL_DASHBOARD)

    return res

from pydantic import BaseModel, EmailStr

class PlanEmailRequest(BaseModel):
    email: EmailStr
    plan_id: str

@router.post("/email")
async def email_plan_report(
    data: PlanEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    from ..utils.email_service import email_service, FRONTEND_URL

    plan_data = await get_plan_by_id_internal(data.plan_id, db)
    if not plan_data:
        raise HTTPException(status_code=404, detail="Plan not found")

    plan = plan_data
    summary = plan.get("summary", {})
    producers = plan.get("producers", [])
    consumers = plan.get("consumers", [])
    routes = plan.get("routes", [])
    trip_details = plan.get("trips", [])

    producers_table = ""
    if producers:
        producers_table = """
        <h3 style="color: #0f172a; margin: 24px 0 12px 0; font-size: 14px;">Producer Performance</h3>
        <table style='border-collapse: collapse; width: 100%; font-size: 12px; margin-bottom: 20px;'>
        <thead><tr style='background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white;'>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>Producer</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Planned (MT)</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Actual (MT)</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Trips</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Fulfillment</th>
        </tr></thead><tbody>"""

        for i, p in enumerate(producers):
            bg_color = '#f8fafc' if i % 2 == 0 else '#ffffff'
            rate = p.get('fulfillment', 0)
            rate_color = '#22c55e' if rate >= 80 else '#f59e0b' if rate >= 50 else '#ef4444'
            producers_table += f"""<tr style='background: {bg_color};'>
                <td style='border: 1px solid #ddd; padding: 8px; font-weight: 600;'>{p.get('node_id', 'N/A')}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{p.get('planned', 0):,.0f}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{p.get('actual', 0):,.0f}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{p.get('trips_completed', 0)}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right; color: {rate_color}; font-weight: 600;'>{rate}%</td>
            </tr>"""
        producers_table += "</tbody></table>"

    consumers_table = ""
    if consumers:
        consumers_table = """
        <h3 style="color: #0f172a; margin: 24px 0 12px 0; font-size: 14px;">Consumer Performance</h3>
        <table style='border-collapse: collapse; width: 100%; font-size: 12px; margin-bottom: 20px;'>
        <thead><tr style='background: linear-gradient(135deg, #06b6d4, #0891b2); color: white;'>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>Consumer</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Planned (MT)</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Actual (MT)</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Trips</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Fulfillment</th>
        </tr></thead><tbody>"""

        for i, c in enumerate(consumers):
            bg_color = '#f8fafc' if i % 2 == 0 else '#ffffff'
            rate = c.get('fulfillment', 0)
            rate_color = '#22c55e' if rate >= 80 else '#f59e0b' if rate >= 50 else '#ef4444'
            consumers_table += f"""<tr style='background: {bg_color};'>
                <td style='border: 1px solid #ddd; padding: 8px; font-weight: 600;'>{c.get('node_id', 'N/A')}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{c.get('planned', 0):,.0f}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{c.get('actual', 0):,.0f}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{c.get('trips_completed', 0)}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right; color: {rate_color}; font-weight: 600;'>{rate}%</td>
            </tr>"""
        consumers_table += "</tbody></table>"

    routes_table = ""
    if routes:
        routes_table = """
        <h3 style="color: #0f172a; margin: 24px 0 12px 0; font-size: 14px;">Route Breakdown</h3>
        <table style='border-collapse: collapse; width: 100%; font-size: 12px; margin-bottom: 20px;'>
        <thead><tr style='background: linear-gradient(135deg, #f59e0b, #d97706); color: white;'>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>Route</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Planned</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Completed</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Quantity (MT)</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Travel Time</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Avg Cycle</th>
            <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Fulfillment</th>
        </tr></thead><tbody>"""

        for i, r in enumerate(routes):
            bg_color = '#f8fafc' if i % 2 == 0 else '#ffffff'
            rate = r.get('fulfillment', 0)
            rate_color = '#22c55e' if rate >= 80 else '#f59e0b' if rate >= 50 else '#ef4444'
            route_name = f"{r.get('producer_id', 'N/A')} → {r.get('consumer_id', 'N/A')}"
            routes_table += f"""<tr style='background: {bg_color};'>
                <td style='border: 1px solid #ddd; padding: 8px; font-weight: 600;'>{route_name}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{r.get('planned_trips', 0)}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{r.get('completed_trips', 0)}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{r.get('quantity', 0):,.0f}</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{r.get('travel_time', 0)} min</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{r.get('avg_cycle_time', 0):.1f} min</td>
                <td style='border: 1px solid #ddd; padding: 8px; text-align: right; color: {rate_color}; font-weight: 600;'>{rate}%</td>
            </tr>"""
        routes_table += "</tbody></table>"

    trips_table = ""
    if trip_details:
        status_labels = {0: "Pending", 1: "Assigned", 2: "P. Entered", 3: "Loading", 4: "Loaded", 5: "P. Exited", 6: "C. Entered", 7: "Unloading", 8: "Unloaded", 9: "Completed"}
        trips_table = f"""
        <h3 style="color: #0f172a; margin: 24px 0 12px 0; font-size: 14px;">Trip Details ({len(trip_details)} trips)</h3>
        <table style='border-collapse: collapse; width: 100%; font-size: 11px; margin-bottom: 20px;'>
        <thead><tr style='background: linear-gradient(135deg, #64748b, #475569); color: white;'>
            <th style='border: 1px solid #ddd; padding: 8px; text-align: left;'>Trip ID</th>
            <th style='border: 1px solid #ddd; padding: 8px; text-align: left;'>Route</th>
            <th style='border: 1px solid #ddd; padding: 8px; text-align: left;'>Torpedo</th>
            <th style='border: 1px solid #ddd; padding: 8px; text-align: left;'>Status</th>
            <th style='border: 1px solid #ddd; padding: 8px; text-align: right;'>Cycle Time</th>
            <th style='border: 1px solid #ddd; padding: 8px; text-align: right;'>Expected</th>
            <th style='border: 1px solid #ddd; padding: 8px; text-align: right;'>Deviation</th>
        </tr></thead><tbody>"""

        for i, t in enumerate(trip_details):
            bg_color = '#f8fafc' if i % 2 == 0 else '#ffffff'
            route = f"{t.get('producer_id', 'N/A')} → {t.get('consumer_id', 'N/A')}"
            status = status_labels.get(t.get('status', 0), 'Unknown')
            cycle = f"{t.get('cycle_time', 0):.1f}" if t.get('cycle_time') else '-'
            expected = f"{t.get('expected_duration', 0):.1f}" if t.get('expected_duration') else '-'
            deviation = t.get('deviation')
            if deviation is not None:
                dev_color = '#22c55e' if deviation <= 0 else '#f59e0b' if deviation <= 10 else '#ef4444'
                dev_str = f"<span style='color: {dev_color}; font-weight: 600;'>{'+' if deviation > 0 else ''}{deviation:.1f}</span>"
            else:
                dev_str = '-'

            trips_table += f"""<tr style='background: {bg_color};'>
                <td style='border: 1px solid #ddd; padding: 6px; font-size: 10px;'>{t.get('trip_id', 'N/A')}</td>
                <td style='border: 1px solid #ddd; padding: 6px;'>{route}</td>
                <td style='border: 1px solid #ddd; padding: 6px;'>{t.get('torpedo_id', 'N/A') or '-'}</td>
                <td style='border: 1px solid #ddd; padding: 6px;'>{status}</td>
                <td style='border: 1px solid #ddd; padding: 6px; text-align: right;'>{cycle}</td>
                <td style='border: 1px solid #ddd; padding: 6px; text-align: right;'>{expected}</td>
                <td style='border: 1px solid #ddd; padding: 6px; text-align: right;'>{dev_str}</td>
            </tr>"""
        trips_table += "</tbody></table>"

    email_content = f"""
        <h2 style="color: #0f172a; margin-bottom: 20px;">Operational Plan Report</h2>
        <div style="margin-bottom: 20px; color: #64748b; font-size: 13px;">
            <p><strong>Plan:</strong> {plan.get('plan_name', 'N/A')}</p>
            <p><strong>Date:</strong> {plan.get('date', 'N/A')}</p>
            <p><strong>Status:</strong> {plan.get('status', 'N/A')}</p>
            <p><strong>Requested by:</strong> {current_user.username}</p>
            <p><strong>Generated:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
        </div>

        <h3 style="color: #0f172a; margin-bottom: 12px; font-size: 14px;">Summary Metrics</h3>
        <div style="display: flex; gap: 12px; margin-bottom: 24px; flex-wrap: wrap;">
            <div style="flex: 1; min-width: 100px; background: linear-gradient(135deg, #dbeafe, #eff6ff); padding: 16px; border-radius: 12px; text-align: center;">
                <div style="font-size: 24px; font-weight: 700; color: #1e40af;">{summary.get('total_production_mt', 0):,.0f}</div>
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase;">MT Production</div>
            </div>
            <div style="flex: 1; min-width: 100px; background: linear-gradient(135deg, #dcfce7, #f0fdf4); padding: 16px; border-radius: 12px; text-align: center;">
                <div style="font-size: 24px; font-weight: 700; color: #166534;">{summary.get('total_consumption_mt', 0):,.0f}</div>
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase;">MT Consumption</div>
            </div>
            <div style="flex: 1; min-width: 100px; background: linear-gradient(135deg, #fef3c7, #fffbeb); padding: 16px; border-radius: 12px; text-align: center;">
                <div style="font-size: 24px; font-weight: 700; color: #92400e;">{summary.get('planned_trips', summary.get('total_trips', 0))}</div>
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase;">Planned Trips</div>
            </div>
            <div style="flex: 1; min-width: 100px; background: linear-gradient(135deg, #e0e7ff, #eef2ff); padding: 16px; border-radius: 12px; text-align: center;">
                <div style="font-size: 24px; font-weight: 700; color: #4338ca;">{summary.get('fulfillment_rate', 0)}%</div>
                <div style="font-size: 10px; color: #64748b; text-transform: uppercase;">Fulfillment</div>
            </div>
        </div>

        <div style="display: flex; gap: 8px; margin-bottom: 20px; flex-wrap: wrap;">
            <div style="background: #22c55e; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px;"><strong>{summary.get('completed_trips', 0)}</strong> Completed</div>
            <div style="background: #f59e0b; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px;"><strong>{summary.get('avg_cycle_time', 0):.1f} min</strong> Avg Cycle</div>
            <div style="background: #3b82f6; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px;"><strong>{summary.get('fleet_utilization', 0):.1f}%</strong> Fleet Util.</div>
            <div style="background: #8b5cf6; color: white; padding: 8px 12px; border-radius: 8px; font-size: 12px;"><strong>{summary.get('torpedoes_used', 0)}</strong> Torpedoes</div>
        </div>

        {producers_table}
        {consumers_table}
        {routes_table}
        {trips_table}
    """

    html = f"""
    <!DOCTYPE html>
    <html>
    <head>
        <style>
            body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }}
            .container {{ max-width: 900px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
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
                <p><a href="{FRONTEND_URL}/planning/monthly" style="color: #3b82f6;">View Strategic Planning</a></p>
                <p class="footer-copyright">&copy; {datetime.now().year} Deevia Software India Pvt Ltd. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        email_sent = email_service._send_email(
            to_email=data.email,
            subject=f"HMD System - Plan Report: {plan.get('plan_name', 'Unknown')}",
            html_content=html,
            text_content=f"Plan Report for {plan.get('plan_name', 'Unknown')} generated on {datetime.now().strftime('%Y-%m-%d %H:%M')}"
        )

        if not email_sent:
            raise HTTPException(status_code=500, detail="Failed to send email. Please check SMTP configuration.")

        log_activity(
            db, current_user.username, "PLAN_REPORT_EMAILED",
            details=f"Plan report {plan.get('plan_name', 'Unknown')} emailed to {data.email}",
            current_user=current_user
        )

        logger.info(f"Plan report emailed by {current_user.username} to {data.email}")
        return {"status": "success", "message": f"Plan report sent to {data.email}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending plan email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")

async def get_plan_by_id_internal(plan_id: str, db: Session):
    from sqlalchemy import func as sql_func
    from datetime import timedelta

    try:
        parts = plan_id.split('_')
        if len(parts) != 3 or parts[0] != 'plan':
            logger.error(f"Invalid plan_id format: {plan_id}")
            return None

        date_str = parts[1]            
        time_str = parts[2]          

        plan_date = date(int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]))
        plan_time = datetime(
            int(date_str[:4]), int(date_str[4:6]), int(date_str[6:8]),
            int(time_str[:2]), int(time_str[2:4]), int(time_str[4:6])
        )
    except (ValueError, IndexError) as e:
        logger.error(f"Error parsing plan_id '{plan_id}': {e}")
        return None

    window_start = plan_time - timedelta(minutes=2.5)
    window_end = plan_time + timedelta(minutes=2.5)

    assignments = db.query(DistributionAssignment).filter(
        DistributionAssignment.date == plan_date,
        DistributionAssignment.created_at >= window_start,
        DistributionAssignment.created_at <= window_end
    ).all()

    if not assignments:
        logger.warning(f"No assignments found for plan_id: {plan_id}")
        return None

    assignment_ids = [a.id for a in assignments]

    assigned_trips = db.query(Trip).filter(
        Trip.assignment_id.in_(assignment_ids)
    ).all()

    manual_trips = db.query(Trip).filter(
        Trip.assignment_id == None,
        sql_func.date(Trip.created_at) == plan_date
    ).all()

    trips = assigned_trips + manual_trips

    daily_plans = db.query(DailyPlan).filter(
        DailyPlan.date == plan_date
    ).all()

    active_torpedoes = db.query(FleetManagement).filter(
        FleetManagement.type == 'torpedo',
        FleetManagement.status.in_(["Operating", "Assigned"])
    ).all()
    avg_capacity = sum((f.capacity or 0) for f in active_torpedoes) / len(active_torpedoes) if active_torpedoes else 150.0

    total_production = sum(p.capacity for p in daily_plans if p.role == 'producer')
    total_consumption = sum(p.capacity for p in daily_plans if p.role == 'consumer')
    total_planned_trips = sum(a.trips for a in assignments)
    completed_trips_list = [t for t in trips if t.status == 13]
    completed = len(completed_trips_list)

    cycle_times = [t.cycle_time_minutes for t in completed_trips_list if t.cycle_time_minutes]
    avg_cycle = sum(cycle_times) / len(cycle_times) if cycle_times else 0

    fulfillment_rate = (completed / total_planned_trips * 100) if total_planned_trips > 0 else 0

    torpedoes_used = len(set(t.torpedo_id for t in trips if t.torpedo_id))
    total_torpedoes = db.query(FleetManagement).filter(
        FleetManagement.type == 'torpedo'
    ).count()
    fleet_utilization = (torpedoes_used / total_torpedoes * 100) if total_torpedoes > 0 else 0

    plan_name = f"Plan_{plan_date.strftime('%d_%m_%Y')}_{plan_time.strftime('%H:%M:%S')}"

    plan_status = "Active" if plan_date == date.today() else "Completed"

    producers_data = []
    for p in daily_plans:
        if p.role == 'producer':
            producer_completed = len([t for t in completed_trips_list if t.producer_id == p.user_id])
            actual_delivered = producer_completed * avg_capacity
            producers_data.append({
                "node_id": p.user_id,
                "planned": p.capacity,
                "actual": actual_delivered,
                "trips_completed": producer_completed,
                "fulfillment": round((actual_delivered / p.capacity * 100) if p.capacity > 0 else 0, 1)
            })

    consumers_data = []
    for c in daily_plans:
        if c.role == 'consumer':
            consumer_completed = len([t for t in completed_trips_list if t.consumer_id == c.user_id])
            actual_received = consumer_completed * avg_capacity
            consumers_data.append({
                "node_id": c.user_id,
                "planned": c.capacity,
                "actual": actual_received,
                "trips_completed": consumer_completed,
                "fulfillment": round((actual_received / c.capacity * 100) if c.capacity > 0 else 0, 1)
            })

    routes_data = []
    for a in assignments:
        route_trips = [t for t in trips if t.assignment_id == a.id]
        route_completed = len([t for t in route_trips if t.status == 13])
        route_cycle_times = [t.cycle_time_minutes for t in route_trips if t.status == 13 and t.cycle_time_minutes]
        route_avg_cycle = sum(route_cycle_times) / len(route_cycle_times) if route_cycle_times else 0

        routes_data.append({
            "producer_id": a.producer_id,
            "consumer_id": a.consumer_id,
            "planned_trips": a.trips,
            "completed_trips": route_completed,
            "quantity": a.quantity,
            "travel_time": a.travel_time,
            "avg_cycle_time": round(route_avg_cycle, 1),
            "fulfillment": round((route_completed / a.trips * 100) if a.trips > 0 else 0, 1)
        })

    trip_details = []
    for t in trips:
        trip_details.append({
            "trip_id": t.trip_id,
            "producer_id": t.producer_id,
            "consumer_id": t.consumer_id,
            "torpedo_id": t.torpedo_id,
            "status": t.status,
            "cycle_time": t.cycle_time_minutes,
            "expected_duration": t.expected_duration_minutes,
            "deviation": round(t.cycle_time_minutes - t.expected_duration_minutes, 1) if t.cycle_time_minutes and t.expected_duration_minutes else None
        })

    return {
        "plan_id": plan_id,
        "plan_name": plan_name,
        "date": plan_date.isoformat(),
        "status": plan_status,
        "created_at": plan_time.isoformat(),
        "summary": {
            "total_production_mt": total_production,
            "total_consumption_mt": total_consumption,
            "planned_trips": total_planned_trips,
            "total_trips": total_planned_trips + len(manual_trips),
            "completed_trips": completed,
            "fulfillment_rate": round(fulfillment_rate, 1),
            "avg_cycle_time": round(avg_cycle, 1),
            "fleet_utilization": round(fleet_utilization, 1),
            "torpedoes_used": torpedoes_used,
            "avg_capacity": round(avg_capacity, 1)
        },
        "producers": producers_data,
        "consumers": consumers_data,
        "routes": routes_data,
        "trips": trip_details
    }
