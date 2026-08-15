# 001 — Перевести свайп модалки статті на спільний `sheet-motion.js`

- **Status**: ✅ DONE (15.08.2026, гілка `claude/startuem-s3yr33`)
- **Commit**: 34143baf
- **Severity**: HIGH
- **Category**: 2 (Easing & duration) + 4 (Interruptibility) + 7 (Cohesion & tokens)
- **Estimated scope**: 1 файл (`src/app.js`), −~45 рядків / +~15

## Problem

Модалка статті (`#article-modal`) — **єдине місце в застосунку, що досі має власний
свайп-закриття**. У проєкті з 10.08 є спільний механізм `attachSheetDismiss()` у
`src/core/sheet-motion.js`, і `core/modal.js` уже його СПОЖИВАЧ. Тут же лежить
самописна копія на `touchstart`/`touchmove`/`touchend` + `requestAnimationFrame`.

Чотири окремі вади в цій копії:

**(а) `ease-in` на закритті** — `src/app.js:294`:

```js
// src/app.js:294 — поточний код
if (dy > 80) {
  inner.style.transition = 'transform 0.25s ease-in';
  inner.style.transform = 'translateY(100%)';
  setTimeout(window.closeArticleModal, 240);
}
```

`ease-in` починається повільно — тобто гальмує рівно ту мить, на яку людина
дивиться. У проєкті це правило вже визнано: 12.08 таку саму криву прибрали з
`style/buses.css` (коментар лежить у `style/buses.css:1642`).

**(б) Крива вписана числом двічі** — `src/app.js:298` і `src/app.js:309`:

```js
// src/app.js:298 і :309 — поточний код
inner.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
```

`cubic-bezier(0.32, 0.72, 0, 1)` — це рівно токен `--ease-drawer` зі
`style/base.css:24` і рівно константа `SHEET_EASE` у `src/core/sheet-motion.js:29`.

**(в) Поріг закриття тільки по відстані** — `src/app.js:293`: `if (dy > 80)`.
Швидкий кидок коротким рухом (класичний жест на iPhone) модалку **не закриє** —
доведеться тягнути 80px повільно. Спільний `finishSwipe()` це вже вміє:
`src/core/sheet-motion.js:139` закриває при `dy > 90` **або** при
`velocity > 0.45 px/мс && dy > 8`.

**(г) Час доїзду не збігається з таймером прибирання** — анімація 250мс,
`setTimeout(window.closeArticleModal, 240)`. Вузол прибирають за 10мс до кінця руху.

## Target

Свій жест видалено, поведінка віддана спільному механізму. `initModalSwipe()`
стискається до виклику:

```js
// target — src/app.js, замість усього тіла initModalSwipe()
import { attachSheetDismiss, sheetRemaining } from './core/sheet-motion.js';

function initModalSwipe() {
  const inner = document.querySelector('.article-modal-inner');
  if (!inner) return;
  attachSheetDismiss({
    panel: inner,
    scroller: inner,          // у цієї модалки панель сама собі скролер
    backdrop: null,           // затемнення тут знімає closeArticleModal()
    onDismiss: (ms) => setTimeout(window.closeArticleModal, ms),
    headerZone: 64,           // смуга з рисочкою .modal-handle
  });
}
```

Після цього крива, тривалість, поріг швидкості й синхронізація таймера беруться
з одного місця і окремих чисел у `app.js` не лишається взагалі.

## Repo conventions to follow

- Криві живуть токенами у `style/base.css:24-26`
  (`--ease-drawer: cubic-bezier(0.32, 0.72, 0, 1)`), у JS — константою
  `SHEET_EASE` (`src/core/sheet-motion.js:29`). **Ніколи не вписувати числом.**
- **Взірець для наслідування**: `src/core/modal.js` — він викликає
  `attachSheetDismiss()` рівно так, як описано вище. Прочитай його виклик і повтори
  форму.
- Порядок імпортів у `src/app.js` міняти не можна (правило проєкту) — новий імпорт
  додай у наявну групу імпортів із `./core/`.

## Steps

1. `src/app.js` — додати імпорт `attachSheetDismiss` із `./core/sheet-motion.js`
   у наявну групу імпортів `./core/…`. Перевірити, чи файл уже щось звідти імпортує;
   якщо так — дописати в той самий рядок.
2. `src/app.js` — видалити тіло `initModalSwipe()` цілком: змінні `startY`,
   `isSwiping`, `startedOnHandle`, `rafId`, `startedAtTop`, функцію `reset()` і всі
   чотири слухачі (`touchstart`, `touchmove`, `touchend`, `touchcancel`).
3. `src/app.js` — на їх місце поставити виклик `attachSheetDismiss({…})` з блоку
   «Target» вище, дослівно.
4. Перевірити, що `window.closeArticleModal` (оголошена вище в тому ж файлі, біля
   `src/app.js:229`) і далі скидає інлайн-стилі: `inner.style.transform = ''`,
   `inner.style.transition = ''`, `inner.style.animation = ''`. Якщо скидання є —
   **не чіпати його**, воно потрібне для наступного відкриття.

## Boundaries

- НЕ чіпати `src/core/sheet-motion.js` — він обслуговує ще пʼять зон
  (`core/modal.js`, `tabs/feed.js`, `tabs/board.js`, `tabs/board-discussions.js`,
  `tabs/community-blocks.js`).
- НЕ чіпати `src/core/keyboard.js`, `lockBodyScroll`, `.fd-sheet-*` — зона
  підвищеної обережності, там два фікси вже провалились.
- НЕ міняти розмітку модалки і НЕ чіпати `closeArticleModal()` понад перевірку
  з кроку 4.
- Нових залежностей не додавати.
- Якщо код не збігається з наведеним (дрейф після коміту 34143baf) — **зупинись і
  доповідай**, не імпровізуй.

## Verification

- **Механічно**:
  - `node --check src/app.js` → exit 0
  - `node build.js` → exit 0 (він сам прогонить `check-imports.js`)
  - `npm test` → `tabbar-icons` і `modal-scroll-lock` мусять лишитись зеленими
- **Перевірка відчуттям** (обовʼязкова, на живому застосунку):
  - відкрити статтю, потягнути вниз **повільно** на ~100px і відпустити → модалка
    доїжджає донизу, а не смикається;
  - потягнути **швидко і коротко** (~20px різким кидком) → модалка **закривається**
    (до фіксу — не закривалась, це і є головна зміна);
  - потягнути на ~30px повільно і відпустити → повертається на місце;
  - прокрутити статтю донизу, потім, не відпускаючи палець, тягнути вгору → шапка
    модалки **не відривається** від тіла (це замок `wasScrolling`);
  - у DevTools → Animations поставити 10% швидкості й переконатись, що затемнення і
    панель ідуть **одночасно**, а не одне за одним.
- **Done when**: у `src/app.js` немає жодного `cubic-bezier`, жодного `ease-in`,
  жодного `setTimeout` із числом 240, і `grep -c "addEventListener('touch" src/app.js`
  дає **0**.
