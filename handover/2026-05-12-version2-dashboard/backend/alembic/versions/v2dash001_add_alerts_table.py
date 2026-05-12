"""add alerts table for v2 dashboard alert feed

Revision ID: v2dash001
Revises: c3e8d219a4b1
Create Date: 2026-05-12

Adds the `alerts` table backing the Alerts & Exceptions section of the
new Version 2 dashboard. Rows are inserted by `utils/alert_detector.py`
which is invoked from the WBATNGL trip sync (chemistry / cold-metal /
dwell / no-sms-ack) and the SuVeechi GPS sync (gps-stale / battery).

Parent revision picked 2026-05-12 23:20:
  Originally set to 'h1i2j3k4l5m6' but that already had a child
  (8ccb1a387ca7 from the WBATNGL mirror chain) so we created a branch.
  Real latest pre-existing head at sprint time was c3e8d219a4b1
  (add_fleet_live_locations_fleet_id_index). Re-parented here.

Design doc: docs/plans/2026-05-12-version2-dashboard-design.md
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'v2dash001'
down_revision: Union[str, Sequence[str], None] = 'c3e8d219a4b1'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        'alerts',
        sa.Column('id', sa.Integer(), nullable=False),
        sa.Column('kind', sa.String(length=20), nullable=True),
        sa.Column('severity', sa.String(length=10), nullable=True),
        sa.Column('tag', sa.String(length=40), nullable=True),
        sa.Column('message', sa.String(length=255), nullable=True),
        sa.Column('location', sa.String(length=80), nullable=True),
        sa.Column('torpedo_id', sa.String(length=20), nullable=True),
        sa.Column('trip_id', sa.String(length=50), nullable=True),
        sa.Column('source', sa.String(length=20), nullable=True),
        sa.Column('destination', sa.String(length=50), nullable=True),
        sa.Column('raw_value', sa.Float(), nullable=True),
        sa.Column('threshold', sa.Float(), nullable=True),
        sa.Column('detected_at', sa.DateTime(timezone=True),
                  server_default=sa.text('now()'), nullable=True),
        sa.Column('acknowledged_at', sa.DateTime(timezone=True), nullable=True),
        sa.Column('acknowledged_by', sa.String(length=40), nullable=True),
        sa.PrimaryKeyConstraint('id'),
    )

    # Lookups by id
    op.create_index('ix_alerts_id', 'alerts', ['id'], unique=False)

    # Filter by kind in feed queries
    op.create_index('ix_alerts_kind', 'alerts', ['kind'], unique=False)

    # Per-torpedo lookups (drill-down)
    op.create_index('ix_alerts_torpedo_id', 'alerts', ['torpedo_id'], unique=False)

    # Per-trip lookups
    op.create_index('ix_alerts_trip_id', 'alerts', ['trip_id'], unique=False)

    # Default chronological order
    op.create_index('ix_alerts_detected_at', 'alerts', ['detected_at'], unique=False)

    # Dedupe lookup hot path — detector queries
    # WHERE kind = ? AND torpedo_id = ? AND acknowledged_at IS NULL
    # AND detected_at > now() - interval '30 min'
    op.create_index(
        'idx_alerts_kind_torpedo_active',
        'alerts',
        ['kind', 'torpedo_id', 'acknowledged_at'],
        unique=False,
    )

    # Feed listing — ORDER BY detected_at DESC LIMIT 50
    op.execute(
        "CREATE INDEX IF NOT EXISTS "
        "idx_alerts_detected_desc "
        "ON alerts (detected_at DESC)"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_alerts_detected_desc")
    op.drop_index('idx_alerts_kind_torpedo_active', table_name='alerts')
    op.drop_index('ix_alerts_detected_at', table_name='alerts')
    op.drop_index('ix_alerts_trip_id', table_name='alerts')
    op.drop_index('ix_alerts_torpedo_id', table_name='alerts')
    op.drop_index('ix_alerts_kind', table_name='alerts')
    op.drop_index('ix_alerts_id', table_name='alerts')
    op.drop_table('alerts')
