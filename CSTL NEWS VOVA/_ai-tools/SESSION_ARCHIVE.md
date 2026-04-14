# SESSION_ARCHIVE.md — Архів попередніх сесій CSTL NEWS

> Сюди переносяться деталі закритих сесій з SESSION_STATE.md.
> SESSION_STATE.md тримає тільки поточний стан — деталі тут.

---

## Сесія 2026-04-14 — Події v3 + PWA таб-бар + Маніфест

### Комміти сесії
| Коміт | Що зроблено |
|-------|-------------|
| `b841029` | Events: замінити bottom-sheet модалку на акордеон-розгортання |
| `3a72a4d` | sw: оновити CACHE_NAME після першої серії змін |
| `094cc43` | Events: кольоровий ободок категорії, фон при розкритті, без дублювання опису |
| `85af5ec` | sw: CACHE_NAME bump |
| `e391d7a` | Events: м'якший ободок (color-mix) + авто-згортання (IntersectionObserver) |
| `fd3748e` | Events: «Створити нагадування» — ICS Blob замість Google Calendar |
| `562282e` | Events: усунути стрибок карточок при авто-згортанні (scrollBy компенсація) |
| `a79d171` | PWA: виправити таб-бар + manifest.json + оновити іконки |
| `4f81ad6` | fix: виправити шлях до іконок PWA (colon → папка icons/) |

### Що зроблено (детально)

#### 1. Модуль «Події» v3 — акордеон замість модалки
- Видалено `.event-modal` bottom-sheet та весь його CSS (~130 рядків)
- Клік по картці → картка розгортається вниз (`max-height` transition 0.38s)
- У розгорнутому стані: повний опис, кнопка «Створити нагадування», «Згорнути ↑»
- `IntersectionObserver` з `threshold: 0` — авто-згортає картку коли вона повністю виходить за межі viewport
- При авто-згортанні ВИЩЕ екрану: `detail.style.transition = 'none'` → миттєве згортання → `window.scrollBy(0, -(heightBefore - heightAfter))` → видимий контент не зміщується → `requestAnimationFrame x2` повертає анімацію

#### 2. UX-покращення карток подій
- **Кольоровий ободок**: `border: 1.5px solid color-mix(in srgb, var(--cat-color) 38%, white)` → пастельний відтінок кольору категорії
- **CSS-змінна `--cat-color`**: встановлюється inline `style="--cat-color:#C41E3A"` на картці, використовується в border і в підказці «Детальніше»
- **Фон розгорнутої картки**: `background: #f4f5f9` з `transition: background-color 0.3s`
- **Без дублювання**: `.ev-card.expanded .ev-card-desc { display: none }` — стислий опис ховається, повний видно в `.ev-detail-desc`

#### 3. Кнопка «Створити нагадування»
- Видалено `buildCalendarUrl()` і посилання на Google Calendar
- Новий `buildIcsContent(ev)` → генерує ICS-рядок (VCALENDAR/VEVENT/VALARM за 1 год)
- `downloadIcs(ev)` → `new Blob([ics], {type:'text/calendar'})` → `URL.createObjectURL` → програмний клік по `<a download="назва.ics">` → iOS відкриває рідний Calendar, Android — Google/Samsung Calendar
- `e.stopPropagation()` у listener кнопки — не закриває акордеон при натисканні

#### 4. PWA таб-бар — критичний баг виправлено
- **Баг**: `height: 64px` + `padding-bottom: env(safe-area-inset-bottom)` → на iPhone X+ (safe area = 34px) для кнопок залишалось лише 30px → таб-бар зникав або був непомітний
- **Фікс**: `height` прибрано з `.tab-bar`, `height: 56px` тепер на `.tab-item`, `.tab-bar` лише додає `padding-bottom: env(safe-area-inset-bottom, 0px)` → загальна висота бару = 56 + safe area
- `align-items: flex-end` — кнопки притиснуті до низу вище safe area
- `z-index: 1000` (було 100)
- `-webkit-transform: translateZ(0)` — окремий GPU-шар, виправляє баг `position:fixed` в iOS PWA standalone mode
- `--tabbar-h: 56px` (було 64px) — тепер позначає тільки висоту контентної зони
- Оновлено: `.app-main`, `.page`, `.toast`, `.deploy-stamp` — всі включають `env(safe-area-inset-bottom, 0px)`

#### 5. PWA маніфест і іконки
- Новий `manifest.json`: `display:standalone`, `theme_color:#C41E3A`, `orientation:portrait-primary`, `lang:uk`, icons 192 і 512
- `manifest.json` доданий у `STATIC_ASSETS` sw.js
- `index.html`: `<link rel="manifest">` і `<link rel="apple-touch-icon" href="icons/icon-192.png">`
- Нові іконки таб-бару: газета (новини) / календар з крапками (події) / автобус з розділювачами / паперовий літак (подати)
- Папка `icons/` з кастомними іконками Вови
- Баг-фікс: GitHub UI зберіг `icons:icon-192.png` замість `icons/icon-192.png` → виправлено через `git mv`

### Стан на кінець сесії
- `sw.js` CACHE_NAME: `cstl-20260414-2100`
- Останній деплой: коміт `4f81ad6`
- B-16 (manifest.json) — закрито

---

## Сесія 2026-04-10 — Аудит + Фаза 1 А+

### Останні деплої (на момент закриття сесії)
- `v79 · 10.04 19:26` — перший успішний деплой Фази 1 (коміт `018783f`)
- `v80` — після коміту `5526c2b` (оновлення CLAUDE.md)
- `v81` — після коміту `31ea19d` (оновлення START_HERE, SESSION_STATE, NEW_SESSION_PROMPT)

---

### Що було зроблено (повна хронологія)

#### 1. Повний аудит проекту
- Перечитано всі файли проекту (src/, data/, docs/, .claude/, index.html, style.css, sw.js, package.json)
- Знайдено **31 проблема**:
  - 4 🔴 критичні (сайт мертвий після "Clean up: remove broken build workflows")
  - 7 🟠 серйозних (баги логіки, розбіжність документації)
  - 8 🟡 середніх (мертвий код, сміття у git)
  - 12 🟢 дрібних (граматика, UX, безпека)
- Усі задокументовано у `CSTL_BUGS.md` (B-01 … B-20)

#### 2. Фаза 1 А+ — аварійне відновлення (7 комітів)

| Коміт | Що зроблено |
|-------|-------------|
| `2e7309e` | Відновлено `build.js` (Крок 1) |
| `0e9dcd2` | Відновлено `bundle.js` (Крок 2, 470 рядків) |
| `5ec55b4` | Повне оновлення документації (7 файлів): CONCEPT, ROADMAP, ARCHITECTURE, SESSION_STATE, CSTL_BUGS, BACKLOG (новий), CONTENT_STRATEGY (новий) |
| `018783f` | Фаза 1 кроки 3-5: новий `deploy.yml` (А+), плейсхолдер лічильника у `index.html`, стиль у `style.css`, `sw.js` оновлено (CACHE_NAME, logo.png, network-first для index.html) |
| `5526c2b` | Оновлено `CLAUDE.md` (корінь + CSTL NEWS VOVA) під А+ і Фазу 1 |
| `31ea19d` | START_HERE.md повний перепис + SESSION_STATE фіналізація + NEW_SESSION_PROMPT створений |
| `8ec4db0` | /startuem скіл + універсалізація NEW_SESSION_PROMPT |

#### 3. Merge у main + перший живий деплой
- `git checkout main && git merge --ff-only claude/code-audit-review-wfuX7`
- `git push origin main` → GitHub Actions запустився → деплой пройшов → штамп `v79 · 10.04 19:26`
- Вова перевірив сайт на телефоні — працює

---

### Ключові рішення сесії (детально)

1. **Варіант А+ для деплою.** Використовуємо офіційний `actions/deploy-pages@v4` замість саморобного "CI комітить bundle.js у main" патерну. Це повністю обходить баг B-01 (non-fast-forward). `deploy.yml` нічого не комітить у main — тільки будує, ставить штамп через `sed`, і публікує artifact.

2. **Варіант Б для `bundle.js`.** Комічу його в git як робочу базу. CI перегенерує свіжий при деплої, але не комітить назад. Компроміс між "чистотою" і "простотою".

3. **Лічильник версії — обов'язкова фіча.** Без нього Вова не може зрозуміти чи пройшов автодеплой. Формат: `v{github.run_number} · DD.MM HH:MM` (час Києва). Замінюється через `sed` у `deploy.yml`.

4. **Пріоритет контенту: В — Новини.** Гібридна модель: RSS парсинг волинських ЗМІ + ручні ексклюзиви Олики через GitHub UI редагування `data/curated.json`. Деталі у `docs/CONTENT_STRATEGY.md`.

5. **Хук `~/.claude/stop-hook-git-check.sh` — корисна фіча, лишається як є.** Автокоміт наприкінці турна (ходу) страхує роботу на випадок ліміту API і дозволяє Вові паралельно тестувати.

6. **Стиль роботи Claude:** один хід (turn) = один логічний блок роботи = один коміт. Не дробити на мікро-коміти всередині ходу.

7. **Гілка `main` як робоча.** Вова попросив повну автоматизацію. Feature-branches — тільки якщо експеримент ризиковий.

8. **Нік GitHub: `Volodymyr221`** (не VShevchukkk, не VShvchukkk). Вова підтвердив скріном. Уся документація виправлена.

---

### Технічні деталі (актуальні на момент сесії)

- **Робоча директорія:** `/home/user/CSTL_NEWS`
- **Гілка:** `main`
- **Локальний запуск:** `npm install && node build.js && open index.html`
- **Перевірка синтаксису:** `node --check src/**/*.js sw.js build.js`
