import { escapeHtml } from '../core/utils.js';
import {
  toMinutes, minsToHHMM, nowMinutes,
  getStopMins, getStopHHMM, getRouteState, getRouteTimings,
  formatCountdownUpper,
} from '../core/bus-schedule.js';

const PREFS_KEY = 'bus_prefs_v2';

let busData       = null;
let fromStop      = '';
let toStop        = '';
let showAll       = false;
let timerInterval = null;
let expandedIds   = new Set();
let activeField   = null; // 'from' | 'to' — яке поле зараз відкрите в дропдауні

// ── Preferences (localStorage — збереження налаштувань у браузері) ────
function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ from: fromStop, to: toStop }));
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (p?.from) fromStop = p.from;
    if (p?.to)   toStop   = p.to;
  } catch {}
}

function isDayActive(days) {
  const d = new Date().getDay();
  if (days === 'щодня') return true;
  if (days === 'пн-сб') return d >= 1 && d <= 6;
  if (days === 'пн-пт') return d >= 1 && d <= 5;
  return true;
}

// ── Route calculations (розрахунок ціни) ──────────────────────────────
// Час зупинок винесено у src/core/bus-schedule.js (getStopMins/getStopHHMM/getRouteState)
function getSegmentPrice(route, fromName, toName) {
  const f = route.stops.find(s => s.name === fromName);
  const t = route.stops.find(s => s.name === toName);
  if (!f || !t) return null;
  const diff = Math.abs((t.price_from_start || 0) - (f.price_from_start || 0));
  return diff > 0 ? diff.toFixed(2) : null;  // null → UI покаже «—» (тарифу немає)
}

function getEffectiveFrom(route) {
  if (fromStop && route.stops.some(s => s.name === fromStop)) return fromStop;
  return route.stops[0].name;
}

function getEffectiveTo(route) {
  if (toStop && route.stops.some(s => s.name === toStop)) return toStop;
  return route.stops[route.stops.length - 1].name;
}

// ── Filtering (фільтрація рейсів) ─────────────────────────────────────
function matchesSearch(route) {
  if (!isDayActive(route.days)) return false;
  const stops   = route.stops;
  const fromIdx = fromStop ? stops.findIndex(s => s.name === fromStop) : 0;
  const toIdx   = toStop   ? stops.findIndex(s => s.name === toStop)   : stops.length - 1;
  if (fromStop && fromIdx === -1) return false;
  if (toStop   && toIdx   === -1) return false;
  if (fromStop && toStop  && fromIdx >= toIdx) return false;
  return true;
}

// «Past» = рейс завершився (прибув на кінцеву). Рейс у дорозі тепер НЕ past.
function isPastRoute(route) {
  return getRouteState(route) === 'past';
}

function getFilteredRoutes() {
  if (!busData) return [];
  return busData.routes
    .filter(matchesSearch)
    .sort((a, b) => {
      const aM = getStopMins(a, getEffectiveFrom(a)) || 0;
      const bM = getStopMins(b, getEffectiveFrom(b)) || 0;
      return aM - bM;
    });
}

// Пріоритезація: рейс у дорозі важливіший за майбутній (для людини це означає
// "мій автобус УЖЕ їде у бік села, треба ловити"). Якщо їде кілька — найближчий
// до кінцевої точки маршруту (тобто скоро прибуде). Якщо нема enroute — найближчий waiting.
function findNextRoute() {
  const all = getFilteredRoutes();
  const enroute = all.filter(r => getRouteState(r) === 'enroute');
  if (enroute.length) {
    return enroute.sort((a, b) => {
      const aT = getRouteTimings(a).minsToArrival ?? Infinity;
      const bT = getRouteTimings(b).minsToArrival ?? Infinity;
      return aT - bT;
    })[0];
  }
  return all.find(r => getRouteState(r) === 'waiting') || null;
}

function getAllStops() {
  if (!busData) return [];
  const seen = new Set();
  busData.routes.forEach(r => r.stops.forEach(s => seen.add(s.name)));
  return [...seen].sort((a, b) => a.localeCompare(b, 'uk'));
}

// ── Dropdown (кастомний список вибору зупинки) ────────────────────────

// Відкриває дропдаун для поля 'from' або 'to'
function openDropdown(field) {
  activeField = field;
  const panel = document.getElementById('bus-search-panel');
  const dd    = document.getElementById('bs-dropdown');
  if (!dd || !panel) return;

  // Позиціонуємо фіксовано під панеллю пошуку (fixed — прив'язка до екрана)
  const rect  = panel.getBoundingClientRect();
  dd.style.top = rect.bottom + 'px';

  renderDropdownItems('');
  dd.hidden = false;

  // Фокус на поле фільтру
  const filterEl = document.getElementById('bs-dd-filter');
  if (filterEl) setTimeout(() => filterEl.focus(), 80);
}

// Промальовує вміст дропдауну (фільтрований список зупинок)
function renderDropdownItems(query) {
  const dd = document.getElementById('bs-dropdown');
  if (!dd) return;

  const all      = getAllStops();
  const q        = query.trim().toLowerCase();
  const filtered = q ? all.filter(s => s.toLowerCase().includes(q)) : all;
  const current  = activeField === 'from' ? fromStop : toStop;
  const title    = activeField === 'from' ? 'Звідки їдете?' : 'Куди їдете?';

  const clearHtml = current
    ? `<button class="bs-dd-clear" id="bs-dd-clear">✕ Очистити вибір (${escapeHtml(current)})</button>`
    : '';

  const itemsHtml = filtered.length
    ? filtered.map(s =>
        `<button class="bs-dd-item${s === current ? ' sel' : ''}" data-stop="${escapeHtml(s)}">
           ${escapeHtml(s)}
         </button>`
      ).join('')
    : `<div class="bs-dd-empty">Зупинку не знайдено</div>`;

  dd.innerHTML = `
    <div class="bs-dd-head">
      <span class="bs-dd-title">${escapeHtml(title)}</span>
      <button class="bs-dd-x" id="bs-dd-x">✕</button>
    </div>
    <div class="bs-dd-search">
      <input class="bs-dd-filter" id="bs-dd-filter"
             placeholder="Пошук зупинки…" value="${escapeHtml(query)}"
             autocomplete="off" autocorrect="off" spellcheck="false">
    </div>
    <div class="bs-dd-list">
      ${clearHtml}
      ${itemsHtml}
    </div>
  `;

  // Фільтр при наборі
  document.getElementById('bs-dd-filter')?.addEventListener('input', e => {
    renderDropdownItems(e.target.value);
  });

  // Закрити ✕
  document.getElementById('bs-dd-x')?.addEventListener('click', closeDropdown);

  // Очистити вибір
  document.getElementById('bs-dd-clear')?.addEventListener('click', () => {
    selectStop('', activeField);
  });

  // Вибір зупинки
  dd.querySelectorAll('.bs-dd-item').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault()); // не знімати фокус
    btn.addEventListener('click', () => selectStop(btn.dataset.stop, activeField));
  });
}

function closeDropdown() {
  activeField = null;
  const dd = document.getElementById('bs-dropdown');
  if (dd) dd.hidden = true;
}

// Вибирає зупинку і закриває дропдаун
function selectStop(stop, field) {
  if (field === 'from') {
    fromStop = stop;
    const inp = document.getElementById('bs-from-input');
    if (inp) inp.value = stop;
  } else {
    toStop = stop;
    const inp = document.getElementById('bs-to-input');
    if (inp) inp.value = stop;
  }
  closeDropdown();
  showAll = false;
  savePrefs();
  renderSmartRow();
  renderRouteList();
}

// ── Hero-картка «Наступний автобус» (v3 редизайн 18.05) ────────────────────
// 3 стани: waiting (чекає відправки) / enroute (їде зараз) / past (приїхав).
// Шкала bus-hero-map — маршрутна лінія з зупинками-крапками і маркером 🚌.
// Логіка станів і прогресу — у src/core/bus-schedule.js (getRouteTimings).

// HTML маршрутної шкали з зупинками-крапками і маркером 🚌 на позиції автобуса.
// Підпис під маркером — назва поточної зупинки (en-route) або початкової (waiting).
function renderRouteMap(route, timings) {
  const stops    = route.stops;
  const totalKm  = stops[stops.length - 1].km || 1;
  const progress = (timings.progress * 100).toFixed(1);
  const stopsHtml = stops.map((s, i) => {
    const pct = totalKm ? (s.km / totalKm) * 100 : 0;
    const isCurrent = s.name === timings.currentStop;
    return `<span class="bhm-stop${isCurrent ? ' bhm-stop--current' : ''}" style="left:${pct.toFixed(1)}%"></span>`;
  }).join('');
  return `
    <div class="bus-hero-map" aria-hidden="true">
      <div class="bhm-track">
        <div class="bhm-fill" style="width:${progress}%"></div>
        ${stopsHtml}
        <span class="bhm-marker" style="left:${progress}%">🚌</span>
      </div>
      <div class="bhm-ends">
        <span class="bhm-end-from">${escapeHtml(stops[0].name)}</span>
        <span class="bhm-end-to">${escapeHtml(stops[stops.length - 1].name)}</span>
      </div>
    </div>
  `;
}

function renderSmartRow() {
  const el = document.getElementById('bus-smart-row');
  if (!el) return;
  const next = findNextRoute();
  if (!next) {
    el.innerHTML = `<div class="bus-hero bus-hero--empty">Рейсів сьогодні більше немає</div>`;
    return;
  }

  const effFrom  = getEffectiveFrom(next);
  const effTo    = getEffectiveTo(next);
  const fromTime = getStopHHMM(next, effFrom);
  const toTime   = getStopHHMM(next, effTo);
  const timings  = getRouteTimings(next);
  const carrier  = busData.carriers?.[next.carrier] || { name: next.carrier, phone: '0332 224 500' };
  const price    = getSegmentPrice(next, effFrom, effTo);
  const urgent   = timings.state === 'waiting' && timings.minsToDeparture !== null && timings.minsToDeparture <= 10;
  const isEnroute = timings.state === 'enroute';

  // ── ВЕРХ: countdown капсула (waiting) або «🚌 ЗАРАЗ У ...» (enroute) ──
  let topLabel;
  if (isEnroute) {
    topLabel = `🚌 ЗАРАЗ У ${(timings.currentStop || '—').toUpperCase()}`;
  } else if (urgent) {
    topLabel = `ЧЕРЕЗ ${timings.minsToDeparture} ХВ`;
  } else {
    topLabel = formatCountdownUpper(timings.minsToDeparture) || 'ВЖЕ ЗАРАЗ';
  }

  // ── РЯДОК ЧАСУ ──
  // waiting: 19:00 → 20:20 (відправлення → прибуття)
  // enroute: ⏱ ЗАЛИШИЛОСЬ X · до 20:20
  const timeRow = isEnroute
    ? `<div class="bus-hero-times">
         <span class="bus-hero-time">⏱ ${timings.minsToArrival} ХВ</span>
         <span class="bus-hero-arrow">·</span>
         <span class="bus-hero-time bus-hero-time--to">до ${escapeHtml(toTime || '—')}</span>
       </div>`
    : `<div class="bus-hero-times">
         <span class="bus-hero-time">${escapeHtml(fromTime || '—')}</span>
         <span class="bus-hero-arrow">→</span>
         <span class="bus-hero-time bus-hero-time--to">${escapeHtml(toTime || '—')}</span>
       </div>`;

  el.innerHTML = `
    <div class="bus-hero${urgent ? ' bus-hero--urgent' : ''}${isEnroute ? ' bus-hero--enroute' : ''}">
      <div class="bus-hero-top">
        <span class="bus-hero-countdown">${escapeHtml(topLabel)}</span>
        ${urgent ? '<span class="bus-hero-urgent">⚡ Поспішай!</span>' : ''}
      </div>
      <div class="bus-hero-row">${timeRow}</div>
      <div class="bus-hero-route">${escapeHtml(effFrom)} → ${escapeHtml(effTo)}</div>
      <div class="bus-hero-meta">
        <span>${escapeHtml(price || '—')} грн</span>
        <span class="bus-hero-meta-sep">·</span>
        <span>${escapeHtml(carrier.name)}</span>
      </div>
      ${renderRouteMap(next, timings)}
    </div>
  `;
}

// ── Route list (список рейсів) ─────────────────────────────────────────
function renderRouteList() {
  const el = document.getElementById('bus-list');
  if (!el) return;

  const all      = getFilteredRoutes();
  const future   = all.filter(r => !isPastRoute(r));
  const past     = all.filter(r => isPastRoute(r));
  const toRender = showAll ? all : future;

  if (!all.length) {
    el.innerHTML = `<div class="empty-state">За цим маршрутом рейсів не знайдено</div>`;
    return;
  }

  if (!toRender.length) {
    el.innerHTML = `
      <div class="empty-state">Рейсів сьогодні більше немає</div>
      <button class="bus-show-all" id="bus-show-all-btn">
        Показати всі ${all.length} рейси ↓
      </button>`;
    document.getElementById('bus-show-all-btn').addEventListener('click', () => {
      showAll = true;
      renderRouteList();
    });
    return;
  }

  const next        = findNextRoute();
  const carrierInfo = id => busData.carriers?.[id] || { name: id, phone: '0332 224 500' };

  const cards = toRender.map(route => {
    const isPast  = isPastRoute(route);
    const isNext  = next && route.id === next.id;
    const effFrom = getEffectiveFrom(route);
    const effTo   = getEffectiveTo(route);
    const fromTime = getStopHHMM(route, effFrom);
    const toTime   = getStopHHMM(route, effTo);
    const price    = getSegmentPrice(route, effFrom, effTo);
    const fromMins = getStopMins(route, effFrom) || 0;
    const toMins   = getStopMins(route, effTo)   || 0;
    const segDur   = toMins - fromMins;
    const durStr   = segDur >= 60
      ? `${Math.floor(segDur / 60)} год${segDur % 60 ? ' ' + (segDur % 60) + ' хв' : ''}`
      : `${segDur} хв`;
    const c        = carrierInfo(route.carrier);
    const expanded = expandedIds.has(route.id);

    const stopsHtml = route.stops.map(s => {
      const isFrom = s.name === effFrom;
      const isTo   = s.name === effTo;
      const hl     = isFrom || isTo;
      const t      = getStopHHMM(route, s.name);
      // Час прибуття на зупинку (з км + час відправлення). Ціну прибрано —
      // квиткова застаріває, час корисніший для пасажира.
      return `
        <div class="bs-stop-row${hl ? ' hl' : ''}">
          <span class="bs-stop-time">${escapeHtml(t || '—')}</span>
          <span class="bs-stop-name">${isFrom ? '▶\u202f' : isTo ? '◀\u202f' : ''}${escapeHtml(s.name)}</span>
        </div>`;
    }).join('');

    const statusBadge = route.status === 'cancelled'
      ? `<span class="bs-status cancelled">Скасовано</span>`
      : route.status === 'delayed'
      ? `<span class="bs-status delayed">Затримка</span>`
      : '';

    const autoNote = route.auto_generated
      ? `<div class="bs-autogen">розрахований зворотний рейс</div>`
      : '';

    return `
      <div class="bus-card${isPast ? ' past' : ''}${isNext ? ' next' : ''}">
        <div class="bus-card-main">
          <div class="bs-time-block">
            <span class="bus-card-time">${escapeHtml(fromTime || '—')}</span>
            <span class="bs-arr">→\u202f${escapeHtml(toTime || '—')}</span>
          </div>
          <div class="bus-card-info">
            <div class="bus-card-route">${escapeHtml(route.name)}${statusBadge}</div>
            <div class="bus-card-meta">
              <span>${escapeHtml(durStr)}</span>
              <span class="bus-meta-sep">·</span>
              <span>${escapeHtml(price || '—')} грн</span>
              <span class="bus-meta-sep">·</span>
              <span>${escapeHtml(c.name)}</span>
            </div>
            ${autoNote}
          </div>
        </div>
        <button class="bs-toggle" data-id="${escapeHtml(route.id)}">
          ${expanded ? 'Сховати зупинки ▴' : 'Всі зупинки ▾'}
        </button>
        <div class="bs-stops-body"${expanded ? '' : ' hidden'}>
          ${stopsHtml}
        </div>
      </div>`;
  }).join('');

  let toggleHtml = '';
  if (!showAll && past.length > 0) {
    toggleHtml = `
      <button class="bus-show-all" id="bus-show-all-btn">
        Показати всі ${all.length} рейси за сьогодні ↓
      </button>`;
  } else if (showAll && past.length > 0) {
    toggleHtml = `
      <button class="bus-show-all bus-show-all--less" id="bus-show-all-btn">
        Сховати минулі ↑
      </button>`;
  }

  el.innerHTML = cards + toggleHtml;

  el.querySelectorAll('.bs-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (expandedIds.has(id)) expandedIds.delete(id);
      else expandedIds.add(id);
      renderRouteList();
    });
  });

  const showAllBtn = document.getElementById('bus-show-all-btn');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      showAll = !showAll;
      renderRouteList();
    });
  }
}

// ── Search panel (панель пошуку "Звідки → Куди") ──────────────────────
function renderSearchPanel() {
  const el = document.getElementById('bus-search-panel');
  if (!el) return;

  const hasFilter = fromStop || toStop;

  el.innerHTML = `
    <div class="bs-search-row">
      <div class="bs-search-field">
        <label class="bs-search-label" for="bs-from-input">Від</label>
        <input class="bs-search-input bs-search-input--tap" id="bs-from-input"
               type="text" placeholder="Звідки…"
               value="${escapeHtml(fromStop)}" readonly>
      </div>
      <button class="bs-swap-btn" id="bs-swap-btn" title="Поміняти напрямок">⇌</button>
      <div class="bs-search-field">
        <label class="bs-search-label" for="bs-to-input">До</label>
        <input class="bs-search-input bs-search-input--tap" id="bs-to-input"
               type="text" placeholder="Куди…"
               value="${escapeHtml(toStop)}" readonly>
      </div>
    </div>
    ${hasFilter ? `
    <div class="bs-reset-row">
      <button class="bs-reset-btn" id="bs-reset-btn">✕ Всі маршрути</button>
    </div>` : ''}
  `;

  document.getElementById('bs-from-input').addEventListener('click', () => openDropdown('from'));
  document.getElementById('bs-to-input').addEventListener('click',   () => openDropdown('to'));

  document.getElementById('bs-reset-btn')?.addEventListener('click', () => {
    fromStop = '';
    toStop   = '';
    showAll  = false;
    savePrefs();
    renderSearchPanel();
    renderSmartRow();
    renderRouteList();
  });

  document.getElementById('bs-swap-btn').addEventListener('click', () => {
    [fromStop, toStop] = [toStop, fromStop];
    document.getElementById('bs-from-input').value = fromStop;
    document.getElementById('bs-to-input').value   = toStop;
    closeDropdown();
    showAll = false;
    savePrefs();
    renderSmartRow();
    renderRouteList();
  });
}

// ── Init (ініціалізація вкладки) ──────────────────────────────────────
export async function initBuses() {
  const el = document.getElementById('buses-content');
  if (!el) return;

  loadPrefs();

  // Створюємо overlay дропдауна один раз (position: fixed — фіксована позиція)
  if (!document.getElementById('bs-dropdown')) {
    const dd = document.createElement('div');
    dd.id        = 'bs-dropdown';
    dd.className = 'bs-dropdown';
    dd.hidden    = true;
    document.body.appendChild(dd);
  }

  // Закривати дропдаун при кліку поза ним
  document.addEventListener('click', e => {
    const dd = document.getElementById('bs-dropdown');
    if (!dd || dd.hidden) return;
    if (!dd.contains(e.target) &&
        e.target.id !== 'bs-from-input' &&
        e.target.id !== 'bs-to-input') {
      closeDropdown();
    }
  }, true);

  try {
    const res = await fetch('./data/schedule.json');
    if (!res.ok) throw new Error(res.status);
    busData = await res.json();
  } catch {
    busData = null;
  }

  if (!busData) {
    el.innerHTML = '<div class="empty-state">Розклад тимчасово недоступний</div>';
    return;
  }

  el.innerHTML = `
    <div id="bus-search-panel" class="bus-search"></div>
    <div id="bus-smart-row" class="bus-smart-row"></div>
    <div id="bus-list" class="bus-list"></div>
    <div class="buses-updated">
      ${escapeHtml(busData.source)}<br>
      Оновлено: ${escapeHtml(busData.verifiedTime)} | ${escapeHtml(busData.verifiedAt)}
    </div>
  `;

  renderSearchPanel();
  renderSmartRow();
  renderRouteList();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    renderSmartRow();
    renderRouteList();
  }, 60_000);
}
