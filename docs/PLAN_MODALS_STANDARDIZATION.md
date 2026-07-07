# План: стандартизація модалок (Потік C) — ВІДКЛАДЕНО

> Статус: **відкладено** (Рома, 07.07.2026). Записано щоб не загубити. Виконувати окремим `/byyou`-потоком — це ~14 екранів, потрібен посмоук кожного.

## Мета
У застосунку **немає спільного компонента модалки** — кожна фіча має власну (createElement + backdrop + swipe-to-close). ~14 різних реалізацій, ≥5 різних стилів закриття. Треба:
1. Створити один спільний примітив модалки (напр. `src/core/modal.js` + `style/modal.css` розширити) з єдиною поведінкою: backdrop, свайп-вниз, ESC, `modal-open` body-lock, єдина анімація, єдина шапка (заголовок + одна кнопка закриття).
2. Перевести ВСІ 14 модалок на нього.

## Інвентар модалок (з аудиту коду 07.07 — file:line)
| Модалка / клас | Файл:рядок | Примітки |
|---|---|---|
| Article modal `.article-modal` | `index.html` + `src/app.js:67-151`; CSS `style/modal.css` | єдина «modal.css», лише стаття |
| Board ad modal `.cm-board-modal` | `src/tabs/community-modal.js:87` | свій backdrop, swipe |
| Discussion chat modal `.bd-chat-modal` | `src/tabs/board.js` (openChatModal) | fullscreen, keyboard-aware |
| Disc sheets `.disc-sheet` (Мої/Збережені/Створити) | `src/tabs/board.js` (openDiscSheet) | НОВЕ (Потік A) — уже напів-стандарт |
| Ad zoom sheet `.cm-board-modal--sheet` | `src/tabs/board.js:1308` | окремо від compose |
| Reaction popup `.bd-react-popup` | `src/tabs/board.js:738` | anchored popover |
| Photo lightbox `.cm-photo-lightbox` | `src/tabs/board.js:901` | fullscreen |
| Disc actions sheet `.pm-actions` | `src/tabs/board.js:690` | bottom-sheet |
| Private chat backdrop `.pm-backdrop` | `src/core/chat-core.js:33` | overlay |
| Private chat lightbox `.pm-lightbox` | `src/tabs/board-chat.js:141` | fullscreen |
| Account modal `.acc-modal` | `src/core/account-ui.js:38` | overlay |
| Sidebar info modal `.sidebar-info-modal` | `src/core/sidebar.js:118` | overlay |
| Weather modal `.wx-modal` | `src/tabs/community-blocks.js:241` | overlay |
| Power help modal `.pw-help-modal` | `src/tabs/power.js:466` | overlay |
| Saved-routes modal `.sr-modal` | `src/tabs/buses.js:1994` | overlay |

- CSS модалок розкидано: `style/modal.css` (лише стаття) + `community.css`, `events.css`, `sidebar.css`, `account.css`, `buses.css`, `messages.css`, `power.css`, `news.css`.
- Спільне: `document.body.classList.add('modal-open')` (майже всюди) — точка для єдиного body-lock.

## Підхід (пропозиція)
1. **Спочатку примітив, не міграція:** зробити `openModal({title, bodyHtml, onMount, variant})` (variant: sheet/fullscreen/popover) + єдиний CSS. Не ламати наявні поки не готовий.
2. **Мігрувати по одній**, кожну — посмоук у браузері (Chromium /qa-explore) + на iPhone. Починати з простих overlay (weather, power, sidebar, account), потім складніші (chat, board compose).
3. **Ризик:** chat modal і board compose — keyboard-aware + swipe + realtime; чіпати обережно, окремими кроками.
4. **Реюз `.disc-sheet`** (Потік A) як базу для sheet-варіанту — вона вже близька до стандарту.

## Обсяг
Завеликий для одного потоку (14 екранів × посмоук). Розбити на 2-3 підпотоки: (C1) примітив + прості overlay; (C2) sheets/compose; (C3) chat/lightbox/popover.
