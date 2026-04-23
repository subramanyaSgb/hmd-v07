from fastapi import APIRouter, Depends, HTTPException, BackgroundTasks, Response, Request
from fastapi.responses import StreamingResponse
from sqlalchemy import func, or_
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from slowapi import Limiter
from slowapi.util import get_remote_address
import io
import csv
import json
from datetime import datetime, date, timedelta
from typing import Optional, List, Any, Dict

from ..utils.security import require_roles

limiter = Limiter(key_func=get_remote_address)
from ..database.engine import SessionLocal
from ..database.models import (
    Trip, FleetManagement, User, SavedReport, ScheduledReport, ReportHistory
)
from ..schemas import (
    TripPerformanceReport, FleetUtilizationReport, TripPerformanceSummary, FleetUtilizationSummary, TripPerformanceDetail, FleetUtilizationDetail, SavedReportCreate,
    SavedReportResponse, ScheduleReportCreate, ScheduleReportResponse
)
from ..logger import logger

router = APIRouter(prefix="/api/reports", tags=["Reports"])

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()

def calculate_cycle_time_minutes(trip: Trip) -> Optional[float]:
                                                                       
    if trip.status == 13 and trip.cycle_time_minutes:
        return trip.cycle_time_minutes
                                                      
    if trip.p_entered_at and trip.c_exited_at:
        delta = trip.c_exited_at - trip.p_entered_at
        return delta.total_seconds() / 60
    return None

def calculate_loading_time(trip: Trip) -> Optional[float]:
    if trip.p_loading_start_at and trip.p_loading_end_at:
        delta = trip.p_loading_end_at - trip.p_loading_start_at
        return delta.total_seconds() / 60
    return None

def calculate_unloading_time(trip: Trip) -> Optional[float]:
    if trip.c_unloading_start_at and trip.c_unloading_end_at:
        delta = trip.c_unloading_end_at - trip.c_unloading_start_at
        return delta.total_seconds() / 60
    return None

def get_status_text(status: int) -> str:
    status_map = {
        0: "Pending",
        1: "Assigned",
        2: "WB Tare Entry",
        3: "WB Tare Recorded",
        4: "Producer Entered",
        5: "Loading Started",
        6: "Loading Ended",
        7: "Producer Exited",
        8: "WB Gross Entry",
        9: "WB Gross Recorded",
        10: "Consumer Entered",
        11: "Unloading Started",
        12: "Unloading Ended",
        13: "Completed"
    }
    return status_map.get(status, "Unknown")

def apply_user_data_restriction(db: Session, user: dict, query):
    if user.get("role") == "producer":
        query = query.filter(Trip.producer_id == user.get("user_id"))
    elif user.get("role") == "consumer":
        query = query.filter(Trip.consumer_id == user.get("user_id"))
    return query

@router.get("/trip-performance", response_model=TripPerformanceReport)
@limiter.limit("10/minute")                                 
async def get_trip_performance_report(
    request: Request,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    status: Optional[str] = None,
    producer_id: Optional[str] = None,
    consumer_id: Optional[str] = None,
    fleet_id: Optional[str] = None,
    current_user: User = Depends(require_roles(["admin", "producer", "consumer", "ppc", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(Trip)
        
        if current_user.role not in ("admin", "trs", "ppc"):
            if current_user.role == "producer":
                query = query.filter(Trip.producer_id == current_user.user_id)
            elif current_user.role == "consumer":
                query = query.filter(Trip.consumer_id == current_user.user_id)

        if date_from:
            query = query.filter(func.date(Trip.created_at) >= date_from)
        if date_to:
            query = query.filter(func.date(Trip.created_at) <= date_to)
        if status:
            query = query.filter(Trip.status == int(status))
        if producer_id and current_user.role in ("admin", "trs", "ppc"):
            query = query.filter(Trip.producer_id == producer_id)
        if consumer_id and current_user.role in ("admin", "trs", "ppc"):
            query = query.filter(Trip.consumer_id == consumer_id)
        if fleet_id:
            query = query.filter(Trip.torpedo_id == fleet_id)
        
        trips = query.order_by(Trip.created_at.desc()).all()
        
        summary = TripPerformanceSummary(
            total_trips=len(trips),
            completed_trips=sum(1 for t in trips if t.status == 13),
            in_progress_trips=sum(1 for t in trips if 0 < t.status < 13),
            cancelled_trips=0,
            avg_cycle_time_minutes=0.0,
            on_time_delivery_rate=0.0,
            total_distance_travelled=0.0
        )
        
        cycle_times = []
        loading_times = []
        unloading_times = []
        completed_trips_list = []
        
        for trip in trips:
            ct = calculate_cycle_time_minutes(trip)
            lt = calculate_loading_time(trip)
            ut = calculate_unloading_time(trip)
            
            if ct:
                cycle_times.append(ct)
            if lt:
                loading_times.append(lt)
            if ut:
                unloading_times.append(ut)
            
            if trip.status == 13:
                travel_time = round(
                    (trip.c_entered_at - trip.p_exited_at).total_seconds() / 60, 1
                ) if trip.c_entered_at and trip.p_exited_at else None
                completed_trips_list.append(TripPerformanceDetail(
                    trip_id=trip.trip_id,
                    producer_id=trip.producer_id,
                    consumer_id=trip.consumer_id,
                    torpedo_id=trip.torpedo_id,
                    status=trip.status,
                    status_text=get_status_text(trip.status),
                    created_at=trip.created_at,
                    assigned_at=trip.assigned_at,
                    p_entered_at=trip.p_entered_at,
                    p_loading_end_at=trip.p_loading_end_at,
                    p_exited_at=trip.p_exited_at,
                    c_entered_at=trip.c_entered_at,
                    c_unloading_end_at=trip.c_unloading_end_at,
                    c_exited_at=trip.c_exited_at,
                    cycle_time_minutes=ct,
                    loading_time_minutes=lt,
                    unloading_time_minutes=ut,
                    travel_time_minutes=travel_time,
                    is_on_time=ct and ct <= 60
                ))
        
        if cycle_times:
            summary.avg_cycle_time_minutes = sum(cycle_times) / len(cycle_times)
        if loading_times:
            summary.avg_loading_time_minutes = sum(loading_times) / len(loading_times)
        if unloading_times:
            summary.avg_unloading_time_minutes = sum(unloading_times) / len(unloading_times)
        
        on_time = sum(1 for ct in cycle_times if ct and ct <= 60) if cycle_times else 0
        if cycle_times:
            summary.on_time_delivery_rate = (on_time / len(cycle_times)) * 100
        
        cycle_distribution = {"range_0_30": 0, "range_30_45": 0, "range_45_60": 0, "range_60_90": 0, "range_90_plus": 0}
        for ct in cycle_times:
            if ct <= 30:
                cycle_distribution["range_0_30"] += 1
            elif ct <= 45:
                cycle_distribution["range_30_45"] += 1
            elif ct <= 60:
                cycle_distribution["range_45_60"] += 1
            elif ct <= 90:
                cycle_distribution["range_60_90"] += 1
            else:
                cycle_distribution["range_90_plus"] += 1
        
        daily_trends = []
        if date_from and date_to:
            trend_start = date_from
            trend_end = date_to
        elif trips:
            trip_dates = [t.created_at.date() for t in trips if t.created_at]
            trend_start = min(trip_dates) if trip_dates else date.today() - timedelta(days=6)
            trend_end = max(trip_dates) if trip_dates else date.today()
        else:
            trend_start = date.today() - timedelta(days=6)
            trend_end = date.today()
        num_days = (trend_end - trend_start).days + 1
        for i in range(num_days):
            d = trend_start + timedelta(days=i)
            day_trips = [t for t in trips if t.created_at and t.created_at.date() == d]
            day_ct = [calculate_cycle_time_minutes(t) for t in day_trips if calculate_cycle_time_minutes(t)]
            daily_trends.append({
                "date": d.strftime("%b %d"),
                "trip_count": len(day_trips),
                "completed": sum(1 for t in day_trips if t.status == 13),
                "avg_cycle_time": round(sum(day_ct) / len(day_ct), 1) if day_ct else 0
            })
        
        producer_breakdown = {}
        for trip in trips:
            pid = trip.producer_id
            if pid not in producer_breakdown:
                producer_breakdown[pid] = {"producer_id": pid, "total_trips": 0, "completed": 0}
            producer_breakdown[pid]["total_trips"] += 1
            if trip.status == 13:
                producer_breakdown[pid]["completed"] += 1
        
        consumer_breakdown = {}
        for trip in trips:
            cid = trip.consumer_id
            if cid not in consumer_breakdown:
                consumer_breakdown[cid] = {"consumer_id": cid, "total_trips": 0, "completed": 0}
            consumer_breakdown[cid]["total_trips"] += 1
            if trip.status == 13:
                consumer_breakdown[cid]["completed"] += 1
        
        logger.info(f"Trip performance report generated for user {current_user.username}")
        
        return TripPerformanceReport(
            summary=summary,
            cycle_time_distribution=cycle_distribution,
            trips=completed_trips_list,
            daily_trends=daily_trends,
            producer_breakdown=list(producer_breakdown.values()),
            consumer_breakdown=list(consumer_breakdown.values())
        )
    except SQLAlchemyError as e:
        logger.error(f"Database error generating trip performance report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate trip performance report")

@router.get("/fleet-utilization", response_model=FleetUtilizationReport)
@limiter.limit("10/minute")
async def get_fleet_utilization_report(
    request: Request,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    fleet_type: Optional[str] = None,
    current_user: User = Depends(require_roles(["admin", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        fleet_query = db.query(FleetManagement)
        if fleet_type:
            fleet_query = fleet_query.filter(FleetManagement.type == fleet_type)
        fleet_list = fleet_query.all()
        
        trip_query = db.query(Trip)
        if date_from:
            trip_query = trip_query.filter(func.date(Trip.created_at) >= date_from)
        if date_to:
            trip_query = trip_query.filter(func.date(Trip.created_at) <= date_to)
        trips = trip_query.all()
        
        summary = FleetUtilizationSummary(
            total_fleet=len(fleet_list),
            operating_count=sum(1 for f in fleet_list if f.status == "Operating"),
            maintenance_count=sum(1 for f in fleet_list if f.status == "Maintenance"),
            available_count=sum(1 for f in fleet_list if f.status == "Operating"),
            total_trips_completed=sum(1 for t in trips if t.status == 13)
        )
        
        fleet_details = []
        for fleet in fleet_list:
            fleet_trips = [t for t in trips if t.torpedo_id == fleet.fleet_id]
            completed = [t for t in fleet_trips if t.status == 13]
            cycle_times = [calculate_cycle_time_minutes(t) for t in completed if calculate_cycle_time_minutes(t)]
            
            fleet_details.append(FleetUtilizationDetail(
                fleet_id=fleet.fleet_id,
                fleet_type=fleet.type,
                capacity=fleet.capacity,
                status=fleet.status,
                total_trips=len(fleet_trips),
                completed_trips=len(completed),
                total_distance=sum((t.c_exited_at - t.p_entered_at).total_seconds() / 60 if t.c_exited_at and t.p_entered_at else 0 for t in completed),
                avg_cycle_time=sum(cycle_times) / len(cycle_times) if cycle_times else None,
                capacity_utilization=0.0,
                last_active=max([t.c_exited_at for t in completed if t.c_exited_at] or [None])
            ))
        
        status_distribution = {}
        for f in fleet_list:
            status_distribution[f.status] = status_distribution.get(f.status, 0) + 1
        
        daily_utilization = []
        if date_from and date_to:
            util_start = date_from
            util_end = date_to
        elif trips:
            trip_dates = [t.created_at.date() for t in trips if t.created_at]
            util_start = min(trip_dates) if trip_dates else date.today() - timedelta(days=6)
            util_end = max(trip_dates) if trip_dates else date.today()
        else:
            util_start = date.today() - timedelta(days=6)
            util_end = date.today()
        for i in range((util_end - util_start).days + 1):
            d = util_start + timedelta(days=i)
            day_trips = [t for t in trips if t.created_at and t.created_at.date() == d]
            daily_utilization.append({
                "date": d.strftime("%b %d"),
                "trip_count": len(day_trips),
                "active_fleet": len(set(t.torpedo_id for t in day_trips if t.torpedo_id))
            })
        
        type_counts = {}
        for f in fleet_list:
            type_counts[f.type] = type_counts.get(f.type, 0) + 1
        type_breakdown = [{"type": t, "count": c} for t, c in type_counts.items()]

        logger.info(f"Fleet utilization report generated by {current_user.username}")

        return FleetUtilizationReport(
            summary=summary,
            fleet_details=fleet_details,
            status_distribution=status_distribution,
            daily_utilization=daily_utilization,
            type_breakdown=type_breakdown,
            maintenance_schedule=[]
        )
    except SQLAlchemyError as e:
        logger.error(f"Database error generating fleet utilization report: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate fleet utilization report")





@router.post("/saved")
async def save_report(
    report: SavedReportCreate,
    current_user: User = Depends(require_roles(["admin", "producer", "consumer", "ppc", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        saved = SavedReport(
            name=report.name,
            report_type=report.report_type,
            filters=json.dumps(report.filters),
            created_by=current_user.username,
            is_shared=False
        )
        db.add(saved)
        db.commit()
        db.refresh(saved)
        
        logger.info(f"Report saved by {current_user.username}: {report.name}")
        
        return {"message": "Report saved successfully", "id": saved.id}
    except SQLAlchemyError as e:
        logger.error(f"Database error saving report: {e}")
        raise HTTPException(status_code=500, detail="Failed to save report")

@router.get("/saved", response_model=List[SavedReportResponse])
async def get_saved_reports(
    current_user: User = Depends(require_roles(["admin", "producer", "consumer", "ppc", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        query = db.query(SavedReport)
        if current_user.role not in ("admin", "trs"):
            query = query.filter(
                or_(
                    SavedReport.created_by == current_user.username,
                    SavedReport.is_shared == True
                )
            )
        saved = query.order_by(SavedReport.created_at.desc()).all()
        
        return [
            SavedReportResponse(
                id=s.id,
                name=s.name,
                report_type=s.report_type,
                filters=json.loads(s.filters) if s.filters else {},
                created_by=s.created_by,
                is_shared=s.is_shared,
                created_at=s.created_at,
                last_accessed=s.last_accessed
            )
            for s in saved
        ]
    except SQLAlchemyError as e:
        logger.error(f"Database error fetching saved reports: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch saved reports")

@router.delete("/saved/{report_id}")
async def delete_saved_report(
    report_id: int,
    current_user: User = Depends(require_roles(["admin", "producer", "consumer", "ppc", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        report = db.query(SavedReport).filter(SavedReport.id == report_id).first()
        if not report:
            raise HTTPException(status_code=404, detail="Report not found")
        
        if current_user.role not in ("admin", "trs") and report.created_by != current_user.username:
            raise HTTPException(status_code=403, detail="Not authorized to delete this report")
        
        db.delete(report)
        db.commit()
        
        return {"message": "Report deleted successfully"}
    except SQLAlchemyError as e:
        logger.error(f"Database error deleting saved report: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete report")

@router.post("/schedules", response_model=ScheduleReportResponse)
async def create_schedule(
    schedule: ScheduleReportCreate,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(["admin", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        scheduled = ScheduledReport(
            name=schedule.name,
            report_type=schedule.report_type,
            filters=json.dumps(schedule.filters),
            schedule_type=schedule.schedule_type,
            schedule_time=schedule.schedule_time,
            schedule_day=schedule.schedule_day,
            recipients=json.dumps(schedule.recipients),
            export_format=schedule.export_format,
            is_active=True,
            created_by=current_user.username
        )
        db.add(scheduled)
        db.commit()
        db.refresh(scheduled)
        
        logger.info(f"Report schedule created by {current_user.username}: {schedule.name}")
        
        return ScheduleReportResponse(
            id=scheduled.id,
            name=scheduled.name,
            report_type=scheduled.report_type,
            schedule_type=scheduled.schedule_type,
            schedule_time=scheduled.schedule_time,
            is_active=scheduled.is_active,
            next_run=None,
            created_by=scheduled.created_by,
            created_at=scheduled.created_at
        )
    except SQLAlchemyError as e:
        logger.error(f"Database error creating schedule: {e}")
        raise HTTPException(status_code=500, detail="Failed to create schedule")

@router.get("/schedules", response_model=List[ScheduleReportResponse])
async def get_schedules(
    current_user: User = Depends(require_roles(["admin", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        schedules = db.query(ScheduledReport).order_by(ScheduledReport.created_at.desc()).all()
        
        return [
            ScheduleReportResponse(
                id=s.id,
                name=s.name,
                report_type=s.report_type,
                schedule_type=s.schedule_type,
                schedule_time=s.schedule_time,
                is_active=s.is_active,
                next_run=s.next_run,
                created_by=s.created_by,
                created_at=s.created_at
            )
            for s in schedules
        ]
    except SQLAlchemyError as e:
        logger.error(f"Database error fetching schedules: {e}")
        raise HTTPException(status_code=500, detail="Failed to fetch schedules")

@router.delete("/schedules/{schedule_id}")
async def delete_schedule(
    schedule_id: int,
    current_user: User = Depends(require_roles(["admin", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        schedule = db.query(ScheduledReport).filter(ScheduledReport.id == schedule_id).first()
        if not schedule:
            raise HTTPException(status_code=404, detail="Schedule not found")
        
        db.delete(schedule)
        db.commit()
        
        logger.info(f"Schedule deleted by {current_user.username}")
        
        return {"message": "Schedule deleted successfully"}
    except SQLAlchemyError as e:
        logger.error(f"Database error deleting schedule: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete schedule")

@router.get("/export/csv/{report_type}")
@limiter.limit("5/minute")                              
async def export_report_csv(
    request: Request,
    report_type: str,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: User = Depends(require_roles(["admin", "producer", "consumer", "ppc", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        data = []
        filename = f"{report_type}_report"
        
        if report_type == "trip-performance":
            query = db.query(Trip)
            if current_user.role == "producer":
                query = query.filter(Trip.producer_id == current_user.user_id)
            elif current_user.role == "consumer":
                query = query.filter(Trip.consumer_id == current_user.user_id)
            if date_from:
                query = query.filter(func.date(Trip.created_at) >= date_from)
            if date_to:
                query = query.filter(func.date(Trip.created_at) <= date_to)
            trips = query.order_by(Trip.created_at.desc()).limit(500).all()
            
            for t in trips:
                ct = calculate_cycle_time_minutes(t)
                data.append({
                    "trip_id": t.trip_id,
                    "producer_id": t.producer_id,
                    "consumer_id": t.consumer_id,
                    "torpedo_id": t.torpedo_id or "",
                    "status": get_status_text(t.status),
                    "cycle_time_minutes": round(ct, 2) if ct else "",
                    "created_at": t.created_at.isoformat() if t.created_at else ""
                })
            filename = "trip_performance_report"
        
        
        
        
        elif report_type == "fleet-utilization" and current_user.role in ("admin", "trs"):
            fleet_list = db.query(FleetManagement).all()
            trip_query = db.query(Trip)
            if date_from:
                trip_query = trip_query.filter(func.date(Trip.created_at) >= date_from)
            if date_to:
                trip_query = trip_query.filter(func.date(Trip.created_at) <= date_to)
            trips = trip_query.all()

            for f in fleet_list:
                fleet_trips = [t for t in trips if t.torpedo_id == f.fleet_id]
                completed = [t for t in fleet_trips if t.status == 13]
                cycle_times = [calculate_cycle_time_minutes(t) for t in completed if calculate_cycle_time_minutes(t)]
                
                data.append({
                    "fleet_id": f.fleet_id,
                    "type": f.type,
                    "capacity": f.capacity or "",
                    "status": f.status,
                    "total_trips": len(fleet_trips),
                    "completed_trips": len(completed),
                    "avg_cycle_time": round(sum(cycle_times) / len(cycle_times), 2) if cycle_times else 0,
                    "last_active": max([t.c_exited_at for t in completed if t.c_exited_at] or [None]).isoformat() if any(t.c_exited_at for t in completed) else ""
                })
            filename = "fleet_utilization_report"
        
        
        else:
            raise HTTPException(status_code=400, detail="Invalid report type or access denied")
        
        output = io.StringIO()
        if data:
            writer = csv.DictWriter(output, fieldnames=data[0].keys())
            writer.writeheader()
            writer.writerows(data)
        
        history = ReportHistory(
            report_type=report_type,
            filters=json.dumps({"date_from": str(date_from), "date_to": str(date_to)}),
            generated_by=current_user.username,
            format_used="csv",
            record_count=len(data)
        )
        db.add(history)
        db.commit()
        
        logger.info(f"CSV export generated by {current_user.username}: {report_type}")
        
        return StreamingResponse(
            iter([output.getvalue()]),
            media_type="text/csv",
            headers={"Content-Disposition": f"attachment; filename={filename}.csv"}
        )
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error generating CSV export: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate CSV export")

@router.get("/export/json/{report_type}")
@limiter.limit("5/minute")
async def export_report_json(
    request: Request,
    report_type: str,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: User = Depends(require_roles(["admin", "producer", "consumer", "ppc", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        export_data = {
            "report_type": report_type,
            "generated_at": datetime.now().isoformat(),
            "generated_by": current_user.username,
            "filters": {"date_from": str(date_from), "date_to": str(date_to)},
            "data": []
        }
        
        if report_type == "trip-performance":
            query = db.query(Trip)
            if current_user.role == "producer":
                query = query.filter(Trip.producer_id == current_user.user_id)
            elif current_user.role == "consumer":
                query = query.filter(Trip.consumer_id == current_user.user_id)
            if date_from:
                query = query.filter(func.date(Trip.created_at) >= date_from)
            if date_to:
                query = query.filter(func.date(Trip.created_at) <= date_to)
            trips = query.order_by(Trip.created_at.desc()).limit(500).all()
            
            for t in trips:
                ct = calculate_cycle_time_minutes(t)
                export_data["data"].append({
                    "trip_id": t.trip_id,
                    "producer_id": t.producer_id,
                    "consumer_id": t.consumer_id,
                    "torpedo_id": t.torpedo_id,
                    "status": get_status_text(t.status),
                    "cycle_time_minutes": round(ct, 2) if ct else None,
                    "created_at": t.created_at.isoformat() if t.created_at else None
                })
        
        
        
        
        elif report_type == "fleet-utilization" and current_user.role in ("admin", "trs"):
            fleet_list = db.query(FleetManagement).all()
            trip_query = db.query(Trip)
            if date_from:
                trip_query = trip_query.filter(func.date(Trip.created_at) >= date_from)
            if date_to:
                trip_query = trip_query.filter(func.date(Trip.created_at) <= date_to)
            trips = trip_query.all()

            for f in fleet_list:
                fleet_trips = [t for t in trips if t.torpedo_id == f.fleet_id]
                completed = [t for t in fleet_trips if t.status == 13]
                cycle_times = [calculate_cycle_time_minutes(t) for t in completed if calculate_cycle_time_minutes(t)]
                
                export_data["data"].append({
                    "fleet_id": f.fleet_id,
                    "type": f.type,
                    "capacity": f.capacity,
                    "status": f.status,
                    "total_trips": len(fleet_trips),
                    "completed_trips": len(completed),
                    "avg_cycle_time": round(sum(cycle_times) / len(cycle_times), 2) if cycle_times else 0,
                    "last_active": max([t.c_exited_at for t in completed if t.c_exited_at] or [None]).isoformat() if any(t.c_exited_at for t in completed) else None
                })
        
        
        else:
            raise HTTPException(status_code=400, detail="Invalid report type or access denied")
        
        history = ReportHistory(
            report_type=report_type,
            filters=json.dumps({"date_from": str(date_from), "date_to": str(date_to)}),
            generated_by=current_user.username,
            format_used="json",
            record_count=len(export_data["data"])
        )
        db.add(history)
        db.commit()
        
        logger.info(f"JSON export generated by {current_user.username}: {report_type}")
        
        return Response(
            content=json.dumps(export_data, indent=2, default=str),
            media_type="application/json",
            headers={"Content-Disposition": f"attachment; filename={report_type}_report.json"}
        )
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error generating JSON export: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate JSON export")

@router.get("/export/html/{report_type}")
@limiter.limit("5/minute")                              
async def export_report_html(
    request: Request,
    report_type: str,
    date_from: Optional[date] = None,
    date_to: Optional[date] = None,
    current_user: User = Depends(require_roles(["admin", "producer", "consumer", "ppc", "trs"])),
    db: Session = Depends(get_db)
):
    try:
        data = []
        title = report_type.replace("-", " ").title()
        
        if report_type == "trip-performance":
            query = db.query(Trip)
            if current_user.role == "producer":
                query = query.filter(Trip.producer_id == current_user.user_id)
            elif current_user.role == "consumer":
                query = query.filter(Trip.consumer_id == current_user.user_id)
            if date_from:
                query = query.filter(func.date(Trip.created_at) >= date_from)
            if date_to:
                query = query.filter(func.date(Trip.created_at) <= date_to)
            trips = query.order_by(Trip.created_at.desc()).limit(500).all()
            
            for t in trips:
                ct = calculate_cycle_time_minutes(t)
                data.append({
                    "Trip ID": t.trip_id,
                    "Producer": t.producer_id,
                    "Consumer": t.consumer_id,
                    "Torpedo": t.torpedo_id or "-",
                    "Status": get_status_text(t.status),
                    "Cycle Time (min)": round(ct, 2) if ct else "-",
                    "Created": t.created_at.strftime("%Y-%m-%d %H:%M") if t.created_at else "-"
                })
        
        

        elif report_type == "fleet-utilization" and current_user.role in ("admin", "trs"):
            fleet_list = db.query(FleetManagement).all()
            trip_query = db.query(Trip)
            if date_from:
                trip_query = trip_query.filter(func.date(Trip.created_at) >= date_from)
            if date_to:
                trip_query = trip_query.filter(func.date(Trip.created_at) <= date_to)
            trips = trip_query.all()

            for f in fleet_list:
                fleet_trips = [t for t in trips if t.torpedo_id == f.fleet_id]
                completed = [t for t in fleet_trips if t.status == 13]
                cycle_times = [calculate_cycle_time_minutes(t) for t in completed if calculate_cycle_time_minutes(t)]
                
                data.append({
                    "Fleet ID": f.fleet_id,
                    "Type": f.type,
                    "Capacity": f.capacity or "-",
                    "Status": f.status,
                    "Total Trips": len(fleet_trips),
                    "Completed Trips": len(completed),
                    "Avg Cycle Time (min)": round(sum(cycle_times) / len(cycle_times), 2) if cycle_times else "-",
                    "Last Active": max([t.c_exited_at for t in completed if t.c_exited_at] or [None]).strftime("%Y-%m-%d %H:%M") if any(t.c_exited_at for t in completed) else "-"
                })



        else:
            raise HTTPException(status_code=400, detail="Invalid report type or access denied")
        
        html_content = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <title>{title} Report</title>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 40px; }}
                h1 {{ color: #333; border-bottom: 2px solid #4a90d9; padding-bottom: 10px; }}
                .meta {{ color: #666; margin-bottom: 20px; }}
                table {{ border-collapse: collapse; width: 100%; margin-top: 20px; }}
                th, td {{ border: 1px solid #ddd; padding: 12px; text-align: left; }}
                th {{ background-color: #4a90d9; color: white; }}
                tr:nth-child(even) {{ background-color: #f9f9f9; }}
                .footer {{ margin-top: 30px; color: #999; font-size: 12px; }}
            </style>
        </head>
        <body>
            <h1>{title} Report</h1>
            <div class="meta">
                <p>Generated: {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
                <p>Generated by: {current_user.username}</p>
                <p>Date Range: {date_from or 'All'} to {date_to or 'All'}</p>
            </div>
        """
        
        if data and len(data) > 0:
            html_content += "<table><thead><tr>"
            for key in data[0].keys():
                html_content += f"<th>{key}</th>"
            html_content += "</tr></thead><tbody>"
            
            for row in data:
                html_content += "<tr>"
                for value in row.values():
                    html_content += f"<td>{value}</td>"
                html_content += "</tr>"
            
            html_content += "</tbody></table>"
            html_content += f"<p>Total records: {len(data)}</p>"
        else:
            html_content += "<p>No data available for the selected criteria.</p>"
        
        html_content += f"""
            <div class="footer" style="margin-top: 40px; padding: 30px 20px; background: linear-gradient(135deg, #0f172a 0%, #1e3a5f 100%); text-align: center;">
                <div style="font-size: 22px; font-weight: 800; color: #ffffff; letter-spacing: 2px; margin-bottom: 8px;">DEEVIA</div>
                <div style="font-size: 11px; color: #64748b; margin-bottom: 16px;">Advanced Logistics Control & Operational Intelligence System</div>
                <div style="width: 60px; height: 2px; background: linear-gradient(90deg, #3b82f6, #06b6d4); margin: 16px auto; border-radius: 1px;"></div>
                <p style="color: #94a3b8; font-size: 12px; margin: 8px 0;">This report was automatically generated by the HMD System.</p>
                <p style="color: #94a3b8; font-size: 11px; margin: 12px 0;">&copy; {datetime.now().year} Deevia Software India Pvt Ltd. All rights reserved.</p>
            </div>
        </body>
        </html>
        """
        
        history = ReportHistory(
            report_type=report_type,
            filters=json.dumps({"date_from": str(date_from), "date_to": str(date_to)}),
            generated_by=current_user.username,
            format_used="html",
            record_count=len(data)
        )
        db.add(history)
        db.commit()
        
        logger.info(f"HTML export generated by {current_user.username}: {report_type}")
        
        return Response(
            content=html_content,
            media_type="text/html",
            headers={"Content-Disposition": f"inline; filename={report_type}_report.html"}
        )
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        logger.error(f"Database error generating HTML export: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate HTML export")

from pydantic import BaseModel

class SendReportEmailRequest(BaseModel):
    report_type: str
    email: str
    filters: Optional[Dict[str, Any]] = None

@router.post("/send-email")
@limiter.limit("5/minute")                       
async def send_report_to_email(
    request: Request,
    data: SendReportEmailRequest,
    background_tasks: BackgroundTasks,
    current_user: User = Depends(require_roles(["admin", "trs"])),              
    db: Session = Depends(get_db)
):
    from ..utils.email_service import email_service

    valid_report_types = [
        "trip-performance", "fleet-utilization", "production-consumption",
        "maintenance-impact", "user-activity", "distribution-assignments"
    ]

    if data.report_type not in valid_report_types:
        raise HTTPException(status_code=400, detail="Invalid report type")

    if not email_service.is_configured():
        raise HTTPException(status_code=503, detail="Email service is not configured")

    date_from = None
    date_to = None
    if data.filters:
        if data.filters.get("date_from"):
            try:
                date_from = datetime.strptime(data.filters["date_from"], "%Y-%m-%d").date()
            except:
                pass
        if data.filters.get("date_to"):
            try:
                date_to = datetime.strptime(data.filters["date_to"], "%Y-%m-%d").date()
            except:
                pass

    report_data = []
    title = data.report_type.replace("-", " ").title()

    if data.report_type == "trip-performance":
        query = db.query(Trip)
        if date_from:
            query = query.filter(func.date(Trip.created_at) >= date_from)
        if date_to:
            query = query.filter(func.date(Trip.created_at) <= date_to)
        trips = query.order_by(Trip.created_at.desc()).limit(500).all()

        for t in trips:
            ct = calculate_cycle_time_minutes(t)
            report_data.append({
                "Trip ID": t.trip_id,
                "Producer": t.producer_id,
                "Consumer": t.consumer_id,
                "Torpedo": t.torpedo_id or "-",
                "Status": get_status_text(t.status),
                "Cycle Time (min)": round(ct, 2) if ct else "-",
                "Created": t.created_at.strftime("%Y-%m-%d %H:%M") if t.created_at else "-"
            })

    elif data.report_type == "fleet-utilization":
        fleet_list = db.query(FleetManagement).all()
        trip_query = db.query(Trip)
        if date_from:
            trip_query = trip_query.filter(func.date(Trip.created_at) >= date_from)
        if date_to:
            trip_query = trip_query.filter(func.date(Trip.created_at) <= date_to)
        trips = trip_query.all()

        for f in fleet_list:
            fleet_trips = [t for t in trips if t.torpedo_id == f.fleet_id]
            completed = [t for t in fleet_trips if t.status == 13]
            cycle_times = [calculate_cycle_time_minutes(t) for t in completed if calculate_cycle_time_minutes(t)]

            report_data.append({
                "Fleet ID": f.fleet_id,
                "Type": f.type,
                "Status": f.status,
                "Total Trips": len(fleet_trips),
                "Completed": len(completed),
                "Avg Cycle Time": round(sum(cycle_times) / len(cycle_times), 2) if cycle_times else "-"
            })





    date_range_str = f"{date_from or 'All'} to {date_to or 'All'}"
    html_table = ""
    if report_data:
        html_table = "<table style='border-collapse: collapse; width: 100%; margin-top: 20px;'>"
        html_table += "<thead><tr style='background: #4a90d9; color: white;'>"
        for key in report_data[0].keys():
            html_table += f"<th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>{key}</th>"
        html_table += "</tr></thead><tbody>"
        for row in report_data[:100]:                              
            html_table += "<tr style='border-bottom: 1px solid #ddd;'>"
            for value in row.values():
                html_table += f"<td style='border: 1px solid #ddd; padding: 8px;'>{value}</td>"
            html_table += "</tr>"
        html_table += "</tbody></table>"
        if len(report_data) > 100:
            html_table += f"<p style='color: #666; margin-top: 10px;'>Showing 100 of {len(report_data)} records. Export the full report for complete data.</p>"
    else:
        html_table = "<p>No data available for the selected criteria.</p>"

    email_content = f"""
        <h2>{title} Report</h2>
        <div style="margin-bottom: 20px; color: #666;">
            <p><strong>Generated:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
            <p><strong>Requested by:</strong> {current_user.username}</p>
            <p><strong>Date Range:</strong> {date_range_str}</p>
            <p><strong>Total Records:</strong> {len(report_data)}</p>
        </div>
        {html_table}
    """

    try:
        from ..utils.email_service import FRONTEND_URL

        html = f"""
        <!DOCTYPE html>
        <html>
        <head>
            <style>
                body {{ font-family: Arial, sans-serif; margin: 0; padding: 0; background: #f4f4f4; }}
                .container {{ max-width: 800px; margin: 20px auto; background: white; border-radius: 8px; overflow: hidden; box-shadow: 0 2px 10px rgba(0,0,0,0.1); }}
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
                    <p><a href="{FRONTEND_URL}/reports" style="color: #3b82f6;">View Reports Dashboard</a></p>
                    <p class="footer-copyright">&copy; {datetime.now().year} Deevia Software India Pvt Ltd. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

        email_sent = email_service._send_email(
            to_email=data.email,
            subject=f"HMD System - {title} Report",
            html_content=html,
            text_content=f"{title} Report generated on {datetime.now().strftime('%Y-%m-%d %H:%M')} with {len(report_data)} records."
        )

        if not email_sent:
            raise HTTPException(status_code=500, detail="Failed to send email. Please check SMTP configuration.")

        history = ReportHistory(
            report_type=data.report_type,
            filters=json.dumps({"date_from": str(date_from), "date_to": str(date_to), "sent_to": data.email}),
            generated_by=current_user.username,
            format_used="email",
            record_count=len(report_data)
        )
        db.add(history)
        db.commit()

        logger.info(f"Report emailed by {current_user.username}: {data.report_type} to {data.email}")

        return {"status": "success", "message": f"Report sent to {data.email}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending report email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send report email")
