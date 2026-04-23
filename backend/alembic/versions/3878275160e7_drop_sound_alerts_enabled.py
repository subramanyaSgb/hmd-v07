"""drop sound_alerts_enabled

Revision ID: 3878275160e7
Revises: g1h2i3j4k5l6
Create Date: 2026-04-20 09:38:38.044684

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '3878275160e7'
down_revision: Union[str, Sequence[str], None] = 'g1h2i3j4k5l6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    with op.batch_alter_table("deviation_threshold_configs") as batch_op:
        batch_op.drop_column("sound_alerts_enabled")


def downgrade() -> None:
    with op.batch_alter_table("deviation_threshold_configs") as batch_op:
        batch_op.add_column(sa.Column("sound_alerts_enabled", sa.Boolean(), nullable=True, server_default=sa.true()))
