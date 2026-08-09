// src/core/sidebar.js
// Бічне меню (сайдбар) — відкривається бургером зліва в шапці.
// Повний список навігації + пункт «Кабінет», який видно ЛИШЕ команді
// (сторож is_team_member() — server-authoritative, не обдуриш з клієнта).

import { isTeamMember } from './supabase.js';
import { onAuthChange } from './auth.js';
import { LEGAL_DOC_HTML, BOARD_RULES_HTML } from './legal.js';
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
  // Правила Дошки — щоб їх можна було перечитати ПІСЛЯ того, як людина вже прийняла
  // гейт при першому вході (вимога Вови 03.08). Окремим пунктом, а не всередині
  // «Політики»: там документ на кілька екранів, і потрібний розділ довелось би шукати.
  { id: 'boardrules', label: 'Правила Дошки',     icon: ICONS.clipboard, kind: 'info' },
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
  boardrules: {
    title: 'Правила Дошки',
    className: 'app-modal--brules',   // той самий вигляд, що й у гейта при першому вході
    body: BOARD_RULES_HTML,
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

// 🔴 ОДИН СИНХРОННИЙ ВИМИКАЧ СТАНУ — і меню, і затемнення міняються в одному
// кадрі, з одного місця. Ні `requestAnimationFrame`, ні `setTimeout` тут більше
// немає, і повертати їх не можна — саме вони давали баг «затемнення лишилось,
// а меню зникло» (Вова, 09.08: тап по Instagram → повернення → блюр висить).
//
// 🔑 Чому відкладені виклики були тут пасткою (дві незалежні причини):
//   • `requestAnimationFrame` у фоні НЕ виконується. Відкрив меню → застосунок
//     пішов у фон → кадру немає → класи не додались. Повернувся, встиг закрити —
//     і аж тоді браузер віддає кадр і виконує відкладене «відкрити». Стан у
//     змінній `_open` каже «закрито», а розмітка малює відкрите. Розійшлись.
//   • `setTimeout(…, 260)`, що ховав затемнення, на iOS замерзає разом зі
//     сторінкою. Не спрацював — затемнення лишилось на весь екран.
// Тепер приховування описане в CSS (`visibility` + `pointer-events`), тож жодна
// пауза між «зняли клас» і «зникло» більше не потрібна.
function applyOpen(open) {
  const { sidebar, overlay, toggle } = els();
  if (!sidebar || !overlay) return;
  _open = open;
  sidebar.classList.toggle('sidebar--open', open);
  overlay.classList.toggle('sidebar-overlay--show', open);
  sidebar.setAttribute('aria-hidden', open ? 'false' : 'true');
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  if (open) refreshCabinet();   // перевіряємо команду щоразу при відкритті
}

function openSidebar() { applyOpen(true); }

function closeSidebar() { applyOpen(false); }

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
    className: data.className || (data.doc ? 'app-modal--doc' : ''),
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
  // Атрибут `hidden` у розмітці — страховка на випадок, коли JS не завантажився
  // (тоді затемнення не має існувати взагалі). Щойно модуль ожив, видимістю
  // керує вже CSS, тож атрибут знімаємо один раз і більше ніколи не чіпаємо.
  if (overlay) overlay.hidden = false;
  applyOpen(false);   // явний закритий стан, а не «як склалось у розмітці»
  toggle.addEventListener('click', () => (_open ? closeSidebar() : openSidebar()));
  close?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && _open) closeSidebar(); });
  // 🔴 ЗАСТОСУНОК ІДЕ У ФОН — МЕНЮ ЗАКРИВАЄМО. Це лікує сцену Вови в корені, а не
  // наслідок: пішов у Instagram із відкритого меню → повернувся на чистий екран.
  // Три різні приводи, бо жоден не покриває всі шляхи виходу:
  //   • `visibilitychange` — перемикання на інший застосунок (головний шлях у PWA);
  //   • `pagehide` — перехід за посиланням / закриття вкладки;
  //   • `pageshow` з `persisted` — повернення з кешу «назад-вперед», який
  //     відновлює розмітку РІВНО такою, якою вона була в момент відходу, тобто
  //     може принести відкрите меню назад уже після того, як ми його закрили.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') closeSidebar();
  });
  window.addEventListener('pagehide', closeSidebar);
  window.addEventListener('pageshow', e => { if (e.persisted) closeSidebar(); });
  // Оновлюємо видимість «Кабінет» при вход/вихід.
  onAuthChange(() => refreshCabinet());
  refreshCabinet();
  // Банер згоди / інші місця можуть відкрити правовий документ подією.
  document.addEventListener('cstl-open-legal', () => openInfoModal('policy'));
}
