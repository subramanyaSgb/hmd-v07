from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import and_, or_
from sqlalchemy.exc import SQLAlchemyError
from datetime import date, datetime
from typing import Optional
from ..database.engine import get_db
from ..database.models import MaintenanceSchedule, User
from ..utils.activity_logger import log_activity
from ..utils.security import get_current_user_required, require_roles
from ..utils.redis_cache import cache
from ..logger import logger

CACHE_KEY_LOCATIONS_ALL = "locations:all"

router = APIRouter(prefix="/api/maintenance", tags=["maintenance"])

@router.get("")
async def get_all_maintenance_schedules(
    node_id: Optional[str] = None,
    active_only: bool = False,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    query = db.query(MaintenanceSchedule)
    
    if node_id:
        query = query.filter(MaintenanceSchedule.node_id == node_id)
    
    if active_only:
        today = date.today()
        query = query.filter(
            MaintenanceSchedule.start_date <= today,
            MaintenanceSchedule.end_date >= today
        )
    
    schedules = query.order_by(MaintenanceSchedule.start_date.desc()).all()
    
    return [
        {
            "id": s.id,
            "node_id": s.node_id,
            "start_date": s.start_date.isoformat(),
            "end_date": s.end_date.isoformat(),
            "reason": s.reason,
            "created_at": s.created_at.isoformat() if s.created_at else None
        } for s in schedules
    ]

@router.get("/calendar/{year}/{month}")
async def get_maintenance_calendar(
    year: int,
    month: int,
    db: Session = Depends(get_db)
):
    from calendar import monthrange
    
    first_day = date(year, month, 1)
    last_day = date(year, month, monthrange(year, month)[1])
    
    schedules = db.query(MaintenanceSchedule).filter(
        or_(
            and_(
                MaintenanceSchedule.start_date <= last_day,
                MaintenanceSchedule.end_date >= first_day
            )
        )
    ).all()
    
    return [
        {
            "id": s.id,
            "node_id": s.node_id,
            "start_date": s.start_date.isoformat(),
            "end_date": s.end_date.isoformat(),
            "reason": s.reason
        } for s in schedules
    ]

@router.post("")
async def create_maintenance_schedule(
    data: dict,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin"))
):
    try:
        node_id = data.get("node_id")
        start_date_str = data.get("start_date")
        end_date_str = data.get("end_date")
        reason = data.get("reason", "Scheduled Maintenance")
        
        if not node_id or not start_date_str or not end_date_str:
            raise HTTPException(status_code=400, detail="Missing required fields: node_id, start_date, end_date")
        
        start_date = date.fromisoformat(start_date_str)
        end_date = date.fromisoformat(end_date_str)
        
        if end_date < start_date:
            raise HTTPException(status_code=400, detail="End date must be after start date")
        
        overlapping = db.query(MaintenanceSchedule).filter(
            MaintenanceSchedule.node_id == node_id,
            or_(
                and_(
                    MaintenanceSchedule.start_date <= end_date,
                    MaintenanceSchedule.end_date >= start_date
                )
            )
        ).first()
        
        if overlapping:
            raise HTTPException(
                status_code=400,
                detail=f"Overlapping maintenance schedule exists for {node_id} from {overlapping.start_date} to {overlapping.end_date}"
            )
        
        schedule = MaintenanceSchedule(
            node_id=node_id,
            start_date=start_date,
            end_date=end_date,
            reason=reason,
            created_at=datetime.now()
        )
        
        db.add(schedule)
        db.commit()
        db.refresh(schedule)
        cache.delete(CACHE_KEY_LOCATIONS_ALL)

        log_activity(
            db, "Admin", "MAINTENANCE_SCHEDULED",
            details=f"{node_id}: {start_date} to {end_date} - {reason}",
            entity_type="maintenance",
            entity_id=schedule.id,
            new_value={
                "node_id": node_id,
                "start_date": str(start_date),
                "end_date": str(end_date),
                "reason": reason
            }
        )
        
        return {
            "id": schedule.id,
            "node_id": schedule.node_id,
            "start_date": schedule.start_date.isoformat(),
            "end_date": schedule.end_date.isoformat(),
            "reason": schedule.reason
        }
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format provided")
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error creating maintenance schedule: {e}")
        raise HTTPException(status_code=500, detail="Failed to create maintenance schedule. Please try again.")

@router.put("/{schedule_id}")
async def update_maintenance_schedule(
    schedule_id: int,
    data: dict,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin"))
):
    try:
        schedule = db.query(MaintenanceSchedule).filter(MaintenanceSchedule.id == schedule_id).first()

        if not schedule:
            raise HTTPException(status_code=404, detail="Maintenance schedule not found")

        if "start_date" in data:
            schedule.start_date = date.fromisoformat(data["start_date"])
        if "end_date" in data:
            schedule.end_date = date.fromisoformat(data["end_date"])
        if "reason" in data:
            schedule.reason = data["reason"]

        if schedule.end_date < schedule.start_date:
            raise HTTPException(status_code=400, detail="End date must be after start date")

        db.commit()
        db.refresh(schedule)
        cache.delete(CACHE_KEY_LOCATIONS_ALL)

        log_activity(
            db, "Admin", "MAINTENANCE_UPDATED",
            details=f"{schedule.node_id}: {schedule.start_date} to {schedule.end_date}",
            entity_type="maintenance",
            entity_id=schedule.id,
            new_value={
                "node_id": schedule.node_id,
                "start_date": str(schedule.start_date),
                "end_date": str(schedule.end_date),
                "reason": schedule.reason
            }
        )

        return {
            "id": schedule.id,
            "node_id": schedule.node_id,
            "start_date": schedule.start_date.isoformat(),
            "end_date": schedule.end_date.isoformat(),
            "reason": schedule.reason
        }
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid date format provided")
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error updating maintenance schedule: {e}")
        raise HTTPException(status_code=500, detail="Failed to update maintenance schedule. Please try again.")

@router.delete("/{schedule_id}")
async def delete_maintenance_schedule(
    schedule_id: int,
    db: Session = Depends(get_db),
    admin_user: User = Depends(require_roles("admin"))
):
    try:
        schedule = db.query(MaintenanceSchedule).filter(MaintenanceSchedule.id == schedule_id).first()

        if not schedule:
            raise HTTPException(status_code=404, detail="Maintenance schedule not found")

        node_id = schedule.node_id
        start_date = schedule.start_date
        end_date = schedule.end_date

        db.delete(schedule)
        db.commit()
        cache.delete(CACHE_KEY_LOCATIONS_ALL)

        log_activity(
            db, "Admin", "MAINTENANCE_DELETED",
            details=f"{node_id}: {start_date} to {end_date}",
            entity_type="maintenance",
            entity_id=schedule_id,
            old_value={
                "node_id": node_id,
                "start_date": str(start_date),
                "end_date": str(end_date)
            }
        )

        return {"status": "success", "message": "Maintenance schedule deleted"}
    except HTTPException:
        raise
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error deleting maintenance schedule: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete maintenance schedule. Please try again.")

from pydantic import BaseModel, EmailStr
from ..utils.security import get_current_user
from ..database.models import User

class MaintenanceEmailRequest(BaseModel):
    email: EmailStr

@router.post("/email")
async def email_maintenance_schedule(
    data: MaintenanceEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    try:
        from ..utils.email_service import email_service, FRONTEND_URL
        from datetime import datetime

        today = date.today()
        schedules = db.query(MaintenanceSchedule).order_by(
            MaintenanceSchedule.start_date.asc()
        ).all()

        if not schedules:
            raise HTTPException(status_code=400, detail="No maintenance schedules to send")

        ongoing = []
        upcoming = []
        completed = []

        total_downtime_days = 0
        node_stats = {}
        reason_stats = {}
        monthly_stats = {}

        for s in schedules:
            duration = (s.end_date - s.start_date).days + 1
            total_downtime_days += duration

            if s.node_id not in node_stats:
                node_stats[s.node_id] = {'count': 0, 'total_days': 0, 'ongoing': False}
            node_stats[s.node_id]['count'] += 1
            node_stats[s.node_id]['total_days'] += duration

            reason = s.reason or 'Unspecified'
            reason_stats[reason] = reason_stats.get(reason, 0) + 1

            month_key = s.start_date.strftime('%Y-%m')
            if month_key not in monthly_stats:
                monthly_stats[month_key] = {'count': 0, 'total_days': 0}
            monthly_stats[month_key]['count'] += 1
            monthly_stats[month_key]['total_days'] += duration

            if s.start_date <= today <= s.end_date:
                ongoing.append(s)
                node_stats[s.node_id]['ongoing'] = True
            elif s.start_date > today:
                upcoming.append(s)
            else:
                completed.append(s)

        avg_duration = round(total_downtime_days / len(schedules), 1) if schedules else 0
        nodes_currently_down = sum(1 for n in node_stats.values() if n['ongoing'])

        summary_html = f"""
        <div style="margin-bottom: 24px;">
            <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #f59e0b; padding-bottom: 8px;">📊 Maintenance Summary Statistics</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
                <tr>
                    <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Total Schedules</strong></td>
                    <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: #1e40af;">{len(schedules)}</td>
                    <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Nodes Currently Down</strong></td>
                    <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: {'#ef4444' if nodes_currently_down > 0 else '#16a34a'};">{nodes_currently_down}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Total Downtime Days</strong></td>
                    <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #7c3aed;">{total_downtime_days} days</td>
                    <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Average Duration</strong></td>
                    <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #0891b2;">{avg_duration} days</td>
                </tr>
                <tr>
                    <td style="padding: 8px 12px; background: #fef3c7; border: 1px solid #e2e8f0;"><strong>🔴 Ongoing</strong></td>
                    <td style="padding: 8px 12px; background: #fef3c7; border: 1px solid #e2e8f0; font-weight: 700; color: #f59e0b;">{len(ongoing)}</td>
                    <td style="padding: 8px 12px; background: #dbeafe; border: 1px solid #e2e8f0;"><strong>🔵 Upcoming</strong></td>
                    <td style="padding: 8px 12px; background: #dbeafe; border: 1px solid #e2e8f0; font-weight: 700; color: #3b82f6;">{len(upcoming)}</td>
                </tr>
                <tr>
                    <td style="padding: 8px 12px; background: #f1f5f9; border: 1px solid #e2e8f0;"><strong>✅ Completed</strong></td>
                    <td style="padding: 8px 12px; background: #f1f5f9; border: 1px solid #e2e8f0; font-weight: 700; color: #64748b;">{len(completed)}</td>
                    <td style="padding: 8px 12px; background: #f1f5f9; border: 1px solid #e2e8f0;"><strong>Unique Nodes Affected</strong></td>
                    <td style="padding: 8px 12px; background: #f1f5f9; border: 1px solid #e2e8f0; font-weight: 700; color: #1e40af;">{len(node_stats)}</td>
                </tr>
            </table>
        </div>
        """

        sorted_nodes = sorted(node_stats.items(), key=lambda x: x[1]['total_days'], reverse=True)
        node_html = """
        <div style="margin-bottom: 24px;">
            <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #7c3aed; padding-bottom: 8px;">🏭 Node Impact Analysis</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white;">
                        <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Node ID</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Maintenance Events</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Total Downtime</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Avg per Event</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Current Status</th>
                    </tr>
                </thead>
                <tbody>
        """
        for i, (node_id, stats) in enumerate(sorted_nodes):
            bg = '#f8fafc' if i % 2 == 0 else '#ffffff'
            avg_per_event = round(stats['total_days'] / stats['count'], 1) if stats['count'] > 0 else 0
            status = '<span style="background: #fef3c7; color: #d97706; padding: 2px 8px; border-radius: 4px; font-weight: 600;">🔴 DOWN</span>' if stats['ongoing'] else '<span style="background: #dcfce7; color: #16a34a; padding: 2px 8px; border-radius: 4px; font-weight: 600;">🟢 ACTIVE</span>'
            node_html += f"""
                <tr style="background: {bg};">
                    <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">{node_id}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{stats['count']}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #7c3aed;">{stats['total_days']} days</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{avg_per_event} days</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{status}</td>
                </tr>
            """
        node_html += "</tbody></table></div>"

        sorted_reasons = sorted(reason_stats.items(), key=lambda x: x[1], reverse=True)
        reason_html = """
        <div style="margin-bottom: 24px;">
            <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #0891b2; padding-bottom: 8px;">📝 Maintenance Reason Distribution</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #0891b2, #06b6d4); color: white;">
                        <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Reason</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Count</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Percentage</th>
                    </tr>
                </thead>
                <tbody>
        """
        for i, (reason, count) in enumerate(sorted_reasons):
            bg = '#f8fafc' if i % 2 == 0 else '#ffffff'
            pct = round((count / len(schedules)) * 100, 1) if schedules else 0
            reason_html += f"""
                <tr style="background: {bg};">
                    <td style="padding: 8px; border: 1px solid #e2e8f0;">{reason}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">{count}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{pct}%</td>
                </tr>
            """
        reason_html += "</tbody></table></div>"

        def build_schedule_table(schedule_list, header_color, title, emoji):
            if not schedule_list:
                return f"<p style='color: #64748b; font-style: italic;'>No {title.lower()} schedules.</p>"

            rows = ""
            for i, s in enumerate(schedule_list):
                bg_color = '#f8fafc' if i % 2 == 0 else '#ffffff'
                duration = (s.end_date - s.start_date).days + 1

                if s.start_date > today:
                    days_info = f"<span style='color: #3b82f6; font-weight: 600;'>Starts in {(s.start_date - today).days} days</span>"
                elif s.end_date >= today:
                    days_left = (s.end_date - today).days
                    days_info = f"<span style='color: #f59e0b; font-weight: 600;'>{days_left} days left</span>"
                else:
                    days_ago = (today - s.end_date).days
                    days_info = f"<span style='color: #64748b;'>Ended {days_ago} days ago</span>"

                rows += f"""<tr style='background: {bg_color};'>
                    <td style='border: 1px solid #e2e8f0; padding: 10px; font-weight: 600;'>{s.node_id}</td>
                    <td style='border: 1px solid #e2e8f0; padding: 10px;'>{s.start_date.strftime('%d %b %Y')}</td>
                    <td style='border: 1px solid #e2e8f0; padding: 10px;'>{s.end_date.strftime('%d %b %Y')}</td>
                    <td style='border: 1px solid #e2e8f0; padding: 10px; text-align: center; font-weight: 600;'>{duration} days</td>
                    <td style='border: 1px solid #e2e8f0; padding: 10px;'>{s.reason or 'N/A'}</td>
                    <td style='border: 1px solid #e2e8f0; padding: 10px;'>{days_info}</td>
                </tr>"""

            return f"""
            <div style="margin-bottom: 24px;">
                <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid {header_color.split(',')[0].replace('linear-gradient(135deg, ', '')}; padding-bottom: 8px;">{emoji} {title} ({len(schedule_list)})</h3>
                <table style='border-collapse: collapse; width: 100%; font-size: 12px;'>
                <thead><tr style='background: {header_color}; color: white;'>
                    <th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>Node ID</th>
                    <th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>Start Date</th>
                    <th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>End Date</th>
                    <th style='border: 1px solid #ddd; padding: 10px; text-align: center;'>Duration</th>
                    <th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>Reason</th>
                    <th style='border: 1px solid #ddd; padding: 10px; text-align: left;'>Status</th>
                </tr></thead>
                <tbody>{rows}</tbody>
                </table>
            </div>
            """

        ongoing_table = build_schedule_table(ongoing, 'linear-gradient(135deg, #f59e0b, #d97706)', 'Ongoing Maintenance', '🔴')
        upcoming_table = build_schedule_table(upcoming, 'linear-gradient(135deg, #3b82f6, #1d4ed8)', 'Upcoming Maintenance', '🔵')
        completed_table = build_schedule_table(completed[-50:], 'linear-gradient(135deg, #64748b, #475569)', 'Completed Maintenance (Last 50)', '✅')

        email_content = f"""
            <h2 style="color: #0f172a; margin-bottom: 20px;">Node Downtime Management Report - Detailed Analysis</h2>
            <div style="margin-bottom: 20px; color: #64748b; font-size: 13px; background: #f8fafc; padding: 16px; border-radius: 8px;">
                <p style="margin: 4px 0;"><strong>Report Date:</strong> {today.strftime('%d %B %Y')}</p>
                <p style="margin: 4px 0;"><strong>Requested by:</strong> {current_user.username}</p>
                <p style="margin: 4px 0;"><strong>Generated:</strong> {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}</p>
            </div>
            {summary_html}
            {node_html}
            {reason_html}
            {ongoing_table}
            {upcoming_table}
            {completed_table}
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
                    <p><a href="{FRONTEND_URL}/strategic-planning" style="color: #3b82f6;">View Strategic Planning</a></p>
                    <p style="font-size: 11px; margin-top: 12px;">© {datetime.now().year} Deevia Software India Pvt Ltd. All rights reserved.</p>
                </div>
            </div>
        </body>
        </html>
        """

        email_sent = email_service._send_email(
            to_email=data.email,
            subject=f"HMD System - Maintenance Schedule Report (Detailed) - {today.strftime('%d %B %Y')}",
            html_content=html,
            text_content=f"Maintenance Schedule Report (Detailed) - {len(schedules)} schedules, {len(ongoing)} ongoing, {len(upcoming)} upcoming, Total downtime: {total_downtime_days} days."
        )

        if not email_sent:
            raise HTTPException(status_code=500, detail="Failed to send email. Please check SMTP configuration.")

        logger.info(f"Maintenance schedule email sent to {data.email} by {current_user.username}")

        return {"status": "success", "message": f"Maintenance schedule sent to {data.email}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending maintenance email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")
