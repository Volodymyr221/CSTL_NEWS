# CSTL NEWS — Project Blueprint

> **Для ШІ-асистентів та розробників:** цей файл — повний технічний опис проекту.
> Читати перед будь-якими змінами. Актуальний станом на 09.04.2026.

---

## 1. Що це за проект

**CSTL NEWS** — локальна медіа-платформа для містечка Олика (Волинська область, Україна).
Під-проект екосистеми **Olyka Castle** (власник: Вова / GitHub: Volodymyr221).

**Мета:** єдине місце де житель Олики знаходить місцеві новини, афішу подій, розклад автобусів.

| | |
|--|--|
| **Живий сайт** | https://volodymyr221.github.io/CSTL_NEWS/ |
| **Репозиторій** | https://github.com/Volodymyr221/CSTL_NEWS |
| **Стек** | Vanilla JS (чистий JS без фреймворків), esbuild, GitHub Pages, PWA |
| **Деплой** | Автоматичний через GitHub Actions при пуші в `main` |
| **Мова UI** | Українська |

---

## 2. Стиль та Брендинг

### 2.1 Кольорова палітра (CSS змінні)

```css
:root {
  --red:        #C41E3A;   /* основний акцент — кнопки, активні стани, заголовок NEWS */
  --red-dark:   #9e1830;   /* hover/active стан червоних кнопок */
  --black:      #1a1a1a;   /* основний текст, заголовки */
  --gray:       #666666;   /* другорядний текст, підписи, дати */
  --gray-light: #f5f5f5;   /* фони чіпів, кнопки закриття модалки */
  --border:     #e5e5e5;   /* лінії-роздільники, межі карток */
  --white:      #ffffff;   /* фон сторінки і карток */
}
```

### 2.2 Кольори категорій подій (Events)

| Категорія | HEX-код | Де використовується |
|-----------|---------|---------------------|
| Культура | `#9b59b6` | мітка категорії + ліва смуга картки |
| Спорт | `#2ecc71` | мітка категорії + ліва смуга картки |
| Громада | `#A31D1D` | мітка категорії + ліва смуга картки |
| Для дітей | `#f1c40f` | мітка категорії + ліва смуга картки |

Реалізовано через `box-shadow: inset 3px 0 0 0 <color>` — кольорова смуга зліва без впливу на розмір картки.

### 2.3 Типографіка

| Елемент | Шрифт | Розмір | Вага |
|---------|-------|--------|------|
| Логотип "CSTL NEWS" | Georgia, serif | 20px | 900 |
| Сплеш-екран "CSTL NEWS" | Georgia, serif | 42px | 900 |
| Заголовок featured-картки | system-ui | 18px (no-image: 17px) | 800 |
| Заголовок row-картки | system-ui | 16px | 700 |
| Заголовок події | system-ui | 17px | 700 |
| Заголовок у модалці | system-ui | 22px | 800 |
| Мітка категорії події | system-ui | 10px | 700, UPPERCASE |
| Геофільтр / категорія | system-ui | 11px | 600, UPPERCASE |
| Основний системний шрифт | `-apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif` | — | — |

### 2.4 Візуальний стиль

- **Мінімалізм:** білий фон, тонкі межі `#e5e5e5`, без тіней на картках
- **Акцент — червоний:** `#C41E3A` — тільки на важливих елементах (активний фільтр, ексклюзив, дата)
- **Картки:** `border-radius: 12px`, `border: 1px solid var(--border)`, без box-shadow
- **Модальне вікно:** bottom sheet (виїжджає знизу), `border-radius: 20px 20px 0 0`, `max-height: 90vh`
- **Сплеш-екран:** червоний фон, анімація тіні від уявного світла (`shadowSweep`), 3.5 секунди

---

## 3. Структура Файлів

```
CSTL_NEWS/
│
├── index.html              # ВЕСЬ HTML. Один <script src="bundle.js">.
│                           # Містить: splash, header, 4 сторінки, article-modal, tab-bar, toast
│
├── style.css               # ВСІ стилі (862 рядки). Без CSS-модулів, один файл.
│
├── sw.js                   # Service Worker — кешування офлайн.
│                           # CACHE_NAME змінювати при кожному деплої коду!
│                           # Формат: cstl-YYYYMMDD-HHMM
│
├── bundle.js               # ⚠️ АВТОГЕНЕРОВАНИЙ. Не редагувати вручну.
│                           # Збирається з src/ через `node build.js`
│
├── build.js                # Конфіг esbuild (bundler — збирач коду). 8 рядків.
│                           # Вхід: src/app.js → Вихід: bundle.js (IIFE формат)
│
├── package.json            # Одна залежність: esbuild
│
├── logo.png                # Логотип Olyka Castle (замок). 230×230px на сплеші.
│                           # Не використовується в header — там текстовий логотип.
│
├── data/                   # JSON-файли з контентом (не кодом)
│   ├── articles.json       # Масив статей/новин
│   ├── events.json         # Масив подій афіші
│   └── schedule.json       # Розклад автобусів
│
├── src/                    # Вихідний код (source files)
│   ├── app.js              # Точка входу. Імпортує всі модулі. switchTab(), closeArticleModal(), init()
│   ├── core/
│   │   ├── boot.js         # PWA manifest, Service Worker реєстрація + логіка оновлення
│   │   ├── weather.js      # Погода: геолокація → open-meteo.com API → emoji + °C
│   │   └── utils.js        # formatTime(), formatEventDate(), escapeHtml(), showToast()
│   └── tabs/
│       ├── news.js         # Новини: featured card + row cards, гео-фільтри, openArticle()
│       ├── events.js       # Події: категорії з кольорами, openEvent(), modal
│       ├── buses.js        # Автобуси: вкладки маршрутів, "наступний рейс через X хв"
│       └── submit.js       # Форма подачі новини (зараз mailto:)
│
└── .github/
    └── workflows/
        └── deploy.yml      # GitHub Actions: npm install → node build.js → деплой на Pages
```

### Медіа-активи

| Файл | Роль | Розмір |
|------|------|--------|
| `logo.png` | Логотип замку на сплеш-екрані | відображається 230×230px |

> PWA-іконка генерується динамічно в `src/core/boot.js` як SVG Base64 — окремого файлу немає.

---

## 4. Технічна Архітектура

### 4.1 Система збірки (Build System)

```
src/app.js (точка входу — ES modules)
  ↓ імпортує
  src/core/boot.js, src/core/weather.js, src/core/utils.js
  src/tabs/news.js, src/tabs/events.js, src/tabs/buses.js, src/tabs/submit.js
  ↓
node build.js (запускає esbuild)
  ↓
bundle.js (IIFE — Immediately Invoked Function Expression, один файл без import/export)
  ↓
index.html: <script src="bundle.js">
```

### 4.2 Система Новин

**Дані:** `data/articles.json` — масив об'єктів:

```json
{
  "id": 1,
  "title": "Заголовок новини",
  "excerpt": "Короткий опис для картки (1-2 речення)",
  "content": "Повний текст статті",
  "category": "Культура",
  "geo": "Олика",
  "image": null,
  "source": "CSTL NEWS",
  "sourceUrl": null,
  "exclusive": true,
  "ts": 1743800000000
}
```

**Поля:**
- `geo` — географія: `"Олика"` / `"Волинь"` / `"Україна"` / `"Світ"`
- `category` — тема: `"Культура"` / `"Бізнес"` / `"Спорт"` / `"Технології"` (внутрішнє, не показується у фільтрах)
- `ts` — Unix timestamp у мілісекундах
- `exclusive: true` — додає червону межу та бейдж "Ексклюзив"

**Логіка рендерингу (`src/tabs/news.js`):**
1. `initNews()` → `fetch('./data/articles.json')` → `allArticles`
2. `renderGeoFilters()` → малює кнопки-чіпи (Всі / Олика / Волинь / Україна / Світ)
3. `renderNews()` → `getFiltered()` → перший елемент = `renderFeatured()`, решта = `renderRow()`
4. `window.setGeoFilter(geo)` → змінює `activeGeo` → перемальовує фільтри та список
5. `window.openArticle(id)` → знаходить статтю → вставляє HTML у `#article-modal-content` → відкриває модалку

### 4.3 Система Подій

**Дані:** `data/events.json` — масив об'єктів:

```json
{
  "id": 1,
  "title": "Назва події",
  "description": "Детальний опис події (кілька речень)",
  "date": "2026-04-12",
  "time": "20:00",
  "location": "Місце проведення",
  "category": "Культура",
  "image": null
}
```

**Категорії та кольори:**
```js
const CATEGORY_COLORS = {
  'Культура':  '#9b59b6',
  'Спорт':     '#2ecc71',
  'Громада':   '#A31D1D',
  'Для дітей': '#f1c40f',
};
```

**Логіка рендерингу (`src/tabs/events.js`):**
1. `initEvents()` → `fetch('./data/events.json')` → `allEvents`
2. Фільтрує майбутні події (дата ≥ сьогодні), сортує за датою
3. `renderEventCard(ev)` → кольорова смуга зліва (`box-shadow: inset 3px 0 0 0 <color>`), мітка категорії
4. `window.openEvent(id)` → вставляє дані події у `#article-modal-content` → відкриває `#article-modal`

### 4.4 Модальне Вікно (`#article-modal`)

Одне модальне вікно використовується і для новин (`openArticle`), і для подій (`openEvent`).

**HTML-структура (незмінна):**
```html
<div id="article-modal" class="article-modal" onclick="if(event.target===this)closeArticleModal()">
  <div class="article-modal-inner">
    <button class="modal-close-btn" onclick="closeArticleModal()">✕</button>
    <div id="article-modal-content" class="article-modal-content">
      <!-- сюди JS вставляє HTML динамічно -->
    </div>
  </div>
</div>
```

**CSS:** `position: fixed; inset: 0; display: none;` → клас `.open` → `display: flex; align-items: flex-end;`

**Шаблон для новини:**
```html
<div class="article-modal-header">
  <div class="news-card-meta"><!-- geo + category + exclusive badge --></div>
  <h1 class="article-title">...</h1>
  <div class="article-byline"><span>джерело</span><span>час</span></div>
</div>
<img class="article-img" ...> <!-- якщо є фото -->
<div class="article-body"><!-- повний текст --></div>
<a class="article-source-link" ...>Читати оригінал →</a>
```

**Шаблон для події:**
```html
<div class="article-modal-header">
  <span class="event-category-tag" style="color:<color>">Категорія</span>
  <h1 class="article-title">...</h1>
  <div class="article-byline" style="flex-direction:column; gap:6px">
    <span>📅 дата · час</span>
    <span>📍 місце</span>
  </div>
</div>
<div class="article-body"><!-- повний опис --></div>
```

### 4.5 Погодний Віджет (`src/core/weather.js`)

```
initWeather()
  ↓
navigator.geolocation.getCurrentPosition()  ←→  fallback: Олика {lat: 50.7333, lon: 25.8167}
  ↓
fetch('https://api.open-meteo.com/v1/forecast?latitude=...&current=temperature_2m,weather_code')
  ↓
WMO code → emoji (☀️🌤️☁️🌫️🌦️🌧️❄️⛈️)
  ↓
#weather-icon + #weather-temp у шапці
```

**Timeout геолокації:** 5000ms. **maximumAge:** 600000ms (10 хв).
**При помилці:** `#weather-widget` ховається (`visibility: hidden`).

### 4.6 PWA та Service Worker

**Реєстрація (`src/core/boot.js`):**
```js
navigator.serviceWorker.register('./sw.js', { updateViaCache: 'none' })
```
- `updateViaCache: 'none'` — завжди перевіряє нову версію sw.js
- `reg.update()` — при завантаженні сторінки та при `visibilitychange`
- `controllerchange` → `window.location.replace()` — автооновлення при новому SW

**Кешування (`sw.js`):**

| Тип запиту | Стратегія |
|------------|-----------|
| `data/*.json` | Network first → cache fallback |
| Зовнішні (open-meteo.com тощо) | Network only |
| Статичні (`index.html`, `style.css`, `bundle.js`) | Cache first → network fallback |

**CACHE_NAME:** `cstl-20260409-1730` (формат: `cstl-YYYYMMDD-HHMM`)
> Змінювати при кожному деплої коду — примушує всіх користувачів отримати нові файли.

**PWA Manifest** генерується динамічно як Blob URL в `boot.js`:
- `name: 'CSTL NEWS'`, `short_name: 'CSTL'`
- `display: 'standalone'`, `theme_color: '#C41E3A'`
- Іконка: SVG з буквою "C" на червоному фоні, Base64-закодована

### 4.7 Навігація між вкладками (`src/app.js`)

```js
window.switchTab = function(tab) { ... }
```
- Fade-перехід між сторінками: `opacity: 0 → 1` за 0.22s
- `data-tab` атрибут на кнопках tab-bar → `classList.toggle('active')`
- Стан активної вкладки: `let currentTab = 'news'`

### 4.8 Деплой

```
git push (будь-яка гілка або main)
  ↓
.github/workflows/deploy.yml
  ↓
npm install → node build.js → bundle.js
  ↓
git commit bundle.js → push to main
  ↓
GitHub Pages деплоїть (через 2-3 хвилини)
```

> **Важливо:** bundle.js НЕ комітити вручну — перезапишеться CI.

---

## 5. Структура даних

### articles.json — повна схема

| Поле | Тип | Обов'язкове | Опис |
|------|-----|-------------|------|
| `id` | number | ✅ | Унікальний ID (integer) |
| `title` | string | ✅ | Заголовок |
| `excerpt` | string | — | Короткий анонс для картки |
| `content` | string | ✅ | Повний текст |
| `category` | string | — | Тема: Культура/Бізнес/Спорт/Технології/Громада |
| `geo` | string | ✅ | Олика / Волинь / Україна / Світ |
| `image` | string\|null | — | URL фото або `null` |
| `source` | string | ✅ | Назва джерела |
| `sourceUrl` | string\|null | — | Посилання на оригінал |
| `exclusive` | boolean | — | `true` = ексклюзив CSTL NEWS |
| `ts` | number | ✅ | Unix timestamp в мілісекундах |

### events.json — повна схема

| Поле | Тип | Обов'язкове | Опис |
|------|-----|-------------|------|
| `id` | number | ✅ | Унікальний ID |
| `title` | string | ✅ | Назва події |
| `description` | string | ✅ | Детальний опис |
| `date` | string | ✅ | Формат: `YYYY-MM-DD` |
| `time` | string | ✅ | Формат: `HH:MM` |
| `location` | string | ✅ | Місце проведення |
| `category` | string | ✅ | Культура / Спорт / Громада / Для дітей |
| `image` | string\|null | — | URL фото або `null` |

### schedule.json — структура

Масив маршрутів. Кожен маршрут: `{ id, name, from, to, via, departures: [{time, days}] }`.

---

## 6. Поточний Статус (09.04.2026)

### Зроблено ✅

| Що | Деталі |
|----|--------|
| MVP: 4 вкладки | Новини, Події, Автобуси, Подати новину |
| Featured + Row картки новин | Перша велика з фото-фоном, решта горизонтальні |
| Гео-фільтри новин | Всі / Олика / Волинь / Україна / Світ |
| Модальне вікно статті | Bottom sheet, закривається тапом по фону або ✕ |
| Сплеш-екран | Анімація shadowSweep + splashPop + splashFadeUp, 3.5с |
| Логотип в шапці | "CSTL NEWS" в Georgia serif, "NEWS" червоний |
| Погодний віджет | Геолокація → open-meteo.com, fallback Олика, emoji + °C |
| PWA | Встановлюється на телефон, офлайн-кешування |
| Service Worker | Авто-оновлення через controllerchange |
| SVG-іконки таб-бару | Кастомні SVG для Новини/Події/Автобуси/Подати |
| Розклад автобусів | "Наступний рейс через X хв", tabs маршрутів |
| Категорії подій | 4 категорії з кольоровими акцентами, кліком → модалка |
| GitHub Actions деплой | Автоматично при пуші |

### Заплановано 📋

| Пріоритет | Задача |
|-----------|--------|
| 🔴 Перший | **History API** — кнопка "Назад" закриває модалку |
| 🔴 Перший | **CSS анімації** переходів між вкладками |
| 🟡 Другий | **Web3Forms/EmailJS** — форма подачі без mailto: |
| 🟡 Другий | **Auto-Sync** при відновленні мережі (подія `online`) |
| 🟡 Другий | **Anonymous deviceId** — UUID в localStorage |
| 🟢 Третій | **"Запланувати поїздку"** у вкладці Автобуси |
| 🔵 Четвертий | **Push-сповіщення** при скасуванні рейсу |
| 🔵 Четвертий | **Модуль "Енерго-Варта"** (графіки Волиньобленерго) |
| ⬜ Фон | **Реальний контент** — новини та події Олики |

---

## 7. Критичні Правила для Нових Розробників

1. **Ніколи не редагувати `bundle.js`** — перезаписується CI при кожному пуші
2. **При зміні JS-коду** — оновлювати файли у `src/`, а не `bundle.js`
3. **При деплої коду** — обов'язково оновити `CACHE_NAME` у `sw.js` (формат: `cstl-YYYYMMDD-HHMM`)
4. **Перевірка синтаксу** — `node --check src/tabs/назва.js` після JS-змін
5. **Не чіпати `setupSW()` у `boot.js`** — складна логіка оновлень, поламати легко
6. **`escapeHtml()`** — обов'язково для ВСІХ даних з JSON перед вставкою в innerHTML (XSS-захист)
7. **Мова UI — українська** — всі тексти інтерфейсу тільки українською

---

## 8. Швидкі команди

```bash
# Локальна збірка (зібрати bundle.js зі src/)
node build.js

# Перевірка синтаксису JS
node --check src/tabs/events.js

# Примусовий ретригер CI (якщо деплой завис)
git commit --allow-empty -m "ci: retrigger" && git push origin claude/start-session-gPmeZ

# Встановити залежності
npm install
```
