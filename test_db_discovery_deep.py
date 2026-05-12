"""
DB Discovery Reporter — DEEP PASS across ALL 3 JSW database connections.

Sequel to `test_db_discovery.py` (which was scoped to known
schemas). This version goes WIDE everywhere:

  1. SuVeechi MySQL  — `view_user` account
       Auto-detects every database the account can SHOW, walks each
       one's tables + views.
  2. WBATNGL Oracle  — `ITROSYSP` account
       Lists every schema visible (we previously only audited BF3 +
       BF5; the account may see BF1/BF2/BF4/quality/lab schemas).
  3. HTS Oracle      — `ICT_IFACE` account
       Walks every schema visible (27 in our first audit) skipping
       only Oracle internals + personal sandboxes.

For each schema, the script:
  1. Lists every TABLE + VIEW with col count + row count
  2. Hunts for column-name patterns matching 11 themes
     (torpedo / heat / slag / weighbridge / operator notes /
      shell-heel-battery / campaign-refractory / delay / shift-time /
      asset-register / hot-metal)
  3. For tables whose NAME matches HMD-relevant patterns, dumps
     columns + 2 sample rows (capped at 20 tables/schema)
  4. Survives per-schema / per-table crashes (cursor reconnects)

Read-only. No mutations. Bounded output.

Usage on BF4:
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_db_discovery_deep.py

Output: `db_discovery_deep.txt` at the repo root.
"""
import os
import sys
import datetime
from pathlib import Path


# ─── env loader (same as the other scripts) ────────────────────────
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


# ─── output helpers ────────────────────────────────────────────────
def _hr(out, ch="=", w=88):
    out.write(ch * w + "\n")


def _section(out, title):
    out.write("\n\n")
    _hr(out, "=", 88)
    out.write(f"  {title}\n")
    _hr(out, "=", 88)


def _subsection(out, title):
    out.write("\n")
    _hr(out, "-", 88)
    out.write(f"  {title}\n")
    _hr(out, "-", 88)


def _q(out, label):
    out.write(f"\n>>> {label}\n")


def _safe_str(v, maxlen=160):
    if v is None:
        return "NULL"
    s = str(v)
    if len(s) > maxlen:
        return s[:maxlen] + f"... [truncated, {len(s)} chars]"
    return s


def _run(cur, sql, params=None):
    try:
        if params:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        return cur.fetchall(), None
    except Exception as e:
        return [], str(e).splitlines()[0]


# ─── Patterns shared across both Oracle + MySQL inspection ─────────
COLUMN_PATTERNS = {
    "torpedo / ladle":         ['%TORPEDO%', '%LADLE%', '%TLC%'],
    "heat / charge":           ['%HEAT%', '%CHARGE%', '%TAP%'],
    "hot metal":               ['%HOT_METAL%', '%HOTMETAL%', '%HM_%', '%IRON%'],
    "slag chemistry":          ['%SLAG%', '%MN_%', '%P_%', '%PHOS%', '%CARBON%', '%CHEM%'],
    "weighbridge / calib":     ['%CALIB%', '%WB_%', '%WEIGH%'],
    "operator / disposition":  ['%REMARK%', '%NOTE%', '%COMMENT%', '%DISPOS%', '%OPERATOR%'],
    "shell / heel / battery":  ['%SHELL%', '%HEEL%', '%RESID%', '%BATT%', '%SIGNAL%'],
    "campaign / refractory":   ['%CAMPAIGN%', '%REFRACT%', '%RELIN%', '%LINING%'],
    "delay / breakdown":       ['%DELAY%', '%BREAK%', '%STOP%'],
    "shift / time":            ['%SHIFT%', '%ENTRY%', '%EXIT%', '%ARRIVAL%'],
    "asset / unit register":   ['%ASSET%', '%MASTER%', '%REGIST%'],
}

TABLE_PATTERNS = [
    '%TORPEDO%', '%LADLE%', '%TLC%',
    '%HEAT%', '%CHARGE%', '%TAP%',
    '%HOTMETAL%', '%HOT_METAL%', '%HM_%',
    '%SLAG%', '%CHEM%', '%QUALITY%',
    '%CALIB%', '%WB_%', '%WEIGH%',
    '%CAMPAIGN%', '%REFRACT%', '%RELIN%',
    '%DELAY%', '%BREAK%', '%REPAIR%',
    '%ASSET%', '%MASTER%',
    '%PRODUCT%', '%CAST%', '%MIXER%',
]

# Schemas we want to NEVER walk (Oracle internals + sandboxes + already-audited)
ORACLE_SKIP = {
    'SYS', 'SYSTEM', 'CTXSYS', 'MDSYS', 'OLAPSYS', 'XDB',
    'DBLINKUSER', 'APPS',
    'J_ANKIT', 'S_ARUN', 'TBP',
    'INVOICE', 'CRM', 'CR_MGT', 'JSWCRM',
    # Oracle 12c+ internals
    'AUDSYS', 'DVSYS', 'DVF', 'GSMADMIN_INTERNAL', 'LBACSYS',
    'OJVMSYS', 'ORDDATA', 'ORDSYS', 'OUTLN', 'WMSYS',
    'APPQOSSYS', 'GSMCATUSER', 'GSMUSER', 'SYSBACKUP',
    'SYSDG', 'SYSKM', 'SYSRAC', 'REMOTE_SCHEDULER_AGENT',
    'DBSFWUSER', 'DBSNMP', 'ORACLE_OCM',
    'PUBLIC', 'ANONYMOUS',
}

# MySQL system DBs to skip
MYSQL_SKIP = {
    'information_schema', 'performance_schema', 'mysql', 'sys',
}


# ─── Per-Oracle-schema inspection ──────────────────────────────────
def inspect_oracle_schema(cur, schema, out):
    _subsection(out, schema)

    # 1. Object inventory
    _q(out, f"All TABLEs + VIEWs in {schema}")
    rows, err = _run(
        cur,
        "SELECT object_name, object_type FROM all_objects "
        "WHERE owner = :o AND object_type IN ('TABLE', 'VIEW') "
        "ORDER BY object_type, object_name",
        {"o": schema},
    )
    if err:
        out.write(f"  [ERROR enumerate] {err}\n")
        return
    if not rows:
        out.write(f"  (zero objects readable in {schema})\n")
        return

    # Stats per object — bounded at 200 objects/schema to keep runtime sane
    obj_rows = rows[:200]
    capped = len(rows) > 200
    for oname, otype in obj_rows:
        cc_rows, _ = _run(
            cur,
            "SELECT COUNT(*) FROM all_tab_columns "
            "WHERE owner = :o AND table_name = :t",
            {"o": schema, "t": oname},
        )
        col_count = cc_rows[0][0] if cc_rows else None
        rc_rows, rc_err = _run(cur, f'SELECT COUNT(*) FROM {schema}."{oname}"')
        if rc_err:
            rc_str = f"[ERR: {rc_err[:50]}]"
        else:
            rc = rc_rows[0][0] if rc_rows else 0
            rc_str = f"{rc:>12,}"
        out.write(f"  {otype:<7} {oname:<50} {col_count or 0:>4} cols  {rc_str} rows\n")
    if capped:
        out.write(f"  [...truncated at 200, schema has {len(rows)} total objects]\n")
    out.write(f"  Total objects in {schema}: {len(rows)}\n")

    # 2. Column-pattern search across this schema
    matched_cols = []
    for theme, patterns in COLUMN_PATTERNS.items():
        for p in patterns:
            mrows, merr = _run(
                cur,
                "SELECT table_name, column_name, data_type "
                "FROM all_tab_columns "
                "WHERE owner = :o AND column_name LIKE :p "
                "ORDER BY table_name, column_name",
                {"o": schema, "p": p},
            )
            if merr:
                continue
            for tname, cname, ctype in mrows:
                matched_cols.append((theme, tname, cname, ctype))

    if matched_cols:
        _q(out, f"Column matches in {schema} (by theme)")
        last_theme = None
        for theme, tname, cname, ctype in matched_cols:
            if theme != last_theme:
                out.write(f"\n  [{theme}]\n")
                last_theme = theme
            out.write(f"    {tname:<40} {cname:<28} {ctype}\n")

    # 3. Sample tables whose NAME matches our hot patterns
    matched_tables = set()
    for p in TABLE_PATTERNS:
        mrows, merr = _run(
            cur,
            "SELECT object_name FROM all_objects "
            "WHERE owner = :o AND object_type IN ('TABLE', 'VIEW') "
            "AND object_name LIKE :p",
            {"o": schema, "p": p},
        )
        if merr:
            continue
        for (oname,) in mrows:
            matched_tables.add(oname)

    if matched_tables:
        _q(out, f"Sample 2 rows from interesting tables in {schema}")
        for oname in sorted(matched_tables)[:20]:
            out.write(f"\n  --- {schema}.{oname} ---\n")
            cols, err = _run(
                cur,
                "SELECT column_name, data_type FROM all_tab_columns "
                "WHERE owner = :o AND table_name = :t "
                "ORDER BY column_id",
                {"o": schema, "t": oname},
            )
            if err:
                out.write(f"    [ERROR cols] {err}\n")
                continue
            out.write(f"    {len(cols)} columns: ")
            out.write(", ".join(f"{n}({t})" for n, t in cols[:25]))
            if len(cols) > 25:
                out.write(f", ... +{len(cols) - 25} more")
            out.write("\n")
            samp, err = _run(cur, f'SELECT * FROM {schema}."{oname}" WHERE ROWNUM <= 2')
            if err:
                out.write(f"    [ERROR sample] {err}\n")
                continue
            cnames = [d[0] for d in cur.description] if cur.description else []
            if not samp:
                out.write(f"    (empty)\n")
                continue
            for i, row in enumerate(samp, 1):
                d = dict(zip(cnames, row))
                out.write(f"    Row {i}: {_safe_str(d, 360)}\n")


# ─── Walk an Oracle connection across every visible schema ─────────
def walk_oracle(label, user_env, password_env, host_env, port_env, service_env, out):
    """Walk every schema this Oracle account can read, modulo the skip list."""
    _section(out, f"ORACLE: {label}")
    out.write(f"\nServer  : {os.getenv(host_env, '?')}:{os.getenv(port_env, '?')}\n")
    out.write(f"Service : {os.getenv(service_env, '?')}\n")
    out.write(f"User    : {os.getenv(user_env, '?')}\n")

    try:
        import oracledb
        conn = oracledb.connect(
            user=os.environ[user_env],
            password=os.environ[password_env],
            dsn=f'{os.environ[host_env]}:{os.environ[port_env]}/{os.environ[service_env]}',
        )
        cur = conn.cursor()
    except Exception as e:
        out.write(f"\n[FATAL] Connect failed: {e}\n")
        print(f"[FAIL] {label} connect: {e}")
        return

    # Enumerate every visible schema
    _q(out, f"All schemas visible to {os.getenv(user_env)}")
    rows, err = _run(cur, "SELECT DISTINCT owner FROM all_tables ORDER BY owner")
    if err:
        out.write(f"  [ERROR] {err}\n")
        cur.close()
        conn.close()
        return
    visible = [r[0] for r in rows]
    for s in visible:
        skip = "  [skip]" if s.upper() in ORACLE_SKIP else ""
        out.write(f"  {s}{skip}\n")
    out.write(f"  Total: {len(visible)} schemas visible "
              f"({sum(1 for s in visible if s.upper() not in ORACLE_SKIP)} after skip-list)\n")

    # Walk each non-skipped schema
    for schema in visible:
        if schema.upper() in ORACLE_SKIP:
            continue
        print(f"  [{label}] Probing schema {schema} ...")
        try:
            inspect_oracle_schema(cur, schema, out)
        except Exception as e:
            out.write(f"\n[FATAL in {schema}] {e}\n")
            print(f"  [WARN] {label}.{schema} crashed: {e}")
            try:
                cur.close()
                cur = conn.cursor()
            except Exception:
                pass

    cur.close()
    conn.close()


# ─── MySQL: walk every database visible to the connection ──────────
def inspect_mysql_database(cur, dbname, out):
    """Inspect one MySQL database — tables + views + pattern search."""
    _subsection(out, dbname)

    # All tables + views
    _q(out, f"All tables + views in `{dbname}`")
    rows, err = _run(
        cur,
        "SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS "
        "FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA = %s "
        "ORDER BY TABLE_TYPE, TABLE_NAME",
        (dbname,),
    )
    if err:
        out.write(f"  [ERROR] {err}\n")
        return
    if not rows:
        out.write(f"  (zero objects in `{dbname}`)\n")
        return
    for tname, ttype, trows in rows:
        ttype_short = "VIEW" if "VIEW" in (ttype or "").upper() else "TABLE"
        # Column count via separate query (cheaper than describing each)
        ccrows, _ = _run(
            cur,
            "SELECT COUNT(*) FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s",
            (dbname, tname),
        )
        cc = ccrows[0][0] if ccrows else 0
        rc_str = f"{trows:>12,}" if trows is not None else "  [n/a]"
        out.write(f"  {ttype_short:<5} {tname:<50} {cc:>4} cols  {rc_str} rows (est)\n")
    out.write(f"  Total: {len(rows)} objects\n")

    # Column-pattern search
    matched = []
    for theme, patterns in COLUMN_PATTERNS.items():
        for p in patterns:
            mrows, merr = _run(
                cur,
                "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE "
                "FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = %s AND COLUMN_NAME LIKE %s",
                (dbname, p.lower()),
            )
            if merr:
                continue
            for tname, cname, ctype in mrows:
                matched.append((theme, tname, cname, ctype))

    if matched:
        _q(out, f"Column matches in `{dbname}`")
        last_theme = None
        for theme, tname, cname, ctype in matched:
            if theme != last_theme:
                out.write(f"\n  [{theme}]\n")
                last_theme = theme
            out.write(f"    {tname:<40} {cname:<28} {ctype}\n")

    # Sample tables whose name matches our hot patterns
    matched_tables = set()
    for p in TABLE_PATTERNS:
        mrows, merr = _run(
            cur,
            "SELECT TABLE_NAME FROM information_schema.TABLES "
            "WHERE TABLE_SCHEMA = %s AND TABLE_NAME LIKE %s",
            (dbname, p.lower()),
        )
        if merr:
            continue
        for (tname,) in mrows:
            matched_tables.add(tname)

    if matched_tables:
        _q(out, f"Sample 2 rows from interesting tables in `{dbname}`")
        for tname in sorted(matched_tables)[:20]:
            out.write(f"\n  --- `{dbname}`.`{tname}` ---\n")
            # Columns
            crows, _ = _run(
                cur,
                "SELECT COLUMN_NAME, COLUMN_TYPE FROM information_schema.COLUMNS "
                "WHERE TABLE_SCHEMA = %s AND TABLE_NAME = %s "
                "ORDER BY ORDINAL_POSITION",
                (dbname, tname),
            )
            out.write(f"    {len(crows)} columns: ")
            out.write(", ".join(f"{n}({t})" for n, t in crows[:25]))
            if len(crows) > 25:
                out.write(f", ... +{len(crows) - 25} more")
            out.write("\n")
            # Sample
            samp, serr = _run(cur, f"SELECT * FROM `{dbname}`.`{tname}` LIMIT 2")
            if serr:
                out.write(f"    [ERROR sample] {serr}\n")
                continue
            cnames = [d[0] for d in cur.description] if cur.description else []
            if not samp:
                out.write(f"    (empty)\n")
                continue
            for i, row in enumerate(samp, 1):
                d = dict(zip(cnames, row))
                out.write(f"    Row {i}: {_safe_str(d, 360)}\n")


def walk_mysql(out):
    _section(out, "MYSQL: SuVeechi")
    out.write(f"\nServer  : {os.getenv('SUVEECHI_HOST', '?')}:"
              f"{os.getenv('SUVEECHI_PORT', '?')}\n")
    out.write(f"User    : {os.getenv('SUVEECHI_USER', '?')}\n")

    try:
        import pymysql
        # NOTE: do NOT pass `database=` here — we want to see ALL DBs the
        # account can access, then connect into each one separately.
        conn = pymysql.connect(
            host=os.environ["SUVEECHI_HOST"],
            port=int(os.environ.get("SUVEECHI_PORT", "3306")),
            user=os.environ["SUVEECHI_USER"],
            password=os.environ["SUVEECHI_PASSWORD"],
            connect_timeout=10,
        )
        cur = conn.cursor()
    except Exception as e:
        out.write(f"\n[FATAL] Connect failed: {e}\n")
        print(f"[FAIL] SuVeechi connect: {e}")
        return

    _q(out, f"All databases visible to {os.getenv('SUVEECHI_USER')}")
    rows, err = _run(cur, "SHOW DATABASES")
    if err:
        out.write(f"  [ERROR] {err}\n")
        cur.close()
        conn.close()
        return
    visible = [r[0] for r in rows]
    for d in visible:
        skip = "  [skip]" if d in MYSQL_SKIP else ""
        out.write(f"  {d}{skip}\n")
    out.write(f"  Total: {len(visible)} databases visible "
              f"({sum(1 for d in visible if d not in MYSQL_SKIP)} after skip-list)\n")

    for dbname in visible:
        if dbname in MYSQL_SKIP:
            continue
        print(f"  [SuVeechi] Probing database `{dbname}` ...")
        try:
            inspect_mysql_database(cur, dbname, out)
        except Exception as e:
            out.write(f"\n[FATAL in `{dbname}`] {e}\n")
            print(f"  [WARN] SuVeechi.{dbname} crashed: {e}")
            try:
                cur.close()
                cur = conn.cursor()
            except Exception:
                pass

    cur.close()
    conn.close()


# ─── main ──────────────────────────────────────────────────────────
def main():
    _load_env()

    output_path = Path(__file__).parent / "db_discovery_deep.txt"
    out = open(output_path, "w", encoding="utf-8")

    out.write("=" * 88 + "\n")
    out.write("  JSW DB DISCOVERY — DEEP PASS across all 3 connections\n")
    out.write("=" * 88 + "\n")
    out.write(f"  Generated at : {datetime.datetime.now().isoformat(timespec='seconds')}\n")
    out.write(f"  Hostname     : {os.getenv('COMPUTERNAME', 'unknown')}\n")
    out.write(f"  Python       : {sys.version.split()[0]}\n")
    out.write("\n")
    out.write("  Walks every schema/database each account can read:\n")
    out.write("    1. SuVeechi MySQL  (view_user)         — `SHOW DATABASES` + walk each\n")
    out.write("    2. WBATNGL Oracle  (ITROSYSP)          — all_tables.owner + walk each\n")
    out.write("    3. HTS Oracle      (ICT_IFACE)         — all_tables.owner + walk each\n")
    out.write("  Skips Oracle internals (SYS/SYSTEM/CTX/MD/OLAP/XDB/...),\n")
    out.write("  personal sandboxes (J_ANKIT/S_ARUN/TBP), out-of-scope billing,\n")
    out.write("  and MySQL system DBs (information_schema/mysql/...).\n")
    out.write("  Bounded: 200 objects/schema, 20 sampled tables/schema.\n")

    # 1. SuVeechi MySQL
    try:
        walk_mysql(out)
        print("[OK] SuVeechi MySQL walk done")
    except Exception as e:
        out.write(f"\n[FATAL] SuVeechi walk crashed: {e}\n")
        print(f"[FAIL] SuVeechi walk: {e}")

    # Init Oracle thick mode once
    try:
        import oracledb
        client = os.getenv("ORACLE_INSTANT_CLIENT_DIR",
                           r"C:\oracle\instantclient_23_0")
        try:
            oracledb.init_oracle_client(lib_dir=client)
        except Exception as e:
            if "DPI-1047" not in str(e) and "already" not in str(e).lower():
                raise
    except Exception as e:
        out.write(f"\n[FATAL] Oracle thick mode init failed: {e}\n")
        out.close()
        return 2

    # 2. WBATNGL Oracle
    try:
        walk_oracle(
            "WBATNGL",
            "WBATNGL_USER", "WBATNGL_PASSWORD",
            "WBATNGL_HOST", "WBATNGL_PORT", "WBATNGL_SERVICE",
            out,
        )
        print("[OK] WBATNGL walk done")
    except Exception as e:
        out.write(f"\n[FATAL] WBATNGL walk crashed: {e}\n")
        print(f"[FAIL] WBATNGL walk: {e}")

    # 3. HTS Oracle
    try:
        walk_oracle(
            "HTS",
            "HTS_USER", "HTS_PASSWORD",
            "HTS_HOST", "HTS_PORT", "HTS_SERVICE",
            out,
        )
        print("[OK] HTS walk done")
    except Exception as e:
        out.write(f"\n[FATAL] HTS walk crashed: {e}\n")
        print(f"[FAIL] HTS walk: {e}")

    out.write("\n\n" + "=" * 88 + "\n")
    out.write("  END OF DEEP DISCOVERY REPORT\n")
    out.write("=" * 88 + "\n")
    out.close()

    size = output_path.stat().st_size
    print(f"\nDeep discovery report written to {output_path}")
    print(f"Size: {size:,} bytes  (~{size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
