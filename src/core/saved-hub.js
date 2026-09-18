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

// 🔴 18.09 — ЖИТТЄВИЙ ЦИКЛ ЗБЕРЕЖЕНОГО (замовлення Вови, повний розбір у
// `scripts/supabase_saved_lifecycle.sql`).
//
// 🗣️ «якщо… воно видалилось з додатку, то воно має пропасти із збереження… А
// якщо рейс скасований, то він має бути там, але так само з позначкою
// скасований… не то, що користувач зберіг якесь питання, і воно видалилось, і
// воно досі там, і користувач його не може не відкрити, не видалити збережене,
// нічого».
//
// 🔑 ПРАВИЛО ОДНЕ НА ВСІ ЧОТИРИ ТИПИ:
//   Збережене зникає, лише коли зник САМ ПРЕДМЕТ.
//   Живий предмет зі зміненим СТАНОМ лишається, і стан написаний на картці.
//
// 🛑 І ГОЛОВНЕ, ЧОГО ТУТ НЕМАЄ: цей файл НЕ вирішує, що предмет зник. Для постів
// це каже база (`sync_saved_posts`), для статей — прочитаний файл новин
// (`newsLoadFailed()` відрізняє «немає» від «не прочиталось»). Клієнт не вміє
// відрізнити видалене від невдалого запиту, і чистка за відсутністю даних
// стерла б людині живі закладки на поганому інтернеті.
import { escapeHtml, showToast } from './utils.js';
import { isLoggedIn, currentUserId, requireAuth } from './auth.js';
import { syncSavedPosts, fetchSavedArticleSnaps,
         removeSavedPost, removeSavedArticle } from './supabase.js';
// 🔴 05.09 — `openBoardItemById` ЗАМІСТЬ пари `setBoardActiveType` + `openChatById`.
// Було: тап по збереженому ОГОЛОШЕННЮ перемикав Дошку в режим «Збережені», тобто
// відкривав СПИСОК замість того запису, який людина щойно торкнулась. Стаття
// відкривала свою статтю, питання — своє питання, а оголошення — перелік усіх.
// 🔑 Це рівно те, що `HOT_RULES` №12 називає «тап мусить вести туди, що обіцяє
// мітка»: інакше він бреше про другу подію так само, як брехало б число.
// ⚠️ Функція НЕ нова — вона з 23.08 живить deep-link зі сповіщень: сама
// визначає тип запису (`chat` → Обговорення, інше → модалка оголошення),
// сама перемикає вкладку і сама каже правду, якщо запису вже немає
// («це оголошення більше недоступне»). Тобто обидві гілки хабу сходяться в
// один виклик, а не в два свої.
import { openBoardItemById } from '../tabs/board.js';
import { getSavedArticleIds, collectSavedArticles, openArticle, refreshSavedArticles } from '../tabs/news.js';
import { getSavedRoutesForUI, openSavedRouteOnBuses, unsaveRoute } from '../tabs/buses.js';
import { ICONS, tabIcon } from './icons.js';
import { createBackdropFade, attachSheetDismiss } from './sheet-motion.js';

let _sheet = null;
let _backdrop = null;
let _view = 'categories';   // 'categories' | 'articles' | 'buses' | 'chats' | 'boards'
let _data = { articles: [], buses: [], chats: [], boards: [], loggedIn: false, removed: [] };

// ── ПОЗНАЧКИ СТАНУ НА КАРТЦІ ────────────────────────────────────────────────
//
// 🔑 Одна таблиця на всі типи — саме тому стан із бази, з розкладу автобусів і з
// файлу новин називається тим самим словом `state`. Заведеш ще один збережуваний
// тип — допишеш сюди рядок, а не новий спосіб малювати позначку.
// 🛑 `alive` і `unknown` позначки НЕ мають, і це різні причини:
//   • `alive` — усе гаразд, підпис нічого не додав би;
//   • `unknown` — розкладу на цю дату ще немає (тиждень наперед). Мовчання про
//     рейс не робить його скасованим, а написати «Скасовано» від незнання
//     означало б вигадати людині скасований автобус.
const STATE_BADGES = {
  closed:    { text: 'Знято',           tone: 'off'  },   // автор завершив оголошення
  pending:   { text: 'На перевірці',    tone: 'wait' },   // повторна модерація після правки
  cancelled: { text: 'Скасовано',       tone: 'bad'  },   // рейс скасував перевізник
  gone:      { text: 'Немає у стрічці', tone: 'off'  },   // статтю змило ротацією за віком
};

function badgeHtml(state) {
  const b = STATE_BADGES[state];
  return b ? `<span class="shub-badge shub-badge--${b.tone}">${escapeHtml(b.text)}</span>` : '';
}

// ── ПОВІДОМЛЕННЯ ПРО ПРИБРАНЕ ───────────────────────────────────────────────
//
// 🗣️ Пряма вимога Вови 18.09: «не просто "запис прибрано", а щось типу
// "Оголошення «назва оголошення», яке ви зберегли, знято", чи видалено і тд».
//
// ⚠️ Рід узгоджується РАЗОМ із назвою типу, а не доклеюванням закінчення:
// «оголошення/питання — яке», «новина — яку». Складати це з частин («як-» + «-е»)
// означало б завести таблицю відмін заради трьох рядків; та сама помилка вже
// коштувала правки 25.08 («разом із 2 відповіді»), і лікували її теж БУДОВОЮ
// речення.
// 🔑 Без назви речення лишається граматично цілим — знімка може не бути в
// закладок, поставлених до 18.09, і фраза не сміє розсипатись через це.
const REMOVED_WORDING = {
  board:   { noun: 'Оголошення', rel: 'яке', verb: 'знято' },
  chat:    { noun: 'Питання',    rel: 'яке', verb: 'видалено' },
  article: { noun: 'Новина',     rel: 'яку', verb: 'більше не в стрічці' },
};

function removedLine(item) {
  const w = REMOVED_WORDING[item.kind] || REMOVED_WORDING.board;
  const назва = (item.title || '').trim();
  return назва
    ? `${w.noun} «${назва}», ${w.rel} ви зберегли, ${w.verb}.`
    : `${w.noun}, ${w.rel} ви зберегли, ${w.verb}.`;
}

// Форма слова «запис» при числі. ⚠️ Три гілки, а не дві: «21 запис», «22 записи»,
// «25 записів» — і винятки 11-14, які беруть форму множини попри останню цифру.
function словоЗапис(n) {
  const о = n % 10, с = n % 100;
  if (о === 1 && с !== 11) return 'запис';
  if (о >= 2 && о <= 4 && (с < 12 || с > 14)) return 'записи';
  return 'записів';
}

// 🛑 СТЕЛЯ ТРИ РЯДКИ. Прибрати могло багато (людина не заходила місяць), а хаб —
// це екран для розбору збереженого, не журнал подій: десять рядків угорі
// відсунули б сам список за межу екрана. Понад три — число, бо назвати всіх
// однаково не вийде, а «і ще N» принаймні не бреше про масштаб.
function removedNoticeHtml() {
  const list = _data.removed || [];
  if (!list.length) return '';
  const рядки = list.slice(0, 3).map(i => `<li>${escapeHtml(removedLine(i))}</li>`).join('');
  const n = list.length - 3;
  const решта = n > 0 ? `<li>і ще ${n} ${словоЗапис(n)}.</li>` : '';
  return `<div class="shub-notice" role="status">
    <span class="shub-notice-ic">${ICONS.bookmark}</span>
    <ul class="shub-notice-list">${рядки}${решта}</ul>
  </div>`;
}

// 🔴 06.09 — ЗНАЧКИ БЕРУТЬСЯ З ТАБ-БАРУ, А НЕ З ВЛАСНОГО НАБОРУ.
//
// 🗣️ Скарга Вови зі знімка: «деякі іконки не такого вигляду, як зовсім інша
// іконка, наприклад, на питання. Це треба стандартизувати».
//
// 📐 ЗАМІРЯНО, ЧОМУ ВІН МАВ РАЦІЮ. Хаб тримав ВЛАСНИЙ набір із `ICONS`, і два
// значки з чотирьох суперечили самому застосунку:
//   • «Питання» — `ICONS.message`, бульбашка з рядками тексту. Це РІВНО той
//     малюнок, який 11.08 прибрали з таб-бару як «іконку ЧАТУ» зі старих
//     «Обговорень»; після цього іконку перемальовували ще шість разів до
//     концепції «питання → відповідь» (дві бульбашки зі знаком «?»). У хабі
//     дожила версія, від якої відмовились.
//   • «Оголошення» — `ICONS.pin`, мітка на карті. А `pin` у цьому застосунку
//     вже означає МІСЦЕ: він стоїть на самій картці оголошення біля назви села.
//     На знімку Вови обидва знаки видно ОДНОЧАСНО — один знак, два значення.
//
// ✅ Лікування не «підмінити на кращі значки», а прибрати ДРУГЕ ДЖЕРЕЛО: розділ,
// у який рядок веде, сам і дає свій значок (`tabIcon`) — так уже працює бургер-меню
// з 10.08. Копію малюнка не заводимо: іконку «Питання» перемальовували сім разів,
// і копія розійшлася б із оригіналом на першій же редакції, причому МОВЧКИ.
//
// ⚠️ `tab: null` у «Статей» — це не пропуск. Новини НЕ вкладка (їх відкриває
// повноекранний хаб `openNewsHub`), брати значок нізвідки; `ICONS.newspaper` тут
// збігається з пунктом «Новини» в бургер-меню, тобто джерело правди все одно одне.
// 🔑 `icon` лишається в КОЖНОГО рядка як запасний: таб-бару може не бути (стенд,
// що будує лише аркуш), і тоді рядок мусить показати значок, а не порожнє місце.
const CATS = [
  { key: 'articles', tab: null,          icon: ICONS.newspaper, label: 'Статті',     needsAuth: true },
  { key: 'buses',    tab: 'buses',       icon: ICONS.bus,       label: 'Автобуси',   needsAuth: false },
  { key: 'chats',    tab: 'discussions', icon: ICONS.message,   label: 'Питання',    needsAuth: true },
  { key: 'boards',   tab: 'board',       icon: ICONS.pin,       label: 'Оголошення', needsAuth: true },
];

// Значок рядка: з таб-бару, якщо розділ є вкладкою, інакше власний.
// 🛑 Береться В МОМЕНТ МАЛЮВАННЯ, а не при завантаженні модуля: `CATS` — константа
// рівня файлу, і на той час таб-бару в документі може ще не бути.
const catIcon = (c) => (c.tab ? tabIcon(c.tab, c.icon) : c.icon);

function closeHub() {
  if (!_sheet) return;
  const s = _sheet, b = _backdrop;
  _sheet = null; _backdrop = null;
  s.classList.remove('visible');
  b?.classList.remove('visible');
  document.body.classList.remove('modal-open');
  setTimeout(() => { s.remove(); b?.remove(); }, 240);
}

// 🔴 05.09 — ЗНЯТТЯ ЗБЕРЕЖЕННЯ ПРЯМО ТУТ (замовлення Вови).
// Було: щоб прибрати закладку, треба піти в сам матеріал і відтиснути прапорець.
// А хаб — саме те місце, де людина розбирає накопичене; вимагати заради цього
// відкрити кожен запис означало вести її туди, куди вона не збиралась.
//
// ⚠️ РЯДОК — НЕ КНОПКА В КНОПЦІ. Обгортка `div`, а не `button`: вкладена кнопка
// у HTML заборонена, і браузери «лікують» це по-різному — від зламаної розмітки
// до тапу, який спрацьовує двічі. Тому відкриття висить на `[data-shub-open]`,
// зняття — на сусідньому `[data-shub-unsave]`, і обидва ловить одна делегація.
const bookmarkOffSvg = ICONS.bookmark;

function unsaveBtnHtml(type, attrs) {
  return `<button class="shub-unsave" type="button" data-shub-unsave="${type}" ${attrs}
                  aria-label="Прибрати зі збережених">${bookmarkOffSvg}</button>`;
}

// 🔴 18.09 — КАРТКА НЕСЕ СТАН. `data-shub-state` потрібен не для вигляду (його
// задає клас позначки), а для СТЕНДА і для тапу: без нього «Знято» і «Скасовано»
// довелось би вичитувати з тексту, тобто перевіряти переклад, а не поведінку.
// ⚠️ Стаття, змита ротацією (`gone`), веде НЕ в модалку (її нічим наповнити), а
// на джерело — тому окремий атрибут `data-shub-url`, і саме він вирішує гілку
// тапу. Порожній він бути не може: без адреси картка сюди не потрапляє, її
// прибирає `loadData`.
function cardHtml(p, type) {
  const when = p.created_at || p.ts
    ? new Date(p.created_at || p.ts).toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' })
    : '';
  const state = p.state || 'alive';
  const url = state === 'gone' && p.url ? ` data-shub-url="${escapeHtml(p.url)}"` : '';
  return `
    <div class="shub-row">
      <button class="shub-card" type="button" data-shub-open="${p.id}" data-shub-type="${type}"
              data-shub-state="${state}"${url}>
        <span class="shub-card-text">${escapeHtml(p.title || p.text || '(без назви)')}</span>
        <span class="shub-card-meta">${when ? escapeHtml(when) : ''}${badgeHtml(state)}</span>
      </button>
      ${unsaveBtnHtml(type, `data-shub-id="${p.id}"`)}
    </div>`;
}

// Б7.2: автобуси — власна ідентичність (routeId+дата+зупинки, не один числовий id).
function busCardHtml(r) {
  const адреса = `data-shub-rid="${escapeHtml(r.routeId)}" data-shub-date="${escapeHtml(r.trackDate)}"
                  data-shub-from="${escapeHtml(r.from || '')}" data-shub-to="${escapeHtml(r.to || '')}"`;
  // 🗣️ «якщо користувач відстежує рейс… і він скасований, то він має бути там,
  // але так само з позначкою скасований» — Вова 18.09. Позначка малюється тим
  // самим `badgeHtml`, що й у постів: одне правило на всі типи.
  const state = r.state || 'alive';
  return `
    <div class="shub-row">
      <button class="shub-card" type="button" data-shub-type="bus" data-shub-state="${state}" ${адреса}>
        <span class="shub-card-text">${escapeHtml(r.title)}</span>
        <span class="shub-card-meta">${escapeHtml(r.dayLabel || r.trackDate)}${r.timeStr ? ' · ' + escapeHtml(r.timeStr) : ''}${badgeHtml(state)}</span>
      </button>
      ${unsaveBtnHtml('bus', адреса)}
    </div>`;
}

async function loadData() {
  const data = {
    articles: [], buses: [], chats: [], boards: [],
    loggedIn: isLoggedIn(), postsError: false, removed: [],
  };

  // ── СТАТТІ ────────────────────────────────────────────────────────────────
  // 🔴 Єдиний тип, чиє джерело правди не в базі: `data/articles.json` + ротація
  // за віком. Тому «зникла» тут не аварія, а нормальний хід часу — і саме тому
  // до 18.09 список мовчки коротшав.
  // 🛑 `ok:false` означає «файл не прочитався», і тоді ми не чіпаємо НІЧОГО:
  // інакше поганий інтернет стер би людині закладки. Порожній результат і
  // невдале читання — різні стани, і зливати їх не можна (той самий урок, що
  // `newsLoadFailed()` у самій вкладці Новин).
  try {
    if (data.loggedIn) {
      const artIds = getSavedArticleIds();
      if (artIds.length) {
        const snaps = await fetchSavedArticleSnaps(currentUserId());
        const res = await collectSavedArticles(artIds, snaps);
        if (res.ok) {
          for (const a of res.items) {
            if (a.state !== 'removed') { data.articles.push(a); continue; }
            // 🔑 Рішення Вови: стаття зі знімком ЛИШАЄТЬСЯ і веде на оригінал —
            // людина зберігала, щоб прочитати, і посилання це ще дає. А без
            // адреси вести нікуди, отже предмет справді зник → прибираємо і
            // називаємо, як усе інше.
            if (a.url) data.articles.push({ ...a, state: 'gone' });
            else {
              data.removed.push({ kind: 'article', title: a.title });
              removeSavedArticle(currentUserId(), a.id);
            }
          }
          // Памʼять `news.js` мусить збігтися зі списком, інакше зірочка на
          // самій статті лишиться «збереженою» над уже прибраним рядком.
          if (data.removed.some(r => r.kind === 'article')) {
            try { await refreshSavedArticles(); } catch (_) { /* fail-soft */ }
          }
        } else {
          data.articles = [];   // не знаємо — і не вдаємо, що знаємо
        }
      }
    }
  } catch (e) { console.warn('[saved-hub] articles', e); }

  // ── АВТОБУСИ ──────────────────────────────────────────────────────────────
  // Джерело те саме (`trackedRoutes`), але тепер кожен рейс несе `state`:
  // `cancelled` лишається з позначкою, минулі відсіяні на джерелі.
  try { data.buses = getSavedRoutesForUI(); } catch (e) { console.warn('[saved-hub] buses', e); }

  // ── ПИТАННЯ Й ОГОЛОШЕННЯ ──────────────────────────────────────────────────
  // 🔴 Один виклик замість двох (`fetchSavedPostIds` + `select … in(ids)`), і
  // це не косметика: старий шлях бачив рівно те, що пускає RLS, тобто видалене
  // просто НЕ ПРИХОДИЛО — рядок у `saved_posts` лишався навічно, а список
  // мовчки коротшав. `sync_saved_posts` дивиться на дані з боку сервера, отже
  // може і назвати мертве, і прибрати його.
  // ⚠️ `null` = збій. Тоді нічого не прибрано і нічого не показано — стан
  // помилки, а не порожній список.
  if (data.loggedIn) {
    const res = await syncSavedPosts(currentUserId());
    if (!res) {
      data.postsError = true;
    } else {
      for (const it of res.items) {
        const row = {
          id: it.post_id, title: it.title, state: it.state, created_at: it.created_at,
        };
        (it.kind === 'chat' ? data.chats : data.boards).push(row);
      }
      for (const r of res.removed) data.removed.push({ kind: r.kind, title: r.title });
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
        <span class="shub-cat-ic">${catIcon(c)}</span>
        <span class="shub-cat-label">${c.label}</span>
        ${locked ? `<span class="shub-cat-lock">${ICONS.lock}</span>` : `<span class="shub-count">${count}</span>`}
        <span class="shub-cat-chev">${ICONS.chevronRight}</span>
      </button>`;
  }).filter(Boolean).join('');

  // 🔑 Повідомлення про прибране стоїть НАД списком і на КОРЕНЕВОМУ екрані:
  // прибрати могло з різних категорій, а сама категорія після цього могла зовсім
  // зникнути з переліку (порожні не малюються). Покажи ми це всередині
  // категорії — людина не побачила б повідомлення саме тоді, коли воно
  // найпотрібніше: коли прибрано ОСТАННІЙ запис розділу.
  // 🛑 І тому ж воно НЕ тост: тост зникає за секунди, а хаб — те місце, куди
  // людина прийшла розбирати збережене. Зникле пояснення нічим не краще за
  // мовчання, яке ми тут лікуємо.
  const notice = removedNoticeHtml();

  if (!rows) {
    return `${notice}<div class="shub-empty">Поки нічого не збережено.<br>
      <span class="shub-hint">Тримайте прапорець ${ICONS.bookmark} на картці оголошення, обговорення чи статті — і воно зʼявиться тут.</span></div>`;
  }
  return `${notice}<div class="shub-cats">${rows}</div>`;
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
    <span class="shub-head-title">${catIcon(cat)}${cat.label}</span>
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
  // 🔴 ЗНЯТТЯ ЗБЕРЕЖЕННЯ — ОПТИМІСТИЧНО, АЛЕ З ЧЕСНИМ ВІДКОТОМ.
  //
  // Прибираємо запис зі списку ОДРАЗУ і перемальовуємо: чекати мережу тут нічого
  // не дає, а затримка читалась би як «не спрацювало». Але якщо база відмовила —
  // повертаємо рядок на місце і кажемо про це вголос.
  // 🛑 Саме тут головна пастка класу: інтерфейс, який підтверджує дію, що НЕ
  // сталась. Так уже було з вимикачами сповіщень (B-33, 25.08) — два з чотирьох
  // «підтверджували» те, чого ніхто не робив, і зловив це лише палець на живому
  // пристрої. Тому мовчазного успіху тут немає: або запис зник насправді, або
  // він повернувся і людина бачить чому.
  // ⚠️ Успіх НЕ супроводжується тостом навмисно: зникнення рядка і є відповідь.
  async function знятиЗбереження(btn) {
    const type = btn.dataset.shubUnsave;
    const uid  = currentUserId();

    // Автобус адресується не числом, а трійкою (рейс + дата + зупинки) — Б7.2.
    if (type === 'bus') {
      const { shubRid, shubDate, shubFrom, shubTo } = btn.dataset;
      const було = _data.buses;
      _data.buses = було.filter(r => !(r.routeId === shubRid && r.trackDate === shubDate));
      render();
      try {
        // ⚠️ Саме `unsaveRoute`, а не локальне видалення: за збереженим рейсом
        // стоїть СЕРВЕРНА push-підписка, і без неї сповіщення приходили б далі.
        unsaveRoute(shubRid, shubDate, shubFrom || null, shubTo || null);
      } catch (err) {
        console.warn('[saved-hub] unsave bus', err);
        _data.buses = було; render();
        showToast('Не вдалося прибрати рейс — спробуйте ще раз', 3500);
      }
      return;
    }

    const id = Number(btn.dataset.shubId);
    const ключ = type === 'article' ? 'articles' : type === 'chat' ? 'chats' : 'boards';
    const було = _data[ключ];
    _data[ключ] = було.filter(p => p.id !== id);
    render();

    const r = type === 'article'
      ? await removeSavedArticle(uid, id)
      : await removeSavedPost(uid, id);

    if (!r || r.ok === false) {
      _data[ключ] = було; render();
      showToast('Не вдалося прибрати зі збережених — спробуйте ще раз', 3500);
      return;
    }
    // Статті тримають свій перелік у `news.js` — без цього рядка зірочка на самій
    // статті лишилась би «збереженою», хоч у базі запису вже немає.
    if (type === 'article') { try { await refreshSavedArticles(); } catch (_) { /* fail-soft */ } }
  }

  // Делегація (не addEventListener одразу — #shub-login вставляється пізніше через render)
  _sheet.addEventListener('click', e => {
    // 🔑 Зняття перевіряємо ПЕРШИМ: кнопка лежить поруч із карткою, і якби
    // порядок був зворотний, тап по ній міг би дорогою відкрити сам запис.
    const unsave = e.target.closest('[data-shub-unsave]');
    if (unsave) { e.stopPropagation(); знятиЗбереження(unsave); return; }
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
    const url = card.dataset.shubUrl || '';
    closeHub();
    if (type === 'article') {
      // 🔴 18.09 — стаття, змита ротацією, веде НА ДЖЕРЕЛО. Відкрити модалку
      // нічим: тіла статті в застосунку вже немає, і `openArticle` зробив би
      // рівно те мовчазне «нічого не сталось», від якого ми тут ідемо.
      if (url) window.open(url, '_blank', 'noopener');
      else openArticle(id);     // модалка статті — глобальна, без перемикання вкладки
    } else {
      // 🔑 ТРЕТІМ АРГУМЕНТОМ ІДЕ ТИП — саме його бракувало, і саме через це тап по
      // збереженому ПИТАННЮ кидав на Дошку зі словами «це оголошення більше
      // недоступне». Тип тут відомий завжди: картка лежить у своїй категорії.
      openBoardItemById(id, null, type === 'chat' ? 'chat' : 'board');
    }
  });

  loadData().then(data => { _data = data; render(); });
}

export function initSavedHub() {
  document.getElementById('saved-hub-btn')?.addEventListener('click', openSavedHub);
}
