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
import traceback
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

# feedparser потрібен ЛИШЕ для самого парсингу RSS (нижче, у fetch_feed).
# Інші скрипти (sync_cms.py — публікатор кабінету) імпортують звідси лише чисті
# helper'и (дедуп/ліміти) і НЕ парсять RSS — тож не змушуємо їх ставити feedparser.
# Без стійкого імпорту публікатор падав: ModuleNotFoundError → нічого не синкалось.
try:
    import feedparser
except ImportError:
    feedparser = None

# ── Конфігурація джерел ────────────────────────────────────────────────────────

SOURCES = [
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
        "url": "https://www.pravda.com.ua/rss/view_news/",
        "name": "Українська правда",
        "geo": "Україна",
    },
    {
        "url": "https://www.pravda.com.ua/rss/view_world/",
        "name": "Українська правда",
        "geo": "Світ",
    },
    {
        "url": "https://kivertsi.rayon.in.ua/tags/olika",
        "name": "Район.Ківерці",
        "geo": "Громада",
        "type": "html",   # тег-сторінка без RSS — HTML-парсер
    },
    {
        "url": "https://cstl-proxy.volodymyrshevchuk19.workers.dev/?path=/news/",
        "name": "Олицька громада",
        "geo": "Громада",
        "type": "gromada",
    },
    {
        "url": "https://cstl-proxy.volodymyrshevchuk19.workers.dev/?path=/ogoloshennya-11-12-45-18-02-2021/",
        "name": "Олицька громада",
        "geo": "Громада",
        "type": "gromada",
    },
    # Google News ВИМКНЕНО 05.07.2026 — його замінює AI-агент (scripts/ai_news_agent.py,
    # місія «Громада»): справжні URL + повний текст, без крихкого розкодування Google.
    # Код gnews лишається в парсері (мертвий шлях), щоб не ламати логіку; джерело прибрано.
]

# Cloudflare Worker (посередник між GitHub Actions і сайтом громади)
GROMADA_PROXY = "https://cstl-proxy.volodymyrshevchuk19.workers.dev"
GROMADA_BASE  = "https://olytska-gromada.gov.ua"

# ── Анти-SSRF (Server-Side Request Forgery — підробка запиту з боку сервера) ──
# fetch_full_article() ходить за посиланнями ЗІ СТРІЧКИ (RSS), а їх контролює
# джерело. Зловмисне джерело могло б підсунути file:///etc/passwd або
# http://169.254.169.254/ (метадані хмари) → парсер завантажив би це на runner.
# Тому дозволяємо завантажувати повний текст ТІЛЬКИ з доменів відомих видань.
def _host_is_public(host: str) -> bool:
    """True якщо УСІ IP, у які резолвиться host, — публічні (не внутрішні).

    Анти-SSRF за IP (замінив білий список доменів 05.07): дозволяємо будь-яке
    публічне видання, але блокуємо звернення на внутрішні адреси (localhost,
    10.*, 192.168.*, 169.254.* хмарні метадані тощо) — саме вони є реальною
    загрозою SSRF. Резолвимо ім'я і перевіряємо кожну отриману адресу.
    """
    import ipaddress
    import socket
    try:
        infos = socket.getaddrinfo(host, None)
    except Exception:
        return False
    if not infos:
        return False
    for info in infos:
        ip_str = info[4][0]
        try:
            addr = ipaddress.ip_address(ip_str)
        except ValueError:
            return False
        if (addr.is_private or addr.is_loopback or addr.is_link_local
                or addr.is_reserved or addr.is_multicast or addr.is_unspecified):
            return False
    return True


def is_allowed_url(url: str) -> bool:
    """True для будь-якого ПУБЛІЧНОГО http(s) URL; блокує внутрішні адреси (анти-SSRF)."""
    try:
        p = urllib.parse.urlparse(url)
    except Exception:
        return False
    if p.scheme not in ("http", "https"):
        return False          # блокує file://, ftp://, gopher:// тощо
    host = (p.hostname or "").lower()
    if not host:
        return False
    return _host_is_public(host)


class _SafeRedirectHandler(urllib.request.HTTPRedirectHandler):
    """Блокує редирект на приватну адресу (SSRF через 3xx-перенаправлення)."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        if not is_allowed_url(newurl):
            return None       # не йдемо за редиректом на внутрішній ресурс
        return super().redirect_request(req, fp, code, msg, headers, newurl)


# Опенер із перевіркою редиректів — для завантаження повного тексту статей.
SAFE_OPENER = urllib.request.build_opener(_SafeRedirectHandler)

OLYKA_KEYWORDS = ["олика", "олицьк", "олицька"]

# Розумний парсер Олики (Крок 3b): релевантність за ЦІЛИМИ словами (\b — межа слова),
# щоб не ловити хибне (напр. «дерно» всередині «модерно»). Олика + села громади +
# історичні згадки (замок / Радзивілли).
_OLYKA_TERMS = [
    r"олик\w*", r"олиц\w*", r"радзивіл\w*",       # Олика / Олицька / Радзивілли
    r"дідич\w*", r"залісоч\w*", r"горянівк\w*",    # села громади
    r"хром[\W]?яків", r"дерно",                    # Хром'яків, Дерно
]
OLYKA_RE = re.compile(r"\b(" + "|".join(_OLYKA_TERMS) + r")\b", re.IGNORECASE)


def is_olyka_relevant(text: str) -> bool:
    """True якщо текст справді згадує Олику / села громади / замок (ціле слово)."""
    return bool(OLYKA_RE.search(text or ""))


# Волинські маркери (Потік 11, Вова 14.07): «Волинь» = ЛИШЕ новини що реально
# згадують Волинь/область/її міста-села. Той самий патерн цілих слів що
# _OLYKA_TERMS. Покриття: корінь «волин*» (Волинь/волинський/волиняни) ловить
# і назви районів/громад («Ківерцівський район Волинської області»), тому
# перелік міст — головні + впізнавані містечка області.
# ⚠️ Пастка: «Володимир» ОКРЕМО — НЕ маркер (це ім'я: «Володимир Зеленський»
# тримало б національну новину у «Волині») — лише «Володимир-Волинський».
_VOLYN_TERMS = [
    r"волин\w*",                      # Волинь / волинський / волиняни / Волиньрада
    r"луцьк\w*", r"лучан\w*",         # Луцьк / лучани
    r"ковел\w*",                      # Ковель / ковельський / ковельчани
    r"нововолинськ\w*",
    r"володимир[-‐]волинськ\w*",      # стара офіційна назва міста Володимир
    r"ківерц\w*",                     # Ківерці / ківерцівський
    r"маневи[чц]\w*",                 # Маневичі / маневицький
    r"ратн\w*",                       # Ратне / ратнівський
    r"любомл\w*",                     # Любомль / любомльський
    r"кам[іе]н[ья][-‐\s]каширськ\w*", # Камінь-Каширський
    r"горохів\w*",                    # Горохів / горохівський
    r"локач\w*",                      # Локачі / локачинський
    r"рожищ\w*",                      # Рожище / рожищенський
    r"турійськ\w*",                   # Турійськ
    r"шацьк\w*",                      # Шацьк / шацькі озера
    r"любешів\w*",                    # Любешів
    r"іванич\w*",                     # Іваничі / іваничівський
    r"вижівк\w*", r"вижівськ\w*",     # Стара Вижівка / старовижівський
    r"устилуг\w*",
    r"берестечк\w*",                  # Берестечко
    r"цуман\w*",                      # Цумань
]
VOLYN_RE = re.compile(r"\b(" + "|".join(_VOLYN_TERMS) + r")\b", re.IGNORECASE)

# Згадки самих волинських видань у тексті («як повідомляє ВолиньPost») — НЕ
# ознака волинської новини; зачищаємо перед перевіркою VOLYN_RE.
_VOLYN_MEDIA_RE = re.compile(
    r"(волинь\s*post|волиньpost|волиньпост|volynpost|волинські\s+новини)",
    re.IGNORECASE,
)


def mentions_volyn(text: str) -> bool:
    """True якщо текст реально про Волинь (ціле слово; підписи видань не рахуються)."""
    return bool(VOLYN_RE.search(_VOLYN_MEDIA_RE.sub(" ", text or "")))


def gnews_clean_title(title: str, entry) -> str:
    """Прибирає суфікс « - Назва видання» з заголовка Google News.

    Формат gnews: «Заголовок - Видавець». Спершу точний зріз за entry.source.title,
    fallback — останній сегмент після « - » (для gnews він завжди видавець).
    """
    pub = entry.get("source") or {}
    pt = pub.get("title") if isinstance(pub, dict) else None
    if pt and title.endswith(" - " + pt):
        return title[: -len(" - " + pt)].strip()
    if " - " in title:
        return title.rsplit(" - ", 1)[0].strip()
    return title


def resolve_gnews_url(link: str) -> str:
    """Розв'язує redirect-посилання news.google.com у справжній URL видавця.

    Дає: (1) «Читати оригінал» веде на сайт видання, не на Google; (2) дедуп за
    справжнім URL; (3) повний текст статті — fetch_full_article пройде whitelist.
    Тіло відповіді не читаємо — беремо лише фінальний URL після редиректів; сам
    контент і далі тягнеться ТІЛЬКИ з ALLOWED_FETCH_DOMAINS (анти-SSRF збережено).
    При будь-якій помилці повертає початкове посилання.
    """
    try:
        req = urllib.request.Request(link, headers={"User-Agent": BROWSER_UA})
        with urllib.request.urlopen(req, timeout=10) as r:
            final = r.geturl()
        if final and "news.google.com" not in (urllib.parse.urlparse(final).hostname or ""):
            return final
    except Exception:
        pass
    return link


MAX_ARTICLES     = 150
MAX_PER_SOURCE   = 15   # не більше 15 статей з одного джерела за раз
MAX_EVENTS       = 50
DATA_PATH    = Path("data/articles.json")
EVENTS_PATH  = Path("data/events.json")
STORIES_PATH = Path("data/olyka-stories.json")   # пул історичних «історій Олики»

# Ключові слова «загальнонаціональна вага» — для фільтра новин geo=Україна.
# Новини Волині та Олики публікуються без фільтра.
NATIONAL_KEYWORDS = [
    # Влада, закони, рішення
    "закон", "законопроект", "постанова", "указ", "кабмін",
    "верховна рада", "президент", "зеленськ", "уряд вирішив", "уряд затвердив",
    "прем'єр", "премʼєр", "мзс",
    # Ворог/загрози (національний вимір війни) — Потік 11
    "кремл", "путін", "ядерн",
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


# ── Дедуплікація (Крок 2 ТЗ парсерів, 01.07) — нечітка, у межах розділу ──────────
# Ловить не лише 100% однакові заголовки, а й ПЕРЕФРАЗОВані про ту саму подію.
# Порівнюємо заголовки як МНОЖИНИ значущих слів (Jaccard — % спільних слів від
# їх об'єднання). Дедуп у МЕЖАХ РОЗДІЛУ (Україна та Світ / Волинь / Громада) —
# та сама тема в різних розділах не зникає помилково.

# Стоп-слова — службові слова без сенсу для порівняння (прийменники, сполучники)
STOPWORDS_UK = {
    "і", "й", "та", "а", "але", "або", "в", "у", "на", "з", "із", "зі", "до",
    "за", "по", "про", "від", "для", "що", "як", "це", "не", "є", "під", "над",
    "при", "о", "об", "the", "of", "in", "on", "and",
}

# Поріг схожості заголовків: ≥65% спільних слів → дубль (рішення Роми 01.07).
TITLE_SIM_THRESHOLD = 0.65


def section_of(geo: str) -> str:
    """Розділ стрічки для дедуплікації (визначається за geo статті)."""
    if geo in ("Україна", "Світ"):
        return "Україна та Світ"
    if geo == "Волинь":
        return "Волинь"
    if geo in ("Олика", "Громада"):   # «Олика» — стара назва, «Громада» — нова (05.07)
        return "Громада"
    return geo or "інше"


def title_tokens(title: str) -> set:
    """Множина значущих слів заголовка (для порівняння схожості)."""
    return {w for w in normalize_title(title).split()
            if len(w) > 2 and w not in STOPWORDS_UK}


def is_dup_title(tokens: set, section: str, seen_by_section: dict) -> bool:
    """True якщо заголовок схожий на вже бачений У ЦЬОМУ Ж РОЗДІЛІ (Jaccard ≥ поріг)."""
    if not tokens:
        return False
    for prev in seen_by_section.get(section, ()):
        union = tokens | prev
        if union and len(tokens & prev) / len(union) >= TITLE_SIM_THRESHOLD:
            return True
    return False


def remember_title(tokens: set, section: str, seen_by_section: dict) -> None:
    """Запам'ятати заголовок у його розділі (для подальших порівнянь)."""
    if tokens:
        seen_by_section.setdefault(section, []).append(tokens)


def balance_ua_world(articles: list, ua_ratio: float = 0.6) -> list:
    """Баланс розділу «Україна та Світ»: 60% Україна / 40% Світ (рішення Роби 01.07).

    Не дає національним новинам витісняти світові й навпаки. Меншість задає
    загальний обсяг розділу (тримаємо точну пропорцію). `articles` має бути вже
    відсортований за часом (новіші зверху) — беремо найсвіжіші. Інші розділи
    (Волинь / Громада) не чіпаємо; порядок за часом зберігається.
    """
    ua    = [a for a in articles if a.get("geo") == "Україна"]
    world = [a for a in articles if a.get("geo") == "Світ"]
    if not ua or not world:
        return articles  # нема двох сторін — балансувати нічого
    total   = int(min(len(ua) / ua_ratio, len(world) / (1 - ua_ratio)))
    n_ua    = round(total * ua_ratio)
    n_world = total - n_ua
    keep = {id(a) for a in ua[:n_ua]} | {id(a) for a in world[:n_world]}
    return [a for a in articles
            if a.get("geo") not in ("Україна", "Світ") or id(a) in keep]


# Денні ліміти НОВИХ статей на розділ — щоб стрічка не була кашею (рішення Роби 01.07).
# Громада/Олика — БЕЗ ліміту (найцінніший локальний контент, його й так мало).
DAILY_LIMIT_PER_SECTION = {
    "Україна та Світ": 6,
    "Волинь": 6,
}


def _added_date(a: dict):
    """Дата коли парсер ДОДАВ статтю (за полем added_ts). None якщо поля нема (старі)."""
    ts = a.get("added_ts")
    if not ts:
        return None
    try:
        return datetime.date.fromtimestamp(ts / 1000)
    except Exception:
        return None


def apply_daily_limits(new_articles: list, existing_articles: list):
    """Тримає не більше DAILY_LIMIT_PER_SECTION НАЙСВІЖІШИХ статей на розділ за добу.

    «Найсвіжіші перемагають» (рішення Роми 05.07 — фікс замерзлої стрічки):
    ліміт більше не «перші N і стоп», а «N найсвіжіших за сьогодні». Коли розділ
    уже повний, свіжіша (за ts публікації) стаття ВИТІСНЯЄ найстарішу СЬОГОДНІШНЮ —
    так стрічка завжди показує свіже, але денний притік лишається обмеженим (каші
    нема). Статті попередніх днів не чіпаємо (вони згасають самі через MAX_ARTICLES).

    Рахунок «сьогоднішніх» — за added_ts (коли ДОДАЛИ). Громада/Олика — без ліміту.
    Повертає (kept_new, evict_ids): нові що лишаємо + id сьогоднішніх що витіснили.
    """
    today = datetime.date.today()
    # Сьогоднішні наявні по розділах, найстаріші (за ts публікації) спереду — для витіснення.
    todays: dict = {}
    for a in existing_articles:
        if _added_date(a) == today:
            s = section_of(a.get("geo", ""))
            todays.setdefault(s, []).append(a)
    for s in todays:
        todays[s].sort(key=lambda a: a.get("ts", 0))   # найстаріша першою

    kept, evict_ids = [], set()
    for a in sorted(new_articles, key=lambda a: a.get("ts", 0), reverse=True):
        s = section_of(a.get("geo", ""))
        lim = DAILY_LIMIT_PER_SECTION.get(s)           # None = без ліміту (Громада/Олика)
        if lim is None:
            kept.append(a)
            continue
        cur = todays.setdefault(s, [])
        if len(cur) < lim:                             # є вільне місце сьогодні
            kept.append(a)
            cur.append(a)
            cur.sort(key=lambda x: x.get("ts", 0))
        else:                                          # повно — витісняємо найстарішу, якщо ця свіжіша
            oldest = cur[0]
            if a.get("ts", 0) > oldest.get("ts", 0):
                evict_ids.add(oldest.get("id"))
                cur.pop(0)
                kept.append(a)
                cur.append(a)
                cur.sort(key=lambda x: x.get("ts", 0))
            # інакше — стаття старіша за все сьогоднішнє, пропускаємо
    return kept, evict_ids


def drip_story(existing_articles: list, next_id: int):
    """Крапельний режим історичних «історій Олики» (рішення Роми 01.07).

    Раз на день додає ОДНУ історію з пулу `data/olyka-stories.json` — щоб стрічка
    Громади жила навіть коли свіжих новин нема. Ротація за днем (детерміновано,
    без стану). Пропускає якщо історію вже додано сьогодні або вона вже у стрічці.
    Повертає (стаття | None, next_id).
    """
    if not STORIES_PATH.exists():
        return None, next_id
    try:
        stories = json.loads(STORIES_PATH.read_text(encoding="utf-8"))
    except Exception:
        return None, next_id
    if not stories:
        return None, next_id

    today = datetime.date.today()
    # одна історія на день: якщо вже додали сьогодні — виходимо
    for a in existing_articles:
        if a.get("kind") == "story" and _added_date(a) == today:
            return None, next_id

    story = stories[today.toordinal() % len(stories)]   # ротація по пулу за днем
    seen = {normalize_title(a.get("title", "")) for a in existing_articles}
    if normalize_title(story.get("title", "")) in seen:
        return None, next_id   # вже у стрічці — не дублюємо

    now = int(time.time() * 1000)
    art = {
        "id": next_id,
        "title": story.get("title", ""),
        "excerpt": story.get("excerpt", ""),
        "content": story.get("content", ""),
        "category": story.get("category", "Історія"),
        "geo": "Громада",
        "image": story.get("image"),
        "source": story.get("source", "CSTL LIFE"),
        "sourceUrl": story.get("sourceUrl"),
        "exclusive": True,
        "ts": now,
        "added_ts": now,
        "kind": "story",
    }
    return art, next_id + 1


def detect_geo(text: str, default_geo: str) -> str:
    """Гео новини за ЗМІСТОМ, не лише за джерелом (Потік 11, Вова 14.07).

    Пріоритет: Олика → «Громада»; згадка Волині (з БУДЬ-ЯКОГО джерела, включно
    УП) → «Волинь»; волинське джерело БЕЗ згадки Волині → «Україна» (рішення
    Вови: нац. новини від Волинь Post — тег «Україна», не «Волинь»); інакше —
    geo джерела. Фільтри ваги застосовуються далі за ФІНАЛЬНИМ geo.
    """
    low = text.lower()
    # OLYKA_RE замість підрядків OLYKA_KEYWORDS: ловить відмінки («в Олиці»)
    # і села громади (Дідичі/Дерно/…) — знайдено юніт-тестом Потоку 11.
    if is_olyka_relevant(low):
        return "Громада"          # згадка про Олику/села → розділ «Громада» (перейм. 05.07)
    if mentions_volyn(low):
        return "Волинь"
    if default_geo == "Волинь":
        return "Україна"          # волинське видання пише не про Волинь → національна
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


def sanitize_image_url(u):
    """Прибирає склеєні URL типу 'https://ahttps://img.../x.jpg' → бере останній http(s).
    Фіксить баг подвійного домену (напр. картинки Конкурента). Повертає url або None."""
    if not u or not isinstance(u, str):
        return None
    u = u.strip()
    idx = max(u.rfind("http://"), u.rfind("https://"))
    if idx > 0:
        u = u[idx:]
    return u if u.startswith(("http://", "https://")) else None


def extract_image(entry) -> str | None:
    media = getattr(entry, "media_content", None)
    if media and isinstance(media, list):
        for m in media:
            if not isinstance(m, dict):
                continue
            url = m.get("url", "") or ""
            if any(ext in url.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                return sanitize_image_url(url)
    enclosures = getattr(entry, "enclosures", None)
    if enclosures:
        for enc in enclosures:
            if not isinstance(enc, dict):
                continue
            if enc.get("type", "").startswith("image"):
                return sanitize_image_url(enc.get("href") or enc.get("url"))
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


def fetch_rss(url: str) -> tuple:
    """Завантажує RSS з BROWSER_UA. Повертає (bytes, response_headers)."""
    req = urllib.request.Request(url, headers={
        "User-Agent": BROWSER_UA,
        "Accept": "application/rss+xml, application/xml, text/xml, */*",
        "Accept-Language": "uk-UA,uk;q=0.9",
    })
    with urllib.request.urlopen(req, timeout=15) as r:
        if r.status in (403, 404, 410):
            raise ValueError(f"HTTP {r.status}")
        content_type = r.headers.get("content-type", "text/xml; charset=utf-8")
        return r.read(), {"content-type": content_type}

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
    # Joomla gov.ua — повний текст через Worker (домен Worker = ключ)
    "cstl-proxy.volodymyrshevchuk19.workers.dev": [
        "[itemprop='articleBody']",
        ".article-fulltext",
        ".item-page .article-fulltext",
        ".intro-text",
        ".item-page",
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

# Регулярний вираз для класів «шуму» (реклама, коментарі, навігація, теги,
# промо, «читайте також», «вибір редактора» тощо) — блоки з такими класами
# видаляються ДО витягу тексту.
_NOISE_RE = re.compile(
    r"(comment|social|share|related|sidebar|ad[s_-]|banner|recommend|widget|"
    r"subscribe|menu|breadcrumb|tags?[_-]|promo|teaser|newsletter|telegram|"
    r"read-?also|read-?more|editor-?choice|most-?read|popular)",
    re.I,
)

# Хвостові маркери — усе ПІСЛЯ них це футер/теги/реклама/«читайте також»/
# промо-заклики/форма «повідомити про помилку». Зрізаємо разом з рештою.
_TAIL_RE = re.compile(
    r"(Бажаєте\s+дізна|Приєднуйтеся\s+до\s+наш|Підписуйтеся\s+на|"
    r"Якщо\s+[Вв]и\s+(?:зауважили|помітили)\s+помилк|Читайте\s+також|"
    r"Читайте\s+нас\s+[ув]\b|Вибір\s+редактора|Схожі\s+новини|"
    r"Тег(?:и|і)\s*:|Ctrl\s*\+\s*Enter|Коментар(?:і|ів)\b|Поділит(?:ися|ись)\b)",
    re.I,
)

# Провідні «крихти» навігації сайту (часто зліплені в один рядок перед статтею,
# напр. volynpost: «Правила Реклама Контакти Розділи - +»). Зрізаємо з початку
# лише коли ≥2 підряд навігаційних токенів (щоб не зачепити реальний текст).
_LEAD_NAV_RE = re.compile(
    r"^(?:\s*(?:(?:Правила|Реклама|Контакти|Розділи|Головна|Пошук|Меню|Підписка|"
    r"Архів|Нагору)\b|[+\-×›❯»|/])[\s·|/]*){2,}",
    re.I,
)


def clean_article_text(text: str, title: str = "") -> str:
    """Прибирає обгортку сайту зі скрапленого тексту.

    Баг 06.07: у тіло статті затягувало навігацію на початку
    («Правила Реклама Контакти Розділи») + теги/футер/«Вибір редактора»/
    промо-заклик у Telegram/«Ctrl+Enter» у кінці. Зрізаємо хвіст від першого
    службового маркера і провідні крихти-меню.

    Баг 14.07 (Вова, скрін Волинь Post): сторінка видавця повторює <h1>-заголовок
    і час публікації всередині контейнера статті → опис починався з дубля
    заголовка + «Сьогодні, 13:45». Передаємо title і зрізаємо перший абзац,
    якщо він = заголовок (для ВСІХ джерел); час після нього зріже наявний regex.
    """
    if not text:
        return text
    m = _TAIL_RE.search(text)
    if m:
        text = text[:m.start()]
    prev = None
    while prev != text:          # навігація може йти кількома рядками
        prev = text
        text = _LEAD_NAV_RE.sub("", text, count=1).lstrip()
    # Дубль заголовка статті першим абзацом тіла — зрізаємо (порівняння без
    # пунктуації/регістру; допускаємо короткий «хвіст» типу « - ВолиньPost»).
    if title:
        _norm = lambda s: re.sub(r"\W+", "", s.lower())
        first, _sep, rest = text.partition("\n\n")
        nt, nf = _norm(title), _norm(first)
        if nt and nf and (nf == nt or (nf.startswith(nt) and len(nf) - len(nt) <= 20)):
            text = rest.lstrip()
    # Провідний часовий штамп-сміття на початку тіла: «Сьогодні, 15:09»,
    # «Вчора, 9:20», «08.07.2026, 14:00», голий «15:09» (Волинь Post та ін.).
    text = re.sub(
        r"^\s*(?:Сьогодні|Вчора|Позавчора|\d{1,2}[.:]\d{2}(?:[.:]\d{2,4})?)"
        r"[,\s]*\d{0,2}[:.]?\d{0,2}\s*", "", text, count=1).lstrip()
    return re.sub(r"\n{3,}", "\n\n", text).strip()


# Inline-теги (посилання/жирний/курсив тощо) — НЕ межа абзацу: їхній текст
# лишається всередині абзацу, як в оригінальній статті. Фікс Вови 14.07:
# el.get_text('\n\n') рвав абзац на КОЖНОМУ вкладеному елементі — «РБК-Україна»
# (посилання) і «Володимир Зеленський» (жирний) випадали окремими абзацами.
_INLINE_TAGS = {"a", "b", "strong", "i", "em", "u", "s", "span", "sup", "sub",
                "small", "mark", "abbr", "code", "time", "font", "nobr", "q", "cite"}


def _paragraphs_fallback(el) -> str:
    """Запасний збирач тексту: абзаци рвуться ЛИШЕ на блокових елементах.

    Обходить DOM: текст і inline-теги накопичуються в поточний абзац; блоковий
    елемент (div/p/h*/li/br…) — межа абзацу. Заміна старого
    el.get_text(separator='\\n\\n'), який вважав межею БУДЬ-ЯКИЙ вузол.
    """
    from bs4 import NavigableString, Tag
    parts, buf = [], []

    def flush():
        t = re.sub(r"\s+", " ", "".join(buf)).strip()
        buf.clear()
        if t:
            parts.append(t)

    def walk(node):
        for child in node.children:
            if isinstance(child, NavigableString):
                buf.append(str(child))
            elif isinstance(child, Tag):
                if child.name in _INLINE_TAGS:
                    buf.append(child.get_text(" "))   # у поточний абзац
                elif child.name in ("br", "hr"):
                    flush()
                else:                                  # блоковий = межа абзацу
                    flush()
                    walk(child)
                    flush()

    walk(el)
    flush()
    return "\n\n".join(parts)


def _blocks_to_text(el) -> str:
    """Текст контейнера статті з ПРАВИЛЬНИМИ абзацами (\\n\\n між блоками).

    Раніше брали el.get_text(separator='\\n') — усі абзаци склеювались одним \\n,
    а фронт розбиває на <p> лише по \\n\\n → стаття виглядала «цеглиною» без
    абзаців (баг, знайдений Ромою 08.07). Тепер збираємо блокові елементи
    (p/h2-h4/li/blockquote) окремо і зʼєднуємо порожнім рядком.
    """
    blocks = el.find_all(["p", "h2", "h3", "h4", "li", "blockquote"])
    parts = []
    for b in blocks:
        # li без вкладених p — самостійний рядок; p всередині li не дублюємо
        if b.name == "li" and b.find(["p"]):
            continue
        t = b.get_text(separator=" ", strip=True)
        if t:
            parts.append(t)
    text = "\n\n".join(parts)
    if len(text) < 300:      # блоків нема (текст у голих div) — запасний варіант
        text = _paragraphs_fallback(el)
    return re.sub(r"\n{3,}", "\n\n", text).strip()


def fetch_full_article(url: str, title: str = "") -> str | None:
    """Завантажує повний текст статті зі сторінки статті.

    Викликається коли RSS дає лише анонс (<600 символів).
    title — заголовок з RSS: clean_article_text зрізає його дубль на початку
    тіла (сторінки видавців повторюють <h1>+час у контейнері — Вова 14.07).
    Повертає текст або None якщо не вдалося.
    """
    # Анти-SSRF: тягнемо лише з публічних адрес (внутрішні заблоковано).
    if not is_allowed_url(url):
        return None
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": BROWSER_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "uk-UA,uk;q=0.9",
            "Referer": "https://www.google.com/",
            "DNT": "1",
        })
        # SAFE_OPENER перевіряє редиректи (щоб 3xx не відвів на приватну адресу).
        with SAFE_OPENER.open(req, timeout=12) as r:
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
        # guard: у bs4 4.15 деякі вузли мають attrs=None → tag.get падає
        cls = " ".join((getattr(tag, "attrs", None) or {}).get("class") or [])
        if _NOISE_RE.search(cls):
            tag.decompose()

    selectors = ARTICLE_SELECTORS.get(domain, []) + _GENERIC_SELECTORS
    for sel in selectors:
        el = soup.select_one(sel)
        if el:
            text = _blocks_to_text(el)          # абзаци через \n\n (не «цеглина»)
            text = clean_article_text(text, title)
            if len(text) > 300:
                return text[:8000]

    # Fallback: беремо блок з найбільшою кількістю тексту на сторінці
    best_text = ""
    for tag in soup.find_all(["div", "section", "article"]):
        # Пропускаємо вкладені блоки (беремо тільки верхні контейнери)
        if tag.find_parent(["div", "section", "article"]):
            continue
        t = _blocks_to_text(tag)                 # теж абзаци через \n\n
        if len(t) > len(best_text):
            best_text = t
    if len(best_text) > 500:
        cleaned = clean_article_text(best_text, title)
        if len(cleaned) > 300:
            return cleaned[:8000]

    return None


def fetch_og_image(url: str) -> str | None:
    """Витягує головне фото статті (og:image / twitter:image) зі сторінки видавця.

    Системне рішення (крок 1): реальне фото з тієї сторінки, звідки й текст.
    Повертає абсолютний публічний URL зображення або None. Анти-SSRF як усюди.
    """
    if not is_allowed_url(url):
        return None
    try:
        req = urllib.request.Request(url, headers={"User-Agent": BROWSER_UA})
        with SAFE_OPENER.open(req, timeout=12) as r:
            raw = r.read(200_000)          # досить перших ~200КБ — og-теги у <head>
    except Exception:
        return None
    try:
        from bs4 import BeautifulSoup
    except ImportError:
        return None
    soup = BeautifulSoup(raw, "html.parser")
    for prop in ("og:image", "og:image:url", "twitter:image", "twitter:image:src"):
        tag = soup.find("meta", attrs={"property": prop}) or soup.find("meta", attrs={"name": prop})
        if tag and tag.get("content"):
            img = sanitize_image_url(urllib.parse.urljoin(url, tag["content"].strip()))
            if img:
                return img
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


def parse_html_source(source: dict, seen_urls: set, seen_by_section: dict) -> list:
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

    # ── ТИМЧАСОВИЙ діагностичний зонд (rayon.in.ua) — прибрати після налаштування ──
    # rayon.in.ua = JS-SPA без RSS: у DOM статей нема. Дивимось чи дані у JSON-блоці
    # сторінки (__NEXT_DATA__/__NUXT__/ld+json) або треба API. Друкуємо структуру в лог.
    if "rayon.in.ua" in source.get("url", ""):
        try:
            from bs4 import BeautifulSoup as _BS
            _s = _BS(raw, "html.parser")
            _links = [a for a in _s.find_all("a", href=True) if "/news/" in a["href"]]
            print(f"🔎 rayon: /news/ links = {len(_links)}")
            for _i, _a in enumerate(_links[:2]):
                print(f"🔎 rayon LINK[{_i}] href={_a.get('href')} | text={_a.get_text(strip=True)[:90]!r}")
                _p = _a.parent
                print(f"🔎 rayon PARENT[{_i}]:", str(_p)[:900])
                if _p is not None and _p.parent is not None:
                    print(f"🔎 rayon GRANDPARENT[{_i}]:", str(_p.parent)[:1800])
        except Exception as _de:
            print("🔎 rayon DEBUG error:", _de)
    # ── кінець зонда ──────────────────────────────────────────────────────────────

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
        section = section_of(source["geo"])
        tokens = title_tokens(title)
        if is_dup_title(tokens, section, seen_by_section):
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
        content = fetch_full_article(href, title) or excerpt
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
        remember_title(tokens, section, seen_by_section)

    return articles


def gromada_url(path: str) -> str:
    """Перетворює шлях сайту громади у URL через Cloudflare Worker (проксі)."""
    if not path.startswith("/"):
        path = "/" + path
    return f"{GROMADA_PROXY}?path={urllib.parse.quote(path)}"


def parse_gromada_source(source: dict, seen_urls: set, seen_by_section: dict) -> list:
    """Парсить сайт Олицької громади через Cloudflare Worker.

    Сайт побудований на Joomla — типова платформа для держсайтів gov.ua.
    Worker обходить IP-блокування GitHub Actions (Azure).
    """
    from bs4 import BeautifulSoup

    try:
        req = urllib.request.Request(source["url"], headers={
            "User-Agent": BROWSER_UA,
            "Accept": "text/html,*/*",
            "Accept-Language": "uk-UA,uk;q=0.9",
        })
        with urllib.request.urlopen(req, timeout=20) as r:
            raw = r.read()
    except Exception as e:
        raise ValueError(f"Worker недоступний: {e}")

    soup = BeautifulSoup(raw, "html.parser")
    candidates: list[tuple[str, str, object]] = []

    # Joomla: <article class="leading"> або <article class="item">
    for art in soup.find_all("article")[:25]:
        h = art.find(["h1", "h2", "h3"])
        a = (h.find("a", href=True) if h else None) or art.find("a", href=True)
        if h and a:
            href = a["href"]
            if not href.startswith("http"):
                href = GROMADA_BASE + href
            candidates.append((href, h.get_text(strip=True), art))

    # Joomla: списки .items-row, .items-leading або подібні
    if not candidates:
        for item in soup.select(
            ".items-row, .items-leading, .blog-item, .news-list-item, .catItemView"
        )[:25]:
            h = item.find(["h1", "h2", "h3"])
            a = (h.find("a", href=True) if h else None) or item.find("a", href=True)
            if h and a:
                href = a["href"]
                if not href.startswith("http"):
                    href = GROMADA_BASE + href
                candidates.append((href, h.get_text(strip=True), item))

    # Загальний fallback — будь-які посилання що ведуть на статті
    if not candidates:
        for a in soup.select("a[href]")[:50]:
            href = a["href"]
            text = a.get_text(strip=True)
            if len(text) > 25 and any(
                p in href for p in ["/novyny/", "/news/", "/component/content/"]
            ):
                if not href.startswith("http"):
                    href = GROMADA_BASE + href
                candidates.append((href, text, a.parent))

    articles = []
    for href, raw_title, container in candidates[:MAX_PER_SOURCE]:
        title = strip_html(raw_title).strip()
        if not title or not href:
            continue
        if href in seen_urls:
            continue
        section = section_of("Олика")
        tokens = title_tokens(title)
        if is_dup_title(tokens, section, seen_by_section):
            continue

        # Дата з контейнера
        ts = int(time.time() * 1000)
        date_el = (container.find(
            ["time", "span", "dd", "div"],
            class_=re.compile(r"date|time|published|create", re.I),
        ) if hasattr(container, "find") else None)
        if date_el:
            raw_date = date_el.get("datetime", "") or date_el.get_text(strip=True)
            parsed_ts = _parse_date_uk(raw_date)
            if parsed_ts:
                ts = parsed_ts

        # Excerpt
        exc_el = (container.find(
            class_=re.compile(r"intro|excerpt|summary|description|anons", re.I),
        ) if hasattr(container, "find") else None)
        excerpt = exc_el.get_text(strip=True)[:400] if exc_el else ""

        # Повний текст — завантажуємо статтю також через Worker
        article_path = href.replace(GROMADA_BASE, "") or "/"
        content = fetch_full_article(gromada_url(article_path), title) or excerpt
        if not excerpt:
            excerpt = content[:400]

        # Зображення
        image = None
        img_el = container.find("img") if hasattr(container, "find") else None
        if img_el:
            src = img_el.get("src") or img_el.get("data-src") or ""
            if src and any(ext in src.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                image = src if src.startswith("http") else GROMADA_BASE + src

        category = detect_category(title + " " + excerpt)
        entry_type = classify_entry(title, excerpt + " " + content)

        articles.append({
            "title": title,
            "excerpt": excerpt,
            "content": content,
            "category": category,
            "geo": "Олика",
            "image": image,
            "source": "Олицька громада",
            "sourceUrl": href,  # оригінальний URL (без Worker) для дедуплікації
            "exclusive": False,
            "ts": ts,
            "_type": entry_type,
        })
        seen_urls.add(href)
        remember_title(tokens, section, seen_by_section)

    return articles


def parse_source(source: dict, seen_urls: set, seen_by_section: dict) -> list:
    # Сайт Олицької громади через Cloudflare Worker
    if source.get("type") == "gromada":
        return parse_gromada_source(source, seen_urls, seen_by_section)

    # HTML-джерела (тег-сторінки без RSS) — окремий парсер
    if source.get("type") == "html":
        return parse_html_source(source, seen_urls, seen_by_section)

    try:
        raw, response_headers = fetch_rss(source["url"])
    except urllib.error.HTTPError as e:
        raise ValueError(f"HTTP {e.code}")
    except Exception as e:
        raise ValueError(f"Помилка завантаження: {e}")

    if feedparser is None:
        raise ValueError("feedparser не встановлено (потрібен для парсингу RSS: pip install feedparser)")
    try:
        feed = feedparser.parse(raw, response_headers=response_headers)
    except Exception as e:
        raise ValueError(f"feedparser: {e}")

    if feed.bozo and not feed.entries:
        raise ValueError(f"Помилка парсингу: {feed.bozo_exception}")
    if not feed.entries:
        raise ValueError("Порожній фід (entries=0)")

    articles = []
    for entry in feed.entries[:20]:
        if len(articles) >= MAX_PER_SOURCE:
            break
        if not isinstance(entry, dict):
            continue
        try:
            title = strip_html(entry.get("title", "")).strip()
            link = (entry.get("link") or "").strip()
        except Exception:
            continue
        if not title or not link:
            continue
        # Google News: чистимо суфікс « - Видавець» + розв'язуємо справжній URL
        # видавця ДО дедупу/повного тексту (щоб усе працювало зі справжнім лінком)
        if source.get("type") == "gnews":
            title = gnews_clean_title(title, entry)
            link = resolve_gnews_url(link)
        if link in seen_urls:
            continue

        try:
            # clean і для RSS-контенту: дубль заголовка/часу і футерні маркери
            # трапляються у content:encoded теж (Вова 14.07 — «усі джерела»)
            content = clean_article_text(get_full_content(entry), title)
            # Якщо RSS дає лише анонс — дотягуємо повний текст зі сторінки статті
            if len(content) < 600 and link:
                full = fetch_full_article(link, title)
                if full and len(full) > len(content):
                    content = full

            excerpt = strip_html(entry.get("summary") or entry.get("description") or "")[:400]
            if not excerpt:
                excerpt = content[:400]

            published = entry.get("published_parsed") or entry.get("updated_parsed")
            ts = int(time.mktime(published) * 1000) if published else int(time.time() * 1000)

            text = title + " " + excerpt
            geo = detect_geo(text, source["geo"])

            # Фільтри ваги — за ФІНАЛЬНИМ geo новини, не geo джерела (Потік 11):
            # перекинуті з «Волині» національні мусять пройти той самий фільтр
            # ваги, що й новини УП; дрібниці інших регіонів — відсіюються.
            if geo == "Україна" and not is_nationally_relevant(text):
                continue
            if geo == "Світ" and not is_world_relevant(text):
                continue

            # Розумний парсер Олики (Крок 3b): Google News → лишаємо тільки релевантне;
            # джерелом показуємо реального видавця (не «Google News»)
            src_name = source["name"]
            if source.get("type") == "gnews":
                if not is_olyka_relevant(title + " " + excerpt + " " + content):
                    continue
                geo = "Олика"
                _pub = entry.get("source") or {}
                _pt = _pub.get("title") if isinstance(_pub, dict) else None
                if _pt:
                    src_name = _pt

            # Нечітка дедуплікація в межах розділу (Крок 2)
            section = section_of(geo)
            tokens = title_tokens(title)
            if is_dup_title(tokens, section, seen_by_section):
                continue  # схожа новина вже є в цьому розділі

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
                "source": src_name,
                "sourceUrl": link,
                "exclusive": False,
                "ts": ts,
                "_type": entry_type,
            })
            seen_urls.add(link)
            remember_title(tokens, section, seen_by_section)
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
    # Дедуп заголовків — per-розділ (Крок 2): множини слів заголовків, згруповані
    # за розділом (Україна та Світ / Волинь / Громада). Seed з наявних статей.
    seen_by_section: dict = {}
    for _a in existing_articles:
        if _a.get("title"):
            remember_title(title_tokens(_a["title"]),
                           section_of(_a.get("geo", "")), seen_by_section)
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
    next_evt_id = max(
        (e["id"] for e in existing_events if isinstance(e.get("id"), int)),
        default=0,
    ) + 1

    # URL-дедуп — глобальний (той самий матеріал за посиланням не дублюється між
    # новинами й подіями). Дедуп заголовків — у межах розділу (seen_by_section).
    all_seen_urls = seen_urls | events_seen_urls

    # Парсинг усіх джерел
    new_articles: list = []
    new_events:   list = []

    for source in SOURCES:
        try:
            parsed = parse_source(source, all_seen_urls, seen_by_section)
            n_news = n_events = 0
            for item in parsed:
                entry_type = item.pop("_type", "news")
                # Події — ЛИШЕ з офіційного сайту громади (ТЗ). З інших джерел
                # (УП, Волинь, Google News) «події» лишаємо як звичайні новини.
                if entry_type == "event" and source.get("type") != "gromada":
                    entry_type = "news"
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
                    item["added_ts"] = int(time.time() * 1000)  # коли ДОДАЛИ (для денних лімітів)
                    next_art_id += 1
                    new_articles.append(item)
                    n_news += 1

            parts = []
            if n_news:   parts.append(f"+{n_news} статей")
            if n_events: parts.append(f"+{n_events} подій")
            print(f"✓ {source['name']}: {', '.join(parts) if parts else 'нічого нового'}")
        except Exception as e:
            print(f"✗ {source['name']}: {e}")
            traceback.print_exc()

    # Денні ліміти на розділ — N найсвіжіших/добу; свіжіші витісняють старіші сьогоднішні
    new_articles, evict_ids = apply_daily_limits(new_articles, existing_articles)
    if evict_ids:
        existing_articles = [a for a in existing_articles if a.get("id") not in evict_ids]
        print(f"↻ витіснено застарілих сьогоднішніх: {len(evict_ids)} (замінено свіжішими)")

    # Крапельна історична «історія Олики» (одна на день) — щоб стрічка жила в тишу
    _story, next_art_id = drip_story(existing_articles, next_art_id)
    if _story:
        new_articles.append(_story)
        print(f"✓ Історія Олики: +1 («{_story['title'][:40]}…»)")

    # Зберегти articles.json
    if new_articles:
        all_articles = new_articles + existing_articles
        all_articles.sort(key=lambda a: a.get("ts", 0), reverse=True)
        # Баланс розділу «Україна та Світ» — 60% Україна / 40% Світ (рішення Роби 01.07)
        all_articles = balance_ua_world(all_articles)
        all_articles = all_articles[:MAX_ARTICLES]
        DATA_PATH.write_text(
            json.dumps(all_articles, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        print(f"✓ articles.json: {len(all_articles)} статей ({len(new_articles)} нових)")
    else:
        print("Нових статей немає.")

    # Зберегти events.json — події ЛИШЕ з громади (ТЗ) + ручні (Алла)
    today_str = datetime.date.today().strftime("%Y-%m-%d")

    def _keep_event(e):
        if not e.get("auto"):
            return True                              # ручні (Алла) — завжди лишаємо
        if e.get("source") != "Олицька громада":
            return False                             # auto не з громади — прибрати (ТЗ)
        return e.get("date", "9999") >= today_str    # застарілі (минула дата) — геть

    active_existing = [e for e in existing_events if _keep_event(e)]
    cleaned = len(existing_events) - len(active_existing)
    if new_events or cleaned:
        all_events = new_events + active_existing
        all_events.sort(key=lambda e: (e.get("date") or "9999", e.get("time") or "00:00"))
        all_events = all_events[:MAX_EVENTS]
        EVENTS_PATH.write_text(
            json.dumps(all_events, ensure_ascii=False, indent=2),
            encoding="utf-8",
        )
        note = f"{len(new_events)} нових"
        if cleaned:
            note += f", прибрано {cleaned} не з громади/застарілих"
        print(f"✓ events.json: {len(all_events)} подій ({note})")
    else:
        print("Подій без змін.")


if __name__ == "__main__":
    main()
