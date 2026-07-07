# BYYOU_PLAN — стан потоку /byyou (CSTL)

**Статус:** done
<!-- idle=вимкнено · active=потік іде (push-замок УВІМКНЕНО) · paused=пауза · done=завершено -->
<!-- ✅ 07.07 ЗАДЕПЛОЄНО: PR #238 (47713a83). Пакет editor/ + місія «Свята». Наступне: Блок 2 (кабінет-редагування+автопостинг). Чекає Вову: SUPABASE_SERVICE_ROLE_KEY+URL+SQL для живого запису в кабінет. -->

**Ціль:** БЛОК 1 AI-редактора — пакет `editor/` (ядро+плагіни+док) + місія «Свята» як пілот. Чернетка→кабінет Алли.
**Власник:** Рома · **Гілка:** roma/ai-editor-core · **Rollback-tag:** byyou-start-ai-editor
**Архітектура:** схвалена Ромою. AI→draft(cms_articles)→Алла схвалює→sync публікує. Плагіни за інтерфейсами, ядро незмінне.

## Принципи
- НЕ переписувати `parse_rss.py` (живий) — обгортати за інтерфейсами. Старий новинний бот працює далі.
- `sinks/cabinet` потребує `SUPABASE_SERVICE_ROLE_KEY` (Вова ще не вставив) → `sinks/queue` (файл) як fallback, перемикання через config/env.
- Фото — Wikimedia (протестовано); публікація свята за 7 днів як ЧЕРНЕТКА (не авто).
- НЕ чіпає сайт (src/index/style/sw) → CACHE_NAME не потрібен.

## План (12 кроків)
| # | Крок | Стан |
|---|------|------|
| 1 | `docs/AI_EDITOR_ARCH.md` — повна архітектура (системний артефакт, дизайн перед кодом) | 🔴 арх |
| 2 | `editor/core/models.py` (Draft) + `__init__.py` пакетів | 🟢 |
| 3 | `editor/core/registry.py` (реєстр плагінів) + `config.py` (місії) | 🟢 |
| 4 | `editor/core/spend.py` — лічильник (порт з ai_news_agent) | 🟢 |
| 5 | `editor/core/pipeline.py` — оркестратор Source→Read→Filter→Write→Image→Sink | 🟢 |
| 6 | `editor/sources/` base + `calendar.py` (свята за 7 днів з holidays.json) | 🟢 |
| 7 | `editor/images/` base + `wikimedia.py` + `og.py` (реюз) | 🟢 |
| 8 | `editor/writers/ai_writer.py` — AI пише статтю свята + точний англ. image_query | 🟢 |
| 9 | `editor/sinks/` base + `queue.py` (fallback) + `cabinet.py` (Supabase draft) | 🔴 сховище |
| 10 | `editor/missions/holidays.yml` + `editor/run.py` (CLI) + readers/filters тонкі обгортки | 🟢 |
| 11 | `.github/workflows/editor-holidays.yml` (cron щодня, dry за замовч.) | 🟢 |
| 12 | Тест-блок: dry-run пілот 3 свята (queue-sink, без ключів) + py_compile + /audit + реліз-нотатки | 🟡 |

## Оцінка
~12 кроків, багато дрібних py-файлів. Обсяг великий (новий пакет). Якщо контекст дійде 75% — сторож поставить paused, продовжимо свіжим чатом.

## Де зупинились
✅ Усі 12 кроків виконано. 3 коміти: `df20b1b8` арх-док, `d3919bae` пакет+workflow, `fce1691e` укр-запит. Тести зелені (py_compile, конвеєр наскрізь на 4 святах, image-плагін, queue-sink+дедуп). **Чекаю «деплой».**

## Реліз-нотатки — Блок 1 AI-редактора
**ЩО ЗМІНИЛОСЬ:**
- Новий пакет `editor/` — платформа-редактор (ядро pipeline + плагіни за інтерфейсами) + `docs/AI_EDITOR_ARCH.md`.
- Місія «Свята»: за 7 днів до свята AI пише статтю+підбирає фото (Wikimedia, укр. запит) → ЧЕРНЕТКА в кабінет Алли (`cms_articles` draft) або файл-fallback без ключа.
- Workflow `editor-holidays.yml` (cron щодня). Лічильник витрат — у той самий `data/ai_spend.json`.
- Старий новинний бот НЕ чіпано. Сайт (src/index/style/sw) НЕ чіпано → CACHE_NAME не потрібен.

**ЩО МОЖЕ ЗЛАМАТИСЬ:** нічого видимого на сайті (це бекенд-пакет). Бойовий запис у кабінет — лише коли Вова дасть `SUPABASE_SERVICE_ROLE_KEY`; доти sink чемно пропускає.

**ЩО ПЕРЕВІРИТИ:** (сайт не міняється) — після ключа Вови + ручного запуску `editor-holidays.yml` → у кабінеті зʼявиться чернетка свята з фото; у лічильнику витрат — новий рядок.
