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
import sys
import json
import time
import argparse
from pathlib import Path

# Перевикористовуємо машинерію парсера (дедуп/ліміти/баланс/повний текст)
sys.path.insert(0, str(Path(__file__).resolve().parent))
import parse_rss as pr  # noqa: E402

CONFIG_PATH = Path(__file__).resolve().parent / "hromada_config.json"
QUEUE_PATH = Path("data/news_queue.json")   # чергa підготовлених статей (крапельна публікація)
MODEL = "claude-sonnet-5"            # рішення Роми: Sonnet (якісна курація)
WEB_SEARCH_TOOL = "web_search_20250305"
MAX_SEARCHES_PER_MISSION = 6        # обмеження веб-пошуків на місію (контроль вартості; економно під малий бюджет)
API_URL = "https://api.anthropic.com/v1/messages"

# Скільки статей просимо в агента за місію — З ЗАПАСОМ (публікуються крапельно).
TARGET_PER_MISSION = {"Громада": 12, "Волинь": 8, "Україна та світ": 10}

QUEUE_MAX_SIZE = 30            # не тримаємо в черзі більше — щоб не застоювалась
QUEUE_MAX_AGE_DAYS = 3        # статті старші за N днів у черзі відкидаємо (несвіжі)


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


def load_queue() -> list:
    if QUEUE_PATH.exists():
        try:
            return json.loads(QUEUE_PATH.read_text(encoding="utf-8"))
        except Exception as e:
            print(f"⚠ читання news_queue.json: {e}")
    return []


def save_queue(queue: list):
    QUEUE_PATH.write_text(json.dumps(queue, ensure_ascii=False, indent=2), encoding="utf-8")


def recent_titles_for(existing: list, geos: list, limit: int = 40) -> list:
    """Заголовки+анонси наявних статей потрібних гео — щоб агент не дублював (дедуп за змістом)."""
    items = [a for a in existing if a.get("geo") in geos]
    items.sort(key=lambda a: a.get("ts", 0), reverse=True)
    return [f"- {a.get('title','')} ({a.get('summary') or a.get('excerpt','')[:80]})"
            for a in items[:limit]]


# ── Побудова промпту місії ───────────────────────────────────────────────────

def build_prompt(mission_name: str, cfg: dict, existing: list) -> str:
    m = cfg["missions"][mission_name]
    target = TARGET_PER_MISSION.get(mission_name, 6)
    schema = cfg["output_schema"]

    if mission_name == "Громада":
        h = cfg["hromada"]
        villages = ", ".join(h["villages"])
        body = (
            f"Ти — редактор локального медіа про {h['name']} ({h['district']}, {h['oblast']}).\n"
            f"Адмінцентр — {h['center']} ({h['center_status']}). Села громади: {villages}.\n\n"
            f"ЗАВДАННЯ: через веб-пошук знайди {target} НАЙСВІЖІШИХ цікавих новин/статей про громаду.\n"
            f"БАЛАНС ОБОВ'ЯЗКОВО ~50/50: половина про Олику (центр), половина про СЕЛА громади "
            f"(явно шукай за назвами сіл — інакше все перекоситься на Олику).\n"
            f"Теми: {', '.join(m['themes'])}.\n"
            f"Приклади запитів (центр): {'; '.join(m['keywords_center'][:6])}.\n"
            f"Приклади запитів (села): {'; '.join(m['keywords_villages'][:6])}.\n"
            f"geo у відповіді: завжди \"Громада\"."
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

    existing_geos = {"Громада": ["Громада", "Олика"], "Волинь": ["Волинь"],
                     "Україна та світ": ["Україна", "Світ"]}[mission_name]
    seen = recent_titles_for(existing, existing_geos)
    seen_block = ("\n\nВЖЕ У СТРІЧЦІ (НЕ дублюй за змістом):\n" + "\n".join(seen)) if seen else ""

    schema_str = json.dumps(schema, ensure_ascii=False, indent=2)
    return (
        f"{body}{seen_block}\n\n"
        "ПРАВИЛА ВІДПОВІДІ:\n"
        "1. Використай інструмент веб-пошуку кілька разів, щоб знайти реальні свіжі матеріали.\n"
        "2. url МАЄ бути справжнім посиланням на сторінку статті у видавця (не пошуковик, не агрегатор).\n"
        "3. Тільки реально релевантне і свіже. Краще менше, але якісно.\n"
        "4. Поверни ЛИШЕ JSON-масив об'єктів (без пояснень до/після). Схема об'єкта:\n"
        f"{schema_str}"
    )


# ── Виклик Anthropic API з web_search ────────────────────────────────────────

def call_agent(prompt: str) -> str:
    """Повертає фінальний текст асистента (очікуємо JSON-масив). Порожній рядок при помилці."""
    import urllib.request
    api_key = os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        print("✗ немає ANTHROPIC_API_KEY — пропускаю виклик")
        return ""
    payload = {
        "model": MODEL,
        "max_tokens": 4096,
        "tools": [{"type": WEB_SEARCH_TOOL, "name": "web_search",
                   "max_uses": MAX_SEARCHES_PER_MISSION}],
        "messages": [{"role": "user", "content": prompt}],
    }
    req = urllib.request.Request(
        API_URL, data=json.dumps(payload).encode("utf-8"),
        headers={
            "x-api-key": api_key,
            "anthropic-version": "2023-06-01",
            "content-type": "application/json",
        })
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            resp = json.loads(r.read().decode("utf-8"))
    except Exception as e:
        print(f"✗ виклик API: {e}")
        return ""
    # Збираємо всі text-блоки фінальної відповіді
    parts = [b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text"]
    return "\n".join(parts).strip()


def extract_json_array(text: str):
    """Витягує перший JSON-масив із тексту відповіді. Повертає list або []."""
    if not text:
        return []
    # прибираємо можливі ```json ... ``` огортки
    t = text.strip()
    if "```" in t:
        import re
        m = re.search(r"```(?:json)?\s*(\[.*?\])\s*```", t, re.S)
        if m:
            t = m.group(1)
    start = t.find("[")
    end = t.rfind("]")
    if start == -1 or end == -1 or end < start:
        return []
    try:
        data = json.loads(t[start:end + 1])
        return data if isinstance(data, list) else []
    except Exception as e:
        print(f"✗ парсинг JSON відповіді: {e}")
        return []


# ── Перетворення знахідок у статті + мердж ────────────────────────────────────

def item_to_article(item: dict) -> dict | None:
    """Валідовує знахідку агента і будує dict статті (без id/added_ts — їх додає merge)."""
    url = (item.get("url") or "").strip()
    title = pr.strip_html(item.get("title", "")).strip()
    geo = (item.get("geo") or "").strip()
    if not url or not title or geo not in ("Громада", "Волинь", "Україна", "Світ"):
        return None
    if not url.startswith(("http://", "https://")) or "google.com/search" in url:
        return None
    summary = pr.strip_html(item.get("summary", "")).strip()
    return {
        "title": title,
        "excerpt": summary[:400],
        "content": summary,           # крок 7 замінить на повний текст із url
        "category": item.get("category") or pr.detect_category(title + " " + summary),
        "geo": geo,
        "image": None,
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


def enqueue(new_articles: list, existing: list):
    """Кладе знахідки у ЧЕРГУ (data/news_queue.json), не в стрічку.

    Агент готує ЗАПАС; публікатор (publish_queue.py) потім викладає крапельно.
    Дедуп проти вже опублікованих (articles.json) І проти вже наявних у черзі.
    Повний текст дотягуємо тут (у черзі статті вже готові до публікації).
    Чистимо старе (>QUEUE_MAX_AGE_DAYS) і тримаємо не більше QUEUE_MAX_SIZE найсвіжіших.
    """
    queue = load_queue()

    # Що вже бачили — і в стрічці, і в черзі (щоб не дублювати)
    seen_urls = {a.get("sourceUrl") for a in existing + queue if a.get("sourceUrl")}
    seen_by_section: dict = {}
    for a in existing + queue:
        if a.get("title"):
            pr.remember_title(pr.title_tokens(a["title"]), pr.section_of(a.get("geo", "")), seen_by_section)

    added = 0
    for a in new_articles:
        if a["sourceUrl"] in seen_urls:
            continue
        section = pr.section_of(a["geo"])
        tokens = pr.title_tokens(a["title"])
        if pr.is_dup_title(tokens, section, seen_by_section):
            continue
        # повний текст зі справжнього url (якщо не вдалось — лишаємо анонс)
        try:
            full = pr.fetch_full_article(a["sourceUrl"])
        except Exception:
            full = None
        if full and len(full) > len(a.get("content") or ""):
            a["content"] = full
        a.pop("summary", None)
        a["queued_ts"] = int(time.time() * 1000)   # коли потрапило в чергу
        queue.append(a)
        seen_urls.add(a["sourceUrl"])
        pr.remember_title(tokens, section, seen_by_section)
        added += 1

    # Прибираємо застарілі (за датою публікації) і тримаємо ліміт найсвіжіших
    cutoff = int(time.time() * 1000) - QUEUE_MAX_AGE_DAYS * 86400_000
    queue = [q for q in queue if q.get("ts", 0) >= cutoff]
    queue.sort(key=lambda q: q.get("ts", 0), reverse=True)
    queue = queue[:QUEUE_MAX_SIZE]

    save_queue(queue)
    print(f"✓ черга: +{added} нових, усього в черзі {len(queue)} (чекають публікації)")


# ── main ─────────────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--mission", help="лише одна місія")
    ap.add_argument("--dry-run", action="store_true", help="не викликати API — показати промпти")
    args = ap.parse_args()

    cfg = load_config()
    existing = load_existing()
    # для дедупу агент має бачити і опубліковане, і те що вже чекає в черзі
    seen_pool = existing + load_queue()
    missions = [args.mission] if args.mission else list(cfg["missions"].keys())

    found = []
    for name in missions:
        if name not in cfg["missions"]:
            print(f"⚠ невідома місія: {name}")
            continue
        prompt = build_prompt(name, cfg, seen_pool)
        if args.dry_run:
            print(f"\n===== ПРОМПТ [{name}] =====\n{prompt}\n")
            continue
        print(f"→ місія {name}: пошук…")
        raw = call_agent(prompt)
        items = extract_json_array(raw)
        arts = [x for x in (item_to_article(i) for i in items) if x]
        print(f"  {name}: знайдено {len(items)}, валідних {len(arts)}")
        found.extend(arts)
        time.sleep(1)

    if args.dry_run:
        return
    if found:
        enqueue(found, existing)     # у чергу, не в стрічку (публікатор викладе крапельно)
    else:
        print("Агент нічого не повернув.")


if __name__ == "__main__":
    main()
