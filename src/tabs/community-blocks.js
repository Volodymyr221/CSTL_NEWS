// src/tabs/community-blocks.js
// Всі render-блоки головної вкладки «Громада» (винесено з community.js 13.05).
// Експортовані: renderWeatherBlock, renderPowerBlock, renderBusBlock,
//               renderBoardBlock, renderEventBlock, renderContactsBlock.
//
// Кожен блок завантажує свої дані самостійно через fetch.
// Помилка одного блоку не ламає інші.

import { escapeHtml, formatTime, getCoords, getCityName, pad, todayKey, attachSwipe } from '../core/utils.js';
import { fetchPublishedPosts, isSupabaseReady } from '../core/supabase.js';
import { openAdModalStandalone } from './board.js';
import { catColor, catIcon, catShort } from '../core/board-categories.js';
import { COMMUNITY_ALL, COMMUNITY_ALL_LABEL } from '../core/settlements.js';
import { weatherCodeInfo } from '../core/weather-icons.js';
import { ICONS } from '../core/icons.js';
import { openShotamModal } from './events.js';
import {
  nowMinutes,
  getStopMins as scheduleGetStopMins,
  minsToHHMM  as scheduleMinsToHHMM,
  getRouteState, getRouteTimings,
  formatCountdownUpper,
} from '../core/bus-schedule.js';
import { buildHeroCard, renderRouteMapV4, parseRouteEndpoints, openSavedRouteOnBuses } from './buses.js';
import { isLoggedIn, currentUserId, onAuthChange } from '../core/auth.js';
import { ensureNewsLoaded, newsCardsHtml, openArticle } from './news.js';
import { openModal } from '../core/modal.js';

let cmBusIndex = 0;
let cmBusEntries = []; // [{ route, dateISO }] — рейс + день (сьогодні або майбутній)

const CM_TRACK_KEY = 'bus_track_v2';
// Читає відстежувані рейси ПОТОЧНОГО акаунта (per-uid key). Гість → нічого
// персонального (показуємо лише загальний найближчий рейс — публічний розклад).
function loadCmTracked(todayISO) {
  if (!isLoggedIn()) return [];
  try {
    const d = JSON.parse(localStorage.getItem(CM_TRACK_KEY + ':' + currentUserId()));
    if (d?.routes?.length) return d.routes.filter(t => t.trackDate >= todayISO);
  } catch { /* пусто */ }
  return [];
}

// Вкладка Автобуси змінила відстеження → одразу перемальовуємо віджет Громади
// (якщо вкладка Громада зараз не в DOM — renderBusBlock тихо вийде на null).
window.addEventListener('cstl-bus-track-changed', () => { renderBusBlock(); });
// Вхід/вихід → теж оновити віджет (персональні відстеження з'являються/зникають).
onAuthChange(() => { renderBusBlock(); });

// Віджет Дошки (повна переробка 13.07, рішення Вови): стрічка ПАР карток з
// автопрокруткою. Слайд «Розмови» видалено — Обговорення мають власну вкладку.
let _bwTimer  = null;   // інтервал автопрокрутки пар
let _bwResume = null;   // таймаут відновлення автопрокрутки після дотику
const BW_STEP_MS   = 5000;  // період автозміни пари (мс)
const BW_RESUME_MS = 8000;  // пауза після дотику пальцем (мс)
const BW_MAX_CARDS = 16;    // максимум випадкових оголошень у стрічці (Вова 13.07)

// Карусель подій громади (Г-2/Б2): авто-ротація 3-5 карток; порожньо → найближчі свята (Г-16 fallback)
let _evItems = [];
let _evIdx   = 0;
let _evTimer = null;

const POWER_PREFS_KEY = 'power_prefs_v2';
const BUS_PREFS_KEY   = 'bus_prefs_v2';

// ── Спільні утиліти ──────────────────────────────────────────────────────────

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
const WEEKDAYS_UA_FULL = ['Неділя', 'Понеділок', 'Вівторок', 'Середа', 'Четвер', "П'ятниця", 'Субота'];

// Кеш останньої відповіді Open-Meteo — потрібен модалці «по годинах» (клік на день).
let _wxData = null;

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
        `&hourly=temperature_2m,precipitation_probability,weather_code` +
        `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
        `&forecast_days=7&timezone=auto`
      ),
      knownCity ? Promise.resolve(knownCity) : getCityName(lat, lon),
    ]);
    const data = await weatherRes.json();
    _wxData = { ...data, city: cityName }; // кеш для модалки по годинах
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
        <button type="button" class="cm-fc-day${i === 0 ? ' cm-fc-day--today' : ''}" data-wx-day="${i}">
          <span class="cm-fc-wd">${escapeHtml(wd)}</span>
          <span class="cm-fc-date">${d.getDate()}</span>
          <span class="cm-fc-icon">${dayInfo.icon}</span>
        </button>
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

    // Клік на день → модалка «по годинах» (температура + опади).
    el.querySelectorAll('[data-wx-day]').forEach(btn => {
      btn.addEventListener('click', () => openWeatherDayModal(+btn.dataset.wxDay));
    });
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Погода тимчасово недоступна</div>';
  }
}

// ── Модалка «Погода по годинах» ──────────────────────────────────────────────
// Два графіки (iOS-стиль): температура за годинами + ймовірність опадів за годинами.
// Дані беремо з кешу _wxData (hourly), зрізаємо 24 години обраного дня.

// Спільна геометрія графіків (лінія/бари/скрабер). padR більший — місце під праву шкалу °.
const WX = { W: 320, H: 96, padL: 8, padR: 26, padTop: 16, padB: 18 };

function wxGeom(points) {
  const vals = points.map(p => p.v);
  let min = Math.min(...vals), max = Math.max(...vals);
  if (min === max) { min -= 1; max += 1; }
  const innerW = WX.W - WX.padL - WX.padR;
  const innerH = WX.H - WX.padTop - WX.padB;
  return {
    min, max, innerW, innerH,
    x: i => WX.padL + (innerW * i) / (points.length - 1),
    y: v => WX.padTop + innerH - ((v - min) / (max - min)) * innerH,
  };
}

// Лінія температури + ПРАВА шкала ° (Y-тіки min/середина/max) + підписи годин кожні 2 год.
function wxLineChart(points, { unit = '°', color = '#FFFFFF' } = {}) {
  const g = wxGeom(points);
  const line = points.map((p, i) => `${i === 0 ? 'M' : 'L'}${g.x(i).toFixed(1)},${g.y(p.v).toFixed(1)}`).join(' ');
  const area = `${line} L${g.x(points.length - 1).toFixed(1)},${(WX.padTop + g.innerH).toFixed(1)} L${g.x(0).toFixed(1)},${(WX.padTop + g.innerH).toFixed(1)} Z`;
  const xLabels = points.map((p, i) => i % 2 === 0
    ? `<text x="${g.x(i).toFixed(1)}" y="${WX.H - 4}" class="wx-axis" text-anchor="middle">${p.h}</text>` : '').join('');
  const yAxis = [g.min, (g.min + g.max) / 2, g.max].map(v => {
    const yy = g.y(v);
    return `<line x1="${WX.padL}" y1="${yy.toFixed(1)}" x2="${(WX.W - WX.padR).toFixed(1)}" y2="${yy.toFixed(1)}" class="wx-grid"/>`
         + `<text x="${(WX.W - WX.padR + 3).toFixed(1)}" y="${(yy + 3).toFixed(1)}" class="wx-axis" text-anchor="start">${Math.round(v)}${unit}</text>`;
  }).join('');
  return `
    <svg class="wx-chart" viewBox="0 0 ${WX.W} ${WX.H}" role="img" preserveAspectRatio="none">
      <defs><linearGradient id="wxfill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="${color}" stop-opacity="0.35"/>
        <stop offset="1" stop-color="${color}" stop-opacity="0"/>
      </linearGradient></defs>
      ${yAxis}
      <path d="${area}" fill="url(#wxfill)"/>
      <path d="${line}" fill="none" stroke="${color}" stroke-width="2.4" stroke-linejoin="round" stroke-linecap="round"/>
      ${xLabels}
    </svg>`;
}

// Стовпчиковий графік ймовірності опадів (0..100 %). Сині бари, підписи кожні 2 год.
function wxBarChart(points) {
  const innerW = WX.W - WX.padL - WX.padR;
  const innerH = WX.H - WX.padTop - WX.padB;
  const bw = (innerW / points.length) * 0.6;
  const bars = points.map((p, i) => {
    const cx = WX.padL + (innerW * (i + 0.5)) / points.length;
    const h = Math.max(1, (Math.min(100, p.v) / 100) * innerH);
    const yTop = WX.padTop + innerH - h;
    const label = i % 2 === 0
      ? `<text x="${cx.toFixed(1)}" y="${WX.H - 4}" class="wx-axis" text-anchor="middle">${p.h}</text>` : '';
    const pct = p.v >= 20 && (i % 2 === 0)
      ? `<text x="${cx.toFixed(1)}" y="${(yTop - 4).toFixed(1)}" class="wx-val" text-anchor="middle">${Math.round(p.v)}%</text>` : '';
    return `<rect x="${(cx - bw / 2).toFixed(1)}" y="${yTop.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}" rx="2" fill="url(#wxbar)" fill-opacity="${(0.5 + 0.5 * Math.min(100, p.v) / 100).toFixed(2)}"/>${pct}${label}`;
  }).join('');
  // Права шкала % (0 / 50 / 100) — тонкі лінії сітки, як у графіка температури.
  const yAxis = [0, 50, 100].map(v => {
    const yy = WX.padTop + innerH - (v / 100) * innerH;
    return `<line x1="${WX.padL}" y1="${yy.toFixed(1)}" x2="${(WX.W - WX.padR).toFixed(1)}" y2="${yy.toFixed(1)}" class="wx-grid"/>`
         + `<text x="${(WX.W - WX.padR + 3).toFixed(1)}" y="${(yy + 3).toFixed(1)}" class="wx-axis" text-anchor="start">${v}</text>`;
  }).join('');
  return `<svg class="wx-chart" viewBox="0 0 ${WX.W} ${WX.H}" role="img" preserveAspectRatio="none">
      <defs><linearGradient id="wxbar" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" stop-color="#4DA3FF"/><stop offset="1" stop-color="#2F80FF"/>
      </linearGradient></defs>
      ${yAxis}${bars}
    </svg>`;
}

export function openWeatherDayModal(dayIndex) {
  if (!_wxData || !_wxData.hourly) return;
  const daily = _wxData.daily;
  const hourly = _wxData.hourly;
  const dateStr = daily.time[dayIndex];
  if (!dateStr) return;

  // Зрізаємо 24 години обраного дня (hourly.time відсортовані, timezone=auto, старт 00:00).
  const idxs = [];
  hourly.time.forEach((t, i) => { if (t.startsWith(dateStr)) idxs.push(i); });
  if (!idxs.length) return;

  const tempPts = idxs.map(i => ({ h: +hourly.time[i].slice(11, 13), v: hourly.temperature_2m[i] }));
  const precipPts = idxs.map(i => ({ h: +hourly.time[i].slice(11, 13), v: hourly.precipitation_probability?.[i] ?? 0 }));
  // Іконка погоди на кожну годину (для скрабера — тягнеш палець, бачиш що о цій годині).
  const iconPts = idxs.map(i => weatherCodeInfo(hourly.weather_code?.[i] ?? 0).icon);

  const d = new Date(dateStr + 'T00:00:00');
  const dayName = dayIndex === 0 ? 'Сьогодні' : WEEKDAYS_UA_FULL[d.getDay()];
  const dateLabel = `${d.getDate()}.${pad(d.getMonth() + 1)}`;
  const info = weatherCodeInfo(daily.weather_code[dayIndex]);
  const tMax = Math.round(daily.temperature_2m_max[dayIndex]);
  const tMin = Math.round(daily.temperature_2m_min[dayIndex]);

  const bodyHtml = `
    <div class="wx-head">
      <div class="wx-head-icon">${info.icon}</div>
      <div class="wx-head-info">
        <div class="wx-head-day">${escapeHtml(dayName)} · ${dateLabel}</div>
        <div class="wx-head-desc">${escapeHtml(info.text)}</div>
      </div>
      <div class="wx-head-range">${tMax}° / ${tMin}°</div>
    </div>
    <div class="wx-chart-block">
      <div class="wx-chart-title">🌡️ Температура, °C</div>
      <div class="wx-chart-svg-wrap" data-wx="temp">
        ${wxLineChart(tempPts, { unit: '°' })}
        <div class="wx-cursor"><div class="wx-cursor-dot"></div></div>
        <div class="wx-readout"></div>
      </div>
    </div>
    <div class="wx-chart-block">
      <div class="wx-chart-title">💧 Ймовірність опадів, %</div>
      <div class="wx-chart-svg-wrap" data-wx="precip">
        ${wxBarChart(precipPts)}
        <div class="wx-cursor"><div class="wx-cursor-dot"></div></div>
        <div class="wx-readout"></div>
      </div>
    </div>`;

  // Актуальна година — по timezone з відповіді Open-Meteo (timezone=auto вже рахує
  // геодані користувача при фетчі; якщо геолокація недоступна, getCoords() підставляє
  // Олику → Open-Meteo сам резолвить її у Europe/Kyiv, тож окремий фолбек не потрібен).
  const offsetSec = _wxData.utc_offset_seconds ?? 7200;   // 7200с=+2год — фолбек лише якщо API не віддав поле
  const nowLocal = new Date(Date.now() + offsetSec * 1000);
  const nowDateStr = nowLocal.toISOString().slice(0, 10);
  const nowHour = nowLocal.getUTCHours();
  const initialIdx = dateStr === nowDateStr ? tempPts.findIndex(p => p.h === nowHour) : -1;

  // swipeClose:false — власний wireWeatherSwipe нижче (ігнорує свайп що почався
  // на скрабер-графіку, спільний примітив цього не вміє).
  const { close, el } = openModal({
    bodyHtml,
    variant: 'sheet',
    className: 'app-modal--weather',
    swipeClose: false,
    onMount: (wrap) => wireWeatherScrubber(wrap, {
      tempPts, precipPts, iconPts,
      initialIdx: initialIdx >= 0 ? initialIdx : null,
    }),
  });
  wireWeatherSwipe(el, close);
}

// Скрабер (перетягування пальцем по графіку): снапить до найближчої години,
// показує спільну вертикальну лінію + бульбашку з іконкою і значенням.
// initialIdx — якщо задано, курсор одразу показується на цій годині (актуальна
// година, лише коли відкрито «Сьогодні»), без потреби торкатись графіка.
function wireWeatherScrubber(overlay, { tempPts, precipPts, iconPts, initialIdx }) {
  const n = tempPts.length;
  if (!n) return;
  const gTemp = wxGeom(tempPts);
  const wraps = [...overlay.querySelectorAll('.wx-chart-svg-wrap')];

  function place(idx) {
    idx = Math.max(0, Math.min(n - 1, idx));
    const xPct = (gTemp.x(idx) / WX.W) * 100;   // однакова X-геометрія для обох графіків
    wraps.forEach(wrap => {
      const kind = wrap.dataset.wx;
      const cursor = wrap.querySelector('.wx-cursor');
      const readout = wrap.querySelector('.wx-readout');
      cursor.style.left = xPct + '%';
      cursor.classList.add('is-on');
      const p = kind === 'temp' ? tempPts[idx] : precipPts[idx];
      const val = kind === 'temp' ? `${Math.round(p.v)}°` : `${Math.round(p.v)}%`;
      // Іконка погоди — лише в бульбашці температури; графік опадів дублював той самий
      // емодзі, хоча має показувати ЛИШЕ ймовірність опадів (година+відсоток).
      const icHtml = kind === 'temp' ? `<span class="wx-ro-ic">${iconPts[idx]}</span>` : '';
      readout.innerHTML = `${icHtml}<span class="wx-ro-h">${pad(p.h)}:00</span><span class="wx-ro-v">${val}</span>`;
      readout.style.left = xPct + '%';
      readout.classList.add('is-on');
    });
  }
  function idxFromX(wrap, clientX) {
    const r = wrap.getBoundingClientRect();
    // Врахувати внутрішні відступи графіка (padL/padR) — X-вісь займає не всю ширину.
    const frac = (clientX - r.left) / r.width;
    const usable = (frac * WX.W - WX.padL) / (WX.W - WX.padL - WX.padR);
    return Math.round(usable * (n - 1));
  }
  wraps.forEach(wrap => {
    wrap.addEventListener('pointerdown', e => {
      wrap.setPointerCapture(e.pointerId);
      place(idxFromX(wrap, e.clientX));
      e.preventDefault();
    });
    wrap.addEventListener('pointermove', e => {
      if (e.pressure === 0 && e.buttons === 0) return;
      if (!wrap.hasPointerCapture(e.pointerId)) return;
      place(idxFromX(wrap, e.clientX));
    });
    // Відпустив палець — курсор ЛИШАЄТЬСЯ на обраній годині (не ховається), щоб
    // бачити погоду на цю годину й далі, без потреби тримати палець притиснутим.
    const end = e => { try { wrap.releasePointerCapture(e.pointerId); } catch (_) {} };
    wrap.addEventListener('pointerup', end);
    wrap.addEventListener('pointercancel', end);
  });

  if (initialIdx != null) place(initialIdx);
}

// Свайп вниз по аркушу закриває модалку. Не заважає скраберу: якщо палець
// на графіку — свайп ігнорується (там працює скрабер). close — від primitive
// core/modal.js (Потік C1, крок 6).
function wireWeatherSwipe(overlay, close) {
  const sheet = overlay.querySelector('.app-modal-sheet');
  if (!sheet) return;
  let startY = 0, dragging = false;
  sheet.addEventListener('touchstart', e => {
    if (e.target.closest('.wx-chart-svg-wrap')) return;   // графік → скрабер, не свайп
    if (sheet.scrollTop > 2) return;
    startY = e.touches[0].clientY;
    dragging = true;
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    if (dy > 0) sheet.style.transform = `translateY(${dy}px)`;
  }, { passive: true });
  sheet.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    const dy = e.changedTouches[0].clientY - startY;
    sheet.style.transform = '';
    if (dy > 90) close();
  });
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

function busIsDayActive(days) {
  const d = new Date().getDay();
  if (days === 'щодня') return true;
  if (days === 'пн-сб') return d >= 1 && d <= 6;
  if (days === 'пн-пт') return d >= 1 && d <= 5;
  return true;
}

// Маршрутна шкала з зупинками-крапками і маркером 🚌 на позиції автобуса.
// Точна копія функції з buses.js — обидві використовують одні CSS-класи (.bhm-*).
function renderBusRouteMap(route, timings) {
  const stops    = route.stops;
  const totalKm  = stops[stops.length - 1].km || 1;
  const progress = (timings.progress * 100).toFixed(1);
  const stopsHtml = stops.map(s => {
    const pct = totalKm ? (s.km / totalKm) * 100 : 0;
    const isCurrent = s.name === timings.currentStop;
    return `<span class="bhm-stop${isCurrent ? ' bhm-stop--current' : ''}" style="left:${pct.toFixed(1)}%"></span>`;
  }).join('');
  return `
    <div class="bus-hero-map" aria-hidden="true">
      <div class="bhm-track">
        <div class="bhm-fill" style="width:${progress}%"></div>
        ${stopsHtml}
        <span class="bhm-marker" style="left:${progress}%">🚌</span>
      </div>
      <div class="bhm-ends">
        <span class="bhm-end-from">${escapeHtml(stops[0].name)}</span>
        <span class="bhm-end-to">${escapeHtml(stops[stops.length - 1].name)}</span>
      </div>
    </div>
  `;
}

export async function renderBusBlock() {
  const el = document.getElementById('cm-bus-content');
  if (!el) return;

  try {
    const res  = await fetch('./data/schedule.json');
    const data = await res.json();

    // Нова структура: data.days["2026-06-07"].routes
    const todayISO = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowISO = tomorrow.toISOString().slice(0, 10);

    const dayRoutes = iso =>
      (data.days?.[iso]?.routes) || (iso === todayISO ? data.routes : null) || [];
    const depMins = r => scheduleGetStopMins(r, r.stops[0].name) || 0;

    const entries = [];
    const seen = new Set();
    const add = (route, dateISO) => {
      const key = dateISO + '|' + route.id;
      if (seen.has(key)) return;
      seen.add(key);
      entries.push({ route, dateISO });
    };

    // 1) Відстежувані рейси (сьогодні + майбутні дні) — найвищий пріоритет.
    //    Це дублює віджет відстеження з вкладки Автобуси у блок Громади.
    for (const t of loadCmTracked(todayISO)) {
      const r = dayRoutes(t.trackDate).find(x => x.id === t.routeId && x.status !== 'cancelled');
      if (!r) continue;
      if (t.trackDate === todayISO && getRouteState(r) === 'past') continue; // вже проїхав
      add(r, t.trackDate);
    }

    // 2) Сьогоднішні активні: enroute + waiting у межах 90 хв
    dayRoutes(todayISO)
      .filter(r => {
        if (r.status === 'cancelled') return false;
        const state = getRouteState(r);
        if (state === 'enroute') return true;
        if (state === 'waiting') {
          const t = getRouteTimings(r);
          return t.minsToDeparture !== null && t.minsToDeparture <= 90;
        }
        return false;
      })
      .sort((a, b) => depMins(a) - depMins(b))
      .forEach(r => add(r, todayISO));

    // 3) Якщо для сьогодні нічого не зібрали — показуємо наступний сьогоднішній рейс
    if (!entries.some(e => e.dateISO === todayISO)) {
      const next = dayRoutes(todayISO)
        .filter(r => r.status !== 'cancelled' && getRouteState(r) === 'waiting')
        .sort((a, b) => (getRouteTimings(a).minsToDeparture ?? Infinity) - (getRouteTimings(b).minsToDeparture ?? Infinity))[0];
      if (next) add(next, todayISO);
    }

    // 4) Сьогоднішні рейси закінчились і нічого не відстежується —
    //    одразу показуємо найближчий завтрашній рейс (замість «рейсів більше немає»)
    if (!entries.length) {
      const tom = dayRoutes(tomorrowISO)
        .filter(r => r.status !== 'cancelled')
        .sort((a, b) => depMins(a) - depMins(b))[0];
      if (tom) add(tom, tomorrowISO);
    }

    cmBusEntries = entries;

    if (!cmBusEntries.length) {
      el.innerHTML = '<div class="cm-block-empty">Розклад тимчасово недоступний</div>';
      return;
    }

    if (cmBusIndex >= cmBusEntries.length) cmBusIndex = 0;
    renderCmBusCard(el);
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Розклад тимчасово недоступний</div>';
  }
}

// Підпис над карткою для не-сьогоднішнього рейсу: «Завтра · 12 червня»
const CM_MONTHS = ['січня','лютого','березня','квітня','травня','червня',
                   'липня','серпня','вересня','жовтня','листопада','грудня'];
function cmDayLabel(dateISO, todayISO, tomorrowISO) {
  if (dateISO === todayISO) return '';
  const [y, m, d] = dateISO.split('-').map(Number);
  const prefix = dateISO === tomorrowISO ? 'Завтра' : '';
  const datePart = `${d} ${CM_MONTHS[m - 1]}`;
  return prefix ? `${prefix} · ${datePart}` : datePart;
}

function renderCmBusCard(el) {
  if (!el || !cmBusEntries.length) return;
  const { route, dateISO } = cmBusEntries[cmBusIndex];

  const todayISO = new Date().toISOString().slice(0, 10);
  const tomorrow = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowISO = tomorrow.toISOString().slice(0, 10);

  // Для не-сьогоднішніх днів: state→waiting, без відліку (як на вкладці Автобуси)
  const base = getRouteTimings(route);
  const timings = dateISO === todayISO
    ? base
    : { ...base, state: 'waiting', progress: 0, minsToDeparture: null, minsToArrival: null };

  const label = cmDayLabel(dateISO, todayISO, tomorrowISO);
  const labelHtml = label ? `<div class="cm-bus-daylabel">${escapeHtml(label)}</div>` : '';
  el.innerHTML = labelHtml + buildHeroCard(route, timings, cmBusIndex, cmBusEntries.length);

  // Свайп
  let touchStartX = 0, touchMoved = false;
  const card = el.querySelector('.bhv4') || el.lastElementChild;
  if (!card) return;
  card.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; touchMoved = false; }, { passive: true });
  card.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 40) return;
    touchMoved = true;
    cmBusIndex = dx < 0
      ? (cmBusIndex + 1) % cmBusEntries.length
      : (cmBusIndex - 1 + cmBusEntries.length) % cmBusEntries.length;
    switchCmBusCard(el);
  }, { passive: true });
  // Тап по картці (не свайп) → САМЕ цей рейс на вкладці Автобуси, знайдено аудитом
  // перенаправлень — раніше картка взагалі нічого не робила при тапі.
  card.addEventListener('click', () => {
    if (touchMoved) return;
    if (typeof window.switchTab === 'function') window.switchTab('buses');
    openSavedRouteOnBuses(route.id, dateISO, null, null);
  });

  // Тап по крапках
  el.querySelectorAll('.bhv4-dot-nav').forEach(dot => {
    dot.addEventListener('click', e => {
      cmBusIndex = parseInt(e.target.dataset.idx, 10);
      switchCmBusCard(el);
    });
  });
}

function switchCmBusCard(el) {
  const content = el.querySelector('.bhv4-content');
  if (!content) { renderCmBusCard(el); return; }
  content.style.transition = 'opacity 0.08s ease';
  content.style.opacity    = '0';
  setTimeout(() => {
    renderCmBusCard(el);
    const newContent = el.querySelector('.bhv4-content');
    if (newContent) {
      newContent.style.opacity    = '0';
      newContent.style.transition = 'opacity 0.1s ease';
      requestAnimationFrame(() => requestAnimationFrame(() => { newContent.style.opacity = '1'; }));
    }
  }, 80);
}

// ── Блок 4: Віджет Дошки — «шматочок живої Дошки» (переробка 13.07, Вова) ────
// Темний корок (як вкладка Дошка, Д-21), горизонтальна стрічка ПАР карток-стікерів
// (фото · тег категорії · заголовок · локація · дата) + автопрокрутка по 2 картки.
// Тап по картці → зум оголошення; шапка / «Всі оголошення» → вкладка Дошка.

const BW_PIN_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';
const BW_ARROW_SVG = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14"/><path d="M13 6l6 6-6 6"/></svg>';

function bwStopAuto() {
  clearInterval(_bwTimer);  _bwTimer  = null;
  clearTimeout(_bwResume);  _bwResume = null;
}

// Одна картка стрічки — міні-версія реальної картки вкладки Дошка.
// Без фото обкладинки НЕМА — картка просто нижча, як на вкладці Дошка
// (рішення Вови 13.07, замінило плейсхолдер-обкладинку).
// Вміст загорнуто у .cmbw-in — саме її масштабує карусель (JS нижче),
// щоб снап-геометрія зовнішньої картки лишалась незмінною.
function bwCardHtml(p) {
  const photo = (Array.isArray(p.photos) && p.photos.find(x => x)) || p.photo;
  const title = (p.title && p.title.trim()) || (p.text || '').trim().slice(0, 60) || 'Оголошення';
  const locLabel = p.location ? (p.location === COMMUNITY_ALL ? COMMUNITY_ALL_LABEL : p.location) : '';
  const ts = p.ts || (p.published_at && new Date(p.published_at).getTime()) || (p.created_at && new Date(p.created_at).getTime());
  const color = catColor(p.category);
  const cover = photo
    ? `<div class="cmbw-photo" style="background-image:url('${escapeHtml(photo)}')"></div>`
    : '';
  return `
    <article class="cmbw-card" data-bw-id="${p.id}">
      <div class="cmbw-in">
        <span class="cmbw-pin" aria-hidden="true"></span>
        ${cover}
        <div class="cmbw-body">
          <span class="cm-board-cat cm-board-cat--${escapeHtml(color)}">${catIcon(p.category)} ${escapeHtml(catShort(p.category || ''))}</span>
          <div class="cmbw-name">${escapeHtml(title)}</div>
          <div class="cmbw-meta">
            ${locLabel ? `<span class="cmbw-loc">${BW_PIN_SVG}${escapeHtml(locLabel)}</span>` : '<span></span>'}
            ${ts ? `<span class="cmbw-time">${formatTime(ts)}</span>` : ''}
          </div>
        </div>
      </div>
    </article>`;
}

// Fisher-Yates перемішування (чесний випадковий порядок, кожен елемент рівні шанси)
function bwShuffle(arr) {
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export async function renderBoardBlock() {
  const el = document.getElementById('cm-board-content');
  if (!el) return;
  bwStopAuto();   // перерендер — старий інтервал більше не тримаємо

  try {
    // 1. Дані: Supabase спочатку, JSON-fallback якщо не вийшло
    let posts = [], usedSupabase = false;
    if (isSupabaseReady()) {
      const p = await fetchPublishedPosts();
      if (p !== null) { posts = p; usedSupabase = true; }
    }
    if (!usedSupabase) {
      const boardRes = await fetch('./data/community-board.json');
      posts = ((await boardRes.json()).posts) || [];
    }

    // 2. Лише оголошення (type board), УСЯ громада без фільтра НП.
    //    Порядок — ВИПАДКОВИЙ при кожному рендері (рішення Вови 13.07): віджет не
    //    дублює «свіжі вгорі» вкладки, а дає рівний шанс УСІМ оголошенням, включно
    //    зі старими — кожне відкриття Громади показує інший набір і порядок.
    const ads = posts.filter(p => (p.type || 'board') === 'board');
    const shown = bwShuffle(ads).slice(0, BW_MAX_CARDS);

    const cards = shown.map(bwCardHtml).join('');

    // .cm-loading знято → padding контейнера зникає, шапка/низ дістають країв
    // блоку (їх кути обрізає .cm-block overflow:hidden + radius → заокруглені).
    el.classList.remove('cm-loading');
    el.innerHTML = `
      <div class="cmbw-head" data-bw-head role="button" aria-label="Відкрити Дошку оголошень">
        <span class="cmbw-head-ic">${ICONS.clipboard}</span>
        <span class="cmbw-title">ДОШКА ОГОЛОШЕНЬ</span>
        <span class="cmbw-dots" aria-hidden="true"></span>
      </div>
      ${ads.length
        ? `<div class="cmbw-strip" id="cmbw-strip">${cards}</div>
           <div class="cmbw-edge cmbw-edge--l" aria-hidden="true"></div>
           <div class="cmbw-edge cmbw-edge--r" aria-hidden="true"></div>
           <div class="cmbw-foot" data-bw-more role="button" aria-label="Переглянути всі оголошення">
             <span>Переглянути всі оголошення</span>${BW_ARROW_SVG}
           </div>`
        : '<div class="cmbw-empty">На дошці поки порожньо — подайте перше оголошення!</div>'}
    `;

    // 3. Тапи: картка → зум САМЕ цього оголошення; шапка / «Всі» → вкладка Дошка.
    el.addEventListener('click', e => {
      const card = e.target.closest('[data-bw-id]');
      if (card) {
        const post = ads.find(p => p.id === Number(card.dataset.bwId));
        if (post) { openAdModalStandalone(post); return; }
      }
      if (e.target.closest('[data-bw-more]') || e.target.closest('[data-bw-head]')) {
        if (typeof window.switchTab === 'function') window.switchTab('board');
      }
    });

    // 4. Стрічка: карусель-масштаб карток, крапки-індикатори пар, автопрокрутка.
    const strip = el.querySelector('#cmbw-strip');
    if (strip) {
      // Снап-цілі = позиції початку кожної ПАРИ (непарні картки) у КООРДИНАТАХ
      // СКРОЛУ: перша пара = 0 (картка «вліво»); наступні = зсув від першої мінус
      // scroll-margin-left 12px (CSS дає його всім парам крім першої, щоб минула
      // картка визирала зліва). offsetLeft беремо ЯК РІЗНИЦЮ з першою карткою —
      // він рахується від offsetParent із власним зсувом, різниця його прибирає.
      const snapTargets = () => {
        const kids = [...strip.children];
        if (!kids.length) return [];
        const base = kids[0].offsetLeft;
        return kids.filter((_, i) => i % 2 === 0)
          .map(c => Math.max(0, c.offsetLeft - base - 12));
      };
      const targets0 = snapTargets();

      // Крапки-індикатори пар у шапці — як свайп-крапки віджета автобусів
      // (рішення Вови 13.07, замінили лічильник «N оголошень»).
      const dotsWrap = el.querySelector('.cmbw-dots');
      if (dotsWrap && targets0.length > 1) {
        dotsWrap.innerHTML = targets0
          .map((_, i) => `<span class="cmbw-dot" data-bw-dot="${i}"></span>`).join('');
      }
      const dotEls = dotsWrap ? [...dotsWrap.children] : [];

      // Карусель: центральна пара — повний розмір, обрізані бічні картки менші.
      // Масштаб = частка видимої ширини картки (плавно росте/спадає при гортанні).
      // Скейлиться внутрішня .cmbw-in — зовнішня картка (снап) не рухається.
      const padL = parseFloat(getComputedStyle(strip).paddingLeft) || 0;
      const updateFx = () => {
        const kids = [...strip.children];
        if (!kids.length) return;
        const base  = kids[0].offsetLeft;
        const viewL = strip.scrollLeft, viewR = viewL + strip.clientWidth;
        kids.forEach(c => {
          const l    = c.offsetLeft - base + padL;
          const vis  = Math.max(0, Math.min(l + c.offsetWidth, viewR) - Math.max(l, viewL));
          const frac = Math.min(1, vis / c.offsetWidth);
          if (c.firstElementChild) c.firstElementChild.style.transform = `scale(${(0.87 + 0.13 * frac).toFixed(3)})`;
        });
        if (dotEls.length) {   // активна крапка = найближча снап-ціль
          const targets = snapTargets();
          let ai = 0, best = Infinity;
          targets.forEach((t, i) => {
            const d = Math.abs(t - strip.scrollLeft);
            if (d < best) { best = d; ai = i; }
          });
          dotEls.forEach((d, i) => d.classList.toggle('cmbw-dot--active', i === ai));
        }
      };
      let fxRaf = 0;
      strip.addEventListener('scroll', () => {
        if (fxRaf) return;
        fxRaf = requestAnimationFrame(() => { fxRaf = 0; updateFx(); });
      }, { passive: true });
      updateFx();

      // Автопрокрутка: кожні BW_STEP_MS — наступна ПАРА (снап робить CSS),
      // в кінці — плавно на початок. Дотик/крапка → пауза, відновлення через
      // BW_RESUME_MS. Згорнутий застосунок (document.hidden) — тик пропускається.
      if (targets0.length > 1) {
        const tick = () => {
          if (!document.contains(strip)) { bwStopAuto(); return; }   // блок перемальовано/зник
          if (document.hidden) return;
          const targets = snapTargets(); if (!targets.length) return;
          const max  = strip.scrollWidth - strip.clientWidth;
          const next = targets.find(t => t > strip.scrollLeft + 8);
          strip.scrollTo({ left: next === undefined || next > max + 8 ? 0 : Math.min(next, max), behavior: 'smooth' });
        };
        const startAuto = () => { clearInterval(_bwTimer); _bwTimer = setInterval(tick, BW_STEP_MS); };
        const pauseAuto = () => {
          clearInterval(_bwTimer); _bwTimer = null;
          clearTimeout(_bwResume);
          _bwResume = setTimeout(startAuto, BW_RESUME_MS);
        };
        strip.addEventListener('touchstart', pauseAuto, { passive: true });
        strip.addEventListener('pointerdown', pauseAuto);
        if (dotsWrap) dotsWrap.addEventListener('click', e => {
          const d = e.target.closest('[data-bw-dot]');
          if (!d) return;
          e.stopPropagation();   // шапка теж клікабельна — крапка не має відкривати вкладку
          pauseAuto();
          const t = snapTargets()[Number(d.dataset.bwDot)] || 0;
          strip.scrollTo({ left: Math.min(t, strip.scrollWidth - strip.clientWidth), behavior: 'smooth' });
        });
        startAuto();
      }
    }
  } catch {
    el.innerHTML = '<div class="cmbw-empty">Дошка тимчасово недоступна</div>';
  }
}


// ── Блок 5: Найближча подія громади ───────────────────────────────────────────
// Раніше тут був фільтр isLocalEvent() по списку OTG_VILLAGES — він шукав
// підрядок «олика» у location, але ламався на відмінках («Олицький замок» не
// містить «олика», а лише «олиц»). Прибрано 18.05.2026.
// У data/events.json і так зберігаються ТІЛЬКИ локальні події (RSS-новини
// мають auto:true і виключаються тут само як у вкладці Подій).

// Українська плюралізація (1 день, 2 дні, 5 днів) — локальна копія з events.js
function pluralUA(n, one, few, many) {
  const m10 = n % 10, m100 = n % 100;
  if (m10 === 1 && m100 !== 11) return one;
  if (m10 >= 2 && m10 <= 4 && (m100 < 10 || m100 >= 20)) return few;
  return many;
}

// Countdown-текст «через X днів / завтра / сьогодні» для табло-капсули у блоку Громади
function eventCountdown(ev, now) {
  const eventDay = new Date(ev.date + 'T00:00:00');
  const todayDay = new Date(now); todayDay.setHours(0, 0, 0, 0);
  const dayDiff  = Math.round((eventDay - todayDay) / 86400000);
  if (dayDiff === 0) {
    if (!ev.time) return 'СЬОГОДНІ';
    const dt = new Date(ev.date + 'T' + ev.time + ':00');
    const diffMs = dt - now;
    if (diffMs <= 0) return 'ЗАРАЗ';
    if (diffMs < 60 * 60000) return `ЧЕРЕЗ ${Math.max(1, Math.floor(diffMs / 60000))} ХВ`;
    const h = Math.floor(diffMs / 3600000);
    const m = Math.floor((diffMs % 3600000) / 60000);
    return m > 0 ? `ЧЕРЕЗ ${h} ГОД ${m} ХВ` : `ЧЕРЕЗ ${h} ГОД`;
  }
  if (dayDiff === 1) return 'ЗАВТРА';
  if (dayDiff < 7)   return `ЧЕРЕЗ ${dayDiff} ${pluralUA(dayDiff, 'ДЕНЬ', 'ДНІ', 'ДНІВ')}`;
  if (dayDiff < 14)  return 'ЧЕРЕЗ ТИЖДЕНЬ';
  if (dayDiff < 30)  { const w = Math.floor(dayDiff / 7); return `ЧЕРЕЗ ${w} ${pluralUA(w, 'ТИЖДЕНЬ', 'ТИЖНІ', 'ТИЖНІВ')}`; }
  const months = Math.floor(dayDiff / 30);
  return `ЧЕРЕЗ ${months} ${pluralUA(months, 'МІСЯЦЬ', 'МІСЯЦІ', 'МІСЯЦІВ')}`;
}

export async function renderEventBlock() {
  const el = document.getElementById('cm-event-content');
  if (!el) return;

  // Зупиняємо попередню ротацію (перерендер/повернення на вкладку) — без витоку інтервалів
  if (_evTimer) { clearInterval(_evTimer); _evTimer = null; }

  try {
    const today = new Date(); today.setHours(0, 0, 0, 0);

    // 1) Майбутні події громади (не-auto), відсортовані за датою, до 5
    let items = [];
    try {
      const res    = await fetch('./data/events.json');
      const events  = await res.json();
      items = events
        .filter(e => !e.auto)  // RSS-новини (auto:true) виключаємо — як у вкладці Подій
        .filter(e => new Date(e.date + 'T00:00:00') >= today)
        .sort((a, b) => new Date(a.date) - new Date(b.date))
        .slice(0, 5)
        .map(e => ({ kind: 'event', id: e.id, date: e.date, time: e.time, title: e.title, category: e.category, location: e.location, image: e.image }));
    } catch {}

    // 2) Fallback (Г-16): якщо майбутніх подій нема — найближчі свята з holidays.json
    if (!items.length) {
      try {
        const hres = await fetch('./data/holidays.json');
        const hall = await hres.json();
        const harr = Array.isArray(hall) ? hall : (hall.holidays || []);
        items = harr
          .filter(h => new Date(h.date + 'T00:00:00') >= today)
          .sort((a, b) => new Date(a.date) - new Date(b.date))
          .slice(0, 5)
          .map(h => ({ kind: 'holiday', id: h.id, date: h.date, title: h.title, category: h.category || 'Свято', emoji: h.cover_emoji, gradient: h.cover_gradient }));
      } catch {}
    }

    if (!items.length) {
      el.innerHTML = '<div class="cm-block-empty">Поки немає запланованих подій у громаді</div>';
      return;
    }

    _evItems = items;
    _evIdx   = 0;
    renderEvCarousel(el);
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Події недоступні</div>';
  }
}

// Одна картка каруселі — подія (табло-стиль) або свято (cover_emoji + градієнт).
function evSlideHtml(it, now) {
  const eventDay = new Date(it.date + 'T00:00:00');
  const todayDay = new Date(now); todayDay.setHours(0, 0, 0, 0);
  const dayDiff  = Math.round((eventDay - todayDay) / 86400000);
  const isUrgent = dayDiff <= 1;
  const dateStr   = `${pad(eventDay.getDate())}.${pad(eventDay.getMonth() + 1)}`;
  const catStr    = escapeHtml(it.category || '');
  const countdown = escapeHtml(eventCountdown(it, now));

  if (it.kind === 'holiday') {
    const grad = it.gradient ? ` style="background:${escapeHtml(it.gradient)}"` : '';
    return `
      <div class="cm-ev-slide">
        <article class="evh-card tablo-hero cm-ev-holiday${isUrgent ? ' tablo-hero--urgent' : ''}"${grad} data-ev-id="${it.id}">
          <div class="evh-top">
            <span class="tablo-countdown">${countdown}</span>
            ${catStr ? `<span class="evh-cat tablo-soft">${catStr}</span>` : ''}
          </div>
          <div class="cm-ev-holiday-emoji">${escapeHtml(it.emoji || '🎉')}</div>
          <div class="evh-title">${escapeHtml(it.title)}</div>
          <div class="evh-meta tablo-soft">${dateStr}</div>
        </article>
      </div>
    `;
  }

  const timeStr = it.time ? escapeHtml(it.time) : '';
  const locStr  = it.location ? escapeHtml(it.location) : '';
  // Мініатюра фото (якщо є) — маленький квадрат у кутку картки, текст лишається зліва.
  const thumb = it.image
    ? `<img class="evh-thumb" src="${escapeHtml(it.image)}" alt="" loading="lazy" onerror="this.remove(); this.closest('.evh-card')?.classList.remove('evh-card--photo')">`
    : '';
  return `
    <div class="cm-ev-slide">
      <article class="evh-card tablo-hero${isUrgent ? ' tablo-hero--urgent' : ''}${it.image ? ' evh-card--photo' : ''}" data-ev-id="${it.id}">
        ${thumb}
        <div class="evh-top">
          <span class="tablo-countdown">${countdown}</span>
          ${catStr ? `<span class="evh-cat tablo-soft">${catStr}</span>` : ''}
        </div>
        <div class="evh-time tablo-time-mono">
          <span class="evh-date tablo-time-accent">${dateStr}</span>
          ${timeStr ? `<span class="evh-clock tablo-mid">${timeStr}</span>` : ''}
        </div>
        <div class="evh-title">${escapeHtml(it.title)}</div>
        ${locStr ? `<div class="evh-meta tablo-soft">📍 ${locStr}</div>` : ''}
      </article>
    </div>
  `;
}

// Рендер каруселі: трек зі слайдів + крапки. Одна картка видима, авто-ротація ~6с.
function renderEvCarousel(el) {
  const now    = new Date();
  const slides = _evItems.map(it => evSlideHtml(it, now)).join('');
  const dots   = _evItems.length > 1
    ? `<div class="cm-ev-dots">${_evItems.map((_, i) =>
        `<span class="cm-ev-dot${i === _evIdx ? ' active' : ''}" data-ev-idx="${i}"></span>`).join('')}</div>`
    : '';

  el.innerHTML = `
    <div class="cm-ev-carousel" id="cm-ev-carousel">
      <div class="cm-ev-track" style="transform:translateX(-${_evIdx * 100}%)">${slides}</div>
      ${dots}
    </div>
  `;

  // Крапки — ручний перехід (зупиняє й перезапускає авто-ротацію)
  el.querySelectorAll('.cm-ev-dot').forEach(dot => {
    dot.addEventListener('click', e => {
      e.stopPropagation();
      _evIdx = parseInt(dot.dataset.evIdx, 10) || 0;
      updateEvPosition(el);
      startEvRotator(el);   // рестарт таймера від нового індексу
    });
  });

  // Тап по картці → відкрити САМЕ цю подію/свято в статейній модалці (не просто вкладку).
  el.querySelectorAll('.evh-card[data-ev-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.evId);
      if (Number.isFinite(id)) openShotamModal(id);
    });
  });

  startEvRotator(el);
}

// Зсув треку + активна крапка
function updateEvPosition(el) {
  const track = el.querySelector('.cm-ev-track');
  if (track) track.style.transform = `translateX(-${_evIdx * 100}%)`;
  el.querySelectorAll('.cm-ev-dot').forEach((d, i) => d.classList.toggle('active', i === _evIdx));
}

// Авто-ротація 6с (реюз патерну hero-ротатора). Стоп коли каруселі нема в DOM.
function startEvRotator(el) {
  if (_evTimer) { clearInterval(_evTimer); _evTimer = null; }
  if (_evItems.length < 2) return;
  _evTimer = setInterval(() => {
    if (!document.getElementById('cm-ev-carousel')) { clearInterval(_evTimer); _evTimer = null; return; }
    _evIdx = (_evIdx + 1) % _evItems.length;
    updateEvPosition(el);
  }, 6000);
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
  default:   ICONS.phone, // дедуп — раніше байт-в-байт копія з board.js PHONE_ICON_SVG
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

    const telOf = p => p.replace(/[^\d+]/g, '');

    // Г-10 (Рома 08.07): МІСЦЕВІ вгорі (головна цінність громади), ЕКСТРЕНІ внизу
    // компактно (101/102/103 усі знають). Блок нижчий. «Швидка 103» (group hero)
    // тепер звичайна плитка серед екстрених — без великої картки.
    const local     = list.filter(c => c.group === 'local');
    const emergency = list.filter(c => c.group === 'emergency' || c.group === 'hero' || c.priority === 'critical');

    // ── МІСЦЕВІ (вгорі) — компактні рядки на всю ширину ────────────────────────
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

    // ── ЕКСТРЕНІ (внизу) — компактна сітка маленьких плиток (3 в ряд) ──────────
    const emergencyHtml = emergency.length ? `
      <div class="cm-contact-group cm-contact-group--emergency">
        <div class="cm-contact-group-title">Екстрені</div>
        <div class="cm-contact-grid-3">
          ${emergency.map(c => `
            <a class="cm-contact-chip" href="tel:${escapeHtml(telOf(c.phone))}">
              <span class="cm-contact-chip-icon">${CONTACT_ICONS[c.icon] || CONTACT_ICONS.default}</span>
              <span class="cm-contact-chip-name">${escapeHtml(c.name)}</span>
              <span class="cm-contact-chip-phone">${escapeHtml(c.phone)}</span>
            </a>
          `).join('')}
        </div>
      </div>
    ` : '';

    el.innerHTML = localHtml + emergencyHtml;
  } catch {
    el.innerHTML = '<div class="cm-block-empty">Контакти недоступні</div>';
  }
}

// ── Блок НОВИНИ у вкладці «Громада» (05.07) ──────────────────────────────────
// Стрічка новин переїхала сюди окремим блоком: 3 кнопки-фільтри + прокрутка
// карток ВСЕРЕДИНІ блока. Картки й модалку перевикористовуємо з news.js.
const CM_NEWS_FILTERS = ['Громада', 'Волинь', 'Україна та Світ'];
let cmNewsGeo = 'Громада';

function cmNewsMatch(a) {
  if (cmNewsGeo === 'Громада')          return a.geo === 'Громада' || a.geo === 'Олика';
  if (cmNewsGeo === 'Україна та Світ')  return a.geo === 'Україна' || a.geo === 'Світ';
  return a.geo === cmNewsGeo;
}

function paintCmNews(el, arts) {
  const filtered = arts.filter(cmNewsMatch)
    .slice().sort((a, b) => (b.ts || 0) - (a.ts || 0));
  // Екран табло — лише новини (стрічка), від самого верху.
  // Стрічку (.cm-news-feed) звужено на 30px з кожного боку і зацентровано (CSS margin):
  // краї табло поза overflow-контейнером → дотик там скролить СТОРІНКУ, а не стрічку.
  el.innerHTML = `
    <div class="cm-news-feed">${newsCardsHtml(filtered, { compact: true })}</div>
  `;
  // Кнопки-фільтри — у нижню панель, інтегровану в раму табло.
  const controls = document.getElementById('cm-news-controls');
  if (controls) {
    controls.innerHTML = `
      <div class="cm-news-filters">
        ${CM_NEWS_FILTERS.map(g => `
          <button class="cm-news-chip ${g === cmNewsGeo ? 'active' : ''}" data-cm-geo="${escapeHtml(g)}">${escapeHtml(g)}</button>
        `).join('')}
      </div>`;
  }
}

export async function renderCommunityNews() {
  const el = document.getElementById('cm-news-content');
  if (!el) return;
  const arts = await ensureNewsLoaded();
  paintCmNews(el, arts);

  // Делеговані слухачі — вішаємо ОДИН раз на секцію блока
  const section = document.querySelector('.cm-block--news');
  if (!section || section.dataset.wired) return;
  section.dataset.wired = '1';
  section.addEventListener('click', e => {
    const chip = e.target.closest('[data-cm-geo]');
    if (chip) {
      cmNewsGeo = chip.dataset.cmGeo;
      paintCmNews(el, arts);
      return;
    }
    const card = e.target.closest('[data-article-id]');
    if (card) {
      const id = Number(card.dataset.articleId);
      if (Number.isFinite(id)) openArticle(id);
    }
  });

  // Бокова зона свайпу сторінки (#3, рішення Роми «вигляд табло зберігаємо»):
  // картки повної ширини, АЛЕ палець у 30px від краю стрічки → на час жесту стрічка
  // не скролиться (overflow:hidden) → вертикальний свайп іде СТОРІНЦІ; у центрі —
  // скролить стрічку; тап відкриває картку (не чіпаємо, бо БЕЗ preventDefault).
  // Хардненуто за дослідженням iOS: рішення на touchstart (до руху, момент-скрол цілий),
  // {passive:true}, обовʼязковий restore на touchcancel (iOS PWA шле pointercancel).
  const EDGE = 30;
  let feedArmed = false;
  const feedNow = () => section.querySelector('.cm-news-feed');
  section.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) return;            // мультитач/пінч — ігноруємо
    const feed = feedNow(); if (!feed) return;
    const r = feed.getBoundingClientRect();
    const t = e.touches[0];
    const inFeedY = t.clientY >= r.top && t.clientY <= r.bottom;
    const inEdge  = t.clientX < r.left + EDGE || t.clientX > r.right - EDGE;
    if (inFeedY && inEdge) { feed.style.overflowY = 'hidden'; feedArmed = true; }
  }, { passive: true });
  const releaseFeed = () => {
    if (!feedArmed) return;
    const feed = feedNow(); if (feed) feed.style.overflowY = '';   // повертаємо CSS-значення (auto)
    feedArmed = false;
  };
  section.addEventListener('touchend', releaseFeed, { passive: true });
  section.addEventListener('touchcancel', releaseFeed, { passive: true });
}
