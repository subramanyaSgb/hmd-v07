"""add location_text on fleet_live_locations + seed YARD/REPAIR/WB coords

Revision ID: livetrack001
Revises: v2dash001
Create Date: 2026-05-12

Two things in one migration because they're both needed by the Live
Tracking V2 page and they can't be split without dummy seeded values:

1. Capture SuVeechi `vw_unit_status_ist.location` text (e.g.
   "At HMY2 - Corex Point No.125") that we currently drop on ingest.
   Adds a nullable `location_text` column on fleet_live_locations.

2. Ensure the 5 non-BF/non-SMS plant nodes have coords for the V2 map:
   - WB_HMY1 / WB_HMY2 / WB_LRS1 — already in `weighbridges` table per
     the admin workflow, but rows may have null x/y. Backfill with the
     design idea's coords where currently null.
   - YARD + REPAIR — don't exist in V07 yet. Insert into
     `locations_coordinates` with type='yard'/'repair'. Idempotent via
     ON CONFLICT DO NOTHING so re-running is safe.

Coords from `desing_idea/tracking.jsx` PLANT_GEO — real JSW Vijaynagar
approximations. Admin can fine-tune later via Settings → Plant Layout.

Design doc: docs/plans/2026-05-12-livetracking-v2-design.md
"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'livetrack001'
down_revision: Union[str, Sequence[str], None] = 'v2dash001'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


# Coords lifted from desing_idea/tracking.jsx PLANT_GEO. Already in real
# JSW Vijaynagar lat/lon range — admin can adjust later.
WB_DEFAULT_COORDS = {
    "WB HMY1": (15.1748, 76.6455),
    "WB HMY2": (15.1744, 76.6495),
    "WB LRS1": (15.1740, 76.6535),
    # Common alternate naming patterns also tried so the WHERE clause
    # matches whatever the admin has labelled the rows with.
    "WB_HMY1": (15.1748, 76.6455),
    "WB_HMY2": (15.1744, 76.6495),
    "WB_LRS1": (15.1740, 76.6535),
    "HMY1":    (15.1748, 76.6455),
    "HMY2":    (15.1744, 76.6495),
    "LRS1":    (15.1740, 76.6535),
}


def upgrade() -> None:
    # 1. Column add — nullable so existing rows pass
    op.add_column(
        'fleet_live_locations',
        sa.Column('location_text', sa.String(length=255), nullable=True),
    )

    # 2a. Backfill weighbridge coords where currently null
    conn = op.get_bind()
    for name, (lat, lon) in WB_DEFAULT_COORDS.items():
        conn.execute(
            sa.text(
                "UPDATE weighbridges SET x = :lat, y = :lon "
                "WHERE name = :name AND (x IS NULL OR y IS NULL)"
            ),
            {"lat": lat, "lon": lon, "name": name},
        )

    # 2b. Seed YARD + REPAIR rows in locations_coordinates if missing.
    # These aren't producers or consumers — they're operational nodes
    # the design idea places on the plant schematic. Using new `type`
    # values ('yard', 'repair') so they don't pollute the producer /
    # consumer dropdowns elsewhere in the app.
    conn.execute(
        sa.text(
            "INSERT INTO locations_coordinates "
            "(location_name, user_id, type, x, y, is_visible, status) "
            "SELECT :loc, :uid, :type, :x, :y, true, 'Operating' "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM locations_coordinates WHERE user_id = :uid"
            ")"
        ),
        {
            "loc": "Torpedo Yard", "uid": "YARD", "type": "yard",
            "x": 15.1718, "y": 76.6500,
        },
    )
    conn.execute(
        sa.text(
            "INSERT INTO locations_coordinates "
            "(location_name, user_id, type, x, y, is_visible, status) "
            "SELECT :loc, :uid, :type, :x, :y, true, 'Operating' "
            "WHERE NOT EXISTS ("
            "  SELECT 1 FROM locations_coordinates WHERE user_id = :uid"
            ")"
        ),
        {
            "loc": "Hot Repair Shop", "uid": "REPAIR", "type": "repair",
            "x": 15.1700, "y": 76.6450,
        },
    )


def downgrade() -> None:
    # Drop the seeded yard/repair rows
    conn = op.get_bind()
    conn.execute(sa.text(
        "DELETE FROM locations_coordinates WHERE user_id IN ('YARD','REPAIR')"
    ))
    # Drop the column
    op.drop_column('fleet_live_locations', 'location_text')
