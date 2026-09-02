"""Лічильник витрат Anthropic — пише у той самий data/ai_spend.json,
що читає адмінка. Тобто редактор і старий агент новин в одному лічильнику.

🔴 20.08 — ЦІНИ БІЛЬШЕ НЕ ЗАШИТІ ПІД ОДНУ МОДЕЛЬ. Було: константи Sonnet і
жорсткий рядок `"model": "claude-sonnet-5"` у кожному записі. З появою агента
спільноти, який пише на Opus 5 (вдвічі дорожчий за вхід і за вихід), той самий
лічильник МОВЧКИ занижував би витрати — а це саме те число, за яким Вова
вирішує, чи агент по кишені.
⚠️ Значення за замовчуванням лишились Sonnet-івські, тож усі наявні виклики
працюють без правок і рахують так само, як рахували."""
import json
import os
import time
from pathlib import Path

SPEND_PATH = Path("data/ai_spend.json")
KEEP_RUNS = 60
PRICE_SEARCH_1K = 10.0        # веб-пошук: $10 за 1000 запитів, від моделі не залежить


def _load() -> dict:
    if SPEND_PATH.exists():
        try:
            return json.loads(SPEND_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"runs": [], "totals": {"cost_usd": 0, "runs": 0, "web_searches": 0}, "months": {}}


def _ціни(вхід: float, вихід: float) -> dict:
    """Ціни однієї моделі за 1 млн токенів.

    🔑 КЕШ-ЦІНИ НЕ ВПИСУЄМО РУКАМИ. Anthropic задає їх множниками від ВХІДНОЇ:
    запис 1.25×, читання 0.1×. Вписані руками, вони розходяться з базовою — і це
    вже сталося: у таблиці стояли кеш-ціни Sonnet 4.6 біля рядка Sonnet 5.
    """
    return {"in": вхід, "out": вихід,
            "cache_write": round(вхід * 1.25, 4), "cache_read": round(вхід * 0.1, 4)}


# 🔴 02.09 — SONNET 5 РАХУВАВСЯ ЗА ЦІНАМИ SONNET 4.6, І ЦЕ БУЛО НЕ ДРІБНИЦЕЮ.
# У таблиці стояло $3/$15 — ціни попереднього покоління. Sonnet 5 коштує $2/$10.
# 📐 Наслідок вимірюваний: журнал ЗАВИЩУВАВ витрати на ~27% (пакет новин $0.309
# замість справжніх $0.227). Тобто всі рішення про бюджет — місячна стеля, добова,
# лінія темпу — ухвалювались за завищеними числами, і агент гальмував раніше, ніж
# мусив. Серпень «перевищив стелю $3.00» ($3.36) насправді закрився близько $2.45.
# ⚠️ Історичні записи в журналі НЕ переписуємо: там лежить `model` кожного прогону,
# тож перерахувати минуле можна будь-коли, а підміняти запис про платіж оцінкою — ні.
# Ціни за 1 млн токенів. Ключ — рядок моделі, який іде в запит.
PRICES = {
    "claude-sonnet-5": _ціни(2.0, 10.0),
    "claude-opus-5":   _ціни(5.0, 25.0),
}


def record(label: str, usage: dict, found: int, note: str = "", model: str = "claude-sonnet-5"):
    # Невідома модель — рахуємо за Sonnet і кажемо про це вголос. Мовчазний нуль
    # був би гіршим за приблизне число: витрати зникли б зі звіту.
    p = PRICES.get(model)
    if p is None:
        print(f"  ⚠ ціни для «{model}» невідомі — рахую за claude-sonnet-5")
        p = PRICES["claude-sonnet-5"]
    cost = round(
        usage.get("input_tokens", 0) / 1_000_000 * p["in"]
        + usage.get("output_tokens", 0) / 1_000_000 * p["out"]
        + usage.get("cache_read_input_tokens", 0) / 1_000_000 * p["cache_read"]
        + usage.get("cache_creation_input_tokens", 0) / 1_000_000 * p["cache_write"]
        + usage.get("web_search_requests", 0) / 1000 * PRICE_SEARCH_1K, 4)
    ts = int(time.time() * 1000)
    month = time.strftime("%Y-%m", time.gmtime())
    d = _load()
    d.setdefault("runs", []).insert(0, {
        "ts": ts, "mission": label, "model": model,
        "input_tokens": usage.get("input_tokens", 0), "output_tokens": usage.get("output_tokens", 0),
        "cache_read": usage.get("cache_read_input_tokens", 0),
        "cache_write": usage.get("cache_creation_input_tokens", 0),
        "web_searches": usage.get("web_search_requests", 0),
        "found": found, "cost_usd": cost, "note": note,
    })
    d["runs"] = d["runs"][:KEEP_RUNS]
    t = d.setdefault("totals", {"cost_usd": 0, "runs": 0, "web_searches": 0})
    t["cost_usd"] = round(t.get("cost_usd", 0) + cost, 4)
    t["runs"] = t.get("runs", 0) + 1
    t["web_searches"] = t.get("web_searches", 0) + usage.get("web_search_requests", 0)
    m = d.setdefault("months", {}).setdefault(month, {"cost_usd": 0, "runs": 0, "web_searches": 0})
    m["cost_usd"] = round(m["cost_usd"] + cost, 4)
    m["runs"] += 1
    m["web_searches"] += usage.get("web_search_requests", 0)
    d["updated_ts"] = ts
    SPEND_PATH.write_text(json.dumps(d, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"  💸 ${cost} ({label})")


# ── ЗАПОБІЖНИКИ ВИТРАТ ───────────────────────────────────────────────────────
# 🔴 20.08. До цього дня `spend.py` умів ЛИШЕ рахувати. Тобто конвеєр редактора
# (свята + агент спільноти) не мав жодної стелі: скільки б не витратив — ніхто
# не спиняв. У сусіда `scripts/ai_news_agent.py` стеля була з 08.07, і саме вона
# втримала витрати в межах; тут її просто забули.
#
# 🔑 ЖУРНАЛ ОДИН НА ВСІХ (`data/ai_spend.json`), тому й стеля спільна: новинний
# агент, свята і спільнота витрачають з ОДНОГО місячного кошика. Інакше три
# окремі ліміти по $4 давали б $12 — рівно те, чого Вова просив уникнути.
#
# ⚠️ ДЕННА СТЕЛЯ — це відповідь на пряме питання Вови «щоб не зʼїло за один
# день». Місячної недостатньо: $4 технічно можна витратити за одну добу, і
# баланс зникне до того, як хтось відкриє звіт.
MAX_MONTH_USD = float(os.environ.get("AI_MAX_MONTH_USD", "4.0"))
MAX_DAY_USD = float(os.environ.get("AI_MAX_DAY_USD", "1.20"))


def month_spend_usd() -> float:
    """Витрачено цього місяця — усіма агентами разом."""
    try:
        month = time.strftime("%Y-%m", time.gmtime())
        return float(_load().get("months", {}).get(month, {}).get("cost_usd", 0) or 0)
    except Exception:
        return 0.0


def day_spend_usd() -> float:
    """Витрачено сьогодні (UTC) — рахуємо по журналу прогонів.

    ⚠️ Журнал підрізається до KEEP_RUNS записів. Для добового вікна це не вада:
    щоб 60 записів не вкрили добу, треба робити понад 60 викликів на день — а це
    вже сценарій, який зупинить місячна стеля."""
    поріг = time.time() - 24 * 3600
    сума = 0.0
    for r in _load().get("runs", []):
        try:
            if float(r.get("ts", 0)) / 1000 >= поріг:
                сума += float(r.get("cost_usd", 0) or 0)
        except Exception:
            continue
    return round(сума, 4)


def mission_month_usd(prefix: str) -> float:
    """Скільки цього місяця витратив КОНКРЕТНИЙ агент.

    Розрізняємо за міткою запису: `olyka:*` — спільнота, `holiday:*` — свята,
    решта — новинний агент («Громада №1» тощо)."""
    if not prefix:
        return 0.0
    місяць = time.strftime("%Y-%m", time.gmtime())
    сума = 0.0
    for r in _load().get("runs", []):
        try:
            коли = time.strftime("%Y-%m", time.gmtime(float(r.get("ts", 0)) / 1000))
            if коли == місяць and str(r.get("mission", "")).startswith(prefix):
                сума += float(r.get("cost_usd", 0) or 0)
        except Exception:
            continue
    return round(сума, 4)


def mission_day_usd(prefix: str) -> float:
    """Скільки конкретний агент витратив за останні 24 год."""
    if not prefix:
        return 0.0
    поріг = time.time() - 24 * 3600
    сума = 0.0
    for r in _load().get("runs", []):
        try:
            if (float(r.get("ts", 0)) / 1000 >= поріг
                    and str(r.get("mission", "")).startswith(prefix)):
                сума += float(r.get("cost_usd", 0) or 0)
        except Exception:
            continue
    return round(сума, 4)


def budget_block(prefix: str = "", own_cap: float = 0.0, own_day_cap: float = 0.0) -> str:
    """Порожній рядок = можна витрачати. Інакше — причина відмови людською мовою.

    🛑 Кличеться ПЕРЕД викликом моделі, а не після. Перевірка після виклику
    рахувала б гроші, які вже пішли.

    🔴 20.08, зауваження Вови: «якщо ці $5 за 4 дні використаються — як тоді пости
    в стрічку писати?». Він побачив справжню ваду СПІЛЬНОГО кошика: новинний агент
    дорогий (наповнює кабінет пачками), а агент стрічки коштує центи — і при одній
    спільній стелі дорогий зʼїдає гроші, а дешевий і потрібний лишається ні з чим.
    ⚠️ Окремий ключ це НЕ лікує: гроші однаково з одного балансу. Лікує ОСОБИСТА
    КИШЕНЯ: у кожного агента свій місячний ліміт, і сума кишень = спільна стеля.
    Тепер новинний не може вибрати чужу частку, навіть якщо витратить свою повністю."""
    # 🔑 У КОГО Є ВЛАСНА КИШЕНЯ — того судимо ЛИШЕ по ній, і по місяцю, і по добі.
    # Спільні стелі до нього не застосовуємо СВІДОМО: інакше дорогий сусід, який
    # вибрав добу за один прогін, замикав би дешевого на 24 години — а це рівно
    # та вада, через яку кишені й заводились. Загальна сума все одно обмежена:
    # кишені підібрані так, що разом зі стелею новин вони не перевищують $4.
    if own_cap:
        своє = mission_month_usd(prefix)
        if своє >= own_cap:
            return (f"власна місячна кишеня ${own_cap} вичерпана (вже ${своє}) — "
                    f"цей агент чекає до 1 числа, решта агентів працюють далі")
        if own_day_cap:
            своє_добу = mission_day_usd(prefix)
            if своє_добу >= own_day_cap:
                return (f"власна добова кишеня ${own_day_cap} вичерпана "
                        f"(вже ${своє_добу} за 24 год) — чекаю, поки вікно зсунеться")
        return ""

    # Агент без власної кишені живе за спільними стелями.
    за_місяць = month_spend_usd()
    if за_місяць >= MAX_MONTH_USD:
        return (f"місячна стеля ${MAX_MONTH_USD} досягнута (вже ${за_місяць}) — "
                f"до 1 числа виклики моделі пропускаються")
    за_добу = day_spend_usd()
    if за_добу >= MAX_DAY_USD:
        return (f"добова стеля ${MAX_DAY_USD} досягнута (вже ${за_добу} за 24 год) — "
                f"чекаю, поки вікно зсунеться")
    return ""
