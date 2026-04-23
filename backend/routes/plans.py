from fastapi import APIRouter, Depends, HTTPException
from datetime import date, datetime, timedelta
from typing import Optional
from sqlalchemy.orm import Session
from sqlalchemy import func
from sqlalchemy.exc import SQLAlchemyError
from pydantic import BaseModel, EmailStr
from ..database.engine import get_db
from ..database.models import DailyPlan, LocationCoordinate, TripTimeConfig, FleetManagement, DistributionAssignment, Trip, MaintenanceSchedule, RoutingConstraint, SystemConfig, User, Notification
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.security import get_current_user_required, require_roles
from ..constants import TripStatus as TripStatusConst
from ..utils.redis_cache import cache
from ..utils.analytics_helpers import get_config
from ..schemas import (
    DistributionPlanCommit,
    MonthlyPlanBulk,
    BreakdownRePlan
)

import sys
import os
import shutil
import pulp

def _get_cbc_solver():
    if getattr(sys, 'frozen', False):
                                                          
        cbc_path = shutil.which("cbc")
        if not cbc_path:
                                                               
            base_dir = os.path.dirname(sys.executable)
            candidates = [
                os.path.join(base_dir, "cbc.exe"),
                os.path.join(base_dir, "solverdir", "cbc", "win", "i64", "cbc.exe"),
            ]
                                                    
            meipass = getattr(sys, '_MEIPASS', None)
            if meipass:
                candidates.append(os.path.join(meipass, "pulp", "solverdir", "cbc", "win", "i64", "cbc.exe"))
            for candidate in candidates:
                if os.path.isfile(candidate):
                    cbc_path = candidate
                    break
        if cbc_path:
            logger.info(f"Using CBC solver at: {cbc_path}")
            return pulp.COIN_CMD(path=cbc_path, msg=0)
        else:
            logger.warning("CBC solver not found, falling back to default")
    return pulp.PULP_CBC_CMD(msg=0)

CACHE_KEY_DASHBOARD = "plans:dashboard"
CACHE_TTL_DASHBOARD = 30                                 

router = APIRouter(prefix="/api/daily-plans", tags=["plans"])

def calculate_deviation_status(deviation_minutes: float, warning_threshold: int = 10, alert_threshold: int = 20, critical_threshold: int = 30) -> str:
    if deviation_minutes is None:
        return "on_track"
    if deviation_minutes < 0:
        return "early"
    if deviation_minutes <= warning_threshold:
        return "on_track"
    if deviation_minutes <= alert_threshold:
        return "warning"
    if deviation_minutes <= critical_threshold:
        return "alert"
    return "critical"

def calculate_phase_deviation(actual_time, expected_time) -> dict:
    if not actual_time or not expected_time:
        return None

    deviation_minutes = (actual_time - expected_time).total_seconds() / 60
    return {
        "deviation_minutes": round(deviation_minutes, 1),
        "status": calculate_deviation_status(deviation_minutes)
    }

TRIP_STATUS_LABELS = {
    0: "Pending", 1: "Assigned", 2: "Producer Entered",
    3: "Loading Started", 4: "Loading Ended", 5: "Producer Exited",
    6: "Consumer Entered", 7: "Unloading Started", 8: "Unloading Ended",
    9: "Completed"
}

def normalize_id(uid):
    return uid.upper().replace("-", "").replace(" ", "") if uid else ""

@router.post("/generate")
async def generate_optimized_plan(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
    try:
        today = date.today()
        
        active_torpedoes = db.query(FleetManagement).filter(
            FleetManagement.type == 'torpedo',
            FleetManagement.status.in_(["Operating", "Assigned"])
        ).all()
        
        if not active_torpedoes:
            avg_capacity = float(get_config(db, "NOMINAL_CAPACITY", "150.0"))
            logger.warning(f"Optimization Engine: No active torpedoes found. Using NOMINAL_CAPACITY fallback = {avg_capacity} MT")
        else:
            avg_capacity = sum((f.capacity or 0) for f in active_torpedoes) / len(active_torpedoes)
            logger.info(f"Optimization Engine: Avg Capacity = {avg_capacity} MT (from {len(active_torpedoes)} active torpedoes)")

        operating_nodes = db.query(LocationCoordinate).filter(
            LocationCoordinate.status == "Operating"
        ).all()
        
        maintenance_nodes = db.query(MaintenanceSchedule.node_id).filter(
            MaintenanceSchedule.start_date <= today,
            MaintenanceSchedule.end_date >= today
        ).all()
        maintenance_ids = [m[0] for m in maintenance_nodes]
        
        active_operating_nodes = [n for n in operating_nodes if n.user_id not in maintenance_ids]
        
        operating_uids_norm = [normalize_id(n.user_id) for n in active_operating_nodes if n.user_id]
        logger.info(f"Engine Debug: Found {len(active_operating_nodes)} active operating locations")
        logger.info(f"Engine Debug: Normalized Operating IDs: {operating_uids_norm}")

        all_plans_today = db.query(DailyPlan).filter(DailyPlan.date == today).all()
        logger.info(f"Engine Debug: All DailyPlans for {today}: {len(all_plans_today)} records")
        for dp in all_plans_today[:5]:                              
            logger.info(f"  - DailyPlan: user_id={dp.user_id}, role={dp.role}, status={dp.status}, capacity={dp.capacity}")

        monthly_primary = db.query(DailyPlan).filter(DailyPlan.date == today, DailyPlan.status == "Primary").all()
        daily_revisions = db.query(DailyPlan).filter(DailyPlan.date == today, DailyPlan.status != "Primary").all()
        
        plan_map = {p.user_id: p for p in monthly_primary}
        for dr in daily_revisions:
            plan_map[dr.user_id] = dr                          
            
        plans = list(plan_map.values())

        plan_producer_ids = [normalize_id(p.user_id) for p in plans if p.role == 'producer']
        plan_consumer_ids = [normalize_id(p.user_id) for p in plans if p.role == 'consumer']
        logger.info(f"Engine Debug: DailyPlan Producer IDs: {plan_producer_ids}")
        logger.info(f"Engine Debug: DailyPlan Consumer IDs: {plan_consumer_ids}")

        producers = [p for p in plans if p.role == 'producer' and normalize_id(p.user_id) in operating_uids_norm]
        consumers = [p for p in plans if p.role == 'consumer' and normalize_id(p.user_id) in operating_uids_norm]

        if not producers or not consumers:
            logger.error(f"Incomplete data: Producers count={len(producers)}, Consumers count={len(consumers)}")
            logger.error(f"Operating Location IDs: {operating_uids_norm}")
            logger.error(f"DailyPlan Producer IDs: {plan_producer_ids}")
            logger.error(f"DailyPlan Consumer IDs: {plan_consumer_ids}")

            missing_info = []
            if not plan_producer_ids and not plan_consumer_ids:
                missing_info.append("No DailyPlans found for today")
            else:
                if not producers:
                    missing_info.append(f"No matching producers (Plans: {plan_producer_ids}, Operating: {[uid for uid in operating_uids_norm if any(p.type == 'producer' for p in active_operating_nodes if normalize_id(p.user_id) == uid)]})")
                if not consumers:
                    missing_info.append(f"No matching consumers (Plans: {plan_consumer_ids}, Operating: {[uid for uid in operating_uids_norm if any(c.type == 'consumer' for c in active_operating_nodes if normalize_id(c.user_id) == uid)]})")

            raise HTTPException(status_code=400, detail=f"Insufficient active producers or consumers. {'; '.join(missing_info)}. Check if Monthly Plans exist and nodes have Operating status.")

        producer_ids = [p.user_id for p in producers]
        consumer_ids = [c.user_id for c in consumers]
        
        supply_tons = {p.user_id: p.capacity for p in producers}
        demand_tons = {c.user_id: c.capacity for c in consumers}

        total_supply = sum(supply_tons.values())
        total_demand = sum(demand_tons.values())
        
        logger.debug(f"Engine Debug: Total Supply: {total_supply} MT, Total Demand: {total_demand} MT")
        
        if total_supply < total_demand:
            logger.error(f"Imbalance detected: Supply ({total_supply}) < Demand ({total_demand})")
            raise HTTPException(status_code=400, detail=f"Insufficient supply ({total_supply} MT) to meet total demand ({total_demand} MT).")

        trip_configs = db.query(TripTimeConfig).all()
        times = {}
        for c in trip_configs:
            if c.source_user_id not in times:
                times[c.source_user_id] = {}
            times[c.source_user_id][c.destination_user_id] = c.travel_time

        db_constraints = db.query(RoutingConstraint).all()
                                                                       
        allowed_pairs = set()
        for dc in db_constraints:
            allowed_pairs.add((normalize_id(dc.producer_id), normalize_id(dc.consumer_id)))

        prob = pulp.LpProblem("Logistics_Optimization", pulp.LpMinimize)
        
        default_travel_time = int(get_config(db, "DEFAULT_TRAVEL_TIME", "30"))
        
        trips = {}
        for p_id in producer_ids:
            for c_id in consumer_ids:
                norm_p = normalize_id(p_id)
                norm_c = normalize_id(c_id)
                
                if (norm_p, norm_c) in allowed_pairs:
                    trips[(p_id, c_id)] = pulp.LpVariable(f"trips_{norm_p}_{norm_c}", lowBound=0, cat='Integer')
                else:
                    trips[(p_id, c_id)] = 0

        prob += pulp.lpSum(
            trips[(p_id, c_id)] * times.get(p_id, {}).get(c_id, default_travel_time) 
            for p_id in producer_ids
            for c_id in consumer_ids
            if isinstance(trips[(p_id, c_id)], pulp.LpVariable)
        )

        for p_id in producer_ids:
            prob += pulp.lpSum(trips[(p_id, c_id)] * avg_capacity for c_id in consumer_ids if isinstance(trips[(p_id, c_id)], pulp.LpVariable)) <= supply_tons[p_id]

        for c_id in consumer_ids:
            prob += pulp.lpSum(trips[(p_id, c_id)] * avg_capacity for p_id in producer_ids if isinstance(trips[(p_id, c_id)], pulp.LpVariable)) >= demand_tons[c_id]

        prob.solve(_get_cbc_solver())
        
        if pulp.LpStatus[prob.status] != 'Optimal':
            logger.error(f"Solver Status: {pulp.LpStatus[prob.status]}")
            raise HTTPException(status_code=400, detail="Could not find an optimal distribution plan within constraints.")

        results = []
        for p_id in producer_ids:
            for c_id in consumer_ids:
                if trips.get((p_id, c_id)) and trips[(p_id, c_id)].varValue > 0:
                    trip_count = int(trips[(p_id, c_id)].varValue)
                    results.append({
                        "producer_id": p_id,
                        "consumer_id": c_id,
                        "trips": trip_count,
                        "quantity": trip_count * avg_capacity,
                        "travel_time": times.get(p_id, {}).get(c_id, default_travel_time)
                    })
        
        return {
            "status": "success",
            "assignments": results,
            "summary": {
                "total_trips": sum(r["trips"] for r in results),
                "total_tonnage": sum(r["quantity"] for r in results),
                "avg_capacity_used": avg_capacity
            }
        }

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error generating plan: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate distribution plan. Please check your input data and try again.")
    except (ValueError, TypeError) as e:
        logger.error(f"Data validation error generating plan: {e}")
        raise HTTPException(status_code=400, detail="Invalid data provided for plan generation.")

@router.post("/commit")
async def commit_distribution_plan(
    data: DistributionPlanCommit,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
    today = date.today()

    if not data.assignments:
        raise HTTPException(status_code=400, detail="No assignments provided to commit.")

    try:
                                                  
        db.query(DistributionAssignment).filter(DistributionAssignment.date == today).delete()

        for item in data.assignments:
            assignment = DistributionAssignment(
                date=today,
                producer_id=item.producer_id,
                consumer_id=item.consumer_id,
                quantity=item.quantity,
                trips=item.trips,
                travel_time=item.travel_time,
                status='Committed'
            )
            db.add(assignment)

        db.commit()
        cache.delete(CACHE_KEY_DASHBOARD)
        logger.success(f"Logistics Plan for {today} committed successfully by {admin_user.username}.")
        log_activity(
            db, admin_user.username, "DISTRIBUTION_PLAN_COMMITTED",
            details=f"Committed distribution plan for {today} with {len(data.assignments)} assignments",
            current_user=admin_user,
            entity_type="plan",
            entity_id=str(today),
            new_value={"date": str(today), "assignment_count": len(data.assignments)}
        )
        return {"status": "success", "message": f"Plan for {today} saved."}
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error committing plan: {e}")
        raise HTTPException(status_code=500, detail="Failed to commit distribution plan. Please try again.")

@router.post("/reset-today")
async def reset_todays_plan(
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
    today = date.today()
    
    active_trips_count = db.query(Trip).join(
        DistributionAssignment, Trip.assignment_id == DistributionAssignment.id
    ).filter(
        DistributionAssignment.date == today,
        Trip.status >= TripStatusConst.WB_TARE_ENTRY
    ).count()

    if active_trips_count > 0:
        logger.warning(f"Reset Blocked: {active_trips_count} trips are already in progress.")
        raise HTTPException(
            status_code=400,
            detail=f"Operation in progress. {active_trips_count} trips are already in progress (at weighbridge or beyond). Full reset is not possible."
        )

    assigned_trips = db.query(Trip).join(
        DistributionAssignment, Trip.assignment_id == DistributionAssignment.id
    ).filter(
        DistributionAssignment.date == today,
        Trip.status == TripStatusConst.ASSIGNED
    ).all()
    
    released_count = 0
    for trip in assigned_trips:
        if trip.torpedo_id:
            torpedo = db.query(FleetManagement).filter(FleetManagement.fleet_id == trip.torpedo_id).first()
            if torpedo:
                torpedo.status = "Operating"
                released_count += 1

    assignment_ids = [a.id for a in db.query(DistributionAssignment).filter(DistributionAssignment.date == today).all()]
    
    trips_deleted = 0
    if assignment_ids:
        trips_deleted = db.query(Trip).filter(Trip.assignment_id.in_(assignment_ids)).delete(synchronize_session=False)

    assignments_deleted = db.query(DistributionAssignment).filter(DistributionAssignment.date == today).delete()

    notifications_deleted = db.query(Notification).delete(synchronize_session=False)

    try:
        db.commit()
                                    
        cache.delete(CACHE_KEY_DASHBOARD)
                                            
        cache.delete_pattern("notifications:*")

        logger.info(f"Master Reset by {admin_user.username}: {assignments_deleted} assignments, {trips_deleted} trips, {notifications_deleted} notifications wiped. {released_count} assets released.")
        log_activity(
            db, admin_user.username, "ADMIN_PLAN_RESET",
            details=f"Full Wipe: {assignments_deleted} assignments, {trips_deleted} trips, {notifications_deleted} notifications deleted. {released_count} torpedoes released.",
            current_user=admin_user,
            entity_type="plan",
            entity_id="daily_reset",
            old_value={"assignments_deleted": assignments_deleted, "trips_deleted": trips_deleted, "torpedoes_released": released_count, "notifications_deleted": notifications_deleted}
        )

        return {
            "status": "success",
            "message": "Logistics plan reset successfully.",
            "data": {
                "assignments_deleted": assignments_deleted,
                "trips_deleted": trips_deleted,
                "assets_released": released_count,
                "notifications_deleted": notifications_deleted
            }
        }
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error during system reset: {e}")
        raise HTTPException(status_code=500, detail="Failed to perform system reset.")

@router.get("/history-detailed")
async def get_detailed_plan_history(
    start_date: str = None,
    end_date: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    try:
                                                           
        if not end_date:
            end_date = date.today().isoformat()
        if not start_date:
            start_dt = date.today() - timedelta(days=30)
            start_date = start_dt.isoformat()

        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)

        assignments = db.query(DistributionAssignment).filter(
            DistributionAssignment.date >= start,
            DistributionAssignment.date <= end
        ).order_by(DistributionAssignment.created_at.desc()).all()

        if not assignments:
            return {"plans": []}

        def group_by_timestamp_window(assignments, window_minutes=5):
            if not assignments:
                return []

            groups = []
            current_group = [assignments[0]]

            for i in range(1, len(assignments)):
                curr = assignments[i]
                prev = assignments[i-1]

                time_diff = abs((prev.created_at - curr.created_at).total_seconds()) / 60

                if curr.date == prev.date and time_diff <= window_minutes:
                    current_group.append(curr)
                else:
                    groups.append(current_group)
                    current_group = [curr]

            groups.append(current_group)
            return groups

        plan_groups = group_by_timestamp_window(assignments)

        active_torpedoes = db.query(FleetManagement).filter(
            FleetManagement.type == 'torpedo',
            FleetManagement.status.in_(["Operating", "Assigned"])
        ).all()

        if active_torpedoes:
            avg_capacity = sum((f.capacity or 0) for f in active_torpedoes) / len(active_torpedoes)
        else:
            avg_capacity = float(get_config(db, "NOMINAL_CAPACITY", "150.0"))

        total_torpedoes = db.query(FleetManagement).filter(
            FleetManagement.type == 'torpedo'
        ).count()

        result_plans = []

        for idx, group in enumerate(plan_groups):
            if not group:
                continue

            plan_date = group[0].date
            plan_created_at = group[0].created_at

            plan_id = f"plan_{plan_date.strftime('%Y%m%d')}_{plan_created_at.strftime('%H%M%S')}"
            plan_name = f"Plan_{plan_date.strftime('%d_%m_%Y')}_{plan_created_at.strftime('%H:%M:%S')}"

            is_latest_for_date = idx == 0 or plan_groups[idx-1][0].date != plan_date
            plan_status = "Active" if is_latest_for_date and plan_date == date.today() else ("Active" if is_latest_for_date else "Superseded")

            assignment_ids = [a.id for a in group]

            assigned_trips = db.query(Trip).filter(
                Trip.assignment_id.in_(assignment_ids)
            ).all()
            
            manual_trips = db.query(Trip).filter(
                Trip.assignment_id == None,
                func.date(Trip.created_at) == plan_date
            ).all()
            
            trips_for_plan = assigned_trips + manual_trips

            daily_plans = db.query(DailyPlan).filter(
                DailyPlan.date == plan_date
            ).all()

            locations = db.query(LocationCoordinate).all()
            location_status = {loc.user_id: loc.status for loc in locations}

            total_production_planned = sum(p.capacity for p in daily_plans if p.role == 'producer')
            total_consumption_planned = sum(p.capacity for p in daily_plans if p.role == 'consumer')
            total_trips_planned = sum(a.trips for a in group)
            
            completed_planned = [t for t in assigned_trips if t.status == 13]
            completed_manual = [t for t in manual_trips if t.status == 13]
            total_completed_planned = len(completed_planned)
            total_completed_manual = len(completed_manual)
            total_completed = total_completed_planned + total_completed_manual
            
            completed_trips = completed_planned + completed_manual

            actual_production = total_completed * avg_capacity
            actual_consumption = total_completed * avg_capacity

            fulfillment_rate = (actual_consumption / total_consumption_planned * 100) if total_consumption_planned > 0 else 0

            cycle_times = [t.cycle_time_minutes for t in completed_trips if t.cycle_time_minutes]
            avg_cycle_time = sum(cycle_times) / len(cycle_times) if cycle_times else 0

            expected_durations = [t.expected_duration_minutes for t in completed_trips if t.expected_duration_minutes]
            avg_expected_cycle_time = sum(expected_durations) / len(expected_durations) if expected_durations else 0

            deviations_list = []
            on_time_count = 0
            delayed_count = 0
            early_count = 0
            for t in completed_trips:
                if t.cycle_time_minutes and t.expected_duration_minutes:
                    deviation = t.cycle_time_minutes - t.expected_duration_minutes
                    deviations_list.append(deviation)
                    if deviation <= 0:
                        early_count += 1
                    elif deviation <= 10:                            
                        on_time_count += 1
                    else:
                        delayed_count += 1

            avg_deviation = sum(deviations_list) / len(deviations_list) if deviations_list else 0
            on_time_rate = ((on_time_count + early_count) / len(completed_trips) * 100) if completed_trips else 0

            torpedoes_used = len(set(t.torpedo_id for t in trips_for_plan if t.torpedo_id))
            fleet_utilization = (torpedoes_used / total_torpedoes * 100) if total_torpedoes > 0 else 0
            avg_trips_per_torpedo = len(trips_for_plan) / torpedoes_used if torpedoes_used > 0 else 0

            producers_data = []
            for p in daily_plans:
                if p.role == 'producer':
                                                                  
                    producer_completed = len([t for t in completed_trips if t.producer_id == p.user_id])
                    producers_data.append({
                        "user_id": p.user_id,
                        "planned": p.capacity,
                        "actual": producer_completed * avg_capacity,
                        "status": location_status.get(p.user_id, "Operating")
                    })

            consumers_data = []
            for p in daily_plans:
                if p.role == 'consumer':
                                                                 
                    consumer_completed = len([t for t in completed_trips if t.consumer_id == p.user_id])
                    consumers_data.append({
                        "user_id": p.user_id,
                        "planned": p.capacity,
                        "actual": consumer_completed * avg_capacity,
                        "status": location_status.get(p.user_id, "Operating")
                    })

            routes_map = {}
            for a in group:
                route_key = f"{a.producer_id} → {a.consumer_id}"
                if route_key not in routes_map:
                    routes_map[route_key] = {
                        "route_key": route_key,
                        "producer_id": a.producer_id,
                        "consumer_id": a.consumer_id,
                        "planned_trips": 0,
                        "completed_trips": 0,
                        "trips": []
                    }
                routes_map[route_key]["planned_trips"] += a.trips

            for trip in trips_for_plan:
                route_key = f"{trip.producer_id} → {trip.consumer_id}"
                if route_key in routes_map:
                    if trip.status == 13:
                        routes_map[route_key]["completed_trips"] += 1

                    timeline = {
                        "created_at": trip.created_at.isoformat() if trip.created_at else None,
                        "assigned_at": trip.assigned_at.isoformat() if trip.assigned_at else None,
                        "wb_tare_entry_at": trip.wb_tare_entry_at.isoformat() if trip.wb_tare_entry_at else None,
                        "wb_tare_recorded_at": trip.wb_tare_recorded_at.isoformat() if trip.wb_tare_recorded_at else None,
                        "p_entered_at": trip.p_entered_at.isoformat() if trip.p_entered_at else None,
                        "p_loading_start_at": trip.p_loading_start_at.isoformat() if trip.p_loading_start_at else None,
                        "p_loading_end_at": trip.p_loading_end_at.isoformat() if trip.p_loading_end_at else None,
                        "p_exited_at": trip.p_exited_at.isoformat() if trip.p_exited_at else None,
                        "wb_gross_entry_at": trip.wb_gross_entry_at.isoformat() if trip.wb_gross_entry_at else None,
                        "wb_gross_recorded_at": trip.wb_gross_recorded_at.isoformat() if trip.wb_gross_recorded_at else None,
                        "c_entered_at": trip.c_entered_at.isoformat() if trip.c_entered_at else None,
                        "c_unloading_start_at": trip.c_unloading_start_at.isoformat() if trip.c_unloading_start_at else None,
                        "c_unloading_end_at": trip.c_unloading_end_at.isoformat() if trip.c_unloading_end_at else None,
                        "c_exited_at": trip.c_exited_at.isoformat() if trip.c_exited_at else None
                    }

                    expected_timeline = {
                        "wb_tare_entry_at": trip.expected_wb_tare_entry_at.isoformat() if trip.expected_wb_tare_entry_at else None,
                        "wb_tare_recorded_at": trip.expected_wb_tare_recorded_at.isoformat() if trip.expected_wb_tare_recorded_at else None,
                        "p_entered_at": trip.expected_p_entered_at.isoformat() if trip.expected_p_entered_at else None,
                        "p_loading_start_at": trip.expected_p_loading_start_at.isoformat() if trip.expected_p_loading_start_at else None,
                        "p_loading_end_at": trip.expected_p_loading_end_at.isoformat() if trip.expected_p_loading_end_at else None,
                        "p_exited_at": trip.expected_p_exited_at.isoformat() if trip.expected_p_exited_at else None,
                        "wb_gross_entry_at": trip.expected_wb_gross_entry_at.isoformat() if trip.expected_wb_gross_entry_at else None,
                        "wb_gross_recorded_at": trip.expected_wb_gross_recorded_at.isoformat() if trip.expected_wb_gross_recorded_at else None,
                        "c_entered_at": trip.expected_c_entered_at.isoformat() if trip.expected_c_entered_at else None,
                        "c_unloading_start_at": trip.expected_c_unloading_start_at.isoformat() if trip.expected_c_unloading_start_at else None,
                        "c_unloading_end_at": trip.expected_c_unloading_end_at.isoformat() if trip.expected_c_unloading_end_at else None,
                        "c_exited_at": trip.expected_c_exited_at.isoformat() if trip.expected_c_exited_at else None
                    }

                    deviations = {}

                    if trip.p_entered_at and trip.expected_p_entered_at:
                        deviations["p_entered"] = calculate_phase_deviation(trip.p_entered_at, trip.expected_p_entered_at)

                    if trip.p_loading_start_at and trip.expected_p_loading_start_at:
                        deviations["loading_start"] = calculate_phase_deviation(trip.p_loading_start_at, trip.expected_p_loading_start_at)

                    if trip.p_loading_end_at and trip.expected_p_loading_end_at:
                        deviations["loading_end"] = calculate_phase_deviation(trip.p_loading_end_at, trip.expected_p_loading_end_at)

                    if trip.p_exited_at and trip.expected_p_exited_at:
                        deviations["p_exited"] = calculate_phase_deviation(trip.p_exited_at, trip.expected_p_exited_at)

                    if trip.c_entered_at and trip.expected_c_entered_at:
                        deviations["c_entered"] = calculate_phase_deviation(trip.c_entered_at, trip.expected_c_entered_at)

                    if trip.c_unloading_start_at and trip.expected_c_unloading_start_at:
                        deviations["unloading_start"] = calculate_phase_deviation(trip.c_unloading_start_at, trip.expected_c_unloading_start_at)

                    if trip.c_unloading_end_at and trip.expected_c_unloading_end_at:
                        deviations["unloading_end"] = calculate_phase_deviation(trip.c_unloading_end_at, trip.expected_c_unloading_end_at)

                    if trip.c_exited_at and trip.expected_c_exited_at:
                        deviations["completed"] = calculate_phase_deviation(trip.c_exited_at, trip.expected_c_exited_at)

                    total_deviation = None
                    total_deviation_status = "on_track"
                    if trip.c_exited_at and trip.expected_c_exited_at:
                        total_deviation = round((trip.c_exited_at - trip.expected_c_exited_at).total_seconds() / 60, 1)
                        total_deviation_status = calculate_deviation_status(total_deviation)
                    elif trip.expected_duration_minutes and trip.cycle_time_minutes:
                        total_deviation = round(trip.cycle_time_minutes - trip.expected_duration_minutes, 1)
                        total_deviation_status = calculate_deviation_status(total_deviation)

                    loading_deviation = None
                    transit_deviation = None
                    unloading_deviation = None

                    if trip.assigned_at and trip.p_exited_at and trip.expected_p_exited_at:
                        loading_deviation = calculate_phase_deviation(trip.p_exited_at, trip.expected_p_exited_at)

                    if trip.c_entered_at and trip.expected_c_entered_at and trip.p_exited_at and trip.expected_p_exited_at:
                        actual_transit = (trip.c_entered_at - trip.p_exited_at).total_seconds() / 60
                        expected_transit = (trip.expected_c_entered_at - trip.expected_p_exited_at).total_seconds() / 60
                        transit_diff = actual_transit - expected_transit
                        transit_deviation = {
                            "deviation_minutes": round(transit_diff, 1),
                            "status": calculate_deviation_status(transit_diff)
                        }

                    if trip.c_entered_at and trip.c_exited_at and trip.expected_c_entered_at and trip.expected_c_exited_at:
                        actual_unloading = (trip.c_exited_at - trip.c_entered_at).total_seconds() / 60
                        expected_unloading = (trip.expected_c_exited_at - trip.expected_c_entered_at).total_seconds() / 60
                        unloading_diff = actual_unloading - expected_unloading
                        unloading_deviation = {
                            "deviation_minutes": round(unloading_diff, 1),
                            "status": calculate_deviation_status(unloading_diff)
                        }

                    status_labels = {
                        0: "Pending", 1: "Assigned", 2: "Producer Entered",
                        3: "Loading Started", 4: "Loading Ended", 5: "Producer Exited",
                        6: "Consumer Entered", 7: "Unloading Started", 8: "Unloading Ended",
                        9: "Completed"
                    }

                    routes_map[route_key]["trips"].append({
                        "trip_id": trip.trip_id,
                        "torpedo_id": trip.torpedo_id,
                        "status": trip.status,
                        "status_label": status_labels.get(trip.status, "Unknown"),
                        "cycle_time_minutes": trip.cycle_time_minutes,
                        "expected_duration_minutes": trip.expected_duration_minutes,
                        "shift": trip.shift,
                        "timeline": timeline,
                        "expected_timeline": expected_timeline,
                        "deviations": deviations,
                        "phase_deviations": {'loading': loading_deviation, 'transit': transit_deviation, 'unloading': unloading_deviation},
                        "total_deviation_minutes": total_deviation,
                        "deviation_status": total_deviation_status
                    })

            result_plans.append({
                "plan_id": plan_id,
                "plan_name": plan_name,
                "date": plan_date.isoformat(),
                "created_at": plan_created_at.isoformat(),
                "status": plan_status,
                "summary": {
                    "total_production_mt": total_production_planned,
                    "total_consumption_mt": total_consumption_planned,
                    "planned_trips": total_trips_planned,
                    "manual_trips": total_completed_manual,
                    "total_trips": total_trips_planned + len(manual_trips),
                    "completed_planned": total_completed_planned,
                    "completed_manual": total_completed_manual,
                    "completed_trips": total_completed,
                    "fulfillment_rate": round(fulfillment_rate, 1),
                    "avg_cycle_time_minutes": round(avg_cycle_time, 1),
                    "avg_expected_cycle_time_minutes": round(avg_expected_cycle_time, 1),
                    "avg_deviation_minutes": round(avg_deviation, 1),
                    "on_time_rate": round(on_time_rate, 1),
                    "on_time_count": on_time_count + early_count,
                    "delayed_count": delayed_count,
                    "early_count": early_count,
                    "torpedoes_used": torpedoes_used,
                    "fleet_utilization": round(fleet_utilization, 1),
                    "avg_trips_per_torpedo": round(avg_trips_per_torpedo, 1)
                },
                "producers": producers_data,
                "consumers": consumers_data,
                "routes": list(routes_map.values())
            })

        return {"plans": result_plans}

    except SQLAlchemyError as e:
        logger.error(f"Database error retrieving detailed plan history: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve detailed plan history. Please try again.")

@router.get("/month/{year}/{month}")
async def get_monthly_plans(
    year: int,
    month: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    try:
        start_date = date(year, month, 1)
        if month == 12:
            end_date = date(year + 1, 1, 1)
        else:
            end_date = date(year, month + 1, 1)
            
        plans = db.query(DailyPlan).filter(
            DailyPlan.date >= start_date,
            DailyPlan.date < end_date
        ).all()
        
        res = {}
        for p in plans:
            date_str = p.date.isoformat()
            if date_str not in res:
                res[date_str] = {}
            res[date_str][p.user_id] = p.capacity
            
        return res
    except SQLAlchemyError as e:
        logger.error(f"Database error fetching monthly plans: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve monthly plans. Please try again.")

@router.post("/monthly")
async def create_monthly_plan(
    data: MonthlyPlanBulk,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
    try:
        logger.info(f"Monthly Plan Upload: user_id={data.user_id}, role={data.role}, plan_count={len(data.plans)}")
        if data.plans:
            logger.info(f"  Date range: {data.plans[0].date} to {data.plans[-1].date}")

        for plan_entry in data.plans:
                          
            existing = db.query(DailyPlan).filter(
                DailyPlan.date == plan_entry.date,
                DailyPlan.user_id == data.user_id
            ).first()

            if existing:
                existing.capacity = plan_entry.capacity
                existing.status = "Primary"
            else:
                new_plan = DailyPlan(
                    date=plan_entry.date,
                    user_id=data.user_id,
                    role=data.role.value,
                    capacity=plan_entry.capacity,
                    status="Primary"
                )
                db.add(new_plan)

        db.commit()
                                    
        cache.delete(CACHE_KEY_DASHBOARD)

        log_activity(
            db, admin_user.username, "MONTHLY_PLAN_UPLOADED",
            details=f"Uploaded {len(data.plans)} days of plans for {data.user_id}",
            current_user=admin_user,
            entity_type="plan",
            entity_id=data.user_id,
            new_value={"user_id": data.user_id, "days_uploaded": len(data.plans)}
        )
        return {"status": "success", "message": f"Successfully updated {len(data.plans)} days."}
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error saving monthly plan: {e}")
        raise HTTPException(status_code=500, detail="Failed to save monthly plan. Please try again.")

@router.post("/re-plan")
async def re_plan_after_breakdown(
    data: BreakdownRePlan,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin", "trs"))
):
    try:
        broken_node_id = data.node_id
        today = date.today()

        logger.warning(f"EMERGENCY RE-PLAN TRIGGERED for {broken_node_id}")

        active_torpedoes = db.query(FleetManagement).filter(
            FleetManagement.type == 'torpedo',
            FleetManagement.status.in_(["Operating", "Assigned"])
        ).all()
        
        if active_torpedoes:
            avg_capacity = sum((f.capacity or 0) for f in active_torpedoes) / len(active_torpedoes)
            logger.info(f"Re-planning engine using detected avg capacity: {avg_capacity} MT (from {len(active_torpedoes)} active torpedoes)")
        else:
            avg_capacity = float(get_config(db, "NOMINAL_CAPACITY", "150.0"))
            logger.warning(f"Re-planning engine: No active torpedoes found. Using NOMINAL_CAPACITY fallback = {avg_capacity} MT")

        delivered_trips = db.query(
            Trip.producer_id, Trip.consumer_id, func.count(Trip.id).label("count")
        ).filter(func.date(Trip.last_updated) == today, Trip.status >= 1).group_by(Trip.producer_id, Trip.consumer_id).all()

        load_map = {}                      
        for d in delivered_trips:
            load_map[d.producer_id] = load_map.get(d.producer_id, 0) + (d.count * avg_capacity)
            load_map[d.consumer_id] = load_map.get(d.consumer_id, 0) + (d.count * avg_capacity)

        plans = db.query(DailyPlan).filter(DailyPlan.date == today).all()
        
        maintenance_nodes = db.query(MaintenanceSchedule.node_id).filter(
            MaintenanceSchedule.start_date <= today,
            MaintenanceSchedule.end_date >= today
        ).all()
        maintenance_ids = [m[0] for m in maintenance_nodes]

        operating_nodes = db.query(LocationCoordinate).filter(
            LocationCoordinate.status == "Operating",
            LocationCoordinate.user_id != broken_node_id,
            ~LocationCoordinate.user_id.in_(maintenance_ids)
        ).all()
        active_ids = [n.user_id for n in operating_nodes]

        producers = []
        consumers = []
        for p in plans:
            if p.user_id not in active_ids: continue
            
            delivered = load_map.get(p.user_id, 0)
            residual = max(0, p.capacity - delivered)
            
            if residual > 0:
                                                       
                temp_p = type('obj', (object,), {'user_id': p.user_id, 'capacity': residual, 'role': p.role})
                if p.role == 'producer': producers.append(temp_p)
                else: consumers.append(temp_p)

        if not producers or not consumers:
            return {"status": "error", "message": "No residual logistics requirements remain or no active nodes available."}

        prob = pulp.LpProblem("Emergency_RePlan", pulp.LpMinimize)
        trips_vars = {}
        
        trip_configs = db.query(TripTimeConfig).all()
        times = {}
        for tc in trip_configs:
            if tc.source_user_id not in times:
                times[tc.source_user_id] = {}
            times[tc.source_user_id][tc.destination_user_id] = tc.travel_time

        db_constraints = db.query(RoutingConstraint).all()
        allowed_pairs = set()
        for dc in db_constraints:
            allowed_pairs.add((normalize_id(dc.producer_id), normalize_id(dc.consumer_id)))

        default_travel_time = int(get_config(db, "DEFAULT_TRAVEL_TIME", "30"))

        logger.info(f"Emergency Re-plan: Using Avg Capacity = {avg_capacity} MT")
        
        for p in producers:
            for c in consumers:
                norm_p = normalize_id(p.user_id)
                norm_c = normalize_id(c.user_id)
                
                if (norm_p, norm_c) in allowed_pairs:
                    trips_vars[(p.user_id, c.user_id)] = pulp.LpVariable(f"trips_{norm_p}_{norm_c}", lowBound=0, cat='Integer')
                else:
                    trips_vars[(p.user_id, c.user_id)] = 0

        prob += pulp.lpSum(trips_vars[(p.user_id, c.user_id)] * times.get(p.user_id, {}).get(c.user_id, default_travel_time) 
                         for p in producers for c in consumers if isinstance(trips_vars[(p.user_id, c.user_id)], pulp.LpVariable))

        for p in producers:
            prob += pulp.lpSum(trips_vars[(p.user_id, c.user_id)] * avg_capacity for c in consumers if isinstance(trips_vars[(p.user_id, c.user_id)], pulp.LpVariable)) <= p.capacity
        for c in consumers:
            prob += pulp.lpSum(trips_vars[(p.user_id, c.user_id)] * avg_capacity for p in producers if isinstance(trips_vars[(p.user_id, c.user_id)], pulp.LpVariable)) >= c.capacity

        prob.solve(_get_cbc_solver())
        
        if pulp.LpStatus[prob.status] != 'Optimal':
            raise HTTPException(status_code=400, detail="Re-optimization failed: Constraints are unsatisfiable with remaining resources.")

        new_assignments = []
        for p in producers:
            for c in consumers:
                if trips_vars.get((p.user_id, c.user_id)) and trips_vars[(p.user_id, c.user_id)].varValue > 0:
                    cnt = int(trips_vars[(p.user_id, c.user_id)].varValue)
                    new_assignments.append({
                        "producer_id": p.user_id,
                        "consumer_id": c.user_id,
                        "trips": cnt,
                        "quantity": cnt * avg_capacity,
                        "travel_time": times.get(p.user_id, {}).get(c.user_id, 30)
                    })

        db.query(DistributionAssignment).filter(DistributionAssignment.date == today, DistributionAssignment.status == 'Committed').update({"status": "Superseded"})
        
        for item in new_assignments:
            db.add(DistributionAssignment(
                date=today,
                producer_id=item['producer_id'],
                consumer_id=item['consumer_id'],
                quantity=item['quantity'],
                trips=item['trips'],
                travel_time=item['travel_time'],
                status='Revised_Breakdown'
            ))
        
        db.commit()
        log_activity(
            db, admin_user.username, "BREAKDOWN_INTERVENTION",
            details=f"Re-planned after {broken_node_id} failure. {len(new_assignments)} new assignments created.",
            current_user=admin_user,
            entity_type="plan",
            entity_id=broken_node_id,
            new_value={"broken_node_id": broken_node_id, "new_assignments_count": len(new_assignments)}
        )
        
        return {
            "status": "success",
            "message": "Re-planning complete. Logistics system adjusted for breakdown.",
            "assignments": new_assignments
        }

    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error during re-planning: {e}")
        raise HTTPException(status_code=500, detail="Failed to complete re-planning. Please try again.")

class PlanHistoryEmailRequest(BaseModel):
    email: EmailStr
    start_date: Optional[str] = None
    end_date: Optional[str] = None

@router.post("/history/email")
async def email_plan_history(
    data: PlanHistoryEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    from ..utils.email_service import email_service, FRONTEND_URL

    try:
                                                           
        if not data.end_date:
            end_date = date.today().isoformat()
        else:
            end_date = data.end_date
        if not data.start_date:
            start_dt = date.today() - timedelta(days=30)
            start_date = start_dt.isoformat()
        else:
            start_date = data.start_date

        start = date.fromisoformat(start_date)
        end = date.fromisoformat(end_date)

        assignments = db.query(DistributionAssignment).filter(
            DistributionAssignment.date >= start,
            DistributionAssignment.date <= end
        ).order_by(DistributionAssignment.date.desc()).all()

        trips = db.query(Trip).filter(
            Trip.status == 13,             
            func.date(Trip.c_exited_at) >= start,
            func.date(Trip.c_exited_at) <= end
        ).all()

        if current_user.role == 'producer':
            assignments = [a for a in assignments if a.producer_id == current_user.user_id]
            trips = [t for t in trips if t.producer_id == current_user.user_id]
        elif current_user.role == 'consumer':
            assignments = [a for a in assignments if a.consumer_id == current_user.user_id]
            trips = [t for t in trips if t.consumer_id == current_user.user_id]

        total_planned_trips = sum(a.trips for a in assignments)
        total_completed_trips = len(trips)
        total_quantity = sum(a.quantity for a in assignments)
        avg_cycle_time = round(sum(t.cycle_time_minutes or 0 for t in trips) / len(trips), 1) if trips else 0
        fulfillment_rate = round((total_completed_trips / total_planned_trips * 100), 1) if total_planned_trips > 0 else 0

        date_summary = {}
        for a in assignments:
            d = str(a.date)
            if d not in date_summary:
                date_summary[d] = {"planned_trips": 0, "quantity": 0, "completed": 0}
            date_summary[d]["planned_trips"] += a.trips
            date_summary[d]["quantity"] += a.quantity

        for t in trips:
            d = str(t.c_exited_at.date()) if t.c_exited_at else None
            if d and d in date_summary:
                date_summary[d]["completed"] += 1

        date_range_str = f"{start_date} to {end_date}"
        html_table = ""

        if date_summary:
            html_table = """<table style='border-collapse: collapse; width: 100%; margin-top: 20px; font-size: 12px;'>
            <thead><tr style='background: linear-gradient(135deg, #8b5cf6, #6366f1); color: white;'>
                <th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>Date</th>
                <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Planned Trips</th>
                <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Completed</th>
                <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Quantity (MT)</th>
                <th style='border: 1px solid #ddd; padding: 10px; text-align: right;'>Fulfillment</th>
            </tr></thead><tbody>"""

            for i, (d, stats) in enumerate(sorted(date_summary.items(), reverse=True)[:50]):
                bg_color = '#f8fafc' if i % 2 == 0 else '#ffffff'
                rate = round((stats["completed"] / stats["planned_trips"] * 100), 1) if stats["planned_trips"] > 0 else 0
                rate_color = '#22c55e' if rate >= 80 else '#f59e0b' if rate >= 50 else '#ef4444'

                html_table += f"""<tr style='background: {bg_color}; border-bottom: 1px solid #e2e8f0;'>
                    <td style='border: 1px solid #ddd; padding: 8px; font-weight: 600;'>{d}</td>
                    <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{stats["planned_trips"]}</td>
                    <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{stats["completed"]}</td>
                    <td style='border: 1px solid #ddd; padding: 8px; text-align: right;'>{stats["quantity"]:,}</td>
                    <td style='border: 1px solid #ddd; padding: 8px; text-align: right; color: {rate_color}; font-weight: 600;'>{rate}%</td>
                </tr>"""

            html_table += "</tbody></table>"
        else:
            html_table = "<p style='color: #64748b;'>No planning data available for the selected criteria.</p>"

        email_content = f"""
            <h2 style="color: #0f172a; margin-bottom: 20px;">Planning History Report</h2>
            <div style="margin-bottom: 20px; color: #64748b; font-size: 13px;">
                <p><strong>Generated:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
                <p><strong>Requested by:</strong> {current_user.username}</p>
                <p><strong>Date Range:</strong> {date_range_str}</p>
            </div>

            <div style="display: flex; gap: 16px; margin-bottom: 24px; flex-wrap: wrap;">
                <div style="flex: 1; min-width: 120px; background: linear-gradient(135deg, #dbeafe, #eff6ff); padding: 16px; border-radius: 12px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700; color: #1e40af;">{total_planned_trips}</div>
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Planned Trips</div>
                </div>
                <div style="flex: 1; min-width: 120px; background: linear-gradient(135deg, #dcfce7, #f0fdf4); padding: 16px; border-radius: 12px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700; color: #166534;">{total_completed_trips}</div>
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Completed</div>
                </div>
                <div style="flex: 1; min-width: 120px; background: linear-gradient(135deg, #fef3c7, #fffbeb); padding: 16px; border-radius: 12px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700; color: #92400e;">{fulfillment_rate}%</div>
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Fulfillment</div>
                </div>
                <div style="flex: 1; min-width: 120px; background: linear-gradient(135deg, #e0e7ff, #eef2ff); padding: 16px; border-radius: 12px; text-align: center;">
                    <div style="font-size: 24px; font-weight: 700; color: #4338ca;">{avg_cycle_time}</div>
                    <div style="font-size: 11px; color: #64748b; text-transform: uppercase;">Avg Cycle (min)</div>
                </div>
            </div>

            <h3 style="color: #0f172a; margin-bottom: 12px; font-size: 14px;">Daily Summary</h3>
            {html_table}
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
                    <p><a href="{FRONTEND_URL}/planning-history" style="color: #3b82f6;">View Planning History</a></p>
                    <p class="footer-copyright">&copy; {datetime.now().year} Deevia Software India Pvt Ltd. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

        email_sent = email_service._send_email(
            to_email=data.email,
            subject="HMD System - Planning History Report",
            html_content=html,
            text_content=f"Planning History Report generated on {datetime.now().strftime('%Y-%m-%d %H:%M')} with {len(date_summary)} days of data."
        )

        if not email_sent:
            raise HTTPException(status_code=500, detail="Failed to send email. Please check SMTP configuration.")

        log_activity(
            db, current_user.username, "PLAN_HISTORY_EMAILED",
            details=f"Planning history emailed to {data.email}",
            current_user=current_user
        )

        logger.info(f"Planning history emailed by {current_user.username} to {data.email}")
        return {"status": "success", "message": f"Planning history sent to {data.email}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending planning history email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")
