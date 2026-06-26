// src/core/messages-ui.js
// Приватний чат покупець↔продавець (Фаза Б, Етапи 4–5).
//
// Три екрани (повноекранні sheets, морф знизу):
//   1. openChat(thread, post)  — розмова 1-на-1 (бульбашки + поле + realtime)
//   2. openThreadsList()       — «Повідомлення»: усі мої розмови
//   3. openMyAds()             — «Мої оголошення»: мої пости + вхідні розмови
//
// Вхідні точки:
//   startChatFromPost(post) — кнопка «Повідомлення» 💬 на оголошенні
//   openThreadsList()       — FAB «Повідомлення» / рядок Кабінету
//   openMyAds()             — FAB «Мої оголошення» / рядок Кабінету
//
// Імена співрозмовників беремо з треда (author_name/buyer_name) — БД profiles
// приватна (RLS «лише свій профіль»), тож імена денормалізовані при створенні.

import {
  currentUserId, isLoggedIn, requireAuth, getProfile, onAuthChange,
} from './auth.js';
import {
  getOrCreateThread, fetchMessages, sendMessage, markThreadRead,
  fetchMyThreads, fetchMyPosts, fetchUnreadByThread,
  fetchThreadStates, setThreadState, fetchThreadClearedAt,
  subscribeThreadMessages, subscribeMyThreads, saveUserPushDevice,
  editMessage, deleteMessage, uploadPhotoToStorage,
  bumpPost, closePost, deleteMyPost, restorePost,
  fetchMyGroups, createGroup, createGroupInvite, getGroupByInvite, joinGroupByToken,
  leaveGroup, fetchGroupMembers, fetchProfileNames, fetchGroupMessages, sendGroupMessage,
  subscribeGroupMessages, approveMember, rejectMember,
} from './supabase.js';
import { openBoardModal } from '../tabs/community-modal.js';
import { escapeHtml, showToast, postTime, containsProfanity } from './utils.js';

const BUMP_COOLDOWN_MS = 3 * 60 * 60 * 1000;   // кулдаун підняття: 3 год

// VAPID public key — той самий що для автобусних push (див. buses.js / Edge Function)
const VAPID_PUBLIC_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';

// Лінійні іконки для меню дій над повідомленням (монохром, у стилі чату)
export const ACT_ICONS = {
  reply:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 17 4 12 9 7"/><path d="M20 18v-2a4 4 0 0 0-4-4H4"/></svg>',
  copy:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="11" height="11" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>',
  edit:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>',
  delete: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/><path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/></svg>',
};

// ── Спільне: повноекранний sheet ─────────────────────────────────────────
let _openScreens = [];   // стек відкритих екранів (для коректного закриття)

function buildScreen(innerHtml, extraClass = '') {
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
function avatar(name) {
  const a = String(name || '').trim();
  if (!a) return '<span class="pm-avatar pm-avatar--anon">👤</span>';
  const letter = a.charAt(0).toUpperCase();
  const hue = (a.charCodeAt(0) * 47) % 360;
  return `<span class="pm-avatar" style="background:hsl(${hue}deg 60% 72%)">${escapeHtml(letter)}</span>`;
}

// Ім'я співрозмовника у треді (з точки зору поточного користувача)
function otherName(thread) {
  const me = currentUserId();
  if (me && me === thread.author_uid) return thread.buyer_name || 'Покупець';
  return thread.author_name || 'Продавець';
}

// Короткий заголовок оголошення треда
function threadPostTitle(thread) {
  const p = thread.post || {};
  return p.title || (p.text ? p.text.slice(0, 60) : 'Оголошення');
}

// ── 1. Екран розмови 1-на-1 ──────────────────────────────────────────────
let _chatUnsub = null;

// Час повідомлення для бульбашки: год:хв (напр. 14:30)
function clockTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// Підпис роздільника дати у стрічці: Сьогодні / Вчора / D місяця / D місяця РРРР
function dayLabel(ts) {
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

export async function openChat(thread, post) {
  if (!isLoggedIn()) { requireAuth('відкрити чат', () => {}); return; }
  const me = currentUserId();
  const p = post || thread.post || {};
  const title = p.title || (p.text ? p.text.slice(0, 60) : 'Оголошення');
  const partner = otherName(thread);
  const thumb = (p.photos && p.photos[0]) || '';
  const adAuthor = p.author ? String(p.author).trim() : '';
  const adContact = p.contact ? String(p.contact).trim() : '';
  const adIsPhone = adContact && /^[\+\d][\d\s\-()]{5,}$/.test(adContact);
  const adTel = adIsPhone ? adContact.replace(/[^\d+]/g, '') : '';

  const api = buildScreen(`
    <header class="pm-head pm-head--chat">
      <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
      ${avatar(partner)}
      <div class="pm-head-titles">
        <div class="pm-head-name">${escapeHtml(partner)}</div>
      </div>
    </header>
    <div class="pm-ctx" data-pm-ctx role="button" aria-label="Переглянути оголошення">
      ${thumb
        ? `<span class="pm-ctx-thumb" style="background-image:url('${escapeHtml(thumb)}')"></span>`
        : `<span class="pm-ctx-thumb pm-ctx-thumb--none">🏷️</span>`}
      <span class="pm-ctx-body">
        <span class="pm-ctx-title">${escapeHtml(title)}</span>
        ${(adAuthor || adContact) ? `<span class="pm-ctx-contact">${adContact ? `<span class="pm-ctx-phone">${escapeHtml(adContact)}</span>` : ''}${adAuthor ? `${adContact ? ' — ' : ''}${escapeHtml(adAuthor)}` : ''}</span>` : ''}
        <span class="pm-ctx-link">Переглянути оголошення →</span>
      </span>
      ${adTel ? `<a class="pm-ctx-call" href="tel:${escapeHtml(adTel)}" aria-label="Подзвонити"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.8 19.8 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.8 19.8 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.13.96.36 1.9.69 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.91.33 1.85.56 2.81.69A2 2 0 0 1 22 16.92z"/></svg></a>` : ''}
    </div>
    <div class="pm-stream" id="pm-stream">
      <div class="pm-loading">Завантаження…</div>
    </div>
    <button class="pm-scrolldown" id="pm-scrolldown" type="button" aria-label="До останнього повідомлення">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="pm-composebar" id="pm-composebar" hidden>
      <span class="pm-composebar-ic" id="pm-composebar-ic">${ACT_ICONS.reply}</span>
      <div class="pm-composebar-body">
        <span class="pm-composebar-title" id="pm-composebar-title"></span>
        <span class="pm-composebar-text" id="pm-composebar-text"></span>
      </div>
      <button class="pm-composebar-x" type="button" id="pm-composebar-x" aria-label="Скасувати">✕</button>
    </div>
    <form class="pm-form" id="pm-form">
      <button class="pm-attach" type="button" id="pm-attach" aria-label="Додати фото"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="3"/><circle cx="8.5" cy="8.5" r="1.6"/><path d="M21 15l-5-5L5 21"/></svg></button>
      <input class="pm-file" id="pm-file" type="file" accept="image/*" hidden>
      <input class="pm-input" id="pm-input" type="text" placeholder="Написати повідомлення…"
             aria-label="Повідомлення" autocomplete="off">
      <button class="pm-send" type="submit" aria-label="Надіслати">↑</button>
    </form>
  `, 'pm-screen--chat');

  const streamEl = api.screen.querySelector('#pm-stream');
  const form     = api.screen.querySelector('#pm-form');
  const input    = api.screen.querySelector('#pm-input');
  const fileEl   = api.screen.querySelector('#pm-file');
  const barEl    = api.screen.querySelector('#pm-composebar');

  let messages = [];
  let msgById  = new Map();
  let replyTo  = null;   // повідомлення на яке відповідаємо
  let editing  = null;   // повідомлення яке редагуємо

  // Бар «Відповідь / Редагування» над полем вводу
  const clearCompose = () => {
    replyTo = null; editing = null;
    barEl.hidden = true;
    input.placeholder = 'Написати повідомлення…';
  };
  const showCompose = (mode, m) => {
    const snippet = (m.deleted_at ? 'Видалене' : (m.text || '📷 Фото')).slice(0, 90);
    api.screen.querySelector('#pm-composebar-ic').innerHTML = mode === 'edit' ? ACT_ICONS.edit : ACT_ICONS.reply;
    api.screen.querySelector('#pm-composebar-title').textContent = mode === 'edit' ? 'РЕДАГУВАННЯ:' : 'ВІДПОВІДЬ:';
    api.screen.querySelector('#pm-composebar-text').textContent = snippet;
    barEl.hidden = false;
  };
  const startReply = (m) => { editing = null; replyTo = m; showCompose('reply', m); input.focus(); };
  const startEdit  = (m) => { replyTo = null; editing = m; showCompose('edit', m); input.value = m.text || ''; input.focus(); };

  // Перегляд фото на повний екран (локальний лайтбокс — поверх чату)
  const openPhoto = (url) => {
    const ov = document.createElement('div');
    ov.className = 'pm-lightbox';
    ov.innerHTML = `<img src="${escapeHtml(url)}" alt="фото">`;
    ov.addEventListener('click', () => ov.remove());
    document.body.appendChild(ov);
  };

  // Рендер однієї бульбашки (цитата відповіді + фото + текст + час; видалене/редаговане)
  const renderBubble = (m) => {
    const enter = seen.has(msgKey(m)) ? '' : ' pm-bubble--enter';
    const tagAttr = ` data-tag="${m.client_tag || ''}"`;   // для пошуку optimistic-бульбашки
    if (m.deleted_at) {
      return `<div class="pm-bubble pm-bubble--deleted${enter}" data-msg="${m.id}"${tagAttr}><span class="pm-bubble-text">🗑 Повідомлення видалено</span></div>`;
    }
    const reply = m.reply_to_id ? msgById.get(m.reply_to_id) : null;
    const replyHtml = reply
      ? `<span class="pm-quote" data-jump="${reply.id}">${escapeHtml((reply.deleted_at ? 'Видалене повідомлення' : (reply.text || '📷 Фото')).slice(0, 90))}</span>`
      : '';
    const photoHtml = m.photo_url
      ? `<img class="pm-bubble-photo" src="${escapeHtml(m.photo_url)}" alt="фото" data-photo="${escapeHtml(m.photo_url)}">`
      : '';
    const textHtml = m.text ? `<span class="pm-bubble-text">${escapeHtml(m.text)}</span>` : '';
    const edited = m.edited_at ? '<span class="pm-bubble-edited">змінено</span> ' : '';
    const photoCls = m.photo_url ? ' pm-bubble--photo' : '';   // тонкий ободок навколо фото
    return `<div class="pm-bubble${photoCls}${enter}" data-msg="${m.id}"${tagAttr}>${replyHtml}${photoHtml}${textHtml}<span class="pm-bubble-time">${edited}${clockTime(postTime(m))}</span></div>`;
  };
  const renderGroup = (g) =>
    `<div class="pm-group ${g.mine ? 'pm-group--mine' : 'pm-group--other'}">${g.msgs.map(renderBubble).join('')}</div>`;

  let streamLastDay = null;   // день останньої відмальованої бульбашки (для appendOne)

  const renderStream = () => {
    const stick = atBottom();          // чи були ми внизу ДО перемальовування
    const prevH = streamEl.scrollHeight;   // висота стрічки ДО перемальовування
    if (!messages.length) {
      streamEl.innerHTML = `
        <div class="pm-empty pm-empty--chat">
          <span class="pm-empty-ic">💬</span>
          <div class="pm-empty-sub">Поставте питання продавцю або уточніть деталі оголошення.</div>
          <div class="pm-quick">
            <button class="pm-quick-chip" type="button" data-quick="Яка ціна?">Яка ціна?</button>
            <button class="pm-quick-chip" type="button" data-quick="Чи актуально?">Чи актуально?</button>
            <button class="pm-quick-chip" type="button" data-quick="Де знаходиться?">Де знаходиться?</button>
            <button class="pm-quick-chip" type="button" data-quick="Можна фото?">Можна фото?</button>
          </div>
        </div>`;
      return;
    }
    msgById = new Map(messages.map(m => [m.id, m]));
    let html = '';
    let lastDay = null;
    let curGroup = null;
    const flush = () => { if (curGroup) { html += renderGroup(curGroup); curGroup = null; } };
    messages.forEach(m => {
      const ts = postTime(m);
      const day = new Date(ts).toDateString();
      if (day !== lastDay) { flush(); html += `<div class="pm-daysep"><span>${dayLabel(ts)}</span></div>`; lastDay = day; }
      const mine = m.sender_uid === me;
      if (curGroup && curGroup.mine === mine) curGroup.msgs.push(m);
      else { flush(); curGroup = { mine, msgs: [m] }; }
    });
    flush();
    streamLastDay = new Date(postTime(messages[messages.length - 1])).toDateString();
    // Read receipt під останнім МОЇМ повідомленням
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.sender_uid === me && !lastMsg.deleted_at) {
      html += `<div class="pm-receipt">${lastMsg.read_at ? 'Прочитано' : 'Надіслано'}</div>`;
    }
    streamEl.innerHTML = html;
    // Плавна поява без стрибка: бо innerHTML скидає scrollTop у 0, спершу
    // ВІДНОВЛЮЄМО попередній кадр (старий низ) БЕЗ анімації — щоб не «пролетіти»
    // крізь усю історію — і ТОДІ плавно докручуємо рівно на висоту нового
    // повідомлення (старе плавно вгору, нове рівномірно знизу).
    if (stick) {
      if (firstRender) {
        streamEl.scrollTop = streamEl.scrollHeight;            // перше відкриття — одразу внизу
      } else {
        streamEl.scrollTop = Math.max(0, prevH - streamEl.clientHeight);   // попередній кадр (без стрибка)
        requestAnimationFrame(() => scrollBottom(true));      // плавно лише дельта
      }
      streamEl.querySelectorAll('.pm-bubble-photo').forEach(img => {
        if (!img.complete) img.addEventListener('load', () => scrollBottom(!firstRender), { once: true });
      });
    }
    messages.forEach(m => seen.add(msgKey(m)));   // показані → анімація появи раз
    firstRender = false;
  };
  const scrollBottom = (smooth) => streamEl.scrollTo({ top: streamEl.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
  // Чи стрічка прокручена до низу (з допуском) — щоб не «смикати» коли читаєш історію.
  const atBottom = () => (streamEl.scrollHeight - streamEl.scrollTop - streamEl.clientHeight) < 120;

  // Кнопка «вниз» (як у Telegram): зʼявляється коли прокрутив угору, тап → у кінець.
  const scrollDownBtn = api.screen.querySelector('#pm-scrolldown');
  const updateScrollBtn = () => scrollDownBtn?.classList.toggle('visible', !atBottom());
  streamEl.addEventListener('scroll', updateScrollBtn, { passive: true });
  scrollDownBtn?.addEventListener('click', () => scrollBottom(true));

  // Read receipt («Прочитано/Надіслано») під останнім МОЇМ повідомленням.
  const addReceiptIfNeeded = () => {
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.sender_uid === me && !lastMsg.deleted_at) {
      streamEl.insertAdjacentHTML('beforeend',
        `<div class="pm-receipt">${lastMsg.read_at ? 'Прочитано' : 'Надіслано'}</div>`);
    }
  };

  // Інкрементальна ВСТАВКА однієї нової бульбашки (без перебудови всієї стрічки →
  // решта DOM і фото не перемальовуються, тож НЕ блимає). Решта повідомлень на місці.
  const appendOne = (m) => {
    if (streamEl.querySelector('.pm-empty')) { renderStream(); return; }  // був empty-state
    const stick = atBottom();
    msgById.set(m.id, m);
    streamEl.querySelector('.pm-receipt')?.remove();
    const day = new Date(postTime(m)).toDateString();
    const newDay = day !== streamLastDay;
    if (newDay) {
      streamEl.insertAdjacentHTML('beforeend', `<div class="pm-daysep"><span>${dayLabel(postTime(m))}</span></div>`);
      streamLastDay = day;
    }
    const mine = m.sender_uid === me;
    const lastEl = streamEl.lastElementChild;   // після прибрання receipt останній — група
    const lastGroup = (!newDay && lastEl && lastEl.classList.contains('pm-group')) ? lastEl : null;
    if (lastGroup && lastGroup.classList.contains(mine ? 'pm-group--mine' : 'pm-group--other')) {
      lastGroup.insertAdjacentHTML('beforeend', renderBubble(m));
    } else {
      streamEl.insertAdjacentHTML('beforeend', renderGroup({ mine, msgs: [m] }));
    }
    seen.add(msgKey(m));
    addReceiptIfNeeded();
    if (stick) {
      scrollBottom(true);                       // DOM не скидався → плавно лише дельта
      const imgs = streamEl.querySelectorAll('.pm-bubble-photo');
      const last = imgs[imgs.length - 1];
      if (last && !last.complete) last.addEventListener('load', () => scrollBottom(true), { once: true });
    }
  };

  // Інкрементальна ЗАМІНА однієї бульбашки на місці (optimistic→real, edit, delete).
  // Знаходимо за реальним id або за data-tag (client_tag). Без чіпання решти стрічки.
  const replaceOne = (m) => {
    msgById.set(m.id, m);
    let el = streamEl.querySelector(`.pm-bubble[data-msg="${CSS.escape(String(m.id))}"]`);
    if (!el && m.client_tag) el = streamEl.querySelector(`.pm-bubble[data-tag="${CSS.escape(String(m.client_tag))}"]`);
    if (!el) { renderStream(); return; }        // не знайшли → запасний повний рендер
    el.outerHTML = renderBubble(m);
    streamEl.querySelector('.pm-receipt')?.remove();
    addReceiptIfNeeded();
  };

  // Тап по цитаті у відповіді → плавно прокрутити до оригіналу + одне «блимання».
  const jumpToMessage = (id) => {
    const el = streamEl.querySelector(`.pm-bubble[data-msg="${CSS.escape(String(id))}"]`);
    if (!el) return;
    el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.classList.remove('pm-bubble--flash');
    void el.offsetWidth;                 // reflow → анімація перезапускається щоразу
    el.classList.add('pm-bubble--flash');
    setTimeout(() => el.classList.remove('pm-bubble--flash'), 1100);
  };

  // Множина вже показаних повідомлень (за стабільним ключем) — щоб анімація появи
  // програвалась РІВНО раз на повідомлення, а не на кожне перемальовування.
  const seen = new Set();
  const msgKey = (m) => m.client_tag || m.id;
  let firstRender = true;

  // Єдина точка вставки/заміни повідомлення. Повертає 'add' | 'update' | 'same'
  // ('same' = нічого візуально не змінилось → не перемальовуємо, без мікро-ривків).
  // Дедуплікація за реальним id, а для своїх optimistic — за client_tag.
  const upsertMessage = (row) => {
    if (!row) return 'none';
    let idx = messages.findIndex(m => m.id === row.id);
    if (idx < 0 && row.client_tag) idx = messages.findIndex(m => m.client_tag && m.client_tag === row.client_tag);
    if (idx >= 0) {
      const o = messages[idx];
      const same = o.id === row.id && o.text === row.text && o.photo_url === row.photo_url
        && o.deleted_at === row.deleted_at && o.edited_at === row.edited_at && o.read_at === row.read_at;
      messages[idx] = row;
      return same ? 'same' : 'update';
    }
    messages.push(row);
    return 'add';
  };
  const newTag = () => (typeof crypto !== 'undefined' && crypto.randomUUID)
    ? crypto.randomUUID() : ('t-' + Date.now() + '-' + Math.random().toString(16).slice(2));

  // Кнопка ↑ / Enter: редагування (якщо активне) або нове повідомлення
  const submitText = async () => {
    const text = input.value.trim();
    if (editing) {
      if (!text) return;
      if (containsProfanity(text)) { showToast('🚫 Повідомлення містить заборонені слова', 3500, 'error'); return; }
      const target = editing;
      input.value = ''; clearCompose();
      const idx = messages.findIndex(m => m.id === target.id);
      const prevMsg = idx >= 0 ? messages[idx] : null;   // знімок для відкату при провалі
      if (idx >= 0) { messages[idx] = { ...messages[idx], text, edited_at: new Date().toISOString() }; replaceOne(messages[idx]); }
      const res = await editMessage(target.id, text);
      if (!res.ok) {
        // Відкат: повертаємо оригінал на місце (БД не змінилась)
        const i = messages.findIndex(m => m.id === target.id);
        if (i >= 0 && prevMsg) { messages[i] = prevMsg; replaceOne(prevMsg); }
        showToast('❌ Не вдалося змінити: ' + (res.error || ''), 4000, 'error');
        return;
      }
      if (idx >= 0 && res.message) { messages[idx] = res.message; replaceOne(res.message); }
      return;
    }
    sendText(text);
  };

  // Надсилання тексту (з поля або з кнопки-питання)
  const sendText = async (raw) => {
    const text = (raw || '').trim();
    if (!text) return;
    if (containsProfanity(text)) { showToast('🚫 Повідомлення містить заборонені слова', 3500, 'error'); return; }
    const replyId = replyTo ? replyTo.id : null;
    input.value = ''; clearCompose();
    const tag = newTag();
    const temp = { id: 'tmp-' + Date.now(), client_tag: tag, thread_id: thread.id, sender_uid: me, text, reply_to_id: replyId, created_at: new Date().toISOString() };
    messages.push(temp);
    appendOne(temp);
    const res = await sendMessage({ threadId: thread.id, senderUid: me, text, replyToId: replyId, clientTag: tag });
    if (!res.ok) {
      messages = messages.filter(m => m.client_tag !== tag);
      renderStream();
      showToast('❌ Не вдалося надіслати: ' + (res.error || ''), 4000, 'error');
      input.value = text;
      return;
    }
    // Реконсиляція: realtime INSERT міг уже замінити tmp — upsert за id/client_tag
    // гарантує рівно одне повідомлення незалежно від порядку подій.
    upsertMessage(res.message);
    replaceOne(res.message);
  };

  // Надсилання фото (оптимістичний прев'ю → upload у Storage → insert)
  const sendPhoto = async (file) => {
    if (!file) return;
    const replyId = replyTo ? replyTo.id : null;
    clearCompose();
    const localUrl = URL.createObjectURL(file);
    const tag = newTag();
    const temp = { id: 'tmp-' + Date.now(), client_tag: tag, thread_id: thread.id, sender_uid: me, text: null, photo_url: localUrl, reply_to_id: replyId, created_at: new Date().toISOString() };
    messages.push(temp);
    appendOne(temp);
    const up = await uploadPhotoToStorage(file);
    if (!up.url) {
      messages = messages.filter(m => m.client_tag !== tag);
      renderStream();
      showToast('❌ Не вдалося завантажити фото: ' + (up.error || ''), 4000, 'error');
      return;
    }
    const res = await sendMessage({ threadId: thread.id, senderUid: me, photoUrl: up.url, replyToId: replyId, clientTag: tag });
    if (!res.ok) {
      URL.revokeObjectURL(localUrl);
      messages = messages.filter(m => m.client_tag !== tag);
      renderStream();
      showToast('❌ Не вдалося надіслати фото: ' + (res.error || ''), 4000, 'error');
      return;
    }
    // Передзавантажуємо фото зі Storage ПЕРЕД заміною — щоб локальне прев'ю не
    // зникало в порожнечу поки картинка вантажиться (інакше фото «пропадає»).
    await new Promise((resolve) => { const pre = new Image(); pre.onload = pre.onerror = resolve; pre.src = up.url; });
    if (api._closed) return;
    // Реконсиляція за id/client_tag — прибирає дубль «одне фото = два повідомлення».
    upsertMessage(res.message);
    replaceOne(res.message);
    URL.revokeObjectURL(localUrl);   // прев'ю вже не потрібне — Storage-фото на місці
  };

  // Меню дій над повідомленням (довге натискання / правий клік)
  const openMsgActions = (m) => {
    if (m.deleted_at) return;
    const mine = m.sender_uid === me;
    const sheet = document.createElement('div');
    sheet.className = 'pm-actions-back';
    sheet.innerHTML = `
      <div class="pm-actions">
        <button type="button" data-act="reply"><span class="pm-act-ic">${ACT_ICONS.reply}</span>Відповісти</button>
        ${m.text ? `<button type="button" data-act="copy"><span class="pm-act-ic">${ACT_ICONS.copy}</span>Копіювати</button>` : ''}
        ${mine && m.text ? `<button type="button" data-act="edit"><span class="pm-act-ic">${ACT_ICONS.edit}</span>Редагувати</button>` : ''}
        ${mine ? `<button type="button" data-act="delete" class="pm-actions-danger"><span class="pm-act-ic">${ACT_ICONS.delete}</span>Видалити</button>` : ''}
        <button type="button" data-act="cancel" class="pm-actions-cancel">Скасувати</button>
      </div>`;
    const close = () => sheet.remove();
    sheet.addEventListener('click', async (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) { if (e.target === sheet) close(); return; }
      close();
      const act = b.dataset.act;
      if (act === 'reply') startReply(m);
      else if (act === 'copy') { try { await navigator.clipboard.writeText(m.text || ''); showToast('Скопійовано'); } catch (_) {} }
      else if (act === 'edit') startEdit(m);
      else if (act === 'delete') {
        const idx = messages.findIndex(x => x.id === m.id);
        const prevMsg = idx >= 0 ? messages[idx] : null;   // знімок для відкату при провалі
        if (idx >= 0) { messages[idx] = { ...messages[idx], deleted_at: new Date().toISOString(), text: null, photo_url: null }; replaceOne(messages[idx]); }
        const res = await deleteMessage(m.id);
        if (!res.ok) {
          // Відкат: повертаємо повідомлення (у БД не видалилось)
          const i = messages.findIndex(x => x.id === m.id);
          if (i >= 0 && prevMsg) { messages[i] = prevMsg; replaceOne(prevMsg); }
          showToast('❌ Не вдалося видалити: ' + (res.error || ''), 4000, 'error');
        }
      }
    });
    api.screen.appendChild(sheet);
  };

  // Початкове завантаження. Якщо чат раніше «видаляли» (cleared_at) — показуємо
  // ЛИШЕ повідомлення після того моменту (чистий старт після повторного контакту).
  const clearedAt = await fetchThreadClearedAt(me, thread.id);
  if (api._closed) return api;
  messages = await fetchMessages(thread.id, clearedAt);
  if (api._closed) return api;
  messages.forEach(m => seen.add(msgKey(m)));   // історія НЕ анімується при відкритті
  renderStream();
  setTimeout(() => scrollBottom(false), 50);
  // Позначити вхідні прочитаними + оновити бейдж. _readThreads = оптимістично
  // (бейдж прибираємо одразу, не чекаючи БД — надійно навіть при затримці/збої).
  _readThreads.add(thread.id);
  markThreadRead(thread.id, me).finally(refreshUnreadBadge);

  // Realtime — нові / редаговані / видалені / прочитані повідомлення треда
  if (_chatUnsub) { try { _chatUnsub(); } catch (_) {} }
  const chatUnsub = subscribeThreadMessages(thread.id, ({ type, row }) => {
    if (!row) return;
    if (type === 'INSERT') {
      const st = upsertMessage(row);      // дедуплікація за id/client_tag (моє optimistic)
      if (st === 'add') appendOne(row);          // нове чуже → вставляємо одну бульбашку
      else if (st === 'update') replaceOne(row); // realtime випередив await → заміна на місці
      // 'same' = відлуння власного повідомлення → нічого не чіпаємо (без блимання)
      if (row.sender_uid !== me) { _readThreads.add(thread.id); markThreadRead(thread.id, me).finally(refreshUnreadBadge); }
    } else if (type === 'UPDATE') {
      const idx = messages.findIndex(m => m.id === row.id);
      if (idx >= 0) { messages[idx] = row; replaceOne(row); }
    }
  });
  _chatUnsub = chatUnsub;
  // Очищаємо САМЕ цю підписку (не module-level змінну) → надійно навіть якщо колись
  // відкриють інший чат поверх. Module-ref обнуляємо лише якщо він ще наш.
  api._cleanup.push(() => { try { chatUnsub(); } catch (_) {} if (_chatUnsub === chatUnsub) _chatUnsub = null; });
  api._cleanup.push(refreshUnreadBadge);

  // Поле / редагування + кнопки-питання + фото + перегляд фото
  form.addEventListener('submit', (e) => { e.preventDefault(); submitText(); });
  api.screen.querySelector('#pm-composebar-x')?.addEventListener('click', () => {
    if (editing) input.value = '';
    clearCompose();
  });
  const attachBtn = api.screen.querySelector('#pm-attach');
  // Не віддаємо фокус поля → клавіатура не ховається, бар не «зависає» в повітрі.
  attachBtn?.addEventListener('pointerdown', e => e.preventDefault());
  attachBtn?.addEventListener('mousedown', e => e.preventDefault());
  attachBtn?.addEventListener('click', () => { input.focus(); fileEl.click(); });
  fileEl.addEventListener('change', () => { if (fileEl.files && fileEl.files[0]) sendPhoto(fileEl.files[0]); fileEl.value = ''; });
  streamEl.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (q) { sendText(q.dataset.quick); return; }
    const jump = e.target.closest('[data-jump]');
    if (jump) { jumpToMessage(jump.dataset.jump); return; }
    const ph = e.target.closest('[data-photo]');
    if (ph) openPhoto(ph.dataset.photo);
  });
  // Свайп ВЛІВО по бульбашці → відповідь; довге натискання → меню дій
  setupBubbleGestures(streamEl, (id, kind) => {
    const m = msgById.get(Number(id)) || msgById.get(id);
    if (!m) return;
    if (kind === 'reply') startReply(m);
    else if (kind === 'menu') openMsgActions(m);
  });
  // «Переглянути оголошення» — закрити чат і відкрити модалку Дошки
  // «Переглянути оголошення» — модалка оголошення Дошки ПОВЕРХ чату (не закриваємо чат)
  api.screen.querySelector('[data-pm-ctx]')?.addEventListener('click', (e) => {
    if (e.target.closest('.pm-ctx-call')) return;   // дзвінок — не відкривати модалку
    window.dispatchEvent(new CustomEvent('cstl-open-ad', { detail: { post: p } }));
  });
  // Кнопка надсилання не забирає фокус (iOS клавіатура)
  api.screen.querySelector('.pm-send')?.addEventListener('pointerdown', e => e.preventDefault());

  api._cleanup.push(setupKeyboardResize(api.screen));   // real-time трекінг + очистка слухачів
  setTimeout(() => input.focus(), 250);
  return api;
}

// Шапка+картка чату закріплені зверху і НЕ рухаються при появі/зникненні клавіатури.
// Ключ: iOS «панорамує» (зсуває) документ під клавіатуру, тягнучи фіксований верх.
// Тому на час чату ЗАМИКАЄМО сторінку (body→position:fixed) — панорамувати нема чому,
// шапка стоїть мертво. Зберігаємо real-time висоту + автоскрол до низу при відкритті.
// Повертає функцію очистки (знімає замок + слухачі).
function setupKeyboardResize(screen) {
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

// Жести над бульбашкою: свайп ВЛІВО → 'reply' (Telegram-стиль, іконка виїжджає
// з-за правого краю разом з бульбашкою), довге натискання → 'menu'.
// onAction(messageId, kind). Скрол вертикально / горизонтальний рух скасовують long-press.
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

// ── 2. Список «Повідомлення» ──────────────────────────────────────────────
// Розумний час для списку розмов: сьогодні → HH:MM, вчора → «Вчора»,
// цей рік → «D місяця», інакше → DD.MM.YY.
const MONTHS_GEN = ['січня', 'лютого', 'березня', 'квітня', 'травня', 'червня',
  'липня', 'серпня', 'вересня', 'жовтня', 'листопада', 'грудня'];
function threadListTime(ts) {
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

export function openThreadsList() {
  requireAuth('переглянути повідомлення', async () => {
    const me = currentUserId();
    const api = buildScreen(`
      <header class="pm-head pm-head--bar">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
      </header>
      <div class="pm-list pm-list--threads" id="pm-list">
        <h1 class="pm-bigtitle">Повідомлення</h1>
        <div class="pm-search">
          <span class="pm-search-ic" aria-hidden="true">🔍</span>
          <input class="pm-search-input" id="pm-search" type="search"
                 placeholder="Пошук повідомлень" aria-label="Пошук повідомлень" autocomplete="off">
        </div>
        <div class="pm-chips" id="pm-chips" role="tablist">
          <button class="pm-chip pm-chip--active" type="button" data-filter="all">Усі</button>
          <button class="pm-chip" type="button" data-filter="unread">Непрочитані</button>
          <button class="pm-chip" type="button" data-filter="archive">Архів</button>
        </div>
        <div class="pm-threads" id="pm-threads"><div class="pm-loading">Завантаження…</div></div>
      </div>
    `, 'pm-screen--list');

    const threadsEl = api.screen.querySelector('#pm-threads');
    const searchEl  = api.screen.querySelector('#pm-search');
    const chipsEl   = api.screen.querySelector('#pm-chips');

    let [threads, unread, states] = await Promise.all([
      fetchMyThreads(me), fetchUnreadByThread(me), fetchThreadStates(me),
    ]);
    if (api._closed) return;

    // Іконки для свайп-дій картки розмови
    const ICON_ARCHIVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9 13l3 3 3-3"/></svg>';
    const ICON_UNARCHIVE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="4" rx="1"/><path d="M5 8v11a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V8"/><path d="M9 15l3-3 3 3"/></svg>';
    const ICON_TRASH = ACT_ICONS.delete;

    // Без жодної розмови — ховаємо пошук+фільтри, лишаємо чистий empty state
    const applyEmptyState = () => {
      const show = threads.length ? '' : 'none';
      api.screen.querySelector('.pm-search').style.display = show;
      chipsEl.style.display = show;
    };
    applyEmptyState();

    let filter = 'all';   // all | unread
    let query  = '';

    const stOf = (id) => states.get(id) || {};
    const renderThreads = () => {
      const q = query.trim().toLowerCase();
      const list = threads.filter(t => {
        const s = stOf(t.id);
        // «Видалено» (cleared_at): ховаємо, ПОКИ нема нового повідомлення після видалення.
        // Прийшло нове (last_message_at пізніше) → чат знову зʼявляється (чистий).
        if (s.cleared_at && !(new Date(t.last_message_at) > new Date(s.cleared_at))) return false;
        if (filter === 'archive') { if (!s.archived) return false; }
        else if (s.archived) return false;                      // архівні не в «Усі»/«Непрочитані»
        if (filter === 'unread' && !(unread.get(t.id) > 0)) return false;
        if (!q) return true;
        const hay = `${otherName(t)} ${threadPostTitle(t)} ${t.last_message_text || ''}`.toLowerCase();
        return hay.includes(q);
      });
      if (!list.length) {
        threadsEl.innerHTML = (filter === 'archive')
          ? `<div class="pm-empty pm-empty--mini">Архів порожній</div>`
          : !threads.length
            ? `<div class="pm-empty pm-empty--threads">
                 <span class="pm-empty-ic">💬</span>
                 <div class="pm-empty-title">Ваші повідомлення</div>
                 <div class="pm-empty-sub">Тут зʼявляться ваші розмови з покупцями та продавцями з дошки.</div>
               </div>`
            : `<div class="pm-empty pm-empty--mini">Нічого не знайдено</div>`;
        return;
      }
      threadsEl.innerHTML = list.map(t => {
        const n = unread.get(t.id) || 0;
        const name = otherName(t);
        const preview = t.last_message_text || 'Розмову розпочато';
        const archived = !!stOf(t.id).archived;
        return `
          <div class="pm-thread-row" data-row="${t.id}">
            <div class="pm-thread-actions">
              <button class="pm-thread-act pm-thread-act--archive" type="button" data-archive="${t.id}" aria-label="${archived ? 'Розархівувати' : 'Архівувати'}">${archived ? ICON_UNARCHIVE : ICON_ARCHIVE}</button>
              <button class="pm-thread-act pm-thread-act--delete" type="button" data-delete="${t.id}" aria-label="Видалити">${ICON_TRASH}</button>
            </div>
            <button class="pm-thread ${n > 0 ? 'pm-thread--unread' : ''}" type="button" data-thread="${t.id}">
              ${avatar(name)}
              <div class="pm-thread-body">
                <div class="pm-thread-top">
                  <span class="pm-thread-name">${escapeHtml(name)}</span>
                  <span class="pm-thread-time">${threadListTime(t.last_message_at)}</span>
                </div>
                <div class="pm-thread-post">${escapeHtml(threadPostTitle(t))}</div>
                <div class="pm-thread-last">${escapeHtml(preview)}</div>
              </div>
              ${n > 0 ? `<span class="pm-thread-meta"><span class="pm-thread-dot"></span><span class="pm-row-badge">${n}</span></span>` : ''}
            </button>
          </div>`;
      }).join('');
    };

    renderThreads();

    searchEl.addEventListener('input', () => { query = searchEl.value; renderThreads(); });
    chipsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-filter]');
      if (!btn) return;
      filter = btn.dataset.filter;
      chipsEl.querySelectorAll('.pm-chip').forEach(c => c.classList.toggle('pm-chip--active', c === btn));
      renderThreads();
    });
    // Свайп-вліво по картці розмови → виїжджають дві дії (архів + видалити) ззаду.
    let openRow = null, suppressClick = false;
    const closeOpenRow = () => {
      if (!openRow) return;
      const c = openRow.querySelector('.pm-thread');
      if (c) { c.style.transition = ''; c.style.removeProperty('transform'); }   // плавне закриття
      openRow.classList.remove('pm-thread-row--open');
      openRow = null;
    };
    let sX = 0, sY = 0, swCard = null, swRow = null, swLock = null;
    threadsEl.addEventListener('touchstart', (e) => {
      const c = e.target.closest('.pm-thread');
      if (!c) { swCard = null; return; }
      swCard = c; swRow = c.closest('.pm-thread-row'); swLock = null;
      sX = e.touches[0].clientX; sY = e.touches[0].clientY;
    }, { passive: true });
    threadsEl.addEventListener('touchmove', (e) => {
      if (!swCard) return;
      const dx = e.touches[0].clientX - sX, dy = e.touches[0].clientY - sY;
      if (!swLock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) swLock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (swLock === 'h') {
        e.preventDefault();
        swCard.style.transition = 'none';   // реальний час — картка йде ЗА пальцем без анімації-затримки
        const base = (swRow === openRow) ? -140 : 0;
        const d = Math.max(Math.min(base + dx, 0), -140);
        swCard.style.transform = `translateX(${d}px)`;
      }
    }, { passive: false });
    threadsEl.addEventListener('touchend', (e) => {
      if (!swCard) return;
      const c = swCard, r = swRow, lock = swLock;
      swCard = null; swRow = null;
      if (lock !== 'h') return;
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
      c.style.transition = '';   // повертаємо CSS-плавність (0.22s) лише для фінального «снапу»
      const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : sX) - sX;
      const wasOpen = (r === openRow);
      const open = wasOpen ? (dx < 60) : (dx < -70);
      if (open) {
        if (openRow && openRow !== r) closeOpenRow();
        c.style.transform = 'translateX(-140px)'; r.classList.add('pm-thread-row--open'); openRow = r;
      } else {
        c.style.transform = ''; r.classList.remove('pm-thread-row--open'); if (openRow === r) openRow = null;
      }
    }, { passive: false });

    // Зміна стану розмови (архів/приховано) — оптимістично + БД (повний стан → upsert).
    const applyThreadState = async (id, patch) => {
      const prev = { ...(states.get(id) || {}) };
      const merged = { ...prev, ...patch };   // зберігаємо cleared_at при архівуванні тощо
      states.set(id, merged);
      closeOpenRow();
      renderThreads();
      const res = await setThreadState(me, id, {
        archived: !!merged.archived, hidden: !!merged.hidden, cleared_at: merged.cleared_at || null,
      });
      if (!res.ok) { states.set(id, prev); renderThreads(); showToast('❌ Не вдалося: ' + (res.error || ''), 4000, 'error'); }
    };

    threadsEl.addEventListener('click', (e) => {
      const arch = e.target.closest('[data-archive]');
      if (arch) { const id = Number(arch.dataset.archive); applyThreadState(id, { archived: !(stOf(id).archived) }); return; }
      const del = e.target.closest('[data-delete]');
      if (del) { applyThreadState(Number(del.dataset.delete), { hidden: true, cleared_at: new Date().toISOString() }); return; }
      const btn = e.target.closest('[data-thread]');
      if (!btn) return;
      if (suppressClick) return;                 // щойно свайпнули — не відкривати чат
      if (openRow) { closeOpenRow(); return; }   // є відкрита картка → спершу закрити
      const t = threads.find(x => String(x.id) === btn.dataset.thread);
      if (t) openChat(t, t.post);
    });

    // Живий список: нове повідомлення → перезавантажуємо треди (порядок за
    // last_message_at — розмова підстрибує вгору) + непрочитані і перемальовуємо.
    // Окремий канал (не конфліктує з глобальним бейджем). Дебаунс проти сплесків.
    let refreshTimer = null;
    const refresh = async () => {
      const [t, u, s] = await Promise.all([fetchMyThreads(me), fetchUnreadByThread(me), fetchThreadStates(me)]);
      if (api._closed) return;
      threads = t; unread = u; states = s;
      applyEmptyState();
      renderThreads();
    };
    const unsub = subscribeMyThreads(() => {
      if (refreshTimer) clearTimeout(refreshTimer);
      refreshTimer = setTimeout(refresh, 250);
    }, 'pm-threads-list');
    api._cleanup.push(() => { if (refreshTimer) clearTimeout(refreshTimer); unsub(); });
  });
}

// ── 4. Приватні групові чати (Етап 2) ──────────────────────────────────────
// Список «Групи» (з вкладки Чати) → груповий чат. Створення + вступ за посиланням.
// v1 чату: текст + realtime + імена відправників. Фото/відповіді/свайп — далі.
export function openGroupsList() {
  requireAuth('переглянути групи', async () => {
    const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <div class="pm-head-titles"><div class="pm-head-name">👥 Групи</div></div>
      </header>
      <div class="gr-actions">
        <button class="gr-act" type="button" data-gr-new>＋ Створити групу</button>
        <button class="gr-act gr-act--ghost" type="button" data-gr-join>🔗 Вступ за посиланням</button>
      </div>
      <div class="pm-list" id="gr-list"><div class="pm-loading">Завантаження…</div></div>
    `, 'pm-screen--groups');

    const listEl = api.screen.querySelector('#gr-list');
    let groups = [];
    const groupRow = (g) => {
      const cover = g.avatar_emoji || '👥';
      const last = g.last_message_text ? escapeHtml(g.last_message_text) : 'Немає повідомлень';
      return `
        <button class="pm-thread gr-row" type="button" data-group="${g.id}">
          <span class="gr-avatar" style="${g.avatar_gradient ? `background:${escapeHtml(g.avatar_gradient)}` : ''}">${escapeHtml(cover)}</span>
          <div class="pm-thread-body">
            <div class="pm-thread-top">
              <span class="pm-thread-name">${escapeHtml(g.name)}</span>
              <span class="pm-thread-time">${g.last_message_at ? threadListTime(g.last_message_at) : ''}</span>
            </div>
            <div class="pm-thread-last">${last}</div>
          </div>
        </button>`;
    };
    const load = async () => {
      groups = await fetchMyGroups();
      if (api._closed) return;
      listEl.innerHTML = groups.length
        ? groups.map(groupRow).join('')
        : `<div class="pm-empty"><span class="pm-empty-ic">👥</span>У вас ще немає груп.<br>Створіть свою або приєднайтесь за посиланням.</div>`;
    };
    await load();

    api.screen.querySelector('[data-gr-new]')?.addEventListener('click', () => openCreateGroup(load));
    api.screen.querySelector('[data-gr-join]')?.addEventListener('click', () => promptJoinByLink(load));
    listEl.addEventListener('click', (e) => {
      const row = e.target.closest('[data-group]');
      if (!row) return;
      const g = groups.find(x => String(x.id) === row.dataset.group);
      if (g) openGroupChat(g);
    });
  });
}

// Створення групи — лаконічна форма (назва + опис + emoji-обкладинка)
function openCreateGroup(onDone) {
  const EMOJIS = ['👥', '🏘', '⚽', '🎓', '🚜', '⛪', '🛒', '🎣'];
  const api = buildScreen(`
    <header class="pm-head pm-head--list">
      <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
      <div class="pm-head-titles"><div class="pm-head-name">＋ Нова група</div></div>
    </header>
    <div class="gr-form">
      <label class="gr-label">Емодзі</label>
      <div class="gr-emoji-row" id="gr-emoji">${EMOJIS.map((e, i) => `<button type="button" class="gr-emoji${i === 0 ? ' active' : ''}" data-emoji="${e}">${e}</button>`).join('')}</div>
      <label class="gr-label" for="gr-name">Назва</label>
      <input class="gr-input" id="gr-name" type="text" maxlength="60" placeholder="Напр. Наша Мительне">
      <label class="gr-label" for="gr-desc">Опис <span class="gr-hint">(необов'язково)</span></label>
      <textarea class="gr-input" id="gr-desc" rows="3" maxlength="200" placeholder="Про що ця група?"></textarea>
      <button class="gr-submit" type="button" id="gr-create">Створити</button>
    </div>
  `, 'pm-screen--groups');

  let emoji = EMOJIS[0];
  api.screen.querySelector('#gr-emoji').addEventListener('click', (e) => {
    const b = e.target.closest('[data-emoji]'); if (!b) return;
    emoji = b.dataset.emoji;
    api.screen.querySelectorAll('.gr-emoji').forEach(x => x.classList.toggle('active', x === b));
  });
  api.screen.querySelector('#gr-create').addEventListener('click', async () => {
    const name = api.screen.querySelector('#gr-name').value.trim();
    const description = api.screen.querySelector('#gr-desc').value.trim();
    if (!name) { showToast('Введіть назву групи', 2500); return; }
    const btn = api.screen.querySelector('#gr-create');
    btn.disabled = true; btn.textContent = 'Створюємо…';
    const r = await createGroup({ name, description, emoji });
    if (r.ok) {
      showToast('✅ Групу створено', 2500);
      api.close();
      if (onDone) onDone();
    } else { showToast('Не вдалося створити: ' + (r.error || ''), 3500, 'error'); btn.disabled = false; btn.textContent = 'Створити'; }
  });
}

// Повне посилання-запрошення (з hash-routing — працює на GitHub Pages без 404)
function buildInviteUrl(token) {
  return `${location.origin}${location.pathname}#/join/${token}`;
}

// Вступ за посиланням — вставити посилання/токен вручну (fallback до hash-routing)
function promptJoinByLink(onDone) {
  const raw = prompt('Встав посилання-запрошення або код групи:');
  if (!raw) return;
  const m = String(raw).trim().match(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  if (!m) { showToast('Не схоже на дійсне посилання', 3000); return; }
  openInviteJoin(m[0], onDone);
}

// Вступ за токеном: прев'ю → підтвердження → приєднання (миттєво або заявка).
// Викликається і з вставленого посилання, і з hash-routing (#/join/<token>).
export function openInviteJoin(token, onDone) {
  requireAuth('приєднатись до групи', async () => {
    const g = await getGroupByInvite(token);
    if (!g.ok) { showToast('Запрошення недійсне або застаріле', 3500); return; }
    if (g.my_status === 'member') { showToast('Ви вже в цій групі', 2500); openGroupsList(); return; }
    const note = g.requires_approval ? '\n\nПісля вступу адмін має вас схвалити.' : '';
    if (!confirm(`Приєднатись до «${g.name}»? (${g.members} учасн.)${note}`)) return;
    const r = await joinGroupByToken(token);
    if (r.ok && r.status === 'member') { showToast('✅ Ви приєднались', 2500); if (onDone) onDone(); else openGroupsList(); }
    else if (r.ok && r.status === 'pending') { showToast('⏳ Заявку надіслано — чекайте схвалення адміна', 4200); }
    else showToast('Не вдалося приєднатись: ' + (r.error || ''), 3500, 'error');
  });
}

// Керування групою: запрошення (2 типи), заявки на схвалення, учасники, вихід
export function openGroupManage(group) {
  requireAuth('керувати групою', async () => {
    const me = currentUserId();
    const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <div class="pm-head-titles"><div class="pm-head-name">⚙️ ${escapeHtml(group.name)}</div></div>
      </header>
      <div class="gr-mng" id="gr-mng"><div class="pm-loading">Завантаження…</div></div>
    `, 'pm-screen--groups');
    const wrap = api.screen.querySelector('#gr-mng');

    const makeInvite = async (requiresApproval) => {
      const r = await createGroupInvite(group.id, requiresApproval);
      if (!r.ok) { showToast('Не вдалося створити посилання: ' + (r.error || ''), 3500, 'error'); return; }
      const url = buildInviteUrl(r.token);
      const label = requiresApproval ? 'зі схваленням адміна' : 'миттєвий вступ';
      if (navigator.share) {
        try { await navigator.share({ title: group.name, text: `Приєднуйся до «${group.name}» (${label})`, url }); return; } catch (_) {}
      }
      try { await navigator.clipboard.writeText(url); showToast(`🔗 Посилання (${label}) скопійовано`, 3000); }
      catch { prompt('Скопіюй посилання:', url); }
    };

    const render = async () => {
      const members = await fetchGroupMembers(group.id);
      if (api._closed) return;
      const names = await fetchProfileNames(members.map(m => m.uid));
      const myRole = (members.find(m => m.uid === me) || {}).role;
      const isAdmin = myRole === 'admin';
      const isOwner = group.owner_uid === me;
      const pending = members.filter(m => m.status === 'pending');
      const active  = members.filter(m => m.status === 'member');
      const nm = (uid) => escapeHtml(names.get(uid) || 'Житель');

      wrap.innerHTML = `
        ${group.description ? `<p class="gr-mng-desc">${escapeHtml(group.description)}</p>` : ''}
        ${isAdmin ? `
          <div class="gr-mng-sec">
            <div class="gr-mng-h">Запросити</div>
            <button class="gr-act" type="button" data-inv="0">🔗 Посилання — миттєвий вступ</button>
            <button class="gr-act gr-act--ghost" type="button" data-inv="1">🔗 Посилання — зі схваленням</button>
          </div>` : ''}
        ${isAdmin && pending.length ? `
          <div class="gr-mng-sec">
            <div class="gr-mng-h">Заявки на вступ (${pending.length})</div>
            ${pending.map(m => `
              <div class="gr-mbr">
                <span class="gr-mbr-name">${nm(m.uid)}</span>
                <span class="gr-mbr-acts">
                  <button class="gr-mbr-ok" type="button" data-approve="${m.uid}">✓</button>
                  <button class="gr-mbr-no" type="button" data-reject="${m.uid}">✕</button>
                </span>
              </div>`).join('')}
          </div>` : ''}
        <div class="gr-mng-sec">
          <div class="gr-mng-h">Учасники (${active.length})</div>
          ${active.map(m => `
            <div class="gr-mbr">
              <span class="gr-mbr-name">${nm(m.uid)}${m.role === 'admin' ? ' <span class="gr-mbr-tag">адмін</span>' : ''}</span>
              ${isAdmin && m.uid !== group.owner_uid && m.uid !== me ? `<span class="gr-mbr-acts"><button class="gr-mbr-no" type="button" data-reject="${m.uid}">видалити</button></span>` : ''}
            </div>`).join('')}
        </div>
        ${!isOwner ? `<button class="gr-leave" type="button" data-leave>Вийти з групи</button>` : `<p class="gr-hint" style="padding:0 4px">Ви власник групи.</p>`}
      `;
    };
    await render();

    wrap.addEventListener('click', async (e) => {
      const inv = e.target.closest('[data-inv]');
      if (inv) { makeInvite(inv.dataset.inv === '1'); return; }
      const ap = e.target.closest('[data-approve]');
      if (ap) { const r = await approveMember(group.id, ap.dataset.approve); if (r.ok) { showToast('✅ Схвалено', 2000); render(); } else showToast('Помилка: ' + (r.error || ''), 3000); return; }
      const rj = e.target.closest('[data-reject]');
      if (rj) { if (!confirm('Прибрати цього користувача?')) return; const r = await rejectMember(group.id, rj.dataset.reject); if (r.ok) { showToast('Готово', 2000); render(); } else showToast('Помилка: ' + (r.error || ''), 3000); return; }
      if (e.target.closest('[data-leave]')) {
        if (!confirm('Вийти з групи?')) return;
        const r = await leaveGroup(group.id);
        if (r.ok) { showToast('Ви вийшли з групи', 2500); api.close(); }
        else showToast('Не вдалося вийти: ' + (r.error || ''), 3500, 'error');
      }
    });
  });
}

// Груповий чат (v1: текст + realtime + імена відправників)
export function openGroupChat(group) {
  requireAuth('відкрити груповий чат', async () => {
    const me = currentUserId();
    const api = buildScreen(`
      <header class="pm-head pm-head--chat">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <span class="gr-avatar gr-avatar--head" style="${group.avatar_gradient ? `background:${escapeHtml(group.avatar_gradient)}` : ''}">${escapeHtml(group.avatar_emoji || '👥')}</span>
        <div class="pm-head-titles"><div class="pm-head-name">${escapeHtml(group.name)}</div></div>
        <button class="gr-manage-btn" type="button" data-gr-manage aria-label="Керування групою">⚙️</button>
      </header>
      <div class="pm-stream" id="gr-stream"><div class="pm-loading">Завантаження…</div></div>
      <form class="pm-form" id="gr-form">
        <input class="pm-input" id="gr-msg" type="text" placeholder="Повідомлення у групу…" aria-label="Повідомлення" autocomplete="off">
        <button class="pm-send" type="submit" aria-label="Надіслати">↑</button>
      </form>
    `, 'pm-screen--chat');

    const streamEl = api.screen.querySelector('#gr-stream');
    const form = api.screen.querySelector('#gr-form');
    const input = api.screen.querySelector('#gr-msg');
    let messages = [];
    const ids = new Set();
    let names = new Map();

    const bubble = (m) => {
      const mine = m.sender_uid === me;
      const who = mine ? '' : `<span class="gr-sender">${escapeHtml(names.get(m.sender_uid) || 'Житель')}</span>`;
      const txt = m.deleted_at ? '🗑 видалено' : (m.text || '📷 Фото');
      return `<div class="pm-group ${mine ? 'pm-group--mine' : 'pm-group--other'}"><div class="pm-bubble">${who}<span class="pm-bubble-text">${escapeHtml(txt)}</span><span class="pm-bubble-time">${clockTime(postTime(m))}</span></div></div>`;
    };
    const render = () => {
      streamEl.innerHTML = messages.length
        ? messages.map(bubble).join('')
        : `<div class="pm-empty pm-empty--chat"><span class="pm-empty-ic">👋</span>Почніть розмову в групі.</div>`;
      streamEl.scrollTop = streamEl.scrollHeight;
    };
    const addMsg = (m) => { if (m && !ids.has(m.id)) { ids.add(m.id); messages.push(m); } };

    // Імена учасників + повідомлення
    const members = await fetchGroupMembers(group.id);
    names = await fetchProfileNames(members.map(x => x.uid));
    (await fetchGroupMessages(group.id)).forEach(addMsg);
    if (api._closed) return;
    render();

    api.screen.querySelector('[data-gr-manage]')?.addEventListener('click', () => openGroupManage(group));

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = input.value.trim();
      if (!text) return;
      input.value = '';
      const r = await sendGroupMessage({ groupId: group.id, senderUid: me, text });
      if (r.ok) { addMsg(r.message); render(); }
      else { showToast('Не вдалося надіслати: ' + (r.error || ''), 3000, 'error'); input.value = text; }
    });

    const unsub = subscribeGroupMessages(group.id, ({ type, row }) => {
      if (type === 'INSERT' && row) { addMsg(row); render(); }
      else if (type === 'UPDATE' && row) {
        const i = messages.findIndex(x => x.id === row.id);
        if (i >= 0) { messages[i] = row; render(); }
      }
    });
    api._cleanup.push(unsub);
  });
}

// ── 3. «Мої оголошення» (керування власними оголошеннями) ──────────────────
// Дві вкладки: Активні (published+pending) / Архів (rejected+closed).
// Картка: фото/emoji + назва + мета(категорія·дата·статус) + бейдж звернень,
// кнопка «Підняти» (тільки published, кулдаун 3 год) + меню дій (⋯).
// Чати тут НЕ розкриваємо — бейдж веде у «Повідомлення».
const AD_STATUS = {
  published: { label: 'активне',      icon: '✅', group: 'active'  },
  pending:   { label: 'на перевірці', icon: '⏳', group: 'active'  },
  closed:    { label: 'завершено',    icon: '✔️', group: 'archive' },
  rejected:  { label: 'відхилено',    icon: '❌', group: 'archive' },
};

function adDate(p) {
  const ms = (p.bumped_at && new Date(p.bumped_at).getTime()) || p.ts
    || (p.published_at && new Date(p.published_at).getTime())
    || (p.created_at && new Date(p.created_at).getTime()) || 0;
  if (!ms) return '';
  const d = new Date(ms);
  return `${String(d.getDate()).padStart(2, '0')}.${String(d.getMonth() + 1).padStart(2, '0')}`;
}

function bumpRow(p) {
  const last = p.bumped_at ? new Date(p.bumped_at).getTime() : 0;
  const leftMs = last + BUMP_COOLDOWN_MS - Date.now();
  if (leftMs > 0) {
    const h = Math.floor(leftMs / 3600000);
    const m = Math.max(1, Math.ceil((leftMs % 3600000) / 60000));
    const t = h > 0 ? `${h} год` : `${m} хв`;
    return `<button class="pm-ad-bump pm-ad-bump--wait" type="button" disabled>🔼 Можна через ${t}</button>`;
  }
  return `<button class="pm-ad-bump" type="button" data-bump="${p.id}">🔼 Підняти вгору</button>`;
}

export function openMyAds() {
  requireAuth('переглянути ваші оголошення', async () => {
    const me = currentUserId();
    const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <div class="pm-head-titles"><div class="pm-head-name">📋 Мої оголошення</div></div>
      </header>
      <div class="pm-ad-tabs">
        <button class="pm-ad-tab active" type="button" data-filter="active">Активні</button>
        <button class="pm-ad-tab" type="button" data-filter="archive">Архів</button>
      </div>
      <div class="pm-list" id="pm-ads"><div class="pm-loading">Завантаження…</div></div>
      <button class="pm-fab-ad" type="button" data-new-ad aria-label="Нове оголошення">✏️</button>
    `, 'pm-screen--ads');

    const listEl = api.screen.querySelector('#pm-ads');
    let [posts, threads, unread] = await Promise.all([
      fetchMyPosts(me), fetchMyThreads(me), fetchUnreadByThread(me),
    ]);
    if (api._closed) return;

    // Звернення (треди де я продавець), згруповані за оголошенням
    const byPost = new Map();
    threads.filter(t => t.author_uid === me).forEach(t => {
      if (!byPost.has(t.post_id)) byPost.set(t.post_id, []);
      byPost.get(t.post_id).push(t);
    });
    const unreadFor = (postId) => (byPost.get(postId) || []).reduce((s, t) => s + (unread.get(t.id) || 0), 0);
    const threadsFor = (postId) => (byPost.get(postId) || []).length;

    let filter = 'active';

    // Іконки для свайп-дій картки оголошення (ті самі стилі, що у списку розмов)
    const ICON_DONE = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg>';
    const ICON_BACK = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 14l-4-4 4-4"/><path d="M5 10h11a4 4 0 0 1 0 8h-1"/></svg>';
    const ICON_TRASH = ACT_ICONS.delete;

    // Дії, що виїжджають при свайпі вліво (ззаду картки). Залежать від статусу:
    //  published → Завершити + Видалити; closed → Повернути + Видалити; решта → Видалити.
    function swipeActions(p) {
      const btns = [];
      if (p.status === 'published') {
        btns.push(`<button class="pm-ad-swipe-btn pm-ad-swipe-btn--done" type="button" data-act="close" data-id="${p.id}" aria-label="Завершити">${ICON_DONE}</button>`);
      } else if (p.status === 'closed') {
        btns.push(`<button class="pm-ad-swipe-btn pm-ad-swipe-btn--restore" type="button" data-act="restore" data-id="${p.id}" aria-label="Повернути">${ICON_BACK}</button>`);
      }
      btns.push(`<button class="pm-ad-swipe-btn pm-ad-swipe-btn--delete" type="button" data-act="delete" data-id="${p.id}" aria-label="Видалити">${ICON_TRASH}</button>`);
      return { html: `<div class="pm-ad-swipe">${btns.join('')}</div>`, openW: btns.length > 1 ? 134 : 70 };
    }

    function adCard(p) {
      const meta = AD_STATUS[p.status] || { label: p.status || '', icon: '', group: 'active' };
      const photo = Array.isArray(p.photos) ? p.photos.find(x => x) : null;
      const thumb = photo
        ? `<div class="pm-ad-thumb pm-ad-thumb--photo" style="background-image:url('${escapeHtml(photo)}')"></div>`
        : `<div class="pm-ad-thumb" style="background:${escapeHtml(p.cover_gradient || 'linear-gradient(135deg,#ece4d8,#dccfba)')}"><span>${escapeHtml(p.cover_emoji || '📋')}</span></div>`;
      const title = escapeHtml((p.title && p.title.trim()) || (p.text || '').trim().slice(0, 54) || 'Оголошення');
      const cat = p.category ? `${escapeHtml(p.category)} · ` : '';
      const isPublished = p.status === 'published';

      // Бейдж звернень + кнопка підняти — тільки для активних published
      let actionsRow = '';
      if (isPublished) {
        const tn = threadsFor(p.id), un = unreadFor(p.id);
        const badge = tn > 0
          ? `<button class="pm-ad-msgs" type="button" data-badge="1">💬 ${tn} ${tn === 1 ? 'звернення' : 'звернень'}${un > 0 ? `<span class="pm-ad-unread">${un}</span>` : ''}</button>`
          : `<span class="pm-ad-msgs pm-ad-msgs--none">💬 Поки немає звернень</span>`;
        actionsRow = `<div class="pm-ad-actions">${badge}${bumpRow(p)}</div>`;
      }

      // Меню дій: «Завершити» лише для published; «Повернути» лише для closed; «Видалити» завжди
      const menuItems = [
        isPublished ? `<button class="pm-ad-mi" type="button" data-act="close" data-id="${p.id}">✓ Завершити</button>` : '',
        p.status === 'closed' ? `<button class="pm-ad-mi" type="button" data-act="restore" data-id="${p.id}">↩️ Повернути в активні</button>` : '',
        `<button class="pm-ad-mi pm-ad-mi--danger" type="button" data-act="delete" data-id="${p.id}">🗑️ Видалити</button>`,
      ].join('');

      const sw = swipeActions(p);
      return `
        <div class="pm-ad-row" data-row="${p.id}" data-open-w="${sw.openW}">
          ${sw.html}
          <div class="pm-ad" data-ad="${p.id}">
            <div class="pm-ad-main" data-open-ad="${p.id}">
              ${thumb}
              <div class="pm-ad-info">
                <span class="pm-ad-title">${title}</span>
                <span class="pm-ad-meta">${cat}${adDate(p)} · <span class="pm-ad-status pm-ad-status--${escapeHtml(p.status || '')}">${meta.icon} ${escapeHtml(meta.label)}</span></span>
              </div>
              <button class="pm-ad-more" type="button" data-menu="${p.id}" aria-label="Дії">⋯</button>
            </div>
            ${actionsRow}
            <div class="pm-ad-menu" id="pm-ad-menu-${p.id}" hidden>${menuItems}</div>
          </div>
        </div>`;
    }

    // Стан свайпу картки (рядок з відкритими діями)
    let openRow = null, suppressClick = false;
    const closeOpenRow = () => {
      if (!openRow) return;
      const c = openRow.querySelector('.pm-ad');
      if (c) { c.style.transition = ''; c.style.removeProperty('transform'); }
      openRow.classList.remove('pm-ad-row--open');
      openRow = null;
    };

    function render() {
      openRow = null;   // innerHTML перемальовується — стара відкрита картка зникає
      const list = posts.filter(p => (AD_STATUS[p.status]?.group || 'active') === filter);
      if (!list.length) {
        listEl.innerHTML = filter === 'active'
          ? `<div class="pm-empty"><span class="pm-empty-ic">📋</span>У вас ще немає активних оголошень.<br>Подайте перше — кнопка ✏️ внизу.</div>`
          : `<div class="pm-empty"><span class="pm-empty-ic">🗄️</span>Архів порожній.</div>`;
        return;
      }
      listEl.innerHTML = list.map(adCard).join('');
    }
    render();

    // Перемикання вкладок
    api.screen.querySelectorAll('.pm-ad-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        if (tab.dataset.filter === filter) return;
        filter = tab.dataset.filter;
        api.screen.querySelectorAll('.pm-ad-tab').forEach(t => t.classList.toggle('active', t === tab));
        render();
      });
    });

    // FAB → модалка нового оголошення (та сама що на Дошці)
    api.screen.querySelector('[data-new-ad]')?.addEventListener('click', () => openBoardModal());

    // Свайп вліво по картці → виїжджають дії (Завершити/Повернути + Видалити) ззаду.
    let sX = 0, sY = 0, swCard = null, swRow = null, swLock = null;
    const rowOpenW = (row) => Number(row?.dataset.openW) || 134;
    listEl.addEventListener('touchstart', (e) => {
      const c = e.target.closest('.pm-ad');
      if (!c) { swCard = null; return; }
      swCard = c; swRow = c.closest('.pm-ad-row'); swLock = null;
      sX = e.touches[0].clientX; sY = e.touches[0].clientY;
    }, { passive: true });
    listEl.addEventListener('touchmove', (e) => {
      if (!swCard) return;
      const dx = e.touches[0].clientX - sX, dy = e.touches[0].clientY - sY;
      if (!swLock && (Math.abs(dx) > 10 || Math.abs(dy) > 10)) swLock = Math.abs(dx) > Math.abs(dy) ? 'h' : 'v';
      if (swLock === 'h') {
        e.preventDefault();
        swCard.style.transition = 'none';
        const w = rowOpenW(swRow);
        const base = (swRow === openRow) ? -w : 0;
        const d = Math.max(Math.min(base + dx, 0), -w);
        swCard.style.transform = `translateX(${d}px)`;
      }
    }, { passive: false });
    listEl.addEventListener('touchend', (e) => {
      if (!swCard) return;
      const c = swCard, r = swRow, lock = swLock;
      swCard = null; swRow = null;
      if (lock !== 'h') return;
      suppressClick = true; setTimeout(() => { suppressClick = false; }, 60);
      c.style.transition = '';
      const w = rowOpenW(r);
      const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : sX) - sX;
      const wasOpen = (r === openRow);
      const open = wasOpen ? (dx < 60) : (dx < -70);
      if (open) {
        if (openRow && openRow !== r) closeOpenRow();
        c.style.transform = `translateX(${-w}px)`; r.classList.add('pm-ad-row--open'); openRow = r;
      } else {
        c.style.transform = ''; r.classList.remove('pm-ad-row--open'); if (openRow === r) openRow = null;
      }
    }, { passive: false });

    const closeMenus = (except) => api.screen.querySelectorAll('.pm-ad-menu').forEach(m => { if (m !== except) m.hidden = true; });

    // Делеговані дії по списку
    listEl.addEventListener('click', async (e) => {
      if (suppressClick) return;   // щойно був свайп — не реагуємо на синтетичний клік
      // Відкритий свайп-рядок: дозволяємо лише його дії, будь-який інший тап — закрити рядок
      if (openRow) {
        const actInOpen = e.target.closest('[data-act]');
        if (!actInOpen || !openRow.contains(actInOpen)) { closeOpenRow(); return; }
      }
      const menuBtn = e.target.closest('[data-menu]');
      if (menuBtn) {
        const menu = api.screen.querySelector(`#pm-ad-menu-${menuBtn.dataset.menu}`);
        closeMenus(menu);
        if (menu) menu.hidden = !menu.hidden;
        return;
      }
      const bumpBtn = e.target.closest('[data-bump]');
      if (bumpBtn) {
        bumpBtn.disabled = true;
        const r = await bumpPost(Number(bumpBtn.dataset.bump));
        if (r.ok) {
          const p = posts.find(x => String(x.id) === bumpBtn.dataset.bump);
          if (p) p.bumped_at = r.bumped_at || new Date().toISOString();
          showToast('🔼 Оголошення піднято вгору', 2500);
          render();
        } else if (r.error === 'cooldown') {
          const h = Math.floor((r.seconds_left || 0) / 3600);
          const m = Math.max(1, Math.ceil(((r.seconds_left || 0) % 3600) / 60));
          showToast(`Підняти можна раз на 3 год. Спробуйте через ${h > 0 ? h + ' год' : m + ' хв'}.`, 3500);
          const p = posts.find(x => String(x.id) === bumpBtn.dataset.bump);
          if (p) p.bumped_at = new Date(Date.now() - (BUMP_COOLDOWN_MS - (r.seconds_left || 0) * 1000)).toISOString();
          render();
        } else {
          showToast('Не вдалося підняти. Спробуйте ще раз.', 3000);
          bumpBtn.disabled = false;
        }
        return;
      }
      const badgeBtn = e.target.closest('[data-badge]');
      if (badgeBtn) { openThreadsList(); return; }

      const act = e.target.closest('[data-act]');
      if (act) {
        closeMenus(null);
        const id = Number(act.dataset.id);
        if (act.dataset.act === 'close') {
          const r = await closePost(id);
          if (r.ok) {
            const p = posts.find(x => x.id === id);
            if (p) p.status = 'closed';
            showToast('Оголошення завершено — у Архіві', 2800);
            render();
            window.dispatchEvent(new Event('cstl-posts-changed'));   // дошка зникне зразу
          } else showToast('Не вдалося завершити. Спробуйте ще раз.', 3000);
        } else if (act.dataset.act === 'restore') {
          const r = await restorePost(id);
          if (r.ok) {
            const p = posts.find(x => x.id === id);
            if (p) p.status = 'published';   // bumped_at не змінився → той самий час підняття
            showToast('↩️ Оголошення повернуто в активні', 2800);
            render();
            window.dispatchEvent(new Event('cstl-posts-changed'));   // зразу зʼявиться на дошці
          } else if (r.error === 'not_restorable') {
            showToast('Повернути можна лише завершені оголошення', 3000);
          } else showToast('Не вдалося повернути. Спробуйте ще раз.', 3000);
        } else if (act.dataset.act === 'delete') {
          if (!confirm('Видалити оголошення назавжди? Розмови по ньому теж зникнуть.')) return;
          const r = await deleteMyPost(id);
          if (r.ok) {
            posts = posts.filter(x => x.id !== id);
            showToast('Оголошення видалено', 2500);
            render();
          } else showToast('Не вдалося видалити. Спробуйте ще раз.', 3000);
        }
        return;
      }

      // Тап по тілу картки → перегляд оголошення (модалка Дошки)
      const open = e.target.closest('[data-open-ad]');
      if (open) {
        const p = posts.find(x => String(x.id) === open.dataset.openAd);
        if (p) window.dispatchEvent(new CustomEvent('cstl-open-ad', { detail: { post: p } }));
      }
    });
    // Клік поза меню — закрити відкриті меню
    api.screen.addEventListener('click', (e) => {
      if (!e.target.closest('.pm-ad-menu') && !e.target.closest('[data-menu]')) closeMenus(null);
    });
  });
}

// ── Точка входу з оголошення: кнопка «Повідомлення» 💬 ────────────────────
export function startChatFromPost(post) {
  requireAuth('написати продавцю', async () => {
    const me = currentUserId();
    if (!post.owner_uid) {
      showToast('Автор не залишив акаунту — зателефонуйте за номером', 3500);
      return;
    }
    if (post.owner_uid === me) {
      showToast('Це ваше оголошення — звернення дивіться у «Мої оголошення»', 3500);
      return;
    }
    const myProfile = await getProfile();
    const myName = (myProfile && myProfile.name) || 'Житель';
    const res = await getOrCreateThread({
      postId: post.id, authorUid: post.owner_uid, buyerUid: me,
      authorName: post.author || 'Продавець', buyerName: myName,
    });
    if (!res.ok) { showToast('Не вдалося відкрити чат: ' + (res.error || ''), 4000, 'error'); return; }
    openChat(res.thread, post);
  });
}

// ── Бейдж непрочитаних: іконка акаунта (шапка) + FAB Дошки + пункт «Повідомлення» ──
// Число всюди однакове = кількість ЧАТІВ (розмов) з хоча б одним непрочитаним.
// _readThreads — треди, які ми ЩОЙНО прочитали (відкрили чат). Виключаємо їх з
// лічильника одразу, не чекаючи поки БД оновить read_at → бейдж зникає надійно.
const _readThreads = new Set();
export async function refreshUnreadBadge() {
  const accBtn   = document.getElementById('account-btn');
  const fabBadge = document.getElementById('board-trigger-badge');
  const msgBadge = document.getElementById('board-fab-msgs-badge');

  const hideAll = () => {
    accBtn?.querySelector('.account-unread')?.remove();
    if (fabBadge) { fabBadge.textContent = ''; fabBadge.style.display = 'none'; }
    if (msgBadge) { msgBadge.textContent = ''; msgBadge.style.display = 'none'; }
  };
  if (!isLoggedIn()) { hideAll(); return; }

  // Кількість розмов з непрочитаними = розмір Map<thread_id, count>
  const map = await fetchUnreadByThread(currentUserId());
  for (const id of _readThreads) map.delete(id);   // щойно прочитані не рахуємо
  const chats = map.size;
  if (chats <= 0) { hideAll(); return; }
  const label = chats > 99 ? '99+' : String(chats);

  if (accBtn) {
    let badge = accBtn.querySelector('.account-unread');
    if (!badge) {
      badge = document.createElement('span');
      badge.className = 'account-unread';
      accBtn.appendChild(badge);
    }
    badge.textContent = label;
  }
  if (fabBadge) { fabBadge.textContent = label; fabBadge.style.display = 'block'; }
  if (msgBadge) { msgBadge.textContent = label; msgBadge.style.display = 'inline-block'; }
}

// ── Реєстрація push-пристрою під акаунт (без запиту дозволу) ───────────────
// Використовуємо НАЯВНУ браузерну підписку (її вже міг створити трекер автобусів).
// Якщо підписки ще немає — нічого не робимо (не нав'язуємо дозвіл при вході).
async function registerChatPushDevice() {
  try {
    if (!isLoggedIn()) return;
    if (!('serviceWorker' in navigator) || !('PushManager' in window)) return;
    if (Notification.permission !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    const j = sub.toJSON();
    await saveUserPushDevice({
      uid: currentUserId(), endpoint: j.endpoint, p256dh: j.keys.p256dh, auth_key: j.keys.auth,
    });
  } catch (e) { console.warn('[chat-push] register:', e && e.message); }
}

// ── Ініціалізація (з app.js): бейдж + realtime + реакція на вхід/вихід ─────
let _threadsUnsub = null;
export function initMessages() {
  refreshUnreadBadge();
  onAuthChange(() => {
    refreshUnreadBadge();
    registerChatPushDevice();
    // realtime по всіх моїх тредах → оновлення бейджа в реальному часі
    if (_threadsUnsub) { try { _threadsUnsub(); } catch (_) {} _threadsUnsub = null; }
    if (isLoggedIn()) _threadsUnsub = subscribeMyThreads((p) => {
      // нове чуже повідомлення → тред знову непрочитаний (прибрати з локально-прочитаних)
      const row = p && p.new;
      if (row && row.thread_id != null && row.sender_uid && row.sender_uid !== currentUserId()) {
        _readThreads.delete(row.thread_id);
      }
      refreshUnreadBadge();
    });
  });
}
