"""Writer «ai_writer» — Anthropic пише коротку статтю про свято/подію
для стрічки «Шо в селі» + видає ТОЧНИЙ image_query українською (тест показав:
укр. запит на Wikimedia не гірший за англ., а для місцевого контенту — кращий;
поганий запит → чуже фото). Витрати рахує spend.record.

Без ANTHROPIC_API_KEY — fallback: чернетка з наявного опису свята
(щоб конвеєр можна було протестувати без ключа/балансу).
"""
import json
import os
import urllib.error
import urllib.request

from editor.core.registry import register
from editor.core.models import Draft
from editor.core import spend
from editor.writers.base import Writer

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-sonnet-5"


@register("writer", "ai_writer")
class AIWriter(Writer):
    def write(self, item, cfg):
        title = (item.get("title") or "").strip()
        desc = (item.get("description") or "").strip()
        date = item.get("date") or ""
        if not title:
            return None

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            print(f"  ⚠ без ключа — чернетка з опису: {title}")
            return Draft(title=title, lead=desc[:200], content=desc,
                         category=item.get("category") or "Свято", geo="Громада",
                         date=date, kind="holiday", status="draft",
                         image=item.get("image"),   # поважаємо куроване фото з holidays.json
                         image_type=("illustration" if item.get("image") else "none"),
                         image_query=item.get("image_query") or title,
                         meta={"no_ai": True, "days_until": item.get("days_until")})

        prompt = (
            "Ти — редактор локального медіа містечка Олика (Волинь). Напиши коротку теплу "
            "статтю про свято для стрічки «Шо в селі» — простою мовою для жителів громади.\n"
            f"Назва: {title}\nДата: {date}\nДовідка: {desc}\n\n"
            "Поверни ЛИШЕ JSON-обʼєкт (без пояснень до/після):\n"
            '{"lead":"1-2 речення анонсу","content":"3-5 коротких абзаців",'
            '"category":"Свято або Культура/Історія/Релігія","image_query":'
            '"ТОЧНИЙ короткий запит УКРАЇНСЬКОЮ для фото з Wikimedia — конкретний символ/об’єкт '
            'САМЕ ЦЬОГО свята, ГЕО- і СЕЗОННО-нейтральний (без зими/снігу якщо свято тепле), '
            'НЕ загальні/неоднозначні слова, НЕ повторюй той самий об’єкт для різних свят"}'
        )
        payload = {
            "model": MODEL, "max_tokens": 2048,
            "messages": [{"role": "user", "content": [
                {"type": "text", "text": prompt, "cache_control": {"type": "ephemeral"}}]}],
        }
        usage = {"input_tokens": 0, "output_tokens": 0,
                 "cache_read_input_tokens": 0, "cache_creation_input_tokens": 0,
                 "web_search_requests": 0}
        try:
            req = urllib.request.Request(
                API_URL, data=json.dumps(payload).encode("utf-8"),
                headers={"x-api-key": api_key, "anthropic-version": "2023-06-01",
                         "content-type": "application/json"})
            resp = json.loads(urllib.request.urlopen(req, timeout=120).read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            print(f"✗ writer API HTTP {e.code}: {e.read().decode('utf-8','replace')[:300]}")
            return None
        except Exception as e:
            print(f"✗ writer API: {e}")
            return None

        u = resp.get("usage") or {}
        for k in ("input_tokens", "output_tokens", "cache_read_input_tokens", "cache_creation_input_tokens"):
            usage[k] += u.get(k, 0)
        spend.record(f"holiday:{title[:28]}", usage, 1)

        text = "\n".join(b.get("text", "") for b in resp.get("content", []) if b.get("type") == "text").strip()
        try:
            obj = json.loads(text[text.find("{"):text.rfind("}") + 1])
        except Exception:
            print(f"✗ writer: відповідь не JSON ({title})")
            return None
        return Draft(
            title=title, lead=obj.get("lead") or desc[:200],
            content=obj.get("content") or desc,
            category=obj.get("category") or item.get("category") or "Свято",
            geo="Громада", date=date, kind="holiday", status="draft",
            image=item.get("image"),   # куроване фото holidays.json має пріоритет над wikimedia
            image_type=("illustration" if item.get("image") else "none"),
            image_query=(obj.get("image_query") or title),
            meta={"days_until": item.get("days_until")})
