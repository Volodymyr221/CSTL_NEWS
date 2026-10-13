// src/core/video-feed.js — ВІДЕО В СТРІЧЦІ: картка, автоплей, перегляд (12.10.2026).
//
// 🗣️ Вова: «продумати детальне відображення… щоб без лагів». Потік /byyou «відео»,
// кроки 5–7, 10. Підготовка й завантаження ролика — `core/video.js`.
//
// 🔑 ЯК ВИГЛЯДАЄ (рішення, звірене з Instagram/Facebook):
//   • ролик стоїть у картці на місці фото, у СВОЇЙ пропорції, але в рамці 4:5…16:9 —
//     вертикальне відео не займає два екрани, широке не стає смужкою;
//   • місце під ролик відоме ДО завантаження (w/h збережені при публікації) — картки
//     нижче не стрибають, коли відео «доїде»;
//   • до перегляду видно обкладинку (кадр ≈50 КБ) і тривалість;
//   • коли ролик ≥60% на екрані — грає сам БЕЗ звуку, по колу; звук — кнопкою в куті;
//   • тап по ролику — на весь екран зі звуком і керуванням.
//
// 🔑 ЧОМУ БЕЗ ЛАГІВ (кожен пункт — окрема причина гальм, яку знято):
//   1. `preload="none"` — браузер не тягне ЖОДНОГО байта ролика, поки той не почне
//      грати. Десять відео в стрічці коштують десять обкладинок, а не 300 МБ.
//   2. Грає РІВНО ОДИН ролик — найвидиміший. Два декодери відео одночасно на
//      середньому телефоні — це і є «лаги», плюс подвійний трафік.
//   3. Поза екраном / вкладка схована / зверху аркуш чи перегляд — пауза.
//   4. Економія трафіку (Save-Data) або «зменшити рух» — без автоплею взагалі:
//      лише обкладинка з ▶, ролик вантажиться тільки за тапом.
//   5. Ролик іде повз Service Worker (`sw.js`) — iOS не грає відео, яке SW віддає
//      без підтримки шматків (Range), і саме це дає «зависає на першому кадрі».

import { escapeHtml } from './utils.js';
import { openLayer, closeLayer } from './layers.js';
import { formatVideoDuration } from './video.js';

const IC_PLAY  = '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M8 5.14v13.72a1 1 0 0 0 1.52 .85l11.02 -6.86a1 1 0 0 0 0 -1.7l-11.02 -6.86a1 1 0 0 0 -1.52 .85z"/></svg>';
const IC_MUTED = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5"/><path d="M16 10l4 4m0 -4l-4 4"/></svg>';
const IC_SOUND = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M15 8a5 5 0 0 1 0 8"/><path d="M17.7 5a9 9 0 0 1 0 14"/><path d="M6 15h-2a1 1 0 0 1 -1 -1v-4a1 1 0 0 1 1 -1h2l3.5 -4.5a.8 .8 0 0 1 1.5 .5v14a.8 .8 0 0 1 -1.5 .5l-3.5 -4.5"/></svg>';
const IC_CLOSE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12"/><path d="M6 6l12 12"/></svg>';

const AR_MIN = 4 / 5;     // найвужче (вертикальне) — як фото-допис в Instagram
const AR_MAX = 16 / 9;    // найширше
const VISIBLE = 0.6;      // частка ролика на екрані, з якої він може грати сам

// Звук — вибір людини на весь сеанс: увімкнула в одному ролику — наступні теж зі
// звуком (так у Instagram). Нове відкриття застосунку — знову тихо.
let звукУвімкнено = false;

export function hasVideo(post) {
  return !!(post && post.video && post.video.url);
}

// Розмітка ролика для картки. Без `src` у тега немає зайвих запитів навіть у
// браузерах, які ігнорують preload="none": адресу ставимо лише перед першим play().
export function videoBlockHtml(post) {
  const v = post.video || {};
  const ar = (v.w && v.h) ? Math.min(AR_MAX, Math.max(AR_MIN, v.w / v.h)) : 16 / 9;
  const poster = v.poster ? escapeHtml(v.poster) : '';
  return `
    <div class="fd-video" data-video="${post.id}" style="--fd-var:${ar.toFixed(4)}">
      <video class="fd-video-el" data-src="${escapeHtml(v.url)}" ${poster ? `poster="${poster}"` : ''}
        muted playsinline loop preload="none" disablepictureinpicture disableremoteplayback></video>
      <span class="fd-vid-play" aria-hidden="true">${IC_PLAY}</span>
      ${v.dur ? `<span class="fd-vid-dur">${formatVideoDuration(v.dur)}</span>` : ''}
      <button class="fd-vid-sound" data-vid-sound type="button" aria-label="Увімкнути звук">${IC_MUTED}</button>
      <div class="fd-vid-err" hidden>
        <span>Це відео не відтворюється на цьому пристрої</span>
        <a href="${escapeHtml(v.url)}" target="_blank" rel="noopener">Відкрити відео</a>
      </div>
    </div>`;
}

// ── Автоплей: один ролик, найвидиміший ─────────────────────────────────────────
function autoplayAllowed() {
  try {
    if (navigator.connection && navigator.connection.saveData) return false;
    if (matchMedia('(prefers-reduced-motion: reduce)').matches) return false;
  } catch (_) {}
  return true;
}

// Щось перекриває стрічку (аркуш коментарів, композер, перегляд) — тоді не граємо.
function covered() {
  return !!document.querySelector('.fd-sheet-back, .fd-viewer, .fd-vviewer');
}

const частки = new Map();        // .fd-video → частка на екрані (0..1)
let io = null, mo = null, поточний = null;

function srcOn(el) {
  const v = el.querySelector('video');
  if (v && !v.getAttribute('src') && v.dataset.src) v.src = v.dataset.src;
  return v;
}

function playBox(box) {
  const v = srcOn(box);
  if (!v) return;
  v.muted = !звукУвімкнено;
  syncSoundBtn(box);
  const p = v.play();
  if (p && p.catch) p.catch(() => box.classList.remove('is-playing'));
  поточний = box;
}

function pauseBox(box) {
  const v = box?.querySelector('video');
  if (v && !v.paused) v.pause();
  if (поточний === box) поточний = null;
}

function syncSoundBtn(box) {
  const v = box.querySelector('video'), b = box.querySelector('.fd-vid-sound');
  if (!v || !b) return;
  b.innerHTML = v.muted ? IC_MUTED : IC_SOUND;
  b.setAttribute('aria-label', v.muted ? 'Увімкнути звук' : 'Вимкнути звук');
}

// Вирішити, хто грає зараз. Кличеться на кожну зміну видимості й перекриття.
function arbitrate() {
  if (document.hidden || covered()) { if (поточний) pauseBox(поточний); return; }
  // Відкрито екран спільноти — стрічка під ним теж «на екрані» за геометрією, але її
  // не видно. Грають лише ролики ВЕРХНЬОГО екрана.
  const верх = [...document.querySelectorAll('.fd-screen.open')].pop() || null;
  let кращий = null, max = 0;
  for (const [box, r] of частки) {
    if (!box.isConnected) { частки.delete(box); continue; }
    if (box.classList.contains('is-err')) continue;
    if ((box.closest('.fd-screen') || null) !== верх) continue;
    if (r >= VISIBLE && r > max) { max = r; кращий = box; }
  }
  if (поточний && поточний !== кращий) pauseBox(поточний);
  if (кращий && кращий !== поточний && autoplayAllowed()) playBox(кращий);
}

function ensureObservers() {
  if (io) return;
  io = new IntersectionObserver(entries => {
    for (const en of entries) частки.set(en.target, en.isIntersecting ? en.intersectionRatio : 0);
    arbitrate();
  }, { threshold: [0, 0.25, 0.6, 0.85, 1] });
  // Аркуші й перегляд з'являються як нові вузли в body — цього досить, щоб помітити
  // перекриття без опитування.
  mo = new MutationObserver(() => arbitrate());
  mo.observe(document.body, { childList: true });
  document.addEventListener('visibilitychange', arbitrate);
  window.addEventListener('cstl-tab-changed', () => setTimeout(arbitrate, 0));
}

// Під'єднати всі нові ролики всередині root. Безпечно кликати після кожної перемальовки.
export function wireFeedVideos(root) {
  if (!root || !('IntersectionObserver' in window)) return;
  const boxes = root.querySelectorAll('.fd-video:not([data-vwired])');
  if (!boxes.length) return;
  ensureObservers();
  boxes.forEach(box => {
    box.dataset.vwired = '1';
    const v = box.querySelector('video');
    v.addEventListener('playing', () => box.classList.add('is-playing'));
    v.addEventListener('pause', () => box.classList.remove('is-playing'));
    v.addEventListener('error', () => {
      // Формат, який цей пристрій не декодує (часто — HEVC з iPhone на ПК/Android):
      // лишаємо обкладинку і даємо відкрити файл окремо, а не чорний прямокутник.
      if (!v.getAttribute('src')) return;
      box.classList.add('is-err'); box.classList.remove('is-playing');
      box.querySelector('.fd-vid-err').hidden = false;
      if (поточний === box) поточний = null;
      arbitrate();
    });
    io.observe(box);
  });
}

// Тап по ролику в картці. Повертає true, якщо подію оброблено.
export function handleVideoTap(e) {
  const box = e.target.closest('.fd-video');
  if (!box) return false;
  if (e.target.closest('.fd-vid-err a')) return true;          // посилання — хай відкривається
  if (box.classList.contains('is-err')) return true;
  const sound = e.target.closest('[data-vid-sound]');
  const v = srcOn(box);
  if (sound) {
    звукУвімкнено = v.muted;                                     // muted → вмикаємо, і навпаки
    v.muted = !звукУвімкнено;
    if (v.paused) playBox(box); else syncSoundBtn(box);
    return true;
  }
  // Автоплей вимкнено (Save-Data / «менше руху») і ролик стоїть — перший тап запускає
  // його тут же, без переходу на весь екран.
  if (!autoplayAllowed() && v.paused && !box.classList.contains('was-started')) {
    box.classList.add('was-started'); playBox(box); return true;
  }
  openVideoViewer(v.dataset.src, { poster: v.getAttribute('poster') || '', from: v.currentTime || 0, inline: box });
  return true;
}

// ── Перегляд на весь екран ─────────────────────────────────────────────────────
export function openVideoViewer(url, { poster = '', from = 0, inline = null } = {}) {
  if (!url) return;
  if (inline) pauseBox(inline);
  const ov = document.createElement('div');
  ov.className = 'fd-vviewer';
  ov.innerHTML = `
    <button class="fd-viewer-close" type="button" aria-label="Закрити">${IC_CLOSE}</button>
    <video class="fd-vviewer-el" src="${escapeHtml(url)}" ${poster ? `poster="${escapeHtml(poster)}"` : ''}
      controls playsinline autoplay preload="auto" disablepictureinpicture></video>`;
  const v = ov.querySelector('video');
  v.muted = false;
  v.addEventListener('loadedmetadata', () => { if (from > 0.3) { try { v.currentTime = from; } catch (_) {} } }, { once: true });
  document.body.appendChild(ov);
  document.body.style.overflow = 'hidden';
  // Повернення в картку — з того самого місця, де людина зупинилась у перегляді.
  const layer = openLayer(() => {
    const t = v.currentTime || 0;
    v.pause(); ov.remove(); document.body.style.overflow = '';
    const iv = inline?.querySelector('video');
    if (iv && t > 0) { try { iv.currentTime = t; } catch (_) {} }
    setTimeout(arbitrate, 0);
  });
  const close = () => closeLayer(layer);
  ov.querySelector('.fd-viewer-close').addEventListener('click', close);
  const p = v.play(); if (p && p.catch) p.catch(() => {});
  // Свайп униз — закрити (той самий жест, що в перегляді фото). Лише з-поза нижньої
  // смуги керування, щоб перемотування пальцем не закривало ролик.
  let y0 = null, x0 = 0;
  ov.addEventListener('touchstart', e => {
    const t = e.touches[0];
    y0 = (e.touches.length === 1 && t.clientY < window.innerHeight - 90) ? t.clientY : null; x0 = t.clientX;
  }, { passive: true });
  ov.addEventListener('touchmove', e => {
    if (y0 === null) return;
    const t = e.touches[0], dy = t.clientY - y0;
    if (dy > 0 && Math.abs(t.clientX - x0) < dy) { v.style.transform = `translateY(${dy}px)`; ov.style.setProperty('--vv-fade', String(Math.max(0.3, 1 - dy / 400))); }
  }, { passive: true });
  ov.addEventListener('touchend', e => {
    if (y0 === null) return;
    const dy = (e.changedTouches[0]?.clientY || y0) - y0; y0 = null;
    if (dy > 90) { close(); return; }
    v.style.transform = ''; ov.style.removeProperty('--vv-fade');
  });
}
