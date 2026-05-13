"""
Diagnostic — why does SMS Performance show only SMS-4 / 16 heats?

Runs four checks against the local Postgres mirror:
  1. SMS distribution in hotmetal_mirror (all time)
  2. SMS distribution in hotmetal_mirror (today only)
  3. SMS distribution for today's heats from the page's join
     (caster_hp INNER JOIN caster_cn LEFT JOIN hotmetal)
  4. Today's heat list with heat_no / caster_date / SMS / consumption flag

Run from repo root inside .venv:
    .venv\\Scripts\\activate.bat
    python test_sms_attribution_probe.py
"""
from backend.database.engine import SessionLocal
from sqlalchemy import text


def main():
    db = SessionLocal()

    print("\n--- [1] hotmetal_mirror.sms distribution (all time) ---")
    for r in db.execute(text(
        "SELECT COALESCE(sms,'<NULL>') sms, COUNT(*) n "
        "FROM hts_heat_mirror GROUP BY sms ORDER BY n DESC"
    )):
        print(f"   {r._mapping['sms']:<20}  {r._mapping['n']}")

    print("\n--- [2] hotmetal_mirror.sms distribution (today only) ---")
    for r in db.execute(text(
        "SELECT COALESCE(sms,'<NULL>') sms, COUNT(*) n "
        "FROM hts_heat_mirror "
        "WHERE torpedo_in_time >= '2026-05-13 00:00:00' "
        "GROUP BY sms ORDER BY n DESC"
    )):
        print(f"   {r._mapping['sms']:<20}  {r._mapping['n']}")

    print("\n--- [3] today's heats — SMS bucket via page's join ---")
    rows = list(db.execute(text("""
        SELECT COALESCE(m.sms, '<NULL/Unattributed>') sms, COUNT(*) n
        FROM h_caster_heat_process_mirror p
        JOIN h_caster_consumption_mirror c ON c.heatno = p.heat_no
        LEFT JOIN hts_heat_mirror m ON m.heat_no = p.heat_no
        WHERE p.caster_date >= '2026-05-13 00:00:00'
        GROUP BY m.sms ORDER BY n DESC
    """)))
    if not rows:
        print("   <no heats today match the inner-join>")
    for r in rows:
        print(f"   {r._mapping['sms']:<20}  {r._mapping['n']}")

    print("\n--- [4] today's heat list ---")
    print(f"   {'heat_no':<12}  {'caster_date':<20}  {'sms':<10}  has_cn")
    for r in db.execute(text("""
        SELECT p.heat_no, p.caster_date,
               COALESCE(m.sms, '<NULL>') AS hotmetal_sms,
               CASE WHEN c.id IS NULL THEN 'no' ELSE 'yes' END AS has_consumption
        FROM h_caster_heat_process_mirror p
        LEFT JOIN h_caster_consumption_mirror c ON c.heatno = p.heat_no
        LEFT JOIN hts_heat_mirror m ON m.heat_no = p.heat_no
        WHERE p.caster_date >= '2026-05-13 00:00:00'
        ORDER BY p.caster_date
    """)):
        m = r._mapping
        print(f"   {m['heat_no']:<12}  {str(m['caster_date']):<20}  "
              f"{m['hotmetal_sms']:<10}  {m['has_consumption']}")


if __name__ == "__main__":
    main()
