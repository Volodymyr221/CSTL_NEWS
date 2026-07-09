"""Sink «cabinet» — пише чернетку в Supabase cms_articles (status=draft),
щоб Алла бачила її в кабінеті. Контракт дзеркалить наявний sync_cms.py.
Потребує SUPABASE_SERVICE_ROLE_KEY (сервер-секрет). Без нього — підказка на queue.
Колонки звірені з sync_cms.cms_to_article: excerpt, image_type, type, status.
"""
import json
import os
import urllib.error
import urllib.request

from editor.core.registry import register
from editor.sinks.base import Sink

URL = os.environ.get("SUPABASE_URL", "https://uabyfecseqnemvcqhdem.supabase.co").rstrip("/")
KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
REST = URL + "/rest/v1/cms_articles"


@register("sink", "cabinet")
class CabinetSink(Sink):
    def save(self, draft):
        if not KEY:
            print(f"✗ немає SUPABASE_SERVICE_ROLE_KEY — cabinet недоступний "
                  f"(тест через --sink queue): {draft.title}")
            return
        # Ідемпотентність (08.07): щоденний крон календаря × 7-денне вікно плодив ДУБЛІ
        # однієї свято-чернетки (16 замість ~10). Перед вставкою — GET-перевірка чи вже є
        # чернетка з тим самим заголовком (+ дата події / тип). Як дедуп у QueueSink.
        try:
            import urllib.parse
            q = (REST + "?select=id&status=eq.draft&title=eq." + urllib.parse.quote(draft.title)
                 + ("&event_date=eq." + urllib.parse.quote(draft.date) if draft.date
                    else "&type=eq." + urllib.parse.quote(draft.kind)))
            chk = urllib.request.Request(q, headers={"apikey": KEY, "Authorization": "Bearer " + KEY})
            with urllib.request.urlopen(chk, timeout=20) as r:
                if json.loads(r.read().decode("utf-8")):
                    print(f"  ↷ вже є чернетка в кабінеті — пропускаю (дедуп): {draft.title}")
                    return
        except Exception as e:
            print(f"  ⚠ дедуп-перевірка не вдалась ({e}) — продовжую вставку")
        row = {
            "title": draft.title,
            "excerpt": draft.lead or (draft.content or "")[:400],
            "content": draft.content, "category": draft.category or "Свято",
            "geo": draft.geo, "image": draft.image,
            "image_type": draft.image_type, "image_credit": draft.image_credit,
            "source": "CSTL LIFE", "exclusive": True,
            # Джерела-обґрунтування НЕ губимо: перше — у source_url (колонка є в схемі;
            # sync_cms переносить її в стрічку як sourceUrl). Алла бачить, звідки факти.
            "source_url": (draft.source_urls[0] if draft.source_urls else None),
            "status": "draft", "type": draft.kind,
            "event_date": draft.date or None,   # дата свята — для «Шо в селі»
        }
        headers = {"apikey": KEY, "Authorization": "Bearer " + KEY,
                   "content-type": "application/json", "Prefer": "return=minimal"}
        try:
            req = urllib.request.Request(REST, data=json.dumps(row).encode("utf-8"),
                                         headers=headers, method="POST")
            with urllib.request.urlopen(req, timeout=30) as r:
                print(f"  ✓ чернетка в кабінет (HTTP {r.status}): {draft.title}")
        except urllib.error.HTTPError as e:
            print(f"✗ cabinet HTTP {e.code}: {e.read().decode('utf-8','replace')[:200]}")
        except Exception as e:
            print(f"✗ cabinet: {e}")
