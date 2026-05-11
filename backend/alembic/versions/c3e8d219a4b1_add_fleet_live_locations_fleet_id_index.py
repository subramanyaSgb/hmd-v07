"""add composite index fleet_id+last_updated on fleet_live_locations

Revision ID: c3e8d219a4b1
Revises: bf02ec626f86
Create Date: 2026-05-11 17:45:00.000000

Performance fix for the slow query that surfaced on SMS4 11-May after
Phase 1 deploy:

    SELECT MAX(last_updated) FROM fleet_live_locations WHERE fleet_id = ?

This query runs 53 times per SuVeechi sync tick (once per torpedo, per
10s). It was added in changes_tracker #39 as the dedup-by-fleet-id
guard that prevents FleetLiveLocation accumulating duplicate rows when
SuVeechi reports an unchanged timestamp.

Without an index on (fleet_id), PG falls back to a sequential scan
over the whole table for every torpedo on every tick. On SMS4 logs the
warm-cache version hits ~170 ms under concurrent-sync contention; the
table grows ~5 rows/sec of unique timestamps × 53 torpedoes, so it
will get worse with time.

The composite (fleet_id, last_updated DESC) lets PG locate the right
fleet_id partition and read the first row directly — O(log n) instead
of O(n).

Not part of Phase 1 functionally — issue surfaced because Phase 1's
new HTS sync fires on the same 60s boundary as WBATNGL trip sync, so
all three syncs (SuVeechi 10s, WBATNGL trip 60s, HTS 60s) contend for
the connection pool at minute boundaries. Index lookups are cheap
enough to absorb the contention; sequential scans are not.

"""
from typing import Sequence, Union

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision: str = 'c3e8d219a4b1'
down_revision: Union[str, Sequence[str], None] = 'bf02ec626f86'
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade():
    # Use raw execute so we can specify DESC order on the second column.
    # PG can walk an ASC index backwards, so DESC is a micro-optimisation
    # rather than a correctness requirement — but it matches the query
    # access pattern (MAX = last row when ordered DESC).
    op.execute(
        "CREATE INDEX IF NOT EXISTS "
        "ix_fleet_live_locations_fleet_id_last_updated "
        "ON fleet_live_locations (fleet_id, last_updated DESC)"
    )


def downgrade():
    op.execute(
        "DROP INDEX IF EXISTS ix_fleet_live_locations_fleet_id_last_updated"
    )
