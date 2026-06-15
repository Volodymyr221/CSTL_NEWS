// src/tabs/board.js
// Вкладка «Дошка громади 2.0» — 3 типи постів + пошук + фільтри + реакції + збережені.
//
// Типи постів:
//   board = оголошення (продам/куплю/...) — стікер на корку
//   chat  = обговорення — горизонтальна картка з аватаркою і хештегами

import { escapeHtml, formatTime, sharePost, postTime, showToast, containsProfanity, looksLikeSpam } from '../core/utils.js';
import { openBoardModal } from './community-modal.js';
import {
  fetchPublishedPosts, fetchPublishedAnnouncements, isSupabaseReady,
  getAnonId, fetchAllReactions, setReaction,
  fetchAllComments, addComment,
  subscribeReactions, subscribeComments,
} from '../core/supabase.js';

// ── Конфігурація ─────────────────────────────────────────────────────────────

// SVG-іконки (оголошені до TYPE_TABS — збережені-таб використовує закладку)
const PHONE_ICON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const BOOKMARK_OUTLINE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const BOOKMARK_FILLED_SVG  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const SHARE_ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
const COMMENT_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';

const TYPE_TABS = [
  { id: 'board',   label: 'ДОШКА',        emoji: '🛒' },
  { id: 'saved',   label: 'ЗБЕРЕЖЕНІ',    emoji: BOOKMARK_OUTLINE_SVG },
  { id: 'chat',    label: 'ОБГОВОРЕННЯ',   emoji: '💬' },
];

// Фільтр-чіпи (6 шт): деякі групують ДВІ конкретні категорії через `match`.
// Пост зберігає конкретну категорію (продам/куплю/...), а чіп групує.
const BOARD_CATEGORIES = [
  { id: 'all',        label: 'Всі',                 emoji: '✦',  match: null },
  { id: 'trade',      label: 'Куплю/Продам',        emoji: '🛒', match: ['продам', 'куплю'] },
  { id: 'шукаю',      label: 'Шукаю',               emoji: '🔍', match: ['шукаю'] },
  { id: 'послуга',    label: 'Послуги',             emoji: '🔧', match: ['послуга'] },
  { id: 'lostfound',  label: 'Знайдено/Загубилось', emoji: '🎁', match: ['знайдено', 'загубилось'] },
  { id: 'оголошення', label: 'Оголошення',          emoji: '📢', match: ['оголошення'] },
];

// Окрема явна мапа конкретна-категорія → emoji (для лейбла на стікері).
// Раніше виводилась з BOARD_CATEGORIES, але після групування чіпів
// конкретних категорій там більше нема.
const CATEGORY_EMOJI = {
  'продам':     '💰',
  'куплю':      '🛒',
  'шукаю':      '🔍',
  'знайдено':   '🎁',
  'загубилось': '😟',
  'послуга':    '🔧',
  'оголошення': '📢',
};

const REACTIONS = ['❤️', '👍', '👏', '🔥', '😂', '😮', '😢', '🙏'];

// ── Стан (зберігається в межах сесії) ────────────────────────────────────────

let allPosts       = [];   // [{id, type, ...}]
let allAnnouncements = []; // офіційні з announcements
let activeType     = 'board';
let activeCategory = 'all';
let searchQuery    = '';

// Реакції і коментарі — централізовано у Map<postId, ...>. Завантажується з
// Supabase у renderBoard(), оновлюється при кліках через optimistic update.
let reactionsByPost = new Map();  // postId → { counts: {emoji: count}, my: emoji|null }
let commentsByPost  = new Map();  // postId → [{id, author, text, created_at}]

// ── localStorage: тільки «Збережені» (✅ це per-device, у Supabase не йде) ──

const LS_SAVED = 'cstl-saved-v1';   // [postId, postId, ...]
const LS_MY_COMMENTS = 'cstl-my-comments-v1';  // id повідомлень які я написав (для right-вирівнювання)
const LS_CHAT_SEEN = 'cstl-chat-seen-v1';  // { postId: timestamp останнього перегляду теми (ms) }

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// ── Реакції (з Supabase, fallback на in-memory map) ─────────────────────────

function getMyReaction(postId) {
  const r = reactionsByPost.get(postId);
  return r ? r.my : null;
}
function getReactionCounts(postId) {
  const r = reactionsByPost.get(postId);
  return r ? r.counts : {};
}
function getTotalReactionCount(postId) {
  const counts = getReactionCounts(postId);
  return Object.values(counts).reduce((s, n) => s + n, 0);
}

// ── Коментарі (з Supabase, in-memory map) ───────────────────────────────────

function getComments(postId) {
  return commentsByPost.get(postId) || [];
}

// Чи це моє повідомлення (для right-вирівнювання у чаті). До авторизації —
// позначаємо локально per-device; коли буде Google-логін, замінимо на sender_uid.
function getMyCommentIds() {
  return new Set(lsGet(LS_MY_COMMENTS, []));
}
function addMyCommentId(id) {
  const arr = lsGet(LS_MY_COMMENTS, []);
  if (!arr.includes(id)) { arr.push(id); lsSet(LS_MY_COMMENTS, arr); }
}

// Час останнього перегляду теми (per-device) — для роздільника «Нові повідомлення».
function getChatSeen(postId) {
  const m = lsGet(LS_CHAT_SEEN, {});
  return m[String(postId)] || 0;
}
function setChatSeen(postId, ts) {
  const m = lsGet(LS_CHAT_SEEN, {});
  m[String(postId)] = ts;
  lsSet(LS_CHAT_SEEN, m);
}

// Відмінювання «відповідь» за числом (для підрядка хедера чату)
function replyWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'відповідь';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'відповіді';
  return 'відповідей';
}
// Повна підпис для пігулки «нові повідомлення» (середній рід)
function newMsgLabel(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'нове повідомлення';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'нові повідомлення';
  return 'нових повідомлень';
}

// ── Антиспам/антифлуд для коментарів чату (per-device) ──────────────────────
const LS_MSG_RATE = 'cstl-msg-rate-v1';  // { last: 'текст', times: [ts, ts, ...] }
const FLOOD_MAX = 5;       // максимум повідомлень
const FLOOD_WINDOW = 15000; // за 15 секунд
// Чи це дубль попереднього надісланого повідомлення
function isDuplicateMsg(text) {
  return lsGet(LS_MSG_RATE, {}).last === text;
}
// Чи користувач шле занадто швидко (флуд)
function isFlooding() {
  const now = Date.now();
  const times = (lsGet(LS_MSG_RATE, {}).times || []).filter(t => now - t < FLOOD_WINDOW);
  return times.length >= FLOOD_MAX;
}
// Зафіксувати що повідомлення надіслано (після проходження перевірок)
function recordSentMsg(text) {
  const now = Date.now();
  const st = lsGet(LS_MSG_RATE, {});
  const times = (st.times || []).filter(t => now - t < FLOOD_WINDOW);
  times.push(now);
  lsSet(LS_MSG_RATE, { last: text, times });
}

// Відмінювання слова «повідомлення» за числом (1 / 2-4 / 5+, з урахуванням 11-14)
function msgWord(n) {
  const mod10 = n % 10, mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return 'повідомлення';
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'повідомлення';
  return 'повідомлень';
}
// Відмінювання «учасник» для лічильника унікальних авторів у чаті
function partWord(n) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return 'учасник';
  if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return 'учасники';
  return 'учасників';
}

function getSavedIds() {
  return new Set(lsGet(LS_SAVED, []));
}
function isSaved(postId) {
  return getSavedIds().has(postId);
}
function toggleSaved(postId) {
  const arr = lsGet(LS_SAVED, []);
  const idx = arr.indexOf(postId);
  if (idx >= 0) arr.splice(idx, 1);
  else arr.push(postId);
  lsSet(LS_SAVED, arr);
}

// ── Утиліти ──────────────────────────────────────────────────────────────────

// Аватарка для chat — перша буква імені у кружечку, або emoji 👤 для аноніма
function authorAvatar(author) {
  const a = String(author || '').trim();
  if (!a) return '<span class="bd-avatar bd-avatar--anon">👤</span>';
  const letter = a.charAt(0).toUpperCase();
  const hue = (a.charCodeAt(0) * 47) % 360;
  return `<span class="bd-avatar" style="background:hsl(${hue}deg 65% 78%);color:#fff;font-weight:600">${escapeHtml(letter)}</span>`;
}

// Контакт-картка з кнопкою-іконкою:
//   номер телефону → 📞 Подзвонити (tel:)
//   інший текст → просто текст без кнопки
// (Telegram-кнопку прибрано 13.06 — спонукаємо дзвонити або писати в чаті додатка;
//  приватний чат у додатку — Фаза Б, BOARD_FINAL_PLAN.md)
function renderContact(contact) {
  if (!contact) return '';
  const trimmed = String(contact).trim();
  const isPhone = /^[\+\d][\d\s\-\(\)]{5,}$/.test(trimmed);

  if (isPhone) {
    const tel = trimmed.replace(/[^\d+]/g, '');
    return `
      <div class="cm-board-contact cm-board-contact--phone">
        <span class="cm-board-contact-num">${escapeHtml(trimmed)}</span>
        <a class="cm-board-call" href="tel:${escapeHtml(tel)}" aria-label="Подзвонити ${escapeHtml(trimmed)}">${PHONE_ICON_SVG}</a>
      </div>
    `;
  }

  return `<div class="cm-board-contact">${escapeHtml(trimmed)}</div>`;
}

// ── Реакції + share + bookmark — спільний рядок дій під/над постом ───────────

// ── Рядок дій під карткою — різний для board/chat/greeting ──────────────
//
// BOARD (стікер):
//   - Згорнутий: тільки 🙂+ маленька в лівому нижньому куті
//   - Розгорнутий (zoom-modal): додатково 📑 save + ↗ share
// CHAT (розмова):
//   - 🙂+ + 📑 + ↗ + повноцінне поле введення коментарів (inline)
// GREETING (вітання):
//   - 🙂+ + 📑 + ↗ (без коментарів)

function reactTriggerHtml(post) {
  const myReaction = getMyReaction(post.id);
  const counts    = getReactionCounts(post.id);
  const total     = getTotalReactionCount(post.id);

  // Топ-3 emoji за кількістю натискань усіх юзерів
  const top3 = Object.entries(counts)
    .filter(([, n]) => n > 0)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3);

  let content;
  if (total === 0) {
    // Ніхто ще не реагував — показуємо запрошення
    content = `<span class="bd-react-trigger-default">🙂</span><span class="bd-react-trigger-plus">+</span>`;
  } else {
    // Топ-3 emoji кожна зі своїм лічильником. Моя виділена.
    content = top3.map(([em, n]) => `
      <span class="bd-react-trigger-group${em === myReaction ? ' bd-react-trigger-group--mine' : ''}">
        <span class="bd-react-trigger-emoji">${em}</span>
        <span class="bd-react-trigger-count">${n}</span>
      </span>
    `).join('');
  }

  return `<button class="bd-react-trigger${myReaction ? ' bd-react-trigger--active' : ''}" type="button"
          data-react-trigger="${post.id}" aria-label="Реакції (${total})">${content}</button>`;
}

function saveBtnHtml(post) {
  const saved = isSaved(post.id);
  return `<button class="bd-icon-btn bd-bookmark${saved ? ' bd-bookmark--active' : ''}" type="button"
          data-save-id="${post.id}"
          aria-label="${saved ? 'Прибрати зі збережених' : 'Зберегти у Мої'}">
    ${saved ? BOOKMARK_FILLED_SVG : BOOKMARK_OUTLINE_SVG}
  </button>`;
}

function shareBtnHtml(post) {
  const shareText = buildShareText(post);
  const shareTitle = post.type === 'chat'
    ? 'Обговорення з Дошки громади Олики'
    : 'Оголошення з Дошки громади Олики';
  return `<button class="bd-icon-btn bd-share-btn" type="button"
          data-share-board
          data-share-title="${escapeHtml(shareTitle)}"
          data-share-text="${escapeHtml(shareText)}"
          aria-label="Поділитися">${SHARE_ICON_SVG}</button>`;
}

// BOARD-стікер: тільки реакція. У zoom-modal CSS показує `.bd-actions-extra`
function boardActionsHtml(post) {
  return `
    <div class="bd-actions bd-actions--board-compact">
      ${reactTriggerHtml(post)}
      <div class="bd-actions-extra">
        ${saveBtnHtml(post)}
        ${shareBtnHtml(post)}
      </div>
    </div>
  `;
}

// Стрічка повідомлень чату (бульбашки) — рендериться у повноекранній модалці-чаті.
// Контейнер має data-comments-for щоб realtime/optimistic оновлення його перемальовували.
// Поле вводу — окремо у модалці (поза стрічкою), тому переживає перемальовування.
function chatMessagesHtml(post) {
  const items = getComments(post.id);
  if (!items.length) {
    return `<div class="bd-chat-stream" data-comments-for="${post.id}">
      <div class="bd-chat-empty"><span class="bd-chat-empty-icon">💬</span>Поки порожньо.<br>Напишіть перше повідомлення 👋</div>
    </div>`;
  }
  const myIds = getMyCommentIds();
  // Роздільник «Нові повідомлення» ставимо перед першим повідомленням, новішим за
  // час останнього перегляду — але лише якщо до нього є хоч одне «старе» (щоб не
  // ліпити роздільник на самому верху при першому вході).
  const dividerTs = _chatDividerTs;
  let hadOld = false, dividerPlaced = false;
  // Групуємо підряд повідомлення від одного автора (месенджер-стиль)
  const groups = [];
  items.forEach(c => {
    const isNew = dividerTs > 0 && postTime(c) > dividerTs;
    if (!isNew) hadOld = true;
    const needDivider = isNew && hadOld && !dividerPlaced;
    const mine = myIds.has(c.id);
    const author = c.author || 'Житель';
    const key = mine ? '__me' : author;
    const last = groups[groups.length - 1];
    if (last && last.key === key && !needDivider) last.msgs.push(c);
    else groups.push({ key, mine, author, first: c, msgs: [c], dividerBefore: needDivider });
    if (needDivider) dividerPlaced = true;
  });
  const groupsHtml = groups.map(g => {
    const divider = g.dividerBefore
      ? '<div class="bd-chat-divider" data-chat-divider><span>Нові повідомлення</span></div>'
      : '';
    const bubbles = g.msgs.map(c => `
      <div class="bd-msg-bubble">
        <span class="bd-msg-text">${escapeHtml(c.text)}</span>
        <span class="bd-msg-time">${formatTime(postTime(c))}</span>
      </div>`).join('');
    if (g.mine) {
      return divider + `<div class="bd-msg-group bd-msg-group--mine"><div class="bd-msg-col">${bubbles}</div></div>`;
    }
    return divider + `
      <div class="bd-msg-group bd-msg-group--other">
        ${authorAvatar(g.first.author)}
        <div class="bd-msg-col">
          <span class="bd-msg-name">${escapeHtml(g.author)}</span>
          ${bubbles}
        </div>
      </div>`;
  }).join('');
  return `<div class="bd-chat-stream" data-comments-for="${post.id}">${groupsHtml}</div>`;
}

// Прокрутити стрічку модалки донизу (до найновіших)
function scrollChatToBottom() {
  const body = document.getElementById('bd-chat-modal-body');
  if (body) body.scrollTop = body.scrollHeight;
}

// Чи користувач зараз біля низу стрічки (для розумного автоскролу)
function chatBodyNearBottom() {
  const body = document.getElementById('bd-chat-modal-body');
  if (!body) return true;
  return (body.scrollHeight - body.scrollTop - body.clientHeight) < 80;
}

// При відкритті: якщо є роздільник нових — скролимо до нього, інакше донизу
function scrollChatToNewOrBottom() {
  const body = document.getElementById('bd-chat-modal-body');
  if (!body) return;
  const div = body.querySelector('[data-chat-divider]');
  if (div) {
    body.scrollTop += div.getBoundingClientRect().top - body.getBoundingClientRect().top - 60;
  } else {
    body.scrollTop = body.scrollHeight;
  }
}

// Floating-пігулка «N нових повідомлень»
function showChatPill(n) {
  const pill = _chatModalEl?.querySelector('.bd-chat-newpill');
  if (!pill) return;
  pill.querySelector('.bd-chat-newpill-n').textContent = `${n} ${newMsgLabel(n)}`;
  pill.hidden = false;
}
function hideChatPill() {
  const pill = _chatModalEl?.querySelector('.bd-chat-newpill');
  if (pill) pill.hidden = true;
}

// Оновити лічильник відповідей у шапці відкритої модалки
function updateChatHeaderCount(postId) {
  if (postId !== _chatOpenPostId) return;
  const el = document.getElementById('bd-chat-reply-count');
  if (el) {
    const n = getComments(postId).length;
    el.textContent = `💬 ${n} ${replyWord(n)}`;
  }
}

// ── Повноекранна модалка-чат «Обговорення» ───────────────────────────────────
// Розгортається з картки (scale-морф) поверх затемненого нерухомого фону.
// Закриття: ← назад / ✕ / тап по фону / свайп вниз.
let _chatModalEl = null;
let _chatViewportHandler = null;
let _chatScrollHandler = null;   // слухач скролу стрічки (ховає пігулку біля низу)
let _chatOpenPostId = null;      // id теми відкритої модалки
let _chatDividerTs = 0;          // час останнього перегляду (межа для роздільника «Нові»)
let _chatUnseen = 0;             // лічильник нових поки користувач не біля низу
function onChatEsc(e) { if (e.key === 'Escape') closeChatModal(); }

function openChatModal(post) {
  if (_chatModalEl) return;
  const tagsLine = (post.tags || []).join(' ');
  // Стан модалки — ВАЖЛИВО виставити до chatMessagesHtml (воно читає _chatDividerTs)
  _chatOpenPostId = post.id;
  _chatDividerTs = getChatSeen(post.id);
  _chatUnseen = 0;
  const replyCount = getComments(post.id).length;

  const backdrop = document.createElement('div');
  backdrop.className = 'board-backdrop bd-chat-backdrop';

  const modal = document.createElement('div');
  modal.className = 'bd-chat-modal';
  modal.innerHTML = `
    <div class="bd-chat-modal-handle"></div>
    <header class="bd-chat-modal-head">
      <button class="bd-chat-modal-back" type="button" aria-label="Назад">←</button>
      <div class="bd-chat-modal-titles">
        <div class="bd-chat-modal-title">${escapeHtml(post.text)}</div>
        <div class="bd-chat-modal-meta" id="bd-chat-reply-count">💬 ${replyCount} ${replyWord(replyCount)}</div>
        ${tagsLine ? `<div class="bd-chat-modal-sub">${escapeHtml(tagsLine)}</div>` : ''}
      </div>
      <button class="bd-chat-modal-close" type="button" aria-label="Закрити">✕</button>
    </header>
    <div class="bd-chat-modal-body" id="bd-chat-modal-body">
      ${chatMessagesHtml(post)}
    </div>
    <button class="bd-chat-newpill" type="button" hidden>↓ <span class="bd-chat-newpill-n"></span></button>
    <form class="bd-chat-modal-form" data-comment-form="${post.id}">
      <input class="bd-chat-modal-input" type="text" placeholder="Написати повідомлення…"
             aria-label="Повідомлення" data-comment-input="${post.id}">
      <button class="bd-chat-modal-send" type="submit" aria-label="Надіслати">↑</button>
    </form>
  `;

  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  document.body.classList.add('modal-open');
  _chatModalEl = modal;

  requestAnimationFrame(() => {
    backdrop.classList.add('visible');
    modal.classList.add('visible');
  });
  setTimeout(scrollChatToNewOrBottom, 80);

  backdrop.addEventListener('click', closeChatModal);
  modal.querySelector('.bd-chat-modal-back')?.addEventListener('click', closeChatModal);
  modal.querySelector('.bd-chat-modal-close')?.addEventListener('click', closeChatModal);
  document.addEventListener('keydown', onChatEsc);

  // Скрол стрічки → коли користувач сам долистав до низу, ховаємо пігулку «нові»
  const bodyEl = modal.querySelector('#bd-chat-modal-body');
  _chatScrollHandler = () => { if (chatBodyNearBottom()) { _chatUnseen = 0; hideChatPill(); } };
  bodyEl?.addEventListener('scroll', _chatScrollHandler, { passive: true });
  // Тап по пігулці → стрибок донизу
  modal.querySelector('.bd-chat-newpill')?.addEventListener('click', () => {
    scrollChatToBottom(); _chatUnseen = 0; hideChatPill();
  });
  // Кнопка надсилання не має забирати фокус з поля (інакше iOS ховає клавіатуру)
  modal.querySelector('.bd-chat-modal-send')?.addEventListener('pointerdown', e => e.preventDefault());

  // Клавіатура на iOS PWA шле зливу подій під час анімації — щоб модалка НЕ
  // смикалась, збираємо їх через debounce (один виклик після паузи) → одна
  // плавна анімація у фінальний стан. Слухаємо і window.resize, і visualViewport.
  const vv = window.visualViewport;
  const input = modal.querySelector('.bd-chat-modal-input');
  const fullH = window.innerHeight;   // повна висота ДО клавіатури
  const applyKb = () => {
    const visH = vv ? vv.height : window.innerHeight;
    const open = visH < fullH - 80;   // клавіатура відкрита (видима область помітно менша)
    if (open) {
      // Модалка займає РІВНО видиму область: верх під статус-баром і фіксується,
      // висота динамічно стискається, низ (поле вводу) — над клавіатурою.
      modal.classList.add('bd-chat-modal--kb');
      modal.style.top = (vv ? vv.offsetTop : 0) + 'px';
      modal.style.height = ((vv ? vv.height : window.innerHeight) - 4) + 'px';
      modal.style.bottom = 'auto';
    } else {
      modal.classList.remove('bd-chat-modal--kb');
      modal.style.top = '';
      modal.style.height = '';
      modal.style.bottom = '';
    }
    scrollChatToBottom();
  };
  let kbTimer = null;
  _chatViewportHandler = () => { clearTimeout(kbTimer); kbTimer = setTimeout(applyKb, 80); };
  window.addEventListener('resize', _chatViewportHandler);
  vv?.addEventListener('resize', _chatViewportHandler);
  vv?.addEventListener('scroll', _chatViewportHandler);
  input?.addEventListener('focus', _chatViewportHandler);
  input?.addEventListener('blur',  _chatViewportHandler);

  // Свайп вниз по шапці/ручці → закрити
  let startY = 0, curY = 0, dragging = false;
  const dragZone = modal.querySelector('.bd-chat-modal-head');
  dragZone.addEventListener('touchstart', e => { startY = e.touches[0].clientY; dragging = true; }, { passive: true });
  dragZone.addEventListener('touchmove', e => {
    if (!dragging) return;
    curY = e.touches[0].clientY - startY;
    if (curY > 0) modal.style.transform = `translateX(-50%) translateY(${curY}px)`;
  }, { passive: true });
  dragZone.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    if (curY > 90) closeChatModal();
    else modal.style.transform = '';
    curY = 0;
  });
}

function closeChatModal() {
  if (!_chatModalEl) return;
  const modal = _chatModalEl;
  const backdrop = document.querySelector('.bd-chat-backdrop');
  // Запам'ятати час перегляду теми → наступного разу роздільник «Нові» стане на цій межі
  if (_chatOpenPostId != null) setChatSeen(_chatOpenPostId, Date.now());
  const bodyEl = modal.querySelector('#bd-chat-modal-body');
  if (bodyEl && _chatScrollHandler) bodyEl.removeEventListener('scroll', _chatScrollHandler);
  _chatScrollHandler = null;
  _chatOpenPostId = null;
  _chatDividerTs = 0;
  _chatUnseen = 0;
  _chatModalEl = null;
  modal.classList.remove('visible');
  modal.style.transform = '';
  backdrop?.classList.remove('visible');
  document.body.classList.remove('modal-open');
  document.removeEventListener('keydown', onChatEsc);
  if (_chatViewportHandler) {
    window.removeEventListener('resize', _chatViewportHandler);
    if (window.visualViewport) {
      window.visualViewport.removeEventListener('resize', _chatViewportHandler);
      window.visualViewport.removeEventListener('scroll', _chatViewportHandler);
    }
    _chatViewportHandler = null;
  }
  setTimeout(() => { modal.remove(); backdrop?.remove(); }, 240);
}

// Оновити прев'ю чат-картки у списку (останнє повідомлення + лічильник)
function refreshChatCardPreview(postId) {
  const card = document.querySelector(`.bd-card--chat[data-chat-open="${postId}"]`);
  if (!card) return;
  const post = allPosts.find(p => p.id === postId);
  if (post) card.outerHTML = renderChatCard(post);
}

// Попап вибору реакції — додається у body над кнопкою-тригером
function openReactionPopup(triggerBtn, postId) {
  closeReactionPopup();   // якщо вже відкритий — закрити

  const myReaction = getMyReaction(postId);
  const counts     = getReactionCounts(postId);
  const popup = document.createElement('div');
  popup.className = 'bd-react-popup';
  popup.id = 'bd-react-popup';
  popup.innerHTML = REACTIONS.map(em => {
    const n = counts[em] || 0;
    return `
      <button class="bd-react-opt${myReaction === em ? ' bd-react-opt--active' : ''}" type="button"
              data-react-opt="${escapeHtml(em)}" data-react-post="${postId}">
        <span class="bd-react-opt-emoji">${em}</span>
        ${n > 0 ? `<span class="bd-react-opt-count">${n}</span>` : ''}
      </button>
    `;
  }).join('');

  document.body.appendChild(popup);

  // Позиціонуємо над кнопкою (якщо не влізе — під нею)
  const rect = triggerBtn.getBoundingClientRect();
  const popupRect = popup.getBoundingClientRect();
  let top = rect.top - popupRect.height - 8;
  if (top < 8) top = rect.bottom + 8;
  let left = rect.left + rect.width / 2 - popupRect.width / 2;
  if (left < 8) left = 8;
  if (left + popupRect.width > window.innerWidth - 8) {
    left = window.innerWidth - popupRect.width - 8;
  }
  popup.style.top = `${top + window.scrollY}px`;
  popup.style.left = `${left}px`;

  requestAnimationFrame(() => popup.classList.add('visible'));
}

function closeReactionPopup() {
  const existing = document.getElementById('bd-react-popup');
  if (existing) {
    existing.classList.remove('visible');
    setTimeout(() => existing.remove(), 150);
  }
}

// (модалку коментарів видалено 18.05.2026 — заміщена inline-формою у chat-картках.
//  Board і greeting коментарів не мають за рішенням Вови.)

function buildShareText(post) {
  if (post.type === 'board') {
    const cat = CATEGORY_EMOJI[post.category] || '📌';
    return `${cat} ${post.category}\n\n${post.text}\n— ${post.author || 'анонімно'}`;
  }
  if (post.type === 'chat') {
    const tags = (post.tags || []).join(' ');
    return `${post.text}${tags ? '\n\n' + tags : ''}\n— ${post.author || 'анонімно'}`;
  }
  return post.text || '';
}

// ── Картки за типом ──────────────────────────────────────────────────────────

// BOARD: стікер на корку (як було, з реакціями і ❤️-зберегти)
function renderBoardCard(p) {
  const tilt = ((p.id * 7) % 5) - 2;
  const emoji = CATEGORY_EMOJI[p.category] || '📌';
  const contactHtml = renderContact(p.contact);
  // posts.photos[] (масив у Supabase) АБО p.photo (старі демо-дані з community-board.json)
  const photo = (Array.isArray(p.photos) && p.photos[0]) || p.photo;
  const photoHtml = photo
    ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${escapeHtml(photo)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></div>`
    : '';
  return `
    <article class="cm-board-note bd-card bd-card--board cm-board-note--${escapeHtml(p.color || 'yellow')}${photo ? ' cm-board-note--has-photo' : ''}" style="--tilt:${tilt}deg" data-post-id="${p.id}">
      <span class="cm-board-pin"></span>
      ${photoHtml}
      <span class="cm-board-cat">${emoji} ${escapeHtml(p.category)}</span>
      <p class="cm-board-text">${escapeHtml(p.text)}</p>
      <div class="cm-board-footer">
        <span class="cm-board-author">— ${escapeHtml(p.author || 'анонімно')}</span>
        <span class="cm-board-time">${formatTime(postTime(p))}</span>
      </div>
      ${contactHtml}
      ${boardActionsHtml(p)}
    </article>
  `;
}

// OFFICIAL: офіційне оголошення сільради (для табу «Усі»)
function renderOfficialCard(a) {
  const tilt = ((a.id * 5) % 5) - 2;
  return `
    <article class="cm-board-note bd-card bd-card--official cm-board-note--official" style="--tilt:${tilt}deg">
      <span class="cm-board-pin cm-board-pin--gold"></span>
      <span class="cm-board-cat cm-board-cat--official">🏛️ ОФІЦІЙНО</span>
      <h4 class="cm-board-official-title">${escapeHtml(a.title)}</h4>
      <p class="cm-board-text">${escapeHtml(a.body)}</p>
      <div class="cm-board-footer">
        <span class="cm-board-author">— ${escapeHtml(a.author || '—')}</span>
        <span class="cm-board-time">${formatTime(postTime(a))}</span>
      </div>
    </article>
  `;
}

// CHAT: картка-прев'ю теми обговорення. Тап по картці → повноекранна модалка-чат.
function renderChatCard(p) {
  const tagsHtml = (p.tags || []).length
    ? `<div class="bd-chat-tags">${p.tags.map(t => `<span class="bd-chat-tag">${escapeHtml(t)}</span>`).join(' ')}</div>`
    : '';
  const comments = getComments(p.id);
  const count = comments.length;
  const last = count ? comments[count - 1] : null;
  // Унікальні учасники чату — за іменами авторів повідомлень (анонімні «Житель» зіллються)
  const participants = new Set(comments.map(c => c.author || 'Житель')).size;
  const lastHtml = last
    ? `<div class="bd-chat-last">
         <span class="bd-chat-last-msg"><span class="bd-chat-last-author">${escapeHtml(last.author || 'Житель')}:</span> ${escapeHtml(last.text)}</span>
         <span class="bd-chat-last-time">${formatTime(postTime(last))}</span>
       </div>`
    : '<div class="bd-chat-last bd-chat-last--empty">Ще немає повідомлень — почніть розмову</div>';
  return `
    <article class="bd-card bd-card--chat" data-post-id="${p.id}" data-chat-open="${p.id}">
      <div class="bd-chat-topic">
        <span class="bd-chat-topic-icon">💭</span>
        <p class="bd-chat-text">${escapeHtml(p.text)}</p>
      </div>
      <div class="bd-chat-msgcount">💬 ${count} ${msgWord(count)}</div>
      ${tagsHtml}
      <div class="bd-chat-participants">👥 ${participants} ${partWord(participants)}</div>
      ${lastHtml}
      <div class="bd-chat-foot">
        <div class="bd-chat-by">
          <div class="bd-chat-by-author"><span class="bd-chat-by-label">Автор:</span> ${escapeHtml(p.author || 'Житель')}</div>
          <div class="bd-chat-by-date">${formatTime(postTime(p))}</div>
        </div>
        ${saveBtnHtml(p)}
        <span class="bd-chat-foot-arrow">→</span>
      </div>
    </article>
  `;
}

function renderCard(post) {
  if (post.type === 'chat') return renderChatCard(post);
  return renderBoardCard(post);
}

// ── Фільтрація і пошук ───────────────────────────────────────────────────────

function getFilteredPosts() {
  const q = searchQuery.trim().toLowerCase();
  const savedIds = activeType === 'saved' ? getSavedIds() : null;

  return allPosts.filter(p => {
    // Фільтр по типу
    if (activeType === 'saved') {
      if (!savedIds.has(p.id)) return false;
    } else if (p.type !== activeType) {
      return false;
    }
    // Фільтр по категорії — тільки для board. Чіп може групувати кілька
    // конкретних категорій (напр. «Куплю/Продам» → ['продам','куплю']).
    if (activeType === 'board' && activeCategory !== 'all') {
      const cat = BOARD_CATEGORIES.find(c => c.id === activeCategory);
      if (!cat || !cat.match || !cat.match.includes(p.category)) return false;
    }
    // Пошук — text + tags + author + title
    if (q) {
      const hay = [
        p.text, p.title, p.author,
        ...(p.tags || []),
      ].filter(Boolean).join(' ').toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
}


// ── Рендеринг панелі ─────────────────────────────────────────────────────────

function renderHeader() {
  const tabs = TYPE_TABS.map(t => {
    const isRound = t.id === 'saved';
    return `
      <button class="bd-tab${t.id === activeType ? ' bd-tab--active' : ''}${isRound ? ' bd-tab--round' : ''}" type="button" data-bd-tab="${t.id}">
        <span class="bd-tab-emoji">${t.emoji}</span>
        ${isRound ? '' : `<span class="bd-tab-label">${escapeHtml(t.label)}</span>`}
      </button>
    `;
  }).join('');

  const showCategories = activeType === 'board';
  const chipHtml = c => `
    <button class="bd-cat-chip${c.id === activeCategory ? ' bd-cat-chip--active' : ''}" type="button" data-bd-cat="${c.id}">
      <span class="bd-cat-emoji">${c.emoji}</span>
      ${escapeHtml(c.label)}
    </button>`;
  // «ВСІ» (перша категорія) — закріплена ЗА межами контейнера що скролиться, з відступом.
  // Решта чіпів у .bd-categories — обрізаються його краєм (overflow), тож ховаються повністю.
  const categoriesHtml = showCategories ? `
    <div class="bd-cat-wrap">
      ${chipHtml(BOARD_CATEGORIES[0])}
      <span class="bd-cat-divider" aria-hidden="true"></span>
      <div class="bd-categories">
        ${BOARD_CATEGORIES.slice(1).map(chipHtml).join('')}
      </div>
    </div>
  ` : '';

  return `
    <div class="bd-controls">
      <div class="bd-tabs">${tabs}</div>
      <div class="bd-search">
        <span class="bd-search-icon">🔍</span>
        <input class="bd-search-input" id="bd-search-input" type="search"
               placeholder="${activeType === 'chat' ? 'Пошук в обговореннях...' : activeType === 'saved' ? 'Пошук у збережених...' : 'Пошук по дошці...'}" value="${escapeHtml(searchQuery)}">
        ${searchQuery ? '<button class="bd-search-clear" type="button" id="bd-search-clear">✕</button>' : ''}
      </div>
      ${categoriesHtml}
    </div>
  `;
}

function renderBody() {
  const filtered = getFilteredPosts();

  if (!filtered.length) {
    const msg = activeType === 'saved'
      ? 'У «Збережених» поки нічого. Тапніть закладку на пості щоб зберегти.'
      : searchQuery
      ? `За запитом «${escapeHtml(searchQuery)}» нічого не знайдено`
      : 'У цій категорії поки порожньо';
    return `<div class="bd-empty">${msg}</div>`;
  }

  const sorted = [...filtered].sort((a, b) => {
    const ta = a.ts || (a.published_at && new Date(a.published_at).getTime()) || 0;
    const tb = b.ts || (b.published_at && new Date(b.published_at).getTime()) || 0;
    return tb - ta;
  });

  if (activeType === 'board') {
    const leftCards  = sorted.filter((_, i) => i % 2 === 0).map(renderBoardCard).join('');
    const rightCards = sorted.filter((_, i) => i % 2 === 1).map(renderBoardCard).join('');
    return `
      <div class="board-backdrop" id="board-backdrop"></div>
      <div class="cm-board-corkboard board-corkboard--full">
        <div class="cm-board-col">${leftCards}</div>
        <div class="cm-board-col">${rightCards}</div>
      </div>
    `;
  }

  // chat / saved — вертикальна стрічка карток
  return `<div class="bd-stream">${sorted.map(renderCard).join('')}</div>`;
}

export async function renderBoard() {
  const el = document.getElementById('board-content');
  if (!el) return;

  // 1. Supabase: пости + анонси + реакції + коментарі паралельно
  if (isSupabaseReady()) {
    const anonId = getAnonId();
    const [posts, anns, reactions, comments] = await Promise.all([
      fetchPublishedPosts(),
      fetchPublishedAnnouncements(),
      fetchAllReactions(anonId),
      fetchAllComments(),
    ]);
    if (posts !== null) {
      allPosts         = posts;
      allAnnouncements = anns || [];
      reactionsByPost  = reactions;
      commentsByPost   = comments;
      renderAll(el);
      return;
    }
  }

  // 2. Fallback: JSON (поки БД порожня або немає мережі — показуємо демо-дані)
  try {
    const [boardRes, communityRes] = await Promise.all([
      fetch('./data/community-board.json'),
      fetch('./data/community.json'),
    ]);
    const boardData     = await boardRes.json();
    const communityData = await communityRes.json();
    allPosts         = boardData.posts || [];
    allAnnouncements = communityData.announcements || [];
    reactionsByPost  = new Map();
    commentsByPost   = new Map();
  } catch {
    el.innerHTML = '<div class="empty-state">Дошка тимчасово недоступна</div>';
    return;
  }

  renderAll(el);
}

// Перерендер тільки контейнера дошки (без перезавантаження даних)
function renderAll(el) {
  const savedCatScroll = el.querySelector('.bd-categories')?.scrollLeft ?? 0;
  const hasCork = activeType === 'board';
  el.innerHTML = `
    ${hasCork ? `
      <div class="board-bg" aria-hidden="true"></div>
      <div class="board-vignette board-vignette--top" aria-hidden="true"></div>
      <div class="board-vignette board-vignette--bottom" aria-hidden="true"></div>
    ` : `
      <div class="board-vignette board-vignette--top" aria-hidden="true"></div>
    `}
    ${renderHeader()}
    <div class="bd-body" id="bd-body">${renderBody()}</div>
    <button class="cm-board-trigger board-trigger--fixed" id="board-trigger" type="button">
      <span class="cm-board-trigger-icon">✏️</span>
      <span class="cm-board-trigger-text">Подати оголошення</span>
    </button>
  `;

  el.style.backgroundImage = '';
  el.style.backgroundSize  = '';
  el.style.backgroundPosition = '';

  const catsEl = el.querySelector('.bd-categories');
  if (catsEl) catsEl.scrollLeft = savedCatScroll;

  // Submit-форма
  document.getElementById('board-trigger')?.addEventListener('click', openBoardModal);

  // Пошук
  const searchInput = document.getElementById('bd-search-input');
  if (searchInput) {
    let debounce = null;
    searchInput.addEventListener('input', e => {
      searchQuery = e.target.value;
      clearTimeout(debounce);
      debounce = setTimeout(() => renderBodyOnly(el), 180);
    });
  }
  document.getElementById('bd-search-clear')?.addEventListener('click', () => {
    searchQuery = '';
    renderAll(el);
  });

  // Таби
  el.querySelectorAll('[data-bd-tab]').forEach(btn => {
    btn.addEventListener('click', () => {
      activeType = btn.dataset.bdTab;
      activeCategory = 'all';   // скидаємо категорію при зміні табу
      renderAll(el);
    });
  });

  // Категорії-чіпи (тільки для board)
  el.querySelectorAll('[data-bd-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.bdCat;
      activeCategory = cat;
      renderAll(el);
      // При виборі «ВСІ» — плавно повернути стрічку підкатегорій на початок
      // (renderAll відновив поточну позицію, звідси й стартує анімація скролу до 0).
      if (cat === 'all') {
        el.querySelector('.bd-categories')?.scrollTo({ left: 0, behavior: 'smooth' });
      }
    });
  });

  // Кнопки виклика — окремий handler (capture щоб клік не лизнув на стікер)
  el.querySelectorAll('.cm-board-call').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); }, { capture: true });
  });

  // Zoom-перегляд тільки для board-стікерів
  initBoardNoteExpand(el);
}

function renderBodyOnly(el) {
  const body = document.getElementById('bd-body');
  if (!body) return renderAll(el);
  body.innerHTML = renderBody();
  // Перепідключаємо handlers для cm-board-call всередині нового HTML
  body.querySelectorAll('.cm-board-call').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); }, { capture: true });
  });
  initBoardNoteExpand(el);
}

// Zoom-перегляд стікера через окрему модалку (тільки board)
function initBoardNoteExpand(root) {
  const backdrop = root.querySelector('#board-backdrop');
  if (!backdrop) return;

  let activeNote = null;
  let activeModal = null;
  let isAnimating = false;
  const DURATION = 240;

  const expand = (note) => {
    if (isAnimating || activeNote) return;
    isAnimating = true;

    const modal = document.createElement('article');
    modal.className = note.className + ' cm-board-modal-note';
    modal.innerHTML = note.innerHTML;
    document.body.appendChild(modal);

    modal.querySelectorAll('.cm-board-call').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); }, { capture: true });
    });

    // Свайп вниз → згорнути (зберігаємо центрування translate(-50%,-50%))
    let zStartY = 0, zDrag = false, zDelta = 0;
    modal.addEventListener('touchstart', e => {
      zDrag = modal.scrollTop <= 2;          // тягнемо лише коли прокручено до верху
      if (!zDrag) return;
      zStartY = e.touches[0].clientY;
      zDelta = 0;
      modal.style.transition = 'none';
    }, { passive: true });
    modal.addEventListener('touchmove', e => {
      if (!zDrag) return;
      zDelta = e.touches[0].clientY - zStartY;
      if (zDelta <= 0) { modal.style.transform = 'translate(-50%, -50%) scale(1)'; return; }
      e.preventDefault();
      modal.style.transform = `translate(-50%, calc(-50% + ${zDelta}px)) scale(1)`;
    }, { passive: false });
    modal.addEventListener('touchend', () => {
      if (!zDrag) return;
      zDrag = false;
      modal.style.transition = '';           // повертаємо CSS-перехід
      if (zDelta > 90) {
        collapse();                          // згорнути (fade на місці пальця)
      } else {
        modal.style.transform = '';          // назад у центр через CSS .visible
      }
      zDelta = 0;
    }, { passive: true });

    activeNote = note;
    activeModal = modal;

    note.classList.add('cm-board-note--hidden');

    requestAnimationFrame(() => {
      backdrop.classList.add('visible');
      modal.classList.add('visible');
    });

    setTimeout(() => { isAnimating = false; }, DURATION);
  };

  const collapse = () => {
    if (!activeNote || !activeModal || isAnimating) return;
    isAnimating = true;

    const note = activeNote;
    const modal = activeModal;

    modal.classList.remove('visible');
    backdrop.classList.remove('visible');
    note.classList.remove('cm-board-note--hidden');

    setTimeout(() => {
      modal.remove();
      activeNote = null;
      activeModal = null;
      isAnimating = false;
    }, DURATION);
  };

  // Тільки cm-board-note (стікери) розгортаються — chat/greeting не клонуються
  root.querySelectorAll('.cm-board-note:not(.cm-board-note--official):not(.cm-board-modal-note)').forEach(note => {
    note.addEventListener('click', e => {
      e.stopPropagation();
      if (isAnimating) return;
      if (!activeNote) expand(note);
    });
  });

  backdrop.addEventListener('click', collapse);
}

// ── Document-level listener для реакцій + збережене + share ──────────────────
// Один раз при initBoard. Працює і для оригінальних, і для клонів у zoom-модалці.

let _delegationAttached = false;
function attachBoardDelegation() {
  if (_delegationAttached) return;
  _delegationAttached = true;

  // Submit inline-форми коментаря (chat і greeting картки):
  // 1. Миттєво додаємо у in-memory map і ререндеримо (optimistic)
  // 2. Паралельно POST у Supabase
  // 3. Якщо помилка — повертаємо назад
  document.addEventListener('submit', async e => {
    const form = e.target.closest('[data-comment-form]');
    if (!form) return;
    e.preventDefault();
    e.stopPropagation();
    const postId = Number(form.dataset.commentForm);
    const input  = form.querySelector('[data-comment-input]');
    const text   = (input?.value || '').trim();
    if (!text) { input?.focus(); return; }

    // Фільтр матюків / спаму / флуду — блокуємо ДО відправки
    if (containsProfanity(text)) { showToast('🚫 Повідомлення містить заборонені слова і не надіслане', 4500, 'error'); return; }
    if (looksLikeSpam(text))     { showToast('🚫 Повідомлення схоже на спам і не надіслане', 4000, 'error'); return; }
    if (isDuplicateMsg(text))    { showToast('Ви щойно це написали', 3000); return; }
    if (isFlooding())            { showToast('Занадто швидко — зачекайте кілька секунд', 3500); return; }
    recordSentMsg(text);

    // Optimistic: миттєво у DOM
    const tempComment = {
      id: 'temp-' + Date.now(),
      post_id: postId,
      author: null,
      text,
      created_at: new Date().toISOString(),
    };
    const list = commentsByPost.get(postId) || [];
    list.push(tempComment);
    commentsByPost.set(postId, list);
    addMyCommentId(tempComment.id);
    if (input) input.value = '';
    rerenderCommentsBlock(postId);
    input?.focus();   // лишаємо фокус → клавіатура не ховається після надсилання

    // POST у Supabase
    if (isSupabaseReady()) {
      const result = await addComment(postId, null, text);
      if (!result.ok) {
        // Помилка — забираємо optimistic коментар
        const filtered = (commentsByPost.get(postId) || []).filter(c => c.id !== tempComment.id);
        commentsByPost.set(postId, filtered);
        rerenderCommentsBlock(postId);
        alert('Не вдалося надіслати коментар: ' + result.error);
      } else if (result.comment) {
        // Заміняємо temp-коментар на справжній (з реальним id з БД)
        const updated = (commentsByPost.get(postId) || []).map(c =>
          c.id === tempComment.id ? result.comment : c
        );
        commentsByPost.set(postId, updated);
        addMyCommentId(result.comment.id);
        rerenderCommentsBlock(postId);
      }
    }
  });

  function rerenderCommentsBlock(postId) {
    const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
    if (!wrap) return;
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    wrap.outerHTML = chatMessagesHtml(post);
    // Власне повідомлення — користувач завжди має опинитись внизу
    scrollChatToBottom();
    _chatUnseen = 0; hideChatPill();
    updateChatHeaderCount(postId);
    // Оновити лічильник/прев'ю на картці у списку (якщо вона в DOM)
    refreshChatCardPreview(postId);
  }

  document.addEventListener('click', e => {
    // Тап по картці обговорення → повноекранна модалка-чат
    const chatCard = e.target.closest('[data-chat-open]');
    if (chatCard && !e.target.closest('.bd-chat-modal')
        && !e.target.closest('[data-save-id]') && !e.target.closest('[data-share-board]')) {
      const id = Number(chatCard.dataset.chatOpen);
      const post = allPosts.find(p => p.id === id);
      if (post) openChatModal(post);
      return;
    }

    // Тригер «🙂+» — відкриває попап реакцій
    const trigger = e.target.closest('[data-react-trigger]');
    if (trigger) {
      e.stopPropagation();
      const id = Number(trigger.dataset.reactTrigger);
      const existing = document.getElementById('bd-react-popup');
      if (existing && existing.dataset.forPost == id) {
        closeReactionPopup();
      } else {
        openReactionPopup(trigger, id);
        const p = document.getElementById('bd-react-popup');
        if (p) p.dataset.forPost = id;
      }
      return;
    }

    // Вибір емодзі у попапі
    const opt = e.target.closest('[data-react-opt]');
    if (opt) {
      e.stopPropagation();
      const id = Number(opt.dataset.reactPost);
      const emoji = opt.dataset.reactOpt;
      const current = getMyReaction(id);
      const newReaction = current === emoji ? null : emoji;  // тап на ту саму = знімаємо

      // Optimistic: миттєво оновлюємо in-memory map
      const r = reactionsByPost.get(id) || { counts: {}, my: null };
      // Прибираємо стару реакцію з counts
      if (r.my) r.counts[r.my] = Math.max(0, (r.counts[r.my] || 0) - 1);
      // Додаємо нову (якщо є)
      if (newReaction) r.counts[newReaction] = (r.counts[newReaction] || 0) + 1;
      r.my = newReaction;
      reactionsByPost.set(id, r);

      closeReactionPopup();
      // Оновлюємо тригер на сторінці (і у zoom-модалці якщо відкрита)
      document.querySelectorAll(`[data-react-trigger="${id}"]`).forEach(btn => {
        btn.outerHTML = reactTriggerHtml(allPosts.find(p => p.id === id) || { id });
      });

      // Async POST у Supabase
      if (isSupabaseReady()) {
        setReaction(id, getAnonId(), newReaction).then(result => {
          if (!result.ok) {
            console.warn('[reactions] помилка збереження:', result.error);
            // (UI rollback опускаємо — спам у комюніті не критично)
          }
        });
      }
      return;
    }

    // Усе всередині inline-форми коментарів — не пропускаємо до zoom-модалки
    // (форма має data-comment-form="<id>" і знаходиться у CHAT-картці, не у board)
    if (e.target.closest('[data-comment-form]') || e.target.closest('[data-comment-input]')) {
      e.stopPropagation();
      return;
    }

    // Зберегти / прибрати закладку
    const saveBtn = e.target.closest('[data-save-id]');
    if (saveBtn) {
      e.stopPropagation();
      const id = Number(saveBtn.dataset.saveId);
      toggleSaved(id);
      const nowSaved = isSaved(id);
      saveBtn.innerHTML = nowSaved ? BOOKMARK_FILLED_SVG : BOOKMARK_OUTLINE_SVG;
      saveBtn.classList.toggle('bd-bookmark--active', nowSaved);
      saveBtn.setAttribute('aria-label', nowSaved ? 'Прибрати зі збережених' : 'Зберегти у Мої');
      // Якщо у табі «Мої» прибираємо — перерендерити (картка зникає)
      if (activeType === 'saved' && !nowSaved) {
        const el = document.getElementById('board-content');
        if (el) renderBodyOnly(el);
      }
      return;
    }

    // Share — SVG-кнопка зі стрілкою
    const shareBtn = e.target.closest('[data-share-board]');
    if (shareBtn) {
      e.stopPropagation();
      sharePost({
        title: shareBtn.dataset.shareTitle,
        text:  shareBtn.dataset.shareText,
      });
      return;
    }

    // Клік поза попапом — закрити
    if (document.getElementById('bd-react-popup') && !e.target.closest('.bd-react-popup')) {
      closeReactionPopup();
    }
  }, { capture: true });
}

// Realtime — підписки чіпляємо ОДИН раз при initBoard. При подіях БД
// перерахуємо in-memory map і точково перерендеримо DOM-елементи.

function onReactionRealtimeEvent(payload) {
  // payload.new / payload.old містить рядок (post_id, user_id, emoji)
  const row = payload.new || payload.old;
  if (!row || !row.post_id) return;
  const postId = row.post_id;
  // Найпростіше — повний refetch цього поста для коректних counts/my
  const anonId = getAnonId();
  fetchAllReactions(anonId).then(fresh => {
    // Беремо тільки запис для цього post_id, мерджимо у локальну map
    const r = fresh.get(postId) || { counts: {}, my: null };
    reactionsByPost.set(postId, r);
    // Точково перерендеримо всі тригери цього поста
    document.querySelectorAll(`[data-react-trigger="${postId}"]`).forEach(btn => {
      btn.outerHTML = reactTriggerHtml(allPosts.find(p => p.id === postId) || { id: postId });
    });
  });
}

function onCommentRealtimeEvent(payload) {
  const postId = (payload.new || payload.old || {}).post_id;
  if (!postId) return;
  const prevCount = getComments(postId).length;
  // Просто refetch усіх коментарів і перерендеримо блок
  fetchAllComments().then(fresh => {
    commentsByPost = fresh;
    const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
    if (wrap) {
      const post = allPosts.find(p => p.id === postId);
      if (post) {
        // Розумний автоскрол: фіксуємо позицію ДО перемальовування
        const body = document.getElementById('bd-chat-modal-body');
        const near = chatBodyNearBottom();
        const prevTop = body ? body.scrollTop : 0;
        wrap.outerHTML = chatMessagesHtml(post);
        if (near) {
          scrollChatToBottom();   // користувач унизу — лишаємо його внизу
        } else {
          if (body) body.scrollTop = prevTop;   // читає старі — НЕ збиваємо позицію
          const delta = Math.max(0, getComments(postId).length - prevCount);
          if (delta > 0 && postId === _chatOpenPostId) {
            _chatUnseen += delta;
            showChatPill(_chatUnseen);
          }
        }
        updateChatHeaderCount(postId);
      }
    }
    refreshChatCardPreview(postId);
  });
}

let _realtimeAttached = false;
function attachRealtime() {
  if (_realtimeAttached || !isSupabaseReady()) return;
  _realtimeAttached = true;
  subscribeReactions(onReactionRealtimeEvent);
  subscribeComments(onCommentRealtimeEvent);
}

// Зовнішнє переключення активного типу (для CTA з міні-блока Дошки на Громаді).
// type: 'all' | 'board' | 'chat' | 'greeting' | 'saved'
export function setBoardActiveType(type) {
  if (!type) return;
  activeType = type;
  activeCategory = 'all';
  searchQuery = '';
  const el = document.getElementById('board-content');
  if (el) renderAll(el);
}

export function initBoard() {
  attachBoardDelegation();
  attachRealtime();
  renderBoard();
}
