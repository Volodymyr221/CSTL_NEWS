// src/core/auto-carousel.js — АВТО-ГОРТАННЯ ГОРИЗОНТАЛЬНОЇ ДОРІЖКИ.
//
// 🔑 ЧОМУ ОКРЕМИЙ ФАЙЛ, А НЕ ЩЕ ОДНА КОПІЯ В МОДУЛІ ВКЛАДКИ.
// Такий механізм у проєкті вже є — `startNewsCarousel()` у `tabs/community-blocks.js`.
// Він робочий і вистражданий: кожен його запобіжник куплений окремим багом. Друга копія
// того самого поруч — рівно та хвороба, від якої проєкт уже страждав (два списки
// антиспаму розійшлись, дві копії розмітки шкали автобуса дали зникнення смуги).
//
// ✅ 26.08 — БОРГ ЗАКРИТО: карусель новин переведена сюди. Тепер це ЄДИНА реалізація
// авто-гортання в проєкті, і споживачів у неї двоє — віджет Стрічки (`tabs/home-feed.js`)
// і новини Громади (`tabs/community-blocks.js`).
// 🛑 Тут два дні стояло «карусель новин ЩЕ НЕ переведена — у сусідньому файлі паралельно
// працює друга сесія». Це була правда 25.08 і перестала бути правдою, щойно та гілка
// доїхала в `main`. Прибираю рядок разом із самим боргом — обґрунтування, яке пережило
// свою підставу, у цьому проєкті вже одного разу коштувало цілої правки (віджет Стрічки,
// коментар «глибокого переходу немає навмисно»).
// ⚠️ Додаєш сюди третього споживача — не «підправ під себе», а звір, що поведінка
// підходить обом наявним: нижче три речі, яких немає в жодному підручнику.
//
// 🔴 ТРИ РЕЧІ, ЯКІ ТУТ НЕ МОЖНА СПРОСТИТИ:
//   1. ПРОКРУТКУ РОБИТЬ БРАУЗЕР (`scrollTo` зі `smooth`), а не наша анімація. Інакше
//      жест пальцем і авто-рух борються за той самий елемент — це вже коштувало
//      окремого блока роботи 02.08 у модалці оголошення.
//   2. ПОТОЧНИЙ СЛАЙД РАХУЄТЬСЯ ЗА РЕАЛЬНИМ ПОЛОЖЕННЯМ ПРОКРУТКИ, а не власним
//      лічильником. Людина могла гортнути пальцем — і лічильник розійшовся б із тим,
//      що на екрані. Той самий клас, що B-27: два лічильники того самого стану.
//   3. 🆕 19.09 — ПЕРЕРВАНИЙ КРОК ДОКОЧУЄТЬСЯ, А ПАУЗУ СТАВИТЬ ЛИШЕ ГОРИЗОНТАЛЬНИЙ ЖЕСТ.
//      Розгорнуто нижче — це найсвіжіша і найменш очевидна частина файлу.
//
// ═════════════════════════════════════════════════════════════════════════════
// 🗣️ СКАРГА ВОВИ 19.09, З ЯКОЇ ВИРІС ПУНКТ 3:
// «якщо блок автоматично проскролюється і в цей момент я вертикально скролю сторінку,
// і попадає саме на той блок, який зараз скролиться горизонтально — відбувається типу
// як натиск, і блок зависає на середині між двома карточками… Він має доскролитись до
// кінця. Він не має реагувати на рух, коли я вертикально скролю сторінку».
//
// 🔑 ПРИЧИНА — НЕ В НАШОМУ КОДІ, А В ТОМУ, ЩО НАШ КОД ЦЬОГО НЕ ПРИБИРАВ ЗА СОБОЮ.
// Браузер САМ гасить плавну прокрутку скролера, щойно його торкнувся палець — так само,
// як дотик зупиняє інерцію списку. Палець при вертикальному скролі сторінки просто
// проїжджає по доріжці (у доріжки `overflow-y: hidden`, тож сам рух іде сторінці) — але
// авто-крок уже мертвий. Далі два лиха складались:
//   • `pause()` висів на самому `touchstart`, тобто пауза ставилась і на ЧУЖИЙ жест —
//     на 2 цикли (для новин це 20 секунд);
//   • наступний крок мав прийти аж через цикл, а `visibleIndex()` до того ж рахує
//     НАЙБЛИЖЧИЙ слайд: перервавшись на 40%, карусель поїхала б НАЗАД.
// Тобто доріжка лишалась стояти між картками рівно так, як Вова й описав: «пів картки
// видно минулої і пів наступної».
//
// 🛑 ЧОМУ НЕ «ПРОСТО НЕ ДАВАТИ БРАУЗЕРУ ГАСИТИ». Немає такого важеля: скасування
// плавної прокрутки на дотик — поведінка рушія, і правильно, що вона є (без неї палець
// не міг би зупинити те, що їде). Єдине чесне лікування — ДОКОТИТИ те, що урвалось.
//
// 🔴 І ЧОМУ НЕ ВЛАСНА АНІМАЦІЯ, ЯКУ НІХТО НЕ СКАСУЄ — саме те, що проситься першим.
// Це пункт 1 вище, куплений цілим блоком роботи 02.08: власний рух не гаситься пальцем,
// і людина, яка гортнула доріжку рукою, отримала б перетягування каната. Докочування
// лишає кермо браузеру: ми лише повторюємо `scrollTo` туди ж, куди вели.
// ═════════════════════════════════════════════════════════════════════════════

const CYCLE_MS = 5000;
// Скільки тиші в прокрутці вважаємо «рух скінчився». Менше — і ми перебивали б
// плавний крок на його ж половині; більше — людина встигає побачити зависання.
const SETTLE_MS = 160;
// Наскільки далеко від картки доріжка має право стояти. 2px — на дробові значення
// `scrollLeft` при масштабі екрана, а не запас «майже прилягла».
const SNAP_EPS = 2;
// З якого зсуву пальця вже видно, куди людина веде. Менше — випадкове тремтіння
// рахувалось би за гортання доріжки.
const INTENT_PX = 8;

/**
 * @param track    елемент-доріжка (горизонтальний скролер зі `scroll-snap`)
 * @param opts     { slideSel, cycleMs, onSlide }
 *                 onSlide(i) кличеться щоразу, коли у вікні опиняється інший слайд.
 * @returns        stop() — знімає таймер, спостерігач і слухачі
 */
export function startAutoCarousel(track, opts = {}) {
  const slideSel = opts.slideSel || ':scope > *';
  const cycleMs = opts.cycleMs || CYCLE_MS;
  const onSlide = typeof opts.onSlide === 'function' ? opts.onSlide : () => {};

  const slides = [...track.querySelectorAll(slideSel)];
  // Один слайд — це не карусель. Але про нього однаково треба сказати назовні один раз,
  // інакше споживач лишиться без початкового стану (у нас це підсвічена спільнота).
  if (slides.length < 2) { onSlide(0); return () => {}; }

  const точкаСлайда = (i) => slides[i].offsetLeft - track.offsetLeft;

  const visibleIndex = () => {
    const left = track.scrollLeft;
    let best = 0, bestD = Infinity;
    slides.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - track.offsetLeft - left);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };

  let last = -1;
  const sync = () => {
    const i = visibleIndex();
    if (i === last) return;   // не смикаємо споживача на кожному кадрі прокрутки
    last = i;
    onSlide(i);
  };

  let raf = 0;
  const onScroll = () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; sync(); });
  };
  track.addEventListener('scroll', onScroll, { passive: true });
  sync();

  // «Зменшити рух» — не косметика: для вестибулярних розладів самочинний рух на екрані
  // це симптом, а не незручність. Слайди лишаються, гортати можна пальцем.
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) return () => { track.removeEventListener('scroll', onScroll); };

  // ── КУДИ ЇДЕ ПОТОЧНИЙ КРОК ──────────────────────────────────────────────────
  // 🔑 `ціль` — НЕ другий лічильник слайда (це заборонено пунктом 2 вище). Це намір
  // ОДНОГО кроку, який живе лише поки крок їде: щойно доріжка приїхала або людина
  // повела її рукою — намір гасне, і положення знову рахується з `scrollLeft`.
  let ціль = null;
  let докочення = 0;
  let палецьНаДоріжці = false;

  const докотити = () => {
    clearTimeout(докочення);
    докочення = setTimeout(() => {
      // Рука ще на екрані — не сперечаємось із нею. Докотимо на `touchend`.
      if (палецьНаДоріжці) return;
      // 🛑 МЕЖА ПРОКРУТКИ, А НЕ «КУДИ ПРОСИЛИ». Без неї недосяжна ціль (доріжку
      // звузили, слайд обрізало) давала б ВІЧНЕ докочування: кожні 160мс новий
      // `scrollTo`, який ніколи не доїде. Свій же запобіжник з'їв би батарею.
      const макс = track.scrollWidth - track.clientWidth;
      if (макс <= 0) { ціль = null; return; }
      const хочу = ціль != null ? ціль : точкаСлайда(visibleIndex());
      const куди = Math.max(0, Math.min(макс, хочу));
      if (Math.abs(track.scrollLeft - куди) <= SNAP_EPS) { ціль = null; return; }
      track.scrollTo({ left: куди, behavior: 'smooth' });
    }, SETTLE_MS);
  };
  track.addEventListener('scroll', докотити, { passive: true });

  const step = () => {
    if (document.hidden || track.dataset.paused === '1') return;
    const next = visibleIndex() + 1;
    const target = next >= slides.length ? slides[0] : slides[next];
    ціль = target.offsetLeft - track.offsetLeft;
    track.scrollTo({ left: ціль, behavior: 'smooth' });
  };
  let timer = setInterval(step, cycleMs);

  // Гортнув доріжку — авто-рух відступає. Не назавжди: людина могла просто зачепити
  // екран, і мовчазна карусель після цього виглядала б як «віджет завис».
  let resume = null;
  const pause = () => {
    track.dataset.paused = '1';
    clearTimeout(resume);
    resume = setTimeout(() => { track.dataset.paused = '0'; resume = null; }, cycleMs * 2);
  };

  // ── ЧИЙ ЦЕ ЖЕСТ: ДОРІЖКИ ЧИ СТОРІНКИ ───────────────────────────────────────
  // 🛑 ПАУЗУ СТАВИТЬ НЕ ДОТИК, А ГОРИЗОНТАЛЬНИЙ НАМІР. До 19.09 тут стояв `pause` прямо
  // на `touchstart` — і вертикальний скрол сторінки, палець якого проїхав по доріжці,
  // глушив карусель на два цикли. Тобто блок «завмирав від того, що людина читає сторінку».
  let старт = null;
  let вирішено = false;
  const onTouchStart = (e) => {
    палецьНаДоріжці = true;
    вирішено = false;
    const t = e.touches && e.touches[0];
    старт = t ? { x: t.clientX, y: t.clientY } : null;
  };
  const onTouchMove = (e) => {
    if (вирішено || !старт) return;
    const t = e.touches && e.touches[0];
    if (!t) return;
    const dx = Math.abs(t.clientX - старт.x);
    const dy = Math.abs(t.clientY - старт.y);
    if (Math.max(dx, dy) < INTENT_PX) return;   // ще не видно, куди людина веде
    вирішено = true;
    if (dx <= dy) return;                       // сторінка їде вертикально — не наше
    ціль = null;                                // далі веде рука, а не намір кроку
    pause();
  };
  const onTouchEnd = () => {
    палецьНаДоріжці = false;
    старт = null;
    // 🔑 Саме тут докочується перерваний крок. Через `scroll` його не спіймати: браузер,
    // гасячи плавну прокрутку, лишає доріжку на місці — а положення без руху події
    // прокрутки не дає.
    докотити();
  };
  track.addEventListener('touchstart', onTouchStart, { passive: true });
  track.addEventListener('touchmove', onTouchMove, { passive: true });
  track.addEventListener('touchend', onTouchEnd, { passive: true });
  track.addEventListener('touchcancel', onTouchEnd, { passive: true });
  // Миша і перо наміру не показують — там натиск справді означає «людина тут».
  // ⚠️ Дотик сюди теж приходить (`pointerType: 'touch'`), і без цього відсіву пауза
  // поверталась би на кожен дотик повз слухачі вище — тобто правка була б косметичною.
  const onPointerDown = (e) => { if (e.pointerType === 'touch') return; pause(); };
  track.addEventListener('pointerdown', onPointerDown);

  // 🔑 Поки блока не видно — він не рухається. На Громаді вже крутиться карусель новин,
  // і без цього екран «дихав» би у двох місцях одразу; заразом це не витрачає батарею
  // на рух, якого ніхто не бачить.
  let io = null;
  if ('IntersectionObserver' in window) {
    io = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) track.dataset.paused = '1';
        else if (!resume) track.dataset.paused = '0';
      });
    }, { threshold: 0 });
    io.observe(track);
  }

  return () => {
    clearInterval(timer); timer = null;
    clearTimeout(resume);
    clearTimeout(докочення);
    if (io) { io.disconnect(); io = null; }
    track.removeEventListener('scroll', onScroll);
    track.removeEventListener('scroll', докотити);
    track.removeEventListener('touchstart', onTouchStart);
    track.removeEventListener('touchmove', onTouchMove);
    track.removeEventListener('touchend', onTouchEnd);
    track.removeEventListener('touchcancel', onTouchEnd);
    track.removeEventListener('pointerdown', onPointerDown);
  };
}
