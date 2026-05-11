"""
Verify Kotaiah's fix for BF5."WB_TRANS_DATA_ITRO".

Run this from the SMS4 PC (where Oracle Instant Client + WBATNGL_PASSWORD
in .env are set up). It will:

  1. Initialize Oracle thick mode (using ORACLE_INSTANT_CLIENT_DIR from .env)
  2. Connect to WBATNGL Oracle as ITROSYSP
  3. Try BF5."WB_TRANS_DATA_ITRO" (the view Kotaiah just recompiled)
  4. Try BF5."ZWB_TRANSACTION_DATA_ITRO_B" (current workaround source) for compare
  5. Try BF3."WB_TRANS_DATA_ITRO" (active source — sanity check)

Outputs row counts, sample rows, and a clear pass/fail summary.

Usage (PowerShell on SMS4 PC):
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD\\Development\\Version_07
    conda activate hmd_test
    python test_kotaiah_bf5_fix.py

Do NOT commit this output anywhere — credentials / row data is plant-internal.
"""
import os
import sys
from pathlib import Path


def _load_env():
    """Load WBATNGL_* vars from backend/.env if not already in os.environ."""
    env_file = Path(__file__).parent / "backend" / ".env"
    if not env_file.exists():
        return
    for line in env_file.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        k, v = line.split("=", 1)
        k = k.strip()
        v = v.strip().strip('"').strip("'")
        if k and k not in os.environ:
            os.environ[k] = v


def main():
    _load_env()

    try:
        import oracledb
    except ImportError:
        print("[FAIL] oracledb not installed. Run: pip install oracledb>=2.0.0")
        sys.exit(2)

    client = os.getenv("ORACLE_INSTANT_CLIENT_DIR", r"C:\oracle\instantclient_23_0")
    try:
        oracledb.init_oracle_client(lib_dir=client)
        print(f"[OK]   Oracle thick mode initialized from {client}")
    except Exception as e:
        if "DPI-1047" in str(e) or "already" in str(e).lower():
            print("[OK]   Oracle thick mode already initialized")
        else:
            print(f"[FAIL] Thick mode init: {e}")
            sys.exit(2)

    cfg = {
        "host":     os.getenv("WBATNGL_HOST", "10.10.1.67"),
        "port":     int(os.getenv("WBATNGL_PORT", "1522")),
        "user":     os.getenv("WBATNGL_USER", "ITROSYSP"),
        "password": os.getenv("WBATNGL_PASSWORD", ""),
        "service":  os.getenv("WBATNGL_SERVICE", "WBATNGL"),
    }
    if not cfg["password"]:
        print("[FAIL] WBATNGL_PASSWORD not set. Check backend/.env on this PC.")
        sys.exit(2)

    print(f"\n[CONN] {cfg['user']}@{cfg['host']}:{cfg['port']}/{cfg['service']}")
    try:
        conn = oracledb.connect(
            user=cfg["user"], password=cfg["password"],
            dsn=f"{cfg['host']}:{cfg['port']}/{cfg['service']}",
        )
    except oracledb.DatabaseError as e:
        print(f"[FAIL] Connect: {e}")
        sys.exit(3)
    print("[OK]   Connected")

    cur = conn.cursor()
    results = {}

    def probe(label, sql, sample_sql=None):
        print("\n" + "=" * 68)
        print(f"  {label}")
        print("=" * 68)
        try:
            cur.execute(sql)
            cnt = cur.fetchone()[0]
            print(f"  Row count : {cnt:,}")
            results[label] = ("OK", cnt, None)
            if sample_sql:
                cur.execute(sample_sql)
                cols = [d[0] for d in cur.description]
                rows = cur.fetchall()
                print(f"  Columns ({len(cols)}): {', '.join(cols[:12])}"
                      + (' ...' if len(cols) > 12 else ''))
                print(f"\n  Last {len(rows)} rows by UPDATED_DATE:")
                for row in rows:
                    d = dict(zip(cols, row))
                    tid = d.get("TRIP_ID", "?")
                    lad = d.get("LADLENO", "?")
                    nw  = d.get("NET_WEIGHT", "?")
                    dst = d.get("DESTINATION", "?")
                    upd = d.get("UPDATED_DATE", "?")
                    print(f"    TRIP={tid}  LADLE={lad!s:8}  NW={nw!s:8}  "
                          f"DST={dst!s:6}  UPD={upd}")
        except oracledb.DatabaseError as e:
            print(f"  [FAIL] {e}")
            results[label] = ("FAIL", 0, str(e))

    # ─── BF5 — Kotaiah's fix target ───────────────────────────────────
    probe(
        'BF5."WB_TRANS_DATA_ITRO"   (Kotaiah recompiled today)',
        'SELECT COUNT(*) FROM BF5."WB_TRANS_DATA_ITRO"',
        'SELECT * FROM BF5."WB_TRANS_DATA_ITRO" '
        'ORDER BY UPDATED_DATE DESC FETCH FIRST 3 ROWS ONLY',
    )

    # ─── BF5 — current workaround source ──────────────────────────────
    probe(
        'BF5."ZWB_TRANSACTION_DATA_ITRO_B"   (current sync source)',
        'SELECT COUNT(*) FROM BF5."ZWB_TRANSACTION_DATA_ITRO_B"',
    )

    # ─── BF3 — active sync source (sanity check) ──────────────────────
    probe(
        'BF3."WB_TRANS_DATA_ITRO"   (active BF3 source)',
        'SELECT COUNT(*) FROM BF3."WB_TRANS_DATA_ITRO"',
    )

    cur.close()
    conn.close()

    print("\n" + "=" * 68)
    print("  SUMMARY")
    print("=" * 68)
    for label, (status, cnt, err) in results.items():
        tag = '✓' if status == 'OK' else '✗'
        if status == 'OK':
            print(f"  {tag}  {status:4}  {cnt:>10,} rows   {label}")
        else:
            print(f"  {tag}  {status:4}                       {label}")
            print(f"             error: {err}")

    bf5_wb = results.get('BF5."WB_TRANS_DATA_ITRO"   (Kotaiah recompiled today)')
    if bf5_wb and bf5_wb[0] == 'OK':
        print("\n  RESULT: BF5.WB_TRANS_DATA_ITRO is NOW WORKING.")
        print("  Recommended next step: switch WBATNGL trip sync source from")
        print("    BF5.ZWB_TRANSACTION_DATA_ITRO_B  ->  BF5.WB_TRANS_DATA_ITRO")
        print("  to match BF3 source naming. (Backend code change — Claude can")
        print("  prepare the patch once you confirm.)")
    else:
        print("\n  RESULT: BF5.WB_TRANS_DATA_ITRO is still NOT working.")
        print("  Keep the current ZWB workaround. Report the exact error above")
        print("  back to Kotaiah for further diagnosis.")


if __name__ == "__main__":
    main()
