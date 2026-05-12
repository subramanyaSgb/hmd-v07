import os
from pathlib import Path
from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from .utils.csrf import (
    generate_csrf_token,
    set_csrf_cookie,
    is_csrf_exempt,
    get_csrf_token_from_request,
    validate_csrf_token,
    CSRF_PROTECTED_METHODS,
)
from fastapi.staticfiles import StaticFiles
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from fastapi.exceptions import RequestValidationError
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger
from apscheduler.triggers.interval import IntervalTrigger
from .logger import logger
from .database.init_db import init_db
from .utils.errors import (
    HMDException,
    hmd_exception_handler,
    validation_exception_handler
)
from .routes import auth, locations, fleet, users, config, system, logs, notifications, maintenance, reports, live_operations, converters, jsw, operations
                                           
from .routes import daily_plans, plans
from .routes import statistics, deviation_analytics, performance_analytics, v2_dashboard, tracking_v2, weighbridge_audit
from .routes import trip_crud, trip_lifecycle, trip_assignment
                              
from .routes import whatsapp
                                 
from .routes.weighbridge import router as weighbridge_router, records_router as weighbridge_records_router
from .utils.rate_limit import limiter
from .utils.tracing import init_tracing, CorrelationIdMiddleware

logger.info("Starting FastAPI application...")

scheduler = AsyncIOScheduler()

async def send_whatsapp_daily_report():
    from .database.engine import SessionLocal
    from .database.models import SystemConfig
    from .utils.whatsapp_service import whatsapp_service

    logger.info("Running scheduled WhatsApp daily report job...")

    db = SessionLocal()
    try:
                                      
        config = db.query(SystemConfig).filter(
            SystemConfig.config_key == "WHATSAPP_ENABLED"
        ).first()

        if not config or config.config_value.lower() != "true":
            logger.info("WhatsApp is disabled - skipping daily report")
            return

        result = await whatsapp_service.send_daily_report(db)

        if result.get("success"):
            logger.success(f"Daily WhatsApp report sent: {result.get('sent', 0)} messages")
        else:
            logger.error(f"Daily WhatsApp report failed: {result.get('error', 'Unknown error')}")

    except Exception as e:
        logger.error(f"Error in daily report job: {e}")
    finally:
        db.close()

def schedule_daily_report():
    from .database.engine import SessionLocal
    from .database.models import SystemConfig

    db = SessionLocal()
    try:
                                           
        config = db.query(SystemConfig).filter(
            SystemConfig.config_key == "WHATSAPP_DAILY_REPORT_TIME"
        ).first()

        report_time = "18:00"                
        if config and config.config_value:
            report_time = config.config_value

        try:
            hour, minute = map(int, report_time.split(":"))
        except (ValueError, AttributeError):
            logger.warning(f"Invalid report time '{report_time}', using default 18:00")
            hour, minute = 18, 0

        existing_job = scheduler.get_job("whatsapp_daily_report")
        if existing_job:
            scheduler.remove_job("whatsapp_daily_report")

        scheduler.add_job(
            send_whatsapp_daily_report,
            CronTrigger(hour=hour, minute=minute),
            id="whatsapp_daily_report",
            name="WhatsApp Daily Report",
            replace_existing=True
        )

        logger.info(f"WhatsApp daily report scheduled for {hour:02d}:{minute:02d}")

    except Exception as e:
        logger.error(f"Error scheduling daily report: {e}")
    finally:
        db.close()

app = FastAPI(
    title="HMD API",
    description="Hot Metal Distribution System API",
    version="1.0.0"
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app.add_exception_handler(HMDException, hmd_exception_handler)
app.add_exception_handler(RequestValidationError, validation_exception_handler)
                                                                    
ALLOWED_ORIGINS = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://localhost:3000,http://127.0.0.1:5173").split(",")

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allow_headers=["Authorization", "Content-Type", "Accept", "X-CSRF-Token", "X-Correlation-ID"],
    expose_headers=["X-CSRF-Token", "X-Correlation-ID"],
)

app.add_middleware(CorrelationIdMiddleware)

ENFORCE_HTTPS = os.getenv("ENFORCE_HTTPS", "false").lower() == "true"

@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)

    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"

    if request.url.path in ["/docs", "/redoc"]:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://cdn.jsdelivr.net; "
            "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' ws: wss:; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )
    else:
        response.headers["Content-Security-Policy"] = (
            "default-src 'self'; "
            "script-src 'self' 'unsafe-inline' 'unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; "
            "img-src 'self' data: blob: https:; "
            "font-src 'self' data:; "
            "connect-src 'self' ws: wss:; "
            "frame-ancestors 'none'; "
            "base-uri 'self'; "
            "form-action 'self';"
        )

    if ENFORCE_HTTPS:
        response.headers["Strict-Transport-Security"] = "max-age=31536000; includeSubDomains; preload"

    response.headers["Permissions-Policy"] = (
        "accelerometer=(), "
        "camera=(), "
        "geolocation=(), "
        "gyroscope=(), "
        "magnetometer=(), "
        "microphone=(), "
        "payment=(), "
        "usb=()"
    )

    if request.url.path.startswith("/api/"):
        response.headers["Cache-Control"] = "no-store, no-cache, must-revalidate, private"
        response.headers["Pragma"] = "no-cache"

    return response

@app.middleware("http")
async def https_redirect(request: Request, call_next):
    if ENFORCE_HTTPS:
                                                                   
        forwarded_proto = request.headers.get("X-Forwarded-Proto", "")
        if forwarded_proto == "http" or (not forwarded_proto and request.url.scheme == "http"):
            url = request.url.replace(scheme="https")
            from starlette.responses import RedirectResponse
            return RedirectResponse(url=str(url), status_code=301)
    return await call_next(request)

CSRF_ENABLED = os.getenv("CSRF_ENABLED", "true").lower() == "true"

@app.middleware("http")
async def csrf_middleware(request: Request, call_next):
    if not CSRF_ENABLED:
        return await call_next(request)

    if is_csrf_exempt(request):
        response = await call_next(request)
                                        
        if not request.cookies.get("csrf_token"):
            token = generate_csrf_token()
            set_csrf_cookie(response, token)
        return response

    if request.method in CSRF_PROTECTED_METHODS:
        import hmac
        header_token, cookie_token = get_csrf_token_from_request(request)

        if not cookie_token or not header_token:
            logger.warning(f"CSRF validation failed: Missing token for {request.method} {request.url.path}")
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token required. Include X-CSRF-Token header."}
            )

        is_valid, error = validate_csrf_token(cookie_token)
        if not is_valid:
            logger.warning(f"CSRF validation failed: {error} for {request.url.path}")
            return JSONResponse(
                status_code=403,
                content={"detail": f"Invalid CSRF token: {error}"}
            )

        if not hmac.compare_digest(header_token, cookie_token):
            logger.warning(f"CSRF validation failed: Token mismatch for {request.url.path}")
            return JSONResponse(
                status_code=403,
                content={"detail": "CSRF token mismatch"}
            )

    response = await call_next(request)
    return response

@app.exception_handler(Exception)
async def global_exception_handler(request: Request, exc: Exception):
    logger.error(f"Unhandled exception: {exc}")
    return JSONResponse(
        status_code=500,
        content={"detail": "An internal server error occurred. Please try again later."}
    )

def schedule_suveechi_sync():
    """Register interval job to pull SuVeechi GPS data into FleetLiveLocation."""
    if os.getenv("SUVEECHI_SYNC_ENABLED", "false").lower() != "true":
        logger.info("SuVeechi sync disabled (set SUVEECHI_SYNC_ENABLED=true to enable).")
        return

    try:
        interval_sec = int(os.getenv("SUVEECHI_SYNC_INTERVAL_SECONDS", "10"))
    except ValueError:
        interval_sec = 10

    import asyncio
    from .utils.suveechi_sync import sync_once, prune_old_locations

    async def _run_sync():
        try:
            await asyncio.to_thread(sync_once)
        except Exception as e:
            logger.exception(f"SuVeechi sync job error: {e}")

    async def _run_prune():
        try:
            await asyncio.to_thread(prune_old_locations, 24)
        except Exception as e:
            logger.error(f"SuVeechi prune job error: {e}")

    scheduler.add_job(
        _run_sync, IntervalTrigger(seconds=interval_sec),
        id="suveechi_sync", name="SuVeechi GPS Sync",
        replace_existing=True, max_instances=1, coalesce=True,
    )
    # Daily prune at 02:00 IST
    scheduler.add_job(
        _run_prune, CronTrigger(hour=2, minute=0),
        id="suveechi_prune", name="SuVeechi Location Prune",
        replace_existing=True,
    )
    logger.info(f"SuVeechi sync scheduled every {interval_sec}s; prune daily 02:00")


def schedule_wbatngl_capacity_sync():
    """Register cron job that backfills FleetManagement.capacity from WBATNGL."""
    if os.getenv("WBATNGL_SYNC_ENABLED", "false").lower() != "true":
        logger.info("WBATNGL capacity sync disabled (set WBATNGL_SYNC_ENABLED=true to enable).")
        return

    import asyncio
    from .utils.wbatngl_capacity_sync import run_once as wbatngl_run_once

    async def _run_capacity_sync():
        try:
            await asyncio.to_thread(wbatngl_run_once)
        except Exception as e:
            logger.exception(f"WBATNGL capacity sync job error: {e}")

    # Daily 03:00 IST — runs after the 02:00 SuVeechi prune so the local DB
    # has its day's-end shape before we touch FleetManagement.capacity.
    scheduler.add_job(
        _run_capacity_sync, CronTrigger(hour=3, minute=0),
        id="wbatngl_capacity_sync", name="WBATNGL Capacity Backfill",
        replace_existing=True, max_instances=1, coalesce=True,
    )
    logger.info("WBATNGL capacity sync scheduled daily at 03:00 IST")


def schedule_wbatngl_trip_sync():
    """Register interval job that mirrors WBATNGL trip rows every 60 s."""
    if os.getenv("WBATNGL_TRIP_SYNC_ENABLED", "false").lower() != "true":
        logger.info("WBATNGL trip sync disabled (set WBATNGL_TRIP_SYNC_ENABLED=true to enable).")
        return

    interval_sec = int(os.getenv("WBATNGL_TRIP_SYNC_INTERVAL_SECONDS", "60"))

    import asyncio
    from .utils.wbatngl_trip_sync import run_once as wbatngl_trip_run_once

    async def _run_trip_sync():
        try:
            await asyncio.to_thread(wbatngl_trip_run_once)
        except Exception as e:
            logger.exception(f"WBATNGL trip sync job error: {e}")

    scheduler.add_job(
        _run_trip_sync, IntervalTrigger(seconds=interval_sec),
        id="wbatngl_trip_sync", name="WBATNGL Trip Mirror",
        replace_existing=True, max_instances=1, coalesce=True,
    )
    logger.info(f"WBATNGL trip sync scheduled every {interval_sec}s")


def schedule_hts_sync():
    """
    APScheduler hook for HTS sync. Pulls heat-pour rows from
    HTS.VW_HTS_HOTMETAL_DATA every HTS_SYNC_INTERVAL_SECONDS into the local
    hts_heat_mirror table. Gated by HTS_SYNC_ENABLED=true.
    """
    if os.getenv("HTS_SYNC_ENABLED", "false").lower() != "true":
        logger.info("HTS sync disabled (set HTS_SYNC_ENABLED=true to enable).")
        return

    interval_sec = int(os.getenv("HTS_SYNC_INTERVAL_SECONDS", "300"))

    import asyncio
    from .utils.hts_sync import run_once as hts_run_once

    async def _run_hts_sync():
        try:
            await asyncio.to_thread(hts_run_once)
        except Exception as e:
            logger.exception(f"HTS sync job error: {e}")

    scheduler.add_job(
        _run_hts_sync, IntervalTrigger(seconds=interval_sec),
        id="hts_sync", name="HTS Heat Mirror Sync",
        replace_existing=True, max_instances=1, coalesce=True,
    )
    logger.info(f"HTS sync scheduled every {interval_sec}s")


@app.on_event("startup")
async def startup_event():
    logger.info("Running database initialization...")
    init_db()
    logger.info("Initializing distributed tracing...")
    init_tracing(app)

    logger.info("Starting background scheduler...")
    scheduler.start()

    schedule_daily_report()
    schedule_suveechi_sync()
    schedule_wbatngl_capacity_sync()
    schedule_wbatngl_trip_sync()
    schedule_hts_sync()

    logger.success("FastAPI server is running and database is initialized.")

@app.on_event("shutdown")
async def shutdown_event():
    logger.info("Shutting down background scheduler...")
    scheduler.shutdown(wait=False)
    logger.info("Scheduler shutdown complete.")

@app.get("/")
async def root():
    logger.info("GET / root endpoint called.")
    if FRONTEND_DIST.exists():
        from fastapi.responses import FileResponse as _FileResponse
        return _FileResponse(str(FRONTEND_DIST / "index.html"))
    return {"message": "Welcome to Hot Metal Distribution", "status": "online", "version": "1.0.0"}

@app.get("/health")
async def health_check():
    from .database.engine import SessionLocal
    from sqlalchemy import text

    try:
        db = SessionLocal()
        db.execute(text("SELECT 1"))
        db.close()
        return {"status": "healthy", "database": "connected"}
    except Exception as e:
        logger.error(f"Health check failed: {e}")
        return JSONResponse(
            status_code=503,
            content={"status": "unhealthy", "database": "disconnected", "error": str(e)}
        )

@app.get("/api/csrf-token", tags=["Security"])
async def get_csrf_token(request: Request, response: Response):
                                               
    existing_token = request.cookies.get("csrf_token")
    if existing_token:
        is_valid, _ = validate_csrf_token(existing_token)
        if is_valid:
            return {"csrf_token": existing_token}

    token = generate_csrf_token()
    set_csrf_cookie(response, token)

    return {"csrf_token": token}

app.include_router(auth.router)
app.include_router(locations.router)
app.include_router(fleet.router)
app.include_router(users.router)
app.include_router(config.router)
app.include_router(system.router)
app.include_router(logs.router)
app.include_router(notifications.router)
app.include_router(maintenance.router)
app.include_router(reports.router)
app.include_router(live_operations.router)
app.include_router(converters.router)
app.include_router(jsw.router)
app.include_router(operations.router)

app.include_router(whatsapp.router)

app.include_router(weighbridge_router)
app.include_router(weighbridge_records_router)

app.include_router(daily_plans.router)
app.include_router(plans.router)                                                                      
app.include_router(statistics.router)
app.include_router(deviation_analytics.router)
app.include_router(performance_analytics.router)
app.include_router(v2_dashboard.router)                                  # Version 2 dashboard live data
app.include_router(tracking_v2.router)                                   # Version 2 Live Tracking live data
app.include_router(weighbridge_audit.router)                             # Weighbridge Audit page
app.include_router(trip_crud.router)
app.include_router(trip_lifecycle.router)
app.include_router(trip_assignment.router)

DOCS_PATH = Path(__file__).parent.parent.parent / "Document" / "developer-docs" / "site"
if DOCS_PATH.exists():
    app.mount("/developer-docs", StaticFiles(directory=str(DOCS_PATH), html=True), name="developer-docs")
    logger.info(f"Developer documentation mounted at /developer-docs")
else:
    logger.warning(f"Developer docs not found at {DOCS_PATH}. Run 'cd Document/developer-docs && mkdocs build' to generate.")

import sys as _sys
if getattr(_sys, 'frozen', False):
                                                                             
    _hmd_root = Path(os.environ.get("HMD_DIR", Path(_sys.executable).parent))
    FRONTEND_DIST = _hmd_root / "frontend" / "dist"
else:
    FRONTEND_DIST = Path(__file__).parent.parent / "frontend" / "dist"
if FRONTEND_DIST.exists():
    from fastapi.responses import FileResponse

    assets_dir = FRONTEND_DIST / "assets"
    if assets_dir.exists():
        app.mount("/assets", StaticFiles(directory=str(assets_dir)), name="frontend-assets")

    @app.get("/{full_path:path}")
    async def serve_frontend(full_path: str):
        file_path = FRONTEND_DIST / full_path
        if file_path.is_file():
            return FileResponse(str(file_path))
        return FileResponse(str(FRONTEND_DIST / "index.html"))

    logger.info(f"Frontend SPA mounted from {FRONTEND_DIST}")
else:
    logger.info("Frontend dist/ not found - running in API-only mode (use Vite dev server for frontend)")
