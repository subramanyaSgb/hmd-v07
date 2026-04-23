from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy.exc import SQLAlchemyError
from ..database.engine import get_db
from ..database.models import Notification, User
from ..logger import logger
from ..utils.activity_logger import log_activity
from ..utils.security import get_current_user_required, require_roles
from ..utils.redis_cache import cache
from ..utils.email_service import email_service

router = APIRouter(prefix="/api/notifications", tags=["notifications"])

CACHE_TTL_NOTIFICATIONS = 15                                     

def _get_notifications_cache_key(user_id: str) -> str:
    return f"notifications:{user_id}"

def send_notification_email(db: Session, recipient_id: str, sender: str, message: str) -> bool:
    try:
                                  
        user = db.query(User).filter(User.user_id == recipient_id).first()

        if not user:
            return False

        if user.email:

            email_sent = email_service.send_notification_email(
                to_email=user.email,
                username=user.username,
                sender=sender,
                message=message
            )

            if email_sent:
                logger.info(f"Notification email sent to {user.username} ({user.email})")
                return True
            else:
                logger.warning(f"Failed to send notification email to {user.email}")
                return False

        return False

    except Exception as e:
        logger.error(f"Error sending notification email: {e}")
        return False

@router.post("")
async def create_notification(data: dict, db: Session = Depends(get_db), current_user: User = Depends(require_roles("admin", "trs"))):
    recipient_id = data.get('recipient_id')
    sender = data.get('sender', 'Admin')
    message = data.get('message')

    if recipient_id:
        cache.delete(_get_notifications_cache_key(recipient_id))

    logger.info(f"Creating notification for user: {recipient_id}")
    try:
        new_note = Notification(
            recipient_id=recipient_id,
            sender=sender,
            message=message,
            is_read=False
        )
        db.add(new_note)
        db.commit()
        db.refresh(new_note)

        if recipient_id and message:
            send_notification_email(db, recipient_id, sender, message)

        log_activity(
            db, "Admin", "NOTIFICATION_SENT",
            details=f"Sent notification to {recipient_id}",
            entity_type="notification",
            entity_id=new_note.id,
            new_value={
                "recipient_id": recipient_id,
                "sender": new_note.sender,
                "message": new_note.message[:100] if new_note.message else None                      
            }
        )
        return new_note
    except SQLAlchemyError as e:
        logger.error(f"Database error creating notification: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to create notification. Please try again.")

@router.get("/{user_id}")
async def get_notifications(user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_required)):
                 
    cache_key = _get_notifications_cache_key(user_id)
    cached_data = cache.get(cache_key)
    if cached_data is not None:
        return cached_data

    logger.debug(f"CACHE MISS: Fetching notifications for {user_id} from DB.")
    notifications = db.query(Notification).filter(
        Notification.recipient_id == user_id
    ).order_by(Notification.timestamp.desc()).all()

    notifications_data = [
        {
            "id": n.id,
            "recipient_id": n.recipient_id,
            "sender": n.sender,
            "message": n.message,
            "is_read": n.is_read,
            "timestamp": n.timestamp.isoformat() if n.timestamp else None
        }
        for n in notifications
    ]

    cache.set(cache_key, notifications_data, ttl=CACHE_TTL_NOTIFICATIONS)

    return notifications_data

@router.put("/{note_id}/read")
async def mark_notification_read(note_id: int, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_required)):
    note = db.query(Notification).filter(Notification.id == note_id).first()
    if not note:
        raise HTTPException(status_code=404, detail="Notification not found")

    if note.recipient_id:
        cache.delete(_get_notifications_cache_key(note.recipient_id))

    try:
        note.is_read = True
        db.commit()
        log_activity(
            db, note.recipient_id or "System", "NOTIFICATION_READ",
            details=f"Marked notification {note_id} as read",
            entity_type="notification",
            entity_id=note_id,
            old_value={"is_read": False},
            new_value={"is_read": True}
        )
        return {"message": "Marked as read"}
    except SQLAlchemyError as e:
        logger.error(f"Database error marking notification as read: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to mark notification as read. Please try again.")

@router.delete("/all")
async def delete_all_notifications(db: Session = Depends(get_db), current_user: User = Depends(require_roles("admin"))):
    try:
        total_count = db.query(Notification).count()

        if total_count == 0:
            return {"message": "No notifications to delete", "deleted_count": 0}

        db.query(Notification).delete()
        db.commit()

        cache.delete_pattern("notifications:*")

        log_activity(
            db, current_user.user_id, "NOTIFICATIONS_CLEARED_ALL",
            details=f"Deleted all {total_count} notifications for all users",
            entity_type="notification",
            new_value={"deleted_count": total_count}
        )

        logger.info(f"Admin {current_user.user_id} deleted all {total_count} notifications")
        return {"message": "All notifications deleted", "deleted_count": total_count}
    except SQLAlchemyError as e:
        logger.error(f"Database error deleting all notifications: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to delete notifications. Please try again.")

@router.put("/{user_id}/read-all")
async def mark_all_notifications_read(user_id: str, db: Session = Depends(get_db), current_user: User = Depends(get_current_user_required)):
                                    
    cache.delete(_get_notifications_cache_key(user_id))

    try:
                                                         
        unread_count = db.query(Notification).filter(
            Notification.recipient_id == user_id,
            Notification.is_read == False
        ).count()

        if unread_count == 0:
            return {"message": "No unread notifications", "marked_count": 0}

        db.query(Notification).filter(
            Notification.recipient_id == user_id,
            Notification.is_read == False
        ).update({"is_read": True})

        db.commit()

        log_activity(
            db, user_id, "NOTIFICATIONS_MARKED_ALL_READ",
            details=f"Marked {unread_count} notifications as read",
            entity_type="notification",
            new_value={"marked_count": unread_count}
        )

        logger.info(f"Marked {unread_count} notifications as read for user {user_id}")
        return {"message": "All notifications marked as read", "marked_count": unread_count}
    except SQLAlchemyError as e:
        logger.error(f"Database error marking all notifications as read: {e}")
        db.rollback()
        raise HTTPException(status_code=500, detail="Failed to mark notifications as read. Please try again.")
