#!/usr/bin/env python3
"""CSTL NEWS — монітор здоров'я даних (рішення Роми 01.07.2026).

Запускається у rss-parser.yml ПІСЛЯ парсера. Перевіряє «тихі» поломки:
несвіжа стрічка, зникла Волинь/Громада, каша з УП, чужі події.

Пише звіт у `CSTL NEWS VOVA/_ai-tools/HEALTH.md` — але ПЕРЕЗАПИСУЄ файл
лише коли СТАН змінився (порівняння без рядка дати), щоб не плодити
порожні коміти кожні 30 хв. Ніколи не падає (exit 0 завжди) — здоров'я
не має валити сам парсер.

Тільки стандартна бібліотека — жодних залежностей.
"""

import datetime
import json
import time
from pathlib import Path

ARTICLES_PATH = Path("data/articles.json")
EVENTS_PATH   = Path("data/events.json")
OUT_PATH      = Path("CSTL NEWS VOVA/_ai-tools/HEALTH.md")

HOUR_MS = 3600 * 1000


def section_of(geo: str) -> str:
    """Розділ стрічки за geo (дзеркало parse_rss.section_of — без імпорту,
    щоб health_check не залежав від feedparser)."""
    if geo in ("Україна", "Світ"):
        return "Україна та Світ"
    if geo == "Волинь":
        return "Волинь"
    if geo == "Олика":
        return "Громада"
    return geo or "інше"


def load(path: Path) -> list:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return []


def run_checks() -> list:
    """Повертає список (статус, назва, деталь). Статус: ✅ / ⚠️ / 🔴."""
    checks = []
    now = time.time() * 1000
    arts = load(ARTICLES_PATH)
    events = load(EVENTS_PATH)

    # 1. Свіжість стрічки — чи парсер взагалі додає нове (чи живий cron)
    if not arts:
        checks.append(("🔴", "Стрічка новин", "articles.json порожній або не читається"))
    else:
        newest = max((a.get("added_ts") or a.get("ts") or 0) for a in arts)
        age_h = (now - newest) / HOUR_MS
        if age_h <= 6:
            checks.append(("✅", "Свіжість стрічки", f"останнє додавання {age_h:.0f} год тому"))
        elif age_h <= 24:
            checks.append(("⚠️", "Свіжість стрічки",
                           f"останнє додавання {age_h:.0f} год тому — cron відстає"))
        else:
            checks.append(("🔴", "Свіжість стрічки",
                           f"нічого нового {age_h:.0f} год — cron мертвий або всі джерела впали"))

    # 2. Волинь — чи є свіжі волинські новини (за 72 год)
    fresh_volyn = sum(1 for a in arts
                      if section_of(a.get("geo", "")) == "Волинь"
                      and (a.get("added_ts") or a.get("ts") or 0) > now - 72 * HOUR_MS)
    if fresh_volyn:
        checks.append(("✅", "Волинь", f"{fresh_volyn} стат. за 72 год"))
    else:
        checks.append(("⚠️", "Волинь", "0 статей за 72 год — перевірити Волинь Post/Конкурент"))

    # 3. Громада — свіжі статті про Олику (за 7 днів; публікують рідко)
    fresh_olyka = sum(1 for a in arts
                      if section_of(a.get("geo", "")) == "Громада"
                      and (a.get("added_ts") or a.get("ts") or 0) > now - 7 * 24 * HOUR_MS)
    if fresh_olyka:
        checks.append(("✅", "Громада", f"{fresh_olyka} стат. за 7 днів"))
    else:
        checks.append(("⚠️", "Громада",
                       "0 статей за 7 днів — перевірити сайт громади / Google News / історії"))

    # 4. Каша — частка «Україна та Світ» у стрічці (ліміти мають тримати ≤~70%)
    if arts:
        uaw = sum(1 for a in arts if section_of(a.get("geo", "")) == "Україна та Світ")
        share = uaw / len(arts) * 100
        if share <= 70:
            checks.append(("✅", "Баланс стрічки", f"«Україна та Світ» = {share:.0f}% стрічки"))
        else:
            checks.append(("⚠️", "Баланс стрічки",
                           f"«Україна та Світ» = {share:.0f}% — каша повертається, глянути ліміти"))

    # 5. Події — лише з громади (авто) і без протермінованих
    today = datetime.date.today().strftime("%Y-%m-%d")
    alien = sum(1 for e in events if e.get("auto") and e.get("source") != "Олицька громада")
    stale = sum(1 for e in events if e.get("auto") and (e.get("date") or "9999") < today)
    if alien:
        checks.append(("🔴", "Події", f"{alien} авто-подій НЕ з громади — фільтр зламався"))
    elif stale:
        checks.append(("⚠️", "Події", f"{stale} протермінованих авто-подій не почищено"))
    else:
        checks.append(("✅", "Події", f"{len(events)} подій, всі коректні"))

    return checks


def build_report(checks: list) -> tuple:
    """Повертає (повний_текст, тіло_без_дати) — тіло для порівняння змін."""
    worst = "✅"
    if any(c[0] == "🔴" for c in checks):
        worst = "🔴"
    elif any(c[0] == "⚠️" for c in checks):
        worst = "⚠️"

    body_lines = [
        "# HEALTH.md — здоров'я даних CSTL NEWS",
        "",
        f"**Загальний стан: {worst}**",
        "",
        "| Стан | Перевірка | Деталь |",
        "|------|-----------|--------|",
    ]
    body_lines += [f"| {s} | {name} | {detail} |" for s, name, detail in checks]
    body_lines += [
        "",
        "> Оновлюється парсером (rss-parser.yml) — але файл перезаписується",
        "> ЛИШЕ при зміні стану, тому дата нижче = момент останньої зміни.",
        "> 🔴 = зламано, треба дивитись. ⚠️ = підозріло. Деталі: `scripts/health_check.py`.",
    ]
    body = "\n".join(body_lines)
    stamp = datetime.datetime.utcnow().strftime("%d.%m.%Y %H:%M UTC")
    full = body + f"\n\n_Стан змінився: {stamp}_\n"
    return full, body


def previous_body() -> str:
    """Тіло попереднього звіту (без рядка дати) для порівняння."""
    try:
        text = OUT_PATH.read_text(encoding="utf-8")
    except Exception:
        return ""
    return text.split("\n\n_Стан змінився:")[0]


def main():
    try:
        checks = run_checks()
        full, body = build_report(checks)
        for s, name, detail in checks:
            print(f"{s} {name}: {detail}")
        if body != previous_body():
            OUT_PATH.write_text(full, encoding="utf-8")
            print("→ стан змінився, HEALTH.md оновлено")
        else:
            print("→ стан без змін, HEALTH.md не чіпаємо")
    except Exception as e:
        # Здоров'я не має валити парсер — лише повідомляємо
        print(f"health_check помилка (не критично): {e}")


if __name__ == "__main__":
    main()
