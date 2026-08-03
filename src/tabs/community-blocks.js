// src/tabs/community-blocks.js
// Всі render-блоки головної вкладки «Громада» (винесено з community.js 13.05).
// Експортовані: renderWeatherBlock (кнопка погоди в рядку стану + аркуш прогнозу),
//               renderEventBlock (стрічка «Поруч»), renderContactsBlock (рядок телефонів),
//               renderCommunityNews (стрічка «Що нового»), renderPowerBlock (легасі).
// ⚠️ Автобус і Дошка переїхали в бенто-плитки — `src/tabs/home-bento.js`.
//
// Кожен блок завантажує свої дані самостійно через fetch.
// Помилка одного блоку не ламає інші.

import { escapeHtml, formatTime, getCoords, getCityName, pad, todayKey } from '../core/utils.js';   // attachSwipe більше не потрібен: горизонтальну стрічку Дошки знято 03.08
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
import { ensureNewsLoaded, newsCardsHtml, openArticle, NEWS_GEO_GROUPS, articlesOfGroup, countNewCommunity, geoGroupOf, handleImgError } from './news.js';
import { openNewsHub } from './news-hub.js';   // повноекранний хаб новин (шар поверх Громади)
import { openModal } from '../core/modal.js';
import { createDragTracker, finishSwipe, sheetRemaining, createBackdropFade } from '../core/sheet-motion.js'; // нативне завершення свайп-закриття

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

// ⚠️ Підписки на зміну відстеження і вхід/вихід переїхали в `home-bento.js`
// (`initHomeBento`) — разом із самою автобусною плиткою.

// Віджет Дошки (повна переробка 13.07, рішення Вови): стрічка ПАР карток з
// автопрокруткою. Слайд «Розмови» видалено — Обговорення мають власну вкладку.
// Найближчі події громади. Порожньо → найближчі свята (Г-16 fallback).
// ⚠️ 03.08: авто-ротація і крапки прибрані разом із каруселлю — див. `renderEvList`.
let _evItems = [];

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

// 🔴 03.08 — ПОГОДА ПЕРЕЇХАЛА В ШАПКУ (потік /byyou «Громада як Home-екран»).
//
// Було: окремий блок ПЕРЕДОСТАННІМ на екрані, початок на 1839px — щоб побачити
// температуру, треба прогорнути 2.5 екрана. Заразом звірено по `index.html:27-28`:
// з шапки застосунку погоду прибрали 08.07, тобто вгорі її не було НІДЕ.
// Стало: рядок у шапці головної (`.hm-wx`) — іконка, градуси, місто.
//
// ⚠️ НІЧОГО НЕ ВТРАЧЕНО. Прогноз на 7 днів і графіки по годинах не зникли —
// вони переїхали в ОДНУ модалку `openWeatherSheet()`, куди веде тап по рядку.
// Це навмисно один аркуш, а не «аркуш поверх аркуша»: модалка над модалкою на
// iPhone має два свайпи закриття один поверх одного, а цей клас багів у проєкті
// вже коштував окремого блока роботи 02.08 (сторінка оголошення).
function paintWeatherChip(info, temp, cityName) {
  const btn = document.querySelector('.hm-wx');
  if (!btn) return;
  btn.innerHTML =
    `<span class="hm-wx-ic">${info.icon}</span>` +
    `<b>${temp}°</b>` +
    `<span class="hm-wx-city">${escapeHtml(cityName || 'Олика')}</span>`;
  btn.hidden = false;
  // Слухач вішаємо ОДИН раз: renderWeatherBlock кличеться і при поверненні на
  // вкладку, а другий слухач відкривав би дві модалки з одного тапу.
  if (!btn.dataset.wired) {
    btn.dataset.wired = '1';
    btn.addEventListener('click', () => openWeatherSheet(0));
  }
}

export async function renderWeatherBlock() {
  // Кнопка живе в шапці головної; окремого контейнера під блок більше немає.
  if (!document.querySelector('.hm-wx')) return;

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

    paintWeatherChip(info, temp, cityName);
  } catch {
    // Погоди немає — рядок просто НЕ з'являється. Порожня кнопка «погода
    // недоступна» у шапці зайняла б місце і не сказала б нічого корисного;
    // це той самий принцип, що й у капсул «ЗАРАЗ» та блока зборів.
  }
}

// Рядок 7 днів для модалки. Той самий вигляд, що був у блоці (`.cm-fc-day`),
// тому окремого CSS не заводимо — переїхала лише адреса, не форма.
function wxDaysRowHtml(activeIdx) {
  const day = _wxData?.daily;
  if (!day) return '';
  return day.time.map((dateStr, i) => {
    const d = new Date(dateStr + 'T00:00:00');
    const wd = i === 0 ? 'Сьогодні' : WEEKDAYS_UA[d.getDay()];
    const dayInfo = weatherCodeInfo(day.weather_code[i]);
    return `
      <button type="button" class="cm-fc-day${i === activeIdx ? ' cm-fc-day--today' : ''}" data-wx-day="${i}">
        <span class="cm-fc-wd">${escapeHtml(wd)}</span>
        <span class="cm-fc-date">${d.getDate()}</span>
        <span class="cm-fc-icon">${dayInfo.icon}</span>
      </button>`;
  }).join('');
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

// Дані одного дня для графіків. Витягнуто окремо, бо тепер день ПЕРЕМИКАЄТЬСЯ
// всередині відкритого аркуша, а не відкриває новий.
function wxDayData(dayIndex) {
  const daily = _wxData?.daily, hourly = _wxData?.hourly;
  const dateStr = daily?.time?.[dayIndex];
  if (!dateStr || !hourly) return null;

  // Зрізаємо 24 години обраного дня (hourly.time відсортовані, timezone=auto, старт 00:00).
  const idxs = [];
  hourly.time.forEach((t, i) => { if (t.startsWith(dateStr)) idxs.push(i); });
  if (!idxs.length) return null;

  const tempPts   = idxs.map(i => ({ h: +hourly.time[i].slice(11, 13), v: hourly.temperature_2m[i] }));
  const precipPts = idxs.map(i => ({ h: +hourly.time[i].slice(11, 13), v: hourly.precipitation_probability?.[i] ?? 0 }));
  // Іконка погоди на кожну годину (для скрабера — тягнеш палець, бачиш що о цій годині).
  const iconPts   = idxs.map(i => weatherCodeInfo(hourly.weather_code?.[i] ?? 0).icon);

  // Актуальна година — по timezone з відповіді Open-Meteo (timezone=auto вже рахує
  // геодані користувача при фетчі; якщо геолокація недоступна, getCoords() підставляє
  // Олику → Open-Meteo сам резолвить її у Europe/Kyiv, тож окремий фолбек не потрібен).
  const offsetSec = _wxData.utc_offset_seconds ?? 7200;   // 7200с=+2год — фолбек лише якщо API не віддав поле
  const nowLocal = new Date(Date.now() + offsetSec * 1000);
  const nowHour = nowLocal.getUTCHours();
  const initialIdx = dateStr === nowLocal.toISOString().slice(0, 10)
    ? tempPts.findIndex(p => p.h === nowHour)
    : -1;

  const d = new Date(dateStr + 'T00:00:00');
  return {
    tempPts, precipPts, iconPts,
    initialIdx: initialIdx >= 0 ? initialIdx : null,
    dayName: dayIndex === 0 ? 'Сьогодні' : WEEKDAYS_UA_FULL[d.getDay()],
    dateLabel: `${d.getDate()}.${pad(d.getMonth() + 1)}`,
    info: weatherCodeInfo(daily.weather_code[dayIndex]),
    tMax: Math.round(daily.temperature_2m_max[dayIndex]),
    tMin: Math.round(daily.temperature_2m_min[dayIndex]),
  };
}

function wxDayBodyHtml(dd) {
  return `
    <div class="wx-head">
      <div class="wx-head-icon">${dd.info.icon}</div>
      <div class="wx-head-info">
        <div class="wx-head-day">${escapeHtml(dd.dayName)} · ${dd.dateLabel}</div>
        <div class="wx-head-desc">${escapeHtml(dd.info.text)}</div>
      </div>
      <div class="wx-head-range">${dd.tMax}° / ${dd.tMin}°</div>
    </div>
    <div class="wx-chart-block">
      <div class="wx-chart-title">🌡️ Температура, °C</div>
      <div class="wx-chart-svg-wrap" data-wx="temp">
        ${wxLineChart(dd.tempPts, { unit: '°' })}
        <div class="wx-cursor"><div class="wx-cursor-dot"></div></div>
        <div class="wx-readout"></div>
      </div>
    </div>
    <div class="wx-chart-block">
      <div class="wx-chart-title">💧 Ймовірність опадів, %</div>
      <div class="wx-chart-svg-wrap" data-wx="precip">
        ${wxBarChart(dd.precipPts)}
        <div class="wx-cursor"><div class="wx-cursor-dot"></div></div>
        <div class="wx-readout"></div>
      </div>
    </div>`;
}

// ОДИН аркуш погоди: рядок 7 днів + графіки обраного дня. Тап по іншому дню
// перемальовує ЛИШЕ нижню частину (`.wx-day`), аркуш лишається тим самим.
export function openWeatherSheet(startDay = 0) {
  const first = wxDayData(startDay);
  if (!first) return;

  const bodyHtml = `
    <div class="cm-weather-forecast wx-days">${wxDaysRowHtml(startDay)}</div>
    <div class="wx-day"></div>`;

  const paintDay = (wrap, idx) => {
    const dd = wxDayData(idx);
    if (!dd) return;
    const host = wrap.querySelector('.wx-day');
    host.innerHTML = wxDayBodyHtml(dd);
    // Скрабер вішається на СВІЖУ розмітку — саме тому кличемо його тут, а не
    // один раз при монтуванні: після innerHTML старі вузли (і слухачі) зникли.
    wireWeatherScrubber(host, dd);
    wrap.querySelectorAll('[data-wx-day]').forEach(b => {
      b.classList.toggle('cm-fc-day--today', Number(b.dataset.wxDay) === idx);
    });
  };

  // swipeClose:false — власний wireWeatherSwipe нижче (ігнорує свайп що почався
  // на скрабер-графіку, спільний примітив цього не вміє).
  const { close, el } = openModal({
    bodyHtml,
    variant: 'sheet',
    className: 'app-modal--weather',
    swipeClose: false,
    onMount: (wrap) => {
      paintDay(wrap, startDay);
      wrap.querySelector('.wx-days').addEventListener('click', e => {
        const b = e.target.closest('[data-wx-day]');
        if (b) paintDay(wrap, Number(b.dataset.wxDay));
      });
    },
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
  let startY = 0, dragging = false, travel = 1;
  const drag = createDragTracker();   // швидкість пальця → нативне завершення жесту
  const fade = createBackdropFade(overlay.querySelector('.app-modal-backdrop'));
  sheet.addEventListener('touchstart', e => {
    if (e.target.closest('.wx-chart-svg-wrap')) return;   // графік → скрабер, не свайп
    if (sheet.scrollTop > 2) return;
    startY = e.touches[0].clientY;
    dragging = true;
    travel = Math.max(sheet.offsetHeight || 1, 1);        // повний шлях аркуша — раз за жест
    drag.start(startY);
  }, { passive: true });
  sheet.addEventListener('touchmove', e => {
    if (!dragging) return;
    const dy = e.touches[0].clientY - startY;
    // transition:none — БЕЗ цього аркуш їхав крізь CSS-анімацію 0.25s і «наздоганяв»
    // палець ривками (той самий дьоргаючий баг, що вилікували в чаті Дошки 14.07).
    if (dy > 0) {
      sheet.style.transition = 'none';
      sheet.style.transform = `translateY(${dy}px)`;
      fade?.track(dy / travel);                           // фон світлішає разом з рухом
    } else fade?.track(0);
    drag.move(e.touches[0].clientY);
  }, { passive: true });
  sheet.addEventListener('touchend', e => {
    if (!dragging) return;
    dragging = false;
    const dy = e.changedTouches[0].clientY - startY;
    // Раніше тут був `transform=''` ПЕРЕД close() — аркуш стрибав назад угору на
    // місце і вже звідти з'їжджав донизу. Тепер доїжджає одним рухом.
    finishSwipe({
      panel: sheet, dy: Math.max(dy, 0), velocity: drag.velocity,
      remaining: sheetRemaining(sheet, dy),
      dismissTransform: 'translateY(100%)',
      onDismiss: () => close(),
      backdrop: fade,
    });
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

// ⚠️ Блок «Наступний автобус» переїхав у бенто-плитку 1×1 (`home-bento.js`, 03.08).
// Було: велика картка з картою маршруту, свайпом між рейсами і крапками-навігацією
// на всю ширину екрана. Стало: плитка «Через 12 хв · Рівне», тап — той самий рейс
// на вкладці Автобуси. Карта маршруту лишається там, де їй місце — на своїй вкладці.


// ⚠️ Віджет Дошки переїхав у бенто-плитку 2×1 (`src/tabs/home-bento.js`, 03.08).
// Тут його більше немає: історія форм була корок зі стікерами й автопрокруткою →
// три вертикальні рядки → плитка «19 оголошень» із мініатюрами останніх фото.

// Назви місяців у родовому відмінку — потрібні плиткам подій («3 СЕРП»).
// ⚠️ Жили в автобусному блоці, який 03.08 переїхав у бенто; при переїзді
// константа лишилась без дому і блок подій падав з ReferenceError у catch,
// показуючи «Події недоступні». Знайдено скріншотом, не тестом.
const CM_MONTHS = ['січня','лютого','березня','квітня','травня','червня',
                   'липня','серпня','вересня','жовтня','листопада','грудня'];

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

export async function renderEventBlock() {
  const el = document.getElementById('cm-event-content');
  if (!el) return;

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

    // 🔴 04.08 — ФОЛБЕК НА СВЯТА ПРИБРАНО (пряме слово Вови).
    // Було (Г-16): коли подій громади немає, блок підставляв найближчі свята з
    // `holidays.json` — «6 серпня, Преображення Господнє». Вова: «Поруч, що це
    // таке за свята? Нащо ти таких написав?».
    // Він має рацію: свято — не подія ГРОМАДИ, його ніхто не організовує і
    // нікуди по ньому не йдуть. Блок обіцяв афішу, а показував календар.
    // Тепер: немає подій громади — немає й секції (порожній контейнер, і
    // `renderEvList` його не малює).

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

    // Порожньо — секції немає ЗОВСІМ (не «порожній стан»): обіцяти афішу і
    // показувати напис «подій немає» щодня — гірше, ніж не обіцяти нічого.
    if (!items.length) { hideEventsSection(el); return; }

    _evItems = items;
    renderEvList(el);
  } catch {
    hideEventsSection(el);
  }
}

// Ховає всю секцію разом із заголовком «Афіша громади» і посиланням.
function hideEventsSection(el) {
  el.innerHTML = '';
  const sec = document.getElementById('hm-events');
  if (sec) sec.hidden = true;
}

// 🔴 03.08 — КАРУСЕЛЬ ПОДІЙ ЗНЯТО (потік /byyou, діагноз 4 аудиту).
//
// Було: одна картка у вікні + крапки + авто-ротація кожні 6с. Тобто з п'яти
// найближчих подій людина бачила ОДНУ, а щоб побачити решту — мусила або чекати
// (по 6 секунд на кожну), або влучати пальцем у крапки 8px.
// Стало: ТРИ найближчі події одночасно, статично, без жодного таймера.
//
// ⚠️ Чому три, а не п'ять: три рядки — це 213px, тобто менше третини екрана;
// п'ять дали б ~350px і перетворили б секцію на список. Решта — у «Афіші».
// ⚠️ Fallback на свята (Г-16) збережено: коли подій громади немає, показуємо
// найближчі свята — саме щоб секція не стояла порожньою в тихий місяць.
// 🔴 03.08 (потік «ПУЛЬС») — ПОДІЇ СТАЛИ ГОРИЗОНТАЛЬНОЮ СТРІЧКОЮ МІНІ-ПЛИТОК.
//
// Історія цього блока за один день: карусель з ОДНІЄЮ видимою карткою і
// авто-ротацією 6с → три вертикальні рядки (278px) → стрічка плиток дат.
// Причина останнього кроку — слова Вови про варіант 2: «вертикальний список
// однакових білих карток». Питання до цього блока одне — «що поруч і коли»,
// тому плитка починається з великого числа дня, а не з назви.
const EV_SHOWN = 6;

function evTileHtml(it, now) {
  const d = new Date(it.date + 'T00:00:00');
  const today = new Date(now); today.setHours(0, 0, 0, 0);
  const diff = Math.round((d - today) / 86400000);
  const soon = diff <= 1;
  const when = diff === 0 ? 'сьогодні' : diff === 1 ? 'завтра' : (it.time || it.location || '');
  return `
    <article class="hm-evt${soon ? ' hm-evt--soon' : ''}" data-ev-id="${it.id}">
      <div class="hm-evt-date">
        <span class="hm-evt-d">${d.getDate()}</span>
        <span class="hm-evt-m">${escapeHtml(CM_MONTHS[d.getMonth()].slice(0, 3))}</span>
      </div>
      <h4 class="hm-evt-title">${escapeHtml(it.title)}</h4>
      <p class="hm-evt-meta">${escapeHtml(when)}</p>
    </article>`;
}

function renderEvList(el) {
  const now = new Date();
  el.innerHTML = _evItems.slice(0, EV_SHOWN).map(it => evTileHtml(it, now)).join('')
    + `<button class="hm-rail-end" type="button" data-switch-tab="shotam">${ICONS.arrowRight}Афіша</button>`;

  // Тап по плитці → САМЕ ця подія/свято у статейній модалці (як було в каруселі).
  el.querySelectorAll('[data-ev-id]').forEach(card => {
    card.addEventListener('click', () => {
      const id = Number(card.dataset.evId);
      if (Number.isFinite(id)) openShotamModal(id);
    });
  });
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
      el.innerHTML = '<div class="hm-empty">Контактів немає</div>';
      return;
    }

    const telOf = p => p.replace(/[^\d+]/g, '');

    // Г-10 (Рома 08.07): МІСЦЕВІ вгорі (головна цінність громади), ЕКСТРЕНІ внизу
    // компактно (101/102/103 усі знають). Блок нижчий. «Швидка 103» (group hero)
    // тепер звичайна плитка серед екстрених — без великої картки.
    const local     = list.filter(c => c.group === 'local');
    const emergency = list.filter(c => c.group === 'emergency' || c.group === 'hero' || c.priority === 'critical');
    // Порядок екстрених (Вова 14.07): 101 → 102 → 103 → 104 → 112, далі решта
    // (Волиньобленерго) у порядку даних. Сортуємо в коді — не залежить від даних.
    const EMERG_ORDER = ['101', '102', '103', '104', '112'];
    const emergRank = c => { const i = EMERG_ORDER.indexOf(String(c.phone || '').trim()); return i === -1 ? 99 : i; };
    emergency.sort((a, b) => emergRank(a) - emergRank(b));

    // 🔴 03.08 (потік «ПУЛЬС») — ТЕЛЕФОНИ В ОДИН РЯДОК.
    //
    // Шлях цього блока за день: 420px = 57.5% видимої зони (статичний довідник)
    // → 195px (три плитки + розкриття) → рядок ~64px.
    // Логіка та сама: 101 · 102 · 103 набирають не думаючи, решта потрібна
    // кілька разів на рік. Тепер вони не «секція», а тихий підвал екрана.
    // ⚠️ Розкриття робить <details>, а не JS: працює без скриптів, дає
    // клавіатуру і читач екрана, і не тримає стану в модулі — а він злітав би,
    // бо `initCommunity()` перебудовує #cm-content цілком.
    const rowHtml = c => `
      <a class="hm-tel-row" href="tel:${escapeHtml(telOf(c.phone))}">
        <span class="hm-tel-ic">${CONTACT_ICONS[c.icon] || CONTACT_ICONS.default}</span>
        <span class="hm-tel-row-text">
          <span class="hm-tel-name">${escapeHtml(c.name)}</span>
          <span class="hm-tel-num">${escapeHtml(c.phone)}</span>
        </span>
      </a>`;

    const quick = emergency.slice(0, 3);
    const rest  = [...local, ...emergency.slice(3)];

    el.innerHTML = `
      <details class="hm-tels">
        <summary>
          <span class="hm-tels-quick">${quick.map(c => `
            <a class="hm-tel-chip" href="tel:${escapeHtml(telOf(c.phone))}"
               aria-label="${escapeHtml(c.name)}">${escapeHtml(c.phone)}</a>`).join('')}</span>
          <span class="hm-tels-more">Усі телефони громади</span>
        </summary>
        ${rest.length ? `<div class="hm-tel-rows">${rest.map(rowHtml).join('')}</div>` : ''}
      </details>`;
  } catch {
    el.innerHTML = '<div class="hm-error">Контакти недоступні</div>';
  }
}

// ── Блок НОВИНИ у вкладці «Громада» ──────────────────────────────────────────
// 🔴 ПЕРЕРОБЛЕНО 31.07 (потік /byyou). Було: 3 кнопки-фільтри + ПРОКРУТКА карток
// усередині блока. Заміряно перед переробкою (390×844): блок займав **567px = 77.6%**
// видимої зони, а всередині нього стояв скролер із вікном 465px на вміст 6 933px —
// тобто **6 468px було сховано в картці**, яка з'їдала три чверті головного екрана.
// Це був ЄДИНИЙ вкладений скролер у Громаді (решта шість віджетів — рівно 0).
//
// Стало: **три найсвіжіші новини Громади, без прокрутки взагалі**. Уся глибина
// переїхала в повноекранний хаб (`tabs/news-hub.js`), куди веде тап по віджету.
//
// ⚠️ Чіпи категорій прибрані (рішення Вови 31.07). Причина не «щоб було чисто»:
// за живими даними Громада дає 0.26 статті на день, а «Україна та Світ» ~30 — тобто
// чіп у віджеті показував би **3 випадкові з 212**, і читати категорію все одно
// можна лише в хабі. Три кнопки під трьома картками були «вкладкою у вкладці»
// за кілька десятків пікселів від таб-бару.
// ⚠️ Гео-групи живуть одним місцем правди в `news.js` — тут своєї копії НЕМА.
const CM_NEWS_GROUP = NEWS_GEO_GROUPS[0];   // 'Громада' — місцеве і є сенсом головної

// 🔴 ТАБЛО = ДАЙДЖЕСТ, ПО ОДНІЙ НОВИНІ З КОЖНОГО СВІТУ (31.07, крок 5).
//
// Скарга Вови, з якої почався потік: «тут зараз тільки показує Олицьку громаду,
// а НЕЯСНО, ЩО РОБИТЬСЯ В СВІТІ І В УКРАЇНІ».
//
// Було: три найсвіжіші новини Громади. Стало: найсвіжіша з КОЖНОГО розділу —
// Громада, Волинь, «Україна та Світ» — і в кожної видно мітку розділу. Людина
// одним поглядом бачить: що вдома, що в області, що в країні. Так само влаштовані
// віджети Apple News і Google News.
//
// ⚠️ ЧОМУ НЕ ПОВЕРНУЛИ ЧІПИ-ФІЛЬТРИ, як просилось найпростіше: три кнопки над
// трьома картками — це «вкладка у вкладці» за кілька десятків пікселів від
// таб-бару, і тап по «Україна та Світ» однаково показав би 3 випадкові з 212.
// ⚠️ ЧОМУ НЕ «три найсвіжіші з усіх»: за темпом (Громада 0.26 статті на день,
// Волинь ~24, «Україна та Світ» ~30) місцеве програвало б майже завжди, і головний
// екран Олики показував би переважно Україну.
// ⚠️ ЦІНА, названа вголос і прийнята Вовою: місцевих новин на головній стає
// **1 замість 3**. Уся глибина Громади — за один тап, у хабі.
function digestOf(arts) {
  return NEWS_GEO_GROUPS
    .map(g => articlesOfGroup(arts, g)[0])
    .filter(Boolean);
}

// 🔴 03.08 (потік «ПУЛЬС») — НОВИНИ СТАЛИ ГОРИЗОНТАЛЬНОЮ СТРІЧКОЮ.
//
// Пряма вимога Вови: «Новини — лише один із блоків сторінки, а не вся сторінка».
// У варіанті 2 три новини коштували 362px вертикалі — половину видимої зони і
// найбільший блок екрана. Стрічка показує ті самі три (і ще кілька за жестом)
// приблизно вдвічі дешевше по висоті, а головне — перестає бути стіною.
//
// ⚠️ НАБІР НОВИН НЕ ЗМІНИВСЯ: перші три — по одній з КОЖНОГО розділу
// (Громада · Волинь · Україна та Світ). Це рішення 31.07 і воно про сенс:
// людина одним поглядом бачить, що вдома, що в області, що в країні. Далі
// стрічка добирає свіжі новини ГРОМАДИ — місцеве тут головне.
const CM_RAIL_MAX = 8;   // ⚠️ стеля стрічки: більше — і це вже прихований список

function railItems(arts) {
  // 🔴 04.08 — СТРІЧКА НЕ ПОВТОРЮЄ ТЕ, ЩО ВЖЕ В ГОЛОВНІЙ ПЛИТЦІ.
  // Слова Вови: «верхній віджет новини громади, культурна спадщина… воно
  // дублює новини в загальному». І це була справжня помилка: головна плитка
  // бере найсвіжішу новину Громади, і стрічка починалась із неї ж — та сама
  // новина двічі на одному екрані, за 300px одна від одної.
  const heroId = window.__cstlHeroArticleId;
  const skip = a => a && a.id === heroId;
  const digest = NEWS_GEO_GROUPS.map(g => articlesOfGroup(arts, g).find(a => !skip(a))).filter(Boolean);
  const seen = new Set(digest.map(a => a.id));
  const more = articlesOfGroup(arts, NEWS_GEO_GROUPS[0]).filter(a => !seen.has(a.id) && !skip(a));
  return [...digest, ...more].slice(0, CM_RAIL_MAX);
}

function paintCmNews(el, arts) {
  const top = railItems(arts);
  if (!top.length) {
    el.innerHTML = '<div class="hm-empty">Новин поки немає</div>';
  } else {
    el.innerHTML = newsCardsHtml(top, { variant: 'tile' })
      + `<button class="hm-rail-end" type="button" data-cm-news-all>${ICONS.arrowRight}Усі новини</button>`;
    // Мітка розділу — те, що робить дайджест дайджестом. Пишемо назву РОЗДІЛУ,
    // а не сире поле `geo`: у даних лежить 'Олика' (стара назва Громади) і
    // 'Світ', а читач знає три назви.
    [...el.querySelectorAll('.nc')].forEach((node, i) => {
      const b = node.querySelector('.nc-badge--geo');
      if (b && top[i]) b.textContent = geoGroupOf(top[i]) || b.textContent;
    });
  }
  paintNewsBadge(arts);
}

// «N нових» — лічильник свіжих новин ГРОМАДИ (не всіх: за темпом 0.26 статті на
// день у Громаді проти ~54 в решті, лічильник «по всьому» щоранку писав би «54»
// і став би шумом — розбір у `news.js`).
//
// 🔄 03.08: місце змінилось, правило — ні. Був у шапці багряного «приладу»
// (`.cm-news-board-bar`); тепер стоїть біля назви секції «Головне». Окремою
// функцією лишається з тієї самої причини, що й була: його кличе подія
// `cstl-news-seen` (гасіння після відвідин хаба), і перемальовувати заради
// цього весь блок новин не треба.
function paintNewsBadge(arts) {
  const head = document.querySelector('#hm-news .hm-sec-title');
  if (!head) return;
  const n = countNewCommunity(arts);
  const old = head.parentElement.querySelector('.hm-new-badge');
  if (!n) { if (old) old.remove(); return; }
  const html = `<span class="hm-new-badge">${n} ${pluralNew(n)}</span>`;
  if (old) old.outerHTML = html;
  else head.insertAdjacentHTML('afterend', html);
}

// «1 нова · 2 нові · 5 нових» — українська має три форми, і «1 нових» різало б око.
// Окремо 11-14: вони беруть форму «нових» попри останню цифру («11 нових», не «11 нова»).
function pluralNew(n) {
  const t = n % 100, o = n % 10;
  if (t >= 11 && t <= 14) return 'нових';
  if (o === 1) return 'нова';
  if (o >= 2 && o <= 4) return 'нові';
  return 'нових';
}

export async function renderCommunityNews() {
  const el = document.getElementById('cm-news-content');
  if (!el) return;
  const arts = await ensureNewsLoaded();
  paintCmNews(el, arts);

  // Делеговані слухачі — ОДИН раз на секцію.
  // ⚠️ Прапорець на ЕЛЕМЕНТІ, а не в модулі: `initCommunity()` перебудовує
  // `#cm-content` цілком, тобто секція щоразу НОВИЙ вузол.
  const section = document.getElementById('hm-news');
  if (!section || section.dataset.wired) return;
  section.dataset.wired = '1';
  // 🔴 31.07: биті чужі фото → брендовий плейсхолдер 🏰. До цього обробник висів на
  // модалці статті і на хабі, а САМЕ ТАБЛО лишалось без нього — і на головному
  // екрані показувалась системна іконка «зламане зображення». Це не рідкість:
  // чужі RSS-джерела масово блокують «гарячі посилання» на картинки (через це
  // обробник і експортували з `news.js`). Знайдено скріншотом при редизайні табла.
  // ⚠️ `error` НЕ спливає, тому слухаємо у фазі ЗАХОПЛЕННЯ (третій аргумент `true`).
  // Обробник СПІЛЬНИЙ — своєї копії тут нема.
  section.addEventListener('error', handleImgError, true);
  section.addEventListener('click', e => {
    // Картка → стаття. Стоїть ПЕРШИМ: картки лежать усередині віджета, а сам віджет
    // теж веде в хаб — без цієї черговості тап по новині відкривав би хаб.
    const card = e.target.closest('[data-article-id]');
    if (card) {
      const id = Number(card.dataset.articleId);
      if (Number.isFinite(id)) openArticle(id);
      return;
    }
    // Будь-яке інше місце секції (назва, «Усі новини», порожнє поле) → хаб.
    // Категорію передаємо ЯВНО: віджет показує Громаду, тож і хаб має відкритись на
    // Громаді. Інакше людина тапала б по місцевій новині, а потрапляла у «Волинь»,
    // яку востаннє гортала (хаб памʼятає останню категорію для свайпів усередині себе).
    openNewsHub(CM_NEWS_GROUP);
  });

  // Хаб відкрили → новини побачено → бейдж гасне. Слухаємо ПОДІЮ, а не імпортуємо
  // хаб назад (він уже імпортований звідси — зворотний імпорт замкнув би коло).
  window.addEventListener('cstl-news-seen', () => paintNewsBadge(arts));
}
