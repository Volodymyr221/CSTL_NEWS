#!/usr/bin/env python3
"""Тести семантичного дедупу (editor/core/dedup) — без реального API (мок _call).

Перевіряє: групування дублів, фейл-софт (None / некоректний JSON), гард (нема ключа,
порожній вхід). Витрати мокаємо, щоб не чіпати data/ai_spend.json.

Запуск:  python scripts/test_dedup.py
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))  # корінь репо
from editor.core import dedup

dedup.spend.record = lambda *a, **k: None   # не писати у ai_spend.json під час тесту

NEW = [{"title": "Толока в Метельному", "summary": "прибирали парк"},
       {"title": "У Метельному вийшли на прибирання парку", "summary": "громада разом"},
       {"title": "Новий фермер у Дерні", "summary": "вирощує ягоди"}]
RECENT = [{"title": "Ремонт дороги в Олиці", "summary": "асфальт"}]

_fake = {"text": None}
dedup._call = lambda prompt, key: (_fake["text"], {"input_tokens": 0, "output_tokens": 0,
                                                   "cache_read_input_tokens": 0,
                                                   "cache_creation_input_tokens": 0,
                                                   "web_search_requests": 0})

fails = []

def check(name, cond):
    print(("  ✓ " if cond else "  ✗ ") + name)
    if not cond:
        fails.append(name)

# 1) гард: без ключа — повертає вхід як є (не викликає модель)
os.environ.pop("ANTHROPIC_API_KEY", None)
check("no-key passthrough", len(dedup.cluster_duplicates(NEW, RECENT)) == 3)

# далі — з ключем (мокнутий _call)
KEY = "sk-test"

# 2) групування: модель каже, що #2 — дубль #1 → лишається 2 з 3
_fake["text"] = '{"duplicates":[2]}'
kept = dedup.cluster_duplicates(NEW, RECENT, api_key=KEY)
check("drops semantic dup #2", len(kept) == 2 and NEW[1] not in kept)
check("keeps distinct items", NEW[0] in kept and NEW[2] in kept)

# 3) фейл-софт: відповідь None (помилка API) → нічого не дропаємо
_fake["text"] = None
check("fail-soft on API error", len(dedup.cluster_duplicates(NEW, RECENT, api_key=KEY)) == 3)

# 4) фейл-софт: некоректний JSON → нічого не дропаємо
_fake["text"] = "вибачте, не можу"
check("fail-soft on bad JSON", len(dedup.cluster_duplicates(NEW, RECENT, api_key=KEY)) == 3)

# 5) порожній вхід → порожній вихід (без виклику)
check("empty input", dedup.cluster_duplicates([], RECENT, api_key=KEY) == [])

# 6) індекси поза межами ігноруються (фейл-софт)
_fake["text"] = '{"duplicates":[99]}'
check("out-of-range index ignored", len(dedup.cluster_duplicates(NEW, RECENT, api_key=KEY)) == 3)

print(f"\n{'УСЕ ЗЕЛЕНЕ' if not fails else 'ПРОВАЛИ: ' + ', '.join(fails)}")
sys.exit(1 if fails else 0)
