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
PRICE_IN, PRICE_OUT = 3.0, 15.0
PRICE_CACHE_WRITE, PRICE_CACHE_READ = 3.75, 0.30
PRICE_SEARCH_1K = 10.0


def _load() -> dict:
    if SPEND_PATH.exists():
        try:
            return json.loads(SPEND_PATH.read_text(encoding="utf-8"))
        except Exception:
            pass
    return {"runs": [], "totals": {"cost_usd": 0, "runs": 0, "web_searches": 0}, "months": {}}


# Ціни за 1 млн токенів. Ключ — рядок моделі, який іде в запит.
PRICES = {
    "claude-sonnet-5": {"in": PRICE_IN, "out": PRICE_OUT,
                        "cache_write": PRICE_CACHE_WRITE, "cache_read": PRICE_CACHE_READ},
    "claude-opus-5":   {"in": 5.0, "out": 25.0,
                        "cache_write": 6.25, "cache_read": 0.50},
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


def budget_block() -> str:
    """Порожній рядок = можна витрачати. Інакше — причина відмови людською мовою.

    🛑 Кличеться ПЕРЕД викликом моделі, а не після. Перевірка після виклику
    рахувала б гроші, які вже пішли."""
    за_місяць = month_spend_usd()
    if за_місяць >= MAX_MONTH_USD:
        return (f"місячна стеля ${MAX_MONTH_USD} досягнута (вже ${за_місяць}) — "
                f"до 1 числа виклики моделі пропускаються")
    за_добу = day_spend_usd()
    if за_добу >= MAX_DAY_USD:
        return (f"добова стеля ${MAX_DAY_USD} досягнута (вже ${за_добу} за 24 год) — "
                f"чекаю, поки вікно зсунеться")
    return ""
