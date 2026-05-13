"""
Diagnostic probe: WHY does HTS caster_hp sync return 0 rows on BF4?

Symptom (from BF4 backend log 2026-05-13 10:58:55):
    HTS caster_hp OK: fetched=0 upserted=0
…with watermark=epoch (mirror empty), so we *should* get all ~15.5K rows.

Hypotheses to discriminate between:
  A) Upstream H_CASTER_HEAT_PROCESS is empty / no SELECT permission today
     (despite the 11-May deep audit showing 15,556 rows)
  B) CASTER_DATE has NULLs on all rows → `> :wm` filter drops them all
  C) Oracle bind-variable comparison (DATE vs TIMESTAMP) silently mismatches
  D) Reserved-keyword parse issue in the SELECT list
     (SEQUENCE / SHIFT / DELAY / YIELD are non-reserved keywords)

Usage on BF4:
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_hts_caster_probe.py

Reads HTS creds from backend/.env (same as hts_sync uses).
Prints a short, human-readable report. No side effects on the DB.
"""
import os
import sys
from datetime import datetime

# Load backend/.env so HTS_PASSWORD etc. are present
try:
    from dotenv import load_dotenv
    load_dotenv("backend/.env")
except ImportError:
    pass  # python-dotenv not installed → assume env vars already exported

import oracledb


def main():
    client_dir = os.getenv("ORACLE_INSTANT_CLIENT_DIR", r"C:\oracle\instantclient_23_0")
    try:
        oracledb.init_oracle_client(lib_dir=client_dir)
    except Exception as e:
        if "DPI-1047" not in str(e) and "already" not in str(e).lower():
            print(f"WARN: init_oracle_client: {e}")

    try:
        conn = oracledb.connect(
            user=os.getenv("HTS_USER", "ICT_IFACE"),
            password=os.getenv("HTS_PASSWORD"),
            dsn=f"{os.getenv('HTS_HOST', '10.10.70.227')}"
                f":{os.getenv('HTS_PORT', '1522')}"
                f"/{os.getenv('HTS_SERVICE', 'JVMLPROD.JSW.IN')}",
        )
    except Exception as e:
        print(f"FATAL: connect failed: {e}")
        sys.exit(1)

    cur = conn.cursor()

    print("=" * 72)
    print("HTS caster_hp diagnostic probe — 2026-05-13")
    print("=" * 72)

    # Hypothesis A — is the upstream table empty / inaccessible?
    print("\n[A] Bare row count:")
    try:
        cur.execute("SELECT COUNT(*) FROM HTS.H_CASTER_HEAT_PROCESS")
        n = cur.fetchone()[0]
        print(f"    total rows in HTS.H_CASTER_HEAT_PROCESS: {n}")
    except Exception as e:
        print(f"    ERROR: {e}")

    # Hypothesis B — how many rows have non-NULL CASTER_DATE?
    print("\n[B] CASTER_DATE NULL distribution:")
    try:
        cur.execute(
            "SELECT COUNT(*), "
            "       COUNT(CASTER_DATE), "
            "       MIN(CASTER_DATE), MAX(CASTER_DATE) "
            "FROM HTS.H_CASTER_HEAT_PROCESS"
        )
        total, non_null, mn, mx = cur.fetchone()
        nulls = total - non_null
        print(f"    total          : {total}")
        print(f"    CASTER_DATE NULL : {nulls}")
        print(f"    CASTER_DATE set  : {non_null}")
        print(f"    min CASTER_DATE  : {mn}")
        print(f"    max CASTER_DATE  : {mx}")
    except Exception as e:
        print(f"    ERROR: {e}")

    # Hypothesis C — does our exact watermark pattern return 0 rows?
    print("\n[C] Watermark binding test (Python datetime → :wm):")
    wm = datetime(1970, 1, 1)
    try:
        cur.execute(
            "SELECT COUNT(*) FROM HTS.H_CASTER_HEAT_PROCESS "
            "WHERE CASTER_DATE > :wm",
            wm=wm,
        )
        n = cur.fetchone()[0]
        print(f"    rows with CASTER_DATE > 1970-01-01: {n}")
    except Exception as e:
        print(f"    ERROR: {e}")

    print("\n[C'] Same comparison but with explicit Oracle DATE literal:")
    try:
        cur.execute(
            "SELECT COUNT(*) FROM HTS.H_CASTER_HEAT_PROCESS "
            "WHERE CASTER_DATE > TO_DATE('1970-01-01', 'YYYY-MM-DD')"
        )
        n = cur.fetchone()[0]
        print(f"    rows with CASTER_DATE > TO_DATE(...): {n}")
    except Exception as e:
        print(f"    ERROR: {e}")

    # Hypothesis D — does the quoted SEQUENCE select work?
    print("\n[D] Reserved-keyword test — fetch 1 row via the exact SELECT list:")
    cols_bare = (
        "HEAT_NO, SEQUENCE, CASTER_DATE, SHIFT, SHIFT_INCHARGE, "
        "P1_OPERATOR, MOULD_OPERATOR, TCM_OPERATOR, "
        "LADLE_ON_TURRET, LADLE_OPEN, LADLE_CLOSE, "
        "CAST_SIZE, CAST_LENGTH, CAST_WEIGHT, NO_OF_SLABS, FINAL_GRADE, "
        "DELAY, REMARKS, LIQUI_ROBOTIC_REMARKS, TD_SLAG_DEPTH"
    )
    cols_quoted = (
        'HEAT_NO, "SEQUENCE", CASTER_DATE, "SHIFT", SHIFT_INCHARGE, '
        'P1_OPERATOR, MOULD_OPERATOR, TCM_OPERATOR, '
        'LADLE_ON_TURRET, LADLE_OPEN, LADLE_CLOSE, '
        'CAST_SIZE, CAST_LENGTH, CAST_WEIGHT, NO_OF_SLABS, FINAL_GRADE, '
        '"DELAY", REMARKS, LIQUI_ROBOTIC_REMARKS, TD_SLAG_DEPTH'
    )
    for label, cols in (("bare", cols_bare), ("quoted", cols_quoted)):
        try:
            cur.execute(
                f"SELECT {cols} FROM HTS.H_CASTER_HEAT_PROCESS "
                f"WHERE ROWNUM = 1"
            )
            row = cur.fetchone()
            print(f"    [{label}] fetched 1 row OK: HEAT_NO={row[0]}, "
                  f"CASTER_DATE={row[2]}, SHIFT={row[3]}")
        except Exception as e:
            print(f"    [{label}] ERROR: {e}")

    # Confirm consumption table too
    print("\n[E] H_CASTER_CONSUMPTION basic probe:")
    try:
        cur.execute("SELECT COUNT(*) FROM HTS.H_CASTER_CONSUMPTION")
        print(f"    total rows in HTS.H_CASTER_CONSUMPTION: {cur.fetchone()[0]}")
    except Exception as e:
        print(f"    ERROR: {e}")

    # Breakdown table sanity
    print("\n[F] H_EQUP_BREAKDOWNS dup-key check:")
    try:
        cur.execute(
            "SELECT COUNT(*) FROM ("
            "  SELECT UNIT_CODE, BRK_DATE, REASON, COUNT(*) c "
            "  FROM HTS.H_EQUP_BREAKDOWNS "
            "  GROUP BY UNIT_CODE, BRK_DATE, REASON "
            "  HAVING COUNT(*) > 1)"
        )
        dups = cur.fetchone()[0]
        print(f"    duplicate (UNIT_CODE, BRK_DATE, REASON) tuples: {dups}")
    except Exception as e:
        print(f"    ERROR: {e}")

    print("\n" + "=" * 72)
    print("Done. Paste this output back to Claude for interpretation.")
    print("=" * 72)

    cur.close()
    conn.close()


if __name__ == "__main__":
    main()
