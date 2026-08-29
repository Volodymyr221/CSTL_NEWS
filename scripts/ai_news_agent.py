#!/usr/bin/env python3
"""AI-агент новин CSTL — розумний пошук замість Google News.

Замість RSS-агрегатора: викликає Anthropic Claude (Sonnet) з інструментом
web_search, який шукає свіжі новини по всьому інтернету і повертає СПРАВЖНІ
посилання видавців (не заховані, як у Google News) + розумну фільтрацію й
дедуп за змістом.

Три «місії» (конфіг — scripts/hromada_config.json):
  • Громада — Олика 50% / села громади 50%; локальний контент без ліміту.
  • Волинь — 4-5 джерел; дедуп за ЗМІСТОМ.
  • Україна та світ — 5-6 джерел, 50/50; лише серйозне.

Мердж у data/articles.json: перевикористовує дедуп/ліміти/баланс parse_rss.py.

Запуск:  ANTHROPIC_API_KEY=... python scripts/ai_news_agent.py [--mission Громада] [--dry-run]
  --dry-run  — не викликати API, лише показати промпти (перевірка конфігу).
  --mission  — лише одна місія (за замовч. усі).
"""
import os
import re
import sys
import json
import time
import argparse
from pathlib import Path

# Перевикористовуємо машинерію парсера (дедуп/ліміти/баланс/повний текст)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import parse_rss as pr  # noqa: E402

# Пакет editor: семантичний дедуп + кабінет-sink (реюз). Фейл-софт — якщо чомусь
# недоступний, агент працює далі (без семантики й з файловим fallback).
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # корінь репо

# 🛑 ПРАВДИВІСТЬ ФАКТУ — ІМПОРТ ЖОРСТКИЙ, НЕ ФЕЙЛ-СОФТ. Решта пакета `editor`
# нижче підключається мʼяко (нема семантики — працюємо далі), але правило «не
# видавати застаріле число за сьогоднішнє» так тримати не можна: при мовчазному
# збої рубіж просто зник би, і агент писав би неправду, поки хтось не помітить
# випадково. Краще впасти. Одне місце правди на ОБОХ агентів — див. модуль.
from editor.core.facts import (                       # noqa: E402
    факт_недатоване_число, факти_без_недатованих)     # noqa: F401

try:
    from editor.core.dedup import cluster_duplicates  # noqa: E402
    from editor.core.models import Draft              # noqa: E402
    from editor.sinks.cabinet import CabinetSink      # noqa: E402
    _EDITOR_OK = True
except Exception as _e:                               # pragma: no cover
    print(f"⚠ editor-пакет недоступний ({_e}) — семантика/кабінет через fallback")
    _EDITOR_OK = False

CONFIG_PATH = Path(__file__).resolve().parent / "hromada_config.json"
MEMORY_PATH = Path("data/hromada_memory.json")  # памʼять: про що вже писали + які джерела (щоб не повторювати)
EDITOR_DRAFTS_PATH = Path("data/editor_drafts.json")  # fallback без ключа: чернетки тримаються, НЕ авто-публікуються
MEMORY_CAP = 400                             # скільки записів тримати (не роздувати файл)
MEMORY_DIGEST = 150                          # скільки останніх заголовків показувати агенту в промпті
MODEL = "claude-sonnet-5"            # рішення Роми: Sonnet (якісна курація)
WEB_SEARCH_TOOL = "web_search_20250305"
MAX_SEARCHES_PER_MISSION = 6        # обмеження веб-пошуків на місію (контроль вартості; економно під малий бюджет)
API_URL = "https://api.anthropic.com/v1/messages"

# Скільки оригінальних матеріалів просимо в агента за прогін Громади.
TARGET_PER_MISSION = {"Громада": 10, "Волинь": 8, "Україна та світ": 10, "Історія": 2}

# ── ІСТОРІЯ ГРОМАДИ — ОКРЕМА МІСІЯ З ОКРЕМИМ ПРИЗНАЧЕННЯМ (27.08.2026) ───────
#
# 🔴 ЗАМОВЛЕННЯ ВОВИ. «Все, що було колись, — це будемо публікувати в Історію
# громади. В новини посилати те, що відбулося прям в буденності, нашого часу.»
#
# 📐 ЧОМУ ЦЕ ЗНАДОБИЛОСЬ, ЧИСЛАМИ. Із 18 наших статей у стрічці новин історичних
# було **11**, а в списку `create_themes` цієї місії історичних тем — **22 із 42**.
# Тобто новинний агент за налаштуванням писав історію більше, ніж новини.
#
# 🔑 РОЗПОДІЛ НА ВХОДІ, А НЕ КЛАСИФІКАТОР НА ВИХОДІ. Тема відома ДО звернення до
# моделі — вона береться зі списку. Класифікувати вже НАПИСАНИЙ текст означало б
# заплатити за нього, а потім вирішувати, куди його діти. Тому історія — окрема
# місія з окремим промптом, і призначення в неї детерміноване, а не вгадане.
#
# 🛑 ЩО САМЕ ЦЯ МІСІЯ ВІДДАЄ. Не готовий пост, а **тему з фактами** у план
# `editor/plans/istoriya_hromady.json`. Пост із цих фактів пише вже конвеєр
# `editor/` голосом спільноти. Розділення навмисне: агент, який і збирає факти, і
# пише текст, не має де спинитись — а тут писар фізично бачить лише те, що
# збирач поклав у `facts`. Це і є технічна форма вимоги Вови «нічого не вигадувати».
HISTORY_MISSION = "Історія"
HISTORY_PLAN_PATH = Path("editor/plans/istoriya_hromady.json")
HISTORY_STATE_PATH = Path("data/olyka_agent_state.json")
# Скільки НЕНАПИСАНИХ тем тримати в плані. Спільнота пише ~1 пост за прогін, тож
# шість — це запас на пару тижнів. Більше означало б платити за факти, які
# пролежать місяць і застаріють у памʼяті агента.
HISTORY_PLAN_KEEP = 6
HISTORY_PER_RUN = 2
MAX_DRAFTS_TOTAL = 10     # тримати ~10 готових чернеток у кабінеті НАПЕРЕД (Алла публікує → агент домалує)
BATCH_MAX = 2             # статей за ОДИН виклик (4→2 08.07): менша/швидша відповідь = менший ризик socket-таймауту (корінь пропалу грошей). Пишемо більше пакетів, кожен дешевший.
SUPA_URL = os.environ.get("SUPABASE_URL", "https://uabyfecseqnemvcqhdem.supabase.co").rstrip("/")

# ── ЗАПОБІЖНИК ВИТРАТ (circuit breaker — аварійний вимикач) ───────────────────
# Захист від зациклення/пропалу токенів: агент рахує $ на льоту й спиняється,
# щойно прогін або місяць перетнув стелю. Стелі можна перекрити через env.
MAX_RUN_COST_USD = float(os.environ.get("AI_MAX_RUN_USD", "1.20"))     # стеля на ОДИН прогін: вистачає на ~3 пакети (повне наповнення до 10); типовий долив = 1 пакет ≈ $0.3
# 🔴 20.08 — 4.0→3.0. Не економія, а РЕЗЕРВ. Цей агент читає СПІЛЬНИЙ місячний
# підсумок, тобто зупиняється, коли ВСІ разом витратили стелю. Поки стеля була
# спільною ($4 = глобальна), він міг вибрати весь кошик — і агент стрічки, який
# коштує центи, лишився б без грошей до 1 числа. Питання Вови було саме про це.
# Тепер: він спиняється на $3, а $1 фізично лишається тим, хто дешевший.
# ⚠️ ЗМІННА ОКРЕМА (`AI_NEWS_…`), а не спільна `AI_MAX_MONTH_USD`. Спокуса була
# лишити одну назву на всіх — але тоді перше ж «підніму ліміт на місяць» задало б
# ОДНЕ число і новинному, і глобальній стелі, і резерв для стрічки тихо зник би.
MAX_MONTH_COST_USD = float(os.environ.get("AI_NEWS_MAX_MONTH_USD", "3.0"))  # стеля новинного агента (15→4 08.07 по факту; 4→3 20.08 — $1 резерв іншим)
# 🔴 20.08 — ДОБОВА СТЕЛЯ. Місячної самої по собі мало: $4 технічно можна
# витратити за одну добу, і баланс зникне до того, як хтось відкриє звіт (пряме
# питання Вови: «щоб не зʼїло за один день»). $1.20 = рівно одне повне наповнення
# кабінету, тобто нормальну роботу не ріже — ріже лише повторні наповнення підряд.
MAX_DAY_COST_USD = float(os.environ.get("AI_MAX_DAY_USD", "1.20"))
# Оцінка «підозра на списання» для перерваного мережею виклику: Anthropic міг списати
# server-side, а клієнтський usage=0. Додаємо цю суму в run_cost щоб breaker бачив ризик.
SUSPECT_CHARGE_USD = float(os.environ.get("AI_SUSPECT_USD", "0.30"))

# ── Лічильник витрат AI (Фаза 0 оптимізації) ──────────────────────────────────
# Прилад: скільки $ їсть автопостинг. Пише data/ai_spend.json (читає адмінка).
SPEND_PATH = Path("data/ai_spend.json")
SPEND_KEEP_RUNS = 60                 # скільки останніх запусків тримати в журналі
# Ціни Anthropic за 1 млн токенів (claude-sonnet-5, стандартні — консервативно).
PRICE_IN_PER_M = 3.0                 # вхідні токени
PRICE_OUT_PER_M = 15.0               # вихідні токени
PRICE_CACHE_WRITE_PER_M = 3.75       # запис у кеш = 1.25× вхідних
PRICE_CACHE_READ_PER_M = 0.30        # читання з кешу = 0.1× вхідних (тут економія)
PRICE_WEB_SEARCH_PER_1K = 10.0       # веб-пошук — $10 за 1000 запитів


# ── Конфіг + наявна стрічка ──────────────────────────────────────────────────

def load_config() -> dict:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def load_existing() -> list:
    if pr.DATA_PATH.exists():
        try:
            arts = json.loads(pr.DATA_PATH.read_text(encoding="utf-8"))
            for a in arts:                       # міграція старої назви розділу
                if a.get("geo") == "Олика":
                    a["geo"] = "Громада"
            return arts
        except Exception as e:
            print(f"⚠ читання articles.json: {e}")
    return []


# ── Памʼять постів/джерел (щоб не писати одне й те саме) ──────────────────────
# МʼЯКА: агент бачить її як «вже писали — бери нові кути», а не жорсткий блок.
# Семантичний дедуп (editor/core/dedup) — запобіжник лише на ЯВНІ повтори.

def load_memory() -> dict:
    if MEMORY_PATH.exists():
        try:
            return json.loads(MEMORY_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"⚠ читання hromada_memory.json: {e}")
    return {"posts": [], "updated_ts": 0}


def _mem_key(title: str) -> str:
    """Стабільний ключ історії — відсортовані значущі слова заголовка (реюз токенів парсера)."""
    return " ".join(sorted(pr.title_tokens(title or "")))


def record_memory(article: dict):
    """Дописує у памʼять один опублікований/зачернечений матеріал Громади (+ джерела)."""
    mem = load_memory()
    key = _mem_key(article.get("title", ""))
    if not key:
        return
    if any(p.get("key") == key for p in mem.get("posts", [])):
        return  # уже в памʼяті
    srcs = list(article.get("sources") or [])
    if article.get("sourceUrl"):
        srcs.append(article["sourceUrl"])
    mem.setdefault("posts", []).insert(0, {
        "ts": int(time.time() * 1000),
        "title": article.get("title", ""),
        "category": article.get("category", ""),
        "sources": srcs[:6],
        "key": key,
    })
    mem["posts"] = mem["posts"][:MEMORY_CAP]
    mem["updated_ts"] = int(time.time() * 1000)
    MEMORY_PATH.write_text(json.dumps(mem, ensure_ascii=False, indent=2), encoding="utf-8")


def memory_digest(limit: int = MEMORY_DIGEST) -> list:
    """Список заголовків із памʼяті для промпту (щоб агент не повторював історії)."""
    mem = load_memory()
    return [f"- {p.get('title','')}" for p in mem.get("posts", [])[:limit] if p.get("title")]


# ── Лічильник витрат ──────────────────────────────────────────────────────────

def load_spend() -> dict:
    if SPEND_PATH.exists():
        try:
            return json.loads(SPEND_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"⚠ читання ai_spend.json: {e}")
    return {"runs": [], "totals": {"cost_usd": 0, "runs": 0, "web_searches": 0}, "months": {}}


def save_spend(data: dict):
    SPEND_PATH.write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def record_spend(mission: str, usage: dict, found: int, note: str = ""):
    """Рахує вартість одного запуску за usage і дописує у data/ai_spend.json."""
    cost = round(
        usage["input_tokens"]            / 1_000_000 * PRICE_IN_PER_M
        + usage["output_tokens"]         / 1_000_000 * PRICE_OUT_PER_M
        + usage["cache_read_input_tokens"]     / 1_000_000 * PRICE_CACHE_READ_PER_M
        + usage["cache_creation_input_tokens"] / 1_000_000 * PRICE_CACHE_WRITE_PER_M
        + usage["web_search_requests"]   / 1000 * PRICE_WEB_SEARCH_PER_1K,
        4,
    )
    ts = int(time.time() * 1000)
    month = time.strftime("%Y-%m", time.gmtime())     # місяць у UTC (стабільно в CI)
    data = load_spend()
    data.setdefault("runs", []).insert(0, {
        "ts": ts, "mission": mission, "model": MODEL,
        "input_tokens": usage["input_tokens"], "output_tokens": usage["output_tokens"],
        "cache_read": usage["cache_read_input_tokens"],
        "cache_write": usage["cache_creation_input_tokens"],
        "web_searches": usage["web_search_requests"],
        "found": found, "cost_usd": cost, "note": note,
    })
    data["runs"] = data["runs"][:SPEND_KEEP_RUNS]
    tot = data.setdefault("totals", {"cost_usd": 0, "runs": 0, "web_searches": 0})
    tot["cost_usd"] = round(tot.get("cost_usd", 0) + cost, 4)
    tot["runs"] = tot.get("runs", 0) + 1
    tot["web_searches"] = tot.get("web_searches", 0) + usage["web_search_requests"]
    m = data.setdefault("months", {}).setdefault(month, {"cost_usd": 0, "runs": 0, "web_searches": 0})
    m["cost_usd"] = round(m["cost_usd"] + cost, 4)
    m["runs"] += 1
    m["web_searches"] += usage["web_search_requests"]
    data["updated_ts"] = ts
    save_spend(data)
    print(f"  💸 витрата ${cost} (вхід {usage['input_tokens']} · вихід {usage['output_tokens']} · "
          f"кеш-читання {usage['cache_read_input_tokens']} · пошуків {usage['web_search_requests']})")
    return cost


def month_spend_usd() -> float:
    """Скільки вже витрачено цього місяця (UTC) за журналом — для місячного запобіжника."""
    month = time.strftime("%Y-%m", time.gmtime())
    try:
        return float(load_spend().get("months", {}).get(month, {}).get("cost_usd", 0) or 0)
    except Exception:
        return 0.0


def day_spend_usd() -> float:
    """Скільки витрачено за останні 24 год — для добового запобіжника.

    ⚠️ Рахуємо по журналу прогонів, а не по календарному дню: рухоме вікно не
    дає обійти стелю, витративши все ввечері й одразу після півночі ще раз."""
    поріг = time.time() - 24 * 3600
    сума = 0.0
    for r in load_spend().get("runs", []):
        try:
            if float(r.get("ts", 0)) / 1000 >= поріг:
                сума += float(r.get("cost_usd", 0) or 0)
        except Exception:
            continue
    return round(сума, 4)


def recent_titles_for(existing: list, geos: list, limit: int = 40) -> list:
    """Заголовки+анонси наявних статей потрібних гео — щоб агент не дублював (дедуп за змістом)."""
    items = [a for a in existing if a.get("geo") in geos]
    items.sort(key=lambda a: a.get("ts", 0), reverse=True)
    return [f"- {a.get('title','')} ({a.get('summary') or a.get('excerpt','')[:80]})"
            for a in items[:limit]]


# ── Прямі джерела Громади (офіційний сайт — без веб-пошуку, безкоштовно) ──────
# Свіжі заголовки з olytska-gromada.gov.ua інжектяться в промпт як готові
# теми/фактура: менше сліпих пошуків, більше реальної локальщини.
DIRECT_SOURCES = {"Громада": ["https://olytska-gromada.gov.ua/news/"]}
DIRECT_FRESH_DAYS = 14      # беремо лише новини за останні 2 тижні
_UA = "Mozilla/5.0 (compatible; CSTL-NEWS/1.0; +https://volodymyr221.github.io/CSTL_NEWS/)"
_direct_cache = {}          # кеш на прогін: 3-4 пакети → 1 HTTP-запит


def fetch_direct_sources(mission_name: str) -> list:
    """Свіжі {title,url,ts} з офіційних сайтів громади.
    На платформі gromada.org.ua ID новини = unix-час публікації → фільтр свіжості
    без парсингу дат. Fail-soft: помилка → порожньо, агент працює як раніше."""
    if mission_name in _direct_cache:
        return _direct_cache[mission_name]
    import re
    import html as _h
    import urllib.request
    out = []
    for base in DIRECT_SOURCES.get(mission_name, []):
        try:
            req = urllib.request.Request(base, headers={"User-Agent": _UA})
            page = urllib.request.urlopen(req, timeout=20).read().decode("utf-8", "replace")
            seen = set()
            for url, nid, raw in re.findall(
                    r'href="(https?://[^"]+/news/(\d+)/?)"[^>]*>(.*?)</a>', page, re.S):
                title = re.sub(r"\s+", " ", _h.unescape(re.sub(r"<[^>]+>", " ", raw))).strip()
                if url in seen or len(title) < 16:
                    continue
                seen.add(url)
                if time.time() - int(nid) > DIRECT_FRESH_DAYS * 86400:
                    continue
                out.append({"title": title, "url": url, "ts": int(nid)})
        except Exception as e:
            print(f"⚠ пряме джерело {base}: {e} (пропускаю — не критично)")
    out.sort(key=lambda x: -x["ts"])
    _direct_cache[mission_name] = out[:8]
    return _direct_cache[mission_name]


# ── Валідація джерел (анти-галюцинація: вигадані URL не проходять) ────────────
_url_alive_cache = {}


def url_alive(url: str) -> bool:
    """False ЛИШЕ на явних 404/410 (сторінки не існує — ознака вигаданого лінка).
    403/405/таймаут/мережеве — True: не караємо статтю за захист сайту чи CI-мережу."""
    if url in _url_alive_cache:
        return _url_alive_cache[url]
    import urllib.request
    import urllib.error
    ok = True
    try:
        req = urllib.request.Request(url, headers={"User-Agent": _UA}, method="HEAD")
        urllib.request.urlopen(req, timeout=10)
    except urllib.error.HTTPError as e:
        if e.code in (404, 410):
            ok = False
        elif e.code == 405:   # HEAD заборонено — одна спроба GET
            try:
                req = urllib.request.Request(url, headers={"User-Agent": _UA})
                urllib.request.urlopen(req, timeout=10)
            except urllib.error.HTTPError as e2:
                ok = e2.code not in (404, 410)
            except Exception:
                ok = True
    except Exception:
        ok = True
    _url_alive_cache[url] = ok
    return ok


# ── Побудова промпту місії ───────────────────────────────────────────────────

def build_prompt(mission_name: str, cfg: dict, existing: list, target: int = None) -> str:
    m = cfg["missions"][mission_name]
    target = target or TARGET_PER_MISSION.get(mission_name, 6)
    schema = cfg["output_schema"]

    if mission_name == "Громада":
        h = cfg["hromada"]
        villages = ", ".join(h["villages"])
        create_block = ""
        if m.get("create_when_scarce"):
            create_block = (
                f"\n\nТВОРЕННЯ КОНТЕНТУ (важливо — громада мала, свіжих новин часто мало):\n"
                f"Якщо реальних свіжих новин знаходиш мало — СТВОРИ оригінальні матеріали "
                f"(original=true) на вічнозелені локальні теми: {', '.join(m.get('create_themes', []))}.\n"
                f"Для оригінального матеріалу:\n"
                f"  • url можна лишити порожнім;\n"
                f"  • ОБОВ'ЯЗКОВО заповни content (повний текст 3-6 абзаців) і sources "
                f"(джерела, на факти яких спираєшся — щоб НЕ вигадувати);\n"
                f"  • пиши ЛИШЕ перевірені факти (дати, імена, події). Не впевнений — не пиши;\n"
                f"  • числа, що міняються з часом (населення, ціни, кількість), — ЛИШЕ з роком виміру, ніколи як «сьогодні»;\n"
                f"  • додай image_query — англ. запит для ілюстрації з Wikimedia (напр. 'Olyka Castle');\n"
                f"  • обери 2-3 оригінальні матеріали за запуск, щоб стрічка жила щодня."
            )
        body = (
            f"Ти — редактор локального медіа про {h['name']} ({h['district']}, {h['oblast']}).\n"
            f"Адмінцентр — {h['center']} ({h['center_status']}). Села громади: {villages}.\n\n"
            f"ЗАВДАННЯ: через веб-пошук знайди {target} НАЙСВІЖІШИХ цікавих новин/статей про громаду.\n"
            f"БАЛАНС ОБОВ'ЯЗКОВО ~50/50: половина про Олику (центр), половина про СЕЛА громади "
            f"(явно шукай за назвами сіл — інакше все перекоситься на Олику).\n"
            f"Теми: {', '.join(m['themes'])}.\n"
            f"Приклади запитів (центр): {'; '.join(m['keywords_center'][:6])}.\n"
            f"Приклади запитів (села): {'; '.join(m['keywords_villages'][:6])}.\n"
            f"geo у відповіді: завжди \"Громада\".{create_block}"
        )
    elif mission_name == HISTORY_MISSION:
        # 🔴 ІНШЕ ЗАВДАННЯ, НЕ «СВІЖІ НОВИНИ». Тут не шукають, що сталось учора —
        # тут збирають ПЕРЕВІРЕНІ факти про минуле. Тому й вимоги інші: жодної
        # курованої новини, лише оригінальні матеріали з обовʼязковими джерелами.
        h = cfg["hromada"]
        villages = ", ".join(h["villages"])
        body = (
            f"Ти — краєзнавець {h['name']} ({h['district']}, {h['oblast']}).\n"
            f"Адмінцентр — {h['center']} ({h['center_status']}). Села громади: {villages}.\n\n"
            f"ЗАВДАННЯ: через веб-пошук зібери фактуру для {target} матеріалів про МИНУЛЕ громади.\n"
            f"🔴 БАЛАНС ОБОВʼЯЗКОВИЙ — приблизно 60% про Олику і 40% про СЕЛА громади.\n"
            f"Про села шукай ЯВНО за їхніми назвами ({villages}) — інакше все стягнеться\n"
            f"до замку, бо про нього джерел найбільше. Заміряно: з перших семи наших\n"
            f"постів про місце СІМ були про Олику і ЖОДНОГО про село.\n"
            f"⚠️ Якщо про село надійних джерел не знайшлось — краще віддати менше\n"
            f"матеріалів, ніж підмінити село черговим текстом про замок.\n"
            f"Теми: {', '.join(m.get('create_themes', []))}.\n"
            f"Приклади запитів: {'; '.join((m.get('keywords') or [])[:6])}.\n"
            f"geo у відповіді: завжди \"Громада\". original: завжди true, url лишай порожнім.\n\n"
            "🔴 ГОЛОВНА УМОВА — НІЧОГО НЕ ВИГАДУВАТИ. Це вимога власника проєкту, і вона\n"
            "важливіша за красу тексту. Дозволено переказати своїми словами те, що знайшов у\n"
            "джерелах. ЗАБОРОНЕНО: дати, імена, події, походження назв і причинно-наслідкові\n"
            "звʼязки, яких у джерелах немає. Загальні знання про епоху НЕ є підтвердженням\n"
            "місцевого факту («тоді всі волинські містечка мали ярмарок» не доводить, що\n"
            "ярмарок був тут).\n"
            "⚠️ НЕВПЕВНЕНІСТЬ ЗБЕРІГАЙ, А НЕ ПРИБИРАЙ. Якщо джерело каже «ймовірно», «за\n"
            "переказами», «точна дата невідома» — так і пиши. Перша письмова згадка це НЕ\n"
            "дата заснування: документ фіксує, що село вже існувало.\n"
            "⚠️ Не знайшов надійних джерел на тему — ПРОПУСТИ її. Порожній результат тут\n"
            "кращий за правдоподібний вигаданий.\n"
            "🔴 ЧИСЛА, ЩО МІНЯЮТЬСЯ З ЧАСОМ (населення, дворів, учнів, площа, ціни), "
            "пиши ЛИШЕ РАЗОМ ІЗ РОКОМ виміру: «за переписом 2001 року — 959 осіб», "
            "а НЕ «сьогодні 959 осіб». 📐 В Україні був ОДИН перепис — 2001 року, "
            "тож будь-яке число населення у Вікіпедії старше за чверть століття, "
            "і слово «сьогодні» біля нього хибне ЗАВЖДИ. Року не знаєш — не пиши "
            "числа взагалі.\n"
            "📐 content пиши як ПЕРЕЛІК ФАКТІВ окремими реченнями, а не як есе: з нього\n"
            "далі беруться рядки для поста, і кожне речення має триматись саме на джерелі."
        )
    elif mission_name == "Волинь":
        body = (
            "Ти — редактор новин Волині.\n"
            f"ЗАВДАННЯ: знайди {target} найважливіших СВІЖИХ новин Волині / Луцького району.\n"
            f"Джерела-орієнтири: {', '.join(m['sources'])}.\n"
            f"ВАЖЛИВО ({m['dedup']}): не додавай новину, якщо про ЦЮ САМУ подію вже є у списку нижче — "
            f"навіть якщо заголовок сформульовано інакше.\n"
            "geo у відповіді: завжди \"Волинь\"."
        )
    else:  # Україна та світ
        body = (
            "Ти — редактор розділу «Україна та світ».\n"
            f"ЗАВДАННЯ: знайди {target} КЛЮЧОВИХ свіжих новин, баланс ~50% Україна / 50% світ.\n"
            f"ЯКІСТЬ: {m['quality']}\n"
            f"Джерела-орієнтири: {', '.join(m['sources'])}.\n"
            "geo у відповіді: \"Україна\" або \"Світ\" відповідно."
        )

    # ⚠️ `.get` із запасним значенням, а не `[...]`: до 27.08 тут стояв прямий доступ
    # за ключем, і будь-яка нова місія впала б тут із KeyError ще до першого виклику.
    existing_geos = {"Громада": ["Громада", "Олика"], "Волинь": ["Волинь"],
                     HISTORY_MISSION: ["Громада", "Олика"],
                     "Україна та світ": ["Україна", "Світ"]}.get(mission_name, ["Громада"])
    seen = recent_titles_for(existing, existing_geos)
    seen_block = ("\n\nВЖЕ У СТРІЧЦІ (НЕ дублюй за змістом):\n" + "\n".join(seen)) if seen else ""

    # Памʼять — персистентний лог написаного (довший за вікно стрічки). МʼЯКО: «бери нові кути».
    mem_block = ""
    if mission_name in ("Громада", HISTORY_MISSION):
        md = memory_digest()
        if md:
            mem_block = ("\n\nПРО ЩО ВЖЕ ПИСАЛИ (памʼять — НЕ повторюй ці історії й ідеї, "
                         "обирай НОВІ теми/кути з палітри):\n" + "\n".join(md))

    # Прямі джерела — свіжина з офіційного сайту громади (безкоштовна фактура).
    direct_block = ""
    fresh = fetch_direct_sources(mission_name)
    if fresh:
        direct_block = (
            "\n\nСВІЖЕ З ОФІЦІЙНИХ ДЖЕРЕЛ ГРОМАДИ (готові теми й фактура; це справжні url — "
            "для курованої новини бери ЦЕЙ url, для оригінальної додай його в sources):\n"
            + "\n".join(f"- {i['title']} ({time.strftime('%d.%m', time.gmtime(i['ts']))}) → {i['url']}"
                        for i in fresh))

    schema_str = json.dumps(schema, ensure_ascii=False, indent=2)
    return (
        f"{body}{direct_block}{seen_block}{mem_block}\n\n"
        "ПРАВИЛА ВІДПОВІДІ:\n"
        "1. Використай інструмент веб-пошуку кілька разів, щоб знайти реальні свіжі матеріали.\n"
        "2. Для КУРОВАНОЇ новини url МАЄ бути справжнім посиланням на сторінку статті у видавця "
        "(не пошуковик, не агрегатор). Для ОРИГІНАЛЬНОГО матеріалу (original=true) url можна лишити "
        "порожнім, але content і sources — обов'язкові.\n"
        "3. Тільки реально релевантне і свіже (для новин) або перевірене (для оригінальних). Краще менше, але якісно.\n"
        "4. Поверни ЛИШЕ JSON-масив об'єктів (без пояснень до/після). Схема об'єкта:\n"
        f"{schema_str}"
    )


# ── Виклик Anthropic API з web_search ────────────────────────────────────────

def _accumulate_usage(acc: dict, u: dict):
    """Додає usage одного під-виклику до акумулятора (білінг = сума всіх викликів)."""
    acc["input_tokens"] += u.get("input_tokens", 0)
    acc["output_tokens"] += u.get("output_tokens", 0)
    acc["cache_read_input_tokens"] += u.get("cache_read_input_tokens", 0)
    acc["cache_creation_input_tokens"] += u.get("cache_creation_input_tokens", 0)
    st = u.get("server_tool_use") or {}
    acc["web_search_requests"] += st.get("web_search_requests", 0)


def _roll_cache_breakpoint(messages: list):
    """Рухома cache_control-мітка на останньому блоці останнього туру (+ статична
    на промпті messages[0]). Прибирає попередню рухому — щоб не перевищити ліміт
    4 контрольних точок кешу при довгому pause_turn-циклі."""
    for m in messages[1:]:                       # промпт (messages[0]) не чіпаємо
        for b in m.get("content", []):
            if isinstance(b, dict):
                b.pop("cache_control", None)
    last = messages[-1].get("content", [])
    if last and isinstance(last[-1], dict):
        last[-1]["cache_control"] = {"type": "ephemeral"}


def _post_once(payload, headers):
    """Один POST до Anthropic з backoff-повтором ТОГО САМОГО запиту на транзиентних
    збоях (429/5xx/мережа/таймаут) — idempotent, промпт НЕ змінюється. Повертає dict або None.
    Закриває корінь пропалу грошей: раніше таймаут великого пакета → виняток → 0 output →
    платний повтор з ІНШИМ промптом. Тепер транзиентний збій повторюється тим самим запитом."""
    import urllib.request, urllib.error, socket
    data = json.dumps(payload).encode("utf-8")
    for attempt in range(3):   # 1 основна спроба + 2 backoff-повтори
        req = urllib.request.Request(API_URL, data=data, headers=headers)
        try:
            with urllib.request.urlopen(req, timeout=420) as r:
                return json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            body = e.read().decode("utf-8", "replace")[:300]
            if e.code in (429, 500, 502, 503, 504, 529) and attempt < 2:
                wait = 2 ** (attempt + 1)
                print(f"  ↻ транзиентна HTTP {e.code} — повтор через {wait}с (той самий запит)…")
                time.sleep(wait); continue
            print(f"✗ виклик API: HTTP {e.code} — {body}")
            return None
        except (socket.timeout, TimeoutError, urllib.error.URLError) as e:
            if attempt < 2:
                wait = 2 ** (attempt + 1)
                print(f"  ↻ мережа/таймаут ({e}) — повтор через {wait}с (idempotent, той самий запит)…")
                time.sleep(wait); continue
            print(f"✗ виклик API (мережа/таймаут) остаточно: {e}")
            return None
        except Exception as e:
            print(f"✗ виклик API: {e}")
            return None
    return None


def call_agent(prompt: str):
    """Повертає (text, usage, ok). Текст — фінальний JSON-масив (порожній при помилці).
    usage — акумульовані токени/пошуки за ВСІ під-виклики циклу pause_turn.
    ok=False → виклик остаточно впав (мережа/таймаут після backoff). Тоді НЕ переписувати
    промпт (перерваний виклик Anthropic міг списати server-side) — наступний крон доллє."""
    import urllib.request
    import urllib.error
    usage = {"input_tokens": 0, "output_tokens": 0,
             "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
             "web_search_requests": 0}
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("✗ немає ANTHROPIC_API_KEY — пропускаю виклик")
        return "", usage, True   # 3-кортеж (каллер розпаковує ok); не мережевий збій → без SUSPECT-charge
    headers = {
        "x-api-key": api_key,
        "anthropic-version": "2023-06-01",
        "content-type": "application/json",
    }
    # web_search може повертати stop_reason=pause_turn (довга пошукова сесія) —
    # тоді дослати відповідь назад і продовжити, доки не end_turn.
    # Промпт — блок з cache_control: стабільний префікс (велика інструкція + список
    # для дедупу) кешується для наступних ітерацій → ріже вхідні токени (профіль 17:1).
    messages = [{"role": "user", "content": [
        {"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}}]}]
    resp = None
    ok = True
    # Ліміт ітерацій pause_turn МАЄ бути помітно більший за MAX_SEARCHES_PER_MISSION:
    # інакше модель витрачає всі кроки на веб-пошук і не встигає написати фінальний
    # JSON (баг: 6==6 давало found=0). Запас на пошук + написання відповіді.
    for _ in range(MAX_SEARCHES_PER_MISSION + 8):
        payload = {
            "model": MODEL,
            "max_tokens": 16000,  # 8192 замало на ~10 статей: JSON обрізало (stop_reason=max_tokens, found=0). Запас на повний масив.
            "tools": [{"type": WEB_SEARCH_TOOL, "name": "web_search",
                       "max_uses": MAX_SEARCHES_PER_MISSION}],
            "messages": messages,
        }
        resp = _post_once(payload, headers)   # backoff-повтор ТОГО САМОГО запиту всередині
        if resp is None:
            ok = False
            break
        _accumulate_usage(usage, resp.get("usage") or {})
        if resp.get("stop_reason") == "pause_turn":
            messages.append({"role": "assistant", "content": resp.get("content", [])})
            _roll_cache_breakpoint(messages)     # кешуємо зростаючий префікс
            continue
        break

    parts = [b.get("text", "") for b in (resp or {}).get("content", []) if b.get("type") == "text"]
    text = "\n".join(parts).strip()
    # діагностика (щоб бачити чому 0 знайдено + скільки коштувало)
    print(f"  [debug] ok={ok} stop_reason={resp.get('stop_reason') if resp else None} "
          f"text_len={len(text)} in={usage['input_tokens']} cached={usage['cache_read_input_tokens']} "
          f"out={usage['output_tokens']} searches={usage['web_search_requests']}")
    return text, usage, ok


def _salvage_objects(t: str) -> list:
    """Рятівний парсер: витягує ПОВНІ {...}-об'єкти з (можливо обрізаного) тексту.
    Дає відновити статті навіть коли масив обрізало на max_tokens (немає ']')."""
    out, depth, start, in_str, esc = [], 0, None, False, False
    for i, ch in enumerate(t):
        if in_str:
            if esc: esc = False
            elif ch == "\\": esc = True
            elif ch == '"': in_str = False
            continue
        if ch == '"': in_str = True
        elif ch == "{":
            if depth == 0: start = i
            depth += 1
        elif ch == "}" and depth > 0:
            depth -= 1
            if depth == 0 and start is not None:
                try:
                    obj = json.loads(t[start:i + 1])
                    if isinstance(obj, dict):
                        out.append(obj)
                except Exception:
                    pass
                start = None
    return out


def extract_json_array(text: str):
    """Витягує список статей із відповіді. Спершу цілий JSON-масив; якщо не вийшло
    (обрізаний/побитий) — рятівний парсер збирає всі повні об'єкти. Повертає list."""
    if not text:
        return []
    t = text.strip()
    if "```" in t:
        m = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", t, re.S)
        if m:
            t = m.group(1)
    start = t.find("[")
    end = t.rfind("]")
    if start != -1 and end != -1 and end > start:
        try:
            data = json.loads(t[start:end + 1])
            if isinstance(data, list):
                return data
        except Exception:
            pass
    objs = _salvage_objects(t[start:] if start != -1 else t)
    if objs:
        print(f"↻ рятівний парсер: відновлено {len(objs)} статей з обрізаного/побитого JSON")
    return objs


# ── Перетворення знахідок у статті + мердж ────────────────────────────────────

def item_to_article(item: dict) -> dict | None:
    """Валідовує знахідку агента і будує dict статті (без id/added_ts — їх додає merge).

    Два шляхи:
    • КУРОВАНА новина — потрібен справжній url (як було).
    • ОРИГІНАЛЬНИЙ матеріал (original=true) — url не потрібен, АЛЕ обов'язкові
      content і непорожній sources (запобіжник проти вигадування — рішення Роми, вар. A).
    """
    title = pr.strip_html(item.get("title", "")).strip()
    geo = (item.get("geo") or "").strip()
    if not title or geo not in ("Громада", "Волинь", "Україна", "Світ"):
        return None

    summary = pr.strip_html(item.get("summary", "")).strip()
    original = bool(item.get("original"))
    sources = [s for s in (item.get("sources") or []) if isinstance(s, str) and s.strip()]

    if original:
        # Запобіжник якості: без обґрунтування джерелами і без тексту — відкидаємо.
        content = pr.strip_html(item.get("content", "")).strip()
        if not sources or len(content) < 200:
            return None
        # Анти-галюцинація: мертві посилання (404 — ознака вигаданого) викидаємо;
        # стаття, в якої не лишилось живих джерел, не проходить. Перевіряємо ≤4.
        alive = [s for s in sources[:4] if url_alive(s)] + sources[4:]
        if not alive:
            print(f"  ✂ всі джерела мертві (вигадані?) — відкидаю: {title[:60]}")
            return None
        sources = alive
        return {
            "title": title,
            "excerpt": (summary or content)[:400],
            "content": content,
            "category": item.get("category") or pr.detect_category(title + " " + content),
            "geo": geo,
            "image": None,
            "image_type": "none",              # уточнимо в enqueue (Wikimedia → illustration)
            "image_credit": None,
            "image_query": (item.get("image_query") or "").strip() or title,
            "source": "CSTL LIFE · Олика",
            "sourceUrl": None,                 # оригінал — без зовнішнього джерела
            "sources": sources,                # для аудиту/обґрунтування
            "exclusive": True,
            "original": True,
            "kind": "feature",
            "ts": int(time.time() * 1000),
            "summary": summary,
        }

    # Курована новина — потрібен справжній url
    url = (item.get("url") or "").strip()
    if not url or not url.startswith(("http://", "https://")) or "google.com/search" in url:
        return None
    # Анти-галюцинація: посилання на неіснуючу сторінку (404) = вигадана новина.
    if not url_alive(url):
        print(f"  ✂ url мертвий (404) — відкидаю куровану: {title[:60]}")
        return None
    return {
        "title": title,
        "excerpt": summary[:400],
        "content": summary,           # крок 7 замінить на повний текст із url
        "category": item.get("category") or pr.detect_category(title + " " + summary),
        "geo": geo,
        "image": None,
        "image_type": "none",         # уточнимо в enqueue (og:image → source)
        "image_credit": None,
        "source": _domain(url),
        "sourceUrl": url,
        "exclusive": False,
        "ts": _parse_date(item.get("published_date")),
        "summary": summary,
    }


def _domain(url: str) -> str:
    import urllib.parse
    return urllib.parse.urlparse(url).netloc.replace("www.", "")


def _parse_date(s) -> int:
    if s:
        import datetime
        for fmt in ("%Y-%m-%dT%H:%M:%S", "%Y-%m-%d %H:%M", "%Y-%m-%d"):
            try:
                return int(datetime.datetime.strptime(str(s)[:len(fmt) + 2].strip(), fmt).timestamp() * 1000)
            except Exception:
                continue
    return int(time.time() * 1000)


def _sanitize_image_url(u):
    """Прибирає склеєні URL типу 'https://ahttps://img.../x.jpg' → бере останній http(s).
    Фіксить баг подвійного домену (напр. картинки Конкурента). Повертає url або None."""
    if not u or not isinstance(u, str):
        return None
    u = u.strip()
    idx = max(u.rfind("http://"), u.rfind("https://"))
    if idx > 0:
        u = u[idx:]
    return u if u.startswith(("http://", "https://")) else None


def fetch_wikimedia_image(query: str):
    """Шукає ВІДКРИТО-ЛІЦЕНЗОВАНЕ фото на Wikimedia Commons за запитом.
    Повертає (url, credit) або (None, None). Це ІЛЮСТРАЦІЯ (не фото конкретної події)."""
    import urllib.parse
    import urllib.request
    q = (query or "").strip()
    if not q:
        return None, None
    api = (
        "https://commons.wikimedia.org/w/api.php?action=query&format=json"
        "&generator=search&gsrnamespace=6&gsrlimit=6"
        "&gsrsearch=" + urllib.parse.quote(q) +
        "&prop=imageinfo&iiprop=url|extmetadata&iiurlwidth=1200"
    )
    if not pr.is_allowed_url(api):
        return None, None
    try:
        req = urllib.request.Request(api, headers={"User-Agent": pr.BROWSER_UA})
        with pr.SAFE_OPENER.open(req, timeout=12) as r:
            data = json.loads(r.read(400_000))
    except Exception:
        return None, None
    pages = (data.get("query") or {}).get("pages") or {}
    for p in sorted(pages.values(), key=lambda x: x.get("index", 99)):
        info = (p.get("imageinfo") or [{}])[0]
        url = info.get("thumburl") or info.get("url")
        if not url or not url.lower().split("?")[0].endswith((".jpg", ".jpeg", ".png", ".webp")):
            continue
        meta = info.get("extmetadata") or {}
        artist = pr.strip_html((meta.get("Artist") or {}).get("value", "")).strip()
        lic = pr.strip_html((meta.get("LicenseShortName") or {}).get("value", "")).strip()
        credit = " · ".join(x for x in (artist, lic) if x) or "Wikimedia Commons"
        return url, credit[:120]
    return None, None


# 🔴 21.08 — СХОДИНКИ ЗАПИТІВ, А НЕ ОДНА СПРОБА.
#
# Заміряно на живих даних: з 11 опублікованих статей кабінету 4 вийшли БЕЗ
# фото (`image_type='none'`) — «Радзивіллівські землі навколо Олики», «Ставок»,
# «Олика на зламі епох», «Дерно». Механізм пошуку працював і працює (три інші
# статті ілюстрацію отримали), але за КОНКРЕТНИМ запитом про мале село на
# Wikimedia Commons просто немає нічого.
#
# 🔑 Наслідок було видно на екрані: у стрічці Громади зникла велика перша
# картка. Правило `markLead` вимагає фото — і воно правильне («герой» без
# знімка це роздутий блок тексту), тож лікувати треба не правило, а порожнечу.
#
# ➡️ Тому запит не один, а сходинками — від найточнішого до найзагальнішого:
# спершу те, що попросив агент, далі назва статті, далі впізнавані місця самої
# громади. Замок Радзивіллів і костел — це те, що на Commons СПРАВДІ є, і для
# статті про село громади така ілюстрація чесна: це той самий край.
# 🛑 Останньою сходинкою НЕ ставимо щось віддалене («Волинь», «Україна»): фото
# випадкового місця під статтею про Ставок гірше за відсутність фото.
ЗАПАСНІ_ЗАПИТИ = [
    "Olyka Castle",              # замок Радзивіллів — головна пам'ятка громади
    "Olyka Holy Trinity church", # костел Пресвятої Трійці (1635-40)
    "Olyka",                     # саме містечко
]


def _ілюстрація(a: dict):
    """Шукає ілюстрацію сходинками. Повертає (url, credit) або (None, None)."""
    спроби = [a.get("image_query"), a.get("title")] + ЗАПАСНІ_ЗАПИТИ
    for q in спроби:
        q = (q or "").strip()
        if not q:
            continue
        try:
            img, credit = fetch_wikimedia_image(q)
        except Exception:
            img, credit = None, None
        if img:
            return img, credit
    return None, None


def _enrich(a: dict):
    """Збагачує статтю фото/повним текстом: оригінал → Wikimedia-ілюстрація;
    курована → реальне фото зі сторінки видавця + повний текст."""
    if a.get("original"):
        if not a.get("image"):
            img, credit = _ілюстрація(a)
            if img:
                a["image"] = _sanitize_image_url(img)
                a["image_type"] = "illustration"
                a["image_credit"] = credit
            else:
                a["image_type"] = "none"
    else:
        src = a.get("sourceUrl")
        # 🔑 27.08 — ОДИН запит замість двох: `fetch_article_page` віддає пару
        # (тіло, обкладинка) з ТОГО САМОГО супу. Доти ми качали сторінку двічі —
        # окремо заради тексту і окремо заради `og:image`.
        try:
            full, cover, _ = pr.fetch_article_page(src)
        except Exception:
            full, cover = None, ""
        if full and len(full) > len(a.get("content") or ""):
            a["content"] = full
        if not a.get("image"):
            # 🔴 27.08 — ОБКЛАДИНКУ МІРЯЄМО, А НЕ ЛИШЕ БЕРЕМО. Скарга Вови:
            # «чому фотографія в такій поганій якості?». Модалка показує фото на
            # всю ширину (~358 CSS-точок × щільність 3 ≈ 1074 пікселі), а ми
            # ставили `og:image` будь-якого розміру — вужчий файл браузер
            # розтягує. `best_cover` лишає вибір видавця, якщо пікселів
            # вистачає, і лише інакше шукає ширше фото в тілі статті.
            try:
                обкладинка = cover or pr.fetch_og_image(src) or ""
                обкладинка = pr.best_cover(обкладинка, a.get("content") or "")
                a["image"] = _sanitize_image_url(обкладинка) if обкладинка else None
            except Exception:
                a["image"] = None
        a["image_type"] = "source" if a.get("image") else "none"


def _sink_draft(a: dict):
    """Пише статтю як ЧЕРНЕТКУ: кабінет (Supabase cms_articles) якщо є ключ,
    інакше — у файл editor_drafts.json (тримається, НЕ авто-публікується)."""
    if _EDITOR_OK and os.environ.get("SUPABASE_SERVICE_ROLE_KEY"):
        d = Draft(
            title=a.get("title", ""), lead=a.get("excerpt", ""), content=a.get("content", ""),
            category=a.get("category") or "Громада", geo="Громада", date="", kind="news",
            status="draft", image=a.get("image"), image_type=a.get("image_type", "none"),
            image_credit=a.get("image_credit"),
            source_urls=list(a.get("sources") or ([a["sourceUrl"]] if a.get("sourceUrl") else [])),
        )
        CabinetSink().save(d)
    else:
        arr = []
        if EDITOR_DRAFTS_PATH.exists():
            try:
                arr = json.loads(EDITOR_DRAFTS_PATH.read_text(encoding="utf-8"))
            except Exception:
                arr = []
        row = {k: a.get(k) for k in ("title", "excerpt", "content", "category", "image",
                                     "image_type", "image_credit", "source", "sourceUrl",
                                     "sources", "original")}
        row.update({"geo": "Громада", "type": "news", "status": "draft",
                    "created_ts": int(time.time() * 1000)})
        arr.insert(0, row)
        EDITOR_DRAFTS_PATH.write_text(json.dumps(arr, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  ✎ чернетка у файл (нема ключа кабінету): {a.get('title')}")


# ── ІСТОРІЯ → ПЛАН СПІЛЬНОТИ (а не чернетка новини) ─────────────────────────

def _мітка_теми(назва: str) -> str:
    """Стабільний id теми з її назви — дзеркало `_мітка` в `editor/sources/plan.py`.

    🔑 Саме СТАБІЛЬНИЙ, а не порядковий номер: інакше переставлені записи в плані
    прочитались би як нові теми, і спільнота отримала б той самий пост удруге."""
    сухо = "".join(ch if ch.isalnum() or ch == " " else "" for ch in (назва or "").lower())
    return "hist:" + "-".join(сухо.split()[:4])[:48]


# 🔴 28.08 — ВІДСІЮЄМО ЗАГАЛЬНЕ ЗНАННЯ, ПОДАНЕ ЯК МІСЦЕВИЙ ФАКТ.
# Знайдено читанням першого ж зібраного плану: серед восьми конкретних, датованих
# рядків про Личани стояв ось такий —
#   «Як і більшість сіл Волині, Личани мають давню історію, повʼязану з
#    Галицько-Волинським князівством, а пізніше — з Великим князівством Литовським».
# Це правда про Волинь узагалі і НЕ факт про Личани. Тон-файл спільноти таке прямо
# забороняє, але писар бачить лише рядки `facts` — тобто заборона в голосі його не
# рятує, якщо саме така стрічка вже лежить у плані.
# 🔑 Тому відсів СТРУКТУРНИЙ, а не прохання в промті: рядок із такою зв'язкою не
# доходить до писаря взагалі. Це той самий підхід, що й «писар бачить ЛИШЕ facts».
# ⚠️ Ознака навмисно вузька — зв'язки порівняння й здогаду («як і більшість»,
# «ймовірно», «як відомо»). Слова на кшталт «зазвичай» усередині справжнього факту
# не чіпаємо: за надто широкої ознаки ми викидали б перевірені твердження.
_ЗАГАЛЬНІ_ЗВОРОТИ = re.compile(
    r"(?i)\b(як і (більшість|решта|інші)|як відомо|ймовірно|мабуть|очевидно,|"
    r"як і в (багатьох|більшості)|подібно до (більшості|інших))")


def факт_загальний(рядок: str) -> bool:
    """Чи це загальне знання під виглядом місцевого факту."""
    return bool(_ЗАГАЛЬНІ_ЗВОРОТИ.search(рядок or ""))


def _факти_з_тексту(текст: str, межа: int = 8) -> list:
    """Ріжемо матеріал на окремі твердження. Кожне з них писар побачить окремим
    рядком і зможе взяти або не взяти — але не зможе додати своє."""
    вихід = []
    for шматок in (текст or "").replace("\n", " ").split("."):
        ш = " ".join(шматок.split())
        if len(ш) > 25:
            if факт_загальний(ш):
                print(f"  ✂ загальне знання, не факт: «{ш[:70]}…»")
            elif факт_недатоване_число(ш):
                # Число без року, подане як теперішнє. Викидаємо РЯДОК, а не
                # тему: решта фактів лишається, і пост виходить біднішим, але
                # правдивим. Це дешевше за спростування.
                print(f"  ✂ число без року, подане як сьогоднішнє: «{ш[:70]}…»")
            else:
                вихід.append(ш + ".")
        if len(вихід) >= межа:
            break
    return вихід


def history_plan_free_slots() -> int:
    """Скільки НЕНАПИСАНИХ тем ще влізе в план історичної спільноти.

    🛑 Рахуємо не довжину файлу, а саме ненаписані: тема, яку спільнота вже
    опублікувала, лишається в плані як історія і не має займати місце."""
    try:
        план = json.loads(HISTORY_PLAN_PATH.read_text(encoding="utf-8"))
    except Exception:
        return HISTORY_PLAN_KEEP
    try:
        зроблено = set(json.loads(HISTORY_STATE_PATH.read_text(encoding="utf-8")).get("done", []))
    except Exception:
        зроблено = set()
    чекають = [з for з in план.get("posts", []) if (з.get("id") or "") not in зроблено]
    return max(0, HISTORY_PLAN_KEEP - len(чекають))


def seed_history_plan(матеріали: list) -> int:
    """Кладе зібрані факти темами у план спільноти «Історія Громади».

    🔴 ЧОМУ НЕ ОДРАЗУ ПОСТ. Збирач фактів і писар — різні кроки навмисно. Писар
    (`brand_writer`) бачить ЛИШЕ рядки `facts` і голос спільноти; піти за межі
    переданого йому фізично немає звідки. Це технічна форма вимоги Вови
    «нічого не вигадувати», а не ще одне речення в промті.

    ⚠️ Дедуп подвійний: за id у самому плані і за памʼяттю вже написаних тем
    (`data/olyka_agent_state.json`). Друге обовʼязкове — теми з плану з часом
    прибирають, а памʼять лишається, і без неї опублікована історія повернулась
    би в чергу як нова.
    """
    if not матеріали:
        return 0
    try:
        план = json.loads(HISTORY_PLAN_PATH.read_text(encoding="utf-8"))
    except Exception as e:
        print(f"  ✗ план історичної спільноти не читається ({e}) — теми НЕ збережено")
        return 0
    try:
        зроблено = set(json.loads(HISTORY_STATE_PATH.read_text(encoding="utf-8")).get("done", []))
    except Exception:
        зроблено = set()

    посты = план.setdefault("posts", [])
    наявні = {(з.get("id") or "") for з in посты}
    додано = 0
    for a in матеріали:
        назва = (a.get("title") or "").strip()
        факти = _факти_з_тексту(a.get("content", ""))
        джерела = [j for j in (a.get("sources") or []) if j]
        pid = _мітка_теми(назва)
        # 🛑 Тема без фактів або без джерел не кладеться взагалі. Це не
        # перестраховка: саме порожні `facts` пропускає й сам конвеєр, тож інакше
        # ми накопичували б у плані записи, які ніколи не стануть постом.
        if not назва or not факти or not джерела:
            print(f"  ✂ пропускаю «{назва[:50]}»: фактів {len(факти)}, джерел {len(джерела)}")
            continue
        if pid in наявні or pid in зроблено:
            print(f"  ↺ тема вже є: {pid}")
            continue
        посты.append({
            "id": pid,
            "kind": "brand",
            "topic": назва,
            "facts": факти,
            "sources": джерела,
            "note": ("Історичний пост. Пиши ЛИШЕ з фактів вище — дат, імен і пояснень "
                     "походження назв, яких там немає, вигадувати не можна. Невпевненість "
                     "джерела («ймовірно», «за переказами») зберігай. 🔴 Якщо у факті "
                     "названо рік — НЕ ЗНІМАЙ його і не заміняй на «сьогодні»: число без "
                     "року читається як теперішнє, а воно може бути 25-річної давнини."),
        })
        наявні.add(pid)
        додано += 1
        print(f"  ✓ тема в план історії: {назва[:60]} ({len(факти)} фактів, {len(джерела)} джерел)")

    if додано:
        HISTORY_PLAN_PATH.write_text(json.dumps(план, ensure_ascii=False, indent=2) + "\n",
                                     encoding="utf-8")
    print(f"✓ тем у план «Історія Громади»: {додано}")
    return додано


def count_cabinet_drafts() -> int:
    """Скільки зараз чернеток у кабінеті — щоб домалювати НАПЕРЕД до MAX_DRAFTS_TOTAL.
    З ключем рахує в Supabase (cms_articles status=draft); без ключа — у файлі-fallback."""
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
    if key:
        import urllib.request
        req = urllib.request.Request(
            SUPA_URL + "/rest/v1/cms_articles?select=id&status=eq.draft",   # ВСЯ черга draft (не лише type=news): свято-чернетки теж рахуємо, щоб не було 16 (08.07)
            headers={"apikey": key, "Authorization": "Bearer " + key})
        try:
            with urllib.request.urlopen(req, timeout=20) as r:
                return len(json.loads(r.read().decode("utf-8")))
        except Exception as e:
            # Помилка рахунку → вважаємо кабінет ПОВНИМ (пропустимо прогін), щоб не переповнити й не палити API.
            print(f"⚠ не порахував чернетки в кабінеті ({e}) — пропускаю прогін (безпечно)")
            return MAX_DRAFTS_TOTAL
    if EDITOR_DRAFTS_PATH.exists():
        try:
            return len(json.loads(EDITOR_DRAFTS_PATH.read_text(encoding="utf-8")))
        except Exception:
            return 0
    return 0


def enqueue(new_articles: list, existing: list, cap: int = MAX_DRAFTS_TOTAL):
    """Готує знахідки Громади як ЧЕРНЕТКИ для кабінету Алли (ревʼю), НЕ авто-в-стрічку.

    Дедуп: спершу за словами (url+Jaccard) проти стрічки+памʼяті, потім семантичний
    (AI-кластер — та сама історія іншими словами; мʼякий, фейл-софт). Далі збагачення,
    запис у памʼять і чернетка → кабінет (ключ) / файл (fallback).
    Волинь/Україну/Світ дає RSS-парсер — сюди йде лише Громада.
    """
    mem_posts = load_memory().get("posts", [])
    pool = existing + mem_posts          # проти чого дедупимо: стрічка + історія постів

    seen_urls = {a.get("sourceUrl") for a in pool if a.get("sourceUrl")}
    seen_by_section: dict = {}
    for a in pool:
        if a.get("title"):
            pr.remember_title(pr.title_tokens(a["title"]),
                              pr.section_of(a.get("geo", "Громада")), seen_by_section)

    # 1) дешевий дедуп за словами → кандидати
    candidates = []
    for a in new_articles:
        src = a.get("sourceUrl")
        if src and src in seen_urls:
            continue
        section = pr.section_of(a.get("geo", "Громада"))
        tokens = pr.title_tokens(a.get("title", ""))
        if pr.is_dup_title(tokens, section, seen_by_section):
            continue
        candidates.append(a)
        if src:
            seen_urls.add(src)
        pr.remember_title(tokens, section, seen_by_section)

    # 2) семантичний дедуп (мʼякий, фейл-софт). Вимикач: env SEMANTIC_DEDUP=0.
    if _EDITOR_OK and candidates and os.environ.get("SEMANTIC_DEDUP", "1") != "0":
        try:
            candidates = cluster_duplicates(candidates, pool, label="Громада")
        except Exception as e:
            print(f"⚠ семантичний дедуп пропущено ({e}) — беру всіх кандидатів")

    # 3) кап: не більше `cap` чернеток за прогін (тримаємо ~MAX_DRAFTS_TOTAL у кабінеті)
    candidates = candidates[:max(0, cap)]

    # 4) збагачення + чернетка + памʼять
    drafted = 0
    for a in candidates:
        _enrich(a)
        a.pop("summary", None)
        a.pop("image_query", None)
        _sink_draft(a)
        record_memory(a)
        drafted += 1

    print(f"✓ чернеток Громади: {drafted} (у кабінет/файл — на ревʼю Аллі)")


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mission", help="лише одна місія")
    ap.add_argument("--dry-run", action="store_true", help="не викликати API — показати промпти")
    args = ap.parse_args()

    cfg = load_config()
    existing = load_existing()
    # для дедупу в промпті агент бачить опубліковане (памʼять інжектиться окремо в build_prompt)
    seen_pool = existing
    # Тримаємо ~MAX_DRAFTS_TOTAL готових чернеток у кабінеті НАПЕРЕД: рахуємо наявні,
    # домальовуємо лише скільки бракує (Алла опублікувала → агент долив). Повний кабінет = економія.
    slots = MAX_DRAFTS_TOTAL - count_cabinet_drafts()
    новини_повні = slots <= 0
    # 🔴 27.08 — ПОВНИЙ КАБІНЕТ БІЛЬШЕ НЕ ГЛУШИТЬ ІСТОРІЮ. Доти тут стояв `return`
    # на весь прогін. З появою другої місії це стало б прихованим звʼязком: черга
    # чернеток НОВИН вирішувала б, чи наповнюється спільнота «Історія Громади»,
    # хоча вона пише в іншу таблицю і має власний лічильник місця.
    if not args.dry_run and новини_повні:
        print(f"✓ у кабінеті вже ≥{MAX_DRAFTS_TOTAL} чернеток — новини цього прогону пропускаю (економія)")
    slots = max(1, slots)   # скільки нових просимо/створюємо цього прогону
    hist_slots = history_plan_free_slots()
    if not args.dry_run and hist_slots <= 0:
        print(f"✓ у плані «Історія Громади» вже ≥{HISTORY_PLAN_KEEP} ненаписаних тем — історію пропускаю")
    # active_missions — які місії реально ганяємо (Волинь/Україна-Світ вимкнено: їх дає RSS).
    # --mission перекриває. Fallback (нема ключа в конфізі) — усі, як було.
    missions = [args.mission] if args.mission else (cfg.get("active_missions") or list(cfg["missions"].keys()))

    # ЗАПОБІЖНИК (місячний): якщо цього місяця вже витрачено ≥ стелі — не запускаємось.
    if not args.dry_run:
        spent_month = month_spend_usd()
        if spent_month >= MAX_MONTH_COST_USD:
            print(f"⛔ місячна стеля ${MAX_MONTH_COST_USD} досягнута (вже ${spent_month}) — прогін пропущено (блокер витрат)")
            return
        spent_day = day_spend_usd()
        if spent_day >= MAX_DAY_COST_USD:
            print(f"⛔ добова стеля ${MAX_DAY_COST_USD} досягнута (вже ${spent_day} за 24 год) — прогін пропущено (блокер витрат)")
            return

    found = []        # новини → чернетки в кабінет
    історичне = []    # історія → теми з фактами в план спільноти
    run_cost = 0.0   # ЗАПОБІЖНИК (на прогін): сума витрат усіх викликів цього запуску
    for name in missions:
        if name not in cfg["missions"]:
            print(f"⚠ невідома місія: {name}")
            continue
        це_історія = (name == HISTORY_MISSION)
        # Кошик і стеля — свої в кожної місії. Саме тут проходить межа між
        # «що відбувається зараз» і «що тут було колись».
        кошик = історичне if це_історія else found
        # 🔴 28.08, РЕГРЕСІЯ ВИПРАВЛЕНА — І ВОНА КОШТУВАЛА ГРОШЕЙ ($0.33 живого прогону).
        # Коли новини й історію розчіплювали, тут лишилось просто `slots`. А нижче стоїть
        # `slots = max(1, slots)`, тож при ПОВНОМУ кабінеті ліміт виходив 1: місія
        # зверталась до моделі, платила — і результат викидався розкладкою наприкінці.
        # 🔑 До розчеплення такого не могло статись: тоді на повному кабінеті функція
        # робила `return` ще до першого виклику. Розчеплюючи запобіжник на дві гілки,
        # я переніс ВИХІД, але не переніс саму ЕКОНОМІЮ.
        # ➡️ Урок: коли запобіжник ділиться надвоє, перевіряй не «чи він ще спрацьовує»,
        # а «чи він і далі спиняє ДО витрати».
        ліміт = (min(HISTORY_PER_RUN, hist_slots) if це_історія
                 else (0 if новини_повні else slots))
        if not args.dry_run and ліміт <= 0:
            continue
        if args.dry_run:
            prompt = build_prompt(name, cfg, seen_pool, target=min(BATCH_MAX, slots))
            print(f"\n===== ПРОМПТ [{name}] (пакет ≤{BATCH_MAX}) =====\n{prompt}\n")
            continue

        # ПАКЕТИ: 10 статей одним викликом модель не тягне (з 10 виходило 3) —
        # просимо по ≤BATCH_MAX за виклик, поки не набрали slots. Захисти від
        # зациклення/пропалу: стеля прогону $ + ліміт пакетів + стоп на порожньому пакеті.
        batch_no = 0
        while len(кошик) < ліміт and batch_no < 4:
            if run_cost >= MAX_RUN_COST_USD:
                print(f"⛔ стеля прогону ${MAX_RUN_COST_USD} досягнута (вже ${round(run_cost,4)}) — пакети зупинено (блокер)")
                break
            batch_no += 1
            target = min(BATCH_MAX, ліміт - len(кошик))
            # У промпт дедупу віддаємо і щойно написане цього прогону (existing + found) —
            # щоб пакет 2 не повторив теми пакета 1.
            prompt = build_prompt(name, cfg, seen_pool + found + історичне, target=target)
            print(f"→ місія {name}, пакет {batch_no}: пишу {target}…")
            raw, usage, ok = call_agent(prompt)
            items = extract_json_array(raw)
            arts = [x for x in (item_to_article(i) for i in items) if x]
            print(f"  {name} №{batch_no}: знайдено {len(items)}, валідних {len(arts)} (ok={ok})")
            run_cost += record_spend(
                f"{name} №{batch_no}", usage, len(arts),
                note=("мережевий збій — можливе списання server-side" if not ok else ("" if raw else "агент нічого не повернув"))
            ) or 0
            if not ok:
                # Перерваний мережею виклик: Anthropic міг списати server-side, а usage=0 →
                # додаємо оцінку «підозра на списання» щоб breaker бачив реальний ризик.
                run_cost += SUSPECT_CHARGE_USD
                print(f"  ⚠ мережевий збій — +${SUSPECT_CHARGE_USD} оцінка до breaker; НЕ переписую промпт (idempotent backoff уже був у call_agent)")

            # САМО-РЕМОНТ: текст ПРИЙШОВ (ok) але 0 валідних → РІВНО ОДИН повтор з переписаним
            # запитом. При мережевому збої (not ok) — НЕ переписуємо (уникаємо платного подвійного виклику).
            if ok and not arts and run_cost < MAX_RUN_COST_USD:
                print(f"  ↻ 0 валідних (текст прийшов) — переписую запит (менше, коротше, суворий JSON) і повторюю (1 раз)…")
                retry_prompt = build_prompt(name, cfg, seen_pool + found + історичне, target=min(3, target)) + (
                    "\n\n⚠️ ПОВТОР: попередня відповідь була невалідна/обрізана. Тепер:\n"
                    f"• поверни РІВНО валідний JSON-масив (починається '[' і закінчується ']');\n"
                    f"• МАКСИМУМ {min(3, target)} статті; кожна КОРОТКА (лід + 2-3 стислі абзаци);\n"
                    "• без пояснень до/після масиву; не обривай на півслові."
                )
                raw, usage, ok = call_agent(retry_prompt)
                items = extract_json_array(raw)
                arts = [x for x in (item_to_article(i) for i in items) if x]
                print(f"  {name} №{batch_no} (повтор): знайдено {len(items)}, валідних {len(arts)}")
                run_cost += record_spend(f"{name} №{batch_no} (повтор)", usage, len(arts), note=("" if raw else "повтор порожній")) or 0

            if not arts:
                # І основний виклик, і повтор порожні → тем більше нема або відповіді биті.
                # Далі не палимо — наступний прогін крону доллє.
                print(f"  ✋ пакет {batch_no} порожній — зупиняю пакети цього прогону")
                break
            кошик.extend(arts)
            time.sleep(1)

    if not args.dry_run:
        print(f"💰 разом за прогін: ${round(run_cost, 4)} (стеля ${MAX_RUN_COST_USD})")

    if args.dry_run:
        return
    if found:
        # Сюди вже не потрапляє нічого при повному кабінеті: новинна місія в такому разі
        # не запускається взагалі (див. `ліміт` вище). Другої перевірки тут свідомо НЕМАЄ —
        # вона маскувала б повернення тієї самої вади: результат є, гроші витрачені, а
        # мовчазний `if` вдає, що все гаразд.
        enqueue(found, existing, cap=slots)   # → чернетки в кабінет (ревʼю), не більше ніж бракує до 10
    if історичне:
        # Історія НЕ йде в кабінет новин: вона стає темою з фактами в плані
        # спільноти, і пост із неї пише конвеєр `editor/` голосом «Історії Громади».
        додано = seed_history_plan(історичне)
        # У памʼять пишемо лише те, що справді лягло в план: інакше тема
        # вважалась би написаною, а спільнота її ніколи б не побачила.
        if додано:
            for a in історичне[:додано]:
                record_memory(a)
    if not found and not історичне:
        print("Агент нічого не повернув.")


if __name__ == "__main__":
    main()
