"""
Pre-flight check: verify all 3 JSW database connections are working
before sending the DEP007 closure email.

Tests in order:

  1. MySQL — SuVeechi   (vw_unit_status_ist on 10.10.156.157:3306)
  2. Oracle — WBATNGL   (ITROSYSP   @ 10.10.1.67:1522/WBATNGL)
  3. Oracle — HTS       (ICT_IFACE  @ 10.10.70.227:1522/JVMLPROD.JSW.IN)

For each: TCP reach + driver connect + smoke query + row count.

Reads MySQL + WBATNGL credentials from backend/.env (they are already
set up and the syncs are running). Prompts interactively for the HTS
password since HTS_* env vars are not in .env yet (will be added after
this verification passes).

Usage (PowerShell on SMS4 PC):
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_all_db_connections.py
"""
import os
import sys
import socket
import getpass
from pathlib import Path


# ─── env loader ────────────────────────────────────────────────────
def _load_env():
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


def _tcp(host, port, label):
    """TCP reach check."""
    try:
        with socket.create_connection((host, port), timeout=5):
            return True, f"TCP {host}:{port} reachable"
    except Exception as e:
        return False, f"TCP {host}:{port} FAIL: {e}"


# ─── test 1: MySQL SuVeechi ────────────────────────────────────────
def test_suveechi():
    print("\n" + "=" * 70)
    print("  TEST 1 / 3 — MySQL SuVeechi (live torpedo GPS feed)")
    print("=" * 70)

    host = os.getenv("SUVEECHI_HOST", "10.10.156.157")
    port = int(os.getenv("SUVEECHI_PORT", "3306"))
    user = os.getenv("SUVEECHI_USER", "view_user")
    pwd  = os.getenv("SUVEECHI_PASSWORD", "")
    db   = os.getenv("SUVEECHI_DB", "suvetracg")
    view = os.getenv("SUVEECHI_VIEW", "vw_unit_status_ist")

    print(f"  Target : {user}@{host}:{port}/{db}.{view}")

    if not pwd:
        return False, "SUVEECHI_PASSWORD not set in .env"

    ok, msg = _tcp(host, port, "SuVeechi")
    print(f"  [{'OK' if ok else 'FAIL'}] {msg}")
    if not ok:
        return False, msg

    try:
        import pymysql
    except ImportError:
        return False, "pymysql not installed"

    try:
        conn = pymysql.connect(
            host=host, port=port, user=user, password=pwd, database=db,
            connect_timeout=10,
        )
        cur = conn.cursor()
        cur.execute(f"SELECT COUNT(*) FROM {view}")
        cnt = cur.fetchone()[0]
        cur.execute(f"SELECT * FROM {view} LIMIT 3")
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        print(f"  [OK] Connected, view {view!r} has {cnt:,} rows")
        print(f"  Columns ({len(cols)}): {', '.join(cols[:8])}"
              + (' ...' if len(cols) > 8 else ''))
        print(f"  Got {len(rows)} sample rows")
        cur.close()
        conn.close()
        return True, f"{cnt:,} rows"
    except Exception as e:
        return False, f"{type(e).__name__}: {str(e).splitlines()[0]}"


# ─── test 2: Oracle WBATNGL ────────────────────────────────────────
def test_wbatngl(oracledb):
    print("\n" + "=" * 70)
    print("  TEST 2 / 3 — Oracle WBATNGL (BF3 + BF5 weighbridge data)")
    print("=" * 70)

    host = os.getenv("WBATNGL_HOST", "10.10.1.67")
    port = int(os.getenv("WBATNGL_PORT", "1522"))
    user = os.getenv("WBATNGL_USER", "ITROSYSP")
    pwd  = os.getenv("WBATNGL_PASSWORD", "")
    svc  = os.getenv("WBATNGL_SERVICE", "WBATNGL")

    print(f"  Target : {user}@{host}:{port}/{svc}")

    if not pwd:
        return False, "WBATNGL_PASSWORD not set in .env"

    ok, msg = _tcp(host, port, "WBATNGL")
    print(f"  [{'OK' if ok else 'FAIL'}] {msg}")
    if not ok:
        return False, msg

    try:
        conn = oracledb.connect(user=user, password=pwd, dsn=f"{host}:{port}/{svc}")
        cur = conn.cursor()

        # Two known-good views from the WBATNGL grant set
        cur.execute('SELECT COUNT(*) FROM BF3."WB_TRANS_DATA_ITRO"')
        bf3 = cur.fetchone()[0]
        cur.execute('SELECT COUNT(*) FROM BF5."ZWB_TRANSACTION_DATA_ITRO_B"')
        bf5 = cur.fetchone()[0]

        print(f"  [OK] Connected as {user}")
        print(f"       BF3.WB_TRANS_DATA_ITRO            : {bf3:>10,} rows")
        print(f"       BF5.ZWB_TRANSACTION_DATA_ITRO_B   : {bf5:>10,} rows")
        cur.close()
        conn.close()
        return True, f"BF3={bf3:,} / BF5={bf5:,}"
    except Exception as e:
        return False, f"{type(e).__name__}: {str(e).splitlines()[0]}"


# ─── test 3: Oracle HTS ────────────────────────────────────────────
def test_hts(oracledb):
    print("\n" + "=" * 70)
    print("  TEST 3 / 3 — Oracle HTS (converter / hot metal data)")
    print("=" * 70)

    host = "10.10.70.227"
    port = 1522
    user = "ICT_IFACE"
    svc  = "JVMLPROD.JSW.IN"        # FQDN — verified today
    view = "HTS.VW_HTS_HOTMETAL_DATA"

    print(f"  Target : {user}@{host}:{port}/{svc}")
    print(f"  View   : {view}")

    ok, msg = _tcp(host, port, "HTS")
    print(f"  [{'OK' if ok else 'FAIL'}] {msg}")
    if not ok:
        return False, msg

    pwd = getpass.getpass(f"  Enter password for {user} (hidden): ")
    if not pwd.strip():
        return False, "no HTS password entered"

    try:
        conn = oracledb.connect(user=user, password=pwd, dsn=f"{host}:{port}/{svc}")
        cur = conn.cursor()
        cur.execute("SELECT USER FROM DUAL")
        whoami = cur.fetchone()[0]
        cur.execute(f"SELECT COUNT(*) FROM {view}")
        cnt = cur.fetchone()[0]
        cur.execute(f"SELECT * FROM {view} WHERE ROWNUM <= 3")
        cols = [d[0] for d in cur.description]
        rows = cur.fetchall()
        print(f"  [OK] Connected, logged in as {whoami}")
        print(f"       {view} : {cnt:,} rows")
        print(f"       Columns ({len(cols)}): {', '.join(cols[:6])}"
              + (' ...' if len(cols) > 6 else ''))
        print(f"       Got {len(rows)} sample rows")
        cur.close()
        conn.close()
        return True, f"{cnt:,} rows"
    except Exception as e:
        return False, f"{type(e).__name__}: {str(e).splitlines()[0]}"


# ─── main ──────────────────────────────────────────────────────────
def main():
    _load_env()

    # Init Oracle thick mode once for both Oracle tests
    try:
        import oracledb
    except ImportError:
        print("[FAIL] oracledb not installed.")
        return 2

    client = os.getenv("ORACLE_INSTANT_CLIENT_DIR", r"C:\oracle\instantclient_23_0")
    try:
        oracledb.init_oracle_client(lib_dir=client)
        print(f"[OK] Oracle thick mode initialized from {client}")
    except Exception as e:
        if "DPI-1047" in str(e) or "already" in str(e).lower():
            print("[OK] Oracle thick mode already initialized")
        else:
            print(f"[FAIL] Oracle thick mode: {e}")
            return 2

    results = {}
    results["MySQL — SuVeechi"]    = test_suveechi()
    results["Oracle — WBATNGL"]    = test_wbatngl(oracledb)
    results["Oracle — HTS"]        = test_hts(oracledb)

    # ─── verdict ────────────────────────────────────────────────────
    print("\n" + "=" * 70)
    print("  FINAL VERDICT")
    print("=" * 70)
    for name, (ok, detail) in results.items():
        tag = "✓ PASS" if ok else "✗ FAIL"
        print(f"  {tag}   {name:<24}  {detail}")

    all_ok = all(ok for ok, _ in results.values())
    print()
    if all_ok:
        print("  RESULT: All 3 DB connections WORKING. Safe to send the email")
        print("          closing DEP007 and announcing HTS connectivity success.")
        return 0
    else:
        print("  RESULT: At least one DB is NOT working. DO NOT send the closure")
        print("          email yet. Re-investigate the failed one(s) above.")
        return 1


if __name__ == "__main__":
    sys.exit(main())
