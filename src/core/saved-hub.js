// src/core/saved-hub.js
// Хаб «Збережені» — bottom-sheet з іконки 🔖 у шапці (рішення Роми 08.07).
// Показує збережені картки користувача, розкладені по категоріях вкладок:
//   💬 ОБГОВОРЕННЯ (пости type='chat')  → тап по картці: вкладка Обговорення + модалка чату
//   📌 ОГОЛОШЕННЯ  (пости type='board') → тап по картці: Дошка, таб «Збережені»
// Джерело — таблиця saved_posts (закладки акаунта) + пости за id.
// Гість → екран «Увійдіть»; порожньо → підказка як зберігати.

import { escapeHtml } from './utils.js';
import { isLoggedIn, currentUserId, requireAuth } from './auth.js';
import { getSupabase, fetchSavedPostIds } from './supabase.js';
import { setBoardActiveType, openChatById } from '../tabs/board.js';

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

function cardHtml(p) {
  const when = new Date(p.created_at || p.ts || Date.now())
    .toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  return `
    <button class="shub-card" type="button" data-shub-open="${p.id}" data-shub-type="${escapeHtml(p.type || 'board')}">
      <span class="shub-card-text">${escapeHtml(p.text || '(без тексту)')}</span>
      <span class="shub-card-meta">${escapeHtml(when)}</span>
    </button>`;
}

function sectionHtml(title, icon, items) {
  if (!items.length) return '';
  return `
    <div class="shub-section">
      <div class="shub-section-title">${icon} ${title} <span class="shub-count">${items.length}</span></div>
      ${items.map(cardHtml).join('')}
    </div>`;
}

async function loadInto(bodyEl) {
  try {
    const ids = [...(await fetchSavedPostIds(currentUserId()))];
    if (!ids.length) {
      bodyEl.innerHTML = `<div class="shub-empty">Поки нічого не збережено.<br>
        <span class="shub-hint">Тримайте прапорець 🔖 на картці оголошення чи обговорення — і воно зʼявиться тут.</span></div>`;
      return;
    }
    const supa = getSupabase();
    const { data, error } = await supa.from('posts').select('*').in('id', ids)
      .order('created_at', { ascending: false });
    if (error) throw error;
    const posts = data || [];
    const chats = posts.filter(p => p.type === 'chat');
    const boards = posts.filter(p => p.type !== 'chat');
    const html = sectionHtml('ОБГОВОРЕННЯ', '💬', chats) + sectionHtml('ОГОЛОШЕННЯ', '📌', boards);
    bodyEl.innerHTML = html || `<div class="shub-empty">Збережені картки вже недоступні (видалені авторами).</div>`;
  } catch (e) {
    console.warn('[saved-hub]', e);
    bodyEl.innerHTML = `<div class="shub-empty">Не вдалося завантажити збережені. Спробуйте ще раз.</div>`;
  }
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
    <div class="shub-body" id="shub-body">
      ${isLoggedIn()
        ? '<div class="shub-empty">Завантаження…</div>'
        : `<div class="shub-empty">Збережені видно лише у своєму акаунті.<br>
             <button class="shub-login" type="button" id="shub-login">Увійти</button></div>`}
    </div>`;

  document.body.appendChild(_backdrop);
  document.body.appendChild(_sheet);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    _backdrop.classList.add('visible');
    _sheet.classList.add('visible');
  });

  _backdrop.addEventListener('click', closeHub);
  _sheet.querySelector('#shub-login')?.addEventListener('click', () => {
    closeHub();
    requireAuth('бачити збережені', () => {});
  });
  // Тап по картці → перехід у відповідну вкладку
  _sheet.addEventListener('click', e => {
    const card = e.target.closest('[data-shub-open]');
    if (!card) return;
    const id = Number(card.dataset.shubOpen);
    const type = card.dataset.shubType;
    closeHub();
    if (type === 'chat') {
      window.switchTab && window.switchTab('discussions');
      openChatById(id);                    // модалка конкретного обговорення
    } else {
      window.switchTab && window.switchTab('board');
      setBoardActiveType('saved');         // Дошка → таб «Збережені»
    }
  });

  if (isLoggedIn()) loadInto(_sheet.querySelector('#shub-body'));
}

export function initSavedHub() {
  document.getElementById('saved-hub-btn')?.addEventListener('click', openSavedHub);
}
