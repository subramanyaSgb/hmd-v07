from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa

revision: str = 'f1g2h3i4j5k6'
down_revision: Union[str, Sequence[str], None] = 'e5f6a7b8c9d0'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None

def upgrade() -> None:
                                                       
    op.execute("UPDATE trips SET status = 15 WHERE status = 11")           
    op.execute("UPDATE trips SET status = 14 WHERE status = 10")            
    op.execute("UPDATE trips SET status = 13 WHERE status = 9")              
    op.execute("UPDATE trips SET status = 12 WHERE status = 8")                    
    op.execute("UPDATE trips SET status = 11 WHERE status = 7")                      
    op.execute("UPDATE trips SET status = 10 WHERE status = 6")                     
    op.execute("UPDATE trips SET status = 7 WHERE status = 5")                     
    op.execute("UPDATE trips SET status = 6 WHERE status = 4")                   
    op.execute("UPDATE trips SET status = 5 WHERE status = 3")                     
    op.execute("UPDATE trips SET status = 4 WHERE status = 2")                      
                                                   
    op.create_table(
        'weighbridges',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(), nullable=False, unique=True),
        sa.Column('location_name', sa.String(), nullable=True),
        sa.Column('x', sa.Float(), nullable=True),
        sa.Column('y', sa.Float(), nullable=True),
        sa.Column('status', sa.String(), server_default='Operating'),
        sa.Column('is_active', sa.Boolean(), server_default='true'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_updated', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.create_table(
        'weighbridge_records',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('trip_id', sa.String(), sa.ForeignKey('trips.trip_id', ondelete='CASCADE'), nullable=False, index=True),
        sa.Column('torpedo_id', sa.String(), sa.ForeignKey('fleet_management.fleet_id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('weighbridge_id', sa.Integer(), sa.ForeignKey('weighbridges.id', ondelete='SET NULL'), nullable=True, index=True),
        sa.Column('record_type', sa.String(), nullable=False, index=True),
        sa.Column('weight_kg', sa.Float(), nullable=False),
        sa.Column('cast_id', sa.String(), nullable=True),
        sa.Column('furnace_id', sa.String(), nullable=True),
        sa.Column('recorded_by', sa.String(), nullable=False),
        sa.Column('recorded_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('source', sa.String(), server_default='manual'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.UniqueConstraint('trip_id', 'record_type', name='_trip_record_type_uc'),
    )

    op.create_table(
        'geofences',
        sa.Column('id', sa.Integer(), primary_key=True, autoincrement=True),
        sa.Column('name', sa.String(), nullable=False, index=True),
        sa.Column('zone_type', sa.String(), nullable=False, index=True),
        sa.Column('reference_id', sa.String(), nullable=False, index=True),
        sa.Column('latitude', sa.Float(), nullable=False),
        sa.Column('longitude', sa.Float(), nullable=False),
        sa.Column('radius_meters', sa.Float(), nullable=False),
        sa.Column('trigger_status_entry', sa.Integer(), nullable=True),
        sa.Column('trigger_status_exit', sa.Integer(), nullable=True),
        sa.Column('is_active', sa.Boolean(), server_default='false'),
        sa.Column('created_at', sa.DateTime(timezone=True), server_default=sa.func.now()),
        sa.Column('last_updated', sa.DateTime(timezone=True), server_default=sa.func.now()),
    )

    op.add_column('trips', sa.Column('wb_tare_entry_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trips', sa.Column('wb_tare_recorded_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trips', sa.Column('wb_gross_entry_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trips', sa.Column('wb_gross_recorded_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trips', sa.Column('expected_wb_tare_entry_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trips', sa.Column('expected_wb_tare_recorded_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trips', sa.Column('expected_wb_gross_entry_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trips', sa.Column('expected_wb_gross_recorded_at', sa.DateTime(timezone=True), nullable=True))
    op.add_column('trips', sa.Column('tare_weight_kg', sa.Float(), nullable=True))
    op.add_column('trips', sa.Column('gross_weight_kg', sa.Float(), nullable=True))
    op.add_column('trips', sa.Column('net_weight_kg', sa.Float(), nullable=True))
    op.add_column('trips', sa.Column('equipment_id', sa.Integer(), sa.ForeignKey('converters.id', ondelete='SET NULL'), nullable=True))

    op.add_column('converters', sa.Column('equipment_type', sa.String(), server_default='BOF', nullable=True))

def downgrade() -> None:
                                                                       
    op.drop_column('converters', 'equipment_type')

    op.drop_column('trips', 'equipment_id')
    op.drop_column('trips', 'net_weight_kg')
    op.drop_column('trips', 'gross_weight_kg')
    op.drop_column('trips', 'tare_weight_kg')
    op.drop_column('trips', 'expected_wb_gross_recorded_at')
    op.drop_column('trips', 'expected_wb_gross_entry_at')
    op.drop_column('trips', 'expected_wb_tare_recorded_at')
    op.drop_column('trips', 'expected_wb_tare_entry_at')
    op.drop_column('trips', 'wb_gross_recorded_at')
    op.drop_column('trips', 'wb_gross_entry_at')
    op.drop_column('trips', 'wb_tare_recorded_at')
    op.drop_column('trips', 'wb_tare_entry_at')

    op.drop_table('geofences')
    op.drop_table('weighbridge_records')
    op.drop_table('weighbridges')

    op.execute("UPDATE trips SET status = 2 WHERE status = 4")                      
    op.execute("UPDATE trips SET status = 3 WHERE status = 5")                     
    op.execute("UPDATE trips SET status = 4 WHERE status = 6")                   
    op.execute("UPDATE trips SET status = 5 WHERE status = 7")                     
    op.execute("UPDATE trips SET status = 6 WHERE status = 10")                     
    op.execute("UPDATE trips SET status = 7 WHERE status = 11")                      
    op.execute("UPDATE trips SET status = 8 WHERE status = 12")                    
    op.execute("UPDATE trips SET status = 9 WHERE status = 13")              
    op.execute("UPDATE trips SET status = 10 WHERE status = 14")            
    op.execute("UPDATE trips SET status = 11 WHERE status = 15")           
                                                      
    op.execute("DELETE FROM trips WHERE status IN (2, 3, 8, 9)")
