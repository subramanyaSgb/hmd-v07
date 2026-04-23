
from enum import Enum
from typing import Optional, Dict, Any, List
from fastapi import HTTPException, Request
from fastapi.responses import JSONResponse
from fastapi.exceptions import RequestValidationError
from pydantic import BaseModel

class ErrorCode(str, Enum):

    AUTH_INVALID_CREDENTIALS = "AUTH_1001"
    AUTH_TOKEN_EXPIRED = "AUTH_1002"
    AUTH_TOKEN_INVALID = "AUTH_1003"
    AUTH_ACCOUNT_LOCKED = "AUTH_1004"
    AUTH_INSUFFICIENT_PERMISSIONS = "AUTH_1005"
    AUTH_SESSION_EXPIRED = "AUTH_1006"

    VALIDATION_REQUIRED_FIELD = "VAL_2001"
    VALIDATION_INVALID_FORMAT = "VAL_2002"
    VALIDATION_OUT_OF_RANGE = "VAL_2003"
    VALIDATION_DUPLICATE = "VAL_2004"
    VALIDATION_CONSTRAINT = "VAL_2005"
    VALIDATION_DATE_RANGE = "VAL_2006"

    RESOURCE_NOT_FOUND = "RES_3001"
    RESOURCE_ALREADY_EXISTS = "RES_3002"
    RESOURCE_CONFLICT = "RES_3003"
    RESOURCE_LOCKED = "RES_3004"
    RESOURCE_DELETED = "RES_3005"

    TRIP_INVALID_STATUS_TRANSITION = "TRIP_4001"
    TRIP_ALREADY_ASSIGNED = "TRIP_4002"
    TRIP_NO_AVAILABLE_TORPEDO = "TRIP_4003"
    TRIP_TORPEDO_BUSY = "TRIP_4004"
    TRIP_COMPLETED = "TRIP_4005"
    TRIP_CANCELED = "TRIP_4006"
    TRIP_STUCK = "TRIP_4007"

    FLEET_IN_MAINTENANCE = "FLEET_5001"
    FLEET_ALREADY_ASSIGNED = "FLEET_5002"
    FLEET_NOT_AVAILABLE = "FLEET_5003"

    PLAN_DATE_PASSED = "PLAN_6001"
    PLAN_ALREADY_CONFIRMED = "PLAN_6002"
    PLAN_CAPACITY_EXCEEDED = "PLAN_6003"
    PLAN_OVERLAPPING = "PLAN_6004"

    RATE_LIMIT_EXCEEDED = "RATE_7001"

    SERVER_INTERNAL_ERROR = "SRV_9001"
    SERVER_DATABASE_ERROR = "SRV_9002"
    SERVER_EXTERNAL_SERVICE = "SRV_9003"
    SERVER_TIMEOUT = "SRV_9004"

class FieldError(BaseModel):
    field: str
    message: str
    code: Optional[str] = None

class ErrorResponse(BaseModel):
    success: bool = False
    error: str
    error_code: str
    message: str
    details: Optional[Dict[str, Any]] = None
    field_errors: Optional[List[FieldError]] = None
    request_id: Optional[str] = None

    class Config:
        json_schema_extra = {
            "example": {
                "success": False,
                "error": "ValidationError",
                "error_code": "VAL_2001",
                "message": "Missing required field: producer_id",
                "details": {"field": "producer_id"},
                "field_errors": [
                    {"field": "producer_id", "message": "This field is required", "code": "required"}
                ],
                "request_id": "abc123"
            }
        }

class HMDException(HTTPException):

    def __init__(
        self,
        status_code: int,
        error_code: ErrorCode,
        message: str,
        details: Optional[Dict[str, Any]] = None,
        field_errors: Optional[List[FieldError]] = None,
        headers: Optional[Dict[str, str]] = None
    ):
        self.error_code = error_code
        self.message = message
        self.details = details
        self.field_errors = field_errors
        super().__init__(status_code=status_code, detail=message, headers=headers)

class NotFoundError(HMDException):
    def __init__(self, resource: str, identifier: Any, message: Optional[str] = None):
        super().__init__(
            status_code=404,
            error_code=ErrorCode.RESOURCE_NOT_FOUND,
            message=message or f"{resource} with ID '{identifier}' not found",
            details={"resource": resource, "identifier": str(identifier)}
        )

class ConflictError(HMDException):
    def __init__(self, resource: str, message: str, details: Optional[Dict] = None):
        super().__init__(
            status_code=409,
            error_code=ErrorCode.RESOURCE_CONFLICT,
            message=message,
            details={"resource": resource, **(details or {})}
        )

class ValidationError(HMDException):
    def __init__(
        self,
        message: str,
        field_errors: Optional[List[FieldError]] = None,
        error_code: ErrorCode = ErrorCode.VALIDATION_CONSTRAINT
    ):
        super().__init__(
            status_code=400,
            error_code=error_code,
            message=message,
            field_errors=field_errors
        )

class AuthenticationError(HMDException):
    def __init__(self, message: str, error_code: ErrorCode = ErrorCode.AUTH_INVALID_CREDENTIALS):
        super().__init__(
            status_code=401,
            error_code=error_code,
            message=message
        )

class AuthorizationError(HMDException):
    def __init__(self, message: str = "Insufficient permissions"):
        super().__init__(
            status_code=403,
            error_code=ErrorCode.AUTH_INSUFFICIENT_PERMISSIONS,
            message=message
        )

class TripStatusError(HMDException):
    def __init__(self, current_status: int, target_status: int, message: Optional[str] = None):
        super().__init__(
            status_code=400,
            error_code=ErrorCode.TRIP_INVALID_STATUS_TRANSITION,
            message=message or f"Cannot transition from status {current_status} to {target_status}",
            details={"current_status": current_status, "target_status": target_status}
        )

class RateLimitError(HMDException):
    def __init__(self, limit: str, retry_after: Optional[int] = None):
        headers = {"Retry-After": str(retry_after)} if retry_after else None
        super().__init__(
            status_code=429,
            error_code=ErrorCode.RATE_LIMIT_EXCEEDED,
            message=f"Rate limit exceeded: {limit}",
            details={"limit": limit, "retry_after": retry_after},
            headers=headers
        )

def create_error_response(
    error: str,
    error_code: ErrorCode,
    message: str,
    status_code: int,
    details: Optional[Dict] = None,
    field_errors: Optional[List[FieldError]] = None,
    request_id: Optional[str] = None
) -> JSONResponse:
    content = ErrorResponse(
        error=error,
        error_code=error_code.value,
        message=message,
        details=details,
        field_errors=field_errors,
        request_id=request_id
    ).model_dump(exclude_none=True)

    return JSONResponse(status_code=status_code, content=content)

async def hmd_exception_handler(request: Request, exc: HMDException) -> JSONResponse:
    request_id = getattr(request.state, "request_id", None)

    return create_error_response(
        error=exc.__class__.__name__,
        error_code=exc.error_code,
        message=exc.message,
        status_code=exc.status_code,
        details=exc.details,
        field_errors=exc.field_errors,
        request_id=request_id
    )

async def validation_exception_handler(request: Request, exc: RequestValidationError) -> JSONResponse:
    field_errors = []

    for error in exc.errors():
        loc = error.get("loc", [])
        field = ".".join(str(l) for l in loc if l != "body")
        field_errors.append(FieldError(
            field=field,
            message=error.get("msg", "Validation error"),
            code=error.get("type", "validation_error")
        ))

    request_id = getattr(request.state, "request_id", None)

    return create_error_response(
        error="ValidationError",
        error_code=ErrorCode.VALIDATION_CONSTRAINT,
        message="Request validation failed",
        status_code=422,
        field_errors=field_errors,
        request_id=request_id
    )

async def generic_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    from ..logger import logger

    request_id = getattr(request.state, "request_id", None)
    logger.error(f"Unhandled exception: {exc}", exc_info=True)

    return create_error_response(
        error="InternalServerError",
        error_code=ErrorCode.SERVER_INTERNAL_ERROR,
        message="An internal server error occurred. Please try again later.",
        status_code=500,
        request_id=request_id
    )
