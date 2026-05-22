#!/usr/bin/env python3
"""Швидкий дамп структури першої картки рейсу з HTML VOPAS.
Викликається з .github/workflows/test-vopas.yml після основного probe."""

import re
import sys
from pathlib import Path

HTML_PATH = Path("tmp_vopas_response.html")

if not HTML_PATH.exists():
    print("HTML файл не знайдено")
    sys.exit(0)

text = HTML_PATH.read_text(encoding="utf-8")

# Шукаємо першу появу одного з маркерів — і виводимо 3500 символів навколо
for marker in ["result-date", "result-cols", "result-time", "06:50", 'class="row']:
    m = re.search(re.escape(marker), text)
    if m:
        start = max(0, m.start() - 500)
        print(f"-- маркер: {marker} на позиції {m.start()} --")
        print(text[start : start + 3500])
        break
else:
    print("Жоден маркер не знайдено")
