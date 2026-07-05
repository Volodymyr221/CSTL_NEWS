// src/core/chat-core.js
// СПІЛЬНА низькорівнева механіка чатів (без бізнес-логіки).
// Використовується ОБОМА типами чатів:
//   • Приватний чат Дошки 1-на-1 (board-chat.js)
//   • Групи + Обговорення (messages-ui.js / майбутні Чати V2)
//
// Тут живуть делікатні iOS-фікси (клавіатура, edge-back, свайп бульбашок) —
// в ОДНОМУ місці, щоб копії чатів не розсинхронізували ці фікси.
//
// Що надаємо:
//   buildScreen(html, class)   — повноекранний sheet (морф знизу) + стек екранів
//   setupKeyboardResize(screen)— підлаштування під клавіатуру iOS (visualViewport)
//   setupBubbleGestures(c, cb) — свайп-відповідь + long-press меню на бульбашках
//   avatar(name)               — кружечок-аватар з літерою
//   clockTime(ts) / dayLabel(ts) / MONTHS_GEN — час/дата у стрічці
//   ACT_ICONS                  — іконки дій над повідомленням

import { escapeHtml } from './utils.js';

// Лінійні іконки для меню дій над повідомленням (монохром, у стилі чату)
export const ACT_ICONS = {
  reply:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
  copy:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  edit:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
};

// ── Спільне: повноекранний sheet + стек екранів ──────────────────────────
let _openScreens = [];   // стек відкритих екранів (для коректного закриття)

export function buildScreen(innerHtml, extraClass = '') {
  const backdrop = document.createElement('div');
  backdrop.className = 'pm-backdrop';
  const screen = document.createElement('div');
  screen.className = 'pm-screen ' + extraClass;
  screen.innerHTML = innerHtml;
  // Сховати екран під цим (інакше при зумі/зміщенні нижній екран визирає згори)
  const prevTop = _openScreens[_openScreens.length - 1];
  if (prevTop) { prevTop.screen.style.display = 'none'; prevTop.backdrop.style.display = 'none'; }
  document.body.appendChild(backdrop);
  document.body.appendChild(screen);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => { backdrop.classList.add('visible'); screen.classList.add('visible'); });
  const api = { screen, backdrop, _cleanup: [] };
  const close = () => closeScreen(api);
  backdrop.addEventListener('click', close);
  screen.querySelector('[data-pm-back]')?.addEventListener('click', close);
  api.close = close;
  setupEdgeBack(api);   // свайп від лівого краю → назад (як на iOS)
  _openScreens.push(api);
  return api;
}

// Свайп від ЛІВОГО краю екрану вправо → закрити (назад). Плавно: під час перетягування
// transition вимкнено (йде за пальцем), на відпусканні — снап/закриття. Під час свайпу
// показуємо екран, що НИЖЧЕ в стеку (інакше за чатом визирає сторінка-вкладка, а не список).
function setupEdgeBack(api) {
  const screen = api.screen;
  let sx = 0, sy = 0, dragging = false, lock = null, below = null;
  const winW = () => window.innerWidth || screen.clientWidth || 360;
  const findBelow = () => { const i = _openScreens.indexOf(api); return i > 0 ? _openScreens[i - 1] : null; };
  const showBelow = () => { if (below) below.screen.style.display = ''; };   // .pm-screen z=2401 > затемнення 2400
  const hideBelow = () => { if (below) below.screen.style.display = 'none'; };
  screen.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    if (t.clientX > 24) { dragging = false; return; }   // лише від самого лівого краю
    sx = t.clientX; sy = t.clientY; dragging = true; lock = null; below = findBelow();
  }, { passive: true });
  screen.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches[0], dx = t.clientX - sx, dy = t.clientY - sy;
    if (!lock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) { lock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v'; if (lock === 'h') showBelow(); }
    if (lock === 'v') { dragging = false; screen.style.transition = ''; screen.style.transform = ''; hideBelow(); return; }
    if (lock === 'h' && dx > 0) {
      e.preventDefault();
      screen.style.transition = 'none';
      screen.style.transform = `translateX(-50%) translateX(${dx}px)`;   // зберігаємо центрування -50%
    }
  }, { passive: false });
  screen.addEventListener('touchend', (e) => {
    if (!dragging) return;
    dragging = false;
    const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : sx) - sx;
    screen.style.transition = '';   // повертаємо CSS-плавність (0.28s)
    if (lock === 'h' && dx > winW() * 0.33) {
      screen.style.transform = `translateX(-50%) translateX(${winW()}px)`;   // доїхати вправо
      setTimeout(() => api.close(), 180);   // closeScreen сам відновить нижній екран
    } else {
      screen.style.transform = '';   // снап назад
      hideBelow();                    // знову ховаємо нижній (оптимізація як було)
    }
  }, { passive: false });
}

function closeScreen(api) {
  if (!api || api._closed) return;
  api._closed = true;
  api._cleanup.forEach(fn => { try { fn(); } catch (_) {} });
  api.screen.classList.remove('visible');
  api.backdrop.classList.remove('visible');
  _openScreens = _openScreens.filter(s => s !== api);
  // Повернути видимість екрану під цим (список «Повідомлення»)
  const newTop = _openScreens[_openScreens.length - 1];
  if (newTop) { newTop.screen.style.display = ''; newTop.backdrop.style.display = ''; }
  if (!_openScreens.length) document.body.classList.remove('modal-open');
  setTimeout(() => { api.screen.remove(); api.backdrop.remove(); }, 240);
}

// Аватарка-кружечок з першою літерою імені
export function avatar(name) {
  const a = String(name || '').trim();
  if (!a) return '<span class="pm-avatar pm-avatar--anon">👤</span>';
  const letter = a.charAt(0).toUpperCase();
  const hue = (a.charCodeAt(0) * 47) % 360;
  return `<span class="pm-avatar" style="background:hsl(${hue}deg 60% 72%)">${escapeHtml(letter)}</span>`;
}

// Час повідомлення для бульбашки: год:хв (напр. 14:30)
export function clockTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];

// Підпис роздільника дати у стрічці: Сьогодні / Вчора / D місяця / D місяця РРРР
export function dayLabel(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86400000;
  if (d.getTime() >= startOfToday) return 'Сьогодні';
  if (d.getTime() >= startOfToday - dayMs) return 'Вчора';
  const base = `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return d.getFullYear() === now.getFullYear() ? base : `${base} ${d.getFullYear()}`;
}

// Розумний час для списку розмов/груп: сьогодні → HH:MM, вчора → «Вчора»,
// цей рік → «D місяця», інакше → DD.MM.YY.
export function threadListTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const dayMs = 86400000;
  if (d.getTime() >= startOfToday) {
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }
  if (d.getTime() >= startOfToday - dayMs) return 'Вчора';
  if (d.getFullYear() === now.getFullYear()) return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getFullYear()).slice(-2)}`;
}

// ── Клавіатура iOS: підлаштування висоти екрану під visualViewport ────────
export function setupKeyboardResize(screen) {
  const vv = window.visualViewport;
  const stream = screen.querySelector('#pm-stream');

  // Замок сторінки: фіксуємо body, щоб iOS не зсував/скролив документ під клавіатуру.
  const scrollY  = window.scrollY || 0;
  const prevBody = {
    position: document.body.style.position,
    top:      document.body.style.top,
    left:     document.body.style.left,
    right:    document.body.style.right,
    width:    document.body.style.width,
    overflow: document.body.style.overflow,
  };
  document.body.style.position = 'fixed';
  document.body.style.top      = `-${scrollY}px`;
  document.body.style.left     = '0';
  document.body.style.right    = '0';
  document.body.style.width    = '100%';
  document.body.style.overflow = 'hidden';
  const unlock = () => {
    document.body.style.position = prevBody.position;
    document.body.style.top      = prevBody.top;
    document.body.style.left     = prevBody.left;
    document.body.style.right    = prevBody.right;
    document.body.style.width    = prevBody.width;
    document.body.style.overflow = prevBody.overflow;
    window.scrollTo(0, scrollY);
  };

  if (!vv) return unlock;

  const input = screen.querySelector('.pm-input');
  let wasOpen = false, focused = false;
  const apply = () => {
    // Чи був користувач унизу стрічки ДО зміни висоти (щоб не збивати читання історії).
    const atBottom = stream
      ? (stream.scrollHeight - stream.scrollTop - stream.clientHeight < 60)
      : false;
    // Клавіатура «відкрита» лише коли поле У ФОКУСІ і видима область помітно менша.
    // БЕЗ фокусу не покладаємось на vv.height (під body-lock він буває «застряглий»
    // на значенні з відкритою клавіатурою → екран лишався коротким, знизу визирала Дошка).
    const open = focused && (document.documentElement.clientHeight - vv.height) > 80;
    if (open) {
      screen.style.height = vv.height + 'px';
      screen.style.top = vv.offsetTop + 'px';
    } else {
      screen.style.height = ''; screen.style.top = '';   // повна висота з CSS (top:0; bottom:0)
    }
    screen.classList.toggle('pm-kb-open', open);
    if (open && stream && (!wasOpen || atBottom)) {
      requestAnimationFrame(() => { stream.scrollTop = stream.scrollHeight; });
    }
    wasOpen = open;
  };
  const onFocus = () => { focused = true; requestAnimationFrame(apply); };
  const onBlur  = () => { focused = false; requestAnimationFrame(apply); };
  input?.addEventListener('focus', onFocus);
  input?.addEventListener('blur', onBlur);
  apply();
  vv.addEventListener('resize', apply);   // без затримки → плавне відстеження
  vv.addEventListener('scroll', apply);
  return () => {
    vv.removeEventListener('resize', apply);
    vv.removeEventListener('scroll', apply);
    input?.removeEventListener('focus', onFocus);
    input?.removeEventListener('blur', onBlur);
    screen.style.height = ''; screen.style.top = '';
    screen.classList.remove('pm-kb-open');
    unlock();
  };
}

// ── Жести над бульбашкою ──────────────────────────────────────────────────
// Свайп ВЛІВО → 'reply' (Telegram-стиль, іконка виїжджає з-за правого краю разом
// з бульбашкою), довге натискання → 'menu'. onAction(messageId, kind).
// Скрол вертикально / горизонтальний рух скасовують long-press.
const SWIPE_TRIGGER = 45;   // px вліво для спрацювання відповіді
export function setupBubbleGestures(container, onAction) {
  let startX = 0, startY = 0, target = null, lpTimer = null, longFired = false, lockDir = null;
  const clearLP = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
  const resetTransform = (b) => {
    b.style.transition = 'transform 0.18s ease';
    b.style.transform = '';
    setTimeout(() => { b.style.transition = ''; }, 200);
  };
  // Кругла іконка «відповісти» що проявляється з правого краю при свайпі вліво.
  const host = container.parentElement || container;
  const reveal = document.createElement('div');
  reveal.className = 'pm-reply-reveal';
  reveal.innerHTML = ACT_ICONS.reply;
  host.appendChild(reveal);
  const placeReveal = (b) => {
    const hr = host.getBoundingClientRect();
    const br = b.getBoundingClientRect();
    reveal.style.top = (br.top - hr.top + br.height / 2) + 'px';
  };
  const setReveal = (prog) => {
    reveal.style.opacity = String(prog);
    // translateX від +22px (з-за краю) до 0 → іконка плавно виїжджає справа
    reveal.style.transform = `translateY(-50%) translateX(${(1 - prog) * 22}px) scale(${0.55 + 0.45 * prog})`;
  };
  const hideReveal = () => { reveal.style.opacity = '0'; };
  container.addEventListener('touchstart', (e) => {
    const b = e.target.closest('.pm-bubble');
    if (!b || b.classList.contains('pm-bubble--deleted')) { target = null; return; }
    target = b; longFired = false; lockDir = null;
    const t = e.touches[0]; startX = t.clientX; startY = t.clientY;
    placeReveal(b); setReveal(0);
    clearLP();
    lpTimer = setTimeout(() => {
      longFired = true;
      if (navigator.vibrate) { try { navigator.vibrate(10); } catch (_) {} }
      onAction(target.dataset.msg, 'menu');
    }, 500);
  }, { passive: true });
  container.addEventListener('touchmove', (e) => {
    if (!target) return;
    const t = e.touches[0];
    const dx = t.clientX - startX, dy = t.clientY - startY;
    // Визначаємо напрям один раз: горизонталь = свайп, вертикаль = скрол
    if (!lockDir && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) {
      lockDir = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      clearLP();
    }
    if (lockDir === 'h') {
      e.preventDefault();   // блокуємо рідний горизонтальний скрол → їде лише ця бульбашка
      const d = Math.max(Math.min(dx, 0), -64);   // лише вліво, до 64px
      target.style.transform = `translateX(${d}px)`;
      setReveal(Math.min(1, Math.abs(d) / SWIPE_TRIGGER));
    }
  }, { passive: false });
  container.addEventListener('touchend', (e) => {
    clearLP();
    if (!target) return;
    const b = target; target = null;
    const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : startX) - startX;
    resetTransform(b); hideReveal();
    if (!longFired && lockDir === 'h' && dx < -SWIPE_TRIGGER) onAction(b.dataset.msg, 'reply');
  }, { passive: false });
  container.addEventListener('contextmenu', (e) => {
    const b = e.target.closest('.pm-bubble');
    if (b && !b.classList.contains('pm-bubble--deleted')) { e.preventDefault(); onAction(b.dataset.msg, 'menu'); }
  });
}
