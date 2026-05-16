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

// SVG слухавки (для кнопки виклика на оголошеннях з телефоном)
const PHONE_ICON_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>';

// Контакт = телефон (починається з + або цифри). Інакше — текст (Telegram, email).
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
      <a class="cm-board-call" href="tel:${escapeHtml(tel)}"
         onclick="event.stopPropagation()" aria-label="Зателефонувати ${escapeHtml(trimmed)}">
        ${PHONE_ICON_SVG}
      </a>
    </div>
  `;
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
      const contactHtml = renderContact(p.contact);
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
      <div class="board-backdrop" id="board-backdrop" hidden></div>
      <div class="cm-board-corkboard board-corkboard--full">
        ${officialHtml}
        ${userHtml}
      </div>

      <button class="cm-board-trigger board-trigger--fixed" id="board-trigger" type="button">
        <span class="cm-board-trigger-icon">✏️</span>
        <span class="cm-board-trigger-text">Подати оголошення</span>
      </button>
    `;

    document.getElementById('board-trigger')?.addEventListener('click', openBoardModal);
    initBoardNoteExpand(el);
  } catch {
    el.innerHTML = '<div class="empty-state">Дошка тимчасово недоступна</div>';
  }
}

// Тап на папірець → збільшити (.expanded + backdrop).
// Тап на backdrop або інший папірець → згорнути з анімацією.
function initBoardNoteExpand(root) {
  const backdrop = root.querySelector('#board-backdrop');
  if (!backdrop) return;

  let isAnimating = false;
  const COLLAPSE_MS = 200;

  // Миттєвий скид без анімації — для перемикання на інший папірець.
  const removeExpand = () => {
    root.querySelectorAll('.cm-board-note').forEach(n =>
      n.classList.remove('expanded', 'collapsing')
    );
    backdrop.classList.remove('fading-out');
    backdrop.hidden = true;
  };

  // М'який згорт з reverse-анімацією.
  const collapseAnimated = () => {
    if (isAnimating) return;
    const expanded = root.querySelector('.cm-board-note.expanded');
    if (!expanded) { removeExpand(); return; }
    isAnimating = true;
    expanded.classList.add('collapsing');
    backdrop.classList.add('fading-out');
    setTimeout(() => {
      removeExpand();
      isAnimating = false;
    }, COLLAPSE_MS);
  };

  root.querySelectorAll('.cm-board-note').forEach(note => {
    note.addEventListener('click', e => {
      e.stopPropagation();
      if (isAnimating) return;
      const isExpanded = note.classList.contains('expanded');
      if (isExpanded) {
        collapseAnimated();
      } else {
        removeExpand();
        note.classList.add('expanded');
        backdrop.hidden = false;
      }
    });
  });

  backdrop.addEventListener('click', collapseAnimated);
}

export function initBoard() {
  renderBoard();
}
