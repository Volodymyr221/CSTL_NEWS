// src/tabs/board.js
// Вкладка «Дошка громади» — повний список оголошень мешканців + офіційні.
// Створена 16.05.2026 — винесено з блоку Громади у власну вкладку.

import { escapeHtml, formatTime, sharePost } from '../core/utils.js';
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
      // Фото (якщо є) — на стікері зверху, як на Polaroid.
      // onerror — ховаємо обгортку щоб не лишилася біла плашка з alt-текстом
      const photoHtml = p.photo
        ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${escapeHtml(p.photo)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></div>`
        : '';
      // Кнопка 📤 — Web Share API (Viber/Telegram/SMS одним тапом)
      // Текст для шеру збираємо тут, бо потім innerHTML клонується у zoom-модалку.
      const shareText = `${emoji} ${p.category}\n\n${p.text}\n— ${p.author || 'анонімно'}`;
      const shareBtn = `
        <button class="cm-board-share share-btn share-btn--corner" type="button"
                data-share-board
                data-share-title="Оголошення з Дошки громади Олики"
                data-share-text="${escapeHtml(shareText)}"
                aria-label="Поділитися оголошенням">📤</button>`;
      return `
        <article class="cm-board-note cm-board-note--${escapeHtml(p.color || 'yellow')}${p.photo ? ' cm-board-note--has-photo' : ''}" style="--tilt:${tilt}deg">
          <span class="cm-board-pin"></span>
          ${shareBtn}
          ${photoHtml}
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

// Zoom-перегляд стікера через окрему модалку (16.05.2026):
// - Тап на стікер → створюється МОДАЛКА-копія по центру з більшим font-size
// - Оригінальний стікер плавно зникає (opacity: 0) щоб виглядав «знятим з дошки»
// - Інші картки не рухаються, не зникають — backdrop їх просто димає
// - Тап на backdrop → модалка зникає, оригінал повертається
//
// Чому не FLIP/scale: transform:scale() на iOS завжди розмиває текст
// (растеризує bitmap-шар і масштабує), плюс матрична інтерполяція ламає
// траєкторію. Окрема модалка з більшим font-size — чіткий рендер без проблем.
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

    // Створюємо модалку-клон з тими ж класами (для кольору й категорії)
    const modal = document.createElement('article');
    modal.className = note.className + ' cm-board-modal-note';
    modal.innerHTML = note.innerHTML;
    document.body.appendChild(modal);

    // Кнопка виклика всередині модалки — окремий handler
    modal.querySelectorAll('.cm-board-call').forEach(btn => {
      btn.addEventListener('click', e => { e.stopPropagation(); }, { capture: true });
    });

    activeNote = note;
    activeModal = modal;

    // Ховаємо оригінал плавно (opacity 1→0)
    note.classList.add('cm-board-note--hidden');

    // Запускаємо backdrop і модалку (наступний frame щоб transition спрацював)
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

  root.querySelectorAll('.cm-board-note').forEach(note => {
    note.addEventListener('click', e => {
      e.stopPropagation();
      if (isAnimating) return;
      if (!activeNote) expand(note);
    });
  });

  backdrop.addEventListener('click', collapse);
}

// Document-level listener для кнопок 📤 — щоб охопити і оригінальні стікери,
// і клон у zoom-модалці (`expand()` копіює innerHTML у новий вузол на body).
// `once` нема — listener живе весь час життя сторінки.
let _shareListenerAttached = false;
function attachBoardShareListener() {
  if (_shareListenerAttached) return;
  _shareListenerAttached = true;
  document.addEventListener('click', e => {
    const btn = e.target.closest('[data-share-board]');
    if (!btn) return;
    // Не даємо кліку «лизнути» на стікер (інакше відкриється zoom-модалка)
    e.stopPropagation();
    sharePost({
      title: btn.dataset.shareTitle,
      text:  btn.dataset.shareText,
    });
  }, { capture: true });
}

export function initBoard() {
  attachBoardShareListener();
  renderBoard();
}
