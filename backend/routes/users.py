from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError, IntegrityError
from ..database.engine import get_db
from ..database.models import User
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.security import get_password_hash, get_current_user_required, require_roles
from ..utils.redis_cache import cache

router = APIRouter(prefix="/api/users", tags=["users"])

CACHE_KEY_USERS_ALL = "users:all"
CACHE_TTL_USERS = 60                                

@router.get("")
async def get_users(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                 
    cached_data = cache.get(CACHE_KEY_USERS_ALL)
    if cached_data is not None:
        return cached_data

    logger.debug("CACHE MISS: Fetching users from DB.")
    users = db.query(User).all()

    users_data = [
        {
            "id": u.id,
            "username": u.username,
            "role": u.role,
            "user_id": u.user_id,
            "last_login": u.last_login.isoformat() if u.last_login else None,
            "created_at": u.created_at.isoformat() if u.created_at else None
        }
        for u in users
    ]

    cache.set(CACHE_KEY_USERS_ALL, users_data, ttl=CACHE_TTL_USERS)

    return users_data

@router.post("")
async def create_user(data: dict, db: Session = Depends(get_db), admin_user: User = Depends(require_roles("admin"))):
                      
    cache.delete(CACHE_KEY_USERS_ALL)
    
    username = data.get("username")
    user_id = data.get("user_id")

    if db.query(User).filter(User.username == username).first():
        raise HTTPException(
            status_code=400,
            detail=f"Username '{username}' already exists. Please choose a different username."
        )
    
    if user_id and db.query(User).filter(User.user_id == user_id).first():
        raise HTTPException(
            status_code=400,
            detail=f"User ID '{user_id}' already exists. Please use a unique ID."
        )

    try:
        new_user = User(
            username=username,
            password=get_password_hash(data.get("password")),
            role=data.get("role"),
            user_id=data.get("user_id")
        )
        db.add(new_user)
        db.commit()
        db.refresh(new_user)
        log_activity(
            db, "Admin", "USER_CREATED",
            details=f"Created user: {new_user.username} with role {new_user.role}",
            entity_type="user",
            entity_id=new_user.username,
            new_value={'username': new_user.username, 'role': new_user.role, 'user_id': new_user.user_id}
        )
        return new_user
    except IntegrityError as e:
        logger.error(f"Integrity constraint violated creating user: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="User conflicts with existing data")
    except SQLAlchemyError as e:
        logger.error(f"Database error creating user: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create user. Please try again.")

@router.put("/{user_id}")
async def update_user(user_id: int, data: dict, db: Session = Depends(get_db), admin_user: User = Depends(require_roles("admin"))):
                      
    cache.delete(CACHE_KEY_USERS_ALL)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    try:
        user.username = data.get("username", user.username)
        if "password" in data:
            user.password = get_password_hash(data["password"])
        user.role = data.get("role", user.role)
        user.user_id = data.get("user_id", user.user_id)
        db.commit()
        db.refresh(user)
        log_activity(
            db, "Admin", "USER_UPDATED",
            details=f"Updated details for user: {user.username}",
            entity_type="user",
            entity_id=user.username,
            new_value={'username': user.username, 'role': user.role, 'user_id': user.user_id}
        )
        return user
    except IntegrityError as e:
        logger.error(f"Integrity constraint violated updating user: {e}")
        db.rollback()
        raise HTTPException(status_code=400, detail="Update conflicts with existing data")
    except SQLAlchemyError as e:
        logger.error(f"Database error updating user: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to update user. Please try again.")

@router.delete("/{user_id}")
async def delete_user(user_id: int, db: Session = Depends(get_db), admin_user: User = Depends(require_roles("admin"))):
                      
    cache.delete(CACHE_KEY_USERS_ALL)
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")

    deleted_username = user.username
    db.delete(user)
    db.commit()
    log_activity(
        db, "Admin", "USER_DELETED",
        details=f"Deleted user: {deleted_username}",
        entity_type="user",
        entity_id=deleted_username,
        old_value={"username": deleted_username}
    )
    return {"message": "User deleted"}

