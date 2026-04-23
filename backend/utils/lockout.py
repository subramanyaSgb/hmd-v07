
import os
from datetime import datetime, timedelta, timezone
from typing import Tuple, Optional
from sqlalchemy.orm import Session

from ..database.models import User, LoginAttempt
from ..logger import logger

MAX_LOGIN_ATTEMPTS = int(os.getenv("MAX_LOGIN_ATTEMPTS", "5"))
LOCKOUT_DURATION_MINUTES = int(os.getenv("LOCKOUT_DURATION_MINUTES", "15"))

def record_login_attempt(
    db: Session,
    username: str,
    ip_address: str,
    user_agent: Optional[str],
    success: bool,
    failure_reason: Optional[str] = None
) -> LoginAttempt:
    attempt = LoginAttempt(
        username=username,
        ip_address=ip_address,
        user_agent=user_agent[:500] if user_agent else None,
        success=success,
        failure_reason=failure_reason
    )
    db.add(attempt)

    try:
        db.commit()
        db.refresh(attempt)
    except Exception as e:
        logger.error(f"Failed to record login attempt: {e}")
        db.rollback()

    return attempt

def check_account_locked(db: Session, username: str) -> Tuple[bool, Optional[datetime]]:
    user = db.query(User).filter(User.username == username).first()

    if not user:
                                                
        return False, None

    if user.locked_until:
        now = datetime.now(timezone.utc)
                                                                 
        locked_until = user.locked_until
        if locked_until.tzinfo is None:
            locked_until = locked_until.replace(tzinfo=timezone.utc)
        if locked_until > now:
                                     
            return True, user.locked_until
        else:
                                      
            user.locked_until = None
            user.failed_login_attempts = 0
            db.commit()
            return False, None

    return False, None

def increment_failed_attempts(db: Session, username: str) -> Tuple[int, bool]:
    user = db.query(User).filter(User.username == username).first()

    if not user:
                                                     
        return 0, False

    user.failed_login_attempts = (user.failed_login_attempts or 0) + 1

    is_locked = False
    if user.failed_login_attempts >= MAX_LOGIN_ATTEMPTS:
                          
        user.locked_until = datetime.now(timezone.utc) + timedelta(minutes=LOCKOUT_DURATION_MINUTES)
        is_locked = True
        logger.warning(
            f"Account locked: {username} after {user.failed_login_attempts} failed attempts. "
            f"Locked until {user.locked_until}"
        )

    try:
        db.commit()
    except Exception as e:
        logger.error(f"Failed to update login attempts: {e}")
        db.rollback()

    return user.failed_login_attempts, is_locked

def reset_failed_attempts(db: Session, username: str) -> None:
    user = db.query(User).filter(User.username == username).first()

    if user:
        user.failed_login_attempts = 0
        user.locked_until = None
        try:
            db.commit()
        except Exception as e:
            logger.error(f"Failed to reset login attempts: {e}")
            db.rollback()

def get_remaining_lockout_time(locked_until: datetime) -> int:
    now = datetime.now(timezone.utc)
                                                          
    if locked_until.tzinfo is None:
        locked_until = locked_until.replace(tzinfo=timezone.utc)
    if locked_until > now:
        return int((locked_until - now).total_seconds())
    return 0

