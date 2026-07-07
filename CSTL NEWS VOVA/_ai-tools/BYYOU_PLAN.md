# BYYOU_PLAN — стан потоку /byyou (CSTL)

**Статус:** active
<!-- idle=вимкнено · active=потік іде (push-замок УВІМКНЕНО) · paused=пауза · done=завершено -->

**Ціль:** БЛОК 2 AI-редактора — кабінет: редагування чернеток (усіх типів) + АВТОПОСТИНГ на дату/час.
**Власник:** Рома · **Гілка:** roma/editor-cabinet · **Rollback-tag:** byyou-start-cabinet

## Знахідки коду (реальні)
- `admin.html saveArticle` форсить `type:'news'` → редагування свята зламало б тип (фікс: зберігати type).
- `sync_cms.fetch_ready` бере лише `type=eq.news` → свята/події не публікуються. Розкладу (publish_at) нема.
- Кабінет: статуси draft→ready→published; `fetchArticles` бере всі типи (свята видно), але форма — лише news.

## Принципи
- Реюз sync_cms (додати розклад+маршрутизацію, не переписувати). Живий тест кабінету — за ключем Вови+логіном → будую готово, вмикається на його діях.
- admin.html не в sw.js → CACHE_NAME не потрібен.

## План (11 кроків)
| # | Крок | Стан |
|---|------|------|
| 1 | SQL `scripts/supabase_editor_scheduling.sql` — колонка `publish_at timestamptz` + індекс (Вова запустить) | 🔴 схема |
| 2 | admin.html `saveArticle` — зберігати наявний `type` при редагуванні (фікс бага свят) | 🟢 |
| 3 | admin.html форма: контрол розкладу «Опублікувати зараз / Запланувати» + `datetime-local` → status+publish_at | 🟢 |
| 4 | admin.html `ART_STATUS` + `scheduleArticle(id, whenISO)` → status=`scheduled`, publish_at | 🟢 |
| 5 | admin.html список: бейдж типу (свято/подія/новина) + показ дати автопостингу + дія «Запланувати» | 🟢 |
| 6 | 🔴 РІШЕННЯ маршрутизації: куди публікувати свята/події (events.json?) — спитати Рому | 🔴 арх |
| 7 | `sync_cms.py`: `promote_scheduled()` — scheduled→ready коли publish_at<=now | 🟢 |
| 8 | `sync_cms.py`: маршрутизація за типом — news→articles.json (є), holiday/event→events.json | 🟢 |
| 9 | workflow: cms-sync частіше (розклад) АБО новий scheduled-publisher.yml | 🟢 |
| 10 | Тести: due-логіка локально (мок), admin.html JS node --check, py_compile | 🟡 |
| 11 | Реліз-нотатки | 🟢 |

## Оцінка
~11 кроків. admin.html (велике) + sync_cms. Живий кабінет-тест — за Вовою. Контекст сесії вже чималий — якщо 75%, сторож поставить paused, продовжимо свіжим чатом.

## Де зупинились
✅ Кроки 1-5 (SQL міграція `publish_at` + кабінет UI: контрол автопостингу, фікс type, бейджі) — `e8380c6c`. ✅ Крок 7 (`promote_scheduled` → автопостинг Новин-Громада) — закоммічено. JS-синтаксис/py_compile зелені.
🔴 **ЗАБЛОКОВАНО на кроці 6** — чекаю рішення Роми: куди публікувати свята/події (A: `data/events.json` / B: `data/shotam.json`). Після відповіді: крок 8 (маршрутизація holiday/event у публікаторі) + крок 9 (частота cms-sync.yml) + тести + реліз-нотатки.

## Реліз-нотатки
(заповнити у кроці 11)
