// src/core/saved-hub.js
// Хаб «Збережені» — bottom-sheet з іконки 🔖 у шапці (рішення Роми 08.07).
// 12.07 (за проханням Роми): 2 екрани замість одного довгого списку — спершу
// категорії з лічильником, тап відкриває список саме цієї категорії.
//   📰 СТАТТІ      (saved_articles, БД)  → тап: модалка статті
//   🚌 АВТОБУСИ    (trackedRoutes, buses.js)           → тап: вкладка Автобуси + скрол на рейс
//   💬 ПИТАННЯ     (пости type='chat')  → тап по картці: вкладка Питання + екран питання
//   📌 ОГОЛОШЕННЯ  (пости type='board') → тап по картці: Дошка, таб «Збережені»
//
// 🔴 24.08 — ВЕСЬ АРКУШ ЗА ГЕЙТОМ ВХОДУ, І ЦЕ ВИПРАВЛЕННЯ ДВОХ ВАД ОДРАЗУ.
// Було: «Статті — локальне сховище пристрою (Б5.4), без акаунта», тобто аркуш
// відкривався кому завгодно і показував закладки попередньої людини. Заміряно
// стендом `tests/account-scope.mjs`: акаунт Б бачив статтю акаунта А, і гість
// бачив її теж.
// 🛑 Друга вада була В КОМЕНТАРІ: `sidebar.js` ДВІЧІ стверджував, що
// «`openSavedHub` має власну перевірку» — а її не існувало ЖОДНОЇ. Коментар,
// який описує неіснуючий запобіжник, знімає обережність рівно з того місця, де
// вона найпотрібніша (той самий урок, що сторожі `kb-guard.test.js`, на які
// документація роками посилалась, а в git їх не було).
// 🔑 Слово Вови: гість «може тільки переглядати публічну інформацію, а не
// взаємодіяти в рамках додатку». Збережене — не публічна інформація.

import { escapeHtml } from './utils.js';
import { isLoggedIn, currentUserId, requireAuth } from './auth.js';
import { getSupabase, fetchSavedPostIds } from './supabase.js';
import { setBoardActiveType, openChatById } from '../tabs/board.js';
import { getSavedArticleIds, getArticlesByIds, openArticle } from '../tabs/news.js';
import { getSavedRoutesForUI, openSavedRouteOnBuses } from '../tabs/buses.js';
import { ICONS } from './icons.js';
import { createBackdropFade, attachSheetDismiss } from './sheet-motion.js';

let _sheet = null;
let _backdrop = null;
let _view = 'categories';   // 'categories' | 'articles' | 'buses' | 'chats' | 'boards'
let _data = { articles: [], buses: [], chats: [], boards: [], loggedIn: false };

const CATS = [
  { key: 'articles', icon: ICONS.newspaper, label: 'Статті',       needsAuth: true },
  { key: 'buses',    icon: ICONS.bus,       label: 'Автобуси',     needsAuth: false },
  { key: 'chats',    icon: ICONS.message,   label: 'Питання',      needsAuth: true },
  { key: 'boards',   icon: ICONS.pin,       label: 'Оголошення',   needsAuth: true },
];

function closeHub() {
  if (!_sheet) return;
  const s = _sheet, b = _backdrop;
  _sheet = null; _backdrop = null;
  s.classList.remove('visible');
  b?.classList.remove('visible');
  document.body.classList.remove('modal-open');
  setTimeout(() => { s.remove(); b?.remove(); }, 240);
}

function cardHtml(p, type) {
  const when = new Date(p.created_at || p.ts || Date.now())
    .toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });
  return `
    <button class="shub-card" type="button" data-shub-open="${p.id}" data-shub-type="${type}">
      <span class="shub-card-text">${escapeHtml(p.title || p.text || '(без тексту)')}</span>
      <span class="shub-card-meta">${escapeHtml(when)}</span>
    </button>`;
}

// Б7.2: автобуси — власна ідентичність (routeId+дата+зупинки, не один числовий id).
function busCardHtml(r) {
  return `
    <button class="shub-card" type="button" data-shub-type="bus"
            data-shub-rid="${escapeHtml(r.routeId)}" data-shub-date="${escapeHtml(r.trackDate)}"
            data-shub-from="${escapeHtml(r.from || '')}" data-shub-to="${escapeHtml(r.to || '')}">
      <span class="shub-card-text">${escapeHtml(r.title)}</span>
      <span class="shub-card-meta">${escapeHtml(r.dayLabel || r.trackDate)}${r.timeStr ? ' · ' + escapeHtml(r.timeStr) : ''}</span>
    </button>`;
}

async function loadData() {
  const data = { articles: [], buses: [], chats: [], boards: [], loggedIn: isLoggedIn(), postsError: false };

  // Статті — БД `saved_articles` за `uid` (24.08). Гість сюди не доходить: аркуш
  // за гейтом входу. ⚠️ `.reverse()` більше НЕ треба — база вже віддає
  // найновіші зверху (`order created_at desc`), а другий переворот показував би
  // найстаріші першими.
  try {
    if (data.loggedIn) {
      const artIds = getSavedArticleIds();
      if (artIds.length) data.articles = await getArticlesByIds(artIds);
    }
  } catch (e) { console.warn('[saved-hub] articles', e); }

  // Автобуси — trackedRoutes (buses.js), вже порожні для гостя на джерелі (loadTrackedRoute).
  try { data.buses = getSavedRoutesForUI(); } catch (e) { console.warn('[saved-hub] buses', e); }

  // Обговорення/Оголошення — Supabase saved_posts, лише залогінені.
  if (data.loggedIn) {
    try {
      const ids = [...(await fetchSavedPostIds(currentUserId()))];
      if (ids.length) {
        const supa = getSupabase();
        const { data: posts, error } = await supa.from('posts').select('*').in('id', ids)
          .order('created_at', { ascending: false });
        if (error) throw error;
        data.chats  = (posts || []).filter(p => p.type === 'chat');
        data.boards = (posts || []).filter(p => p.type !== 'chat');
      }
    } catch (e) {
      console.warn('[saved-hub] posts', e);
      data.postsError = true;
    }
  }
  return data;
}

// ── Екран 1: список категорій ────────────────────────────────────────────
function categoriesScreenHtml() {
  const rows = CATS.map(c => {
    const count = _data[c.key].length;
    const locked = c.needsAuth && !_data.loggedIn;
    if (!count && !locked) return '';   // порожня й доступна категорія — не показуємо
    return `
      <button class="shub-cat-row" type="button" data-shub-cat="${c.key}">
        <span class="shub-cat-ic">${c.icon}</span>
        <span class="shub-cat-label">${c.label}</span>
        ${locked ? `<span class="shub-cat-lock">${ICONS.lock}</span>` : `<span class="shub-count">${count}</span>`}
        <span class="shub-cat-chev">${ICONS.chevronRight}</span>
      </button>`;
  }).filter(Boolean).join('');

  if (!rows) {
    return `<div class="shub-empty">Поки нічого не збережено.<br>
      <span class="shub-hint">Тримайте прапорець ${ICONS.bookmark} на картці оголошення, обговорення чи статті — і воно зʼявиться тут.</span></div>`;
  }
  return `<div class="shub-cats">${rows}</div>`;
}

// ── Екран 2: список конкретної категорії ─────────────────────────────────
//
// 🔴 05.09 — ШАПКА ЗВЕДЕНА В ОДНУ, І ЦЕ НЕ ЛИШЕ ПРО ВИГЛЯД. Було дві: постійний
// заголовок «Збережені» над аркушем і власна шапка «‹ Статті» ВСЕРЕДИНІ списку.
// Дві вади одразу:
//   • назва звучала двічі поспіль, зʼїдаючи ~44px у аркуші висотою 72vh;
//   • кнопка «назад» лежала в СКРОЛЕРІ — прокрутивши список, людина її гу��ила.
// Тепер шапка одна, живе поза `#shub-body`, і `render()` міняє в ній назву та
// показує «назад» лише в деталях. Тобто вихід із категорії доступний завжди.
const EMPTY_DETAIL = `<div class="shub-empty">Тут поки порожньо.</div>`;

// Що написано в шапці зараз: корінь чи категорія.
function headHtml() {
  const cat = _view === 'categories' ? null : CATS.find(c => c.key === _view);
  if (!cat) return `<span class="shub-head-title">${ICONS.bookmark}Збережені</span>`;
  return `
    <button class="shub-back" type="button" data-shub-back aria-label="Назад">${ICONS.back}</button>
    <span class="shub-head-title">${cat.icon}${cat.label}</span>
    <span class="shub-head-count">${_data[cat.key].length}</span>`;
}

function categoryScreenHtml(key) {
  const cat = CATS.find(c => c.key === key);
  if (!cat) { _view = 'categories'; return categoriesScreenHtml(); }

  if (cat.needsAuth && !_data.loggedIn) {
    return `<div class="shub-hint-block">Увійдіть, щоб бачити збережені оголошення й обговорення.<br>
      <button class="shub-login" type="button" id="shub-login">Увійти</button></div>`;
  }

  if (key === 'buses')    return _data.buses.map(busCardHtml).join('') || EMPTY_DETAIL;
  if (key === 'articles') return _data.articles.map(p => cardHtml(p, 'article')).join('') || EMPTY_DETAIL;
  const type = key === 'chats' ? 'chat' : 'board';
  return _data[key].map(p => cardHtml(p, type)).join('') || EMPTY_DETAIL;
}

function render() {
  const bodyEl = _sheet?.querySelector('#shub-body');
  if (!bodyEl) return;
  const headEl = _sheet.querySelector('#shub-head');
  if (headEl) headEl.innerHTML = headHtml();
  bodyEl.innerHTML = _view === 'categories' ? categoriesScreenHtml() : categoryScreenHtml(_view);
  bodyEl.scrollTop = 0;   // перехід між екранами починається згори, а не там, де стояв попередній
}

// 🔴 ГЕЙТ ВХОДУ (24.08). Єдина точка: аркуш відкривають і шапка, і бічне меню,
// тож перевірка стоїть тут, а не в кожного викликача — інакше вона існувала б у
// стількох копіях, скільки входів, і розійшлась би при першому ж новому вході.
// ⚠️ Тіло винесене в окрему функцію НАВМИСНО: `requireAuth` виконує передану дію
// ОДРАЗУ, тож `requireAuth(…, () => openSavedHub())` викликав би сам себе без
// кінця. Спіймано на собі при написанні цього фікса.
export function openSavedHub() {
  if (_sheet) return;
  requireAuth('бачити збережені', openSavedSheet);
}

function openSavedSheet() {
  if (_sheet) return;
  _view = 'categories';
  _backdrop = document.createElement('div');
  _backdrop.className = 'board-backdrop shub-backdrop';

  _sheet = document.createElement('div');
  _sheet.className = 'shub-sheet';
  _sheet.innerHTML = `
    <div class="shub-handle"></div>
    <div class="shub-head" id="shub-head"><span class="shub-head-title">${ICONS.bookmark}Збережені</span></div>
    <div class="shub-body" id="shub-body"><div class="shub-empty">Завантаження…</div></div>`;

  document.body.appendChild(_backdrop);
  document.body.appendChild(_sheet);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => {
    _backdrop.classList.add('visible');
    _sheet.classList.add('visible');
  });

  _backdrop.addEventListener('click', closeHub);

  // 🔴 10.08 — СВАЙП-ВНИЗ ЗАКРИВАЄ (скарга Вови: «модалку збереження не можу
  // закрити свайпом»). Аркуш МАВ рисочку-грабер, тобто обіцяв жест, а жесту не
  // існувало взагалі — закрити можна було лише тапом по затемненню. Рисочка, яка
  // нічого не обіцяє насправді, гірша за її відсутність.
  //
  // ⚠️ Механіка НЕ написана тут заново: береться спільна `attachSheetDismiss`
  // (`core/sheet-motion.js`) — та сама, якою закриваються всі модалки застосунку.
  // У ній уже враховані замок «жест був прокруткою», граб за шапку і блокування
  // нативного скролу; копія цих правил у другому файлі колись розійшлася б із
  // першою (у проєкті таке вже двічі ставалось).
  //
  // 🔑 `scroller` — саме `.shub-body`, а не сам аркуш: у модалок панель сама собі
  // скролер, а тут прокручується ВНУТРІШНІЙ блок. Помилишся тут — перевірка «чи
  // контент на самому верху» дивитиметься не на той елемент, і свайп або не
  // працюватиме, або хапатиме жест посеред прокрутки.
  // 📐 `headerZone: 70` — смуга рисочки й шапки, за яку тягнути можна ЗАВЖДИ,
  // навіть коли список прогорнуто. Число не на око, а сума полів зверху:
  //   8 (padding аркуша) + 2+4+12 (рисочка з полями) + 40+4 (шапка з полем) = 70.
  // ⚠️ 05.09 було 56 і рахувалось із заголовка ~32px. Після зведення шапки в одну
  // (40px) стара сума перестала збігатись із розміткою — тобто нижні ~14px шапки
  // вже не хапали жест. Міняєш висоту `.shub-head` або рисочки — перерахуй ТУТ.
  attachSheetDismiss({
    panel: _sheet,
    scroller: _sheet.querySelector('#shub-body'),
    backdrop: createBackdropFade(_backdrop),
    headerZone: 70,
    // Аркуш УЖЕ їде донизу (`finishSwipe` поставив transform), затемнення гасить
    // `createBackdropFade`. Тому власну анімацію закриття НЕ запускаємо — інакше
    // два зустрічні рухи; прибираємо лише стан і вузли після доїзду.
    onDismiss: (ms) => {
      const sh = _sheet, bd = _backdrop;
      if (!sh) return;
      _sheet = null; _backdrop = null;
      document.body.classList.remove('modal-open');
      setTimeout(() => { sh.remove(); bd?.remove(); }, ms + 20);
    },
  });
  // Делегація (не addEventListener одразу — #shub-login вставляється пізніше через render)
  _sheet.addEventListener('click', e => {
    if (e.target.closest('#shub-login')) {
      closeHub();
      requireAuth('бачити збережені', () => {});
      return;
    }
    if (e.target.closest('[data-shub-back]')) {
      _view = 'categories';
      render();
      return;
    }
    const catRow = e.target.closest('[data-shub-cat]');
    if (catRow) {
      _view = catRow.dataset.shubCat;
      render();
      return;
    }
    const busCard = e.target.closest('[data-shub-type="bus"]');
    if (busCard) {
      const { shubRid, shubDate, shubFrom, shubTo } = busCard.dataset;
      closeHub();
      window.switchTab && window.switchTab('buses');
      openSavedRouteOnBuses(shubRid, shubDate, shubFrom || null, shubTo || null);
      return;
    }
    const card = e.target.closest('[data-shub-open]');
    if (!card) return;
    const id = Number(card.dataset.shubOpen);
    const type = card.dataset.shubType;
    closeHub();
    if (type === 'article') {
      openArticle(id);                     // модалка статті — глобальна, без перемикання вкладки
    } else if (type === 'chat') {
      window.switchTab && window.switchTab('discussions');
      openChatById(id);                    // модалка конкретного обговорення
    } else {
      window.switchTab && window.switchTab('board');
      setBoardActiveType('saved');         // Дошка → таб «Збережені»
    }
  });

  loadData().then(data => { _data = data; render(); });
}

export function initSavedHub() {
  document.getElementById('saved-hub-btn')?.addEventListener('click', openSavedHub);
}
