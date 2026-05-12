"""
DB Discovery Reporter — DEEP PASS across all reachable HTS-side schemas.

Sequel to `test_db_discovery.py`. The first pass found that the
`ICT_IFACE` Oracle account can read 27 schemas, but we only audited
`HTS`. This script goes wide across every schema where domain data
plausibly lives (SMS3 / SPTS_MES / BRM2MES / SAPIFACE / SMIS / ...).

For each schema:
  1. List every table + view (name, est. row count, col count)
  2. Hunt for column-name patterns that fill V2 feature gaps:
       torpedo · ladle · heat · slag · chemistry · phosphorus ·
       operator notes · disposition · campaign · refractory ·
       calibration · battery · shell · heel · weighbridge · arrival
  3. For tables whose NAME matches the same patterns, dump columns +
     2 sample rows
  4. Snapshot total objects per schema so we can prioritize

Skips Oracle internals (SYS / SYSTEM / CTXSYS / MDSYS / OLAPSYS / XDB /
DBLINKUSER / APPS), personal sandboxes (J_ANKIT / S_ARUN / TBP), and
out-of-scope billing (INVOICE / CRM / CR_MGT / JSWCRM).

Read-only. Survives ORA-* errors per-schema and per-table so one bad
table doesn't kill the report.

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


# ─── Patterns to match — what fills V2 feature gaps ────────────────
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

# Schemas to audit — anything reachable that might contain HMD-relevant data.
# Excludes Oracle internals, personal sandboxes, and out-of-scope billing.
TARGET_SCHEMAS = [
    'SMS3',         # SMS3-specific tables (ZPF/EAF per memory)
    'SPTS_MES',     # Steel Plant Tracking System — MES layer
    'SPT001A',      # Probably SPT system pieces
    'BRM2MES',      # Another MES integration
    'SAPIFACE',     # SAP integration (material movements, asset register?)
    'SMIS',         # SMS Info System
    'IFACE_SM',     # Interface — SMS
    'IFACEMGR',     # Interface manager
    'HSM2_L2',      # Hot Strip Mill 2 L2 — downstream but worth a peek
    'UGL',          # Unknown — check
]


# ─── Per-schema inspection ─────────────────────────────────────────
def inspect_schema(cur, schema, out):
    """One schema = one self-contained block in the output."""
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

    # Quick stats per object — col count + row count estimate
    obj_summary = []
    for oname, otype in rows:
        # Column count via all_tab_columns
        cc_rows, _ = _run(
            cur,
            "SELECT COUNT(*) FROM all_tab_columns "
            "WHERE owner = :o AND table_name = :t",
            {"o": schema, "t": oname},
        )
        col_count = cc_rows[0][0] if cc_rows else None
        # Row count — try SELECT COUNT(*); skip if it errors
        rc_rows, rc_err = _run(cur, f'SELECT COUNT(*) FROM {schema}."{oname}"')
        if rc_err:
            row_count = None
            row_err = rc_err
        else:
            row_count = rc_rows[0][0] if rc_rows else None
            row_err = None
        obj_summary.append((oname, otype, col_count, row_count, row_err))

    for oname, otype, cc, rc, rcerr in obj_summary:
        rc_str = f"{rc:>12,}" if rc is not None else f"[ERR: {rcerr[:50] if rcerr else ''}]"
        out.write(f"  {otype:<7} {oname:<45} {cc:>4} cols  {rc_str} rows\n")
    out.write(f"  Total objects in {schema}: {len(obj_summary)}\n")

    # 2. Column-pattern search across this schema
    matched_cols = []                                                    # list of (table, column, type)
    for theme, patterns in COLUMN_PATTERNS.items():
        for p in patterns:
            rows, err = _run(
                cur,
                "SELECT table_name, column_name, data_type "
                "FROM all_tab_columns "
                "WHERE owner = :o AND column_name LIKE :p "
                "ORDER BY table_name, column_name",
                {"o": schema, "p": p},
            )
            if err:
                continue
            for tname, cname, ctype in rows:
                matched_cols.append((theme, p, tname, cname, ctype))

    if matched_cols:
        _q(out, f"Column matches in {schema} (by theme)")
        last_theme = None
        for theme, p, tname, cname, ctype in matched_cols:
            if theme != last_theme:
                out.write(f"\n  [{theme}]\n")
                last_theme = theme
            out.write(f"    {tname:<40} {cname:<28} {ctype}\n")

    # 3. Sample tables whose NAME matches our hot patterns
    matched_tables = set()
    for p in TABLE_PATTERNS:
        rows, err = _run(
            cur,
            "SELECT object_name, object_type FROM all_objects "
            "WHERE owner = :o AND object_type IN ('TABLE', 'VIEW') "
            "AND object_name LIKE :p",
            {"o": schema, "p": p},
        )
        if err:
            continue
        for oname, _otype in rows:
            matched_tables.add(oname)

    if matched_tables:
        _q(out, f"Sample 2 rows from interesting tables in {schema}")
        for oname in sorted(matched_tables)[:20]:                        # cap at 20 to bound output
            out.write(f"\n  --- {schema}.{oname} ---\n")
            # Column list (cap at 25)
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
            # 2 sample rows
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
    else:
        out.write(f"\n  (no table names match HMD-relevant patterns in {schema})\n")


# ─── main ──────────────────────────────────────────────────────────
def main():
    _load_env()

    output_path = Path(__file__).parent / "db_discovery_deep.txt"
    out = open(output_path, "w", encoding="utf-8")

    out.write("=" * 88 + "\n")
    out.write("  JSW DB DISCOVERY — DEEP PASS (Oracle cross-schema)\n")
    out.write("=" * 88 + "\n")
    out.write(f"  Generated at : {datetime.datetime.now().isoformat(timespec='seconds')}\n")
    out.write(f"  Hostname     : {os.getenv('COMPUTERNAME', 'unknown')}\n")
    out.write(f"  Python       : {sys.version.split()[0]}\n")
    out.write("\n")
    out.write("  Purpose: walk every reachable schema under the HTS Oracle\n")
    out.write("  account (ICT_IFACE has SELECT on 27 schemas) and identify\n")
    out.write("  tables / columns that match HMD-relevant patterns.\n")
    out.write("\n")
    out.write(f"  Target schemas ({len(TARGET_SCHEMAS)}):\n")
    for s in TARGET_SCHEMAS:
        out.write(f"    {s}\n")
    out.write("\n  Skipping: Oracle internals (SYS/SYSTEM/CTXSYS/MDSYS/OLAPSYS/XDB/\n")
    out.write("    DBLINKUSER/APPS), personal sandboxes (J_ANKIT/S_ARUN/TBP),\n")
    out.write("    out-of-scope billing (INVOICE/CRM/CR_MGT/JSWCRM), and the\n")
    out.write("    HTS schema (already deeply audited in db_discovery.txt).\n")

    # Oracle init
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

    # Connect via the HTS account (it's the one with multi-schema access)
    try:
        conn = oracledb.connect(
            user=os.environ["HTS_USER"],
            password=os.environ["HTS_PASSWORD"],
            dsn=f'{os.environ["HTS_HOST"]}:'
                f'{os.environ["HTS_PORT"]}/'
                f'{os.environ["HTS_SERVICE"]}',
        )
        cur = conn.cursor()
    except Exception as e:
        out.write(f"\n[FATAL] HTS connect failed: {e}\n")
        print(f"[FAIL] HTS connect: {e}")
        out.close()
        return 1

    # Walk each target schema
    for schema in TARGET_SCHEMAS:
        print(f"  Probing {schema} ...")
        _section(out, f"SCHEMA: {schema}")
        try:
            inspect_schema(cur, schema, out)
        except Exception as e:
            out.write(f"\n[FATAL in {schema}] {e}\n")
            print(f"  [WARN] {schema} crashed: {e}")
            # Reconnect cursor if the connection went bad
            try:
                cur.close()
                cur = conn.cursor()
            except Exception:
                pass

    cur.close()
    conn.close()

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
