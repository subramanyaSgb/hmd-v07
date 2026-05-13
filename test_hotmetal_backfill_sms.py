"""
One-shot backfill — re-pull ALL upstream HTS hotmetal rows to populate
the `sms` column on rows synced before the SMS_UNIT bug was fixed.

Symptom (probe 2026-05-13):
  hts_heat_mirror.sms is NULL on 4,657 of 4,700 rows. Those rows were
  synced before the SMS_UNIT column-name fix; the watermark-driven sync
  won't re-read them because their TORPEDO_IN_TIME is below the current
  watermark.

What this does:
  1. Connects to HTS Oracle (same creds as hts_sync).
  2. Fetches ALL rows from VW_HTS_HOTMETAL_DATA (~35K rows; takes ~30s).
  3. Maps each row via the existing row_to_mirror_dict() — same fn the
     sync uses, so the SMS_UNIT fix applies.
  4. UPSERTs into hts_heat_mirror — existing rows get `sms` filled in,
     new rows get inserted, `synced_at` bumped on every row.

Run once from the .venv at repo root:
    .venv\\Scripts\\activate.bat
    python test_hotmetal_backfill_sms.py

Safe to re-run — UPSERT is idempotent. Caller can verify after with:
    SELECT COALESCE(sms,'<NULL>') sms, COUNT(*)
    FROM hts_heat_mirror GROUP BY sms;
"""
import os
import sys
import time

try:
    from dotenv import load_dotenv
    load_dotenv("backend/.env")
except ImportError:
    pass

from backend.database.engine import SessionLocal
from backend.utils.hts_sync import (
    _connect_oracle,
    row_to_mirror_dict,
    upsert_rows,
)


def main():
    print("=" * 72)
    print("HTS hotmetal SMS backfill — re-pull ALL upstream rows")
    print("=" * 72)

    print("\n[1/4] Connecting to HTS Oracle...")
    try:
        conn = _connect_oracle()
    except Exception as e:
        print(f"FATAL: {e}")
        sys.exit(1)

    print("[2/4] Fetching ALL VW_HTS_HOTMETAL_DATA rows (no WHERE)...")
    t0 = time.time()
    cur = conn.cursor()
    cur.execute("SELECT * FROM HTS.VW_HTS_HOTMETAL_DATA")
    rows = cur.fetchall()
    cols = [d[0] for d in cur.description]
    cur.close()
    print(f"        Fetched {len(rows):,} rows in {time.time()-t0:.1f}s")

    print("[3/4] Mapping rows...")
    mirror_rows = []
    skipped = 0
    for r in rows:
        d = row_to_mirror_dict(r, cols)
        if d is None:
            skipped += 1
            continue
        mirror_rows.append(d)
    print(f"        Mapped {len(mirror_rows):,}, skipped {skipped}")

    print("[4/4] UPSERTing into hts_heat_mirror...")
    t0 = time.time()
    db = SessionLocal()
    try:
        persisted = upsert_rows(db, mirror_rows)
    finally:
        db.close()
    print(f"        UPSERTed {persisted:,} rows in {time.time()-t0:.1f}s")

    conn.close()

    print("\n" + "=" * 72)
    print("Done. Verify with:")
    print("  psql -d hmd -c \"SELECT COALESCE(sms,'<NULL>') s, COUNT(*) FROM hts_heat_mirror GROUP BY sms ORDER BY 2 DESC;\"")
    print("=" * 72)


if __name__ == "__main__":
    main()
