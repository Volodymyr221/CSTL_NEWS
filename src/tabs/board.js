// src/tabs/board.js
// Вкладка «Дошка громади 2.0» — 3 типи постів + пошук + фільтри + реакції + збережені.
// Перебудовано 17.05.2026 під дизайн Дошки 2.0 з docs/COMMUNITY_BOARD_VISION.md.
//
// Тиипи постів:
//   board    = оголошення (продам/куплю/...) — стікер на корку
//   chat     = розмови — горизонтальна картка з аватаркою і хештегами
//   greeting = вітання — святкова картка з emoji-обкладинкою
//
// Реакції і збережені поки у localStorage (без auth). У Фазі 9 Спринт 3 — у Supabase.

import { escapeHtml, formatTime, sharePost } from '../core/utils.js';
import { openBoardModal } from './community-modal.js';

// ── Конфігурація ─────────────────────────────────────────────────────────────

const TYPE_TABS = [
  { id: 'all',      label: 'Усі',         emoji: '🔄' },
  { id: 'board',    label: 'Дошка',       emoji: '🛒' },
  { id: 'chat',     label: 'Розмови',     emoji: '💬' },
  { id: 'greeting', label: 'Вітання',     emoji: '🎉' },
  { id: 'saved',    label: 'Мої',         emoji: '💾' },
];

const BOARD_CATEGORIES = [
  { id: 'all',         label: 'Всі',          emoji: '✦' },
  { id: 'продам',      label: 'Продам',       emoji: '💰' },
  { id: 'куплю',       label: 'Куплю',        emoji: '🛒' },
  { id: 'шукаю',       label: 'Шукаю',        emoji: '🔍' },
  { id: 'послуга',     label: 'Послуги',      emoji: '🔧' },
  { id: 'знайдено',    label: 'Знайдено',     emoji: '🎁' },
  { id: 'загубилось',  label: 'Загубилось',   emoji: '😟' },
  { id: 'подяка',      label: 'Подяки',       emoji: '❤️' },
  { id: 'оголошення',  label: 'Оголошення',   emoji: '📢' },
];

const CATEGORY_EMOJI = Object.fromEntries(BOARD_CATEGORIES.map(c => [c.id, c.emoji]));

const REACTIONS = ['❤️', '👍', '👏', '🔥', '😂', '😮', '😢', '🙏'];

// SVG слухавки (для кнопки виклика)
const PHONE_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

// Іконка закладки (для «Зберегти у Мої»). Outline за замовчуванням, filled коли збережено.
const BOOKMARK_OUTLINE_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const BOOKMARK_FILLED_SVG  = '<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';

// Іконка «Поділитись» — стандартний iOS-style (квадрат зі стрілкою вгору)
const SHARE_ICON_SVG = '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>';

// ── Стан (зберігається в межах сесії, фільтри у localStorage) ────────────────

let allPosts       = [];   // [{id, type, ...}]
let allAnnouncements = []; // офіційні з community.json
let activeType     = 'all';
let activeCategory = 'all';
let searchQuery    = '';

// ── localStorage: реакції і збережене ────────────────────────────────────────

const LS_REACTIONS = 'cstl-reactions-v1';   // { [postId]: { '❤️': true, ... } }
const LS_SAVED     = 'cstl-saved-v1';        // [postId, postId, ...]

function lsGet(key, fallback) {
  try {
    const v = localStorage.getItem(key);
    return v ? JSON.parse(v) : fallback;
  } catch { return fallback; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, JSON.stringify(value)); } catch {}
}

// Одна реакція на пост (як у iMessage): emoji або null
function getMyReaction(postId) {
  const all = lsGet(LS_REACTIONS, {});
  return all[postId] || null;
}
function setMyReaction(postId, emoji) {
  const all = lsGet(LS_REACTIONS, {});
  if (emoji) all[postId] = emoji;
  else delete all[postId];
  lsSet(LS_REACTIONS, all);
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

function actionsRow(post) {
  const myReaction = getMyReaction(post.id);
  const saved = isSaved(post.id);

  // Тригер реакції — або моя обрана emoji, або «🙂+» якщо нічого не ставив
  const triggerLabel = myReaction
    ? `<span class="bd-react-trigger-emoji">${myReaction}</span>`
    : `<span class="bd-react-trigger-default">🙂</span><span class="bd-react-trigger-plus">+</span>`;

  const shareText = buildShareText(post);
  const shareTitle = post.type === 'greeting'
    ? `🎉 ${post.title || 'Вітання'} (CSTL LIFE)`
    : post.type === 'chat'
    ? 'Розмова з Дошки громади Олики'
    : 'Оголошення з Дошки громади Олики';

  return `
    <div class="bd-actions">
      <button class="bd-react-trigger${myReaction ? ' bd-react-trigger--active' : ''}" type="button"
              data-react-trigger="${post.id}" aria-label="Поставити реакцію">
        ${triggerLabel}
      </button>
      <div class="bd-actions-right">
        <button class="bd-icon-btn bd-bookmark${saved ? ' bd-bookmark--active' : ''}" type="button"
                data-save-id="${post.id}"
                aria-label="${saved ? 'Прибрати зі збережених' : 'Зберегти у Мої'}">
          ${saved ? BOOKMARK_FILLED_SVG : BOOKMARK_OUTLINE_SVG}
        </button>
        <button class="bd-icon-btn bd-share-btn" type="button"
                data-share-board
                data-share-title="${escapeHtml(shareTitle)}"
                data-share-text="${escapeHtml(shareText)}"
                aria-label="Поділитися">${SHARE_ICON_SVG}</button>
      </div>
    </div>
  `;
}

// Попап вибору реакції — додається у body над кнопкою-тригером
function openReactionPopup(triggerBtn, postId) {
  closeReactionPopup();   // якщо вже відкритий — закрити

  const myReaction = getMyReaction(postId);
  const popup = document.createElement('div');
  popup.className = 'bd-react-popup';
  popup.id = 'bd-react-popup';
  popup.innerHTML = REACTIONS.map(em => `
    <button class="bd-react-opt${myReaction === em ? ' bd-react-opt--active' : ''}" type="button" data-react-opt="${escapeHtml(em)}" data-react-post="${postId}">${em}</button>
  `).join('');

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

function buildShareText(post) {
  if (post.type === 'board') {
    const cat = CATEGORY_EMOJI[post.category] || '📌';
    return `${cat} ${post.category}\n\n${post.text}\n— ${post.author || 'анонімно'}`;
  }
  if (post.type === 'chat') {
    const tags = (post.tags || []).join(' ');
    return `${post.text}${tags ? '\n\n' + tags : ''}\n— ${post.author || 'анонімно'}`;
  }
  if (post.type === 'greeting') {
    return `${post.cover_emoji || '🎉'} ${post.title ? 'Для ' + post.title + ':\n' : ''}${post.text}${post.author ? '\n— ' + post.author : ''}`;
  }
  return post.text || '';
}

// ── Картки за типом ──────────────────────────────────────────────────────────

// BOARD: стікер на корку (як було, з реакціями і ❤️-зберегти)
function renderBoardCard(p) {
  const tilt = ((p.id * 7) % 9) - 4;
  const emoji = CATEGORY_EMOJI[p.category] || '📌';
  const contactHtml = renderContact(p.contact);
  const photoHtml = p.photo
    ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${escapeHtml(p.photo)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></div>`
    : '';
  return `
    <article class="cm-board-note bd-card bd-card--board cm-board-note--${escapeHtml(p.color || 'yellow')}${p.photo ? ' cm-board-note--has-photo' : ''}" style="--tilt:${tilt}deg" data-post-id="${p.id}">
      <span class="cm-board-pin"></span>
      ${photoHtml}
      <span class="cm-board-cat">${emoji} ${escapeHtml(p.category)}</span>
      <p class="cm-board-text">${escapeHtml(p.text)}</p>
      <div class="cm-board-footer">
        <span class="cm-board-author">— ${escapeHtml(p.author || 'анонімно')}</span>
        <span class="cm-board-time">${formatTime(p.ts)}</span>
      </div>
      ${contactHtml}
      ${actionsRow(p)}
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
        <span class="cm-board-time">${formatTime(a.ts)}</span>
      </div>
    </article>
  `;
}

// CHAT: горизонтальна картка, аватарка зліва, текст справа, хештеги внизу
function renderChatCard(p) {
  const tagsHtml = (p.tags || []).length
    ? `<div class="bd-chat-tags">${p.tags.map(t => `<span class="bd-chat-tag">${escapeHtml(t)}</span>`).join(' ')}</div>`
    : '';
  const photoHtml = p.photo
    ? `<img class="bd-chat-photo" src="${escapeHtml(p.photo)}" alt="" loading="lazy" onerror="this.style.display='none'">`
    : '';
  return `
    <article class="bd-card bd-card--chat" data-post-id="${p.id}">
      <div class="bd-chat-head">
        ${authorAvatar(p.author)}
        <div class="bd-chat-meta">
          <span class="bd-chat-author">${escapeHtml(p.author || 'анонімно')}</span>
          <span class="bd-chat-time">${formatTime(p.ts)}</span>
        </div>
      </div>
      <p class="bd-chat-text">${escapeHtml(p.text)}</p>
      ${photoHtml}
      ${tagsHtml}
      ${actionsRow(p)}
    </article>
  `;
}

// GREETING: святкова картка з кольоровою обкладинкою-emoji
function renderGreetingCard(p) {
  const grad = p.cover_gradient || 'linear-gradient(135deg, #FFD1DC 0%, #FFB6C1 100%)';
  const emoji = p.cover_emoji || '🎉';
  const titleLine = p.title
    ? `<div class="bd-greet-to">Для ${escapeHtml(p.title)}</div>`
    : '';
  return `
    <article class="bd-card bd-card--greeting" data-post-id="${p.id}">
      <div class="bd-greet-cover" style="background:${escapeHtml(grad)}">
        <span class="bd-greet-emoji">${emoji}</span>
      </div>
      <div class="bd-greet-body">
        ${titleLine}
        <p class="bd-greet-text">${escapeHtml(p.text)}</p>
        <div class="bd-greet-footer">
          <span class="bd-greet-author">— ${escapeHtml(p.author || 'анонімно')}</span>
          <span class="bd-greet-time">${formatTime(p.ts)}</span>
        </div>
      </div>
      ${actionsRow(p)}
    </article>
  `;
}

function renderCard(post) {
  if (post.type === 'chat')     return renderChatCard(post);
  if (post.type === 'greeting') return renderGreetingCard(post);
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
    } else if (activeType !== 'all' && p.type !== activeType) {
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
  const tabs = TYPE_TABS.map(t => `
    <button class="bd-tab${t.id === activeType ? ' bd-tab--active' : ''}" type="button" data-bd-tab="${t.id}">
      <span class="bd-tab-emoji">${t.emoji}</span>
      <span class="bd-tab-label">${escapeHtml(t.label)}</span>
    </button>
  `).join('');

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
      <div class="bd-search">
        <span class="bd-search-icon">🔍</span>
        <input class="bd-search-input" id="bd-search-input" type="search"
               placeholder="Пошук по дошці..." value="${escapeHtml(searchQuery)}">
        ${searchQuery ? '<button class="bd-search-clear" type="button" id="bd-search-clear">✕</button>' : ''}
      </div>
      <div class="bd-tabs">${tabs}</div>
      ${categoriesHtml}
    </div>
  `;
}

function renderBody() {
  const filtered = getFilteredPosts();

  if (!filtered.length) {
    const msg = activeType === 'saved'
      ? 'У «Моїх» поки нічого. Тапніть 🤍 на пості щоб зберегти.'
      : searchQuery
      ? `За запитом «${escapeHtml(searchQuery)}» нічого не знайдено`
      : 'У цій категорії поки порожньо';
    return `<div class="bd-empty">${msg}</div>`;
  }

  // Сортування за часом — нові зверху
  const sorted = [...filtered].sort((a, b) => (b.ts || 0) - (a.ts || 0));

  // Окремий лейаут для board (корок з нахилами) vs chat/greeting (стрічка)
  if (activeType === 'board') {
    // BOARD-only — корок зі стікерами
    const cards = sorted.map(renderBoardCard).join('');
    return `
      <div class="board-backdrop" id="board-backdrop"></div>
      <div class="cm-board-corkboard board-corkboard--full">${cards}</div>
    `;
  }

  if (activeType === 'all') {
    // Усі — змішане з офіційними зверху на корку + chat/greeting у стрічці
    const officialCards = allAnnouncements.map(renderOfficialCard).join('');
    const boardOnly = sorted.filter(p => p.type === 'board').map(renderBoardCard).join('');
    const others    = sorted.filter(p => p.type !== 'board').map(renderCard).join('');
    return `
      <div class="board-backdrop" id="board-backdrop"></div>
      ${(officialCards || boardOnly) ? `<div class="cm-board-corkboard board-corkboard--full">${officialCards}${boardOnly}</div>` : ''}
      ${others ? `<div class="bd-stream">${others}</div>` : ''}
    `;
  }

  // chat / greeting / saved — вертикальна стрічка карток
  return `<div class="bd-stream">${sorted.map(renderCard).join('')}</div>`;
}

export async function renderBoard() {
  const el = document.getElementById('board-content');
  if (!el) return;

  try {
    const [boardRes, communityRes] = await Promise.all([
      fetch('./data/community-board.json'),
      fetch('./data/community.json'),
    ]);
    const boardData     = await boardRes.json();
    const communityData = await communityRes.json();
    allPosts         = boardData.posts || [];
    allAnnouncements = communityData.announcements || [];
  } catch {
    el.innerHTML = '<div class="empty-state">Дошка тимчасово недоступна</div>';
    return;
  }

  renderAll(el);
}

// Перерендер тільки контейнера дошки (без перезавантаження даних)
function renderAll(el) {
  el.innerHTML = `
    ${renderHeader()}
    <div class="bd-body" id="bd-body">${renderBody()}</div>
    <button class="cm-board-trigger board-trigger--fixed" id="board-trigger" type="button">
      <span class="cm-board-trigger-icon">✏️</span>
      <span class="cm-board-trigger-text">Подати оголошення</span>
    </button>
  `;

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
      // Якщо тапнув те що вже стоїть — знімаємо
      setMyReaction(id, current === emoji ? null : emoji);
      closeReactionPopup();
      // Оновлюємо тригер на сторінці (і у zoom-модалці якщо вона відкрита)
      const newReaction = getMyReaction(id);
      document.querySelectorAll(`[data-react-trigger="${id}"]`).forEach(btn => {
        btn.classList.toggle('bd-react-trigger--active', !!newReaction);
        btn.innerHTML = newReaction
          ? `<span class="bd-react-trigger-emoji">${newReaction}</span>`
          : `<span class="bd-react-trigger-default">🙂</span><span class="bd-react-trigger-plus">+</span>`;
      });
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

export function initBoard() {
  attachBoardDelegation();
  renderBoard();
}
