from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = 'b2c3d4e5f6a7'
down_revision: Union[str, Sequence[str], None] = 'a1b2c3d4e5f6'
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

    if table_exists('locations_coordinates'):
        if not column_exists('locations_coordinates', 'user_id'):
            op.add_column('locations_coordinates',
                sa.Column('user_id', sa.String(), nullable=True))

        if not column_exists('locations_coordinates', 'status'):
            op.add_column('locations_coordinates',
                sa.Column('status', sa.String(), nullable=True, server_default='Operating'))

        op.execute("UPDATE locations_coordinates SET status = 'Operating' WHERE status IS NULL")

    if table_exists('trips'):
        if not column_exists('trips', 'cycle_time_minutes'):
            op.add_column('trips',
                sa.Column('cycle_time_minutes', sa.Integer(), nullable=True))

        if not column_exists('trips', 'last_updated'):
            op.add_column('trips',
                sa.Column('last_updated', sa.DateTime(timezone=True),
                         server_default=sa.func.now(), nullable=True))

    if table_exists('daily_plans'):
        if not column_exists('daily_plans', 'status'):
            op.add_column('daily_plans',
                sa.Column('status', sa.String(), nullable=True, server_default='Primary'))

    if table_exists('distribution_assignments'):
        if not column_exists('distribution_assignments', 'status'):
            op.add_column('distribution_assignments',
                sa.Column('status', sa.String(), nullable=True, server_default='Proposed'))

    if table_exists('fleet_management'):
        if not column_exists('fleet_management', 'status'):
            op.add_column('fleet_management',
                sa.Column('status', sa.String(), nullable=True, server_default='Operating'))

        if not column_exists('fleet_management', 'capacity'):
            op.add_column('fleet_management',
                sa.Column('capacity', sa.Float(), nullable=True))

    if not table_exists('maintenance_schedules'):
        op.create_table(
            'maintenance_schedules',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('node_id', sa.String(), nullable=False),
            sa.Column('start_date', sa.Date(), nullable=False),
            sa.Column('end_date', sa.Date(), nullable=False),
            sa.Column('reason', sa.String(), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True),
                     server_default=sa.func.now(), nullable=True),
        )

    if not index_exists('ix_trips_status'):
        op.create_index('ix_trips_status', 'trips', ['status'])

    if not index_exists('ix_trips_date_status'):
        op.create_index('ix_trips_date_status', 'trips', ['created_at', 'status'])

    if not index_exists('ix_daily_plans_date_status'):
        op.create_index('ix_daily_plans_date_status', 'daily_plans', ['date', 'status'])

    if not index_exists('ix_distribution_assignments_date_status'):
        op.create_index('ix_distribution_assignments_date_status',
                       'distribution_assignments', ['date', 'status'])

def downgrade() -> None:

    if index_exists('ix_distribution_assignments_date_status'):
        op.drop_index('ix_distribution_assignments_date_status')

    if index_exists('ix_daily_plans_date_status'):
        op.drop_index('ix_daily_plans_date_status')

    if index_exists('ix_trips_date_status'):
        op.drop_index('ix_trips_date_status')

    if index_exists('ix_trips_status'):
        op.drop_index('ix_trips_status')

    if table_exists('maintenance_schedules'):
        op.drop_table('maintenance_schedules')

