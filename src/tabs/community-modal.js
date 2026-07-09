// src/tabs/community-modal.js
// Bottom-sheet модалка «Нове оголошення на Дошці громади» — ТІЛЬКИ маркетплейс.
//
//   🛒 Оголошення (board) — категорія + текст + фото + контакт + ім'я
//
// Тип 💬 Розмова (chat) прибрано 01.07.2026 — обговорення створюються
// з вкладки «Чати» → «Обговорення» (overlay). Так Дошка = чистий маркетплейс.

import { showToast, escapeHtml, containsProfanity } from '../core/utils.js';
import { submitPost, isSupabaseReady, uploadPhotoToStorage } from '../core/supabase.js';
import { isLoggedIn, currentUserName, getProfile } from '../core/auth.js';
import { SETTLEMENTS, COMMUNITY_ALL, COMMUNITY_ALL_LABEL } from '../core/settlements.js';

// Порядок категорій дзеркалить групування фільтра на вкладці Дошка:
// купівля-продаж → пошук → послуга → знахідки/втрати.
// Кольори — семантичні (колір = зміст тега): купити=зелений, продати=червоний,
// шукаю=синій, послуга=фіолетовий, знайдено/загубилось=бурштин (спільна тема).
// «Оголошення» прибрано (уся Дошка = оголошення, окрема категорія зайва).
const BOARD_CATEGORIES = [
  { id: 'продам',     emoji: '💰', color: 'red'    },
  { id: 'куплю',      emoji: '🛒', color: 'green'  },
  { id: 'шукаю',      emoji: '🔍', color: 'blue'   },
  { id: 'послуга',    emoji: '🔧', color: 'purple' },
  { id: 'знайдено',   emoji: '🎁', color: 'amber'  },
  { id: 'загубилось', emoji: '😟', color: 'amber'  },
];

// Чи виглядає рядок як телефон
function isPhone(s) {
  return /^[\+\d][\d\s\-\(\)]{5,}$/.test(String(s || '').trim());
}

// Лише ім'я (перше слово) без прізвища.
// 'Житель' — службовий дефолт (не справжнє ім'я) → вважаємо порожнім.
function firstNameOnly(full) {
  const w = String(full || '').trim().split(/\s+/)[0] || '';
  return w === 'Житель' ? '' : w;
}

// Ім'я для підпису поста = ім'я з акаунта (без прізвища).
function accountAuthorName() {
  return firstNameOnly(currentUserName()) || 'Житель';
}

// Стискаємо фото на клієнті → повертаємо Blob (JPEG ~50-200KB).
function compressImage(file) {
  return new Promise(function executor(resolve, reject) {
    const reader = new FileReader();
    reader.onload = e => {
      const img = new Image();
      img.onload = () => {
        const maxDim = 800;
        let w = img.width, h = img.height;
        if (w > h && w > maxDim) { h = h * maxDim / w; w = maxDim; }
        else if (h > maxDim)     { w = w * maxDim / h; h = maxDim; }
        const canvas = document.createElement('canvas');
        canvas.width = Math.round(w);
        canvas.height = Math.round(h);
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        canvas.toBlob(
          blob => blob ? resolve(blob) : reject(new Error('toBlob failed')),
          'image/jpeg',
          0.78,
        );
      };
      img.onerror = reject;
      img.src = e.target.result;
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

export function openBoardModal() {
  if (document.getElementById('cm-board-modal')) return;

  // Стан форми — тільки поля оголошення (chat/tagsRaw видалено)
  const state = {
    text: '',
    photos: [],         // URL-и фото: blob: під час upload, https: після
    uploadingCount: 0,  // скільки фото зараз заливаються у Storage — блокує submit
    author: accountAuthorName(),
    category: 'продам',
    contact: '',
    title: '',
    location: COMMUNITY_ALL,   // Д-10: дефолт — вся громада
  };

  const wrap = document.createElement('div');
  wrap.id = 'cm-board-modal';
  wrap.className = 'cm-board-modal';
  wrap.innerHTML = `
    <div class="cm-board-modal-backdrop"></div>
    <div class="cm-board-modal-panel" role="dialog" aria-modal="true">
      <div class="cm-board-modal-handle"></div>
      <button class="cm-board-modal-close" type="button" aria-label="Закрити">✕</button>
      <h3 class="cm-board-modal-title">✏️ Нове оголошення</h3>
      <p class="cm-board-modal-sub">Заповніть поля нижче.</p>

      <form id="cm-board-modal-form" novalidate>
        <!-- Динамічна частина -->
        <div id="bm-dynamic"></div>

        <!-- LIVE-preview -->
        <div class="bm-preview-section" id="bm-preview-section">
          <div class="bm-preview-label">Як виглядатиме на дошці</div>
          <div class="bm-preview-canvas" id="bm-preview-canvas"></div>
        </div>

        <button class="cm-board-submit" type="submit">Опублікувати</button>
        <p class="cm-board-hint">Запит йде модератору. Після перевірки зʼявиться на дошці.</p>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => wrap.classList.add('open'));

  // ── Close ──
  function close() {
    state.photos.forEach(p => { if (p && p.startsWith('blob:')) URL.revokeObjectURL(p); });
    wrap.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => wrap.remove(), 220);
  }
  wrap.querySelector('.cm-board-modal-backdrop')?.addEventListener('click', close);
  wrap.querySelector('.cm-board-modal-close')?.addEventListener('click', close);
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });

  // ── Свайп вниз → закрити ──
  const panel  = wrap.querySelector('.cm-board-modal-panel');
  const handle = wrap.querySelector('.cm-board-modal-handle');
  let dragStartY = 0, dragging = false, dragDelta = 0;

  panel.addEventListener('touchstart', e => {
    const onHandle = handle && (e.target === handle || handle.contains(e.target));
    dragging = onHandle || panel.scrollTop <= 2;
    if (!dragging) return;
    dragStartY = e.touches[0].clientY;
    dragDelta = 0;
    panel.style.transition = 'none';
  }, { passive: true });

  panel.addEventListener('touchmove', e => {
    if (!dragging) return;
    dragDelta = e.touches[0].clientY - dragStartY;
    if (dragDelta <= 0) { panel.style.transform = 'translateY(0)'; return; }
    e.preventDefault();
    panel.style.transform = `translateY(${dragDelta}px)`;
  }, { passive: false });

  panel.addEventListener('touchend', () => {
    if (!dragging) return;
    dragging = false;
    if (dragDelta > 90) {
      panel.style.transition = 'transform 0.25s ease-in';
      panel.style.transform  = 'translateY(100%)';
      setTimeout(close, 240);
    } else {
      panel.style.transition = 'transform 0.3s cubic-bezier(0.32,0.72,0,1)';
      panel.style.transform  = 'translateY(0)';
      setTimeout(() => { panel.style.transition = ''; panel.style.transform = ''; }, 300);
    }
    dragDelta = 0;
  }, { passive: true });

  // ── Рендер полів оголошення ──
  const dynamicEl = wrap.querySelector('#bm-dynamic');

  function renderBoardFields() {
    dynamicEl.innerHTML = `
      <div class="bm-section">
        <label class="bm-label">Категорія</label>
        <div class="bm-chips" id="bm-chips">
          ${BOARD_CATEGORIES.map(c => `
            <button type="button" class="bm-chip${c.id === state.category ? ' active' : ''}" data-cat="${c.id}">
              <span class="bm-chip-emoji">${c.emoji}</span>
              <span class="bm-chip-label">${c.id}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-title">Заголовок <span class="bm-label-req">*</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-title" type="text" maxlength="80" required placeholder="Напр. Продам мотоцикл" value="${escapeHtml(state.title)}">
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-location">Локація</label>
        <select class="cm-board-input cm-board-input--small" id="bm-location">
          <option value="${escapeHtml(COMMUNITY_ALL)}"${state.location === COMMUNITY_ALL ? ' selected' : ''}>${escapeHtml(COMMUNITY_ALL_LABEL)}</option>
          ${SETTLEMENTS.map(s => `<option value="${escapeHtml(s)}"${state.location === s ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}
        </select>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-text">Опис</label>
        <textarea class="cm-board-input" id="bm-text" rows="4" placeholder="Що хочете повідомити громаді?" required>${escapeHtml(state.text)}</textarea>
      </div>

      <div class="bm-section">
        <label class="bm-label">Фото <span class="bm-label-hint">(необов'язково, до 3)</span></label>
        ${photoSlotsHtml()}
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-contact">Контакт <span class="bm-label-hint">(телефон / Telegram)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-contact" type="text" placeholder="+38 050 ___ __ __" inputmode="tel" value="${escapeHtml(state.contact)}">
      </div>

      <div class="bm-section">
        <label class="bm-label">Ім'я</label>
        <div class="bm-author-fixed" id="bm-author-fixed">👤 ${escapeHtml(state.author)}</div>
      </div>
    `;

    // Категорії
    dynamicEl.querySelectorAll('.bm-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        dynamicEl.querySelectorAll('.bm-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.category = btn.dataset.cat;
        renderPreview();
      });
    });
    // Заголовок
    dynamicEl.querySelector('#bm-title')?.addEventListener('input', e => {
      state.title = e.target.value;
      renderPreview();
    });
    // Локація
    dynamicEl.querySelector('#bm-location')?.addEventListener('change', e => {
      state.location = e.target.value;
      renderPreview();
    });
    // Опис
    dynamicEl.querySelector('#bm-text')?.addEventListener('input', e => {
      state.text = e.target.value;
      renderPreview();
    });
    // Контакт
    dynamicEl.querySelector('#bm-contact')?.addEventListener('input', e => {
      state.contact = e.target.value;
      renderPreview();
    });
    bindPhotoSlots();
  }

  function photoSlotsHtml(count = 3) {
    return `
      <div class="bm-photos" id="bm-photos">
        ${Array.from({length: count}, (_, i) => `
          <label class="bm-photo-slot${state.photos[i] ? ' filled' : ''}" data-idx="${i}" ${state.photos[i] ? `style="background-image:url('${state.photos[i]}')"` : ''}>
            <input type="file" accept="image/*" hidden>
            <span class="bm-photo-plus${state.photos[i] ? ' bm-photo-remove' : ''}">${state.photos[i] ? '✕' : '＋'}</span>
          </label>
        `).join('')}
      </div>
    `;
  }

  function bindPhotoSlots() {
    dynamicEl.querySelectorAll('.bm-photo-slot').forEach(slot => {
      const input = slot.querySelector('input[type="file"]');
      const idx = parseInt(slot.dataset.idx, 10);
      input.addEventListener('change', async () => {
        const file = input.files[0];
        if (!file) return;

        let blob;
        try {
          blob = await compressImage(file);
        } catch {
          showToast('Не вдалось обробити фото', 3000);
          return;
        }
        const localUrl = URL.createObjectURL(blob);
        state.photos[idx] = localUrl;
        slot.classList.add('filled', 'uploading');
        slot.style.backgroundImage = `url("${localUrl}")`;
        slot.querySelector('.bm-photo-plus').textContent = '✕';
        slot.querySelector('.bm-photo-plus').classList.add('bm-photo-remove');
        renderPreview();

        state.uploadingCount++;
        updateSubmitState();
        const { url, error } = await uploadPhotoToStorage(blob);
        state.uploadingCount--;
        updateSubmitState();

        if (error || !url) {
          showToast('Не вдалось зберегти фото — спробуй ще раз', 3500);
          URL.revokeObjectURL(localUrl);
          state.photos[idx] = null;
          slot.classList.remove('filled', 'uploading');
          slot.style.backgroundImage = '';
          const span = slot.querySelector('.bm-photo-plus');
          span.textContent = '＋';
          span.classList.remove('bm-photo-remove');
          input.value = '';
          renderPreview();
          return;
        }

        if (state.photos[idx] === localUrl) {
          state.photos[idx] = url;
          slot.classList.remove('uploading');
        }
        URL.revokeObjectURL(localUrl);
      });
      slot.querySelector('.bm-photo-plus').addEventListener('click', e => {
        if (slot.classList.contains('filled')) {
          e.preventDefault();
          const old = state.photos[idx];
          if (old && old.startsWith('blob:')) URL.revokeObjectURL(old);
          state.photos[idx] = null;
          slot.classList.remove('filled', 'uploading');
          slot.style.backgroundImage = '';
          const span = slot.querySelector('.bm-photo-plus');
          span.textContent = '＋';
          span.classList.remove('bm-photo-remove');
          input.value = '';
          renderPreview();
        }
      });
    });
  }

  // Disable кнопки «Опублікувати» поки хоч одне фото вантажиться у Storage
  function updateSubmitState() {
    const btn = wrap.querySelector('.cm-board-submit');
    if (!btn) return;
    if (state.uploadingCount > 0) {
      btn.disabled = true;
      btn.textContent = `Завантаження фото…`;
    } else {
      btn.disabled = false;
      btn.textContent = 'Опублікувати';
    }
  }

  // ── LIVE-preview ──
  const previewCanvas = wrap.querySelector('#bm-preview-canvas');

  function renderPreview() {
    const cat = BOARD_CATEGORIES.find(c => c.id === state.category)
      || BOARD_CATEGORIES.find(c => c.id === 'оголошення');
    const firstPhoto = state.photos.find(p => p);
    const contactTrim = state.contact.trim();
    const contactHtml = contactTrim ? `
      <div class="cm-board-contact${isPhone(contactTrim) ? ' cm-board-contact--phone' : ''}">
        ${escapeHtml(contactTrim)}
      </div>` : '';
    previewCanvas.innerHTML = `
      <article class="cm-board-note${firstPhoto ? ' cm-board-note--has-photo' : ''}" style="--tilt:0deg">
        <span class="cm-board-pin"></span>
        ${firstPhoto ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${firstPhoto}" alt=""></div>` : ''}
        <span class="cm-board-cat cm-board-cat--${cat.color}">${cat.emoji} ${escapeHtml(state.category)}</span>
        <h3 class="cm-board-title">${state.title.trim() ? escapeHtml(state.title.trim()) : 'Заголовок оголошення'}</h3>
        ${state.location && state.location !== COMMUNITY_ALL ? `<span class="cm-board-loc">📍 ${escapeHtml(state.location)}</span>` : ''}
        <p class="cm-board-text">${escapeHtml(state.text.trim() || 'Текст оголошення зʼявиться тут…')}</p>
        <div class="cm-board-footer">
          <span class="cm-board-author">— ${escapeHtml(state.author.trim() || 'Житель')}</span>
          <span class="cm-board-time">щойно</span>
        </div>
        ${contactHtml}
      </article>
    `;
  }

  // Початковий рендер
  renderBoardFields();
  renderPreview();
  setTimeout(() => wrap.querySelector('#bm-text')?.focus(), 200);

  // Уточнюємо ім'я з профілю в БД (кеш міг бути ще не готовий при відкритті).
  if (isLoggedIn()) {
    getProfile().then(p => {
      const nm = firstNameOnly((p && p.name) || currentUserName()) || 'Житель';
      if (nm === state.author) return;
      state.author = nm;
      const el = dynamicEl.querySelector('#bm-author-fixed');
      if (el) el.textContent = `👤 ${nm}`;
      renderPreview();
    }).catch(() => {});
  }

  // ── Submit ──
  wrap.querySelector('#cm-board-modal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.title.trim()) {
      showToast('Додайте заголовок оголошення', 2500);
      wrap.querySelector('#bm-title')?.focus();
      return;
    }
    if (!state.text.trim()) {
      showToast('Будь ласка, заповніть текст', 2500);
      wrap.querySelector('#bm-text')?.focus();
      return;
    }
    if (containsProfanity(state.text) || containsProfanity(state.contact)) {
      showToast('🚫 Повідомлення містить заборонені слова і не надіслане', 4500, 'error');
      wrap.querySelector('#bm-text')?.focus();
      return;
    }
    if (state.uploadingCount > 0 || state.photos.some(p => p && p.startsWith('blob:'))) {
      showToast('Зачекай, фото завантажується…', 2500);
      return;
    }

    const submitBtn = wrap.querySelector('.cm-board-submit');
    if (submitBtn) {
      submitBtn.disabled = true;
      submitBtn.textContent = 'Надсилаємо…';
    }

    const payload = buildPayload(state);

    let published = false;   // довірений автор (5+ схвалених) → пост опубліковано одразу
    if (isSupabaseReady()) {
      const result = await submitPost(payload);
      if (!result.ok) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Опублікувати';
        }
        showToast('Помилка: ' + (result.error || 'не вдалось надіслати'), 4500);
        return;
      }
      published = result.status === 'published';
    } else {
      console.info('[submit] Supabase не готовий — payload збережено лише локально:', payload);
    }

    close();
    if (published) {
      // Дошка вже слухає цю подію (board.js) — оновиться і покаже пост одразу.
      window.dispatchEvent(new Event('cstl-posts-changed'));
      showToast('Опубліковано ✓ Ви довірений автор.', 4000);
    } else {
      showToast('Дякуємо! Запит надіслано модератору.', 4000);
    }
  });
}

// Готує payload у форматі таблиці Supabase `posts` (тільки type='board').
// status/owner_uid НЕ передаються — RPC submit_board_post (супутній
// scripts/supabase_reputation.sql) форсує їх сам на сервері.
function buildPayload(state) {
  const cat = BOARD_CATEGORIES.find(c => c.id === state.category)
    || BOARD_CATEGORIES.find(c => c.id === 'оголошення');
  return {
    type:      'board',
    text:      state.text.trim(),
    author:    state.author.trim() || 'Житель',
    photos:    state.photos.filter(Boolean),
    category:  state.category,
    color:     cat.color,
    contact:   state.contact.trim() || null,
    title:     state.title.trim(),   // обов'язковий (Д-16); сервер теж перевіряє
    location:  state.location || COMMUNITY_ALL,   // Д-10
    tags:      [],
  };
}
