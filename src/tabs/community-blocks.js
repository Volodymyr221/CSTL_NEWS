// src/tabs/community-blocks.js
// Всі render-блоки головної вкладки «Громада» (винесено з community.js 13.05).
// Експортовані: renderWeatherBlock, renderPowerBlock, renderBusBlock,
//               renderBoardBlock, renderEventBlock, renderContactsBlock.
//
// Кожен блок завантажує свої дані самостійно через fetch.
// Помилка одного блоку не ламає інші.

import { escapeHtml, formatTime, getCoords, getCityName, pad, todayKey, attachSwipe } from '../core/utils.js';
import { fetchPublishedPosts, fetchPublishedAnnouncements, isSupabaseReady } from '../core/supabase.js';
import { setBoardActiveType } from './board.js';

// Типи у міні-блоці Дошки — свайп циклічно
const BOARD_MINI_TYPES = [
  { id: 'official', label: 'Офіційні', emoji: '🏛️' },
  { id: 'board',    label: 'Дошка',    emoji: '🛒' },
  { id: 'chat',     label: 'Розмови',  emoji: '💬' },
  { id: 'greeting', label: 'Вітання',  emoji: '🎉' },
];
let _boardMiniTypeIdx = 0;   // індекс активного типу
let _boardMiniData    = { userPosts: [], official: [] };   // кеш даних щоб не запитувати при свайпі
let _boardMiniDir     = 1;   // 1 = свайп вліво (наступний), -1 = свайп вправо (попередній)

const POWER_PREFS_KEY = 'power_prefs_v2';
const BUS_PREFS_KEY   = 'bus_prefs_v2';

// ── Спільні утиліти ──────────────────────────────────────────────────────────

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

function loadPowerPrefs() {
  try { return JSON.parse(localStorage.getItem(POWER_PREFS_KEY) || '{}'); }
  catch { return {}; }
}

function loadBusPrefs() {
  try { return JSON.parse(localStorage.getItem(BUS_PREFS_KEY) || '{}'); }
  catch { return {}; }
}

// ── Блок 1: Погода (розширена) ───────────────────────────────────────────────

const WEEKDAYS_UA = ['Нд', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

function setWeatherTitle(cityName) {
  const headerEl = document.querySelector('.cm-block--weather .cm-block-title');
  if (headerEl && cityName) headerEl.textContent = `Погода в ${cityName}`;
}

export async function renderWeatherBlock() {
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

// ── Блок 2: Світло зараз ─────────────────────────────────────────────────────

export async function renderPowerBlock() {
  const el = document.getElementById('cm-power-content');
  if (!el) return;

  const prefs = loadPowerPrefs();
  if (!prefs.cityId || !prefs.streetId) {
    el.innerHTML = `
      <div class="cm-block-empty">
        Налаштуйте вашу вулицю у вкладці «Світло»
        <button class="cm-block-cta" data-switch-tab="power">Перейти →</button>
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

// ── Блок 3: Наступний автобус ────────────────────────────────────────────────

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

export async function renderBusBlock() {
  const el = document.getElementById('cm-bus-content');
  if (!el) return;

  try {
    const res  = await fetch('./data/schedule.json');
    const data = await res.json();
    const prefs = loadBusPrefs();

    const now    = new Date();
    const nowMin = now.getHours() * 60 + now.getMinutes();

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
          <button class="cm-block-cta" data-switch-tab="buses">Розклад →</button>
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

    // Прогрес дня: від поточної хвилини до часу відправлення (1440 хв доба)
    const dayTotal = 24 * 60;
    const progress = Math.max(0, Math.min(100, (nowMin / dayTotal) * 100));

    // Метадані: тривалість + ціна + водій (як у вкладці Автобусів)
    const durationMin = toMin - fromMin;
    const durationStr = durationMin < 60
      ? `${durationMin} хв`
      : (() => {
          const h = Math.floor(durationMin / 60), m = durationMin % 60;
          return m ? `${h} год ${m} хв` : `${h} год`;
        })();
    const priceStr = next.price ? `${next.price} грн` : '';
    const driverStr = next.driver || '';
    const metaParts = [priceStr, durationStr, driverStr].filter(Boolean);
    const metaHtml = metaParts.map((p, i) => i === 0
      ? `<span>${escapeHtml(p)}</span>`
      : `<span class="bus-hero-meta-sep">·</span><span>${escapeHtml(p)}</span>`
    ).join('');

    // Hero-блок як на вкладці Автобусів (темний табло-стиль).
    // Тапаєш — переходить на повну вкладку.
    el.innerHTML = `
      <div class="bus-hero${urgent ? ' bus-hero--urgent' : ''}" data-switch-tab="buses">
        <div class="bus-hero-top">
          ${urgent
            ? `<span class="bus-hero-urgent">через ${minsLeft} хв</span>`
            : `<span class="bus-hero-countdown">${escapeHtml(countdown)}</span>`}
        </div>
        <div class="bus-hero-row">
          <div class="bus-hero-times">
            <span class="bus-hero-time">${escapeHtml(fromHHMM)}</span>
            <span class="bus-hero-arrow">→</span>
            <span class="bus-hero-time bus-hero-time--to">${escapeHtml(toHHMM)}</span>
          </div>
        </div>
        <div class="bus-hero-route">${escapeHtml(fromName)} → ${escapeHtml(toName)}</div>
        <div class="bus-hero-meta">${metaHtml}</div>
        <div class="bus-hero-progress">
          <div class="bus-hero-progress-fill" style="width:${progress}%"></div>
        </div>
      </div>
    `;
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Розклад тимчасово недоступний</div>';
  }
}

// ── Блок 4: Дошка громади (мешканці + офіційні в одному блоці) ───────────────

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

// Міні-блок Дошки — свайпом перемикається тип: Офіційні → Дошка → Розмови → Вітання.
// Повна Дошка відкривається тапом на CTA внизу.
export async function renderBoardBlock() {
  const el = document.getElementById('cm-board-content');
  if (!el) return;

  try {
    // 1. Завантажуємо дані — Supabase спочатку, JSON якщо не вийшло
    let userPosts = [], official = [], usedSupabase = false;

    if (isSupabaseReady()) {
      const [posts, anns] = await Promise.all([
        fetchPublishedPosts(),
        fetchPublishedAnnouncements(),
      ]);
      if (posts !== null) {
        userPosts = posts.slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
        official  = (anns || []).slice().sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return (b.ts || 0) - (a.ts || 0);
        });
        usedSupabase = true;
      }
    }

    if (!usedSupabase) {
      const [boardRes, communityRes] = await Promise.all([
        fetch('./data/community-board.json'),
        fetch('./data/community.json'),
      ]);
      const boardData     = await boardRes.json();
      const communityData = await communityRes.json();
      userPosts = (boardData.posts || []).slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
      official  = (communityData.announcements || []).slice().sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return (b.ts || 0) - (a.ts || 0);
      });
    }

    _boardMiniData = { userPosts, official };
    renderBoardMiniSlide(el);
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Дошка тимчасово недоступна</div>';
  }
}

// Рендеримо ОДИН слайд міні-блоку (для активного типу). Свайп змінює _boardMiniTypeIdx.
function renderBoardMiniSlide(el) {
  const cfg     = BOARD_MINI_TYPES[_boardMiniTypeIdx];
  const { userPosts, official } = _boardMiniData;

  // Беремо до 2 пости активного типу
  let items = [];
  if (cfg.id === 'official') {
    items = official.slice(0, 2).map(a => ({ kind: 'official', title: a.title, text: a.body, ts: a.ts, id: a.id }));
  } else {
    items = userPosts
      .filter(p => (p.type || 'board') === cfg.id)
      .slice(0, 2)
      .map(p => ({
        kind: cfg.id, id: p.id, ts: p.ts || (p.created_at && new Date(p.created_at).getTime()),
        category: p.category, text: p.text, title: p.title, color: p.color, photo: p.photo,
        cover_emoji: p.cover_emoji, cover_gradient: p.cover_gradient, author: p.author,
      }));
  }

  const dotsHtml = BOARD_MINI_TYPES.map((t, i) =>
    `<span class="cm-board-mini-dot${i === _boardMiniTypeIdx ? ' active' : ''}" data-mini-idx="${i}"></span>`
  ).join('');

  const labelHtml = `
    <div class="cm-board-mini-label">
      <span class="cm-board-mini-emoji">${cfg.emoji}</span>
      <span class="cm-board-mini-name">${escapeHtml(cfg.label)}</span>
      <span class="cm-board-mini-dots">${dotsHtml}</span>
    </div>
  `;

  const emptyHtml = `<div class="cm-board-mini-empty">У «${escapeHtml(cfg.label)}» поки порожньо</div>`;

  const cardsHtml = items.length ? items.map(item => renderMiniCard(item, cfg.id)).join('') : emptyHtml;

  // BOARD — корок зі стікерами (з нахилами і шпильками)
  // CHAT/GREETING/OFFICIAL — простіший лейаут без корки
  const isCorkType = cfg.id === 'board' || cfg.id === 'official';
  const innerHtml = isCorkType
    ? `<div class="cm-board-corkboard cm-board-corkboard--mini">${cardsHtml}</div>`
    : `<div class="cm-board-mini-stream">${cardsHtml}</div>`;

  // Напрям анімації залежить від свайпу: вліво (наступний) = новий слайд
  // приходить справа, вправо (попередній) = слайд приходить зліва
  const slideClass = _boardMiniDir < 0 ? ' bd-mini-slide-back' : '';

  el.innerHTML = `
    <div class="cm-board-preview cm-board-preview--swipe" id="cm-board-preview">
      ${labelHtml}
      <div class="cm-board-mini-content${slideClass}">${innerHtml}</div>
      <button class="cm-board-preview-cta" type="button" data-mini-cta>
        Перейти на ${escapeHtml(cfg.label.toLowerCase())} →
      </button>
    </div>
  `;

  // Свайп
  const wrap = document.getElementById('cm-board-preview');
  if (wrap) {
    attachSwipe(wrap,
      () => { _boardMiniDir = 1;  _boardMiniTypeIdx = (_boardMiniTypeIdx + 1) % BOARD_MINI_TYPES.length; renderBoardMiniSlide(el); },
      () => { _boardMiniDir = -1; _boardMiniTypeIdx = (_boardMiniTypeIdx - 1 + BOARD_MINI_TYPES.length) % BOARD_MINI_TYPES.length; renderBoardMiniSlide(el); }
    );
    // Клік на dot — перехід на відповідний тип з напрямком
    wrap.querySelectorAll('.cm-board-mini-dot').forEach(dot => {
      dot.addEventListener('click', e => {
        e.stopPropagation();
        const newIdx = parseInt(dot.dataset.miniIdx, 10) || 0;
        _boardMiniDir = newIdx > _boardMiniTypeIdx ? 1 : -1;
        _boardMiniTypeIdx = newIdx;
        renderBoardMiniSlide(el);
      });
    });
    // CTA «Перейти на …» — перемикає на вкладку Дошка з активним типом
    // що зараз вибраний у міні-блоці (official → 'all', решта → той самий ID).
    const cta = wrap.querySelector('[data-mini-cta]');
    if (cta) {
      cta.addEventListener('click', e => {
        e.stopPropagation();
        const targetType = cfg.id === 'official' ? 'all' : cfg.id;
        setBoardActiveType(targetType);
        if (typeof window.switchTab === 'function') window.switchTab('board');
      });
    }
  }
}

// Рендер однієї карточки в міні-блоці. Стиль залежить від типу.
function renderMiniCard(item, type) {
  const tilt = ((item.id * 7) % 9) - 4;

  if (type === 'official') {
    return `
      <article class="cm-board-note cm-board-note--official cm-board-mini" style="--tilt:${tilt}deg">
        <span class="cm-board-pin cm-board-pin--gold"></span>
        <span class="cm-board-cat cm-board-cat--official">🏛️ ОФІЦІЙНО</span>
        <p class="cm-board-text">${escapeHtml(item.title)}</p>
      </article>
    `;
  }

  if (type === 'board') {
    const emoji = CATEGORY_EMOJI[item.category] || '📌';
    const photoHtml = item.photo
      ? `<div class="cm-board-photo-wrap"><img class="cm-board-photo" src="${escapeHtml(item.photo)}" alt="" loading="lazy" onerror="this.parentNode.style.display='none'"></div>`
      : '';
    return `
      <article class="cm-board-note cm-board-note--${escapeHtml(item.color || 'yellow')} cm-board-mini${item.photo ? ' cm-board-note--has-photo' : ''}" style="--tilt:${tilt}deg">
        <span class="cm-board-pin"></span>
        ${photoHtml}
        <span class="cm-board-cat">${emoji} ${escapeHtml(item.category || '')}</span>
        <p class="cm-board-text">${escapeHtml(item.text)}</p>
      </article>
    `;
  }

  if (type === 'chat') {
    const initial = item.author ? item.author.charAt(0).toUpperCase() : '👤';
    const hue = item.author ? (item.author.charCodeAt(0) * 47) % 360 : 0;
    const avatarStyle = item.author
      ? `background:hsl(${hue}deg 65% 78%);color:#fff;font-weight:600`
      : 'background:#f5f5f5;color:#666;font-size:18px';
    return `
      <article class="cm-mini-chat">
        <span class="cm-mini-chat-avatar" style="${avatarStyle}">${escapeHtml(initial)}</span>
        <div class="cm-mini-chat-body">
          <div class="cm-mini-chat-author">${escapeHtml(item.author || 'анонімно')}</div>
          <p class="cm-mini-chat-text">${escapeHtml(item.text)}</p>
        </div>
      </article>
    `;
  }

  if (type === 'greeting') {
    const grad  = item.cover_gradient || 'linear-gradient(135deg, #FFD1DC 0%, #FFB6C1 100%)';
    const emoji = item.cover_emoji || '🎉';
    return `
      <article class="cm-mini-greet">
        <div class="cm-mini-greet-cover" style="background:${escapeHtml(grad)}">
          <span class="cm-mini-greet-emoji">${emoji}</span>
        </div>
        <div class="cm-mini-greet-body">
          ${item.title ? `<div class="cm-mini-greet-to">Для ${escapeHtml(item.title)}</div>` : ''}
          <p class="cm-mini-greet-text">${escapeHtml(item.text)}</p>
        </div>
      </article>
    `;
  }

  return '';
}

// ── Блок 5: Найближча подія громади (фільтр по 17 селах ОТГ) ─────────────────

const OTG_VILLAGES = [
  'Олика', 'Горянівка', 'Дерно', 'Дідичі', 'Жорнище', 'Залісоче',
  'Котів', 'Личани', 'Метельне', 'Мощаниця', 'Носовичі', 'Одеради',
  'Покащів', 'Путилівка', 'Ставок', 'Хромяків', 'Чемерин',
];

function isLocalEvent(ev) {
  const loc = (ev.location || '').toLowerCase();
  return OTG_VILLAGES.some(v => loc.includes(v.toLowerCase()));
}

export async function renderEventBlock() {
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

    el.innerHTML = `
      <article class="cm-event-card" data-switch-tab="events">
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

// ── Блок 7: Контакти ─────────────────────────────────────────────────────────

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

const CONTACT_COLORS = {
  emergency: '#722F37',
  medical:   '#2E7D32',
  gov:       '#1565C0',
  utility:   '#B45309',
};

export async function renderContactsBlock() {
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

    // Розділяємо контакти по групах: hero (Швидка) / emergency (4 аварійні) / local (амбулаторія, сільрада)
    const hero      = list.find(c => c.group === 'hero' || c.priority === 'critical');
    const emergency = list.filter(c => c.group === 'emergency');
    const local     = list.filter(c => c.group === 'local');

    const telOf = p => p.replace(/[^\d+]/g, '');

    // ── HERO: Швидка 103 — велика пульсуюча картка ────────────────────────────
    const heroHtml = hero ? `
      <a class="cm-contact-hero" href="tel:${escapeHtml(telOf(hero.phone))}">
        <span class="cm-contact-hero-icon">${CONTACT_ICONS[hero.icon] || CONTACT_ICONS.default}</span>
        <span class="cm-contact-hero-text">
          <span class="cm-contact-hero-name">${escapeHtml(hero.name)}</span>
          <span class="cm-contact-hero-hint">Тап для виклику</span>
        </span>
        <span class="cm-contact-hero-phone">${escapeHtml(hero.phone)}</span>
      </a>
    ` : '';

    // ── EMERGENCY: 2×2 сітка компактних плиток ─────────────────────────────────
    const emergencyHtml = emergency.length ? `
      <div class="cm-contact-group cm-contact-group--emergency">
        <div class="cm-contact-group-title">Аварійні</div>
        <div class="cm-contact-grid-2x2">
          ${emergency.map(c => `
            <a class="cm-contact-tile" href="tel:${escapeHtml(telOf(c.phone))}">
              <span class="cm-contact-tile-icon">${CONTACT_ICONS[c.icon] || CONTACT_ICONS.default}</span>
              <span class="cm-contact-tile-name">${escapeHtml(c.name)}</span>
              <span class="cm-contact-tile-phone">${escapeHtml(c.phone)}</span>
            </a>
          `).join('')}
        </div>
      </div>
    ` : '';

    // ── LOCAL: список карток на всю ширину ─────────────────────────────────────
    const localHtml = local.length ? `
      <div class="cm-contact-group cm-contact-group--local">
        <div class="cm-contact-group-title">Місцеві</div>
        <div class="cm-contact-rows">
          ${local.map(c => `
            <a class="cm-contact-row" href="tel:${escapeHtml(telOf(c.phone))}">
              <span class="cm-contact-row-icon">${CONTACT_ICONS[c.icon] || CONTACT_ICONS.default}</span>
              <span class="cm-contact-row-text">
                <span class="cm-contact-row-name">${escapeHtml(c.name)}</span>
                <span class="cm-contact-row-phone">${escapeHtml(c.phone)}</span>
              </span>
            </a>
          `).join('')}
        </div>
      </div>
    ` : '';

    el.innerHTML = heroHtml + emergencyHtml + localHtml;
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Контакти недоступні</div>';
  }
}
