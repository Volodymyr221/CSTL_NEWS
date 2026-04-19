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
import urllib.parse
import urllib.request
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
    {
        "url": "https://kivertsi.rayon.in.ua/tags/olika",
        "name": "Район.Ківерці",
        "geo": "Олика",
        "type": "html",   # тег-сторінка без RSS — HTML-парсер
    },
]

OLYKA_KEYWORDS = ["олика", "олицьк", "олицька"]
MAX_ARTICLES     = 150
MAX_PER_SOURCE   = 15   # не більше 15 статей з одного джерела за раз
MAX_EVENTS       = 50
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
    text = html.unescape(text.strip())
    # Прибрати артефакти скороченого RSS: "Читати повністю", "Читати далі" тощо
    text = re.sub(r"\s*(Читати повністю|Читати далі|Читати більше|Read more)\s*[»›→]?\s*$", "", text, flags=re.IGNORECASE).strip()
    return text


def get_full_content(entry) -> str:
    """Повний текст статті: спочатку content:encoded, потім summary як fallback."""
    content_list = getattr(entry, "content", None)
    if content_list:
        valid = [c for c in content_list if isinstance(c, dict)]
        if valid:
            best = max(valid, key=lambda c: len(c.get("value") or ""), default=None)
            if best:
                text = strip_html(best.get("value") or "")
                if len(text) > 150:
                    return text[:8000]
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
        for m in media:
            if not isinstance(m, dict):
                continue
            url = m.get("url", "") or ""
            if any(ext in url.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                return url
    enclosures = getattr(entry, "enclosures", None)
    if enclosures:
        for enc in enclosures:
            if not isinstance(enc, dict):
                continue
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
# Для завантаження повного тексту статей — реалістичний Chrome UA щоб обійти базові блокування
BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36"

# CSS-селектори блоку тексту статті для кожного домену
ARTICLE_SELECTORS: dict[str, list[str]] = {
    "volynpost.com": [
        ".field-name-body .field-item",
        ".field-item",
        ".article-body",
        ".node-content",
        ".article__text",
    ],
    "konkurent.ua": [
        ".article-text",
        ".article__body",
        ".article__text",
        ".post-text",
        ".content-text",
        ".field-name-body .field-item",
        ".field-item.even",
        ".field-item",
        ".node__content",
        ".node-content",
        ".view-content",
        "[class*='article-body']",
        "[class*='article-text']",
        "[class*='post-body']",
    ],
    "suspilne.media": [
        ".article__body",
        ".post__body",
        ".article-content",
        ".article__text",
        ".news-item__text",
    ],
    "ukrinform.ua": [
        ".newsText",
        ".article-text",
        ".article__body",
    ],
    "pravda.com.ua": [
        ".post_text",
        ".article_text",
        ".news_text",
    ],
    "kivertsi.rayon.in.ua": [
        ".material__body",
        ".material-content",
        ".article__body",
        ".news-text",
        ".post-content",
        ".entry-content",
    ],
}

# Загальні селектори — якщо сайт-специфічні не спрацювали
_GENERIC_SELECTORS = [
    "[itemprop='articleBody']",
    ".article-body",
    ".article-content",
    ".article__body",
    ".post-content",
    ".entry-content",
    ".content-text",
    "article",
]

# Регулярний вираз для класів «шуму» (реклама, коментарі, навігація тощо)
_NOISE_RE = re.compile(
    r"(comment|social|share|related|sidebar|ad[s_-]|banner|recommend|widget|subscribe)",
    re.I,
)


def fetch_full_article(url: str) -> str | None:
    """Завантажує повний текст статті зі сторінки статті.

    Викликається коли RSS дає лише анонс (<600 символів).
    Повертає текст або None якщо не вдалося.
    """
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": BROWSER_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "uk-UA,uk;q=0.9",
            "Referer": "https://www.google.com/",
            "DNT": "1",
        })
        with urllib.request.urlopen(req, timeout=12) as r:
            raw = r.read()
    except Exception:
        return None

    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return None

    domain = re.sub(r"^www\.", "", urllib.parse.urlparse(url).netloc)
    soup = BeautifulSoup(raw, "html.parser")

    # Видаляємо шум: скрипти, реклами, навігацію, коментарі
    for tag in soup.find_all(["script", "style", "nav", "header", "footer",
                               "aside", "form", "iframe", "noscript"]):
        tag.decompose()
    for tag in soup.find_all(True):
        cls = " ".join(tag.get("class") or [])
        if _NOISE_RE.search(cls):
            tag.decompose()

    selectors = ARTICLE_SELECTORS.get(domain, []) + _GENERIC_SELECTORS
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            text = el.get_text(separator="\n", strip=True)
            text = re.sub(r"\n{3,}", "\n\n", text).strip()
            if len(text) > 300:
                return text[:8000]

    # Fallback: беремо блок з найбільшою кількістю тексту на сторінці
    best_text = ""
    for tag in soup.find_all(["div", "section", "article"]):
        # Пропускаємо вкладені блоки (беремо тільки верхні контейнери)
        if tag.find_parent(["div", "section", "article"]):
            continue
        t = tag.get_text(separator="\n", strip=True)
        t = re.sub(r"\n{3,}", "\n\n", t).strip()
        if len(t) > len(best_text):
            best_text = t
    if len(best_text) > 500:
        return best_text[:8000]

    return None


def _parse_date_uk(text: str) -> int | None:
    """Парсить українську дату з тексту → Unix timestamp (мс). Повертає None якщо не знайдено."""
    # ISO: 2026-04-18T10:30:00 або 2026-04-18
    m = re.search(r"(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}))?", text)
    if m:
        try:
            dt_str = m.group(1) + " " + (m.group(2) or "00:00")
            import datetime as _dt
            dt = _dt.datetime.strptime(dt_str, "%Y-%m-%d %H:%M")
            return int(dt.timestamp() * 1000)
        except ValueError:
            pass
    # Формат 18.04.2026
    m = re.search(r"(\d{1,2})\.(\d{2})\.(\d{4})", text)
    if m:
        try:
            import datetime as _dt
            dt = _dt.datetime(int(m.group(3)), int(m.group(2)), int(m.group(1)))
            return int(dt.timestamp() * 1000)
        except ValueError:
            pass
    return None


def parse_html_source(source: dict, seen_urls: set, seen_titles: set) -> list:
    """Парсить HTML-сторінку тега/рубрики (для сайтів без RSS).

    Очікує source["url"] = сторінка зі списком статей.
    Усі статті позначаються geo = source["geo"].
    """
    from bs4 import BeautifulSoup

    try:
        req = urllib.request.Request(source["url"], headers={
            "User-Agent": BROWSER_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "uk-UA,uk;q=0.9",
            "Referer": "https://www.google.com/",
            "DNT": "1",
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
    except Exception as e:
        raise ValueError(f"Не вдалось завантажити {source['url']}: {e}")

    base = "https://" + urllib.parse.urlparse(source["url"]).netloc
    soup = BeautifulSoup(raw, "html.parser")

    # ── Збираємо посилання на статті ────────────────────────────────────────
    candidates: list[tuple[str, str, object]] = []  # (href, title, container)

    # Спроба 1 — <article> теги
    for art in soup.find_all("article")[:25]:
        h = art.find(["h1", "h2", "h3"])
        a = (h.find("a", href=True) if h else None) or art.find("a", href=True)
        if h and a:
            href = a["href"]
            if not href.startswith("http"):
                href = base + href
            candidates.append((href, h.get_text(strip=True), art))

    # Спроба 2 — типові класи Ukrainian news CMS
    if not candidates:
        for item in soup.select(
            ".material-item, .news-item, .article-item, .post-item, "
            ".list-item, .feed-item, .card"
        )[:25]:
            h = item.find(["h1", "h2", "h3"])
            a = (h.find("a", href=True) if h else None) or item.find("a", href=True)
            if h and a:
                href = a["href"]
                if not href.startswith("http"):
                    href = base + href
                candidates.append((href, h.get_text(strip=True), item))

    # Спроба 3 — будь-яке посилання з заголовком поруч
    if not candidates:
        for a in soup.select("a[href]")[:40]:
            href = a["href"]
            title_text = a.get_text(strip=True)
            if len(title_text) > 30 and ("/news/" in href or "/articles/" in href or "/post" in href):
                if not href.startswith("http"):
                    href = base + href
                candidates.append((href, title_text, a.parent))

    # ── Обробляємо кожну статтю ──────────────────────────────────────────────
    articles = []
    for href, raw_title, container in candidates[:MAX_PER_SOURCE]:
        title = strip_html(raw_title).strip()
        if not title or not href:
            continue
        if href in seen_urls:
            continue
        norm = normalize_title(title)
        if norm in seen_titles:
            continue

        # Excerpt з контейнера (якщо є)
        exc_el = container.find(class_=re.compile(r"intro|excerpt|summary|preview|anons", re.I)) if hasattr(container, "find") else None
        excerpt = exc_el.get_text(strip=True)[:400] if exc_el else ""

        # Дата з контейнера
        ts = int(time.time() * 1000)
        date_el = container.find(["time", "span", "div"],
                                  class_=re.compile(r"date|time|published", re.I)) if hasattr(container, "find") else None
        if date_el:
            raw_date = date_el.get("datetime", "") or date_el.get_text(strip=True)
            parsed_ts = _parse_date_uk(raw_date)
            if parsed_ts:
                ts = parsed_ts

        # Повний текст статті
        content = fetch_full_article(href) or excerpt
        if not excerpt:
            excerpt = content[:400]

        # Зображення — перший <img> у контейнері
        image = None
        img_el = container.find("img") if hasattr(container, "find") else None
        if img_el:
            src = img_el.get("src") or img_el.get("data-src", "")
            if src and any(ext in src.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                image = src if src.startswith("http") else base + src

        category = detect_category(title + " " + excerpt)
        entry_type = classify_entry(title, excerpt + " " + content)

        articles.append({
            "title": title,
            "excerpt": excerpt,
            "content": content,
            "category": category,
            "geo": source["geo"],   # завжди "Олика" для цього джерела
            "image": image,
            "source": source["name"],
            "sourceUrl": href,
            "exclusive": False,
            "ts": ts,
            "_type": entry_type,
        })
        seen_urls.add(href)
        seen_titles.add(norm)

    return articles


def parse_source(source: dict, seen_urls: set, seen_titles: set) -> list:
    # HTML-джерела (тег-сторінки без RSS) — окремий парсер
    if source.get("type") == "html":
        return parse_html_source(source, seen_urls, seen_titles)

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
        if len(articles) >= MAX_PER_SOURCE:
            break
        try:
            title = strip_html(entry.get("title", "")).strip()
            link = (entry.get("link") or "").strip()
        except Exception:
            continue
        if not title or not link:
            continue
        if link in seen_urls:
            continue
        norm = normalize_title(title)
        if norm in seen_titles:
            continue  # та сама новина з іншого джерела — пропускаємо

        try:
            content = get_full_content(entry)
            # Якщо RSS дає лише анонс — дотягуємо повний текст зі сторінки статті
            if len(content) < 600 and link:
                full = fetch_full_article(link)
                if full and len(full) > len(content):
                    content = full

            excerpt = strip_html(entry.get("summary") or entry.get("description") or "")[:400]
            if not excerpt:
                excerpt = content[:400]

            published = entry.get("published_parsed") or entry.get("updated_parsed")
            ts = int(time.mktime(published) * 1000) if published else int(time.time() * 1000)

            text = title + " " + excerpt
            geo = detect_geo(text, source["geo"])

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
        except Exception:
            continue

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
