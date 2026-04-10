# ARCHITECTURE.md — Технічна архітектура CSTL NEWS

---

## Технічний стек (набір технологій)

| Технологія | Що це | Навіщо |
|-----------|-------|--------|
| Vanilla JS | Чистий JavaScript без фреймворків | Просто, швидко, без залежностей |
| GitHub Pages | Безкоштовний хостинг від GitHub | Нульова вартість, просто деплоїти |
| GitHub Actions | Автоматичний CI/CD (система деплою) | Пушиш → сайт оновлюється сам |
| esbuild | Збирач коду (bundler) | Збирає всі JS файли в один bundle.js |
| PWA | Progressive Web App — встановлюється на телефон | Відкривається як додаток, працює офлайн |
| JSON файли | Формат зберігання даних | Прості для редагування, не потрібна БД |

---

## Структура файлів

```
CSTL_NEWS/
├── index.html                    # Весь UI (структура сторінки) + плейсхолдер лічильника версії
├── style.css                     # Всі стилі
├── sw.js                         # Service Worker (офлайн-кешування)
├── build.js                      # esbuild конфіг (8 рядків)
├── package.json                  # Залежності (тільки esbuild)
├── bundle.js                     # Згенерований автоматично — комічу як базу (варіант Б)
├── logo.png                      # Логотип для splash-заставки
│
├── data/                         # Контент (JSON файли)
│   ├── articles.json             # Масив статей/новин (змішаний: авто RSS + ручні)
│   ├── curated.json              # Ручні ексклюзиви Олики (не затирається автоматикою)
│   ├── events.json               # Афіша подій
│   ├── schedule.json             # Розклад автобусів
│   └── power.json                # Графіки світла (з'явиться у Фазі 3)
│
├── src/                          # Вихідний код (source code)
│   ├── app.js                    # Точка входу — імпортує всі модулі
│   ├── core/
│   │   ├── boot.js               # PWA, Service Worker ініціалізація
│   │   ├── utils.js              # formatTime, escapeHtml, showToast, formatEventDate
│   │   └── weather.js            # Віджет погоди в шапці (Open-Meteo API)
│   └── tabs/
│       ├── news.js               # Вкладка Новини (фільтри, картки, модалка статті)
│       ├── events.js             # Вкладка Події (афіша)
│       ├── buses.js              # Вкладка Автобуси (розклад + "через X хв")
│       └── submit.js             # Вкладка Подати новину/оголошення
│
├── .github/
│   └── workflows/
│       └── deploy.yml            # GitHub Pages Actions Deploy (варіант А+)
│
├── docs/                         # Документація проекту
│   ├── CONCEPT.md                # Концепція і ціль
│   ├── ARCHITECTURE.md           # Цей файл
│   ├── ROADMAP.md                # Фази і пріоритети
│   ├── CONTENT_STRATEGY.md       # Звідки беремо новини, як публікуємо
│   ├── RULES.md                  # Процес роботи з Claude
│   ├── DESIGN_SYSTEM.md          # UI-патерни
│   └── NEVERMIND_PATTERNS.md     # Патерни взяті з NeverMind
│
└── _ai-tools/
    ├── SESSION_STATE.md          # Поточний стан сесії
    └── BACKLOG.md                # Єдиний пріоритезований список задач
```

---

## Як збирається код (build process)

```
src/app.js (точка входу)
  → імпортує src/core/boot.js
  → імпортує src/core/weather.js
  → імпортує src/core/utils.js
  → імпортує src/tabs/news.js
  → імпортує src/tabs/events.js
  → імпортує src/tabs/buses.js
  → імпортує src/tabs/submit.js
       ↓
  node build.js (запускає esbuild)
       ↓
  bundle.js (один файл з усім кодом, IIFE формат)
       ↓
  index.html підключає <script src="bundle.js">
```

---

## Як працює деплой — варіант А+ (офіційний GitHub Pages Actions)

**Критично важливо зрозуміти різницю від попереднього підходу:**

### Старий підхід (видалений, бо ламався):
```
git push → deploy.yml запускається → node build.js → commit bundle.js в main → push → GitHub Pages деплоїть
```
**Проблема:** CI комітив у `main`, і якщо `main` встиг отримати інші коміти — виникав "non-fast-forward" конфлікт. Це був баг B-01.

### Новий підхід А+:
```
git push → deploy.yml запускається
    ↓
npm install + node build.js (в пам'яті CI, не в git)
    ↓
sed -i "заміна плейсхолдера лічильника версії на свіжу дату"
    ↓
actions/upload-pages-artifact@v3 (завантажує ВСЕ як artifact — пакунок файлів)
    ↓
actions/deploy-pages@v4 (деплоїть artifact прямо на GitHub Pages)
    ↓
volodymyr221.github.io/CSTL_NEWS/ (2-3 хв)
```

**Переваги А+:**
- **Нічого не комітить у `main`** — немає конфліктів non-fast-forward
- Офіційний підхід від GitHub — менше саморобного коду у workflow
- Не потребує `git pull --rebase` магії
- Лічильник версії оновлюється всередині artifact, не в git-файлі

**Вимога (одноразово):**
```
Settings → Pages → Build and deployment → Source = GitHub Actions
```
Без цього деплой не потрапить на хостинг.

---

## Лічильник версії і часу деплою

**Призначення:** щоб власник (Вова) міг швидко побачити — "а чи дійсно пройшов останній деплой?".

**Як працює:**
1. У `index.html` є плейсхолдер:
   ```html
   <div class="deploy-stamp">v1 · 01.01 00:00</div>
   ```
2. `deploy.yml` має крок:
   ```yaml
   - run: |
       DEPLOY_TIME=$(TZ='Europe/Kyiv' date '+%d.%m %H:%M')
       sed -i "s|v[0-9]* · [0-9][0-9]\.[0-9][0-9] [0-9][0-9]:[0-9][0-9]|v1 · ${DEPLOY_TIME}|" index.html
   ```
3. sed (stream editor — потоковий редактор тексту) знаходить рядок з шаблоном `v1 · DD.MM HH:MM` і замінює на актуальний час.
4. `sw.js` для `index.html` використовує **network-first** стратегію — спочатку мережа, потім кеш. Інакше кеш PWA може показувати старий лічильник.

**Стиль:** 9px, сірий, центр, знизу. Ненав'язливо. Видно тільки якщо придивитись.

---

## Як працює PWA (встановлення на телефон)

```
Користувач сканує QR-код → браузер відкриває сайт
    ↓
боотст-код в boot.js створює manifest.json через Blob URL
    ↓
браузер пропонує "Додати на головний екран"
    ↓
Service Worker (sw.js) кешує файли
    ↓
сайт відкривається як додаток, навіть офлайн
```

**CACHE_NAME** (назва кешу) — версія кешу. Змінюй при кожному деплої **коду**:
`cstl-YYYYMMDD-HHMM` → наприклад `cstl-20260410-1600`

**Виняток:** якщо змінювались тільки `*.md` файли — `CACHE_NAME` не чіпати.

**Стратегії кешу в `sw.js`:**

| Шлях | Стратегія | Чому |
|------|-----------|------|
| `./index.html` | **network-first** | Щоб лічильник версії завжди свіжий |
| `./style.css`, `./bundle.js`, `./logo.png` | **cache-first** | Не змінюються часто, економимо запити |
| `./data/*.json` | **network-first** | Новини і розклад мають бути свіжими |
| зовнішні (`api.open-meteo.com`, RSS-джерела) | **network-only** | Завжди свіже з мережі |

---

## Як завантажуються дані (data flow)

```
Браузер відкриває сайт
    ↓
fetch('./data/articles.json') — запит за файлом
    ↓
articles.json повертає масив статей (змішаний авто+ручний)
    ↓
news.js сортує за ts, бере перший як featured, решта як row
    ↓
news.js рендерить (малює) картки на екрані
    ↓
користувач натискає фільтр → filterArticles() → renderNews()
```

**Окремо:** `data/curated.json` — ручні ексклюзиви Олики, мерджаться з `articles.json` на рівні автоматичного парсера, щоб збереглись між оновленнями.

---

## Архітектура стрічки новин (Фаза 2)

Деталі у `docs/CONTENT_STRATEGY.md`. Технічно:

```
┌─ Джерела ─────────────────────────────────┐
│                                            │
│  RSS:                                      │
│  - volyn24.com                             │
│  - volynnews.com                           │
│  - suspilne.media/volyn                    │
│  - volynpost.com                           │
│  - pravda.com.ua                           │
│  - suspilne.media                          │
│  - ukrinform.ua                            │
│                                            │
│  Ручне:                                    │
│  - data/curated.json (редаговано в GitHub)│
│                                            │
└────────────┬───────────────────────────────┘
             │
             ↓
┌─ GitHub Actions cron (щогодини) ──────────┐
│  scripts/fetch_news.py                     │
│                                            │
│  1. Отримати RSS з кожного джерела         │
│  2. Нормалізувати у стандартну структуру   │
│  3. Застосувати фільтр (whitelist/blacklist)│
│  4. Дедуплікувати (схожі заголовки → 1)    │
│  5. Обмежити ліміти:                       │
│     - Волинь: до 10/день                   │
│     - Україна: до 5/день топ                │
│  6. Мерджити з curated.json                │
│  7. Записати у data/articles.json          │
│  8. git commit + push → auto-deploy       │
└────────────┬───────────────────────────────┘
             │
             ↓
┌─ Фронтенд: src/tabs/news.js ──────────────┐
│  fetch('./data/articles.json')             │
│  Сортування за ts (новіші вгорі)           │
│  Групування за geo: Олика / Волинь / ...   │
│  Featured = найсвіжіший ексклюзив Олики    │
└────────────────────────────────────────────┘
```

---

## Що взято з NeverMind (і чому)

Без змін — див. `docs/NEVERMIND_PATTERNS.md`.

---

## Майбутня архітектура (Фаза 6)

Для push-сповіщень і акаунтів потрібен **Firebase** (Google backend-as-a-service):

```
Firebase Auth     → реєстрація/вхід користувачів
Firebase Firestore → база даних (заплановані поїздки, обрані райони світла)
Firebase Functions → scheduled jobs (автоматичні завдання за часом)
Firebase FCM      → push-сповіщення на телефон
```

Це окремий великий крок — не для поточних фаз.
