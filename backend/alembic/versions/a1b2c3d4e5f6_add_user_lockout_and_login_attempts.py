from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa
from sqlalchemy import inspect

revision: str = 'a1b2c3d4e5f6'
down_revision: Union[str, Sequence[str], None] = '56313bed140f'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def column_exists(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    columns = [col['name'] for col in inspector.get_columns(table_name)]
    return column_name in columns

def table_exists(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = inspect(bind)
    return table_name in inspector.get_table_names()

def upgrade() -> None:

    if not column_exists('users', 'failed_login_attempts'):
        op.add_column('users', sa.Column('failed_login_attempts', sa.Integer(), nullable=True, server_default='0'))

    if not column_exists('users', 'locked_until'):
        op.add_column('users', sa.Column('locked_until', sa.DateTime(timezone=True), nullable=True))

    if not table_exists('login_attempts'):
        op.create_table(
            'login_attempts',
            sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
            sa.Column('username', sa.String(), nullable=False, index=True),
            sa.Column('ip_address', sa.String(), nullable=True, index=True),
            sa.Column('user_agent', sa.String(), nullable=True),
            sa.Column('success', sa.Boolean(), nullable=False, server_default='false'),
            sa.Column('failure_reason', sa.String(), nullable=True),
            sa.Column('timestamp', sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now(), index=True),
        )

def downgrade() -> None:

    if table_exists('login_attempts'):
        op.drop_table('login_attempts')

    if column_exists('users', 'locked_until'):
        op.drop_column('users', 'locked_until')

    if column_exists('users', 'failed_login_attempts'):
        op.drop_column('users', 'failed_login_attempts')
