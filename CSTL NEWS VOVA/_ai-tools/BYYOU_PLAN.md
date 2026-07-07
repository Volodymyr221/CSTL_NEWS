# BYYOU_PLAN — стан потоку /byyou (CSTL)

**Статус:** active
<!-- idle=вимкнено · active=потік іде (push-замок УВІМКНЕНО) · paused=пауза · done=завершено -->

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
Старт. План складено, чекаю виконання кроку 1 (arch doc).

## Реліз-нотатки
(заповнити у кроці 12)
