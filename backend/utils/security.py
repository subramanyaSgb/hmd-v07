import os
import uuid
from datetime import datetime, timedelta, timezone
from typing import Optional
from pathlib import Path
from passlib.context import CryptContext
from jose import JWTError, jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy.orm import Session
from dotenv import load_dotenv

_env_path = Path(__file__).resolve().parent.parent / ".env"
load_dotenv(_env_path)

from ..database.engine import get_db
from ..database.models import User
from ..logger import logger
from .redis_cache import cache
from .soft_delete import active_only

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")

SECRET_KEY = os.getenv("SECRET_KEY")
if not SECRET_KEY:
    logger.critical("SECURITY ERROR: SECRET_KEY environment variable is not set!")
    logger.critical("Please set SECRET_KEY in your .env file before starting the application.")
    raise RuntimeError(
        "SECRET_KEY must be set in environment variables for security. "
        "Generate a secure key using: python -c 'import secrets; print(secrets.token_urlsafe(32))'"
    )

ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_MINUTES = int(os.getenv("ACCESS_TOKEN_EXPIRE_MINUTES", "480"))                   

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)

def verify_password(plain_password: str, hashed_password: str) -> bool:
    if not plain_password or not hashed_password:
        return False

    try:
        return pwd_context.verify(plain_password, hashed_password)
    except Exception as e:
        logger.error(f"Password verification error: {e}")
        return False                                                

def get_password_hash(password: str) -> str:
    return pwd_context.hash(password)

def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    to_encode = data.copy()

    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_EXPIRE_MINUTES)

    to_encode.update({
        "exp": expire,
        "iat": datetime.now(timezone.utc),
        "jti": str(uuid.uuid4())                                                   
    })

    encoded_jwt = jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)
    return encoded_jwt

def decode_access_token(token: str) -> Optional[dict]:
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except JWTError as e:
        logger.warning(f"JWT decode error: {e}")
        return None

async def get_current_user(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> Optional[User]:
    if not token:
        return None

    payload = decode_access_token(token)
    if not payload:
        return None

    username: str = payload.get("sub")
    if not username:
        return None

    user = active_only(db.query(User)).filter(User.username == username).first()
    return user

async def get_current_user_required(
    token: Optional[str] = Depends(oauth2_scheme),
    db: Session = Depends(get_db)
) -> User:
    credentials_exception = HTTPException(
        status_code=status.HTTP_401_UNAUTHORIZED,
        detail="Could not validate credentials",
        headers={"WWW-Authenticate": "Bearer"},
    )

    if not token:
        raise credentials_exception

    if is_token_blacklisted(token):
        logger.warning("Attempted use of blacklisted token")
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token has been revoked. Please log in again.",
            headers={"WWW-Authenticate": "Bearer"},
        )

    payload = decode_access_token(token)
    if not payload:
        raise credentials_exception

    username: str = payload.get("sub")
    if not username:
        raise credentials_exception

    user = active_only(db.query(User)).filter(User.username == username).first()
    if not user:
        raise credentials_exception

    return user

async def get_admin_user(
    current_user: User = Depends(get_current_user_required)
) -> User:
    if current_user.role != "admin":
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Admin access required"
        )
    return current_user

def require_roles(*allowed_roles):
    flattened_roles = []
    for role in allowed_roles:
        if isinstance(role, (list, tuple)):
            flattened_roles.extend(role)
        else:
            flattened_roles.append(role)

    async def role_checker(current_user: User = Depends(get_current_user_required)) -> User:
        if current_user.role not in flattened_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Access denied. Required roles: {', '.join(flattened_roles)}"
            )
        return current_user
    return role_checker

TOKEN_BLACKLIST_PREFIX = "token_blacklist"

def _get_token_blacklist_key(token: str) -> str:
                                                   
    import hashlib
    token_hash = hashlib.sha256(token.encode()).hexdigest()[:32]
    return f"{TOKEN_BLACKLIST_PREFIX}:{token_hash}"

def blacklist_token(token: str) -> bool:
    try:
                                             
        payload = decode_access_token(token)
        if not payload:
                                                         
            return True

        exp = payload.get("exp")
        if exp:
            from datetime import datetime, timezone
            exp_time = datetime.fromtimestamp(exp, tz=timezone.utc)
            now = datetime.now(timezone.utc)
            ttl_seconds = int((exp_time - now).total_seconds())

            if ttl_seconds <= 0:
                                       
                return True

            key = _get_token_blacklist_key(token)
            cache.set(key, "blacklisted", ttl=ttl_seconds)
            logger.info(f"Token blacklisted, TTL: {ttl_seconds}s")
            return True
        else:
                                                                 
            key = _get_token_blacklist_key(token)
            cache.set(key, "blacklisted", ttl=ACCESS_TOKEN_EXPIRE_MINUTES * 60)
            return True

    except Exception as e:
        logger.error(f"Failed to blacklist token: {e}")
        return False

def is_token_blacklisted(token: str) -> bool:
    try:
        key = _get_token_blacklist_key(token)
        return cache.exists(key)
    except Exception as e:
        logger.error(f"Failed to check token blacklist: {e}")
                                                      
        return False
