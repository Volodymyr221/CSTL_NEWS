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
import os
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
        "type": "rayon",   # тег-сторінка rayon.in.ua — спеціальний парсер (.galleryCard)
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


# ПОВНИЙ список громади — ЛИШЕ для фільтра rayon (пул уже курований «тегом Олика»,
# тож ширший список безпечний). Спільний OLYKA_RE вище НЕ чіпаємо: додати сюди
# «котів/ставок» у нього → хибно тягнуло б у Громаду новини про котів/ставки з
# усієї стрічки (гео-реклас). Джерело сіл: hromada_config.json → hromada.villages.
_HROMADA_TERMS = [
    r"олик\w*", r"олиц\w*", r"радзивіл\w*",                # Олика / Олицька громада / Радзивілли
    r"горянівк\w*", r"дерно", r"дерна", r"дідич\w*",       # села громади
    r"жорнищ\w*", r"залісоч\w*", r"котів", r"личан\w*",
    r"метельн\w*", r"мощаниц\w*", r"носович\w*", r"одерад\w*",
    r"покащ\w*", r"путилівк\w*", r"ставок", r"хром[\W]?яків", r"чемерин\w*",
]
_HROMADA_RE = re.compile(r"\b(" + "|".join(_HROMADA_TERMS) + r")\b", re.IGNORECASE)


def is_hromada_relevant(text: str) -> bool:
    """True якщо текст згадує Олику або будь-яке село Олицької громади (ціле слово).
    Ширший за is_olyka_relevant — для фільтра rayon-тегу (див. коментар вище)."""
    return bool(_HROMADA_RE.search(text or ""))


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


MAX_ARTICLES     = 400  # запобіжна стеля (реальний обсяг тримає зберігання за віком)
MAX_PER_SOURCE   = 15   # не більше 15 статей з одного джерела за раз
MAX_EVENTS       = 50

# 🔴 КВОТА ГРОМАДИ ВСЕРЕДИНІ СТЕЛІ (фікс 29.07). Стеля MAX_ARTICLES різала список
# за ДАТОЮ, без огляду на розділ — і з'їдала Громаду разом з ексклюзивами, хоч
# prune_by_age дає їй 30 днів. Заміряно на живих даних: у файлі було рівно 400/400,
# приплив Волині+України+Світу ~130 статей/добу, найстарша стаття — 3.2 дні. Тобто
# фактичне зберігання виходило ≈3 доби для ВСІХ розділів; найстарша стаття Громади
# стояла на позиції 365 з 400 і мала померти наступної доби.
# Громаді ~1-2 статті/добу → за 30 днів ≈ 45-60. Стеля 120 = двократний запас.
# Квота саме ВСЕРЕДИНІ 400, а не понад них: клієнт тягне articles.json цілком
# (`src/tabs/news.js:97`, зараз 1.4 МБ), тому вага завантаження не зростає.
MAX_COMMUNITY    = 120

# Зберігання за ВІКОМ (рішення Вови 21.07): статті НЕ витісняються протягом дня —
# живуть N днів від моменту додавання (added_ts), потім самі відпадають. Так кнопки
# «зберегти/поділитися» мають сенс. Волинь/Україна/Світ = 7 днів (там новин багато),
# Громада = 30 (там новин менше — тримаємо довше). Ексклюзиви не обрізаємо взагалі.
RETENTION_DAYS = {"Громада": 30, "Волинь": 7, "Україна та Світ": 7}
DEFAULT_RETENTION_DAYS = 30
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


# ── ПОВНОТА ТЕКСТУ — ОДНЕ МІСЦЕ ПРАВДИ (12.08) ────────────────────────────────
#
# 🔴 ЩО БУЛО НЕ ТАК. «Повний текст» визначався як «довжина ≥ 500 символів», і це
# плутало ДВА різні стани, які нічим не схожі:
#   • «RSS дав анонс, повного тексту ми не бачили» — справді неповно;
#   • «зайшли на сторінку статті, взяли ВЕСЬ її текст, і він короткий» — повно.
#
# 📐 Ціна помилки заміряна на живих даних (12.08): стаття «На війні загинув Герой
# з Волині Сергій Щербатих» (Конкурент) має **452 символи** — це весь її текст,
# разом із фінальним «Редакція… висловлює співчуття». Парсер ТРИЧІ сходив на
# сторінку, тричі дістав повний текст і тричі відкинув його через недобір
# 48 символів, після чого самолікування здалося назавжди (`_fullTries` = 3).
# Людина бачила плашку «джерело надає лише анонс» під ПОВНОЮ статтею.
# Таких статей ~26 із 107, що показують плашку.
#
# 🔑 НОВЕ ВИЗНАЧЕННЯ: повнота — це ПОХОДЖЕННЯ тексту, а не його довжина.
#   `contentSource = 'page'` — тіло взято зі сторінки статті → текст повний;
#   `contentSource = 'rss'`  — тіло взято з RSS-анонсу → неповний.
# Довжина лишається, але тільки як захист від сміття (порожні тіла, «читати
# далі», навігаційні недоїдки), а не як критерій повноти.
#
# ⚠️ ЧОМУ ПОТРІБЕН ЩЕ Й СИГНАЛ ПОДІБНОСТІ. Частина видань віддає в RSS довгий
# анонс (600-800 символів), і сама лише довжина оголосила б його повним текстом.
# Тому текст, узятий зі сторінки, додатково звіряється з RSS-анонсом: якщо вони
# майже збігаються — ми не дістали нічого нового, і це чесно лишається 'rss'.
# Це єдина теза з присланого розбору Grok, яка лягла в корінь (ratio summary/full).

MIN_BODY_CHARS = 180      # нижче — це не стаття, а недоїдок розмітки
SIMILAR_RATIO  = 0.90     # текст зі сторінки ≈ анонс → нічого нового не дістали

# Версія правил повноти. Зміниш правила — підніми число, і статті, на яких
# самолікування колись здалося, дістануть новий шанс (див. `rehydrate_short_articles`).
# 🛑 Не «косметичне» поле: без нього виправлення правил не доходить до вже
# збережених статей узагалі.
FULL_ALGO_VERSION = 2

# 🔴 27.08 — ВЕРСІЯ ПРАВИЛ РОЗМІТКИ, ОКРЕМА ВІД ВЕРСІЇ ПРАВИЛ ПОВНОТИ.
#
# 🗣️ Вова прислав скріни статті 12248: на сайті-джерелі слово «повідомили» —
# клікабельне посилання, у нас голий текст; цитата в оригіналі одна, у нас
# розірвана навпіл.
# 📐 Полагодили — але парсер дедуплікує за URL, тож виправлення побачили б лише
# НОВІ статті, а всі 400 наявних лишились би такими, як на скріні.
#
# 🔑 Зразок узято тут же, поруч: `FULL_ALGO_VERSION` заведено 12.08 рівно з цієї
# причини, і в коментарі до нього написано — «наступна зміна правил має так само
# дати статтям новий шанс, інакше через місяць ми знову ловитимемо той самий клас
# помилки». Це і є та наступна зміна.
#
# ⚠️ ЧОМУ ОКРЕМЕ ЧИСЛО, А НЕ +1 ДО НАЯВНОГО. Повнота і розмітка — різні питання
# про різні статті: повнота цікавить лише ті, що лишились анонсом, розмітка —
# УСІ, зокрема давно повні. Спільне число означало б, що зміна правил розмітки
# скидає лічильники спроб дотягнути повний текст (і навпаки), тобто два механізми
# смикали б один одного без причини.
# 🛑 Піднімати це число можна лише тоді, коли зміна робить розмітку СТАРИХ статей
# іншою. Зайве підняття = 400 зайвих звернень до чужих сайтів.
RICH_ALGO_VERSION = 1


def _norm_for_compare(t: str) -> str:
    """Текст до порівняння: без розмітки, регістру, пунктуації і пробілів."""
    return re.sub(r"[^\w]+", "", strip_html(t or "").lower())


def looks_like_same_text(page_text: str, rss_text: str) -> bool:
    """Чи текст зі сторінки — це той самий анонс, що вже був у RSS.

    Порівнюємо ВКЛАДЕНІСТЬ, а не рівність: сторінка зазвичай містить анонс
    плюс решту статті, тож рівними вони не бувають майже ніколи. Питання в
    тому, чи додалось щось СУТТЄВЕ понад анонс.
    """
    a, b = _norm_for_compare(page_text), _norm_for_compare(rss_text)
    if not a or not b:
        return False
    # Якщо сторінка не довша за анонс більш ніж на 10% — нового немає.
    return len(a) <= len(b) / SIMILAR_RATIO * 1.0 and (b[:200] in a or a[:200] in b)


def decide_content(rss_html: str, page_html: str | None, rss_summary: str) -> tuple[str, str]:
    """Вирішує, який текст лишити і звідки він. Повертає (html, contentSource).

    🔑 Уся логіка «повно чи ні» живе ТУТ, в одній функції, і її споживають
    обидва шляхи — свіжий розбір (`parse_source`) і самолікування
    (`rehydrate_short_articles`). До 12.08 правило було записане ДВІЧІ, різними
    числами (500 у парсері, 600 у клієнті), і саме тому розійшлось.
    """
    page_plain = strip_html(page_html or "")
    rss_plain  = strip_html(rss_html or "")

    if page_html and len(page_plain) >= MIN_BODY_CHARS:
        # Сторінка дала щось змістовне. Лишається спитати, чи це не той самий анонс.
        if looks_like_same_text(page_plain, rss_summary or rss_plain):
            return (page_html if len(page_plain) > len(rss_plain) else rss_html), "rss"
        return page_html, "page"

    # Сторінку не взяли (403, JS-only, немає тіла) → лишається те, що дав RSS.
    return rss_html, "rss"


def get_full_content(entry, title: str = "", base_url: str = "") -> str:
    """Повний текст статті → БАГАТИЙ HTML (варіант A): з content:encoded зберігаємо
    структуру (_blocks_to_html), інакше summary → абзаци. Повертає безпечний HTML.

    ⚠️ `base_url` тут — посилання самого запису RSS. Воно потрібне рівно для того,
    щоб відносні адреси всередині `content:encoded` («/news/999») стали
    абсолютними: без нього посилання вело б на НАШ домен."""
    content_list = getattr(entry, "content", None)
    if content_list:
        valid = [c for c in content_list if isinstance(c, dict)]
        if valid:
            best = max(valid, key=lambda c: len(c.get("value") or ""), default=None)
            if best:
                raw = best.get("value") or ""
                if len(strip_html(raw)) > 150:
                    from bs4 import BeautifulSoup
                    rich = _blocks_to_html(BeautifulSoup(raw, "html.parser"), title, base_url=base_url)
                    if len(rich) > 60:
                        return rich[:8000]
    summ = strip_html(entry.get("summary") or entry.get("description") or "")
    return _split_runon_html("".join(f"<p>{html.escape(p)}</p>" for p in summ.split("\n\n") if p.strip()))


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


def prune_by_age(articles: list) -> list:
    """Зберігання за ВІКОМ (рішення Вови 21.07): лишаємо статті, МОЛОДШІ за
    RETENTION_DAYS свого розділу (від added_ts). Ніяких внутрішньоденних витіснень —
    додане живе тиждень (Волинь/Україна/Світ) або місяць (Громада), тому кнопки
    «зберегти/поділитися» мають сенс. Ексклюзиви (курований Олика) і легасі без
    added_ts не чіпаємо взагалі.
    """
    now = int(time.time() * 1000)
    out = []
    for a in articles:
        if a.get("exclusive"):
            out.append(a)
            continue
        added = a.get("added_ts")
        if not added:
            out.append(a)              # легасі без added_ts — не чіпаємо
            continue
        days = RETENTION_DAYS.get(section_of(a.get("geo", "")), DEFAULT_RETENTION_DAYS)
        if (now - added) <= days * 86400 * 1000:
            out.append(a)
    return out


def cap_articles(articles: list) -> list:
    """Запобіжна стеля файлу — але ПО РОЗДІЛАХ, а не сліпим зрізом за датою.

    🔴 Чому не `articles[:MAX_ARTICLES]` (баг, знайдений 29.07): у відсортованому за
    датою списку Громада і потік Волині/України стоять ВПЕРЕМІШ. Потік дає ~130 статей
    на добу, тож стеля 400 забивалась за ~3 доби і зрізала все старіше — включно зі
    статтями Громади, яким prune_by_age дає 30 днів, і з ексклюзивами, яких
    prune_by_age не чіпає взагалі. Правило «місяць» було написане, але недосяжне.

    Тепер Громада має власну квоту й не конкурує за місце з потоком. Решта розділів
    ділить те, що лишилось від MAX_ARTICLES — тому загальна вага файлу не зростає.

    Порядок на вході — за `ts` спадаюче; на виході той самий (обидва зрізи беруть
    початок свого списку, потім перезбираємо і пересортовуємо).
    """
    community = [a for a in articles if section_of(a.get("geo", "")) == "Громада"]
    rest      = [a for a in articles if section_of(a.get("geo", "")) != "Громада"]
    community = community[:MAX_COMMUNITY]
    rest      = rest[:max(0, MAX_ARTICLES - len(community))]
    out = community + rest
    out.sort(key=lambda a: a.get("ts", 0), reverse=True)
    return out


def _added_date(a: dict):
    """Дата коли парсер ДОДАВ статтю (за полем added_ts). None якщо поля нема (старі)."""
    ts = a.get("added_ts")
    if not ts:
        return None
    try:
        return datetime.date.fromtimestamp(ts / 1000)
    except Exception:
        return None


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


# Правила категорій: (назва, корені-ключі). Порядок = пріоритет. Назви категорій
# ТОЧНО як ключі CATEGORY_COLORS у src/tabs/news.js (інакше бейдж без кольору).
# БАЗОВИЙ набір (рішення Вови 21.07): лише 4 категорії. Влада/Війна/Освіта/
# Здоров'я/Природа/Технології → Суспільство (дефолт); Історія → Культура;
# Бізнес → Економіка. Клієнт (normCategory у news.js) зводить і старі/AI-категорії.
_CATEGORY_RULES = [
    ("Спорт",     r"спорт|футбол|волейбол|баскетбол|чемпіон|змаган|турнір|матч|олімпіад|спортсмен|атлет|кубок|першіст"),
    ("Культура",  r"культур|мистецтв|музей|замок|театр|кіно|виставк|концерт|фестивал|оркестр|музик|художн|бібліотек|ансамбл|творчіст|істори|столітт|спадщин|краєзнав|радзивіл"),
    ("Економіка", r"бізнес|економік|підприєм|фінанс|інвест|тариф|ярмарок|торгівл|аграрі|фермер"),
]
_CATEGORY_RE = [(cat, re.compile(r"\b(?:" + pat + r")", re.IGNORECASE)) for cat, pat in _CATEGORY_RULES]


def detect_category(title: str, body: str = "") -> str:
    """Тематична категорія новини за ЗАГОЛОВКОМ (ЦІЛІ слова, \\b).

    Два рішення (Вова 21.07):
    1) Межі слова (\\b) — раніше підрядок давав баги: «спорт» усередині «тран-СПОРТ-ні»
       → аварія ставала «Спортом».
    2) Тільки ЗАГОЛОВОК — тіло статті шумить: назви закладів («Центр культури та
       спорту» → концерт ставав Спортом), підписи джерел («...на сторінці міської
       ради» → усе ставало Політикою). Заголовок — найчистіший тематичний сигнал.
       `body` лишено в сигнатурі на майбутнє (зараз не використовується).
    Порядок правил = пріоритет (перший збіг). Назви категорій = ключі CATEGORY_COLORS
    у src/tabs/news.js (щоб бейдж мав колір). Аварії/ДТП/пожежі свідомо БЕЗ власної
    категорії → «Суспільство».
    """
    low = title or ""
    for cat, rx in _CATEGORY_RE:
        if rx.search(low):
            return cat
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

# Тимчасова діагностика дотягування повного тексту (логи CI): чому джерело (напр.
# konkurent) не віддає тіло. Default увімкнено; вимкнути — env CSTL_DEBUG_FETCH=0.
DEBUG_FETCH = os.environ.get("CSTL_DEBUG_FETCH", "1") == "1"


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


# 🔴 27.08 — ПЕРША АДРЕСА, ЯКУ МИ ВЗАГАЛІ ВПУСКАЄМО В ТІЛО СТАТТІ.
#
# 🗣️ Вова зі скрінів статті 12248: на сайті-джерелі «Про це **повідомили**» —
# клікабельне посилання на фейсбук міськради, у нас це голий текст.
# 📐 Заміряно: `<a` у тілі мали **0 із 400** статей, а через цей розбір пройшло
# **381** — тобто ми стирали КОЖНЕ посилання в КОЖНІЙ статті.
#
# 🛑 ЧОМУ ЦЕ ВИМАГАЄ ОКРЕМОЇ ФУНКЦІЇ, А НЕ РЯДКА В АЛЛОУЛИСТІ. Досі безпека
# `content` трималась на тому, що ми пишемо теги **без жодного атрибута** — тіло
# йде на клієнті в `innerHTML` без санітизації, і це чинний контракт. `href` —
# перший атрибут, який ми впускаємо, тож правило одне: **адресу пише парсер**, а
# не джерело. Беремо сире значення, перевіряємо і складаємо своє.
#
# ⚠️ ЩО САМЕ ВІДКИДАЄМО І ЧОМУ:
#   • не `http`/`https` (`javascript:`, `data:`, `vbscript:`) — виконуваний код;
#   • керівні символи — ними ламають розбір атрибута («java\nscript:»);
#   • якорі `#...` — вони вказують усередину ЧУЖОЇ сторінки, у нас ведуть нікуди;
#   • `mailto:` / `tel:` — не шкідливі, але це дія («написати», «подзвонити»), а
#     не джерело факту; у тілі новини вони лише збивають з пантелику.
# 🔑 Відносні адреси («/news/999») робимо абсолютними: без цього посилання вело б
# на НАШ домен — `castlelife.org/news/999`, тобто в нікуди.
def _safe_href(raw: str, base_url: str = "") -> str:
    if not raw:
        return ""
    u = raw.strip()
    if not u or u.startswith("#"):
        return ""
    if any(ord(c) < 0x20 for c in u):
        return ""
    if base_url:
        try:
            u = urllib.parse.urljoin(base_url, u)
        except Exception:
            return ""
    try:
        p = urllib.parse.urlparse(u)
    except Exception:
        return ""
    if p.scheme not in ("http", "https") or not p.netloc:
        return ""
    return u


def _inline_html(node, base_url: str = "") -> str:
    """Вміст блоку → HTML лише з <strong>/<em>/<br>/<a> (решта тегів — розгортаємо
    в текст). Текст ЕКРАНУЄТЬСЯ, адреса посилання — теж, і лише після перевірки
    (`_safe_href`). Аллоулист за побудовою → жодних чужих атрибутів."""
    from bs4 import NavigableString, Tag
    out = []
    for ch in node.children:
        if isinstance(ch, NavigableString):
            out.append(html.escape(str(ch)))
        elif isinstance(ch, Tag):
            if ch.name in ("strong", "b"):
                out.append("<strong>" + _inline_html(ch, base_url) + "</strong>")
            elif ch.name in ("em", "i"):
                out.append("<em>" + _inline_html(ch, base_url) + "</em>")
            elif ch.name == "br":
                out.append("<br>")
            elif ch.name == "a":
                inner = _inline_html(ch, base_url)
                href = _safe_href(ch.get("href") or "", base_url)
                # ⚠️ Адреса не пройшла перевірку — лишаємо ТЕКСТ, а не викидаємо
                # його разом із посиланням: людина має дочитати речення.
                if href and inner.strip():
                    out.append(
                        '<a href="' + html.escape(href, quote=True) + '"'
                        ' target="_blank" rel="noopener">' + inner + "</a>")
                else:
                    out.append(inner)
            else:
                out.append(_inline_html(ch, base_url))   # span/… — розгортаємо
    return "".join(out)


# Межа втраченого абзацу: кінець речення (. ! ? » ” ") ВПРИТУЛ до великої кирилиці
# або відкривної лапки (« “ " чи HTML-ентіті &). У нормальному тексті після крапки
# ЗАВЖДИ пробіл → цей патерн ловить лише склейки, де RSS втратив межу </p><p>.
_RUNON_BOUNDARY = re.compile(r'(?<=[.!?»”"])(?=[«“"&А-ЯЄІЇҐ])')
# Відомі скорочення — щоб не різати «вул.Назва», «м.Луцьк» на два абзаци.
_ABBR_TAIL = re.compile(
    r'(?:вул|просп|бул|пл|м|с|смт|р|рр|ст|грн|тис|млн|млрд|обл|буд|кв|проф|акад|'
    r'ім|див|напр|тобто|та\s+ін)\.$', re.I)


# 🔴 27.08 — ДЕ РІЗАТИ НЕ МОЖНА НІКОЛИ.
#
# Поки в тілі жили самі `<strong>`/`<em>`, найгірше від невдалого розрізу було
# розірване виділення. З появою посилань ціна змінилась: розріз посеред
# `<a href=…>…</a>` дає `<p>…<a href=x>Текст</p><p>Далі</a>…</p>` — зламану
# розмітку. Браузер її «полагодить» по-своєму, і в людини посилання або
# розтягнеться на наступні абзаци, або обірветься.
#
# 🔑 Заборонені відрізки рахуємо по САМОМУ рядку, а не «на око»:
#   • будь-що між `<` і `>` — це нутрощі тега, там межі абзацу не буває взагалі;
#   • усе між `<a …>` і `</a>` — посилання мусить лишитись цілим.
# ⚠️ Обидва потрібні окремо: перший рятує від розрізу в атрибуті (в адресі
# трапляються і крапки, і великі літери), другий — від розрізу в тексті посилання.
_TAG_SPAN_RE    = re.compile(r'<[^>]*>')
_ANCHOR_SPAN_RE = re.compile(r'<a\b[^>]*>.*?</a>', re.S | re.I)

# 🔴 27.08 — ТРЕТЯ ЗАБОРОНЕНА ЗОНА: ВСЕРЕДИНІ ЛАПОК.
#
# 🗣️ Знайдено на живій статті 12248 зі скріна Вови. Цитата в оригіналі одна:
#   «Було справді цікаво, пізнавально й дуже круто!І це лише початок…»
# Фейсбук поставив там перенос рядка, rayon.in.ua склеїв його БЕЗ ПРОБІЛУ — і
# розділювач чесно побачив «!» упритул до великої «І». За своїм правилом він мав
# рацію; за змістом розрізав пряму мову навпіл, і в застосунку вона стала двома
# абзацами, другий з яких починається з середини фрази.
#
# 🔑 ПРАВИЛО, А НЕ ЛАТКА: усередині відкритої прямої мови межі абзацу не буває.
# Запобіжник «сегмент коротший за 40 символів» тут не рятував — там було 45.
#
# ⚠️ Пари беремо ЛИШЕ однозначні («…» і „…“). Прямі лапки (") тим самим знаком і
# відкриваються, і закриваються, тож відрізок довелось би вгадувати за парністю —
# а помилка вгадування тут дорожча за користь: вона мовчки заборонить розрізи в
# усьому решті абзацу.
_QUOTE_PAIRS = (("«", "»"), ("„", "“"))


def _quote_spans(inner: str) -> list:
    """Відрізки прямої мови. Незакрита лапка тягнеться до кінця рядка — так
    консервативніше: краще лишити абзац цілим, ніж розрізати репліку."""
    spans = []
    for опен, клоуз in _QUOTE_PAIRS:
        i = 0
        while True:
            a = inner.find(опен, i)
            if a < 0:
                break
            b = inner.find(клоуз, a + 1)
            spans.append((a, (b + 1) if b >= 0 else len(inner)))
            i = (b + 1) if b >= 0 else len(inner)
    return spans


def _no_cut_spans(inner: str) -> list:
    """Відрізки рядка, всередині яких розрізати абзац не можна."""
    spans = [m.span() for m in _TAG_SPAN_RE.finditer(inner)]
    spans += [m.span() for m in _ANCHOR_SPAN_RE.finditer(inner)]
    spans += _quote_spans(inner)
    return spans


def _split_runon_paragraphs(inner: str) -> list:
    """Розбити внутрішній текст одного <p> на кілька, якщо RSS склеїв абзаци
    (крапка впритул до великої літери, без пробілу). Захист: сегмент <40 симв.,
    хвіст-скорочення або позиція всередині тега/посилання → не межа."""
    заборонено = _no_cut_spans(inner)
    pieces, last = [], 0
    for m in _RUNON_BOUNDARY.finditer(inner):
        i = m.start()
        if any(a < i < b for a, b in заборонено):
            continue
        seg = inner[last:i]
        if _ABBR_TAIL.search(seg.strip()[-10:]):
            continue
        if len(re.sub(r'<[^>]+>', '', seg).strip()) < 40:
            continue
        pieces.append(seg)
        last = i
    pieces.append(inner[last:])
    return [p.strip() for p in pieces if p.strip()]


def _split_runon_html(html_str: str) -> str:
    """Відновити втрачені межі абзаців у готовому HTML: кожен <p> з кількома
    склеєними абзацами → окремі <p>. Інші теги (h3/ul/blockquote) не чіпаємо."""
    def repl(mm):
        ps = _split_runon_paragraphs(mm.group(1))
        if len(ps) <= 1:
            return mm.group(0)
        return "".join(f"<p>{p}</p>" for p in ps)
    return re.sub(r'<p>(.*?)</p>', repl, html_str, flags=re.S)


def _blocks_to_html(el, title: str = "", base_url: str = "") -> str:
    """Тіло статті → БЕЗПЕЧНИЙ HTML зі збереженням структури (підзаголовки, списки
    •, абзаци, жирний/курсив) — як в оригіналі (варіант A, БЕЗ фото). Аллоулист
    тегів: <p>/<h3>/<ul>/<li>/<strong>/<em>/<br>/<blockquote>/<a>. Єдиний атрибут —
    `href` у посилання, і його пише САМ парсер після перевірки (`_safe_href`), тож
    для innerHTML на клієнті це лишається безпечним за побудовою.
    `base_url` потрібен рівно для посилань: без нього відносна адреса «/news/999»
    вела б на НАШ домен. Ріже службовий хвіст (_TAIL_RE), дубль
    заголовка й провідний часовий штамп. Запобіжна довжина ~7500."""
    tnorm = re.sub(r"\W+", "", title.lower()) if title else ""
    parts, li_buf, total = [], [], 0

    def flush_li():
        nonlocal total
        if li_buf:
            block = "<ul>" + "".join(f"<li>{x}</li>" for x in li_buf) + "</ul>"
            parts.append(block); total += len(block); li_buf.clear()

    for b in el.find_all(["p", "h2", "h3", "h4", "li", "blockquote"]):
        if total > 7500:
            break
        if b.name != "li" and b.find_parent(["p", "h2", "h3", "h4", "blockquote"]):
            continue                      # вкладений блок — не дублюємо
        if b.name == "li" and b.find(["p"]):
            continue
        raw = b.get_text(" ", strip=True)
        if not raw:
            continue
        if _TAIL_RE.search(raw):          # службовий хвіст (теги/«читайте також»/промо) — стоп
            break
        # Рекламні слоти-сміття (volynpost: «op13-Volynpost.com_650x60 У новині #3 650*60»)
        if re.search(r"\d{3}\s*[x×*]\s*\d{2,3}|У\s+новині\s*#|\.com_\d", raw, re.I):
            continue
        inner = _inline_html(b, base_url).strip()
        if not inner:
            continue
        if b.name == "li":
            li_buf.append(inner); continue
        flush_li()
        norm = re.sub(r"\W+", "", raw.lower())
        if b.name in ("h2", "h3", "h4"):
            if tnorm and norm == tnorm:
                continue                  # дубль заголовка статті
            block = f"<h3>{inner}</h3>"
        elif b.name == "blockquote":
            block = f"<blockquote>{inner}</blockquote>"
        else:
            # перший абзац: пропустити дубль заголовка / провідний час-штамп
            if not parts and tnorm and norm.startswith(tnorm) and len(norm) - len(tnorm) <= 20:
                continue
            # Провідний короткий блок-дата/час («21 липня, 22:42», «Сьогодні, 15:09»,
            # «08.07.2026, 14:00», голий «15:09») — службове сміття, не тіло.
            if (not parts and len(raw) < 40 and re.search(
                    r"\d{1,2}[:.]\d{2}\b"
                    r"|\d{1,2}\s+(?:січн|лют|берез|квітн|травн|черв|липн|серпн|вересн|жовтн|листопад|грудн)"
                    r"|^\s*(?:Сьогодні|Вчора|Позавчора)\b", raw, re.I)):
                continue
            block = f"<p>{inner}</p>"
        parts.append(block); total += len(block)
    flush_li()

    if not parts:                          # блоків нема (голі div) — запасний плоский варіант
        fb = clean_article_text(_paragraphs_fallback(el), title)
        return _split_runon_html("".join(f"<p>{html.escape(p)}</p>" for p in fb.split("\n\n") if p.strip()))
    return _split_runon_html("".join(parts))   # відновити склеєні RSS-ом межі абзаців


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
    except Exception as e:
        if DEBUG_FETCH:
            print(f"[FETCH] {url[:70]} — ЗАВАНТАЖЕННЯ ВПАЛО: {type(e).__name__}: {e}")
        return None
    if DEBUG_FETCH:
        print(f"[FETCH] {url[:70]} — завантажено {len(raw)} байт")

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
            # Плоский текст — лише для порогу довжини; віддаємо БАГАТИЙ HTML (варіант A).
            if len(clean_article_text(_blocks_to_text(el), title)) > 300:
                if DEBUG_FETCH:
                    print(f"[FETCH] {url[:70]} — OK селектор '{sel}'")
                return _blocks_to_html(el, title, base_url=url)[:8000]

    # Fallback (readability-стиль): контейнер із найбільшою масою тексту в <p>.
    # Не обмежуємось верхнім рівнем — тіло статті зазвичай ВКЛАДЕНЕ (через це старий
    # top-level-only фолбек не знаходив body у деяких видань, напр. konkurent).
    # Щоб не схопити весь <body> з рештками меню — спускаємось у найглибший
    # контейнер, що ще тримає ≥85% тексту.
    candidates = []
    for tag in soup.find_all(["div", "section", "article"]):
        ps = tag.find_all("p", recursive=True)
        if len(ps) < 2:
            continue
        mass = sum(len(p.get_text(" ", strip=True)) for p in ps)
        if mass >= 400:
            candidates.append((mass, tag))

    # 🔴 12.08 — ДРУГИЙ ФОЛБЕК: СТОРІНКИ, ДЕ ТЕКСТ НЕ В <p>.
    #
    # Знайдено з логів GitHub Actions (не з пісочниці — там домен заблокований
    # проксі, і мій перший діагноз «сайт віддає 403» виявився ХИБНИМ):
    #     [FETCH] volynpost.com/news/268523… — завантажено 37341 байт
    #     [FETCH] volynpost.com/news/268523… — НЕ ЗНАЙДЕНО тіла (0 кандидатів)
    # Тобто сторінка приходить цілою, але жоден контейнер не має ДВОХ тегів <p> —
    # видання верстає текст голим текстом із <br> усередині <div>.
    # Це 73 з 73 статей джерела, тобто найбільший клас проблеми.
    #
    # 🔑 Лікуємо КЛАС, а не домен: правило «текст може бути не в <p>» стосується
    # будь-якого видання зі старою версткою, і доменний селектор тут не допоміг би —
    # у volynpost їх уже п'ять, і жоден не спрацював.
    # ⚠️ Міряємо ВЛАСНИЙ текст вузла (`recursive=False`), а не весь піддерев'яний:
    # інакше найбільшу масу завжди має <body>, і ми б узяли сторінку цілком разом
    # із меню. `_blocks_to_text` нижче однаково має свій `_paragraphs_fallback`
    # для голих div — тобто витягти текст ми вміємо, бракувало саме КАНДИДАТА.
    if not candidates:
        from bs4 import NavigableString
        for tag in soup.find_all(["div", "section", "article"]):
            own = sum(len(str(c).strip()) for c in tag.children
                      if isinstance(c, NavigableString))
            brs = len(tag.find_all("br", recursive=False))
            # Текст із <br> — ознака абзаців у старій верстці. Без <br> це може бути
            # просто підпис або хлібні крихти, тому вимагаємо і масу, і розбиття.
            if own >= 400 and brs >= 2:
                candidates.append((own, tag))
        if candidates and DEBUG_FETCH:
            print(f"[FETCH] {url[:70]} — тіло знайдено ДРУГИМ фолбеком (текст без <p>)")

    if candidates:
        best_mass, best_el = max(candidates, key=lambda x: x[0])
        rich = _blocks_to_html(best_el, title, base_url=url)   # _NOISE_RE вже прибрав меню/рекламу, _TAIL_RE зріже хвіст
        if len(strip_html(rich)) > 300:
            if DEBUG_FETCH:
                print(f"[FETCH] {url[:70]} — OK фолбек (<p>-маса {best_mass})")
            return rich[:8000]

    if DEBUG_FETCH:
        print(f"[FETCH] {url[:70]} — НЕ ЗНАЙДЕНО тіла (домен {domain}, {len(candidates)} кандидатів)")
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
            excerpt = strip_html(content)[:400]

        # Зображення — перший <img> у контейнері
        image = None
        img_el = container.find("img") if hasattr(container, "find") else None
        if img_el:
            src = img_el.get("src") or img_el.get("data-src", "")
            if src and any(ext in src.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                image = src if src.startswith("http") else base + src

        category = detect_category(title, excerpt)
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


def _parse_rayon_date(text: str) -> int | None:
    """Дата rayon.in.ua: «21.07.2026 14:58» (київський час) → Unix ms (UTC).

    На сайті час київський (UTC+3 влітку). Інші джерела зберігають UTC, тож
    приводимо і цей до UTC (−3 год), щоб порядок стрічки не збивався.
    """
    m = re.search(r"(\d{1,2})\.(\d{2})\.(\d{4})\s+(\d{1,2}):(\d{2})", text)
    if not m:
        return _parse_date_uk(text)   # лише дата без часу → загальний парсер
    d, mo, y, hh, mm = (int(g) for g in m.groups())
    try:
        dt = datetime.datetime(y, mo, d, hh, mm) - datetime.timedelta(hours=3)  # Київ→UTC
        # timegm через календар: трактуємо як UTC (не локаль раннера)
        import calendar
        return int(calendar.timegm(dt.timetuple()) * 1000)
    except ValueError:
        return None


def parse_rayon_source(source: dict, seen_urls: set, seen_by_section: dict) -> list:
    """Парсить тег-сторінку rayon.in.ua (напр. kivertsi.rayon.in.ua/tags/olika).

    Сайт — SPA, але сторінка server-rendered: картки = <a class="galleryCard">.
    Заголовок беремо з alt зображення (надійно), дата — <time class="galleryCard__time">
    у форматі ДД.ММ.РРРР ГГ:ХВ (реальний час публікації), фото — <img src>.
    Усі статті тегу → geo джерела («Громада»).
    """
    from bs4 import BeautifulSoup

    try:
        req = urllib.request.Request(source["url"], headers={
            "User-Agent": BROWSER_UA,
            "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
            "Accept-Language": "uk-UA,uk;q=0.9",
            "Referer": "https://www.google.com/",
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
    except Exception as e:
        raise ValueError(f"Не вдалось завантажити {source['url']}: {e}")

    base = "https://" + urllib.parse.urlparse(source["url"]).netloc
    soup = BeautifulSoup(raw, "html.parser")

    articles = []
    for card in soup.select("a.galleryCard[href]"):
        href = card["href"]
        if not href.startswith("http"):
            href = base + href
        if "/news/" not in href or href in seen_urls:
            continue

        # Заголовок: alt зображення картки → fallback .galleryCard__title
        img = card.select_one("img[alt]")
        title = (img.get("alt") or "").strip() if img else ""
        if not title:
            t_el = card.select_one(".galleryCard__title, h2, h3")
            title = t_el.get_text(strip=True) if t_el else ""
        title = strip_html(title).strip()
        if not title:
            continue

        section = section_of(source["geo"])
        tokens = title_tokens(title)
        if is_dup_title(tokens, section, seen_by_section):
            continue

        # Дата публікації (реальна, київський час → UTC)
        ts = int(time.time() * 1000)
        tm = card.select_one("time.galleryCard__time, time")
        if tm:
            parsed = _parse_rayon_date(tm.get_text(strip=True))
            if parsed:
                ts = parsed

        # Фото картки (оригінал, не conversions-мініатюра якщо є)
        image = None
        im = card.select_one("img[src]")
        if im and im.get("src"):
            src = im["src"]
            image = src if src.startswith("http") else base + src

        # Повний текст статті + автор (окремий fetch зі сторінки статті rayon)
        content, author = fetch_rayon_article(href, title)
        excerpt = strip_html(content)[:400]

        # Фільтр релевантності громаді (Вова 21.07): тег «Олика» на rayon інколи
        # містить чисто районні новини (Ківерці/Луцьк). Пускаємо ЛИШЕ ті, що
        # згадують Олику/село громади в ЗАГОЛОВКУ чи ТЕКСТІ (напр. «Кадище-Олика»
        # у тілі статті про аварію). Не про громаду — пропускаємо.
        if not is_hromada_relevant(title + " " + content):
            continue

        category = detect_category(title, excerpt)
        entry_type = classify_entry(title, excerpt + " " + content)

        articles.append({
            "title": title,
            "excerpt": excerpt,
            "content": content,
            "category": category,
            "geo": source["geo"],   # «Громада» — усі новини тегу Олика
            "image": image,
            "source": source["name"],
            "author": author,           # справжній автор публікації (Наталка Марчук)
            "fullText": bool(content),  # текст повний (не анонс) → не показувати «Читати повністю»
            "sourceUrl": href,
            "exclusive": False,
            "ts": ts,
            "_type": entry_type,
        })
        seen_urls.add(href)
        remember_title(tokens, section, seen_by_section)
        if len(articles) >= MAX_PER_SOURCE:
            break

    return articles


def fetch_rayon_article(url: str, title: str = "") -> tuple[str, str]:
    """Тіло статті rayon.in.ua + автор — за структурою сторінки статті.

    Розмітка (зонд 21.07): картки/стаття в <article class="article">, метадані
    (автор/дата/перегляди/«Зберегти») — у блоці .articleContentInfo, автор саме в
    .articleContentInfo__name. Тіло = <article> БЕЗ метаданих/зображень/підписів/
    тегів. Повертає (тіло, автор). Обидва можуть бути '' (fail-soft).
    """
    author = ""
    try:
        req = urllib.request.Request(url, headers={
            "User-Agent": BROWSER_UA,
            "Accept-Language": "uk-UA,uk;q=0.9",
            "Referer": "https://www.google.com/",
        })
        with urllib.request.urlopen(req, timeout=15) as r:
            raw = r.read()
    except Exception:
        return "", ""

    from bs4 import BeautifulSoup
    soup = BeautifulSoup(raw, "html.parser")

    an = soup.select_one(".articleContentInfo__name")
    if an:
        author = an.get_text(strip=True)

    art = soup.select_one("article.article") or soup.select_one("[class*=article]")
    if not art:
        return "", author

    # Прибираємо все НЕ-тілесне: метадані (автор/дата/перегляди/«Зберегти»),
    # заголовок, зображення+підписи, теги, поділитись, хлібні крихти, скрипти.
    for sel in (".articleContentInfo", "h1", "figure", "figcaption", "picture", "img",
                "[class*=caption]", "[class*=gallery]", "[class*=tag]",
                "[class*=share]", "[class*=social]", "[class*=related]", "[class*=breadcrumb]",
                "[class*=views]", "[class*=save]", "script", "style", "nav"):
        for el in art.select(sel):
            el.decompose()

    text = _blocks_to_html(art, title, base_url=url)   # багатий HTML (варіант A)
    return (text[:8000] if len(text) > 40 else ""), author


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
            excerpt = strip_html(content)[:400]

        # Зображення
        image = None
        img_el = container.find("img") if hasattr(container, "find") else None
        if img_el:
            src = img_el.get("src") or img_el.get("data-src") or ""
            if src and any(ext in src.lower() for ext in [".jpg", ".jpeg", ".png", ".webp"]):
                image = src if src.startswith("http") else GROMADA_BASE + src

        category = detect_category(title, excerpt)
        entry_type = classify_entry(title, excerpt + " " + content)

        articles.append({
            "title": title,
            "excerpt": excerpt,
            "content": content,
            "category": category,
            "geo": "Олика",
            "image": image,
            "source": "Олицька громада",
            "fullText": bool(content),   # gov.ua дає повний текст → без «Читати повністю»
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

    # rayon.in.ua — тег-сторінка з картками .galleryCard (спец-парсер)
    if source.get("type") == "rayon":
        return parse_rayon_source(source, seen_urls, seen_by_section)

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
    skipped_thin = 0        # відсіяно політикою повноти (див. нижче) — для звіту
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
            # content — БАГАТИЙ HTML (get_full_content зберігає структуру + чистить)
            rss_html = get_full_content(entry, title, base_url=link)
            rss_summary = strip_html(entry.get("summary") or entry.get("description") or "")

            # 🔴 12.08 — НА СТОРІНКУ ХОДИМО ЗАВЖДИ, а не лише коли анонс короткий.
            # Було: `if len(strip_html(content)) < 500`. Тобто джерело, що віддає в
            # RSS довгий анонс (600+ символів), НІКОЛИ не перевірялось — його анонс
            # автоматично зараховувався як повна стаття. Саме так «Українська правда»
            # давала 15 статей із плашкою: анонс довгий, поріг пройдено, на сторінку
            # ніхто не сходив, а тексту в статті насправді набагато більше.
            page_html = fetch_full_article(link, title) if link else None
            content, content_source = decide_content(rss_html, page_html, rss_summary)
            full_text = content_source == "page"

            # excerpt — ЗАВЖДИ плоский (для карток): summary або текст без тегів
            excerpt = strip_html(entry.get("summary") or entry.get("description") or "")[:400]
            if not excerpt:
                excerpt = strip_html(content)[:400]

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

            # 🔴 ПОЛІТИКА ПОВНОТИ (12.08, рішення за дорученням Вови «роби як краще»).
            #
            # Слова замовника: *«з такими плашками новини не треба парсити геть.
            # Але й не треба обходити такі новини, тому що є деякі новини громади,
            # які потрібно брати»*. Тобто вимога РІЗНА для різних розділів:
            #   • Громада — беремо ЗАВЖДИ. Місцева новина (загинув земляк, змінили
            #     розклад, зникло світло) потрібна людині навіть анонсом: іншого
            #     джерела цієї інформації в неї немає.
            #   • Волинь / Україна / Світ — без повного тексту НЕ публікуємо. Там
            #     цінність новини не унікальна, а плашка «читайте на сайті видання»
            #     створює саме те тертя, проти якого весь цей потік.
            #
            # ⚠️ Правило діє лише на НОВІ статті. Наявні не чіпаємо: їх лікує
            # `rehydrate_short_articles`, і масове зникнення вже опублікованого
            # виглядало б для людини як поломка застосунку.
            if content_source == "rss" and geo not in ("Громада", "Олика"):
                skipped_thin += 1
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

            category = detect_category(title, excerpt)
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
                "fullText": full_text,   # чи текст повний (не анонс) — для «Читати повністю»
                # 🆕 12.08 — ЗВІДКИ тіло. `fullText` тепер ВИВОДИТЬСЯ звідси, а не
                # з довжини. Поле зберігаємо в даних, щоб і клієнт, і звіт якості
                # спирались на ту саму причину, а не перевимірювали текст кожен по-своєму.
                "contentSource": content_source,
                "sourceUrl": link,
                "exclusive": False,
                "ts": ts,
                "_type": entry_type,
            })
            seen_urls.add(link)
            remember_title(tokens, section, seen_by_section)
        except Exception:
            continue

    # Видно в логах CI одразу: якщо джерело раптом перестало віддавати тіло статей,
    # воно тут тихо зникне зі стрічки — і без цього рядка ми дізнались би про це
    # лише зі скарги Вови, як і сталося з плашкою.
    if skipped_thin:
        print(f"   ↷ {source['name']}: відсіяно {skipped_thin} без повного тексту")
    return articles


def rehydrate_short_articles(existing_articles: list) -> int:
    """Самолікування: доганяємо ПОВНИЙ текст для вже збережених статей, що мають
    лише короткий анонс (fullText≠True, тіло <500 символів).

    Навіщо: парсер дедуплікує за URL (вже бачені посилання пропускаються), тому
    статті, спаршені ДО того як з'явилась логіка «дотягування» повного тексту,
    лишались «анонсом» назавжди — клієнт показував на них плашку «Читати
    повністю → анонс через RSS». Тепер на КОЖНОМУ прогоні проходимось по таких
    статтях і доповнюємо їх повним текстом на місці (той самий шлях
    fetch_full_article, що й для нових). Так плашка зникає, а статті лишаються.

    🆕 27.08 — ДРУГА ПРИЧИНА ЗАЙТИ СЮДИ: змінились правила РОЗМІТКИ (посилання,
    цілі цитати). Вона стосується всіх статей, зокрема давно повних, і має власну
    версію (`RICH_ALGO_VERSION`) та власний лічильник спроб (`_richTries`).

    Повертає кількість ЗМІНЕНИХ статей (доповнені + перебрані) — саме за цим
    числом `main()` вирішує, чи зберігати файл.

    Бюджет і лічильники спроб (_fullTries / _richTries) захищають від нескінченних
    повторів для джерел, з яких текст дістати не вдається.
    """
    MAX_TRIES_PER_ART = 3      # скільки прогонів пробуємо, поки не здамось
    FETCH_BUDGET      = 40     # стеля мережевих запитів на один прогін
    upgraded = fetched = remarked = 0
    for a in existing_articles:
        if a.get("exclusive"):
            continue

        # 🔴 27.08 — ДРУГА ПРИЧИНА ПЕРЕБРАТИ СТАТТЮ: ЗМІНИЛИСЬ ПРАВИЛА РОЗМІТКИ.
        # Досі сюди заходили лише статті, що лишились анонсом. Але 27.08 парсер
        # навчився зберігати посилання і не рвати пряму мову — а це стосується
        # УСІХ статей, зокрема давно повних. Без цієї гілки виправлення побачили б
        # тільки нові новини, а наявні 400 лишились би зі стертими посиланнями.
        # ⚠️ Лічильник спроб тут ВЛАСНИЙ (`_richTries`): у статті, яка вже повна,
        # невдача розмітки не має витрачати спроби дотягнути повний текст.
        треба_розмітку = a.get("_richAlgo") != RICH_ALGO_VERSION
        якщо_лише_розмітка = bool(a.get("fullText")) and треба_розмітку
        if a.get("fullText") and not треба_розмітку:
            continue
        if якщо_лише_розмітка and int(a.get("_richTries", 0)) >= MAX_TRIES_PER_ART:
            continue

        # 🔴 12.08 — СКИДАННЯ ЛІЧИЛЬНИКА ПРИ ЗМІНІ АЛГОРИТМУ.
        # Без цього рядка вся ця робота була б НЕВИДИМОЮ: заміряно 12.08 — зі 107
        # статей із плашкою у **100** лічильник `_fullTries` уже дорівнював стелі 3,
        # тобто самолікування здалося на них назавжди. Полагоджений парсер до них
        # просто не підійшов би, і Вова побачив би ті самі плашки.
        # ⚠️ Скидаємо саме за ВЕРСІЄЮ алгоритму, а не «раз почистили і забули»:
        # наступна зміна правил повноти має так само дати статтям новий шанс,
        # інакше через місяць ми знову ловитимемо той самий клас помилки.
        if a.get("_fullAlgo") != FULL_ALGO_VERSION:
            a.pop("_fullTries", None)
            a["_fullAlgo"] = FULL_ALGO_VERSION

        plain = strip_html(a.get("content") or "")
        url = a.get("sourceUrl")
        if not url or int(a.get("_fullTries", 0)) >= MAX_TRIES_PER_ART:
            continue
        if fetched >= FETCH_BUDGET:
            continue
        fetched += 1
        new_html = None
        try:
            domain = re.sub(r"^www\.", "", urllib.parse.urlparse(url).netloc)
            if domain.endswith("rayon.in.ua"):
                new_html, author = fetch_rayon_article(url, a.get("title", ""))
                if author and not a.get("author"):
                    a["author"] = author
            else:
                new_html = fetch_full_article(url, a.get("title", ""))
        except Exception:
            new_html = None
        # 🔑 Рішення ухвалює ТА САМА функція, що й на свіжому розборі. До 12.08 тут
        # стояла власна копія правила (`>= 500`), і саме вона відкидала повні короткі
        # статті: fetch удавався, віддавав усю статтю — і її не зараховували.
        # Анонсом для порівняння служить те, що вже лежить у статті (`excerpt`).
        # 🔴 27.08 — ДЛЯ ПЕРЕБОРУ РОЗМІТКИ СУДДЯ ІНШИЙ, І ЦЕ НЕ ДРІБНИЦЯ.
        #
        # Перша редакція віддавала рішення `decide_content` — тій самій функції, що
        # й для дотягування повного тексту. Стенд одразу показав, що жодна стаття
        # не перебирається, і причина виявилась змістовною: `decide_content` питає
        # «чи сторінка дала щось НОВЕ, чи це той самий анонс», і на повній статті
        # чесно відповідає «той самий текст» — бо це справді та сама стаття. Тобто
        # функцію просили відповісти на питання, якого їй не ставили.
        #
        # 🔑 Тут питання одне: «чи вдалось узяти тіло зі сторінки і чи не стало воно
        # коротшим». Повнота вже встановлена, `contentSource` уже «page» — їх не
        # чіпаємо взагалі.
        # ⚠️ Поріг саме «не коротше»: якщо видання перебудувало сторінку або стаття
        # зникла, ми радше лишимо наявний текст, ніж замінимо його недогризком.
        if якщо_лише_розмітка:
            новий_плоский = strip_html(new_html or "")
            if new_html and len(новий_плоский) >= len(plain):
                a["content"] = new_html
                a["_richAlgo"] = RICH_ALGO_VERSION
                a.pop("_richTries", None)
                remarked += 1
            else:
                a["_richTries"] = int(a.get("_richTries", 0)) + 1
            continue

        merged, src = decide_content(a.get("content") or "", new_html, a.get("excerpt") or "")
        if src == "page" and len(strip_html(merged)) >= len(plain):
            a["content"]  = merged            # excerpt лишаємо плоским (для картки)
            a["fullText"] = True
            a["contentSource"] = "page"
            a["_richAlgo"] = RICH_ALGO_VERSION   # текст щойно взято чинними правилами
            a.pop("_fullTries", None)
            upgraded += 1
        else:
            a["contentSource"] = "rss"
            a["_fullTries"] = int(a.get("_fullTries", 0)) + 1
    if upgraded or remarked or fetched:
        print(f"↻ Re-hydrate: доповнено {upgraded} статей повним текстом, "
              f"перебрано розмітку в {remarked} (мережевих спроб: {fetched})")
    # 🛑 ПОВЕРТАЄМО ВСІ ЗМІНЕНІ, А НЕ ЛИШЕ ДОПОВНЕНІ. Це число — єдина ознака, за
    # якою `main()` вирішує, чи взагалі зберігати `articles.json`. Якби тут лишилось
    # саме `upgraded`, прогін, який перебрав розмітку сотні статей і нічого не
    # «доповнив», ТИХО викинув би всю цю роботу: тексти оновились у памʼяті, файл
    # не записався, наступний прогін почав би спочатку. Симптом виглядав би як
    # «посилання чомусь не зʼявляються», а причина була б за кілометр від них.
    return upgraded + remarked


def report_fulltext_quality(articles: list) -> None:
    """Звіт у лог CI: скільки статей мають повний текст, і де саме ми його не беремо.

    🔑 НАВІЩО. Плашка «джерело надає лише анонс» три місяці стояла на 27% статей, і
    ніхто цього не бачив — бо ніде не було ЧИСЛА. Проблему знайшов Вова знімком з
    телефона, а не ми з логів. Одне число на прогін робить наступну таку регресію
    видимою за день, а не за квартал.

    ⚠️ Розбивка саме ПО ДЖЕРЕЛАХ, а не загальний відсоток: 12.08 виявилось, що
    `volynpost.com` віддає 403 і дає 73 з 73 неповних — тобто проблема була
    зосереджена в ОДНОМУ джерелі, а середнє по лікарні (27%) цього не показувало.
    """
    from collections import Counter
    total = len(articles)
    if not total:
        return
    by_src_bad, by_src_all = Counter(), Counter()
    for a in articles:
        src = a.get("source") or "?"
        by_src_all[src] += 1
        if a.get("exclusive") or not a.get("sourceUrl"):
            continue
        # Дзеркалить showsShortNote() у src/tabs/news.js.
        if a.get("contentSource"):
            bad = a["contentSource"] == "rss"
        else:
            bad = not a.get("fullText") and len(strip_html(a.get("content") or "").strip()) < 600
        if bad:
            by_src_bad[src] += 1
    bad_total = sum(by_src_bad.values())
    print(f"📊 Повний текст: {total - bad_total}/{total} статей "
          f"({round((total - bad_total) / total * 100)}%) — без плашки «лише анонс»")
    for src, n in by_src_bad.most_common(6):
        share = round(n / by_src_all[src] * 100)
        mark = "🔴" if share >= 50 else "⚠️"
        print(f"   {mark} {src}: {n}/{by_src_all[src]} без повного тексту ({share}%)")


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
    # 🔴 21.08 — ПАРСЕР РАХУЄ НОМЕРИ ЛИШЕ СЕРЕД СВОЇХ, НИЖЧЕ CMS_ID_BASE.
    #
    # Заміряно стендом `cms-chain` наступного ж дня після розведення просторів:
    # у діапазоні кабінету опинилось **17 чужих статей**. Причина в цьому рядку:
    # `max` брався по ВСЬОМУ файлу, тож щойно кабінет узяв 1 000 000, парсер
    # пішов за ним і почав роздавати 1 000 010, 1 000 011…
    #
    # 🔑 Тобто розвести простори МАЛО — треба ще й не дати нижньому здертись
    # угору. Стеля тут не «про всяк випадок»: без неї вчорашній фікс скасовував
    # сам себе за одну добу, і зіткнення номерів повернулись би тихо.
    # ⚠️ Число мусить збігатися з `CMS_ID_BASE` у `scripts/sync_cms.py`.
    # Стереже `tests/cms-chain.mjs`.
    CMS_ID_BASE = 1_000_000
    next_art_id = max(
        (a["id"] for a in existing_articles
         if isinstance(a.get("id"), int) and a["id"] < CMS_ID_BASE),
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

    # Денних лімітів/витіснення БІЛЬШЕ НЕМА (рішення Вови 21.07): додаємо ВСІ нові
    # (уже відфільтровані за релевантністю/дедупом), а обсяг тримає зберігання за
    # віком (prune_by_age) — тиждень/місяць. Так збережені статті не зникають.

    # Крапельна історична «історія Олики» (одна на день) — щоб стрічка жила в тишу
    _story, next_art_id = drip_story(existing_articles, next_art_id)
    if _story:
        new_articles.append(_story)
        print(f"✓ Історія Олики: +1 («{_story['title'][:40]}…»)")

    # Самолікування збережених статей: доганяємо повний текст для старих «анонсів»
    # (модифікує existing_articles на місці — прибирає плашку «Читати повністю»).
    rehydrated = rehydrate_short_articles(existing_articles)

    # Зберегти articles.json
    if new_articles or rehydrated:
        # Свіжі статті вже розібрані ЧИННИМИ правилами розмітки — позначаємо їх
        # одразу, інакше самолікування на наступному ж прогоні пішло б перебирати
        # те, що щойно розібрало, і витрачало б бюджет на порожню роботу.
        # 🔑 Одним місцем, а не в кожній із трьох гілок збирання статті: поле
        # службове, і тримати три його копії означало б три шанси забути одну.
        for _a in new_articles:
            _a.setdefault("_richAlgo", RICH_ALGO_VERSION)
        all_articles = new_articles + existing_articles
        report_fulltext_quality(all_articles)
        all_articles.sort(key=lambda a: a.get("ts", 0), reverse=True)
        all_articles = prune_by_age(all_articles)     # зберігання за віком (тиждень/місяць)
        all_articles = cap_articles(all_articles)     # запобіжна стеля, з квотою Громади
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
