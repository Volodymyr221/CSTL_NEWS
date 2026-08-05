// src/tabs/community-blocks.js
// Всі render-блоки головної вкладки «Громада» (винесено з community.js 13.05).
// Експортовані: renderWeatherBlock, renderPowerBlock, renderBusBlock,
//               renderBoardBlock, renderEventBlock, renderContactsBlock.
//
// Кожен блок завантажує свої дані самостійно через fetch.
// Помилка одного блоку не ламає інші.

import { escapeHtml, formatTime, getCoords, getCityName, pad, todayKey, attachSwipe, showToast } from '../core/utils.js';
import { coordsOf, locationGroups, isKnownPlace } from '../core/settlements-geo.js';
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

// Вкладка Автобуси змінила відстеження → одразу перемальовуємо віджет Громади
// (якщо вкладка Громада зараз не в DOM — renderBusBlock тихо вийде на null).
window.addEventListener('cstl-bus-track-changed', () => { renderBusBlock(); });
// Вхід/вихід → теж оновити віджет (персональні відстеження з'являються/зникають).
onAuthChange(() => { renderBusBlock(); });

// ⚠️ 04.08: стан автопрокрутки віджета Дошки (`_bwTimer`, `_bwResume`,
// `BW_STEP_MS`, `BW_RESUME_MS`, `BW_MAX_CARDS`) видалено разом із самою
// каруселлю — вона була єдиним вкладеним скролером сторінки і одним із
// чотирьох автоматичних рухів. Деталі — у шапці «Блок 4» нижче.

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

// ── ВИБІР НАСЕЛЕНОГО ПУНКТУ (05.08) ──────────────────────────────────────────
// Замовлення Вови: «потрібно окремо десь вивести населений пункт… щоб при
// натиску можна було вибрати список сіл, міст Олицької громади… І плюс Луцьк».
//
// Причина, названа Вовою: локація ховалась у рядку «Ясно / Луцьк · відчувається
// 31°» і там губилась. Тепер це самостійний елемент керування.
//
// 🔑 `null` = «за геолокацією» (те, як було завжди). Тобто вибір НЕ обовʼязковий:
// хто нічого не чіпав, отримує рівно ту саму поведінку, що й до цієї зміни.
const WX_PLACE_KEY = 'wx_place_v1';

function loadWxPlace() {
  try {
    const v = localStorage.getItem(WX_PLACE_KEY);
    // Перевіряємо, що назва досі «наша»: список НП може змінитись, і тоді
    // старий запис у сховищі вказував би в нікуди.
    return v && isKnownPlace(v) ? v : null;
  } catch { return null; }
}

function saveWxPlace(name) {
  try {
    if (name) localStorage.setItem(WX_PLACE_KEY, name);
    else localStorage.removeItem(WX_PLACE_KEY);
  } catch { /* приватний режим — вибір просто не переживе перезапуск */ }
}

export async function renderWeatherBlock() {
  const el = document.getElementById('cm-weather-content');
  if (!el) return;

  try {
    // Обраний пункт має пріоритет над геолокацією. Якщо координат для нього
    // з'ясувати не вдалося — НЕ підставляємо чуже місце мовчки, а вертаємось до
    // геолокації і кажемо про це у підписі.
    const place = loadWxPlace();
    let picked = null;
    if (place) picked = await coordsOf(place);
    const placeFailed = !!place && !picked;

    const geo = picked ? null : await getCoords();
    const lat = picked ? picked.lat : geo.lat;
    const lon = picked ? picked.lon : geo.lon;
    const knownCity = picked ? place : geo.city;
    // 🔴 04.08 — НАЗВА МІСТА БІЛЬШЕ НЕ ТРИМАЄ ПОГОДУ.
    // Було `Promise.all([погода, getCityName()])`, тобто температура не
    // показувалась, поки не відповість Nominatim (OpenStreetMap) — а він
    // сторонній, без таймауту і буває недоступний. Знайдено 04.08 контрольним
    // знімком: погода вічно висіла скелетом, хоча Open-Meteo вже відповів.
    // Тепер місто має власний таймаут 3с і фолбек «Олика»: це підпис, а не дані.
    const cityP = knownCity
      ? Promise.resolve(knownCity)
      : Promise.race([
          getCityName(lat, lon).catch(() => null),
          new Promise(r => setTimeout(() => r(null), 3000)),
        ]);
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,apparent_temperature` +
      `&hourly=temperature_2m,precipitation_probability,weather_code` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min` +
      `&forecast_days=7&timezone=auto`
    );
    const cityName = (await cityP) || 'Олика';
    const data = await weatherRes.json();
    _wxData = { ...data, city: cityName }; // кеш для модалки по годинах
    const cur  = data.current;
    const day  = data.daily;
    const info = weatherCodeInfo(cur.weather_code);
    const temp  = Math.round(cur.temperature_2m);
    const feels = Math.round(cur.apparent_temperature);

    setWeatherTitle(cityName);

    // 🔴 04.08 — ПОГОДА ЖИВЕ В ШАПЦІ ГОЛОВНОЇ, а не окремим блоком унизу.
    // Була ПЕРЕДОСТАННЬОЮ секцією, початок на 1839px: щоб побачити температуру,
    // треба було прогорнути 2.5 екрана (а з шапки застосунку погоду прибрали
    // 08.07, тобто вгорі її не було ніде).
    // ⚠️ Змінилась ЛИШЕ подача. Кеш `_wxData`, ряд 7 днів і перехід
    // `openWeatherDayModal(i)` — ті самі, тому модалка по годинах зі скрабером
    // працює як працювала. Саме тому id контейнера лишився `cm-weather-content`.
    const forecastHtml = day.time.map((dateStr, i) => {
      const d = new Date(dateStr + 'T00:00:00');
      const wd = i === 0 ? 'Сьог' : WEEKDAYS_UA[d.getDay()];
      const dayInfo = weatherCodeInfo(day.weather_code[i]);
      const tMax = Math.round(day.temperature_2m_max[i]);
      return `
        <button type="button" class="hm-wx-day${i === 0 ? ' hm-wx-day--today' : ''}" data-wx-day="${i}"
                aria-label="${escapeHtml(wd)}, до ${tMax} градусів">
          <span class="hm-wx-wd">${escapeHtml(wd)}</span>
          <span class="hm-wx-icon">${dayInfo.icon}</span>
          <span class="hm-wx-max">${tMax}°</span>
        </button>
      `;
    }).join('');

    // 🔴 05.08 — ІНДИКАТОР ЗМІНИ. Рахується з даних, які вже прийшли в цій самій
    // відповіді (`daily.temperature_2m_max`, `hourly.precipitation_probability`),
    // тобто НЕ вигаданий і не потребує жодного нового запиту.
    // Порядок важливий: дощ витісняє градуси. «Завтра тепліше» — приємно знати,
    // «сьогодні дощ» — треба знати.
    const hint = weatherHint(data);

    el.classList.remove('hm-wx--loading');
    el.innerHTML = `
      <div class="hm-wx-main">
        <div class="hm-wx-t">${temp}°</div>
        <div class="hm-wx-txt">
          <div class="hm-wx-desc">${escapeHtml(info.text)}</div>
          <div class="hm-wx-sub">${escapeHtml(subLine(temp, feels, hint))}</div>
        </div>
        <button class="hm-wx-place" type="button" data-wx-place
                aria-label="Вибрати населений пункт">
          <span class="hm-wx-place-pin" aria-hidden="true">${ICONS.pin}</span>
          <span class="hm-wx-place-n">${escapeHtml(cityName || 'Олика')}</span>
          <span class="hm-wx-place-ch" aria-hidden="true">${ICONS.chevronDown}</span>
        </button>
      </div>
      <div class="hm-wx-days">${forecastHtml}</div>
    `;

    // Клік на день → модалка «по годинах» (температура + опади).
    // ⚠️ НЕ ЗМІНЮВАЛОСЬ і навмисно: у пораді, яку приніс Вова, було «тап по дню
    // хай перемикає верх картки». Це прибрало б наявну модалку зі скрабером,
    // якої ніхто не просив прибирати. Вова підтвердив — лишаємо як є.
    el.querySelectorAll('[data-wx-day]').forEach(btn => {
      btn.addEventListener('click', () => openWeatherDayModal(+btn.dataset.wxDay));
    });
    el.querySelector('[data-wx-place]')?.addEventListener('click', openPlaceSheet);

    // Обраний пункт не вдалося визначити — сказати прямо. Мовчазний показ
    // погоди іншого місця під назвою села був би гіршим за помилку.
    if (placeFailed) showToast(`Не вдалося визначити «${place}» — показано за геолокацією`, 0, 'error');
  } catch {
    // Помилка погоди не ламає шапку: рядок замість блоку, решта сторінки жива
    // (кожен блок головної падає самостійно).
    el.classList.remove('hm-wx--loading');
    el.innerHTML = '<div class="hm-wx-err">Погода тимчасово недоступна</div>';
  }
}

// 🔴 ОДИН РЯДОК ПІД ТЕМПЕРАТУРОЮ, А НЕ ДВА ЗЧЕПЛЕНІ.
// Перша версія клеїла «відчувається 17° · опади о 17:00» — і на знімку рядок
// перенісся надвоє, бо чіп локації праворуч звузив колонку тексту. Наслідок
// гірший за косметику: висота картки почала залежати від погоди, а «сторінка не
// має сіпатись» — правило цієї головної з першого дня.
// Тому показуємо РІВНО ОДНЕ повідомлення, і виграє те, що важливіше:
//   • різниця «відчувається» від 3° — це те, як одягатись ПРЯМО ЗАРАЗ;
//   • інакше підказка про дощ чи завтрашню зміну — вона про рішення на день;
//   • інакше звичайне «відчувається».
function subLine(temp, feels, hint) {
  const gap = Math.abs(feels - temp);
  if (gap >= 3) return `відчувається ${feels}°`;
  if (hint)     return hint;
  return `відчувається ${feels}°`;
}

// Коротка підказка під температурою. Тільки з даних поточної відповіді.
// 🔴 Порядок перевірок = порядок важливості для людини, а не зручності коду:
// дощ сьогодні важливіший за «завтра на два градуси тепліше».
function weatherHint(data) {
  const h = data.hourly, d = data.daily;
  try {
    // 1. Найближчі опади сьогодні: перша година попереду з ймовірністю ≥ 60%.
    //    60, а не 50: на половині шансів казати «буде дощ» — це вгадування.
    const offsetSec = data.utc_offset_seconds ?? 7200;
    const now = new Date(Date.now() + offsetSec * 1000);
    const today = now.toISOString().slice(0, 10);
    const nowH = now.getUTCHours();
    if (h?.time && h.precipitation_probability) {
      for (let i = 0; i < h.time.length; i++) {
        const t = h.time[i];
        if (!t.startsWith(today)) continue;
        const hour = +t.slice(11, 13);
        if (hour <= nowH) continue;
        if ((h.precipitation_probability[i] ?? 0) >= 60) return `опади о ${pad(hour)}:00`;
      }
    }
    // 2. Інакше — наскільки завтра відрізняється. Різницю менше 2° не показуємо:
    //    один градус у прогнозі на добу — це шум моделі, а не новина.
    if (d?.temperature_2m_max?.length > 1) {
      const diff = Math.round(d.temperature_2m_max[1]) - Math.round(d.temperature_2m_max[0]);
      if (diff >= 2)  return `завтра тепліше на ${diff}°`;
      if (diff <= -2) return `завтра прохолодніше на ${Math.abs(diff)}°`;
    }
  } catch { /* підказка необовʼязкова — її відсутність нічого не ламає */ }
  return '';
}

// ── Шторка вибору населеного пункту (05.08) ──────────────────────────────────
// Використовує ТОЙ САМИЙ примітив `openModal({ variant: 'sheet' })`, що й решта
// аркушів застосунку — разом зі свайпом-закриттям і затемненням. Власного
// механізму шторки тут не заводимо: модалка погоди по годинах уже довела, що
// примітив працює, а друга реалізація означала б другу поведінку.
function openPlaceSheet() {
  const current = loadWxPlace();
  const groups = locationGroups();

  const rowHtml = (name, active) => `
    <button class="wxp-row${active ? ' wxp-row--on' : ''}" type="button" data-place="${escapeHtml(name)}">
      <span class="wxp-row-n">${escapeHtml(name)}</span>
      ${active ? '<span class="wxp-row-ok" aria-hidden="true">✓</span>' : ''}
    </button>`;

  const bodyHtml = `
    <div class="wxp">
      <button class="wxp-row wxp-row--geo${!current ? ' wxp-row--on' : ''}" type="button" data-place="">
        <span class="wxp-row-n"><span class="wxp-row-ic" aria-hidden="true">${ICONS.pin}</span>За моїм місцем</span>
        ${!current ? '<span class="wxp-row-ok" aria-hidden="true">✓</span>' : ''}
      </button>
      ${groups.map(g => `
        <div class="wxp-grp">${escapeHtml(g.title)}</div>
        ${g.items.map(n => rowHtml(n, n === current)).join('')}
      `).join('')}
      <p class="wxp-note">
        Села громади лежать близько одне до одного, тож прогноз для них
        здебільшого однаковий. Помітніше відрізняється Луцьк.
      </p>
    </div>`;

  const { close, el } = openModal({
    title: 'Населений пункт',
    bodyHtml,
    variant: 'sheet',
    className: 'app-modal--wxplace',
  });

  el.addEventListener('click', e => {
    const btn = e.target.closest('[data-place]');
    if (!btn) return;
    saveWxPlace(btn.dataset.place || null);
    close();
    // Перемальовуємо блок повністю: змінилась не лише назва, а всі числа.
    const wx = document.getElementById('cm-weather-content');
    if (wx) { wx.classList.add('hm-wx--loading'); wx.innerHTML = '<div class="hm-wx-sk"></div>'; }
    renderWeatherBlock();
  });
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

// ── Блок 4: Віджет Дошки ─────────────────────────────────────────────────────
// 🔴 ПЕРЕРОБЛЕНО 04.08 (аудит + замовлення Вови «дошку оголошень ти розміщаєш
// по-старому»). Було: темний «корок» + ГОРИЗОНТАЛЬНА СТРІЧКА пар карток-стікерів
// з автопрокруткою кожні 5с, крапками-індикаторами і масштабуванням при гортанні.
//
// Три причини прибрати, і жодна з них не «смак»:
//   1. це був ЄДИНИЙ вкладений скролер сторінки — той самий клас проблеми, який
//      31.07 прибирали з віджета новин (там у вікні 465px ховалось 6933px);
//   2. автопрокрутка — один із чотирьох автоматичних рухів, через які сторінка
//      ніколи не стояла на місці (діагноз №4 аудиту 03.08);
//   3. подвійний заголовок: секція вже називається «Оголошення», а всередині
//      віджета стояла ще й плашка «АКТУАЛЬНІ ОГОЛОШЕННЯ ГРОМАДИ».
//
// Стало: три РЯДКИ у спільній мові головної (.hm-card), тап → та сама зум-модалка
// оголошення. Перехід на вкладку Дошка живе в заголовку секції («Дошка →»).
// ⚠️ Разом із каруселлю пішли `.cmbw-strip` / `.cmbw-dots` / `.cmbw-edge` /
// `.cmbw-foot` і весь код автопрокрутки (~120 рядків). CSS цих класів лишився в
// community.css — його чіпає ще прев'ю подачі оголошення.

const BW_PIN_SVG = '<svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>';

// Скільки оголошень показує головна. Три — щоб секція читалась як «є життя»,
// але не перетворювалась на другу Дошку.
const BOARD_ROWS = 3;

// Оголошення поточного рендеру — читає делегований слухач (він вішається один раз).
let _boardAds = [];

// Один РЯДОК оголошення у мові головної: фото 64px ліворуч, категорія,
// заголовок у два рядки, локація і час.
// 🔑 `cardTitleText` не копіюємо: 9 із 19 оголошень назви не мають, і саме тому
// на самій Дошці заголовок беруть як перше речення тексту. Тут та сама логіка.
function bwRowHtml(p) {
  const photo = (Array.isArray(p.photos) && p.photos.find(x => x)) || p.photo;
  const raw = (p.title && p.title.trim()) || (p.text || '').trim();
  const title = raw.length > 70 ? raw.slice(0, 70).replace(/\s+\S*$/, '') + '…' : (raw || 'Оголошення');
  const locLabel = p.location ? (p.location === COMMUNITY_ALL ? COMMUNITY_ALL_LABEL : p.location) : '';
  const ts = p.ts || (p.published_at && new Date(p.published_at).getTime()) || (p.created_at && new Date(p.created_at).getTime());
  const color = catColor(p.category);
  const cover = photo
    ? `<span class="hm-ad-ph" style="background-image:url('${escapeHtml(photo)}')"></span>`
    : `<span class="hm-ad-ph hm-ad-ph--none">${catIcon(p.category)}</span>`;
  return `
    <article class="hm-card hm-card--tap hm-ad" data-bw-id="${p.id}">
      ${cover}
      <span class="hm-ad-body">
        <span class="cm-board-cat cm-board-cat--${escapeHtml(color)} hm-ad-cat">${catIcon(p.category)} ${escapeHtml(catShort(p.category || ''))}</span>
        <span class="hm-ad-name">${escapeHtml(title)}</span>
        <span class="hm-ad-meta">
          ${locLabel ? `<span class="hm-ad-loc">${BW_PIN_SVG}${escapeHtml(locLabel)}</span>` : '<span></span>'}
          ${ts ? `<span>${formatTime(ts)}</span>` : ''}
        </span>
      </span>
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

  try {
    // 1. Дані: Supabase спочатку, JSON-fallback якщо не вийшло.
    let posts = [], usedSupabase = false;
    if (isSupabaseReady()) {
      const p = await fetchPublishedPosts();
      if (p !== null) { posts = p; usedSupabase = true; }
    }
    if (!usedSupabase) {
      const boardRes = await fetch('./data/community-board.json');
      posts = ((await boardRes.json()).posts) || [];
    }

    // 2. Лише оголошення (type board), уся громада без фільтра населеного пункту.
    //    Порядок ВИПАДКОВИЙ (рішення Вови 13.07): віджет не дублює «свіжі вгорі»
    //    вкладки, а дає рівний шанс усім оголошенням — кожне відкриття Громади
    //    показує інший набір.
    const ads = posts.filter(p => (p.type || 'board') === 'board');
    const shown = bwShuffle(ads).slice(0, BOARD_ROWS);

    el.classList.remove('cm-loading');
    el.innerHTML = ads.length
      ? shown.map(bwRowHtml).join('')
      : '<div class="hm-empty">На дошці поки порожньо — подайте перше оголошення</div>';

    // 3. Тап по рядку → зум САМЕ цього оголошення (та сама модалка, що на Дошці).
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('click', e => {
        const card = e.target.closest('[data-bw-id]');
        if (!card) return;
        const id = Number(card.dataset.bwId);
        const post = (_boardAds || []).find(p => p.id === id);
        if (post) openAdModalStandalone(post);
      });
    }
    // Список живе поза замиканням слухача: слухач вішається ОДИН раз, а дані
    // перечитуються при кожному рендері. Інакше після оновлення блока тап
    // відкривав би оголошення з першого завантаження (той самий клас помилки,
    // що виправляли у «Стрічці» 28.07 — слухач памʼятав стан на момент відкриття).
    _boardAds = ads;
  } catch {
    el.innerHTML = '<div class="hm-empty">Дошка тимчасово недоступна</div>';
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
      el.innerHTML = '<div class="hm-empty">Поки немає запланованих подій у громаді</div>';
      return;
    }

    // 🔴 04.08 — КАРУСЕЛЬ ЗНЯТО. Було: 5 слайдів, автоматична зміна кожні 6с,
    // крапки-індикатори, фіолетовий градієнт свята. Тобто з пʼяти подій людина
    // бачила ОДНУ, решту треба було дочекатись — і це був один із чотирьох
    // автоматичних рухів сторінки (діагноз №4 аудиту 03.08).
    // Плюс фіолетовий був сьомою візуальною мовою на екрані.
    // Стало: ТРИ рядки в тій самій мові, що новини й оголошення. Видно одразу
    // три замість однієї, ніщо не рухається саме.
    _evItems = items;
    el.innerHTML = items.slice(0, EVENT_ROWS).map(evRowHtml).join('');

    // Тап → та сама картка події, що була (openShotamModal). Перехід не змінено.
    if (!el.dataset.wired) {
      el.dataset.wired = '1';
      el.addEventListener('click', e => {
        const row = e.target.closest('[data-ev-id]');
        if (!row) return;
        const it = (_evItems || []).find(x => String(x.id) === row.dataset.evId);
        if (it && it.kind === 'event') openShotamModal(it.id);
      });
    }
  } catch {
    el.innerHTML = '<div class="hm-empty">Події недоступні</div>';
  }
}

// Скільки подій показує головна. Три — рівно стільки, скільки вміщується без
// того, щоб секція почала змагатися з новинами за увагу.
const EVENT_ROWS = 3;

// Один РЯДОК події. Ліворуч — дата стовпчиком (число + місяць): це те, за чим
// подію шукають очима, і воно читається швидше за будь-яку іконку.
// ⚠️ Свята (kind: 'holiday') не мають картки для відкриття — вони не клікабельні
// і тому не отримують `data-ev-id`. Мовчазний тап у нікуди гірший за його
// відсутність.
const EV_MONTHS_SHORT = ['січ','лют','бер','кві','тра','чер','лип','сер','вер','жов','лис','гру'];
function evRowHtml(it) {
  const d = new Date(it.date + 'T00:00:00');
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((d - today) / 86400000);
  const when = days === 0 ? 'сьогодні' : days === 1 ? 'завтра' : `через ${days} дн.`;
  const isEvent = it.kind === 'event';
  return `
    <article class="hm-card${isEvent ? ' hm-card--tap' : ''} hm-ev"${isEvent ? ` data-ev-id="${escapeHtml(String(it.id))}"` : ''}>
      <span class="hm-ev-date">
        <span class="hm-ev-d">${d.getDate()}</span>
        <span class="hm-ev-m">${EV_MONTHS_SHORT[d.getMonth()]}</span>
      </span>
      <span class="hm-ev-body">
        <span class="hm-ev-ttl">${escapeHtml(it.title)}</span>
        <span class="hm-ev-meta">${escapeHtml(when)}${it.time ? ' · ' + escapeHtml(it.time) : ''}${it.location ? ' · ' + escapeHtml(it.location) : ''}</span>
      </span>
    </article>`;
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

// 🗑 renderContactsBlock ПЕРЕЇХАЛА 04.08 у `src/tabs/home-contacts.js`.
// Причина — не обсяг коду, а зміна СУТІ блока: екстрені служби (101/102/103)
// відділено від контактів громади, бо під заголовком «Телефони громади» вони
// казали неправду (скарга Вови). Разом із цим зʼявились категорії, розкриття
// і швидкі дії — це вже окрема система, а не рендер списку.

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

// 🔴 04.08 (вечір) — КАРУСЕЛЬ ПО КАТЕГОРІЯХ, замовлення Вови: «щоб воно
// скролилось горизонтально по три карточки протягом деякого часу з певним
// інтервалом між категоріями Громада, Волинь, Україна та Світ».
//
// ⚠️ ЦЕ НЕ ПОВЕРНЕННЯ ТІЄЇ КАРУСЕЛІ, ЯКУ ПРИБИРАЛИ 31.07 — і різницю варто
// назвати, бо на вигляд вони схожі. Там у вікні 465px ховалось 6933px вмісту:
// скролер був НЕСКІНЧЕННИЙ, і побачити все можна було тільки гортанням.
// Тут рівно ТРИ сторінки по три картки, кожна показується цілком і сама.
// Тобто вміст не ховається — він чергується.
//
// 🛡 ЗАПОБІЖНИКИ РУХУ — ті самі, що в капсулах (`home-caps.js`):
//   • `document.hidden` → стоп;  • поза екраном (`IntersectionObserver`) → стоп;
//   • `prefers-reduced-motion` → авто-гортання не запускається взагалі;
//   • дотик пальцем → пауза (людина читає — не смикаємо під рукою).
const NEWS_PER_PAGE = 3;
const NEWS_CYCLE_MS = 7000;   // довше за капсули: тут треба встигнути прочитати
let _newsTimer = null, _newsIO = null;

function paintCmNews(el, arts) {
  // Стрічка плиток, згрупована за категоріями: спершу Громада, далі Волинь,
  // далі Україна та Світ. Підпис над стрічкою міняється за тим, яка картка
  // зараз у вікні — тобто «інтервал між категоріями» лишився, але тепер він
  // природний: гортаєш і проходиш категорії, а не чекаєш перемикання сторінки.
  const groups = NEWS_GEO_GROUPS
    .map(g => ({ group: g, items: articlesOfGroup(arts, g).slice(0, NEWS_PER_PAGE) }))
    .filter(p => p.items.length);

  if (!groups.length) {
    el.innerHTML = '<div class="hm-empty">Новини зʼявляться, щойно вийде перша за сьогодні</div>';
    paintNewsBadge(arts);
    return;
  }

  // Плаский список карток + мапа «індекс картки → категорія» для підпису.
  const flat = [];
  groups.forEach(g => g.items.forEach(a => flat.push({ a, group: g.group })));

  el.innerHTML = `
    <div class="hm-nwrap">
      <div class="hm-ncat" id="hm-ncat">${escapeHtml(flat[0].group)}</div>
      <div class="hm-ntrack" id="hm-ntrack">
        ${flat.map(x => newsCardsHtml([x.a], { variant: 'tile' })).join('')}
      </div>
      <div class="hm-ndots" aria-hidden="true">
        ${groups.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}
      </div>
    </div>`;

  // Мітка розділу на самій картці — щоб і поза стрічкою було видно, звідки новина.
  [...el.querySelectorAll('.nc')].forEach((node, i) => {
    const b = node.querySelector('.nc-badge--geo');
    if (b) b.textContent = geoGroupOf(flat[i].a) || b.textContent;
  });

  startNewsCarousel(el, flat, groups);
  paintNewsBadge(arts);
}

// Авто-гортання сторінок. Прокрутку робить сам браузер (`scrollTo` зі `smooth`),
// а не наша анімація: так жест пальцем і авто-рух не борються за той самий
// елемент — це вже коштувало окремого блока роботи 02.08 у модалці оголошення.
function startNewsCarousel(el, flat, groups) {
  clearInterval(_newsTimer); _newsTimer = null;
  if (_newsIO) { _newsIO.disconnect(); _newsIO = null; }

  const track = el.querySelector('#hm-ntrack');
  const catEl = el.querySelector('#hm-ncat');
  const dots = [...el.querySelectorAll('.hm-ndots i')];
  if (!track || flat.length < 2) return;

  const cards = [...track.querySelectorAll('.nc')];
  const groupNames = groups.map(g => g.group);

  // Яка картка зараз у вікні — рахуємо за реальним положенням прокрутки, а не
  // за власним лічильником: людина могла гортнути пальцем, і лічильник
  // розійшовся б із тим, що на екрані.
  const visibleIndex = () => {
    const left = track.scrollLeft;
    let best = 0, bestD = Infinity;
    cards.forEach((c, i) => {
      const d = Math.abs(c.offsetLeft - track.offsetLeft - left);
      if (d < bestD) { bestD = d; best = i; }
    });
    return best;
  };
  const sync = () => {
    const i = visibleIndex();
    const g = flat[i] ? flat[i].group : groupNames[0];
    if (catEl && catEl.textContent !== g) catEl.textContent = g;
    const gi = groupNames.indexOf(g);
    dots.forEach((d, j) => d.classList.toggle('on', j === gi));
  };
  let raf = 0;
  track.addEventListener('scroll', () => {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; sync(); });
  }, { passive: true });
  sync();

  const still = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (still) return;

  const step = () => {
    if (document.hidden || track.dataset.paused === '1') return;
    const next = visibleIndex() + 1;
    const target = next >= cards.length ? cards[0] : cards[next];
    track.scrollTo({ left: target.offsetLeft - track.offsetLeft, behavior: 'smooth' });
  };
  _newsTimer = setInterval(step, NEWS_CYCLE_MS);

  let resume = null;
  const pause = () => {
    track.dataset.paused = '1';
    clearTimeout(resume);
    resume = setTimeout(() => { track.dataset.paused = '0'; resume = null; }, NEWS_CYCLE_MS * 2);
  };
  track.addEventListener('touchstart', pause, { passive: true });
  track.addEventListener('pointerdown', pause);

  if ('IntersectionObserver' in window) {
    _newsIO = new IntersectionObserver(entries => {
      entries.forEach(en => {
        if (!en.isIntersecting) track.dataset.paused = '1';
        else if (!resume) track.dataset.paused = '0';
      });
    }, { threshold: 0 });
    _newsIO.observe(track);
  }
}

// «N нових» у заголовку секції — на місці, де до 31.07 стояв фальшивий «LIVE».
// Окремою функцією, бо її кличе ще й подія `cstl-news-seen` (гасіння після хаба),
// і перемальовувати заради цього весь віджет не треба.
// ⚠️ 04.08 якір змінився: шапки-кнопки `.cm-news-board-bar` більше немає,
// бейдж чіпляється до `.hm-kicker` секції новин.
function paintNewsBadge(arts) {
  const head = document.querySelector('#cm-news-board .hm-sec-head');
  if (!head) return;
  const n = countNewCommunity(arts);
  const old = head.querySelector('.cm-news-new');
  if (!n) { if (old) old.remove(); return; }
  const html = `<span class="cm-news-new">${n} ${pluralNew(n)}</span>`;
  if (old) old.outerHTML = html;
  else head.querySelector('.hm-kicker')?.insertAdjacentHTML('afterend', html);
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

  // Делеговані слухачі — вішаємо ОДИН раз на секцію блока.
  // ⚠️ 04.08: якір `.cm-block--news` замінено на `#cm-news-board`. Клас зник
  // разом зі старою розміткою головної, і делегат тихо перестав вішатись —
  // тобто тап по новині НЕ відкривав би статтю. Спіймав стенд `news-widget.mjs`
  // (саме той випадок, заради якого сторожі й тримають).
  const section = document.getElementById('cm-news-board');
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
    // Будь-яке інше місце віджета (шапка, «Усі новини», порожнє поле) → хаб.
    // Категорію передаємо ЯВНО: віджет показує Громаду, тож і хаб має відкритись на
    // Громаді. Інакше людина тапала б по місцевій новині, а потрапляла у «Волинь»,
    // яку востаннє гортала (хаб памʼятає останню категорію для свайпів усередині себе).
    openNewsHub(CM_NEWS_GROUP);
  });

  // Хаб відкрили → новини побачено → бейдж гасне. Слухаємо ПОДІЮ, а не імпортуємо
  // хаб назад (він уже імпортований звідси — зворотний імпорт замкнув би коло).
  window.addEventListener('cstl-news-seen', () => paintNewsBadge(arts));
}
