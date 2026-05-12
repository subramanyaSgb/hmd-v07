"""
DB Discovery Reporter — finds what we HAVEN'T audited yet.

Companion to `test_db_inventory.py` (which audited 9 WBATNGL tables +
1 HTS view + 1 SuVeechi view that I'd already heard about). This script
goes WIDE: enumerates every schema, hunts for column names that would
fill the gaps in V2 features (Shell temp, Heel, GPS battery, Phosphorus,
calibration logs, slag chemistry, torpedo asset register, etc.).

Read-only. No assumptions. Uses the same .env credentials as the other
test scripts. Survives missing tables / permissions errors so a single
broken schema doesn't kill the whole report.

Output: `db_discovery.txt` at the repo root, ready to send back for
gap-fill planning.

Usage (PowerShell on BF4 PC):
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_db_discovery.py

Then send `db_discovery.txt` back.
"""
import os
import sys
import datetime
from pathlib import Path


# ─── env loader (same as test_db_inventory.py) ─────────────────────
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
def _section(out, title):
    out.write("\n\n" + "=" * 88 + "\n")
    out.write(f"  {title}\n")
    out.write("=" * 88 + "\n")


def _subsection(out, title):
    out.write("\n" + "-" * 88 + "\n")
    out.write(f"  {title}\n")
    out.write("-" * 88 + "\n")


def _q(out, label):
    """Pretty-print a query about to run so the output reads top-to-bottom."""
    out.write(f"\n>>> {label}\n")


def _safe_str(v, maxlen=120):
    if v is None:
        return "NULL"
    s = str(v)
    if len(s) > maxlen:
        return s[:maxlen] + f"... [truncated, {len(s)} chars]"
    return s


def _run(cur, sql, params=None, label=None):
    """Execute SQL and return rows. Returns ([], err) on failure."""
    try:
        if params:
            cur.execute(sql, params)
        else:
            cur.execute(sql)
        return cur.fetchall(), None
    except Exception as e:
        return [], str(e).splitlines()[0]


# ─── MySQL SuVeechi discovery ──────────────────────────────────────
def discover_suveechi(cur, db, out):
    """Enumerate every table + view in suvetracg and identify candidates."""

    # 1. All views
    _q(out, "All views in `suvetracg`")
    rows, err = _run(cur, "SHOW FULL TABLES WHERE Table_type = 'VIEW'")
    if err:
        out.write(f"  [ERROR] {err}\n")
    else:
        for name, _kind in rows:
            out.write(f"  VIEW  {name}\n")
        out.write(f"  Total: {len(rows)} views\n")

    # 2. All base tables
    _q(out, "All base tables in `suvetracg`")
    rows, err = _run(cur, "SHOW FULL TABLES WHERE Table_type = 'BASE TABLE'")
    if err:
        out.write(f"  [ERROR] {err}\n")
    else:
        for name, _kind in rows:
            out.write(f"  TABLE {name}\n")
        out.write(f"  Total: {len(rows)} tables\n")

    # 3. Hunt for columns that would fill the GPS battery + torpedo asset gap
    #    on the Live Tracking V2 detail panel.
    _q(out, "Column search — battery / signal / shell temp / asset register")
    patterns = [
        "%batt%", "%signal%", "%power%", "%volt%",
        "%shell%", "%refract%", "%campaign%", "%cycle%",
        "%asset%", "%manufact%", "%relin%",
        "%location%",   # extra location columns beyond what we use
    ]
    for p in patterns:
        rows, err = _run(
            cur,
            "SELECT TABLE_NAME, COLUMN_NAME, COLUMN_TYPE "
            "FROM information_schema.COLUMNS "
            "WHERE TABLE_SCHEMA = %s AND COLUMN_NAME LIKE %s",
            (db, p),
        )
        if err:
            out.write(f"  [{p}] ERROR: {err}\n")
            continue
        if rows:
            for tname, cname, ctype in rows:
                out.write(f"  [{p}] {tname:<35} {cname:<20} {ctype}\n")
        else:
            out.write(f"  [{p}] no matches\n")

    # 4. Sample any view whose name contains "battery", "asset", "unit"
    _q(out, "Sample 3 rows from any view/table matching unit/asset/battery")
    rows, err = _run(
        cur,
        "SELECT TABLE_NAME FROM information_schema.TABLES "
        "WHERE TABLE_SCHEMA = %s "
        "AND (TABLE_NAME LIKE '%unit%' OR TABLE_NAME LIKE '%asset%' "
        "     OR TABLE_NAME LIKE '%battery%' OR TABLE_NAME LIKE '%device%')",
        (db,),
    )
    if err:
        out.write(f"  [ERROR enumerating] {err}\n")
    else:
        for (tname,) in rows[:8]:                                        # cap at 8 to avoid log explosion
            sample, serr = _run(cur, f"SELECT * FROM `{db}`.`{tname}` LIMIT 3")
            out.write(f"\n  --- {tname} ---\n")
            if serr:
                out.write(f"  [ERROR] {serr}\n")
                continue
            # column header from cursor description
            cols = [d[0] for d in cur.description] if cur.description else []
            if not sample:
                out.write(f"  (empty)  cols: {cols}\n")
                continue
            out.write(f"  cols: {cols}\n")
            for i, row in enumerate(sample, 1):
                out.write(f"  Row {i}: {_safe_str(dict(zip(cols, row)), 300)}\n")


# ─── Oracle (shared logic for WBATNGL + HTS) ──────────────────────
def discover_oracle(cur, schemas, out, label):
    """
    Enumerate tables, views, and column patterns across one or more
    Oracle schemas. `schemas` is a list of upper-case schema names.
    """

    schemas_csv = ", ".join(f"'{s.upper()}'" for s in schemas)

    # 1. ALL objects
    _q(out, f"All TABLEs + VIEWs in {schemas}")
    rows, err = _run(
        cur,
        f"SELECT owner, object_name, object_type FROM all_objects "
        f"WHERE owner IN ({schemas_csv}) "
        f"AND object_type IN ('TABLE', 'VIEW') "
        f"ORDER BY owner, object_type, object_name",
    )
    if err:
        out.write(f"  [ERROR] {err}\n")
    else:
        for owner, oname, otype in rows:
            out.write(f"  {otype:<7} {owner}.{oname}\n")
        out.write(f"  Total: {len(rows)} objects\n")

    # 2. Column searches — the actual gaps
    column_searches = {
        "slag chemistry":      ['%SLAG%', '%MN_L%', '%MN_VAL%', '%C_L%', '%P_L%', '%P_VAL%', '%PHOS%'],
        "torpedo asset":       ['%LADLE%MASTER%', '%TORPEDO%MASTER%', '%TLC%REGIST%', '%REFRACT%', '%CAMPAIGN%'],
        "weighbridge calib":   ['%CALIB%', '%WB%MASTER%', '%WB%LOG%', '%WB%LOC%'],
        "shell temp / heel":   ['%SHELL%', '%HEEL%', '%RESID%'],
        "GPS / battery":       ['%BATT%', '%SIGNAL%', '%POWER%'],
        "operator notes":      ['%COMMENT%', '%NOTE%', '%REMARK%', '%DISPOSITION%'],
        "explicit LOC col":    ['%LOC%'],
        "received_date var":   ['%RECEIVE%'],
        "additional times":    ['%ENTRY%', '%EXIT%', '%ARRIVAL%'],
    }
    for theme, patterns in column_searches.items():
        _q(out, f"Column search — {theme}")
        any_hit = False
        for p in patterns:
            rows, err = _run(
                cur,
                f"SELECT owner, table_name, column_name, data_type "
                f"FROM all_tab_columns "
                f"WHERE owner IN ({schemas_csv}) AND column_name LIKE :p",
                {"p": p},
            )
            if err:
                out.write(f"  [{p}] ERROR: {err}\n")
                continue
            for owner, tname, cname, ctype in rows:
                out.write(f"  [{p}] {owner}.{tname:<35} {cname:<25} {ctype}\n")
                any_hit = True
        if not any_hit:
            out.write(f"  (no matches across {patterns})\n")

    # 3. Table-name searches
    table_searches = [
        '%SLAG%', '%QUALITY%', '%CHEM%', '%QC%',
        '%CALIB%', '%WB_MASTER%', '%WB_LOG%',
        '%LADLE%', '%TORPEDO%', '%TLC%', '%ASSET%',
        '%REFRACT%', '%REPAIR%',
        '%HEAT%', '%CONVERTER%', '%CHARGE%',
    ]
    _q(out, "Table-name pattern search")
    found = False
    for p in table_searches:
        rows, err = _run(
            cur,
            f"SELECT owner, table_name FROM all_tables "
            f"WHERE owner IN ({schemas_csv}) AND table_name LIKE :p",
            {"p": p},
        )
        if err:
            continue
        for owner, tname in rows:
            out.write(f"  [{p}] {owner}.{tname}\n")
            found = True
    if not found:
        out.write(f"  (no additional tables matching {label} patterns)\n")

    # 4. Schema-wide column count summary
    _q(out, f"Column count per table in {schemas}")
    rows, err = _run(
        cur,
        f"SELECT owner, table_name, COUNT(*) AS col_count "
        f"FROM all_tab_columns "
        f"WHERE owner IN ({schemas_csv}) "
        f"GROUP BY owner, table_name "
        f"ORDER BY owner, table_name",
    )
    if err:
        out.write(f"  [ERROR] {err}\n")
    else:
        for owner, tname, ccount in rows:
            out.write(f"  {owner}.{tname:<35} {ccount} cols\n")


def sample_unknown_oracle(cur, schemas, out, exclude=None):
    """
    For every table/view in the schemas that we DON'T already know about
    (per the `exclude` set), pull 1 sample row + column list so we can
    see what's in there. Bounded — caps at 12 unknown tables to avoid
    log explosion.
    """
    exclude = exclude or set()
    schemas_csv = ", ".join(f"'{s.upper()}'" for s in schemas)
    rows, err = _run(
        cur,
        f"SELECT owner, object_name FROM all_objects "
        f"WHERE owner IN ({schemas_csv}) "
        f"AND object_type IN ('TABLE', 'VIEW') "
        f"ORDER BY owner, object_name",
    )
    if err:
        _q(out, "Sample unknown tables — listing failed")
        out.write(f"  [ERROR] {err}\n")
        return
    unknown = [
        (o, n) for (o, n) in rows
        if (o.upper(), n.upper()) not in {(eo.upper(), en.upper()) for eo, en in exclude}
    ]
    _q(out, f"Sampling {min(len(unknown), 12)} NEW tables not in our existing inventory")
    if not unknown:
        out.write("  (every object is already in test_db_inventory.py's known list)\n")
        return
    for (owner, oname) in unknown[:12]:
        out.write(f"\n  --- {owner}.{oname} ---\n")
        # Column list (limited to 20 to keep output readable)
        cols, err = _run(
            cur,
            f"SELECT column_name, data_type FROM all_tab_columns "
            f"WHERE owner = :o AND table_name = :t "
            f"ORDER BY column_id",
            {"o": owner, "t": oname},
        )
        if err:
            out.write(f"    [ERROR cols] {err}\n")
            continue
        out.write(f"    {len(cols)} columns: ")
        out.write(", ".join(f"{n}({t})" for n, t in cols[:20]))
        if len(cols) > 20:
            out.write(f", ... +{len(cols) - 20} more")
        out.write("\n")
        # Row count
        rc, err = _run(cur, f'SELECT COUNT(*) FROM {owner}."{oname}"')
        if not err and rc:
            out.write(f"    row count: {rc[0][0]:,}\n")
        # Sample 2 rows
        samp, err = _run(cur, f'SELECT * FROM {owner}."{oname}" WHERE ROWNUM <= 2')
        if not err and samp:
            cnames = [d[0] for d in cur.description]
            for i, row in enumerate(samp, 1):
                d = dict(zip(cnames, row))
                out.write(f"    Row {i}: {_safe_str(d, 280)}\n")
        elif err:
            out.write(f"    [ERROR sample] {err}\n")


# ─── main ──────────────────────────────────────────────────────────
def main():
    _load_env()

    output_path = Path(__file__).parent / "db_discovery.txt"
    out = open(output_path, "w", encoding="utf-8")

    def hdr(text):
        out.write(text + "\n")

    hdr("=" * 88)
    hdr("  JSW DATABASE DISCOVERY REPORT — generated by test_db_discovery.py")
    hdr("=" * 88)
    hdr(f"  Generated at : {datetime.datetime.now().isoformat(timespec='seconds')}")
    hdr(f"  Hostname     : {os.getenv('COMPUTERNAME', os.getenv('HOSTNAME', 'unknown'))}")
    hdr(f"  Python       : {sys.version.split()[0]}")
    hdr("")
    hdr("  Purpose: find tables/views/columns the existing inventory did NOT")
    hdr("  cover. Looks for: slag chemistry, torpedo asset registers,")
    hdr("  weighbridge calibration logs, shell temp / heel / battery sensors,")
    hdr("  operator notes / dispositions, and any column or table whose name")
    hdr("  hints at the gaps in our V2 features.")

    # ============ MySQL SuVeechi ============
    _section(out, "1 / 3 — MYSQL SUVEECHI DISCOVERY")
    out.write(f"\nServer  : {os.getenv('SUVEECHI_HOST', '?')}:"
              f"{os.getenv('SUVEECHI_PORT', '?')}\n")
    out.write(f"DB      : {os.getenv('SUVEECHI_DB', '?')}\n")
    out.write(f"User    : {os.getenv('SUVEECHI_USER', '?')}\n")
    try:
        import pymysql
        conn = pymysql.connect(
            host=os.environ["SUVEECHI_HOST"],
            port=int(os.environ.get("SUVEECHI_PORT", "3306")),
            user=os.environ["SUVEECHI_USER"],
            password=os.environ["SUVEECHI_PASSWORD"],
            database=os.environ["SUVEECHI_DB"],
            connect_timeout=10,
        )
        cur = conn.cursor()
        discover_suveechi(cur, os.environ["SUVEECHI_DB"], out)
        cur.close()
        conn.close()
        print("[OK] SuVeechi discovery done")
    except Exception as e:
        out.write(f"\n[FATAL] SuVeechi failed: {e}\n")
        print(f"[FAIL] SuVeechi: {e}")

    # ============ Oracle init ============
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

    # ============ WBATNGL ============
    _section(out, "2 / 3 — ORACLE WBATNGL DISCOVERY")
    out.write(f"\nServer  : {os.getenv('WBATNGL_HOST', '?')}:"
              f"{os.getenv('WBATNGL_PORT', '?')}\n")
    out.write(f"Service : {os.getenv('WBATNGL_SERVICE', '?')}\n")
    out.write(f"User    : {os.getenv('WBATNGL_USER', '?')}\n")

    KNOWN_WBATNGL = {
        ('BF3', 'BF3_TRANSACTION_DATA_ITRO'),
        ('BF3', 'WB_TRANSACTION_DATA'),
        ('BF3', 'WB_TRANS_DATA_ITRO'),
        ('BF3', 'ZWB_TRANSACTION_DATA_ITRO'),
        ('BF3', 'ZWB_TRANSACTION_DATA_ITRO_B'),
        ('BF5', 'BF5_TRANSACTION_DATA_ITRO'),
        ('BF5', 'WB_TRANS_DATA_ITRO'),
        ('BF5', 'ZWB_TRANSACTION_DATA_ITRO'),
        ('BF5', 'ZWB_TRANSACTION_DATA_ITRO_B'),
    }
    try:
        conn = oracledb.connect(
            user=os.environ["WBATNGL_USER"],
            password=os.environ["WBATNGL_PASSWORD"],
            dsn=f'{os.environ["WBATNGL_HOST"]}:'
                f'{os.environ["WBATNGL_PORT"]}/'
                f'{os.environ["WBATNGL_SERVICE"]}',
        )
        cur = conn.cursor()
        discover_oracle(cur, ['BF3', 'BF5'], out, label="WBATNGL")
        sample_unknown_oracle(cur, ['BF3', 'BF5'], out, exclude=KNOWN_WBATNGL)
        cur.close()
        conn.close()
        print("[OK] WBATNGL discovery done")
    except Exception as e:
        out.write(f"\n[FATAL] WBATNGL connect failed: {e}\n")
        print(f"[FAIL] WBATNGL: {e}")

    # ============ HTS ============
    _section(out, "3 / 3 — ORACLE HTS DISCOVERY")
    out.write(f"\nServer  : {os.getenv('HTS_HOST', '?')}:"
              f"{os.getenv('HTS_PORT', '?')}\n")
    out.write(f"Service : {os.getenv('HTS_SERVICE', '?')}\n")
    out.write(f"User    : {os.getenv('HTS_USER', '?')}\n")

    KNOWN_HTS = {('HTS', 'VW_HTS_HOTMETAL_DATA')}
    try:
        conn = oracledb.connect(
            user=os.environ["HTS_USER"],
            password=os.environ["HTS_PASSWORD"],
            dsn=f'{os.environ["HTS_HOST"]}:'
                f'{os.environ["HTS_PORT"]}/'
                f'{os.environ["HTS_SERVICE"]}',
        )
        cur = conn.cursor()
        # HTS schema is small — go wide and sample EVERY new object
        discover_oracle(cur, ['HTS'], out, label="HTS")
        sample_unknown_oracle(cur, ['HTS'], out, exclude=KNOWN_HTS)

        # Also try the broader account: maybe ICT_IFACE has access to other
        # SMS-related schemas (HMD / HTS_RPT / etc.). List anything the user
        # can see beyond HTS.
        _q(out, "All schemas this Oracle account can read from")
        rows, err = _run(
            cur,
            "SELECT DISTINCT owner FROM all_tables ORDER BY owner",
        )
        if err:
            out.write(f"  [ERROR] {err}\n")
        else:
            for (owner,) in rows:
                out.write(f"  {owner}\n")
            out.write(f"  Total: {len(rows)} schemas visible\n")

        cur.close()
        conn.close()
        print("[OK] HTS discovery done")
    except Exception as e:
        out.write(f"\n[FATAL] HTS failed: {e}\n")
        print(f"[FAIL] HTS: {e}")

    out.write("\n\n" + "=" * 88 + "\n")
    out.write("  END OF DISCOVERY REPORT\n")
    out.write("=" * 88 + "\n")
    out.close()

    size = output_path.stat().st_size
    print(f"\nDiscovery report written to {output_path}")
    print(f"Size: {size:,} bytes  (~{size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
