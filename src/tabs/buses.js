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

// ── Hero-картка «Наступний автобус» (v4 редизайн 05.06) ────────────────────
// Дизайн: бордовий фон (#722F37 бренд), велика назва маршруту, капсула часу,
// "НАСТУПНА ЗУПИНКА", маршрутна шкала з підписами, ілюстрація автобуса справа.
// 3 стани: waiting / enroute / past. Логіка — bus-schedule.js.

function renderRouteMapV4(route, timings) {
  const stops   = route.stops;
  const totalKm = stops[stops.length - 1].km || 1;
  const pct     = (timings.progress * 100).toFixed(1);

  // Показуємо максимум 5 зупинок під шкалою (перша, остання і до 3 проміжних)
  const labelStops = stops.length <= 5
    ? stops
    : [stops[0], ...stops.slice(1, -1).filter((_, i, arr) => {
        const step = Math.floor(arr.length / 3);
        return i % step === 0;
      }).slice(0, 3), stops[stops.length - 1]];

  const dotsHtml = stops.map(s => {
    const dotPct     = totalKm ? (s.km / totalKm) * 100 : 0;
    const isCurrent  = s.name === timings.currentStop;
    const isPassed   = totalKm ? (s.km / totalKm) <= timings.progress + 0.01 : false;
    return `<span class="bhv4-dot${isCurrent ? ' bhv4-dot--current' : ''}${isPassed ? ' bhv4-dot--passed' : ''}"
                  style="left:${dotPct.toFixed(1)}%"></span>`;
  }).join('');

  const labelsHtml = labelStops.map(s => {
    const lPct      = totalKm ? (s.km / totalKm) * 100 : 0;
    const isCurrent = s.name === timings.currentStop;
    return `<span class="bhv4-label${isCurrent ? ' bhv4-label--current' : ''}"
                  style="left:${lPct.toFixed(1)}%">${escapeHtml(s.name)}</span>`;
  }).join('');

  return `
    <div class="bhv4-map" aria-hidden="true">
      <div class="bhv4-track">
        <div class="bhv4-fill" style="width:${pct}%"></div>
        ${dotsHtml}
      </div>
      <div class="bhv4-labels">${labelsHtml}</div>
    </div>`;
}

function renderSmartRow() {
  const el = document.getElementById('bus-smart-row');
  if (!el) return;
  const next = findNextRoute();
  if (!next) {
    el.innerHTML = `<div class="bhv4-empty">Рейсів сьогодні більше немає</div>`;
    return;
  }

  const effFrom   = getEffectiveFrom(next);
  const effTo     = getEffectiveTo(next);
  const fromTime  = getStopHHMM(next, effFrom);
  const toTime    = getStopHHMM(next, effTo);
  const timings   = getRouteTimings(next);
  const isEnroute = timings.state === 'enroute';
  const isUrgent  = timings.state === 'waiting' && timings.minsToDeparture !== null && timings.minsToDeparture <= 10;

  const fromMin  = timings.fromMin;
  const toMin    = timings.toMin;
  const durMins  = (fromMin !== null && toMin !== null) ? toMin - fromMin : null;
  const durStr   = durMins !== null
    ? (durMins >= 60
        ? `${Math.floor(durMins / 60)} год${durMins % 60 ? ' ' + durMins % 60 + ' хв' : ''}`
        : `${durMins} хв`)
    : '';

  // Статус-рядок
  const statusDot  = isEnroute ? '🟢' : isUrgent ? '🔴' : '🔵';
  const statusText = isEnroute ? 'в дорозі' : isUrgent ? 'відправляється' : 'очікується';

  // Наступна зупинка
  const nextStopLine = isEnroute && timings.nextStop
    ? `<div class="bhv4-next-stop">НАСТУПНА ЗУПИНКА — ${escapeHtml(timings.nextStop.toUpperCase())}</div>`
    : timings.state === 'waiting' && timings.minsToDeparture !== null
    ? `<div class="bhv4-next-stop">${escapeHtml(formatCountdownUpper(timings.minsToDeparture))}</div>`
    : '';

  el.innerHTML = `
    <div class="bhv4${isUrgent ? ' bhv4--urgent' : ''}${isEnroute ? ' bhv4--enroute' : ''}">
      <img class="bhv4-bg-img" src="./images/bus-hero2.png" alt="" aria-hidden="true">
      <div class="bhv4-overlay"></div>

      <div class="bhv4-topbar">
        <span class="bhv4-status">
          <svg class="bhv4-bus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
            <rect x="1" y="6" width="22" height="13" rx="2"/>
            <path d="M16 6V4a2 2 0 0 0-2-2H10a2 2 0 0 0-2 2v2"/>
            <circle cx="7" cy="19" r="2"/><circle cx="17" cy="19" r="2"/>
            <line x1="7" y1="17" x2="17" y2="17"/>
          </svg>
          <span class="bhv4-status-text">${statusText}</span>
          <span class="bhv4-status-dot">${statusDot}</span>
        </span>
        <span class="bhv4-chevron">›</span>
      </div>

      <div class="bhv4-body">
        <div class="bhv4-left">
          <div class="bhv4-route-name">${escapeHtml(effFrom.toUpperCase())} – ${escapeHtml(effTo.toUpperCase())}</div>
          <div class="bhv4-times-row">
            <span class="bhv4-time-capsule">${escapeHtml(fromTime || '—')} → ${escapeHtml(toTime || '—')}</span>
            ${durStr ? `<span class="bhv4-duration">${escapeHtml(durStr)}</span>` : ''}
          </div>
          ${nextStopLine}
        </div>
      </div>

      ${renderRouteMapV4(next, timings)}
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
        ${route.stops && route.stops.length > 2
          ? `<button class="bs-toggle" data-id="${escapeHtml(route.id)}">
               ${expanded ? 'Сховати зупинки ▴' : 'Всі зупинки ▾'}
             </button>
             <div class="bs-stops-body"${expanded ? '' : ' hidden'}>${stopsHtml}</div>`
          : route.vopas_url
          ? `<a class="bs-vopas-link" href="${escapeHtml(route.vopas_url)}" target="_blank" rel="noopener">Усі зупинки рейсу на VOPAS →</a>`
          : ''}
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
