"""Стенд: правило Вови про час події доходить до КОЖНОГО агента, що пише тексти.

🗣️ Вова, 26.10.2026: «якщо щось вже відбулось, то не треба писати в новині що буде
тільки, бо сама по собі новина постилась раніше ніж її знайшов агент».

🔑 Міряємо НАСЛІДОК — що саме піде в модель, а не «у файлі є слово». Новинний агент:
`build_prompt` усіх місій. Агент спільнот: перехоплюємо справжній запит до Anthropic
(мережу підмінено, гроші не витрачаються) і читаємо промпт із тіла запиту.
⚠️ Дата звіряється з київською: правило, що називає «сьогодні» за UTC, о 23:30 за
Києвом брехало б на добу.

Запуск: python3 scripts/test_time_rule.py
Контроль: на коміті до 26.10 (`git stash` правки) — промпти без «СЬОГОДНІ» → червоне.
"""
import datetime as dt
import io
import json
import os
import sys
import urllib.request
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))
sys.path.insert(0, str(ROOT))

ok_count = fail_count = 0


def ok(назва, умова, деталь=""):
    global ok_count, fail_count
    if умова:
        ok_count += 1
        print(f"✅ {назва}" + (f"  — {деталь}" if деталь else ""))
    else:
        fail_count += 1
        print(f"❌ {назва}" + (f"  — {деталь}" if деталь else ""))


сьогодні = dt.datetime.now(ZoneInfo("Europe/Kyiv")).strftime("%Y-%m-%d")
мітка = f"({сьогодні}, Київ)"

# ── 1. Спільне правило ──────────────────────────────────────────────────────
from editor.core.time_rule import правило_часу  # noqa: E402
п = правило_часу()
ok("правило називає сьогоднішню дату за Києвом", мітка in п, мітка)
ok("минуле — минулим часом, «буде» заборонено", "МИНУЛОМУ" in п and "«буде»" in п)
ok("подія, що триває, — теперішнім часом", "ТРИВАЄ" in п)
ok("анонс минулої події: не вигадувати перебіг", "НЕ вигадуй" in п)

# ── 2. Новинний агент: усі місії ────────────────────────────────────────────
import ai_news_agent as агент  # noqa: E402
агент.fetch_direct_sources = lambda *_a, **_k: []      # без мережі
cfg = json.loads((ROOT / "scripts/hromada_config.json").read_text(encoding="utf-8"))
for місія in cfg["missions"]:
    промпт = агент.build_prompt(місія, cfg, [])
    ok(f"новинний агент, місія «{місія}»: правило в промпті", мітка in промпт)
ok("новинний агент окремо пояснює published_date", "published_date — дата ПУБЛІКАЦІЇ" in агент.time_block())

# ── 3. Агент спільнот: справжній запит, перехоплений до мережі ──────────────
from editor.core.registry import load_plugins, get  # noqa: E402
load_plugins()
перехоплено = {}


class _Стоп(Exception):
    pass


def _фальшивий_urlopen(req, *a, **k):
    перехоплено["body"] = json.loads(req.data.decode("utf-8"))
    raise _Стоп()


os.environ["ANTHROPIC_API_KEY"] = "test-key"
справжній = urllib.request.urlopen
urllib.request.urlopen = _фальшивий_urlopen
try:
    writer = get("writer", "brand_writer")()
    try:
        writer.write({"id": "t", "topic": "Тест", "facts": ["Тест із медіаграмотності з 26 до 30 жовтня"]},
                     {"voice": "olyka_castle"})
    except _Стоп:
        pass
    except Exception as e:  # writer міг сам зловити виняток — промпт усе одно перехоплено
        print(f"  (writer: {type(e).__name__})")
finally:
    urllib.request.urlopen = справжній

тіло = перехоплено.get("body") or {}
текст = json.dumps(тіло.get("messages", []), ensure_ascii=False)
ok("агент спільнот справді пішов у модель (запит перехоплено)", bool(тіло))
ok("агент спільнот: правило з сьогоднішньою датою в промпті", мітка in текст)

print(f"\n{'✅' if not fail_count else '❌'} {ok_count}/{ok_count + fail_count} перевірок пройдено")
sys.exit(1 if fail_count else 0)
