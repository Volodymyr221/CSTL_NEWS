import { escapeHtml } from '../core/utils.js';

let busData        = null;
let activeDirection = 'from_olyka';
let activeStop      = 'Всі';
let timerInterval   = null;

// Перевіряє чи рейс їде сьогодні (виправлення B-05)
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

// Рейси з урахуванням напрямку і вибраної зупинки
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

// Наступний рейс (з фільтром)
function findNext() {
  return getFiltered().filter(b => isDayActive(b.days)).find(b => minutesUntil(b.time) !== null) || null;
}

// Унікальні зупинки для активного напрямку (зберігаємо порядок першого рейсу)
function getStops() {
  if (!busData) return [];
  const seen = new Set();
  busData.buses
    .filter(b => b.direction === activeDirection)
    .flatMap(b => b.stops)
    .forEach(s => seen.add(s));
  return [...seen];
}

// ── Smart-рядок ───────────────────────────────────────────────────
function updateSmartRow() {
  const el = document.getElementById('bus-smart-row');
  if (!el) return;
  const next = findNext();
  if (!next) {
    el.innerHTML = `<span class="bsr-empty">Рейсів сьогодні більше немає</span>`;
    return;
  }
  const mins   = minutesUntil(next.time);
  const urgent = mins <= 10;
  el.className = `bus-smart-row${urgent ? ' urgent' : ''}`;
  el.innerHTML = `
    <span class="bsr-icon">▶</span>
    <span class="bsr-text">
      Наступний <strong>${escapeHtml(formatTimer(mins))}</strong> — ${escapeHtml(next.time)}, ${escapeHtml(next.route)}
    </span>
    ${urgent ? `<span class="bsr-hurry">Поспішай!</span>` : ''}
  `;
}

// ── Список рейсів (компактні рядки) ──────────────────────────────
function renderList() {
  const el = document.getElementById('bus-list');
  if (!el) return;

  const nowMin = new Date().getHours() * 60 + new Date().getMinutes();
  const next   = findNext();
  const buses  = getFiltered();

  if (!buses.length) {
    el.innerHTML = '<div class="empty-state">Рейсів через цю зупинку немає</div>';
    return;
  }

  el.innerHTML = buses.map(b => {
    const past   = toMinutes(b.time) < nowMin || !isDayActive(b.days);
    const isNext = next && b.id === next.id;

    return `
      <div class="brow${past ? ' brow--past' : ''}${isNext ? ' brow--next' : ''}">
        <span class="brow-time">${escapeHtml(b.time)}</span>
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
}

// ── Чіпи зупинок ─────────────────────────────────────────────────
function renderStopFilter() {
  const el = document.getElementById('bus-stop-filter');
  if (!el) return;
  const stops = ['Всі', ...getStops()];
  el.innerHTML = stops.map(s =>
    `<button class="chip${s === activeStop ? ' active' : ''}" data-stop="${escapeHtml(s)}">${escapeHtml(s)}</button>`
  ).join('');
  el.querySelectorAll('.chip').forEach(btn => {
    btn.addEventListener('click', () => {
      activeStop = btn.dataset.stop;
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
