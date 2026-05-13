"""add HTS caster + breakdown mirror tables (Tier 1 analytics)

Revision ID: hts002
Revises: wbaudit001
Create Date: 2026-05-13

Adds 4 new mirror tables to back the Tier 1 HTS analytics roadmap
(SMS Performance page, Equipment-breakdown alert feed, Heat-to-Trip
live map). Existing `hts_heat_mirror.sms` column is kept — the bug
is in `hts_sync.py` (reads upstream column name `SMS` when it's
actually `SMS_UNIT`); fixed in the sync extension that ships with
this migration.

New tables (all loaded by extended hts_sync.py):
  - h_caster_heat_process_mirror   curated subset of HTS.H_CASTER_HEAT_PROCESS  (~15.5K rows)
  - h_caster_consumption_mirror    curated subset of HTS.H_CASTER_CONSUMPTION   (~15.5K rows)
  - h_equp_breakdown_mirror        full mirror of HTS.H_EQUP_BREAKDOWNS         (~800 rows)
  - h_unit_code_mirror             lookup mirror of HTS.H_UNIT_CODES            (36 rows)

Roadmap memory: project_hts_analytics_roadmap.md
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'hts002'
down_revision: Union[str, Sequence[str], None] = 'wbaudit001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # ---------------------------------------------------------------
    # 1) h_caster_heat_process_mirror
    # ---------------------------------------------------------------
    op.create_table(
        'h_caster_heat_process_mirror',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('heat_no', sa.String(20), nullable=False, unique=True),
        sa.Column('sequence_id', sa.String(20)),
        sa.Column('caster_date', sa.DateTime),
        sa.Column('shift', sa.String(2)),
        sa.Column('shift_incharge', sa.String(20)),
        sa.Column('p1_operator', sa.String(20)),
        sa.Column('mould_operator', sa.String(20)),
        sa.Column('tcm_operator', sa.String(20)),
        sa.Column('ladle_on_turret', sa.DateTime),
        sa.Column('ladle_open', sa.DateTime),
        sa.Column('ladle_close', sa.DateTime),
        sa.Column('cast_size', sa.Numeric(10, 3)),
        sa.Column('cast_length', sa.Numeric(10, 3)),
        sa.Column('cast_weight', sa.Numeric(10, 3)),
        sa.Column('no_of_slabs', sa.Integer),
        sa.Column('final_grade', sa.String(40)),
        sa.Column('delay_minutes', sa.Numeric(10, 2)),
        sa.Column('remarks', sa.Text),
        sa.Column('liqui_robotic_remarks', sa.Text),
        sa.Column('td_slag_depth', sa.Numeric(10, 3)),
        sa.Column('synced_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_h_caster_heat_process_mirror_heat_no',
                    'h_caster_heat_process_mirror', ['heat_no'])
    op.create_index('ix_h_caster_heat_process_mirror_sequence_id',
                    'h_caster_heat_process_mirror', ['sequence_id'])
    op.create_index('ix_h_caster_heat_process_mirror_caster_date',
                    'h_caster_heat_process_mirror', ['caster_date'])

    # ---------------------------------------------------------------
    # 2) h_caster_consumption_mirror
    # ---------------------------------------------------------------
    op.create_table(
        'h_caster_consumption_mirror',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('heatno', sa.String(20), nullable=False, unique=True),
        sa.Column('sequence_id', sa.String(20)),
        sa.Column('yield_pct', sa.Numeric(7, 3)),
        sa.Column('prime_slab', sa.Numeric(10, 3)),
        sa.Column('ladle_loss', sa.Numeric(10, 3)),
        sa.Column('tun_loss', sa.Numeric(10, 3)),
        sa.Column('head_crop', sa.Numeric(10, 3)),
        sa.Column('tail_crop', sa.Numeric(10, 3)),
        sa.Column('other_loss', sa.Numeric(10, 3)),
        sa.Column('sample_loss', sa.Numeric(10, 3)),
        sa.Column('cut_loss', sa.Numeric(10, 3)),
        sa.Column('mill_scale_loss', sa.Numeric(10, 3)),
        sa.Column('head_crop_loss_tons', sa.Numeric(10, 3)),
        sa.Column('tail_crop_tons', sa.Numeric(10, 3)),
        sa.Column('sample_loss_tons', sa.Numeric(10, 3)),
        sa.Column('other_loss_tons', sa.Numeric(10, 3)),
        sa.Column('casting_powder', sa.String(40)),
        sa.Column('cp_consumed', sa.Numeric(10, 3)),
        sa.Column('tun_powder', sa.Numeric(10, 3)),
        sa.Column('mbs_life', sa.Integer),
        sa.Column('sen_life', sa.Integer),
        sa.Column('shrd_life', sa.Integer),
        sa.Column('synced_at', sa.DateTime, server_default=sa.func.now()),
    )
    op.create_index('ix_h_caster_consumption_mirror_heatno',
                    'h_caster_consumption_mirror', ['heatno'])
    op.create_index('ix_h_caster_consumption_mirror_sequence_id',
                    'h_caster_consumption_mirror', ['sequence_id'])

    # ---------------------------------------------------------------
    # 3) h_equp_breakdown_mirror
    # ---------------------------------------------------------------
    op.create_table(
        'h_equp_breakdown_mirror',
        sa.Column('id', sa.Integer, primary_key=True),
        sa.Column('eq_code', sa.Integer),
        sa.Column('unit_code', sa.Integer),
        sa.Column('reason', sa.String(255)),
        sa.Column('brk_date', sa.DateTime),
        sa.Column('brk_date_end', sa.DateTime),
        sa.Column('brk_shift', sa.String(2)),
        sa.Column('dur_brk_hrs_min', sa.String(40)),
        sa.Column('delay_type', sa.String(20)),
        sa.Column('synced_at', sa.DateTime, server_default=sa.func.now()),
        sa.UniqueConstraint('unit_code', 'brk_date', 'reason',
                            name='_hbr_unit_date_reason_uc'),
    )
    op.create_index('ix_h_equp_breakdown_mirror_unit_code',
                    'h_equp_breakdown_mirror', ['unit_code'])
    op.create_index('ix_h_equp_breakdown_mirror_brk_date',
                    'h_equp_breakdown_mirror', ['brk_date'])
    op.create_index('idx_hbr_brk_date_desc',
                    'h_equp_breakdown_mirror',
                    [sa.text('brk_date DESC')])

    # ---------------------------------------------------------------
    # 4) h_unit_code_mirror
    # ---------------------------------------------------------------
    op.create_table(
        'h_unit_code_mirror',
        sa.Column('unit_code', sa.Integer, primary_key=True),
        sa.Column('unit_desc', sa.String(80)),
        sa.Column('synced_at', sa.DateTime, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table('h_unit_code_mirror')

    op.drop_index('idx_hbr_brk_date_desc', table_name='h_equp_breakdown_mirror')
    op.drop_index('ix_h_equp_breakdown_mirror_brk_date',
                  table_name='h_equp_breakdown_mirror')
    op.drop_index('ix_h_equp_breakdown_mirror_unit_code',
                  table_name='h_equp_breakdown_mirror')
    op.drop_table('h_equp_breakdown_mirror')

    op.drop_index('ix_h_caster_consumption_mirror_sequence_id',
                  table_name='h_caster_consumption_mirror')
    op.drop_index('ix_h_caster_consumption_mirror_heatno',
                  table_name='h_caster_consumption_mirror')
    op.drop_table('h_caster_consumption_mirror')

    op.drop_index('ix_h_caster_heat_process_mirror_caster_date',
                  table_name='h_caster_heat_process_mirror')
    op.drop_index('ix_h_caster_heat_process_mirror_sequence_id',
                  table_name='h_caster_heat_process_mirror')
    op.drop_index('ix_h_caster_heat_process_mirror_heat_no',
                  table_name='h_caster_heat_process_mirror')
    op.drop_table('h_caster_heat_process_mirror')
