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

import { escapeHtml, avatarCircle } from './utils.js';
import { cachedAvatar } from './supabase.js';   // Потік 12 Б: чуже фото по uid (кеш)
import { openLayer, closeLayer } from './layers.js';
import { attachKeyboardPad } from './keyboard.js';   // клавіатура: та сама механіка, що в коментарях (09.10)   // екрани ↔ історія браузера (жест «назад»)

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
  // Екран — повноекранний ШАР, підключений до історії браузера (core/layers.js).
  // Жест «назад» обслуговує СИСТЕМА. Власний edge-свайп прибрано
  // 24.07: iOS малює свою анімацію переходу, і наше перетягування накладалось згори.
  api._layer = openLayer(() => closeScreen(api), {
    el: screen,   // 19.08 — свайп назад «звідки завгодно» (див. `core/layers.js`)
    animateOut: () => { screen.classList.remove('visible'); backdrop.classList.remove('visible'); },
  });
  const close = () => closeLayer(api._layer, { animate: 240 });
  backdrop.addEventListener('click', close);
  screen.querySelector('[data-pm-back]')?.addEventListener('click', close);
  api.close = close;
  // setupEdgeBack прибрано 24.07 — див. коментар вище (жест = система).
  _openScreens.push(api);
  return api;
}

// setupEdgeBack (власний свайп від лівого краю) ПРИБРАНО 24.07 — скрін IMG_3559.
// Причина: жест від краю системний, iOS малює власну анімацію переходу, і наше
// перетягування накладалось згори — їхали два екрани. Тепер жест обслуговує система
// через історію браузера (core/layers.js), а ми лише прибираємо екран по popstate.

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

// Аватарка-кружечок: фото профілю (крос-юзер, по uid) або перша літера імені /
// 👤 для аноніма. Потік 12 Б: делегуємо у спільний avatarCircle; uid необовʼязковий
// (без нього — літера, як було). hydrateAvatars підмінить літеру на фото по data-av-uid.
export function avatar(name, uid) {
  return avatarCircle({ name, url: cachedAvatar(uid), uid: uid || '', cls: 'pm-avatar' });
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

// ── Клавіатура iOS: шапка стоїть, піднімається лише поле вводу ─────────────
// 🔴 09.10 — ПЕРЕВЕДЕНО НА ТОЙ САМИЙ МОДУЛЬ, ЩО Й КОМЕНТАРІ (`core/keyboard.js`).
// Скарга Вови зі знімками: тап у «Написати повідомлення» → уся сторінка разом із
// шапкою й ім'ям співрозмовника їде вгору на висоту клавіатури; знизу лишається
// порожній сірий екран, шапки не видно. Хоче як у месенджерах: шапка нерухома,
// стрічка звужується, над клавіатурою піднімається тільки поле вводу.
//
// 🔑 ЧОМУ СТАРИЙ КОД НЕ МІГ ЦЬОГО ЗРОБИТИ. Він рахував клавіатуру однією формулою
// `docH − (vv.offsetTop + vv.height)` — це лише «спосіб А» (Safari стискає видиму
// область). У ВСТАНОВЛЕНОМУ додатку iOS працює «способом Б»: прокручує весь webview
// угору і `vv.height` не міняє. Формула давала 0 → код вважав, що клавіатури нема, і
// не робив нічого, а iOS тим часом сам задирав екран — рівно те, що на знімку.
// Детектор `core/keyboard.js` знає обидва способи (історія — у його шапці) і вже
// перевірений на айфоні Вови на коментарях («ідеально, фіксуємо цей варіант», 26.07).
//
// 📐 Як тут: `attachKeyboardPad` — той самий детектор, але екран НЕ міняє розміру
// (урок 09.08: коротший за вікно чат відкривав Дошку під собою). Видиму смугу
// задають відступи: згори — зсув iOS (шапка на верху видимого), знизу — до
// клавіатури (поле вводу сідає на неї); стрічка — flex:1 — стискається сама.
// 🔎 Діагностика на живому телефоні — та сама: `#kbdebug` в адресі.
export function setupKeyboardResize(screen) {
  const stream = screen.querySelector('.pm-stream');
  const input = screen.querySelector('.pm-input');
  const toBottom = () => requestAnimationFrame(() => { if (stream) stream.scrollTop = stream.scrollHeight; });
  const lift = setupFocusLift(screen, input);   // null — трюк вимкнений або не потрібен
  const stopPad = attachKeyboardPad(screen, {
    input, minHeight: 160, openClass: 'pm-kb-open',
    // Клавіатура щойно відкрилась → поле на своє місце, останні повідомлення над ним.
    onOpen: () => { lift?.drop(true); toBottom(); },
  });
  return () => { lift?.stop(); stopPad(); };
}

// ── ТРЮК «ПОЛЕ НАГОРІ В МИТЬ ФОКУСА» — ЩОБ ШАПКА НЕ СМИКАЛАСЬ (09.10, СПРОБА) ──────
// 🗣️ Вова: «все добре, крім того, що смикається шапка чату, коли вилазить
// клавіатура… хочу максимально наближено до Інстаграму». Відповів чесно: повністю
// це може лише нативний додаток; погодились на одну спробу.
// МЕХАНІКА СМИКАННЯ: поле стоїть унизу, де виїде клавіатура → iOS сам зсуває весь
// webview угору (компонує миттєво), а ми дізнаємось про зсув подією й повертаємо
// шапку на кадр пізніше. Їде — вертається = смикання. Компенсація з JS завжди позаду
// (той самий закон, що в коментарі під `layoutCircles`, feed.js).
// 💡 ТРЮК: у мить фокуса поле стоїть НАГОРІ (під шапкою, невидиме) — iOS бачить, що
// клавіатура його не закриє, і НЕ зсуває сторінку взагалі. Щойно клавіатура
// з'явилась (`attachKeyboardPad` відкрився) — поле повертається на місце, а місце під
// клавіатуру дають відступи. Зсуву нема → компенсувати нічого → смикатись нічому.
// ⚠️ Тап ловимо самі (`touchend` → preventDefault → `focus()`): поле в цю мить не
// під пальцем, і рідний тап iOS промахнувся б. `focus()` у `touchend` — це жест
// людини, тож iOS клавіатуру відкриває.
// 🛑 СТРАХОВКА: якщо за 1.5 с після фокуса клавіатуру не розпізнано, поле
// повертається; ДВІ такі невдачі поспіль — трюк вимикається на пристрої назавжди
// (`cstl-kb-lift-off`), далі чат як до спроби. Вдалий раз скидає лічильник.
// 🔴 09.10 — було 900 мс і одна невдача. Стенд «інші телефони» показав: повільна
// клавіатура (старий телефон, перший запуск — до ~1.2 с) вимикала трюк назавжди
// з першого ж разу. Вимкнути руками: `localStorage['cstl-kb-lift-off']='1'`.
// 🛑 Довге натискання (> 450 мс — людина хоче «Вставити») не чіпаємо: це не тап.
// 🔙 Відкат цілком — прибрати виклик `setupFocusLift` у `setupKeyboardResize`.
const LIFT_OFF_KEY = 'cstl-kb-lift-off';
const LIFT_FAIL_KEY = 'cstl-kb-lift-fail';
const LIFT_SLOP = 10;
const LIFT_LONGPRESS_MS = 450;
const LIFT_GUARD_MS = 1500;
function setupFocusLift(screen, input) {
  if (!input || !window.visualViewport) return null;
  try {
    if (localStorage.getItem(LIFT_OFF_KEY) === '1') return null;
    if (!matchMedia('(hover: none) and (pointer: coarse)').matches) return null;
  } catch (_) { return null; }
  let start = null, lifted = false, guard = 0;
  const drop = (вдалося = false) => {
    clearTimeout(guard); guard = 0;
    if (!lifted) return;
    lifted = false;
    input.style.transform = ''; input.style.opacity = '';
    if (вдалося) { try { localStorage.removeItem(LIFT_FAIL_KEY); } catch (_) {} }
  };
  const lift = () => {
    const head = screen.querySelector('.pm-head');
    const top = (head ? head.getBoundingClientRect().bottom : 0) + 8;
    const dy = Math.round(top - input.getBoundingClientRect().top);
    if (dy >= 0) return false;                       // поле й так нагорі — нічого робити
    input.style.transform = `translateY(${dy}px)`;
    input.style.opacity = '0';                       // людина не бачить стрибка поля
    lifted = true;
    return true;
  };
  const onStart = e => {
    const t = e.changedTouches[0];
    start = (document.activeElement !== input && t && e.touches.length === 1) ? { x: t.clientX, y: t.clientY, t: Date.now() } : null;
  };
  const onEnd = e => {
    const s = start; start = null;
    if (!s || document.activeElement === input) return;
    const t = e.changedTouches[0];
    if (!t || Math.hypot(t.clientX - s.x, t.clientY - s.y) > LIFT_SLOP) return;
    if (Date.now() - s.t > LIFT_LONGPRESS_MS) return;   // довге натискання — рідне меню iOS
    if (!lift()) return;
    e.preventDefault();
    input.focus();
    guard = setTimeout(() => {
      if (!lifted) return;
      // Клавіатуру так і не розпізнано → поле на місце; друга невдача поспіль —
      // трюк на цьому пристрої вимикається.
      drop();
      try {
        const n = (parseInt(localStorage.getItem(LIFT_FAIL_KEY), 10) || 0) + 1;
        localStorage.setItem(LIFT_FAIL_KEY, String(n));
        if (n >= 2) localStorage.setItem(LIFT_OFF_KEY, '1');
      } catch (_) {}
      try { input.scrollIntoView({ block: 'end' }); } catch (_) {}
    }, LIFT_GUARD_MS);
  };
  const onBlur = () => drop();
  input.addEventListener('touchstart', onStart, { passive: true });
  input.addEventListener('touchend', onEnd, { passive: false });
  input.addEventListener('blur', onBlur);
  return {
    drop,
    stop: () => {
      drop();
      input.removeEventListener('touchstart', onStart);
      input.removeEventListener('touchend', onEnd);
      input.removeEventListener('blur', onBlur);
    },
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

// ── ГРУПУВАННЯ РОЗМОВ ─────────────────────────────────────── [GROUP-START]
// 🔴 29.07 — РОЗМОВА = ПАРА ЛЮДЕЙ, а не оголошення.
// Скарга Вови: «якщо автор має два оголошення і той самий покупець написав по обох —
// це два окремих чати, дві переписки». Тобто список засмічувався однією людиною.
//
// 🔑 ЧОМУ БЕЗ НОВОЇ ТАБЛИЦІ. Наш `threads(post_id, author_uid, buyer_uid)` — це вже
// «контекст оголошення всередині розмови», а `messages.thread_id` уже несе і пару
// людей, і оголошення. Бракувало лише поняття «розмова» — і воно ВИВІДНЕ:
// розмова = пара `(author_uid, buyer_uid)`. Окремий `conversation_id` не додав би
// жодного факту, якого немає, зате потягнув би 5 політик RLS, `thread_user_state`,
// два підрахунки непрочитаних, дві realtime-підписки й Edge Function пушів.
// Тому групування живе ТУТ, у клієнті, і схема бази не змінюється взагалі.
//
// ⚠️ Функція НАВМИСНО чиста (без DOM, без `currentUserId()`): `me` приходить
// аргументом, тому її ганяє стенд `tests/chat-grouping.mjs` прямо в node.
// ⚠️ Треди, приховані через `cleared_at`, треба відсіяти ДО виклику — тут про
// стан користувача нічого не відомо і не має бути відомо.
export function groupConversations(threads, me, unread = new Map()) {
  const tsOf = t => (t && t.last_message_at) ? new Date(t.last_message_at).getTime() : 0;
  const byUid = new Map();
  for (const t of (threads || [])) {
    const iAmAuthor = !!me && me === t.author_uid;
    const uid  = (iAmAuthor ? t.buyer_uid  : t.author_uid) || '';
    const name = (iAmAuthor ? t.buyer_name : t.author_name) || (iAmAuthor ? 'Покупець' : 'Продавець');
    // ⚠️ Порожній uid НЕ згортаємо в одну купу: без нього це різні невідомі люди,
    // і зліпити їх разом означало б показати чужі переписки як одну розмову.
    const key = uid || `t:${t.id}`;
    let c = byUid.get(key);
    if (!c) { c = { key, otherUid: uid, otherName: name, threads: [], unread: 0, lastAt: 0, last: null }; byUid.set(key, c); }
    c.threads.push(t);
    c.unread += (unread.get(t.id) || 0);
    // Ім'я і прев'ю беремо з НАЙСВІЖІШОГО треда: імена денормалізовані й могли
    // змінитись, тому старий тред пари може нести застаріле написання.
    if (tsOf(t) >= c.lastAt) { c.lastAt = tsOf(t); c.last = t; c.otherName = name; }
  }
  for (const c of byUid.values()) c.threads.sort((a, b) => tsOf(b) - tsOf(a));
  return [...byUid.values()].sort((a, b) => b.lastAt - a.lastAt);
}
// ─────────────────────────────────────────────────────────────── [GROUP-END]
