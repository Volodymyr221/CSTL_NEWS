# План: стандартизація модалок (Потік C)

> Статус: **C1 ✅ / C2 ✅ (звужено, 2/4)**. Примітив `src/core/modal.js` + `style/modal.css` (`.app-modal*`, variants `sheet`/`center`) створено й перевірено на 6 модалках (4 з C1 + 2 з C2). C2 звужено після читання реального коду — 2 з 4 цілей архітектурно непридатні для примітиву (деталі нижче). C3 лишається окремим потоком.

## Мета
У застосунку **немає спільного компонента модалки** — кожна фіча має власну (createElement + backdrop + swipe-to-close). ~14 різних реалізацій, ≥5 різних стилів закриття. Треба:
1. Створити один спільний примітив модалки (напр. `src/core/modal.js` + `style/modal.css` розширити) з єдиною поведінкою: backdrop, свайп-вниз, ESC, `modal-open` body-lock, єдина анімація, єдина шапка (заголовок + одна кнопка закриття).
2. Перевести ВСІ 14 модалок на нього.

## Інвентар модалок (з аудиту коду 07.07 — file:line)
| Модалка / клас | Файл:рядок | Примітки |
|---|---|---|
| Article modal `.article-modal` | `index.html` + `src/app.js:67-151`; CSS `style/modal.css` | єдина «modal.css», лише стаття |
| ✅ Board ad modal | `src/tabs/community-modal.js` | **C2 done** — `.app-modal--sheet.app-modal--board-compose` (свій z-index:2700 модифікатором — модалка відкривається і поверх екрана «Мої оголошення») |
| ⛔ Discussion chat modal `.bd-chat-modal` | `src/tabs/board.js` (openChatModal) | **C2 виключено (навмисно).** Прочитано реальний код: keyboard-aware realtime чат — динамічно рухає `top/height/bottom` під клавіатуру (`visualViewport` resize), жести на бульбашках (свайп-вліво=відповідь, довге натискання=меню), скрол-пігулка «нові повідомлення». Фіксована `position:fixed;inset:0` модель примітиву конфліктує з цією логікою. Не мігрувати — інша архітектура за задумом, не борг. |
| ✅ Disc sheets `.disc-sheet` (Мої/Збережені/Створити) | `src/tabs/board.js` (openDiscSheet) | **C2 done** — тонка обгортка над примітивом, сигнатура `openDiscSheet(opts)→close`+`onMount(sheet,close)` незмінна (4 виклики). Знайдено й виправлено TDZ-баг (`close` читався в `onMount` до завершення деструктуризації). |
| ⛔ Ad zoom sheet `.cm-board-modal-note`+`openAdModalStandalone` | `src/tabs/board.js:1506-1620` | **C2 виключено (навмисно).** Прочитано реальний код: це ДВІ дубльовані реалізації — `expand()` (FLIP-морфінг: картка «виростає» в модалку за координатами джерела) + `openAdModalStandalone()` (той самий вигляд без картки-джерела, вхід ззовні). Автор свідомо задублював, щоб не чіпати робочий морфінг («не чіпати робочу Дошку» — коментар у коді). Морфінг несумісний з примітивом (немає підтримки «росту з елемента»); форсувати означало б ламати робочу анімацію заради однаковості — погана угода. |
| Reaction popup `.bd-react-popup` | `src/tabs/board.js:738` | anchored popover |
| Photo lightbox `.cm-photo-lightbox` | `src/tabs/board.js:901` | fullscreen |
| Disc actions sheet `.pm-actions` | `src/tabs/board.js:690` | bottom-sheet |
| Private chat backdrop `.pm-backdrop` | `src/core/chat-core.js:33` | overlay |
| Private chat lightbox `.pm-lightbox` | `src/tabs/board-chat.js:141` | fullscreen |
| ✅ Account modal | `src/core/account-ui.js` | **C1 done** — `.app-modal--center`, власний API `openModal(innerHtml)` лишився тонкою обгорткою |
| ✅ Sidebar info modal | `src/core/sidebar.js` | **C1 done** — `.app-modal--sheet` (+`--doc` для Політики) |
| ✅ Weather modal | `src/tabs/community-blocks.js` | **C1 done** — `.app-modal--sheet.app-modal--weather`, графіки/скрабер не чіпались |
| ✅ Power help modal | `src/tabs/power.js` | **C1 done** — `.app-modal--sheet`. UI недоступний живому юзеру (кнопка «Світло» прихована з 16.05.2026, `index.html:192`) — код перевірено, живий смоук неможливий |
| ~~Saved-routes modal~~ `.sr-modal` | — | **видалено повністю** (Батч 7, Б7.3, 10.07) — функціонал переїхав у хаб «Збережені» (`shub-sheet`), інвентар був застарілий |

- CSS модалок розкидано: `style/modal.css` (лише стаття) + `community.css`, `events.css`, `sidebar.css`, `account.css`, `buses.css`, `messages.css`, `power.css`, `news.css`.
- Спільне: `document.body.classList.add('modal-open')` (майже всюди) — точка для єдиного body-lock.

## Підхід (пропозиція)
1. **Спочатку примітив, не міграція:** зробити `openModal({title, bodyHtml, onMount, variant})` (variant: sheet/fullscreen/popover) + єдиний CSS. Не ламати наявні поки не готовий.
2. **Мігрувати по одній**, кожну — посмоук у браузері (Chromium /qa-explore) + на iPhone. Починати з простих overlay (weather, power, sidebar, account), потім складніші (chat, board compose).
3. **Ризик:** chat modal і board compose — keyboard-aware + swipe + realtime; чіпати обережно, окремими кроками.
4. **Реюз `.disc-sheet`** (Потік A) як базу для sheet-варіанту — вона вже близька до стандарту.

## Обсяг
Завеликий для одного потоку (14 екранів × посмоук). Розбито на підпотоки:
- **C1 ✅ done (10.07.2026):** примітив (`src/core/modal.js`+`style/modal.css`) + 4 прості overlay (Power/Sidebar/Account/Weather). Заодно знайдено й виправлено критичний баг: коментар у `modal.css` містив буквальний `*/`, який "з'їдав" правило `.app-modal { position: fixed }` — без живого Playwright-тесту з перевіркою bounding-box це лишилось б непоміченим (класи/текст-асерти проходили, але модалка рендерилась поза екраном).
- **C2 ✅ done звужено (10.07.2026), 2/4:** Board ad modal + Disc sheets мігровано. Discussion chat modal і Ad zoom sheet свідомо ВИКЛЮЧЕНО з примітиву — прочитано реальний код і виявилось що обидва мають архітектуру фундаментально несумісну з generic-модаллю (keyboard-aware realtime / FLIP-морфінг картки), а не просто "ще не дійшли руки". Заодно знайдено й виправлено TDZ-баг у `openDiscSheet` (кидав ReferenceError при кожному відкритті).
- **C3 (не почато):** chat/lightbox/popover — Reaction popup, Photo lightbox, Disc actions sheet, Private chat backdrop/lightbox. Приватний чат (`board-chat.js`) теж імовірно keyboard-aware realtime, як Discussion chat modal — при плануванні C3 спершу прочитати реальний код, не покладатись на цей інвентар.
