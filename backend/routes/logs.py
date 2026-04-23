from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func, and_, distinct
from sqlalchemy.exc import SQLAlchemyError
from datetime import datetime, timedelta, date
from pydantic import BaseModel, EmailStr
from typing import Optional
from ..database.engine import get_db
from ..database.models import UserActivity, User
from ..utils.security import get_current_user_required, get_admin_user, require_roles
from ..logger import logger

router = APIRouter(prefix="/api/activity-logs", tags=["logs"])

@router.get("")
async def get_activity_logs(
    page: int = 1,
    page_size: int = 20,
    username: str = None,
    action: str = None,
    entity_type: str = None,
    date_from: str = None,
    date_to: str = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "trs"))
):
    query = db.query(UserActivity)

    if username:
        query = query.filter(UserActivity.username.ilike(f"%{username}%"))
    if action:
        query = query.filter(UserActivity.action.ilike(f"%{action}%"))
    if entity_type:
        query = query.filter(UserActivity.entity_type == entity_type)
    if date_from:
        query = query.filter(UserActivity.timestamp >= date_from)
    if date_to:
        query = query.filter(UserActivity.timestamp <= date_to)

    total = query.count()
    logs = query.order_by(UserActivity.timestamp.desc())\
                .offset((page - 1) * page_size)\
                .limit(page_size).all()

    formatted_logs = []
    for log in logs:
        formatted_logs.append({
            "id": log.id,
            "timestamp": log.timestamp.isoformat() if log.timestamp else None,
            "username": log.username,
            "user_id": log.user_id,
            "user_role": getattr(log, 'user_role', None),
            "action": log.action,
            "entity_type": getattr(log, 'entity_type', None),
            "entity_id": getattr(log, 'entity_id', None),
            "details": log.details,
            "old_value": getattr(log, 'old_value', None),
            "new_value": getattr(log, 'new_value', None),
            "ip_address": log.ip_address,
            "user_agent": getattr(log, 'user_agent', None)
        })

    return {'logs': formatted_logs, 'total': total, 'page': page, 'page_size': page_size}

@router.get("/summary")
async def get_activity_summary(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    today = date.today()
    yesterday = today - timedelta(days=1)

    today_count = db.query(UserActivity).filter(
        func.date(UserActivity.timestamp) == today
    ).count()

    yesterday_count = db.query(UserActivity).filter(
        func.date(UserActivity.timestamp) == yesterday
    ).count()

    active_users = db.query(func.count(func.distinct(UserActivity.username))).filter(
        func.date(UserActivity.timestamp) == today
    ).scalar()

    critical_actions_list = [
        'DELETE',
        'FLEET_ASSET_DECOMMISSIONED',
        'USER_LOGIN_FAILED',
        'LOCATION_DELETED',
        'USER_DELETED',
        'BREAKDOWN_INTERVENTION',
        'CONFIG_CHANGED'
    ]

    critical_count = db.query(UserActivity).filter(
        and_(
            func.date(UserActivity.timestamp) == today,
            UserActivity.action.in_(critical_actions_list)
        )
    ).count()

    action_dist = db.query(
        UserActivity.action,
        func.count(UserActivity.id).label('count')
    ).filter(
        func.date(UserActivity.timestamp) == today
    ).group_by(UserActivity.action).all()

    entity_dist = []
    try:
        entity_dist = db.query(
            UserActivity.entity_type,
            func.count(UserActivity.id).label('count')
        ).filter(
            and_(
                func.date(UserActivity.timestamp) == today,
                UserActivity.entity_type.isnot(None)
            )
        ).group_by(UserActivity.entity_type).all()
    except SQLAlchemyError:
        pass                              

    hourly = db.query(
        func.extract('hour', UserActivity.timestamp).label('hour'),
        func.count(UserActivity.id).label('count')
    ).filter(
        func.date(UserActivity.timestamp) == today
    ).group_by('hour').all()

    system_health = 100.0
    if today_count > 0:
        health_ratio = 1.0 - (critical_count / today_count)
        system_health = 95.0 + (health_ratio * 5.0)
        system_health = min(100.0, max(85.0, system_health))

    return {
        "today_count": today_count,
        "yesterday_count": yesterday_count,
        "trend": ((today_count - yesterday_count) / yesterday_count * 100) if yesterday_count > 0 else 0,
        "active_users": active_users,
        "critical_actions": critical_count,
        "system_health": round(system_health, 1),
        "action_distribution": [{"action": a[0], "count": a[1]} for a in action_dist],
        "entity_distribution": [{"entity_type": e[0], "count": e[1]} for e in entity_dist if e[0]],
        "hourly_activity": [{"hour": int(h[0]), "count": h[1]} for h in hourly]
    }

@router.get("/entity-types")
async def get_entity_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "trs"))
):
    try:
        entity_types = db.query(distinct(UserActivity.entity_type))\
            .filter(UserActivity.entity_type.isnot(None))\
            .all()
        return {"entity_types": [et[0] for et in entity_types if et[0]]}
    except SQLAlchemyError:
        return {"entity_types": ["trip", "plan", "config", "user", "fleet", "location"]}

@router.get("/actions")
async def get_action_types(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "trs"))
):
    actions = db.query(distinct(UserActivity.action))\
        .filter(UserActivity.action.isnot(None))\
        .all()
    return {"actions": [a[0] for a in actions if a[0]]}

@router.get("/export")
async def export_activity_logs(
    date_from: str = None,
    date_to: str = None,
    entity_type: str = None,
    db: Session = Depends(get_db),
    admin_user: User = Depends(get_admin_user)
):
    from fastapi.responses import StreamingResponse
    import io
    import csv

    query = db.query(UserActivity)

    if date_from:
        query = query.filter(UserActivity.timestamp >= date_from)
    if date_to:
        query = query.filter(UserActivity.timestamp <= date_to)
    if entity_type:
        try:
            query = query.filter(UserActivity.entity_type == entity_type)
        except SQLAlchemyError:
            pass

    logs = query.order_by(UserActivity.timestamp.desc()).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        'Timestamp', 'Username', 'User Role', 'Action',
        'Entity Type', 'Entity ID', 'Details',
        'Old Value', 'New Value', 'IP Address'
    ])

    for log in logs:
        writer.writerow([
            log.timestamp.strftime('%Y-%m-%d %H:%M:%S') if log.timestamp else '',
            log.username or '',
            getattr(log, 'user_role', '') or '',
            log.action or '',
            getattr(log, 'entity_type', '') or '',
            getattr(log, 'entity_id', '') or '',
            log.details or '',
            getattr(log, 'old_value', '') or '',
            getattr(log, 'new_value', '') or '',
            log.ip_address or ''
        ])

    output.seek(0)

    filename = f"audit_trail_{date.today().isoformat()}.csv"

    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": f"attachment; filename={filename}"}
    )

@router.get("/{log_id}")
async def get_activity_log_detail(
    log_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
    log = db.query(UserActivity).filter(UserActivity.id == log_id).first()

    if not log:
        return {"error": "Log entry not found"}

    return {
        "id": log.id,
        "timestamp": log.timestamp.isoformat() if log.timestamp else None,
        "username": log.username,
        "user_id": log.user_id,
        "user_role": getattr(log, 'user_role', None),
        "action": log.action,
        "entity_type": getattr(log, 'entity_type', None),
        "entity_id": getattr(log, 'entity_id', None),
        "details": log.details,
        "old_value": getattr(log, 'old_value', None),
        "new_value": getattr(log, 'new_value', None),
        "ip_address": log.ip_address,
        "user_agent": getattr(log, 'user_agent', None)
    }

class ActivityLogsEmailRequest(BaseModel):
    email: EmailStr
    username: Optional[str] = None
    action: Optional[str] = None
    entity_type: Optional[str] = None
    date_from: Optional[str] = None
    date_to: Optional[str] = None

@router.post("/email")
async def email_activity_logs(
    data: ActivityLogsEmailRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_admin_user)
):
    from ..utils.email_service import email_service, FRONTEND_URL
    from ..utils.activity_logger import log_activity

    query = db.query(UserActivity)

    if data.username:
        query = query.filter(UserActivity.username.ilike(f"%{data.username}%"))
    if data.action:
        query = query.filter(UserActivity.action.ilike(f"%{data.action}%"))
    if data.entity_type:
        query = query.filter(UserActivity.entity_type == data.entity_type)
    if data.date_from:
        query = query.filter(UserActivity.timestamp >= data.date_from)
    if data.date_to:
        query = query.filter(UserActivity.timestamp <= data.date_to)

    logs = query.order_by(UserActivity.timestamp.desc()).limit(500).all()

    date_range_str = f"{data.date_from or 'All'} to {data.date_to or 'All'}"

    total_logs = len(logs)
    unique_users = set()
    action_counts = {}
    user_counts = {}
    entity_counts = {}
    hourly_counts = {i: 0 for i in range(24)}
    critical_actions = []

    critical_keywords = ['DELETE', 'FAILED', 'ERROR', 'LOGOUT', 'PASSWORD', 'SECURITY', 'LOCKOUT']

    for log in logs:
                      
        if log.username:
            unique_users.add(log.username)
            user_counts[log.username] = user_counts.get(log.username, 0) + 1

        if log.action:
            action_counts[log.action] = action_counts.get(log.action, 0) + 1
                                        
            if any(kw in log.action.upper() for kw in critical_keywords):
                critical_actions.append(log)

        if log.entity_type:
            entity_counts[log.entity_type] = entity_counts.get(log.entity_type, 0) + 1

        if log.timestamp:
            hourly_counts[log.timestamp.hour] += 1

    sorted_actions = sorted(action_counts.items(), key=lambda x: x[1], reverse=True)
    sorted_users = sorted(user_counts.items(), key=lambda x: x[1], reverse=True)[:10]
    sorted_entities = sorted(entity_counts.items(), key=lambda x: x[1], reverse=True)

    peak_hour = max(hourly_counts, key=hourly_counts.get) if hourly_counts else 0
    peak_count = hourly_counts.get(peak_hour, 0)

    summary_html = f"""
    <div style="margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">📊 Summary Statistics</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Total Activities</strong></td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: #1e40af;">{total_logs}</td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Unique Users</strong></td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: #7c3aed;">{len(unique_users)}</td>
            </tr>
            <tr>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Unique Actions</strong></td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: #0891b2;">{len(action_counts)}</td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0;"><strong>Critical Events</strong></td>
                <td style="padding: 8px 12px; border: 1px solid #e2e8f0; font-weight: 700; color: {'#ef4444' if len(critical_actions) > 0 else '#16a34a'};">{len(critical_actions)}</td>
            </tr>
            <tr>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Peak Activity Hour</strong></td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: #f59e0b;">{peak_hour:02d}:00 - {(peak_hour+1)%24:02d}:00</td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0;"><strong>Peak Hour Count</strong></td>
                <td style="padding: 8px 12px; background: #f8fafc; border: 1px solid #e2e8f0; font-weight: 700; color: #f59e0b;">{peak_count} activities</td>
            </tr>
        </table>
    </div>
    """

    action_html = """
    <div style="margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">🎯 Activity Distribution by Action</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: linear-gradient(135deg, #3b82f6, #06b6d4); color: white;">
                    <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Action Type</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Count</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Percentage</th>
                    <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Distribution</th>
                </tr>
            </thead>
            <tbody>
    """
    for i, (action, count) in enumerate(sorted_actions[:15]):
        bg = '#f8fafc' if i % 2 == 0 else '#ffffff'
        pct = round((count / total_logs) * 100, 1) if total_logs > 0 else 0
        bar_width = min(pct * 2, 100)
        is_critical = any(kw in action.upper() for kw in critical_keywords)
        bar_color = '#ef4444' if is_critical else '#3b82f6'
        action_html += f"""
            <tr style="background: {bg};">
                <td style="padding: 8px; border: 1px solid #e2e8f0;"><span style="background: {'#fee2e2' if is_critical else '#dbeafe'}; color: {'#dc2626' if is_critical else '#1e40af'}; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 600;">{action}</span></td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">{count}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{pct}%</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0;"><div style="background: #e2e8f0; border-radius: 4px; height: 16px; width: 100%;"><div style="background: {bar_color}; height: 100%; width: {bar_width}%; border-radius: 4px;"></div></div></td>
            </tr>
        """
    action_html += "</tbody></table></div>"

    user_html = """
    <div style="margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #7c3aed; padding-bottom: 8px;">👤 Top 10 Active Users</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
            <thead>
                <tr style="background: linear-gradient(135deg, #7c3aed, #a855f7); color: white;">
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Rank</th>
                    <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Username</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Activities</th>
                    <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Percentage</th>
                </tr>
            </thead>
            <tbody>
    """
    for i, (username, count) in enumerate(sorted_users):
        bg = '#f8fafc' if i % 2 == 0 else '#ffffff'
        pct = round((count / total_logs) * 100, 1) if total_logs > 0 else 0
        user_html += f"""
            <tr style="background: {bg};">
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 700; color: #7c3aed;">#{i+1}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">{username}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600; color: #1e40af;">{count}</td>
                <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{pct}%</td>
            </tr>
        """
    user_html += "</tbody></table></div>"

    entity_html = ""
    if entity_counts:
        entity_html = """
        <div style="margin-bottom: 24px;">
            <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #0891b2; padding-bottom: 8px;">📦 Activity by Entity Type</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 12px;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #0891b2, #06b6d4); color: white;">
                        <th style="padding: 10px; text-align: left; border: 1px solid #ddd;">Entity Type</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Count</th>
                        <th style="padding: 10px; text-align: center; border: 1px solid #ddd;">Percentage</th>
                    </tr>
                </thead>
                <tbody>
        """
        for i, (entity, count) in enumerate(sorted_entities):
            bg = '#f8fafc' if i % 2 == 0 else '#ffffff'
            pct = round((count / total_logs) * 100, 1) if total_logs > 0 else 0
            entity_html += f"""
                <tr style="background: {bg};">
                    <td style="padding: 8px; border: 1px solid #e2e8f0; font-weight: 600;">{entity}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center; font-weight: 600;">{count}</td>
                    <td style="padding: 8px; border: 1px solid #e2e8f0; text-align: center;">{pct}%</td>
                </tr>
            """
        entity_html += "</tbody></table></div>"

    critical_html = ""
    if critical_actions:
        critical_html = """
        <div style="margin-bottom: 24px;">
            <h3 style="color: #dc2626; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #ef4444; padding-bottom: 8px;">⚠️ Critical/Security Events</h3>
            <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
                <thead>
                    <tr style="background: linear-gradient(135deg, #dc2626, #ef4444); color: white;">
                        <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Timestamp</th>
                        <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">User</th>
                        <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Action</th>
                        <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Details</th>
                        <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">IP</th>
                    </tr>
                </thead>
                <tbody>
        """
        for i, log in enumerate(critical_actions[:20]):
            bg = '#fef2f2' if i % 2 == 0 else '#fff'
            timestamp = log.timestamp.strftime("%Y-%m-%d %H:%M") if log.timestamp else "-"
            details = (log.details or "-")[:50] + "..." if log.details and len(log.details) > 50 else (log.details or "-")
            critical_html += f"""
                <tr style="background: {bg};">
                    <td style="padding: 6px; border: 1px solid #fecaca; font-size: 10px;">{timestamp}</td>
                    <td style="padding: 6px; border: 1px solid #fecaca; font-weight: 600;">{log.username}</td>
                    <td style="padding: 6px; border: 1px solid #fecaca;"><span style="background: #fee2e2; color: #dc2626; padding: 2px 6px; border-radius: 4px; font-size: 10px;">{log.action}</span></td>
                    <td style="padding: 6px; border: 1px solid #fecaca; font-size: 10px; color: #64748b;">{details}</td>
                    <td style="padding: 6px; border: 1px solid #fecaca; font-size: 10px;">{log.ip_address or '-'}</td>
                </tr>
            """
        critical_html += "</tbody></table></div>"

    logs_html = """
    <div style="margin-bottom: 24px;">
        <h3 style="color: #0f172a; margin-bottom: 16px; font-size: 16px; border-bottom: 2px solid #3b82f6; padding-bottom: 8px;">📋 Detailed Activity Logs</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 11px;">
            <thead>
                <tr style="background: linear-gradient(135deg, #3b82f6, #06b6d4); color: white;">
                    <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Timestamp</th>
                    <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">User</th>
                    <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Action</th>
                    <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">Details</th>
                    <th style="padding: 8px; text-align: left; border: 1px solid #ddd;">IP Address</th>
                </tr>
            </thead>
            <tbody>
    """

    for i, log in enumerate(logs[:200]):
        bg_color = '#f8fafc' if i % 2 == 0 else '#ffffff'
        timestamp = log.timestamp.strftime("%Y-%m-%d %H:%M:%S") if log.timestamp else "-"
        details = (log.details or "-")[:80] + "..." if log.details and len(log.details) > 80 else (log.details or "-")
        is_critical = any(kw in (log.action or '').upper() for kw in critical_keywords)

        logs_html += f"""
            <tr style="background: {bg_color};">
                <td style="padding: 6px; border: 1px solid #e2e8f0; font-size: 10px;">{timestamp}</td>
                <td style="padding: 6px; border: 1px solid #e2e8f0; font-weight: 600;">{log.username}</td>
                <td style="padding: 6px; border: 1px solid #e2e8f0;"><span style="background: {'#fee2e2' if is_critical else '#dbeafe'}; color: {'#dc2626' if is_critical else '#1e40af'}; padding: 2px 6px; border-radius: 4px; font-size: 10px;">{log.action}</span></td>
                <td style="padding: 6px; border: 1px solid #e2e8f0; font-size: 10px; color: #64748b;">{details}</td>
                <td style="padding: 6px; border: 1px solid #e2e8f0; font-size: 10px;">{log.ip_address or '-'}</td>
            </tr>
        """

    logs_html += "</tbody></table>"
    if len(logs) >= 200:
        logs_html += "<p style='color: #64748b; margin-top: 10px; font-size: 11px;'>Showing first 200 records. Export CSV for complete data.</p>"
    logs_html += "</div>"

    if not logs:
        logs_html = "<p style='color: #64748b;'>No activity logs found for the selected criteria.</p>"

    email_content = f"""
        <h2 style="color: #0f172a; margin-bottom: 20px;">Activity Logs Report - Detailed Analysis</h2>
        <div style="margin-bottom: 20px; color: #64748b; font-size: 13px; background: #f8fafc; padding: 16px; border-radius: 8px;">
            <p style="margin: 4px 0;"><strong>Generated:</strong> {datetime.now().strftime("%Y-%m-%d %H:%M:%S")}</p>
            <p style="margin: 4px 0;"><strong>Requested by:</strong> {current_user.username}</p>
            <p style="margin: 4px 0;"><strong>Date Range:</strong> {date_range_str}</p>
            <p style="margin: 4px 0;"><strong>Total Records:</strong> {len(logs)}</p>
        </div>
        {summary_html}
        {action_html}
        {user_html}
        {entity_html}
        {critical_html}
        {logs_html}
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
                <p><a href="{FRONTEND_URL}/audit-trail" style="color: #3b82f6;">View Audit Trail</a></p>
                <p class="footer-copyright">&copy; {datetime.now().year} Deevia Software India Pvt Ltd. All rights reserved.</p>
            </div>
        </div>
    </body>
    </html>
    """

    try:
        email_sent = email_service._send_email(
            to_email=data.email,
            subject="HMD System - Activity Logs Report (Detailed Analysis)",
            html_content=html,
            text_content=f"Activity Logs Report (Detailed) generated on {datetime.now().strftime('%Y-%m-%d %H:%M')} with {len(logs)} records including action distribution, user activity breakdown, and critical events."
        )

        if not email_sent:
            raise HTTPException(status_code=500, detail="Failed to send email. Please check SMTP configuration.")

        log_activity(
            db, current_user.username, "ACTIVITY_LOGS_EMAILED",
            details=f"Activity logs emailed to {data.email} with {len(logs)} records",
            current_user=current_user
        )

        logger.info(f"Activity logs emailed by {current_user.username} to {data.email}")
        return {"status": "success", "message": f"Activity logs sent to {data.email}"}

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Error sending activity logs email: {e}")
        raise HTTPException(status_code=500, detail="Failed to send email")
