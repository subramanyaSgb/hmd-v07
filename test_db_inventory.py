"""
DB Inventory Reporter — generates report.txt on the SMS4 PC.

Read-only. Connects to all 3 JSW databases using credentials from
backend/.env (no prompts), and walks every table/view we have access
to, capturing:

  - Row count
  - Column list with types
  - 3-5 sample rows
  - Date range (min/max) on every DATE/TIMESTAMP column
  - Recent-window counts (rows in last 1d / 7d / 30d) when a date col exists
  - Distinct counts on key business columns (LADLENO, TORPEDO_NO, CONVERTER_NO)
  - NET_WEIGHT / HOTMETAL_QTY / TORPEDO_QTY stats (min/max/avg) where present
  - Any errors (e.g. ORA-04063 on the known-broken BF5 view)

Output: a single plain-text `report.txt` at the repo root, ready to
paste back for integration planning.

Usage (PowerShell on SMS4 PC):
    cd C:\\Users\\v_subramanya.gopal\\Desktop\\HMD
    .venv\\Scripts\\activate.bat
    python test_db_inventory.py

Then send `report.txt` back.
"""
import os
import sys
import datetime
from pathlib import Path


# ─── env loader ────────────────────────────────────────────────────
def _load_env():
    """Load env from backend/.env (same loader pattern as the other test scripts)."""
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


def _safe_str(v, maxlen=120):
    """Stringify a cell value, truncating if huge (LOBs, long varchars)."""
    if v is None:
        return "NULL"
    s = str(v)
    if len(s) > maxlen:
        return s[:maxlen] + f"... [truncated, {len(s)} chars]"
    return s


# ─── MySQL inspector ───────────────────────────────────────────────
def inspect_mysql_view(cur, db, view, out):
    qview = f"`{db}`.`{view}`"

    # Row count
    try:
        cur.execute(f"SELECT COUNT(*) FROM {qview}")
        cnt = cur.fetchone()[0]
        out.write(f"\nView         : {db}.{view}\n")
        out.write(f"Row count    : {cnt:,}\n")
    except Exception as e:
        out.write(f"\n[ERROR] COUNT on {qview} failed: {e}\n")
        return

    # Column schema via DESCRIBE
    try:
        cur.execute(f"DESCRIBE {qview}")
        cols = cur.fetchall()
        out.write(f"\nColumns ({len(cols)}):\n")
        for col in cols:
            out.write(f"  {col[0]:<25} {col[1]}\n")
        col_names = [c[0] for c in cols]
    except Exception as e:
        out.write(f"[ERROR] DESCRIBE failed: {e}\n")
        return

    # Sample 5 rows
    try:
        cur.execute(f"SELECT * FROM {qview} LIMIT 5")
        rows = cur.fetchall()
        out.write(f"\nSample {len(rows)} rows:\n")
        for i, row in enumerate(rows, 1):
            out.write(f"  Row {i}:\n")
            for name, val in zip(col_names, row):
                out.write(f"    {name:<25}: {_safe_str(val)}\n")
    except Exception as e:
        out.write(f"[ERROR] sample failed: {e}\n")

    # reporttime_ist range + recent window
    lower_cols = [c.lower() for c in col_names]
    for dc in ("reporttime_ist", "reporttime_gmt"):
        if dc in lower_cols:
            try:
                cur.execute(f"SELECT MIN({dc}), MAX({dc}) FROM {qview}")
                mn, mx = cur.fetchone()
                out.write(f"\n{dc} range:\n  min: {mn}\n  max: {mx}\n")
            except Exception as e:
                out.write(f"\n{dc} range: [ERROR] {e}\n")

    # status distribution
    if "status" in lower_cols:
        try:
            cur.execute(f"SELECT status, COUNT(*) FROM {qview} "
                        f"GROUP BY status ORDER BY 2 DESC")
            out.write(f"\nStatus distribution:\n")
            for s, n in cur.fetchall():
                out.write(f"  {s}: {n}\n")
        except Exception as e:
            out.write(f"\nStatus distribution: [ERROR] {e}\n")

    # unitname prefix breakdown (TLC vs OTL etc.)
    if "unitname" in lower_cols:
        try:
            cur.execute(f"SELECT SUBSTRING_INDEX(unitname, ' ', 1) AS prefix, "
                        f"COUNT(*) FROM {qview} GROUP BY prefix ORDER BY 2 DESC")
            out.write(f"\nUnitname prefix breakdown:\n")
            for p, n in cur.fetchall():
                out.write(f"  {p}: {n}\n")
        except Exception as e:
            out.write(f"\nUnitname prefix: [ERROR] {e}\n")


# ─── Oracle inspector ──────────────────────────────────────────────
def inspect_oracle_table(cur, schema, table, out, max_rows=3, label=None):
    """Inspect a single Oracle table or view. Survives errors."""
    qual = f'{schema}."{table}"'

    out.write(f"\nTable        : {label or qual}\n")

    # Row count
    try:
        cur.execute(f"SELECT COUNT(*) FROM {qual}")
        cnt = cur.fetchone()[0]
        out.write(f"Row count    : {cnt:,}\n")
    except Exception as e:
        out.write(f"[ERROR] COUNT failed: {str(e).splitlines()[0]}\n")
        return

    # Column metadata via SELECT * WHERE ROWNUM=0
    try:
        cur.execute(f"SELECT * FROM {qual} WHERE ROWNUM = 0")
        desc = cur.description
        out.write(f"\nColumns ({len(desc)}):\n")
        for d in desc:
            tname = d[1].name if hasattr(d[1], 'name') else str(d[1])
            nullable = " NULL" if d[6] else " NOT NULL"
            out.write(f"  {d[0]:<25} {tname}{nullable}\n")
        col_names = [d[0] for d in desc]
    except Exception as e:
        out.write(f"[ERROR] schema lookup failed: {str(e).splitlines()[0]}\n")
        return

    # Sample rows
    try:
        cur.execute(f"SELECT * FROM {qual} WHERE ROWNUM <= {max_rows}")
        rows = cur.fetchall()
        out.write(f"\nSample {len(rows)} rows:\n")
        for i, row in enumerate(rows, 1):
            out.write(f"  Row {i}:\n")
            for name, val in zip(col_names, row):
                out.write(f"    {name:<25}: {_safe_str(val)}\n")
    except Exception as e:
        out.write(f"[ERROR] sample failed: {str(e).splitlines()[0]}\n")

    # Date column ranges + recent-window counts
    date_cols = [d[0] for d in desc if 'DATE' in d[0].upper() or 'TIME' in d[0].upper()]
    for dc in date_cols:
        try:
            cur.execute(f"SELECT MIN({dc}), MAX({dc}) FROM {qual}")
            mn, mx = cur.fetchone()
            out.write(f"\n{dc} range:\n  min: {mn}\n  max: {mx}\n")
        except Exception as e:
            out.write(f"\n{dc} range: [ERROR] {str(e).splitlines()[0]}\n")
            continue
        # Recent-window counts (only if DATE type, not VARCHAR)
        for label_window, days in [("last 1d", 1), ("last 7d", 7), ("last 30d", 30)]:
            try:
                cur.execute(
                    f"SELECT COUNT(*) FROM {qual} "
                    f"WHERE {dc} > SYSDATE - :d", d=days
                )
                n = cur.fetchone()[0]
                out.write(f"  {label_window:<8}: {n:>10,} rows\n")
            except Exception:
                # VARCHAR2 date columns (some WBATNGL fields) won't support
                # SYSDATE arithmetic — silently skip.
                pass

    # LADLENO distinct count + top 10
    if 'LADLENO' in col_names:
        try:
            cur.execute(f"SELECT COUNT(DISTINCT LADLENO) FROM {qual}")
            n = cur.fetchone()[0]
            out.write(f"\nLADLENO distinct count: {n}\n")
            cur.execute(f"SELECT LADLENO, COUNT(*) FROM {qual} "
                        f"GROUP BY LADLENO ORDER BY 2 DESC "
                        f"FETCH FIRST 10 ROWS ONLY")
            out.write("Top 10 LADLENO by row count:\n")
            for ln, cn in cur.fetchall():
                out.write(f"  {_safe_str(ln, 20):<20} : {cn:>8,}\n")

            # Prefix breakdown
            cur.execute(f"SELECT REGEXP_SUBSTR(LADLENO, '^[A-Z]+', 1) AS prefix, "
                        f"COUNT(*) FROM {qual} GROUP BY REGEXP_SUBSTR(LADLENO, '^[A-Z]+', 1) "
                        f"ORDER BY 2 DESC")
            out.write("LADLENO prefix breakdown:\n")
            for p, c in cur.fetchall():
                out.write(f"  {_safe_str(p, 8):<8} : {c:>10,}\n")
        except Exception as e:
            out.write(f"\n[ERROR] LADLENO analysis failed: {str(e).splitlines()[0]}\n")

    # NET_WEIGHT stats
    if 'NET_WEIGHT' in col_names:
        try:
            cur.execute(f"SELECT COUNT(NET_WEIGHT), MIN(NET_WEIGHT), "
                        f"MAX(NET_WEIGHT), AVG(NET_WEIGHT) FROM {qual} "
                        f"WHERE NET_WEIGHT IS NOT NULL")
            ncnt, mn, mx, avg = cur.fetchone()
            out.write(f"\nNET_WEIGHT stats (non-null):\n")
            out.write(f"  count : {ncnt:,}\n")
            out.write(f"  min   : {mn}\n")
            out.write(f"  max   : {mx}\n")
            out.write(f"  avg   : {avg}\n")
        except Exception as e:
            out.write(f"\nNET_WEIGHT stats: [ERROR] {str(e).splitlines()[0]}\n")

    # HOTMETAL_QTY stats (HTS)
    if 'HOTMETAL_QTY' in col_names:
        try:
            cur.execute(f"SELECT COUNT(HOTMETAL_QTY), MIN(HOTMETAL_QTY), "
                        f"MAX(HOTMETAL_QTY), AVG(HOTMETAL_QTY) FROM {qual} "
                        f"WHERE HOTMETAL_QTY IS NOT NULL")
            ncnt, mn, mx, avg = cur.fetchone()
            out.write(f"\nHOTMETAL_QTY stats:\n")
            out.write(f"  count : {ncnt:,}\n")
            out.write(f"  min   : {mn}\n")
            out.write(f"  max   : {mx}\n")
            out.write(f"  avg   : {avg}\n")
        except Exception:
            pass

    # TORPEDO_QTY stats (HTS)
    if 'TORPEDO_QTY' in col_names:
        try:
            cur.execute(f"SELECT COUNT(TORPEDO_QTY), MIN(TORPEDO_QTY), "
                        f"MAX(TORPEDO_QTY), AVG(TORPEDO_QTY) FROM {qual} "
                        f"WHERE TORPEDO_QTY IS NOT NULL")
            ncnt, mn, mx, avg = cur.fetchone()
            out.write(f"\nTORPEDO_QTY stats:\n")
            out.write(f"  count : {ncnt:,}\n")
            out.write(f"  min   : {mn}\n")
            out.write(f"  max   : {mx}\n")
            out.write(f"  avg   : {avg}\n")
        except Exception:
            pass

    # TORPEDO_NO distinct (HTS)
    if 'TORPEDO_NO' in col_names:
        try:
            cur.execute(f"SELECT COUNT(DISTINCT TORPEDO_NO) FROM {qual}")
            n = cur.fetchone()[0]
            out.write(f"\nTORPEDO_NO distinct count: {n}\n")
            cur.execute(f"SELECT TORPEDO_NO, COUNT(*) FROM {qual} "
                        f"GROUP BY TORPEDO_NO ORDER BY 2 DESC "
                        f"FETCH FIRST 10 ROWS ONLY")
            out.write("Top 10 TORPEDO_NO by row count:\n")
            for ln, cn in cur.fetchall():
                out.write(f"  {_safe_str(ln, 20):<20} : {cn:>8,}\n")
        except Exception as e:
            out.write(f"\nTORPEDO_NO: [ERROR] {str(e).splitlines()[0]}\n")

    # CONVERTER_NO full distribution (HTS — small cardinality)
    if 'CONVERTER_NO' in col_names:
        try:
            cur.execute(f"SELECT CONVERTER_NO, COUNT(*) FROM {qual} "
                        f"GROUP BY CONVERTER_NO ORDER BY 2 DESC")
            out.write(f"\nCONVERTER_NO distribution:\n")
            for cn, n in cur.fetchall():
                out.write(f"  {_safe_str(cn, 20):<20} : {n:>8,}\n")
        except Exception as e:
            out.write(f"\nCONVERTER_NO: [ERROR] {str(e).splitlines()[0]}\n")

    # HEAT_NO distinct count (HTS)
    if 'HEAT_NO' in col_names:
        try:
            cur.execute(f"SELECT COUNT(DISTINCT HEAT_NO) FROM {qual}")
            n = cur.fetchone()[0]
            out.write(f"\nHEAT_NO distinct count: {n}\n")
        except Exception:
            pass

    # SOURCE_LAB / DESTINATION distributions (WBATNGL)
    for col in ('SOURCE_LAB', 'DESTINATION', 'SHIFT'):
        if col in col_names:
            try:
                cur.execute(f"SELECT {col}, COUNT(*) FROM {qual} "
                            f"GROUP BY {col} ORDER BY 2 DESC "
                            f"FETCH FIRST 10 ROWS ONLY")
                out.write(f"\n{col} top 10:\n")
                for v, n in cur.fetchall():
                    out.write(f"  {_safe_str(v, 20):<20} : {n:>10,}\n")
            except Exception:
                pass

    # Chemistry presence check
    chem_cols = [c for c in ('TEMP', 'S_L', 'SI_L', 'BDS_TEMP', 'HTS_BDS_TEMP')
                 if c in col_names]
    if chem_cols:
        out.write(f"\nChemistry columns present: {', '.join(chem_cols)}\n")
        for cc in chem_cols:
            try:
                cur.execute(f"SELECT COUNT({cc}), MIN({cc}), MAX({cc}), AVG({cc}) "
                            f"FROM {qual} WHERE {cc} IS NOT NULL AND {cc} > 0")
                ncnt, mn, mx, avg = cur.fetchone()
                out.write(f"  {cc}: count={ncnt:,} min={mn} max={mx} avg={avg}\n")
            except Exception:
                pass


# ─── main ──────────────────────────────────────────────────────────
def main():
    _load_env()

    output_path = Path(__file__).parent / "report.txt"
    out = open(output_path, "w", encoding="utf-8")

    def hdr(text):
        out.write(text + "\n")

    hdr("=" * 88)
    hdr("  JSW DATABASE INVENTORY REPORT — generated by test_db_inventory.py")
    hdr("=" * 88)
    hdr(f"  Generated at : {datetime.datetime.now().isoformat(timespec='seconds')}")
    hdr(f"  Hostname     : {os.getenv('COMPUTERNAME', os.getenv('HOSTNAME', 'unknown'))}")
    hdr(f"  Python       : {sys.version.split()[0]}")
    hdr("")
    hdr("  Section 1: MySQL — SuVeechi    (live torpedo GPS feed)")
    hdr("  Section 2: Oracle — WBATNGL    (BF producer-side weighbridge + chemistry)")
    hdr("  Section 3: Oracle — HTS        (SMS consumer-side hot-metal delivery)")

    # ============ MySQL SuVeechi ============
    _section(out, "1 / 3 — MYSQL SUVEECHI")
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
        view = os.environ.get("SUVEECHI_VIEW", "vw_unit_status_ist")
        _subsection(out, view)
        inspect_mysql_view(cur, os.environ["SUVEECHI_DB"], view, out)
        cur.close()
        conn.close()
        print("[OK] SuVeechi MySQL inventory done")
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
    _section(out, "2 / 3 — ORACLE WBATNGL")
    out.write(f"\nServer  : {os.getenv('WBATNGL_HOST', '?')}:"
              f"{os.getenv('WBATNGL_PORT', '?')}\n")
    out.write(f"Service : {os.getenv('WBATNGL_SERVICE', '?')}\n")
    out.write(f"User    : {os.getenv('WBATNGL_USER', '?')}\n")

    WBATNGL_TABLES = [
        ('BF3', 'BF3_TRANSACTION_DATA_ITRO'),
        ('BF3', 'WB_TRANSACTION_DATA'),
        ('BF3', 'WB_TRANS_DATA_ITRO'),
        ('BF3', 'ZWB_TRANSACTION_DATA_ITRO'),
        ('BF3', 'ZWB_TRANSACTION_DATA_ITRO_B'),
        ('BF5', 'BF5_TRANSACTION_DATA_ITRO'),
        ('BF5', 'WB_TRANS_DATA_ITRO'),   # broken — expect ORA-04063
        ('BF5', 'ZWB_TRANSACTION_DATA_ITRO'),
        ('BF5', 'ZWB_TRANSACTION_DATA_ITRO_B'),
    ]
    try:
        conn = oracledb.connect(
            user=os.environ["WBATNGL_USER"],
            password=os.environ["WBATNGL_PASSWORD"],
            dsn=f'{os.environ["WBATNGL_HOST"]}:'
                f'{os.environ["WBATNGL_PORT"]}/'
                f'{os.environ["WBATNGL_SERVICE"]}',
        )
        cur = conn.cursor()
        for i, (schema, table) in enumerate(WBATNGL_TABLES, 1):
            label = f"[{i}/{len(WBATNGL_TABLES)}] {schema}.{table}"
            print(f"  WBATNGL: probing {label} ...")
            _subsection(out, label)
            inspect_oracle_table(cur, schema, table, out, max_rows=3, label=f"{schema}.{table}")
        cur.close()
        conn.close()
        print("[OK] WBATNGL inventory done")
    except Exception as e:
        out.write(f"\n[FATAL] WBATNGL connect failed: {e}\n")
        print(f"[FAIL] WBATNGL: {e}")

    # ============ HTS ============
    _section(out, "3 / 3 — ORACLE HTS")
    out.write(f"\nServer  : {os.getenv('HTS_HOST', '?')}:"
              f"{os.getenv('HTS_PORT', '?')}\n")
    out.write(f"Service : {os.getenv('HTS_SERVICE', '?')}\n")
    out.write(f"User    : {os.getenv('HTS_USER', '?')}\n")
    try:
        conn = oracledb.connect(
            user=os.environ["HTS_USER"],
            password=os.environ["HTS_PASSWORD"],
            dsn=f'{os.environ["HTS_HOST"]}:'
                f'{os.environ["HTS_PORT"]}/'
                f'{os.environ["HTS_SERVICE"]}',
        )
        cur = conn.cursor()
        full = os.environ.get("HTS_VIEW", "HTS.VW_HTS_HOTMETAL_DATA")
        schema, table = full.split(".", 1)
        _subsection(out, full)
        # More sample rows on HTS since the view is small (~123 rows)
        inspect_oracle_table(cur, schema, table, out, max_rows=5, label=full)
        cur.close()
        conn.close()
        print("[OK] HTS inventory done")
    except Exception as e:
        out.write(f"\n[FATAL] HTS failed: {e}\n")
        print(f"[FAIL] HTS: {e}")

    out.write("\n\n" + "=" * 88 + "\n")
    out.write("  END OF REPORT\n")
    out.write("=" * 88 + "\n")
    out.close()

    size = output_path.stat().st_size
    print(f"\nReport written to {output_path}")
    print(f"Size: {size:,} bytes  (~{size // 1024} KB)")
    return 0


if __name__ == "__main__":
    sys.exit(main() or 0)
