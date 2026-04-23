from sqlalchemy.orm import Session

from ..database.models import SystemConfig, FleetManagement


def get_config(db: Session, key: str, fallback: str) -> str:
    cfg = db.query(SystemConfig).filter(SystemConfig.config_key == key).first()
    return cfg.config_value if cfg else fallback


def get_avg_capacity(db: Session) -> float:
    active_torpedoes = db.query(FleetManagement).filter(
        FleetManagement.type == 'torpedo',
        FleetManagement.status.in_(["Operating", "Assigned"])
    ).all()
    if active_torpedoes:
        return sum((f.capacity or 0) for f in active_torpedoes) / len(active_torpedoes)
    return float(get_config(db, "NOMINAL_CAPACITY", "150.0"))
