"""CLI редактора.

  python -m editor.run --mission holidays              # бойово (sink з місії)
  python -m editor.run --mission holidays --dry-run    # без запису, показати чернетки
  python -m editor.run --mission holidays --sink queue # перекрити sink (тест без ключа)
"""
import argparse

from editor.core.config import load_mission
from editor.core.pipeline import Pipeline


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
    drafts = Pipeline(mission).run(dry_run=args.dry_run, sink_override=args.sink)

    for d in drafts:
        img = "🖼" if d.image else "—"
        print(f"  • {d.title}  [{img} {d.image_query}]")
    where = "dry" if args.dry_run else (args.sink or mission.get("sink"))
    print(f"— готово: {len(drafts)} чернеток (sink: {where})")


if __name__ == "__main__":
    main()
