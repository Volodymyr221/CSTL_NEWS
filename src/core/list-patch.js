// list-patch.js — СПІЛЬНИЙ механізм «оновити список, не смикнувши екран».
//
// 🔑 НАВІЩО ОКРЕМИЙ МОДУЛЬ. Спершу все це жило всередині `tabs/feed.js` — і поки
// користувач був один («Стрічка»), це було правильно. Коли те саме знадобилось Дошці,
// вибір був між копією і спільним модулем. Копія в цьому проєкті вже коштувала дорого:
// списки слів антиспаму розійшлись саме тому, що їх було дві (див. CLAUDE.md,
// `supabase_antispam_shared.sql`). Тому — один механізм, два користувачі.
//
// Тут НЕМА нічого про пости, картки чи спільноти: лише геометрія прокрутки і час.
// Усе, що знає про дані, лишається у вкладках.

// ── Хто саме скролиться ──────────────────────────────────────────────────────
// Найближчий предок, який реально прокручується. Потрібен, бо стрічка живе в
// `.app-main`, екран спільноти — окремий шар зі своїм скролом, а Дошка знову в `.app-main`.
export function scrollParent(el) {
  for (let p = el.parentElement; p; p = p.parentElement) {
    const oy = getComputedStyle(p).overflowY;
    if ((oy === 'auto' || oy === 'scroll') && p.scrollHeight > p.clientHeight) return p;
  }
  return null;   // скролиться саме вікно
}

// Те саме, але з безпечним запасним варіантом: якщо вміст коротший за екран, скролу
// нема і компенсувати нічого — запис у `document.scrollingElement` нікому не шкодить.
export function scrollerOf(node) {
  return scrollParent(node) || document.scrollingElement || document.documentElement;
}

// Видима область скролера. Для `document.scrollingElement` це саме ВІКНО, а не документ:
// його `getBoundingClientRect()` віддає висоту всієї сторінки, і будь-який елемент
// вважався б видимим.
export function viewRect(scroller) {
  if (!scroller || scroller === document.scrollingElement || scroller === document.documentElement) {
    return { top: 0, bottom: window.innerHeight };
  }
  const r = scroller.getBoundingClientRect();
  return { top: r.top, bottom: r.bottom };
}

export function isNodeVisible(node, scroller) {
  const r = node.getBoundingClientRect();
  const v = viewRect(scroller);
  return r.bottom > v.top && r.top < v.bottom;
}

// ── Якір прокрутки ───────────────────────────────────────────────────────────
// Той самий прийом, яким браузер утримує сторінку, коли довантажилась картинка вгорі.
// Міряємо, на скільки пікселів нижче верху стоїть перший ВИДИМИЙ елемент списку,
// робимо зміну — і повертаємо йому те саме положення.
//
// ⚠️ Чому запам'ятовуємо ЕЛЕМЕНТ, а не просто `scrollTop`: висота вмісту НАД ним могла
// змінитись (текст став довшим, картка поїхала вгору) — і тоді старе число вказує вже
// на інше місце. Число без орієнтира нічого не гарантує.
//
// ⚠️ Чому свій якір, а не браузерний: у Chromium є `overflow-anchor`, а в Safari (тобто
// на iPhone) його НЕМА взагалі. Саме тому баг видно на телефоні й не видно в браузері
// на сервері — на цьому вже спіймався перший стенд (див. tests/patch-scroll.mjs).
//
// skip — елемент, який саме зараз прибирають або переставляють: його не можна брати за
// якір, бо після зміни шукати вже нема чого.
// key — атрибут, за яким шукати елементи списку: «Стрічка» позначає картки `data-post`,
// Дошка — `data-post-id`.
export function keepScroll(scroller, fn, skip = null, key = 'data-post') {
  if (!scroller) { fn(); return; }
  const idOf = el => el.getAttribute(key);
  const viewTop = scroller.getBoundingClientRect ? scroller.getBoundingClientRect().top : 0;
  // Якір — перший елемент, чий НИЖНІЙ край ще нижче верху видимої області. Тобто той,
  // який людина зараз бачить (навіть якщо його верх уже поїхав за екран).
  const anchor = [...scroller.querySelectorAll(`[${key}]`)]
    .find(c => c.getBoundingClientRect().bottom > viewTop + 1 && String(idOf(c)) !== String(skip));
  const anchorId = anchor ? idOf(anchor) : null;
  const before = anchor ? anchor.getBoundingClientRect().top : 0;

  fn();

  if (anchorId == null) return;
  // Елемент міг бути ЗАМІНЕНИЙ новим — шукаємо заново за id, а не за старим посиланням.
  const after = scroller.querySelector(`[${key}="${anchorId}"]`);
  if (!after) return;                          // якір зник — не смикаємо нічого
  const delta = after.getBoundingClientRect().top - before;
  if (delta) scroller.scrollTop += delta;
}

// ── Плавне зникнення картки ──────────────────────────────────────────────────
// 🔑 НАВІЩО (Вова 27.07: «при відкріпленні воно стрибає доверху»). Коли картка йде
// ЗГОРИ, компенсувати зсув нема чим — контенту над людиною фізично меншає, і прокрутка
// впирається в нуль. Заміряно: при прокрутці 200px і картці 520px екран стрибав на
// −320px. Якір тут безсилий за БУДЬ-ЯКОЇ реалізації. Тому картка не зникає миттєво, а
// складається: список сідає НА ОЧАХ — це читається як рух, а не як ривок.
export const CARD_LEAVE_MS = 340;

export function collapseNode(node, after) {
  const h = node.offsetHeight;
  node.style.overflow = 'hidden';
  node.style.height = h + 'px';
  // ⚠️ НЕ `cubic-bezier(0.32,0.72,0,1)` — це крива свайпу (модалки), вона навмисно
  // стартує РІЗКО, бо продовжує рух пальця. Тут руху пальця нема, і різкий старт
  // читається як той самий ривок: заміряно 135px за один кадр. Мʼякий старт розкладає
  // ті самі пікселі рівномірніше.
  node.style.transition = `height ${CARD_LEAVE_MS}ms cubic-bezier(0.4,0,0.2,1), opacity ${CARD_LEAVE_MS - 100}ms linear`;
  requestAnimationFrame(() => { node.style.height = '0px'; node.style.opacity = '0'; });
  // ⚠️ Таймер, а не `transitionend`: якщо застосунок згорнути під час анімації, подія
  // може не прийти взагалі — і картка лишилась би складеною назавжди.
  setTimeout(after, CARD_LEAVE_MS + 20);
}

export function restoreNode(node) {
  node.style.transition = ''; node.style.height = '';
  node.style.overflow = '';   node.style.opacity = '';
}

// ── «НЕ ПЕРЕМАЛЬОВУЙ ТЕ, ЩО НЕ ЗМІНИЛОСЬ» ──────────────────────────────────────
// 🔴 15.08, скарга Вови: «заходжу на стрічку, виходжу на іншу вкладку, заходжу знов
// — весь контент ніби блимає, ніби перезавантажується. Так само у вкладці Дошка».
//
// 📐 ЗАМІРЯНО (`tests/tools/tab-return-flash.mjs`, фото по мережі з затримкою 40мс):
// повна заміна `innerHTML` дає **5 кадрів (≈83мс), у яких ЖОДНА з 12 фотографій не
// намальована** — вузли `<img>` створюються заново і починають завантаження з нуля.
// Точкове оновлення і «не чіпати DOM» дають **0**. Це і є «блим».
//
// 🔑 ЧОМУ ПОРІВНЮЄМО РЯДОК HTML, А НЕ СПИСОК ПОЛІВ: підпис із «id + текст + лайки…»
// доводиться тримати руками, і забуте поле дає ТИХИЙ баг — зміна не доїжджає до
// екрана, і ніхто не розуміє чому. Якщо ж однаковий рядок розмітки — картинка на
// екрані однакова ЗА ВИЗНАЧЕННЯМ, забути нічого неможливо.
//
// 🛑 І НЕ ПОРІВНЮЄМО з `el.innerHTML`, хоч це виглядало б найчеснішим: браузер його
// НОРМАЛІЗУЄ. Заміряно: `hidden` повертається як `hidden=""`, одинарні лапки стають
// подвійними — тобто рядки не збіглися б НІКОЛИ, умова була б завжди хибною, і фікс
// мовчки не працював би. Тому памʼятаємо саме те, що записали.
//
// ⚠️ `WeakMap`, а не `dataset`: розмітка списку це десятки кілобайт, і в атрибуті
// вона роздула б сам DOM. WeakMap ще й не тримає вузол від збирання сміття.
const _painted = new WeakMap();

/**
 * Записати розмітку, лише якщо вона справді інша.
 * @returns {boolean} true — намалювали (можна дротувати обробники);
 *                    false — нічого не робили, DOM недоторканий.
 */
export function paintIfChanged(el, html) {
  if (!el) return false;
  if (_painted.get(el) === html) return false;
  el.innerHTML = html;
  _painted.set(el, html);
  return true;
}

/**
 * Забути запамʼятовану розмітку — наступний `paintIfChanged` намалює безумовно.
 * 🔴 ОБОВʼЯЗКОВО кликати після ТОЧКОВИХ змін DOM (`patchPostCard`, `insertPostCard`,
 * `removePostCard`, перестановка закріплених): вони міняють екран повз цю функцію,
 * і без скидання підпис описував би вже неіснуючий стан.
 */
export function forgetPaint(el) {
  if (el) _painted.delete(el);
}
