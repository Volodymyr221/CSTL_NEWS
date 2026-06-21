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
} from './supabase.js';
import { escapeHtml, showToast, formatTime, postTime, containsProfanity } from './utils.js';

// VAPID public key — той самий що для автобусних push (див. buses.js / Edge Function)
const VAPID_PUBLIC_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';

// ── Спільне: повноекранний sheet ─────────────────────────────────────────
let _openScreens = [];   // стек відкритих екранів (для коректного закриття)

function buildScreen(innerHtml, extraClass = '') {
  const backdrop = document.createElement('div');
  backdrop.className = 'pm-backdrop';
  const screen = document.createElement('div');
  screen.className = 'pm-screen ' + extraClass;
  screen.innerHTML = innerHtml;
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

export async function openChat(thread, post) {
  if (!isLoggedIn()) { requireAuth('відкрити чат', () => {}); return; }
  const me = currentUserId();
  const title = post ? (post.title || (post.text ? post.text.slice(0, 60) : 'Оголошення'))
                     : threadPostTitle(thread);
  const partner = otherName(thread);

  const api = buildScreen(`
    <header class="pm-head">
      <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
      <div class="pm-head-titles">
        <div class="pm-head-name">${escapeHtml(partner)}</div>
        <div class="pm-head-sub">${escapeHtml(title)}</div>
      </div>
    </header>
    <div class="pm-stream" id="pm-stream">
      <div class="pm-loading">Завантаження…</div>
    </div>
    <form class="pm-form" id="pm-form">
      <input class="pm-input" id="pm-input" type="text" placeholder="Написати повідомлення…"
             aria-label="Повідомлення" autocomplete="off">
      <button class="pm-send" type="submit" aria-label="Надіслати">↑</button>
    </form>
  `, 'pm-screen--chat');

  const streamEl = api.screen.querySelector('#pm-stream');
  const form     = api.screen.querySelector('#pm-form');
  const input    = api.screen.querySelector('#pm-input');

  let messages = [];
  const renderStream = () => {
    if (!messages.length) {
      streamEl.innerHTML = `<div class="pm-empty"><span class="pm-empty-ic">💬</span>Почніть розмову — напишіть перше повідомлення 👋</div>`;
      return;
    }
    // Групуємо підряд від одного відправника
    const groups = [];
    messages.forEach(m => {
      const mine = m.sender_uid === me;
      const last = groups[groups.length - 1];
      if (last && last.mine === mine) last.msgs.push(m);
      else groups.push({ mine, msgs: [m] });
    });
    streamEl.innerHTML = groups.map(g => {
      const bubbles = g.msgs.map(m => `
        <div class="pm-bubble">
          <span class="pm-bubble-text">${escapeHtml(m.text)}</span>
          <span class="pm-bubble-time">${formatTime(postTime(m))}</span>
        </div>`).join('');
      return `<div class="pm-group ${g.mine ? 'pm-group--mine' : 'pm-group--other'}">${bubbles}</div>`;
    }).join('');
  };
  const scrollBottom = () => { streamEl.scrollTop = streamEl.scrollHeight; };

  // Початкове завантаження
  messages = await fetchMessages(thread.id);
  renderStream();
  setTimeout(scrollBottom, 50);
  // Позначити вхідні прочитаними + оновити бейдж
  markThreadRead(thread.id, me).then(refreshUnreadBadge);

  // Realtime — нові повідомлення треда
  if (_chatUnsub) { try { _chatUnsub(); } catch (_) {} }
  _chatUnsub = subscribeThreadMessages(thread.id, (msg) => {
    if (messages.some(m => m.id === msg.id)) return;   // вже є (мій optimistic)
    messages.push(msg);
    renderStream();
    scrollBottom();
    if (msg.sender_uid !== me) markThreadRead(thread.id, me).then(refreshUnreadBadge);
  });
  api._cleanup.push(() => { if (_chatUnsub) { _chatUnsub(); _chatUnsub = null; } });
  api._cleanup.push(refreshUnreadBadge);

  // Надсилання
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    if (containsProfanity(text)) { showToast('🚫 Повідомлення містить заборонені слова', 3500, 'error'); return; }
    input.value = '';
    // Optimistic
    const temp = { id: 'tmp-' + Date.now(), thread_id: thread.id, sender_uid: me, text, created_at: new Date().toISOString() };
    messages.push(temp);
    renderStream();
    scrollBottom();
    const res = await sendMessage({ threadId: thread.id, senderUid: me, text });
    if (!res.ok) {
      messages = messages.filter(m => m.id !== temp.id);
      renderStream();
      showToast('❌ Не вдалося надіслати: ' + (res.error || ''), 4000, 'error');
      input.value = text;
      return;
    }
    // Заміняємо temp на справжнє (з реальним id) — щоб realtime-дубль не додав другу копію
    const idx = messages.findIndex(m => m.id === temp.id);
    if (idx >= 0 && res.message) messages[idx] = res.message;
    renderStream();
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
      const stream = screen.querySelector('#pm-stream');
      if (stream) stream.scrollTop = stream.scrollHeight;
    } else {
      screen.style.height = '';
      screen.style.top = '';
    }
  };
  let t = null;
  const h = () => { clearTimeout(t); t = setTimeout(apply, 80); };
  vv.addEventListener('resize', h);
  vv.addEventListener('scroll', h);
}

// ── 2. Список «Повідомлення» ──────────────────────────────────────────────
export function openThreadsList() {
  requireAuth('переглянути повідомлення', async () => {
    const me = currentUserId();
    const api = buildScreen(`
      <header class="pm-head pm-head--list">
        <button class="pm-back" type="button" data-pm-back aria-label="Назад">←</button>
        <div class="pm-head-titles"><div class="pm-head-name">💬 Повідомлення</div></div>
      </header>
      <div class="pm-list" id="pm-list"><div class="pm-loading">Завантаження…</div></div>
    `, 'pm-screen--list');

    const listEl = api.screen.querySelector('#pm-list');
    const [threads, unread] = await Promise.all([fetchMyThreads(me), fetchUnreadByThread(me)]);
    if (api._closed) return;

    if (!threads.length) {
      listEl.innerHTML = `<div class="pm-empty"><span class="pm-empty-ic">📭</span>Поки немає розмов.<br>Напишіть продавцю на дошці або зачекайте на відповідь.</div>`;
      return;
    }
    listEl.innerHTML = threads.map(t => {
      const n = unread.get(t.id) || 0;
      const name = otherName(t);
      const preview = t.last_message_text || 'Розмову розпочато';
      return `
        <button class="pm-row" type="button" data-thread="${t.id}">
          ${avatar(name)}
          <div class="pm-row-body">
            <div class="pm-row-top">
              <span class="pm-row-name">${escapeHtml(name)}</span>
              <span class="pm-row-time">${formatTime(new Date(t.last_message_at).getTime())}</span>
            </div>
            <div class="pm-row-post">${escapeHtml(threadPostTitle(t))}</div>
            <div class="pm-row-last">${escapeHtml(preview)}</div>
          </div>
          ${n > 0 ? `<span class="pm-row-badge">${n}</span>` : ''}
        </button>`;
    }).join('');

    listEl.querySelectorAll('[data-thread]').forEach(btn => {
      btn.addEventListener('click', () => {
        const t = threads.find(x => String(x.id) === btn.dataset.thread);
        if (t) openChat(t, t.post);
      });
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
