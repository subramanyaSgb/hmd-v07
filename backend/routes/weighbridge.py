from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from typing import Optional

from ..database.engine import get_db
from ..database.models import Weighbridge, WeighbridgeRecord, Trip
from ..utils.security import get_current_user, require_roles
from ..logger import logger

router = APIRouter(prefix="/api/weighbridges", tags=["weighbridges"])

@router.get("")
async def get_weighbridges(
    status: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    query = db.query(Weighbridge).filter(Weighbridge.is_active == True)
    if status:
        query = query.filter(Weighbridge.status == status)
    weighbridges = query.order_by(Weighbridge.name).all()
    return {
        "success": True,
        "data": [_wb_to_dict(wb) for wb in weighbridges]
    }

@router.post("")
async def create_weighbridge(
    data: dict,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "trs"))
):
    name = data.get("name")
    if not name:
        raise HTTPException(status_code=400, detail="Weighbridge name is required")

    existing = db.query(Weighbridge).filter(Weighbridge.name == name).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"Weighbridge '{name}' already exists")

    wb = Weighbridge(
        name=name,
        location_name=data.get("location_name"),
        x=data.get("x"),
        y=data.get("y"),
        status=data.get("status", "Operating"),
        is_active=True
    )
    db.add(wb)
    db.commit()
    db.refresh(wb)

    logger.info(f"Weighbridge '{name}' created by {current_user.username}")
    return {"success": True, "data": _wb_to_dict(wb)}

@router.put("/{wb_id}")
async def update_weighbridge(
    wb_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "trs"))
):
    wb = db.query(Weighbridge).filter(Weighbridge.id == wb_id).first()
    if not wb:
        raise HTTPException(status_code=404, detail="Weighbridge not found")

    for field in ["name", "location_name", "x", "y"]:
        if field in data and data[field] is not None:
            setattr(wb, field, data[field])

    db.commit()
    db.refresh(wb)
    return {"success": True, "data": _wb_to_dict(wb)}

@router.put("/{wb_id}/status")
async def update_weighbridge_status(
    wb_id: int,
    data: dict,
    db: Session = Depends(get_db),
    current_user=Depends(require_roles("admin", "trs"))
):
    wb = db.query(Weighbridge).filter(Weighbridge.id == wb_id).first()
    if not wb:
        raise HTTPException(status_code=404, detail="Weighbridge not found")

    new_status = data.get("status")
    if new_status not in ("Operating", "Maintenance", "Shutdown"):
        raise HTTPException(status_code=400, detail="Invalid status. Must be Operating, Maintenance, or Shutdown")

    old_status = wb.status
    wb.status = new_status
    db.commit()

    logger.info(f"Weighbridge '{wb.name}' status changed: {old_status} -> {new_status} by {current_user.username}")
    return {"success": True, "data": _wb_to_dict(wb)}

records_router = APIRouter(prefix="/api/weighbridge-records", tags=["weighbridge-records"])

@records_router.get("/{trip_id}")
async def get_weighbridge_records_for_trip(
    trip_id: str,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    records = db.query(WeighbridgeRecord).filter(
        WeighbridgeRecord.trip_id == trip_id
    ).order_by(WeighbridgeRecord.recorded_at).all()

    return {
        "success": True,
        "data": [_record_to_dict(r) for r in records]
    }

@records_router.get("/summary")
async def get_weighbridge_summary(
    start_date: Optional[str] = None,
    end_date: Optional[str] = None,
    weighbridge_id: Optional[int] = None,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    query = db.query(WeighbridgeRecord)

    if start_date:
        query = query.filter(WeighbridgeRecord.recorded_at >= start_date)
    if end_date:
        query = query.filter(WeighbridgeRecord.recorded_at <= end_date)
    if weighbridge_id:
        query = query.filter(WeighbridgeRecord.weighbridge_id == weighbridge_id)

    tare_records = query.filter(WeighbridgeRecord.record_type == "tare").all()
    gross_records = query.filter(WeighbridgeRecord.record_type == "gross").all()

    tare_weights = [r.weight_kg for r in tare_records if r.weight_kg]
    gross_weights = [r.weight_kg for r in gross_records if r.weight_kg]

    return {
        "success": True,
        "data": {
            "total_records": len(tare_records) + len(gross_records),
            "tare_count": len(tare_records),
            "gross_count": len(gross_records),
            "avg_tare_kg": sum(tare_weights) / len(tare_weights) if tare_weights else 0,
            "avg_gross_kg": sum(gross_weights) / len(gross_weights) if gross_weights else 0,
            "avg_net_kg": (sum(gross_weights) / len(gross_weights) - sum(tare_weights) / len(tare_weights)) if gross_weights and tare_weights else 0,
        }
    }

@records_router.post("")
async def create_weighbridge_record(
    data: dict,
    db: Session = Depends(get_db),
    current_user=Depends(get_current_user)
):
    trip_id = data.get("trip_id")
    record_type = data.get("record_type")
    weight_kg = data.get("weight_kg")

    if not all([trip_id, record_type, weight_kg]):
        raise HTTPException(status_code=400, detail="trip_id, record_type, and weight_kg are required")

    if record_type not in ("tare", "gross"):
        raise HTTPException(status_code=400, detail="record_type must be 'tare' or 'gross'")

    trip = db.query(Trip).filter(Trip.trip_id == trip_id, Trip.deleted_at.is_(None)).first()
    if not trip:
        raise HTTPException(status_code=404, detail="Trip not found")

    existing = db.query(WeighbridgeRecord).filter(
        WeighbridgeRecord.trip_id == trip_id,
        WeighbridgeRecord.record_type == record_type
    ).first()
    if existing:
        raise HTTPException(status_code=409, detail=f"{record_type} record already exists for this trip")

    record = WeighbridgeRecord(
        trip_id=trip_id,
        torpedo_id=trip.torpedo_id,
        weighbridge_id=data.get("weighbridge_id"),
        record_type=record_type,
        weight_kg=weight_kg,
        cast_id=data.get("cast_id"),
        furnace_id=data.get("furnace_id"),
        recorded_by=current_user.username,
        source=data.get("source", "manual")
    )
    db.add(record)

    if record_type == "tare":
        trip.tare_weight_kg = weight_kg
    elif record_type == "gross":
        trip.gross_weight_kg = weight_kg
        if trip.tare_weight_kg is not None:
            trip.net_weight_kg = weight_kg - trip.tare_weight_kg

    db.commit()
    db.refresh(record)

    return {"success": True, "data": _record_to_dict(record)}

def _wb_to_dict(wb: Weighbridge) -> dict:
    return {
        "id": wb.id,
        "name": wb.name,
        "location_name": wb.location_name,
        "x": wb.x,
        "y": wb.y,
        "status": wb.status,
        "is_active": wb.is_active,
        "created_at": wb.created_at.isoformat() if wb.created_at else None,
        "last_updated": wb.last_updated.isoformat() if wb.last_updated else None,
    }

def _record_to_dict(r: WeighbridgeRecord) -> dict:
    return {
        "id": r.id,
        "trip_id": r.trip_id,
        "torpedo_id": r.torpedo_id,
        "weighbridge_id": r.weighbridge_id,
        "record_type": r.record_type,
        "weight_kg": r.weight_kg,
        "cast_id": r.cast_id,
        "furnace_id": r.furnace_id,
        "recorded_by": r.recorded_by,
        "recorded_at": r.recorded_at.isoformat() if r.recorded_at else None,
        "source": r.source,
    }
