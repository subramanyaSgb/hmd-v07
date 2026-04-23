from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'e5f6a7b8c9d0'
down_revision: Union[str, Sequence[str], None] = 'a2bf2881f899'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
    op.add_column('trips', sa.Column('converter_id', sa.Integer(), nullable=True))
    op.create_foreign_key(
        'fk_trips_converter_id',
        'trips', 'converters',
        ['converter_id'], ['id'],
        ondelete='SET NULL'
    )
    op.create_index('idx_trips_converter_id', 'trips', ['converter_id'])

def downgrade() -> None:
    op.drop_index('idx_trips_converter_id', table_name='trips')
    op.drop_constraint('fk_trips_converter_id', 'trips', type_='foreignkey')
    op.drop_column('trips', 'converter_id')
