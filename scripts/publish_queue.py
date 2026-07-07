#!/usr/bin/env python3
"""Публікатор черги — крапельно викладає підготовлені агентом статті у стрічку.

AI-агент (ai_news_agent.py) готує ЗАПАС статей у data/news_queue.json раз на 6 год.
Цей скрипт запускається частіше (напр. кожні 2 год) і бере з черги кілька
НАЙСВІЖІШИХ → додає у data/articles.json (з дедупом/лімітами/балансом) → прибирає
їх з черги. Так стрічка «жива» весь час, а дорогий AI працює рідко. Циклічно.

Запуск:  python scripts/publish_queue.py [--count 2]
  --count  — скільки статей викласти за раз (за замовч. 2).
"""
import sys
import json
import time
import argparse
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parse_rss as pr  # noqa: E402

QUEUE_PATH = Path("data/news_queue.json")
DEFAULT_COUNT = 2


def load_json(path: Path) -> list:
    if path.exists():
        try:
            return json.loads(path.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"⚠ читання {path}: {e}")
    return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--count", type=int, default=DEFAULT_COUNT, help="скільки викласти за раз")
    args = ap.parse_args()

    queue = load_json(QUEUE_PATH)
    if not queue:
        print("Черга порожня — нічого публікувати.")
        return

    existing = load_json(pr.DATA_PATH)
    for a in existing:                       # міграція старої назви розділу
        if a.get("geo") == "Олика":
            a["geo"] = "Громада"

    # дедуп-стан наявної стрічки
    seen_urls = {a.get("sourceUrl") for a in existing if a.get("sourceUrl")}
    seen_by_section: dict = {}
    for a in existing:
        if a.get("title"):
            pr.remember_title(pr.title_tokens(a["title"]), pr.section_of(a.get("geo", "")), seen_by_section)
    next_id = max((a["id"] for a in existing if isinstance(a.get("id"), int)), default=0) + 1

    # найсвіжіші з черги — першими
    queue.sort(key=lambda q: q.get("ts", 0), reverse=True)

    published, leftover = [], []
    for a in queue:
        # уже викладено скільки треба, або дубль → лишаємо/викидаємо
        if len(published) >= args.count:
            leftover.append(a)
            continue
        url = a.get("sourceUrl")   # для оригінальних матеріалів = None
        section = pr.section_of(a.get("geo", ""))
        tokens = pr.title_tokens(a.get("title", ""))
        if (url and url in seen_urls) or pr.is_dup_title(tokens, section, seen_by_section):
            continue  # вже у стрічці — просто прибираємо з черги (не в leftover)
        a.pop("queued_ts", None)
        a["id"] = next_id
        a["added_ts"] = int(time.time() * 1000)
        next_id += 1
        published.append(a)
        if url:
            seen_urls.add(url)   # None (оригінал) не додаємо — інакше наступний оригінал = «дубль»
        pr.remember_title(tokens, section, seen_by_section)

    if not published:
        print("Немає що публікувати (усе в черзі — дублі). Чистимо чергу.")
        QUEUE_PATH.write_text(json.dumps(leftover, ensure_ascii=False, indent=2), encoding="utf-8")
        return

    # денні ліміти діють і тут (щоб один розділ не залив стрічку)
    published, evict_ids = pr.apply_daily_limits(published, existing)
    if evict_ids:
        existing = [a for a in existing if a.get("id") not in evict_ids]

    all_articles = published + existing
    all_articles.sort(key=lambda a: a.get("ts", 0), reverse=True)
    all_articles = pr.balance_ua_world(all_articles)
    all_articles = all_articles[:pr.MAX_ARTICLES]
    pr.DATA_PATH.write_text(json.dumps(all_articles, ensure_ascii=False, indent=2), encoding="utf-8")
    QUEUE_PATH.write_text(json.dumps(leftover, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"✓ опубліковано {len(published)}; у черзі лишилось {len(leftover)}")


if __name__ == "__main__":
    main()
