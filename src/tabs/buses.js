import { escapeHtml } from '../core/utils.js';

const PREFS_KEY = 'bus_prefs_v2';

let busData       = null;
let fromStop      = '';
let toStop        = '';
let showAll       = false;
let timerInterval = null;
let expandedIds   = new Set();

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

// ── Time utils (утиліти для роботи з часом) ───────────────────────────
function toMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function minsToHHMM(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

function minutesUntil(hhmm) {
  const now  = new Date();
  const diff = toMinutes(hhmm) - (now.getHours() * 60 + now.getMinutes());
  return diff > 0 ? diff : null;
}

function formatCountdown(mins) {
  if (mins < 60) return `через ${mins} хв`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `через ${h} год ${m} хв` : `через ${h} год`;
}

function isDayActive(days) {
  const d = new Date().getDay(); // 0=нд, 1=пн … 6=сб
  if (days === 'щодня') return true;
  if (days === 'пн-сб') return d >= 1 && d <= 6;
  if (days === 'пн-пт') return d >= 1 && d <= 5;
  return true;
}

// ── Route calculations (розрахунок часу та ціни) ──────────────────────

// Повертає хвилини від опівночі для зупинки у рейсі (пропорційно км)
function getStopMins(route, stopName) {
  const stop = route.stops.find(s => s.name === stopName);
  if (!stop) return null;
  const totalKm = route.stops[route.stops.length - 1].km;
  if (totalKm === 0) return toMinutes(route.departure_time);
  return toMinutes(route.departure_time) + Math.round((stop.km / totalKm) * route.duration_min);
}

// Повертає "HH:MM" для зупинки
function getStopHHMM(route, stopName) {
  const m = getStopMins(route, stopName);
  return m !== null ? minsToHHMM(m) : null;
}

// Ціна відрізку між двома зупинками
function getSegmentPrice(route, fromName, toName) {
  const f = route.stops.find(s => s.name === fromName);
  const t = route.stops.find(s => s.name === toName);
  if (!f || !t) return null;
  return Math.abs(t.price_from_start - f.price_from_start).toFixed(2);
}

// "Звідки" для рейсу: вибрана зупинка або перша зупинка маршруту
function getEffectiveFrom(route) {
  if (fromStop && route.stops.some(s => s.name === fromStop)) return fromStop;
  return route.stops[0].name;
}

// "Куди" для рейсу: вибрана зупинка або остання зупинка маршруту
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

function isPastRoute(route) {
  const m = getStopMins(route, getEffectiveFrom(route));
  if (m === null) return true;
  const now = new Date();
  return m < (now.getHours() * 60 + now.getMinutes());
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

function findNextRoute() {
  return getFilteredRoutes().find(r => !isPastRoute(r)) || null;
}

// Всі унікальні назви зупинок з усіх маршрутів (для автодоповнення)
function getAllStops() {
  if (!busData) return [];
  const seen = new Set();
  busData.routes.forEach(r => r.stops.forEach(s => seen.add(s.name)));
  return [...seen].sort((a, b) => a.localeCompare(b, 'uk'));
}

// ── Smart row (рядок "наступний автобус") ─────────────────────────────
function renderSmartRow() {
  const el = document.getElementById('bus-smart-row');
  if (!el) return;
  const next = findNextRoute();
  if (!next) {
    el.innerHTML = `<span class="bsr-empty">Рейсів сьогодні більше немає</span>`;
    el.className = 'bus-smart-row';
    return;
  }
  const effFrom  = getEffectiveFrom(next);
  const fromTime = getStopHHMM(next, effFrom);
  const mins     = minutesUntil(fromTime);
  const urgent   = mins !== null && mins <= 10;
  el.className   = `bus-smart-row${urgent ? ' urgent' : ''}`;
  el.innerHTML   = `
    <span class="bsr-icon">▶</span>
    <span class="bsr-text">
      Наступний <strong>${escapeHtml(mins !== null ? formatCountdown(mins) : 'зараз')}</strong>
      — ${escapeHtml(fromTime)}, ${escapeHtml(next.name)}
    </span>
    ${urgent ? `<span class="bsr-hurry">Поспішай!</span>` : ''}
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
    const past    = isPastRoute(route);
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

    // Базова ціна від ефективної початкової зупинки (для акордеону)
    const basePrice = route.stops.find(s => s.name === effFrom)?.price_from_start ?? 0;

    // Акордеон зупинок (accordion — список зупинок маршруту)
    const stopsHtml = route.stops.map(s => {
      const isFrom = s.name === effFrom;
      const isTo   = s.name === effTo;
      const hl     = isFrom || isTo;
      const t      = getStopHHMM(route, s.name);
      const seg    = Math.max(0, s.price_from_start - basePrice).toFixed(2);
      return `
        <div class="bs-stop-row${hl ? ' hl' : ''}">
          <span class="bs-stop-time">${escapeHtml(t || '—')}</span>
          <span class="bs-stop-name">${isFrom ? '▶\u202f' : isTo ? '◀\u202f' : ''}${escapeHtml(s.name)}</span>
          <span class="bs-stop-price">${escapeHtml(seg)} грн</span>
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
      <div class="bus-card${past ? ' past' : ''}${isNext ? ' next' : ''}">
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
          ${!past && route.status !== 'cancelled' ? `
          <a class="bus-call-btn" href="tel:${escapeHtml(c.phone.replace(/\s/g, ''))}"
             title="Диспетчер ${escapeHtml(c.phone)}" aria-label="Зателефонувати">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </a>` : ''}
        </div>
        <button class="bs-toggle" data-id="${escapeHtml(route.id)}">
          ${expanded ? 'Сховати зупинки ▴' : 'Всі зупинки ▾'}
        </button>
        <div class="bs-stops-body"${expanded ? '' : ' hidden'}>
          ${stopsHtml}
        </div>
      </div>`;
  }).join('');

  // Кнопка "показати всі / сховати минулі"
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

  // Обробники акордеону (toggle — розгортання/згортання зупинок)
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

  const stops = getAllStops();
  const opts  = stops.map(s => `<option value="${escapeHtml(s)}">`).join('');

  el.innerHTML = `
    <datalist id="bs-stops-list">${opts}</datalist>
    <div class="bs-search-row">
      <div class="bs-search-field">
        <label class="bs-search-label" for="bs-from-input">Від</label>
        <input class="bs-search-input" id="bs-from-input"
               list="bs-stops-list" placeholder="Звідки…"
               value="${escapeHtml(fromStop)}" autocomplete="off">
      </div>
      <button class="bs-swap-btn" id="bs-swap-btn" title="Поміняти напрямок">⇌</button>
      <div class="bs-search-field">
        <label class="bs-search-label" for="bs-to-input">До</label>
        <input class="bs-search-input" id="bs-to-input"
               list="bs-stops-list" placeholder="Куди…"
               value="${escapeHtml(toStop)}" autocomplete="off">
      </div>
    </div>
  `;

  const fromInput = document.getElementById('bs-from-input');
  const toInput   = document.getElementById('bs-to-input');
  const swapBtn   = document.getElementById('bs-swap-btn');

  function onSearchChange() {
    fromStop = fromInput.value.trim();
    toStop   = toInput.value.trim();
    showAll  = false;
    savePrefs();
    renderSmartRow();
    renderRouteList();
  }

  fromInput.addEventListener('change', onSearchChange);
  fromInput.addEventListener('input',  onSearchChange);
  toInput.addEventListener('change',   onSearchChange);
  toInput.addEventListener('input',    onSearchChange);

  swapBtn.addEventListener('click', () => {
    [fromStop, toStop] = [toStop, fromStop];
    fromInput.value    = fromStop;
    toInput.value      = toStop;
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
      ${escapeHtml(busData.source)} · ${escapeHtml(busData.verifiedAt)}
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
