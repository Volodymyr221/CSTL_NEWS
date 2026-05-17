# Стан сесії — CSTL LIFE

**Оновлено:** 2026-05-17 (підготовка до Supabase: B-15+B-21 закриті, дані під схему `posts`, Web Share API, `/install.html`, `scripts/migrate_to_supabase.py`)
**Архів попередніх сесій:** `_ai-tools/SESSION_ARCHIVE.md`

---

## 🟢 Поточний стан

| | |
|--|--|
| **URL сайту** | https://volodymyr221.github.io/CSTL_NEWS/ |
| **Репозиторій** | https://github.com/Volodymyr221/CSTL_NEWS |
| **Робоча гілка (поточна сесія)** | `claude/start-session-XXX` — створюється автоматично при старті |
| **Production-гілка** | `main` — мердж тільки через `/finish` (PR → squash → auto-deploy) |
| **Власник** | Вова Шевчук (GitHub: Volodymyr221) |
| **CACHE_NAME у `sw.js`** | `cstl-20260517-1330` (оновити при наступній зміні коду) |

### Видимі вкладки (порядок у tab-bar)
**Громада** (головна-дашборд) · **Дошка** · **Новини** · **Події** · **Автобуси**

Світло — приховано з tab-bar 16.05 (наразі не актуально, код у `src/tabs/power.js` збережено, повертається розкоментуванням у `src/app.js` і у nav-меню).

### Дизайн
**D2 «Поле»** — натуральні землі (paper/sky/mint/honey/peach), кольорові градієнти блоків, м'які тіні, радіус 22px. **Бренд бордо `#722F37`** (theme-color iOS, splash, лого, активна вкладка, CTA). CSTL NEWS → CSTL LIFE у всіх user-facing.

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

## 🔜 Що далі (за пріоритетом)

### 🔴 Зараз — підготовка до Supabase ЗАВЕРШЕНА ✅
Усі код-хвости перед Supabase закриті за сесію 17.05:
- B-15 + B-21 (event delegation замість inline onclick)
- Picsum URL прибрані з `community-board.json`
- JSON-схема узгоджена з майбутньою таблицею `posts` (поля `type`/`status`/`location`/`published_at`)
- Web Share API + кнопки 📤 на 3 поверхнях (стаття/Дошка/подія)
- `/install.html` для PWA-інструкції на iPhone/Android
- `scripts/migrate_to_supabase.py` з SQL-схемами `posts`+`announcements`+`ads`

### ⛔ Заблоковано тобою — потрібні дії Вови щоб рухатись далі
1. **Зареєструватись на Supabase** (https://supabase.com) — створити проект, дати:
   - `SUPABASE_URL` (https://xxxxxx.supabase.co)
   - `anon-key` (public — для фронтенду)
   - `service_role-key` (admin — для адмінки та міграції)
2. **Архітектурні рішення** перед Спринтом 1 (4 питання — описано окремо)
3. **Plausible.io / Goatcounter** — зареєструватись для аналітики DAU/MAU
4. **Контактний email** для форми `/реклама` (Pre-revenue groundwork)
5. **5 стратегічних питань** з `docs/PRODUCT_STRATEGY.md`

### 🟡 Можу зробити паралельно (поки чекаю Supabase)
6. **Сторінка `/реклама`** — статичний HTML з прайсом (потребує твого email для контакту)
7. **Адмінка `/admin` UI** — макет HTML/CSS без бекенду (підключимо Supabase коли буде ключ)

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

## 🚌 Модуль «Автобуси» — стан

- Пошук Звідки→Куди, акордеон зупинок, smart-рядок, дні тижня (`isDayActive`)
- **Без** en-route трекінгу (відкочено)
- Tier 2: `filter-bar` `position: fixed`, колір зелений `#6F8E51`

## ⚡ Модуль «Світло» — стан

- `data/power.json` — 11 міст/сіл Олицької ОТГ, DEMO дані
- Приховано з tab-bar 16.05 (код збережено, повертається розкоментуванням)
- Потребує Supabase для реальних даних (Фаза 3)

## 📋 Модуль «Дошка» — стан

- Окрема вкладка з 16.05 (винесено з блоку Громади)
- Корковий фон, кольорові папірці з нахилами і шпильками, Polaroid-фото (тестові з Picsum)
- Modal zoom стікера (окрема модалка-копія, не FLIP-scale)
- Submit через bottom-sheet з категоріями-чіпами + 3 фото-слотами + live-preview (Tier 4)
- Backend: заглушка, чекає Supabase (Фаза 9)

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
