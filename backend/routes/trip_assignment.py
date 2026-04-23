
from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException, Request
from datetime import date
from sqlalchemy.orm import Session
from sqlalchemy import select
from sqlalchemy.exc import IntegrityError, SQLAlchemyError, OperationalError
from slowapi import Limiter
from slowapi.util import get_remote_address

from ..database.engine import get_db
from ..database.models import (
    Trip, DistributionAssignment, FleetManagement, Notification, User
)
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.security import get_current_user_required, require_roles
from ..utils.rate_limit import rate_limit_medium
from ..utils.soft_delete import active_only
from ..utils.email_service import email_service
from ..utils.cache import fleet_cache
from ..utils.whatsapp_service import whatsapp_service
from ..schemas import TripAssign, TripStatus

from .trip_lifecycle import utc_now, calculate_expected_times

router = APIRouter(prefix="/api/trips", tags=["trip-assignment"])

limiter = Limiter(key_func=get_remote_address)

@router.post("/generate")
@limiter.limit("5/minute")
async def generate_trips(
    request: Request,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "trs"))
):
    today = date.today()
    assignments = db.query(DistributionAssignment).filter(
        DistributionAssignment.date == today,
        DistributionAssignment.status == "Committed"
    ).all()

    if not assignments:
        raise HTTPException(status_code=400, detail="No committed distribution assignments found for today.")

    new_trips_count = 0
    for assignment in assignments:
                                                                              
        existing_trips = db.query(Trip).filter(Trip.assignment_id == assignment.id).count()
        remaining_trips = assignment.trips - existing_trips

        for i in range(remaining_trips):
            trip_idx = existing_trips + i + 1
                                                      
            trip_id = f"TRIP_{today.strftime('%Y%m%d')}_{assignment.producer_id}_{assignment.consumer_id}_{trip_idx:03d}"

            new_trip = Trip(
                trip_id=trip_id,
                assignment_id=assignment.id,
                producer_id=assignment.producer_id,
                consumer_id=assignment.consumer_id,
                status=TripStatus.PENDING
            )
            db.add(new_trip)
            new_trips_count += 1

    try:
        db.commit()
        logger.info(f"Generated {new_trips_count} new trips for {today}")
        log_activity(db, current_user.username, "TRIP_GENERATED", f"Generated {new_trips_count} trips for {today}")
        return {"status": "success", "message": f"Generated {new_trips_count} trips.", "count": new_trips_count}
    except IntegrityError as e:
        db.rollback()
        logger.error(f"Trip generation integrity error: {e}")
        raise HTTPException(status_code=409, detail="Some trips already exist")
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error generating trips: {e}")
        raise HTTPException(status_code=500, detail="Failed to generate trips")

@router.get("/available-assets")
async def get_available_assets(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user_required)
):
                                                                                     
    active_trips = active_only(db.query(Trip)).filter(
        Trip.status >= TripStatus.ASSIGNED,
        Trip.status <= TripStatus.UNLOADING_ENDED
    ).all()
    busy_torpedo_ids = {t.torpedo_id for t in active_trips if t.torpedo_id}

    all_torpedoes = active_only(db.query(FleetManagement)).filter(
        FleetManagement.status == "Operating",
        FleetManagement.type == "torpedo"
    ).all()

    available_torpedoes = [t for t in all_torpedoes if t.fleet_id not in busy_torpedo_ids]

    return {"torpedoes": available_torpedoes}

def _send_assignment_email(to_email: str, username: str, sender: str, message: str) -> None:
    try:
        email_service.send_notification_email(
            to_email=to_email,
            username=username,
            sender=sender,
            message=message,
        )
        logger.info(f"Trip assignment email sent to {username} ({to_email})")
    except Exception as e:
        logger.warning(f"Failed to send trip assignment email to {to_email}: {e}")


async def _send_assignment_whatsapp(trip_id: str) -> None:
    from ..database.engine import SessionLocal

    db = SessionLocal()
    try:
        trip = db.query(Trip).filter(Trip.trip_id == trip_id).first()
        if not trip:
            return
        await whatsapp_service.send_trip_notification(
            trip=trip,
            notification_type="trip_assigned",
            db=db,
        )
    except Exception as e:
        logger.warning(f"Failed to send WhatsApp notification for trip {trip_id}: {e}")
    finally:
        db.close()


@router.post("/assign")
@limiter.limit(rate_limit_medium)
async def assign_assets(
    request: Request,
    data: TripAssign,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
    current_user: User = Depends(require_roles("admin", "trs"))
):
    from ..utils.activity_logger import log_activity_atomic

    trip = db.query(Trip).filter(Trip.trip_id == data.trip_id).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    if trip.status != TripStatus.PENDING:
        raise HTTPException(status_code=400, detail="Trip already assigned or in progress")

    try:
        torpedo = db.execute(
            select(FleetManagement)
            .where(FleetManagement.fleet_id == data.torpedo_id)
            .with_for_update(nowait=True)
        ).scalar_one_or_none()
    except OperationalError:
        raise HTTPException(status_code=409, detail="Torpedo is currently being assigned by another request")

    if not torpedo:
        raise HTTPException(status_code=404, detail="Torpedo not found")

    if torpedo.status != "Operating":
        raise HTTPException(status_code=400, detail=f"Torpedo {data.torpedo_id} is not available")

    try:
        busy = db.execute(
            select(Trip)
            .where(
                Trip.torpedo_id == data.torpedo_id,
                Trip.status >= TripStatus.ASSIGNED,
                Trip.status <= TripStatus.UNLOADING_ENDED
            )
            .with_for_update(nowait=True)
        ).scalar_one_or_none()
    except OperationalError:
        raise HTTPException(status_code=409, detail="Torpedo assignment is being processed by another request")

    if busy:
        raise HTTPException(status_code=400, detail="Torpedo is already in an active trip")

    trip.torpedo_id = data.torpedo_id
    trip.status = TripStatus.ASSIGNED
    trip.assigned_at = utc_now()
    torpedo.status = "Assigned"

    fleet_cache.invalidate("fleet_management")

    calculate_expected_times(db, trip, trip.assigned_at)

    notification_message = f"New Trip Assigned: {data.trip_id} with Torpedo {data.torpedo_id}"

    db.add(Notification(
        recipient_id=trip.producer_id,
        sender="System Admin",
        message=notification_message
    ))

    db.add(Notification(
        recipient_id=trip.consumer_id,
        sender="System Admin",
        message=notification_message
    ))

    producer = db.query(User).filter(User.user_id == trip.producer_id).first()
    consumer = db.query(User).filter(User.user_id == trip.consumer_id).first()

    email_recipients = [
        (u.email, u.username)
        for u in (producer, consumer)
        if u and u.email
    ]

    log_activity_atomic(
        db, current_user.username, "TRIP_ASSIGNED",
        details=f"Assigned torpedo {data.torpedo_id} to trip {data.trip_id}",
        request=request,
        current_user=current_user,
        entity_type="trip",
        entity_id=data.trip_id,
        old_value={"status": TripStatus.PENDING, "torpedo_id": None},
        new_value={"status": TripStatus.ASSIGNED, "torpedo_id": data.torpedo_id}
    )

    try:
        db.commit()
    except SQLAlchemyError as e:
        db.rollback()
        logger.error(f"Database error assigning torpedo: {e}")
        raise HTTPException(status_code=500, detail="Failed to assign torpedo")

    for to_email, username in email_recipients:
        background_tasks.add_task(
            _send_assignment_email,
            to_email,
            username,
            "System Admin",
            notification_message,
        )

    background_tasks.add_task(_send_assignment_whatsapp, data.trip_id)

    logger.info(f"Assigned torpedo {data.torpedo_id} to {data.trip_id}; notifications queued")
    return {"status": "success", "trip_id": trip.trip_id, "torpedo_id": data.torpedo_id}
