"""Сторож: СВЯТА ПУБЛІКУЮТЬСЯ САМІ У СВІЙ ДЕНЬ — У НОВИНИ (07.11.2026).

🗣️ Вова 07.11: «свята так публікуються самі в свій день».
Міряє три межі, кожна з яких ламається мовчки:
  1. переводимо в ready ЛИШЕ чернетки свят із датою рівно сьогодні (не минулі —
     запізніле привітання, не інші типи — новини чекають людину);
  2. сьогодні рахується за КИЄВОМ (cron у UTC);
  3. готове свято їде в Новини (`_готові`), а НЕ в невидимий events.json —
     інакше крок, що спрацює першим, «зʼїсть» його.
Запуск: python3 scripts/test_holiday_autopublish.py
"""
import os, sys, datetime as dt
from zoneinfo import ZoneInfo
sys.path.insert(0, os.path.dirname(__file__))
os.environ.setdefault("SUPABASE_SERVICE_ROLE_KEY", "")
import sync_cms as sc

ok_n = bad = 0
def ok(name, cond, info=""):
    global ok_n, bad
    print(("✅ " if cond else "❌ ") + name + (f"  — {info}" if info else ""))
    if cond: ok_n += 1
    else: bad += 1

url = sc.holiday_promote_url("2026-11-21")
ok("🔴 лише чернетки", "status=eq.draft" in url, url)
ok("🔴 лише свята", "type=eq.holiday" in url, url)
ok("🔴 лише дата рівно сьогодні (не lte — минулі не публікуємо)", "event_date=eq.2026-11-21" in url and "lte" not in url, url)

today = sc.kyiv_today()
ok("🔴 «сьогодні» — за Києвом", today == dt.datetime.now(ZoneInfo("Europe/Kyiv")).strftime("%Y-%m-%d"), today)

# Куди їде готове свято: перехоплюємо адреси, які читають кроки.
seen = []
class R:
    def __init__(self): pass
    def __enter__(self): return self
    def __exit__(self, *a): return False
    def read(self): return b"[]"
orig = sc.urllib.request.urlopen
sc.urllib.request.urlopen = lambda req, timeout=20: (seen.append(req.full_url), R())[1]
try:
    sc._готові()
    sc.fetch_shotam_ready()
finally:
    sc.urllib.request.urlopen = orig
ok("🔴 Новини беруть і свята", any("type=in.(news,holiday)" in u for u in seen), str(seen))
ok("🔴 невидимий events.json свят більше НЕ бере", not any("holiday" in u for u in seen if "event_date.asc" in u), str(seen))

# Крок справді в ланцюгу синку (функція, яку ніхто не кличе, нічого не захищає).
src = open(os.path.join(os.path.dirname(__file__), "sync_cms.py"), encoding="utf-8").read()
ok("🔴 promote_holidays_today стоїть у кроках main()", "promote_holidays_today, heal_phantom_drafts" in src)

print(f"\n{'✅' if not bad else '❌'} {ok_n}/{ok_n + bad} перевірок пройдено")
sys.exit(1 if bad else 0)
