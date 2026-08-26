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
// підходить обом наявним: нижче дві речі, яких немає в жодному підручнику.
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
