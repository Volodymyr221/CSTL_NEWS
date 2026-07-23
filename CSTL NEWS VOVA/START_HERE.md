# START HERE — Точка входу для кожного нового чату CSTL NEWS

> **Читай цей файл ПЕРШИМ. Завжди.**

---

## 🎯 Обов'язкове читання на початку кожної сесії (в такому порядку)

| # | Файл | Що дає |
|---|------|--------|
| 1 | `_ai-tools/SESSION_STATE_VOVA.md` | Поточний стан: що зроблено, що в процесі, що далі |
| 2 | `_ai-tools/BACKLOG.md` | Єдиний пріоритезований список задач — головне джерело істини |
| 3 | `CSTL_BUGS.md` | Відомі баги (🔴 критичні, 🟡 середні, 🟢 дрібні) |
| 4 | `CSTL NEWS VOVA/CLAUDE.md` | Повні правила роботи, файлова структура, система деплою |
| 5 | `ВОВА_ПРОФІЛЬ.md` | Хто такий Вова, як комунікує, як працює |

**НЕ читати на початку:**
- `bundle.js` (згенерований файл, ~470 рядків)
- `package-lock.json`
- Бінарні файли (`logo.png`, `.zip`)

---

## 📂 Ситуаційне читання (тільки коли потрібно)

| Файл | Коли читати |
|------|-------------|
| `docs/VISION.md` | ⭐ **Зведене бачення проєкту** (один екран): місія, для кого, як виграємо, 3 рівні цінності, 8 етапів, монетизація, принципи. Вхід у стратегію — читати першим зі стратегічних. |
| `RODMAP.md` | 🗺️ **Загальний стратегічний роадмап** (CASTLE LIFE, 8 етапів: MVP → тест → маркетинг → аналітика → v2/v3 → монетизація → МАРКЕТ/БАЗАР → масштабування на інші громади). |
| `_ai-tools/AUDIT_2026-07.md` | 📋 **Майстер-список задач по вкладках** (за пріоритетом MVP/V2). Джерело істини для «що робити». |
| `docs/CONCEPT.md` | Коли треба розуміти ідею, бренд, ціль проекту |
| `docs/ROADMAP.md` | Питання про пріоритети і плани на фази |
| `docs/ARCHITECTURE.md` | Зміни структури файлів, системи деплою, кешу |
| `docs/CONTENT_STRATEGY.md` | Джерела новин, фільтри, ручна публікація |
| `docs/RULES.md` | Нагадати собі правила якщо забув |
| `docs/DESIGN_SYSTEM.md` | UI патерни і помилки які вже були |
| `docs/PRODUCT_STRATEGY.md` | Велика ідея «цифрова інфраструктура громади» — 5 груп, 3 рівні цінності, hook-механізми |
| `docs/BOARD_FINAL_PLAN.md` | 🔴 **КРИТИЧНЕ ЗАРАЗ** — фінальна концепція Дошки (13.06.2026): чистка Вітань/Подяки, групування чіпів, кнопки контакту, Обговорення-чат, Кабінет жителя. Затверджено «Роби» |
| `docs/COMMUNITY_BOARD_VISION.md` | План «Дошка громади 2.0» — OLX-style для громади, 5 спринтів |
| `docs/MONETIZATION.md` | Як на цьому заробляти — 4 джерела, етапи 2026-2027, схема `ads` |
| `docs/REDESIGN_OTHER_TABS_VISION.md` | План редизайну Новин/Подій/Автобусів/Світла під лад Громади. 7 Tiers, 12 правил для бабусь |
| Конкретний файл з `src/` | Завжди перед змінами в цьому файлі |

---

## 🏗 Що це за проект (в одному абзаці)

**CSTL NEWS** — це **кишеньковий щоденний інструмент жителя Олики**, який замінює хаос у 10 групах Viber одним преміальним PWA-додатком (Progressive Web App — веб-додаток що встановлюється з браузера без App Store). Під-проект екосистеми **Olyka Castle** (головний бренд Вови про містечко Олика, Волинська область).

**5 вкладок:** Громада · Новини · Події · Автобуси · Світло

**Повний опис** — `docs/CONCEPT.md`.

---

## 👤 Хто такий Вова (коротко)

- **Підприємець і візіонер**, не технічний спеціаліст
- Вчиться програмуванню паралельно через цю роботу
- **Комунікує коротко**, очікує коротких відповідей
- **"Роби"** = сигнал починати код. Без "Роби" — тільки обговорення.
- **Скріншоти** — основний спосіб показати проблему
- Очікує **пояснення кожного англомовного терміну у дужках**
- Повний профіль — `ВОВА_ПРОФІЛЬ.md`

---

## 🚀 Поточний стан проекту (на 2026-06-27)

- **Фаза 1 А+ — ЗАВЕРШЕНА ✅** Сайт живий, автодеплой, лічильник версії
- **Фаза 2.1 (Новини) — ЗАВЕРШЕНА ✅** RSS-парсер, 7 джерел, cron 30 хв
- **Фаза 8 (Громада) + 8.5 (редизайн усіх вкладок) — ЗАВЕРШЕНІ ✅** бордо-бренд, CSTL LIFE
- **Дошка громади 2.0 + Supabase — ЗАВЕРШЕНА ✅** оголошення/обговорення, реакції, коментарі, фото у Storage
- **ФАЗА Б (акаунти + приватність) — ЗАВЕРШЕНА ✅ (20.06)** Google-вхід, Кабінет жителя, приватний чат покупець↔продавець (realtime+push), гейтинг дій, приватність стану + синхрон між пристроями
- **🆕 НАВІГАЦІЯ «ЧАТИ» + ПРИВАТНІ ГРУПИ — ЗАВЕРШЕНО ✅ (25-27.06)** (план `docs/CHATS_NAV_PLAN.md`)
  - Таб-бар: 🚌 Автобуси · 📋 Дошка · 🏰 Громада · 💬 **Чати** · 📰 Новини (Події→підрозділ Новин)
  - **Чати** = хаб [Повідомлення · Групи · Обговорення]. **Дошка** = чистий маркетплейс
  - **Обговорення** — повноекранний overlay поверх «Чатів» (варіант Б, 27.06): `openDiscussions()`/`closeDiscussions()` у board.js, рендер у `#disc-content` через `getBoardRoot()`
  - **Приватні групи** — повний цикл: створення, інвайти (2 типи), вступ за посиланням (hash-routing), схвалення адміна, realtime-чат, передача власника, **push учасникам** (`send-group-push`)
  - Деталі — `_ai-tools/SESSION_STATE_VOVA.md` (верхній запис ⭐ ХЕНДОВЕР)
- **Наступне 🔜** — throttle груп-push; багатший груповий чат (фото/reply/swipe/edit — RPC готові); Захід 2 (репутація+автопублікація); карусель подій у Новинах

**URL сайту:** https://volodymyr221.github.io/CSTL_NEWS/
**Гілка Фази Б:** `vova/auth-phase-b` (змерджена в `main`)
**Робоча гілка (нова сесія):** `claude/start-session-XXX` або `vova/<тема>` — мердж через `/finish`
**Репозиторій:** https://github.com/Volodymyr221/CSTL_NEWS

---

## 🔄 Як працює деплой (А+)

```
Claude комітить зміни в main
    ↓
git push origin main
    ↓
.github/workflows/deploy.yml запускається автоматично
    ↓
Ubuntu runner:
  1. npm install (esbuild)
  2. node build.js (src/ → bundle.js у пам'яті CI)
  3. sed замінює плейсхолдер на "v{run_number} · DD.MM HH:MM" (Київ)
  4. actions/upload-pages-artifact@v3
  5. actions/deploy-pages@v4
    ↓
volodymyr221.github.io/CSTL_NEWS/ оновлюється через 1-3 хв
```

## 🔄 Як працює RSS-парсер

```
GitHub Actions cron (кожні 30 хвилин: о :00 і :30)
    ↓
.github/workflows/rss-parser.yml  (concurrency: rss-parser — окрема черга)
    ↓
python scripts/parse_rss.py
  - парсить 7 джерел (Волинь × 4, Україна × 1, Світ × 2)
  - фільтрує за NATIONAL_KEYWORDS / WORLD_KEYWORDS
  - дедуплікує за URL + заголовком
    ↓
якщо є нові статті → git commit data/articles.json → git push main
    ↓
gh workflow run deploy.yml → сайт оновлюється
```

---

## 📁 Карта файлів проекту (актуальна)

```
CSTL_NEWS/
├── index.html                    # UI + плейсхолдер лічильника версії
├── style.css                     # legacy-стилі (більшість винесено у style/*.css)
├── style/                        # 8 модулів CSS після рефактору 13.05
│   ├── base.css, filters.css, news.css, events.css
│   ├── buses.css, power.css, modal.css, tabbar.css, community.css
├── sw.js                         # Service Worker, CACHE_NAME: cstl-20260517-1246
├── build.js                      # esbuild конфіг + check-imports.js
├── bundle.js                     # Згенерований, у git як робоча база
├── logo.png                      # Логотип
├── manifest.json                 # PWA manifest з PNG-іконками
├── icons/                        # PWA іконки 192/512 + maskable
├── photos/                       # Реальні фото Олики (olyka-1/2/3.jpg)
├── images/                       # Зображення під hero блоки (kino-castle, volleyball)
├── package.json                  # Одна залежність: esbuild
│
├── .github/workflows/
│   ├── deploy.yml                # GitHub Pages Deploy (А+)
│   ├── rss-parser.yml            # RSS парсер — cron 30 хв
│   └── auto-merge.yml            # claude/** → main, BUILD_NUM з --no-merges
│
├── cloudflare/worker.js          # Proxy для olytska-gromada.gov.ua
├── .mcp.json                     # Конфіг MCP Supabase (write-enabled; читається на старті сесії)
├── supabase/functions/
│   ├── send-bus-push/            # Edge Function: push про автобуси (cron щохв)
│   └── send-chat-push/           # Фаза Б: Edge Function: push про повідомлення чату
├── scripts/
│   ├── parse_rss.py              # 7 джерел, fetch_full_article, класифікатор news/event
│   ├── test_worker.py            # Тест Cloudflare Worker
│   └── supabase_*.sql            # Фаза Б: міграції (profiles, chat, RLS, saved_posts) — застосовані
│
├── data/
│   ├── articles.json             # Статті (авто RSS + ручні)
│   ├── events.json               # Події (RSS auto:true виключено зі стрічки Подій)
│   ├── holidays.json             # 25 свят 2026 з cover_emoji + cover_gradient
│   ├── schedule.json             # Розклад автобусів (10 рейсів VOPAS)
│   ├── power.json                # Графік відключень (DEMO, 11 міст ОТГ)
│   ├── community.json            # Офіційні оголошення + контакти
│   └── community-board.json      # Пости мешканців (Дошка)
│
├── src/
│   ├── app.js                    # Точка входу
│   ├── core/
│   │   ├── boot.js               # PWA + Service Worker init
│   │   ├── utils.js              # formatTime, escapeHtml, showToast, pad, todayKey, getCoords, getCityName
│   │   ├── weather.js            # Погода у шапці (Open-Meteo API)
│   │   ├── supabase.js           # Клієнт Supabase + дата-шар (пости/реакції/коментарі/чат/закладки/push)
│   │   ├── auth.js               # Фаза Б: вхід Google, currentUser, requireAuth (гейтинг), профіль
│   │   ├── account-ui.js         # Фаза Б: екрани Приєднайтесь/Профіль/Кабінет
│   │   └── messages-ui.js        # Фаза Б: приватний чат (розмова, Повідомлення, Мої оголошення)
│   └── tabs/
│       ├── community.js          # Громада — entry: рендерить вкладку + блоки
│       ├── community-blocks.js   # Блоки Громади (board, weather, bus, event, contacts)
│       ├── community-modal.js    # Bottom-sheet "Подати оголошення" з категоріями+фото
│       ├── board.js              # Дошка громади 2.0: оголошення/обговорення, реакції, коментарі, закладки, FAB
│       ├── news.js               # Новини: featured magazine-cover + кольорові бейджі
│       ├── events.js             # Події: календарна стрічка 21 день + 25 свят
│       ├── buses.js              # Розклад + smart-row + відстеження рейсів + push
│       └── power.js              # Світло (приховано з tab-bar, код збережений)
│
├── backup/                       # Точки відкату (design-v1, design-v2-pre-D2, style-D2-pre-split, community-pre-split)
│   └── CHECKPOINTS.md            # SHA точки після кожного Tier
│
└── CSTL NEWS VOVA/               # Документація і AI-інструменти
    ├── START_HERE.md             # Цей файл — точка входу
    ├── CLAUDE.md                 # Повні правила
    ├── HOT_RULES.md              # 8 болючих правил (читати першим)
    ├── ВОВА_ПРОФІЛЬ.md           # Хто такий Вова
    ├── CSTL_BUGS.md              # Список багів
    ├── _ai-tools/
    │   ├── SESSION_STATE_VOVA.md # Поточний стан сесії
    │   ├── BACKLOG.md            # Єдиний список задач
    │   ├── SESSION_ARCHIVE.md    # Архів попередніх сесій
    │   └── NEW_SESSION_PROMPT.md # Промпт для /startuem
    └── docs/
        ├── CONCEPT.md, ROADMAP.md, ARCHITECTURE.md
        ├── CONTENT_STRATEGY.md, RULES.md, DESIGN_SYSTEM.md
        ├── NEVERMIND_PATTERNS.md
        ├── PRODUCT_STRATEGY.md         # 5 стратегічних питань до Вови
        ├── COMMUNITY_BOARD_VISION.md   # План Дошки 2.0, 5 спринтів
        ├── MONETIZATION.md             # 4 джерела доходу
        └── REDESIGN_OTHER_TABS_VISION.md  # План Tier 0-6 (завершено)

.claude/hooks/
├── pre-edit-read-check.js     # Блокує Edit без попереднього Read
├── cache-name-reminder.sh     # Нагадує bump CACHE_NAME після критичних змін
├── context-warning.sh         # ⚠️ 800K / 🔴 900K токенів
└── check-imports.js           # Запускається перед esbuild у build.js
```

---

## 💬 Перша репліка Claude після читання

> "Прочитав. CSTL LIFE, робоча гілка `claude/<сесія>` (production: `main`). Вкладки видимі: Громада (головна, дашборд) · Дошка · Новини · Події · Автобуси (Світло приховано з tab-bar, код збережено). Дизайн D2 «Поле» з бордовим брендом `#722F37`. RSS-парсер кожні 30 хв, 7 активних джерел. Наступне з BACKLOG: …. Що робимо?"

---

## ⚠️ Критично важливі правила

> Щоб не дублювати — повний короткий список 8 правил живе в **одному місці**:
> `HOT_RULES.md` (читається першим за `/startuem`). Найголовніше:
> **БЕЗ «Роби» — код не чіпати** · читай код перед змінами · пояснення термінів
> у дужках · bump `CACHE_NAME` при зміні коду · оновлюй `SESSION_STATE_VOVA.md`.
