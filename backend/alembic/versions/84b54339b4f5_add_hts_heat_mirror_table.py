"""add hts_heat_mirror table

Revision ID: 84b54339b4f5
Revises: 8ccb1a387ca7
Create Date: 2026-05-11 16:15:05.418370

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '84b54339b4f5'
down_revision: Union[str, Sequence[str], None] = '8ccb1a387ca7'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.create_table(
        'hts_heat_mirror',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('heat_no', sa.String(20), nullable=False, unique=True),
        sa.Column('converter_no', sa.String(1)),
        sa.Column('sms', sa.String(10)),
        sa.Column('torpedo_no', sa.String(15)),
        sa.Column('torpedo_no_raw', sa.String(15)),
        sa.Column('hotmetal_qty', sa.Numeric(10, 3)),
        sa.Column('torpedo_qty', sa.Numeric(10, 3)),
        sa.Column('torpedo_in_time', sa.DateTime),
        sa.Column('torpedo_out_time', sa.DateTime),
        sa.Column('converter_life', sa.Integer),
        sa.Column('synced_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_hts_heat_mirror_torpedo_in_time',
                    'hts_heat_mirror', ['torpedo_in_time'])
    op.create_index('ix_hts_heat_mirror_torpedo_out_time',
                    'hts_heat_mirror', ['torpedo_out_time'])
    op.create_index('ix_hts_heat_mirror_torpedo_no_in_time',
                    'hts_heat_mirror', ['torpedo_no', 'torpedo_in_time'])


def downgrade():
    op.drop_index('ix_hts_heat_mirror_torpedo_no_in_time')
    op.drop_index('ix_hts_heat_mirror_torpedo_out_time')
    op.drop_index('ix_hts_heat_mirror_torpedo_in_time')
    op.drop_table('hts_heat_mirror')
