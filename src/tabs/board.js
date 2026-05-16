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
      <a class="cm-board-call" href="tel:${escapeHtml(tel)}" aria-label="Зателефонувати ${escapeHtml(trimmed)}">
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
    // Кнопки виклика — окремий handler, щоб клік не "ловився" батьківським стікером
    // (інакше стікер реагує на тап і кнопка href="tel:" не встигає спрацювати).
    // capture: true — перехоплюємо до того як click дійде до стікера.
    el.querySelectorAll('.cm-board-call').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); }, { capture: true });
    });
  } catch {
    el.innerHTML = '<div class="empty-state">Дошка тимчасово недоступна</div>';
  }
}

// Зум розгортання/згортання через FLIP-стиль:
// - Стікер переходить у position:fixed на ОРІГІНАЛЬНІЙ позиції
// - Анімується ТІЛЬКИ через transform: translate3d(dx,dy) rotate(R) scale(S)
//   (плавніше ніж змінювати left/top окремо, бо браузер інтерполює ОДИН property
//   і робить GPU-композицію без re-layout)
// - Згорт — рахуємо актуальну позицію placeholder і translate-имо назад
function initBoardNoteExpand(root) {
  const backdrop = root.querySelector('#board-backdrop');
  if (!backdrop) return;

  let activeNote = null;
  let isAnimating = false;
  const DURATION = 340;
  const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';  // ease-out quart — плавне сповільнення

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
    const tilt = parseFloat(note.style.getPropertyValue('--tilt')) || 0;

    // Placeholder — займає місце на дошці поки стікер «знятий»
    const placeholder = document.createElement('div');
    placeholder.className = 'cm-board-placeholder';
    placeholder.style.width = `${origW}px`;
    placeholder.style.height = `${origH}px`;
    note.parentNode.insertBefore(placeholder, note);
    note._placeholder = placeholder;
    note._tilt = tilt;
    note._origLeft = rect.left;
    note._origTop = rect.top;

    // Цільовий стан — центр viewport, scale підібраний щоб не виходити за межі
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const safeT = 80;
    const safeB = 140;
    const usableH = vh - safeT - safeB;
    const targetMaxW = Math.min(vw - 32, 380);
    const scaleW = targetMaxW / origW;
    const scaleH = usableH / origH;
    const scale = Math.max(1.05, Math.min(2.4, scaleW, scaleH));

    // Дельта від оригінальної позиції до центру viewport
    const dx = (vw / 2) - (rect.left + origW / 2);
    const dy = (vh / 2) - (rect.top + origH / 2);

    // Фіксуємо в оригінальній позиції, потім транзишн тільки transform
    note.style.position = 'fixed';
    note.style.left = `${rect.left}px`;
    note.style.top = `${rect.top}px`;
    note.style.width = `${origW}px`;
    note.style.margin = '0';
    note.style.zIndex = '210';
    note.style.transformOrigin = 'center center';
    note.style.willChange = 'transform';
    note.style.transition = 'none';
    note.style.transform = `translate3d(0, 0, 0) rotate(${tilt}deg) scale(1)`;
    note.classList.add('expanded');

    showBackdrop();

    // Force reflow щоб браузер застосував initial state перед transition
    void note.offsetHeight;

    // Анімуємо ТІЛЬКИ transform (єдиний property → плавна 60fps GPU-анімація)
    note.style.transition = `transform ${DURATION}ms ${EASE}, box-shadow ${DURATION}ms ease`;
    note.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(0deg) scale(${scale})`;

    activeNote = note;
    setTimeout(() => { isAnimating = false; }, DURATION);
  };

  const collapse = () => {
    if (!activeNote || isAnimating) return;
    isAnimating = true;

    const note = activeNote;
    const placeholder = note._placeholder;
    const tilt = note._tilt || 0;

    if (placeholder) {
      // Беремо АКТУАЛЬНУ позицію placeholder (на випадок якщо була прокрутка)
      const phRect = placeholder.getBoundingClientRect();
      const dx = phRect.left - note._origLeft;
      const dy = phRect.top  - note._origTop;
      // Анімуємо transform назад: translate до placeholder + rotate назад до tilt + scale назад до 1
      note.style.transform = `translate3d(${dx}px, ${dy}px, 0) rotate(${tilt}deg) scale(1)`;
    }

    hideBackdrop();

    setTimeout(() => {
      note.classList.remove('expanded');
      ['position','left','top','width','margin','zIndex','transform','transition','transformOrigin','willChange'].forEach(p => {
        note.style[p] = '';
      });
      placeholder?.remove();
      delete note._placeholder;
      delete note._tilt;
      delete note._origLeft;
      delete note._origTop;
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
