// src/tabs/board.js
// Вкладка «Дошка громади 2.0» — 3 типи постів + пошук + фільтри + реакції + збережені.
//
// Типи постів:
//   board = оголошення (продам/куплю/...) — стікер на корку
//   chat  = обговорення — горизонтальна картка з аватаркою і хештегами

import { escapeHtml, formatTime, sharePost, postTime } from '../core/utils.js';
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

const BOARD_CATEGORIES = [
  { id: 'all',         label: 'Всі',          emoji: '✦' },
  { id: 'продам',      label: 'Продам',       emoji: '💰' },
  { id: 'куплю',       label: 'Куплю',        emoji: '🛒' },
  { id: 'шукаю',       label: 'Шукаю',        emoji: '🔍' },
  { id: 'послуга',     label: 'Послуги',      emoji: '🔧' },
  { id: 'знайдено',    label: 'Знайдено',     emoji: '🎁' },
  { id: 'загубилось',  label: 'Загубилось',   emoji: '😟' },
  { id: 'оголошення',  label: 'Оголошення',   emoji: '📢' },
];

const CATEGORY_EMOJI = Object.fromEntries(BOARD_CATEGORIES.map(c => [c.id, c.emoji]));

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

// Контакт-картка (з кнопкою дзвінка для телефонів)
function renderContact(contact) {
  if (!contact) return '';
  const trimmed = String(contact).trim();
  const isPhone = /^[\+\d][\d\s\-\(\)]{5,}$/.test(trimmed);
  if (!isPhone) {
    return `<div class="cm-board-contact">${escapeHtml(trimmed)}</div>`;
  }
  const tel = trimmed.replace(/[^\d+]/g, '');
  return `
    <div class="cm-board-contact cm-board-contact--phone">
      <span class="cm-board-contact-num">${escapeHtml(trimmed)}</span>
      <a class="cm-board-call" href="tel:${escapeHtml(tel)}" aria-label="Зателефонувати ${escapeHtml(trimmed)}">
        ${PHONE_ICON_SVG}
      </a>
    </div>
  `;
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

// CHAT: реакція + save + share + inline коментарі
function chatActionsHtml(post) {
  return `
    <div class="bd-actions">
      <div class="bd-actions-left">${reactTriggerHtml(post)}</div>
      <div class="bd-actions-right">${saveBtnHtml(post)}${shareBtnHtml(post)}</div>
    </div>
    ${chatCommentsHtml(post)}
  `;
}

// Інлайн-секція коментарів для chat-карток.
// Зверху: список існуючих коментарів. Знизу: поле введення + кнопка «↑».
function chatCommentsHtml(post) {
  const items = getComments(post.id);
  const listHtml = items.length
    ? items.map(c => `
        <div class="bd-inline-comment">
          <span class="bd-inline-comment-author">${escapeHtml(c.author || 'анонімно')}</span>
          <span class="bd-inline-comment-text">${escapeHtml(c.text)}</span>
          <span class="bd-inline-comment-time">${formatTime(postTime(c))}</span>
        </div>
      `).join('')
    : '';
  return `
    <div class="bd-inline-comments" data-comments-for="${post.id}">
      ${listHtml ? `<div class="bd-inline-comments-list">${listHtml}</div>` : ''}
      <form class="bd-inline-comment-form" data-comment-form="${post.id}">
        <input class="bd-inline-comment-input" type="text"
               placeholder="Написати коментар..." aria-label="Написати коментар"
               data-comment-input="${post.id}">
        <button class="bd-inline-comment-submit" type="submit" aria-label="Надіслати">↑</button>
      </form>
    </div>
  `;
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

// CHAT: горизонтальна картка, аватарка зліва, текст справа, хештеги внизу
function renderChatCard(p) {
  const tagsHtml = (p.tags || []).length
    ? `<div class="bd-chat-tags">${p.tags.map(t => `<span class="bd-chat-tag">${escapeHtml(t)}</span>`).join(' ')}</div>`
    : '';
  const photo = (Array.isArray(p.photos) && p.photos[0]) || p.photo;
  const photoHtml = photo
    ? `<img class="bd-chat-photo" src="${escapeHtml(photo)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';
  return `
    <article class="bd-card bd-card--chat" data-post-id="${p.id}">
      <div class="bd-chat-head">
        ${authorAvatar(p.author)}
        <div class="bd-chat-meta">
          <span class="bd-chat-author">${escapeHtml(p.author || 'анонімно')}</span>
          <span class="bd-chat-time">${formatTime(postTime(p))}</span>
        </div>
      </div>
      <p class="bd-chat-text">${escapeHtml(p.text)}</p>
      ${photoHtml}
      ${tagsHtml}
      ${chatActionsHtml(p)}
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
    // Фільтр по категорії — тільки для board
    if (activeType === 'board' && activeCategory !== 'all') {
      if (p.category !== activeCategory) return false;
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
  const categoriesHtml = showCategories ? `
    <div class="bd-categories">
      ${BOARD_CATEGORIES.map(c => `
        <button class="bd-cat-chip${c.id === activeCategory ? ' bd-cat-chip--active' : ''}" type="button" data-bd-cat="${c.id}">
          <span class="bd-cat-emoji">${c.emoji}</span>
          ${escapeHtml(c.label)}
        </button>
      `).join('')}
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
      activeCategory = btn.dataset.bdCat;
      renderAll(el);
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
    if (input) input.value = '';
    rerenderCommentsBlock(postId);

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
        rerenderCommentsBlock(postId);
      }
    }
  });

  function rerenderCommentsBlock(postId) {
    const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
    if (!wrap) return;
    const post = allPosts.find(p => p.id === postId);
    if (!post) return;
    wrap.outerHTML = chatCommentsHtml(post);
    setTimeout(() => {
      document.querySelector(`[data-comment-input="${postId}"]`)?.focus();
    }, 50);
  }

  document.addEventListener('click', e => {
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
  // Просто refetch усіх коментарів і перерендеримо блок
  fetchAllComments().then(fresh => {
    commentsByPost = fresh;
    const wrap = document.querySelector(`[data-comments-for="${postId}"]`);
    if (wrap) {
      const post = allPosts.find(p => p.id === postId);
      if (post) wrap.outerHTML = chatCommentsHtml(post);
    }
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
