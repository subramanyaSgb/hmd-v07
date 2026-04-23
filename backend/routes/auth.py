from fastapi import APIRouter, Depends, HTTPException, Request
from sqlalchemy.orm import Session
from datetime import datetime, timezone
from ..database.engine import get_db
from ..database.models import User
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.security import (
    verify_password,
    get_password_hash,
    create_access_token,
    get_current_user_required,
    blacklist_token,
    oauth2_scheme
)
from ..utils.lockout import (
    check_account_locked,
    increment_failed_attempts,
    reset_failed_attempts,
    record_login_attempt,
    get_remaining_lockout_time,
    MAX_LOGIN_ATTEMPTS,
    LOCKOUT_DURATION_MINUTES
)
from ..utils.soft_delete import active_only
from ..utils.rate_limit import limiter, rate_limit_auth
from ..schemas import LoginRequest, LoginResponse, LogoutRequest, CurrentUserResponse, ChangePasswordRequest

router = APIRouter(prefix="/api/auth", tags=["auth"])

@router.post(
    "/login",
    response_model=LoginResponse,
    summary="User Login",
    description="Authenticate user credentials and receive a JWT access token for subsequent API requests.",
    responses={
        200: {
            "description": "Successful authentication",
            "content": {
                "application/json": {
                    "example": {
                        "access_token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
                        "token_type": "bearer",
                        "username": "admin",
                        "role": "admin",
                        "user_id": None
                    }
                }
            }
        },
        401: {"description": "Invalid credentials"},
        403: {"description": "Account locked due to too many failed attempts"},
        429: {"description": "Too many login attempts - rate limit exceeded"}
    },
    tags=["Authentication"]
)
@limiter.limit(rate_limit_auth)                                      
async def login(request: Request, data: LoginRequest, db: Session = Depends(get_db)):
    username = data.username.strip()
    password = data.password
    ip_address = request.client.host if request.client else "unknown"
    user_agent = request.headers.get("User-Agent", "")

    is_locked, locked_until = check_account_locked(db, username)
    if is_locked:
        remaining_seconds = get_remaining_lockout_time(locked_until)
        remaining_minutes = (remaining_seconds // 60) + 1

        record_login_attempt(
            db, username, ip_address, user_agent,
            success=False, failure_reason="account_locked"
        )

        logger.warning(f"Login blocked - account locked: {username}")
        log_activity(
            db, username, "USER_LOGIN_BLOCKED",
            details=f"Login blocked - account locked for {remaining_minutes} more minutes",
            request=request,
            entity_type="user",
            entity_id=username
        )

        raise HTTPException(
            status_code=403,
            detail=f"Account is locked due to too many failed login attempts. "
                   f"Please try again in {remaining_minutes} minute(s)."
        )

    user = active_only(db.query(User)).filter(
        (User.username == username) | (User.email == username.lower())
    ).first()

    if not user or not verify_password(password, user.password):
                               
        record_login_attempt(
            db, username, ip_address, user_agent,
            success=False, failure_reason="invalid_credentials"
        )

        attempts, now_locked = increment_failed_attempts(db, username)
        remaining_attempts = max(0, MAX_LOGIN_ATTEMPTS - attempts)

        logger.warning(f"Failed login attempt for user: {username} (attempt {attempts})")
        log_activity(
            db, username, "USER_LOGIN_FAILED",
            details=f"Failed login attempt - invalid credentials (attempt {attempts}/{MAX_LOGIN_ATTEMPTS})",
            request=request,
            entity_type="user",
            entity_id=username
        )

        if now_locked:
            raise HTTPException(
                status_code=403,
                detail=f"Account has been locked due to {MAX_LOGIN_ATTEMPTS} failed login attempts. "
                       f"Please try again in {LOCKOUT_DURATION_MINUTES} minutes."
            )

        raise HTTPException(
            status_code=401,
            detail=f"Invalid credentials. {remaining_attempts} attempt(s) remaining before account lockout."
        )

    reset_failed_attempts(db, username)

    record_login_attempt(
        db, username, ip_address, user_agent,
        success=True, failure_reason=None
    )

    user.last_login = datetime.now(timezone.utc)
    db.commit()

    token_data = {'sub': user.username, 'role': user.role, 'user_id': user.user_id}
    access_token = create_access_token(data=token_data)

    logger.success(f"User {username} logged in successfully.")
    log_activity(
        db, username, "USER_LOGIN",
        details="User logged into the system",
        request=request,
        current_user=user,
        entity_type="user",
        entity_id=user.user_id or username
    )

    return LoginResponse(
        access_token=access_token,
        token_type="bearer",
        username=user.username,
        role=user.role,
        user_id=user.user_id
    )

@router.post("/logout")
async def logout(
    request: Request,
    data: LogoutRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required),
    token: str = Depends(oauth2_scheme)
):
                                               
    if token:
        blacklist_result = blacklist_token(token)
        if blacklist_result:
            logger.info(f"Token blacklisted for user: {current_user.username}")
        else:
            logger.warning(f"Failed to blacklist token for user: {current_user.username}")

    log_activity(
        db, current_user.username, "USER_LOGOUT",
        details="User logged out of the system (token invalidated)",
        request=request,
        current_user=current_user,
        entity_type="user",
        entity_id=current_user.user_id or current_user.username
    )
    return {"status": "success", "message": "Logged out successfully. Token has been invalidated."}

@router.get(
    "/me",
    response_model=CurrentUserResponse,
    summary="Get Current User",
    description="Retrieve information about the currently authenticated user.",
    responses={
        200: {
            "description": "Current user information",
            "content": {
                "application/json": {
                    "example": {
                        "id": 1,
                        "username": "admin",
                        "role": "admin",
                        "user_id": None,
                        "email": "admin@example.com",
                        "last_login": "2026-01-19T15:30:00Z"
                    }
                }
            }
        },
        401: {"description": "Not authenticated"}
    },
    tags=["Authentication"]
)
async def get_current_user_info(current_user: User = Depends(get_current_user_required)):
    return CurrentUserResponse(
        id=current_user.id,
        username=current_user.username,
        role=current_user.role,
        user_id=current_user.user_id,
        email=current_user.email,
        last_login=current_user.last_login,
        created_at=current_user.created_at
    )

@router.post("/refresh")
async def refresh_token(current_user: User = Depends(get_current_user_required)):
    token_data = {'sub': current_user.username, 'role': current_user.role, 'user_id': current_user.user_id}
    access_token = create_access_token(data=token_data)

    return {'access_token': access_token, 'token_type': 'bearer'}

@router.put("/change-password")
async def change_password(
    request: Request,
    data: ChangePasswordRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                             
    if not verify_password(data.current_password, current_user.password):
        raise HTTPException(status_code=400, detail="Current password is incorrect")

    if data.current_password == data.new_password:
        raise HTTPException(status_code=400, detail="New password must be different from current password")

    current_user.password = get_password_hash(data.new_password)
    db.commit()

    log_activity(
        db, current_user.username, "PASSWORD_CHANGED",
        details="User changed their own password",
        request=request,
        current_user=current_user,
        entity_type="user",
        entity_id=current_user.user_id or current_user.username
    )

    return {"status": "success", "message": "Password changed successfully"}
