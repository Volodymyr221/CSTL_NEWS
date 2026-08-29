"""CLI редактора.

  python -m editor.run --mission holidays              # бойово (sink з місії)
  python -m editor.run --mission holidays --dry-run    # без запису, показати чернетки
  python -m editor.run --mission holidays --sink queue # перекрити sink (тест без ключа)
"""
import argparse
import json
from pathlib import Path

from editor.core import spend
from editor.core.config import load_mission
from editor.core.pipeline import Pipeline


def _сторінка_місії(mission: dict):
    """`page_id` живе в ПЛАНІ місії, а не в самій місії: план знає, у яку сторінку
    пише агент. Читаємо звідти, щоб не заводити другу копію цього числа."""
    ім = mission.get("plan")
    if not ім:
        return None
    файл = Path(__file__).resolve().parent / "plans" / f"{ім}.json"
    try:
        return json.loads(файл.read_text(encoding="utf-8")).get("page_id")
    except Exception:
        return None


def main():
    ap = argparse.ArgumentParser(description="AI-редактор CSTL")
    ap.add_argument("--mission", required=True, help="назва місії (editor/missions/<name>.json)")
    ap.add_argument("--dry-run", action="store_true", help="не записувати — показати чернетки")
    ap.add_argument("--sink", help="перекрити sink місії (напр. queue)")
    ap.add_argument("--days", type=int, help="перекрити вікно days_before (тест/бекфіл)")
    args = ap.parse_args()

    mission = load_mission(args.mission)
    if args.days is not None:
        mission["days_before"] = args.days
    print(f"→ місія «{mission['name']}»: {mission.get('description', '')}")

    # 🛑 СТЕЛЯ ВИТРАТ — ПЕРЕД роботою, а не після. Кошик спільний з новинним
    # агентом (один журнал `data/ai_spend.json`), тож три агенти не можуть
    # витратити втричі більше за одну стелю.
    # ⚠️ `--dry-run` пропускаємо навмисно: він не звертається до моделі за
    # гроші, і глушити ним перевірку тексту було б безглуздо.
    if not args.dry_run:
        блок = spend.budget_block(mission.get("spend_prefix", ""),
                                  float(mission.get("month_budget_usd", 0) or 0),
                                  float(mission.get("day_budget_usd", 0) or 0))
        if блок:
            print(f"⛔ {блок}")
            print("— прогін пропущено (запобіжник витрат, не помилка)")
            return
    # 🔴 СТЕЛЯ ШУХЛЯДИ — ТЕЖ ПЕРЕД РОБОТОЮ. Замовлення Вови 29.08: «щоб для кожної
    # спільноти, в якій працює агент, було 2 пости — один публікується, другий на
    # підхваті якщо що».
    # 🔑 Стеля рахується по ЖИВИХ чернетках у самій спільноті, а не по прогонах:
    # прогін — це наша внутрішня подія, а «є що публікувати» — стан, який бачить Вова.
    # 💸 Заразом це запобіжник витрат: повна шухляда означає нуль звернень до моделі.
    # ⚠️ Не знаємо, скільки їх (немає ключа) — пишемо як раніше і кажемо про це вголос.
    # Тихо пропустити прогін було б гірше: спільнота мовчала б без пояснення.
    стеля = int(mission.get("keep_drafts", 0) or 0)
    if стеля and not args.dry_run:
        from editor.sinks.page_draft import скільки_чернеток
        сторінка = _сторінка_місії(mission)
        є = скільки_чернеток(сторінка)
        if є is None:
            print(f"  ⚠ скільки чернеток у сторінці {сторінка} — невідомо, пишу як звичайно")
        elif є >= стеля:
            print(f"  🗂 у спільноті вже {є} чернетк(и) при стелі {стеля} — "
                  f"нових не пишемо, модель не кличемо")
            print("— готово: 0 чернеток (шухляда повна, це не помилка)")
            return
        else:
            можна = стеля - є
            if можна < int(mission.get("per_run", 1) or 1):
                mission["per_run"] = можна
            print(f"  🗂 чернеток у спільноті {є} із {стеля} — пишемо ще {mission.get('per_run')}")

    drafts = Pipeline(mission).run(dry_run=args.dry_run, sink_override=args.sink)

    for d in drafts:
        img = "🖼" if d.image else "—"
        print(f"  • {d.title}  [{img} {d.image_query}]")
    where = "dry" if args.dry_run else (args.sink or mission.get("sink"))
    print(f"— готово: {len(drafts)} чернеток (sink: {where})")


if __name__ == "__main__":
    main()
