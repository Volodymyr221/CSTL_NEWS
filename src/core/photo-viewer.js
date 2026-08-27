// Повноекранний перегляд фото зі свайпом між знімками.
//
// 🔴 27.08 — ПЕРЕЇХАВ СЮДИ ЗІ «СТРІЧКИ» (`tabs/feed.js`), бо користувачів стало
// двоє: пости Стрічки і ФОТО В ТІЛІ СТАТТІ (потік /byyou 2Б-1).
//
// 🛑 ЧОМУ ПЕРЕЇЗД, А НЕ ДРУГА КОПІЯ. У проєкті вже двічі розходились дві
// реалізації того самого (списки антиспаму, шкала автобуса, авто-карусель), і
// симптом щоразу виглядав як вада продукту, а не як розсинхрон. Перегляд фото —
// саме такий випадок: він тримає жест «назад», прокрутку тіла і прилипання
// слайдів, тобто три речі, які легко розійтись.
//
// 🔑 ПРАВИЛО №14 (беремо зміст, малюємо своїм) саме про це: стаття з чужого сайту
// показує фото НАШИМ переглядачем, а не тим, що був на джерелі.
//
// ⚠️ Класи лишились `fd-*`, і стилі лишились у `style/feed.css`. Перейменування
// коштувало б правок у двох файлах заради нічого: CSS у нас один на застосунок
// (`style.css` збирає все), тож ці правила однаково глобальні.
import { escapeHtml } from './utils.js';
import { openLayer, closeLayer } from './layers.js';

const IC_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';

export function openPhotoViewer(images, startIdx) {
  if (!images || !images.length) return;
  const ov = document.createElement('div');
  ov.className = 'fd-viewer';
  ov.innerHTML = `
    <button class="fd-viewer-close" type="button">${IC_CLOSE}</button>
    <div class="fd-viewer-track">${images.map(u =>
      `<div class="fd-viewer-slide"><img src="${escapeHtml(u)}" alt=""></div>`).join('')}</div>`;
  // Той самий механізм, що й у решти шарів (core/layers.js): системний жест
  // «назад» і кнопка браузера закривають перегляд фото, а не відкочують додаток.
  const layer = openLayer(() => { ov.remove(); document.body.style.overflow = ''; });
  const close = () => closeLayer(layer);
  ov.querySelector('.fd-viewer-close').addEventListener('click', close);
  ov.addEventListener('click', e => { if (e.target === ov || e.target.classList.contains('fd-viewer-slide')) close(); });
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  const track = ov.querySelector('.fd-viewer-track');
  track.scrollLeft = (startIdx || 0) * track.clientWidth;   // відкрити на потрібному фото
}
