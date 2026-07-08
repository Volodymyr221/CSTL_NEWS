// src/tabs/board.js
// Вкладка «Дошка громади 2.0» — 3 типи постів + пошук + фільтри + реакції + збережені.
//
// Типи постів:
//   board = оголошення (продам/куплю/...) — стікер на корку
//   chat  = обговорення — горизонтальна картка з аватаркою і хештегами

import { escapeHtml, formatTime, sharePost, postTime, showToast, containsProfanity, looksLikeSpam } from '../core/utils.js';
import { openBoardModal } from './community-modal.js';
import { startChatFromPost, openMyAds, openThreadsList, refreshUnreadBadge } from './board-chat.js';
import { setupBubbleGestures, ACT_ICONS } from '../core/chat-core.js';
import { requireAuth, isLoggedIn, currentUserId, currentUserName, onAuthChange } from '../core/auth.js';
import {
  fetchPublishedPosts, fetchPublishedAnnouncements, isSupabaseReady,
  fetchAllReactions, setReaction,
  fetchAllComments, addComment, editComment, deleteComment,
  subscribeReactions, subscribeComments,
  fetchSavedPostIds, addSavedPost, removeSavedPost,
  submitPost, submitDiscussion,
} from '../core/supabase.js';
import { SETTLEMENTS, COMMUNITY_ALL, COMMUNITY_ALL_LABEL } from '../core/settlements.js';

// Д-10/Д-12: локація вважається «загальногромадською» (видима скрізь) якщо
// порожня/null або дорівнює COMMUNITY_ALL. Конкретний НП — лише свій фільтр.
function isCommunityWide(loc) {
  return !loc || loc === COMMUNITY_ALL;
}

// Українська відміна слова «оголошення» для лічильника (Д-11).
function pluralAds(n) {
  const d = n % 10, dd = n % 100;
  if (d === 1 && dd !== 11) return 'оголошення';
  if (d >= 2 && d <= 4 && (dd < 12 || dd > 14)) return 'оголошення';
  return 'оголошень';
}

// ── Конфігурація ─────────────────────────────────────────────────────────────

// SVG-іконки для дій у картках і кнопках
const PHONE_ICON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';
const BOOKMARK_OUTLINE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const BOOKMARK_FILLED_SVG  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const SHARE_ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';
const COMMENT_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
const MSG_ICON_SVG = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>';
// Векторні іконки для пунктів FAB-меню (у стилі MSG_ICON — лінійні, currentColor)
const EDIT_ICON_SVG  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/></svg>';
const MYADS_ICON_SVG = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="2" width="8" height="4" rx="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="M9 12h6M9 16h6"/></svg>';

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
let activeLocation = COMMUNITY_ALL;   // Д-12: фільтр за НП; дефолт «вся громада» = усі
let searchQuery    = '';

// Реакції і коментарі — централізовано у Map<postId, ...>. Завантажується з
// Supabase у renderBoard(), оновлюється при кліках через optimistic update.
let reactionsByPost = new Map();  // postId → { counts: {emoji: count}, my: emoji|null }
let commentsByPost  = new Map();  // postId → [{id, author, text, created_at}]
let savedIds        = new Set();  // postId закладок ПОТОЧНОГО акаунта (з БД saved_posts)

// ── localStorage (per-device) — лише час перегляду тем; закладки тепер у БД ──

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

// Чи це моє повідомлення (для right-вирівнювання у чаті) — за sender_uid з БД,
// тільки коли залогінений (account-bound, синхрон між пристроями).
function isMyComment(c) {
  const uid = currentUserId();
  return !!uid && c.sender_uid === uid;
}

// Конкретний час HH:MM (як у приватному чаті — замість «2 год тому»).
function clockTime(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}
// Роздільник дня: Сьогодні / Вчора / «20 червня» (як у приватному чаті).
const CHAT_MONTHS_GEN = ['січня','лютого','березня','квітня','травня','червня',
                         'липня','серпня','вересня','жовтня','листопада','грудня'];
function chatDayLabel(ts) {
  const d = new Date(ts);
  if (isNaN(d.getTime())) return '';
  const now = new Date();
  const sToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const day = 86400000;
  if (d.getTime() >= sToday) return 'Сьогодні';
  if (d.getTime() >= sToday - day) return 'Вчора';
  if (d.getFullYear() === now.getFullYear()) return `${d.getDate()} ${CHAT_MONTHS_GEN[d.getMonth()]}`;
  return `${String(d.getDate()).padStart(2,'0')}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getFullYear()).slice(-2)}`;
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

// Закладки тепер у БД per-uid (saved_posts) — синхрон між пристроями.
// savedIds тримаємо в пам'яті (заповнюється у renderBoard з fetchSavedPostIds).
function getSavedIds() {
  return savedIds;
}
function isSaved(postId) {
  return savedIds.has(postId);
}
// Оптимістично оновлюємо пам'ять + пишемо в БД. Гість сюди не доходить (гейт у кліку).
function toggleSaved(postId) {
  const uid = currentUserId();
  if (!uid) return;
  if (savedIds.has(postId)) {
    savedIds.delete(postId);
    removeSavedPost(uid, postId);
  } else {
    savedIds.add(postId);
    addSavedPost(uid, postId);
  }
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
        <div class="cm-board-contact-btns">
          <button class="cm-board-msg-btn" data-open-chat aria-label="Повідомлення">${MSG_ICON_SVG}</button>
          <a class="cm-board-call" href="tel:${escapeHtml(tel)}" aria-label="Подзвонити ${escapeHtml(trimmed)}">${PHONE_ICON_SVG}</a>
        </div>
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
  const byId = new Map(items.map(c => [c.id, c]));
  const dividerTs = _chatDividerTs;
  let hadOld = false, dividerPlaced = false, lastDay = null;

  // Бульбашка у форматі приватного чату: цитата-відповідь + текст + конкретний час;
  // плейсхолдери видаленого/редагованого. data-msg/data-tag — для жестів/меню (UI-B).
  const renderDiscBubble = (c) => {
    if (c.deleted_at) {
      return `<div class="pm-bubble pm-bubble--deleted" data-msg="${c.id}" data-tag="${c.client_tag || ''}"><span class="pm-bubble-text">🗑 Повідомлення видалено</span></div>`;
    }
    const reply = c.reply_to_id ? byId.get(c.reply_to_id) : null;
    const replyHtml = reply
      ? `<span class="pm-quote" data-jump="${reply.id}">${escapeHtml((reply.deleted_at ? 'Видалене повідомлення' : (reply.text || '')).slice(0, 90))}</span>`
      : '';
    const edited = c.edited_at ? '<span class="pm-bubble-edited">змінено</span> ' : '';
    return `<div class="pm-bubble" data-msg="${c.id}" data-tag="${c.client_tag || ''}">${replyHtml}<span class="pm-bubble-text">${escapeHtml(c.text)}</span><span class="pm-bubble-time">${edited}${clockTime(postTime(c))}</span></div>`;
  };

  // Збираємо: роздільники днів (Сьогодні/Вчора) + роздільник «Нові» + групи за автором.
  let html = '';
  let group = null;   // { key, mine, author, bubbles:[] }
  const flush = () => {
    if (!group) return;
    if (group.mine) {
      html += `<div class="pm-group pm-group--mine pm-group--disc">${group.bubbles.join('')}</div>`;
    } else {
      html += `<div class="pm-group pm-group--other pm-group--disc">${authorAvatar(group.author)}<div class="pm-disc-col"><span class="pm-disc-name">${escapeHtml(group.author)}</span>${group.bubbles.join('')}</div></div>`;
    }
    group = null;
  };
  items.forEach(c => {
    const t = postTime(c);
    const day = chatDayLabel(t);
    if (day && day !== lastDay) { flush(); html += `<div class="pm-daysep"><span>${day}</span></div>`; lastDay = day; }
    const isNew = dividerTs > 0 && t > dividerTs;
    if (!isNew) hadOld = true;
    if (isNew && hadOld && !dividerPlaced) {
      flush();
      html += '<div class="bd-chat-divider" data-chat-divider><span>Нові повідомлення</span></div>';
      dividerPlaced = true;
    }
    const mine = isMyComment(c);
    const author = c.author || 'Житель';
    const key = mine ? '__me' : author;
    if (group && group.key === key) group.bubbles.push(renderDiscBubble(c));
    else { flush(); group = { key, mine, author, bubbles: [renderDiscBubble(c)] }; }
  });
  flush();
  return `<div class="bd-chat-stream" data-comments-for="${post.id}">${html}</div>`;
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
    el.textContent = `💬 ${n} ${msgWord(n)}`;
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

// ── ОБГОВОРЕННЯ: створення + кімнати «Мої» / «Збережені» (окремий FAB) ─────────

// Легкий bottom-sheet для дій Обговорень. Повну стандартизацію модалок винесено
// в окремий потік — тут мінімальний власний шелл.
function openDiscSheet(opts) {
  const backdrop = document.createElement('div');
  backdrop.className = 'board-backdrop disc-sheet-backdrop';
  const sheet = document.createElement('div');
  sheet.className = 'disc-sheet';
  sheet.innerHTML = `
    <div class="disc-sheet-handle"></div>
    <header class="disc-sheet-head">
      <div class="disc-sheet-title">${escapeHtml(opts.title)}</div>
      <button class="disc-sheet-close" type="button" aria-label="Закрити">✕</button>
    </header>
    <div class="disc-sheet-body">${opts.bodyHtml}</div>`;
  const close = () => { sheet.remove(); backdrop.remove(); document.body.classList.remove('modal-open'); };
  backdrop.addEventListener('click', close);
  sheet.querySelector('.disc-sheet-close')?.addEventListener('click', close);
  document.body.appendChild(backdrop);
  document.body.appendChild(sheet);
  document.body.classList.add('modal-open');
  if (opts.onMount) opts.onMount(sheet, close);
  return close;
}

// Список обговорень (Мої / Збережені) — реюз renderChatCard; тап відкриває чат
// через наявну делегацію document-рівня ([data-chat-open]).
function openDiscussionList(title, posts) {
  const body = posts.length
    ? posts.map(renderChatCard).join('')
    : '<div class="disc-sheet-empty">Поки порожньо</div>';
  openDiscSheet({ title, bodyHtml: `<div class="disc-sheet-list">${body}</div>` });
}

function openMyDiscussions() {
  const uid = currentUserId();
  const mine = allPosts.filter(p => p.type === 'chat' && p.owner_uid && p.owner_uid === uid);
  openDiscussionList('Мої обговорення', mine);
}

function openSavedDiscussions() {
  const saved = getSavedIds();
  const list = allPosts.filter(p => p.type === 'chat' && saved.has(p.id));
  openDiscussionList('Збережені обговорення', list);
}

// Модалка створення обговорення → submitPost(type:'chat') → на модерацію (як оголошення).
function openDiscussionCompose() {
  const form = `
    <form class="disc-compose" id="disc-compose-form">
      <label class="disc-compose-label" for="disc-compose-topic">Тема обговорення</label>
      <textarea id="disc-compose-topic" class="disc-compose-input" rows="3"
                placeholder="Про що поговоримо? Напр.: Чи потрібен новий майданчик у центрі?" maxlength="300"></textarea>
      <button type="submit" class="disc-compose-submit">Створити</button>
      <p class="disc-compose-note">Зʼявиться одразу. Матюки/образи блокуються автоматично.</p>
    </form>`;
  openDiscSheet({
    title: 'Створити обговорення',
    bodyHtml: form,
    onMount: (sheet, close) => {
      const ta = sheet.querySelector('#disc-compose-topic');
      ta?.focus();
      sheet.querySelector('#disc-compose-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const text = (ta?.value || '').trim();
        if (!text) { showToast('Напишіть тему обговорення', 2500); ta?.focus(); return; }
        if (containsProfanity(text)) { showToast('🚫 Тема містить заборонені слова', 4000, 'error'); return; }
        const btn = sheet.querySelector('.disc-compose-submit');
        if (btn) { btn.disabled = true; btn.textContent = 'Надсилаємо…'; }
        const payload = {
          text,
          author: currentUserName() || 'Житель',
          owner_uid: currentUserId() || null,
          tags: [],
        };
        if (isSupabaseReady()) {
          const res = await submitDiscussion(payload);   // одразу published (без модерації)
          if (!res.ok) {
            if (btn) { btn.disabled = false; btn.textContent = 'Створити'; }
            showToast('Помилка: ' + (res.error || 'не вдалось'), 4000, 'error');
            return;
          }
        }
        close();
        showToast('Обговорення створено!', 3000);
        renderBoard();   // перезавантажити стрічку — нове обговорення одразу видно
      });
    },
  });
}

function openChatModal(post) {
  if (_chatModalEl) return;
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
        <div class="bd-chat-modal-meta" id="bd-chat-reply-count">💬 ${replyCount} ${msgWord(replyCount)}</div>
      </div>
    </header>
    <div class="bd-chat-modal-body" id="bd-chat-modal-body">
      ${chatMessagesHtml(post)}
    </div>
    <button class="bd-chat-newpill" type="button" hidden>↓ <span class="bd-chat-newpill-n"></span></button>
    <button class="pm-scrolldown" id="bd-scrolldown" type="button" aria-label="До останнього повідомлення">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M6 9l6 6 6-6"/></svg>
    </button>
    <div class="pm-composebar" id="bd-compose" hidden>
      <span class="pm-composebar-ic" id="bd-compose-ic">${ACT_ICONS.reply}</span>
      <div class="pm-composebar-body">
        <span class="pm-composebar-title" id="bd-compose-title"></span>
        <span class="pm-composebar-text" id="bd-compose-text"></span>
      </div>
      <button class="pm-composebar-x" type="button" id="bd-compose-x" aria-label="Скасувати">✕</button>
    </div>
    ${isLoggedIn() ? `
    <form class="bd-chat-modal-form" data-comment-form="${post.id}">
      <input class="bd-chat-modal-input" type="text" placeholder="Написати повідомлення…"
             aria-label="Повідомлення" data-comment-input="${post.id}">
      <button class="bd-chat-modal-send" type="submit" aria-label="Надіслати">↑</button>
    </form>` : `
    <button class="bd-chat-login-cta" type="button" id="bd-chat-login">Увійдіть, щоб писати</button>`}
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
  // Гість бачить лише кнопку входу замість поля (читати можна, писати — після входу).
  modal.querySelector('#bd-chat-login')?.addEventListener('click',
    () => requireAuth('писати в обговоренні', () => {}));
  document.addEventListener('keydown', onChatEsc);

  // Скрол стрічки → коли користувач сам долистав до низу, ховаємо пігулку «нові»
  const bodyEl = modal.querySelector('#bd-chat-modal-body');
  const scrollBtn = modal.querySelector('#bd-scrolldown');
  _chatScrollHandler = () => {
    const near = chatBodyNearBottom();
    if (near) { _chatUnseen = 0; hideChatPill(); }
    scrollBtn?.classList.toggle('visible', !near);   // кнопка-скло «вниз» коли прокрутив угору
  };
  bodyEl?.addEventListener('scroll', _chatScrollHandler, { passive: true });
  // Тап по пігулці / кнопці-скло → стрибок донизу
  modal.querySelector('.bd-chat-newpill')?.addEventListener('click', () => {
    scrollChatToBottom(); _chatUnseen = 0; hideChatPill();
  });
  scrollBtn?.addEventListener('click', () => {
    scrollChatToBottom(); _chatUnseen = 0; hideChatPill(); scrollBtn.classList.remove('visible');
  });
  // Кнопка надсилання не має забирати фокус з поля (інакше iOS ховає клавіатуру)
  modal.querySelector('.bd-chat-modal-send')?.addEventListener('pointerdown', e => e.preventDefault());

  // П7: жести над бульбашкою (свайп-вліво → відповідь, довге натискання → меню) +
  // скасування compose-бару + стрибок по цитаті. Делеговано на тіло модалки (переживає
  // перемальовування стрічки).
  _discReplyTo = null; _discEditing = null;
  setupBubbleGestures(bodyEl, onDiscBubbleAction);
  modal.querySelector('#bd-compose-x')?.addEventListener('click', () => {
    const input = modal.querySelector('[data-comment-input]');
    if (_discEditing && input) input.value = '';   // скасування редагування — чистимо поле
    clearDiscCompose();
  });
  bodyEl?.addEventListener('click', (e) => {
    const jump = e.target.closest('[data-jump]');
    if (!jump) return;
    const b = bodyEl.querySelector(`.pm-bubble[data-msg="${jump.dataset.jump}"]`);
    if (b) { b.scrollIntoView({ behavior: 'smooth', block: 'center' }); b.classList.add('pm-bubble--flash'); setTimeout(() => b.classList.remove('pm-bubble--flash'), 1000); }
  });

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

// ── Багатий чат «Обговорень» (П7): перемальовування + reply/edit/delete/меню ──────
function rerenderCommentsBlock(postId) {
  const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
  if (!wrap) return;
  const post = allPosts.find(p => p.id === postId);
  if (!post) return;
  wrap.outerHTML = chatMessagesHtml(post);
  scrollChatToBottom();
  _chatUnseen = 0; hideChatPill();
  updateChatHeaderCount(postId);
  refreshChatCardPreview(postId);
}

let _discReplyTo = null;   // коментар на який відповідаємо
let _discEditing = null;   // коментар який редагуємо

function findDiscComment(id) {
  return (getComments(_chatOpenPostId) || []).find(c => String(c.id) === String(id)) || null;
}
function showDiscCompose(title, text, mode) {
  const bar = document.getElementById('bd-compose'); if (!bar) return;
  const ic = document.getElementById('bd-compose-ic'); if (ic) ic.innerHTML = mode === 'edit' ? ACT_ICONS.edit : ACT_ICONS.reply;
  const t  = document.getElementById('bd-compose-title'); if (t) t.textContent = title;
  const x  = document.getElementById('bd-compose-text');  if (x) x.textContent = (text || '').slice(0, 90);
  bar.hidden = false;
  _chatModalEl?.querySelector('[data-comment-input]')?.focus();
}
function clearDiscCompose() {
  _discReplyTo = null; _discEditing = null;
  const bar = document.getElementById('bd-compose'); if (bar) bar.hidden = true;
}
function startDiscReply(c) {
  _discEditing = null; _discReplyTo = c;
  showDiscCompose('ВІДПОВІДЬ:', c.text || '', 'reply');
}
function startDiscEdit(c) {
  _discReplyTo = null; _discEditing = c;
  showDiscCompose('РЕДАГУВАННЯ:', c.text || '', 'edit');
  const input = _chatModalEl?.querySelector('[data-comment-input]');
  if (input) { input.value = c.text || ''; input.focus(); }
}
function onDiscBubbleAction(id, kind) {
  const c = findDiscComment(id);
  if (!c) return;
  if (kind === 'reply') startDiscReply(c);
  else if (kind === 'menu') openDiscActions(c);
}
function openDiscActions(c) {
  if (c.deleted_at) return;
  const mine = isMyComment(c);
  const sheet = document.createElement('div');
  sheet.className = 'pm-actions-back';
  sheet.innerHTML = `
    <div class="pm-actions">
      <button type="button" data-act="reply"><span class="pm-act-ic">${ACT_ICONS.reply}</span>Відповісти</button>
      ${c.text ? `<button type="button" data-act="copy"><span class="pm-act-ic">${ACT_ICONS.copy}</span>Копіювати</button>` : ''}
      ${mine && c.text ? `<button type="button" data-act="edit"><span class="pm-act-ic">${ACT_ICONS.edit}</span>Редагувати</button>` : ''}
      ${mine ? `<button type="button" data-act="delete" class="pm-actions-danger"><span class="pm-act-ic">${ACT_ICONS.delete}</span>Видалити</button>` : ''}
      <button type="button" data-act="cancel" class="pm-actions-cancel">Скасувати</button>
    </div>`;
  const close = () => sheet.remove();
  sheet.addEventListener('click', async (e) => {
    const b = e.target.closest('[data-act]');
    if (!b) { if (e.target === sheet) close(); return; }
    close();
    const act = b.dataset.act;
    if (act === 'reply') startDiscReply(c);
    else if (act === 'copy') { try { await navigator.clipboard.writeText(c.text || ''); showToast('Скопійовано'); } catch (_) {} }
    else if (act === 'edit') startDiscEdit(c);
    else if (act === 'delete') doDiscDelete(c);
  });
  (_chatModalEl || document.body).appendChild(sheet);
}
async function doDiscDelete(c) {
  const postId = c.post_id;
  const list = commentsByPost.get(postId) || [];
  const idx = list.findIndex(x => x.id === c.id);
  const prev = idx >= 0 ? list[idx] : null;
  if (idx >= 0) {
    list[idx] = { ...list[idx], deleted_at: new Date().toISOString(), text: '' };
    commentsByPost.set(postId, list);
    rerenderCommentsBlock(postId);
  }
  const res = await deleteComment(c.id);
  if (!res.ok) {
    const l = commentsByPost.get(postId) || [];
    const i = l.findIndex(x => x.id === c.id);
    if (i >= 0 && prev) { l[i] = prev; commentsByPost.set(postId, l); rerenderCommentsBlock(postId); }
    showToast('❌ Не вдалося видалити: ' + (res.error || ''), 4000, 'error');
  }
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
  const tilt = 0; // картки рівні (без нахилу) — рішення Вови 20.06
  const emoji = CATEGORY_EMOJI[p.category] || '📌';
  const contact = p.contact ? String(p.contact).trim() : '';
  const isPhone = contact && /^[\+\d][\d\s\-\(\)]{5,}$/.test(contact);
  const tel = isPhone ? contact.replace(/[^\d+]/g, '') : '';
  const photo = (Array.isArray(p.photos) && p.photos[0]) || p.photo;
  const photoHtml = photo
    ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${escapeHtml(photo)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></div>`
    : '';
  return `
    <article class="cm-board-note bd-card bd-card--board cm-board-note--${escapeHtml(p.color || 'yellow')}${photo ? ' cm-board-note--has-photo' : ''}" style="--tilt:${tilt}deg" data-post-id="${p.id}">
      <span class="cm-board-pin"></span>
      ${photoHtml}
      <span class="cm-board-cat">${emoji} ${escapeHtml(p.category)}</span>
      ${p.title ? `<h3 class="cm-board-title">${escapeHtml(p.title)}</h3>` : ''}
      ${!isCommunityWide(p.location) ? `<span class="cm-board-loc">📍 ${escapeHtml(p.location)}</span>` : ''}
      <p class="cm-board-text">${escapeHtml(p.text)}</p>
      ${!isPhone ? `
      <div class="cm-board-footer">
        <span class="cm-board-author">— ${escapeHtml(p.author || 'анонімно')}</span>
        <span class="cm-board-time">${formatTime(postTime(p))}</span>
      </div>` : ''}
      ${isPhone ? `
        <div class="cm-board-contact cm-board-contact--phone">
          <span class="cm-board-contact-num">${escapeHtml(contact)}</span>
          <div class="cm-board-contact-btns">
            <button class="cm-board-msg-btn" data-open-chat aria-label="Повідомлення">${MSG_ICON_SVG}</button>
            <a class="cm-board-call" href="tel:${escapeHtml(tel)}" aria-label="Подзвонити ${escapeHtml(contact)}">${PHONE_ICON_SVG}</a>
          </div>
        </div>
        <div class="cm-board-author-row">
          <span class="cm-board-author cm-board-author--card">— ${escapeHtml(p.author || 'анонімно')}</span>
          <span class="cm-board-time">${formatTime(postTime(p))}</span>
        </div>
      ` : (contact ? `<div class="cm-board-contact">${escapeHtml(contact)}</div>` : '')}
      ${boardActionsHtml(p)}
    </article>
  `;
}

// BOARD: вміст зум-модалки оголошення — будується З ДАНИХ поста (не клон картки).
// Фото flush зверху (без відʼємного margin → не обрізається скролом), нижче —
// прокручуване тіло з категорією, заголовком, повним описом, контактом і діями.
// Дії (реакції/зберегти/шер/контакт) — ті самі хелпери, що й на картці → делеговані
// обробники працюють без змін.
function renderAdModal(p) {
  const emoji = CATEGORY_EMOJI[p.category] || '📌';
  const photos = Array.isArray(p.photos) ? p.photos.filter(Boolean) : (p.photo ? [p.photo] : []);
  const hasPhoto = photos.length > 0;
  const multi = photos.length > 1;
  // Фото фіксованого розміру (4:3) + категорія/заголовок + текст — УСЕ в одному скролі (без JS-стискання).
  // Так скрол ідеально плавний (рідний, без смикань/просвічування/застрягання). Фото гортається разом з текстом.
  const photoHtml = hasPhoto ? `
    <div class="cm-board-modal-photo">
      <div class="cm-board-modal-gallery"${multi ? ' data-multi' : ''}>
        ${photos.map((ph, i) => `<div class="cm-board-modal-slide"><img src="${escapeHtml(ph)}" alt="" data-photo-full="${escapeHtml(ph)}" data-photo-idx="${i}" loading="lazy" onerror="this.closest('.cm-board-modal-slide').style.display='none'"></div>`).join('')}
      </div>
      ${multi ? `<div class="cm-board-modal-dots">${photos.map((_, i) => `<span class="cm-board-modal-dot${i === 0 ? ' active' : ''}"></span>`).join('')}</div>` : ''}
    </div>` : '';
  return `
    <div class="cm-board-modal-bar">
      <span class="cm-board-modal-grip"></span>
    </div>
    <div class="cm-board-modal-scrollarea">
      ${photoHtml}
      <div class="cm-board-modal-subhead">
        <span class="cm-board-cat">${emoji} ${escapeHtml(p.category)}</span>
        ${p.title ? `<h3 class="cm-board-title">${escapeHtml(p.title)}</h3>` : ''}
        ${!isCommunityWide(p.location) ? `<span class="cm-board-loc">📍 ${escapeHtml(p.location)}</span>` : ''}
      </div>
      <div class="cm-board-modal-content">
        <p class="cm-board-text">${escapeHtml(p.text)}</p>
      </div>
    </div>
    <div class="cm-board-modal-foot">
      ${(()=>{
        const contact = p.contact ? String(p.contact).trim() : '';
        const isPhone = contact && /^[\+\d][\d\s\-\(\)]{5,}$/.test(contact);
        const tel = isPhone ? contact.replace(/[^\d+]/g, '') : '';
        if (isPhone) return `
          <div class="cm-board-modal-meta">
            <div class="cm-board-modal-meta-text">
              <span class="cm-board-contact-line"><span class="cm-board-contact-phone">${escapeHtml(contact)}</span><span class="cm-board-contact-name"> — ${escapeHtml(p.author || 'анонімно')}</span></span>
              <span class="cm-board-time">${formatTime(postTime(p))}</span>
            </div>
            <div class="cm-board-modal-meta-btns">
              <button class="cm-board-msg-btn" data-open-chat aria-label="Повідомлення">${MSG_ICON_SVG}</button>
              <a class="cm-board-call" href="tel:${escapeHtml(tel)}" aria-label="Подзвонити">${PHONE_ICON_SVG}</a>
            </div>
          </div>`;
        return `
          <div class="cm-board-footer">
            <span class="cm-board-author">— ${escapeHtml(p.author || 'анонімно')}</span>
            <span class="cm-board-time">${formatTime(postTime(p))}</span>
          </div>
          ${contact ? `<div class="cm-board-contact">${escapeHtml(contact)}</div>` : ''}`;
      })()}
      ${boardActionsHtml(p)}
    </div>
  `;
}

// Повноекранний перегляд фото зі свайпом між кадрами. Відкривається тапом по фото
// в галереї модалки. Закриття: ✕, тап по фону, свайп вниз.
function openPhotoLightbox(photos, startIdx) {
  if (!photos || !photos.length) return;
  const wrap = document.createElement('div');
  wrap.className = 'cm-photo-lightbox';
  wrap.innerHTML = `
    <button class="cm-photo-lightbox-close" type="button" aria-label="Закрити">✕</button>
    <div class="cm-photo-lightbox-track">
      ${photos.map(ph => `<div class="cm-photo-lightbox-slide"><img src="${escapeHtml(ph)}" alt=""></div>`).join('')}
    </div>
    ${photos.length > 1 ? '<div class="cm-photo-lightbox-count"></div>' : ''}`;
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  const track = wrap.querySelector('.cm-photo-lightbox-track');
  const countEl = wrap.querySelector('.cm-photo-lightbox-count');
  const updateCount = () => {
    if (!countEl || !track.clientWidth) return;
    const i = Math.round(track.scrollLeft / track.clientWidth);
    countEl.textContent = `${i + 1} / ${photos.length}`;
  };
  requestAnimationFrame(() => {
    track.scrollLeft = (startIdx || 0) * track.clientWidth;
    updateCount();
    wrap.classList.add('open');
  });
  track.addEventListener('scroll', () => requestAnimationFrame(updateCount), { passive: true });
  const close = () => {
    wrap.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => wrap.remove(), 200);
  };
  wrap.querySelector('.cm-photo-lightbox-close').addEventListener('click', close);
  wrap.addEventListener('click', e => { if (e.target === wrap) close(); });
}


// OFFICIAL: офіційне оголошення сільради (для табу «Усі»)
function renderOfficialCard(a) {
  const tilt = 0; // картки рівні (без нахилу) — рішення Вови 20.06
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
  const comments = getComments(p.id);
  const count = comments.length;
  const recent = comments.slice(-2);   // два останніх повідомлення у прев'ю картки
  // Унікальні учасники чату — за іменами авторів повідомлень (анонімні «Житель» зіллються)
  const participants = new Set(comments.map(c => c.author || 'Житель')).size;
  const lastHtml = recent.length
    ? `<div class="bd-chat-last">${recent.map(m => `
         <div class="bd-chat-last-row">
           <span class="bd-chat-last-msg"><span class="bd-chat-last-author">${escapeHtml(m.author || 'Житель')}:</span> ${escapeHtml(m.text)}</span>
           <span class="bd-chat-last-time">${formatTime(postTime(m))}</span>
         </div>`).join('')}</div>`
    : '<div class="bd-chat-last bd-chat-last--empty">Ще немає повідомлень — почніть розмову</div>';
  return `
    <article class="bd-card bd-card--chat" data-post-id="${p.id}" data-chat-open="${p.id}">
      <div class="bd-chat-topic">
        <p class="bd-chat-text">${escapeHtml(p.text)}</p>
      </div>
      <div class="bd-chat-msgcount">💬 ${count} ${msgWord(count)}</div>
      ${lastHtml}
      <div class="bd-chat-foot">
        <span class="bd-chat-count">👥 ${participants}</span>
        <div class="bd-chat-by">
          <div class="bd-chat-by-author"><span class="bd-chat-by-label">Автор:</span> ${escapeHtml(p.author || 'Житель')}</div>
          <div class="bd-chat-by-date">${formatTime(postTime(p))}</div>
        </div>
        ${saveBtnHtml(p)}
      </div>
    </article>
  `;
}

function renderCard(post) {
  if (post.type === 'chat') return renderChatCard(post);
  return renderBoardCard(post);
}

// FAB — ДВІ незалежні кнопки: Дошка (оголошення) і Обговорення (свій набір дій).
// Спільна лише speed-dial-механіка (id board-fab/board-trigger + клас .open),
// щоб toggleFab/closeFab працювали. Розмітка/меню/іконка — різні за вкладкою.
function renderFab() {
  if (discOpen) {
    // Обговорення: червоний круг з білим плюсом + своє меню.
    return `
    <div class="board-fab" id="board-fab">
      <div class="board-fab-backdrop" id="board-fab-backdrop" aria-hidden="true"></div>
      <div class="board-fab-menu" id="board-fab-menu">
        <button class="board-fab-item" data-fab="disc-create" type="button">
          <span class="board-fab-label">Створити обговорення</span>
          <span class="board-fab-ic">${EDIT_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="disc-mine" type="button">
          <span class="board-fab-label">Мої обговорення</span>
          <span class="board-fab-ic">${MYADS_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="disc-saved" type="button">
          <span class="board-fab-label">Збережені</span>
          <span class="board-fab-ic">${BOOKMARK_OUTLINE_SVG}</span>
        </button>
      </div>
      <button class="cm-board-trigger board-trigger--fixed disc-fab-plus" id="board-trigger" type="button" aria-label="Обговорення" aria-expanded="false">
        <span class="cm-board-trigger-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg></span>
        <span class="cm-board-trigger-close" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>
      </button>
    </div>`;
  }
  // Дошка (без змін — оголошення/мої/повідомлення/збережені).
  return `
    <div class="board-fab" id="board-fab">
      <div class="board-fab-backdrop" id="board-fab-backdrop" aria-hidden="true"></div>
      <div class="board-fab-menu" id="board-fab-menu">
        <button class="board-fab-item" data-fab="post" type="button">
          <span class="board-fab-label">Подати оголошення</span>
          <span class="board-fab-ic">${EDIT_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="mine" type="button">
          <span class="board-fab-label">Мої оголошення</span>
          <span class="board-fab-ic">${MYADS_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="messages" type="button">
          <span class="board-fab-label">Повідомлення<span class="board-fab-msgs-badge" id="board-fab-msgs-badge"></span></span>
          <span class="board-fab-ic">${MSG_ICON_SVG}</span>
        </button>
        <button class="board-fab-item" data-fab="saved" type="button">
          <span class="board-fab-label">Збережені</span>
          <span class="board-fab-ic">${BOOKMARK_OUTLINE_SVG}</span>
        </button>
      </div>
      <button class="cm-board-trigger board-trigger--fixed" id="board-trigger" type="button" aria-label="Дії" aria-expanded="false">
        <span class="cm-board-trigger-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg></span>
        <span class="cm-board-trigger-close" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg></span>
        <span class="cm-board-trigger-text">Подати оголошення</span>
        <span class="board-trigger-badge" id="board-trigger-badge"></span>
      </button>
    </div>`;
}

// ── Фільтрація і пошук ───────────────────────────────────────────────────────

function getFilteredPosts() {
  const q = searchQuery.trim().toLowerCase();
  const savedIds = activeType === 'saved' ? getSavedIds() : null;

  return allPosts.filter(p => {
    // Фільтр по типу
    if (activeType === 'saved') {
      // Таб «Збережені» ДОШКИ = лише оголошення: збережені ОБГОВОРЕННЯ мають
      // свою кімнату на вкладці Обговорення (розділення — рішення Роми 08.07).
      if (!savedIds.has(p.id) || p.type === 'chat') return false;
    } else if (p.type !== activeType) {
      return false;
    }
    // Фільтр по категорії — тільки для board. Чіп може групувати кілька
    // конкретних категорій (напр. «Куплю/Продам» → ['продам','куплю']).
    if (activeType === 'board' && activeCategory !== 'all') {
      const cat = BOARD_CATEGORIES.find(c => c.id === activeCategory);
      if (!cat || !cat.match || !cat.match.includes(p.category)) return false;
    }
    // Фільтр по локації (Д-12) — тільки board. Конкретний НП показує свої пости
    // + загальногромадські (COMMUNITY_ALL/порожні/старі) — вони релевантні скрізь.
    if (activeType === 'board' && activeLocation !== COMMUNITY_ALL) {
      if (p.location !== activeLocation && !isCommunityWide(p.location)) return false;
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
  // Перемикач Дошка|Обговорення прибрано (Етап 1 крок 2b): Дошка = чистий маркетплейс.
  // «Обговорення» відкриваються з вкладки «Чати» (режим activeType='chat') і мають
  // власну шапку з кнопкою «← назад» (веде у вкладку Чати). «Збережені» — з FAB-підменю.
  // Обговорення — головна сторінка вкладки, тому кнопки «← назад» НЕМА (нікуди виходити).
  const discHead = activeType === 'chat'
    ? `<div class="bd-disc-head">
         <span class="bd-disc-title">📢 Обговорення</span>
       </div>`
    : '';

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

  // Д-11 + Д-12: шапка Дошки — заголовок по центру; під ним рядок:
  // лічильник (зліва) + тонкий фільтр локації (справа). Лічильник рахує
  // поточний відфільтрований список.
  const count = showCategories ? getFilteredPosts().length : 0;
  const titlebarHtml = showCategories ? `
    <div class="bd-titlebar">
      <h2 class="bd-title">Дошка оголошень</h2>
      <div class="bd-subrow">
        <div class="bd-loc-filter">
          <span class="bd-loc-icon" aria-hidden="true">📍</span>
          <select class="bd-loc-select" id="bd-loc-select" aria-label="Фільтр за населеним пунктом">
            <option value="${escapeHtml(COMMUNITY_ALL)}"${activeLocation === COMMUNITY_ALL ? ' selected' : ''}>${escapeHtml(COMMUNITY_ALL_LABEL)}</option>
            ${SETTLEMENTS.map(s => `<option value="${escapeHtml(s)}"${activeLocation === s ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}
          </select>
        </div>
        <span class="bd-count" id="bd-count">${count} ${pluralAds(count)}</span>
      </div>
    </div>
  ` : '';

  return `
    <div class="bd-controls">
      ${discHead}
      ${titlebarHtml}
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

// Оновити лічильник оголошень у шапці без повного ре-рендеру (Д-11).
// Викликається після фільтрів (пошук/локація), коли header не перебудовується.
function updateAdCount() {
  const el = document.getElementById('bd-count');
  if (!el || activeType !== 'board') return;
  const n = getFilteredPosts().length;
  el.textContent = `${n} ${pluralAds(n)}`;
}

function renderBody() {
  const filtered = getFilteredPosts();

  if (!filtered.length) {
    const msg = activeType === 'saved'
      ? 'У «Збережених» поки нічого. Натисніть закладку на пості щоб зберегти.'
      : searchQuery
      ? `За запитом «${escapeHtml(searchQuery)}» нічого не знайдено`
      : 'У цій категорії поки порожньо';
    return `<div class="bd-empty">${msg}</div>`;
  }

  // Порядок: спершу bumped_at (підняте власником угору), далі ts/published_at.
  const rankTs = (x) =>
    (x.bumped_at && new Date(x.bumped_at).getTime()) ||
    x.ts || (x.published_at && new Date(x.published_at).getTime()) || 0;
  const sorted = [...filtered].sort((a, b) => rankTs(b) - rankTs(a));

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

  // chat / saved — вертикальна стрічка карток.
  // #board-backdrop рендеримо і тут, щоб у «Збережених» працювала зум-модалка
  // оголошення (initBoardNoteExpand виходить рано, якщо backdrop відсутній).
  return `
    <div class="board-backdrop" id="board-backdrop"></div>
    <div class="bd-stream">${sorted.map(renderCard).join('')}</div>`;
}

export async function renderBoard() {
  const el = getBoardRoot();
  if (!el) return;

  // 1. Supabase: пости + анонси + реакції + коментарі + закладки паралельно
  if (isSupabaseReady()) {
    // «Моя» реакція/закладка — лише для залогіненого акаунта (uid). Гість → нічого
    // персонального; старі анонімні реакції лишаються видимими як публічні лічильники.
    const uid = currentUserId();
    const [posts, anns, reactions, comments, saved] = await Promise.all([
      fetchPublishedPosts(),
      fetchPublishedAnnouncements(),
      fetchAllReactions(uid),
      fetchAllComments(),
      uid ? fetchSavedPostIds(uid) : Promise.resolve(new Set()),
    ]);
    if (posts !== null) {
      allPosts         = posts;
      allAnnouncements = anns || [];
      reactionsByPost  = reactions;
      commentsByPost   = comments;
      savedIds         = saved;
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

// Перерендер тільки контейнера дошки (без перезавантаження даних).
// Корінь (#board-content / #disc-content) визначається getBoardRoot() за станом overlay.
function renderAll() {
  const el = getBoardRoot();
  if (!el) return;
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
    ${renderFab()}
  `;

  el.style.backgroundImage = '';
  el.style.backgroundSize  = '';
  el.style.backgroundPosition = '';

  const catsEl = el.querySelector('.bd-categories');
  if (catsEl) catsEl.scrollLeft = savedCatScroll;

  // FAB-підменю (speed-dial): тап по кнопці розкриває дії; повторний/фон — закриває.
  const fab     = document.getElementById('board-fab');
  const fabBtn  = document.getElementById('board-trigger');
  const fabBack = document.getElementById('board-fab-backdrop');
  const closeFab = () => {
    if (!fab) return;
    fab.classList.remove('open');
    fabBtn?.setAttribute('aria-expanded', 'false');
  };
  const toggleFab = () => {
    if (!fab) return;
    const open = fab.classList.toggle('open');
    fabBtn?.setAttribute('aria-expanded', open ? 'true' : 'false');
  };
  fabBtn?.addEventListener('click', toggleFab);
  fabBack?.addEventListener('click', closeFab);
  refreshUnreadBadge();   // заповнити бейдж непрочитаних на свіжому FAB (після рендеру Дошки)
  fab?.querySelectorAll('.board-fab-item').forEach(item => {
    item.addEventListener('click', () => {
      const act = item.dataset.fab;
      closeFab();
      // ── Дії ОБГОВОРЕНЬ (окремий FAB, лише коли discOpen) ──
      if (act === 'disc-create') { requireAuth('створити обговорення', openDiscussionCompose); return; }
      if (act === 'disc-mine')   { requireAuth('мої обговорення', openMyDiscussions); return; }
      if (act === 'disc-saved')  { requireAuth('збережені обговорення', openSavedDiscussions); return; }
      // ── Дії ДОШКИ ──
      // Усі три дії — лише для залогінених (Етап 2). Гостю requireAuth()
      // покаже тост і запропонує увійти (подія cstl-need-login → екран входу).
      if (act === 'post') { requireAuth('подати оголошення', openBoardModal); return; }
      if (act === 'saved') { requireAuth('переглянути збережені', () => {
        // «Збережені» — маркетплейс-таб на сторінці Дошки. З overlay Обговорень
        // виходимо у Дошку; інакше перемикаємось у тип на місці.
        if (discOpen) { closeDiscussions(); window.switchTab('board'); }
        setBoardActiveType('saved');
      }); return; }
      if (act === 'messages') { openThreadsList(); return; }   // requireAuth усередині
      if (act === 'mine') openMyAds();        // requireAuth усередині openMyAds
    });
  });

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


  // Фільтр за локацією (Д-12) — dropdown, тільки для board
  document.getElementById('bd-loc-select')?.addEventListener('change', e => {
    activeLocation = e.target.value;
    renderBodyOnly(el);
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

function renderBodyOnly() {
  const el = getBoardRoot();
  if (!el) return;
  const body = document.getElementById('bd-body');
  if (!body) return renderAll();
  body.innerHTML = renderBody();
  updateAdCount();   // Д-11: лічильник у шапці синхронний з відфільтрованим списком
  // Перепідключаємо handlers для cm-board-call всередині нового HTML
  body.querySelectorAll('.cm-board-call').forEach(btn => {
    btn.addEventListener('click', e => { e.stopPropagation(); }, { capture: true });
  });
  initBoardNoteExpand(el);
}

// Zoom-перегляд стікера через окрему модалку (тільки board)
let _boardCollapseRef = null;   // покажчик на актуальний collapse (оновлюється при кожному init)
let _boardTabHookSet = false;   // слухач зміни вкладки вішаємо лише раз
// Відкрити модалку оголошення ПОЗА Дошкою (напр. з приватного чату), без картки-джерела.
// Самодостатня: власна підкладка + той самий renderAdModal + галерея + свайп-закрити.
// z-index інлайном вище за чат (.pm-screen=2401), щоб лягти ПОВЕРХ нього.
// Дротування дзеркалить expand() (свідоме дрібне дублювання — щоб не чіпати робочу Дошку).
function openAdModalStandalone(post) {
  if (!post) return;
  const backdrop = document.createElement('div');
  backdrop.className = 'board-backdrop';
  backdrop.style.zIndex = '2599';
  const modal = document.createElement('article');
  modal.className = 'cm-board-note cm-board-modal-note cm-board-modal--sheet';
  modal.style.zIndex = '2600';
  if (post.id != null) modal.dataset.postId = post.id;
  modal.innerHTML = renderAdModal(post);
  document.body.appendChild(backdrop);
  document.body.appendChild(modal);
  document.body.classList.add('cm-zoom-open');

  let closed = false;
  const close = () => {
    if (closed) return;
    closed = true;
    modal.classList.remove('visible');
    backdrop.classList.remove('visible');
    document.body.classList.remove('cm-zoom-open');
    setTimeout(() => { modal.remove(); backdrop.remove(); }, 240);
  };
  backdrop.addEventListener('click', close);

  // Галерея фото: тап → повний екран; крапки оновлюються при свайпі
  const gallery = modal.querySelector('.cm-board-modal-gallery');
  if (gallery) {
    const photoUrls = [...gallery.querySelectorAll('[data-photo-full]')].map(im => im.dataset.photoFull);
    gallery.querySelectorAll('img[data-photo-idx]').forEach(im => {
      im.addEventListener('click', e => { e.stopPropagation(); openPhotoLightbox(photoUrls, Number(im.dataset.photoIdx) || 0); });
    });
    const dots = modal.querySelectorAll('.cm-board-modal-dot');
    if (dots.length) {
      gallery.addEventListener('scroll', () => {
        const i = gallery.clientWidth ? Math.round(gallery.scrollLeft / gallery.clientWidth) : 0;
        dots.forEach((d, di) => d.classList.toggle('active', di === i));
      }, { passive: true });
    }
  }

  // Свайп вниз → закрити (грип або скролер угорі); горизонталь = свайп галереї
  const area = modal.querySelector('.cm-board-modal-scrollarea');
  const scroller = area || modal;
  const grip = modal.querySelector('.cm-board-modal-bar');
  let sY = 0, sX = 0, canSwipe = false, swiping = false;
  modal.addEventListener('touchstart', e => {
    const onGrip = grip && (e.target === grip || grip.contains(e.target));
    canSwipe = onGrip || scroller.scrollTop <= 2;
    sY = e.touches[0].clientY; sX = e.touches[0].clientX; swiping = false;
    if (canSwipe) modal.style.transition = 'none';
  }, { passive: true });
  modal.addEventListener('touchmove', e => {
    if (!canSwipe) return;
    const dy = e.touches[0].clientY - sY;
    const dx = e.touches[0].clientX - sX;
    if (!swiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) { canSwipe = false; return; }
    if (dy > 0) { e.preventDefault(); swiping = true; modal.style.transform = `translate(-50%, calc(-50% + ${dy}px)) scale(1)`; }
    else if (swiping) { modal.style.transform = 'translate(-50%, -50%) scale(1)'; }
  }, { passive: false });
  modal.addEventListener('touchend', e => {
    if (!canSwipe) return;
    modal.style.transition = '';
    const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : sY) - sY;
    if (swiping && dy > 90) close(); else modal.style.transform = '';
    swiping = false; canSwipe = false;
  }, { passive: true });

  requestAnimationFrame(() => { backdrop.classList.add('visible'); modal.classList.add('visible'); });
}

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
    // Будуємо модалку З ДАНИХ поста (а не клон HTML картки) — фото flush зверху,
    // повний текст, чорний колір, без обрізки фото скролом. Fallback на клон якщо
    // пост раптом не знайдено (officials виключені, тож для оголошень не трапляється).
    const post = allPosts.find(x => String(x.id) === note.dataset.postId);
    if (note.dataset.postId) modal.dataset.postId = note.dataset.postId;  // для кнопки «Повідомлення»
    modal.innerHTML = post
      ? renderAdModal(post)
      : `<div class="cm-board-modal-scrollarea"><div class="cm-board-modal-content">${note.innerHTML}</div></div>`;
    document.body.appendChild(modal);
    document.body.classList.add('cm-zoom-open');   // блокуємо скрол фону (.app-main)

    modal.querySelectorAll('.cm-board-call').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); }, { capture: true });
    });

    // Галерея фото: тап по фото → повноекранний перегляд; крапки+лічильник оновлюються при свайпі
    const gallery = modal.querySelector('.cm-board-modal-gallery');
    if (gallery) {
      const photoUrls = [...gallery.querySelectorAll('[data-photo-full]')].map(im => im.dataset.photoFull);
      gallery.querySelectorAll('img[data-photo-idx]').forEach(im => {
        im.addEventListener('click', e => {
          e.stopPropagation();
          openPhotoLightbox(photoUrls, Number(im.dataset.photoIdx) || 0);
        });
      });
      const dots = modal.querySelectorAll('.cm-board-modal-dot');
      if (dots.length) {
        gallery.addEventListener('scroll', () => {
          const i = gallery.clientWidth ? Math.round(gallery.scrollLeft / gallery.clientWidth) : 0;
          dots.forEach((d, di) => d.classList.toggle('active', di === i));
        }, { passive: true });
      }
    }

    const area = modal.querySelector('.cm-board-modal-scrollarea');

    // Свайп вниз → закрити (перевірений патерн як у модалці статей: рішення на touchstart).
    // Дозволяємо коли жест почався НА СМУЖЦІ-РУЧЦІ (.cm-board-modal-bar) — працює ЗАВЖДИ, навіть
    // коли опис прокручено; АБО коли скролер угорі (scrollTop<=2). Горизонталь = свайп галереї.
    const scroller = area || modal;
    const grip = modal.querySelector('.cm-board-modal-bar');
    let sY = 0, sX = 0, canSwipe = false, swiping = false;
    modal.addEventListener('touchstart', e => {
      const onGrip = grip && (e.target === grip || grip.contains(e.target));
      canSwipe = onGrip || scroller.scrollTop <= 2;
      sY = e.touches[0].clientY;
      sX = e.touches[0].clientX;
      swiping = false;
      if (canSwipe) modal.style.transition = 'none';
    }, { passive: true });
    modal.addEventListener('touchmove', e => {
      if (!canSwipe) return;
      const dy = e.touches[0].clientY - sY;
      const dx = e.touches[0].clientX - sX;
      // Перший рух горизонтальний → це свайп галереї, не закриття
      if (!swiping && Math.abs(dx) > Math.abs(dy) && Math.abs(dx) > 10) { canSwipe = false; return; }
      if (dy > 0) {
        e.preventDefault();
        swiping = true;
        modal.style.transform = `translate(-50%, calc(-50% + ${dy}px)) scale(1)`;
      } else if (swiping) {
        modal.style.transform = 'translate(-50%, -50%) scale(1)';
      }
    }, { passive: false });
    modal.addEventListener('touchend', e => {
      if (!canSwipe) return;
      modal.style.transition = '';
      const dy = (e.changedTouches[0] ? e.changedTouches[0].clientY : sY) - sY;
      if (swiping && dy > 90) collapse();
      else modal.style.transform = '';
      swiping = false; canSwipe = false;
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
    document.body.classList.remove('cm-zoom-open');   // розблоковуємо скрол фону

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

  // Перемикання на будь-яку іншу вкладку меню → закрити модалку (вона лише для Дошки).
  _boardCollapseRef = collapse;
  if (!_boardTabHookSet) {
    _boardTabHookSet = true;
    window.addEventListener('cstl-tab-changed', () => { if (_boardCollapseRef) _boardCollapseRef(); });
  }
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

    // Гейтинг (Етап 2): коментувати можуть лише залогінені жителі.
    if (!isLoggedIn()) { requireAuth('залишити коментар', () => {}); return; }

    // Фільтр матюків / спаму / флуду — блокуємо ДО відправки
    if (containsProfanity(text)) { showToast('🚫 Повідомлення містить заборонені слова і не надіслане', 4500, 'error'); return; }
    if (looksLikeSpam(text))     { showToast('🚫 Повідомлення схоже на спам і не надіслане', 4000, 'error'); return; }
    if (isDuplicateMsg(text))    { showToast('Ви щойно це написали', 3000); return; }
    if (isFlooding())            { showToast('Занадто швидко — зачекайте кілька секунд', 3500); return; }
    recordSentMsg(text);

    // П7 — режим РЕДАГУВАННЯ: міняємо існуючий коментар (оптимістично + відкат)
    if (_discEditing && _discEditing.post_id === postId) {
      const target = _discEditing;
      const l0 = commentsByPost.get(postId) || [];
      const i0 = l0.findIndex(c => c.id === target.id);
      const prev0 = i0 >= 0 ? l0[i0] : null;
      if (i0 >= 0) { l0[i0] = { ...l0[i0], text, edited_at: new Date().toISOString() }; commentsByPost.set(postId, l0); }
      if (input) input.value = '';
      clearDiscCompose();
      rerenderCommentsBlock(postId);
      const res = await editComment(target.id, text);
      if (!res.ok) {
        const l = commentsByPost.get(postId) || []; const i = l.findIndex(c => c.id === target.id);
        if (i >= 0 && prev0) { l[i] = prev0; commentsByPost.set(postId, l); rerenderCommentsBlock(postId); }
        showToast('❌ Не вдалося змінити: ' + (res.error || ''), 4000, 'error');
      } else if (res.comment) {
        const l = commentsByPost.get(postId) || []; const i = l.findIndex(c => c.id === target.id);
        if (i >= 0) { l[i] = res.comment; commentsByPost.set(postId, l); rerenderCommentsBlock(postId); }
      }
      return;
    }

    // Відповідь (П7): на яке повідомлення відповідаємо (якщо активний reply-режим)
    const replyId = (_discReplyTo && _discReplyTo.post_id === postId) ? _discReplyTo.id : null;

    // Optimistic: миттєво у DOM
    const myName = currentUserName();
    const tempComment = {
      id: 'temp-' + Date.now(),
      post_id: postId,
      author: myName,
      text,
      created_at: new Date().toISOString(),
      sender_uid: currentUserId(),   // → isMyComment() підсвітить як мій одразу
      reply_to_id: replyId,
    };
    const list = commentsByPost.get(postId) || [];
    list.push(tempComment);
    commentsByPost.set(postId, list);
    if (input) input.value = '';
    clearDiscCompose();
    rerenderCommentsBlock(postId);
    input?.focus();   // лишаємо фокус → клавіатура не ховається після надсилання

    // POST у Supabase
    if (isSupabaseReady()) {
      const result = await addComment(postId, myName, text, currentUserId(), { replyToId: replyId });
      if (!result.ok) {
        // Помилка — забираємо optimistic коментар
        const filtered = (commentsByPost.get(postId) || []).filter(c => c.id !== tempComment.id);
        commentsByPost.set(postId, filtered);
        rerenderCommentsBlock(postId);
        showToast('❌ Не вдалося надіслати повідомлення. Спробуйте ще раз.', 4000, 'error');
      } else if (result.comment) {
        // Заміняємо temp-коментар на справжній (з реальним id з БД)
        const updated = (commentsByPost.get(postId) || []).map(c =>
          c.id === tempComment.id ? result.comment : c
        );
        commentsByPost.set(postId, updated);
        rerenderCommentsBlock(postId);
      }
    }
  });

  // rerenderCommentsBlock винесено на module-рівень (нижче) — щоб меню дій/видалення
  // над повідомленням (теж module-рівень) могли його викликати.

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

    // Кнопка «Повідомлення» 💬 — приватний чат з автором оголошення
    const msgBtn = e.target.closest('[data-open-chat]');
    if (msgBtn) {
      e.stopPropagation();
      const holder = msgBtn.closest('[data-post-id]');
      const id = holder ? Number(holder.dataset.postId) : null;
      const post = id != null ? allPosts.find(p => p.id === id) : null;
      if (post) startChatFromPost(post);
      else showToast('Не вдалося відкрити чат', 2500);
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
      // Гейтинг (Етап 2): реагувати можуть лише залогінені жителі.
      if (!isLoggedIn()) { closeReactionPopup(); requireAuth('реагувати', () => {}); return; }
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
        setReaction(id, currentUserId(), newReaction).then(result => {
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
      // Гейтинг (Етап 2): зберігати у «Мої» (закладки) — лише залогінені.
      if (!isLoggedIn()) { requireAuth('зберігати оголошення', () => {}); return; }
      const id = Number(saveBtn.dataset.saveId);
      toggleSaved(id);
      const nowSaved = isSaved(id);
      saveBtn.innerHTML = nowSaved ? BOOKMARK_FILLED_SVG : BOOKMARK_OUTLINE_SVG;
      saveBtn.classList.toggle('bd-bookmark--active', nowSaved);
      saveBtn.setAttribute('aria-label', nowSaved ? 'Прибрати зі збережених' : 'Зберегти у Мої');
      // Якщо у табі «Мої» прибираємо — закрити відкриту зум-модалку (клік по backdrop
      // → collapse) і перерендерити стрічку (картка зникає)
      if (activeType === 'saved' && !nowSaved) {
        document.querySelector('#board-backdrop.visible')?.click();
        renderBodyOnly();
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
  fetchAllReactions(currentUserId()).then(fresh => {
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

// ── «Обговорення» як повноекранний overlay поверх вкладки «Чати» (варіант Б) ──
// Той самий рушій board.js (картки/реакції/коментарі/realtime) рендериться у
// #disc-content замість сторінки Дошки. Таб-бар лишається на «Чати».
let discOpen = false;

// Корінь рендера Дошки: відкритий overlay → #disc-content, інакше → #board-content.
// Щоб не було ДУБЛІВ id (bd-body/board-fab/...) — контент тримаємо лише в одному
// корені за раз (openDiscussions чистить board-content, closeDiscussions відновлює).
function getBoardRoot() {
  return discOpen
    ? document.getElementById('disc-content')
    : document.getElementById('board-content');
}

// Обговорення тепер СПРАВЖНЯ сторінка (#page-discussions .page) — її показує/ховає
// window.switchTab('discussions'). Ці дві функції лише РЕНДЕРЯТЬ контент у потрібний
// корінь; викликаються слухачем cstl-tab-changed при вході/виході на вкладку.
// (Повне розчеплення стану/id від Дошки — Потік 2.)
export function openDiscussions() {
  // Прибрати контент Дошки, поки активні Обговорення (спільні id #board-* — Потік 2).
  const boardEl = document.getElementById('board-content');
  if (boardEl) boardEl.innerHTML = '';
  discOpen = true;
  activeType = 'chat';
  activeCategory = 'all';
  searchQuery = '';
  // Дані вже в пам'яті (initBoard→renderBoard при старті) — рендеримо миттєво.
  if (allPosts && allPosts.length) renderAll();
  else renderBoard();
}

export function closeDiscussions() {
  discOpen = false;
  activeType = 'board';
  activeCategory = 'all';
  searchQuery = '';
  // Очистити #disc-content (спільні id з Дошкою) СИНХРОННО, потім відновити Дошку
  // в #board-content. Порядок важливий — жодного вікна з дубль-id (лікує F1 на закритті).
  const c = document.getElementById('disc-content');
  if (c) c.innerHTML = '';
  renderAll();
}

// Зовнішнє переключення активного типу (для CTA з міні-блока Дошки на Громаді).
// type: 'all' | 'board' | 'chat' | 'greeting' | 'saved'
export function setBoardActiveType(type) {
  if (!type) return;
  if (type === 'chat') { window.switchTab('discussions'); return; }   // Обговорення → вкладка
  activeType = type;
  activeCategory = 'all';
  searchQuery = '';
  renderAll();
}

// Відкрити чат обговорення за id поста — для хаба «Збережені» в шапці.
// Якщо дошка ще не рендерилась (allPosts порожній) — спершу тягнемо дані.
export async function openChatById(postId) {
  if (!allPosts.length) { try { await renderBoard(); } catch (_) { /* fail-soft */ } }
  const post = allPosts.find(p => p.id === postId);
  if (post) openChatModal(post);
}

// Авто-ховання шапки Дошки при скролі. Слухач на .app-main (справжній скролер),
// rAF-throttle (як hero-blur у community.js). Ховаємо назву+категорії лише коли
// прогорнули «через деякий час» (THRESHOLD) і напрямок — вниз; вгору → показуємо.
let _headerCollapseWired = false;
function setupHeaderCollapse() {
  if (_headerCollapseWired) return;
  const main = document.querySelector('.app-main');
  if (!main) return;
  _headerCollapseWired = true;
  const THRESHOLD = 90;   // «через деякий час» — до цього шапка завжди повна
  const DELTA = 6;        // анти-джитер: реагуємо лише на помітний рух
  let lastY = main.scrollTop;
  let ticking = false;
  const apply = () => {
    ticking = false;
    if (main.dataset.tab !== 'board') return;   // тільки вкладка Дошка
    const controls = getBoardRoot()?.querySelector('.bd-controls');
    if (!controls) return;
    const y = main.scrollTop;
    if (y <= THRESHOLD) {
      controls.classList.remove('bd-controls--collapsed');   // біля верху — повна
      lastY = y;
    } else if (y > lastY + DELTA) {
      controls.classList.add('bd-controls--collapsed');      // вниз — ховаємо
      lastY = y;
    } else if (y < lastY - DELTA) {
      controls.classList.remove('bd-controls--collapsed');   // вгору — показуємо
      lastY = y;
    }
  };
  main.addEventListener('scroll', () => {
    if (!ticking) { ticking = true; requestAnimationFrame(apply); }
  }, { passive: true });
}

export function initBoard() {
  attachBoardDelegation();
  attachRealtime();
  renderBoard();
  // Відкрити модалку оголошення з чату («Переглянути оголошення →» в розмові)
  window.addEventListener('cstl-open-ad', (e) => {
    const p = e.detail && e.detail.post;
    if (p) openAdModalStandalone(p);
  });
  // Зміна статусу власних постів («Мої оголошення»: завершити/повернути/видалити)
  // → одразу перезавантажуємо дошку, щоб зміна була видима без перезапуску застосунку.
  window.addEventListener('cstl-posts-changed', () => renderBoard());
  // Обговорення — справжня сторінка: рендеримо її контент при ВХОДІ на вкладку
  // і відновлюємо Дошку при ВИХОДІ (board.js поки рендерить обидві; розділ — Потік 2).
  window.addEventListener('cstl-tab-changed', () => {
    const tab = document.querySelector('.app-main')?.dataset.tab;
    if (tab === 'discussions' && !discOpen) openDiscussions();
    else if (tab !== 'discussions' && discOpen) closeDiscussions();
    // Д-12: фільтр локації скидається на «Уся громада» при кожному вході на Дошку.
    if (tab === 'board' && activeLocation !== COMMUNITY_ALL) {
      activeLocation = COMMUNITY_ALL;
      renderAll();
    }
  });
  // Авто-ховання шапки при скролі Дошки (гортаєш вниз — ховаються назва+категорії;
  // вгору — з'являються). Лічильник/локація + пошук лишаються закріпленими.
  setupHeaderCollapse();
  // Вхід/вихід → перезавантажити дошку: закладки, підсвітку «моє», таб «Збережені».
  onAuthChange(() => {
    if (!isLoggedIn()) {
      savedIds = new Set();
      if (activeType === 'saved') activeType = 'board';   // персональний таб зник
    }
    renderBoard();
    // Відкрита модалка чату рендерить низ (форма/кнопка входу) один раз при відкритті.
    // Гість натиснув «Увійдіть, щоб писати» → увійшов → перезбираємо модалку,
    // щоб зʼявилось поле вводу (інакше кнопка-глухий кут лишалась назавжди).
    if (_chatOpenPostId != null) {
      const post = allPosts.find(p => p.id === _chatOpenPostId);
      closeChatModal();
      if (post) openChatModal(post);
    }
  });
}
