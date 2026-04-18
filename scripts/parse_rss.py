#!/usr/bin/env python3
"""CSTL NEWS — RSS парсер новин і подій.

Запуск: python scripts/parse_rss.py
Записує:
  data/articles.json — новини
  data/events.json   — події (концерти, ярмарки, збори тощо)
Дедуплікація: за sourceUrl + за нормалізованим заголовком.
"""

import datetime
import html
import json
import re
import time
from pathlib import Path

import feedparser

# ── Конфігурація джерел ────────────────────────────────────────────────────────

SOURCES = [
    {
        "url": "https://vo.suspilne.media/feed/",
        "name": "Суспільне Волинь",
        "geo": "Волинь",
    },
    {
        "url": "https://www.volynpost.com/rss.xml",
        "name": "Волинь Post",
        "geo": "Волинь",
    },
    {
        "url": "https://konkurent.ua/rss",
        "name": "Конкурент",
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
    {
        "url": "https://www.ukrinform.ua/rss/block-world.xml",
        "name": "Укрінформ Світ",
        "geo": "Світ",
    },
    {
        "url": "https://www.pravda.com.ua/rss/view_world/",
        "name": "Українська правда",
        "geo": "Світ",
    },
]

OLYKA_KEYWORDS = ["олика", "олицьк", "олицька"]
MAX_ARTICLES = 100
MAX_EVENTS   = 50
DATA_PATH    = Path("data/articles.json")
EVENTS_PATH  = Path("data/events.json")

# Ключові слова «загальнонаціональна вага» — для фільтра новин geo=Україна.
# Новини Волині та Олики публікуються без фільтра.
NATIONAL_KEYWORDS = [
    # Влада, закони, рішення
    "закон", "законопроект", "постанова", "указ", "кабмін",
    "верховна рада", "президент", "зеленськ", "уряд вирішив", "уряд затвердив",
    # Мобілізація та армія
    "мобілізац", "призов", "збройні сили", "зсу", "воєнний стан",
    "бойові дії", "фронт", "атак", "обстріл", "ракет",
    # Економіка і соціалка
    "податок", "тариф", "мінімальна зарплата", "прожитковий мінімум",
    "пенсія", "виплат", "субсидія", "комунальн", "ціна на газ",
    "підприємц", "підприємств",
    # Міжнародне і санкції
    "нато", "євросоюз", "санкці", "зброя для україни", "допомога україні",
    # Загальнонаціональні надзвичайні події
    "блекаут", "відключення електроенергії", "повітряна тривога", "надзвичайний стан",
]

# Ключові слова «важливі світові події» — для фільтра новин geo=Світ.
# Пропускаємо місцеві новини інших країн, беремо тільки те що може вплинути на Україну або всіх.
WORLD_KEYWORDS = [
    # Війни та конфлікти
    "війна", "конфлікт", "вторгнення", "бомбардування", "авіаудар",
    "збройний", "повстання", "теракт", "ядерн",
    # Енергетика та ціни (прямий вплив на Україну)
    "нафта", "газ", "opec", "ціна на нафт", "ціна на газ", "паливо",
    "енергетичн", "нафтопровід",
    # Глобальна економіка
    "економічна криза", "рецесія", "інфляція", "фондовий ринок",
    "мвф", "світовий банк", "долар", "євро курс",
    # Геополітика та міжнародні рішення
    "нато", "оон", "g7", "g20", "євросоюз", "сша", "байден", "трамп",
    "китай", "росія", "іран", "ізраїль", "санкці",
    "мирні переговори", "угода", "договір",
    # Технології з глобальним впливом
    "штучний інтелект", "ядерна енергетика", "кліматичн", "пандемія", "вірус",
    # Великі катастрофи
    "землетрус", "цунамі", "повінь", "виверження",
]

# Ключові слова-сигнали події (анонс, запрошення, захід)
EVENT_KEYWORDS = [
    "запрошує", "запрошуємо",
    "відбудеться", "відбудуться",
    "концерт", "вистава", "виставка", "фестиваль", "свято", "ярмарок",
    "захід", "заходи",
    "змагання", "турнір", "чемпіонат", "кубок",
    "збори", "зустріч", "засідання", "сесія ради",
    "громадське обговорення", "прийом громадян", "форум", "конференція", "семінар",
    "прем'єра", "урочисте відкриття",
    "благодійна акція", "благодійний ярмарок",
]

# Місяці українською (родовий відмінок — «22 квітня»)
MONTHS_UK = {
    "січня": 1, "лютого": 2, "березня": 3, "квітня": 4,
    "травня": 5, "червня": 6, "липня": 7, "серпня": 8,
    "вересня": 9, "жовтня": 10, "листопада": 11, "грудня": 12,
}

_month_alt = "|".join(MONTHS_UK.keys())
# Паттерн дати: «22 квітня» або «22 квітня 2026»
FUTURE_DATE_RE = re.compile(
    rf"\b(\d{{1,2}})\s+({_month_alt})(?:\s+(\d{{4}}))?\b", re.IGNORECASE
)

# Паттерн часу: «21:00», «10:00»
TIME_RE = re.compile(r"\b(\d{1,2}):(\d{2})\b")

# Паттерн локації: «📍 ...», «Місце:», «Локація:», «Адреса:»
LOCATION_RE = re.compile(r"(?:📍|Місце:|Локація:|Адреса:)\s*([^\n.!?]{3,80})", re.IGNORECASE)

# ── Допоміжні функції ──────────────────────────────────────────────────────────

def strip_html(text: str) -> str:
    # Параграфи/заголовки/списки → подвійний перенос (зберігає структуру тексту)
    text = re.sub(r"</(p|div|li|h[1-6])>", "\n\n", text or "", flags=re.IGNORECASE)
    text = re.sub(r"<br\s*/?>", "\n", text, flags=re.IGNORECASE)
    # Решта тегів — пробілом щоб слова не зливались
    text = re.sub(r"<[^>]+>", " ", text)
    # Нормалізуємо пробіли (не чіпаємо переноси рядків)
    text = re.sub(r"[ \t]+", " ", text)
    text = re.sub(r"\n{3,}", "\n\n", text)
    return html.unescape(text.strip())


def get_full_content(entry) -> str:
    """Повний текст статті: спочатку content:encoded, потім summary як fallback."""
    content_list = getattr(entry, "content", None)
    if content_list:
        best = max(content_list, key=lambda c: len(c.get("value", "")), default=None)
        if best:
            text = strip_html(best.get("value", ""))
            if len(text) > 150:          # ігноруємо порожні/технічні блоки
                return text[:8000]       # ліміт щоб не роздувати articles.json
    return strip_html(entry.get("summary") or entry.get("description") or "")


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


def is_nationally_relevant(text: str) -> bool:
    """Повертає True якщо новина стосується всіх українців, а не конкретного регіону."""
    low = text.lower()
    return any(kw in low for kw in NATIONAL_KEYWORDS)


def is_world_relevant(text: str) -> bool:
    """Повертає True якщо світова новина має реальний вплив (геополітика, енергетика, економіка тощо)."""
    low = text.lower()
    return any(kw in low for kw in WORLD_KEYWORDS)


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


def classify_entry(title: str, text: str) -> str:
    """Визначає тип запису: 'event' або 'news'.

    Логіка: є ключові слова події + знайдено майбутню дату → 'event'.
    Або 3+ ключових слова без дати — теж 'event' (сильний сигнал).
    """
    low = (title + " " + text).lower()

    event_hits = sum(1 for kw in EVENT_KEYWORDS if kw in low)
    if event_hits == 0:
        return "news"

    today = datetime.date.today()
    for m in FUTURE_DATE_RE.finditer(low):
        day = int(m.group(1))
        month = MONTHS_UK.get(m.group(2).lower(), 0)
        if not month:
            continue
        year = int(m.group(3)) if m.group(3) else today.year
        if year == today.year and month < today.month:
            year += 1
        try:
            if datetime.date(year, month, day) >= today:
                return "event"
        except ValueError:
            pass

    # Немає явної майбутньої дати, але дуже сильний сигнал
    if event_hits >= 3:
        return "event"

    return "news"


def extract_event_data(title: str, text: str, ts: int) -> dict:
    """Витягує дату, час і локацію з тексту події."""
    today = datetime.date.today()

    # Дата
    event_date = None
    for m in FUTURE_DATE_RE.finditer(text.lower()):
        day = int(m.group(1))
        month = MONTHS_UK.get(m.group(2).lower(), 0)
        if not month:
            continue
        year = int(m.group(3)) if m.group(3) else today.year
        if year == today.year and month < today.month:
            year += 1
        try:
            d = datetime.date(year, month, day)
            if d >= today:
                event_date = d.strftime("%Y-%m-%d")
                break
        except ValueError:
            pass

    if not event_date:
        # Fallback: дата публікації
        event_date = datetime.date.fromtimestamp(ts / 1000).strftime("%Y-%m-%d")

    # Час
    event_time = None
    for m in TIME_RE.finditer(text):
        h, mi = int(m.group(1)), int(m.group(2))
        if 6 <= h <= 23:
            event_time = f"{h:02d}:{mi:02d}"
            break

    # Локація
    event_location = None
    loc_m = LOCATION_RE.search(text)
    if loc_m:
        event_location = loc_m.group(1).strip()

    return {"date": event_date, "time": event_time, "location": event_location}


USER_AGENT = "Mozilla/5.0 (compatible; CSTL-NEWS-Bot/1.0; +https://github.com/Volodymyr221/CSTL_NEWS)"


def parse_source(source: dict, seen_urls: set, seen_titles: set) -> list:
    feed = feedparser.parse(source["url"], agent=USER_AGENT)

    status = getattr(feed, "status", 0)
    if status in (403, 404, 410):
        raise ValueError(f"HTTP {status}")
    if feed.bozo and not feed.entries:
        raise ValueError(f"Помилка парсингу: {feed.bozo_exception}")
    if not feed.entries:
        raise ValueError(f"Порожній фід (entries=0, status={status})")

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

        content = get_full_content(entry)
        excerpt = strip_html(entry.get("summary") or entry.get("description") or "")[:400]
        if not excerpt:
            excerpt = content[:400]

        published = entry.get("published_parsed") or entry.get("updated_parsed")
        ts = int(time.mktime(published) * 1000) if published else int(time.time() * 1000)

        text = title + " " + excerpt
        geo = detect_geo(text, source["geo"])

        # Волинь і Олика — без фільтра (беремо все).
        # Україна — тільки загальнонаціональні новини.
        # Світ — тільки геополітика, енергетика, економіка, великі події.
        if source["geo"] == "Україна" and geo == "Україна":
            if not is_nationally_relevant(text):
                continue
        if source["geo"] == "Світ" and geo == "Світ":
            if not is_world_relevant(text):
                continue

        category = detect_category(text)
        image = extract_image(entry)
        entry_type = classify_entry(title, excerpt + " " + content)

        articles.append({
            "title": title,
            "excerpt": excerpt,
            "content": content,
            "category": category,
            "geo": geo,
            "image": image,
            "source": source["name"],
            "sourceUrl": link,
            "exclusive": False,
            "ts": ts,
            "_type": entry_type,
        })
        seen_urls.add(link)
        seen_titles.add(norm)

    return articles


# ── Головна функція ────────────────────────────────────────────────────────────

def main():
    # Завантаження існуючих статей
    existing_articles = []
    if DATA_PATH.exists():
        try:
            existing_articles = json.loads(DATA_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"⚠ Помилка читання articles.json: {e}")

    seen_urls   = {a["sourceUrl"] for a in existing_articles if a.get("sourceUrl")}
    seen_titles = {normalize_title(a["title"]) for a in existing_articles if a.get("title")}
    next_art_id = max(
        (a["id"] for a in existing_articles if isinstance(a.get("id"), int)),
        default=0,
    ) + 1

    # Завантаження існуючих подій
    existing_events = []
    if EVENTS_PATH.exists():
        try:
            existing_events = json.loads(EVENTS_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"⚠ Помилка читання events.json: {e}")

    events_seen_urls   = {e["sourceUrl"] for e in existing_events if e.get("sourceUrl")}
    events_seen_titles = {normalize_title(e["title"]) for e in existing_events if e.get("title")}
    next_evt_id = max(
        (e["id"] for e in existing_events if isinstance(e.get("id"), int)),
        default=0,
    ) + 1

    # Об'єднані seen для дедуплікації між усіма джерелами
    all_seen_urls   = seen_urls | events_seen_urls
    all_seen_titles = seen_titles | events_seen_titles

    # Парсинг усіх джерел
    new_articles: list = []
    new_events:   list = []

    for source in SOURCES:
        try:
            parsed = parse_source(source, all_seen_urls, all_seen_titles)
            n_news = n_events = 0
            for item in parsed:
                entry_type = item.pop("_type", "news")
                if entry_type == "event":
                    evt = extract_event_data(
                        item["title"],
                        item["excerpt"] + " " + item["content"],
                        item["ts"],
                    )
                    new_events.append({
                        "id": next_evt_id,
                        "title": item["title"],
                        "description": item["excerpt"],
                        "date": evt["date"],
                        "time": evt["time"],
                        "location": evt["location"],
                        "category": item["category"],
                        "image": item["image"],
                        "source": item["source"],
                        "sourceUrl": item["sourceUrl"],
                        "auto": True,
                    })
                    next_evt_id += 1
                    n_events += 1
                else:
                    item["id"] = next_art_id
                    next_art_id += 1
                    new_articles.append(item)
                    n_news += 1

            parts = []
            if n_news:   parts.append(f"+{n_news} статей")
            if n_events: parts.append(f"+{n_events} подій")
            print(f"✓ {source['name']}: {', '.join(parts) if parts else 'нічого нового'}")
        except Exception as e:
            print(f"✗ {source['name']}: {e}")

    # Зберегти articles.json
    if new_articles:
        all_articles = new_articles + existing_articles
        all_articles.sort(key=lambda a: a.get("ts", 0), reverse=True)
        all_articles = all_articles[:MAX_ARTICLES]
        DATA_PATH.write_text(
            json.dumps(all_articles, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"✓ articles.json: {len(all_articles)} статей ({len(new_articles)} нових)")
    else:
        print("Нових статей немає.")

    # Зберегти events.json
    if new_events:
        today_str = datetime.date.today().strftime("%Y-%m-%d")
        # Прибираємо застарілі автоматичні події (минула дата)
        active_existing = [
            e for e in existing_events
            if not e.get("auto") or e.get("date", "9999") >= today_str
        ]
        all_events = new_events + active_existing
        all_events.sort(key=lambda e: (e.get("date") or "9999", e.get("time") or "00:00"))
        all_events = all_events[:MAX_EVENTS]
        EVENTS_PATH.write_text(
            json.dumps(all_events, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"✓ events.json: {len(all_events)} подій ({len(new_events)} нових)")
    else:
        print("Нових подій немає.")


if __name__ == "__main__":
    main()
