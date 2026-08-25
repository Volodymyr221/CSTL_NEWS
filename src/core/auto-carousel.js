// src/core/auto-carousel.js — АВТО-ГОРТАННЯ ГОРИЗОНТАЛЬНОЇ ДОРІЖКИ.
//
// 🔑 ЧОМУ ОКРЕМИЙ ФАЙЛ, А НЕ ЩЕ ОДНА КОПІЯ В МОДУЛІ ВКЛАДКИ.
// Такий механізм у проєкті вже є — `startNewsCarousel()` у `tabs/community-blocks.js`.
// Він робочий і вистражданий: кожен його запобіжник куплений окремим багом. Друга копія
// того самого поруч — рівно та хвороба, від якої проєкт уже страждав (два списки
// антиспаму розійшлись, дві копії розмітки шкали автобуса дали зникнення смуги).
//
// ⚠️ ЧЕСНО ПРО СТАН: карусель новин на цей модуль ЩЕ НЕ ПЕРЕВЕДЕНА, тобто зараз у
// проєкті співіснують дві реалізації. Це свідомо і тимчасово — 25.08 у сусідньому
// `community-blocks.js` паралельно працює друга сесія, і переписувати той файл під нею
// означало б забрати в неї роботу конфліктом злиття (HOT_RULES №13). Переведення новин
// сюди — окремий крок, який треба зробити, щойно та гілка доїде в `main`.
// ➡️ Робиш його — звір поведінку з `startNewsCarousel` рядок у рядок: там є ДВІ речі,
// яких немає в жодному підручнику (див. нижче), і загубити їх легко.
//
// 🔴 ДВІ РЕЧІ, ЯКІ ТУТ НЕ МОЖНА СПРОСТИТИ:
//   1. ПРОКРУТКУ РОБИТЬ БРАУЗЕР (`scrollTo` зі `smooth`), а не наша анімація. Інакше
//      жест пальцем і авто-рух борються за той самий елемент — це вже коштувало
//      окремого блока роботи 02.08 у модалці оголошення.
//   2. ПОТОЧНИЙ СЛАЙД РАХУЄТЬСЯ ЗА РЕАЛЬНИМ ПОЛОЖЕННЯМ ПРОКРУТКИ, а не власним
//      лічильником. Людина могла гортнути пальцем — і лічильник розійшовся б із тим,
//      що на екрані. Той самий клас, що B-27: два лічильники того самого стану.

const CYCLE_MS = 5000;

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

  const step = () => {
    if (document.hidden || track.dataset.paused === '1') return;
    const next = visibleIndex() + 1;
    const target = next >= slides.length ? slides[0] : slides[next];
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  };
  let timer = setInterval(step, cycleMs);

  // Торкнувся — авто-рух відступає. Не назавжди: людина могла просто зачепити екран,
  // і мовчазна карусель після цього виглядала б як «віджет завис».
  let resume = null;
  const pause = () => {
    track.dataset.paused = '1';
    clearTimeout(resume);
    resume = setTimeout(() => { track.dataset.paused = '0'; resume = null; }, cycleMs * 2);
  };
  track.addEventListener('touchstart', pause, { passive: true });
  track.addEventListener('pointerdown', pause);

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
    if (io) { io.disconnect(); io = null; }
    track.removeEventListener('scroll', onScroll);
    track.removeEventListener('touchstart', pause);
    track.removeEventListener('pointerdown', pause);
  };
}
