"""Source «calendar» — свята з data/holidays.json у вікні N днів до дати.

Для кожного свята, до якого лишилось [0..days_before] днів, віддає елемент.
Так стаття готується завчасно (за тиждень до свята) як чернетка.
"""
import datetime
import json
from pathlib import Path

from editor.core.registry import register
from editor.sources.base import Source

HOLIDAYS = Path("data/holidays.json")


@register("source", "calendar")
class CalendarSource(Source):
    def fetch(self, cfg):
        window = int(cfg.get("days_before", 7))
        try:
            data = json.loads(HOLIDAYS.read_text(encoding="utf-8")).get("holidays", [])
        except Exception as e:
            print(f"✗ читання holidays.json: {e}")
            return
        today = datetime.date.today()
        for h in data:
            try:
                d = datetime.date.fromisoformat((h.get("date") or "").strip())
            except ValueError:
                continue
            days = (d - today).days
            if 0 <= days <= window:
                yield {**h, "days_until": days}
