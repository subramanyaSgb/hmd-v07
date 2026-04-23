
import os
import httpx
from typing import Dict, Any
from datetime import datetime, date
from ..logger import logger

WHATSAPP_SERVICE_URL = os.getenv("WHATSAPP_SERVICE_URL", "http://localhost:3002")
WHATSAPP_TIMEOUT = float(os.getenv("WHATSAPP_TIMEOUT", "30"))

class WhatsAppService:

    def __init__(self):
        self.service_url = WHATSAPP_SERVICE_URL
        self.timeout = WHATSAPP_TIMEOUT
        self._client = None

    @property
    def client(self) -> httpx.AsyncClient:
        if self._client is None or self._client.is_closed:
            self._client = httpx.AsyncClient(
                base_url=self.service_url,
                timeout=self.timeout
            )
        return self._client

    async def _request(self, method: str, endpoint: str, **kwargs) -> Dict[str, Any]:
        try:
            response = await self.client.request(method, endpoint, **kwargs)
            response.raise_for_status()
            return response.json()
        except httpx.ConnectError:
            logger.error(f"WhatsApp service unavailable at {self.service_url}")
            return {"success": False, "error": "WhatsApp service unavailable"}
        except httpx.TimeoutException:
            logger.error(f"WhatsApp service timeout")
            return {"success": False, "error": "Request timeout"}
        except httpx.HTTPStatusError as e:
            logger.error(f"WhatsApp service HTTP error: {e}")
            try:
                return e.response.json()
            except Exception:
                return {"success": False, "error": str(e)}
        except Exception as e:
            logger.error(f"WhatsApp service error: {e}")
            return {"success": False, "error": str(e)}

    async def get_status(self) -> Dict[str, Any]:
        return await self._request("GET", "/status")

    async def get_qr_code(self) -> Dict[str, Any]:
        return await self._request("GET", "/qr")

    async def logout(self) -> Dict[str, Any]:
        return await self._request("POST", "/logout")

    async def reconnect(self) -> Dict[str, Any]:
        return await self._request("POST", "/reconnect")

    async def get_groups(self) -> Dict[str, Any]:
        return await self._request("GET", "/groups")

    async def check_number_exists(self, phone: str) -> Dict[str, Any]:
        return await self._request("GET", f"/check-number/{phone}")

    async def send_message(self, phone: str, message: str) -> Dict[str, Any]:
        return await self._request("POST", "/send", json={'phone': phone, 'message': message})

    async def send_group_message(self, group_jid: str, message: str) -> Dict[str, Any]:
        return await self._request("POST", "/send-group", json={'groupJid': group_jid, 'message': message})

    async def send_trip_notification(
        self,
        trip,                     
        notification_type: str,                                                     
        db
    ) -> Dict[str, Any]:
        from .whatsapp_templates import get_template
        from ..database.models import (
            WhatsAppGroupMapping, WhatsAppMessageLog, SystemConfig
        )

        results = {"success": True, "sent": 0, "failed": 0, "details": []}

        trip_id = trip.trip_id
        producer_id = trip.producer_id
        consumer_id = trip.consumer_id
        torpedo_id = trip.torpedo_id or "N/A"

        notification_key = notification_type.replace("trip_", "")

        try:
                                          
            config = db.query(SystemConfig).filter(
                SystemConfig.config_key == "WHATSAPP_ENABLED"
            ).first()
            if not config or config.config_value.lower() != "true":
                logger.info(f"WhatsApp notifications disabled - skipping trip notification for {trip_id}")
                return {"success": False, "error": "WhatsApp is not enabled"}

            notify_flag = {'assigned': 'notify_trip_assigned', 'started': 'notify_trip_started', 'completed': 'notify_trip_completed'}.get(notification_key, "notify_trip_assigned")

            logger.info(f"Sending WhatsApp {notification_key} notification for trip {trip_id}")

            producer_mapping = db.query(WhatsAppGroupMapping).filter(
                WhatsAppGroupMapping.mapping_type == "producer",
                WhatsAppGroupMapping.node_id == producer_id,
                WhatsAppGroupMapping.is_active == True,
                WhatsAppGroupMapping.notifications_enabled == True,
                getattr(WhatsAppGroupMapping, notify_flag) == True
            ).first()

            consumer_mapping = db.query(WhatsAppGroupMapping).filter(
                WhatsAppGroupMapping.mapping_type == "consumer",
                WhatsAppGroupMapping.node_id == consumer_id,
                WhatsAppGroupMapping.is_active == True,
                WhatsAppGroupMapping.notifications_enabled == True,
                getattr(WhatsAppGroupMapping, notify_flag) == True
            ).first()

            admin_mapping = db.query(WhatsAppGroupMapping).filter(
                WhatsAppGroupMapping.mapping_type == "admin",
                WhatsAppGroupMapping.is_active == True,
                WhatsAppGroupMapping.notifications_enabled == True,
                getattr(WhatsAppGroupMapping, notify_flag) == True
            ).first()

            template_data = {
                "trip_id": trip_id,
                "torpedo": torpedo_id,
                "producer": producer_id,
                "consumer": consumer_id,
                "time": datetime.now().strftime("%H:%M")
            }

            if producer_mapping:
                message = get_template(
                    notification_type,
                    producer_mapping.language_code,
                    **template_data
                )
                result = await self.send_group_message(producer_mapping.group_jid, message)

                log_entry = WhatsAppMessageLog(
                    recipient_type="group",
                    recipient_id=producer_mapping.group_jid,
                    recipient_name=producer_mapping.group_name,
                    message_type=notification_type,
                    message_content=message,
                    language_code=producer_mapping.language_code,
                    related_entity_type="trip",
                    related_entity_id=trip_id,
                    status="sent" if result.get("success") else "failed",
                    error_message=result.get("error"),
                    sent_at=datetime.utcnow() if result.get("success") else None
                )
                db.add(log_entry)

                if result.get("success"):
                    results["sent"] += 1
                else:
                    results["failed"] += 1
                results["details"].append({
                    "type": "producer_group",
                    "success": result.get("success", False)
                })

            if consumer_mapping:
                message = get_template(
                    notification_type,
                    consumer_mapping.language_code,
                    **template_data
                )
                result = await self.send_group_message(consumer_mapping.group_jid, message)

                log_entry = WhatsAppMessageLog(
                    recipient_type="group",
                    recipient_id=consumer_mapping.group_jid,
                    recipient_name=consumer_mapping.group_name,
                    message_type=notification_type,
                    message_content=message,
                    language_code=consumer_mapping.language_code,
                    related_entity_type="trip",
                    related_entity_id=trip_id,
                    status="sent" if result.get("success") else "failed",
                    error_message=result.get("error"),
                    sent_at=datetime.utcnow() if result.get("success") else None
                )
                db.add(log_entry)

                if result.get("success"):
                    results["sent"] += 1
                else:
                    results["failed"] += 1
                results["details"].append({
                    "type": "consumer_group",
                    "success": result.get("success", False)
                })

            db.commit()
            return results

        except Exception as e:
            logger.error(f"Error sending trip notification: {e}")
            return {"success": False, "error": str(e)}

    async def send_deviation_alert(
        self,
        trip_id: str,
        deviation_minutes: int,
        severity: str,                                  
        db
    ) -> Dict[str, Any]:
        from .whatsapp_templates import get_template
        from ..database.models import (
            WhatsAppGroupMapping, WhatsAppMessageLog, Trip, SystemConfig
        )

        results = {"success": True, "sent": 0, "failed": 0}

        try:
                                          
            config = db.query(SystemConfig).filter(
                SystemConfig.config_key == "WHATSAPP_ENABLED"
            ).first()
            if not config or config.config_value.lower() != "true":
                return {"success": False, "error": "WhatsApp is not enabled"}

            trip = db.query(Trip).filter(Trip.trip_id == trip_id).first()
            if not trip:
                return {"success": False, "error": "Trip not found"}

            mappings = db.query(WhatsAppGroupMapping).filter(
                WhatsAppGroupMapping.is_active == True,
                WhatsAppGroupMapping.notify_deviations == True
            ).all()

            relevant_mappings = [
                m for m in mappings
                if m.mapping_type == "admin" or
                   (m.mapping_type == "producer" and m.node_id == trip.producer_id) or
                   (m.mapping_type == "consumer" and m.node_id == trip.consumer_id)
            ]

            template_data = {
                "trip_id": trip_id,
                "delay_minutes": deviation_minutes,
                "severity": severity.upper(),
                "producer": trip.producer_id,
                "consumer": trip.consumer_id
            }

            for mapping in relevant_mappings:
                message = get_template(
                    "deviation_alert",
                    mapping.language_code,
                    **template_data
                )
                result = await self.send_group_message(mapping.group_jid, message)

                log_entry = WhatsAppMessageLog(
                    recipient_type="group",
                    recipient_id=mapping.group_jid,
                    recipient_name=mapping.group_name,
                    message_type="deviation",
                    message_content=message,
                    language_code=mapping.language_code,
                    related_entity_type="trip",
                    related_entity_id=trip_id,
                    status="sent" if result.get("success") else "failed",
                    error_message=result.get("error"),
                    sent_at=datetime.utcnow() if result.get("success") else None
                )
                db.add(log_entry)

                if result.get("success"):
                    results["sent"] += 1
                else:
                    results["failed"] += 1

            db.commit()
            return results

        except Exception as e:
            logger.error(f"Error sending deviation alert: {e}")
            return {"success": False, "error": str(e)}

    async def send_daily_report(self, db) -> Dict[str, Any]:
        from .whatsapp_templates import get_template
        from ..database.models import (
            WhatsAppGroupMapping, WhatsAppMessageLog, Trip, SystemConfig
        )
        from sqlalchemy import func

        results = {"success": True, "sent": 0, "failed": 0}

        try:
                                          
            config = db.query(SystemConfig).filter(
                SystemConfig.config_key == "WHATSAPP_ENABLED"
            ).first()
            if not config or config.config_value.lower() != "true":
                return {"success": False, "error": "WhatsApp is not enabled"}

            today = date.today()

            total_trips = db.query(Trip).filter(
                func.date(Trip.created_at) == today
            ).count()

            completed_trips = db.query(Trip).filter(
                func.date(Trip.created_at) == today,
                Trip.status == 9
            ).count()

            mappings = db.query(WhatsAppGroupMapping).filter(
                WhatsAppGroupMapping.is_active == True,
                WhatsAppGroupMapping.notify_daily_report == True
            ).all()

            for mapping in mappings:
                                                       
                if mapping.mapping_type == "admin":
                                                  
                    template_data = {
                        "date": today.strftime("%d-%m-%Y"),
                        "total_trips": total_trips,
                        "completed_trips": completed_trips,
                        "pending_trips": total_trips - completed_trips
                    }
                    message = get_template("daily_report_admin", mapping.language_code, **template_data)

                elif mapping.mapping_type == "producer" and mapping.node_id:
                                              
                    producer_trips = db.query(Trip).filter(
                        func.date(Trip.created_at) == today,
                        Trip.producer_id == mapping.node_id
                    ).count()
                    producer_completed = db.query(Trip).filter(
                        func.date(Trip.created_at) == today,
                        Trip.producer_id == mapping.node_id,
                        Trip.status == 9
                    ).count()

                    template_data = {
                        "date": today.strftime("%d-%m-%Y"),
                        "node_id": mapping.node_id,
                        "total_trips": producer_trips,
                        "completed_trips": producer_completed
                    }
                    message = get_template("daily_report_producer", mapping.language_code, **template_data)

                elif mapping.mapping_type == "consumer" and mapping.node_id:
                                              
                    consumer_trips = db.query(Trip).filter(
                        func.date(Trip.created_at) == today,
                        Trip.consumer_id == mapping.node_id
                    ).count()
                    consumer_completed = db.query(Trip).filter(
                        func.date(Trip.created_at) == today,
                        Trip.consumer_id == mapping.node_id,
                        Trip.status == 9
                    ).count()

                    template_data = {
                        "date": today.strftime("%d-%m-%Y"),
                        "node_id": mapping.node_id,
                        "total_trips": consumer_trips,
                        "completed_trips": consumer_completed
                    }
                    message = get_template("daily_report_consumer", mapping.language_code, **template_data)
                else:
                    continue

                result = await self.send_group_message(mapping.group_jid, message)

                log_entry = WhatsAppMessageLog(
                    recipient_type="group",
                    recipient_id=mapping.group_jid,
                    recipient_name=mapping.group_name,
                    message_type="daily_report",
                    message_content=message,
                    language_code=mapping.language_code,
                    related_entity_type="report",
                    related_entity_id=today.isoformat(),
                    status="sent" if result.get("success") else "failed",
                    error_message=result.get("error"),
                    sent_at=datetime.utcnow() if result.get("success") else None
                )
                db.add(log_entry)

                if result.get("success"):
                    results["sent"] += 1
                else:
                    results["failed"] += 1

            db.commit()
            logger.info(f"Daily report sent: {results['sent']} success, {results['failed']} failed")
            return results

        except Exception as e:
            logger.error(f"Error sending daily report: {e}")
            return {"success": False, "error": str(e)}

whatsapp_service = WhatsAppService()
