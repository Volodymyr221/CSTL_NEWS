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

import { escapeHtml, pad, todayKey } from '../core/utils.js';

let powerData  = null;
let selCity    = null; // { id, name, streets[] }
let selStreet  = null; // { id, name, queue_id }
const PREFS_KEY = 'power_prefs_v2';

// ── Хелпери (допоміжні функції) ──────────────────────────────────────────────
// pad() і todayKey() — спільні утиліти, винесено у utils.js (12.05).

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
        `DESCRIPTION:${escapeHtml(queue.name)} · CSTL LIFE Олицька ОТГ\r\n` +
        `END:VEVENT`
      );
    } else {
      i++;
    }
  }

  const ics = [
    'BEGIN:VCALENDAR', 'VERSION:2.0',
    'PRODID:-//CSTL LIFE//Power Schedule//UK',
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

// ── Рендер v2: hero-таймер + горизонтальна стрічка + завтра (15.05) ──────────

// Знаходить початок поточного періоду (година з тим самим статусом, ззаду)
function findPeriodStart(schedule, fromH) {
  let h = fromH;
  while (h > 0 && schedule[h - 1] === schedule[fromH]) h--;
  return h;
}

// Знаходить наступну зміну статусу від поточної години
function findNextChange(schedule, fromH) {
  for (let h = fromH + 1; h < 24; h++) {
    if (schedule[h] !== schedule[fromH]) return h;
  }
  return null; // до кінця доби без змін
}

// SVG прогрес-кільце. progress: 0..1. color: CSS color.
function renderProgressRing(progress, color) {
  const r = 88;                       // радіус
  const c = 2 * Math.PI * r;          // довжина кола
  const offset = c * (1 - progress);
  return `
    <svg class="pw-ring" viewBox="0 0 200 200">
      <circle class="pw-ring-bg" cx="100" cy="100" r="${r}"></circle>
      <circle class="pw-ring-fg"
              cx="100" cy="100" r="${r}"
              stroke="${color}"
              stroke-dasharray="${c.toFixed(2)}"
              stroke-dashoffset="${offset.toFixed(2)}"></circle>
    </svg>
  `;
}

// Hero-блок: велике коло з прогресом + текст всередині
function renderHeroTimer(schedule) {
  if (!schedule) return '<p class="pw-empty">Дані на сьогодні відсутні</p>';

  const now   = new Date();
  const curH  = now.getHours();
  const curM  = now.getMinutes();
  const cur   = schedule[curH];                  // 0 нема / 1 є / 2 maybe

  const nextH = findNextChange(schedule, curH);
  const periodStart = findPeriodStart(schedule, curH);

  // Скільки хвилин до зміни (або до кінця доби)
  const minToChange = nextH !== null
    ? (nextH - curH) * 60 - curM
    : (24 - curH) * 60 - curM;

  // Скільки хвилин уже триває поточний період
  const minSinceStart = (curH - periodStart) * 60 + curM;
  const totalMin = minSinceStart + minToChange;
  const progress = totalMin > 0 ? minSinceStart / totalMin : 0;

  // Текст всередині кільця
  const h = Math.floor(minToChange / 60);
  const m = minToChange % 60;
  const timeLeft = h > 0 ? `${h} год ${m} хв` : `${m} хв`;

  let actionLabel, statusEmoji, ringColor;
  if (cur === 1) {
    actionLabel = nextH !== null ? 'До відключення' : 'Без змін до кінця доби';
    statusEmoji = '🟢';
    ringColor = '#4F8B3D'; // зелений
  } else if (cur === 0) {
    actionLabel = nextH !== null ? 'До світла' : 'Без змін до кінця доби';
    statusEmoji = '🔴';
    ringColor = '#722F37'; // червоний
  } else {
    actionLabel = nextH !== null ? 'До зміни' : 'Можливі перебої';
    statusEmoji = '🟡';
    ringColor = '#D97706'; // жовтий
  }

  const statusText = cur === 1 ? 'Є світло' : cur === 0 ? 'Немає світла' : 'Можливі перебої';
  const nextLabel  = nextH !== null ? `до ${pad(nextH)}:00` : '';

  // Знайти ТРИВАЛІСТЬ наступного періоду (для рядка «потім X год Y»)
  let nextPeriodHtml = '';
  if (nextH !== null) {
    const nextStatus = schedule[nextH];
    let afterNextH = nextH;
    while (afterNextH < 24 && schedule[afterNextH] === nextStatus) afterNextH++;
    const nextDuration = afterNextH - nextH;
    const nextWord = nextStatus === 1 ? 'світла' : nextStatus === 0 ? 'без світла' : 'можливих перебоїв';
    nextPeriodHtml = `<div class="pw-hero-next">потім ${nextDuration} год ${nextWord}</div>`;
  }

  return `
    <div class="pw-hero pw-hero--${cur === 1 ? 'on' : cur === 0 ? 'off' : 'maybe'}">
      <div class="pw-hero-ring-wrap">
        ${renderProgressRing(progress, ringColor)}
        <div class="pw-hero-center">
          <div class="pw-hero-status">${statusEmoji} ${statusText}</div>
          <div class="pw-hero-time">${nextH !== null ? timeLeft : '—'}</div>
          <div class="pw-hero-label">${actionLabel}${nextH !== null ? ` ${nextLabel}` : ''}</div>
          ${nextPeriodHtml}
        </div>
      </div>
    </div>
  `;
}

// Горизонтальна стрічка 24 сегменти
function renderHorizontalTimeline(schedule) {
  if (!schedule) return '';
  const now  = new Date();
  const curH = now.getHours();
  const curM = now.getMinutes();
  const markerPos = ((curH + curM / 60) / 24) * 100;

  const segments = schedule.map((status, h) => {
    const cls = status === 1 ? 'on' : status === 0 ? 'off' : 'maybe';
    const isCurrent = h === curH;
    const label = status === 1 ? 'є' : status === 0 ? 'немає' : '?';
    return `<div class="pw-seg pw-seg--${cls}${isCurrent ? ' pw-seg--current' : ''}"
                title="${pad(h)}:00 — ${label}"></div>`;
  }).join('');

  // Годинна вісь — 24 колонки рівно як stripe. Лейбли тільки на парних годинах
  // (00, 02, 04, ..., 22), пусті span'и між ними щоб усе вирівнялось.
  const axisHtml = Array.from({length: 24}, (_, i) =>
    i % 2 === 0 ? `<span>${pad(i)}</span>` : `<span></span>`
  ).join('');

  return `
    <div class="pw-timeline-card">
      <div class="pw-timeline-title">Сьогодні · 24 години</div>
      <div class="pw-timeline-strip">
        ${segments}
        <div class="pw-timeline-marker" style="left: ${markerPos.toFixed(2)}%">
          <div class="pw-timeline-marker-dot"></div>
          <div class="pw-timeline-marker-label">${pad(curH)}:${pad(curM)}</div>
        </div>
      </div>
      <div class="pw-timeline-axis">${axisHtml}</div>
      <div class="pw-timeline-legend">
        <span><i class="pw-leg pw-leg--on"></i> є світло</span>
        <span><i class="pw-leg pw-leg--off"></i> немає</span>
        <span><i class="pw-leg pw-leg--maybe"></i> можливо</span>
      </div>
    </div>
  `;
}

// Картка прогнозу на завтра — рахуємо години без світла з графіка
function renderTomorrowCard(queue) {
  // Завтрашній key
  const d = new Date(); d.setDate(d.getDate() + 1);
  const tomorrowKey = `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const tomorrowSched = queue.schedule[tomorrowKey];
  if (!tomorrowSched) return '';

  const hoursOff = tomorrowSched.filter(s => s === 0).length;
  if (hoursOff === 0) {
    return `<div class="pw-tomorrow pw-tomorrow--good">✨ Завтра — світло цілий день</div>`;
  }

  // Найдовший період off-status
  let maxLen = 0, maxStart = -1, curLen = 0, curStart = -1;
  for (let h = 0; h < 24; h++) {
    if (tomorrowSched[h] === 0) {
      if (curStart === -1) curStart = h;
      curLen++;
      if (curLen > maxLen) { maxLen = curLen; maxStart = curStart; }
    } else {
      curLen = 0; curStart = -1;
    }
  }
  const periodTxt = maxLen > 0
    ? `Найдовший період: ${pad(maxStart)}:00–${pad(maxStart + maxLen)}:00`
    : '';

  return `
    <div class="pw-tomorrow">
      <div class="pw-tomorrow-title">⚠️ Завтра: ${hoursOff} годин без світла</div>
      <div class="pw-tomorrow-sub">${periodTxt}</div>
    </div>
  `;
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

  // Крок 3: все вибрано — hero-таймер + горизонтальна стрічка + завтра
  const queue = findQueue(selStreet.queue_id);
  if (!queue) { selStreet = null; savePrefs(); renderPowerPage(); return; }

  const schedule = getTodaySchedule(queue.id);

  // Дві окремі pills: 🏘 село + 🛣 вулиця. Якщо у селі одна вулиця — друга ховається.
  const hasStreets = selCity.streets.length > 1;
  const streetPillHtml = hasStreets ? `
    <button class="pw-street-btn-top pw-street-btn--secondary" id="pw-change-street" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-loc"><path d="M3 12h18M3 6h18M3 18h18"/></svg>
      <span>${escapeHtml(selStreet.name)}</span>
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-chev"><path d="M6 9l6 6 6-6"/></svg>
    </button>
  ` : '';

  container.innerHTML = `
    ${offlineBanner}

    <div class="pw-top-bar">
      <button class="pw-street-btn-top" id="pw-change-location" type="button">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-loc"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/></svg>
        <span>${escapeHtml(selCity.name)}</span>
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-icon-chev"><path d="M6 9l6 6 6-6"/></svg>
      </button>
      ${streetPillHtml}
      <span class="pw-queue-badge">${escapeHtml(queue.name)}</span>
    </div>

    <button class="pw-help-link" id="pw-help-link" type="button">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="pw-help-icon">
        <circle cx="12" cy="12" r="10"/>
        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
        <line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
      Не знаєте свою чергу?
    </button>

    ${renderHeroTimer(schedule)}

    ${renderHorizontalTimeline(schedule)}

    ${renderTomorrowCard(queue)}

    <div class="pw-actions">
      <button class="pw-ics-btn" id="pw-ics-btn">📅 Додати відключення в календар</button>
    </div>

    <div class="pw-footer-note">
      Джерело: ${escapeHtml(powerData._meta.source)} · оновлено о ${updStr}<br>
      <span class="pw-demo-note">⚠️ DEMO-дані — буде Supabase у Фазі 3</span>
    </div>
  `;

  document.getElementById('pw-change-location')?.addEventListener('click', () => {
    selCity   = null;
    selStreet = null;
    savePrefs();
    renderPowerPage();
  });

  // Друга pill — змінити тільки вулицю (село лишити)
  document.getElementById('pw-change-street')?.addEventListener('click', () => {
    selStreet = null;
    savePrefs();
    renderPowerPage();
  });

  // Help-кнопка «Як дізнатись свою чергу»
  document.getElementById('pw-help-link')?.addEventListener('click', openQueueHelpModal);

  document.getElementById('pw-ics-btn')?.addEventListener('click', () => {
    generateICS(selStreet, queue);
  });
}

// ── Ініціалізація ─────────────────────────────────────────────────────────────

// ── Модалка «Як дізнатись свою чергу» ────────────────────────────────────────
// Bottom-sheet з поясненням: чому не можемо автоматично визначити чергу
// (Волиньобленерго не дає публічного API) + 3 способи дізнатись.

function openQueueHelpModal() {
  if (document.getElementById('pw-help-modal')) return;

  const wrap = document.createElement('div');
  wrap.id = 'pw-help-modal';
  wrap.className = 'pw-help-modal';
  wrap.innerHTML = `
    <div class="pw-help-backdrop"></div>
    <div class="pw-help-panel" role="dialog" aria-modal="true">
      <div class="pw-help-handle"></div>
      <button class="pw-help-close" type="button" aria-label="Закрити">✕</button>
      <h3 class="pw-help-title">Як дізнатись свою чергу?</h3>
      <p class="pw-help-sub">
        Чергу призначає <b>Волиньобленерго</b> за фізичним підключенням вашого
        будинку до підстанції. На жаль, ВОЕ не дає публічного API — ми не
        можемо визначити її автоматично.
      </p>
      <div class="pw-help-options">
        <div class="pw-help-opt">
          <span class="pw-help-emoji">📄</span>
          <div>
            <div class="pw-help-opt-title">Подивіться на платіжку</div>
            <div class="pw-help-opt-sub">У квитанції за світло вказано «Черга №».</div>
          </div>
        </div>
        <div class="pw-help-opt">
          <span class="pw-help-emoji">🌐</span>
          <div>
            <div class="pw-help-opt-title">Особистий кабінет ВОЕ</div>
            <div class="pw-help-opt-sub">Зайдіть на сайт і подивіться у профілі.</div>
            <a class="pw-help-btn" href="https://ok.prosvitlo.com/home/login" target="_blank" rel="noopener">
              Відкрити кабінет →
            </a>
          </div>
        </div>
        <div class="pw-help-opt">
          <span class="pw-help-emoji">📞</span>
          <div>
            <div class="pw-help-opt-title">Зателефонуйте у ВОЕ</div>
            <div class="pw-help-opt-sub">Цілодобова аварійна.</div>
            <a class="pw-help-btn" href="tel:0800501482">
              0 800 501 482
            </a>
          </div>
        </div>
      </div>
      <p class="pw-help-footnote">
        💡 Скоро у Фазі 3 додамо краудсорсинг — жителі позначатимуть свою чергу,
        і додаток автоматично запам'ятає вулицю → чергу.
      </p>
    </div>
  `;
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  requestAnimationFrame(() => wrap.classList.add('open'));

  function close() {
    wrap.classList.remove('open');
    document.body.classList.remove('modal-open');
    setTimeout(() => wrap.remove(), 220);
  }

  wrap.querySelector('.pw-help-backdrop')?.addEventListener('click', close);
  wrap.querySelector('.pw-help-close')?.addEventListener('click', close);
  document.addEventListener('keydown', function onEsc(e) {
    if (e.key === 'Escape') { close(); document.removeEventListener('keydown', onEsc); }
  });
}

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
