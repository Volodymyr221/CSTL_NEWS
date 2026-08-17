// src/tabs/home-caps.js — КАПСУЛИ на головній: ТРИ РОЛІ (МОЄ · ЗАРАЗ · НОВЕ).
//
// ═════════════════════════════════════════════════════════════════════════════
// 🔴 17.08 — ПЕРЕБУДОВА ЗА РІШЕННЯМ ВОВИ. ЩО БУЛО І ЧОМУ ЦЬОГО БІЛЬШЕ НЕМА.
//
// Було: три капсули з іменами РОЗДІЛІВ («АВТОБУСИ», «ДОШКА», «НОВИНИ»), кожна
// показувала загальну статистику громади («6 оголошень», «72 публікації за
// добу») і циклічно міняла повідомлення кожні 5.2 с.
//
// Три вади, які й привели до перебудови:
//   1. **Однакове для всіх.** Житель, що їздить у Луцьк о 7:10, і той, хто
//      автобусом не користується взагалі, бачили той самий рядок.
//   2. **Числа без дії.** «72 публікації за добу» — це показник роботи парсера,
//      а не інформація, з якою людина щось робить.
//   3. **Рух, якого ніхто не просив.** Сторінку щойно почистили від чотирьох
//      автоматичних рухів (аудит 03.08), а цикл повертав пʼятий. І повідомлення
//      можна було просто пропустити, поки дивишся в інший бік.
//
// Стало: три СЛОТИ ЗА РОЛЛЮ, фіксований порядок, один статичний рядок у кожному.
//
//   МОЄ   — особисті справи, що чекають дії (мої оголошення на модерації);
//   ЗАРАЗ — те, що спливає за часом (найближчий рейс саме для цієї людини);
//   НОВЕ  — що змінилось на Дошці з мого останнього візиту.
//
// 🔑 ЧОМУ САМЕ РОЛІ, А НЕ РОЗДІЛИ. Роль — це відповідь на питання «навіщо цей
// рядок тут», і вона не залежить від того, скільки в базі даних. Порядок
// фіксований (МОЄ → ЗАРАЗ → НОВЕ), і якщо роль порожня, вона просто не
// малюється, а решта підтягується. Тобто ПРАВИЛО ОДНЕ і на сьогоднішній
// застосунок без людей, і на запущений: змінюється лише скільки капсул видно.
//
// 🛑 ЧОГО ТУТ СВІДОМО НЕМА:
//   • **Лічильника непрочитаних повідомлень.** Він уже стоїть на кнопці FAB
//     (іконка міняється + число), у бічному меню і на кнопці кабінету — усі три
//     беруть ОДНЕ число `unreadChatsCount()`. Четверта поверхня того самого не
//     додала б нічого, а розбіжність між ними вже траплялась (B-27).
//   • **Новин.** Лічильник «N нових» стоїть у шапці секції новин за 200px нижче
//     (`paintNewsBadge`). Капсула дублювала б блок, який людина однаково побачить.
//   • **Вигаданих чисел.** «23 переглядають зараз», «46 онлайн», «найпопулярніша
//      новина» — таких даних у застосунку не існує, і показати їх можна було б
//      лише вигадавши. Правило лишається чинним: рахуємо тільки з живих даних.
//   • **Заклику «Увійдіть».** Гість бачить ЗАРАЗ і НОВЕ — це осмислено само по
//     собі. Капсула не місце для агітації за реєстрацію.
//   • **Капсули «Питання».** Стара умова шукала `type === 'discussion'`, а в базі
//     цей тип зветься `'chat'` — тобто капсула не малювалась НІКОЛИ, з моменту
//     написання. Разом зі старою конструкцією вона й пішла. Оживляти Q&A на
//     головній — окрема нова поведінка, про яку Вова не просив (17.08 питання
//     задане, відповіді нема). Одна зміна = один дозвіл.
// ═════════════════════════════════════════════════════════════════════════════

import { escapeHtml } from '../core/utils.js';
import { ICONS } from '../core/icons.js';
import { fetchPublishedPosts, fetchMyPosts, isSupabaseReady } from '../core/supabase.js';
import { isLoggedIn, currentUserId, getProfile, onAuthChange } from '../core/auth.js';
import { onReturn } from '../core/refresh-on-return.js';
import { cardTitleText, boardSeenTs, markBoardSeen } from '../core/board-shared.js';
import { COMMUNITY_ALL } from '../core/settlements.js';
import { getRouteTimings, getStopMins, nowMinutes } from '../core/bus-schedule.js';
import {
  parseRouteEndpoints, openSavedRouteOnBuses,
  getSavedRoutesForUI, getBusPrefs, findStopOnRoute, routeCoversStops,
} from './buses.js';
import { openAdModalStandalone } from './board.js';
import { openMyAds } from './board-chat.js';

// Максимум капсул. Три — стільки було в макеті, який вибрав Вова, і це не
// випадкове число: чотири капсули по 56px з проміжками дають 248px, тобто
// третину видимої зони на СТАТУС, ще до першої реальної новини.
// ⚠️ MAX, а не MIN: якщо змістовна одна — стоїть одна, і це нормальний стан.
const MAX_CAPS = 3;

// Скільки хвилин наперед рейс іще вважається «ЗАРАЗ».
// 🔑 Це відповідь на пораду «ранок — автобус, вечір — новини»: поділ за годинником
// нам не потрібен, бо ми знаємо ТОЧНИЙ час до відправлення. Правило за подією
// точніше за правило за годиною доби — рейс спливає тоді, коли він справді
// близько, а не тому, що восьма ранку.
// ⚠️ На ВІДСТЕЖУВАНИЙ рейс стеля не діє: людина сама його позначила, і ховати
// його до останніх двох годин означало б проігнорувати її явну дію.
const SOON_MAX_MIN = 120;

// ── Дрібні помічники ─────────────────────────────────────────────────────────

// Пости мають різні поля часу залежно від джерела — беремо перше, що є.
function tsOf(p) {
  return p.ts
    || (p.published_at && new Date(p.published_at).getTime())
    || (p.created_at && new Date(p.created_at).getTime())
    || 0;
}

// Українська має три форми числа — «1 рейс · 2 рейси · 5 рейсів».
// Окремо 11-14: вони беруть форму «рейсів» попри останню цифру.
function plural(n, one, few, many) {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return many;
  if (o === 1) return one;
  if (o >= 2 && o <= 4) return few;
  return many;
}

// Оголошення «на всю громаду» релевантне в будь-якому селі — те саме правило,
// що у фільтрі Дошки (Д-12).
function isCommunityWide(loc) {
  return !loc || loc === COMMUNITY_ALL;
}

// Село з анкети. 🔑 Кешуємо per-uid: капсула малюється на кожне повернення на
// Громаду, і ходити по анкету щоразу означало б зайвий запит заради поля, яке
// людина міняє раз на життя. Скидається на вхід/вихід (див. `wireCapsRefresh`).
let _place = null;
let _placeFor = null;
async function mySettlement() {
  const uid = currentUserId();
  if (!uid) return null;
  if (_placeFor === uid) return _place;
  try {
    const pr = await getProfile();
    _place = (pr && pr.settlement) || null;
    _placeFor = uid;
  } catch { return null; }
  return _place;
}

// ── РОЛЬ 1: МОЄ ──────────────────────────────────────────────────────────────
// Особисті справи, що чекають ДІЇ. Сьогодні це стан власних оголошень: вони
// єдині мають «підвішений» статус, який людина ніде на головній не бачить.
//
// 🔑 МЕЖА ПЕРСОНАЛІЗАЦІЇ, і вона тут головна: показуємо лише те, що людина
// САМА створила, обрала або ввімкнула. Ніякого «ми помітили, що ти читаєш».
// Олика — село на 3 000 людей, де всі одне одного знають; натяк на стеження
// відлякує сильніше, ніж допомагає користь.
async function myCapsule() {
  if (!isLoggedIn() || !isSupabaseReady()) return null;
  const uid = currentUserId();
  if (!uid) return null;

  let mine = [];
  try { mine = (await fetchMyPosts(uid)) || []; } catch { return null; }

  // Відхилене важливіше за те, що ще розглядають: там від людини чекають дії
  // (виправити й подати знову), а тут — лише чекання.
  const rejected = mine.filter(p => p.status === 'rejected');
  const pending  = mine.filter(p => p.status === 'pending');
  const pick = rejected.length ? { list: rejected, word: 'Відхилено' }
             : pending.length  ? { list: pending,  word: 'На модерації' }
             : null;
  if (!pick) return null;

  const n = pick.list.length;
  const value = n === 1
    ? `${pick.word} · ${cardTitleText(pick.list[0]) || 'оголошення'}`
    : `${pick.word} · ${n} ${plural(n, 'оголошення', 'оголошення', 'оголошень')}`;

  return { key: 'mine', role: 'МОЄ', icon: ICONS.user, value, tap: () => openMyAds() };
}

// ── РОЛЬ 2: ЗАРАЗ ────────────────────────────────────────────────────────────
// Те, що спливає за часом. Пріоритет усередині ролі — від найособистішого до
// найзагальнішого, і кожен щабель має пояснення:
//   1. **відстежуваний рейс** — людина натиснула «відстежувати», це її явна дія;
//   2. **збережена пара зупинок** — вона обрала «звідки/куди», і вибір лишився;
//   3. **найближчий рейс узагалі** — те, що бачить гість і новачок.
// ⚠️ Щаблі 2 і 3 НЕ підстраховують один одного, і це навмисно: якщо людина
// обрала «Олика → Луцьк», а такого рейсу найближчим часом немає, показати їй
// замість цього випадковий автобус на Ківерці — не допомога, а шум. Порожньо
// тут означає порожньо.
async function nowCapsule() {
  const todayISO = new Date().toISOString().slice(0, 10);
  let routes = [];
  try {
    const res = await fetch('./data/schedule.json');
    const data = await res.json();
    routes = (data.days?.[todayISO]?.routes) || data.routes || [];
  } catch { return null; }
  if (!routes.length) return null;

  const live = routes.filter(r => r.status !== 'cancelled');
  const nowMin = nowMinutes();

  // Скільки хвилин до посадки САМЕ НА СВОЇЙ зупинці, а не до виїзду з початкової.
  // ⚠️ Це не дрібниця: рейс «Ківерці — Луцьк» виїжджає о 06:50, а через Олику
  // йде о 07:20. Людині з Олики потрібне друге число, і показати їй перше
  // означало б відправити її на зупинку на пів години раніше.
  const minsToBoard = (r, from) => {
    const stop = from ? findStopOnRoute(r, from) : null;
    const m = stop ? getStopMins(r, stop.name) : getRouteTimings(r, nowMin).fromMin;
    return m == null ? null : m - nowMin;
  };

  const pickFor = (from, to) => {
    let best = null;
    for (const r of live) {
      if (!routeCoversStops(r, from, to)) continue;
      const left = minsToBoard(r, from);
      if (left == null || left < 0) continue;
      if (!best || left < best.left) best = { r, left, from: from || '', to: to || '' };
    }
    return best;
  };

  // 1. Відстежуваний рейс на сьогодні — стелі часу нема.
  let hit = null;
  for (const t of getSavedRoutesForUI()) {
    if (t.trackDate !== todayISO) continue;
    const r = live.find(x => x.id === t.routeId);
    if (!r) continue;
    const left = minsToBoard(r, t.from);
    if (left == null || left < 0) continue;
    if (!hit || left < hit.left) hit = { r, left, from: t.from || '', to: t.to || '' };
  }

  // 2. Збережена пара зупинок. 3. Найближчий рейс узагалі. Обидва — під стелею.
  if (!hit) {
    const { from, to } = getBusPrefs();
    const b = (from || to) ? pickFor(from, to) : pickFor('', '');
    if (b && b.left <= SOON_MAX_MIN) hit = b;
  }
  if (!hit) return null;

  const [, endName] = parseRouteEndpoints(hit.r.name || '');
  const dest = hit.to || endName || 'Найближчий';
  const when = hit.left === 0 ? 'зараз'
    : hit.left < 60 ? `через ${hit.left} хв`
    : `через ${Math.floor(hit.left / 60)} год ${hit.left % 60} хв`;

  return {
    key: 'now', role: 'ЗАРАЗ', icon: ICONS.bus, value: `${dest} · ${when}`,
    // 🔑 Тап веде в САМЕ ЦЕЙ рейс, а не «у розділ Автобуси»: інакше людина
    // мусить шукати в списку те, що їй щойно показали.
    tap: () => {
      if (typeof window.switchTab === 'function') window.switchTab('buses');
      openSavedRouteOnBuses(hit.r.id, todayISO, hit.from, hit.to);
    },
  };
}

// ── РОЛЬ 3: НОВЕ ─────────────────────────────────────────────────────────────
// Що змінилось на Дошці з мого останнього візиту туди.
//
// 🔑 Саме «з останнього візиту», а не «за сьогодні»: людина, яка заходила
// годину тому, не має бачити вранішні оголошення як нові.
// ⚠️ ПЕРШИЙ ЗАПУСК віддає порожньо (див. `boardSeenTs`): той, хто щойно
// поставив застосунок, нічого не пропускав.
async function newCapsule() {
  if (!isSupabaseReady()) return null;
  const seen = boardSeenTs();
  if (!seen) { markBoardSeen(); return null; }

  let posts = [];
  try { posts = (await fetchPublishedPosts()) || []; } catch { return null; }

  let ads = posts.filter(p => (p.type || 'board') === 'board' && tsOf(p) > seen);
  // Село з анкети звужує показ — але тільки якщо анкета заповнена. Порожнє поле
  // не має перетворювати капсулу на порожню: тоді показуємо всю громаду.
  const place = await mySettlement();
  if (place) ads = ads.filter(p => p.location === place || isCommunityWide(p.location));
  if (!ads.length) return null;

  const де = place ? `${place} · ` : '';
  const n = ads.length;
  const value = n === 1
    ? `${де}${cardTitleText(ads[0]) || 'нове оголошення'}`
    : `${де}${n} ${plural(n, 'нове оголошення', 'нові оголошення', 'нових оголошень')}`;

  return {
    key: 'new', role: 'НОВЕ', icon: ICONS.clipboard, value,
    // Одне нове — відкриваємо саме його. Кілька — ведемо на Дошку, де вони
    // лежать зверху списку.
    tap: () => {
      if (n === 1) { openAdModalStandalone(ads[0]); return; }
      if (typeof window.switchTab === 'function') window.switchTab('board');
    },
  };
}

// ── Вигляд ───────────────────────────────────────────────────────────────────

// 🛑 Крапок циклу тут більше немає — показувати нічого, бо рядок один.
function capHtml(c) {
  return `
    <button class="hm-cap2" type="button" data-cap="${escapeHtml(c.key)}">
      <span class="hm-cap2-ic" aria-hidden="true">${c.icon}</span>
      <span class="hm-cap2-tx">
        <span class="hm-cap2-k">${escapeHtml(c.role)}</span>
        <span class="hm-cap2-v">${escapeHtml(c.value)}</span>
      </span>
    </button>`;
}

// Перемальовування зі своїх приводів. Підписки ставимо ОДИН раз на модуль —
// інакше вони накопичувались би на кожен рендер (той самий урок, що з
// `_threadsEvtWired` у `board.js`).
let _wired = false;
function wireCapsRefresh() {
  if (_wired) return;
  _wired = true;
  // Повернувся на Громаду → капсули перечитано (антифлуд 5с — усередині примітива).
  onReturn('community', () => renderHomeCaps());
  // Вхід/вихід міняє все: МОЄ зʼявляється, село в НОВЕ теж.
  onAuthChange(() => { _place = null; _placeFor = null; renderHomeCaps(); });
  // Увімкнув/зняв відстеження рейсу — ЗАРАЗ мусить це відбити одразу.
  window.addEventListener('cstl-bus-track-changed', () => renderHomeCaps());
}

// Покоління рендера: три ролі ходять у мережу, і повільна відповідь старого
// виклику не має перетирати свіжий (перемикання вкладок туди-сюди).
let _gen = 0;
// Підпис намальованого — щоб не перемальовувати те, що не змінилось (див. нижче).
let _paint = '';

export async function renderHomeCaps() {
  const el = document.getElementById('hm-caps');
  if (!el) return;
  wireCapsRefresh();
  const gen = ++_gen;

  // allSettled, а не all: падіння однієї ролі не має забирати з екрана дві інші.
  const результати = await Promise.allSettled([myCapsule(), nowCapsule(), newCapsule()]);
  if (gen !== _gen) return;
  const caps = результати
    .map(r => (r.status === 'fulfilled' ? r.value : null))
    .filter(Boolean)
    .slice(0, MAX_CAPS);

  // Немає жодної ролі з даними — смуги немає зовсім (не порожня коробка).
  if (!caps.length) { el.hidden = true; el.innerHTML = ''; _paint = ''; return; }

  el.hidden = false;
  // ⚠️ Не перемальовуємо те, що не змінилось. Капсули тепер перечитуються на
  // КОЖНЕ повернення на Громаду, а безумовна заміна `innerHTML` — це той самий
  // клас вади, який ловили у Стрічці й на Дошці 15.08 («контент ніби блимає»).
  // Порівнюємо РЯДОК РОЗМІТКИ, а не список полів: однаковий рядок = однакова
  // картинка за визначенням, і забути поле неможливо (урок `core/list-patch.js`).
  // 🛑 І не звіряємось із `el.innerHTML` — браузер його нормалізує, рядки не
  // збіглися б ніколи, і запобіжник мовчки не працював би.
  const розмітка = caps.map(capHtml).join('');
  if (розмітка !== _paint) { _paint = розмітка; el.innerHTML = розмітка; }
  el.classList.add('hm-appear');

  // Тап по капсулі → її обʼєкт. Слухач один на контейнер.
  el.onclick = e => {
    const btn = e.target.closest('[data-cap]');
    if (!btn) return;
    const c = caps.find(x => x.key === btn.dataset.cap);
    if (c && c.tap) c.tap();
  };
}
