// src/tabs/home-bento.js
// БЕНТО-ПЛИТКИ головного екрана (03.08.2026, потік «ПУЛЬС»).
//
// Три плитки різного розміру замість трьох однакових карток на всю ширину:
//   • 1×1 «Автобус»       — найближчий рейс із відліком;
//   • 1×1 «Повідомлення»  — непрочитані розмови;
//   • 2×1 «На дошці»      — скільки оголошень + мініатюри останніх фото.
//
// 🔴 ПРАВИЛО ФАЙЛУ: плитка малюється, ЛИШЕ якщо їй є що сказати. «0 непрочитаних»
// і «рейсів сьогодні немає» — не інформація, а шум на найдорожчому місці екрана.
// Немає жодної плитки — сітки немає взагалі (порожній `hm-bento` себе ховає),
// і ритм сторінки не рветься дірою.
//
// ⚠️ МЕРЕЖІ МІНІМУМ. Розклад — той самий `data/schedule.json`, що й раніше;
// непрочитане — КЕШ `unreadChatsCached()` без жодного запиту; оголошення —
// один запит, той самий `fetchPublishedPosts()`.

import { escapeHtml } from '../core/utils.js';
import { ICONS } from '../core/icons.js';
import { isLoggedIn, currentUserId, onAuthChange } from '../core/auth.js';
import { fetchPublishedPosts, isSupabaseReady } from '../core/supabase.js';
import { unreadChatsCached, openThreadsList } from './board-chat.js';
import { openSavedRouteOnBuses, parseRouteEndpoints } from './buses.js';
import { getRouteState, getRouteTimings, getStopMins, formatCountdownUpper } from '../core/bus-schedule.js';

// Автобус у плитці — ширше вікно, ніж у головній (там 30 хв). Тут 90 хв: той
// самий поріг «активного рейсу», яким віджет Громади користувався до цього
// потоку. Нового числа не вигадуємо.
const BUS_SOON_MIN = 90;
const TRACK_KEY = 'bus_track_v2';

// Скільки мініатюр фото показує плитка Дошки. Чотири — стільки влазить у
// половину ширини плитки 2×1 при 36px і не перетворює її на галерею.
const BOARD_THUMBS = 4;

function loadTracked(todayISO) {
  if (!isLoggedIn()) return [];
  try {
    const d = JSON.parse(localStorage.getItem(TRACK_KEY + ':' + currentUserId()));
    if (d?.routes?.length) return d.routes.filter(t => t.trackDate >= todayISO);
  } catch { /* пусто */ }
  return [];
}

function paint(el, { label, icon, big, sub, accent = false, onTap }) {
  el.innerHTML =
    `<span class="hm-tile-lab">${icon}${escapeHtml(label)}</span>` +
    `<span class="hm-tile-big">${escapeHtml(big)}</span>` +
    (sub ? `<span class="hm-tile-sub">${escapeHtml(sub)}</span>` : '');
  el.classList.toggle('hm-tile--accent', accent);
  el.hidden = false;
  el.onclick = onTap || null;
}

// ── 1×1 Автобус ──────────────────────────────────────────────────────────────

async function busTile() {
  const el = document.getElementById('hm-t-bus');
  if (!el) return;
  el.hidden = true;
  try {
    const res = await fetch('./data/schedule.json');
    const data = await res.json();
    const todayISO = new Date().toISOString().slice(0, 10);
    const routes = ((data.days?.[todayISO]?.routes) || data.routes || [])
      .filter(r => r.status !== 'cancelled');

    const pickable = routes.filter(r => {
      const st = getRouteState(r);
      if (st === 'enroute') return true;
      if (st !== 'waiting') return false;
      const t = getRouteTimings(r);
      return t.minsToDeparture !== null && t.minsToDeparture <= BUS_SOON_MIN;
    });
    if (!pickable.length) return;

    // Відстежуваний рейс виграє завжди — людина сама його позначила.
    const tracked = loadTracked(todayISO).map(t => t.routeId);
    const depMins = r => getStopMins(r, r.stops[0].name) ?? 0;
    const route = pickable.find(r => tracked.includes(r.id))
      || pickable.sort((a, b) => depMins(a) - depMins(b))[0];

    const t = getRouteTimings(route);
    const [, to] = parseRouteEndpoints(route.name || '');
    // «В дорозі» і «через N хв» — різні факти. Рейс, що вже їде, відліком до
    // відправлення описати не можна.
    const when = t.state === 'enroute' ? 'В дорозі' : formatCountdownUpper(t.minsToDeparture);
    if (!when) return;

    paint(el, {
      label: 'Автобус', icon: ICONS.bus,
      big: when.charAt(0) + when.slice(1).toLowerCase(),
      sub: to || route.name || '',
      onTap: () => { window.switchTab?.('buses'); openSavedRouteOnBuses(route.id, todayISO, null, null); },
    });
  } catch { /* немає розкладу — немає плитки */ }
}

// ── 1×1 Повідомлення ─────────────────────────────────────────────────────────

function msgTile() {
  const el = document.getElementById('hm-t-msg');
  if (!el) return;
  const n = unreadChatsCached();
  if (!n) { el.hidden = true; return; }
  paint(el, {
    label: 'Повідомлення', icon: ICONS.message,
    big: String(n),
    sub: pluralMsg(n),
    accent: true,   // непрочитане — єдине, що звертається особисто до людини
    onTap: () => openThreadsList(),
  });
}

// «1 нове · 2 нові · 5 нових». Українська має три форми; окремо 11-14 беруть
// «нових» попри останню цифру.
function pluralMsg(n) {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return 'нових';
  if (o === 1) return 'нове';
  if (o >= 2 && o <= 4) return 'нові';
  return 'нових';
}

// ── 2×1 Дошка ────────────────────────────────────────────────────────────────

async function boardTile() {
  const el = document.getElementById('hm-t-board');
  if (!el) return;
  el.hidden = true;
  try {
    let posts = [];
    if (isSupabaseReady()) {
      const p = await fetchPublishedPosts();
      if (p !== null) posts = p;
    }
    if (!posts.length) {
      const r = await fetch('./data/community-board.json');
      posts = ((await r.json()).posts) || [];
    }
    const ads = posts.filter(p => (p.type || 'board') === 'board');
    if (!ads.length) return;

    // Мініатюри — доказ, що там ЖИВІ речі, а не лічильник заради лічильника.
    // Беремо лише оголошення з фото; якщо їх немає — плитка лишається числовою.
    const thumbs = ads
      .map(p => (Array.isArray(p.photos) && p.photos.find(x => x)) || p.photo)
      .filter(Boolean)
      .slice(0, BOARD_THUMBS);

    el.innerHTML =
      `<span class="hm-tile-lab">${ICONS.clipboard}На дошці</span>` +
      `<div class="hm-tile-row">` +
        `<span class="hm-tile-big">${ads.length} ${pluralAds(ads.length)}</span>` +
        (thumbs.length ? `<span class="hm-tile-thumbs">${
          thumbs.map(src => `<i style="background-image:url('${escapeHtml(src)}')"></i>`).join('')
        }${ads.length > thumbs.length ? `<b>+${ads.length - thumbs.length}</b>` : ''}</span>` : '') +
      `</div>`;
    el.hidden = false;
    el.onclick = () => window.switchTab?.('board');
  } catch { /* немає даних — немає плитки */ }
}

function pluralAds(n) {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return 'оголошень';
  if (o === 1) return 'оголошення';
  if (o >= 2 && o <= 4) return 'оголошення';
  return 'оголошень';
}

// ── 2×1 Екстрені телефони ────────────────────────────────────────────────────
// 🔴 04.08 — переїхали СЮДИ з окремої секції внизу сторінки.
// Вова: «І знизу контакти, усі телефони громади. Це взагалі негарно розташовано
// і неправильно». Номери 101 · 102 · 103 набирають не думаючи, тож їм місце
// серед приладів, а не в хвості екрана. Тап по плитці — дзвінок не робиться:
// відкривається вкладка з повним списком контактів у сайдбарі проєкту немає,
// тому плитка веде на самі номери — три окремі посилання всередині неї.
async function telTile() {
  const el = document.getElementById('hm-t-tel');
  if (!el) return;
  el.hidden = true;
  try {
    const res = await fetch('./data/community.json');
    const data = await res.json();
    const list = data.contacts || [];
    const EMERG_ORDER = ['101', '102', '103'];
    const quick = EMERG_ORDER
      .map(num => list.find(c => String(c.phone || '').trim() === num))
      .filter(Boolean);
    if (!quick.length) return;

    // Всередині плитки — справжні посилання `tel:`, а не одна велика кнопка:
    // людині потрібен КОНКРЕТНИЙ номер одним тапом, а не екран зі списком.
    el.innerHTML =
      `<span class="hm-tile-lab">${ICONS.phone}Екстрені</span>` +
      `<span class="hm-tile-tels">${quick.map(c => `
        <a href="tel:${escapeHtml(String(c.phone).replace(/[^\d+]/g, ''))}"
           aria-label="${escapeHtml(c.name)}">${escapeHtml(c.phone)}</a>`).join('')}</span>`;
    el.hidden = false;
    el.onclick = null;   // тапається саме номер, а не плитка цілком
  } catch { /* немає даних — немає плитки */ }
}

// ── Рендер і підписки ────────────────────────────────────────────────────────

export async function renderBentoTiles() {
  msgTile();                       // синхронно: з кешу, без мережі
  await Promise.all([busTile(), boardTile(), telTile()]);
  syncBentoVisibility();
}

// Сітка ховає себе, якщо жодна плитка не показалась: інакше в ритмі сторінки
// лишився б порожній проміжок там, де нічого немає.
function syncBentoVisibility() {
  const grid = document.getElementById('hm-bento');
  if (!grid) return;
  const shown = [...grid.children].filter(c => !c.hidden);
  grid.hidden = shown.length === 0;

  // 🔴 РОЗКЛАДКА БЕНТО ЗАЛЕЖИТЬ ВІД ТОГО, СКІЛЬКИ ПЛИТОК Є. Знайдено скріншотом:
  //   • одна плитка   → поруч зяяла порожня комірка 176px;
  //   • дві плитки    → обидві на всю ширину = знову «список однакових карток»,
  //                     тобто рівно те, від чого йшли.
  // Тому: 1 плитка — на всю ширину (краще широка, ніж половина ряду в нікуди);
  // 2 плитки — поруч, справжній бенто-ряд; 3 — два квадрати згори і широка
  // «Дошка» під ними.
  // 🔴 РОЗКЛАДКА В ПАРИ. Знайдено скріншотом 04.08: коли кожна плитка йшла на
  // всю ширину, бенто перетворювалось на стовпчик темних смуг — тобто знову
  // «список однакових карток», лише темний. Тому плитки шикуються ПАРАМИ.
  //
  // Правила:
  //   • «Екстрені» завжди на всю ширину — три номери 44px поруч інакше не влазять;
  //   • решта ділиться по дві в ряд у порядку появи;
  //   • непарна остання розтягується (краще широка, ніж половина ряду в нікуди).
  const wide = (el, on) => el && el.classList.toggle('hm-tile--wide', on);
  const tel = grid.querySelector('#hm-t-tel');
  const pairable = shown.filter(c => c !== tel);
  pairable.forEach((c, i) => {
    const isLastOdd = i === pairable.length - 1 && pairable.length % 2 === 1;
    wide(c, isLastOdd);
  });
  wide(tel, true);
}

export function initHomeBento() {
  const again = () => renderBentoTiles();
  onAuthChange(again);
  window.addEventListener('cstl-bus-track-changed', again);
  window.addEventListener('cstl-unread-changed', again);
  window.addEventListener('cstl-posts-changed', again);
}
