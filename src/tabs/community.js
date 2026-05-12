// src/tabs/community.js
// Модуль «Громада» — головна вкладка-дашборд (панель зі зведеною інформацією).
//
// 7 блоків (Фаза 8 з ROADMAP.md):
//   1. Погода (розширена)
//   2. Світло зараз
//   3. Наступний автобус
//   4. Оголошення громади
//   5. Останні новини
//   6. Найближча подія
//   7. Контакти екстрених служб
//
// Кожен блок завантажує свої дані самостійно через fetch.
// Помилка одного блоку не ламає інші.

import { escapeHtml, formatTime } from '../core/utils.js';

const OLYKA = { lat: 50.7333, lon: 25.8167 };
const POWER_PREFS_KEY = 'power_prefs_v2';
const BUS_PREFS_KEY   = 'bus_prefs_v2';

// ── Утиліти (helpers) ─────────────────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// WMO weather code → emoji + текстовий опис
function weatherCodeInfo(code) {
  if (code === 0)               return { icon: '☀️', text: 'Ясно' };
  if (code <= 2)                return { icon: '🌤️', text: 'Мінлива хмарність' };
  if (code === 3)               return { icon: '☁️', text: 'Хмарно' };
  if (code <= 48)               return { icon: '🌫️', text: 'Туман' };
  if (code <= 55)               return { icon: '🌦️', text: 'Мряка' };
  if (code <= 65)               return { icon: '🌧️', text: 'Дощ' };
  if (code <= 77)               return { icon: '❄️', text: 'Сніг' };
  if (code <= 82)               return { icon: '🌧️', text: 'Зливи' };
  if (code >= 95)               return { icon: '⛈️', text: 'Гроза' };
  return { icon: '🌡️', text: '—' };
}

// SVG-іконки для контактів (один компактний оптимізований набір)
const CONTACT_ICONS = {
  ambulance: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M10 10h4M12 8v4"/><path d="M2 17h20v-3a2 2 0 0 0-2-2h-3l-3-4H7a4 4 0 0 0-4 4v5h-1"/><circle cx="7" cy="17" r="2"/><circle cx="17" cy="17" r="2"/></svg>',
  fire:      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 17a2.5 2.5 0 0 0 2.5-2.5c0-1.5-.5-2-2-3.5C10 9.5 8.5 8 8.5 6c0 0-2 2-2 5a5 5 0 0 0 5 5 5 5 0 0 0 5-5c0-3-3-7-5-9 0 2-2 4.5-3.5 6.5z"/></svg>',
  police:    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/><path d="M9 12l2 2 4-4"/></svg>',
  gas:       '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v4M8 6h8M6 6v14a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V6"/><path d="M10 12h4"/></svg>',
  hospital:  '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 22V8a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14"/><path d="M2 22h20"/><path d="M12 11v4M10 13h4"/></svg>',
  gromada:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 21h18M5 21V10l7-5 7 5v11"/><path d="M9 21v-6h6v6"/></svg>',
  power:     '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/></svg>',
  default:   '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07A19.5 19.5 0 0 1 4.69 12 19.79 19.79 0 0 1 1.61 3.4 2 2 0 0 1 3.6 1.22h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L7.91 8.82a16 16 0 0 0 6.29 6.29l.98-.98a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/></svg>',
};

// Кольори фону для категорій контактів
const CONTACT_COLORS = {
  emergency: '#C41E3A',
  medical:   '#2E7D32',
  gov:       '#1565C0',
  utility:   '#B45309',
};

function loadPowerPrefs() {
  try { return JSON.parse(localStorage.getItem(POWER_PREFS_KEY) || '{}'); }
  catch { return {}; }
}

function loadBusPrefs() {
  try { return JSON.parse(localStorage.getItem(BUS_PREFS_KEY) || '{}'); }
  catch { return {}; }
}

// ── Блок 1: Погода (розширена) ────────────────────────────────────────────────

async function renderWeatherBlock() {
  const el = document.getElementById('cm-weather-content');
  if (!el) return;

  try {
    const res = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${OLYKA.lat}&longitude=${OLYKA.lon}` +
      `&current=temperature_2m,weather_code,apparent_temperature,wind_speed_10m` +
      `&daily=temperature_2m_max,temperature_2m_min&timezone=auto`
    );
    const data = await res.json();
    const cur  = data.current;
    const day  = data.daily;
    const info = weatherCodeInfo(cur.weather_code);
    const temp     = Math.round(cur.temperature_2m);
    const feels    = Math.round(cur.apparent_temperature);
    const wind     = Math.round(cur.wind_speed_10m);
    const tMax     = Math.round(day.temperature_2m_max[0]);
    const tMin     = Math.round(day.temperature_2m_min[0]);

    el.innerHTML = `
      <div class="cm-weather-main">
        <div class="cm-weather-icon">${info.icon}</div>
        <div class="cm-weather-temp">${temp}°</div>
        <div class="cm-weather-text">
          <div class="cm-weather-desc">${escapeHtml(info.text)}</div>
          <div class="cm-weather-feels">Відчувається як ${feels}°</div>
        </div>
      </div>
      <div class="cm-weather-extra">
        <span>↑ ${tMax}°</span>
        <span>↓ ${tMin}°</span>
        <span>💨 ${wind} км/год</span>
      </div>
    `;
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Погода тимчасово недоступна</div>';
  }
}

// ── Блок 2: Світло зараз ──────────────────────────────────────────────────────

async function renderPowerBlock() {
  const el = document.getElementById('cm-power-content');
  if (!el) return;

  const prefs = loadPowerPrefs();
  if (!prefs.cityId || !prefs.streetId) {
    el.innerHTML = `
      <div class="cm-block-empty">
        Налаштуйте вашу вулицю у вкладці «Світло»
        <button class="cm-block-cta" onclick="switchTab('power')">Перейти →</button>
      </div>`;
    return;
  }

  try {
    const res  = await fetch('./data/power.json');
    const data = await res.json();
    const city   = data.cities.find(c => c.id === prefs.cityId);
    const street = city?.streets.find(s => s.id === prefs.streetId);
    const queue  = street ? data.queues.find(q => q.id === street.queue_id) : null;

    if (!queue) {
      el.innerHTML = '<div class="cm-block-empty">Дані не знайдено — оновіть налаштування</div>';
      return;
    }

    const schedule = queue.schedule[todayKey()] || queue.schedule[Object.keys(queue.schedule)[0]];
    if (!schedule) {
      el.innerHTML = '<div class="cm-block-empty">Графік на сьогодні відсутній</div>';
      return;
    }

    const curH = new Date().getHours();
    const cur  = schedule[curH];

    let nextH = null;
    for (let h = curH + 1; h < 24; h++) {
      if (schedule[h] !== cur) { nextH = h; break; }
    }

    const statusText = cur === 1 ? 'Є світло' : cur === 0 ? 'Немає світла' : 'Можливі перебої';
    const statusCls  = cur === 1 ? 'on' : cur === 0 ? 'off' : 'maybe';
    const statusDot  = cur === 1 ? '🟢' : cur === 0 ? '🔴' : '🟡';

    const nextLabel = nextH !== null
      ? (cur === 1 ? `Вимкнуть о ${pad(nextH)}:00` : cur === 0 ? `Увімкнуть о ${pad(nextH)}:00` : `Зміна о ${pad(nextH)}:00`)
      : 'До кінця доби без змін';

    const locLabel = city.streets.length === 1
      ? city.name
      : `${city.name} · ${street.name}`;

    el.innerHTML = `
      <div class="cm-power-status cm-power-${statusCls}">
        <span class="cm-power-dot">${statusDot}</span>
        <div class="cm-power-text">
          <div class="cm-power-main">${escapeHtml(statusText)}</div>
          <div class="cm-power-next">${escapeHtml(nextLabel)}</div>
        </div>
      </div>
      <div class="cm-power-loc">${escapeHtml(locLabel)} · ${escapeHtml(queue.name)}</div>
    `;
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Дані про світло недоступні</div>';
  }
}

// ── Блок 3: Наступний автобус ─────────────────────────────────────────────────

function busToMinutes(hhmm) {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

function busMinsToHHMM(total) {
  const h = Math.floor(total / 60) % 24;
  const m = total % 60;
  return `${pad(h)}:${pad(m)}`;
}

function busIsDayActive(days) {
  const d = new Date().getDay();
  if (days === 'щодня') return true;
  if (days === 'пн-сб') return d >= 1 && d <= 6;
  if (days === 'пн-пт') return d >= 1 && d <= 5;
  return true;
}

function busGetStopMins(route, stopName) {
  const stop = route.stops.find(s => s.name === stopName);
  if (!stop) return null;
  const totalKm = route.stops[route.stops.length - 1].km;
  if (totalKm === 0) return busToMinutes(route.departure_time);
  return busToMinutes(route.departure_time) + Math.round((stop.km / totalKm) * route.duration_min);
}

async function renderBusBlock() {
  const el = document.getElementById('cm-bus-content');
  if (!el) return;

  try {
    const res  = await fetch('./data/schedule.json');
    const data = await res.json();
    const prefs = loadBusPrefs();

    const now    = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

    // Знаходимо найближчий майбутній рейс. Якщо є prefs.from — фільтруємо.
    const candidates = data.routes.filter(r => {
      if (!busIsDayActive(r.days)) return false;
      if (prefs.from && !r.stops.some(s => s.name === prefs.from)) return false;
      if (prefs.to   && !r.stops.some(s => s.name === prefs.to))   return false;
      if (prefs.from && prefs.to) {
        const fi = r.stops.findIndex(s => s.name === prefs.from);
        const ti = r.stops.findIndex(s => s.name === prefs.to);
        if (fi >= ti) return false;
      }
      const startName = prefs.from || r.stops[0].name;
      const m = busGetStopMins(r, startName);
      return m !== null && m > nowMin;
    });

    candidates.sort((a, b) => {
      const aFrom = prefs.from || a.stops[0].name;
      const bFrom = prefs.from || b.stops[0].name;
      return (busGetStopMins(a, aFrom) || 0) - (busGetStopMins(b, bFrom) || 0);
    });

    const next = candidates[0];
    if (!next) {
      el.innerHTML = `
        <div class="cm-block-empty">
          Рейсів сьогодні більше немає
          <button class="cm-block-cta" onclick="switchTab('buses')">Розклад →</button>
        </div>`;
      return;
    }

    const fromName = prefs.from || next.stops[0].name;
    const toName   = prefs.to   || next.stops[next.stops.length - 1].name;
    const fromMin  = busGetStopMins(next, fromName);
    const toMin    = busGetStopMins(next, toName);
    const fromHHMM = busMinsToHHMM(fromMin);
    const toHHMM   = busMinsToHHMM(toMin);
    const minsLeft = fromMin - nowMin;
    const urgent   = minsLeft <= 10;

    const countdown = minsLeft < 60
      ? `через ${minsLeft} хв`
      : (() => {
          const h = Math.floor(minsLeft / 60), m = minsLeft % 60;
          return m ? `через ${h} год ${m} хв` : `через ${h} год`;
        })();

    el.innerHTML = `
      <div class="cm-bus-main ${urgent ? 'urgent' : ''}">
        <div class="cm-bus-time">${escapeHtml(fromHHMM)}</div>
        <div class="cm-bus-info">
          <div class="cm-bus-route">${escapeHtml(fromName)} → ${escapeHtml(toName)}</div>
          <div class="cm-bus-meta">${escapeHtml(next.name)} · прибуття ${escapeHtml(toHHMM)}</div>
        </div>
        <div class="cm-bus-countdown ${urgent ? 'urgent' : ''}">${escapeHtml(countdown)}</div>
      </div>
    `;
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Розклад тимчасово недоступний</div>';
  }
}

// ── Блок 4: Оголошення громади ────────────────────────────────────────────────

async function renderAnnouncementsBlock() {
  const el = document.getElementById('cm-announcements-content');
  if (!el) return;

  try {
    const res  = await fetch('./data/community.json');
    const data = await res.json();
    const list = (data.announcements || []).slice().sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.ts || 0) - (a.ts || 0);
    });

    if (!list.length) {
      el.innerHTML = '<div class="cm-block-empty">Оголошень поки немає</div>';
      return;
    }

    el.innerHTML = list.map(a => `
      <article class="cm-ann-card${a.pinned ? ' pinned' : ''}">
        ${a.pinned ? '<span class="cm-ann-pin">📌 Закріплено</span>' : ''}
        <h4 class="cm-ann-title">${escapeHtml(a.title)}</h4>
        <p class="cm-ann-body">${escapeHtml(a.body)}</p>
        <div class="cm-ann-footer">
          <span>${escapeHtml(a.author || '—')}</span>
          <span>${formatTime(a.ts)}</span>
        </div>
      </article>
    `).join('');
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Оголошення недоступні</div>';
  }
}

// ── Блок 5: Останні новини ────────────────────────────────────────────────────

async function renderNewsBlock() {
  const el = document.getElementById('cm-news-content');
  if (!el) return;

  try {
    const res      = await fetch('./data/articles.json');
    const articles = await res.json();
    const sorted   = articles.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0)).slice(0, 3);

    if (!sorted.length) {
      el.innerHTML = '<div class="cm-block-empty">Новин поки немає</div>';
      return;
    }

    el.innerHTML = sorted.map(a => `
      <article class="cm-news-row" onclick="switchTab('news'); setTimeout(() => window.openArticle && window.openArticle(${a.id}), 250);">
        ${a.image ? `<img class="cm-news-img" src="${escapeHtml(a.image)}" alt="" loading="lazy">` : '<div class="cm-news-img cm-news-img--placeholder"></div>'}
        <div class="cm-news-body">
          <div class="cm-news-meta">${escapeHtml(a.geo)} · ${escapeHtml(a.category)}</div>
          <h4 class="cm-news-title">${escapeHtml(a.title)}</h4>
          <div class="cm-news-footer">${escapeHtml(a.source)} · ${formatTime(a.ts)}</div>
        </div>
      </article>
    `).join('');
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Новини недоступні</div>';
  }
}

// ── Блок 6: Найближча подія ───────────────────────────────────────────────────

async function renderEventBlock() {
  const el = document.getElementById('cm-event-content');
  if (!el) return;

  try {
    const res    = await fetch('./data/events.json');
    const events = await res.json();
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const next = events
      .filter(e => new Date(e.date + 'T00:00:00') >= today)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

    if (!next) {
      el.innerHTML = '<div class="cm-block-empty">Найближчих подій поки немає</div>';
      return;
    }

    const d = new Date(next.date + 'T00:00:00');
    const months = ['січня','лютого','березня','квітня','травня','червня','липня','серпня','вересня','жовтня','листопада','грудня'];
    const dateStr = `${d.getDate()} ${months[d.getMonth()]}`;

    el.innerHTML = `
      <article class="cm-event-card" onclick="switchTab('events')">
        <div class="cm-event-date">
          <span class="cm-event-day">${d.getDate()}</span>
          <span class="cm-event-month">${months[d.getMonth()].slice(0, 3)}</span>
        </div>
        <div class="cm-event-body">
          <div class="cm-event-cat">${escapeHtml(next.category)}</div>
          <h4 class="cm-event-title">${escapeHtml(next.title)}</h4>
          <div class="cm-event-meta">📍 ${escapeHtml(next.location)} · ⏰ ${escapeHtml(next.time)}</div>
        </div>
      </article>
    `;
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Події недоступні</div>';
  }
}

// ── Блок 7: Контакти ──────────────────────────────────────────────────────────

async function renderContactsBlock() {
  const el = document.getElementById('cm-contacts-content');
  if (!el) return;

  try {
    const res  = await fetch('./data/community.json');
    const data = await res.json();
    const list = data.contacts || [];

    if (!list.length) {
      el.innerHTML = '<div class="cm-block-empty">Контактів немає</div>';
      return;
    }

    el.innerHTML = list.map(c => {
      const icon  = CONTACT_ICONS[c.icon] || CONTACT_ICONS.default;
      const color = CONTACT_COLORS[c.category] || '#666';
      const tel   = c.phone.replace(/[^\d+]/g, '');
      return `
        <a class="cm-contact-card" href="tel:${escapeHtml(tel)}" style="--accent:${color}">
          <span class="cm-contact-icon">${icon}</span>
          <span class="cm-contact-name">${escapeHtml(c.name)}</span>
          <span class="cm-contact-phone">${escapeHtml(c.phone)}</span>
        </a>
      `;
    }).join('');
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Контакти недоступні</div>';
  }
}

// ── Скелетон-каркас вкладки ───────────────────────────────────────────────────

function renderSkeleton() {
  const el = document.getElementById('cm-content');
  if (!el) return;
  el.innerHTML = `
    <section class="cm-block cm-block--weather">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Погода в Олиці</h3>
      </header>
      <div id="cm-weather-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--power">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Світло зараз</h3>
        <button class="cm-block-link" onclick="switchTab('power')">Графік →</button>
      </header>
      <div id="cm-power-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--bus">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Наступний автобус</h3>
        <button class="cm-block-link" onclick="switchTab('buses')">Розклад →</button>
      </header>
      <div id="cm-bus-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--announcements">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Оголошення громади</h3>
      </header>
      <div id="cm-announcements-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--news">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Останні новини</h3>
        <button class="cm-block-link" onclick="switchTab('news')">Усі →</button>
      </header>
      <div id="cm-news-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--event">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Найближча подія</h3>
        <button class="cm-block-link" onclick="switchTab('events')">Афіша →</button>
      </header>
      <div id="cm-event-content" class="cm-block-body cm-loading">Завантаження…</div>
    </section>

    <section class="cm-block cm-block--contacts">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Корисні контакти</h3>
      </header>
      <div id="cm-contacts-content" class="cm-block-body cm-contacts-grid cm-loading">Завантаження…</div>
    </section>
  `;
}

// ── Точка входу ───────────────────────────────────────────────────────────────

export function initCommunity() {
  renderSkeleton();
  // Запускаємо всі блоки паралельно — кожен оновить свою секцію коли готовий
  renderWeatherBlock();
  renderPowerBlock();
  renderBusBlock();
  renderAnnouncementsBlock();
  renderNewsBlock();
  renderEventBlock();
  renderContactsBlock();
}
