"""Сторож: РІК ПОДІЇ ВІД ДАТИ НОВИНИ, А НЕ ВІД ДНЯ РОЗБОРУ (07.11.2026).

Аудит 07.11: у events.json — подія на 31.10.2027 з новини від 31.10.2026 про «з 30
жовтня»: розбір у листопаді вирішив, що жовтень минув, і дописав +1 рік.
Запуск: python3 scripts/test_event_year.py
"""
import os, sys, datetime as dt
sys.path.insert(0, os.path.dirname(__file__))
import parse_rss as pr

ok_n = bad = 0
def ok(name, cond, info=""):
    global ok_n, bad
    print(("✅ " if cond else "❌ ") + name + (f"  — {info}" if info else ""))
    if cond: ok_n += 1
    else: bad += 1

ms = lambda y, m, d: int(dt.datetime(y, m, d, 9).timestamp() * 1000)
y = pr.resolve_event_year
ok("🔴 новина 31.10.2026 про «30 жовтня» → 2026, а не 2027", y(30, 10, None, ms(2026, 10, 31)) == 2026, y(30, 10, None, ms(2026, 10, 31)))
ok("новина 20.10 про «5 листопада» → 2026", y(5, 11, None, ms(2026, 10, 20)) == 2026)
ok("грудневий анонс про «15 січня» → наступний рік", y(15, 1, None, ms(2026, 12, 20)) == 2027)
ok("явний рік у тексті — головний", y(1, 3, "2028", ms(2026, 10, 1)) == 2028)
ok("без дати новини — не падає", isinstance(y(1, 5, None, None), int))

today = dt.date(2026, 11, 7)
g = lambda date, **kw: dict({"auto": True, "source": "Олицька громада", "date": date}, **kw)
ok("🔴 самолікування: auto-подія на 31.10.2027 викидається", pr.keep_event(g("2027-10-31"), today) is False)
ok("auto-подія через 3 тижні лишається", pr.keep_event(g("2026-11-30"), today) is True)
ok("минула auto-подія викидається", pr.keep_event(g("2026-11-01"), today) is False)
ok("ручна подія (Алла) лишається завжди, навіть далеко", pr.keep_event({"date": "2027-10-31"}, today) is True)
ok("auto не з громади — геть (ТЗ)", pr.keep_event(g("2026-11-30", source="Конкурент"), today) is False)

print(f"\n{'✅' if not bad else '❌'} {ok_n}/{ok_n + bad} перевірок пройдено")
sys.exit(1 if bad else 0)
