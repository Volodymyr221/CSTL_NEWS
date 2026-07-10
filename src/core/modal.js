// src/core/modal.js
// Спільний примітив модалки (Потік C1, стандартизація — docs/PLAN_MODALS_STANDARDIZATION.md).
// Раніше кожна фіча мала власну реалізацію (createElement + backdrop + swipe) — ~15 копій
// майже однакової логіки. Цей примітив — перший крок: chrome (backdrop/панель/закриття),
// НЕ чіпає складний вміст (графіки, keyboard-aware чат тощо) — той лишається за викликачем
// через bodyHtml/onMount.
//
// variant:
//   'sheet'  — виїжджає знизу (handle, свайп-вниз закриває). Погода/Сайдбар/Світло/Автобуси.
//   'center' — центрована картка, scale-in. Акаунт (join/profile/cabinet екрани).

import { escapeHtml } from './utils.js';

let _active = null;   // { el, close } — лише одна активна модалка примітиву за раз

function buildSheet({ title, bodyHtml }) {
  return `
    <div class="app-modal-backdrop"></div>
    <div class="app-modal-sheet" role="dialog" aria-modal="true"${title ? ` aria-label="${escapeHtml(title)}"` : ''}>
      <div class="app-modal-handle"></div>
      <button class="app-modal-close" type="button" aria-label="Закрити">✕</button>
      ${title ? `<h2 class="app-modal-title">${escapeHtml(title)}</h2>` : ''}
      <div class="app-modal-body">${bodyHtml}</div>
    </div>`;
}

function buildCenter({ title, bodyHtml }) {
  return `
    <div class="app-modal-backdrop"></div>
    <div class="app-modal-card" role="dialog" aria-modal="true">
      <button class="app-modal-close" type="button" aria-label="Закрити">✕</button>
      ${title ? `<h2 class="app-modal-title">${escapeHtml(title)}</h2>` : ''}
      <div class="app-modal-body">${bodyHtml}</div>
    </div>`;
}

// Відкриває модалку. onMount(wrap) — щоб викликач дов'язав власні обробники до bodyHtml.
// onClose() — викликається ОДИН раз перед закриттям (будь-яким шляхом: backdrop/X/ESC/свайп) —
// для прибирання ресурсів викликача (напр. URL.revokeObjectURL на blob-фото).
// Повертає { close, el }. swipeClose=false вимикає свайп (напр. коли всередині свій скрол-жест).
export function openModal({ title = '', bodyHtml = '', variant = 'sheet', onMount, onClose, swipeClose = true, className = '' } = {}) {
  closeModal();   // одна модалка примітиву за раз — друга просто заміняє першу

  const wrap = document.createElement('div');
  wrap.className = `app-modal app-modal--${variant}${className ? ' ' + className : ''}`;
  wrap.innerHTML = variant === 'center' ? buildCenter({ title, bodyHtml }) : buildSheet({ title, bodyHtml });
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => wrap.classList.add('open'));

  const backdrop = wrap.querySelector('.app-modal-backdrop');
  const panel    = wrap.querySelector('.app-modal-sheet, .app-modal-card');
  const closeBtn = wrap.querySelector('.app-modal-close');

  const onKey = e => { if (e.key === 'Escape') close(); };
  document.addEventListener('keydown', onKey);

  function close() {
    if (_active?.el !== wrap) return;
    _active = null;
    onClose?.();
    wrap.classList.remove('open');
    document.body.classList.remove('modal-open');
    document.removeEventListener('keydown', onKey);
    setTimeout(() => wrap.remove(), 240);
  }

  backdrop?.addEventListener('click', close);
  closeBtn?.addEventListener('click', close);

  // Свайп-вниз закриває (лише sheet-варіант; ігнорує старт коли вміст сам скролиться).
  if (variant === 'sheet' && swipeClose && panel) {
    let startY = 0, dragging = false, dy = 0;
    panel.addEventListener('touchstart', e => {
      if (panel.scrollTop > 2) return;
      startY = e.touches[0].clientY; dragging = true; dy = 0;
      panel.style.transition = 'none';
    }, { passive: true });
    panel.addEventListener('touchmove', e => {
      if (!dragging) return;
      dy = e.touches[0].clientY - startY;
      if (dy < 0) { panel.style.transform = ''; return; }
      panel.style.transform = `translateY(${dy}px)`;
    }, { passive: true });
    panel.addEventListener('touchend', () => {
      if (!dragging) return;
      dragging = false;
      panel.style.transition = '';
      if (dy > 90) close();
      else panel.style.transform = '';
      dy = 0;
    });
  }

  onMount?.(wrap);
  _active = { el: wrap, close };
  return { close, el: wrap };
}

// Закрити поточну активну модалку примітиву (якщо є).
export function closeModal() {
  _active?.close();
}
