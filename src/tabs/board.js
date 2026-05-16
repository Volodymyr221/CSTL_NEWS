// src/tabs/board.js
// Вкладка «Дошка громади» — повний список оголошень мешканців + офіційні.
// Створена 16.05.2026 — винесено з блоку Громади у власну вкладку.

import { escapeHtml, formatTime } from '../core/utils.js';
import { openBoardModal } from './community-modal.js';

const CATEGORY_EMOJI = {
  'продам':      '💰',
  'куплю':       '🛒',
  'шукаю':       '🔍',
  'знайдено':    '🎁',
  'загубилось':  '😟',
  'подяка':      '❤️',
  'послуга':     '🔧',
  'оголошення':  '📢',
};

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

    const userPosts = (boardData.posts || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const official  = (communityData.announcements || []).slice().sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.ts || 0) - (a.ts || 0);
    });

    if (!official.length && !userPosts.length) {
      el.innerHTML = `
        <div class="board-empty">
          <p>На дошці поки порожньо.</p>
          <p>Будь першим — натисни кнопку нижче.</p>
        </div>
        <button class="cm-board-trigger" id="board-trigger" type="button">
          <span class="cm-board-trigger-icon">✏️</span>
          <span class="cm-board-trigger-text">Подати оголошення</span>
        </button>
      `;
      document.getElementById('board-trigger')?.addEventListener('click', openBoardModal);
      return;
    }

    const officialHtml = official.map(a => {
      const tilt = ((a.id * 5) % 5) - 2;
      return `
        <article class="cm-board-note cm-board-note--official" style="--tilt:${tilt}deg">
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
    }).join('');

    const userHtml = userPosts.map(p => {
      const tilt = ((p.id * 7) % 9) - 4;
      const emoji = CATEGORY_EMOJI[p.category] || '📌';
      const contactHtml = p.contact
        ? `<div class="cm-board-contact">${escapeHtml(p.contact)}</div>`
        : '';
      return `
        <article class="cm-board-note cm-board-note--${escapeHtml(p.color || 'yellow')}" style="--tilt:${tilt}deg">
          <span class="cm-board-pin"></span>
          <span class="cm-board-cat">${emoji} ${escapeHtml(p.category)}</span>
          <p class="cm-board-text">${escapeHtml(p.text)}</p>
          <div class="cm-board-footer">
            <span class="cm-board-author">— ${escapeHtml(p.author || 'анонімно')}</span>
            <span class="cm-board-time">${formatTime(p.ts)}</span>
          </div>
          ${contactHtml}
        </article>
      `;
    }).join('');

    el.innerHTML = `
      <div class="cm-board-corkboard board-corkboard--full">
        ${officialHtml}
        ${userHtml}
      </div>

      <button class="cm-board-trigger" id="board-trigger" type="button">
        <span class="cm-board-trigger-icon">✏️</span>
        <span class="cm-board-trigger-text">Подати оголошення</span>
      </button>
    `;

    document.getElementById('board-trigger')?.addEventListener('click', openBoardModal);
  } catch {
    el.innerHTML = '<div class="empty-state">Дошка тимчасово недоступна</div>';
  }
}

export function initBoard() {
  renderBoard();
}
