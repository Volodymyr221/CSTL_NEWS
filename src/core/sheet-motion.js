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
const BACK_MIN  = 0.25;   // до якої частки темряви світлішає фон, коли панель повністю відтягнута

// Крива рідного нижнього аркуша iOS (вже використовується у style/modal.css і feed.css).
export const SHEET_EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

const clamp01 = v => Math.min(1, Math.max(0, v));

// Затемнення фону, зчеплене з пальцем.
//
// НАВІЩО: у рідних аркушах iOS темний фон СВІТЛІШАЄ поки тягнеш панель донизу —
// разом з рухом, а не після нього. У нас фон тримався на повну і гаснув аж після
// відпускання, тож мозок читав це як «фон не реагує на мій палець» (Вова 24.07:
// «стало трошки краще, але все одно не як нативний iOS»).
//
// ДВА РЕЖИМИ — бо затемнення в застосунку влаштоване по-різному:
//   'opacity' — затемнення це ОКРЕМИЙ шар поруч із панеллю (.app-modal-backdrop,
//               .board-backdrop, .bd-chat-backdrop) → гасимо його прозорість;
//   'bg'      — затемнення це КОНТЕЙНЕР, усередині якого лежить сама панель
//               (.fd-sheet-back у Стрічці) → прозорість гасити НЕ можна, бо
//               загасне й панель. Тому міняємо лише альфу кольору фону.
// 🔴 РЕГРЕСІЯ, ЯКУ ТУТ ВИПРАВЛЕНО (Вова 24.07, скріни IMG_3566/3567): на старті жесту
// фон СПАЛАХУВАВ суцільно чорним і просвітлювався від чорного. Причина: базовий колір
// читався ОДРАЗУ при дротуванні свайпу, а всі 5 листів «Стрічки» дротують свайп ДО
// `document.body.appendChild`. У елемента поза документом `getComputedStyle` повертає
// ПОРОЖНІЙ рядок → розбір не вдавався → альфа за замовчуванням бралась 1 → rgba(0,0,0,1).
// Три правила, що роблять це неможливим у принципі:
//   1) читаємо базовий вигляд ЛІНИВО — на першому русі пальця, коли елемент точно в DOM;
//   2) не вгадуємо: не прочитався колір → взагалі не чіпаємо фон (краще нічого, ніж чорне);
//   3) інваріант «ніколи не темніше за спокій» — усе рахується ВІД запам'ятованого
//      відтінку спокою і лише світлішає (саме як просив Вова: «модалка має взяти собі
//      певний відтінок, і від цього відтінку просвітлюватись»).
export function createBackdropFade(el, mode = 'opacity') {
  if (!el) return null;
  const isBg = mode === 'bg';
  const prop = isBg ? 'background-color' : 'opacity';
  let base = null;   // {rgb,a} для 'bg' або {o} для 'opacity'; null = ще не міряли / не вдалось

  // Вигляд СПОКОЮ. Міряється один раз за жест і лише коли елемент уже в документі.
  const readBase = () => {
    const cs = getComputedStyle(el);
    if (isBg) {
      const m = (cs.backgroundColor || '').match(/[\d.]+/g);
      if (!m || m.length < 3) return null;                 // не вгадуємо — краще no-op
      return { rgb: [m[0], m[1], m[2]], a: m[3] !== undefined ? +m[3] : 1 };
    }
    const o = parseFloat(cs.opacity);
    return Number.isFinite(o) ? { o } : null;
  };

  // k: 1 = як у спокої, 0 = прозоро. Вище за 1 не піднімаємось — це і є інваріант.
  const setK = (k) => {
    if (!base) return;
    const kk = clamp01(k);
    if (isBg) el.style.backgroundColor = `rgba(${base.rgb[0]}, ${base.rgb[1]}, ${base.rgb[2]}, ${(base.a * kk).toFixed(3)})`;
    else el.style.opacity = (base.o * kk).toFixed(3);
  };

  const clearInline = () => { el.style.opacity = ''; el.style.backgroundColor = ''; };

  return {
    // p — прогрес жесту 0..1 (0 = панель на місці, 1 = пішла повністю)
    track(p) {
      if (!base) { base = readBase(); if (!base) return; }
      el.style.transition = 'none';
      setK(1 - (1 - BACK_MIN) * clamp01(p));
    },
    // Доїзд разом із панеллю: за ТОЙ САМИЙ час, тож фон і панель рухаються як одне ціле.
    settle(dismiss, ms) {
      if (!base) return;              // нічого не чіпали — нічого й повертати
      el.style.transition = `${prop} ${ms}ms linear`;
      // Закриття — гасимо до прозорого. Повернення — СКИДАЄМО інлайн, щоб доїхати рівно
      // до істини CSS: якщо жест почався ще під час появи модалки, запам'ятований спокій
      // був проміжним, і повертатись треба не до нього, а до кінцевого стану.
      if (dismiss) setK(0); else clearInline();
      setTimeout(() => {
        el.style.transition = '';
        if (dismiss) clearInline();
        base = null;                  // наступний жест переміряє (поворот екрана, зміна теми)
      }, ms + 30);
    },
  };
}

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
//   backdrop         — з createBackdropFade(): затемнення доїжджає за той самий час
export function finishSwipe({
  panel, dy, velocity = 0, remaining,
  dismissTransform, restTransform = '', onDismiss, backdrop,
}) {
  const dismiss = dy > DIST || (velocity > FLICK_V && dy > FLICK_MIN);
  const travel  = Math.max(dismiss ? remaining : dy, 1);
  const speed   = Math.max(Math.abs(velocity), 0.9);   // не повільніше за базову швидкість
  const ms      = Math.round(Math.min(MAX_MS, Math.max(MIN_MS, travel / speed)));

  panel.style.transition = `transform ${ms}ms ${SHEET_EASE}`;
  panel.style.transform  = dismiss ? dismissTransform : restTransform;
  backdrop?.settle(dismiss, ms);   // фон гасне/вертається СИНХРОННО з панеллю

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
