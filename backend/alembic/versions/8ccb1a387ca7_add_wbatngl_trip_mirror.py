"""add wbatngl_trip_mirror

Revision ID: 8ccb1a387ca7
Revises: h1i2j3k4l5m6
Create Date: 2026-05-08 11:55:04.862839

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = '8ccb1a387ca7'
down_revision: Union[str, Sequence[str], None] = 'h1i2j3k4l5m6'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    op.create_table(
        "wbatngl_trip_mirror",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("trip_id", sa.String(50), nullable=False),
        sa.Column("tap_no", sa.Integer),
        sa.Column("ladleno_raw", sa.String(15)),
        sa.Column("fleet_id", sa.String(15)),
        sa.Column("source_lab", sa.String(10)),
        sa.Column("destination", sa.String(50)),
        sa.Column("tap_hole", sa.Integer),
        sa.Column("gross_weight", sa.Float),
        sa.Column("tare_weight", sa.Float),
        sa.Column("net_weight", sa.Float),
        sa.Column("temp", sa.Float),
        sa.Column("si_l", sa.Float),
        sa.Column("s_l", sa.Float),
        sa.Column("bds_temp", sa.Float),
        sa.Column("shift", sa.String(2)),
        sa.Column("source_table", sa.String(60)),
        sa.Column("first_tare_time", sa.DateTime(timezone=False)),
        sa.Column("out_date", sa.DateTime(timezone=False)),
        sa.Column("closetime", sa.DateTime(timezone=False)),
        sa.Column("received_date", sa.DateTime(timezone=False)),
        sa.Column("sms_ack_time", sa.DateTime(timezone=False)),
        sa.Column("updated_date", sa.DateTime(timezone=False)),
        sa.Column("synced_at", sa.DateTime(timezone=False),
                  server_default=sa.func.now()),
        sa.UniqueConstraint("trip_id", name="uq_wbatngl_trip_mirror_trip_id"),
    )
    op.create_index(
        "ix_wbatngl_trip_mirror_updated_date_desc",
        "wbatngl_trip_mirror",
        [sa.text("updated_date DESC")],
    )
    op.create_index(
        "ix_wbatngl_trip_mirror_fleet_id",
        "wbatngl_trip_mirror",
        ["fleet_id"],
    )
    op.create_index(
        "ix_wbatngl_trip_mirror_source_destination",
        "wbatngl_trip_mirror",
        ["source_lab", "destination"],
    )
    op.create_index(
        "ix_wbatngl_trip_mirror_chemistry_partial",
        "wbatngl_trip_mirror",
        ["updated_date"],
        postgresql_where=sa.text(
            "temp IS NOT NULL OR si_l IS NOT NULL OR s_l IS NOT NULL"
        ),
    )


def downgrade() -> None:
    op.drop_index("ix_wbatngl_trip_mirror_chemistry_partial",
                  table_name="wbatngl_trip_mirror")
    op.drop_index("ix_wbatngl_trip_mirror_source_destination",
                  table_name="wbatngl_trip_mirror")
    op.drop_index("ix_wbatngl_trip_mirror_fleet_id",
                  table_name="wbatngl_trip_mirror")
    op.drop_index("ix_wbatngl_trip_mirror_updated_date_desc",
                  table_name="wbatngl_trip_mirror")
    op.drop_table("wbatngl_trip_mirror")
