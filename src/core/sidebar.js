// src/core/sidebar.js
// Бічне меню (сайдбар) — відкривається бургером зліва в шапці.
// Повний список навігації + пункт «Кабінет», який видно ЛИШЕ команді
// (сторож is_team_member() — server-authoritative, не обдуриш з клієнта).

import { isTeamMember } from './supabase.js';
import { onAuthChange } from './auth.js';
import { LEGAL_DOC_HTML } from './legal.js';
import { openModal } from './modal.js';
import { ICONS } from './icons.js';

// Пункти меню. kind: 'tab' → switchTab; 'action' → своя дія; 'info' → модалка.
// Іконки — тонкі Tabler-вектори (Потік 7, варіант 5) замість емодзі: однаковий вигляд на всіх ОС.
const NAV = [
  { id: 'cabinet',  label: 'Адмінка',            icon: ICONS.settings, kind: 'cabinet', team: true },
  { id: 'account',  label: 'Особистий кабінет',   icon: ICONS.user, kind: 'account' },
  { divider: true },
  { id: 'community',   label: 'Громада',      icon: ICONS.community, kind: 'tab', tab: 'community' },
  { id: 'news',        label: 'Новини',       icon: ICONS.newspaper, kind: 'tab', tab: 'community', scrollTo: '#cm-news-board' },
  { id: 'shotam',      label: 'Шо в селі',    icon: ICONS.fileText, kind: 'tab', tab: 'shotam' },
  { id: 'board',       label: 'Дошка',        icon: ICONS.clipboard, kind: 'tab', tab: 'board' },
  { id: 'discussions', label: 'Обговорення',  icon: ICONS.message, kind: 'tab', tab: 'discussions' },
  { id: 'buses',       label: 'Автобуси',     icon: ICONS.bus, kind: 'tab', tab: 'buses' },
  { id: 'contacts',    label: 'Корисні контакти', icon: ICONS.phone, kind: 'tab', tab: 'community', scrollTo: '#cm-contacts' },
  { divider: true },
  { id: 'support', label: 'Підтримка',            icon: ICONS.help, kind: 'info' },
  { id: 'policy',  label: 'Політика і приватність', icon: ICONS.lock, kind: 'info' },
];

// Соцмережі проєкту Olyka Castle (головний бренд, не сам застосунок) — футер
// сайдбару, лише іконки без підпису (рішення Вови 13.07). target=_blank +
// rel=noopener: відкриється застосунок Instagram/Facebook (universal links iOS).
const SOCIAL = [
  { id: 'instagram', label: 'Instagram Olyka Castle', icon: ICONS.brandInstagram,
    url: 'https://www.instagram.com/olyka_castle?igsh=a2pmOGN3N2cyenBs' },
  { id: 'facebook', label: 'Facebook Olyka Castle', icon: ICONS.brandFacebook,
    url: 'https://www.facebook.com/share/18mhw13NDu/?mibextid=wwXIfr' },
];

const INFO = {
  support: {
    title: 'Підтримка',
    body: 'Питання, ідеї чи проблема? Напишіть нам на пошту — відповідаємо особисто.<br><br>' +
          '<a class="info-mail-btn" href="mailto:olykacastle@gmail.com?subject=Підтримка%20CSTL%20LIFE">' +
          ICONS.mail + ' Написати в підтримку</a><br><br>' +
          '<span class="info-mail-plain">olykacastle@gmail.com</span>',
  },
  policy: {
    title: 'Політика і приватність',
    doc: true,                 // повний правовий документ → вищий scrollable-лист
    body: LEGAL_DOC_HTML,
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
  // Футер соцмереж — притиснутий до низу меню (margin-top:auto у CSS),
  // <a> зі справжнім href: iOS відкриє застосунок Instagram/Facebook.
  const socialHtml = `
    <div class="sb-social-foot">
      ${SOCIAL.map(s => `<a class="sb-social-btn" href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label}">${s.icon}</a>`).join('')}
    </div>`;
  nav.innerHTML = NAV.map(itemHtml).join('') + socialHtml;
  nav.querySelectorAll('[data-nav]').forEach(btn => {
    btn.addEventListener('click', () => handleNav(btn.dataset.nav));
  });
  // Тап по соцмережі → закрити сайдбар (посилання відкривається у новій вкладці,
  // меню не має лишатись висіти під ним після повернення).
  nav.querySelectorAll('.sb-social-btn').forEach(a => {
    a.addEventListener('click', () => closeSidebar());
  });
}

function handleNav(id) {
  const item = NAV.find(n => n.id === id);
  if (!item) return;
  closeSidebar();
  if (item.kind === 'tab') {
    window.switchTab?.(item.tab);
    if (item.scrollTo) {
      // дати вкладці відрендеритись, тоді плавно доскролити до блоку (напр. Табло новин)
      setTimeout(() => {
        document.querySelector(item.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
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
  openModal({
    title: data.title,
    bodyHtml: data.body,
    className: data.doc ? 'app-modal--doc' : '',
  });
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
  // Банер згоди / інші місця можуть відкрити правовий документ подією.
  document.addEventListener('cstl-open-legal', () => openInfoModal('policy'));
}
