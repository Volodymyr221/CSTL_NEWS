#!/usr/bin/env python3
"""CSTL NEWS — RSS парсер новин.

Запуск: python scripts/parse_rss.py
Записує data/articles.json з новими статтями.
Дедуплікація: за sourceUrl + за нормалізованим заголовком (та сама новина з двох джерел — не дублюється).
"""

import json
import re
import time
from pathlib import Path

import feedparser

# ── Конфігурація джерел ────────────────────────────────────────────────────────

SOURCES = [
    {
        "url": "https://suspilne.media/rss/volyn.xml",
        "name": "Суспільне Волинь",
        "geo": "Волинь",
    },
    {
        "url": "https://volynpost.com/rss",
        "name": "Волинь Post",
        "geo": "Волинь",
    },
    {
        "url": "https://www.ukrinform.ua/rss/block-volyn.xml",
        "name": "Укрінформ Волинь",
        "geo": "Волинь",
    },
    {
        "url": "https://www.pravda.com.ua/rss/view_news/",
        "name": "Українська правда",
        "geo": "Україна",
    },
]

OLYKA_KEYWORDS = ["олика", "олицьк", "олицька"]
MAX_ARTICLES = 100
DATA_PATH = Path("data/articles.json")

# ── Допоміжні функції ──────────────────────────────────────────────────────────

def strip_html(text: str) -> str:
    return re.sub(r"<[^>]+>", "", text or "").strip()


def normalize_title(title: str) -> str:
    """Нормалізований заголовок для порівняння між джерелами."""
    t = title.lower()
    t = re.sub(r"[^\w\s]", "", t)   # прибрати пунктуацію
    t = re.sub(r"\s+", " ", t).strip()
    return t


def detect_geo(text: str, default_geo: str) -> str:
    low = text.lower()
    if any(kw in low for kw in OLYKA_KEYWORDS):
        return "Олика"
    return default_geo


def detect_category(text: str) -> str:
    low = text.lower()
    if any(kw in low for kw in ["культур", "мистецтв", "музей", "замок", "театр", "кіно", "виставк"]):
        return "Культура"
    if any(kw in low for kw in ["спорт", "футбол", "волейбол", "чемпіон", "змаган", "матч"]):
        return "Спорт"
    if any(kw in low for kw in ["бізнес", "економік", "бюджет", "гроші", "кошти", "фінанс", "інвест"]):
        return "Бізнес"
    return "Суспільство"


def extract_image(entry) -> str | None:
    media = getattr(entry, "media_content", None)
    if media and isinstance(media, list):
        url = media[0].get("url", "")
        if any(ext in url.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]):
            return url
    enclosures = getattr(entry, "enclosures", None)
    if enclosures:
        for enc in enclosures:
            if enc.get("type", "").startswith("image"):
                return enc.get("href") or enc.get("url")
    return None


def parse_source(source: dict, seen_urls: set, seen_titles: set) -> list:
    feed = feedparser.parse(source["url"])

    if feed.bozo and not feed.entries:
        raise ValueError(f"Помилка парсингу: {feed.bozo_exception}")

    articles = []
    for entry in feed.entries[:20]:
        title = strip_html(entry.get("title", "")).strip()
        link = (entry.get("link") or "").strip()
        if not title or not link:
            continue
        if link in seen_urls:
            continue
        norm = normalize_title(title)
        if norm in seen_titles:
            continue  # та сама новина з іншого джерела — пропускаємо

        summary = strip_html(entry.get("summary") or entry.get("description") or "")[:500]

        published = entry.get("published_parsed") or entry.get("updated_parsed")
        ts = int(time.mktime(published) * 1000) if published else int(time.time() * 1000)

        text = title + " " + summary
        geo = detect_geo(text, source["geo"])
        category = detect_category(text)
        image = extract_image(entry)

        articles.append({
            "title": title,
            "excerpt": summary,
            "content": summary,
            "category": category,
            "geo": geo,
            "image": image,
            "source": source["name"],
            "sourceUrl": link,
            "exclusive": False,
            "ts": ts,
        })
        seen_urls.add(link)
        seen_titles.add(norm)

    return articles


# ── Головна функція ────────────────────────────────────────────────────────────

def main():
    existing = []
    if DATA_PATH.exists():
        try:
            existing = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"⚠ Помилка читання articles.json: {e}")

    seen_urls   = {a["sourceUrl"] for a in existing if a.get("sourceUrl")}
    seen_titles = {normalize_title(a["title"]) for a in existing if a.get("title")}
    next_id = max(
        (a["id"] for a in existing if isinstance(a.get("id"), int)),
        default=0,
    ) + 1

    new_articles = []
    for source in SOURCES:
        try:
            parsed = parse_source(source, seen_urls, seen_titles)
            for a in parsed:
                a["id"] = next_id
                next_id += 1
            new_articles.extend(parsed)
            print(f"✓ {source['name']}: +{len(parsed)} статей")
        except Exception as e:
            print(f"✗ {source['name']}: {e}")

    if not new_articles:
        print("Нових статей немає.")
        return

    all_articles = new_articles + existing
    all_articles.sort(key=lambda a: a.get("ts", 0), reverse=True)
    all_articles = all_articles[:MAX_ARTICLES]

    DATA_PATH.write_text(
        json.dumps(all_articles, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    print(f"✓ Збережено: {len(all_articles)} статей ({len(new_articles)} нових)")


if __name__ == "__main__":
    main()
