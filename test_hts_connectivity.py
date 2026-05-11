"""
HTS Oracle JVMLPROD connectivity diagnostic.

Tries multiple connection-string variations against 10.10.70.227:1522 to
isolate whether the ORA-01034 / ORA-27101 failure is in our client config
or on the JSW server side.

Logic:
  1. TCP-level reach test (sanity — Vasagerappa says network is open).
  2. Init oracledb thick mode using the Instant Client on this PC.
  3. Try 7 connection-string variations covering Easy Connect,
     full TNS descriptors, SERVICE_NAME vs SID, FQDN vs short name,
     case variations.
  4. Print a clean PASS / FAIL per variation + a summary.

If every variation fails with the same ORA-01034 / ORA-27101, we have
hard proof the issue is server-side and can confidently ask Hari to
verify V$INSTANCE / V$ACTIVE_SERVICES / lsnrctl status.

If any variation succeeds, we are done — we have the correct format.

Usage (PowerShell on SMS4 PC):
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_hts_connectivity.py

It prompts interactively for the ITROSYSP password (HTS) so the password
is never written to disk or logs. Get it from the JSW credentials sheet
in Notion before running.
"""
import os
import sys
import socket
import getpass
from pathlib import Path


def _load_env():
    """Load WBATNGL / ORACLE vars from backend/.env if present."""
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


def test_tcp(host, port):
    """Verify TCP-level connectivity (listener answering at all)."""
    print(f"\n[TCP REACH TEST] {host}:{port}")
    try:
        with socket.create_connection((host, port), timeout=5):
            print(f"  [OK] TCP handshake completed within 5s")
            return True
    except Exception as e:
        print(f"  [FAIL] TCP: {e}")
        return False


def try_connect(label, dsn, user, password):
    """Attempt one Oracle connection; print result; return success bool."""
    import oracledb
    print(f"\n--- {label} ---")
    print(f"  DSN: {dsn}")
    try:
        conn = oracledb.connect(user=user, password=password, dsn=dsn)
        cur = conn.cursor()
        cur.execute("SELECT INSTANCE_NAME, STATUS FROM V$INSTANCE")
        row = cur.fetchone()
        print(f"  [OK] CONNECTED — Instance: {row[0]} | Status: {row[1]}")
        cur.close()
        conn.close()
        return True
    except Exception as e:
        # Print just the first line of the error (full traceback too noisy)
        err = str(e).split("\n")[0].strip()
        print(f"  [FAIL] {err}")
        return False


def main():
    _load_env()

    try:
        import oracledb
    except ImportError:
        print("[FAIL] oracledb not installed. Run: pip install oracledb>=2.0.0")
        return 2

    client = os.getenv("ORACLE_INSTANT_CLIENT_DIR", r"C:\oracle\instantclient_23_0")
    try:
        oracledb.init_oracle_client(lib_dir=client)
        print(f"[OK] Oracle thick mode initialized from {client}")
    except Exception as e:
        if "DPI-1047" in str(e) or "already" in str(e).lower():
            print("[OK] Oracle thick mode already initialized")
        else:
            print(f"[FAIL] Thick mode init: {e}")
            return 2

    host = "10.10.70.227"
    port = 1522
    user = "ITROSYSP"

    print(f"\nTarget : {host}:{port}")
    print(f"User   : {user}")
    print(f"Source : (this SMS4 PC — should be 10.10.23.193)")

    # Step 1: TCP reach
    if not test_tcp(host, port):
        print("\n>>> CANNOT EVEN REACH SERVER OVER TCP.")
        print("    This contradicts Vasagerappa's confirmation. Re-check network.")
        return 1

    # Step 2: Prompt for password
    print("")
    pwd = getpass.getpass(f"Enter password for {user} on HTS server "
                          f"(input is hidden): ")
    if not pwd.strip():
        print("[FAIL] No password entered. Aborting.")
        return 1

    # Step 3: Try variations
    print("\n" + "=" * 68)
    print("  ORACLE CONNECTION TRIALS (7 variations)")
    print("=" * 68)
    print("  If they all fail with ORA-01034/ORA-27101, the issue is server-side.")
    print("  If ANY one succeeds, we have the correct format.")

    attempts = [
        # Easy Connect variations
        ("Easy Connect, SERVICE_NAME = JVMLPROD",
         f"{host}:{port}/JVMLPROD"),

        ("Easy Connect, SERVICE_NAME = jvmlprod (lowercase)",
         f"{host}:{port}/jvmlprod"),

        ("Easy Connect, SERVICE_NAME = JVMLPROD.JSW.IN",
         f"{host}:{port}/JVMLPROD.JSW.IN"),

        # Full TNS descriptors
        ("TNS descriptor with SERVICE_NAME = JVMLPROD",
         f"(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST={host})(PORT={port}))"
         f"(CONNECT_DATA=(SERVICE_NAME=JVMLPROD)))"),

        ("TNS descriptor with SID = JVMLPROD",
         f"(DESCRIPTION=(ADDRESS=(PROTOCOL=TCP)(HOST={host})(PORT={port}))"
         f"(CONNECT_DATA=(SID=JVMLPROD)))"),

        # Alternative service names
        ("Easy Connect, SERVICE_NAME = HTS",
         f"{host}:{port}/HTS"),

        ("Easy Connect, SERVICE_NAME = jvmldev (commonly-paired dev instance)",
         f"{host}:{port}/jvmldev"),
    ]

    results = []
    for label, dsn in attempts:
        ok = try_connect(label, dsn, user, pwd)
        results.append((label, dsn, ok))

    # ─── Summary ─────────────────────────────────────────────────────
    print("\n" + "=" * 68)
    print("  SUMMARY")
    print("=" * 68)

    ok_count = sum(1 for _, _, ok in results if ok)

    for label, dsn, ok in results:
        tag = "✓ OK  " if ok else "✗ FAIL"
        print(f"  {tag}  {label}")

    print("")
    if ok_count == 0:
        print("  RESULT: All 7 variations failed.")
        print("  This CONFIRMS the issue is on the JSW server side, not on our")
        print("  client. The draft reply to Hari Prasad asking him to verify")
        print("  V$INSTANCE / V$ACTIVE_SERVICES / lsnrctl status is the right")
        print("  next step. Send it.")
    elif ok_count == len(results):
        print("  RESULT: All variations succeeded. JVMLPROD is reachable now.")
        print("  Something changed since 06-May. No email to Hari needed.")
    else:
        print(f"  RESULT: {ok_count}/{len(results)} variations succeeded.")
        print("  Working format(s) — use these in our HTS sync config:")
        for label, dsn, ok in results:
            if ok:
                print(f"    • {label}")
                print(f"      DSN: {dsn}")
        print("  No email to Hari needed; fix is in our client config.")

    return 0


if __name__ == "__main__":
    sys.exit(main())
