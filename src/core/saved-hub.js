// src/core/saved-hub.js
// Хаб «Збережені» — bottom-sheet з іконки 🔖 у шапці (рішення Роми 08.07).
// 12.07 (за проханням Роми): 2 екрани замість одного довгого списку — спершу
// категорії з лічильником, тап відкриває список саме цієї категорії.
//   📰 СТАТТІ       (localStorage cstl_saved_articles) → тап: модалка статті. Доступно й гостю.
//   🚌 АВТОБУСИ    (trackedRoutes, buses.js)           → тап: вкладка Автобуси + скрол на рейс
//   💬 ОБГОВОРЕННЯ (пости type='chat')  → тап по картці: вкладка Обговорення + модалка чату
//   📌 ОГОЛОШЕННЯ  (пости type='board') → тап по картці: Дошка, таб «Збережені»
// Обговорення/Оголошення/Автобуси — вимагають акаунт (кожен по-своєму). Статті — локальне
// сховище пристрою (Б5.4), без акаунта. Порожньо всюди → підказка.

import { escapeHtml } from './utils.js';
import { isLoggedIn, currentUserId, requireAuth } from './auth.js';
import { getSupabase, fetchSavedPostIds } from './supabase.js';
import { setBoardActiveType, openChatById } from '../tabs/board.js';
import { getSavedArticleIds, getArticlesByIds, openArticle } from '../tabs/news.js';
import { getSavedRoutesForUI, openSavedRouteOnBuses } from '../tabs/buses.js';

let _sheet = null;
let _backdrop = null;
let _view = 'categories';   // 'categories' | 'articles' | 'buses' | 'chats' | 'boards'
let _data = { articles: [], buses: [], chats: [], boards: [], loggedIn: false };

const CATS = [
  { key: 'articles', icon: '📰', label: 'Статті',       needsAuth: false },
  { key: 'buses',    icon: '🚌', label: 'Автобуси',     needsAuth: false },
  { key: 'chats',    icon: '💬', label: 'Обговорення',  needsAuth: true },
  { key: 'boards',   icon: '📌', label: 'Оголошення',   needsAuth: true },
];

function closeHub() {
  if (!_sheet) return;
  const s = _sheet, b = _backdrop;
  _sheet = null; _backdrop = null;
  s.classList.remove('visible');
  b?.classList.remove('visible');
  document.body.classList.remove('modal-open');
  setTimeout(() => { s.remove(); b?.remove(); }, 240);
}

function cardHtml(p, type) {
  const when = new Date(p.created_at || p.ts || Date.now())
    .toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  return `
    <button class="shub-card" type="button" data-shub-open="${p.id}" data-shub-type="${type}">
      <span class="shub-card-text">${escapeHtml(p.title || p.text || '(без тексту)')}</span>
      <span class="shub-card-meta">${escapeHtml(when)}</span>
    </button>`;
}

// Б7.2: автобуси — власна ідентичність (routeId+дата+зупинки, не один числовий id).
function busCardHtml(r) {
  return `
    <button class="shub-card" type="button" data-shub-type="bus"
            data-shub-rid="${escapeHtml(r.routeId)}" data-shub-date="${escapeHtml(r.trackDate)}"
            data-shub-from="${escapeHtml(r.from || '')}" data-shub-to="${escapeHtml(r.to || '')}">
      <span class="shub-card-text">${escapeHtml(r.title)}</span>
      <span class="shub-card-meta">${escapeHtml(r.dayLabel || r.trackDate)}${r.timeStr ? ' · ' + escapeHtml(r.timeStr) : ''}</span>
    </button>`;
}

async function loadData() {
  const data = { articles: [], buses: [], chats: [], boards: [], loggedIn: isLoggedIn(), postsError: false };

  // Статті — localStorage, доступно й гостю (Б5.4).
  try {
    const artIds = [...getSavedArticleIds()].reverse();   // найновіші збережені зверху
    if (artIds.length) data.articles = await getArticlesByIds(artIds);
  } catch (e) { console.warn('[saved-hub] articles', e); }

  // Автобуси — trackedRoutes (buses.js), вже порожні для гостя на джерелі (loadTrackedRoute).
  try { data.buses = getSavedRoutesForUI(); } catch (e) { console.warn('[saved-hub] buses', e); }

  // Обговорення/Оголошення — Supabase saved_posts, лише залогінені.
  if (data.loggedIn) {
    try {
      const ids = [...(await fetchSavedPostIds(currentUserId()))];
      if (ids.length) {
        const supa = getSupabase();
        const { data: posts, error } = await supa.from('posts').select('*').in('id', ids)
          .order('created_at', { ascending: false });
        if (error) throw error;
        data.chats  = (posts || []).filter(p => p.type === 'chat');
        data.boards = (posts || []).filter(p => p.type !== 'chat');
      }
    } catch (e) {
      console.warn('[saved-hub] posts', e);
      data.postsError = true;
    }
  }
  return data;
}

// ── Екран 1: список категорій ────────────────────────────────────────────
function categoriesScreenHtml() {
  const rows = CATS.map(c => {
    const count = _data[c.key].length;
    const locked = c.needsAuth && !_data.loggedIn;
    if (!count && !locked) return '';   // порожня й доступна категорія — не показуємо
    return `
      <button class="shub-cat-row" type="button" data-shub-cat="${c.key}">
        <span class="shub-cat-ic">${c.icon}</span>
        <span class="shub-cat-label">${c.label}</span>
        ${locked ? '<span class="shub-cat-lock">🔒</span>' : `<span class="shub-count">${count}</span>`}
        <span class="shub-cat-chev">›</span>
      </button>`;
  }).filter(Boolean).join('');

  if (!rows) {
    return `<div class="shub-empty">Поки нічого не збережено.<br>
      <span class="shub-hint">Тримайте прапорець 🔖 на картці оголошення, обговорення чи статті — і воно зʼявиться тут.</span></div>`;
  }
  return `<div class="shub-cats">${rows}</div>`;
}

// ── Екран 2: список конкретної категорії ─────────────────────────────────
function detailHead(cat) {
  return `
    <div class="shub-detail-head">
      <button class="shub-back" type="button" data-shub-back aria-label="Назад">←</button>
      <span class="shub-detail-title">${cat.icon} ${cat.label}</span>
    </div>`;
}
const EMPTY_DETAIL = `<div class="shub-empty">Тут поки порожньо.</div>`;

function categoryScreenHtml(key) {
  const cat = CATS.find(c => c.key === key);
  if (!cat) { _view = 'categories'; return categoriesScreenHtml(); }

  if (cat.needsAuth && !_data.loggedIn) {
    return detailHead(cat) + `<div class="shub-hint-block">Увійдіть, щоб бачити збережені оголошення й обговорення.<br>
      <button class="shub-login" type="button" id="shub-login">Увійти</button></div>`;
  }

  if (key === 'buses') {
    return detailHead(cat) + (_data.buses.map(busCardHtml).join('') || EMPTY_DETAIL);
  }
  if (key === 'articles') {
    return detailHead(cat) + (_data.articles.map(p => cardHtml(p, 'article')).join('') || EMPTY_DETAIL);
  }
  const type = key === 'chats' ? 'chat' : 'board';
  return detailHead(cat) + (_data[key].map(p => cardHtml(p, type)).join('') || EMPTY_DETAIL);
}

function render() {
  const bodyEl = _sheet?.querySelector('#shub-body');
  if (!bodyEl) return;
  bodyEl.innerHTML = _view === 'categories' ? categoriesScreenHtml() : categoryScreenHtml(_view);
}

export function openSavedHub() {
  if (_sheet) return;
  _view = 'categories';
  _backdrop = document.createElement('div');
  _backdrop.className = 'board-backdrop shub-backdrop';

  _sheet = document.createElement('div');
  _sheet.className = 'shub-sheet';
  _sheet.innerHTML = `
    <div class="shub-handle"></div>
    <div class="shub-title">🔖 Збережені</div>
    <div class="shub-body" id="shub-body"><div class="shub-empty">Завантаження…</div></div>`;

  document.body.appendChild(_backdrop);
  document.body.appendChild(_sheet);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    _backdrop.classList.add('visible');
    _sheet.classList.add('visible');
  });

  _backdrop.addEventListener('click', closeHub);
  // Делегація (не addEventListener одразу — #shub-login вставляється пізніше через render)
  _sheet.addEventListener('click', e => {
    if (e.target.closest('#shub-login')) {
      closeHub();
      requireAuth('бачити збережені', () => {});
      return;
    }
    if (e.target.closest('[data-shub-back]')) {
      _view = 'categories';
      render();
      return;
    }
    const catRow = e.target.closest('[data-shub-cat]');
    if (catRow) {
      _view = catRow.dataset.shubCat;
      render();
      return;
    }
    const busCard = e.target.closest('[data-shub-type="bus"]');
    if (busCard) {
      const { shubRid, shubDate, shubFrom, shubTo } = busCard.dataset;
      closeHub();
      window.switchTab && window.switchTab('buses');
      openSavedRouteOnBuses(shubRid, shubDate, shubFrom || null, shubTo || null);
      return;
    }
    const card = e.target.closest('[data-shub-open]');
    if (!card) return;
    const id = Number(card.dataset.shubOpen);
    const type = card.dataset.shubType;
    closeHub();
    if (type === 'article') {
      openArticle(id);                     // модалка статті — глобальна, без перемикання вкладки
    } else if (type === 'chat') {
      window.switchTab && window.switchTab('discussions');
      openChatById(id);                    // модалка конкретного обговорення
    } else {
      window.switchTab && window.switchTab('board');
      setBoardActiveType('saved');         // Дошка → таб «Збережені»
    }
  });

  loadData().then(data => { _data = data; render(); });
}

export function initSavedHub() {
  document.getElementById('saved-hub-btn')?.addEventListener('click', openSavedHub);
}
