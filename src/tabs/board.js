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
      <div class="board-backdrop" id="board-backdrop"></div>
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

// Зум розгортання/згортання через FLIP-стиль:
// - Орігінал лишається на місці завдяки placeholder тих самих розмірів
// - Стікер переходить у position:fixed і анімовано їде до центру з scale > 1
// - Згорт — зворотній: стікер їде назад у placeholder + scale 1, потім видаляється placeholder
function initBoardNoteExpand(root) {
  const backdrop = root.querySelector('#board-backdrop');
  if (!backdrop) return;

  let activeNote = null;
  let isAnimating = false;
  const DURATION = 320;
  const EASE = 'cubic-bezier(0.32, 0.72, 0, 1)';

  const showBackdrop = () => {
    requestAnimationFrame(() => backdrop.classList.add('visible'));
  };
  const hideBackdrop = () => {
    backdrop.classList.remove('visible');
  };

  const expand = (note) => {
    if (isAnimating || activeNote) return;
    isAnimating = true;

    const rect = note.getBoundingClientRect();
    const origW = rect.width;
    const origH = rect.height;
    const tilt = note.style.getPropertyValue('--tilt') || '0deg';

    // Placeholder — займає місце на дошці поки стікер «знятий»
    const placeholder = document.createElement('div');
    placeholder.className = 'cm-board-placeholder';
    placeholder.style.width = `${origW}px`;
    placeholder.style.height = `${origH}px`;
    note.parentNode.insertBefore(placeholder, note);
    note._placeholder = placeholder;
    note._tilt = tilt;

    // Перевід у fixed у тій же візуальній позиції (без скачка)
    note.style.position = 'fixed';
    note.style.left = `${rect.left}px`;
    note.style.top = `${rect.top}px`;
    note.style.width = `${origW}px`;
    note.style.margin = '0';
    note.style.zIndex = '210';
    note.style.transformOrigin = 'center center';
    note.style.transition = 'none';
    note.style.transform = `rotate(${tilt}) scale(1)`;
    note.classList.add('expanded');

    showBackdrop();

    // Цільовий стан — центр viewport, scale підібраний щоб не виходити за межі
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const safeT = 80;   // шапка
    const safeB = 140;  // tab bar + fixed CTA + safe area
    const usableH = vh - safeT - safeB;
    const targetMaxW = Math.min(vw - 32, 380);
    const scaleW = targetMaxW / origW;
    const scaleH = usableH / origH;
    const scale = Math.max(1.05, Math.min(2.4, scaleW, scaleH));
    const targetLeft = (vw - origW) / 2;
    const targetTop  = (vh - origH) / 2;

    // Два rAF — щоб браузер встиг застосувати початковий стан до transition
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        note.style.transition = `left ${DURATION}ms ${EASE}, top ${DURATION}ms ${EASE}, transform ${DURATION}ms ${EASE}, box-shadow ${DURATION}ms ease`;
        note.style.left = `${targetLeft}px`;
        note.style.top = `${targetTop}px`;
        note.style.transform = `rotate(0deg) scale(${scale})`;
      });
    });

    activeNote = note;
    setTimeout(() => { isAnimating = false; }, DURATION);
  };

  const collapse = () => {
    if (!activeNote || isAnimating) return;
    isAnimating = true;

    const note = activeNote;
    const placeholder = note._placeholder;
    const tilt = note._tilt || '0deg';

    if (placeholder) {
      const phRect = placeholder.getBoundingClientRect();
      note.style.left = `${phRect.left}px`;
      note.style.top = `${phRect.top}px`;
      note.style.transform = `rotate(${tilt}) scale(1)`;
    }

    hideBackdrop();

    setTimeout(() => {
      note.classList.remove('expanded');
      ['position','left','top','width','margin','zIndex','transform','transition','transformOrigin'].forEach(p => {
        note.style[p] = '';
      });
      placeholder?.remove();
      delete note._placeholder;
      delete note._tilt;
      isAnimating = false;
      activeNote = null;
    }, DURATION);
  };

  root.querySelectorAll('.cm-board-note').forEach(note => {
    note.addEventListener('click', e => {
      e.stopPropagation();
      if (isAnimating) return;
      if (note === activeNote) collapse();
      else if (!activeNote) expand(note);
    });
  });

  backdrop.addEventListener('click', collapse);
}

export function initBoard() {
  renderBoard();
}
