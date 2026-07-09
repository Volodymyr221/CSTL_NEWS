# BYYOU_PLAN — стан потоку /byyou (CSTL)

**Статус:** active
<!-- idle=вимкнено · active=потік іде (push-замок УВІМКНЕНО) · paused=пауза · done=завершено -->

**Ціль:** БАТЧ 1 плану 09.07 — AI-агент: зупинити витрати ($5 з'їдено) + якість (п.5,6,7). Системний фікс. Python → git→Actions (НЕ site, CACHE не чіпаємо).
**Власник:** Рома · **Гілка:** `claude/new-session-3k5u9n` · **Rollback-tag:** `byyou-start-agent`
**Майстер-план 18 задач:** `PLAN_2026-07-09_batch.md` (це батч 1/8).

> **Корінь (розвідка):** `call_agent` (ai_news_agent.py:437) `urlopen(timeout=420)` = socket read-timeout → великий пакет (4 статті+6 пошуків) не встигає → виняток (440-446) → usage=0 → `if not arts` (859) робить ПЛАТНИЙ повтор, а Anthropic рахує перерваний виклик. Це причина: подвійна плата + «$0-лічильник» + стеля $15 не спрацювала на ~$5.

## Кроки
| # | Крок | Файл | Стан |
|---|------|------|------|
| 1 | Retry-класифікація: мережа/таймаут → backoff-повтор ТОГО САМОГО запиту (idempotent, max 2); `build_prompt`-переписування ЛИШЕ коли текст прийшов але 0 валідних. Це вбиває платний подвійний виклик | `scripts/ai_news_agent.py:841-879` | 🟢 |
| 2 | BATCH_MAX 4→2 (менша відповідь, менший ризик таймауту) | `ai_news_agent.py:56` | 🟢 |
| 3 | Стрімінг SSE (`"stream":true`) у call_agent — connection живе, немає 420с single-read; usage з message_start/message_delta; pause_turn-цикл зберегти; **fallback на non-stream якщо парс SSE впаде** | `ai_news_agent.py:399-460` | 🟢 |
| 4 | Облік вартості при обірваному виклику (не $0): оцінка max_tokens×ціна як «підозра на списання» щоб breaker бачив ризик; `.get()` уніфікація | `ai_news_agent.py:158-192,440-446` | 🟢 |
| 5 | Стелі: MAX_MONTH_COST_USD 15→4; breaker рахує таймаут-оцінку | `ai_news_agent.py:62-63,819-843` | 🟢 |
| 6 | Кап чернеток на ВСЮ чергу draft (не лише type=news) | `ai_news_agent.py:716-737` | 🟢 |
| 7 | Свято-sink дедуп: `CabinetSink` GET ?title&event_date перед POST (як QueueSink) — ідемпотентність проти щоденного крону × 7-денне вікно | `editor/sinks/cabinet.py:21-49` | 🟢 |
| 8 | Фото: прибрати зашитий приклад «Софійський собор» (ai_writer.py:48-49); pipeline ПОВАЖАЄ holidays.json `image` (не перезатирає image.find коли є) | `editor/writers/ai_writer.py`, `editor/core/pipeline.py:41`, `editor/images/wikimedia.py` | 🟢 |
| 9 | py_compile усіх змінених .py + перевірка гілок логіки (dry, без живого API) | — | 🟢 |
| 10 | Реліз-нотатки + БРАМА ДЕПЛОЮ («деплой» → PR→merge; жива валідація = наступний крон, спостерігати spend) | — | 🟡 |
| 11 | 🔴 Supabase (Вові/окрема сесія): UNIQUE(title,event_date,type) SQL + чистка 16 наявних чернеток — SQL-файл+чеклист, НЕ виконую | — | 🔴 |

## Де зупинились
Старт Батчу 1. План складено, чекаю «ок» на брамі старту.

## Реліз-нотатки
(заповнити перед деплоєм)
