
from datetime import datetime, timezone
from typing import TypeVar, Type
from sqlalchemy.orm import Session, Query

T = TypeVar('T')

def active_only(query: Query) -> Query:
                                        
    model = query.column_descriptions[0]['type']

    if hasattr(model, 'deleted_at'):
        return query.filter(model.deleted_at.is_(None))

    return query

def soft_delete(db: Session, record) -> None:
    if hasattr(record, 'deleted_at'):
        record.deleted_at = datetime.now(timezone.utc)
    else:
        raise ValueError(f"Model {type(record).__name__} does not support soft delete")

def restore(db: Session, record) -> None:
    if hasattr(record, 'deleted_at'):
        record.deleted_at = None
    else:
        raise ValueError(f"Model {type(record).__name__} does not support soft delete")

def is_deleted(record) -> bool:
    if hasattr(record, 'deleted_at'):
        return record.deleted_at is not None
    return False

def get_active(db: Session, model: Type[T], **filters) -> list[T]:
    query = db.query(model)

    if hasattr(model, 'deleted_at'):
        query = query.filter(model.deleted_at.is_(None))

    for key, value in filters.items():
        if hasattr(model, key):
            query = query.filter(getattr(model, key) == value)

    return query.all()

def get_active_by_id(db: Session, model: Type[T], id_value, id_column: str = 'id') -> T | None:
    query = db.query(model).filter(getattr(model, id_column) == id_value)

    if hasattr(model, 'deleted_at'):
        query = query.filter(model.deleted_at.is_(None))

    return query.first()

def include_deleted(query: Query) -> Query:
    return query
