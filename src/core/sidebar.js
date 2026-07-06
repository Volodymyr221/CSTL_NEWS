// src/core/sidebar.js
// Бічне меню (сайдбар) — відкривається бургером зліва в шапці.
// Повний список навігації + пункт «Кабінет», який видно ЛИШЕ команді
// (сторож is_team_member() — server-authoritative, не обдуриш з клієнта).

import { isTeamMember } from './supabase.js';
import { onAuthChange } from './auth.js';

// Пункти меню. kind: 'tab' → switchTab; 'action' → своя дія; 'info' → модалка.
const NAV = [
  { id: 'cabinet',  label: 'Кабінет',            icon: '🛠️', kind: 'cabinet', team: true },
  { id: 'account',  label: 'Особистий кабінет',   icon: '👤', kind: 'account' },
  { divider: true },
  { id: 'community',   label: 'Громада',      icon: '🏘️', kind: 'tab', tab: 'community' },
  { id: 'shotam',      label: 'Шо в селі',    icon: '📰', kind: 'tab', tab: 'shotam' },
  { id: 'board',       label: 'Дошка',        icon: '📌', kind: 'tab', tab: 'board' },
  { id: 'discussions', label: 'Обговорення',  icon: '💬', kind: 'tab', tab: 'discussions' },
  { id: 'buses',       label: 'Автобуси',     icon: '🚌', kind: 'tab', tab: 'buses' },
  { id: 'contacts',    label: 'Контакти',     icon: '📞', kind: 'tab', tab: 'community' },
  { divider: true },
  { id: 'support', label: 'Підтримка',            icon: '❔', kind: 'info' },
  { id: 'policy',  label: 'Політика і приватність', icon: '🔒', kind: 'info' },
];

const INFO = {
  support: {
    title: 'Підтримка',
    body: 'Питання, ідеї чи проблема? Напишіть нам — ми відповідаємо особисто.<br><br>' +
          '✉️ <a href="mailto:olykacastle@gmail.com">olykacastle@gmail.com</a><br>' +
          'Або через розділ «Дошка» → створити оголошення.',
  },
  policy: {
    title: 'Політика і приватність',
    body: 'CSTL LIFE поважає вашу приватність.<br><br>' +
          '• Ми не продаємо ваші дані.<br>' +
          '• Персональні дані (профіль, повідомлення) зберігаються лише для роботи додатку.<br>' +
          '• Геолокація використовується тільки для погоди й найближчих зупинок, на вашому пристрої.<br>' +
          '• Вміст, який ви публікуєте на Дошці, бачать інші жителі громади.<br><br>' +
          'Питання — через «Підтримка».',
  },
};

let _open = false;

function els() {
  return {
    sidebar: document.getElementById('sidebar'),
    overlay: document.getElementById('sidebar-overlay'),
    toggle: document.getElementById('sidebar-toggle'),
    close: document.getElementById('sidebar-close'),
    nav: document.getElementById('sidebar-nav'),
  };
}

function openSidebar() {
  const { sidebar, overlay, toggle } = els();
  if (!sidebar) return;
  overlay.hidden = false;
  requestAnimationFrame(() => {
    sidebar.classList.add('sidebar--open');
    overlay.classList.add('sidebar-overlay--show');
  });
  sidebar.setAttribute('aria-hidden', 'false');
  toggle?.setAttribute('aria-expanded', 'true');
  _open = true;
  refreshCabinet();   // перевіряємо команду щоразу при відкритті
}

function closeSidebar() {
  const { sidebar, overlay, toggle } = els();
  if (!sidebar) return;
  sidebar.classList.remove('sidebar--open');
  overlay.classList.remove('sidebar-overlay--show');
  sidebar.setAttribute('aria-hidden', 'true');
  toggle?.setAttribute('aria-expanded', 'false');
  _open = false;
  setTimeout(() => { if (!_open) overlay.hidden = true; }, 260);
}

function itemHtml(item) {
  if (item.divider) return '<div class="sidebar-divider"></div>';
  const hidden = item.team ? ' hidden' : '';
  return `<button class="sidebar-item" type="button" data-nav="${item.id}"${hidden}>
    <span class="sidebar-item-icon">${item.icon}</span>
    <span class="sidebar-item-label">${item.label}</span>
  </button>`;
}

function renderNav() {
  const { nav } = els();
  if (!nav) return;
  nav.innerHTML = NAV.map(itemHtml).join('');
  nav.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => handleNav(btn.dataset.nav));
  });
}

function handleNav(id) {
  const item = NAV.find(n => n.id === id);
  if (!item) return;
  closeSidebar();
  if (item.kind === 'tab') {
    window.switchTab?.(item.tab);
  } else if (item.kind === 'account') {
    document.getElementById('account-btn')?.click();
  } else if (item.kind === 'cabinet') {
    window.location.href = './admin.html';
  } else if (item.kind === 'info') {
    openInfoModal(id);
  }
}

// Проста інформаційна модалка (Підтримка / Політика).
function openInfoModal(key) {
  const data = INFO[key];
  if (!data) return;
  const ov = document.createElement('div');
  ov.className = 'sidebar-info-modal';
  ov.innerHTML = `
    <div class="sidebar-info-sheet" role="dialog" aria-label="${data.title}">
      <div class="sidebar-info-head">
        <h2>${data.title}</h2>
        <button class="sidebar-info-close" type="button" aria-label="Закрити">✕</button>
      </div>
      <div class="sidebar-info-body">${data.body}</div>
    </div>`;
  const shut = () => { ov.classList.remove('sidebar-info-modal--show'); setTimeout(() => ov.remove(), 240); };
  ov.addEventListener('click', e => { if (e.target === ov) shut(); });
  ov.querySelector('.sidebar-info-close').addEventListener('click', shut);
  document.body.appendChild(ov);
  requestAnimationFrame(() => ov.classList.add('sidebar-info-modal--show'));
}

// Показати/сховати «Кабінет» за server-сторожем.
async function refreshCabinet() {
  const btn = document.querySelector('[data-nav="cabinet"]');
  if (!btn) return;
  let team = false;
  try { team = await isTeamMember(); } catch { team = false; }
  btn.hidden = !team;
}

export function initSidebar() {
  const { toggle, close, overlay } = els();
  if (!toggle) return;
  renderNav();
  toggle.addEventListener('click', () => (_open ? closeSidebar() : openSidebar()));
  close?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && _open) closeSidebar(); });
  // Оновлюємо видимість «Кабінет» при вход/вихід.
  onAuthChange(() => refreshCabinet());
  refreshCabinet();
}
