#!/usr/bin/env python3
"""Стенд зберігання новин: prune_by_age (вік) + cap_articles (стеля з квотою Громади).

🔴 Навіщо. Правило «Громада живе місяць» було написане в prune_by_age і НЕ працювало:
одразу після нього стояв сліпий зріз `articles[:MAX_ARTICLES]`. У списку, відсортованому
за датою, Громада стоїть упереміш із потоком Волині/України (~130 статей/добу), тож
стеля 400 забивалась за ~3 доби і зрізала все старіше — разом із Громадою та
ексклюзивами. Заміряно 29.07 на живому data/articles.json: 400 з 400 статей,
найстарша 3.2 дні, найстарша стаття Громади на позиції 365 з 400.

Стенд ловить саме цей клас багів: він міряє НАСЛІДОК («чи доживе стаття Громади до
30 днів під живим припливом»), а не форму запису.

Запуск:  python scripts/test_retention.py
"""
import sys
import time
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parse_rss as P

DAY = 86400 * 1000
now = int(time.time() * 1000)

fails = []


def check(name, cond):
    print(("  ✓ " if cond else "  ✗ ") + name)
    if not cond:
        fails.append(name)


def art(geo, days_old, exclusive=False, n=0):
    """Стаття віком days_old діб. `ts` = added_ts, бо парсер сортує саме за ts."""
    ts = now - int(days_old * DAY)
    return {"id": f"{geo}-{days_old}-{n}", "geo": geo, "ts": ts,
            "added_ts": ts, "exclusive": exclusive}


def pipeline(articles):
    """Рівно те, що робить main(): сортування → вік → стеля."""
    out = sorted(articles, key=lambda a: a.get("ts", 0), reverse=True)
    out = P.prune_by_age(out)
    return P.cap_articles(out)


def has(res, aid):
    return any(a["id"] == aid for a in res)


# ── 0) ШУМОВИЙ ПОРІГ: стан проти самого себе має дати 0 розбіжностей ────────────
# (правило CLAUDE.md — спершу перевір мірку, потім код)
base = [art("Волинь", 1, n=i) for i in range(50)]
check("шум: той самий вхід двічі → однаковий вихід",
      [a["id"] for a in pipeline(base)] == [a["id"] for a in pipeline(base)])
check("шум: стеля не чіпає список, менший за неї", len(pipeline(base)) == 50)

# ── 1) ЖИВИЙ ТИСК: 30 діб потоку по 130 статей + одна стаття Громади щодня ──────
# Саме цей сценарій і провалювався до фіксу.
flood = []
for d in range(30):
    for i in range(130):
        flood.append(art("Волинь" if i % 2 else "Україна", d + 0.5, n=f"{d}-{i}"))
    flood.append(art("Громада", d + 0.5, n=f"gr{d}"))

res = pipeline(flood)
gromada = [a for a in res if P.section_of(a["geo"]) == "Громада"]

check("Громада: стаття віком 29 діб дожила під припливом", has(res, "Громада-29.5-gr29"))
check("Громада: стаття віком 3 доби дожила (до фіксу — гинула)", has(res, "Громада-3.5-gr3"))
check("Громада: дожили всі 30 днів, жодного дня не з'їдено", len(gromada) == 30)
check("стеля тримається: усього ≤ MAX_ARTICLES + квота",
      len(res) <= P.MAX_ARTICLES + P.MAX_COMMUNITY)
check("потік не роздувся: решта розділів ≤ MAX_ARTICLES",
      len(res) - len(gromada) <= P.MAX_ARTICLES)

# ── 2) ВІК ДІЄ І ДЛЯ ГРОМАДИ: 31 доба — за межею місяця ────────────────────────
old = pipeline([art("Громада", 31, n="too-old"), art("Громада", 29, n="ok")])
check("Громада: 31 доба відпадає (місяць — це стеля, не «назавжди»)", not has(old, "Громада-31-too-old"))
check("Громада: 29 діб лишається", has(old, "Громада-29-ok"))

# ── 3) ВОЛИНЬ/УКРАЇНА: свої 7 днів (окреме питання — стеля їх ще тисне) ─────────
week = pipeline([art("Волинь", 8, n="old"), art("Волинь", 6, n="new"),
                 art("Україна", 8, n="old"), art("Україна", 6, n="new")])
check("Волинь: 8 діб відпадає за віком", not has(week, "Волинь-8-old"))
check("Волинь: 6 діб лишається", has(week, "Волинь-6-new"))
check("Україна: 8 діб відпадає за віком", not has(week, "Україна-8-old"))

# ── 4) ЕКСКЛЮЗИВИ (історії Олики) — стеля їх більше не вбиває ──────────────────
# prune_by_age не чіпає їх свідомо, а зріз [:400] усе одно різав.
excl = pipeline([art("Громада", 200, exclusive=True, n="story")] +
                [art("Волинь", 1, n=f"f{i}") for i in range(500)])
check("ексклюзив Громади віком 200 діб пережив приплив 500 статей",
      has(excl, "Громада-200-story"))

# ── 5) КВОТА ГРОМАДИ ОБМЕЖЕНА (файл не росте нескінченно) ──────────────────────
many = pipeline([art("Громада", 1, n=f"g{i}") for i in range(300)])
check("квота Громади тримає стелю MAX_COMMUNITY", len(many) == P.MAX_COMMUNITY)

# ── 6) ПОРЯДОК НА ВИХОДІ — за датою спадаюче (стрічка малює як є) ──────────────
mix = pipeline([art("Волинь", 1, n="a"), art("Громада", 5, n="b"), art("Україна", 3, n="c")])
check("вихід відсортований за ts спадаюче",
      [a["ts"] for a in mix] == sorted((a["ts"] for a in mix), reverse=True))

# ── 7) ЛЕГАСІ БЕЗ added_ts — не чіпаємо (домовленість 21.07) ───────────────────
legacy = {"id": "legacy", "geo": "Волинь", "ts": now - 400 * DAY}
check("легасі без added_ts переживає вік", has(pipeline([legacy]), "legacy"))

print(f"\n{'УСЕ ЗЕЛЕНЕ' if not fails else 'ПРОВАЛИ: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
