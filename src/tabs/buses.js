import { escapeHtml } from '../core/utils.js';

let busData = null;
let activeDirection = 'from_olyka';
let timerInterval = null;

// Перевіряє чи рейс їде сьогодні по полю days (виправлення B-05)
function isDayActive(days) {
  const day = new Date().getDay(); // 0=нд, 1=пн ... 6=сб
  if (days === 'щодня') return true;
  if (days === 'пн-сб') return day >= 1 && day <= 6;
  if (days === 'пн-пт') return day >= 1 && day <= 5;
  return true;
}

// Повертає хвилини від початку дня для рядка "HH:MM"
function toMinutes(timeStr) {
  const [h, m] = timeStr.split(':').map(Number);
  return h * 60 + m;
}

// Повертає хвилини до рейсу або null якщо вже відправився
function minutesUntil(timeStr) {
  const now = new Date();
  const diff = toMinutes(timeStr) - (now.getHours() * 60 + now.getMinutes());
  return diff > 0 ? diff : null;
}

// Форматує хвилини у "через X хв" або "через X год Y хв"
function formatTimer(minutes) {
  if (minutes < 60) return `через ${minutes} хв`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m > 0 ? `через ${h} год ${m} хв` : `через ${h} год`;
}

// Знаходить наступний рейс для активного напрямку з урахуванням дня тижня
function findNextBus() {
  if (!busData) return null;
  return busData.buses
    .filter(b => b.direction === activeDirection && isDayActive(b.days))
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time))
    .find(b => minutesUntil(b.time) !== null) || null;
}

// Оновлює тільки Smart-Focus блок без перерендеру списку
function updateSmartFocus() {
  const el = document.getElementById('bus-smart-focus');
  if (!el) return;

  const next = findNextBus();
  if (!next) {
    el.innerHTML = `<div class="bus-smart-empty">Рейсів сьогодні більше немає</div>`;
    return;
  }

  const mins   = minutesUntil(next.time);
  const urgent = mins <= 10;

  el.innerHTML = `
    <div class="bus-smart-label">Наступний рейс</div>
    <div class="bus-smart-timer${urgent ? ' urgent' : ''}">
      ${escapeHtml(formatTimer(mins))}
      ${urgent ? `<span class="bus-smart-hurry">Поспішай!</span>` : ''}
    </div>
    <div class="bus-smart-route">${escapeHtml(next.time)} · ${escapeHtml(next.route)}</div>
  `;
}

// Рендер карток рейсів
function renderList() {
  const el = document.getElementById('bus-list');
  if (!el || !busData) return;

  const now    = new Date();
  const nowMin = now.getHours() * 60 + now.getMinutes();

  const buses = busData.buses
    .filter(b => b.direction === activeDirection)
    .sort((a, b) => toMinutes(a.time) - toMinutes(b.time));

  if (!buses.length) {
    el.innerHTML = '<div class="empty-state">Рейсів у цьому напрямку немає</div>';
    return;
  }

  el.innerHTML = buses.map(b => {
    const past    = toMinutes(b.time) < nowMin;
    const noToday = !isDayActive(b.days);
    const faded   = past || noToday;

    return `
      <div class="bus-card${faded ? ' past' : ''}">
        <div class="bus-card-main">
          <span class="bus-card-time">${escapeHtml(b.time)}</span>
          <div class="bus-card-info">
            <div class="bus-card-route">${escapeHtml(b.route)}</div>
            <div class="bus-card-meta">
              <span>${escapeHtml(b.price)}</span>
              <span class="bus-meta-sep">·</span>
              <span>${escapeHtml(b.days)}</span>
            </div>
            <div class="bus-card-verified">Перевірено: ${escapeHtml(busData.verifiedAt)}</div>
          </div>
          <a class="bus-call-btn" href="tel:${escapeHtml(busData.dispatcher.replace(/\s/g, ''))}"
             title="Зателефонувати диспетчеру" aria-label="Зателефонувати диспетчеру">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
                 stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>
            </svg>
          </a>
        </div>
        ${!faded ? `
        <button class="bus-share-btn" data-time="${escapeHtml(b.time)}" data-route="${escapeHtml(b.route)}">
          Поділитись рейсом
        </button>` : ''}
      </div>
    `;
  }).join('');

  // Кнопки "Поділитись" через Web Share API (веб-інтерфейс обміну даними)
  el.querySelectorAll('.bus-share-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const text = `Їду рейсом ${btn.dataset.route} о ${btn.dataset.time} 🚌`;
      if (navigator.share) {
        navigator.share({ text });
      } else {
        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = '✓ Скопійовано!';
          setTimeout(() => { btn.textContent = 'Поділитись рейсом'; }, 2000);
        });
      }
    });
  });
}

// Рендер табів напрямку
function renderTabs() {
  const el = document.getElementById('bus-direction-tabs');
  if (!el) return;

  const tabs = [
    { id: 'from_olyka', label: 'З Олики' },
    { id: 'to_olyka',   label: 'В Олику' },
  ];

  el.innerHTML = tabs.map(t =>
    `<button class="route-tab${t.id === activeDirection ? ' active' : ''}" data-dir="${t.id}">
      ${t.label}
    </button>`
  ).join('');

  el.querySelectorAll('.route-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      activeDirection = btn.dataset.dir;
      renderTabs();
      renderList();
      updateSmartFocus();
    });
  });
}

// Точка входу — ініціалізує модуль автобусів
export async function initBuses() {
  const el = document.getElementById('buses-content');
  if (!el) return;

  // Skeleton під час завантаження
  el.innerHTML = `
    <div class="bus-smart-focus">
      <div class="ev-skel-line w60" style="height:12px;margin-bottom:8px"></div>
      <div class="ev-skel-line w40" style="height:32px;margin-bottom:6px"></div>
      <div class="ev-skel-line w70" style="height:13px"></div>
    </div>
    <div class="route-tabs"></div>
    <div class="departures-list">
      ${Array(4).fill(`
        <div style="padding:14px 16px;border-bottom:1px solid var(--border)">
          <div style="display:flex;gap:12px;align-items:center">
            <div class="ev-skel-line" style="width:72px;height:36px;border-radius:6px"></div>
            <div style="flex:1">
              <div class="ev-skel-line w80" style="height:14px;margin-bottom:6px"></div>
              <div class="ev-skel-line w50" style="height:12px"></div>
            </div>
          </div>
        </div>
      `).join('')}
    </div>
  `;

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
    <div id="bus-smart-focus" class="bus-smart-focus"></div>
    <div class="route-tabs" id="bus-direction-tabs"></div>
    <div id="bus-list" class="departures-list"></div>
    <div class="buses-updated">
      Джерело: ${escapeHtml(busData.source)} · Диспетчер: ${escapeHtml(busData.dispatcher)}
    </div>
  `;

  renderTabs();
  renderList();
  updateSmartFocus();

  // Оновлення таймера і списку кожну хвилину
  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    updateSmartFocus();
    renderList();
  }, 60000);
}
