// src/tabs/community-modal.js
// Bottom-sheet модалка «Нове оголошення на Дошці громади» — ТІЛЬКИ маркетплейс.
//
//   🛒 Оголошення (board) — категорія + текст + фото + контакт + ім'я
//
// Тип 💬 Розмова (chat) прибрано 01.07.2026 — обговорення створюються
// з вкладки «Чати» → «Обговорення» (overlay). Так Дошка = чистий маркетплейс.

import { showToast, escapeHtml, containsProfanity, compressImage, autoGrowTextarea, formatPrice } from '../core/utils.js';
import { submitPost, updateBoardPost, isSupabaseReady } from '../core/supabase.js';
import { uploadBlobWithRetry } from '../core/upload.js';   // повтор upload при збої (blob уже стиснуто для прев'ю)
import { isLoggedIn, currentUserName, getProfile } from '../core/auth.js';
import { SETTLEMENTS, COMMUNITY_ALL, COMMUNITY_ALL_LABEL } from '../core/settlements.js';
import { openModal } from '../core/modal.js';
// Таксономія категорій (id/label/колір/векторна іконка) — спільний модуль, єдине джерело.
import { BOARD_CATEGORIES, catShort, categoryHasPrice } from '../core/board-categories.js';
import { ICONS } from '../core/icons.js';

// Вектор-олівець у заголовку модалки — спільна іконка з core/icons.js (дедуп,
// раніше локальна копія EDIT_ICON_SVG з board.js; icons.js не створює циклу,
// на відміну від прямого імпорту з board.js).
const PENCIL_ICON_SVG = ICONS.pencil;

// Д-6: векторний пін локації в прев'ю — мірор board.js PIN_ICON_SVG/renderLoc (не імпортуємо
// з board.js через циклічний імпорт). Щоб прев'ю показувало локацію так само, як реальна картка.
const PIN_ICON_SVG = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
function renderPreviewLoc(loc) {
  if (!loc) return '';
  const label = loc === COMMUNITY_ALL ? COMMUNITY_ALL_LABEL : loc;
  return `<span class="cm-board-loc">${PIN_ICON_SVG}${escapeHtml(label)}</span>`;
}

// Д-24: маска українського номера — завжди префікс +380, далі рівно 9 цифр,
// формат "+380 XX XXX XX XX". Приймає будь-який ввід (+380…, 0XX…, XX…) → нормалізує.
function maskUaPhone(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('380')) d = d.slice(3);
  else if ('380'.startsWith(d)) d = '';         // d = '', '3' або '38' — залишок префікса при backspace, НЕ user-цифри
  else if (d.startsWith('0')) d = d.slice(1);   // ввели 0XX… — прибираємо провідний 0
  d = d.slice(0, 9);                             // рівно 9 цифр після 380
  let out = '+380';
  if (d.length)     out += ' ' + d.slice(0, 2);
  if (d.length > 2) out += ' ' + d.slice(2, 5);
  if (d.length > 5) out += ' ' + d.slice(5, 7);
  if (d.length > 7) out += ' ' + d.slice(7, 9);
  return out;
}
// Скільки значущих цифр введено (після 380) — 0 = лише префікс, 9 = повний номер.
function phoneDigits(v) {
  let d = String(v || '').replace(/\D/g, '');
  if (d.startsWith('380')) d = d.slice(3);
  else if ('380'.startsWith(d)) d = '';         // залишок префікса (38/3/'') — 0 user-цифр
  else if (d.startsWith('0')) d = d.slice(1);
  return Math.min(d.length, 9);
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

// compressImage винесено у core/utils.js (спільна з «Стрічкою»). Дошка стискає
// до 800px/0.78 (менші картки-оголошення), тому виклик з явними параметрами.

export function openBoardModal(opts = {}) {
  if (document.querySelector('.app-modal--board-compose')) return;

  // Д-3: режим редагування — відкрито з «Мої оголошення» з наявним постом.
  const editPost = opts.editPost || null;
  const isEdit = !!editPost;
  const submitLabel = isEdit ? 'Зберегти зміни' : 'Опублікувати';

  // Стан форми — тільки поля оголошення (chat/tagsRaw видалено).
  // У edit-режимі префіл з поста; інакше — дефолти нового оголошення.
  const state = {
    text: isEdit ? (editPost.text || '') : '',
    photos: isEdit && Array.isArray(editPost.photos) ? editPost.photos.filter(Boolean) : [],
    uploadingCount: 0,  // скільки фото зараз заливаються у Storage — блокує submit
    author: isEdit ? (editPost.author || accountAuthorName()) : accountAuthorName(),
    category: isEdit ? (editPost.category || '') : '',   // Д-23: без автовибору для нового
    contact: isEdit && editPost.contact ? maskUaPhone(editPost.contact) : '+380',   // Д-24
    title: isEdit ? (editPost.title || '') : '',
    location: isEdit ? (editPost.location || COMMUNITY_ALL) : COMMUNITY_ALL,   // Д-10
    // 🆕 28.07 (потік 2): ціна — НЕОБОВʼЯЗКОВА (пряма вимога Вови: оголошення має
    // виглядати чітко і з нею, і без неї). Тримаємо РЯДКОМ, а не числом: поле може
    // бути порожнім, а порожній рядок і 0 — це різні речі («не вказано» vs «безкоштовно»).
    price: isEdit && editPost.price != null ? String(editPost.price) : '',
    // «Договірна» — окреме поле в базі (`posts.price_negotiable`). Взаємовиключне з числом.
    negotiable: isEdit ? !!editPost.price_negotiable : false,
  };

  const bodyHtml = `
    <div class="cm-board-modal-head">
      <h3 class="cm-board-modal-title"><span class="cm-board-title-ic">${PENCIL_ICON_SVG}</span>${isEdit ? 'Редагувати оголошення' : 'Нове оголошення'}</h3>
      <p class="cm-board-modal-sub">${isEdit ? 'Змініть потрібні поля.' : 'Заповніть поля нижче.'}</p>
    </div>

    <form id="cm-board-modal-form" novalidate>
      <!-- Динамічна частина -->
      <div id="bm-dynamic"></div>

      <!-- LIVE-preview -->
      <div class="bm-preview-section" id="bm-preview-section">
        <div class="bm-preview-label">Як виглядатиме на дошці</div>
        <div class="bm-preview-canvas" id="bm-preview-canvas"></div>
      </div>

      <button class="cm-board-submit" type="submit">${submitLabel}</button>
      <p class="cm-board-hint">${isEdit
        ? 'Зміни збережуться. Якщо оголошення ще не автопублікується — піде на повторну перевірку.'
        : 'Запит йде модератору. Після перевірки зʼявиться на дошці.'}</p>
    </form>
  `;

  // chrome (backdrop/панель/handle/close/свайп) — спільний примітив core/modal.js (Потік C1/C2).
  // onClose — прибирає blob: URL фото незалежно від того, ЯК модалку закрили.
  const { close, el: wrap } = openModal({
    bodyHtml,
    variant: 'sheet',
    className: 'app-modal--board-compose',
    onClose: () => state.photos.forEach(p => { if (p && p.startsWith('blob:')) URL.revokeObjectURL(p); }),
  });

  // Д-17: лінія-роздільник під липкою шапкою з'являється лише коли контент почав скролитись
  // під неї (при повністю відкритій нескроленій модалці лінія візуально зайва — фідбек Вови).
  const sheetEl = wrap.querySelector('.app-modal-sheet');
  if (sheetEl) {
    const syncScrolled = () => sheetEl.classList.toggle('is-scrolled', sheetEl.scrollTop > 2);
    sheetEl.addEventListener('scroll', syncScrolled, { passive: true });
    syncScrolled();
  }

  // ── Рендер полів оголошення ──
  const dynamicEl = wrap.querySelector('#bm-dynamic');

  function renderBoardFields() {
    dynamicEl.innerHTML = `
      <div class="bm-section">
        <label class="bm-label">Категорія <span class="bm-label-req">*</span></label>
        <div class="bm-chips" id="bm-chips">
          ${BOARD_CATEGORIES.map(c => `
            <button type="button" class="bm-chip${c.id === state.category ? ' active' : ''}" data-cat="${c.id}">
              <span class="bm-chip-emoji cat-c-${c.color}">${c.icon}</span>
              <span class="bm-chip-label">${escapeHtml(c.label)}</span>
            </button>
          `).join('')}
        </div>
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-title">Заголовок <span class="bm-label-req">*</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-title" type="text" maxlength="80" required placeholder="Напр. Продам мотоцикл" value="${escapeHtml(state.title)}">
      </div>

      <div class="bm-section" id="bm-price-section"${categoryHasPrice(state.category) ? '' : ' hidden'}>
        <label class="bm-label" for="bm-price">Ціна <span class="bm-label-hint">(необов'язково)</span></label>
        <div class="bm-price-field">
          <input class="cm-board-input cm-board-input--small" id="bm-price" type="text" inputmode="decimal" size="12" placeholder="напр. 2500" value="${escapeHtml(state.price)}"${state.negotiable ? ' disabled' : ''}>
          <span class="bm-price-cur">₴</span>
          <label class="bm-negot">
            <input type="checkbox" id="bm-negotiable"${state.negotiable ? ' checked' : ''}>
            <span>Договірна</span>
          </label>
        </div>
        <p class="bm-label-hint bm-price-note">Порожньо — ціни на картці не буде. «0» покаже «Безкоштовно».</p>
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
        <label class="bm-label">Фото <span class="bm-label-hint">(необов'язково, до 5)</span></label>
        ${photoSlotsHtml()}
      </div>

      <div class="bm-section">
        <label class="bm-label" for="bm-contact">Телефон <span class="bm-label-hint">(необов'язково)</span></label>
        <input class="cm-board-input cm-board-input--small" id="bm-contact" type="tel" size="18" placeholder="+380 XX XXX XX XX" inputmode="tel" value="${escapeHtml(state.contact)}">
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
        syncPriceVisibility();
        renderPreview();
      });
    });
    // Заголовок
    dynamicEl.querySelector('#bm-title')?.addEventListener('input', e => {
      state.title = e.target.value;
      renderPreview();
    });
    // Ціна — пускаємо лише цифри і ОДНУ крапку, максимум 2 знаки після неї.
    // Кома → крапка: на iOS цифрова клавіатура дає українську кому, а база чекає крапку.
    // Чистимо просто в полі (а не тільки перед відправкою), щоб людина одразу бачила,
    // що саме буде збережено — і прев'ю не показувало те, чого сервер не прийме.
    dynamicEl.querySelector('#bm-price')?.addEventListener('input', e => {
      let v = e.target.value.replace(/,/g, '.').replace(/[^\d.]/g, '');
      const parts = v.split('.');
      if (parts.length > 1) v = `${parts[0]}.${parts.slice(1).join('').slice(0, 2)}`;
      e.target.value = v;
      state.price = v;
      // Вписав число — «Договірна» скидається. Це НЕ примха інтерфейсу: сервер робить
      // рівно те саме (`if v_price is not null then v_negot := false`), і якби клієнт
      // лишив галочку, вона б стояла в формі, а в базу не потрапила.
      if (v && state.negotiable) {
        state.negotiable = false;
        const cb = dynamicEl.querySelector('#bm-negotiable');
        if (cb) cb.checked = false;
      }
      renderPreview();
    });
    // «Договірна» — вимикає поле числа (і навпаки). Взаємовиключність тут ВИДИМА:
    // поле стає неактивним, тобто людина не вводить те, що все одно буде відкинуто.
    dynamicEl.querySelector('#bm-negotiable')?.addEventListener('change', e => {
      state.negotiable = e.target.checked;
      const inp = dynamicEl.querySelector('#bm-price');
      if (state.negotiable) {
        state.price = '';
        if (inp) { inp.value = ''; inp.disabled = true; }
      } else if (inp) {
        inp.disabled = false;
      }
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
    // Контакт (телефон) — маска +380 XX XXX XX XX (Д-24)
    dynamicEl.querySelector('#bm-contact')?.addEventListener('input', e => {
      e.target.value = maskUaPhone(e.target.value);   // форматуємо + обмежуємо к-сть цифр
      state.contact = e.target.value;
      renderPreview();
    });
    syncPriceVisibility();
    bindPhotoSlots();
  }

  // 🆕 28.07 — поле «Ціна» видно ЛИШЕ для категорій, де ціна має сенс
  // (`PRICE_CATEGORIES` = дзеркало серверного `v_price_cats`).
  // ⚠️ Ховаючи поле, СТИРАЄМО і значення. Інакше вийшов би найгірший з можливих
  // сценаріїв: людина вписала ціну під «Продам», перемкнула на «Віддам», прев'ю
  // показало б ціну — а база при збереженні мовчки її витерла б (там саме такий гейт).
  // Тобто застосунок пообіцяв би те, чого не збереже.
  function syncPriceVisibility() {
    const sec = dynamicEl.querySelector('#bm-price-section');
    if (!sec) return;
    const ok = categoryHasPrice(state.category);
    sec.hidden = !ok;
    if (!ok && (state.price || state.negotiable)) {
      state.price = '';
      state.negotiable = false;
      const inp = dynamicEl.querySelector('#bm-price');
      if (inp) { inp.value = ''; inp.disabled = false; }
      const cb = dynamicEl.querySelector('#bm-negotiable');
      if (cb) cb.checked = false;
    }
  }

  function photoSlotsHtml(count = 5) {
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
          blob = await compressImage(file, 800, 0.78);
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
        const { url, error } = await uploadBlobWithRetry(blob);
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
      btn.textContent = submitLabel;
    }
  }

  // ── LIVE-preview ──
  const previewCanvas = wrap.querySelector('#bm-preview-canvas');

  function renderPreview() {
    // Д-23: поки категорію не обрано (state.category === '') — приглушений плейсхолдер-тег.
    const cat = state.category ? BOARD_CATEGORIES.find(c => c.id === state.category) : null;
    const catHtml = cat
      ? `<span class="cm-board-cat cm-board-cat--${cat.color}">${cat.icon} ${escapeHtml(catShort(state.category))}</span>`
      : `<span class="cm-board-cat cm-board-cat--placeholder">Категорія</span>`;
    const firstPhoto = state.photos.find(p => p);
    // Д-24: показуємо телефон у прев'ю лише коли номер повний (9 цифр), не префікс-заглушку.
    const contactShow = phoneDigits(state.contact) === 9 ? maskUaPhone(state.contact) : '';
    const contactHtml = contactShow ? `
      <div class="cm-board-contact cm-board-contact--phone">
        ${escapeHtml(contactShow)}
      </div>` : '';
    // Ціна у прев'ю — тим самим форматувальником, що й на справжній картці
    // (`core/utils.js`), інакше прев'ю показувало б «2500», а дошка «2 500 ₴».
    const priceLabel = formatPrice(state.price, 'UAH', state.negotiable);
    // Д-6: клас `--word` теж дзеркалимо — інакше «Договірна» у прев'ю була б більшою,
    // ніж на справжній картці.
    const priceHtml = priceLabel
      ? `<div class="cm-board-price${/\d/.test(priceLabel) ? '' : ' cm-board-price--word'}">${escapeHtml(priceLabel)}</div>`
      : '';
    // Д-6: прев'ю мусить дзеркалити РЕАЛЬНУ картку. 🆕 28.07 (потік 2) з картки прибрано
    // опис — прибираємо його і тут, інакше прев'ю обіцяло б те, чого на дошці не буде.
    // Опис нікуди не дівається: він відкривається в модалці оголошення.
    previewCanvas.innerHTML = `
      <article class="cm-board-note bd-card bd-card--board${firstPhoto ? ' cm-board-note--has-photo' : ''}" style="--tilt:0deg">
        <span class="cm-board-pin"></span>
        ${firstPhoto ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${firstPhoto}" alt=""></div>` : ''}
        ${catHtml}
        ${renderPreviewLoc(state.location)}
        ${priceHtml}
        <h3 class="cm-board-title">${state.title.trim() ? escapeHtml(state.title.trim()) : 'Заголовок оголошення'}</h3>
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
  autoGrowTextarea(wrap.querySelector('#bm-text'));   // поле опису росте по тексту (скрол — сам лист)
  setTimeout(() => wrap.querySelector('#bm-text')?.focus(), 200);

  // Уточнюємо ім'я з профілю в БД (кеш міг бути ще не готовий при відкритті).
  // У edit-режимі НЕ чіпаємо телефон/ім'я — показуємо саме те, що збережено в пості.
  if (isLoggedIn() && !isEdit) {
    getProfile().then(p => {
      // Д-24: автопідстановка телефону з профілю — лише якщо юзер ще не почав вводити свій
      // (у полі досі тільки префікс +380). Інакше не перебиваємо введене.
      if (p && p.phone && phoneDigits(state.contact) === 0) {
        state.contact = maskUaPhone(p.phone);
        const cEl = dynamicEl.querySelector('#bm-contact');
        if (cEl) cEl.value = state.contact;
      }
      const nm = firstNameOnly((p && p.name) || currentUserName()) || 'Житель';
      if (nm !== state.author) {
        state.author = nm;
        const el = dynamicEl.querySelector('#bm-author-fixed');
        if (el) el.textContent = `👤 ${nm}`;
      }
      renderPreview();
    }).catch(() => {});
  }

  // ── Submit ──
  wrap.querySelector('#cm-board-modal-form')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!state.category) {   // Д-23: категорію обов'язково обрати (нема автовибору)
      showToast('Оберіть категорію оголошення', 2500);
      wrap.querySelector('#bm-chips')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }
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
    // Д-24: телефон необов'язковий, але якщо почали вводити — має бути повний (9 цифр).
    const pd = phoneDigits(state.contact);
    if (pd > 0 && pd < 9) {
      showToast('Введіть повний номер телефону або залиште порожнім', 3000);
      wrap.querySelector('#bm-contact')?.focus();
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
      submitBtn.textContent = isEdit ? 'Зберігаємо…' : 'Надсилаємо…';
    }

    const payload = buildPayload(state);

    // ── Д-3: РЕДАГУВАННЯ наявного поста ──
    if (isEdit) {
      if (!isSupabaseReady()) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitLabel; }
        showToast('Немає зʼєднання — спробуйте пізніше', 4000);
        return;
      }
      const result = await updateBoardPost(editPost.id, payload);
      if (!result.ok) {
        if (submitBtn) { submitBtn.disabled = false; submitBtn.textContent = submitLabel; }
        showToast('Помилка: ' + (result.error || 'не вдалось зберегти'), 4500);
        return;
      }
      close();
      // Оновлюємо локальний обʼєкт поста, щоб «Мої оголошення» і Дошка перемалювались
      // з новими даними без перезавантаження (payload = ті самі поля, що в таблиці).
      Object.assign(editPost, {
        text: payload.text, title: payload.title, category: payload.category,
        color: payload.color, contact: payload.contact, location: payload.location,
        photos: payload.photos, status: result.status,
      });
      window.dispatchEvent(new CustomEvent('cstl-post-updated', { detail: { post: editPost } }));
      window.dispatchEvent(new Event('cstl-posts-changed'));   // Дошка перемалює/сховає
      showToast(result.status === 'pending'
        ? 'Збережено ✓ Зміни на повторній перевірці.'
        : 'Збережено ✓', 3500);
      return;
    }

    // ── Створення НОВОГО поста ──
    let published = false;   // довірений автор (5+ схвалених) → пост опубліковано одразу
    if (isSupabaseReady()) {
      const result = await submitPost(payload);
      if (!result.ok) {
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = submitLabel;
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
    || BOARD_CATEGORIES[0];
  return {
    type:      'board',
    text:      state.text.trim(),
    author:    state.author.trim() || 'Житель',
    photos:    state.photos.filter(Boolean),
    category:  state.category,
    color:     cat.color,
    contact:   phoneDigits(state.contact) === 9 ? maskUaPhone(state.contact) : null,   // Д-24: лише повний номер
    title:     state.title.trim(),   // обов'язковий (Д-16); сервер теж перевіряє
    location:  state.location || COMMUNITY_ALL,   // Д-10
    tags:      [],
    // 🆕 28.07 (потік 2): ціна. Ключ шлемо ЗАВЖДИ, навіть порожнім — RPC не розрізняє
    // «не передали» і «стерли» (обидва дають null), тож при редагуванні мовчання
    // означало б стирання ціни.
    // ⚠️ `currency` НЕ шлемо свідомо: сервер жорстко ставить 'UAH' і значення від
    //    клієнта ігнорує («у громаді розрахунки в гривні» — коментар у самій RPC).
    price:     state.price.trim(),
    price_negotiable: !!state.negotiable,
  };
}
