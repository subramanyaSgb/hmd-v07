"""
Quick freshness probe for HTS.VW_HTS_HOTMETAL_DATA.

The inventory script reported the view was frozen at 01-Apr-2026 (no
new rows since). Before we email Hari about a possibly-broken feed,
this script confirms with direct queries:

  1. Oracle's current SYSDATE (so we know our timezone assumption is OK)
  2. Total row count
  3. 10 most recent rows by TORPEDO_IN_TIME DESC  (all 8 columns)
  4. 10 most recent rows by TORPEDO_OUT_TIME DESC (in case OUT is fresher)
  5. Per-day row count distribution  (gap detection)
  6. Rows with NULL TORPEDO_IN_TIME (so we don't miss un-timestamped rows)

Reads HTS credentials from backend/.env. No prompts.

Usage (PowerShell on SMS4 PC):
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python check_hts_freshness.py
"""
import os
import sys
from pathlib import Path


def _load_env():
    env = Path(__file__).parent / "backend" / ".env"
    if not env.exists():
        return
    for line in env.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def _safe(v, maxlen=40):
    if v is None:
        return "NULL"
    s = str(v)
    return s if len(s) <= maxlen else s[:maxlen] + "..."


def main():
    _load_env()

    try:
        import oracledb
    except ImportError:
        print("[FAIL] oracledb not installed.")
        return 2

    client = os.getenv("ORACLE_INSTANT_CLIENT_DIR", r"C:\oracle\instantclient_23_0")
    try:
        oracledb.init_oracle_client(lib_dir=client)
    except Exception as e:
        if "DPI-1047" not in str(e) and "already" not in str(e).lower():
            print(f"[FAIL] thick mode init: {e}")
            return 2

    print("Connecting to HTS...")
    try:
        conn = oracledb.connect(
            user=os.environ["HTS_USER"],
            password=os.environ["HTS_PASSWORD"],
            dsn=f'{os.environ["HTS_HOST"]}:'
                f'{os.environ["HTS_PORT"]}/'
                f'{os.environ["HTS_SERVICE"]}',
        )
    except Exception as e:
        print(f"[FAIL] connect: {e}")
        return 3
    cur = conn.cursor()
    print(f"[OK] Connected as {os.environ['HTS_USER']}@"
          f"{os.environ['HTS_HOST']}:{os.environ['HTS_PORT']}/"
          f"{os.environ['HTS_SERVICE']}\n")

    view = "HTS.VW_HTS_HOTMETAL_DATA"

    # ─── 1. Oracle server clock ──────────────────────────────────
    cur.execute("SELECT SYSDATE, CURRENT_TIMESTAMP FROM DUAL")
    sysdate, cur_ts = cur.fetchone()
    print("=" * 80)
    print("  1. ORACLE SERVER TIME")
    print("=" * 80)
    print(f"  SYSDATE          : {sysdate}")
    print(f"  CURRENT_TIMESTAMP: {cur_ts}")

    # ─── 2. Total count ──────────────────────────────────────────
    cur.execute(f"SELECT COUNT(*) FROM {view}")
    total = cur.fetchone()[0]
    print(f"\n  Total rows in view : {total:,}")

    # ─── 3. 10 newest by TORPEDO_IN_TIME ─────────────────────────
    print("\n" + "=" * 80)
    print("  2. 10 MOST RECENT rows by TORPEDO_IN_TIME DESC")
    print("=" * 80)
    try:
        cur.execute(f"""
            SELECT CONVERTER_NO, HEAT_NO, HOTMETAL_QTY, TORPEDO_NO,
                   TORPEDO_IN_TIME, TORPEDO_OUT_TIME, TORPEDO_QTY,
                   CONVERTER_LIFE
            FROM {view}
            WHERE TORPEDO_IN_TIME IS NOT NULL
            ORDER BY TORPEDO_IN_TIME DESC
            FETCH FIRST 10 ROWS ONLY
        """)
        rows = cur.fetchall()
        if not rows:
            print("  (no rows with non-NULL TORPEDO_IN_TIME)")
        for r in rows:
            print(f"  HEAT={_safe(r[1], 12):<12}  CONV={r[0]}  "
                  f"TORP={_safe(r[3], 6):<6}  IN={r[4]}  OUT={r[5]}  "
                  f"HM_QTY={r[2]}  TORP_QTY={r[6]}  LIFE={r[7]}")
    except Exception as e:
        print(f"  [ERROR] {e}")

    # ─── 4. 10 newest by TORPEDO_OUT_TIME ────────────────────────
    print("\n" + "=" * 80)
    print("  3. 10 MOST RECENT rows by TORPEDO_OUT_TIME DESC")
    print("=" * 80)
    try:
        cur.execute(f"""
            SELECT CONVERTER_NO, HEAT_NO, HOTMETAL_QTY, TORPEDO_NO,
                   TORPEDO_IN_TIME, TORPEDO_OUT_TIME, TORPEDO_QTY
            FROM {view}
            WHERE TORPEDO_OUT_TIME IS NOT NULL
            ORDER BY TORPEDO_OUT_TIME DESC
            FETCH FIRST 10 ROWS ONLY
        """)
        rows = cur.fetchall()
        if not rows:
            print("  (no rows with non-NULL TORPEDO_OUT_TIME)")
        for r in rows:
            print(f"  HEAT={_safe(r[1], 12):<12}  CONV={r[0]}  "
                  f"TORP={_safe(r[3], 6):<6}  IN={r[4]}  OUT={r[5]}  "
                  f"HM_QTY={r[2]}  TORP_QTY={r[6]}")
    except Exception as e:
        print(f"  [ERROR] {e}")

    # ─── 5. Per-day distribution ─────────────────────────────────
    print("\n" + "=" * 80)
    print("  4. PER-DAY ROW COUNTS (by TORPEDO_IN_TIME date)")
    print("=" * 80)
    try:
        cur.execute(f"""
            SELECT TRUNC(TORPEDO_IN_TIME) AS day, COUNT(*) AS rows_count
            FROM {view}
            WHERE TORPEDO_IN_TIME IS NOT NULL
            GROUP BY TRUNC(TORPEDO_IN_TIME)
            ORDER BY day
        """)
        for day, cnt in cur.fetchall():
            print(f"  {day}: {cnt:>4} rows")
    except Exception as e:
        print(f"  [ERROR] {e}")

    # ─── 6. NULL date check ──────────────────────────────────────
    print("\n" + "=" * 80)
    print("  5. NULL TORPEDO_IN_TIME / OUT_TIME COUNT")
    print("=" * 80)
    try:
        cur.execute(f"SELECT COUNT(*) FROM {view} WHERE TORPEDO_IN_TIME IS NULL")
        null_in = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {view} WHERE TORPEDO_OUT_TIME IS NULL")
        null_out = cur.fetchone()[0]
        print(f"  NULL TORPEDO_IN_TIME : {null_in:,}")
        print(f"  NULL TORPEDO_OUT_TIME: {null_out:,}")
    except Exception as e:
        print(f"  [ERROR] {e}")

    # ─── 7. If NULL rows exist, peek at them ─────────────────────
    if null_in > 0 or null_out > 0:
        print("\n" + "=" * 80)
        print("  6. SAMPLE OF NULL-TIMESTAMP ROWS (if any)")
        print("=" * 80)
        try:
            cur.execute(f"""
                SELECT * FROM {view}
                WHERE TORPEDO_IN_TIME IS NULL OR TORPEDO_OUT_TIME IS NULL
                FETCH FIRST 5 ROWS ONLY
            """)
            cols = [d[0] for d in cur.description]
            for r in cur.fetchall():
                d = dict(zip(cols, r))
                for k, v in d.items():
                    print(f"    {k}: {_safe(v)}")
                print("    ---")
        except Exception as e:
            print(f"  [ERROR] {e}")

    cur.close()
    conn.close()

    # ─── Interpretation ──────────────────────────────────────────
    print("\n" + "=" * 80)
    print("  INTERPRETATION HINTS")
    print("=" * 80)
    print("  - If the per-day list ends sharply at 01-Apr → feed is frozen.")
    print("  - If there are recent dates (May) → feed is alive but inventory")
    print("    script missed something (timezone or query bug — let me know).")
    print("  - If many NULL TORPEDO_IN_TIME rows → date col isn't populated;")
    print("    we need a different freshness indicator.")
    print("  - SYSDATE should match your wall clock — if it differs by hours,")
    print("    the Oracle server is in a different timezone than we assumed.")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
