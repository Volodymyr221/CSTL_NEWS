"""Sink «page_draft» — кладе готовий текст у стрічку як ЧЕРНЕТКУ сторінки.

Рішення Вови 20.08 на питання «публікує сам чи готує чернетку»: **чернетка**.
Тому запис іде в `page_posts` зі `status = 'draft'`, і читач його не бачить —
причому не тому, що клієнт фільтрує, а тому що так каже політика читання самої
бази (`scripts/supabase_page_post_drafts.sql`).

🔴 ЧОМУ SERVICE_ROLE, А НЕ «БОТ-АКАУНТ». Писати в сторінку має право лише її
адмін (`can_edit_page`). Можна було завести профіль-бота і додати його в
`page_admins` — але тоді в списку адмінів сторінки зʼявився б «користувач», якого
не існує, і будь-хто з майбутніх редакторів бачив би його як людину. Агент — це
не людина, це процес CI, тож і ключ у нього процесний.
⚠️ `author_uid` лишається порожнім: підпис «— Імʼя» під постом від бренду не
потрібен, пост іде від сторінки.

🛑 БЕЗ КЛЮЧА НЕ ПИШЕМО НІЧОГО і кажемо про це вголос — мовчазний пропуск виглядав
би як «агент відпрацював, тем не було».
"""
import json
import os
import urllib.error
import urllib.request

from editor.core.registry import register
from editor.sinks.base import Sink
from editor.sources.plan import mark_done

SUPA_URL = os.environ.get("SUPABASE_URL", "https://uabyfecseqnemvcqhdem.supabase.co").rstrip("/")


@register("sink", "page_draft")
class PageDraftSink(Sink):
    def save(self, draft):
        key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
        if not key:
            print("  ✗ немає SUPABASE_SERVICE_ROLE_KEY — чернетку НЕ збережено")
            return False

        page_id = (draft.meta or {}).get("page_id")
        plan_id = (draft.meta or {}).get("plan_id")
        if not page_id:
            print(f"  ✗ у чернетки «{plan_id}» немає page_id — не знаю, в яку сторінку писати")
            return False

        row = {
            "page_id": page_id,
            "text": draft.content,
            "status": "draft",
            "show_author": False,
            "author_uid": None,
        }
        req = urllib.request.Request(
            f"{SUPA_URL}/rest/v1/page_posts",
            data=json.dumps(row).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "apikey": key,
                "authorization": f"Bearer {key}",
                "prefer": "return=representation",
            },
            method="POST",
        )
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                створено = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            print(f"  ✗ Supabase {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}")
            return False
        except Exception as e:
            print(f"  ✗ Supabase: {e}")
            return False

        # Памʼять оновлюємо ЛИШЕ після підтвердженого запису. Позначити раніше
        # означало б втратити тему назавжди при першій же мережевій помилці.
        # Місію передаємо, щоб пропорція постів рахувалась окремо в кожній
        # спільноті (див. `_види` у `editor/sources/plan.py`).
        mark_done(plan_id, (draft.meta or {}).get("post_kind", ""),
                  getattr(draft, "mission", "") or "")
        new_id = (створено[0] if isinstance(створено, list) and створено else {}).get("id")
        print(f"  ✓ чернетка #{new_id} у сторінці {page_id} — чекає вичитки Вови")
        return True
