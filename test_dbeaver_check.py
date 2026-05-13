"""Show all DB connection info safely (host/port/db/user — NO passwords)
so user can build DBeaver connections without exposing creds in chat.

Run on BF4 — reads backend/.env directly. Read-only.
"""
import os
from pathlib import Path

env_file = Path("backend/.env")
if not env_file.exists():
    print("backend/.env not found at:", env_file.resolve())
    raise SystemExit(1)

# Parse .env into a dict
cfg = {}
for line in env_file.read_text(encoding="utf-8").splitlines():
    line = line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    k, _, v = line.partition("=")
    cfg[k.strip()] = v.strip().strip('"').strip("'")

def show(label, host_key, port_key, db_key, user_key, extra=None):
    print(f"\n{label}")
    print("-" * 60)
    print(f"  Host    : {cfg.get(host_key, '(not set)')}")
    print(f"  Port    : {cfg.get(port_key, '(not set)')}")
    print(f"  Database: {cfg.get(db_key, '(not set)')}")
    print(f"  Username: {cfg.get(user_key, '(not set)')}")
    print(f"  Password: <see backend/.env line for {user_key.replace('USER','PASSWORD')}>")
    if extra:
        for k, v in extra.items():
            print(f"  {k:<8}: {v}")

show("[1] PostgreSQL  (local hmd)",
     "DATABASE_HOST", "DATABASE_PORT",
     "DATABASE_NAME", "DATABASE_USER")

show("[2] MySQL  SuVeechi (GPS source)",
     "SUVEECHI_HOST", "SUVEECHI_PORT",
     "SUVEECHI_DB", "SUVEECHI_USER",
     extra={"View": cfg.get("SUVEECHI_VIEW", "vw_unit_status_ist")})

show("[3] Oracle  WBATNGL (BF weighbridge)",
     "WBATNGL_HOST", "WBATNGL_PORT",
     "WBATNGL_SERVICE", "WBATNGL_USER",
     extra={"Service": cfg.get("WBATNGL_SERVICE", "WBATNGL")})

show("[4] Oracle  HTS (SMS / caster)",
     "HTS_HOST", "HTS_PORT",
     "HTS_SERVICE", "HTS_USER",
     extra={"Service": cfg.get("HTS_SERVICE", "HTS")})

print()
print("=" * 60)
print("Oracle Instant Client (thick-mode required for both Oracle DBs):")
print(f"  {cfg.get('ORACLE_INSTANT_CLIENT_DIR', '(not set in .env — check C:/oracle/instantclient_23_0)')}")
print()
