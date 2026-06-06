# Стан сесії — CSTL LIFE

**Оновлено:** 2026-06-06 (Автобуси: транзитні рейси через громаду + захист від порожнього schedule.json)
**Архів попередніх сесій:** `_ai-tools/SESSION_ARCHIVE.md`

---

## 🟢 Поточний стан

| | |
|--|--|
| **URL сайту** | https://volodymyr221.github.io/CSTL_NEWS/ |
| **Репозиторій** | https://github.com/Volodymyr221/CSTL_NEWS |
| **Робоча гілка (поточна сесія)** | `claude/gracious-hopper-jM8vC` |
| **Production-гілка** | `main` — мердж тільки через `/finish` (PR → squash → auto-deploy) |
| **Власник** | Вова Шевчук (GitHub: Volodymyr221) |
| **CACHE_NAME у `sw.js`** | `cstl-20260606-0015` |

### Видимі вкладки (порядок у tab-bar)
**Автобуси** · **Дошка** · **ГРОМАДА** (центр, піднята кнопка) · **Події** · **Новини**

Світло — приховано з tab-bar 16.05 (наразі не актуально, код у `src/tabs/power.js` збережено, повертається розкоментуванням у `src/app.js` і у nav-меню).

### 🔒 ТАБ-БАР — ФІНАЛЬНІ ПАРАМЕТРИ (04.06.2026)

**Загальний таббар (`.tab-bar`):**
- `border-radius: 20px 20px 0 0` — заокруглені верхні кути
- `border-top: 1px solid var(--border)` — тонка сіра лінія зверху
- `box-shadow: 0 -4px 20px rgba(0,0,0,0.10), 4px 0 12px rgba(0,0,0,0.06), -4px 0 12px rgba(0,0,0,0.06), 0 4px 12px rgba(0,0,0,0.06)` — тінь з усіх чотирьох боків
- `overflow: visible` — щоб коло ГРОМАДИ виступало над баром

**Звичайні вкладки (`.tab-item`):**
- Іконка: 22×22px, підпис: 10px, font-weight 600, uppercase
- Неактивні: `color: var(--gray)`
- Активні: `color: var(--red)`

**Центральна кнопка ГРОМАДА (`.tab-item--home`):**
- `height: var(--tabbar-h)`, `justify-content: flex-end`, `padding-bottom: 8px`

**Коло (`.tab-home-circle`):**
- Розмір: `52×52px`, `border-radius: 50%`
- Колір: `background: var(--red)`
- Позиція: `position: absolute; bottom: 28px`
- Тінь неактивна: `box-shadow: 0 4px 14px rgba(114,47,55,0.5), 0 -5px 18px rgba(114,47,55,0.25)`
- Тінь активна: `box-shadow: 0 5px 14px rgba(114,47,55,0.6), 0 -6px 18px rgba(114,47,55,0.25)`
- `z-index: 1001`

**Іконка замку всередині кола:**
- Файл: `icons/castle-icon.png`
- Розмір: `77×77px`, `object-fit: contain`
- `overflow: hidden` на колі — обрізає іконку по формі кола

**Біла дуга зверху кола (`::after`):**
- `width: 58px; height: 58px; border-radius: 50%`
- `border: 3px solid var(--white)`
- `position: absolute; bottom: 25px` — центрується по колу
- `clip-path: inset(0 0 31px 0)` — обрізає рівно на рівні верху таббару
- `z-index: 1000` (нижче кола, щоб тінь кола перекривала основу дуги)

**Підпис ГРОМАДА (`.tab-label--home`):**
- `font-weight: 800`, `font-size: 12px`, `letter-spacing: 0.5px`, uppercase
- Колір: успадковує від `.tab-item` (сірий/бордовий як всі інші)

### Дизайн
**D2 «Поле»** — натуральні землі (paper/sky/mint/honey/peach), кольорові градієнти блоків, м'які тіні, радіус 22px. **Бренд бордо `#722F37`** (theme-color iOS, splash, лого, активна вкладка, CTA). CSTL NEWS → CSTL LIFE у всіх user-facing.

---

## 🚌 Модуль «Автобуси» — фінальний стан (06.06.2026)

### ✅ Зроблено у сесії 05.06.2026

**Hero-картка v4 (блок відстеження):**
- Фонове фото `images/bus-hero2.png` + темний оверлей
- Статус (очікується/в дорозі/прибув) + назва маршруту + капсула часу
- Smooth-swipe: статичні елементи (іконка автобуса, рамка капсули) не мигають;
  тільки `.bhv4-dyn` (динамічні — назва, час, статус) плавно fade-in/out
- Шкала прогресу маршруту внизу картки
- Відфільтровані `cancelled` (скасовані) маршрути — не потрапляють у hero

**Пошук маршруту:**
- Поля «Звідки» (червона крапка) / «Куди» (SVG pin) + swap-кнопка (горизонтальні стрілки ← →)
- Кнопка скидання «✕» — маленький круглий `.bs-clear-btn` у рядку пошуку
- `getOrderedStops(route)` — визначає правильний напрям по назві маршруту (не по порядку зупинок у JSON)
- `matchesSearch()` використовує `getOrderedStops` → правильно фільтрує «Личани → Луцьк»
- Якщо немає рейсів — empty state (порожній стан) «на сьогодні рейсів не заплановано»

**Розклад:**
- Заголовок «РОЗКЛАД АВТОБУСНИХ МАРШРУТІВ» — чорний, **16.5px**, по центру, тінь, fading-underline
- Під заголовком (між текстом і лінією) — **«Оновлено: HH:MM | DD.MM.YYYY»**, 10px, `var(--ink-mute)`
- Відступ під víджетом: `padding-bottom: 8px`; відступ заголовку: `padding: 26px 16px 26px`
- Нижній блок «VOPAS» — тільки рядок джерела, `padding-bottom: 24px`
- Фон вкладки `#ECEEF2` — тільки `#page-buses`
- Hero-блок — `box-shadow` (тінь)

**UX/стиль (06.06.2026):**
- Фон вкладки — `#ECEEF2` (димчастий синювато-сірий, замінив `#F0F2F5`)
- Порожній стан: `radial-gradient` центр→краї + бордовий текст `#722F37` uppercase + `margin-bottom: 12px`
- Кнопка «Показати всі / Сховати минулі» — над заголовком «РОЗКЛАД АВТОБУСНИХ МАРШРУТІВ»
- Кнопка «Сховати минулі ↑» — `position: sticky`, липне під панеллю пошуку при скролі
- Checkpoint: `buses-gray-v1` (SHA `a47ff79`) у `backup/CHECKPOINTS.md`

**Парсер VOPAS:**
- Cron `*/30 * * * *` (кожні 30 хвилин) у `.github/workflows/vopas-parser.yml`
- Cache-bust: `schedule.json?v=${Math.floor(Date.now()/60000)}` щоб CDN не тримав старі дані

**Фікси загальні (всі вкладки):**
- `overscroll bounce (iOS rubber-band)` — `.app-main` отримує `data-tab` при кожному
  переключенні та при завантаженні. CSS `[data-tab="buses"] { background: #F0F2F5 }`
  → overscroll показує правильний сірий колір (не беж body)
- `.page { padding-bottom: 20px }` — таб-бар більше не перекриває останній контент

### ✅ Зроблено 06.06.2026 (сесія 2)

**Транзитні рейси:**
- `parse_vopas.py`: рейси де назва «чужа» (Луцьк-Львів, Луцьк-Студені тощо), але from/to запиту локальні → тепер включаємо з `"transit": true`
- `parse_vopas.py`: захист — якщо після фільтрації `routes=[]`, не перезаписуємо `schedule.json` (лишаємо старий)
- `buses.js`: бейдж «транзит» (синій) на таких рейсах у списку
- `buses.css`: стиль `.bs-status.transit`

### 🔜 Заплановано (наступна сесія)

- **Закріпити маршрут** — кнопка «Відстежити» на картці → hero показує цей маршрут до прибуття (localStorage — локальне сховище браузера)
- **Стрілочки →/←** у hero для ручного переключення між рейсами
- **Зворотні маршрути** — VOPAS не має Личани→Луцьк як окремих рейсів; тільки транзитні; ручне додавання якщо потрібно

---

## 📅 Чим закінчилась минула сесія (16-17.05.2026)

Усі 6 Tier-ів редизайну (план з `docs/REDESIGN_OTHER_TABS_VISION.md`) завершені:

- **Tier 0** — бежевий фон body + м'які тіні замість рамок (4 вкладки)
- **Tier 1 ⚡ Світло** — приховано з tab-bar
- **Tier 2 🚌 Автобуси** — `filter-bar` `position: fixed`, зелений `#6F8E51`
- **Tier 3 📞 Контакти** — HERO «Швидка 103» з пульсуючим ореолом + 2×2 аварійні + 2 місцеві
- **Tier 4 📝 Подати оголошення** — категорії-чіпи (8 pill) + 3 фото-слоти (canvas q0.78) + live-preview
- **Tier 5 📅 Події** — календарна стрічка 21 день + 25 свят 2026 (`data/holidays.json`) + cover_emoji+gradient. Дати за новим стилем (ПЦУ реформа 2023): Різдво 24.12, Йордан 6.01, Великдень 12.04, Трійця 31.05
- **Tier 6 📰 Новини** — magazine-cover featured (Georgia serif 22px, text-shadow) + 8 CATEGORY_COLORS + 4 GEO_COLORS + золотий ексклюзив з ⭐

Інше за сесію: Дошка як окрема вкладка з Polaroid-фото і modal zoom, рідизайн бренду червоний → бордо, CSTL NEWS → CSTL LIFE, лічильник версії перенесено у шапку, auto-merge BUILD_NUM фікс (`--no-merges`), iOS Safari zoom-fix (font-size 16px на inputs).

**Гілка яку змерджили:** `claude/startup-ui-module-GWlEk` (закрита через `/finish` → auto-merge в `main`).

---

## 🟢 Фаза 9 Спринт 1 — ЗАВЕРШЕНО (18.05.2026)

Supabase production-live з реальною модерацією, реалтайм-синхронізацією і
підключеними фронт+адмінкою. Дошка громади 2.0 повноцінно працює.

### Підсумок 36 комітів за 17-18.05.2026

**Supabase інфраструктура:**
- Проект `uabyfecseqnemvcqhdem.supabase.co` (Frankfurt, Free) піднятий
- SQL-схема: `posts`, `announcements`, `ads`, `ad_events`, `admins`,
  `comments`, `reactions` + RLS policies + Storage bucket
- 5 SQL-патчів у `scripts/`:
  - `supabase_schema.sql` — повна ідемпотентна схема
  - `supabase_fix_rls.sql` — фікс catch-22 (рекурсивний `auth.email() IN admins`)
  - `supabase_comments_reactions.sql` — таблиці + cover_emoji/cover_gradient
  - `supabase_realtime.sql` — `ALTER PUBLICATION supabase_realtime ADD TABLE`
  - `supabase_set_admin_password.sql` — bcrypt пароль через SQL без email
- `scripts/migrate_to_supabase.py` — одноразова міграція JSON → posts/announcements
- Whitelist 2 адмінів у `admins`: haranin.ukraine + volodymyrshevchuk19

**Адмінка `/admin.html`** (окрема сторінка, Supabase SDK з CDN):
- Email+password auth (signInWithPassword) — спочатку був magic-link
  але впирався у Supabase rate limit (~4 листи/год на Free)
- Forgot password через magic-link → нова сторінка → Налаштування
- **6 табів:** 📋 Модерація (pending) / 🏛️ Оголошення / 📰 Опубліковані пости / 💬 Коментарі / 👥 Адміни / ⚙️ Налаштування
- Кнопка «← На сайт» (без logout, сесія тримається ~30 днів)
- Прихований вхід: 5 тапів на лого `CSTL LIFE` у шапці → /admin.html

**Реальні дані у Дошці громади 2.0:**
- localStorage реакції/коментарі → Supabase БД (всі юзери бачать спільно)
- Анонімні юзери ідентифікуються через UUID у localStorage
- Single emoji per user per post (UNIQUE post_id+user_id)
- Топ-3 emoji + лічильники на тригері, окремі лічильники у попапі
- **Supabase Realtime** через WebSocket — лайки/коментарі оновлюються
  миттєво у всіх юзерів без перезавантаження
- Optimistic updates — миттєвий UI-feedback, фоном sync з БД

**UX/UI Дошки:**
- Свайп hero фото Олики (3 фото, плавна fade 0.55s)
- Свайп міні-блоку Дошки на Громаді: 4 типи (Офіційні/Дошка/Розмови/Вітання)
- Плавна slide-in анімація (0.6s cubic-bezier easeOutQuint)
- CTA «Перейти на ...» з підхопленням активного типу
- Таб «Усі» → «Актуальні» (фільтр пости за останні 3 доби)
- Фіксований pos-bar (search+tabs+chips) — sticky→fixed (iOS Safari fix)
- iOS Safari zoom-fix для inline коментарів (font-size 14→16)

**Стиль Автобусів — серйозний табло-стиль (УЗ-станція):**
- Темний #2F3E36 фон, SF Mono бурштин для часу (#FBBF24)
- «ЧЕРЕЗ X ГОД X ХВ» — капсула з border + monospace
- border-radius 22→12, прибрано Georgia serif
- Urgent state #6B1F2A замість рожевого
- Той самий стиль перенесено у блок Громади (cm-block--bus)

**Реакції — UI:**
- 4 emoji завжди показуються → один тригер «🙂+» з попапом 8 emoji
- На тригері: топ-3 emoji з окремими лічильниками + моя виділена
- SVG-іконки save/share замість emoji (видно на всіх кольорах стікерів)
- Кнопка коментарів → inline-форма (без модалки) тільки у chat/greeting
- На board: тільки реакція в куті, save/share — у zoom-modal

**Безпека:**
- Service_role key випадково leak → ROTATE через Supabase Dashboard
- В код тільки publishable (anon) — RLS policies захищають усе
- Admin-функції через `is_admin()` SECURITY DEFINER (обходить catch-22)

**Аналітика:** GoatCounter `cstl-life.goatcounter.com` (безкоштовно)

**Фікси:**
- formatTime для null/ISO string (раніше `new Date(null) = 1 січня 1970`)
- postTime() helper — fallback ts → published_at → created_at
- cover_emoji+cover_gradient додано у posts (Вітання тепер публікуються)

### 🔒 ДОШКА — FAB кнопка (05.06.2026)
- Кнопка «Подати оголошення» → кругла FAB (Floating Action Button — плаваюча кнопка) ✏️
- `position: fixed`, `right: 18px`, `bottom: tabbar + 14px`
- Розмір: `56×56px`, `border-radius: 50%`
- Текст прихований, тільки іконка олівця по центру
- Клас: `.board-trigger--fixed` у `style/community.css`
- **⚠️ МЕНЮ ЗАФІКСОВАНО НАЗАВЖДИ — не змінювати розміри/позиції таббару**

### 🔜 Що далі (за пріоритетом)

**🔴 Найкорисніше зараз** (тільки моя робота):
1. **Фаза 9 Спринт 2** — Supabase Storage + upload фото з форми (зараз фото зберігаються як base64 — текст у БД, важко і повільно).
2. **Табло-стиль для Світла** — відкладено доки вкладка прихована з tab-bar. Дизайн-токени `.tablo-*` готові, при поверненні Світла буде швидко.

**🟡 Розвиток (потребує дій Вови):**
3. Сторінка `/реклама` — статичний прайс + контактна форма (потрібен email)
4. Перевстановити PWA на iPhone (іконка CSTL NEWS → CSTL LIFE)
5. 5 стратегічних питань з `docs/PRODUCT_STRATEGY.md`

**🟢 Опційно:**
6. Cross-fade для дошки (2 контейнери одночасно як у hero)
7. Cleanup 11 старих гілок на GitHub
8. Купити власний домен `olyka.news` / `cstl.news`

### 🟡 Незабаром
4. **Pre-revenue groundwork** — Plausible.io або Goatcounter (аналітика DAU/MAU). Без цифр нема перших переговорів з рекламодавцями. Деталі: `docs/MONETIZATION.md`
5. **Web Share API** — `sharePost()` у `utils.js` + кнопка 📤 на статтях, папірцях, подіях. Деталі: BACKLOG секція «Стратегія віральності»
6. **CSTL LIFE icon на робочому столі iPhone** — Вова має перевстановити PWA щоб назва оновилась з CSTL NEWS (iOS кешує при install)
7. **Реальні фото свят** — або Unsplash API з ключем, або руками у `images/holidays/`. Wikipedia блокує hotlinking з 403

### 🟢 Пізніше
8. **Cleanup 10 старих гілок** на origin (9 `claude/*` + 1 `codex/*`) — через GitHub UI
9. **cron-job.org** — точніший 30-хв cron для RSS-парсера (GitHub безкоштовний має lag 5-30 хв)
10. **Нові волинські RSS-джерела** замість видалених Суспільне Волинь / Укрінформ

---

## 🔔 НАГАДУВАННЯ ВОВІ

У `docs/PRODUCT_STRATEGY.md` секція «Стратегічні питання до Вови» — **5 питань** які блокують стратегічне планування:

1. Чи готовий зробити особисті візити поіменно? (голова сільради, директори шкіл, ФАП, церкви)
2. Чи включати друковану газетку як стратегічний інструмент?
3. Чи ставитись до додатку «офіційно» (зобовʼязання, не хобі)?
4. Чи ОК ризик конфлікту з владою? Незалежний рупор чи рупор сільради?
5. Чи готовий шукати співавтора-редактора з громади?

Відповіді розблоковують Фази 10-13 у ROADMAP.

---

## ⚙️ Ключові архітектурні рішення (не змінювати без обговорення)

1. **А+ деплой** — `actions/deploy-pages@v4`, нічого не комітить у `main` з CI
2. **`bundle.js` у git** як робоча база (варіант Б)
3. **Двогілковий потік** — робота на `claude/start-session-XXX`, мердж у `main` через `/finish`
4. **Хук `stop-hook-git-check.sh`** — не чіпати (фіча, не баг)
5. **Лічильник версії** — `sed` у `deploy.yml`, формат `v{N} · DD.MM HH:MM` (Київ), у шапці біля погоди
6. **CACHE_NAME у `sw.js`** — bump при КОЖНІЙ зміні `src/`, `index.html`, `style*`, `sw.js`. Чисто `.md`/`.claude/` зміни — НЕ чіпати
7. **Автобуси — зупинки з офіційних квитків VOPAS** — не вигадувати km/ціни
8. **RSS-парсер** — cron 30 хв (`0,30 * * * *`), ліміт 15/джерело, MAX_ARTICLES=150
9. **`.filters-bar` — `position: fixed`** (не sticky!) — баг iOS Safari з `height:100%` на body
10. **Auto-merge BUILD_NUM** — `git rev-list --count --no-merges HEAD` (інакше +2 на merge-комітах)
11. **`data-tab` на `.app-main`** — виставляється при старті і при кожному `switchTab()`. CSS використовує для overscroll фону.

---

## 📰 RSS-парсер — поточний стан

### Активні джерела (7 штук)
| Джерело | Geo | Тип | Статус |
|---------|-----|-----|--------|
| Волинь Post | Волинь | RSS | ✅ Працює |
| Конкурент | Волинь | RSS | ✅ Працює |
| Українська правда | Україна | RSS | ✅ Активно поповнює |
| Українська правда (Світ) | Світ | RSS | ✅ Активно поповнює |
| Район.Ківерці /tags/olika | Олика | HTML | ✅ Чекає нових постів |
| Олицька громада `/news/` | Олика | gromada | ✅ Через Cloudflare Worker |
| Олицька громада `/ogoloshennya-...` | Олика | gromada | ✅ Через Cloudflare Worker |

### Видалені (нероботоздатні)
| Джерело | Причина |
|---------|---------|
| Суспільне Волинь | DNS-блок з GitHub Actions |
| Укрінформ Волинь | Зламаний XML |
| Укрінформ Світ | Зламаний XML |

### Cloudflare Worker (проксі)
- **URL:** `https://cstl-proxy.volodymyrshevchuk19.workers.dev`
- **Акаунт:** `volodymyrshevchuk19@gmail.com`
- **Код:** `cloudflare/worker.js`
- **Навіщо:** GitHub Actions IP блокується сайтом громади → Worker має інші IP

### Логіка парсера
- `fetch_rss()` — Chrome BROWSER_UA + `response_headers` → `feedparser.parse(raw, response_headers=...)`
- Дедуплікація: `sourceUrl` + нормалізований заголовок
- `content:encoded` → якщо < 600 символів → `fetch_full_article()`
- `classify_entry()` → EVENT_KEYWORDS + майбутня дата → `events.json` або `articles.json`
- Cron `0,30 * * * *` (GitHub безкоштовний lag 5-30 хв)

---

## 🗞️ Модалка новини — стан

| Функція | Статус |
|---------|--------|
| Sticky-header (рисочка + × + гео•категорія) | ✅ |
| `top: var(--header-h)`, не перекриває шапку | ✅ |
| Свайп вниз → закрити | ✅ |
| Клікабельне джерело | ✅ чорне, `font-weight: 600` |
| Повна стаття | ✅ `content:encoded` + `fetch_full_article()` |
| Футер «Автор публікації» + «Читати оригінал →» | ✅ |
| Magazine-cover featured (Tier 6) | ✅ Georgia serif 22px, text-shadow, плавніший градієнт |
| Кольорові бейджі (Tier 6) | ✅ 8 CATEGORY_COLORS + 4 GEO_COLORS + золотий ексклюзив |

---

## 🔧 Хуки Claude Code

| Хук | Подія | Що робить |
|-----|-------|-----------|
| `~/.claude/stop-hook-git-check.sh` | Stop | Нагадує закомітити |
| `.claude/hooks/pre-edit-read-check.js` | PreToolUse Edit | Блокує Edit без попереднього Read (exit 2) |
| `.claude/hooks/cache-name-reminder.sh` | PostToolUse Edit/Write | Нагадує bump CACHE_NAME після критичних файлів |
| `.claude/hooks/context-warning.sh` | UserPromptSubmit | ⚠️ 800K / 🔴 900K токенів |
| `.claude/settings.json` PostToolUse | Edit/Write | `node --check` для `.js` |
| `scripts/check-imports.js` | у `build.js` | Перевірка імпортів перед esbuild |

---

## ⚡ Модуль «Світло» — стан

- `data/power.json` — 11 міст/сіл Олицької ОТГ, DEMO дані
- Приховано з tab-bar 16.05 (код збережено, повертається розкоментуванням)
- Потребує Supabase для реальних даних (Фаза 3)

## 📋 Модуль «Дошка громади 2.0» — стан (17.05.2026)

- **5 табів зверху:** 🔄 Усі · 🛒 Дошка · 💬 Розмови · 🎉 Вітання · 💾 Мої
- **3 типи карток:**
  - `board` — стікер на корку (як було), з категоріями (продам/куплю/...)
  - `chat` — горизонтальна картка з аватаркою (буква з імені у кольоровому кружечку), текстом, хештегами
  - `greeting` — святкова картка з emoji-обкладинкою (8 пресетів) + «Кому» + текст
- **Пошук** зверху (debounce 180мс) — по text/title/author/tags
- **Категорії-чіпи** — другий ряд для табу board (9 категорій)
- **Реакції (новий UI)** — кнопка-капсула «🙂+» зліва під карткою → тап відкриває popup з 8 emoji. Single emoji per post у `localStorage['cstl-reactions-v1']`.
- **Коментарі** — кнопка «💬 N» → bottom-sheet модалка. `localStorage['cstl-comments-v1']`.
- **Збережені** — SVG-іконка закладки (outline → filled+бордовий при saved) → таб «Мої»
- **Share** — SVG-іконка iOS-style.
- **Submit-форма з перемикачем типу:** board/chat/greeting + різні поля + LIVE-preview для всіх 3
- **Backend:** Supabase `posts` таблиця

## 🔐 Адмінка `/admin.html` (актуальне на 18.05.2026)

Окрема сторінка для модерації Дошки. Inline CSS+JS, Supabase SDK з CDN. Адреса: `https://volodymyr221.github.io/CSTL_NEWS/admin.html`.

- **Email+password login** через `supa.auth.signInWithPassword()`
- **6 табів:** 📋 Модерація / 🏛️ Оголошення / 📰 Опубліковані / 💬 Коментарі / 👥 Адміни / ⚙️ Налаштування
- **Прихований вхід:** 5 тапів на лого `CSTL LIFE` → /admin.html

---

## 📚 Стратегічні документи (контекст продукту)

- `docs/PRODUCT_STRATEGY.md` — «цифрова інфраструктура громади» (як Дія для Олики), 5 груп, 3 рівні цінності, 4 hook-механізми
- `docs/COMMUNITY_BOARD_VISION.md` — Дошка 2.0 «OLX для громади», 5 спринтів, стратегія віральності
- `docs/MONETIZATION.md` — 4 джерела доходу, етапи 2026-2027, схема `ads`, принцип «юзери > монетизація»
- `docs/REDESIGN_OTHER_TABS_VISION.md` — План редизайну (Tier 0-6 завершено), 12 правил для бабусь

Нові фази у ROADMAP:
- Фаза 8.5 — Редизайн усіх вкладок (Tier 0-6) ✅
- Фаза 9 — Дошка громади 2.0 (Supabase + 3 типи постів)
- Фаза 10 — Інфраструктура громади (Влада / Документи / Установи / Церква / Бізнеси / Тарифи / Соцпідтримка)
- Фаза 11 — Спільнота (опитування, краудфандинг, хроніка, коментарі)
- Фаза 12 — Push + AI (Firebase + Telegram-бот)
- Фаза 13 — Друк і офлайн (газетка + QR-коди)
