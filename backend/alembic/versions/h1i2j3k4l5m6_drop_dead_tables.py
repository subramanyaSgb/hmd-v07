from alembic import op
from sqlalchemy import inspect

revision = 'h1i2j3k4l5m6'
down_revision = '3878275160e7'
branch_labels = None
depends_on = None

DEAD_TABLES = [
    'geofences',
    'achievements',
    'anomaly_alerts',
    'audit_logs',
    'cost_configs',
    'location_queues',
    'performance_scores',
    'safety_checklists',
    'safety_incidents',
    'trip_patterns',
]


def upgrade() -> None:
    conn = op.get_bind()
    insp = inspect(conn)
    existing_tables = insp.get_table_names()

    for table in DEAD_TABLES:
        if table in existing_tables:
            op.drop_table(table)


def downgrade() -> None:
    pass
