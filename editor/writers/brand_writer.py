"""Writer «brand_writer» — пише пост у стрічку від імені спільноти OLYKA CASTLE.

Відрізняється від `ai_writer` (той пише СТАТТІ про свята) трьома речами:
  1. на виході не стаття, а короткий пост стрічки — без заголовка й ліду;
  2. тон береться з файлу голосу (`editor/voice/<voice>.md`), а не з промпта —
     Вова править голос текстом, не кодом;
  3. модель — `claude-opus-5` (рішення Вови 20.08). Це офіційний голос бренду,
     і різниця з дешевшою моделлю тут коштує центи: пост ≈ $0.03.

🔴 ГОЛОВНЕ ПРАВИЛО ЦЬОГО МОДУЛЯ — АГЕНТ НЕ ВИГАДУЄ ФАКТІВ.
Він бачить лише `facts` із плану. Заборона повторена двічі — в голосі і в
промпті — і це не надмірність: саме тут ціна помилки найвища. Пост від
офіційної спільноти з вигаданою цифрою це не «неточність», це підрив довіри
до бренду, який щойно починає говорити.

⚠️ ЧОМУ `urllib`, А НЕ SDK `anthropic`. Так само, як у сусідньому `ai_writer` і
в `scripts/ai_news_agent.py`: конвеєр крутиться в GitHub Actions, і кожна нова
залежність — це ще один крок встановлення, який може впасти. Дві копії підходу в
одному підсистемі гірші за одну; тут обрано наявну.
"""
import json
import os
import urllib.error
import urllib.request
from pathlib import Path

from editor.core.registry import register
from editor.core.models import Draft
from editor.core import spend
from editor.writers.base import Writer

API_URL = "https://api.anthropic.com/v1/messages"
MODEL = "claude-opus-5"
ROOT = Path(__file__).resolve().parent.parent.parent
VOICE_DIR = ROOT / "editor" / "voice"


def _voice(name: str) -> str:
    p = VOICE_DIR / f"{name}.md"
    if not p.exists():
        raise FileNotFoundError(
            f"немає файлу голосу: {p}. Без нього агент писав би «як вийде» — "
            f"а голос бренду це не те, що можна лишити на випадковість."
        )
    return p.read_text(encoding="utf-8")


@register("writer", "brand_writer")
class BrandWriter(Writer):
    def write(self, item, cfg):
        тема = (item.get("topic") or "").strip()
        факти = [f.strip() for f in (item.get("facts") or []) if str(f).strip()]
        if not тема or not факти:
            return None

        api_key = os.environ.get("ANTHROPIC_API_KEY")
        if not api_key:
            # 🛑 БЕЗ КЛЮЧА НЕ ПИШЕМО ЗАГЛУШКУ. `ai_writer` у такому разі робить
            # чернетку з опису — там це доречно (є готовий людський текст про
            # свято). Тут «запасним текстом» був би злиплий перелік фактів, і
            # він потрапив би в чергу на публікацію як нібито готовий пост.
            print(f"  ⚠ немає ANTHROPIC_API_KEY — пропускаю «{item.get('id')}»")
            return None

        голос = _voice(cfg.get("voice", "olyka_castle"))
        це_функція = (item.get("kind") or "brand") == "feature"

        частини = [
            "Ти пишеш пост для стрічки застосунку громади від імені офіційної спільноти бренду.",
            "Нижче — ГОЛОС БРЕНДУ. Дотримуйся його як інструкції, а не як побажання.",
            "", "=== ГОЛОС ===", голос, "=== КІНЕЦЬ ГОЛОСУ ===", "",
            f"ТЕМА ПОСТА: {тема}",
            "", "ФАКТИ (єдине джерело правди):",
        ]
        частини += [f"  • {f}" for f in факти]
        if item.get("how"):
            частини += ["", f"ЯК КОРИСТУВАТИСЬ: {item['how']}"]
        if item.get("note"):
            частини += ["", f"ПОБАЖАННЯ ДО ЦЬОГО ПОСТА: {item['note']}"]
        частини += [
            "",
            "🛑 ЗАБОРОНА 1: не додавай жодного факту, числа, дати, імені чи обіцянки, "
            "яких немає вище. Якщо чогось бракує для красивого речення — не пиши це речення.",
            "",
            # 🔴 20.08. Перший живий пост вийшов у пікселях («було 121, стало 51-53»),
            # бо саме такі факти йому дали. Вова: «технічні деталі людям не цікаві,
            # їм треба розуміти зручність для них». Заборона стоїть і в голосі, і тут —
            # бо факти пише людина, і технічна мірка в них зʼявиться знову.
            "🛑 ЗАБОРОНА 2 — ТЕХНІЧНІ МІРКИ. Пікселі, відсотки, назви екранів, файлів і "
            "компонентів у пост НЕ потрапляють. Якщо факт вище містить таку мірку, не "
            "переказуй її, а ПЕРЕКЛАДИ в те, що бачить людина: «121 піксель → 51» це "
            "«раніше займала пів екрана — тепер один рядок».",
            "",
            "🔑 ПЕРЕВІРКА КОЖНОГО РЕЧЕННЯ: чи змінює воно щось у тому, ЯК ЛЮДИНА "
            "користується застосунком? Якщо речення описує нашу роботу, а не її вигоду — "
            "викинь його, навіть якщо воно правдиве.",
        ]
        if це_функція:
            частини += [
                "",
                "Це пост про НОВУ ФУНКЦІЮ. Обовʼязково три частини: що зʼявилось · "
                "навіщо це людині · як цим користуватись (буквально, куди тапнути).",
                "⚠️ Починай з ВИГОДИ, а не з опису зміни. Перше речення має відповідати "
                "на питання «і що мені з того?», а не «що вони зробили».",
            ]
        частини += [
            "",
            'Поверни ЛИШЕ JSON-обʼєкт, без пояснень до і після:',
            '{"text":"текст поста з абзацами через \\n\\n","self_check":"одним реченням: '
            'чи всі твердження спираються на надані факти"}',
        ]
        prompt = "\n".join(частини)

        payload = {
            "model": MODEL,
            "max_tokens": 2048,
            # Adaptive-мислення на Opus 5 увімкнене за замовчуванням; `effort:
            # medium` — бо це короткий текст, а не розбір задачі. Витрата токенів
            # менша, якість формулювань для трьох абзаців та сама.
            "output_config": {"effort": "medium"},
            "messages": [{"role": "user", "content": prompt}],
        }
        req = urllib.request.Request(
            API_URL,
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "content-type": "application/json",
                "x-api-key": api_key,
                "anthropic-version": "2023-06-01",
            },
        )
        try:
            with urllib.request.urlopen(req, timeout=120) as r:
                дані = json.loads(r.read().decode("utf-8"))
        except urllib.error.HTTPError as e:
            print(f"  ✗ Anthropic {e.code}: {e.read().decode('utf-8', 'ignore')[:200]}")
            return None
        except Exception as e:
            print(f"  ✗ Anthropic: {e}")
            return None

        # Відмова моделі — це успішна відповідь із іншим `stop_reason`, а не помилка.
        # Без цієї гілки ми пішли б далі з порожнім текстом і поклали б у чергу
        # порожній пост.
        if дані.get("stop_reason") == "refusal":
            print(f"  ✗ модель відмовилась писати «{item.get('id')}»")
            return None

        текст = ""
        for блок in дані.get("content", []):
            if блок.get("type") == "text":
                текст += блок.get("text", "")

        usage = дані.get("usage", {}) or {}
        spend.record(f"olyka:{item.get('id', '?')}", usage, 1,
                     note=тема[:80], model=MODEL)

        готове = _json_з_відповіді(текст)
        пост = (готове.get("text") or "").strip()
        if not пост:
            print(f"  ✗ порожній текст для «{item.get('id')}»")
            return None

        return Draft(
            title=тема[:120],          # службова мітка; у стрічці заголовків немає
            content=пост,
            kind="page_post",
            status="draft",
            meta={
                "plan_id": item.get("id"),
                "page_id": item.get("page_id"),
                "post_kind": item.get("kind"),
                "self_check": готове.get("self_check", ""),
                "model": MODEL,
            },
        )


def _json_з_відповіді(текст: str) -> dict:
    """Модель просили віддати чистий JSON, але зрідка він приїжджає в ```-огорожі
    або з поясненням довкола. Витягуємо перший обʼєкт — інакше один зайвий символ
    коштував би цілого прогону."""
    т = текст.strip()
    if т.startswith("```"):
        т = т.split("```")[1] if "```" in т[3:] else т.strip("`")
        т = т.lstrip("json").strip()
    try:
        return json.loads(т)
    except Exception:
        pass
    i, j = т.find("{"), т.rfind("}")
    if i >= 0 and j > i:
        try:
            return json.loads(т[i:j + 1])
        except Exception:
            pass
    print("  ⚠ відповідь не читається як JSON")
    return {}
