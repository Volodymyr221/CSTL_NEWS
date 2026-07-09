# ПЛАН РОБІТ 2026-07-09 — батч задач Роми (18 пунктів)

> Складено з 7 паралельних агентів-розвідників (реальний код + claude-api скіл для агента). Гілка `claude/new-session-3k5u9n`. Через `/byyou`, батчами (кожен батч = окремий деплой зі скрінами перед пушем). Джерело деталей — цей файл; агент-транскрипти в scratchpad.

## 🎯 КЛАСИФІКАЦІЯ ДЕПЛОЮ
- **Фронт (деплою цю сесію, звичайний PR):** батчі 1-7 (візуал Громади, модалки, FAB, збережені, push-фронт P-5/8/9).
- **Python-агент (деплою через git→GitHub Actions):** батч 8 (код агента).
- **🔴 Заблоковано Supabase (окрема авторизована сесія / Вова):** P-2 жива публікація Edge Function; чистка 16 чернеток у кабінеті; UNIQUE-міграція; Б5 контакти-адмінка.
- **Контент (Рома):** п.4 — переписати 4 свята-статті (чекає уточнення).

## 🤝 КРОС-ЗОНА (познач Вові в PR, принцип BOARD п.5)
- Батч 6 (FAB) — `board.js`/`community.css` = зона Вови, на Обговореннях (зона Роми).
- Батч 7 (збережені) — `buses.js` = зона Вови.
- Push P-2 — Edge Function, деплой за Вовою.

---

## ПОРЯДОК ВИКОНАННЯ (батчі за пріоритетом)

### 🤖 БАТЧ 1 — AI-агент: зупинити витрати + якість (п.5,6,7) — ПЕРШИЙ (горить)
_Файли: `scripts/ai_news_agent.py`, `editor/*`. Python → git→Actions. Ізольовано від фронту._
- **Корінь витрат:** пакет б'ється об таймаут 420с (`call_agent` 399-460, ретёрн нулів 440-446) → `if not arts` (859) робить ПЛАТНИЙ повтор; Anthropic рахує перерваний виклик. **Фікс:** стрімінг/офіційний SDK (usage приходить навіть при обриві), розділити мережеву-повтор (той самий запит, backoff) від JSON-переписування; BATCH_MAX 4→2.
- **record_spend $0:** ціни ВІРНІ ($3/$15, звірено claude-api). $0 лише на таймаут-рядках (usage=0). Рахувати вартість при обірваному клієнті; уніфікувати `.get()`.
- **Стелі:** місячну $15→$3-5 (реально ~$5); спільний лічильник обох агентів; рахувати таймаут-виклики в breaker.
- **Ліміт 16 чернеток:** `count_cabinet_drafts` (716-737) рахує лише `type=news` → свято-чернетки невидимі; свято-sink `CabinetSink` (editor/sinks/cabinet.py:21-49) БЕЗ дедупу/капу + `CalendarSource` (calendar.py:31) віддає свято на кожен день 7-денного вікна × щоденний крон = дублі. **Фікс:** кап на ВСЮ чергу draft; дедуп у CabinetSink (GET title+event_date, як QueueSink) + UNIQUE(title,event_date,type) 🔴SQL.
- **Зимове фото (п.5):** промпт `ai_writer.py` 48-49 зашиває «Софійський собор»; `wikimedia.find` (19-44) бере перший результат без сезон-фільтра; ІГНОРУЄ наявне `image` в holidays.json (9015). **Фікс:** прибрати зашитий приклад; поважати holidays.json `image` (не перезатирати через image.find); або сезон-ре-ранк.
- 🔴 Supabase: чистка вже наявних 16 чернеток + UNIQUE-міграція → Вові/окрема сесія.

### 🖼 БАТЧ 2 — Табло + Hero + скрол (п.2,10,11) — фронт, скріни
_Файли: `style/community.css`, `src/tabs/community.js`._
- **п.2 кроп hero:** `object-position: center 38%` (css:713) ріже низ → зсунути донизу (~`center 62%`/bottom); узгодити `.cm-hero` height (660) + `.cm-hero-spacer` 180px (701) щоб низ фото сів на верх картки; зменшити беж `.cm-hero::after` height:90px (687) щоб не з'їдав відкритий низ.
- **п.2 блюр:** `.cm-hero-blurband` + `wireHeroBlur()` (community.js:239-274). Щільніше: `backdrop-filter blur(9→14px)` (681), маска `#000 14%→6%` (683). Нижче: JS-cap `h=Math.min(MAX,heroH-top)` (266). Табло НЕ чіпати.
- **п.10 скрол-зона:** `.cm-news-feed` (css:3497) вже overflow+`overscroll-behavior:contain`; шапка/фільтри вже сиблінги ЗОВНІ. Лишилось: винести бокові `padding:0 6px 8px` (3508) з feed на не-overflow батька `.cm-block-body`, щоб рамка скролила сторінку.
- **п.11 кути:** додати `border-radius:14px` на `.cm-news-feed` (3497) → заокруглений clip карток.

### 🌦 БАТЧ 3 — Модалка погоди (п.12,13,14) — фронт, мокап+скріни
_Файли: `src/tabs/community-blocks.js` (openWeatherDayModal 223-271, wxLineChart 167-197, wxBarChart 200-216), `style/community.css`._
- **п.12:** X кожні 2 год: `i%3→i%2` (wxLineChart:183, wxBarChart:209,211). Права шкала t°: `padR 6→24` (168) + Y-тіки [min,mid,max].
- **п.14 опади:** білий→синій `#2F80FF`+градієнт (213); темніша підкладка під барами.
- **п.13 скрабер:** pointer-events на `.wx-chart-svg-wrap`+`setPointerCapture`; інверсія `x(i)`→година→значення; HTML-оверлей readout+іконка; `weather_code` ВЖЕ тягнеться (110-114) → іконка через `weatherCodeInfo`. Спільна лінія на обох графіках.
- **п.14 свайп-закриття:** реюз патерну `community-modal.js:130-165` (поріг 90px) на `.wx-sheet`; `setPointerCapture` розв'язує конфлікт скрабер↔свайп.

### 🔀 БАТЧ 4 — Події: фото з статті + перенаправлення (п.8) — фронт
_Файли: `src/tabs/community-blocks.js`, `src/tabs/events.js`._
- **Корінь:** `renderEventBlock` map (761,774) ВИКИДАЄ `image`+`id`. events.json має `image`; свята нема (fallback emoji); статті всі з фото.
- **Фікс фото:** пробросити `id,image` у item; `evSlideHtml` (792) рендерить `<img>` (реюз events.js cardHtml:97 + onerror handleEvImgError:249); свято без image → emoji-градієнт.
- **Фікс тапу:** експортувати `openShotamModal`→`window.openShotam` (events.js:129); у evSlideHtml `data-switch-tab="shotam"` → `data-shotam-id="${it.id}"` + делегований `openShotam(id)` (свята id 9001+ теж у allEvents).
- (Дошка-віджет ⚠️ тап→вкладка не на пост — відкладено, окремо.)

### 📰 БАТЧ 5 — Модалка статті: іконки зверху (п.3) — фронт
_Файли: `index.html:151-160`, `src/tabs/events.js:161-197`, `src/tabs/news.js:180-215`, `style/modal.css`, `style/events.css`._
- 3 top-іконки в `.modal-sticky-header`: 📤 share (`sharePost`), 🔔 нагадування (`downloadIcs`, ЛИШЕ події/свята з date), 🔖 зберегти (**НОВЕ localStorage-сховище** `cstl_saved_articles` — для статей save нема; опційно підключити до saved-hub).
- Прибрати великі `.ev-ics-btn`+`.share-btn--inline`; мертвий CSS `.ev-ics-btn` видалити.

### ➕ БАТЧ 6 — FAB-анімація (п.9) — фронт, крос-зона Вові
_Файл: `style/community.css`._
- **Корінь:** `backdrop-filter` на `.board-fab-label`/`.board-fab-ic` (1645,1666) + одночасний `transform` translate+scale на `.board-fab-item` (1627-1631) → WebKit-привид (два макети). **Фікс:** прибрати `transform` з `.board-fab-item` (лишити opacity+delays) АБО прибрати backdrop-filter. + побічне: `.board-fab.open .board-trigger--fixed` (1685) перефарбовує червону кнопку в біле скло — прибрати/пом'якшити.

### 🔖 БАТЧ 7 — Спільні «Збережені» + автобуси (п.1) — фронт, крос-зона Вові
_Файли: `src/tabs/buses.js`, `src/core/saved-hub.js`, `index.html:37-43`, `src/app.js`._
- Експортувати `getSavedRoutesForUI` (buses.js:1845) + нова `openSavedRouteOnBuses(rid,date,from,to)` (busDay/fromStop/toStop + renderRouteList + scrollIntoView `[data-track-id]`).
- saved-hub.js `loadInto` (46): додати секцію 🚌 (data-shub-bus + data-rid/date/from/to), виправити гілку `if(!ids.length)return` (49) щоб автобуси рендерились без post-закладок; тап → switchTab('buses')+openSavedRouteOnBuses.
- Прибрати `#saved-routes-btn` (index.html:37-40) + `initSavedRoutesHeader` виклик (app.js:213). **⚠️ ПАСТКА:** ця функція ще ЗАВАНТАЖУЄ рейси (`loadTrackedRoute`+`hydrateTrackedFromDB`+onAuthChange) — не викинути; перенести завантаження в initBuses або лишити функцію без DOM-частини. Прибрати `openSavedModal/renderSavedRows/updateSavedBadge` + CSS `.sr-*`.

### 🔔 БАТЧ 8 — Push-блок (P-5,8,9 фронт + P-2 код) — фронт + Edge
_Файли: `src/tabs/board-chat.js` (НЕ messages-ui.js!), `sw.js`, `supabase/functions/send-chat-push/index.ts`._
- **P-5** (фронт): board-chat.js:1121 мовчить → нова `ensureChatPush()` в `openChat` (58), реюз дозволу buses.js:133-158 (винести VAPID+urlBase64 у спільне).
- **P-8** (фронт): sw.js:159 вже постить `__cstl:push`; слухач board-chat.js:1140 лише бейдж → додати банер/тост при pushType chat/group (+ додати title/body/thread_id у postMessage sw.js).
- **P-9** (фронт): sw.js showNotification data лише {url} → додати thread_id (166); notificationclick (174) postMessage `notif-click`; нова `openThreadById` (fetchMyThreads → openChat). `openChatById` (board.js) = за postId, НЕ підходить.
- **P-2** (🔴 Edge, `supabase functions deploy send-chat-push`): select+`photo_url` (49); `bodyText=msg.text||(photo_url?'📷 Фото':'')` (73). Груповий `send-group-push` = еталон. Код закомічу; жива публікація за Вовою.

---

## КОНТЕНТ (п.4) — чекає уточнення Роми
Переписати 4 останні свята-статті. ❓ holidays.json описи чи cms-чернетки? які 4? хто пише текст?

## Оцінка
18 пунктів, 8 батчів. Кожен батч = окремий деплой зі скрінами/мокапом перед пушем (де UI). Порядок: горить агент(1) → візуал Табло(2) → погода(3) → події(4) → модалка(5) → FAB(6) → збережені(7) → push(8).
