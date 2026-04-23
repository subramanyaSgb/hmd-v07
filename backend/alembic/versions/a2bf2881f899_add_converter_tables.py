from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect as sa_inspect

revision: str = 'a2bf2881f899'
down_revision: Union[str, Sequence[str], None] = 'd4e5f6a7b8c9'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def _table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa_inspect(bind)
    return table_name in inspector.get_table_names()

def upgrade() -> None:
                                                                  
    if not _table_exists('converters'):
        op.create_table(
            'converters',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('consumer_id', sa.String(), nullable=True),
            sa.Column('name', sa.String(), nullable=True),
            sa.Column('capacity_tons', sa.Float(), nullable=True),
            sa.Column('max_heats', sa.Integer(), nullable=True),
            sa.Column('current_heats', sa.Integer(), nullable=True),
            sa.Column('status', sa.String(), nullable=True),
            sa.Column('status_since', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('last_updated', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('deleted_at', sa.DateTime(timezone=True), nullable=True),
            sa.PrimaryKeyConstraint('id'),
            sa.UniqueConstraint('consumer_id', 'name', name='_consumer_converter_name_uc'),
        )
        op.create_index(op.f('ix_converters_id'), 'converters', ['id'], unique=False)
        op.create_index('idx_converter_consumer_status', 'converters', ['consumer_id', 'status'], unique=False)

    if not _table_exists('converter_status_history'):
        op.create_table(
            'converter_status_history',
            sa.Column('id', sa.Integer(), nullable=False),
            sa.Column('converter_id', sa.Integer(), nullable=True),
            sa.Column('old_status', sa.String(), nullable=True),
            sa.Column('new_status', sa.String(), nullable=True),
            sa.Column('changed_by', sa.String(), nullable=True),
            sa.Column('changed_by_role', sa.String(), nullable=True),
            sa.Column('reason', sa.String(), nullable=True),
            sa.Column('changed_at', sa.DateTime(timezone=True), server_default=sa.text('now()'), nullable=True),
            sa.Column('ended_at', sa.DateTime(timezone=True), nullable=True),
            sa.Column('heats_at_change', sa.Integer(), nullable=True),
            sa.ForeignKeyConstraint(['converter_id'], ['converters.id'], ondelete='CASCADE'),
            sa.PrimaryKeyConstraint('id'),
        )
        op.create_index(op.f('ix_converter_status_history_id'), 'converter_status_history', ['id'], unique=False)
        op.create_index('idx_converter_history_time', 'converter_status_history', ['converter_id', 'changed_at'], unique=False)

def downgrade() -> None:
    op.drop_table('converter_status_history')
    op.drop_table('converters')
