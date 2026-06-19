// src/core/account-ui.js
// UI-шар авторизації (Фаза Б): екрани «Приєднайтесь», «Доповніть профіль»,
// «Кабінет жителя» + іконка 👤 в шапці. Логіка входу — в auth.js, тут лише вигляд.
//
// М'яка модель (soft): вхід НЕ примусовий. Гість користується додатком як завжди;
// вхід пропонується контекстно (через подію cstl-need-login від requireAuth).

import {
  isLoggedIn, currentUser, onAuthChange,
  signInWithGoogle, signOut, getProfile, saveProfile,
} from './auth.js';
import { escapeHtml, showToast } from './utils.js';

let _modal = null;            // поточна відкрита модалка (або null)
let _newUserChecked = false;  // чи вже перевіряли профіль на авто-показ (раз за сесію)

// ── Іконка в шапці ──────────────────────────────────────────────
function updateHeaderBtn() {
  const btn = document.getElementById('account-btn');
  if (!btn) return;
  btn.classList.toggle('account-btn--in', isLoggedIn());
  btn.setAttribute('aria-label', isLoggedIn() ? 'Кабінет жителя' : 'Увійти');
}

// ── Базова модалка (центрована картка з затемненням) ─────────────
function closeModal() {
  if (!_modal) return;
  const m = _modal; _modal = null;
  m.classList.remove('open');
  document.body.classList.remove('modal-open');
  setTimeout(() => m.remove(), 220);
}

function openModal(innerHtml) {
  closeModal();
  const wrap = document.createElement('div');
  wrap.className = 'acc-modal';
  wrap.innerHTML = `
    <div class="acc-backdrop"></div>
    <div class="acc-card" role="dialog" aria-modal="true">${innerHtml}</div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  _modal = wrap;
  requestAnimationFrame(() => wrap.classList.add('open'));
  wrap.querySelector('.acc-backdrop').addEventListener('click', closeModal);
  return wrap;
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

// ── Екран 3: «Кабінет жителя» (залогінений) ──────────────────────
async function openAccount() {
  const u = currentUser();
  if (!u) return;
  const profile = await getProfile();
  const name  = (profile && profile.name) || (u.user_metadata && u.user_metadata.full_name) || 'Житель';
  const email = u.email || '';
  const bdate = profile && profile.birth_date;
  const bdateRow = bdate
    ? `<div class="acc-row acc-row--static">🎂 ${escapeHtml(bdate)}</div>`
    : `<button class="acc-row" id="acc-add-bdate" type="button">➕ Додати дату народження</button>`;
  const wrap = openModal(`
    <div class="acc-emoji">👤</div>
    <h2 class="acc-title">${escapeHtml(name)}</h2>
    <p class="acc-sub">${escapeHtml(email)}</p>
    <div class="acc-rows">
      ${bdateRow}
      <div class="acc-row acc-row--soon">📋 Мої оголошення <span class="acc-soon">скоро</span></div>
    </div>
    <button class="acc-logout" type="button" id="acc-logout">Вийти</button>`);

  const addBd = wrap.querySelector('#acc-add-bdate');
  if (addBd) addBd.addEventListener('click', () => { closeModal(); openProfile(); });
  wrap.querySelector('#acc-logout').addEventListener('click', async () => {
    await signOut();
    closeModal();
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
