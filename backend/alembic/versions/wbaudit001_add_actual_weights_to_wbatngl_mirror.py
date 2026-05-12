"""add net_weight_actual + tare_weight_actual to wbatngl_trip_mirror

Revision ID: wbaudit001
Revises: livetrack001
Create Date: 2026-05-13

Captures the SMS-side actual weights from WBATNGL upstream (Oracle
columns `NET_WEIGHT_ACTUAL` and `TARE_WEIGHT_ACTUAL`) that we've been
fetching but dropping on ingest. Required by the new Weighbridge Audit
page's variance reconciliation (Net WB vs Net SMS, drift per WB).

Both columns nullable for back-compat — existing rows pass with NULL
until the next 60s WBATNGL sync tick re-upserts them with the actuals
filled in.

Design doc: docs/plans/2026-05-13-weighbridge-audit-design.md
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'wbaudit001'
down_revision: Union[str, Sequence[str], None] = 'livetrack001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'wbatngl_trip_mirror',
        sa.Column('net_weight_actual', sa.Float(), nullable=True),
    )
    op.add_column(
        'wbatngl_trip_mirror',
        sa.Column('tare_weight_actual', sa.Float(), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('wbatngl_trip_mirror', 'tare_weight_actual')
    op.drop_column('wbatngl_trip_mirror', 'net_weight_actual')
