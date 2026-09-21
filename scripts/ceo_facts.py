#!/usr/bin/env python3
"""Збирач фактів для агента CEO (крок 2 плану, 21.09.2026).

🔴 ЗАРАДИ ЧОГО ЦЕЙ СКРИПТ НЕ КЛИЧЕ МОДЕЛЬ.
Агент CEO має відповідати на питання «де ми проти курсу», і найдорожча помилка
тут — правдоподібний текст замість заміру. Тому факти збираються ОКРЕМО і
друкуються так, щоб людина бачила, що саме агент побачив. Модель отримує вже
готові числа й не має можливості їх «уточнити».

🛑 ГОЛОВНЕ ПРАВИЛО ФАЙЛУ: джерело, яке не відповіло, друкує «не заміряно», а НЕ
нуль. Нуль — це твердження про світ («нічого не сталось»), і воно веде до
рішень; «не заміряно» — твердження про нас. Плутати їх означає будувати курс на
тиші. Саме цей клас вади вже коштував проєкту двох тижнів: агент новин мовчав
через бюджет, а в кабінеті це виглядало як порожня черга.

Запуск:
    python3 scripts/ceo_facts.py            # читабельно
    python3 scripts/ceo_facts.py --json     # для агента

Що читається БЕЗ жодних ключів: git, реєстр невиконаних, стенди, статті, гроші.
Аналітика застосунку потребує доступу до бази (SUPABASE_URL + SERVICE_KEY);
без них розділ чесно каже «не заміряно».
"""
import json
import os
import re
import subprocess
import sys
import urllib.request
from datetime import datetime, timedelta, timezone

КОРІНЬ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
НЕ_ЗАМІРЯНО = "не заміряно"


def _git(*args):
    try:
        out = subprocess.run(["git", "-C", КОРІНЬ, *args],
                             capture_output=True, text=True, timeout=30)
        return out.stdout.strip() if out.returncode == 0 else None
    except Exception:
        return None


def _файл(шлях):
    try:
        with open(os.path.join(КОРІНЬ, шлях), encoding="utf-8") as f:
            return f.read()
    except Exception:
        return None


# ── 1. ВИРОБНИЦТВО ──────────────────────────────────────────────────────────
def виробництво():
    """Що зроблено і що застрягло. 🔑 Автокоміти парсерів НЕ рахуємо роботою:
    інакше тиждень, у який ніхто нічого не робив, виглядав би найпродуктивнішим
    (парсер пише ~24 коміти на добу)."""
    д = {}
    тиждень = (datetime.now(timezone.utc) - timedelta(days=7)).strftime("%Y-%m-%d")
    лог = _git("log", "--since", тиждень, "--pretty=%s")
    if лог is None:
        д["комітів_людини_за_7_днів"] = НЕ_ЗАМІРЯНО
    else:
        рядки = [р for р in лог.split("\n") if р.strip()]
        людські = [р for р in рядки if not р.startswith(("auto(", "ai("))]
        д["комітів_людини_за_7_днів"] = len(людські)
        д["автокомітів_за_7_днів"] = len(рядки) - len(людські)

    гілка = _git("rev-parse", "--abbrev-ref", "HEAD")
    д["гілка"] = гілка or НЕ_ЗАМІРЯНО

    # 🔴 ДВА РІЗНІ «НЕ ДОЇХАЛО», І ПЛУТАТИ ЇХ НЕ МОЖНА — перша редакція цього
    # скрипта плутала, і число брехало НАЗВОЮ (класична вада з `HOT_RULES`:
    # «назва каже одне, вираз вимагає протилежного»).
    #   • не в `main` — нормальний стан робочої гілки, це НЕ тривога;
    #   • не на GitHub — робота існує лише на цьому диску, і ось це вже
    #     тривога: «незапушене = втрачене» (правило №11).
    не_в_main = _git("log", "--oneline", "HEAD", "^origin/main")
    д["комітів_не_в_main"] = (len([р for р in не_в_main.split("\n") if р.strip()])
                              if не_в_main is not None else НЕ_ЗАМІРЯНО)

    if гілка:
        не_на_гітхабі = _git("log", "--oneline", "HEAD", f"^origin/{гілка}")
        # Гілки може ще не бути на GitHub — тоді `git log` падає і ми не знаємо.
        д["комітів_не_на_GitHub"] = (len([р for р in не_на_гітхабі.split("\n") if р.strip()])
                                     if не_на_гітхабі is not None else НЕ_ЗАМІРЯНО)
    else:
        д["комітів_не_на_GitHub"] = НЕ_ЗАМІРЯНО

    # 🔑 Рахуємо ТИМ САМИМ правилом, що `tests/run.mjs`, і це не дрібниця:
    # інакше в звіті CEO стояло б одне число, а в прогоні інше, і довіра до
    # звіту закінчилась би на першій же розбіжності.
    стенди = [ф for ф in os.listdir(os.path.join(КОРІНЬ, "tests"))
              if ф.endswith(".mjs") and ф != "run.mjs" and not ф.startswith("_")]
    д["стендів_у_проєкті"] = len(стенди)
    return д


# ── 2. БОРГИ ────────────────────────────────────────────────────────────────
def борги():
    """Реєстр невиконаних — єдине джерело правди про незроблене."""
    текст = _файл("CSTL NEWS VOVA/NEVYKONANI_ZAVDANNIA.md")
    if текст is None:
        return {"стан": НЕ_ЗАМІРЯНО, "чому": "реєстр не прочитався"}
    # 🔑 Рахуємо мітки станів, а не рядки таблиць: таблиці в реєстрі різної
    # форми, і підрахунок «| рядків» дав би число, яке ні про що не говорить.
    return {
        "не_почато": len(re.findall(r"🔴 НЕ ПОЧАТО", текст)),
        "чекає_роби": len(re.findall(r"⏸ чекає «Роби»|⏸ ЧЕКАЄ", текст)),
        "відкритих_питань_до_власника": len(re.findall(r"^\| Д\d+ \|", текст, re.M)),
    }


# ── 3. КОНТЕНТ ──────────────────────────────────────────────────────────────
def контент():
    д = {}
    сирі = _файл("data/articles.json")
    if сирі is None:
        return {"стан": НЕ_ЗАМІРЯНО, "чому": "articles.json не прочитався"}
    try:
        дані = json.loads(сирі)
        статті = дані["articles"] if isinstance(дані, dict) and "articles" in дані else дані
    except Exception:
        return {"стан": НЕ_ЗАМІРЯНО, "чому": "articles.json не розібрався"}

    межа = (datetime.now(timezone.utc) - timedelta(days=7)).timestamp() * 1000
    свіжі = [a for a in статті if isinstance(a.get("ts"), (int, float)) and a["ts"] >= межа]
    д["статей_усього"] = len(статті)
    д["статей_за_7_днів"] = len(свіжі)
    д["з_них_від_спільнот"] = len([a for a in свіжі if a.get("kind") == "community"])
    д["з_них_рукописних"] = len([a for a in свіжі if a.get("kind") == "editor"])
    return д


# ── 4. ГРОШІ ────────────────────────────────────────────────────────────────
def гроші():
    сирі = _файл("data/ai_spend.json")
    if сирі is None:
        return {"стан": НЕ_ЗАМІРЯНО, "чому": "ai_spend.json не прочитався"}
    try:
        д = json.loads(сирі)
    except Exception:
        return {"стан": НЕ_ЗАМІРЯНО, "чому": "ai_spend.json не розібрався"}

    міс = datetime.now(timezone.utc).strftime("%Y-%m")
    цей = (д.get("months") or {}).get(міс)
    стан = д.get("agent_status") or {}

    # 🔑 Гаманець агента CEO ОКРЕМИЙ (рішення Вови 20.09), тож і в звіті він
    # окремим рядком: спільне число приховало б, хто саме витрачає.
    ceo = {}
    сирі_ceo = _файл("data/ceo_spend.json")
    if сирі_ceo:
        try:
            ceo = (json.loads(сирі_ceo).get("months") or {}).get(міс) or {}
        except Exception:
            ceo = {}

    return {
        "місяць": міс,
        "CEO_витрачено_usd": ceo.get("cost_usd", 0.0) if сирі_ceo else НЕ_ЗАМІРЯНО,
        "CEO_стеля_usd": float(os.environ.get("CEO_MAX_MONTH_USD", "5.0")),
        # `fair_usd` — перерахунок за чинними цінами (див. editor/core/spend.py).
        # Беремо саме його: `cost_usd` містить записи за старим тарифом і
        # завищував витрати на 30.5% — на цьому агент стояв два тижні.
        "витрачено_usd": (цей or {}).get("fair_usd", НЕ_ЗАМІРЯНО) if цей else НЕ_ЗАМІРЯНО,
        "стеля_usd": стан.get("стеля_міс", НЕ_ЗАМІРЯНО),
        "стан_агента_новин": стан.get("стан", НЕ_ЗАМІРЯНО),
        "причина": стан.get("причина", ""),
    }


# ── 5. АНАЛІТИКА ЗАСТОСУНКУ ─────────────────────────────────────────────────
def аналітика():
    """🔴 БЕЗ КЛЮЧІВ — «не заміряно», і це не відмовка, а єдина чесна відповідь.
    Нуль тут читався б як «люди не заходять», тобто як факт про громаду."""
    url = os.environ.get("SUPABASE_URL")
    key = os.environ.get("SUPABASE_SERVICE_KEY") or os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not url or not key:
        return {"стан": НЕ_ЗАМІРЯНО,
                "чому": "немає SUPABASE_URL / SUPABASE_SERVICE_KEY — запуск без доступу до бази"}

    від = (datetime.now(timezone.utc) - timedelta(days=7)).isoformat()
    запит = (f"{url}/rest/v1/analytics_events"
             f"?select=event_type&created_at=gte.{від}&limit=10000")
    req = urllib.request.Request(запит, headers={
        "apikey": key, "Authorization": "Bearer " + key,
    })
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            рядки = json.loads(r.read())
    except Exception as e:
        # 🛑 Збій мережі теж «не заміряно», а не нуль: різниця між «ніхто не
        # заходив» і «ми не змогли спитати» вирішальна для будь-якого висновку.
        return {"стан": НЕ_ЗАМІРЯНО, "чому": f"база не відповіла: {e}"}

    за_типом = {}
    for р in рядки:
        за_типом[р.get("event_type")] = за_типом.get(р.get("event_type"), 0) + 1
    return {
        "подій_за_7_днів": len(рядки),
        "за_типом": за_типом,
        "читань_за_7_днів": за_типом.get("content_open", 0) + за_типом.get("content_seen", 0),
        "⚠️": "стеля вибірки 10 000 рядків — при більших обсягах рахувати агрегатом у базі",
    }


def зібрати():
    return {
        "коли": datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC"),
        "виробництво": виробництво(),
        "борги": борги(),
        "контент": контент(),
        "гроші": гроші(),
        "аналітика": аналітика(),
    }


def надрукувати(д, відступ=0):
    for к, з in д.items():
        if isinstance(з, dict):
            print(" " * відступ + f"{к}:")
            надрукувати(з, відступ + 2)
        else:
            позначка = " 🔸" if з == НЕ_ЗАМІРЯНО else ""
            print(" " * відступ + f"{к}: {з}{позначка}")


if __name__ == "__main__":
    факти = зібрати()
    if "--json" in sys.argv:
        print(json.dumps(факти, ensure_ascii=False, indent=2))
    else:
        print("═══ ФАКТИ ДЛЯ CEO ═══")
        надрукувати(факти)
        print("\n🔸 — джерело не відповіло. Це НЕ нуль: висновків із таких "
              "рядків не робимо, їх ремонтують.")
