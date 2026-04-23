
import os
import secrets
import hashlib
import hmac
from datetime import datetime, timezone
from typing import Optional, Tuple
from fastapi import Request, HTTPException, status
from fastapi.responses import Response
from ..logger import logger

CSRF_SECRET = os.getenv("SECRET_KEY", "")                                     
CSRF_COOKIE_NAME = "csrf_token"
CSRF_HEADER_NAME = "X-CSRF-Token"
CSRF_TOKEN_LENGTH = 32
CSRF_COOKIE_MAX_AGE = 3600          

CSRF_PROTECTED_METHODS = {"POST", "PUT", "DELETE", "PATCH"}

CSRF_EXEMPT_PATHS = {'/api/auth/login', '/api/auth/register', '/health', '/metrics', '/', '/api/csrf-token'}

CSRF_EXEMPT_PREFIXES = ('/developer-docs', '/static', '/docs', '/redoc', '/openapi.json')

def generate_csrf_token() -> str:
    random_part = secrets.token_urlsafe(CSRF_TOKEN_LENGTH)
    timestamp = str(int(datetime.now(timezone.utc).timestamp()))

    message = f"{random_part}:{timestamp}"
    signature = hmac.new(
        CSRF_SECRET.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()[:16]

    return f"{random_part}.{timestamp}.{signature}"

def validate_csrf_token(token: str) -> Tuple[bool, str]:
    if not token:
        return False, "Missing CSRF token"

    parts = token.split(".")
    if len(parts) != 3:
        return False, "Invalid CSRF token format"

    random_part, timestamp_str, signature = parts

    message = f"{random_part}:{timestamp_str}"
    expected_signature = hmac.new(
        CSRF_SECRET.encode(),
        message.encode(),
        hashlib.sha256
    ).hexdigest()[:16]

    if not hmac.compare_digest(signature, expected_signature):
        return False, "Invalid CSRF token signature"

    try:
        token_time = int(timestamp_str)
        current_time = int(datetime.now(timezone.utc).timestamp())
        token_age = current_time - token_time

        if token_age > 86400:
            return False, "CSRF token expired"
    except ValueError:
        return False, "Invalid CSRF token timestamp"

    return True, ""

def is_csrf_exempt(request: Request) -> bool:
    path = request.url.path
    method = request.method

    if method not in CSRF_PROTECTED_METHODS:
        return True

    if path in CSRF_EXEMPT_PATHS:
        return True

    if path.startswith(CSRF_EXEMPT_PREFIXES):
        return True

    return False

def get_csrf_token_from_request(request: Request) -> Tuple[Optional[str], Optional[str]]:
    header_token = request.headers.get(CSRF_HEADER_NAME)
    cookie_token = request.cookies.get(CSRF_COOKIE_NAME)
    return header_token, cookie_token

def set_csrf_cookie(response: Response, token: str) -> None:
                                                       
    enforce_https = os.getenv("ENFORCE_HTTPS", "false").lower() == "true"

    response.set_cookie(
        key=CSRF_COOKIE_NAME,
        value=token,
        max_age=CSRF_COOKIE_MAX_AGE,
        httponly=False,                               
        secure=enforce_https,
        samesite="strict",
        path="/",
    )

async def csrf_protect(request: Request) -> None:
    if is_csrf_exempt(request):
        return

    header_token, cookie_token = get_csrf_token_from_request(request)

    if not cookie_token:
        logger.warning(f"CSRF validation failed: Missing cookie token for {request.url.path}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing from cookie"
        )

    if not header_token:
        logger.warning(f"CSRF validation failed: Missing header token for {request.url.path}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token missing from header"
        )

    is_valid, error = validate_csrf_token(cookie_token)
    if not is_valid:
        logger.warning(f"CSRF validation failed: {error} for {request.url.path}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Invalid CSRF token: {error}"
        )

    if not hmac.compare_digest(header_token, cookie_token):
        logger.warning(f"CSRF validation failed: Token mismatch for {request.url.path}")
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="CSRF token mismatch"
        )

class CSRFMiddleware:

    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        request = Request(scope, receive)

        if not is_csrf_exempt(request):
            header_token, cookie_token = get_csrf_token_from_request(request)

            if cookie_token and header_token:
                is_valid, error = validate_csrf_token(cookie_token)
                if not is_valid or not hmac.compare_digest(header_token, cookie_token):
                                          
                    response = Response(
                        content='{"detail": "CSRF validation failed"}',
                        status_code=403,
                        media_type="application/json"
                    )
                    await response(scope, receive, send)
                    return
            elif request.method in CSRF_PROTECTED_METHODS:
                                                    
                response = Response(
                    content='{"detail": "CSRF token required"}',
                    status_code=403,
                    media_type="application/json"
                )
                await response(scope, receive, send)
                return

        async def send_wrapper(message):
            if message["type"] == "http.response.start":
                                                                       
                cookie_token = request.cookies.get(CSRF_COOKIE_NAME)

                if not cookie_token:
                    new_token = generate_csrf_token()
                                           
                    headers = list(message.get("headers", []))
                    enforce_https = os.getenv("ENFORCE_HTTPS", "false").lower() == "true"
                    secure_flag = "; Secure" if enforce_https else ""
                    cookie_header = (
                        f"{CSRF_COOKIE_NAME}={new_token}; "
                        f"Max-Age={CSRF_COOKIE_MAX_AGE}; "
                        f"Path=/; SameSite=Strict{secure_flag}"
                    )
                    headers.append((b"set-cookie", cookie_header.encode()))
                    message["headers"] = headers

            await send(message)

        await self.app(scope, receive, send_wrapper)
