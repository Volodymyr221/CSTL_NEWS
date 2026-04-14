import { escapeHtml } from '../core/utils.js';

const PREFS_KEY = 'bus_prefs';
let busData         = null;
let activeDirection = 'from_olyka';
let activeStop      = 'Всі';
let showAll         = false;
let timerInterval   = null;

// ── Персоналізація (localStorage — локальне сховище браузера) ──────
function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ direction: activeDirection, stop: activeStop }));
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (p?.direction) activeDirection = p.direction;
    if (p?.stop)      activeStop      = p.stop;
  } catch {}
}

// ── Логіка днів і часу ────────────────────────────────────────────
function isDayActive(days) {
  const day = new Date().getDay();
  if (days === 'щодня') return true;
  if (days === 'пн-сб') return day >= 1 && day <= 6;
  if (days === 'пн-пт') return day >= 1 && day <= 5;
  return true;
}

function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

function minutesUntil(timeStr) {
  const now  = new Date();
  const diff = toMinutes(timeStr) - (now.getHours() * 60 + now.getMinutes());
  return diff > 0 ? diff : null;
}

function formatTimer(mins) {
  if (mins < 60) return `через ${mins} хв`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m > 0 ? `через ${h} год ${m} хв` : `через ${h} год`;
}

// Розраховує час прибуття з часу відправлення + тривалість у хвилинах
function calcArrival(timeStr, duration) {
  if (!duration) return null;
  const [h, m] = timeStr.split(':').map(Number);
  const total  = h * 60 + m + duration;
  const ah     = Math.floor(total / 60) % 24;
  const am     = total % 60;
  return `${String(ah).padStart(2, '0')}:${String(am).padStart(2, '0')}`;
}

// ── Фільтрація ────────────────────────────────────────────────────
function getFiltered() {
  if (!busData) return [];
  return busData.buses
    .filter(b => {
      if (b.direction !== activeDirection) return false;
      if (activeStop !== 'Всі' && !b.stops.includes(activeStop)) return false;
      return true;
    })
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));
}

function isPast(b) {
  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  return toMinutes(b.time) < nowMin || !isDayActive(b.days);
}

function findNext() {
  return getFiltered().filter(b => isDayActive(b.days)).find(b => minutesUntil(b.time) !== null) || null;
}

function getStops() {
  if (!busData) return [];
  const seen = new Set();
  busData.buses
    .filter(b => b.direction === activeDirection)
    .flatMap(b => b.stops)
    .forEach(s => seen.add(s));
  return [...seen];
}

// ── Smart-рядок наступного рейсу ──────────────────────────────────
function updateSmartRow() {
  const el = document.getElementById('bus-smart-row');
  if (!el) return;
  const next = findNext();
  if (!next) {
    el.innerHTML = `<span class="bsr-empty">Рейсів сьогодні більше немає</span>`;
    return;
  }
  const mins    = minutesUntil(next.time);
  const urgent  = mins <= 10;
  const arrival = calcArrival(next.time, next.duration);
  el.className  = `bus-smart-row${urgent ? ' urgent' : ''}`;
  el.innerHTML  = `
    <span class="bsr-icon">▶</span>
    <span class="bsr-text">
      Наступний <strong>${escapeHtml(formatTimer(mins))}</strong> —
      ${escapeHtml(next.time)}${arrival ? ` → ${escapeHtml(arrival)}` : ''}, ${escapeHtml(next.route)}
    </span>
    ${urgent ? `<span class="bsr-hurry">Поспішай!</span>` : ''}
  `;
}

// ── Список рейсів ─────────────────────────────────────────────────
function renderList() {
  const el = document.getElementById('bus-list');
  if (!el) return;

  const next        = findNext();
  const buses       = getFiltered();
  const futureBuses = buses.filter(b => !isPast(b));
  const pastBuses   = buses.filter(b => isPast(b));

  if (!buses.length) {
    el.innerHTML = '<div class="empty-state">Рейсів через цю зупинку немає</div>';
    return;
  }

  // В режимі "тільки майбутні" показуємо future-рейси.
  // В режимі "всі" показуємо повний список у хронологічному порядку.
  const toRender = showAll ? buses : futureBuses;

  if (!toRender.length) {
    el.innerHTML = `
      <div class="empty-state">Рейсів сьогодні більше немає</div>
      <button class="bus-show-all" id="bus-show-all-btn">
        Показати всі ${buses.length} рейси за сьогодні ↓
      </button>`;
    document.getElementById('bus-show-all-btn').addEventListener('click', () => {
      showAll = true;
      renderList();
    });
    return;
  }

  const rowsHtml = toRender.map(b => {
    const past    = isPast(b);
    const isNext  = next && b.id === next.id;
    const arrival = calcArrival(b.time, b.duration);

    return `
      <div class="brow${past ? ' brow--past' : ''}${isNext ? ' brow--next' : ''}">
        <div class="brow-time-block">
          <span class="brow-time">${escapeHtml(b.time)}</span>
          ${arrival ? `<span class="brow-arrival">→ ${escapeHtml(arrival)}</span>` : ''}
        </div>
        <div class="brow-info">
          <span class="brow-route">${escapeHtml(b.route)}</span>
          <span class="brow-meta">${escapeHtml(b.days)} · ${escapeHtml(b.price)}</span>
        </div>
        ${!past ? `
        <a class="brow-call" href="tel:${escapeHtml(busData.dispatcher.replace(/\s/g, ''))}"
           title="Диспетчер ${escapeHtml(busData.dispatcher)}" aria-label="Зателефонувати">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
          </svg>
        </a>` : ''}
      </div>`;
  }).join('');

  // Кнопка перемикання "показати всі / сховати минулі"
  let toggleHtml = '';
  if (!showAll && pastBuses.length > 0) {
    toggleHtml = `
      <button class="bus-show-all" id="bus-show-all-btn">
        Показати всі ${buses.length} рейси за сьогодні ↓
      </button>`;
  } else if (showAll) {
    toggleHtml = `
      <button class="bus-show-all bus-show-all--less" id="bus-show-all-btn">
        Сховати минулі рейси ↑
      </button>`;
  }

  el.innerHTML = rowsHtml + toggleHtml;

  const btn = document.getElementById('bus-show-all-btn');
  if (btn) {
    btn.addEventListener('click', () => {
      showAll = !showAll;
      renderList();
    });
  }
}

// ── Чіпи зупинок ─────────────────────────────────────────────────
function renderStopFilter() {
  const el = document.getElementById('bus-stop-filter');
  if (!el) return;
  const stops = ['Всі', ...getStops()];

  // Перевіряємо що збережена зупинка є у поточному напрямку
  if (activeStop !== 'Всі' && !getStops().includes(activeStop)) {
    activeStop = 'Всі';
  }

  el.innerHTML = stops.map(s =>
    `<button class="chip${s === activeStop ? ' active' : ''}" data-stop="${escapeHtml(s)}">${escapeHtml(s)}</button>`
  ).join('');
  el.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeStop = btn.dataset.stop;
      showAll    = false;
      savePrefs();
      renderStopFilter();
      renderList();
      updateSmartRow();
    });
  });
}

// ── Таби напрямку ─────────────────────────────────────────────────
function renderTabs() {
  const el = document.getElementById('bus-direction-tabs');
  if (!el) return;
  const tabs = [
    { id: 'from_olyka', label: 'З Олики' },
    { id: 'to_olyka',   label: 'В Олику' },
  ];
  el.innerHTML = tabs.map(t =>
    `<button class="route-tab${t.id === activeDirection ? ' active' : ''}" data-dir="${t.id}">${t.label}</button>`
  ).join('');
  el.querySelectorAll('.route-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeDirection = btn.dataset.dir;
      activeStop      = 'Всі';
      showAll         = false;
      savePrefs();
      renderTabs();
      renderStopFilter();
      renderList();
      updateSmartRow();
    });
  });
}

// ── Ініціалізація ─────────────────────────────────────────────────
export async function initBuses() {
  const el = document.getElementById('buses-content');
  if (!el) return;

  loadPrefs();

  try {
    const res = await fetch('./data/schedule.json');
    busData = await res.json();
  } catch {
    busData = null;
  }

  if (!busData) {
    el.innerHTML = '<div class="empty-state">Розклад тимчасово недоступний</div>';
    return;
  }

  el.innerHTML = `
    <div class="route-tabs" id="bus-direction-tabs"></div>
    <div class="bus-stop-bar">
      <div id="bus-stop-filter" class="chips-row"></div>
    </div>
    <div id="bus-smart-row" class="bus-smart-row"></div>
    <div id="bus-list" class="bus-list"></div>
    <div class="buses-updated">
      ${escapeHtml(busData.source)} · Перевірено ${escapeHtml(busData.verifiedAt)} · 📞 ${escapeHtml(busData.dispatcher)}
    </div>
  `;

  renderTabs();
  renderStopFilter();
  renderList();
  updateSmartRow();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    updateSmartRow();
    renderList();
  }, 60000);
}
