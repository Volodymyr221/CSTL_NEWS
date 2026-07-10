// src/core/saved-hub.js
// Хаб «Збережені» — bottom-sheet з іконки 🔖 у шапці (рішення Роми 08.07).
// Показує збережені картки користувача, розкладені по категоріях вкладок:
//   📰 СТАТТІ       (localStorage cstl_saved_articles) → тап: модалка статті. Доступно й гостю.
//   💬 ОБГОВОРЕННЯ (пости type='chat')  → тап по картці: вкладка Обговорення + модалка чату
//   📌 ОГОЛОШЕННЯ  (пости type='board') → тап по картці: Дошка, таб «Збережені»
// Обговорення/Оголошення — таблиця saved_posts (закладки акаунта), лише залогінені.
// Статті — локальне сховище пристрою (Б5.4), без акаунта. Порожньо всюди → підказка.

import { escapeHtml } from './utils.js';
import { isLoggedIn, currentUserId, requireAuth } from './auth.js';
import { getSupabase, fetchSavedPostIds } from './supabase.js';
import { setBoardActiveType, openChatById } from '../tabs/board.js';
import { getSavedArticleIds, getArticlesByIds, openArticle } from '../tabs/news.js';

let _sheet = null;
let _backdrop = null;

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

function sectionHtml(title, icon, items, type) {
  if (!items.length) return '';
  return `
    <div class="shub-section">
      <div class="shub-section-title">${icon} ${title} <span class="shub-count">${items.length}</span></div>
      ${items.map(p => cardHtml(p, type)).join('')}
    </div>`;
}

async function loadInto(bodyEl) {
  const sections = [];

  // Статті — localStorage, доступно й гостю (Б5.4).
  try {
    const artIds = [...getSavedArticleIds()].reverse();   // найновіші збережені зверху
    if (artIds.length) {
      const arts = await getArticlesByIds(artIds);
      sections.push(sectionHtml('СТАТТІ', '📰', arts, 'article'));
    }
  } catch (e) { console.warn('[saved-hub] articles', e); }

  // Обговорення/Оголошення — Supabase saved_posts, лише залогінені.
  if (isLoggedIn()) {
    try {
      const ids = [...(await fetchSavedPostIds(currentUserId()))];
      if (ids.length) {
        const supa = getSupabase();
        const { data, error } = await supa.from('posts').select('*').in('id', ids)
          .order('created_at', { ascending: false });
        if (error) throw error;
        const posts = data || [];
        const chats = posts.filter(p => p.type === 'chat');
        const boards = posts.filter(p => p.type !== 'chat');
        sections.push(sectionHtml('ОБГОВОРЕННЯ', '💬', chats, 'chat'));
        sections.push(sectionHtml('ОГОЛОШЕННЯ', '📌', boards, 'board'));
      }
    } catch (e) {
      console.warn('[saved-hub] posts', e);
      sections.push('<div class="shub-empty">Не вдалося завантажити збережені оголошення/обговорення.</div>');
    }
  } else {
    sections.push(`<div class="shub-hint-block">Увійдіть, щоб бачити збережені оголошення й обговорення.<br>
      <button class="shub-login" type="button" id="shub-login">Увійти</button></div>`);
  }

  const html = sections.filter(Boolean).join('');
  bodyEl.innerHTML = html || `<div class="shub-empty">Поки нічого не збережено.<br>
    <span class="shub-hint">Тримайте прапорець 🔖 на картці оголошення, обговорення чи статті — і воно зʼявиться тут.</span></div>`;
}

export function openSavedHub() {
  if (_sheet) return;
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
  // Делегація (не addEventListener одразу — #shub-login вставляється пізніше через loadInto)
  _sheet.addEventListener('click', e => {
    if (e.target.closest('#shub-login')) {
      closeHub();
      requireAuth('бачити збережені', () => {});
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

  loadInto(_sheet.querySelector('#shub-body'));   // статті — і гостю; решта секцій — за isLoggedIn() всередині
}

export function initSavedHub() {
  document.getElementById('saved-hub-btn')?.addEventListener('click', openSavedHub);
}
