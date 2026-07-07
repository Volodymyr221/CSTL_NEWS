"""Завантаження декларативних місій (editor/missions/<name>.json).

Місія описує який Source/Writer/Image/Sink і параметри — без коду.
JSON (не yaml) щоб не тягнути залежність у CI.
"""
import json
from pathlib import Path

MISSIONS_DIR = Path(__file__).resolve().parent.parent / "missions"


def load_mission(name: str) -> dict:
    p = MISSIONS_DIR / f"{name}.json"
    if not p.exists():
        raise FileNotFoundError(f"місія не знайдена: {p}")
    m = json.loads(p.read_text(encoding="utf-8"))
    m.setdefault("name", name)
    return m
