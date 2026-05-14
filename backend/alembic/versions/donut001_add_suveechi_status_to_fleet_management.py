"""add suveechi_status column to fleet_management

Mirrors the raw SuVeechi `vw_unit_status_ist.status` value (Idle / Moving /
Ign Off) on every sync tick, distinct from the existing `status` column
which holds the mapped value (Idle → Operating, Moving → Moving, Ign Off →
Maintenance) and is overridable by operators via the Torpedo Management UI.

The Fleet Donut on the V2 Dashboard reads `suveechi_status` directly for
its bucket counts — no calculation, no manual-override merging, just a
GROUP BY on the raw source value.

Revision ID: donut001
Revises: hts002
Create Date: 2026-05-14
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


revision: str = 'donut001'
down_revision: Union[str, Sequence[str], None] = 'hts002'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.add_column(
        'fleet_management',
        sa.Column('suveechi_status', sa.String(length=20), nullable=True),
    )


def downgrade() -> None:
    op.drop_column('fleet_management', 'suveechi_status')
