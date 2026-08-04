// src/tabs/home-caps.js — КАПСУЛИ-СТАТУСИ на головній.
//
// Замовлення Вови (04.08, вечір): прибрати старі капсули («🚌 Олика · 11 хв»,
// «📌 мої 7») і зробити **один універсальний компонент**, більший і скляний,
// який циклічно змінює повідомлення: «ДОШКА · 19 оголошень» → «3 нових
// сьогодні» → … Один компонент на всі розділи, легко додати новий.
//
// ─────────────────────────────────────────────────────────────────────────────
// 🔴 ЧОГО ТУТ НЕМА І ЧОМУ — ЦЕ ГОЛОВНЕ В ЦЬОМУ ФАЙЛІ
//
// У початковому ТЗ були повідомлення на кшталт «23 переглядають зараз»,
// «46 людей онлайн», «найпопулярніша новина дня». **Таких даних у застосунку
// не існує** — немає ні лічильника переглядів у реальному часі, ні присутності
// онлайн, ні метрики популярності. Показати їх можна було б лише вигадавши
// число, а вигадане число на головній сторінці громади — це брехня людині,
// яка в нього повірить. Тому кожне повідомлення тут рахується з живих даних,
// і якщо порахувати нічим — капсула просто не показує цей рядок.
//
// 🔴 РУХ — З ЗАПОБІЖНИКАМИ, І ЦЕ НЕ ПЕРЕСТРАХОВКА
// Сторінка щойно позбулась чотирьох автоматичних рухів (аудит 03.08, діагноз
// №4: hero-ротатор + карусель Дошки + карусель подій + масштабування блоків —
// «сторінка ніколи не стоїть на місці»). Цикл повідомлень повертає рух назад,
// тому він мусить бути дисциплінованим:
//   • `document.hidden` — застосунок згорнутий, нема кому дивитись → стоп;
//   • `IntersectionObserver` — капсули поза екраном → стоп;
//   • `prefers-reduced-motion` — показуємо ПЕРШЕ повідомлення і не рухаємо нічого;
//   • РОЗБІЖКА між капсулами (`i * STAGGER`) — інакше три рядки моргають
//     одночасно, і це читається як збій, а не як живе табло.
//
// 📐 Компонування «Б» — вибір Вови з трьох макетів (`_mockups/home-caps.html`).
// Сітка 2×2 відпала не за смаком: у колонці 175px повідомлення обрізалось
// («19 оголош…»), тобто компонент не робив того, заради чого існує.

import { escapeHtml } from '../core/utils.js';
import { fetchPublishedPosts, isSupabaseReady } from '../core/supabase.js';
import { getRouteState, getRouteTimings } from '../core/bus-schedule.js';
import { parseRouteEndpoints, openSavedRouteOnBuses } from './buses.js';
import { ensureNewsLoaded, articlesOfGroup, NEWS_GEO_GROUPS } from './news.js';
import { openNewsHub } from './news-hub.js';

// Максимум капсул на екрані. Три — стільки було в макеті, який вибрав Вова, і
// це не випадкове число: чотири капсули по 56px з проміжками дають 248px, тобто
// третину видимої зони на СТАТУС, ще до першої реальної новини.
const MAX_CAPS = 3;
const CYCLE_MS = 5200;   // скільки висить одне повідомлення
const STAGGER  = 1400;   // зсув старту між сусідніми капсулами
const FADE_MS  = 200;    // час згасання/появи тексту (має збігатися з CSS)

let _timers = [];
let _io = null;

function clearTimers() {
  _timers.forEach(t => clearInterval(t));
  _timers = [];
}

// ── Дані ─────────────────────────────────────────────────────────────────────

// Скільки з набору створено сьогодні. Пости мають різні поля часу залежно від
// джерела (Supabase / JSON-фолбек) — беремо перше, що є.
function tsOf(p) {
  return p.ts
    || (p.published_at && new Date(p.published_at).getTime())
    || (p.created_at && new Date(p.created_at).getTime())
    || 0;
}
function countToday(list) {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  return list.filter(p => tsOf(p) >= start.getTime()).length;
}

async function busMessages() {
  try {
    const res = await fetch('./data/schedule.json');
    const data = await res.json();
    const todayISO = new Date().toISOString().slice(0, 10);
    const routes = (data.days?.[todayISO]?.routes) || data.routes || [];
    if (!routes.length) return null;

    const live = routes.filter(r => r.status !== 'cancelled');
    const enroute = live.filter(r => getRouteState(r) === 'enroute').length;

    // Найближчий рейс, що ще не виїхав.
    let soon = null;
    for (const r of live) {
      if (getRouteState(r) !== 'waiting') continue;
      const left = getRouteTimings(r).minsToDeparture;
      if (!Number.isFinite(left) || left < 0) continue;
      if (!soon || left < soon.left) soon = { r, left };
    }

    const msgs = [`${live.length} ${plural(live.length, 'рейс', 'рейси', 'рейсів')} сьогодні`];
    if (soon) {
      const [, to] = parseRouteEndpoints(soon.r.name || '');
      const when = soon.left <= 0 ? 'зараз' : soon.left < 60
        ? `${soon.left} хв`
        : `${Math.floor(soon.left / 60)} год ${soon.left % 60} хв`;
      msgs.push(`${to || 'Найближчий'} · через ${when}`);
    }
    if (enroute) msgs.push(`${enroute} ${plural(enroute, 'зараз у дорозі', 'зараз у дорозі', 'зараз у дорозі')}`);

    return { key: 'bus', icon: '🚌', label: 'Автобуси', msgs, tap: () => {
      if (typeof window.switchTab === 'function') window.switchTab('buses');
      if (soon) openSavedRouteOnBuses(soon.r.id, todayISO, null, null);
    } };
  } catch {
    return null;
  }
}

async function boardAndDiscussionMessages() {
  if (!isSupabaseReady()) return [];
  let posts = [];
  try {
    const p = await fetchPublishedPosts();
    posts = p || [];
  } catch {
    return [];
  }
  const out = [];

  const ads = posts.filter(p => (p.type || 'board') === 'board');
  if (ads.length) {
    const today = countToday(ads);
    const msgs = [`${ads.length} ${plural(ads.length, 'оголошення', 'оголошення', 'оголошень')}`];
    if (today) msgs.push(`${today} ${plural(today, 'нове', 'нових', 'нових')} сьогодні`);
    out.push({ key: 'board', icon: '📋', label: 'Дошка', msgs,
      tap: () => window.switchTab && window.switchTab('board') });
  }

  const disc = posts.filter(p => p.type === 'discussion');
  if (disc.length) {
    const today = countToday(disc);
    const msgs = [`${disc.length} ${plural(disc.length, 'тема', 'теми', 'тем')}`];
    if (today) msgs.push(`${today} ${plural(today, 'нова', 'нові', 'нових')} сьогодні`);
    out.push({ key: 'disc', icon: '💬', label: 'Обговорення', msgs,
      tap: () => window.switchTab && window.switchTab('discussions') });
  }
  return out;
}

async function newsMessages() {
  try {
    const arts = await ensureNewsLoaded();
    if (!arts.length) return null;
    const dayAgo = Date.now() - 86400000;
    const fresh = arts.filter(a => (a.ts || 0) >= dayAgo).length;
    const msgs = [`${arts.length} ${plural(arts.length, 'публікація', 'публікації', 'публікацій')}`];
    if (fresh) msgs.push(`${fresh} за добу`);
    // Громада — найцінніше, але й найрідше: показуємо, лише коли є що показати.
    const local = articlesOfGroup(arts, NEWS_GEO_GROUPS[0]).filter(a => (a.ts || 0) >= dayAgo).length;
    if (local) msgs.push(`Громада · ${local} ${plural(local, 'нова', 'нові', 'нових')}`);
    // ⚠️ НЕ switchTab('community'): людина вже стоїть на Громаді, і тап не робив
    // би нічого. Ведемо в той самий повноекранний хаб, що й «Усі новини →».
    return { key: 'news', icon: '📰', label: 'Новини', msgs,
      tap: () => openNewsHub(NEWS_GEO_GROUPS[0]) };
  } catch {
    return null;
  }
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

// ── Вигляд ───────────────────────────────────────────────────────────────────

function capHtml(c) {
  const dots = c.msgs.length > 1
    ? `<span class="hm-cap2-dots">${c.msgs.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}</span>`
    : '';
  return `
    <button class="hm-cap2" type="button" data-cap="${escapeHtml(c.key)}">
      <span class="hm-cap2-ic" aria-hidden="true">${c.icon}</span>
      <span class="hm-cap2-tx">
        <span class="hm-cap2-k">${escapeHtml(c.label)}</span>
        <span class="hm-cap2-v">${escapeHtml(c.msgs[0])}</span>
        ${dots}
      </span>
    </button>`;
}

// Один цикл однієї капсули. Текст міняється через клас `.swap` — саме він несе
// згасання і зсув; CSS і `FADE_MS` мусять лишатись узгодженими.
function startCycle(node, msgs, delay) {
  if (msgs.length < 2) return;
  const v = node.querySelector('.hm-cap2-v');
  const dots = [...node.querySelectorAll('.hm-cap2-dots i')];
  let i = 0;
  const step = () => {
    if (document.hidden || node.dataset.paused === '1') return;
    i = (i + 1) % msgs.length;
    v.classList.add('swap');
    setTimeout(() => {
      v.textContent = msgs[i];
      v.classList.remove('swap');
      dots.forEach((d, j) => d.classList.toggle('on', j === i));
    }, FADE_MS);
  };
  // Розбіжка старту, щоб капсули не моргали одночасно.
  setTimeout(() => {
    step();
    _timers.push(setInterval(step, CYCLE_MS));
  }, delay);
}

export async function renderHomeCaps() {
  const el = document.getElementById('hm-caps');
  if (!el) return;
  clearTimers();
  if (_io) { _io.disconnect(); _io = null; }

  // Порядок: спершу те, що змінюється найчастіше (час рейсу), далі решта.
  const [bus, boardDisc, news] = await Promise.all([
    busMessages(),
    boardAndDiscussionMessages(),
    newsMessages(),
  ]);
  // Порядок = пріоритет: час рейсу застаріває найшвидше, тому він перший;
  // далі Дошка й Обговорення (дії людей), новини останні — вони й так мають
  // власну секцію нижче. Зайве відсікаємо, а не тиснемо в менший розмір.
  const caps = [bus, ...boardDisc, news].filter(Boolean).slice(0, MAX_CAPS);

  // Немає жодного розділу з даними — смуги немає зовсім (не порожня коробка).
  if (!caps.length) { el.hidden = true; el.innerHTML = ''; return; }

  el.hidden = false;
  el.innerHTML = caps.map(capHtml).join('');
  el.classList.add('hm-appear');

  // Тап по капсулі → її розділ. Слухач один на контейнер.
  el.onclick = e => {
    const btn = e.target.closest('[data-cap]');
    if (!btn) return;
    const c = caps.find(x => x.key === btn.dataset.cap);
    if (c && c.tap) c.tap();
  };

  // Рух вимкнено в системі — показуємо перше повідомлення і не чіпаємо його.
  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) return;

  const nodes = [...el.querySelectorAll('.hm-cap2')];
  nodes.forEach((n, i) => startCycle(n, caps[i].msgs, i * STAGGER));

  // Капсули поза екраном — цикл спиняється. Прокрутили далеко вниз і читаєте
  // новини? Тоді нагорі нічого не має рухатись і витрачати батарею.
  if ('IntersectionObserver' in window) {
    _io = new IntersectionObserver(entries => {
      entries.forEach(en => { en.target.dataset.paused = en.isIntersecting ? '0' : '1'; });
    }, { threshold: 0 });
    nodes.forEach(n => _io.observe(n));
  }
}
