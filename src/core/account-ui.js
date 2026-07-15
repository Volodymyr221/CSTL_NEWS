// src/core/account-ui.js
// UI-шар авторизації (Фаза Б): екрани «Приєднайтесь», «Доповніть профіль»,
// «Кабінет жителя» + іконка 👤 в шапці. Логіка входу — в auth.js, тут лише вигляд.
//
// М'яка модель (soft): вхід НЕ примусовий. Гість користується додатком як завжди;
// вхід пропонується контекстно (через подію cstl-need-login від requireAuth).

import {
  isLoggedIn, currentUser, onAuthChange,
  signInWithGoogle, signOut, getProfile, saveProfile, currentAvatarUrl,
} from './auth.js';
import { openThreadsList, openMyAds } from '../tabs/board-chat.js';
import { ICONS } from './icons.js';
import { openSavedHub } from './saved-hub.js';
import { SETTLEMENTS, OTHER_SETTLEMENT } from './settlements.js';
import { escapeHtml, showToast, avatarCircle, squareImageBlob } from './utils.js';
import { uploadPhotoToStorage } from './supabase.js';
import { openModal as openModalPrimitive, closeModal as closeModalPrimitive } from './modal.js';

let _newUserChecked = false;  // чи вже перевіряли профіль на авто-показ (раз за сесію)

// ── Іконка в шапці ──────────────────────────────────────────────
function updateHeaderBtn() {
  const btn = document.getElementById('account-btn');
  if (!btn) return;
  if (!btn.dataset.defaultHtml) btn.dataset.defaultHtml = btn.innerHTML;   // зберегти дефолтну SVG-іконку
  const av = isLoggedIn() ? currentAvatarUrl() : '';
  // Є фото профілю → мініатюра-кружечок; інакше — дефолтна іконка користувача.
  btn.innerHTML = av
    ? `<span class="account-btn-av"><img src="${escapeHtml(av)}" alt="" loading="lazy"></span>`
    : btn.dataset.defaultHtml;
  btn.classList.toggle('account-btn--in', isLoggedIn());
  btn.classList.toggle('account-btn--av', !!av);
  btn.setAttribute('aria-label', isLoggedIn() ? 'Кабінет жителя' : 'Увійти');
}

// ── Базова модалка (центрована картка) — тонка обгортка над спільним примітивом
// core/modal.js (Потік C1). Власна сигнатура openModal(innerHtml) → DOM-елемент
// лишається як є, щоб не чіпати виклики нижче (openJoin/openProfile).
function closeModal() {
  closeModalPrimitive();
}

function openModal(innerHtml) {
  const { el } = openModalPrimitive({ bodyHtml: innerHtml, variant: 'center' });
  return el;
}

// ── Екран 1: «Приєднайтесь» (гість) ──────────────────────────────
// reason — необов'язковий підпис чому варто увійти (з контекстного гейту).
function openJoin(reason) {
  const sub = reason
    ? `Увійдіть, щоб ${escapeHtml(reason)}.`
    : 'Увійдіть, щоб подавати оголошення, писати й реагувати.';
  const wrap = openModal(`
    <div class="acc-emoji">👤</div>
    <h2 class="acc-title">Приєднайтесь до громади</h2>
    <p class="acc-sub">${sub}</p>
    <button class="acc-google" type="button">
      <span class="acc-g">G</span> Увійти з Gmail
    </button>
    <button class="acc-skip" type="button">Поки пропустити</button>`);
  wrap.querySelector('.acc-google').addEventListener('click', () => signInWithGoogle());
  wrap.querySelector('.acc-skip').addEventListener('click', closeModal);
}

// ── Екран 2: «Доповніть профіль» (раз, після першого входу) ───────
function openProfile() {
  const u = currentUser();
  if (!u) return;
  const defaultName = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '';
  const wrap = openModal(`
    <h2 class="acc-title">Раді вас бачити!</h2>
    <label class="acc-label">Ім'я</label>
    <input class="acc-input" id="acc-name" type="text" placeholder="Ваше ім'я" value="${escapeHtml(defaultName)}">
    <label class="acc-label">Дата народження</label>
    <input class="acc-input" id="acc-bdate" type="date" max="${new Date().toISOString().slice(0,10)}">
    <button class="acc-primary" type="button" id="acc-save">Зберегти</button>
    <button class="acc-skip" type="button" id="acc-later">Пізніше</button>`);

  const finish = async (withDate) => {
    const name = wrap.querySelector('#acc-name').value.trim();
    const bd   = wrap.querySelector('#acc-bdate').value;   // YYYY-MM-DD або ''
    const res  = await saveProfile({ name, birth_date: withDate ? bd : null });
    if (!res.ok) { showToast('Не вдалося зберегти: ' + res.error, 4000, 'error'); return; }
    closeModal();
    if (withDate) showToast('Профіль збережено', 2500);
  };
  // «Зберегти» — з датою; «Пізніше» — лише ім'я (щоб не питати щоразу).
  wrap.querySelector('#acc-save').addEventListener('click', () => finish(true));
  wrap.querySelector('#acc-later').addEventListener('click', () => finish(false));
}

const NOTIF_KEYS = [
  { k: 'buses', ic: ICONS.bus,       label: 'Автобуси',  def: true },
  { k: 'power', ic: ICONS.bulb,      label: 'Світло',    def: true },
  { k: 'news',  ic: ICONS.newspaper, label: 'Новини',    def: false },
  { k: 'board', ic: ICONS.pin,       label: 'Дошка',     def: true },
];
function loadNotifPrefs(uid) {
  try {
    const raw = JSON.parse(localStorage.getItem('notif_prefs:' + uid) || '{}');
    const out = {};
    NOTIF_KEYS.forEach(n => { out[n.k] = (n.k in raw) ? !!raw[n.k] : n.def; });
    return out;
  } catch { const o = {}; NOTIF_KEYS.forEach(n => o[n.k] = n.def); return o; }
}
function saveNotifPrefs(uid, prefs) {
  try { localStorage.setItem('notif_prefs:' + uid, JSON.stringify(prefs)); } catch { /* ignore */ }
}

// ── Екран 3: «Мій кабінет» — повноекранний, з анкетою ─────────────
function closeCabinet() {
  const c = document.getElementById('acc-cab');
  if (!c) return;
  c.classList.remove('open');
  document.body.classList.remove('modal-open');
  setTimeout(() => c.remove(), 240);
}

async function openAccount() {
  const u = currentUser();
  if (!u) return;
  const p = (await getProfile()) || {};
  const email = u.email || '';
  const gName = (u.user_metadata && (u.user_metadata.full_name || u.user_metadata.name)) || '';
  const val = {
    name: p.name || gName || '',
    surname: p.surname || '',
    birth_date: p.birth_date || '',
    phone: p.phone || '',
    settlement: p.settlement || '',
    street: p.street || '',
    bio: p.bio || '',
    avatar_url: p.avatar_url || '',
  };
  const fullName = [val.name, val.surname].filter(Boolean).join(' ') || 'Житель';
  const place = val.settlement || 'Учасник спільноти';
  const prefs = loadNotifPrefs(u.id);
  const today = new Date().toISOString().slice(0, 10);
  // Репутація Дошки (Захід 2): 5 схвалених оголошень → автопублікація надалі.
  const trustHtml = p.trusted
    ? `<div class="acc-cab-trust acc-cab-trust--on">${ICONS.check} Довірений автор — оголошення публікуються одразу</div>`
    : `<div class="acc-cab-trust">${ICONS.star} ${p.approved_count || 0}/5 схвалень до автопублікації</div>`;

  // Рядок анкети (iOS-Settings): плитка-іконка · підпис+поле (inline-редагування)
  // · декоративна вектор-стрілка. Обгортка — <label>, тож тап у рядок фокусує поле.
  const field = (ic, label, control) => `
    <label class="acc-f">
      <span class="acc-f-ic">${ic}</span>
      <span class="acc-f-body"><span class="acc-f-lbl">${label}</span>${control}</span>
      <i class="acc-f-chev">${ICONS.chevronRight}</i>
    </label>`;
  // Рядок-навігація блоку «Моє»: іконка-плитка · назва+опис · стрілка.
  const navRow = (go, ic, name, desc) => `
    <button class="acc-cab-row" data-go="${go}" type="button">
      <span class="acc-cab-row-ic">${ic}</span>
      <span class="acc-cab-row-body"><span class="acc-cab-row-name">${name}</span><span class="acc-cab-row-desc">${desc}</span></span>
      <i>${ICONS.chevronRight}</i>
    </button>`;

  const cab = document.createElement('div');
  cab.id = 'acc-cab';
  cab.className = 'acc-cab';
  cab.innerHTML = `
    <div class="acc-cab-top">
      <button class="acc-cab-back" type="button" aria-label="Назад">←</button>
      <b>Мій кабінет</b>
    </div>
    <div class="acc-cab-scroll">
      <div class="acc-cab-hero">
        <div class="acc-cab-avwrap">
          <div class="acc-cab-av" id="acc-hero-av">${avatarCircle({ name: fullName, url: val.avatar_url, cls: 'acc-av' })}</div>
          <button class="acc-cab-avcam" type="button" id="acc-av-btn" aria-label="Змінити фото">${ICONS.photo}</button>
          <input type="file" id="acc-av-file" accept="image/*" hidden>
        </div>
        <div class="acc-cab-hi">
          <div class="acc-cab-name" id="acc-hero-name">${escapeHtml(fullName)}</div>
          <div class="acc-cab-email">${escapeHtml(email)}</div>
          <div class="acc-cab-place" id="acc-hero-place">${escapeHtml(place)}</div>
          ${trustHtml}
        </div>
      </div>

      <div class="acc-cab-sec">
        <h3>Мої дані</h3>
        ${field(ICONS.user, "Ім'я", `<input id="cf-name" type="text" value="${escapeHtml(val.name)}" placeholder="Ваше ім'я">`)}
        ${field(ICONS.clipboard, 'Прізвище', `<input id="cf-surname" type="text" value="${escapeHtml(val.surname)}" placeholder="Прізвище">`)}
        ${field(ICONS.calendar, 'Дата народження', `<input id="cf-bdate" type="date" max="${today}" value="${escapeHtml(val.birth_date)}">`)}
        ${field(ICONS.phone, 'Телефон (для оголошень)', `<input id="cf-phone" type="tel" value="${escapeHtml(val.phone)}" placeholder="+380…">`)}
        ${field(ICONS.pin, 'Населений пункт', `<select id="cf-settlement">
            <option value="">— оберіть —</option>
            ${[...SETTLEMENTS, OTHER_SETTLEMENT].map(s => `<option ${val.settlement === s ? 'selected' : ''}>${s}</option>`).join('')}
          </select>`)}
        ${field(ICONS.home, "Вулиця (необов'язково)", `<input id="cf-street" type="text" value="${escapeHtml(val.street)}" placeholder="напр. вул. Замкова">`)}
        ${field(ICONS.fileText, 'Про себе', `<textarea id="cf-bio" rows="2" placeholder="Кілька слів…">${escapeHtml(val.bio)}</textarea>`)}
      </div>
      <button class="acc-cab-save" type="button" id="cf-save">Зберегти анкету</button>

      <div class="acc-cab-sec acc-cab-sec--rows">
        <h3>Моє</h3>
        ${navRow('myads', ICONS.megaphone, 'Мої оголошення', 'Перегляд і керування вашими оголошеннями')}
        ${navRow('saved', ICONS.bookmark, 'Збережені', 'Оголошення й статті, які ви зберегли')}
        ${navRow('msgs', ICONS.message, 'Повідомлення', 'Особисті чати з іншими жителями')}
      </div>

      <div class="acc-cab-sec acc-cab-sec--rows">
        <h3>Сповіщення</h3>
        ${NOTIF_KEYS.map(n => `
          <div class="acc-cab-row acc-cab-row--tog">
            <span class="acc-cab-row-ic">${n.ic}</span>
            <span class="acc-cab-row-body"><span class="acc-cab-row-name">${n.label}</span></span>
            <button class="acc-tog${prefs[n.k] ? '' : ' off'}" data-notif="${n.k}" type="button" aria-label="${n.label}"></button>
          </div>`).join('')}
      </div>

      <button class="acc-cab-logout" type="button" id="cf-logout">Вийти</button>
    </div>`;
  document.body.appendChild(cab);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => cab.classList.add('open'));

  cab.querySelector('.acc-cab-back').addEventListener('click', closeCabinet);

  // ── Аватар: вибір фото → квадрат-ресайз → upload → зберегти avatar_url ──
  const avBtn = cab.querySelector('#acc-av-btn');
  const avFile = cab.querySelector('#acc-av-file');
  const avBox = cab.querySelector('#acc-hero-av');
  avBtn.addEventListener('click', () => avFile.click());
  avFile.addEventListener('change', async () => {
    const file = avFile.files && avFile.files[0];
    avFile.value = '';                         // дозволити повторний вибір того ж файлу
    if (!file) return;
    avBtn.disabled = true; avBox.classList.add('acc-av--loading');
    try {
      const blob = await squareImageBlob(file, 256);
      const { url, error } = await uploadPhotoToStorage(blob, 'avatars/');
      if (!url) throw new Error(error || 'upload');
      const res = await saveProfile({ avatar_url: url });
      if (!res.ok) throw new Error(res.error || 'save');
      val.avatar_url = url;
      avBox.innerHTML = avatarCircle({ name: cab.querySelector('#acc-hero-name').textContent, url, cls: 'acc-av' });
      updateHeaderBtn();                        // мініатюра в шапці одразу
      showToast('✅ Фото оновлено', 2200);
    } catch (err) {
      showToast('Не вдалося завантажити фото: ' + err.message, 4000, 'error');
    } finally {
      avBtn.disabled = false; avBox.classList.remove('acc-av--loading');
    }
  });

  // Збереження анкети
  cab.querySelector('#cf-save').addEventListener('click', async (e) => {
    const btn = e.currentTarget; btn.disabled = true; btn.textContent = 'Зберігаємо…';
    const fields = {
      name: cab.querySelector('#cf-name').value.trim(),
      surname: cab.querySelector('#cf-surname').value.trim(),
      birth_date: cab.querySelector('#cf-bdate').value || null,
      phone: cab.querySelector('#cf-phone').value.trim(),
      settlement: cab.querySelector('#cf-settlement').value,
      street: cab.querySelector('#cf-street').value.trim(),
      bio: cab.querySelector('#cf-bio').value.trim(),
    };
    const res = await saveProfile(fields);
    btn.disabled = false; btn.textContent = 'Зберегти анкету';
    if (!res.ok) { showToast('Не вдалося зберегти: ' + res.error, 4000, 'error'); return; }
    // Оновлюємо шапку кабінету наживо
    cab.querySelector('#acc-hero-name').textContent = [fields.name, fields.surname].filter(Boolean).join(' ') || 'Житель';
    cab.querySelector('#acc-hero-place').textContent = fields.settlement || 'Учасник спільноти';
    // ЧЕСНИЙ статус: partial = база ще без розширених колонок (село/прізвище/
    // телефон НЕ збереглись) — не брешемо «збережено», кажемо що саме сталося.
    if (res.partial) {
      showToast('Збережено імʼя і дату. Село/телефон поки не зберігаються — базу оновлять найближчим часом', 5000, 'error');
    } else {
      showToast('✅ Анкету збережено', 2500);
    }
  });
  // Розділи «Моє»
  cab.querySelectorAll('[data-go]').forEach(b => b.addEventListener('click', () => {
    const go = b.dataset.go;
    closeCabinet();
    if (go === 'myads') openMyAds();
    else if (go === 'msgs') openThreadsList();
    else if (go === 'saved') openSavedHub();   // хаб збережених (замість «незабаром»)
  }));
  // Тумблери сповіщень (localStorage — працює одразу)
  cab.querySelectorAll('[data-notif]').forEach(t => t.addEventListener('click', () => {
    const k = t.dataset.notif;
    prefs[k] = !prefs[k];
    t.classList.toggle('off', !prefs[k]);
    saveNotifPrefs(u.id, prefs);
  }));
  cab.querySelector('#cf-logout').addEventListener('click', async () => {
    await signOut();
    closeCabinet();
    showToast('Ви вийшли', 2200);
  });
}

// Кнопка в шапці: гість → «Приєднайтесь», житель → «Кабінет».
function onHeaderClick() {
  if (isLoggedIn()) openAccount(); else openJoin();
}

// ── Ініціалізація (викликається з app.js) ────────────────────────
export function initAccountUI() {
  const btn = document.getElementById('account-btn');
  if (btn && !btn.dataset.wired) {
    btn.dataset.wired = '1';
    btn.addEventListener('click', onHeaderClick);
  }
  updateHeaderBtn();

  // Контекстний гейт: requireAuth() для гостя кидає цю подію → відкриваємо вхід.
  document.addEventListener('cstl-need-login', (e) => {
    if (isLoggedIn()) return;
    openJoin(e.detail && e.detail.actionLabel);
  });

  // Зміна стану входу: оновити іконку; новачка (немає профілю) — запросити доповнити.
  onAuthChange(async (user) => {
    updateHeaderBtn();
    if (!user || _newUserChecked) return;
    _newUserChecked = true;
    const profile = await getProfile();
    if (!profile) openProfile();   // перший вхід (рядка ще немає) → екран 2
  });
}
