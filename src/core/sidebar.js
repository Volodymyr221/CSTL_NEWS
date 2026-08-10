// src/core/sidebar.js
// Бічне меню (сайдбар) — відкривається бургером у ПРАВОМУ куті шапки, і саме
// тому виїжджає справа: панель приходить з-під кнопки, яку натиснули.
// ⚠️ До 10.08 у цьому рядку стояло «бургер зліва в шапці» — неправда з якогось
// давнього переїзду (`index.html`, `.header-right`). Дрібниця, але саме на неї
// спирається вибір боку, тож хибний коментар тут коштував би зайвої суперечки.
//
// Повний список навігації + «Адмінка», яку видно ЛИШЕ команді
// (сторож is_team_member() — server-authoritative, не обдуриш з клієнта).
//
// ═══════════════════════════════════════════════════════════════════════════
// 🔴 10.08 — РЕДИЗАЙН (замовлення Вови з макета). Що змінилось і чому.
//
// БУЛО: рівний список із 13 однакових рядків на кремовому тлі, розділений
// анонімними лініями. Три проблеми, кожна названа Вовою або аудитом:
//   • «Особистий кабінет» — головний вхід — виглядав так само, як «Автобуси»;
//   • кремовий `--paper #F4F1E6` лишався останнім великим островом бежу після
//     того, як його прибрали з усього застосунку;
//   • розділові лінії групували пункти, але не називали груп.
//
// СТАЛО: дві картки згори (профіль · Адмінка) + дві НАЗВАНІ групи рядків
// («РОЗДІЛИ», «ІНФОРМАЦІЯ») + соцмережі з підписами.
//
// 🛑 МЕХАНІКУ ВІДКРИТТЯ НЕ ЧІПАНО НАВМИСНО. За нею стоять три полагоджені баги
// (мертвий пункт кабінету B-31 · зависле затемнення · меню, впіймане знімком
// системного свайпу напіввідкритим) і 38 перевірок у двох стендах. Редизайн —
// це розмітка й стилі; `applyOpen`/`syncOverlay`/`closeSidebarInstant` лишились
// байт-у-байт. Саме тому його можна було зробити одним заходом.
// ═══════════════════════════════════════════════════════════════════════════

import { isTeamMember } from './supabase.js';
import { onAuthChange, isLoggedIn, currentUserName, currentAvatarUrl } from './auth.js';
import { LEGAL_DOC_HTML, BOARD_RULES_HTML } from './legal.js';
import { openModal } from './modal.js';
import { ICONS } from './icons.js';
import { avatarCircle, escapeHtml } from './utils.js';

// Пункти меню. kind: 'tab' → switchTab; 'account'/'cabinet' → своя дія; 'info' → модалка.
// Іконки — тонкі Tabler-вектори (Потік 7, варіант 5) замість емодзі: однаковий вигляд на всіх ОС.
//
// 🔑 РОЗДІЛИ ОПИСАНІ ТУТ, А НЕ В РОЗМІТЦІ. Плаский `NAV` нижче будується з цього
// самого списку — тобто джерело одне. Дві копії (одна для показу, друга для
// `handleNav`) розійшлися б, і це вже двічі траплялось у проєкті (списки
// антиспаму, стилі картки новини).
const SECTIONS = [
  // Картки. Це не «важливіші пункти меню», це інший ЖАНР: обидві ведуть не в
  // розділ застосунку, а до людини (профіль) і за його межі (`admin.html`).
  { id: 'cards', cards: true, items: [
    { id: 'account', label: 'Особистий кабінет', icon: ICONS.user, kind: 'account' },
    { id: 'cabinet', label: 'Адмінка',           icon: ICONS.shieldCheck, kind: 'cabinet', team: true },
  ] },
  { id: 'tabs', caption: 'Розділи', items: [
    { id: 'community',   label: 'Громада',      icon: ICONS.community, kind: 'tab', tab: 'community' },
    { id: 'news',        label: 'Новини',       icon: ICONS.newspaper, kind: 'tab', tab: 'community', scrollTo: '#cm-news-board' },
    { id: 'shotam',      label: 'Шо в селі',    icon: ICONS.fileText, kind: 'tab', tab: 'shotam' },
    { id: 'board',       label: 'Дошка',        icon: ICONS.clipboard, kind: 'tab', tab: 'board' },
    { id: 'discussions', label: 'Обговорення',  icon: ICONS.message, kind: 'tab', tab: 'discussions' },
    { id: 'buses',       label: 'Автобуси',     icon: ICONS.bus, kind: 'tab', tab: 'buses' },
    { id: 'contacts',    label: 'Корисні контакти', icon: ICONS.phone, kind: 'tab', tab: 'community', scrollTo: '#cm-contacts' },
  ] },
  { id: 'info', caption: 'Інформація', items: [
    { id: 'support', label: 'Підтримка',            icon: ICONS.help, kind: 'info' },
    // Правила Дошки — щоб їх можна було перечитати ПІСЛЯ того, як людина вже прийняла
    // гейт при першому вході (вимога Вови 03.08). Окремим пунктом, а не всередині
    // «Політики»: там документ на кілька екранів, і потрібний розділ довелось би шукати.
    // ⚠️ Іконка `shield`, а не `clipboard`: clipboard уже носить «Дошка», і два
    // однакові значки в одному меню читались як помилка. Щит тут ще й доречний —
    // це «Правила БЕЗПЕЧНОГО користування».
    { id: 'boardrules', label: 'Правила Дошки',     icon: ICONS.shield, kind: 'info' },
    { id: 'policy',  label: 'Політика і приватність', icon: ICONS.lock, kind: 'info' },
  ] },
];

// Плаский список для `handleNav` — виводиться з `SECTIONS`, окремо не ведеться.
const NAV = SECTIONS.flatMap(s => s.items);

// Соцмережі проєкту Olyka Castle (головний бренд, не сам застосунок) — футер
// сайдбару. 🔄 10.08 підписи ПОВЕРНУТО: рішення 13.07 «лише іконки» лишало два
// голі кружечки, які нічого не обіцяли. target=_blank + rel=noopener:
// відкриється застосунок Instagram/Facebook (universal links iOS).
const SOCIAL = [
  { id: 'instagram', short: 'Instagram', label: 'Instagram Olyka Castle', icon: ICONS.brandInstagram,
    url: 'https://www.instagram.com/olyka_castle?igsh=a2pmOGN3N2cyenBs' },
  { id: 'facebook', short: 'Facebook', label: 'Facebook Olyka Castle', icon: ICONS.brandFacebook,
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
// Тепер приховування описане в CSS (`visibility` + `pointer-events`), а атрибут
// `hidden` лишається ДРУГИМ рубежем — див. `syncOverlay()` нижче.
function applyOpen(open) {
  const { sidebar, overlay, toggle } = els();
  if (!sidebar || !overlay) return;
  _open = open;
  if (open) overlay.hidden = false;      // показати можна лише знявши атрибут
  sidebar.classList.toggle('sidebar--open', open);
  overlay.classList.toggle('sidebar-overlay--show', open);
  sidebar.setAttribute('aria-hidden', open ? 'false' : 'true');
  toggle?.setAttribute('aria-expanded', open ? 'true' : 'false');
  // Перемальовуємо ЩОРАЗУ при відкритті: імʼя і фото могли змінитись у кабінеті,
  // вкладка — з минулого разу, штамп версії — після деплою. Дешевше за підписки
  // на кожне з цих джерел, і не буває «меню показує вчорашнє».
  if (open) { renderNav(); refreshCabinet(); }
  else syncOverlay();           // закриття могло вже завершитись — звіримо одразу
}

// 🔴 ДРУГИЙ РУБІЖ ПРИХОВУВАННЯ. Заведений 09.08 після того, як перший фікс
// **не полагодив баг у Вови** — і зробив гірше.
//
// 🔑 КОРІНЬ, ДОВЕДЕНИЙ ПРОБОЮ (`новий bundle.js` + `старий style/sidebar.css`):
// у PWA код і стилі доїжджають на телефон ОКРЕМО і не обов'язково разом. Перший
// фікс переклав приховування затемнення на нові властивості CSS (`visibility`,
// `pointer-events`) і **перестав ставити атрибут `hidden`**. На телефоні, куди
// приїхав новий скрипт, але ще старий CSS, вийшла химера: старий CSS ховав
// затемнення ЛИШЕ атрибутом `hidden`, а ставити його стало нікому.
// Playwright показав це дослівно:
//   `<div id="sidebar-overlay" class="sidebar-overlay"> intercepts pointer events`
// — тобто прозорий шар лежав поверх усього екрана і з'їдав тапи, а Safari
// домальовував `backdrop-filter` навіть при нульовій прозорості. Рівно те, що
// Вова бачив на знімку: блюр є, меню немає, застосунок не реагує.
//
// 🛑 УРОК, ШИРШИЙ ЗА ЦЕЙ ФАЙЛ: фікс не має покладатись на те, що CSS і JS
// оновляться одночасно. Вони деплояться разом, а доїжджають нарізно.
//
// Тому `hidden` повернувся — але БЕЗ таймера, який і був початковим багом.
// Замість «через 260мс сховай» тут «щоразу, коли є нагода — звір розмітку зі
// станом». Нагоди: кінець згасання, повернення в застосунок, будь-яка дія з
// меню. Жодна з них не обов'язкова: не прийшла одна — спрацює наступна.
function syncOverlay() {
  const { overlay } = els();
  if (!overlay) return;
  if (_open) { overlay.hidden = false; return; }
  // Ховаємо, лише коли згасання вже закінчилось (класу немає) — інакше зрізали б
  // анімацію закриття, перетворивши плавне зникнення на зникнення ривком.
  if (!overlay.classList.contains('sidebar-overlay--show')) overlay.hidden = true;
}

function openSidebar() { applyOpen(true); }

function closeSidebar() { applyOpen(false); }

// 🔴 МИТТЄВЕ ЗАКРИТТЯ — ДЛЯ ПЕРЕХОДІВ ІЗ МЕНЮ (10.08, третій знімок Вови).
//
// Скарга з уточненням, яке й дало розгадку: «якщо натискаю стрілочку "<" в
// особистому кабінеті — нічого не вилазить, а якщо СВАЙПОМ — досі визирає
// бургер-меню». Два різні шляхи назад дають різний результат, тобто справа не в
// стані меню (він однаковий), а в тому, ЯК малюється перехід.
//
// 🔑 КОРІНЬ: свайп — це системний жест iOS, і Safari програє його **знімком**
// попереднього стану сторінки. Знімок робиться в момент переходу — а тоді меню
// ще ЇХАЛО (анімація 0.28с почалась мить тому). Тобто у знімку меню
// напіввідкрите, і саме його Вова бачить на свайпі. Стрілка «<» знімка не
// використовує, тому там чисто.
// ⚠️ Попередній фікс (`visibility` наприкінці виїзду, PR #869) правильний, але
// цього класу не закриває: він робить меню відсутнім ПІСЛЯ анімації, а знімок
// уже знято ДО.
//
// Тому для переходів меню зникає БЕЗ анімації — до того, як відкриється екран.
// Це і природно: ти вибрав пункт, ти вже в іншому місці. Плавне згортання
// лишається там, де людина закриває саме меню: ✕, тап по затемненню, «назад».
//
// ⚠️ `void sidebar.offsetWidth` — не «магічний рядок»: він змушує браузер
// застосувати новий стан У ЦЬОМУ Ж кадрі, поки переходи вимкнені. Без нього
// клас зняли б раніше, ніж стан устиг застосуватись, і анімація все одно пішла б.
function closeSidebarInstant() {
  const { sidebar, overlay } = els();
  sidebar?.classList.add('sidebar--instant');
  overlay?.classList.add('sidebar--instant');
  applyOpen(false);
  void sidebar?.offsetWidth;              // застосувати стан негайно
  if (overlay) overlay.hidden = true;     // затемнення теж прибираємо одразу
  sidebar?.classList.remove('sidebar--instant');
  overlay?.classList.remove('sidebar--instant');
}

// Рядок розділу. Клас `.sidebar-item` навмисно ЛИШИВСЯ той самий: це та сама
// сутність (пункт меню), і за нього тримаються три чинні стенди. Перейменування
// заради «свіжості» зламало б їх, не змінивши нічого для людини.
function itemHtml(item, activeTab) {
  const hidden = item.team ? ' hidden' : '';
  // «Ти зараз тут». Лише для справжніх вкладок: «Новини» і «Корисні контакти» —
  // це прокрутка ВСЕРЕДИНІ Громади (`scrollTo`), і позначати їх активними разом
  // із самою Громадою означало б світити три крапки одночасно.
  const тут = item.kind === 'tab' && !item.scrollTo && item.tab === activeTab;
  return `<button class="sidebar-item" type="button" data-nav="${item.id}"${hidden}${тут ? ' aria-current="page"' : ''}>
    <span class="sidebar-item-icon">${item.icon}</span>
    <span class="sidebar-item-label">${item.label}</span>
    ${тут ? '<span class="sidebar-item-dot" aria-hidden="true"></span>' : ''}
    <span class="sidebar-item-go" aria-hidden="true">${ICONS.chevronRight}</span>
  </button>`;
}

// ── КАРТКА ПРОФІЛЮ ──────────────────────────────────────────────────────────
// Побудована як блок автора в оголошенні (`renderAdAuthor`, `tabs/board.js`):
// аватар · імʼя · тихий підпис · шеврон. Замовлення Вови дослівно: «типу імʼя і
// знизу особистий кабінет». Спільний хелпер `avatarCircle` — той самий, що в
// чаті й кабінеті, тож фото/літера/анонім поводяться однаково скрізь.
//
// 🔴 СТАН ГОСТЯ — окремий, і без нього не можна було запускатись. У макета його
// немає, але це НАЙЧАСТІШИЙ стан для нової людини: незалогінений не має ні
// імені, ні фото, і картка була б порожньою рамкою.
//
// ⚠️ АТРИБУТ `data-account-btn` СЮДИ НЕ СТАВИТИ, хоч і проситься. Два наслідки,
// обидва ламають екран: (1) `refreshAccountButtons()` переписує `innerHTML`
// таких кнопок на самий аватар — від картки лишився б кружечок; (2) `handleNav`
// шукає `[data-account-btn]` через `querySelector`, і картка (сайдбар лежить у
// розмітці ВИЩЕ за `.app-main`) знайшлась би першою — тап сам по собі.
function profileCardHtml() {
  const увійшов = isLoggedIn();
  const імʼя  = увійшов ? (currentUserName() || 'Житель') : 'Приєднатись';
  const підпис = увійшов ? 'Особистий кабінет' : 'Вхід через Google';
  const ава = увійшов
    ? avatarCircle({ name: імʼя, url: currentAvatarUrl(), cls: 'sb-av' })
    : `<span class="sb-av sb-av--guest">${ICONS.user}</span>`;
  return `<button class="sb-card sb-card--me" type="button" data-nav="account">
    ${ава}
    <span class="sb-card-txt">
      <span class="sb-card-name">${escapeHtml(імʼя)}</span>
      <span class="sb-card-sub">${підпис}</span>
    </span>
    <span class="sb-card-go" aria-hidden="true">${ICONS.chevronRight}</span>
  </button>`;
}

// Картка «Адмінка». `hidden` за замовчуванням — знімає його `refreshCabinet()`
// після відповіді сервера. Саме так, а не навпаки: показати й сховати означало б
// блимнути адмінкою перед кожним звичайним жителем.
function adminCardHtml(item) {
  return `<button class="sb-card sb-card--admin" type="button" data-nav="${item.id}"${_team ? '' : ' hidden'}>
    <span class="sb-card-ic">${item.icon}</span>
    <span class="sb-card-txt">
      <span class="sb-card-name">${item.label}</span>
      <span class="sb-card-sub">Панель керування</span>
    </span>
    <span class="sb-card-go" aria-hidden="true">${ICONS.chevronRight}</span>
  </button>`;
}

// Лічильник версії — ОДНЕ джерело: штамп у шапці, який підміняє CI (`deploy.yml`,
// `sed` по `index.html`). Другий рядок у розмітці був би другим джерелом.
function paintVersion() {
  const el = document.getElementById('sidebar-ver');
  if (!el) return;
  el.textContent = (document.querySelector('.deploy-stamp')?.textContent || '').trim();
}

function renderNav() {
  const { nav } = els();
  if (!nav) return;
  const activeTab = document.querySelector('.app-main')?.dataset.tab || '';

  const секції = SECTIONS.map(s => {
    if (s.cards) {
      return `<div class="sb-cards">${s.items.map(i =>
        i.kind === 'account' ? profileCardHtml() : adminCardHtml(i)).join('')}</div>`;
    }
    return `<div class="sb-cap">${s.caption}</div>
      <div class="sb-group">${s.items.map(i => itemHtml(i, activeTab)).join('')}</div>`;
  }).join('');

  // Футер соцмереж — притиснутий до низу меню (margin-top:auto у CSS),
  // <a> зі справжнім href: iOS відкриє застосунок Instagram/Facebook.
  const socialHtml = `
    <div class="sb-social-foot">
      <div class="sb-social-cap">Слідкуйте за нами</div>
      <div class="sb-social-row">
        ${SOCIAL.map(s => `<a class="sb-social-btn" href="${s.url}" target="_blank" rel="noopener" aria-label="${s.label}">
          <span class="sb-social-ic">${s.icon}</span><span class="sb-social-lb">${s.short}</span>
        </a>`).join('')}
      </div>
    </div>`;

  nav.innerHTML = секції + socialHtml;
  paintVersion();
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
  // 🔴 Саме МИТТЄВЕ, а не плавне (див. коментар до `closeSidebarInstant`):
  // системний свайп «назад» показує знімок сторінки, зроблений у момент
  // переходу, і плавне згортання потрапляє в цей знімок напіввідкритим.
  closeSidebarInstant();
  if (item.kind === 'tab') {
    window.switchTab?.(item.tab);
    if (item.scrollTo) {
      // дати вкладці відрендеритись, тоді плавно доскролити до блоку (напр. Табло новин)
      setTimeout(() => {
        document.querySelector(item.scrollTo)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 300);
    }
  } else if (item.kind === 'account') {
    // 🔴 B-31 (знайдено аудитом 09.08, виправлено 09.08). Тут стояло
    // `document.getElementById('account-btn')` — кнопки з таким id у застосунку
    // вже немає: вона переїхала до привітання на Громаді й тепер позначається
    // атрибутом `[data-account-btn]` (`core/account-ui.js`, там і коментар про
    // переїзд). `?.click()` на `null` мовчки не робить НІЧОГО, тому пункт меню
    // був мертвий беззвучно — ні екрана, ні тосту, ні помилки в консолі.
    // ⚠️ Шукаємо саме за атрибутом, а не за новим id: кнопок може бути кілька
    // (делегат у `account-ui.js` слухає всі `[data-account-btn]`), і прибивати
    // цвяхами конкретне місце — це рівно та помилка, яку зараз лагодимо.
    document.querySelector('[data-account-btn]')?.click();
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

// Показати/сховати «Адмінку» за server-сторожем.
// ⚠️ `_team` — памʼять минулої відповіді, а НЕ заміна перевірці. Потрібна тому,
// що тепер меню перемальовується на кожне відкриття: без памʼяті картка щоразу
// малювалась би схованою і виринала за мить, коли прийде відповідь сервера, —
// тобто блимала б у Вови при кожному тапі по бургеру. Право доступу вирішує
// однаково `is_team_member()`; кеш лише прибирає блимання.
let _team = false;
async function refreshCabinet() {
  const btn = document.querySelector('[data-nav="cabinet"]');
  if (!btn) return;
  let team = false;
  try { team = await isTeamMember(); } catch { team = false; }
  _team = team;
  btn.hidden = !team;
}

export function initSidebar() {
  const { toggle, close, overlay } = els();
  if (!toggle) return;
  renderNav();
  applyOpen(false);   // явний закритий стан, а не «як склалось у розмітці»
  toggle.addEventListener('click', () => (_open ? closeSidebar() : openSidebar()));
  close?.addEventListener('click', closeSidebar);
  overlay?.addEventListener('click', closeSidebar);
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && _open) closeSidebar(); });
  // Кінець згасання — найприродніша нагода сховати затемнення остаточно.
  // ⚠️ Це не єдиний шлях, а лише найшвидший: у фоні `transitionend` не приходить,
  // тому нижче стоять запасні нагоди. Жодна з них не обов'язкова.
  overlay?.addEventListener('transitionend', e => {
    if (e.propertyName === 'opacity') syncOverlay();
  });
  // 🛑 09.08 — ТУТ БУЛО `closeSidebar()` НА ПОДІЇ ФОНУ, І ЦЕ БУЛА ПОМИЛКА.
  // Задум був «пішов у Instagram → повернувся на чистий екран». Наслідок, який
  // Вова побачив на телефоні: *«натиснув на бургер, меню відкрилось та відразу
  // закрилось»*. Механіка доведена пробою: на iOS відкладені `visibilitychange`
  // і `pageshow` приходять уже ПІСЛЯ тапу — і закривали щойно відкрите меню.
  // 🔑 Правило, яке з цього лишається: **подія фону не МІНЯЄ стан меню, вона лише
  // приводить розмітку у відповідність до стану, який уже є.** Закрити меню має
  // рівно те, що людина натиснула, — і нічого більше. Тап по іконці соцмережі
  // закриває його сам (`renderNav`), тобто задум і без цього виконується.
  // ⚠️ Це ще й HOT_RULES №9 у чистому вигляді: я зробив те, про що не просили,
  // і зламав дію, яка працювала.
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') syncOverlay();
  });
  window.addEventListener('pageshow', syncOverlay);
  // Вхід/вихід міняє і право на «Адмінку», і саму картку профілю (імʼя, фото,
  // стан гостя). Перемальовуємо лише коли меню відкрите — інакше це зробить
  // найближче відкриття, і зайвої роботи у фоні немає.
  onAuthChange(() => { if (_open) renderNav(); refreshCabinet(); });
  refreshCabinet();
  // Банер згоди / інші місця можуть відкрити правовий документ подією.
  document.addEventListener('cstl-open-legal', () => openInfoModal('policy'));
}
