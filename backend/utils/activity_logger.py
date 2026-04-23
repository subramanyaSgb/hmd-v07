
import json
from typing import Any, Dict, Optional, Union
from contextlib import contextmanager
from sqlalchemy.orm import Session
from ..database.models import UserActivity, User
from ..logger import logger
from fastapi import Request

MAX_RETRY_ATTEMPTS = 3
RETRY_DELAY_SECONDS = 0.1

def _serialize_value(value: Any) -> Optional[str]:
    if value is None:
        return None
    try:
        if isinstance(value, str):
            return value
        return json.dumps(value, default=str, ensure_ascii=False)
    except (TypeError, ValueError):
        return str(value)

def _extract_request_context(request: Optional[Request]) -> Dict[str, Optional[str]]:
    if not request:
        return {"ip_address": None, "user_agent": None}

    ip_address = None
    user_agent = None

    try:
                                                
        ip_address = request.headers.get("X-Forwarded-For", "").split(",")[0].strip()
        if not ip_address:
            ip_address = request.headers.get("X-Real-IP")
        if not ip_address and request.client:
            ip_address = request.client.host

        user_agent = request.headers.get("User-Agent", "")[:500]                
    except Exception:
        pass

    return {"ip_address": ip_address, "user_agent": user_agent}

def _create_activity_record(
    username: str,
    action: str,
    details: str = None,
    user_id: str = None,
    request: Request = None,
    user_role: str = None,
    entity_type: str = None,
    entity_id: Union[str, int] = None,
    old_value: Any = None,
    new_value: Any = None,
    current_user: User = None
) -> UserActivity:
                                                   
    if current_user:
        if not user_id:
            user_id = getattr(current_user, 'user_id', None)
        if not user_role:
            user_role = getattr(current_user, 'role', None)

    request_ctx = _extract_request_context(request)

    return UserActivity(
        username=username,
        user_id=user_id,
        user_role=user_role,
        action=action,
        entity_type=entity_type,
        entity_id=str(entity_id) if entity_id is not None else None,
        details=details,
        old_value=_serialize_value(old_value),
        new_value=_serialize_value(new_value),
        ip_address=request_ctx["ip_address"],
        user_agent=request_ctx["user_agent"]
    )

def log_activity_atomic(
    db: Session,
    username: str,
    action: str,
    details: str = None,
    user_id: str = None,
    request: Request = None,
    *,
    user_role: str = None,
    entity_type: str = None,
    entity_id: Union[str, int] = None,
    old_value: Any = None,
    new_value: Any = None,
    current_user: User = None
) -> UserActivity:
    new_activity = _create_activity_record(
        username=username,
        action=action,
        details=details,
        user_id=user_id,
        request=request,
        user_role=user_role,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=old_value,
        new_value=new_value,
        current_user=current_user
    )

    db.add(new_activity)

    logger.debug(
        f"Activity queued: {action} by {username} | "
        f"entity={entity_type}:{entity_id} | {details}"
    )

    return new_activity

@contextmanager
def atomic_operation(db: Session, operation_name: str = "operation"):
    savepoint = db.begin_nested()                    
    try:
        yield savepoint
        savepoint.commit()                                
        logger.debug(f"Atomic operation '{operation_name}' completed successfully")
    except Exception as e:
        savepoint.rollback()                                    
        logger.error(f"Atomic operation '{operation_name}' failed: {e}")
        raise

def log_activity(
    db: Session,
    username: str,
    action: str,
    details: str = None,
    user_id: str = None,
    request: Request = None,
    *,
                                    
    user_role: str = None,
    entity_type: str = None,
    entity_id: Union[str, int] = None,
    old_value: Any = None,
    new_value: Any = None,
    current_user: User = None
):
    try:
        new_activity = _create_activity_record(
            username=username,
            action=action,
            details=details,
            user_id=user_id,
            request=request,
            user_role=user_role,
            entity_type=entity_type,
            entity_id=entity_id,
            old_value=old_value,
            new_value=new_value,
            current_user=current_user
        )

        db.add(new_activity)
        db.commit()

        logger.debug(
            f"Activity logged: {action} by {username} | "
            f"entity={entity_type}:{entity_id} | {details}"
        )

    except Exception as e:
        logger.error(f"Failed to log activity: {e}")
        db.rollback()

def log_entity_change(
    db: Session,
    current_user: User,
    action: str,
    entity_type: str,
    entity_id: Union[str, int],
    old_data: Dict[str, Any] = None,
    new_data: Dict[str, Any] = None,
    request: Request = None,
    details: str = None,
    atomic: bool = False
):
                                           
    if not details:
        if action == "CREATE":
            details = f"Created {entity_type} {entity_id}"
        elif action == "DELETE":
            details = f"Deleted {entity_type} {entity_id}"
        elif action == "UPDATE" and old_data and new_data:
            changed_fields = [k for k in new_data if old_data.get(k) != new_data.get(k)]
            details = f"Updated {entity_type} {entity_id}: {', '.join(changed_fields)}"
        else:
            details = f"{action} {entity_type} {entity_id}"

    log_func = log_activity_atomic if atomic else log_activity
    log_func(
        db=db,
        username=current_user.username,
        action=action,
        details=details,
        request=request,
        current_user=current_user,
        entity_type=entity_type,
        entity_id=entity_id,
        old_value=old_data,
        new_value=new_data
    )
