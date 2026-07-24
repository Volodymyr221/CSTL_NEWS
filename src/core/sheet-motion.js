// src/core/sheet-motion.js
// Нативне (як у рідних аркушах iOS) ЗАВЕРШЕННЯ жесту «свайп-закриття».
//
// ЧОМУ ОКРЕМИЙ МОДУЛЬ, а не переписування свайпів:
//   Сам ЖЕСТ у кожної модалки свій і вистражданий — де дозволено хапати, як не
//   сплутати закриття зі скролом тіла, зі свайпом галереї фото чи зі скрабером
//   графіка погоди. Цю логіку НЕ чіпаємо. Спільне в усіх модалок лише те, що
//   стається В МОМЕНТ ВІДПУСКАННЯ пальця — і саме там був «не-нативний» присмак:
//
//   1) рішення приймалось ЛИШЕ за відстанню (dy > 90px): швидкий короткий кидок
//      (як у Telegram/iOS) не закривав — модалка пружинила назад;
//   2) доїзд завжди тривав фіксовані ~0.25s: дотягнув аркуш майже донизу, а він
//      ще чверть секунди «доповзає» — виглядає як гальмування;
//   3) частина модалок при закритті ЗАМИРАЛА там, де відпустив палець (інлайн
//      transform лишався, а CSS-клас лише згашав прозорість) або навпаки
//      СТРИБАЛА назад у центр і вже звідти зникала.
//
// Тут: швидкість пальця (velocity) + час, пропорційний ЗАЛИШКУ шляху + політ до
// кінця в той бік, куди тягнули. Один рух — одне продовження, без ривка.

const FLICK_V   = 0.45;   // px/мс — від цієї швидкості кидок закриває навіть коротким рухом
const FLICK_MIN = 8;      // ...але рух має бути помітним (щоб тремтіння пальця не рахувалось кидком)
const DIST      = 90;     // px — поріг «дотягнув повільно» (як було до цієї зміни)
const MIN_MS    = 110;    // швидше — око не встигає побачити рух, виглядає як різке зникнення
const MAX_MS    = 240;    // не довше за наявні таймери прибирання з DOM (setTimeout ..., 240)

// Крива рідного нижнього аркуша iOS (вже використовується у style/modal.css і feed.css).
export const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

// Стежить за швидкістю пальця. Згладжування (0.6 старе / 0.4 нове) — щоб один
// смиканий кадр (палець на мить завмер перед відпусканням) не вирішував долю жесту.
export function createDragTracker() {
  let lastPos = 0, lastT = 0, v = 0;
  return {
    start(pos) { lastPos = pos; lastT = performance.now(); v = 0; },
    move(pos) {
      const t = performance.now();
      const dt = t - lastT;
      if (dt <= 0) return;
      v = v * 0.6 + ((pos - lastPos) / dt) * 0.4;
      lastPos = pos; lastT = t;
    },
    get velocity() { return v; },   // px/мс, додатна = рух вниз
  };
}

// Рішення (закривати чи повертати) + анімація доїзду. Повертає true якщо закриваємо.
//   panel            — елемент, що рухається
//   dy               — на скільки вже відтягнули вниз (px)
//   velocity         — з createDragTracker()
//   remaining        — скільки лишилось до повного зникнення з екрана (px)
//   dismissTransform — куди їхати при закритті (повний рядок transform)
//   restTransform    — куди повертатись якщо не закриваємо (зазвичай '' = на місце)
//   onDismiss(ms)    — власне закриття; викликається ОДРАЗУ, політ домальовує інлайн transform
export function finishSwipe({
  panel, dy, velocity = 0, remaining,
  dismissTransform, restTransform = '', onDismiss,
}) {
  const dismiss = dy > DIST || (velocity > FLICK_V && dy > FLICK_MIN);
  const travel  = Math.max(dismiss ? remaining : dy, 1);
  const speed   = Math.max(Math.abs(velocity), 0.9);   // не повільніше за базову швидкість
  const ms      = Math.round(Math.min(MAX_MS, Math.max(MIN_MS, travel / speed)));

  panel.style.transition = `transform ${ms}ms ${SHEET_EASE}`;
  panel.style.transform  = dismiss ? dismissTransform : restTransform;

  if (dismiss) onDismiss?.(ms);
  // Повернення на місце: віддаємо елемент назад під CSS-анімацію, коли доїхав.
  else setTimeout(() => { panel.style.transition = ''; }, ms);

  return dismiss;
}

// Скільки лишилось нижньому аркушу до повного зникнення (він їде до translateY(100%)).
export function sheetRemaining(panel, dy) {
  return Math.max((panel.offsetHeight || 0) - dy, 1);
}

// Скільки лишилось центрованій модалці, щоб піти за нижній край екрана.
export function centeredRemaining(panel) {
  const top = panel.getBoundingClientRect().top;
  return Math.max(window.innerHeight - top, 1);
}
