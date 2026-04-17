import { escapeHtml } from '../core/utils.js';

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

// ── Time utils (утиліти для роботи з часом) ───────────────────────────

// Розклад прив'язаний до Київського часу — користувачі з-за кордону теж бачать правильний статус.
function kyivNowMins() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kiev', hour: 'numeric', minute: 'numeric', hour12: false,
  }).formatToParts(new Date());
  const h = +parts.find(p => p.type === 'hour').value;
  const m = +parts.find(p => p.type === 'minute').value;
  return h * 60 + m;
}

function kyivDayOfWeek() {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Europe/Kiev', weekday: 'long',
  }).formatToParts(new Date());
  const names = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  return names.indexOf(parts.find(p => p.type === 'weekday').value);
}

// Конвертує Київський HH:MM у локальний час пристрою для відображення.
// Розрахунки статусу (В дорозі / майбутній) завжди в Київському часі — не чіпати.
function kyivToLocal(hhmm) {
  if (!hhmm) return hhmm;
  const localNow = new Date().getHours() * 60 + new Date().getMinutes();
  const diff = localNow - kyivNowMins(); // від'ємне якщо за Заходом від Київа
  if (diff === 0) return hhmm;
  return minsToHHMM((toMinutes(hhmm) + diff + 1440) % 1440);
}

function localTzLabel() {
  const off = -new Date().getTimezoneOffset(); // UTC+N: позитивне для Сходу
  const sign = off >= 0 ? '+' : '−';
  const h = Math.floor(Math.abs(off) / 60);
  const m = Math.abs(off) % 60;
  return `UTC${sign}${h}${m ? ':' + String(m).padStart(2, '0') : ''}`;
}

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
  const diff = toMinutes(hhmm) - kyivNowMins();
  return diff > 0 ? diff : null;
}

function formatCountdown(mins) {
  if (mins < 60) return `через ${mins} хв`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `через ${h} год ${m} хв` : `через ${h} год`;
}

function isDayActive(days) {
  const d = kyivDayOfWeek();
  if (days === 'щодня') return true;
  if (days === 'пн-сб') return d >= 1 && d <= 6;
  if (days === 'пн-пт') return d >= 1 && d <= 5;
  return true;
}

// ── Route calculations (розрахунок часу та ціни) ──────────────────────
function getStopMins(route, stopName) {
  const stop = route.stops.find(s => s.name === stopName);
  if (!stop) return null;
  const totalKm = route.stops[route.stops.length - 1].km;
  if (totalKm === 0) return toMinutes(route.departure_time);
  return toMinutes(route.departure_time) + Math.round((stop.km / totalKm) * route.duration_min);
}

// Три стани рейсу: 'future' | 'enroute' | 'past'
function getRouteState(route) {
  const nowMins = kyivNowMins();
  const depMins = toMinutes(route.departure_time);
  const arrMins = depMins + route.duration_min;
  if (nowMins < depMins) return 'future';
  if (nowMins >= arrMins) return 'past';
  return 'enroute';
}

function getRouteProgress(route) {
  const nowMins = kyivNowMins();
  const depMins = toMinutes(route.departure_time);
  if (nowMins <= depMins) return 0;
  return Math.min(1, (nowMins - depMins) / route.duration_min);
}

function getCurrentPosition(route) {
  const nowMins = kyivNowMins();
  const stops = route.stops;
  for (let i = 0; i < stops.length - 1; i++) {
    const currMins = getStopMins(route, stops[i].name);
    const nextMins = getStopMins(route, stops[i + 1].name);
    if (nowMins >= currMins && nowMins < nextMins) {
      return {
        prevStop: stops[i],
        nextStop: stops[i + 1],
        prevIdx: i,
        nextIdx: i + 1,
        minsToNext: nextMins - nowMins
      };
    }
  }
  return { prevStop: stops[stops.length - 1], nextStop: null, prevIdx: stops.length - 1, nextIdx: null, minsToNext: 0 };
}

function formatPosition(pos) {
  if (!pos.nextStop) return escapeHtml(pos.prevStop.name);
  if (pos.minsToNext <= 2) return `Під'їжджає до ${escapeHtml(pos.nextStop.name)}`;
  return `Біля ${escapeHtml(pos.prevStop.name)}`;
}

function getStopHHMM(route, stopName) {
  const m = getStopMins(route, stopName);
  return m !== null ? minsToHHMM(m) : null;
}

function getSegmentPrice(route, fromName, toName) {
  const f = route.stops.find(s => s.name === fromName);
  const t = route.stops.find(s => s.name === toName);
  if (!f || !t) return null;
  return Math.abs(t.price_from_start - f.price_from_start).toFixed(2);
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

function findNextRoute() {
  return getFilteredRoutes().find(r => getRouteState(r) === 'future') || null;
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

// ── Smart row (рядок "наступний автобус") ─────────────────────────────
function renderSmartRow() {
  const el = document.getElementById('bus-smart-row');
  if (!el) return;

  const all = getFilteredRoutes();
  const liveRoute = all.find(r => getRouteState(r) === 'enroute');

  if (liveRoute) {
    const pos = getCurrentPosition(liveRoute);
    const posText = formatPosition(pos);
    const etaText = pos.minsToNext > 0 ? ` · ${pos.minsToNext} хв до ${escapeHtml(pos.nextStop.name)}` : '';
    el.className = 'bus-smart-row enroute';
    el.innerHTML = `
      <span class="bsr-icon bsr-pulse"></span>
      <span class="bsr-text">
        <strong>В дорозі</strong> — ${escapeHtml(liveRoute.name)}<br>
        <small>${posText}${etaText}</small>
      </span>
    `;
    return;
  }

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
      — ${escapeHtml(kyivToLocal(fromTime))}, ${escapeHtml(next.name)}
    </span>
    ${urgent ? `<span class="bsr-hurry">Поспішай!</span>` : ''}
  `;
}

// ── Route list (список рейсів) ─────────────────────────────────────────
function renderRouteList() {
  const el = document.getElementById('bus-list');
  if (!el) return;

  const all      = getFilteredRoutes();
  const enroute  = all.filter(r => getRouteState(r) === 'enroute');
  const future   = all.filter(r => getRouteState(r) === 'future');
  const past     = all.filter(r => getRouteState(r) === 'past');
  const active   = [...enroute, ...future];
  const toRender = showAll ? [...enroute, ...future, ...past] : active;

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
    const state     = getRouteState(route);
    const isPast    = state === 'past';
    const isLive    = state === 'enroute';
    const isNext    = !isLive && next && route.id === next.id;
    const effFrom   = getEffectiveFrom(route);
    const effTo     = getEffectiveTo(route);
    const fromTimeKyiv = getStopHHMM(route, effFrom);
    const toTimeKyiv   = getStopHHMM(route, effTo);
    const fromTime  = kyivToLocal(fromTimeKyiv);
    const toTime    = kyivToLocal(toTimeKyiv);
    const isForeign = fromTime !== fromTimeKyiv;
    const price     = getSegmentPrice(route, effFrom, effTo);
    const fromMins  = getStopMins(route, effFrom) || 0;
    const toMins    = getStopMins(route, effTo)   || 0;
    const segDur    = toMins - fromMins;
    const durStr    = segDur >= 60
      ? `${Math.floor(segDur / 60)} год${segDur % 60 ? ' ' + (segDur % 60) + ' хв' : ''}`
      : `${segDur} хв`;
    const c         = carrierInfo(route.carrier);
    const expanded  = isLive || expandedIds.has(route.id);
    const basePrice = route.stops.find(s => s.name === effFrom)?.price_from_start ?? 0;

    const pos = isLive ? getCurrentPosition(route) : null;

    const stopsHtml = route.stops.map((s, idx) => {
      const isFrom = s.name === effFrom;
      const isTo   = s.name === effTo;
      const hl     = isFrom || isTo;
      const t      = kyivToLocal(getStopHHMM(route, s.name));
      const seg    = Math.max(0, s.price_from_start - basePrice).toFixed(2);

      let rowCls = 'bs-stop-row';
      if (hl) rowCls += ' hl';
      if (isLive && pos) {
        if (idx < pos.prevIdx) rowCls += ' passed';
        else if (idx === pos.prevIdx) rowCls += ' current';
        else if (idx === pos.nextIdx) rowCls += ' upcoming';
      }

      const icon = isLive && pos && idx < pos.prevIdx ? '✓\u202f'
                 : isLive && pos && idx === pos.nextIdx ? '●\u202f'
                 : isFrom ? '▶\u202f'
                 : isTo   ? '◀\u202f'
                 : '';

      return `
        <div class="${rowCls}">
          <span class="bs-stop-time">${escapeHtml(t || '—')}</span>
          <span class="bs-stop-name">${icon}${escapeHtml(s.name)}</span>
          <span class="bs-stop-price">${escapeHtml(seg)} грн</span>
        </div>`;
    }).join('');

    const statusBadge = route.status === 'cancelled'
      ? `<span class="bs-status cancelled">Скасовано</span>`
      : route.status === 'delayed'
      ? `<span class="bs-status delayed">Затримка</span>`
      : isLive
      ? `<span class="bs-status live">В дорозі</span>`
      : '';

    const autoNote = route.auto_generated
      ? `<div class="bs-autogen">розрахований зворотний рейс</div>`
      : '';

    let progressHtml = '';
    if (isLive) {
      const pct = Math.round(getRouteProgress(route) * 100);
      const posText = formatPosition(pos);
      const etaText = pos.minsToNext > 0 ? `до ${escapeHtml(pos.nextStop.name)} · ${pos.minsToNext} хв` : '';
      progressHtml = `
        <div class="bs-progress">
          <div class="bs-progress-bar">
            <div class="bs-progress-fill" style="width:${pct}%"></div>
          </div>
          <div class="bs-progress-info">
            <span class="bs-progress-pos">${posText}</span>
            ${etaText ? `<span class="bs-progress-eta">${etaText}</span>` : ''}
          </div>
        </div>`;
    }

    const cardCls = `bus-card${isPast ? ' past' : ''}${isLive ? ' enroute' : ''}${isNext ? ' next' : ''}`;

    return `
      <div class="${cardCls}">
        <div class="bus-card-main">
          <div class="bs-time-block">
            <span class="bus-card-time">${escapeHtml(fromTime || '—')}</span>
            <span class="bs-arr">\u2192\u202f${escapeHtml(toTime || '—')}</span>
            ${isForeign ? `<span class="bs-kyiv-time">За Києвом ${escapeHtml(fromTimeKyiv || '—')}\u202f\u2192\u202f${escapeHtml(toTimeKyiv || '—')}</span>` : ''}
          </div>
          <div class="bus-card-info">
            <div class="bus-card-route">${escapeHtml(route.name)}${statusBadge}</div>
            <div class="bus-card-meta">
              <span>${escapeHtml(durStr)}</span>
              <span class="bus-meta-sep">\u00b7</span>
              <span>${escapeHtml(price || '—')} грн</span>
              <span class="bus-meta-sep">\u00b7</span>
              <span>${escapeHtml(c.name)}</span>
            </div>
            ${autoNote}
          </div>
          ${!isPast && route.status !== 'cancelled' ? `
          <a class="bus-call-btn" href="tel:${escapeHtml(c.phone.replace(/\s/g, ''))}"
             title="Диспетчер ${escapeHtml(c.phone)}" aria-label="Зателефонувати">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </a>` : ''}
        </div>
        ${progressHtml}
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
      ${kyivNowMins() !== new Date().getHours() * 60 + new Date().getMinutes()
        ? `<br><span class="buses-tz">Час місцевий · ${escapeHtml(localTzLabel())}</span>`
        : ''}
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
