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
  subscribeThreadMessages, subscribeMyThreads, saveUserPushDevice,
  editMessage, deleteMessage, uploadPhotoToStorage,
} from './supabase.js';
import { escapeHtml, showToast, postTime, containsProfanity } from './utils.js';

// VAPID public key — той самий що для автобусних push (див. buses.js / Edge Function)
const VAPID_PUBLIC_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';

// Лінійні іконки для меню дій над повідомленням (монохром, у стилі чату)
const ACT_ICONS = {
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
  _openScreens.push(api);
  return api;
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
  const cat = p.category || '';
  const thumb = (p.photos && p.photos[0]) || '';

  const api = buildScreen(`
    <header class="pm-head pm-head--chat">
      <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
      ${avatar(partner)}
      <div class="pm-head-titles">
        <div class="pm-head-name">${escapeHtml(partner)}</div>
        <div class="pm-head-sub">${escapeHtml(title)}</div>
      </div>
    </header>
    <button class="pm-ctx" type="button" data-pm-ctx aria-label="Переглянути оголошення">
      ${thumb
        ? `<span class="pm-ctx-thumb" style="background-image:url('${escapeHtml(thumb)}')"></span>`
        : `<span class="pm-ctx-thumb pm-ctx-thumb--none">🏷️</span>`}
      <span class="pm-ctx-body">
        <span class="pm-ctx-title">${escapeHtml(title)}</span>
        ${cat ? `<span class="pm-ctx-cat">${escapeHtml(cat)}</span>` : ''}
        <span class="pm-ctx-link">Переглянути оголошення →</span>
      </span>
    </button>
    <div class="pm-stream" id="pm-stream">
      <div class="pm-loading">Завантаження…</div>
    </div>
    <div class="pm-composebar" id="pm-composebar" hidden>
      <span class="pm-composebar-ic" id="pm-composebar-ic">↩</span>
      <div class="pm-composebar-body">
        <span class="pm-composebar-title" id="pm-composebar-title"></span>
        <span class="pm-composebar-text" id="pm-composebar-text"></span>
      </div>
      <button class="pm-composebar-x" type="button" id="pm-composebar-x" aria-label="Скасувати">✕</button>
    </div>
    <form class="pm-form" id="pm-form">
      <button class="pm-attach" type="button" id="pm-attach" aria-label="Додати фото">🖼</button>
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
    api.screen.querySelector('#pm-composebar-ic').textContent = mode === 'edit' ? '✎' : '↩';
    api.screen.querySelector('#pm-composebar-title').textContent = mode === 'edit' ? 'Редагування' : 'Відповідь';
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
    if (m.deleted_at) {
      return `<div class="pm-bubble pm-bubble--deleted" data-msg="${m.id}"><span class="pm-bubble-text">🗑 Повідомлення видалено</span></div>`;
    }
    const reply = m.reply_to_id ? msgById.get(m.reply_to_id) : null;
    const replyHtml = reply
      ? `<span class="pm-quote">${escapeHtml((reply.deleted_at ? 'Видалене повідомлення' : (reply.text || '📷 Фото')).slice(0, 90))}</span>`
      : '';
    const photoHtml = m.photo_url
      ? `<img class="pm-bubble-photo" src="${escapeHtml(m.photo_url)}" alt="фото" data-photo="${escapeHtml(m.photo_url)}">`
      : '';
    const textHtml = m.text ? `<span class="pm-bubble-text">${escapeHtml(m.text)}</span>` : '';
    const edited = m.edited_at ? '<span class="pm-bubble-edited">змінено</span> ' : '';
    return `<div class="pm-bubble" data-msg="${m.id}">${replyHtml}${photoHtml}${textHtml}<span class="pm-bubble-time">${edited}${clockTime(postTime(m))}</span></div>`;
  };
  const renderGroup = (g) =>
    `<div class="pm-group ${g.mine ? 'pm-group--mine' : 'pm-group--other'}">${g.msgs.map(renderBubble).join('')}</div>`;

  const renderStream = () => {
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
    // Read receipt під останнім МОЇМ повідомленням
    const lastMsg = messages[messages.length - 1];
    if (lastMsg && lastMsg.sender_uid === me && !lastMsg.deleted_at) {
      html += `<div class="pm-receipt">${lastMsg.read_at ? 'Прочитано' : 'Надіслано'}</div>`;
    }
    streamEl.innerHTML = html;
  };
  const scrollBottom = () => { streamEl.scrollTop = streamEl.scrollHeight; };

  // Кнопка ↑ / Enter: редагування (якщо активне) або нове повідомлення
  const submitText = async () => {
    const text = input.value.trim();
    if (editing) {
      if (!text) return;
      if (containsProfanity(text)) { showToast('🚫 Повідомлення містить заборонені слова', 3500, 'error'); return; }
      const target = editing;
      input.value = ''; clearCompose();
      const idx = messages.findIndex(m => m.id === target.id);
      if (idx >= 0) { messages[idx] = { ...messages[idx], text, edited_at: new Date().toISOString() }; renderStream(); }
      const res = await editMessage(target.id, text);
      if (!res.ok) { showToast('❌ Не вдалося змінити: ' + (res.error || ''), 4000, 'error'); return; }
      if (idx >= 0 && res.message) { messages[idx] = res.message; renderStream(); }
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
    const temp = { id: 'tmp-' + Date.now(), thread_id: thread.id, sender_uid: me, text, reply_to_id: replyId, created_at: new Date().toISOString() };
    messages.push(temp);
    renderStream();
    scrollBottom();
    const res = await sendMessage({ threadId: thread.id, senderUid: me, text, replyToId: replyId });
    if (!res.ok) {
      messages = messages.filter(m => m.id !== temp.id);
      renderStream();
      showToast('❌ Не вдалося надіслати: ' + (res.error || ''), 4000, 'error');
      input.value = text;
      return;
    }
    // Заміняємо temp на справжнє (з реальним id) — щоб realtime-дубль не додав копію
    const idx = messages.findIndex(m => m.id === temp.id);
    if (idx >= 0 && res.message) messages[idx] = res.message;
    renderStream();
  };

  // Надсилання фото (оптимістичний прев'ю → upload у Storage → insert)
  const sendPhoto = async (file) => {
    if (!file) return;
    const replyId = replyTo ? replyTo.id : null;
    clearCompose();
    const localUrl = URL.createObjectURL(file);
    const temp = { id: 'tmp-' + Date.now(), thread_id: thread.id, sender_uid: me, text: null, photo_url: localUrl, reply_to_id: replyId, created_at: new Date().toISOString() };
    messages.push(temp);
    renderStream();
    scrollBottom();
    const up = await uploadPhotoToStorage(file);
    if (!up.url) {
      messages = messages.filter(m => m.id !== temp.id);
      renderStream();
      showToast('❌ Не вдалося завантажити фото: ' + (up.error || ''), 4000, 'error');
      return;
    }
    const res = await sendMessage({ threadId: thread.id, senderUid: me, photoUrl: up.url, replyToId: replyId });
    URL.revokeObjectURL(localUrl);
    if (!res.ok) {
      messages = messages.filter(m => m.id !== temp.id);
      renderStream();
      showToast('❌ Не вдалося надіслати фото: ' + (res.error || ''), 4000, 'error');
      return;
    }
    const idx = messages.findIndex(m => m.id === temp.id);
    if (idx >= 0 && res.message) messages[idx] = res.message;
    renderStream();
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
        if (idx >= 0) { messages[idx] = { ...messages[idx], deleted_at: new Date().toISOString(), text: null, photo_url: null }; renderStream(); }
        const res = await deleteMessage(m.id);
        if (!res.ok) showToast('❌ Не вдалося видалити: ' + (res.error || ''), 4000, 'error');
      }
    });
    api.screen.appendChild(sheet);
  };

  // Початкове завантаження
  messages = await fetchMessages(thread.id);
  if (api._closed) return api;
  renderStream();
  setTimeout(scrollBottom, 50);
  // Позначити вхідні прочитаними + оновити бейдж
  markThreadRead(thread.id, me).then(refreshUnreadBadge);

  // Realtime — нові / редаговані / видалені / прочитані повідомлення треда
  if (_chatUnsub) { try { _chatUnsub(); } catch (_) {} }
  _chatUnsub = subscribeThreadMessages(thread.id, ({ type, row }) => {
    if (!row) return;
    if (type === 'INSERT') {
      if (messages.some(m => m.id === row.id)) return;   // вже є (мій optimistic)
      messages.push(row);
      renderStream();
      scrollBottom();
      if (row.sender_uid !== me) markThreadRead(thread.id, me).then(refreshUnreadBadge);
    } else if (type === 'UPDATE') {
      const idx = messages.findIndex(m => m.id === row.id);
      if (idx >= 0) { messages[idx] = row; renderStream(); }
    }
  });
  api._cleanup.push(() => { if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; } });
  api._cleanup.push(refreshUnreadBadge);

  // Поле / редагування + кнопки-питання + фото + перегляд фото
  form.addEventListener('submit', (e) => { e.preventDefault(); submitText(); });
  api.screen.querySelector('#pm-composebar-x')?.addEventListener('click', () => {
    if (editing) input.value = '';
    clearCompose();
  });
  api.screen.querySelector('#pm-attach')?.addEventListener('click', () => fileEl.click());
  fileEl.addEventListener('change', () => { if (fileEl.files && fileEl.files[0]) sendPhoto(fileEl.files[0]); fileEl.value = ''; });
  streamEl.addEventListener('click', (e) => {
    const q = e.target.closest('[data-quick]');
    if (q) { sendText(q.dataset.quick); return; }
    const ph = e.target.closest('[data-photo]');
    if (ph) openPhoto(ph.dataset.photo);
  });
  // Свайп вправо по бульбашці → відповідь; довге натискання → меню дій
  setupBubbleGestures(streamEl, (id, kind) => {
    const m = msgById.get(Number(id)) || msgById.get(id);
    if (!m) return;
    if (kind === 'reply') startReply(m);
    else if (kind === 'menu') openMsgActions(m);
  });
  // «Переглянути оголошення» — закрити чат і відкрити модалку Дошки
  api.screen.querySelector('[data-pm-ctx]')?.addEventListener('click', () => {
    api.close();
    setTimeout(() => window.dispatchEvent(new CustomEvent('cstl-open-ad', { detail: { post: p } })), 260);
  });
  // Кнопка надсилання не забирає фокус (iOS клавіатура)
  api.screen.querySelector('.pm-send')?.addEventListener('pointerdown', e => e.preventDefault());

  setupKeyboardResize(api.screen);
  setTimeout(() => input.focus(), 250);
  return api;
}

// Підлаштування під екранну клавіатуру (iOS PWA) — sheet стискається над нею.
function setupKeyboardResize(screen) {
  const vv = window.visualViewport;
  if (!vv) return;
  const fullH = window.innerHeight;
  const apply = () => {
    const open = vv.height < fullH - 80;
    if (open) {
      screen.style.height = (vv.height - 2) + 'px';
      screen.style.top = vv.offsetTop + 'px';
      screen.classList.add('pm-kb-open');
      const stream = screen.querySelector('#pm-stream');
      if (stream) stream.scrollTop = stream.scrollHeight;
    } else {
      screen.style.height = '';
      screen.style.top = '';
      screen.classList.remove('pm-kb-open');
    }
  };
  let t = null;
  const h = () => { clearTimeout(t); t = setTimeout(apply, 80); };
  vv.addEventListener('resize', h);
  vv.addEventListener('scroll', h);
}

// Жести над бульбашкою: свайп вправо → 'reply', довге натискання → 'menu'.
// onAction(messageId, kind). Скрол вертикально / горизонтальний рух скасовують long-press.
function setupBubbleGestures(container, onAction) {
  let startX = 0, startY = 0, target = null, lpTimer = null, longFired = false, lockDir = null;
  const clearLP = () => { if (lpTimer) { clearTimeout(lpTimer); lpTimer = null; } };
  const resetTransform = (b) => {
    b.style.transition = 'transform 0.18s ease';
    b.style.transform = '';
    setTimeout(() => { b.style.transition = ''; }, 200);
  };
  container.addEventListener('touchstart', (e) => {
    const b = e.target.closest('.pm-bubble');
    if (!b || b.classList.contains('pm-bubble--deleted')) { target = null; return; }
    target = b; longFired = false; lockDir = null;
    const t = e.touches[0]; startX = t.clientX; startY = t.clientY;
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
      target.style.transform = `translateX(${Math.max(0, Math.min(dx, 56))}px)`;
    }
  }, { passive: false });
  container.addEventListener('touchend', (e) => {
    clearLP();
    if (!target) return;
    const b = target; target = null;
    const dx = (e.changedTouches[0] ? e.changedTouches[0].clientX : startX) - startX;
    resetTransform(b);
    if (!longFired && lockDir === 'h' && dx > 45) onAction(b.dataset.msg, 'reply');
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
        </div>
        <div class="pm-threads" id="pm-threads"><div class="pm-loading">Завантаження…</div></div>
      </div>
    `, 'pm-screen--list');

    const threadsEl = api.screen.querySelector('#pm-threads');
    const searchEl  = api.screen.querySelector('#pm-search');
    const chipsEl   = api.screen.querySelector('#pm-chips');

    const [threads, unread] = await Promise.all([fetchMyThreads(me), fetchUnreadByThread(me)]);
    if (api._closed) return;

    // Без жодної розмови — ховаємо пошук+фільтри, лишаємо чистий empty state
    if (!threads.length) {
      api.screen.querySelector('.pm-search').style.display = 'none';
      chipsEl.style.display = 'none';
    }

    let filter = 'all';   // all | unread
    let query  = '';

    const renderThreads = () => {
      const q = query.trim().toLowerCase();
      const list = threads.filter(t => {
        if (filter === 'unread' && !(unread.get(t.id) > 0)) return false;
        if (!q) return true;
        const hay = `${otherName(t)} ${threadPostTitle(t)} ${t.last_message_text || ''}`.toLowerCase();
        return hay.includes(q);
      });
      if (!list.length) {
        threadsEl.innerHTML = !threads.length
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
        return `
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
          </button>`;
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
    threadsEl.addEventListener('click', (e) => {
      const btn = e.target.closest('[data-thread]');
      if (!btn) return;
      const t = threads.find(x => String(x.id) === btn.dataset.thread);
      if (t) openChat(t, t.post);
    });
  });
}

// ── 3. «Мої оголошення» (мої пости + вхідні розмови по кожному) ────────────
export function openMyAds() {
  requireAuth('переглянути ваші оголошення', async () => {
    const me = currentUserId();
    const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <div class="pm-head-titles"><div class="pm-head-name">📋 Мої оголошення</div></div>
      </header>
      <div class="pm-list" id="pm-ads"><div class="pm-loading">Завантаження…</div></div>
    `, 'pm-screen--ads');

    const listEl = api.screen.querySelector('#pm-ads');
    const [posts, threads, unread] = await Promise.all([
      fetchMyPosts(me), fetchMyThreads(me), fetchUnreadByThread(me),
    ]);
    if (api._closed) return;

    if (!posts.length) {
      listEl.innerHTML = `<div class="pm-empty"><span class="pm-empty-ic">📋</span>У вас ще немає оголошень.<br>Подайте перше через кнопку ✏️ на дошці.</div>`;
      return;
    }
    // Треди де я — продавець, згруповані за оголошенням
    const byPost = new Map();
    threads.filter(t => t.author_uid === me).forEach(t => {
      if (!byPost.has(t.post_id)) byPost.set(t.post_id, []);
      byPost.get(t.post_id).push(t);
    });

    const statusLabel = { published: 'опубліковано', pending: 'на перевірці', rejected: 'відхилено' };
    listEl.innerHTML = posts.map(p => {
      const ths = byPost.get(p.id) || [];
      const convos = ths.length ? ths.map(t => {
        const n = unread.get(t.id) || 0;
        const name = t.buyer_name || 'Покупець';
        return `
          <button class="pm-subrow" type="button" data-thread="${t.id}">
            ${avatar(name)}
            <div class="pm-subrow-body">
              <span class="pm-subrow-name">${escapeHtml(name)}</span>
              <span class="pm-subrow-last">${escapeHtml(t.last_message_text || 'Написав(ла) вам')}</span>
            </div>
            ${n > 0 ? `<span class="pm-row-badge">${n}</span>` : ''}
          </button>`;
      }).join('') : '<div class="pm-noconvo">Поки немає звернень</div>';
      const st = statusLabel[p.status] || p.status || '';
      return `
        <div class="pm-ad">
          <div class="pm-ad-head">
            <span class="pm-ad-title">${escapeHtml(p.title || p.text?.slice(0, 50) || 'Оголошення')}</span>
            <span class="pm-ad-status pm-ad-status--${escapeHtml(p.status || '')}">${escapeHtml(st)}</span>
          </div>
          <div class="pm-ad-convos">${convos}</div>
        </div>`;
    }).join('');

    listEl.querySelectorAll('[data-thread]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = threads.find(x => String(x.id) === btn.dataset.thread);
        if (t) openChat(t, t.post);
      });
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
  const chats = (await fetchUnreadByThread(currentUserId())).size;
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
    if (isLoggedIn()) _threadsUnsub = subscribeMyThreads(() => refreshUnreadBadge());
  });
}
