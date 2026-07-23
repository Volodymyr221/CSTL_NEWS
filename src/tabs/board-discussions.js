// src/tabs/board-discussions.js
// ДВИГУН «ОБГОВОРЕНЬ» (груповий чат тем, type:'chat') — винесено з board.js
// (Потік 10, Д-5, 12.07). Тут: картка теми (renderChatCard), повноекранна
// модалка-чат (openChatModal), лайки ❤️, коментарі (optimistic + realtime),
// bottom-sheets «Мої / Збережені / Створити обговорення».
//
// АРХІТЕКТУРА (проти циклічного імпорту — TDZ-баг такого роду вже був у
// openDiscSheet, Потік C2): цей файл НЕ імпортує з board.js. Зв'язок:
//   • дані Дошки (allPosts) — через initDiscussionsEngine({ getPosts })
//     (ін'єкція з initBoard, board.js лишається власником стану);
//   • коментарі/лайки — setDiscussionsData() з renderBoard();
//   • «перезавантаж дошку» після створення обговорення — подія
//     'cstl-posts-changed' (initBoard вже слухає), НЕ прямий renderBoard();
//   • закладки (savedIds) — спільний core/board-shared.js.
// board.js імпортує ЗВІДСИ (один напрямок): renderChatCard, openChatModal,
// FAB-дії, handleLikeClick, attach*-ініціалізатори, handleDiscussionsAuthChange.

import { escapeHtml, formatTime, postTime, showToast, containsProfanity, looksLikeSpam, avatarCircle, autoGrowTextarea } from '../core/utils.js';
import { requireAuth, isLoggedIn, currentUserId, currentUserName } from '../core/auth.js';
import {
  isSupabaseReady,
  fetchAllComments, addComment, editComment, deleteComment,
  subscribeComments,
  fetchAllReactions, setReaction, subscribeReactions, getAnonId,
  submitDiscussion, cachedAvatar, hydrateAvatars, hydrateNames, nameUid, liveName,
} from '../core/supabase.js';
import { setupBubbleGestures, ACT_ICONS } from '../core/chat-core.js';
import { openModal as openModalPrimitive } from '../core/modal.js';
import { ICONS } from '../core/icons.js';
import { getSavedIds, saveBtnHtml } from '../core/board-shared.js';

// ── Доступ до постів Дошки (ін'єкція з board.js — стан лишається там) ────────
let _getPosts = () => [];
export function initDiscussionsEngine({ getPosts }) {
  if (getPosts) _getPosts = getPosts;
}

// ── Іконки (лише обговорення) ────────────────────────────────────────────────
const COMMENT_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.38 8.38 0 0 1-.9 3.8 8.5 8.5 0 0 1-7.6 4.7 8.38 8.38 0 0 1-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 0 1-.9-3.8 8.5 8.5 0 0 1 4.7-7.6 8.38 8.38 0 0 1 3.8-.9h.5a8.48 8.48 0 0 1 8 8v.5z"/></svg>';
// Векторні іконки Обговорень (заміна емодзі 💬/👥/📢) — той самий лінійний стиль.
const USERS_ICON_SVG = ICONS.users; // дедуп — раніше локальна копія (розійшлась товщиною лінії з messages-ui.js/admin.html)
const HEART_OUTLINE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';
const HEART_FILLED_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.6l-1-1a5.5 5.5 0 0 0-7.8 7.8l1 1L12 21l7.8-7.6 1-1a5.5 5.5 0 0 0 0-7.8z"/></svg>';

// ── Стан (зберігається в межах сесії) ────────────────────────────────────────

// Коментарі — централізовано у Map<postId, ...>. Завантажується з Supabase у
// renderBoard() (board.js) через setDiscussionsData, оновлюється при кліках
// через optimistic update.
let commentsByPost  = new Map();  // postId → [{id, author, text, created_at}]

// Лайки Обговорень (Д-задача 3) — реюз наявного дата-шару reactions (setReaction/
// fetchAllReactions/subscribeReactions у supabase.js), той самий що раніше живив
// реакції оголошень (прибрані з Дошки 11.07, Д-13) — тут інша концепція: одна
// емоція ❤️ = «лайк» теми обговорення, не набір реакцій.
const LIKE_EMOJI = '❤️';
let reactionsByPost = new Map();  // postId → { counts:{emoji:count}, my: emoji|null }

// Заповнення стану з renderBoard() (board.js). reactions опційний — fallback-шлях
// (JSON без БД) скидає лише коментарі, як і до розділення файлів.
export function setDiscussionsData(comments, reactions) {
  if (comments)  commentsByPost  = comments;
  if (reactions) reactionsByPost = reactions;
}

function getLikeCount(postId) {
  return reactionsByPost.get(postId)?.counts?.[LIKE_EMOJI] || 0;
}
function isLikedByMe(postId) {
  return reactionsByPost.get(postId)?.my === LIKE_EMOJI;
}
function likeBtnInner(postId) {
  const liked = isLikedByMe(postId);
  return `${liked ? HEART_FILLED_SVG : HEART_OUTLINE_SVG} <span class="bd-chat-like-count">${getLikeCount(postId)}</span>`;
}

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

// ── Коментарі (з Supabase, in-memory map) ───────────────────────────────────

function getComments(postId) {
  return commentsByPost.get(postId) || [];
}
// Невидалені повідомлення (для лічильників/прев'ю/учасників) — видалені не рахуємо.
function activeComments(postId) {
  return getComments(postId).filter(c => !c.deleted_at);
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

// ── Утиліти ──────────────────────────────────────────────────────────────────

// Аватарка автора в обговоренні: фото профілю (крос-юзер, по uid) або перша
// літера імені / 👤 для аноніма. Потік 12 Б: делегуємо у спільний avatarCircle;
// uid → data-av-uid, hydrateAvatars підмінить літеру на фото коли підтягнеться.
function authorAvatar(author, uid) {
  return avatarCircle({ name: author, url: cachedAvatar(uid), uid: uid || '', cls: 'bd-avatar' });
}

// Стрічка повідомлень чату (бульбашки) — рендериться у повноекранній модалці-чаті.
// Контейнер має data-comments-for щоб realtime/optimistic оновлення його перемальовували.
// Поле вводу — окремо у модалці (поза стрічкою), тому переживає перемальовування.
function chatMessagesHtml(post) {
  const all = getComments(post.id);
  // Видалені повідомлення прибираємо повністю (як Telegram) — без плашки-сліду.
  // byId будуємо з УСІХ (разом із видаленими), щоб цитата-відповідь на видалене
  // могла показати «Видалене повідомлення».
  const items = all.filter(c => !c.deleted_at);
  if (!items.length) {
    return `<div class="bd-chat-stream" data-comments-for="${post.id}">
      <div class="bd-chat-empty"><span class="bd-chat-empty-icon">${COMMENT_ICON_SVG}</span>Поки порожньо.<br>Напишіть перше повідомлення</div>
    </div>`;
  }
  const byId = new Map(all.map(c => [c.id, c]));
  const dividerTs = _chatDividerTs;
  let hadOld = false, dividerPlaced = false, lastDay = null;

  // Бульбашка у форматі приватного чату: цитата-відповідь + текст + конкретний час;
  // плейсхолдери видаленого/редагованого. data-msg/data-tag — для жестів/меню (UI-B).
  const renderDiscBubble = (c) => {
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
      html += `<div class="pm-group pm-group--other pm-group--disc">${authorAvatar(group.author, group.uid)}<div class="pm-disc-col"><span class="pm-disc-name"${nameUid(group.uid)}>${liveName(group.author, group.uid)}</span>${group.bubbles.join('')}</div></div>`;
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
    // Групуємо за uid (не за іменем) — той самий акаунт зі зміненим іменем не
    // розривається на дві групи; анонім (без uid) — за іменем як раніше.
    const key = mine ? '__me' : (c.sender_uid || author);
    if (group && group.key === key) group.bubbles.push(renderDiscBubble(c));
    else { flush(); group = { key, mine, author, uid: c.sender_uid || '', bubbles: [renderDiscBubble(c)] }; }
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
    const n = activeComments(postId).length;
    el.innerHTML = `${COMMENT_ICON_SVG} ${n} ${msgWord(n)}`;
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

// Легкий bottom-sheet для дій Обговорень — тонка обгортка над спільним примітивом
// core/modal.js (Потік C2). Сигнатура (opts.title/bodyHtml/onMount(sheet,close), повертає
// close) лишена незмінною — 4 виклики нижче не чіпав.
function openDiscSheet(opts) {
  const bodyHtml = `<div class="disc-sheet-title">${escapeHtml(opts.title)}</div>${opts.bodyHtml}`;
  // onMount виконується СИНХРОННО всередині openModalPrimitive(), до завершення
  // деструктуризації нижче — пряме читання `close` тут ловить temporal dead zone.
  // Обгортка-стрілка відкладає читання до реального виклику (завжди пізніше, асинхронно).
  let close;
  ({ close } = openModalPrimitive({
    bodyHtml,
    variant: 'sheet',
    className: 'app-modal--disc',
    onMount: (wrap) => opts.onMount?.(wrap, () => close()),
    onClose: opts.onClose,
  }));
  return close;
}

// Клавіатура на iOS PWA (аркуш «Створити обговорення») — той самий debounce-патерн,
// що й applyKb у openChatModal: слухаємо visualViewport, при відкритій клавіатурі
// стискаємо .app-modal (position:fixed;inset:0) під видиму область, щоб форма
// лишалась над клавіатурою, а не переставала бути видною знизу. Повертає cleanup.
function attachSheetKeyboardFix(wrap, input) {
  const vv = window.visualViewport;
  const fullH = window.innerHeight;
  const applyKb = () => {
    const visH = vv ? vv.height : window.innerHeight;
    const open = visH < fullH - 80;
    if (open) {
      wrap.style.top = (vv ? vv.offsetTop : 0) + 'px';
      wrap.style.height = (vv ? vv.height : window.innerHeight) + 'px';
      wrap.style.bottom = 'auto';
    } else {
      wrap.style.top = '';
      wrap.style.height = '';
      wrap.style.bottom = '';
    }
  };
  let kbTimer = null;
  const handler = () => { clearTimeout(kbTimer); kbTimer = setTimeout(applyKb, 80); };
  window.addEventListener('resize', handler);
  vv?.addEventListener('resize', handler);
  vv?.addEventListener('scroll', handler);
  input?.addEventListener('focus', handler);
  input?.addEventListener('blur', handler);
  return () => {
    clearTimeout(kbTimer);
    window.removeEventListener('resize', handler);
    vv?.removeEventListener('resize', handler);
    vv?.removeEventListener('scroll', handler);
    input?.removeEventListener('focus', handler);
    input?.removeEventListener('blur', handler);
  };
}

// Список обговорень (Мої / Збережені) — реюз renderChatCard; тап відкриває чат
// через наявну делегацію document-рівня ([data-chat-open]).
function openDiscussionList(title, posts) {
  const body = posts.length
    ? posts.map(renderChatCard).join('')
    : '<div class="disc-sheet-empty">Поки порожньо</div>';
  openDiscSheet({ title, bodyHtml: `<div class="disc-sheet-list">${body}</div>` });
}

export function openMyDiscussions() {
  const uid = currentUserId();
  const mine = _getPosts().filter(p => p.type === 'chat' && p.owner_uid && p.owner_uid === uid);
  openDiscussionList('Мої обговорення', mine);
}

export function openSavedDiscussions() {
  const saved = getSavedIds();
  const list = _getPosts().filter(p => p.type === 'chat' && saved.has(p.id));
  openDiscussionList('Збережені обговорення', list);
}

// Модалка створення обговорення → submitDiscussion → одразу published.
export function openDiscussionCompose() {
  const form = `
    <form class="disc-compose" id="disc-compose-form">
      <label class="disc-compose-label" for="disc-compose-topic">Тема обговорення</label>
      <textarea id="disc-compose-topic" class="disc-compose-input" rows="3"
                placeholder="Про що поговоримо? Напр.: Чи потрібен новий майданчик у центрі?" maxlength="300"></textarea>
      <button type="submit" class="disc-compose-submit">Створити</button>
      <p class="disc-compose-note">Зʼявиться одразу. Матюки/образи блокуються автоматично.</p>
    </form>`;
  let detachKb = null;
  openDiscSheet({
    title: 'Створити обговорення',
    bodyHtml: form,
    // Автофокус прибрано (клавіатура раніше вилітала одразу, поки аркуш ще не
    // доїхав знизу, і перекривала форму) — клавіатура тепер лише по тапу в поле.
    // detachKb — зсуває аркуш над клавіатурою, коли вона таки відкриється.
    onMount: (sheet, close) => {
      const ta = sheet.querySelector('#disc-compose-topic');
      autoGrowTextarea(ta);   // поле теми росте по тексту (скрол — сам лист)
      detachKb = attachSheetKeyboardFix(sheet, ta);
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
        // Перезавантажити стрічку (нове обговорення одразу видно) — через подію,
        // initBoard (board.js) її вже слухає → renderBoard(). Прямий виклик
        // renderBoard() звідси створив би циклічний імпорт board.js↔цей файл.
        window.dispatchEvent(new CustomEvent('cstl-posts-changed'));
      });
    },
    onClose: () => { detachKb?.(); detachKb = null; },
  });
}

export function openChatModal(post) {
  if (_chatModalEl) return;
  // Стан модалки — ВАЖЛИВО виставити до chatMessagesHtml (воно читає _chatDividerTs)
  _chatOpenPostId = post.id;
  _chatDividerTs = getChatSeen(post.id);
  _chatUnseen = 0;
  const replyCount = activeComments(post.id).length;

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
        <div class="bd-chat-modal-meta" id="bd-chat-reply-count">${COMMENT_ICON_SVG} ${replyCount} ${msgWord(replyCount)}</div>
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
  hydrateAvatars(modal.querySelector('[data-comments-for]'));   // Потік 12 Б: підтягнути чужі фото
  hydrateNames(modal.querySelector('[data-comments-for]'));     // синк живих імен профілю за uid

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

  // Свайп вниз по шапці/ручці → закрити. Модалка МУСИТЬ їхати рівно за пальцем.
  // Дьоргання (Вова 14.07): у .bd-chat-modal є transition:transform 0.26s, тому
  // кожен touchmove анімувався із затримкою → модалка «наздоганяла» палець ривками.
  // Фікс: на час drag transition:none + оновлення transform у requestAnimationFrame
  // (translate3d = GPU, без layout-thrash); на відпусканні transition повертаємо,
  // тож пружний повернення/закриття лишаються плавними.
  let startY = 0, curY = 0, dragging = false, rafId = 0;
  const dragZone = modal.querySelector('.bd-chat-modal-head');
  const applyDrag = () => {
    rafId = 0;
    modal.style.transform = `translate3d(-50%, ${curY}px, 0)`;
  };
  dragZone.addEventListener('touchstart', e => {
    startY = e.touches[0].clientY; curY = 0; dragging = true;
    modal.style.transition = 'none';      // рух — миттєвий за пальцем, без анімації
    modal.style.willChange = 'transform';
  }, { passive: true });
  dragZone.addEventListener('touchmove', e => {
    if (!dragging) return;
    curY = Math.max(0, e.touches[0].clientY - startY);   // лише вниз
    if (!rafId) rafId = requestAnimationFrame(applyDrag);
  }, { passive: true });
  const endDrag = () => {
    if (!dragging) return;
    dragging = false;
    if (rafId) { cancelAnimationFrame(rafId); rafId = 0; }
    modal.style.transition = '';          // повертаємо CSS-плавність (снап-назад / закриття)
    modal.style.willChange = '';
    if (curY > 90) closeChatModal();
    else modal.style.transform = '';      // пружний повернення на місце
    curY = 0;
  };
  dragZone.addEventListener('touchend', endDrag);
  dragZone.addEventListener('touchcancel', endDrag);
}

export function closeChatModal() {
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
  const post = _getPosts().find(p => p.id === postId);
  if (post) card.outerHTML = renderChatCard(post);
}

// ── Багатий чат «Обговорень» (П7): перемальовування + reply/edit/delete/меню ──────
function rerenderCommentsBlock(postId) {
  const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
  if (!wrap) return;
  const post = _getPosts().find(p => p.id === postId);
  if (!post) return;
  wrap.outerHTML = chatMessagesHtml(post);
  hydrateAvatars(document.querySelector(`[data-comments-for="${postId}"]`));   // Потік 12 Б
  hydrateNames(document.querySelector(`[data-comments-for="${postId}"]`));     // синк живих імен
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

// ── Картка теми обговорення ──────────────────────────────────────────────────

// CHAT: картка-прев'ю теми обговорення. Тап по картці → повноекранна модалка-чат.
export function renderChatCard(p) {
  const comments = activeComments(p.id);   // видалені не рахуємо і не показуємо
  const count = comments.length;
  const recent = comments.slice(-2);   // два останніх (невидалених) повідомлення у прев'ю картки
  // Унікальні учасники чату — за uid акаунту (той самий юзер зі зміненим іменем
  // рахується РАЗ; анонімів без uid зводимо за іменем як раніше).
  const participants = new Set(comments.map(c => c.sender_uid || ('nm:' + (c.author || 'Житель')))).size;
  const lastHtml = recent.length
    ? `<div class="bd-chat-last">${recent.map(m => `
         <div class="bd-chat-last-row">
           <span class="bd-chat-last-msg"><span class="bd-chat-last-author"><span${nameUid(m.sender_uid)}>${liveName(m.author, m.sender_uid)}</span>:</span> ${escapeHtml(m.text)}</span>
           <span class="bd-chat-last-time">${formatTime(postTime(m))}</span>
         </div>`).join('')}</div>`
    : '<div class="bd-chat-last bd-chat-last--empty">Ще немає повідомлень — почніть розмову</div>';
  const liked = isLikedByMe(p.id);
  return `
    <article class="bd-card bd-card--chat" data-post-id="${p.id}" data-chat-open="${p.id}">
      <div class="bd-chat-topic">
        <p class="bd-chat-text">${escapeHtml(p.text)}</p>
      </div>
      <div class="bd-chat-topline">
        <span class="bd-chat-msgcount">${COMMENT_ICON_SVG} ${count} ${msgWord(count)}</span>
        <span class="bd-chat-participants">${USERS_ICON_SVG} ${participants}</span>
      </div>
      ${lastHtml}
      <div class="bd-chat-foot">
        <button class="bd-chat-like${liked ? ' bd-chat-like--active' : ''}" type="button"
                data-like-id="${p.id}" aria-label="${liked ? 'Прибрати лайк' : 'Лайк'}">
          ${likeBtnInner(p.id)}
        </button>
        <div class="bd-chat-by">
          <div class="bd-chat-by-author"><span class="bd-chat-by-label">Автор:</span> <span class="bd-chat-by-name"${nameUid(p.owner_uid)}>${liveName(p.author, p.owner_uid)}</span></div>
          <div class="bd-chat-by-date">${formatTime(postTime(p))}</div>
        </div>
        ${saveBtnHtml(p)}
      </div>
    </article>
  `;
}

// ── Лайк теми (клік з document-делегації board.js) ───────────────────────────
// Тогл через наявний data-шар reactions (одна емоція ❤️), optimistic + відкат.
export function handleLikeClick(likeBtn) {
  const id = Number(likeBtn.dataset.likeId);
  requireAuth('лайкати обговорення', async () => {
    const uid = currentUserId();
    const wasLiked = isLikedByMe(id);
    const entry = reactionsByPost.get(id) || { counts: {}, my: null };
    entry.counts[LIKE_EMOJI] = Math.max(0, (entry.counts[LIKE_EMOJI] || 0) + (wasLiked ? -1 : 1));
    entry.my = wasLiked ? null : LIKE_EMOJI;
    reactionsByPost.set(id, entry);
    likeBtn.innerHTML = likeBtnInner(id);
    likeBtn.classList.toggle('bd-chat-like--active', !wasLiked);
    likeBtn.setAttribute('aria-label', wasLiked ? 'Лайк' : 'Прибрати лайк');
    const res = await setReaction(id, uid, wasLiked ? null : LIKE_EMOJI);
    if (!res.ok) {
      // Відкат при помилці мережі/RLS
      entry.counts[LIKE_EMOJI] = Math.max(0, (entry.counts[LIKE_EMOJI] || 0) + (wasLiked ? 1 : -1));
      entry.my = wasLiked ? LIKE_EMOJI : null;
      reactionsByPost.set(id, entry);
      likeBtn.innerHTML = likeBtnInner(id);
      likeBtn.classList.toggle('bd-chat-like--active', wasLiked);
      likeBtn.setAttribute('aria-label', wasLiked ? 'Прибрати лайк' : 'Лайк');
      showToast('Не вдалося зберегти лайк', 2500, 'error');
    }
  });
}

// ── Document-level listener надсилання коментаря ─────────────────────────────
// Один раз при initBoard (board.js викликає attachDiscussionsDelegation).
// Форми [data-comment-form] існують лише в модалці чату обговорення.

let _delegationAttached = false;
export function attachDiscussionsDelegation() {
  if (_delegationAttached) return;
  _delegationAttached = true;

  // Submit inline-форми коментаря:
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
}

// ── Realtime — підписки чіпляємо ОДИН раз при initBoard (board.js викликає). ──
// При подіях БД перерахуємо in-memory map і точково перерендеримо DOM-елементи.

function onCommentRealtimeEvent(payload) {
  const postId = (payload.new || payload.old || {}).post_id;
  if (!postId) return;
  const prevCount = getComments(postId).length;
  // Просто refetch усіх коментарів і перерендеримо блок
  fetchAllComments().then(fresh => {
    commentsByPost = fresh;
    const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
    if (wrap) {
      const post = _getPosts().find(p => p.id === postId);
      if (post) {
        // Розумний автоскрол: фіксуємо позицію ДО перемальовування
        const body = document.getElementById('bd-chat-modal-body');
        const near = chatBodyNearBottom();
        const prevTop = body ? body.scrollTop : 0;
        wrap.outerHTML = chatMessagesHtml(post);
        hydrateAvatars(document.querySelector(`[data-comments-for="${postId}"]`));   // Потік 12 Б
        hydrateNames(document.querySelector(`[data-comments-for="${postId}"]`));     // синк живих імен
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

// Лайки Обговорень — той самий рефетч-і-перемалюй підхід, що й коментарі.
function onReactionRealtimeEvent(payload) {
  const postId = (payload.new || payload.old || {}).post_id;
  if (!postId) return;
  const uid = currentUserId();
  fetchAllReactions(uid || getAnonId()).then(fresh => {
    reactionsByPost = fresh;
    refreshChatCardPreview(postId);
  });
}

let _realtimeAttached = false;
export function attachDiscussionsRealtime() {
  if (_realtimeAttached || !isSupabaseReady()) return;
  _realtimeAttached = true;
  subscribeComments(onCommentRealtimeEvent);
  subscribeReactions(onReactionRealtimeEvent);
}

// ── Вхід/вихід з акаунта (виклик з onAuthChange у initBoard) ─────────────────
// Відкрита модалка чату рендерить низ (форма/кнопка входу) один раз при відкритті.
// Гість натиснув «Увійдіть, щоб писати» → увійшов → перезбираємо модалку,
// щоб зʼявилось поле вводу (інакше кнопка-глухий кут лишалась назавжди).
export function handleDiscussionsAuthChange() {
  if (_chatOpenPostId != null) {
    const post = _getPosts().find(p => p.id === _chatOpenPostId);
    closeChatModal();
    if (post) openChatModal(post);
  }
}
