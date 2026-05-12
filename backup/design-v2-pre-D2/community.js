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

import { escapeHtml, formatTime, showToast, getCoords, getCityName } from '../core/utils.js';
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

// Дні тижня українською (Пн..Нд) для getDay() 0=Нд..6=Сб
const WEEKDAYS_UA = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

// Оновити заголовок блоку погоди на ім'я міста користувача
function setWeatherTitle(cityName) {
  const headerEl = document.querySelector('.cm-block--weather .cm-block-title');
  if (headerEl && cityName) headerEl.textContent = `Погода в ${cityName}`;
}

async function renderWeatherBlock() {
  const el = document.getElementById('cm-weather-content');
  if (!el) return;

  try {
    const { lat, lon, city: knownCity } = await getCoords();
    const [weatherRes, cityName] = await Promise.all([
      fetch(
        `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
        `&current=temperature_2m,weather_code,apparent_temperature` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
        `&forecast_days=7&timezone=auto`
      ),
      knownCity ? Promise.resolve(knownCity) : getCityName(lat, lon),
    ]);
    const data = await weatherRes.json();
    const cur  = data.current;
    const day  = data.daily;
    const info = weatherCodeInfo(cur.weather_code);
    const temp  = Math.round(cur.temperature_2m);
    const feels = Math.round(cur.apparent_temperature);

    setWeatherTitle(cityName);

    // Прогноз на 7 днів: день тижня + дата + іконка
    const forecastHtml = day.time.map((dateStr, i) => {
      const d = new Date(dateStr + 'T00:00:00');
      const wd = i === 0 ? 'Сьогодні' : WEEKDAYS_UA[d.getDay()];
      const dayInfo = weatherCodeInfo(day.weather_code[i]);
      return `
        <div class="cm-fc-day${i === 0 ? ' cm-fc-day--today' : ''}">
          <span class="cm-fc-wd">${escapeHtml(wd)}</span>
          <span class="cm-fc-date">${d.getDate()}</span>
          <span class="cm-fc-icon">${dayInfo.icon}</span>
        </div>
      `;
    }).join('');

    el.innerHTML = `
      <div class="cm-weather-main">
        <div class="cm-weather-icon">${info.icon}</div>
        <div class="cm-weather-temp">${temp}°</div>
        <div class="cm-weather-text">
          <div class="cm-weather-desc">${escapeHtml(info.text)}</div>
          <div class="cm-weather-feels">Відчувається як ${feels}°</div>
        </div>
      </div>
      <div class="cm-weather-forecast">${forecastHtml}</div>
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

// ── Блок 4: Дошка громади (мешканці + офіційні оголошення в одному блоці) ────
// 12.05: окремий блок "Оголошення громади" обʼєднано з дошкою. Офіційні
// оголошення рендеряться як cm-board-note--official на початку (бронзова
// рамка + золотиста шпилька + 🏛️), мешканські — стандартні різнокольорові.

const CATEGORY_EMOJI = {
  'продам':      '💰',
  'куплю':       '🛒',
  'шукаю':       '🔍',
  'знайдено':    '🎁',
  'загубилось':  '😟',
  'подяка':      '❤️',
  'послуга':     '🔧',
  'оголошення':  '📢',
};

async function renderBoardBlock() {
  const el = document.getElementById('cm-board-content');
  if (!el) return;

  try {
    // Тягнемо обидва джерела: офіційні оголошення від адміністрації + пости від мешканців
    const [boardRes, communityRes] = await Promise.all([
      fetch('./data/community-board.json'),
      fetch('./data/community.json'),
    ]);
    const boardData     = await boardRes.json();
    const communityData = await communityRes.json();

    const userPosts = (boardData.posts || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
    const official  = (communityData.announcements || []).slice().sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return (b.ts || 0) - (a.ts || 0);
    });

    if (!official.length && !userPosts.length) {
      el.innerHTML = '<div class="cm-block-empty">На дошці поки порожньо. Будь першим — напиши нижче.</div>';
      return;
    }

    // Офіційні папірці — повна ширина, зверху, золотиста шпилька, бронзова рамка
    const officialHtml = official.map((a, i) => {
      const tilt = ((a.id * 5) % 5) - 2; // тонкий нахил −2..+2
      return `
        <article class="cm-board-note cm-board-note--official" style="--tilt:${tilt}deg">
          <span class="cm-board-pin cm-board-pin--gold"></span>
          <span class="cm-board-cat cm-board-cat--official">🏛️ ОФІЦІЙНО</span>
          <h4 class="cm-board-official-title">${escapeHtml(a.title)}</h4>
          <p class="cm-board-text">${escapeHtml(a.body)}</p>
          <div class="cm-board-footer">
            <span class="cm-board-author">— ${escapeHtml(a.author || '—')}</span>
            <span class="cm-board-time">${formatTime(a.ts)}</span>
          </div>
        </article>
      `;
    }).join('');

    // Мешканські папірці — половина ширини, різнокольорові, з кутиком нахилу
    const userHtml = userPosts.map(p => {
      const tilt = ((p.id * 7) % 9) - 4;
      const emoji = CATEGORY_EMOJI[p.category] || '📌';
      const contactHtml = p.contact
        ? `<div class="cm-board-contact">${escapeHtml(p.contact)}</div>`
        : '';
      return `
        <article class="cm-board-note cm-board-note--${escapeHtml(p.color || 'yellow')}" style="--tilt:${tilt}deg">
          <span class="cm-board-pin"></span>
          <span class="cm-board-cat">${emoji} ${escapeHtml(p.category)}</span>
          <p class="cm-board-text">${escapeHtml(p.text)}</p>
          <div class="cm-board-footer">
            <span class="cm-board-author">— ${escapeHtml(p.author || 'анонімно')}</span>
            <span class="cm-board-time">${formatTime(p.ts)}</span>
          </div>
          ${contactHtml}
        </article>
      `;
    }).join('');

    el.innerHTML = `
      <div class="cm-board-corkboard">
        ${officialHtml}
        ${userHtml}
      </div>

      <form class="cm-board-form" id="cm-board-form">
        <h4 class="cm-board-form-title">✏️ Подати оголошення, подію або новину</h4>
        <textarea class="cm-board-input" id="cm-board-text" placeholder="Що хочете повідомити громаді? (продам, шукаю, подяка, подія…)" rows="3" required></textarea>
        <div class="cm-board-row">
          <input class="cm-board-input cm-board-input--small" id="cm-board-author" type="text" placeholder="Ім'я (або залишіть порожнім — анонімно)">
        </div>
        <div class="cm-board-row">
          <input class="cm-board-input cm-board-input--small" id="cm-board-contact" type="text" placeholder="Контакт: телефон / Telegram (необов'язково)">
        </div>
        <button class="cm-board-submit" type="submit">Надіслати →</button>
        <p class="cm-board-hint">Запит йде модератору. Після перевірки оголошення зʼявиться на дошці, у новинах або в подіях.</p>
      </form>
    `;

    document.getElementById('cm-board-form')?.addEventListener('submit', (e) => {
      e.preventDefault();
      const text = document.getElementById('cm-board-text')?.value.trim();
      if (!text) return;
      // Заглушка до підключення Supabase (Фаза 3): показуємо toast і логуємо.
      // TODO Supabase: POST у таблицю community_posts зі статусом 'pending'.
      console.log('[community-board] pending submission:', {
        text,
        author:  document.getElementById('cm-board-author')?.value.trim() || 'анонімно',
        contact: document.getElementById('cm-board-contact')?.value.trim() || null,
      });
      showToast('Дякуємо! Запит надіслано модератору. Поки що модерація ще не підключена — функція запрацює після Supabase.', 5000);
    });
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Дошка тимчасово недоступна</div>';
  }
}

// ── Блок 5: Найближча подія громади ───────────────────────────────────────────

// 17 населених пунктів Олицької ОТГ — для фільтра подій
const OTG_VILLAGES = [
  'Олика', 'Горянівка', 'Дерно', 'Дідичі', 'Жорнище', 'Залісоче',
  'Котів', 'Личани', 'Метельне', 'Мощаниця', 'Носовичі', 'Одеради',
  'Покащів', 'Путилівка', 'Ставок', 'Хромяків', 'Чемерин',
];

function isLocalEvent(ev) {
  const loc = (ev.location || '').toLowerCase();
  return OTG_VILLAGES.some(v => loc.includes(v.toLowerCase()));
}

async function renderEventBlock() {
  const el = document.getElementById('cm-event-content');
  if (!el) return;

  try {
    const res    = await fetch('./data/events.json');
    const events = await res.json();
    const today  = new Date(); today.setHours(0, 0, 0, 0);
    const next = events
      .filter(e => new Date(e.date + 'T00:00:00') >= today)
      .filter(isLocalEvent)
      .sort((a, b) => new Date(a.date) - new Date(b.date))[0];

    if (!next) {
      el.innerHTML = '<div class="cm-block-empty">Поки немає запланованих подій у громаді</div>';
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
    <section class="cm-hero">
      <img class="cm-hero-img" src="https://vidviday.ua/storage/media/place/5304/260244-6a454c65-caf-11264762-1467163756920578-759794530-n.jpg" alt="Олика" loading="eager">
      <div class="cm-hero-overlay">
        <h2 class="cm-hero-title">Олика</h2>
        <p class="cm-hero-sub">Все головне на одному екрані</p>
      </div>
    </section>

    <section class="cm-block cm-block--board">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Дошка громади</h3>
      </header>
      <div id="cm-board-content" class="cm-board-body cm-loading">Завантаження…</div>
    </section>

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

    <section class="cm-block cm-block--event">
      <header class="cm-block-header">
        <h3 class="cm-block-title">Найближча подія громади</h3>
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
  renderBoardBlock();
  renderEventBlock();
  renderContactsBlock();
}
