// src/tabs/home-now.js — СМУГА «ЗАРАЗ» на головній.
//
// Ряд капсул під шапкою: найближчий автобус · непрочитані повідомлення ·
// мої активні оголошення. Це вся персоналізація першого екрана.
//
// 🔴 ГОЛОВНЕ ПРАВИЛО: капсула малюється, ЛИШЕ якщо їй є що сказати.
// «0 непрочитаних» — не інформація, це шум, який ще й забирає висоту. Якщо не
// набралось жодної капсули — смуги немає ЗОВСІМ (не порожній рядок 50px).
// Через це ж тут немає «скелета»: показувати заглушку під те, чого може не
// бути, — означає обіцяти вміст, якого не буде.
//
// 🔑 ЧОМУ ДАНІ БЕРУТЬСЯ З КЕШУ, А НЕ ЗАПИТОМ
// Непрочитані читаємо через `paintUnreadBadge`-кеш (`unreadCountCached`), а не
// власним запитом у базу. Причина історична: у проєкті вже було ДВА лічильники
// того самого (баг B-27) — вони розійшлись, і картка писала «2 коментарі», коли
// в листі був один. Другого джерела правди не заводимо.
//
// ⚠️ Гість не бачить персональних капсул (непрочитані, мої оголошення) — лише
// автобус, бо розклад публічний. Це не «обмеження для незалогінених», а
// відсутність даних: персональні речі прив'язані до uid.

import { escapeHtml } from '../core/utils.js';
import { isLoggedIn, currentUserId, onAuthChange } from '../core/auth.js';
import { fetchMyPosts, fetchUnreadCount, isSupabaseReady } from '../core/supabase.js';
import { getRouteState, getRouteTimings } from '../core/bus-schedule.js';
import { parseRouteEndpoints, openSavedRouteOnBuses } from './buses.js';
import { openThreadsList, openMyAds } from './board-chat.js';

const TRACK_KEY = 'bus_track_v2';

// Рейс, який зараз показує капсула, — щоб тап відкрив саме його.
// Тримається в модулі, а не в data-атрибуті: розмітка перемальовується щоразу,
// а тут потрібне рівно одне актуальне значення.
let _busRouteId = null;

// Відстежувані рейси ПОТОЧНОГО акаунта (ключ на uid). Той самий формат, що
// читає віджет автобусів у community-blocks.js — свого не вигадуємо.
function trackedRoutes(todayISO) {
  if (!isLoggedIn()) return [];
  try {
    const d = JSON.parse(localStorage.getItem(TRACK_KEY + ':' + currentUserId()));
    if (d?.routes?.length) return d.routes.filter(t => t.trackDate >= todayISO);
  } catch { /* зіпсований запис — просто немає відстежень */ }
  return [];
}

// Найближчий рейс: спершу серед відстежуваних (це особисте), інакше — найближчий
// із розкладу взагалі (публічна інформація, корисна й гостю).
//
// ⚠️ Структуру розкладу НЕ вигадуємо: рейси лежать у `data.days["РРРР-ММ-ДД"].routes`
// (з фолбеком на плаский `data.routes` для старих файлів) — рівно так їх читає
// `renderBusBlock()` у community-blocks.js. Перша версія цієї функції припустила
// плаский масив і не знайшла б жодного рейсу — мовчки, без помилки.
async function nearestBus() {
  try {
    const res = await fetch('./data/schedule.json');
    const data = await res.json();

    const todayISO = new Date().toISOString().slice(0, 10);
    const dayRoutes = iso => (data.days?.[iso]?.routes) || (iso === todayISO ? data.routes : null) || [];
    const routes = dayRoutes(todayISO);
    if (!routes.length) return null;

    const tracked = trackedRoutes(todayISO).map(t => t.routeId);

    let best = null;
    for (const r of routes) {
      if (r.status === 'cancelled') continue;
      if (getRouteState(r) !== 'waiting') continue;          // вже їде або проїхав
      const left = getRouteTimings(r).minsToDeparture;
      if (!Number.isFinite(left) || left < 0 || left > 180) continue;  // далі 3 годин — це вже не «зараз»
      const mine = tracked.includes(r.id);
      // Своє важливіше за чуже, навіть якщо чуже раніше.
      if (!best || (mine && !best.mine) || (mine === best.mine && left < best.left)) {
        best = { route: r, left, mine };
      }
    }
    return best;
  } catch {
    return null;   // розклад не прочитався — капсули автобуса просто не буде
  }
}

function capsule({ icon, text, strong, action, accent }) {
  return `
    <button class="hm-cap${accent ? ' hm-cap--on' : ''}" type="button" data-now="${escapeHtml(action)}">
      <span class="hm-cap-ic" aria-hidden="true">${icon}</span>
      <span class="hm-cap-tx">${escapeHtml(text)}${strong ? ` <b>${escapeHtml(strong)}</b>` : ''}</span>
    </button>`;
}

export async function renderHomeNow() {
  const el = document.getElementById('hm-now');
  if (!el) return;

  const caps = [];

  // ── 1. Автобус ─────────────────────────────────────────────────────────────
  const bus = await nearestBus();
  if (bus) {
    // Напрямок = кінцева точка назви рейсу, тим самим розбором, що на вкладці
    // Автобуси (`parseRouteEndpoints`) — щоб капсула і картка називали рейс однаково.
    const [, to] = parseRouteEndpoints(bus.route.name || '');
    const dest = to || bus.route.name || 'Рейс';
    const left = bus.left <= 0 ? 'зараз' : bus.left < 60
      ? `${bus.left} хв`
      : `${Math.floor(bus.left / 60)} год ${bus.left % 60} хв`;
    _busRouteId = bus.route.id;
    caps.push(capsule({
      icon: '🚌', text: String(dest), strong: `· ${left}`,
      action: 'bus', accent: true,   // акцент — бо це єдина капсула з відліком
    }));
  }

  // ── 2. Непрочитані повідомлення ────────────────────────────────────────────
  if (isLoggedIn() && isSupabaseReady()) {
    try {
      const n = await fetchUnreadCount(currentUserId());
      if (n > 0) caps.push(capsule({ icon: '💬', text: 'нових', strong: String(n), action: 'chats' }));
    } catch { /* мережа впала — капсули просто не буде */ }
  }

  // ── 3. Мої активні оголошення ──────────────────────────────────────────────
  if (isLoggedIn() && isSupabaseReady()) {
    try {
      const mine = await fetchMyPosts(currentUserId());
      const active = (mine || []).filter(p => p.status === 'published' || p.status === 'active');
      if (active.length) caps.push(capsule({ icon: '📌', text: 'мої', strong: String(active.length), action: 'myads' }));
    } catch { /* те саме */ }
  }

  // Немає чого сказати — смуги немає зовсім.
  if (!caps.length) { el.hidden = true; el.innerHTML = ''; return; }

  el.hidden = false;
  el.innerHTML = caps.join('');
  el.classList.add('hm-appear');

  if (!el.dataset.wired) {
    el.dataset.wired = '1';
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-now]');
      if (!btn) return;
      switch (btn.dataset.now) {
        // Тап відкриває САМЕ цей рейс, а не просто вкладку — той самий перехід,
        // що з картки автобуса в блоці нижче (`openSavedRouteOnBuses`).
        case 'bus':
          if (typeof window.switchTab === 'function') window.switchTab('buses');
          if (_busRouteId) openSavedRouteOnBuses(_busRouteId, new Date().toISOString().slice(0, 10), null, null);
          break;
        case 'chats': openThreadsList(); break;
        case 'myads': openMyAds(); break;
      }
    });
  }
}

// Вхід/вихід і зміна відстежень міняють склад капсул — перемальовуємо.
onAuthChange(() => { renderHomeNow(); });
window.addEventListener('cstl-bus-track-changed', () => { renderHomeNow(); });
