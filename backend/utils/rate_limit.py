
import os
from slowapi import Limiter
from slowapi.util import get_remote_address

RATE_LIMIT_ENABLED = os.getenv("RATE_LIMIT_ENABLED", "true").lower() != "false"

if RATE_LIMIT_ENABLED:
    RATE_LIMIT_HIGH = os.getenv("RATE_LIMIT_HIGH", "60/minute")                       
    RATE_LIMIT_MEDIUM = os.getenv("RATE_LIMIT_MEDIUM", "20/minute")             
    RATE_LIMIT_LOW = os.getenv("RATE_LIMIT_LOW", "10/minute")                       
    RATE_LIMIT_AUTH = os.getenv("RATE_LIMIT_AUTH", "5/minute")                       
    RATE_LIMIT_EXPORT = os.getenv("RATE_LIMIT_EXPORT", "5/minute")                             
else:
                                                 
    RATE_LIMIT_HIGH = "100000/minute"
    RATE_LIMIT_MEDIUM = "100000/minute"
    RATE_LIMIT_LOW = "100000/minute"
    RATE_LIMIT_AUTH = "100000/minute"
    RATE_LIMIT_EXPORT = "100000/minute"

rate_limit_high = RATE_LIMIT_HIGH                         
rate_limit_medium = RATE_LIMIT_MEDIUM                          
rate_limit_low = RATE_LIMIT_LOW                                    
rate_limit_auth = RATE_LIMIT_AUTH                        
rate_limit_export = RATE_LIMIT_EXPORT                         

limiter = Limiter(key_func=get_remote_address, enabled=RATE_LIMIT_ENABLED)

def get_rate_limit_for_method(method: str) -> str:
    method = method.upper()

    if method == "GET":
        return rate_limit_high
    elif method in ("POST", "PUT", "PATCH"):
        return rate_limit_medium
    elif method == "DELETE":
        return rate_limit_low
    else:
        return rate_limit_high

ENDPOINT_RATE_LIMITS = {
                                       
    "/api/auth/login": "5/minute",
    "/api/auth/register": "3/minute",
    "/api/auth/refresh": "10/minute",

    "/api/config/hm-matrix": "10/minute",
    "/api/config/system-settings": "5/minute",
    "/api/config/system-settings/bulk": "3/minute",

    "/api/fleet": "20/minute",

    "/api/trips/manual": "15/minute",
    "/api/trips/generate": "5/minute",

    "/api/reports/export": "5/minute",
    "/api/reports/generate": "5/minute",

    "/api/users": "10/minute",
}

