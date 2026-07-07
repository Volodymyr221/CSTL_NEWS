"""Sink «queue» — fallback у файл data/editor_drafts.json.
Дає протестувати весь конвеєр БЕЗ ключа Supabase. Простий дедуп за (title, date).
"""
import json
import time
from pathlib import Path

from editor.core.registry import register
from editor.sinks.base import Sink

DRAFTS = Path("data/editor_drafts.json")


@register("sink", "queue")
class QueueSink(Sink):
    def save(self, draft):
        arr = []
        if DRAFTS.exists():
            try:
                arr = json.loads(DRAFTS.read_text(encoding="utf-8"))
            except Exception:
                arr = []
        key = (draft.title, draft.date)
        if any((d.get("title"), d.get("date")) == key for d in arr):
            print(f"  ↷ вже є чернетка: {draft.title}")
            return
        row = draft.to_dict()
        row["created_ts"] = int(time.time() * 1000)
        arr.insert(0, row)
        DRAFTS.write_text(json.dumps(arr, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"  ✓ чернетка у файл: {draft.title}")
