"""Семантичний дедуп — AI-кластер «та сама подія іншими словами».

Один виклик Anthropic на прогін: даємо НОВІ кандидати + НАЯВНІ (стрічка/памʼять),
модель каже, які НОВІ є повтором уже наявного (або одне одного). Ловить те, що
дедуп-за-словами-заголовка (Jaccard) не бачить: інший заголовок — та сама історія.

МʼЯКИЙ за замовчуванням: дублікат = ЛИШЕ та сама реальна подія/історія, НЕ просто
спільна тема (дві різні події однієї теми — не дублікати). Щоб не заважати AI.

ФЕЙЛ-СОФТ: без ANTHROPIC_API_KEY або за будь-якої помилки/некоректної відповіді —
повертає НОВІ кандидати без змін (нічого не дропає). Жива стрічка не має ламатись.

Витрати рахує spend.record (той самий data/ai_spend.json, що й агент).
"""
import json
import os
import urllib.error
import urllib.request

from editor.core import spend

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-5"
MAX_RECENT = 120         # скільки наявних показувати (обмеження токенів)
MAX_TOKENS = 1024        # відповідь коротка (лише список номерів)


def _brief(item: dict, n: int) -> str:
    title = (item.get("title") or "").strip()
    lead = (item.get("summary") or item.get("excerpt") or item.get("lead") or "").strip()
    return f"{n}: {title}" + (f" — {lead[:120]}" if lead else "")


def _call(prompt: str, api_key: str):
    """Мінімальний виклик Anthropic (без інструментів). Повертає (text, usage) або (None, usage)."""
    usage = {"input_tokens": 0, "output_tokens": 0,
             "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
             "web_search_requests": 0}
    payload = {"model": MODEL, "max_tokens": MAX_TOKENS,
               "messages": [{"role": "user", "content": [{"type": "text", "text": prompt}]}]}
    req = urllib.request.Request(
        API_URL, data=json.dumps(payload).encode("utf-8"),
        headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                 "content-type": "application/json"})
    try:
        resp = json.loads(urllib.request.urlopen(req, timeout=90).read().decode("utf-8"))
    except urllib.error.HTTPError as e:
        print(f"✗ dedup API HTTP {e.code}: {e.read().decode('utf-8','replace')[:200]}")
        return None, usage
    except Exception as e:
        print(f"✗ dedup API: {e}")
        return None, usage
    u = resp.get("usage") or {}
    for k in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
        usage[k] += u.get(k, 0)
    text = "\n".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text").strip()
    return text, usage


def _parse_dupes(text: str, count: int) -> set:
    """Витягує {"duplicates":[...]} → множина 1-based індексів НОВИХ у межах [1..count]."""
    if not text:
        return set()
    try:
        obj = json.loads(text[text.find("{"):text.rfind("}") + 1])
        return {int(i) for i in obj.get("duplicates", []) if 1 <= int(i) <= count}
    except Exception:
        print("✗ dedup: відповідь не JSON — нічого не дропаю (фейл-софт)")
        return set()


def cluster_duplicates(new_items: list, recent_items: list,
                       api_key: str = None, label: str = "dedup") -> list:
    """Повертає НОВІ кандидати без явних дублів (та сама історія, що вже є / між собою).

    Фейл-софт: нема ключа / помилка / порожня відповідь → повертає new_items як є.
    """
    if not new_items:
        return new_items
    api_key = api_key or os.environ.get("ANTHROPIC_API_KEY")
    if not api_key:
        return new_items                      # без ключа не дедупимо (фейл-софт)

    recent = [r for r in recent_items if (r.get("title") or "").strip()][:MAX_RECENT]
    recent_block = "\n".join(_brief(r, i + 1) for i, r in enumerate(recent)) or "(порожньо)"
    new_block = "\n".join(_brief(a, i + 1) for i, a in enumerate(new_items))

    prompt = (
        "Ти — редактор стрічки новин. Нижче НОВІ кандидати і вже НАЯВНІ (у стрічці/памʼяті).\n"
        "Знайди серед НОВИХ лише ті, що описують ТУ САМУ реальну подію/історію, що вже є "
        "серед НАЯВНИХ або серед раніших НОВИХ (навіть якщо заголовок інший, переказано інакше).\n"
        "ВАЖЛИВО: різні події спільної теми — НЕ дублікати (напр. дві різні толоки, дві різні "
        "історії різних сіл — лишай обидві). Дублікат — тільки якщо це буквально те саме.\n\n"
        f"НАЯВНІ:\n{recent_block}\n\nНОВІ:\n{new_block}\n\n"
        'Поверни ЛИШЕ JSON: {"duplicates":[номери НОВИХ, що є повтором]}. '
        'Якщо повторів нема — {"duplicates":[]}.'
    )
    text, usage = _call(prompt, api_key)
    try:
        spend.record(f"{label}:dedup", usage, 0)
    except Exception:
        pass
    if text is None:
        return new_items                      # помилка виклику → нічого не дропаю
    dupes = _parse_dupes(text, len(new_items))
    if not dupes:
        return new_items
    kept = [a for i, a in enumerate(new_items) if (i + 1) not in dupes]
    print(f"  🧠 семантичний дедуп: {len(new_items)}→{len(kept)} (прибрано {len(dupes)} явних повторів)")
    return kept
