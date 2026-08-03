// src/tabs/home-now.js
// СМУГА «ЗАРАЗ» — верхній ряд капсул на головному екрані (03.08.2026, /byyou).
//
// НАВІЩО. Аудит 03.08 (діагноз 8): на головній не було ЖОДНОЇ персоналізації,
// крім імені у привітанні — ні моїх оголошень, ні непрочитаних повідомлень, ні
// відстежуваного автобуса. При тому що дані для всього цього в проєкті вже
// лежали: `bus_track_v2` у localStorage, `_unreadChats` у board-chat.js,
// `fetchMyPosts` у supabase.js. Бракувало не даних, а місця, де їх видно.
//
// 🔴 ГОЛОВНЕ ПРАВИЛО ЦЬОГО МОДУЛЯ: капсула малюється, ЛИШЕ якщо їй є що сказати.
// Порожніх станів тут немає навмисно — «0 непрочитаних» і «немає оголошень» це
// не інформація, це шум на найдорожчому місці екрана. Немає жодної капсули —
// смуги немає взагалі (контейнер лишається `hidden`, ритм секцій не рветься).
//
// ⚠️ МЕРЕЖІ ТУТ МІНІМУМ. Автобус бере вже завантажений розклад (той самий
// `data/schedule.json`, що й віджет), непрочитане — кеш `unreadChatsCached()`
// без жодного запиту, «мої оголошення» — один запит і лише для залогінених.

import { escapeHtml } from '../core/utils.js';
import { ICONS } from '../core/icons.js';
import { isLoggedIn, currentUserId, onAuthChange } from '../core/auth.js';
import { fetchMyPosts } from '../core/supabase.js';
import { unreadChatsCached, openThreadsList, openMyAds } from './board-chat.js';
import { openSavedRouteOnBuses, parseRouteEndpoints } from './buses.js';
import {
  getRouteState, getRouteTimings, getStopMins, formatCountdownUpper,
} from '../core/bus-schedule.js';

// Скільки капсул максимум. Три — це рівно те, що видно на екрані 390px без
// горизонтального гортання; четверта вже вимагає жесту, тобто перестає бути
// «поглядом» і стає роботою.
const MAX_PILLS = 3;

// Автобус показуємо, лише поки він близько. 90 хв — той самий поріг, за яким
// віджет Громади вважав рейс «активним» до цього потоку; нового числа не вигадуємо.
const BUS_SOON_MIN = 90;

const TRACK_KEY = 'bus_track_v2';

function loadTracked(todayISO) {
  if (!isLoggedIn()) return [];
  try {
    const d = JSON.parse(localStorage.getItem(TRACK_KEY + ':' + currentUserId()));
    if (d?.routes?.length) return d.routes.filter(t => t.trackDate >= todayISO);
  } catch { /* пусто */ }
  return [];
}

function pillHtml({ icon, text, action, aria }) {
  return `<button class="hm-pill" type="button" data-now="${action}" aria-label="${escapeHtml(aria || text.replace(/<[^>]+>/g, ''))}">${icon}<span>${text}</span></button>`;
}

// ── Автобус ──────────────────────────────────────────────────────────────────
// Пріоритет: відстежуваний рейс (людина сама його позначила) → найближчий
// сьогоднішній. Той самий порядок, що у віджеті — правило не роздвоюємо.
async function busPill() {
  try {
    const res = await fetch('./data/schedule.json');
    const data = await res.json();
    const todayISO = new Date().toISOString().slice(0, 10);
    const routes = (data.days?.[todayISO]?.routes) || data.routes || [];
    const live = routes.filter(r => r.status !== 'cancelled');
    if (!live.length) return null;

    const tracked = loadTracked(todayISO).map(t => t.routeId);
    const pickable = live.filter(r => {
      const st = getRouteState(r);
      if (st === 'enroute') return true;
      if (st !== 'waiting') return false;
      const t = getRouteTimings(r);
      return t.minsToDeparture !== null && t.minsToDeparture <= BUS_SOON_MIN;
    });
    if (!pickable.length) return null;

    // Відстежуваний виграє завжди; серед решти — той, що вирушає найшвидше.
    const depMins = r => getStopMins(r, r.stops[0].name) ?? 0;
    const route = pickable.find(r => tracked.includes(r.id))
      || pickable.sort((a, b) => depMins(a) - depMins(b))[0];

    const t = getRouteTimings(route);
    const [, to] = parseRouteEndpoints(route.name || '');
    // «В дорозі» проти «через N хв» — два різні факти, і людині потрібен саме
    // той, що зараз правдивий. Рейс, який уже їде, відліком не описати.
    const when = t.state === 'enroute'
      ? 'В ДОРОЗІ'
      : formatCountdownUpper(t.minsToDeparture);
    if (!when) return null;

    return {
      icon: ICONS.bus,
      text: `${escapeHtml(to || route.name || 'Рейс')} · <b>${escapeHtml(when.toLowerCase())}</b>`,
      action: 'bus',
      aria: `Автобус ${to}, ${when.toLowerCase()}`,
      run: () => {
        if (typeof window.switchTab === 'function') window.switchTab('buses');
        openSavedRouteOnBuses(route.id, todayISO, null, null);
      },
    };
  } catch {
    return null;   // розклад не приїхав — капсули просто немає
  }
}

// ── Непрочитані повідомлення ─────────────────────────────────────────────────
function chatPill() {
  const n = unreadChatsCached();
  if (!n) return null;
  return {
    icon: ICONS.message,
    text: `<b>${n}</b> ${pluralMsg(n)}`,
    action: 'chats',
    aria: `${n} нових повідомлень`,
    run: () => openThreadsList(),
  };
}

// «1 нове повідомлення · 2 нові · 5 нових». Українська має три форми; окремо
// 11-14 — вони беруть «нових» попри останню цифру. Той самий розбір, що для
// «N нових» у новинах (`pluralNew` у community-blocks.js) — але про інше слово.
function pluralMsg(n) {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return 'нових повідомлень';
  if (o === 1) return 'нове повідомлення';
  if (o >= 2 && o <= 4) return 'нові повідомлення';
  return 'нових повідомлень';
}

// ── Мої оголошення ───────────────────────────────────────────────────────────
async function adsPill() {
  if (!isLoggedIn()) return null;
  try {
    const mine = await fetchMyPosts(currentUserId());
    const active = (mine || []).filter(p => (p.status || 'published') === 'published');
    if (!active.length) return null;
    return {
      icon: ICONS.clipboard,
      text: `<b>${active.length}</b> ${pluralAds(active.length)}`,
      action: 'myads',
      aria: `Мої оголошення: ${active.length}`,
      run: () => openMyAds(),
    };
  } catch {
    return null;
  }
}

function pluralAds(n) {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return 'моїх оголошень';
  if (o === 1) return 'моє оголошення';
  if (o >= 2 && o <= 4) return 'мої оголошення';
  return 'моїх оголошень';
}

// ── Рендер ───────────────────────────────────────────────────────────────────

let _actions = new Map();

export async function renderNowStrip() {
  const el = document.getElementById('hm-now');
  if (!el) return;

  // Три джерела паралельно: жодне не чекає на інше, а помилка будь-якого дає
  // просто відсутність своєї капсули (кожне має власний catch усередині).
  const pills = (await Promise.all([busPill(), Promise.resolve(chatPill()), adsPill()]))
    .filter(Boolean)
    .slice(0, MAX_PILLS);

  if (!pills.length) { el.hidden = true; el.innerHTML = ''; return; }

  _actions = new Map(pills.map(p => [p.action, p.run]));
  el.innerHTML = pills.map(pillHtml).join('');
  el.hidden = false;

  // Делегування — ОДИН слухач на смугу.
  // ⚠️ Прапорець живе НА ЕЛЕМЕНТІ (`dataset`), а не в модулі. `initCommunity()`
  // перебудовує весь `#cm-content` через innerHTML, тобто `#hm-now` щоразу НОВИЙ
  // вузол; модульний `let _wired = true` після першого разу назавжди сказав би
  // «вже підвʼязано», і на новій смузі тапи просто не працювали б. Той самий
  // клас помилки, що ловили у «Стрічці» 28.07 (слухач памʼятав старий вузол).
  if (!el.dataset.wired) {
    el.dataset.wired = '1';
    el.addEventListener('click', e => {
      const b = e.target.closest('[data-now]');
      const run = b && _actions.get(b.dataset.now);
      if (run) run();
    });
  }
}

// Події, які реально можуть змінити вміст смуги. Мережі не додають: автобус
// перечитує вже закешований розклад, непрочитане береться з кешу.
export function initHomeNow() {
  onAuthChange(() => renderNowStrip());
  window.addEventListener('cstl-bus-track-changed', () => renderNowStrip());
  window.addEventListener('cstl-unread-changed', () => renderNowStrip());
  window.addEventListener('cstl-posts-changed', () => renderNowStrip());
}
