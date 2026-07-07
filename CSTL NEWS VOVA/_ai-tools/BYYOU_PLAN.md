# BYYOU_PLAN — стан потоку /byyou (CSTL)

**Статус:** active
<!-- idle=вимкнено · active=потік іде (push-замок УВІМКНЕНО) · paused=пауза · done=завершено -->

**Ціль:** 🟡-знахідки повного аудиту 07.07 — 5 точкових фіксів: профаніті-хиба 'еб' (ebook/ebay), dead-end гостя в чаті обговорення, doSave не перевіряє публікацію, CabinetSink губить source_url, SQL-drift схеми кабінету.
**Власник:** Рома · **Гілка:** roma/audit-fixes · **Rollback-tag:** byyou-start-audit

## Знахідки коду (реальні, перечитано 07.07)
- `src/core/utils.js:183` — стем `'еб'` + гомогліфи (e→е, b→б) блокує ebook/ebay/ebola/ebony. `'єб'/'їб'` безпечні (є/ї не з латині).
- `src/tabs/board.js:582` — гість у модалці чату бачить кнопку `#bd-chat-login` «Увійдіть, щоб писати» — перевірити обробник + що після входу модалка оживає (форма зʼявляється).
- `admin.html:1038` — `if (publish && !scheduling) await publishArticle(savedId);` — результат НЕ перевіряється (RLS-відмова = мовчазне «опубліковано» яке бреше). Рядок 911 перевіряє — зробити однаково.
- `editor/sinks/cabinet.py:32` — пише `source:"CSTL LIFE", exclusive:True`, а `draft.source_urls` ДРОПАЄ. Колонка `source_url` в схемі Є (SQL:93). sync_cms уже читає її (рядок 141).
- `scripts/supabase_editor_cabinet.sql:83,98` — CHECK без 'scheduled' (status) і 'holiday' (type); Вова ВЖЕ виконав ALTER у БД вручну — git відстає. Фікс git-only, БД не чіпаємо.

## Кроки
| # | Крок | Стан |
|---|------|------|
| 1 | Follow-up деплою PR#253: cms-sync зелений, УСІ 3 статті в табло (20:31). «Метельне» вийшла теж — розклад загубив баг №1 до фіксу | ✅ |
| 2 | Гілка `roma/audit-fixes` від origin/main (9b1367c4) + тег `byyou-start-audit` | ✅ |
| 3 | utils.js: стем 'еб' → довші ('ебал','ебан','ебат','ебут','ебуч','ебну'…) — ebook/ebay/ebola/ebony більше не блокує | 🟢 |
| 4 | test_profanity.mjs: + кейси (pass: ebook/ebay/ebola/ebony; block: ебало/ебан/ебать) → прогнати ВСІ | 🟢 |
| 5 | board.js: гість → CTA «Увійдіть, щоб писати» — обробник + оновлення модалки після входу | 🟢 |
| 6 | admin.html: doSave перевіряє результат publishArticle (алерт при відмові) | 🟢 |
| 7 | cabinet.py: писати source_url = перший із draft.source_urls (колонка є; нічого не губимо) | 🟢 |
| 8 | SQL git-only: CHECK +'scheduled' +'holiday' у supabase_editor_cabinet.sql (БД НЕ чіпаю — Вова вже застосував) | 🟢 |
| 9 | CACHE_NAME у sw.js (src/* змінено) + node --check усіх .js + py_compile | 🟢 |
| 10 | Смоук: /qa-explore дошка/чат гостем (fail-soft: node --check + ручний iPhone) | 🟡 |
| 11 | Реліз-нотатки + SESSION_STATE/BOARD → брама деплою | 🟢 |

## Принципи
Корінь, не симптом · мінімальні точкові правки (без рефакторів) · БД не чіпаємо (git-only док) · тести до і після.

## Де зупинились
План складено, чекаю «ок» власника (брама старту).

## Реліз-нотатки
(заповнюється у Фазі 3)
