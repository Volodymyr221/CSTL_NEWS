// src/tabs/community-modal.js
// Bottom-sheet модалка «Подати оголошення» (16.05.2026 — Tier 4 redesign).
// Категорії-чіпи + textarea + 3 фото (base64) + контакт + ім'я + LIVE-preview стікера.
//
// Submit-handler наразі заглушка (Фаза 3 → Supabase POST у community_posts).

import { showToast, escapeHtml } from '../core/utils.js';

const CATEGORIES = [
  { id: 'продам',     emoji: '💰', color: 'yellow' },
  { id: 'куплю',      emoji: '🛒', color: 'green'  },
  { id: 'шукаю',      emoji: '🔍', color: 'blue'   },
  { id: 'знайдено',   emoji: '🎁', color: 'yellow' },
  { id: 'загубилось', emoji: '😟', color: 'pink'   },
  { id: 'подяка',     emoji: '❤️', color: 'white'  },
  { id: 'послуга',    emoji: '🔧', color: 'blue'   },
  { id: 'оголошення', emoji: '📢', color: 'pink'   },
];

// Чи виглядає рядок як телефон (починається з + або цифри, ≥6 символів)
function isPhone(s) {
  return /^[\+\d][\d\s\-\(\)]{5,}$/.test(String(s || '').trim());
}

// Стискаємо фото на клієнті до 800px по довшій стороні + JPEG quality 0.78
// (інакше base64 у data/community-board.json роздуло б файл до мегабайтів)
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
        resolve(canvas.toDataURL('image/jpeg', 0.78));
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

  // Поточний стан форми
  const state = {
    category: 'оголошення',
    text: '',
    photos: [],   // до 3 base64-картинок
    contact: '',
    author: '',
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
      <p class="cm-board-modal-sub">Заповніть поля. Знизу — як виглядатиме на дошці.</p>

      <form id="cm-board-modal-form" novalidate>
        <!-- Категорія: чіпи -->
        <div class="bm-section">
          <label class="bm-label">Категорія</label>
          <div class="bm-chips" id="bm-chips">
            ${CATEGORIES.map(c => `
              <button type="button" class="bm-chip${c.id === state.category ? ' active' : ''}" data-cat="${c.id}">
                <span class="bm-chip-emoji">${c.emoji}</span>
                <span class="bm-chip-label">${c.id}</span>
              </button>
            `).join('')}
          </div>
        </div>

        <!-- Опис -->
        <div class="bm-section">
          <label class="bm-label" for="bm-text">Опис</label>
          <textarea class="cm-board-input" id="bm-text" rows="4" placeholder="Що хочете повідомити громаді?" required></textarea>
        </div>

        <!-- Фото -->
        <div class="bm-section">
          <label class="bm-label">Фото <span class="bm-label-hint">(необов'язково, до 3)</span></label>
          <div class="bm-photos" id="bm-photos">
            ${[0,1,2].map(i => `
              <label class="bm-photo-slot" data-idx="${i}">
                <input type="file" accept="image/*" hidden>
                <span class="bm-photo-plus">＋</span>
              </label>
            `).join('')}
          </div>
        </div>

        <!-- Контакт -->
        <div class="bm-section">
          <label class="bm-label" for="bm-contact">Контакт <span class="bm-label-hint">(телефон / Telegram)</span></label>
          <input class="cm-board-input cm-board-input--small" id="bm-contact" type="text" placeholder="+38 050 ___ __ __" inputmode="tel">
        </div>

        <!-- Ім'я -->
        <div class="bm-section">
          <label class="bm-label" for="bm-author">Ім'я <span class="bm-label-hint">(порожнє — анонімно)</span></label>
          <input class="cm-board-input cm-board-input--small" id="bm-author" type="text" placeholder="Ваше ім'я">
        </div>

        <!-- LIVE-preview -->
        <div class="bm-preview-section">
          <div class="bm-preview-label">Як виглядатиме на дошці</div>
          <div class="bm-preview-canvas">
            <article class="cm-board-note cm-board-note--${state.category === 'оголошення' ? 'pink' : 'yellow'}" id="bm-preview" style="--tilt:0deg">
              <span class="cm-board-pin"></span>
              <span class="cm-board-cat">📢 ${escapeHtml(state.category)}</span>
              <p class="cm-board-text" id="bm-preview-text">Текст оголошення зʼявиться тут…</p>
              <div class="cm-board-footer">
                <span class="cm-board-author" id="bm-preview-author">— анонімно</span>
                <span class="cm-board-time">щойно</span>
              </div>
              <div class="cm-board-contact" id="bm-preview-contact" hidden></div>
            </article>
          </div>
        </div>

        <button class="cm-board-submit" type="submit">Опублікувати</button>
        <p class="cm-board-hint">Запит йде модератору. Після перевірки зʼявиться на дошці.</p>
      </form>
    </div>
  `;
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => wrap.classList.add('open'));
  setTimeout(() => wrap.querySelector('#bm-text')?.focus(), 200);

  // ── Close ──
  function close() {
    wrap.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => wrap.remove(), 220);
  }
  wrap.querySelector('.cm-board-modal-backdrop')?.addEventListener('click', close);
  wrap.querySelector('.cm-board-modal-close')?.addEventListener('click', close);
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });

  // ── Категорії-чіпи (одиничний вибір) ──
  wrap.querySelectorAll('.bm-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      wrap.querySelectorAll('.bm-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.category = btn.dataset.cat;
      updatePreview();
    });
  });

  // ── Текст / контакт / ім'я → preview ──
  wrap.querySelector('#bm-text')?.addEventListener('input', e => {
    state.text = e.target.value;
    updatePreview();
  });
  wrap.querySelector('#bm-contact')?.addEventListener('input', e => {
    state.contact = e.target.value;
    updatePreview();
  });
  wrap.querySelector('#bm-author')?.addEventListener('input', e => {
    state.author = e.target.value;
    updatePreview();
  });

  // ── Фото-слоти ──
  wrap.querySelectorAll('.bm-photo-slot').forEach(slot => {
    const input = slot.querySelector('input[type="file"]');
    const idx = parseInt(slot.dataset.idx, 10);
    input.addEventListener('change', async () => {
      const file = input.files[0];
      if (!file) return;
      try {
        const dataUrl = await compressImage(file);
        state.photos[idx] = dataUrl;
        slot.classList.add('filled');
        slot.style.backgroundImage = `url("${dataUrl}")`;
        slot.querySelector('.bm-photo-plus').textContent = '✕';
        slot.querySelector('.bm-photo-plus').classList.add('bm-photo-remove');
        updatePreview();
      } catch {
        showToast('Не вдалось завантажити фото', 3000);
      }
    });
    // Клік на ✕ — видалити фото
    slot.querySelector('.bm-photo-plus').addEventListener('click', e => {
      if (slot.classList.contains('filled')) {
        e.preventDefault();
        state.photos[idx] = null;
        slot.classList.remove('filled');
        slot.style.backgroundImage = '';
        const span = slot.querySelector('.bm-photo-plus');
        span.textContent = '＋';
        span.classList.remove('bm-photo-remove');
        input.value = '';
        updatePreview();
      }
    });
  });

  // ── Update live-preview ──
  function updatePreview() {
    const cat = CATEGORIES.find(c => c.id === state.category) || CATEGORIES[7];
    const previewEl  = wrap.querySelector('#bm-preview');
    const textEl     = wrap.querySelector('#bm-preview-text');
    const authorEl   = wrap.querySelector('#bm-preview-author');
    const contactEl  = wrap.querySelector('#bm-preview-contact');

    // Колір стікера (className контролює background)
    previewEl.className = `cm-board-note cm-board-note--${cat.color}`;
    if (state.photos.filter(Boolean).length > 0) previewEl.classList.add('cm-board-note--has-photo');

    // Категорія
    previewEl.querySelector('.cm-board-cat').textContent = `${cat.emoji} ${cat.id}`;

    // Текст
    textEl.textContent = state.text.trim() || 'Текст оголошення зʼявиться тут…';

    // Автор
    authorEl.textContent = '— ' + (state.author.trim() || 'анонімно');

    // Контакт
    const contactTrim = state.contact.trim();
    if (contactTrim) {
      contactEl.hidden = false;
      contactEl.textContent = contactTrim;
      contactEl.classList.toggle('cm-board-contact--phone', isPhone(contactTrim));
    } else {
      contactEl.hidden = true;
    }

    // Фото у preview (перше з завантажених)
    const firstPhoto = state.photos.find(p => p);
    let photoWrap = previewEl.querySelector('.cm-board-photo-wrap');
    if (firstPhoto) {
      if (!photoWrap) {
        photoWrap = document.createElement('div');
        photoWrap.className = 'cm-board-photo-wrap';
        photoWrap.innerHTML = `<img class="cm-board-photo" src="${firstPhoto}" alt="">`;
        previewEl.insertBefore(photoWrap, previewEl.querySelector('.cm-board-cat'));
      } else {
        photoWrap.querySelector('.cm-board-photo').src = firstPhoto;
      }
    } else if (photoWrap) {
      photoWrap.remove();
    }
  }

  // ── Submit ──
  wrap.querySelector('#cm-board-modal-form')?.addEventListener('submit', (e) => {
    e.preventDefault();
    if (!state.text.trim()) {
      showToast('Введіть опис оголошення', 2500);
      wrap.querySelector('#bm-text')?.focus();
      return;
    }
    // TODO Supabase (Фаза 3): POST у таблицю community_posts зі статусом 'pending'.
    // payload готовий: { category, text, photos[], contact, author }
    close();
    showToast('Дякуємо! Запит надіслано модератору.', 4000);
  });
}
