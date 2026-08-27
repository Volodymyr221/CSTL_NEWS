#!/usr/bin/env python3
"""CI-синк: бере готові статті кабінету (cms_articles status='ready') із Supabase
і викладає у git-стрічку data/articles.json (id/дедуп/ліміти — як publish_queue),
потім позначає їх status='published' назад у Supabase.

Архітектура «Supabase редагує — Git публікує» (docs/EDITOR_CABINET_ARCH.md).
Читає/пише Supabase через REST із SERVICE_ROLE-ключем (обходить RLS на сервері;
ключ — лише в секреті GitHub Actions, ніколи в клієнті).

Env: SUPABASE_URL (опц., є дефолт), SUPABASE_SERVICE_ROLE_KEY (обов'язково).
"""
import json
import os
import sys
import time
import urllib.request
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import parse_rss as pr  # noqa: E402

SUPABASE_URL = os.environ.get("SUPABASE_URL", "https://uabyfecseqnemvcqhdem.supabase.co").rstrip("/")
SERVICE_KEY = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
REST = SUPABASE_URL + "/rest/v1/cms_articles"
EVENTS_PATH = Path("data/events.json")   # «Шо в селі» — свята/події
# Наміри між тактами: що записано у файл, але ще не підтверджено пушем.
# Живе в `data/`, бо саме цей каталог їде разом із комітом раннера.
PENDING_PATH = Path("data/.cms_pending.json")

# 🔴 20.08 — ВЛАСНИЙ ПРОСТІР НОМЕРІВ ДЛЯ СТАТЕЙ КАБІНЕТУ.
#
# Заміряно на живих даних: `git_id` 12409 у базі вказував на статтю «Сам викликав
# евакуатор» (Волинь), а не на «Радзивіллівські землі навколо Олики». І це не
# випадковість, а неминучість: `data/articles.json` пишуть ДВА процеси з різних
# воркфловів (`rss-parser.yml` і `cms-sync.yml`), обидва рахують `max(наявних)+1`
# кожен зі СВОГО знімка файлу. Два робочі процеси, що роздають номери з одного
# лічильника, рано чи пізно видадуть один номер двічі — питання лише коли.
#
# 🔑 Тому номери РОЗВЕДЕНО: парсер лишається внизу (зараз ~12 тис.), кабінет бере
# від мільйона. Збіг стає фізично неможливим, а не «малоймовірним», і читачам
# застосунку міняти нічого не треба — id як був числом, так і лишився.
# 🛑 Не «підняти базу, бо парсер колись доросте»: парсер росте на ~130 статей на
# добу, тобто до мільйона йому ~20 років. Якщо колись дійде — це буде видно
# заздалегідь, а не як тиха підміна.
CMS_ID_BASE = 1_000_000


def next_cms_id(existing: list) -> int:
    """Наступний вільний номер У ПРОСТОРІ КАБІНЕТУ (від CMS_ID_BASE вгору).

    Рахуємо максимум ЛИШЕ серед своїх номерів: якщо брати `max` по всьому файлу,
    один чужий великий id підняв би лічильник кабінету назавжди."""
    свої = [a["id"] for a in existing
            if isinstance(a.get("id"), int) and a["id"] >= CMS_ID_BASE]
    return (max(свої) if свої else CMS_ID_BASE - 1) + 1


def _req(method, url, body=None):
    headers = {
        "apikey": SERVICE_KEY,
        "Authorization": "Bearer " + SERVICE_KEY,
        "Content-Type": "application/json",
        "Prefer": "return=minimal",
    }
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request(url, data=data, headers=headers, method=method)
    with urllib.request.urlopen(req, timeout=20) as r:
        raw = r.read()
        return json.loads(raw) if raw else None


def fetch_ready():
    url = REST + "?status=eq.ready&type=eq.news&select=*&order=ts.asc"
    headers = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or "[]")


def mark_published(row_id, git_id):
    body = {
        "status": "published",
        "git_id": git_id,
        "published_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    _req("PATCH", REST + "?id=eq.%s" % row_id, body)


def promote_scheduled():
    """Автопостинг: заплановані статті, яким настав час (publish_at<=now),
    переводимо scheduled→ready. Далі їх публікує звичайний потік синку."""
    now = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    url = REST + "?status=eq.scheduled&publish_at=lte." + now
    try:
        _req("PATCH", url, {"status": "ready"})
        print(f"⏰ автопостинг: заплановані з часом <= {now} → ready")
    except Exception as e:
        print(f"⚠ promote_scheduled: {e}")


def heal_phantom_drafts():
    """Само-лікування «фантомних чернеток»: рядок зі status='draft', але з git_id —
    стаття ВЖЕ викладена у стрічку (git), а потім щось повернуло статус у чернетки
    (старий баг: редагування опублікованої деградувало статус; закрито у PR #258,
    але такі рядки лишились). Стрічка статтю тримає далі, тож чесний статус —
    published: закриваємо, щоб не займав слот AI-агента і не плутав редактора.
    Легальні чернетки (git_id IS NULL — ще не публікувались) не чіпаємо."""
    url = REST + "?status=eq.draft&git_id=not.is.null&select=id,title"
    headers = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}
    try:
        req = urllib.request.Request(url, headers=headers)
        with urllib.request.urlopen(req, timeout=20) as r:
            rows = json.loads(r.read() or "[]")
        for row in rows:
            _req("PATCH", REST + "?id=eq.%s" % row["id"], {"status": "published"})
            print(f"🩹 фантомну чернетку закрито як published: id={row['id']} «{(row.get('title') or '')[:60]}»")
    except Exception as e:
        print(f"⚠ heal_phantom_drafts: {e}")


def fetch_shotam_ready():
    """Готові свята/події (type=holiday/event) для «Шо в селі»."""
    url = REST + "?status=eq.ready&type=in.(holiday,event)&select=*&order=event_date.asc"
    headers = {"apikey": SERVICE_KEY, "Authorization": "Bearer " + SERVICE_KEY}
    req = urllib.request.Request(url, headers=headers, method="GET")
    with urllib.request.urlopen(req, timeout=20) as r:
        return json.loads(r.read() or "[]")


def cms_to_event(row, next_id):
    """Нормалізує рядок cms_articles у схему data/events.json."""
    return {
        "id": next_id,
        "title": row.get("title", ""),
        "description": row.get("content") or row.get("excerpt") or "",
        "date": row.get("event_date") or time.strftime("%Y-%m-%d", time.gmtime()),
        "time": row.get("event_time") or None,
        "location": row.get("location") or "Олика",
        "category": row.get("category") or "Свято",
        "image": row.get("image"),
    }


def _event_key(title, date):
    """Стабільний ключ події: заголовок(нормалізований) + дата. Дата розрізняє
    річні свята (те саме свято іншого року — інша подія)."""
    return ((title or "").strip().lower(), (date or "").strip())


def publish_shotam():
    """Публікує готові свята/події у data/events.json («Шо в селі»).
    Дедуп за (заголовок+дата) з ОНОВЛЕННЯМ на місці (P4): раніше дедуп за самим
    заголовком тихо КОВТАВ новий/відредагований запис (позначав published БЕЗ
    додавання) — річні свята зникали, правки не доходили. Тепер: збіг ключа →
    оновлюємо існуючий запис (зберігаємо його id); нема збігу → додаємо новий."""
    try:
        ready = fetch_shotam_ready()
    except Exception as e:
        print(f"⚠ читання свят/подій: {e}")
        return
    if not ready:
        return
    events = json.loads(EVENTS_PATH.read_text(encoding="utf-8")) if EVENTS_PATH.exists() else []
    next_id = max((e["id"] for e in events if isinstance(e.get("id"), int)), default=0) + 1
    by_key = {_event_key(e.get("title"), e.get("date")): i for i, e in enumerate(events)}
    changed = 0
    for row in ready:
        title = (row.get("title") or "").strip()
        if not title:
            continue
        ev = cms_to_event(row, next_id)
        key = _event_key(ev["title"], ev["date"])
        if key in by_key:
            old = events[by_key[key]]
            ev["id"] = old.get("id", ev["id"])   # зберегти наявний id — оновлення на місці
            events[by_key[key]] = ev
        else:
            events.append(ev)
            by_key[key] = len(events) - 1
            next_id += 1
        try:
            mark_published(row["id"], ev["id"])   # P11: захищено — один збій не валить решту
        except Exception as e:
            print(f"⚠ mark_published свято id={row['id']}: {e}")
        changed += 1
    if changed:
        EVENTS_PATH.write_text(json.dumps(events, ensure_ascii=False, indent=2), encoding="utf-8")
        print(f"✓ синк: оновлено/додано {changed} свят/подій у «Шо в селі» (усього {len(events)})")


def cms_to_article(row, next_id):
    """Нормалізує рядок cms_articles у git-схему статті.

    🔴 27.08 — ВМІСТ ПРОХОДИТЬ `polish_markup`. Стаття кабінету збирається задовго
    до публікації (агент пише чернетку, людина її публікує пізніше), тож у файл
    вона приїжджає з розміткою ТОГО дня, коли її склали. Скарга Вови по статті
    про день прибирання: адреси голим текстом і «« повернутися» від сайту-джерела
    — чернетку зібрали о 08:30, а правила посилань змінились о 13:16.
    ⚠️ Прохід НЕ ходить у мережу і НЕ міняє змісту: лише робить натискним те, що
    вже написано, і прибирає навігацію чужого сайту. Тому він безпечний і для
    статей, які Вова пише сам.
    """
    ts = row.get("ts") or int(time.time() * 1000)
    return {
        "id": next_id,
        "title": row.get("title", ""),
        "excerpt": (row.get("excerpt") or row.get("content") or "")[:400],
        "content": pr.polish_markup(row.get("content", "")),
        "_polish": pr.POLISH_VERSION,
        "category": row.get("category") or "Суспільство",
        "geo": row.get("geo") or "Громада",
        "image": row.get("image"),
        "image_type": row.get("image_type") or ("source" if row.get("image") else "none"),
        "image_credit": row.get("image_credit"),
        "source": row.get("source") or "CSTL LIFE",
        "sourceUrl": row.get("source_url"),
        "exclusive": bool(row.get("exclusive", True)),
        "ts": ts,
        "added_ts": int(time.time() * 1000),
        "kind": "editor",
    }


def позначити_доїхалі(наміри, merged):
    """Відсіює наміри до тих статей, які СПРАВДІ лягли у файл, і відкладає їх
    на підтвердження (див. `confirm()`).

    🔴 20.08 — ЦЕ ГОЛОВНИЙ ФІКС ДНЯ, і він про ПОРЯДОК, а не про обчислення.
    Було так: `mark_published()` викликався ВСЕРЕДИНІ циклу збору, а доля статті
    вирішувалась ПІСЛЯ нього — `apply_daily_limits` могла її викинути,
    `balance_ua_world` теж, `[:MAX_ARTICLES]` міг обрізати, а запис у файл міг
    узагалі не доїхати до `main` (у CI пуш робиться з `git rebase`, і при
    конфлікті цілого JSON перемагає той, хто запушив останнім).

    Тобто статус у базі не «іноді помилявся» — він НЕ БУВ ПОВʼЯЗАНИЙ із
    результатом узагалі. Заміряно 20.08: усі 6 статей зі станом `published`
    мали `git_id`, і при цьому в `data/articles.json` не було ЖОДНОЇ
    (`kind=editor` — нуль). База два місяці рапортувала про публікацію, якої не
    сталося, а Вова відкривав застосунок і не знаходив свій текст.

    🔑 Правило, яке з цього лишається: **позначку про успіх ставить лише той, хто
    успіх бачив.** Тут ми звіряємось із підсумковим `merged` — тим самим списком,
    що йде на диск. Статтю викинуло лімітом? Рядок лишається `ready` і поїде
    наступним прогоном, а не зникне з позначкою «опубліковано».
    ⚠️ І ЦЬОГО САМОГО ПО СОБІ ЗАМАЛО. Запис у файл — ще не публікація: далі CI
    робить `git push` із `rebase`, і при конфлікті цілого JSON прогін падає, а
    файл лишається лише на робочій машині раннера. Саме так 20.08 і сталося —
    коміту синку в історії немає взагалі.

    ➡️ Тому тут ми лише ЗАПИСУЄМО НАМІР у `data/.cms_pending.json`. Позначку в
    базі ставить окремий прогін `--confirm`, який воркфлов кличе ПІСЛЯ вдалого
    пуша. Не доїхало — рядки лишаються `ready` і поїдуть наступного разу.
    """
    у_файлі = {a.get("id") for a in merged}
    доїхали = [(r, g) for r, g in наміри if g in у_файлі]
    for row_id, git_id in наміри:
        if git_id not in у_файлі:
            print(f"↩ id={row_id}: не пройшла ліміти — лишається ready до наступного прогону")
    PENDING_PATH.write_text(json.dumps(доїхали, ensure_ascii=False), encoding="utf-8")
    return len(доїхали)


def confirm():
    """Другий такт: позначити в базі те, що СПРАВДІ доїхало в git.

    🔑 Кличеться воркфловом лише після успішного `git push`. Тобто позначку про
    успіх ставить той, хто успіх бачив, — а не той, хто його планував."""
    if not PENDING_PATH.exists():
        print("Намірів немає — підтверджувати нічого")
        return
    наміри = json.loads(PENDING_PATH.read_text(encoding="utf-8"))
    ок = 0
    for row_id, git_id in наміри:
        try:
            mark_published(row_id, git_id)
            ок += 1
        except Exception as e:
            # Не позначилось — рядок лишається `ready`. Наступний прогін зробить
            # це ще раз; дедуп за заголовком не дасть другій копії у файл.
            print(f"⚠ не вдалося позначити published id={row_id}: {e}")
    PENDING_PATH.unlink(missing_ok=True)
    print(f"✓ підтверджено опублікованими: {ок} з {len(наміри)}")


def main():
    if not SERVICE_KEY:
        print("✗ немає SUPABASE_SERVICE_ROLE_KEY — пропускаю синк")
        return
    # P11: кожен під-крок ізольовано — збій одного (напр. транзиентна REST-помилка)
    # не має обривати весь синк і блокувати публікацію новин нижче.
    for step in (promote_scheduled, heal_phantom_drafts, publish_shotam):
        try:
            step()
        except Exception as e:
            print(f"⚠ під-крок {step.__name__} впав, продовжую: {e}")
    try:
        ready = fetch_ready()
    except Exception as e:
        print(f"✗ не вдалося прочитати cms_articles: {e}")
        return
    if not ready:
        print("Немає готових статей (status=ready) — синк не потрібен")
        return

    existing = json.loads(pr.DATA_PATH.read_text(encoding="utf-8"))
    next_id = next_cms_id(existing)     # 🔑 власний простір, див. CMS_ID_BASE

    # Дедуп за нечітким заголовком у межах розділу (як усюди).
    seen_by_section = {}
    for a in existing:
        if a.get("title"):
            pr.remember_title(pr.title_tokens(a["title"]), pr.section_of(a.get("geo", "")), seen_by_section)

    published, synced = [], 0
    наміри = []          # (id рядка в базі, виданий номер) — до запису у файл це лише намір
    for row in ready:
        title = (row.get("title") or "").strip()
        if not title:
            continue
        section = pr.section_of(row.get("geo", "Громада"))
        tokens = pr.title_tokens(title)
        if pr.is_dup_title(tokens, section, seen_by_section):
            mark_published(row["id"], None)   # уже у стрічці — просто закриваємо
            continue
        art = cms_to_article(row, next_id)
        published.append(art)
        pr.remember_title(tokens, section, seen_by_section)
        # 🛑 БАЗУ ТУТ НЕ ЧІПАЄМО — лише запамʼятовуємо намір. Див. пояснення в
        # `позначити_доїхалі()` нижче: доля статті вирішується ПІСЛЯ цього циклу.
        наміри.append((row["id"], next_id))
        next_id += 1

    if not published:
        print("Усі готові статті вже у стрічці (дублі) — закрито.")
        return

    # 🔴 20.08 — ТУТ СИНК ПАДАВ РІВНО МІСЯЦЬ, І ЦЕ БУЛА СПРАВЖНЯ ПРИЧИНА ТОГО,
    # ЩО ОПУБЛІКОВАНЕ НІКОЛИ НЕ ЗʼЯВЛЯЛОСЬ.
    #
    # Стояв виклик `pr.apply_daily_limits(...)`. Цю функцію прибрали з
    # `parse_rss.py` 21.07, коли денні ліміти замінили зберіганням за ВІКОМ, — а
    # `sync_cms.py` не оновили. Відтоді кожен прогін, у якому БУЛО ЩО СИНКАТИ,
    # падав із `AttributeError: module 'parse_rss' has no attribute
    # 'apply_daily_limits'`.
    #
    # 🛑 І найгірше — падав ПІСЛЯ того, як позначив рядки опублікованими. Тобто
    # база казала «опубліковано», файл не отримував нічого, а наступний прогін
    # бачив порожню чергу і рапортував «синк не потрібен» — зелений прогін над
    # мертвим ланцюгом. Саме тому 913 запусків виглядали здоровими.
    #
    # ⚠️ УРОК ПРО ВЛАСНУ ЖЕ ПОМИЛКУ: сьогодні я написав сторожа з гаслом «ланцюг
    # перевіряється на ДАНИХ, а не в коді» — і сам полагодив порядок дій та
    # номери, жодного разу не ЗАПУСТИВШИ синк. Обидві мої правки були потрібні,
    # але жодна не лікувала того, що процес просто падає.
    #
    # ➡️ Тепер збірка файлу — рівно та сама, що в самого парсера
    # (`parse_rss.py`, кінець `main`): вік → стеля з квотою Громади.
    # ⚠️ МЕРТВИХ ВИКЛИКІВ БУЛО ДВА, і другий знайшовся лише коли я нарешті
    # ЗАПУСТИВ синк: `balance_ua_world` теж не існує з тих самих часів. Читанням
    # коду я його не побачив — дивився на рядок, який «виглядає правильно».
    # 🔑 Тому порядок нижче не вигаданий, а СПИСАНИЙ із самого парсера
    # (`parse_rss.py`, збереження `articles.json`): сортування → вік → стеля.
    # Третьої версії того самого правила в проєкті бути не повинно.
    merged = published + existing
    merged.sort(key=lambda a: a.get("ts", 0), reverse=True)
    merged = pr.prune_by_age(merged)     # тиждень потоку / місяць Громади; ексклюзиви не чіпає
    merged = pr.cap_articles(merged)     # стеля файлу з окремою квотою Громади

    pr.DATA_PATH.write_text(json.dumps(merged, ensure_ascii=False, indent=2), encoding="utf-8")
    synced = позначити_доїхалі(наміри, merged)
    print(f"✓ синк: +{synced} статей кабінету у стрічку (усього {len(merged)})")


if __name__ == "__main__":
    if "--confirm" in sys.argv:
        confirm()
    else:
        main()
