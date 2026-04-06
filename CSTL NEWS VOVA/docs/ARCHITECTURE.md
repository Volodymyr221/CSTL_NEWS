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
├── index.html                    # Весь UI (структура сторінки)
├── style.css                     # Всі стилі
├── sw.js                         # Service Worker (офлайн-кешування)
├── build.js                      # esbuild конфіг (8 рядків)
├── package.json                  # Залежності (тільки esbuild)
├── bundle.js                     # Генерується автоматично — НЕ редагувати
│
├── data/                         # Контент (JSON файли)
│   ├── articles.json             # Масив статей/новин
│   ├── events.json               # Афіша подій
│   └── schedule.json             # Розклад автобусів
│
├── src/                          # Вихідний код (source code)
│   ├── app.js                    # Точка входу — імпортує всі модулі
│   ├── core/
│   │   ├── boot.js               # PWA, Service Worker ініціалізація
│   │   └── utils.js              # formatTime, escapeHtml, showToast
│   └── tabs/
│       ├── news.js               # Вкладка Новини (фільтри, картки)
│       ├── events.js             # Вкладка Події (афіша)
│       ├── buses.js              # Вкладка Автобуси (розклад)
│       └── submit.js             # Вкладка Подати новину
│
└── .github/
    └── workflows/
        └── deploy.yml            # GitHub Actions авто-деплой
```

---

## Як збирається код (build process)

```
src/app.js (точка входу)
  → імпортує src/core/boot.js
  → імпортує src/core/utils.js
  → імпортує src/tabs/news.js
  → імпортує src/tabs/events.js
  → імпортує src/tabs/buses.js
  → імпортує src/tabs/submit.js
       ↓
  node build.js (запускає esbuild)
       ↓
  bundle.js (один файл з усім кодом)
       ↓
  index.html підключає <script src="bundle.js">
```

---

## Як працює деплой (публікація)

```
git push → GitHub
    ↓
deploy.yml запускається автоматично
    ↓
npm install (встановлює esbuild)
    ↓
node build.js (збирає bundle.js)
    ↓
git commit bundle.js + push to main
    ↓
GitHub Pages деплоїть
    ↓
vshevchukkk.github.io/CSTL_NEWS (через 2-3 хв)
```

---

## Як працює PWA (встановлення на телефон)

```
Користувач відкриває сайт
    ↓
браузер бачить manifest.json (опис додатку)
    ↓
пропонує "Додати на головний екран"
    ↓
Service Worker (sw.js) кешує файли
    ↓
сайт відкривається як додаток, навіть офлайн
```

**CACHE_NAME** (назва кешу) — версія кешу. Змінюй при кожному деплої:
`cstl-YYYYMMDD-HHMM` → наприклад `cstl-20260407-1430`

---

## Як завантажуються дані (data flow)

```
Браузер відкриває сайт
    ↓
fetch('./data/articles.json') — запит за файлом
    ↓
articles.json повертає масив статей
    ↓
news.js рендерить (малює) картки на екрані
    ↓
користувач натискає фільтр → filterArticles() → renderNews()
```

**Стратегія кешування для data/*.json:**
- Спочатку мережа (щоб завжди свіжі дані)
- Якщо немає інтернету → кеш (збережена версія)

---

## Що взято з NeverMind (і чому)

| Рішення | Файл в NeverMind | Файл в CSTL NEWS | Навіщо |
|---------|-----------------|-----------------|--------|
| PWA setup | src/core/boot.js | src/core/boot.js | Встановлення на телефон + iOS фікси |
| Service Worker | sw.js | sw.js | Офлайн-кешування |
| esbuild конфіг | build.js | build.js | Збірка модулів в один файл |
| GitHub Actions | auto-merge.yml | deploy.yml | Авто-деплой при пуші |
| animateTabSwitch | src/core/boot.js | src/app.js | Плавні переходи між вкладками |
| formatTime | src/core/utils.js | src/core/utils.js | "5 хв тому", "2 год тому" |
| escapeHtml | src/core/utils.js | src/core/utils.js | Захист від XSS атак |

**Що НЕ взято з NeverMind:**
- localStorage для даних — не підходить для публічного контенту
- AI inbox логіка — це для продуктивності, не для медіа
- Модулі tasks/habits/finance — не наша функціональність
- Cross-tab sync — не потрібен для новинного сайту

---

## Майбутня архітектура (Фаза 3)

Для push-сповіщень і акаунтів потрібен **Firebase** (Google backend-as-a-service):

```
Firebase Auth     → реєстрація/вхід користувачів
Firebase Firestore → база даних (заплановані поїздки)
Firebase Functions → scheduled jobs (автоматичні завдання за часом)
Firebase FCM      → push-сповіщення на телефон
```

Це окремий великий крок — не для MVP.
