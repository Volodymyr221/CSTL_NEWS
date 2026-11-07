"""Сторож: АГЕНТ, ЯКИЙ СТОЇТЬ, ЦЕ ВИДНО (07.11.2026).

Аудит ботів 07.11: агенти спільнот тиждень писали «план вичерпано», новинний —
«кабінет повний», а всі прогони зелені — ніхто не знав. Тепер кожен агент пише
свій стан у data/ai_spend.json (`agents_state`), адмінка його показує.
Міряє: (1) місія з планом і 0 чернеток → «стоїть»; (2) календарна місія з 0 → не
«стоїть» (у вікні просто нема свята); (3) повна шухляда → «чекає»; (4) стан
пишеться лише при ЗМІНІ (ts = «відколи»); (5) ключ агента = мітка прогону.
Запуск: python3 scripts/test_agent_state.py
"""
import os, sys, json, tempfile, types
from pathlib import Path
ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT))
from editor.core import spend
import editor.run as run

ok_n = bad = 0
def ok(name, cond, info=""):
    global ok_n, bad
    print(("✅ " if cond else "❌ ") + name + (f"  — {info}" if info else ""))
    if cond: ok_n += 1
    else: bad += 1

tmp = Path(tempfile.mkdtemp()) / "ai_spend.json"
spend.SPEND_PATH = tmp
state = lambda: json.loads(tmp.read_text(encoding="utf-8")).get("agents_state", {}) if tmp.exists() else {}

ok("ключ агента = мітка прогону", run._агент({"spend_prefix": "olyka:"}) == "olyka" and run._агент({"spend_prefix": "holiday:"}) == "holiday")

# Підміняємо важкі частини main(): місію, конвеєр, бюджет, шухляду.
def прогін(mission, drafts, шухляда=None):
    run.load_mission = lambda name: dict(mission)
    run.Pipeline = lambda m: types.SimpleNamespace(run=lambda dry_run, sink_override: drafts)
    spend.budget_block = lambda *a: None
    import editor.sinks.page_draft as pd
    pd.скільки_чернеток = lambda page: шухляда
    run._сторінка_місії = lambda m: 3
    sys.argv = ["x", "--mission", mission["name"]]
    run.main()

plan = {"name": "olyka_castle", "source": "plan", "plan": "olyka_castle", "spend_prefix": "olyka:", "keep_drafts": 2}
прогін(plan, [])
ok("🔴 план без тем і 0 чернеток → «стоїть»", state().get("olyka", {}).get("стан") == "стоїть", str(state().get("olyka")))
ts1 = state()["olyka"]["ts"]
прогін(plan, [])
ok("🔴 той самий стан удруге — файл не переписується (ts = «відколи»)", state()["olyka"]["ts"] == ts1)
прогін(plan, [], шухляда=2)
ok("повна шухляда → «чекає»", state()["olyka"]["стан"] == "чекає", str(state()["olyka"]))
прогін(plan, [types.SimpleNamespace(title="Костел Пресвятої Трійці", image=None, image_query="")], шухляда=0)
ok("написав чернетку → «працює»", state()["olyka"]["стан"] == "працює")

cal = {"name": "holidays", "source": "calendar", "spend_prefix": "holiday:"}
прогін(cal, [])
ok("🔴 свята: 0 чернеток — НЕ «стоїть» (у вікні нема свята)", state().get("holiday", {}).get("стан") == "працює", str(state().get("holiday")))

print(f"\n{'✅' if not bad else '❌'} {ok_n}/{ok_n + bad} перевірок пройдено")
sys.exit(1 if bad else 0)
