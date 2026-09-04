// ЄДИНИЙ ПОВНОЕКРАННИЙ ПЕРЕГЛЯД ФОТО: щипок, свайп між кадрами, свайп на закриття.
//
// 🔴 27.08 — ПЕРЕЇХАВ СЮДИ ЗІ «СТРІЧКИ» (`tabs/feed.js`), бо користувачів стало
// двоє: пости Стрічки і ФОТО В ТІЛІ СТАТТІ (потік /byyou 2Б-1).
//
// 🔴 04.09 — СЮДИ ЗВЕДЕНО ЩЕ ДВА ПЕРЕГЛЯДАЧІ, І ДОДАНО ЗУМ (замовлення Вови).
// 🗣️ Дослівно: «треба додати можливість нормально зумити будь-які фото в
// застосунку… і закривати свайпом вверх-вниз. Але не так, щоб при маленькому
// русі воно дергане і закрилося. Як звичайно в застосунку, як у Фейсбуці це
// працює, чи в Телеграмі… не тільки в оголошенні, а там будь-які фото, які
// надсилаються в приватні повідомлення, чи в постах, чи будь це аватарка».
//
// 🛑 ЩО БУЛО ДО ЦЬОГО — ТРИ РЕАЛІЗАЦІЇ, ЖОДНА БЕЗ ЗУМУ:
//   • `fd-viewer` (тут)             — Стрічка + фото в тілі статті;
//   • `pm-lightbox` (`core/utils.js`) — приватні повідомлення + аватар у картці;
//   • `cm-photo-lightbox` (`tabs/board.js`) — фото в оголошенні Дошки.
// Дві з них навіть звались ОДНАКОВО — `openPhotoLightbox`, і це був різний код.
// 🔑 Тому замовлення закривається зведенням, а не трьома правками: додати зум у
// три місця означало б отримати три різні зуми. Цей файл уже попереджав про таке
// у власній шапці 27.08 — «у проєкті двічі розходились дві реалізації того
// самого»; за тиждень їх стало три.
//
// ⚠️ Класи лишились `fd-*`, і стилі лишились у `style/feed.css`. Перейменування
// коштувало б правок у двох файлах заради нічого: CSS у нас один на застосунок
// (`style.css` збирає все), тож ці правила однаково глобальні.
//
// 🔴 Z-INDEX 3600 — ВІД НАЙВИЩОГО З ТРЬОХ, А НЕ ВІД СЕРЕДНЬОГО. Було: 1200
// (Дошка), 1400 (Стрічка), 3600 (чат і картка жителя). Узяти менше означало б
// повторити баг 02.08, коли фото малювалось ПІД аркушем оголошення і Вова бачив
// «тап по фото нічого не робить». Картка профілю стоїть на 3500, чат на 2401.
import { escapeHtml } from './utils.js';
import { openLayer, closeLayer } from './layers.js';

const IC_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';

// ── ПОРОГИ ЖЕСТУ ЗАКРИТТЯ ────────────────────────────────────────────────────
// 🗣️ Пряма вимога Вови: «не так, щоб при маленькому русі воно дергане і
// закрилося». Тому порогів ДВА, і закриває будь-який:
//   • ШЛЯХ — палець проїхав достатньо далеко (повільний свідомий рух);
//   • ШВИДКІСТЬ — короткий різкий кидок (звичний жест, шлях там малий).
// Один лише шлях змусив би тягнути фото пів екрана; одна лише швидкість ловила б
// випадкові смикання. Разом вони й дають поведінку Телеграма.
const ПОРІГ_ЗАКРИТТЯ = 90;     // px — далі цього відпускання закриває
const ПОРІГ_ШВИДКОСТІ = 0.55;  // px/ms — різкий кидок закриває і на короткому шляху
// 🔴 ЦЕЙ ПОРІГ ЗНАЙШОВ СТЕНД, І ВІН ТУТ НАЙВАЖЛИВІШИЙ. Без нього перевірка
// «малий рух не закриває» падала: смикання на 28px триває кілька мілісекунд,
// тобто його ШВИДКІСТЬ завжди висока — і кидок спрацьовував там, де людина
// нічого не просила. Рівно скарга Вови «при маленькому русі воно дергане і
// закрилося», тільки відтворена стендом до деплою, а не пальцем після.
// ➡️ Швидкість закриває лише разом із хоч якимось шляхом.
const МІН_ШЛЯХ_ДЛЯ_КИДКА = 45;  // px
const ПОРІГ_НАМІРУ = 10;       // px — доки менше, жест не почався ВЗАГАЛІ
const МАКС_ЗУМ = 4;
const ЗУМ_ПО_ДВІЙНОМУ_ТАПУ = 2.5;

// Відстань між двома пальцями — для щипка.
const дистанція = (t) => Math.hypot(
  t[0].clientX - t[1].clientX, t[0].clientY - t[1].clientY);
const середина = (t) => ({
  x: (t[0].clientX + t[1].clientX) / 2,
  y: (t[0].clientY + t[1].clientY) / 2,
});

/**
 * @param {string|string[]} images — одне фото або галерея.
 * @param {number} startIdx — з якого кадру відкрити.
 * @param {object} [opts]
 * @param {string} [opts.fallbackUrl] — запасна адреса, якщо основна не завантажилась.
 *   Потрібна рівно картці жителя: з 23.08 вона просить ВЕЛИКУ версію фото, якої в
 *   аватарів старших за цю дату не існує. Без відкату там був би чорний екран зі
 *   зламаною картинкою — гірше, ніж дрібне фото, яке людина бачила вчора.
 */
export function openPhotoViewer(images, startIdx = 0, opts = {}) {
  const список = (Array.isArray(images) ? images : [images]).filter(Boolean);
  if (!список.length) return;
  const { fallbackUrl = '' } = opts;

  const ov = document.createElement('div');
  ov.className = 'fd-viewer';
  ov.innerHTML = `
    <button class="fd-viewer-close" type="button" aria-label="Закрити">${IC_CLOSE}</button>
    <div class="fd-viewer-track">${список.map(u =>
      `<div class="fd-viewer-slide"><img src="${escapeHtml(u)}" alt="" draggable="false"></div>`).join('')}</div>
    ${список.length > 1 ? '<div class="fd-viewer-count"></div>' : ''}`;

  const track = ov.querySelector('.fd-viewer-track');
  const countEl = ov.querySelector('.fd-viewer-count');

  // Запасна адреса — та сама поведінка, що була в `pm-lightbox`. Умова «ще не
  // підміняли» боронить від кола, якщо запасна теж не долетить.
  if (fallbackUrl) {
    ov.querySelectorAll('img').forEach(im => {
      im.addEventListener('error', () => {
        if (!im.dataset.fellBack && im.src !== fallbackUrl) {
          im.dataset.fellBack = '1'; im.src = fallbackUrl;
        }
      });
    });
  }

  // Спільний механізм шарів (core/layers.js): системний жест «назад» і кнопка
  // браузера закривають перегляд фото, а не відкочують застосунок.
  const layer = openLayer(() => { ov.remove(); document.body.style.overflow = ''; });
  const close = () => closeLayer(layer);

  // ── СТАН ЗУМУ (свій на КОЖЕН кадр) ─────────────────────────────────────────
  // 🔑 Стан у полі елемента, а не в одній змінній на переглядач: людина зумить
  // друге фото, гортає до третього і назад — масштаб має лишитись там, де вона
  // його поставила. Спільна змінна показала б чуже наближення на сусідньому кадрі.
  const стан = (slide) => (slide.__zoom ||= { s: 1, x: 0, y: 0 });
  const намалювати = (slide, анімовано = false) => {
    const z = стан(slide);
    const img = slide.querySelector('img');
    if (!img) return;
    img.style.transition = анімовано ? 'transform .22s cubic-bezier(.22,.61,.36,1)' : 'none';
    img.style.transform = `translate3d(${z.x}px, ${z.y}px, 0) scale(${z.s})`;
    slide.classList.toggle('fd-viewer-slide--zoomed', z.s > 1.01);
    // Поки кадр наближений, горизонтальне гортання між фото мусить мовчати —
    // інакше рух пальцем по збільшеному фото гортав би галерею замість панорами.
    track.classList.toggle('fd-viewer-track--locked', z.s > 1.01);
  };
  // Не даємо відтягнути фото за власні краї: зумоване фото більше за екран рівно
  // на (scale-1), і далі цієї межі під пальцем була б порожнеча.
  const межі = (slide) => {
    const z = стан(slide);
    const img = slide.querySelector('img');
    if (!img) return;
    const w = img.clientWidth, h = img.clientHeight;
    const maxX = Math.max(0, (w * z.s - track.clientWidth) / 2);
    const maxY = Math.max(0, (h * z.s - track.clientHeight) / 2);
    z.x = Math.min(maxX, Math.max(-maxX, z.x));
    z.y = Math.min(maxY, Math.max(-maxY, z.y));
  };
  const скинути = (slide, анімовано = true) => {
    const z = стан(slide);
    z.s = 1; z.x = 0; z.y = 0;
    намалювати(slide, анімовано);
  };
  const активний = () => track.children[
    Math.round(track.scrollLeft / Math.max(1, track.clientWidth))] || track.children[0];

  // ── ЖЕСТИ ──────────────────────────────────────────────────────────────────
  let режим = '';            // '' | 'пан' | 'щипок' | 'закриття'
  let x0 = 0, y0 = 0, t0 = 0;
  let базовийЗум = 1, базоваДист = 0, базX = 0, базY = 0;
  let dy = 0;

  const малюватиЗакриття = (зсув) => {
    const k = Math.min(1, Math.abs(зсув) / 320);
    ov.style.background = `rgba(0,0,0,${(0.96 - k * 0.55).toFixed(3)})`;
    const slide = активний();
    if (slide) {
      const img = slide.querySelector('img');
      if (img) {
        img.style.transition = 'none';
        img.style.transform = `translate3d(0, ${зсув}px, 0) scale(${(1 - k * 0.18).toFixed(4)})`;
      }
    }
  };

  track.addEventListener('touchstart', (e) => {
    const slide = активний();
    if (e.touches.length === 2) {
      // Щипок починається завжди — навіть посеред іншого жесту (перебивність).
      режим = 'щипок';
      базоваДист = дистанція(e.touches);
      базовийЗум = стан(slide).s;
      const c = середина(e.touches);
      x0 = c.x; y0 = c.y;
      базX = стан(slide).x; базY = стан(slide).y;
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    x0 = t.clientX; y0 = t.clientY; t0 = performance.now();
    базX = стан(slide).x; базY = стан(slide).y;
    dy = 0;
    режим = стан(slide).s > 1.01 ? 'пан' : '';
  }, { passive: true });

  track.addEventListener('touchmove', (e) => {
    const slide = активний();
    if (!slide) return;
    const z = стан(slide);

    if (режим === 'щипок' && e.touches.length === 2) {
      e.preventDefault();
      const d = дистанція(e.touches);
      z.s = Math.min(МАКС_ЗУМ, Math.max(1, базовийЗум * (d / (базоваДист || d))));
      const c = середина(e.touches);
      z.x = базX + (c.x - x0);
      z.y = базY + (c.y - y0);
      межі(slide);
      намалювати(slide);
      return;
    }
    if (e.touches.length !== 1) return;
    const t = e.touches[0];
    const дх = t.clientX - x0, ду = t.clientY - y0;

    if (режим === 'пан') {
      e.preventDefault();
      z.x = базX + дх; z.y = базY + ду;
      межі(slide);
      намалювати(slide);
      return;
    }
    if (режим === '') {
      // 🛑 ТУТ І ЖИВЕ ВИМОГА «НЕ СМИКАЄТЬСЯ». Доки палець не пройшов ПОРІГ_НАМІРУ,
      // не починаємо нічого. А коли пройшов — вирішуємо ОДИН раз, куди саме він
      // їде: вертикально це закриття, горизонтально — гортання галереї, і його
      // веде нативний скрол треку (він плавніший за будь-який наш).
      if (Math.abs(ду) < ПОРІГ_НАМІРУ && Math.abs(дх) < ПОРІГ_НАМІРУ) return;
      режим = Math.abs(ду) > Math.abs(дх) * 1.2 ? 'закриття' : 'гортання';
      if (режим === 'закриття') ov.classList.add('fd-viewer--dragging');
    }
    if (режим === 'закриття') {
      e.preventDefault();
      dy = ду;
      малюватиЗакриття(dy);
    }
  }, { passive: false });

  const завершити = () => {
    const slide = активний();
    if (режим === 'закриття' && slide) {
      const шлях = Math.abs(dy);
      const швидкість = шлях / Math.max(1, performance.now() - t0);
      // Два незалежні приводи закрити: далекий свідомий рух АБО різкий кидок —
      // але кидок лише тоді, коли шлях узагалі був. Саме друга половина умови й
      // відрізняє жест від смикання.
      const кидок = швидкість > ПОРІГ_ШВИДКОСТІ && шлях > МІН_ШЛЯХ_ДЛЯ_КИДКА;
      if (шлях > ПОРІГ_ЗАКРИТТЯ || кидок) {
        const img = slide.querySelector('img');
        if (img) {
          img.style.transition = 'transform .2s ease-out';
          img.style.transform = `translate3d(0, ${dy > 0 ? 600 : -600}px, 0) scale(.8)`;
        }
        ov.style.transition = 'background .2s ease-out, opacity .2s ease-out';
        ov.style.opacity = '0';
        setTimeout(close, 180);
        return;
      }
      // Не дотягнув — пружно на місце. Саме ця гілка й рятує від «дерганого».
      ov.classList.remove('fd-viewer--dragging');
      ov.style.background = '';
      скинути(slide, true);
    }
    if (режим === 'щипок' && slide) {
      // Відпустив нижче за 1 — доводимо рівно до 1, без «майже наближено».
      if (стан(slide).s <= 1.01) скинути(slide, true);
      else { межі(slide); намалювати(slide, true); }
    }
    режим = '';
  };
  track.addEventListener('touchend', завершити, { passive: true });
  track.addEventListener('touchcancel', завершити, { passive: true });

  // Подвійний тап — той самий зум, але для тих, хто не робить щипок.
  // ⚠️ 320мс і 24px: більше — і звичайний подвійний тап не встигає; менше —
  // два окремі тапи по фото зливаються в один зум.
  let останнійТап = 0, тапX = 0, тапY = 0;
  track.addEventListener('click', (e) => {
    const тепер = performance.now();
    const slide = активний();
    const подвійний = тепер - останнійТап < 320
      && Math.hypot(e.clientX - тапX, e.clientY - тапY) < 24;
    останнійТап = тепер; тапX = e.clientX; тапY = e.clientY;
    if (!подвійний || !slide) return;
    const z = стан(slide);
    if (z.s > 1.01) скинути(slide, true);
    else {
      z.s = ЗУМ_ПО_ДВІЙНОМУ_ТАПУ;
      // Наближаємо В ТОЧКУ ТАПУ, а не в центр: інакше людина цілиться в обличчя
      // на краю кадру, а отримує середину фото.
      const r = track.getBoundingClientRect();
      z.x = (r.width / 2 - (e.clientX - r.left)) * (z.s - 1);
      z.y = (r.height / 2 - (e.clientY - r.top)) * (z.s - 1);
      межі(slide);
      намалювати(slide, true);
    }
  });

  ov.querySelector('.fd-viewer-close').addEventListener('click', close);
  // Тап по фону закриває — але лише коли нічого не наближено: інакше вихід із
  // панорами по збільшеному фото випадково закривав би перегляд.
  ov.addEventListener('click', e => {
    const slide = активний();
    if (slide && стан(slide).s > 1.01) return;
    if (e.target === ov || e.target.classList.contains('fd-viewer-slide')) close();
  });

  const оновитиЛічильник = () => {
    if (!countEl || !track.clientWidth) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    countEl.textContent = `${i + 1} / ${список.length}`;
  };
  track.addEventListener('scroll', () => {
    requestAnimationFrame(оновитиЛічильник);
  }, { passive: true });

  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  track.scrollLeft = (startIdx || 0) * track.clientWidth;   // відкрити на потрібному фото
  оновитиЛічильник();
}
