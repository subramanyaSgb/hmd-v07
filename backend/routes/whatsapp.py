
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from typing import Optional, List
from pydantic import BaseModel
from datetime import datetime

from ..database.engine import get_db
from ..database.models import WhatsAppGroupMapping, WhatsAppMessageLog, NotificationPreference, User, SystemConfig
from ..logger import logger
from ..utils.security import get_current_user, require_roles
from ..utils.activity_logger import log_activity

router = APIRouter(prefix="/api/whatsapp", tags=["whatsapp"])

CACHE_TTL_WHATSAPP = 30              

class GroupMappingCreate(BaseModel):
    group_jid: str
    group_name: str
    mapping_type: str                                          
    node_id: Optional[str] = None
    language_code: str = "en"
    is_active: bool = True
    notifications_enabled: bool = True
    notify_trip_assigned: bool = True
    notify_trip_started: bool = True
    notify_trip_completed: bool = True
    notify_deviations: bool = True
    notify_daily_report: bool = True

class GroupMappingUpdate(BaseModel):
    group_name: Optional[str] = None
    language_code: Optional[str] = None
    is_active: Optional[bool] = None
    notifications_enabled: Optional[bool] = None
    notify_trip_assigned: Optional[bool] = None
    notify_trip_started: Optional[bool] = None
    notify_trip_completed: Optional[bool] = None
    notify_deviations: Optional[bool] = None
    notify_daily_report: Optional[bool] = None

class WhatsAppConfigUpdate(BaseModel):
    configs: List[dict]                                                                

class SendTestMessage(BaseModel):
    recipient_type: str                           
    recipient_id: str                               
    message: str

class UserWhatsAppPreferences(BaseModel):
    whatsapp_enabled: bool = False
    whatsapp_phone: Optional[str] = None
    whatsapp_language: str = "en"
    whatsapp_trip_alerts: bool = True
    whatsapp_daily_report: bool = True
    whatsapp_deviation_alerts: bool = True

WHATSAPP_CONFIG_KEYS = {
    "WHATSAPP_ENABLED": {'default': 'false', 'description': 'Enable WhatsApp notifications system-wide'},
    "WHATSAPP_SERVICE_URL": {'default': 'http://localhost:3002', 'description': 'URL of the WhatsApp Node.js microservice'},
    "WHATSAPP_DAILY_REPORT_TIME": {'default': '18:00', 'description': 'Time to send daily reports (24-hour format)'},
    "WHATSAPP_RATE_LIMIT": {'default': '20', 'description': 'Maximum messages per minute'},
    "WHATSAPP_DEFAULT_LANGUAGE": {'default': 'en', 'description': 'Default language for messages'}
}

def get_whatsapp_config(db: Session, key: str) -> str:
    config = db.query(SystemConfig).filter(SystemConfig.config_key == key).first()
    if config:
        return config.config_value
    return WHATSAPP_CONFIG_KEYS.get(key, {}).get("default", "")

def is_whatsapp_enabled(db: Session) -> bool:
    return get_whatsapp_config(db, "WHATSAPP_ENABLED").lower() == "true"

@router.get("/status")
async def get_whatsapp_status(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    from ..utils.whatsapp_service import whatsapp_service

    try:
        status = await whatsapp_service.get_status()
        enabled = is_whatsapp_enabled(db)

        return {'enabled': enabled, 'service': status}
    except Exception as e:
        logger.error(f"Failed to get WhatsApp status: {e}")
        return {
            "enabled": is_whatsapp_enabled(db),
            "service": {
                "connected": False,
                "state": "error",
                "error": str(e)
            }
        }

@router.get("/qr")
async def get_qr_code(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    from ..utils.whatsapp_service import whatsapp_service

    try:
        result = await whatsapp_service.get_qr_code()

        if not result.get("qrCode") and not result.get("connected"):
            state = result.get("state")
            if state in ("disconnected", "error", None):
                logger.info(f"WhatsApp bridge state={state}, triggering reconnect")
                await whatsapp_service.reconnect()
                result = await whatsapp_service.get_qr_code()

        return result
    except Exception as e:
        logger.error(f"Failed to get QR code: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.post("/logout")
async def logout_whatsapp(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    from ..utils.whatsapp_service import whatsapp_service

    try:
        result = await whatsapp_service.logout()

        log_activity(
            db, current_user.username, "WHATSAPP_LOGOUT",
            details="WhatsApp session disconnected",
            entity_type="whatsapp"
        )

        return result
    except Exception as e:
        logger.error(f"Failed to logout WhatsApp: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/groups")
async def get_available_groups(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    from ..utils.whatsapp_service import whatsapp_service

    try:
        result = await whatsapp_service.get_groups()
        return result
    except Exception as e:
        logger.error(f"Failed to get WhatsApp groups: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/group-mappings")
async def get_group_mappings(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    try:
        mappings = db.query(WhatsAppGroupMapping).order_by(
            WhatsAppGroupMapping.mapping_type,
            WhatsAppGroupMapping.node_id
        ).all()

        return {
            "count": len(mappings),
            "mappings": [
                {
                    "id": m.id,
                    "group_jid": m.group_jid,
                    "group_name": m.group_name,
                    "mapping_type": m.mapping_type,
                    "node_id": m.node_id,
                    "language_code": m.language_code,
                    "is_active": m.is_active,
                    "notifications_enabled": m.notifications_enabled,
                    "notify_trip_assigned": m.notify_trip_assigned,
                    "notify_trip_started": m.notify_trip_started,
                    "notify_trip_completed": m.notify_trip_completed,
                    "notify_deviations": m.notify_deviations,
                    "notify_daily_report": m.notify_daily_report,
                    "created_at": m.created_at.isoformat() if m.created_at else None,
                    "last_updated": m.last_updated.isoformat() if m.last_updated else None
                }
                for m in mappings
            ]
        }
    except SQLAlchemyError as e:
        logger.error(f"Database error getting group mappings: {e}")
        raise HTTPException(status_code=500, detail="Failed to retrieve group mappings")

@router.post("/group-mappings")
async def create_group_mapping(
    data: GroupMappingCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    try:
                                                            
        existing = db.query(WhatsAppGroupMapping).filter(
            WhatsAppGroupMapping.group_jid == data.group_jid
        ).first()

        if existing:
                                     
            for field, value in data.dict().items():
                setattr(existing, field, value)
            db.commit()
            db.refresh(existing)

            log_activity(
                db, current_user.username, "WHATSAPP_GROUP_MAPPING_UPDATED",
                details=f"Updated group mapping for {data.group_name}",
                entity_type="whatsapp_group",
                entity_id=str(existing.id)
            )

            return {"message": "Group mapping updated", "id": existing.id}
        else:
                                
            mapping = WhatsAppGroupMapping(**data.dict())
            db.add(mapping)
            db.commit()
            db.refresh(mapping)

            log_activity(
                db, current_user.username, "WHATSAPP_GROUP_MAPPING_CREATED",
                details=f"Created group mapping for {data.group_name}",
                entity_type="whatsapp_group",
                entity_id=str(mapping.id)
            )

            return {"message": "Group mapping created", "id": mapping.id}

    except SQLAlchemyError as e:
        logger.error(f"Database error creating group mapping: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create group mapping")

@router.put("/group-mappings/{mapping_id}")
async def update_group_mapping(
    mapping_id: int,
    data: GroupMappingUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    try:
        mapping = db.query(WhatsAppGroupMapping).filter(
            WhatsAppGroupMapping.id == mapping_id
        ).first()

        if not mapping:
            raise HTTPException(status_code=404, detail="Group mapping not found")

        update_data = data.dict(exclude_unset=True)
        for field, value in update_data.items():
            setattr(mapping, field, value)

        db.commit()

        log_activity(
            db, current_user.username, "WHATSAPP_GROUP_MAPPING_UPDATED",
            details=f"Updated group mapping {mapping_id}",
            entity_type="whatsapp_group",
            entity_id=str(mapping_id)
        )

        return {"message": "Group mapping updated"}

    except SQLAlchemyError as e:
        logger.error(f"Database error updating group mapping: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update group mapping")

@router.delete("/group-mappings/{mapping_id}")
async def delete_group_mapping(
    mapping_id: int,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    try:
        mapping = db.query(WhatsAppGroupMapping).filter(
            WhatsAppGroupMapping.id == mapping_id
        ).first()

        if not mapping:
            raise HTTPException(status_code=404, detail="Group mapping not found")

        group_name = mapping.group_name
        db.delete(mapping)
        db.commit()

        log_activity(
            db, current_user.username, "WHATSAPP_GROUP_MAPPING_DELETED",
            details=f"Deleted group mapping for {group_name}",
            entity_type="whatsapp_group",
            entity_id=str(mapping_id)
        )

        return {"message": "Group mapping deleted"}

    except SQLAlchemyError as e:
        logger.error(f"Database error deleting group mapping: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete group mapping")

@router.get("/config")
async def get_whatsapp_config_all(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    configs = []
    for key, info in WHATSAPP_CONFIG_KEYS.items():
        db_config = db.query(SystemConfig).filter(SystemConfig.config_key == key).first()
        configs.append({
            "config_key": key,
            "config_value": db_config.config_value if db_config else info["default"],
            "default_value": info["default"],
            "description": info["description"]
        })

    return {"configs": configs}

@router.post("/config/bulk")
async def update_whatsapp_config_bulk(
    data: WhatsAppConfigUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    try:
        updated_keys = []

        for config_item in data.configs:
            key = config_item.get("config_key")
            value = config_item.get("config_value")

            if key not in WHATSAPP_CONFIG_KEYS:
                continue

            existing = db.query(SystemConfig).filter(SystemConfig.config_key == key).first()
            if existing:
                existing.config_value = value
            else:
                new_config = SystemConfig(
                    config_key=key,
                    config_value=value,
                    description=WHATSAPP_CONFIG_KEYS[key]["description"]
                )
                db.add(new_config)

            updated_keys.append(key)

        db.commit()

        if "WHATSAPP_DAILY_REPORT_TIME" in updated_keys:
            try:
                from ..main import schedule_daily_report
                schedule_daily_report()
                logger.info("Daily report rescheduled after config update")
            except Exception as e:
                logger.warning(f"Could not reschedule daily report: {e}")

        log_activity(
            db, current_user.username, "WHATSAPP_CONFIG_UPDATED",
            details=f"Updated WhatsApp config: {', '.join(updated_keys)}",
            entity_type="whatsapp_config"
        )

        return {"message": "Configuration updated", "updated_keys": updated_keys}

    except SQLAlchemyError as e:
        logger.error(f"Database error updating WhatsApp config: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update configuration")

@router.get("/user-preferences")
async def get_user_whatsapp_preferences(
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")

    prefs = db.query(NotificationPreference).filter(
        NotificationPreference.user_id == user_id
    ).first()

    if not prefs:
        return {
            "whatsapp_enabled": False,
            "whatsapp_phone": None,
            "whatsapp_language": "en",
            "whatsapp_trip_alerts": True,
            "whatsapp_daily_report": True,
            "whatsapp_deviation_alerts": True
        }

    return {
        "whatsapp_enabled": prefs.whatsapp_enabled,
        "whatsapp_phone": prefs.whatsapp_phone,
        "whatsapp_language": prefs.whatsapp_language,
        "whatsapp_trip_alerts": prefs.whatsapp_trip_alerts,
        "whatsapp_daily_report": prefs.whatsapp_daily_report,
        "whatsapp_deviation_alerts": prefs.whatsapp_deviation_alerts
    }

@router.put("/user-preferences")
async def update_user_whatsapp_preferences(
    data: UserWhatsAppPreferences,
    db: Session = Depends(get_db),
    current_user: dict = Depends(get_current_user)
):
    user_id = current_user.get("user_id")

    try:
        prefs = db.query(NotificationPreference).filter(
            NotificationPreference.user_id == user_id
        ).first()

        if not prefs:
                                          
            prefs = NotificationPreference(user_id=user_id)
            db.add(prefs)

        prefs.whatsapp_enabled = data.whatsapp_enabled
        prefs.whatsapp_phone = data.whatsapp_phone
        prefs.whatsapp_language = data.whatsapp_language
        prefs.whatsapp_trip_alerts = data.whatsapp_trip_alerts
        prefs.whatsapp_daily_report = data.whatsapp_daily_report
        prefs.whatsapp_deviation_alerts = data.whatsapp_deviation_alerts

        db.commit()

        log_activity(
            db, current_user.username, "WHATSAPP_PREFERENCES_UPDATED",
            details="Updated WhatsApp notification preferences",
            entity_type="user_preferences",
            entity_id=user_id
        )

        return {"message": "Preferences updated"}

    except SQLAlchemyError as e:
        logger.error(f"Database error updating WhatsApp preferences: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update preferences")

@router.post("/send-test")
async def send_test_message(
    data: SendTestMessage,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    from ..utils.whatsapp_service import whatsapp_service

    if not is_whatsapp_enabled(db):
        raise HTTPException(status_code=400, detail="WhatsApp is not enabled")

    try:
        if data.recipient_type == "group":
            result = await whatsapp_service.send_group_message(
                data.recipient_id,
                data.message
            )
        else:
            result = await whatsapp_service.send_message(
                data.recipient_id,
                data.message
            )

        log_entry = WhatsAppMessageLog(
            recipient_type=data.recipient_type,
            recipient_id=data.recipient_id,
            message_type="test",
            message_content=data.message,
            status="sent" if result.get("success") else "failed",
            error_message=result.get("error") if not result.get("success") else None,
            sent_at=datetime.utcnow() if result.get("success") else None
        )
        db.add(log_entry)
        db.commit()

        log_activity(
            db, current_user.username, "WHATSAPP_TEST_MESSAGE_SENT",
            details=f"Sent test message to {data.recipient_type}: {data.recipient_id}",
            entity_type="whatsapp_message"
        )

        return result

    except Exception as e:
        logger.error(f"Failed to send test message: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@router.post("/daily-report/send")
async def trigger_daily_report(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    from ..utils.whatsapp_service import whatsapp_service

    if not is_whatsapp_enabled(db):
        raise HTTPException(status_code=400, detail="WhatsApp is not enabled")

    try:
        result = await whatsapp_service.send_daily_report(db)

        log_activity(
            db, current_user.username, "WHATSAPP_DAILY_REPORT_TRIGGERED",
            details="Manually triggered daily report",
            entity_type="whatsapp_report"
        )

        return result
    except Exception as e:
        logger.error(f"Failed to send daily report: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/daily-report/schedule")
async def get_daily_report_schedule(
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles(["admin"]))
):
    from ..main import scheduler

    try:
        job = scheduler.get_job("whatsapp_daily_report")

        config = db.query(SystemConfig).filter(
            SystemConfig.config_key == "WHATSAPP_DAILY_REPORT_TIME"
        ).first()

        configured_time = config.config_value if config else "18:00"

        if job:
            next_run = job.next_run_time
            return {
                "scheduled": True,
                "configured_time": configured_time,
                "next_run": next_run.isoformat() if next_run else None,
                "job_id": job.id,
                "job_name": job.name
            }
        else:
            return {'scheduled': False, 'configured_time': configured_time, 'next_run': None, 'message': 'Daily report job not scheduled'}
    except Exception as e:
        logger.error(f"Error getting schedule info: {e}")
        raise HTTPException(status_code=500, detail=str(e))
