from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = 'c3d4e5f6a7b8'
down_revision: Union[str, Sequence[str], None] = 'b2c3d4e5f6a7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    try:
        columns = [col['name'] for col in inspector.get_columns(table_name)]
        return column_name in columns
    except Exception:
        return False

def table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()

def index_exists(index_name: str) -> bool:
    bind = op.get_bind()
    try:
        result = bind.execute(sa.text(
            f"SELECT 1 FROM pg_indexes WHERE indexname = '{index_name}'"
        ))
        return result.fetchone() is not None
    except Exception:
        return False

def upgrade() -> None:

    if table_exists('users'):
        if not column_exists('users', 'deleted_at'):
            op.add_column('users',
                sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))

        if not index_exists('ix_users_deleted_at'):
            op.create_index('ix_users_deleted_at', 'users', ['deleted_at'])

    if table_exists('fleet_management'):
        if not column_exists('fleet_management', 'deleted_at'):
            op.add_column('fleet_management',
                sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))

        if not index_exists('ix_fleet_management_deleted_at'):
            op.create_index('ix_fleet_management_deleted_at', 'fleet_management', ['deleted_at'])

    if table_exists('trips'):
        if not column_exists('trips', 'deleted_at'):
            op.add_column('trips',
                sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True))

        if not index_exists('ix_trips_deleted_at'):
            op.create_index('ix_trips_deleted_at', 'trips', ['deleted_at'])

        if not index_exists('ix_trips_deleted_status'):
            op.create_index('ix_trips_deleted_status', 'trips', ['deleted_at', 'status'])

def downgrade() -> None:

    if index_exists('ix_trips_deleted_status'):
        op.drop_index('ix_trips_deleted_status')

    if index_exists('ix_trips_deleted_at'):
        op.drop_index('ix_trips_deleted_at')

    if index_exists('ix_fleet_management_deleted_at'):
        op.drop_index('ix_fleet_management_deleted_at')

    if index_exists('ix_users_deleted_at'):
        op.drop_index('ix_users_deleted_at')

    if table_exists('trips') and column_exists('trips', 'deleted_at'):
        op.drop_column('trips', 'deleted_at')

    if table_exists('fleet_management') and column_exists('fleet_management', 'deleted_at'):
        op.drop_column('fleet_management', 'deleted_at')

    if table_exists('users') and column_exists('users', 'deleted_at'):
        op.drop_column('users', 'deleted_at')
