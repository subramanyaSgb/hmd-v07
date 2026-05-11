"""add v_trip_heat_story view

Revision ID: bf02ec626f86
Revises: 84b54339b4f5
Create Date: 2026-05-11 16:15:42.957151

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'bf02ec626f86'
down_revision: Union[str, Sequence[str], None] = '84b54339b4f5'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    op.execute("""
        CREATE OR REPLACE VIEW v_trip_heat_story AS
        SELECT
            t.trip_id, t.fleet_id AS torpedo_no, t.source_lab, t.destination,
            t.net_weight, t.first_tare_time, t.out_date, t.closetime,
            t.temp, t.s_l, t.si_l, t.shift,
            h.heat_no, h.converter_no, h.sms, h.hotmetal_qty,
            h.torpedo_in_time, h.torpedo_out_time, h.converter_life
        FROM wbatngl_trip_mirror t
        LEFT JOIN hts_heat_mirror h
            ON h.torpedo_no = t.fleet_id
            AND h.torpedo_in_time BETWEEN
                t.closetime - INTERVAL '15 minutes'
                AND t.closetime + INTERVAL '90 minutes'
    """)


def downgrade():
    op.execute("DROP VIEW IF EXISTS v_trip_heat_story")
