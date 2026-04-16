// src/tabs/power.js
// Модуль «Світло» — графік відключень електроенергії
//
// Архітектура підготована під міграцію на Supabase (хмарна база даних):
//   • powerData.queues  → таблиця `queues`    (id, name)
//   • powerData.cities  → таблиця `cities`    (id, name)
//   •   city.streets    → таблиця `streets`   (id, name, city_id, queue_id)
//   •   queue.schedule  → таблиця `schedules` (queue_id, date, hour INT, status INT)
//   • Звіти користувачів → таблиця `reports`  (id, street_id, status, created_at) — Фаза Б
//
// При міграції: замінити fetch('./data/power.json') на Supabase client queries.

import { escapeHtml } from '../core/utils.js';

let powerData  = null;
let selCity    = null; // { id, name, streets[] }
let selStreet  = null; // { id, name, queue_id }
const PREFS_KEY = 'power_prefs_v2';

// ── Хелпери (допоміжні функції) ──────────────────────────────────────────────

function pad(n) { return String(n).padStart(2, '0'); }

function todayKey() {
  const d = new Date();
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({
    cityId:   selCity?.id   || null,
    streetId: selStreet?.id || null
  }));
}

function loadPrefs() {
  try { return JSON.parse(localStorage.getItem(PREFS_KEY) || '{}'); }
  catch { return {}; }
}

function findCity(id) {
  return powerData?.cities.find(c => c.id === id) || null;
}

function findStreetInCity(city, streetId) {
  return city?.streets.find(s => s.id === streetId) || null;
}

function findQueue(id) {
  return powerData?.queues.find(q => q.id === id) || null;
}

// Розклад на сьогодні: масив 24 елементи (0=немає, 1=є, 2=можливе)
// Supabase: SELECT hour, status FROM schedules WHERE queue_id=? AND date=?
function getTodaySchedule(queueId) {
  const queue = findQueue(queueId);
  if (!queue) return null;
  const key = todayKey();
  return queue.schedule[key] || queue.schedule[Object.keys(queue.schedule)[0]] || null;
}

// ── Генерація ICS-файлу (експорт у системний календар) ───────────────────────

function generateICS(street, queue) {
  const schedule = getTodaySchedule(queue.id);
  if (!schedule) return;

  const d = new Date();
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`;
  const events = [];

  let i = 0;
  while (i < 24) {
    if (schedule[i] === 0) {
      const start = i;
      while (i < 24 && schedule[i] === 0) i++;
      events.push(
        `BEGIN:VEVENT\r\n` +
        `DTSTART:${ymd}T${pad(start)}0000\r\n` +
        `DTEND:${ymd}T${pad(i)}0000\r\n` +
        `SUMMARY:⚡ Відключення — ${escapeHtml(street.name)}\r\n` +
        `DESCRIPTION:${escapeHtml(queue.name)} · CSTL NEWS Олицька ОТГ\r\n` +
        `END:VEVENT`
      );
    } else {
      i++;
    }
  }

  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//CSTL NEWS//Power Schedule//UK',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
    ...events,
    'END:VCALENDAR'
  ].join('\r\n');

  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `vidklyuchennya-${d.getDate()}-${d.getMonth() + 1}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── Рендер: вибір міста/села (перший крок) ───────────────────────────────────

function renderCityOnboarding(container) {
  container.innerHTML = `
    <div class="pw-onboarding">
      <div class="pw-onboarding-icon">⚡</div>
      <h3 class="pw-onboarding-title">Графік відключень</h3>
      <p class="pw-onboarding-sub">Оберіть ваше село або місто</p>
      <div class="pw-street-list">
        ${powerData.cities.map(c =>
          `<button class="pw-street-btn" data-id="${escapeHtml(c.id)}">${escapeHtml(c.name)}</button>`
        ).join('')}
      </div>
    </div>
  `;

  container.querySelectorAll('.pw-street-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selCity = findCity(btn.dataset.id);
      if (!selCity) return;

      // Якщо одна вулиця («все село») — автовибір, одразу на таймлайн
      if (selCity.streets.length === 1) {
        selStreet = selCity.streets[0];
        savePrefs();
        renderPowerPage();
      } else {
        // Декілька вулиць (тільки Олика) — показати список вулиць
        savePrefs();
        renderPowerPage();
      }
    });
  });
}

// ── Рендер: вибір вулиці (другий крок, тільки для Олики) ─────────────────────

function renderStreetOnboarding(container) {
  container.innerHTML = `
    <div class="pw-onboarding">
      <button class="pw-back-btn" id="pw-back-city">← ${escapeHtml(selCity.name)}</button>
      <div class="pw-onboarding-icon">⚡</div>
      <h3 class="pw-onboarding-title">Ваша вулиця</h3>
      <p class="pw-onboarding-sub">Оберіть вулицю — і побачите<br>коли буде і не буде світла</p>
      <div class="pw-street-list">
        ${selCity.streets.map(s =>
          `<button class="pw-street-btn" data-id="${escapeHtml(s.id)}">${escapeHtml(s.name)}</button>`
        ).join('')}
      </div>
    </div>
  `;

  container.querySelector('#pw-back-city')?.addEventListener('click', () => {
    selCity   = null;
    selStreet = null;
    savePrefs();
    renderPowerPage();
  });

  container.querySelectorAll('.pw-street-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      selStreet = findStreetInCity(selCity, btn.dataset.id);
      savePrefs();
      renderPowerPage();
    });
  });
}

// ── Рендер: таймлайн ─────────────────────────────────────────────────────────

function renderTimeline(queue) {
  const schedule = getTodaySchedule(queue.id);
  if (!schedule) return '<p class="pw-empty">Дані на сьогодні відсутні</p>';

  const now   = new Date();
  const curH  = now.getHours();
  const curM  = now.getMinutes();

  const rows = schedule.map((status, hour) => {
    const isPast    = hour < curH;
    const isCurrent = hour === curH;
    const blockCls  = status === 1 ? 'pw-block--on'
                    : status === 0 ? 'pw-block--off'
                    :                'pw-block--maybe';
    const label     = status === 1 ? 'Є' : status === 0 ? 'Немає' : '?';

    const nowMarker = isCurrent ? `
      <div class="pw-now-marker" id="pw-now-marker">
        <div class="pw-now-dot"></div>
        <span class="pw-now-label">ЗАРАЗ ${pad(curH)}:${pad(curM)}</span>
        <div class="pw-now-line-right"></div>
      </div>` : '';

    return `
      ${nowMarker}
      <div class="pw-row${isPast ? ' pw-row--past' : ''}${isCurrent ? ' pw-row--current' : ''}">
        <span class="pw-time">${pad(hour)}:00</span>
        <div class="pw-block ${blockCls}">
          <span class="pw-block-label">${label}</span>
        </div>
      </div>`;
  }).join('');

  const dateStr = now.toLocaleDateString('uk-UA', { day: 'numeric', month: 'long' });

  return `
    <div class="pw-timeline">
      <div class="pw-timeline-date">Сьогодні, ${dateStr}</div>
      ${rows}
    </div>`;
}

// ── Рендер: головна сторінка ──────────────────────────────────────────────────

function renderPowerPage() {
  const container = document.getElementById('power-content');
  if (!container || !powerData) return;

  // Офлайн-банер
  const upd = new Date(powerData._meta.last_updated);
  const updStr = `${pad(upd.getHours())}:${pad(upd.getMinutes())}`;
  const offlineBanner = !navigator.onLine
    ? `<div class="pw-offline-banner">⚡ Офлайн — дані завантажено о ${updStr}</div>`
    : '';

  // Крок 1: не вибрано місто
  if (!selCity) {
    container.innerHTML = offlineBanner;
    renderCityOnboarding(container);
    return;
  }

  // Крок 2: місто є, вулиця — ні (і вулиць більше однієї)
  if (!selStreet) {
    container.innerHTML = offlineBanner;
    renderStreetOnboarding(container);
    return;
  }

  // Крок 3: все вибрано — таймлайн
  const queue = findQueue(selStreet.queue_id);
  if (!queue) { selStreet = null; savePrefs(); renderPowerPage(); return; }

  const schedule  = getTodaySchedule(queue.id);
  const curH      = new Date().getHours();
  const curStatus = schedule ? schedule[curH] : null;

  // Наступна зміна статусу
  let nextH = null;
  if (schedule) {
    for (let h = curH + 1; h < 24; h++) {
      if (schedule[h] !== curStatus) { nextH = h; break; }
    }
  }

  const statusText = curStatus === 1 ? '🟢 Зараз є світло'
                   : curStatus === 0 ? '🔴 Зараз немає світла'
                   :                  '🟡 Можливі перебої';
  const statusCls  = curStatus === 1 ? 'pw-status--on'
                   : curStatus === 0 ? 'pw-status--off'
                   :                  'pw-status--maybe';
  const nextTxt    = nextH !== null ? ` · до ${pad(nextH)}:00` : '';

  // Підпис вверху: «Дерно» або «Олика · вул. Замкова»
  const locationLabel = selCity.streets.length === 1
    ? escapeHtml(selCity.name)
    : `${escapeHtml(selCity.name)} · ${escapeHtml(selStreet.name)}`;

  container.innerHTML = `
    ${offlineBanner}

    <div class="pw-top-bar">
      <button class="pw-street-btn-top" id="pw-change-location">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-loc"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        <span>${locationLabel}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-chev"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      <span class="pw-queue-badge">${escapeHtml(queue.name)}</span>
    </div>

    <div class="pw-status-card ${statusCls}">
      <div class="pw-status-main">${statusText}${nextTxt}</div>
      <div class="pw-status-upd">Дані актуальні на ${updStr}</div>
    </div>

    ${renderTimeline(queue)}

    <div class="pw-actions">
      <button class="pw-ics-btn" id="pw-ics-btn">📅 Додати відключення в календар</button>
    </div>

    <div class="pw-footer-note">
      Джерело: ${escapeHtml(powerData._meta.source)}<br>
      <span class="pw-demo-note">⚠️ DEMO-дані — оновіть у data/power.json</span>
    </div>
  `;

  document.getElementById('pw-change-location')?.addEventListener('click', () => {
    selCity   = null;
    selStreet = null;
    savePrefs();
    renderPowerPage();
  });

  document.getElementById('pw-ics-btn')?.addEventListener('click', () => {
    generateICS(selStreet, queue);
  });

  // Прокрутити до рядка «ЗАРАЗ»
  setTimeout(() => {
    document.getElementById('pw-now-marker')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 120);
}

// ── Ініціалізація ─────────────────────────────────────────────────────────────

export function initPower() {
  fetch('./data/power.json')
    .then(r => r.json())
    .then(data => {
      powerData = data;
      const prefs = loadPrefs();
      if (prefs.cityId) {
        selCity = findCity(prefs.cityId);
        if (selCity && prefs.streetId) {
          selStreet = findStreetInCity(selCity, prefs.streetId);
        }
      }
      renderPowerPage();
    })
    .catch(() => {
      const el = document.getElementById('power-content');
      if (el) el.innerHTML = '<p class="pw-empty">Не вдалось завантажити дані ⚡</p>';
    });

  window.addEventListener('online',  () => { if (powerData) renderPowerPage(); });
  window.addEventListener('offline', () => { if (powerData) renderPowerPage(); });
}
