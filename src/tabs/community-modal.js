// src/tabs/community-modal.js
// Bottom-sheet модалка «Додати на Дошку громади» — 3 типи постів (17.05.2026):
//
//   🛒 Оголошення (board) — категорія + текст + фото + контакт + ім'я
//   💬 Розмова (chat)     — текст + хештеги + фото + ім'я
//   🎉 Вітання (greeting) — кому + текст + emoji-обкладинка + ім'я
//
// Submit-handler наразі заглушка (Фаза 9 Спринт 1 → Supabase POST у posts).

import { showToast, escapeHtml } from '../core/utils.js';
import { submitPost, isSupabaseReady, uploadPhotoToStorage } from '../core/supabase.js';

const TYPE_TABS = [
  { id: 'board',    emoji: '🛒', label: 'Оголошення' },
  { id: 'chat',     emoji: '💬', label: 'Розмова' },
  { id: 'greeting', emoji: '🎉', label: 'Вітання' },
];

const BOARD_CATEGORIES = [
  { id: 'продам',     emoji: '💰', color: 'yellow' },
  { id: 'куплю',      emoji: '🛒', color: 'green'  },
  { id: 'шукаю',      emoji: '🔍', color: 'blue'   },
  { id: 'знайдено',   emoji: '🎁', color: 'yellow' },
  { id: 'загубилось', emoji: '😟', color: 'pink'   },
  { id: 'подяка',     emoji: '❤️', color: 'white'  },
  { id: 'послуга',    emoji: '🔧', color: 'blue'   },
  { id: 'оголошення', emoji: '📢', color: 'pink'   },
];

const GREETING_PRESETS = [
  { emoji: '🎂', gradient: 'linear-gradient(135deg, #FFD1DC 0%, #FFB6C1 100%)', label: 'День народження' },
  { emoji: '👶', gradient: 'linear-gradient(135deg, #B5E2FA 0%, #87CEEB 100%)', label: 'Новонароджений' },
  { emoji: '💍', gradient: 'linear-gradient(135deg, #FFF9E6 0%, #FFECB3 100%)', label: 'Весілля' },
  { emoji: '🎓', gradient: 'linear-gradient(135deg, #E1BEE7 0%, #BA68C8 100%)', label: 'Випуск' },
  { emoji: '❤️', gradient: 'linear-gradient(135deg, #FFB6C1 0%, #FF9494 100%)', label: 'Подяка' },
  { emoji: '🌳', gradient: 'linear-gradient(135deg, #C5E1A5 0%, #8BC34A 100%)', label: 'Природа' },
  { emoji: '🎉', gradient: 'linear-gradient(135deg, #FFE0B2 0%, #FFB74D 100%)', label: 'Свято' },
  { emoji: '🕊️', gradient: 'linear-gradient(135deg, #E0E0E0 0%, #BDBDBD 100%)', label: 'Памʼять' },
];

// Чи виглядає рядок як телефон
function isPhone(s) {
  return /^[\+\d][\d\s\-\(\)]{5,}$/.test(String(s || '').trim());
}

// Парсинг хештегів з рядка «#громада #дороги #свято» → ['#громада', '#дороги', '#свято']
function parseTags(str) {
  return String(str || '')
    .split(/\s+/)
    .map(s => s.trim())
    .filter(Boolean)
    .map(s => s.startsWith('#') ? s : '#' + s);
}

// Стискаємо фото на клієнті → повертаємо Blob (JPEG ~50-200KB).
// Раніше повертали dataURL (base64) — лишило ~150KB тексту у БД на кожне фото.
// Тепер blob йде у Supabase Storage, у БД зберігається тільки публічний URL.
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

  // Поточний стан форми
  const state = {
    type: 'board',
    // SPILNI
    text: '',
    photos: [],         // URL-и фото: blob: під час upload, https: після
    uploadingCount: 0,  // скільки фото зараз заливаються у Storage — блокує submit
    author: '',
    // BOARD
    category: 'оголошення',
    contact: '',
    // CHAT
    tagsRaw: '',
    // GREETING
    title: '',
    greetingIdx: 0,
  };

  const wrap = document.createElement('div');
  wrap.id = 'cm-board-modal';
  wrap.className = 'cm-board-modal';
  wrap.innerHTML = `
    <div class="cm-board-modal-backdrop"></div>
    <div class="cm-board-modal-panel" role="dialog" aria-modal="true">
      <div class="cm-board-modal-handle"></div>
      <button class="cm-board-modal-close" type="button" aria-label="Закрити">✕</button>
      <h3 class="cm-board-modal-title">✏️ Новий пост</h3>
      <p class="cm-board-modal-sub">Оберіть тип і заповніть поля.</p>

      <form id="cm-board-modal-form" novalidate>
        <!-- Перемикач типу (3 таби) -->
        <div class="bm-type-tabs" id="bm-type-tabs">
          ${TYPE_TABS.map(t => `
            <button type="button" class="bm-type-tab${t.id === state.type ? ' active' : ''}" data-type="${t.id}">
              <span class="bm-type-emoji">${t.emoji}</span>
              <span class="bm-type-label">${t.label}</span>
            </button>
          `).join('')}
        </div>

        <!-- Динамічна частина — змінюється під тип -->
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
    wrap.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => wrap.remove(), 220);
  }
  wrap.querySelector('.cm-board-modal-backdrop')?.addEventListener('click', close);
  wrap.querySelector('.cm-board-modal-close')?.addEventListener('click', close);
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });

  // ── Перемикач типу ──
  wrap.querySelectorAll('.bm-type-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      if (state.type === btn.dataset.type) return;
      wrap.querySelectorAll('.bm-type-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.type = btn.dataset.type;
      renderDynamic();
      renderPreview();
    });
  });

  // ── Рендеримо динамічну частину під поточний тип ──
  const dynamicEl = wrap.querySelector('#bm-dynamic');

  function renderDynamic() {
    if (state.type === 'board')    return renderBoardFields();
    if (state.type === 'chat')     return renderChatFields();
    if (state.type === 'greeting') return renderGreetingFields();
  }

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
        <label class="bm-label" for="bm-author">Ім'я <span class="bm-label-hint">(порожнє — анонімно)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-author" type="text" placeholder="Ваше ім'я" value="${escapeHtml(state.author)}">
      </div>
    `;
    bindCommonFields();
    // Категорії
    dynamicEl.querySelectorAll('.bm-chip').forEach(btn => {
      btn.addEventListener('click', () => {
        dynamicEl.querySelectorAll('.bm-chip').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.category = btn.dataset.cat;
        renderPreview();
      });
    });
    // Контакт
    dynamicEl.querySelector('#bm-contact')?.addEventListener('input', e => {
      state.contact = e.target.value;
      renderPreview();
    });
    bindPhotoSlots();
  }

  function renderChatFields() {
    dynamicEl.innerHTML = `
      <div class="bm-section">
        <label class="bm-label" for="bm-text">Повідомлення</label>
        <textarea class="cm-board-input" id="bm-text" rows="4" placeholder="Хочу спитати громаду..." required>${escapeHtml(state.text)}</textarea>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-tags">Теми <span class="bm-label-hint">(через пробіл, напр. #громада #дороги)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-tags" type="text" placeholder="#громада #дороги" value="${escapeHtml(state.tagsRaw)}">
      </div>

      <div class="bm-section">
        <label class="bm-label">Фото <span class="bm-label-hint">(необов'язково, 1)</span></label>
        ${photoSlotsHtml(1)}
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-author">Ім'я <span class="bm-label-hint">(порожнє — анонімно)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-author" type="text" placeholder="Ваше ім'я" value="${escapeHtml(state.author)}">
      </div>
    `;
    bindCommonFields();
    // Теги
    dynamicEl.querySelector('#bm-tags')?.addEventListener('input', e => {
      state.tagsRaw = e.target.value;
      renderPreview();
    });
    bindPhotoSlots();
  }

  function renderGreetingFields() {
    dynamicEl.innerHTML = `
      <div class="bm-section">
        <label class="bm-label">Обкладинка</label>
        <div class="bm-greet-presets" id="bm-greet-presets">
          ${GREETING_PRESETS.map((g, i) => `
            <button type="button" class="bm-greet-preset${i === state.greetingIdx ? ' active' : ''}" data-idx="${i}" style="background:${g.gradient}" aria-label="${escapeHtml(g.label)}">
              <span class="bm-greet-preset-emoji">${g.emoji}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-title">Кому <span class="bm-label-hint">(імʼя, родина, усій громаді...)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-title" type="text" placeholder="Сергію / усім матерям / родині Іванчуків" value="${escapeHtml(state.title)}">
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-text">Текст вітання</label>
        <textarea class="cm-board-input" id="bm-text" rows="4" placeholder="З Днем Народження! Здоровʼя, щастя..." required>${escapeHtml(state.text)}</textarea>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-author">Від кого <span class="bm-label-hint">(порожнє — анонімно)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-author" type="text" placeholder="Сусіди / Колектив школи" value="${escapeHtml(state.author)}">
      </div>
    `;
    bindCommonFields();
    // Title
    dynamicEl.querySelector('#bm-title')?.addEventListener('input', e => {
      state.title = e.target.value;
      renderPreview();
    });
    // Пресети обкладинки
    dynamicEl.querySelectorAll('.bm-greet-preset').forEach(btn => {
      btn.addEventListener('click', () => {
        dynamicEl.querySelectorAll('.bm-greet-preset').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.greetingIdx = parseInt(btn.dataset.idx, 10) || 0;
        renderPreview();
      });
    });
  }

  // Спільні поля: text + author
  function bindCommonFields() {
    dynamicEl.querySelector('#bm-text')?.addEventListener('input', e => {
      state.text = e.target.value;
      renderPreview();
    });
    dynamicEl.querySelector('#bm-author')?.addEventListener('input', e => {
      state.author = e.target.value;
      renderPreview();
    });
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

        // 1. Стискаємо у Blob і показуємо одразу через blob:URL — preview миттєвий
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

        // 2. У фоні заливаємо у Supabase Storage, замінюємо blob:URL на https:URL
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

        // Slot все ще цей самий і користувач не видалив його за час upload
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

  // ── LIVE-preview залежно від типу ──
  const previewCanvas = wrap.querySelector('#bm-preview-canvas');

  function renderPreview() {
    if (state.type === 'board') renderBoardPreview();
    else if (state.type === 'chat') renderChatPreview();
    else if (state.type === 'greeting') renderGreetingPreview();
  }

  function renderBoardPreview() {
    const cat = BOARD_CATEGORIES.find(c => c.id === state.category) || BOARD_CATEGORIES[7];
    const firstPhoto = state.photos.find(p => p);
    const contactTrim = state.contact.trim();
    const contactHtml = contactTrim ? `
      <div class="cm-board-contact${isPhone(contactTrim) ? ' cm-board-contact--phone' : ''}">
        ${escapeHtml(contactTrim)}
      </div>` : '';
    previewCanvas.innerHTML = `
      <article class="cm-board-note cm-board-note--${cat.color}${firstPhoto ? ' cm-board-note--has-photo' : ''}" style="--tilt:0deg">
        <span class="cm-board-pin"></span>
        ${firstPhoto ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${firstPhoto}" alt=""></div>` : ''}
        <span class="cm-board-cat">${cat.emoji} ${escapeHtml(state.category)}</span>
        <p class="cm-board-text">${escapeHtml(state.text.trim() || 'Текст оголошення зʼявиться тут…')}</p>
        <div class="cm-board-footer">
          <span class="cm-board-author">— ${escapeHtml(state.author.trim() || 'анонімно')}</span>
          <span class="cm-board-time">щойно</span>
        </div>
        ${contactHtml}
      </article>
    `;
  }

  function renderChatPreview() {
    const tags = parseTags(state.tagsRaw);
    const tagsHtml = tags.length ? `<div class="bd-chat-tags">${tags.map(t => `<span class="bd-chat-tag">${escapeHtml(t)}</span>`).join(' ')}</div>` : '';
    const firstPhoto = state.photos.find(p => p);
    const author = state.author.trim();
    const initial = author ? author.charAt(0).toUpperCase() : '👤';
    const hue = author ? (author.charCodeAt(0) * 47) % 360 : 0;
    const avatarStyle = author ? `background:hsl(${hue}deg 65% 78%);color:#fff;font-weight:600` : 'background:#f5f5f5;color:#666;font-size:18px';
    previewCanvas.innerHTML = `
      <article class="bd-card bd-card--chat">
        <div class="bd-chat-head">
          <span class="bd-avatar" style="${avatarStyle}">${escapeHtml(initial)}</span>
          <div class="bd-chat-meta">
            <span class="bd-chat-author">${escapeHtml(author || 'анонімно')}</span>
            <span class="bd-chat-time">щойно</span>
          </div>
        </div>
        <p class="bd-chat-text">${escapeHtml(state.text.trim() || 'Ваше повідомлення…')}</p>
        ${firstPhoto ? `<img class="bd-chat-photo" src="${firstPhoto}" alt="">` : ''}
        ${tagsHtml}
      </article>
    `;
  }

  function renderGreetingPreview() {
    const preset = GREETING_PRESETS[state.greetingIdx] || GREETING_PRESETS[0];
    const author = state.author.trim();
    const title = state.title.trim();
    previewCanvas.innerHTML = `
      <article class="bd-card bd-card--greeting">
        <div class="bd-greet-cover" style="background:${preset.gradient}">
          <span class="bd-greet-emoji">${preset.emoji}</span>
        </div>
        <div class="bd-greet-body">
          ${title ? `<div class="bd-greet-to">Для ${escapeHtml(title)}</div>` : ''}
          <p class="bd-greet-text">${escapeHtml(state.text.trim() || 'Текст вітання зʼявиться тут…')}</p>
          <div class="bd-greet-footer">
            <span class="bd-greet-author">— ${escapeHtml(author || 'анонімно')}</span>
            <span class="bd-greet-time">щойно</span>
          </div>
        </div>
      </article>
    `;
  }

  // Початковий рендер
  renderDynamic();
  renderPreview();
  setTimeout(() => wrap.querySelector('#bm-text')?.focus(), 200);

  // ── Submit ──
  wrap.querySelector('#cm-board-modal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.text.trim()) {
      showToast('Будь ласка, заповніть текст', 2500);
      wrap.querySelector('#bm-text')?.focus();
      return;
    }
    if (state.type === 'greeting' && !state.title.trim()) {
      showToast('Вкажіть кому вітання', 2500);
      wrap.querySelector('#bm-title')?.focus();
      return;
    }
    // Захист: не пускаємо blob:URL у БД (фото ще не завантажилось у Storage).
    // updateSubmitState() блокує кнопку, але це підстраховка на випадок race.
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

    // Якщо Supabase підключений — реальний POST у таблицю posts.
    // Якщо ні (offline / SDK не завантажився) — показуємо заглушку як було.
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
    } else {
      console.info('[submit] Supabase не готовий — payload збережено лише локально:', payload);
    }

    close();
    showToast('Дякуємо! Запит надіслано модератору.', 4000);
  });
}

// Готує payload у форматі майбутньої таблиці Supabase `posts`
function buildPayload(state) {
  const base = {
    type:     state.type,
    text:     state.text.trim(),
    author:   state.author.trim() || null,
    photos:   state.photos.filter(Boolean),
    status:   'pending',
  };
  if (state.type === 'board') {
    const cat = BOARD_CATEGORIES.find(c => c.id === state.category) || BOARD_CATEGORIES[7];
    return {
      ...base,
      category: state.category,
      color:    cat.color,
      contact:  state.contact.trim() || null,
      tags:     [],
    };
  }
  if (state.type === 'chat') {
    return {
      ...base,
      category: null,
      tags:     parseTags(state.tagsRaw),
    };
  }
  if (state.type === 'greeting') {
    const preset = GREETING_PRESETS[state.greetingIdx] || GREETING_PRESETS[0];
    return {
      ...base,
      category:       null,
      title:          state.title.trim(),
      cover_emoji:    preset.emoji,
      cover_gradient: preset.gradient,
      tags:           [],
    };
  }
  return base;
}
