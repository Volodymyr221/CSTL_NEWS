# 002 — Прибрати `ease-in` із закриття банера автобусів

- **Status**: TODO
- **Commit**: 34143baf
- **Severity**: HIGH
- **Category**: 2 (Easing & duration) + 7 (Cohesion & tokens)
- **Estimated scope**: 1 файл (`src/tabs/buses.js`), 2 рядки

## Problem

`src/tabs/buses.js:2099` — свайп-закриття банера відстеження рейсу:

```js
// src/tabs/buses.js:2099 — поточний код
const _onBannerRelease = (dy) => {
  if (dy > 40) {
    // Плавно ховаємо вниз
    banner.style.transition = 'transform 0.25s cubic-bezier(0.4,0,1,1)';
    banner.style.transform = `translateX(-50%) translateY(${dy + 80}px) scale(0.85)`;
    setTimeout(() => { banner.style.transition = ''; hideBanner(); }, 260);
  } else {
```

`cubic-bezier(0.4, 0, 1, 1)` — це і є `ease-in`: рух починається повільно.

🔑 **Це не нова знахідка, а пропущена половина старої.** Рівно цю криву з рівно
цим підписом прибрали з `style/buses.css` 12.08 — там на її місці лежить коментар
(`style/buses.css:1642`):

> 🔴 12.08 — БУЛО `cubic-bezier(0.4,0,1,1)` З ПІДПИСОМ «швидке ease-in».
> …називає `ease-in` на інтерфейсі помилкою в будь-якому місці, і на ВИХОДІ теж

Тобто рішення в проєкті вже ухвалене — просто той прохід дивився CSS і не дивився JS.

Друга, дрібніша вада в тому ж рядку: анімація триває **250мс**, а прибирання стоїть
на **260мс** — банер 10мс висить уже нерухомий.

## Target

```js
// target — src/tabs/buses.js:2099
banner.style.transition = `transform 250ms ${SHEET_EASE}`;
banner.style.transform = `translateX(-50%) translateY(${dy + 80}px) scale(0.85)`;
setTimeout(() => { banner.style.transition = ''; hideBanner(); }, 250);
```

де `SHEET_EASE` = `cubic-bezier(0.32, 0.72, 0, 1)` — імпортується, не вписується.

## Repo conventions to follow

- У JS криву беруть із `SHEET_EASE` (`src/core/sheet-motion.js:29`), у CSS — з
  токена `--ease-drawer` (`style/base.css:24`). Обидва — одне й те саме значення.
- **Взірець**: `src/core/sheet-motion.js:144` —
  `panel.style.transition = \`transform ${ms}ms ${SHEET_EASE}\`;`
- `src/tabs/buses.js` уже імпортує з `../core/…` — додай `SHEET_EASE` у наявну групу
  імпортів, окремого рядка не заводь.

## Steps

1. `src/tabs/buses.js` — додати `SHEET_EASE` до наявного імпорту з
   `../core/sheet-motion.js`. Якщо файл звідти ще нічого не імпортує — додати рядок
   `import { SHEET_EASE } from '../core/sheet-motion.js';` поруч з іншими
   імпортами `../core/`.
2. `src/tabs/buses.js:2099` — замінити рядок `transition` на варіант із блоку
   «Target».
3. `src/tabs/buses.js:2101` — змінити `260` на `250` у `setTimeout`.
4. Прогнати `grep -n "cubic-bezier" src/tabs/buses.js` — у файлі не має лишитись
   жодного вписаного числом. Якщо лишились інші — **не чіпати їх у цьому плані**,
   лише виписати у звіт.

## Boundaries

- НЕ чіпати гілку `else` (повернення банера на місце) — вона вже правильна.
- НЕ чіпати `hideBanner()`, логіку відстеження рейсу, push-сповіщення.
- НЕ чіпати `style/buses.css:442` і `:483` (шкала руху) — це окрема знахідка
  з окремим ризиком, вона в цей план не входить.
- Нових залежностей не додавати.
- Розбіжність із наведеним кодом → зупинись і доповідай.

## Verification

- **Механічно**:
  - `node --check src/tabs/buses.js` → exit 0
  - `node build.js` → exit 0
  - `grep -c "cubic-bezier(0.4,0,1,1)" src/tabs/buses.js` → **0**
- **Перевірка відчуттям**: відкрити вкладку «Автобуси», почати відстеження рейсу
  (щоб зʼявився банер), змахнути банер вниз:
  - рух починається **одразу** на повній швидкості й гальмує в кінці (було навпаки);
  - у DevTools → Animations на 10% швидкості видно, що банер **не стоїть** перші
    кадри після відпускання пальця;
  - банер зникає рівно тоді, коли доїхав, без паузи в кінці.
- **Done when**: у `src/tabs/buses.js` немає рядка з `cubic-bezier(0.4,0,1,1)`, а
  число в `setTimeout` збігається з тривалістю переходу.
