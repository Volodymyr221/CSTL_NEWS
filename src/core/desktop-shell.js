// src/core/desktop-shell.js
// КОМПʼЮТЕРНА ВЕРСІЯ — рама навколо застосунку (08.10.2026).
//
// 🗣️ Вова: «детально продумати комп'ютерну версію… в такому самому стилі… просто і
// сучасно», рішення по макету — «Зараз, на повну». Вигляд описує `style/desktop.css`;
// тут лише те, чого CSS зробити не може:
//   1. бренд, другорядні пункти й картка кабінету в лівій панелі;
//   2. права колонка (погода в Олиці, QR «Громада в телефоні»);
//   3. Esc закриває вікна й шари — на компʼютері це очікує кожен.
//
// 🔑 ДРУГОРЯДНІ ПУНКТИ НЕ ВЕДУТЬСЯ ТУТ ОКРЕМИМ СПИСКОМ. Їх уже має бічне меню
// (`SECTIONS` у `sidebar.js` — єдине джерело правди: права команди, лічильник
// непрочитаних, крапки «є нове»). Ми дзеркалимо ВЖЕ НАМАЛЬОВАНІ пункти меню і
// перебудовуємось, коли меню перемальовується. Окремий список розійшовся б із
// меню при першому ж новому пункті — це вже двічі траплялось у проєкті.
//
// 🛑 На телефоні модуль не робить НІЧОГО: перевірка `isDesktop()` стоїть першою.

import { navigateFromMenu, refreshMenu } from './sidebar.js';
import { onAuthChange } from './auth.js';
import { hasOpenLayer, closeAllLayers } from './layers.js';
import { qrSvg } from './qr.js';
import { weatherCodeInfo } from './weather-icons.js';
import { OLYKA_COORDS } from './utils.js';

// ⚠️ Той самий запит, що в `style/desktop.css`. Міняєш там — міняй тут.
export const DESKTOP_MQ = '(min-width: 960px) and (hover: hover) and (pointer: fine)';

export function isDesktop() {
  try { return !!window.matchMedia && window.matchMedia(DESKTOP_MQ).matches; }
  catch (_) { return false; }
}

// Вкладки вже стоять у панелі самі (таб-бар), у списку «Ще» їх не дублюємо.
const ВКЛАДКИ = new Set(['community', 'shotam', 'discussions', 'board', 'buses', 'power']);

let _built = false;

const QUESTION_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M9.6 9.3a2.5 2.5 0 0 1 4.8.9c0 1.7-2.4 2.2-2.4 3.6"/><path d="M12 17h.01"/></svg>';
const PLUS_IC = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M12 5v14M5 12h14"/></svg>';

// «Створити» на компʼютері замість круглої кнопки «+» у куті колонки. Плаваюча кнопка —
// жест телефона (під великий палець); на компʼютері головна дія живе в навігації,
// як «Написати» в пошті. Дія та сама, що в меню круглої кнопки: перемикаємо вкладку
// і натискаємо її ж пункт — тобто код дії ОДИН (обробник у `board.js`), а не копія.
function runFab(spec) {
  const [tab, act] = spec.split(':');
  navigateFromMenu(tab);
  const t0 = Date.now();
  const tick = () => {
    const item = document.querySelector(`.board-fab-item[data-fab="${act}"]`);
    if (item) { item.click(); return; }
    if (Date.now() - t0 < 4000) setTimeout(tick, 80);
  };
  setTimeout(tick, 60);
}

function el(tag, cls, html) {
  const n = document.createElement(tag);
  if (cls) n.className = cls;
  if (html != null) n.innerHTML = html;
  return n;
}

// ── Ліва панель ─────────────────────────────────────────────────────────────
// Порядок — від «куди піти» до «що моє» (рішення Вови 08.10):
//   вкладки → інші розділи (Новини, Збори) → «Створити» → МОЄ → … → КОМАНДА → кабінет.
// 🗣️ «Адмінка, дивитися як житель, новини, збори — воно все якось змішується»:
// тому кожна купа — свій вузол, а не один список. Пункти беруться з бічного меню
// (`SECTIONS` у `sidebar.js` — єдине джерело правди), групою за підписом `.sb-cap`.
// «Інформація» (політика, правила, підтримка, контакти) — у підвалі правої колонки.
const ПІДВАЛ = new Set(['contacts', 'support', 'boardrules', 'policy']);
const КОМАНДА = new Set(['cabinet', 'as-resident']);
// «Мої питання» живуть у меню круглої кнопки Питань, якої на компʼютері немає
// (її роль бере «Створити»). Без цього рядка на компʼютері до них не було б входу.
const МОЇ_ПИТАННЯ = `<button type="button" data-dk-fab="discussions:disc-mine">${'%Q%'}<span>Мої питання</span></button>`;

function navItemHtml(b) {
  const іконка = b.querySelector('.sidebar-item-icon, .sb-card-ic')?.innerHTML || '';
  const назва = b.querySelector('.sidebar-item-label, .sb-card-name')?.textContent || '';
  const бейдж = b.querySelector('.sidebar-item-badge:not([hidden])')?.textContent || '';
  return `<button type="button" data-dk-nav="${b.dataset.nav}">${іконка}<span>${назва}</span>`
    + (бейдж ? `<span class="dk-count">${бейдж}</span>` : '') + '</button>';
}
const put = (node, html) => { if (node.innerHTML !== html) node.innerHTML = html; };

function syncGroups({ sec, more, team }) {
  const src = document.getElementById('sidebar-nav');
  if (!src) return;
  const видимі = sel => [...src.querySelectorAll(sel)].filter(b => !b.hidden);
  const group = caption => {
    const cap = [...src.querySelectorAll('.sb-cap')].find(c => c.textContent.trim() === caption);
    const g = cap?.nextElementSibling;
    return g ? [...g.querySelectorAll('.sidebar-item')].filter(b => !b.hidden) : [];
  };
  put(sec, group('Розділи').filter(b => !ВКЛАДКИ.has(b.dataset.nav)).map(navItemHtml).join(''));
  put(more, '<div class="dk-cap">Моє</div>' + group('Моє').map(navItemHtml).join('')
    + МОЇ_ПИТАННЯ.replace('%Q%', QUESTION_IC));
  const команда = видимі('.sb-card--admin, .sb-group .sidebar-item').filter(b => КОМАНДА.has(b.dataset.nav));
  put(team, команда.length ? '<div class="dk-cap">Команда</div>' + команда.map(navItemHtml).join('') : '');
  team.hidden = !команда.length;
}

function syncMe(me) {
  const card = document.querySelector('#sidebar-nav .sb-card--me');
  if (!card) return;
  const ава = card.querySelector('.sb-av')?.outerHTML || '';
  const імʼя = card.querySelector('.sb-card-name')?.textContent || 'Кабінет';
  const підпис = card.querySelector('.sb-card-sub')?.textContent || '';
  const html = `<span class="dk-me-av">${ава}</span><span>${імʼя}<small>${підпис}</small></span>`;
  if (me.innerHTML !== html) me.innerHTML = html;
}

function buildNav() {
  const nav = document.querySelector('.tab-bar');
  if (!nav || nav.querySelector('.dk-brand')) return;
  nav.prepend(el('div', 'dk-brand', 'ГРОМАДА<small>Олицька громада</small>'));

  const cta = el('div', 'dk-cta', `<button type="button" class="dk-cta-btn" aria-haspopup="menu" aria-expanded="false">${PLUS_IC}<span>Створити</span></button>
    <div class="dk-cta-menu" role="menu" hidden>
      <button type="button" role="menuitem" data-dk-fab="board:post"><b>Подати оголошення</b><small>Продам, віддам, послуги, підвезу</small></button>
      <button type="button" role="menuitem" data-dk-fab="discussions:disc-create"><b>Поставити питання</b><small>Відповідять люди з громади</small></button>
    </div>`);
  const ctaBtn = cta.querySelector('.dk-cta-btn');
  const ctaMenu = cta.querySelector('.dk-cta-menu');
  const setMenu = open => { ctaMenu.hidden = !open; ctaBtn.setAttribute('aria-expanded', String(open)); };
  ctaBtn.addEventListener('click', e => { e.stopPropagation(); setMenu(ctaMenu.hidden); });
  document.addEventListener('click', e => { if (!cta.contains(e.target)) setMenu(false); });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && !ctaMenu.hidden) { e.preventDefault(); setMenu(false); }
  }, true);   // фаза захоплення: раніше за загальний Esc, який закрив би вікно під меню
  const sec = el('div', 'dk-sec');
  const more = el('div', 'dk-more');
  more.setAttribute('aria-label', 'Моє');
  const team = el('div', 'dk-team');
  team.setAttribute('aria-label', 'Команда');
  nav.append(sec, cta, more, team);
  nav.addEventListener('click', e => {
    const f = e.target.closest('[data-dk-fab]');
    if (f) { setMenu(false); runFab(f.dataset.dkFab); return; }
    const b = e.target.closest('[data-dk-nav]');
    if (b) navigateFromMenu(b.dataset.dkNav);
  });
  const me = el('button', 'dk-me');
  me.type = 'button';
  me.addEventListener('click', () => navigateFromMenu('account'));
  nav.appendChild(me);

  // Ліва панель видна завжди, тож клік по ній, поки відкрито екран чи статтю, мусить
  // привести в розділ, а не перемкнути вкладку ПІД відкритим екраном. Перехоплюємо
  // на фазі захоплення — раніше за обробник самого пункту.
  // 🔴 Закриття шарів — це `history.go(-n)`, і воно АСИНХРОННЕ: якщо одразу відкрити
  // новий екран (Кабінет, Новини), запізнілий «назад» закриє вже його — екран
  // блимав і зникав. Тому клік відкладаємо до моменту, коли шари справді закрились,
  // і повторюємо його вже на чистому стеку.
  nav.addEventListener('click', e => {
    const ціль = e.target.closest('.tab-item, [data-dk-nav], [data-dk-fab], .dk-me');
    if (!ціль) return;
    const стаття = document.getElementById('article-modal');
    if (стаття && стаття.classList.contains('open')) window.closeArticleModal?.();
    if (!hasOpenLayer()) return;
    e.stopPropagation(); e.preventDefault();
    afterLayersClosed(() => ціль.click());
  }, true);

  const sync = () => { syncGroups({ sec, more, team }); syncMe(me); syncActive(); };
  sync();
  const src = document.getElementById('sidebar-nav');
  if (src) new MutationObserver(sync).observe(src, { childList: true, subtree: true, attributes: true, characterData: true });
}

// ── «Ти зараз тут» для екранів поверх вкладки ────────────────────────────────
// Відкрито Кабінет чи Новини — а в навігації далі світилась «Громада», бо вкладка
// під екраном не змінилась. На телефоні цього не видно (таб-бар під екраном
// прихований), а на компʼютері навігація видна завжди — і брехала.
const ЕКРАНИ = [
  ['.acc-cab', 'me'], ['.nh-screen', 'news'], ['.fs-screen', 'fund'],
  ['.pm-screen--list', 'messages'], ['.pm-screen--ads', 'myads'], ['.shub-sheet', 'saved'],
];
function syncActive() {
  const nav = document.querySelector('.tab-bar');
  if (!nav) return;
  const тут = ЕКРАНИ.find(([sel]) => document.querySelector(sel))?.[1] || '';
  nav.classList.toggle('dk-layer', !!тут);
  nav.querySelectorAll('[data-dk-nav]').forEach(b => b.classList.toggle('dk-on', b.dataset.dkNav === тут));
  nav.querySelector('.dk-me')?.classList.toggle('dk-on', тут === 'me');
}
// Стрілки ‹ › над рядом спільнот — з'являються при наведенні, лише коли є куди гортати.
const ARR = d => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="${d}"/></svg>`;
function syncArrows(wrap) {
  const ряд = wrap.querySelector('.fd-circles');
  if (!ряд) return;
  const [l, r] = wrap.querySelectorAll('.dk-hs-btn');
  const max = ряд.scrollWidth - ряд.clientWidth;
  l.hidden = ряд.scrollLeft <= 2;
  r.hidden = max <= 2 || ряд.scrollLeft >= max - 2;
}
function ensureArrows() {
  document.querySelectorAll('.fd-circles-wrap').forEach(wrap => {
    if (wrap.querySelector('.dk-hs-btn')) { syncArrows(wrap); return; }
    const ряд = wrap.querySelector('.fd-circles');
    if (!ряд) return;
    const mk = (cls, d, dir) => {
      const b = el('button', 'dk-hs-btn ' + cls, ARR(d));
      b.type = 'button';
      b.setAttribute('aria-label', dir < 0 ? 'Попередні спільноти' : 'Наступні спільноти');
      b.addEventListener('click', () => ряд.scrollBy({ left: dir * ряд.clientWidth * 0.8, behavior: 'smooth' }));
      return b;
    };
    wrap.append(mk('dk-hs-btn--l', 'M15 6l-6 6 6 6', -1), mk('dk-hs-btn--r', 'M9 6l6 6-6 6', 1));
    ряд.addEventListener('scroll', () => syncArrows(wrap), { passive: true });
    syncArrows(wrap);
  });
}

// ✕ у вікнах Стрічки (новий допис, коментарі…). На телефоні їх закривають свайпом
// за рисочку, якої тут немає; Esc і клік повз працюють, але кнопку людина шукає очима.
// Закриття — тим самим шляхом, що й Esc (`attachBackdropClose` у feed.js), тобто без
// другої логіки закриття.
function ensureSheetClose() {
  document.querySelectorAll('.fd-sheet-back .fd-sheet').forEach(sheet => {
    if (sheet.querySelector(':scope > .dk-sheet-x')) return;
    const x = el('button', 'dk-sheet-x', '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><path d="M6 6l12 12M18 6L6 18"/></svg>');
    x.type = 'button';
    x.setAttribute('aria-label', 'Закрити');
    x.addEventListener('click', () => document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true })));
    sheet.prepend(x);
  });
}

let _activeRaf = 0;
function watchScreens() {
  new MutationObserver(() => {
    if (_activeRaf) return;
    _activeRaf = requestAnimationFrame(() => { _activeRaf = 0; syncActive(); ensureArrows(); ensureSheetClose(); });
  }).observe(document.body, { childList: true, subtree: true });
}

// Закрити всі шари й дочекатись, поки браузер відпрацює `history.go(-n)`.
function afterLayersClosed(fn) {
  let done = false;
  const go = () => { if (done) return; done = true; window.removeEventListener('popstate', onPop); fn(); };
  const onPop = () => setTimeout(go, 0);
  window.addEventListener('popstate', onPop);
  closeAllLayers();
  setTimeout(go, 500);   // запасний вихід, якщо `popstate` не прийде
}

// ── Права колонка ───────────────────────────────────────────────────────────
async function fillWeather(card) {
  const { lat, lon } = OLYKA_COORDS;
  const ac = new AbortController();
  const стоп = setTimeout(() => ac.abort(), 6000);
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}`
      + '&current=temperature_2m,weather_code,wind_speed_10m&wind_speed_unit=ms&timezone=auto', { signal: ac.signal });
    const d = await r.json();
    const c = d.current;
    const info = weatherCodeInfo(c.weather_code);
    card.innerHTML = `<div class="dk-k">Олика зараз</div>
      <div class="dk-wx"><span class="dk-wx-ic">${info.icon}</span>
        <span class="dk-wx-t">${Math.round(c.temperature_2m)}°</span></div>
      <div class="dk-s">${info.text} · вітер ${Math.round(c.wind_speed_10m)} м/с</div>`;
  } catch (_) {
    // Немає погоди — немає картки. Порожня рамка «тимчасово недоступно» праворуч
    // лише займала б місце, а повний прогноз однаково живе на Громаді.
    card.remove();
  } finally {
    clearTimeout(стоп);
  }
}

function buildRail() {
  if (document.querySelector('.dk-rail')) return;
  const rail = el('aside', 'dk-rail');
  rail.setAttribute('aria-label', 'Корисне');
  const wx = el('div', 'dk-card');
  rail.appendChild(wx);
  let qr = '';
  try { qr = qrSvg(location.origin + location.pathname, { label: 'QR-код: відкрити «Громаду» на телефоні' }); } catch (_) { qr = ''; }
  rail.appendChild(el('div', 'dk-card', `<div class="dk-k">Громада в телефоні</div>
    <div class="dk-t">Постав застосунок на екран</div>
    <div class="dk-s">Наведи камеру телефона — і сповіщення про автобус, відповіді на питання й
      нові оголошення будуть завжди під рукою. <a href="install.html" target="_blank" rel="noopener">Як встановити</a></div>
    ${qr ? `<div class="dk-qr">${qr}</div>` : ''}`));
  // Підвал сайту: на компʼютері людина шукає правові й довідкові посилання саме тут,
  // унизу правої колонки — так улаштовані всі великі сайти.
  const рік = new Date().getFullYear();
  const foot = el('nav', 'dk-foot', `<button type="button" data-dk-nav="policy">Політика і приватність</button>
    <button type="button" data-dk-nav="boardrules">Правила Дошки</button>
    <button type="button" data-dk-nav="support">Підтримка</button>
    <button type="button" data-dk-nav="contacts">Корисні контакти</button>
    <span>© ${рік} Громада · Olyka Castle</span>`);
  foot.setAttribute('aria-label', 'Інформація');
  foot.addEventListener('click', e => {
    const b = e.target.closest('[data-dk-nav]');
    if (!b) return;
    if (hasOpenLayer()) afterLayersClosed(() => navigateFromMenu(b.dataset.dkNav));
    else navigateFromMenu(b.dataset.dkNav);
  });
  rail.appendChild(foot);
  document.body.appendChild(rail);
  fillWeather(wx);
}

// ── Esc ─────────────────────────────────────────────────────────────────────
// На телефоні вікна закривають свайпом і «назад», клавіатури немає. На компʼютері
// Esc — перше, що натискає людина. Порядок — від найвищого шару до нижчого.
function onEsc(e) {
  if (e.key !== 'Escape' || e.defaultPrevented || !isDesktop()) return;
  const закрити = document.querySelector('.app-modal .app-modal-close');
  if (закрити) { закрити.click(); return; }
  // Екран питання (`onChatEsc` у board-discussions.js) і аркуші Стрічки
  // (`attachBackdropClose` у feed.js) закриваються по Esc самі, а сторінка оголошення
  // ставить `preventDefault` — не дублюємо, інакше один натиск закрив би два рівні.
  if (document.querySelector('.qa-screen, .fd-sheet-back')) return;
  if (hasOpenLayer()) { history.back(); return; }
  const стаття = document.getElementById('article-modal');
  if (стаття && стаття.classList.contains('open')) window.closeArticleModal?.();
}

// ── Прокрутка з будь-якого місця ──────────────────────────────────────────
// Колонка — окремий скролер посеред екрана, а миша людини часто стоїть на порожньому
// полі збоку. Без цього колесо там не робило б нічого, і сторінка здавалась би
// «застиглою». Передаємо прокрутку колонці, лише коли під мишею немає власного
// скролера (навігація, права колонка, відкриті екрани й вікна крутяться самі).
function onWheel(e) {
  if (!isDesktop() || e.ctrlKey) return;
  // Горизонтальний ряд (спільноти Стрічки): у мишки колесо лише вертикальне, тож
  // над рядом воно крутить ряд убік — інакше дістатись правих кружечків не було б чим.
  const ряд = e.target.closest?.('.fd-circles');
  if (ряд && ряд.scrollWidth > ряд.clientWidth + 2 && Math.abs(e.deltaY) > Math.abs(e.deltaX)) {
    const до = ряд.scrollLeft;
    ряд.scrollLeft += e.deltaY;
    if (ряд.scrollLeft !== до) { e.preventDefault(); return; }
  }
  if (e.target.closest?.('.app-main, .tab-bar, .dk-rail, .app-modal, .sidebar, [role="dialog"]')) return;
  if (hasOpenLayer() || document.querySelector('#article-modal.open, .fd-sheet-back, .qa-screen')) return;
  const main = document.querySelector('.app-main');
  if (main) main.scrollTop += e.deltaY;
}

export function initDesktopShell() {
  if (_built) return;
  document.addEventListener('keydown', onEsc);
  window.addEventListener('wheel', onWheel, { passive: false });
  const build = () => {
    if (_built || !isDesktop()) return;
    _built = true;
    buildNav();
    buildRail();
    watchScreens();
    // Ліва панель — дзеркало меню, тож меню мусить бути свіжим завжди, а не лише
    // відкрите: вхід/вихід і зміна імені чи фото в кабінеті.
    onAuthChange(() => refreshMenu());
    window.addEventListener('cstl-profile-updated', () => refreshMenu());
    refreshMenu();
  };
  build();
  // Вікно могли розширити вже після старту (почали вузьким) — добудовуємо раму.
  try { window.matchMedia(DESKTOP_MQ).addEventListener('change', build); } catch (_) {}
}
