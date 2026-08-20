"""Source «plan» — теми постів спільноти з файлу-плану, який Вова і Claude
ведуть разом (`editor/plans/<name>.json`).

🔴 ЧОМУ ПЛАН, А НЕ АВТОМАТИЧНЕ ДЖЕРЕЛО. Рішення Вови 20.08: «не тільки [з історії
змін], будемо разом створювати копірайтинг текст про функції». Тобто теми і факти
задає людина, а агент відповідає лише за форму — написати це голосом бренду.
Наслідок для якості: агент фізично не має звідки взяти неправдивий факт, бо
єдине, що він бачить, — рядки з `facts`.

📌 ПАМʼЯТЬ ОКРЕМО ВІД ПЛАНУ (`data/olyka_agent_state.json`). План — це намір
людини, памʼять — це факт агента. Тримати їх в одному файлі означало б, що агент
редагує документ, який пишуть люди: два автори в одному файлі розходяться завжди
(у цьому проєкті це вже коштувало розрізаної навпіл історії журналів 06.08).
"""
import json
from pathlib import Path

from editor.core.registry import register
from editor.sources.base import Source

ROOT = Path(__file__).resolve().parent.parent.parent
PLANS = ROOT / "editor" / "plans"
STATE = ROOT / "data" / "olyka_agent_state.json"


def load_state() -> dict:
    """Що агент уже написав. Формат: {"done": ["id", ...]}."""
    try:
        return json.loads(STATE.read_text(encoding="utf-8"))
    except Exception:
        return {"done": []}


def mark_done(post_id: str) -> None:
    """Позначити тему як опрацьовану. Кличе SINK — саме він знає, що запис у базу
    справді відбувся. Джерело цього знати не може: воно віддає теми наперед."""
    st = load_state()
    done = st.setdefault("done", [])
    if post_id and post_id not in done:
        done.append(post_id)
        STATE.parent.mkdir(parents=True, exist_ok=True)
        STATE.write_text(json.dumps(st, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


@register("source", "plan")
class PlanSource(Source):
    def fetch(self, cfg):
        назва = cfg.get("plan") or cfg.get("name")
        шлях = PLANS / f"{назва}.json"
        if not шлях.exists():
            print(f"  ⚠ плану немає: {шлях}")
            return []

        план = json.loads(шлях.read_text(encoding="utf-8"))
        зроблено = set(load_state().get("done", []))
        ліміт = int(cfg.get("per_run", 1))

        готові = []
        for запис in план.get("posts", []):
            pid = (запис.get("id") or "").strip()
            if not pid or pid in зроблено:
                continue
            # Порожня тема або порожні факти — не привід щось вигадати, а привід
            # пропустити: агент пише лише з того, що йому дали.
            if not (запис.get("topic") or "").strip() or not запис.get("facts"):
                print(f"  ⚠ пропускаю «{pid}»: немає теми або фактів")
                continue
            запис = dict(запис)
            запис["page_id"] = план.get("page_id")
            готові.append(запис)
            if len(готові) >= ліміт:
                break

        якщо_нема = "план вичерпано — допиши теми" if not готові else ""
        print(f"  → план «{назва}»: {len(готові)} тем(и) до роботи {якщо_нема}")
        return готові
