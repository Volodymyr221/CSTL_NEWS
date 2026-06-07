import { escapeHtml } from '../core/utils.js';
import {
  toMinutes, minsToHHMM, nowMinutes,
  getStopMins, getStopHHMM, getRouteState, getRouteTimings,
  formatCountdownUpper,
} from '../core/bus-schedule.js';

const PREFS_KEY = 'bus_prefs_v2';

let busData       = null;
let busDay          = getTodayISO(); // "2026-06-07" — обраний день у тижневій смужці
let weekPage        = 0;             // 0 = поточний тиждень, 1 = наступний тиждень
let fromStop        = '';
let toStop          = '';
let showAll         = false;
let timerInterval   = null;
let expandedIds     = new Set();
let activeField     = null; // 'from' | 'to' — яке поле зараз відкрите в дропдауні
let smartRowIndex   = 0;    // поточна картка у каруселі hero
let selectedRouteId = null; // для майбутніх днів: яку картку показує hero

function getTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

function getDayData() {
  // Нова структура: busData.days["2026-06-07"] = { routes, fetchedAt, fetchedTime }
  // Зворотна сумісність: якщо days відсутній — стара структура з busData.routes
  if (busData?.days) return busData.days[busDay] || { routes: [], fetchedAt: '', fetchedTime: '' };
  if (busDay === getTodayISO()) return {
    routes: busData?.routes || [],
    fetchedAt: busData?.verifiedAt || '',
    fetchedTime: busData?.verifiedTime || '',
  };
  return { routes: [], fetchedAt: '', fetchedTime: '' };
}

function isViewingToday() { return busDay === getTodayISO(); }

function formatBusDayTitle() {
  const [year, month, day] = busDay.split('-').map(Number);
  const months = ['СІЧНЯ','ЛЮТОГО','БЕРЕЗНЯ','КВІТНЯ','ТРАВНЯ','ЧЕРВНЯ',
                  'ЛИПНЯ','СЕРПНЯ','ВЕРЕСНЯ','ЖОВТНЯ','ЛИСТОПАДА','ГРУДНЯ'];
  return `НА ${day} ${months[month - 1]} ${year}`;
}

function buildListTitleHtml(updatedStr) {
  return `<div class="bus-list-title">РОЗКЛАД АВТОБУСНИХ МАРШРУТІВ<span class="bus-list-date-sub">${formatBusDayTitle()}</span><span class="bus-list-updated-sub">${updatedStr}</span></div>`;
}

// Для hero-картки: для не-сьогоднішніх днів скидаємо state→'waiting',
// progress→0, minsToDeparture/minsToArrival→null (немає відліку).
function getTimingsForDisplay(route) {
  if (isViewingToday()) return getRouteTimings(route);
  const base = getRouteTimings(route);
  return { ...base, state: 'waiting', progress: 0, minsToDeparture: null, minsToArrival: null };
}

// ── Preferences (localStorage — збереження налаштувань у браузері) ────
function savePrefs() {
  localStorage.setItem(PREFS_KEY, JSON.stringify({ from: fromStop, to: toStop }));
}

function loadPrefs() {
  try {
    const p = JSON.parse(localStorage.getItem(PREFS_KEY));
    if (p?.from) fromStop = p.from;
    if (p?.to)   toStop   = p.to;
  } catch {}
}

function isDayActive(days) {
  const d = new Date().getDay();
  if (days === 'щодня') return true;
  if (days === 'пн-сб') return d >= 1 && d <= 6;
  if (days === 'пн-пт') return d >= 1 && d <= 5;
  return true;
}

// ── Route calculations (розрахунок ціни) ──────────────────────────────
// Час зупинок винесено у src/core/bus-schedule.js (getStopMins/getStopHHMM/getRouteState)
function getSegmentPrice(route, fromName, toName) {
  const f = route.stops.find(s => s.name === fromName);
  const t = route.stops.find(s => s.name === toName);
  if (!f || !t) return null;
  const diff = Math.abs((t.price_from_start || 0) - (f.price_from_start || 0));
  return diff > 0 ? diff.toFixed(2) : null;  // null → UI покаже «—» (тарифу немає)
}

function getEffectiveFrom(route) {
  if (fromStop && route.stops.some(s => s.name === fromStop)) return fromStop;
  return route.stops[0].name;
}

function getEffectiveTo(route) {
  if (toStop && route.stops.some(s => s.name === toStop)) return toStop;
  return route.stops[route.stops.length - 1].name;
}

// ── Filtering (фільтрація рейсів) ─────────────────────────────────────

// Зупинки у реальному порядку руху автобуса (деякі маршрути у schedule.json
// мають зупинки у зворотньому порядку відносно фактичного руху).
// Використовуємо назву маршруту як джерело правди для визначення напрямку.
function getOrderedStops(route) {
  const stops = route.stops;
  if (stops.length < 2) return stops;
  const [nameFrom] = parseRouteEndpoints(route.name);
  const first = stops[0].name.toLowerCase();
  const nameLow = nameFrom.toLowerCase();
  const firstMatchesOrigin = nameLow.startsWith(first) || first.startsWith(nameLow);
  return firstMatchesOrigin ? stops : [...stops].reverse();
}

function matchesSearch(route) {
  if (!fromStop && !toStop) return true;
  const stops = route.stops;
  const fStop = fromStop ? stops.find(s => s.name === fromStop) : null;
  const tStop = toStop   ? stops.find(s => s.name === toStop)   : null;
  if (fromStop && !fStop) return false;
  if (toStop   && !tStop) return false;
  // Напрямок: fromStop повинен бути географічно ДО toStop (за км)
  if (fromStop && toStop && fStop.km >= tStop.km) return false;
  return true;
}

// «Past» = рейс завершився (прибув на кінцеву). Рейс у дорозі тепер НЕ past.
// Виняток: скасований рейс переходить у «минулі» з моменту часу відправлення.
function isPastRoute(route) {
  if (!isViewingToday()) return false;
  const state = getRouteState(route);
  if (state === 'past') return true;
  if (route.status === 'cancelled' && state !== 'waiting') return true;
  return false;
}

function getFilteredRoutes() {
  if (!busData) return [];
  return (getDayData().routes || [])
    .filter(matchesSearch)
    .sort((a, b) => {
      const aM = getStopMins(a, getEffectiveFrom(a)) || 0;
      const bM = getStopMins(b, getEffectiveFrom(b)) || 0;
      return aM - bM;
    });
}

// Пріоритезація: рейс у дорозі важливіший за майбутній (для людини це означає
// "мій автобус УЖЕ їде у бік села, треба ловити"). Якщо їде кілька — найближчий
// до кінцевої точки маршруту (тобто скоро прибуде). Якщо нема enroute — найближчий waiting.
function findNextRoute() {
  const all = getFilteredRoutes();
  if (!isViewingToday()) return all.find(r => r.status !== 'cancelled') || null;
  const enroute = all.filter(r => getRouteState(r) === 'enroute');
  if (enroute.length) {
    return enroute.sort((a, b) => {
      const aT = getRouteTimings(a).minsToArrival ?? Infinity;
      const bT = getRouteTimings(b).minsToArrival ?? Infinity;
      return aT - bT;
    })[0];
  }
  return all.find(r => getRouteState(r) === 'waiting') || null;
}

/// Усі актуальні рейси для каруселі: enroute + waiting в межах 90 хв,
// відсортовані за часом відправлення — той самий порядок що й список знизу.
function findActiveRoutes() {
  const all = getFilteredRoutes(); // вже відсортовані за часом відправлення
  // Для майбутніх/минулих днів — вибраний рейс (selectedRouteId) або перший
  if (!isViewingToday()) {
    if (selectedRouteId) {
      const sel = all.find(r => r.id === selectedRouteId && r.status !== 'cancelled');
      if (sel) return [sel];
    }
    const first = all.find(r => r.status !== 'cancelled') || all[0] || null;
    return first ? [first] : [];
  }
  // Сьогодні: enroute + waiting в межах 90 хв
  const result = all.filter(r => {
    if (r.status === 'cancelled') return false;
    const state = getRouteState(r);
    if (state === 'enroute') return true;
    if (state === 'waiting') {
      const t = getRouteTimings(r);
      return t.minsToDeparture !== null && t.minsToDeparture <= 90;
    }
    return false;
  });
  return result.length ? result : (findNextRoute() ? [findNextRoute()] : []);
}

function getAllStops() {
  if (!busData) return [];
  const seen = new Set();
  // Тільки зупинки обраного дня — пошук завжди в рамках поточної дати
  (getDayData().routes || []).forEach(r => r.stops.forEach(s => seen.add(s.name)));
  return [...seen].sort((a, b) => a.localeCompare(b, 'uk'));
}

// ── Dropdown (кастомний список вибору зупинки) ────────────────────────

// Відкриває дропдаун для поля 'from' або 'to'
function openDropdown(field) {
  activeField = field;
  const panel = document.getElementById('bus-search-panel');
  const dd    = document.getElementById('bs-dropdown');
  if (!dd || !panel) return;

  // Позиціонуємо фіксовано під панеллю пошуку (fixed — прив'язка до екрана)
  const rect  = panel.getBoundingClientRect();
  dd.style.top = rect.bottom + 'px';

  renderDropdownItems('');
  dd.hidden = false;

  // Фокус на поле фільтру
  const filterEl = document.getElementById('bs-dd-filter');
  if (filterEl) setTimeout(() => filterEl.focus(), 80);
}

// Промальовує вміст дропдауну (фільтрований список зупинок)
function renderDropdownItems(query) {
  const dd = document.getElementById('bs-dropdown');
  if (!dd) return;

  const all      = getAllStops();
  const q        = query.trim().toLowerCase();
  const filtered = q ? all.filter(s => s.toLowerCase().includes(q)) : all;
  const current  = activeField === 'from' ? fromStop : toStop;
  const title    = activeField === 'from' ? 'Звідки їдете?' : 'Куди їдете?';

  const clearHtml = current
    ? `<button class="bs-dd-clear" id="bs-dd-clear">✕ Очистити вибір (${escapeHtml(current)})</button>`
    : '';

  const itemsHtml = filtered.length
    ? filtered.map(s =>
        `<button class="bs-dd-item${s === current ? ' sel' : ''}" data-stop="${escapeHtml(s)}">
           ${escapeHtml(s)}
         </button>`
      ).join('')
    : `<div class="bs-dd-empty">Зупинку не знайдено</div>`;

  dd.innerHTML = `
    <div class="bs-dd-head">
      <span class="bs-dd-title">${escapeHtml(title)}</span>
      <button class="bs-dd-x" id="bs-dd-x">✕</button>
    </div>
    <div class="bs-dd-search">
      <input class="bs-dd-filter" id="bs-dd-filter"
             placeholder="Пошук зупинки…" value="${escapeHtml(query)}"
             autocomplete="off" autocorrect="off" spellcheck="false">
    </div>
    <div class="bs-dd-list">
      ${clearHtml}
      ${itemsHtml}
    </div>
  `;

  // Фільтр при наборі
  document.getElementById('bs-dd-filter')?.addEventListener('input', e => {
    renderDropdownItems(e.target.value);
  });

  // Закрити ✕
  document.getElementById('bs-dd-x')?.addEventListener('click', closeDropdown);

  // Очистити вибір
  document.getElementById('bs-dd-clear')?.addEventListener('click', () => {
    selectStop('', activeField);
  });

  // Вибір зупинки
  dd.querySelectorAll('.bs-dd-item').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault()); // не знімати фокус
    btn.addEventListener('click', () => selectStop(btn.dataset.stop, activeField));
  });
}

function closeDropdown() {
  activeField = null;
  const dd = document.getElementById('bs-dropdown');
  if (dd) dd.hidden = true;
}

// Вибирає зупинку і закриває дропдаун
function selectStop(stop, field) {
  if (field === 'from') {
    fromStop = stop;
    const inp = document.getElementById('bs-from-input');
    if (inp) inp.value = stop;
  } else {
    toStop = stop;
    const inp = document.getElementById('bs-to-input');
    if (inp) inp.value = stop;
  }
  closeDropdown();
  showAll = false;
  savePrefs();
  renderSearchPanel();
  renderSmartRow();
  renderRouteList();
}

// ── Hero-картка «Наступний автобус» (v4 редизайн 05.06) ────────────────────
// Дизайн: бордовий фон (#722F37 бренд), велика назва маршруту, капсула часу,
// "НАСТУПНА ЗУПИНКА", маршрутна шкала з підписами, ілюстрація автобуса справа.
// 3 стани: waiting / enroute / past. Логіка — bus-schedule.js.

// Витягує [cityA, cityB] з назви маршруту VOPAS:
export function parseRouteEndpoints(name) {
  const clean  = name.replace(/-\s*/g, ' ').replace(/\s+/g, ' ').trim();
  const noVia  = clean.split(' ч/з ')[0].trim();
  const parts  = noVia.split(' ');
  return [parts[0], parts[parts.length - 1]];
}

export function renderRouteMapV4(route, timings) {
  const stops   = route.stops;
  const totalKm = stops[stops.length - 1].km || 1;
  const pct     = (timings.progress * 100).toFixed(1);

  // Підписи A і B — з назви маршруту (відповідають назві рейсу у списку)
  const [labelA, labelB] = parseRouteEndpoints(route.name || '');

  // Рухома крапка прогресу — окремий елемент на точній позиції progress
  const movingDot = timings.state === 'enroute'
    ? `<span class="bhv4-dot bhv4-dot--current" style="left:${pct}%"></span>`
    : '';

  const dotsHtml = stops.map(s => {
    const dotPct  = totalKm ? (s.km / totalKm) * 100 : 0;
    const isPassed = totalKm ? (s.km / totalKm) <= timings.progress + 0.01 : false;
    return `<span class="bhv4-dot${isPassed ? ' bhv4-dot--passed' : ''}"
                  style="left:${dotPct.toFixed(1)}%"></span>`;
  }).join('');

  const labelsHtml =
    `<span class="bhv4-label bhv4-label--a">${escapeHtml(labelA.toUpperCase())}</span>` +
    `<span class="bhv4-label bhv4-label--b">${escapeHtml(labelB.toUpperCase())}</span>`;

  return `
    <div class="bhv4-map" aria-hidden="true">
      <div class="bhv4-labels bhv4-dyn">${labelsHtml}</div>
      <div class="bhv4-track">
        <div class="bhv4-fill" style="width:${pct}%"></div>
        ${dotsHtml}
        ${movingDot}
      </div>
    </div>`;
}

export function buildHeroCard(route, timings, index, total) {
  const effFrom   = getEffectiveFrom(route);
  const effTo     = getEffectiveTo(route);
  const fromTime  = getStopHHMM(route, effFrom);
  const toTime    = getStopHHMM(route, effTo);
  const isEnroute = timings.state === 'enroute';
  const isUrgent  = timings.state === 'waiting' && timings.minsToDeparture !== null && timings.minsToDeparture <= 10;

  const fromMin = timings.fromMin;
  const toMin   = timings.toMin;
  const durMins = (fromMin !== null && toMin !== null) ? toMin - fromMin : null;
  const durStr  = durMins !== null
    ? (durMins >= 60
        ? `${Math.floor(durMins / 60)} год${durMins % 60 ? ' ' + durMins % 60 + ' хв' : ''}`
        : `${durMins} хв`)
    : '';

  const statusDotClass = isEnroute ? 'enroute' : isUrgent ? 'urgent' : 'waiting';
  const statusDot  = `<span class="bhv4-state-dot bhv4-state-dot--${statusDotClass}"></span>`;
  const statusText = isEnroute ? 'в дорозі' : isUrgent ? 'відправляється' : 'очікується';

  const [, labelB] = parseRouteEndpoints(route.name || '');
  const lastKnownStop = route.stops[route.stops.length - 1].name;
  // Якщо nextStop = остання зупинка в даних (кінець відомого відрізку),
  // показуємо реальну кінцеву з назви маршруту (наприклад Жорнище замість Луцьк)
  const displayNext = timings.nextStop === lastKnownStop ? labelB : (timings.nextStop || labelB);

  const nextStopLine = isEnroute
    ? `<div class="bhv4-next-stop">НАСТУПНА ЗУПИНКА — ${escapeHtml(displayNext.toUpperCase())}</div>`
    : timings.state === 'waiting' && timings.minsToDeparture !== null
    ? `<div class="bhv4-next-stop">${escapeHtml(formatCountdownUpper(timings.minsToDeparture))}</div>`
    : '';

  const dotsHtml = total > 1
    ? Array.from({ length: total }, (_, i) =>
        `<span class="bhv4-dot-nav${i === index ? ' bhv4-dot-nav--active' : ''}" data-idx="${i}"></span>`
      ).join('')
    : '';

  // Статичні елементи (не фейдяться при свайпі): іконка автобуса, рамка капсули часу
  // Динамічні (клас bhv4-dyn, фейдяться): назва, час всередині капсули, тривалість,
  // наступна зупинка/відлік, шкала прогресу
  return `
    <div class="bhv4${isUrgent ? ' bhv4--urgent' : ''}${isEnroute ? ' bhv4--enroute' : ''}">
      <img class="bhv4-bg-img" src="./images/bus-hero2.png" alt="" aria-hidden="true">
      <div class="bhv4-overlay"></div>

      <span class="bhv4-dots-nav">${dotsHtml}</span>

      <div class="bhv4-content">
        <div class="bhv4-topbar">
          <span class="bhv4-status">
            <svg class="bhv4-bus-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
              <rect x="2" y="4" width="20" height="13" rx="2"/>
              <path d="M2 9h20"/>
              <path d="M8 4v5M16 4v5"/>
              <circle cx="7" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/>
              <path d="M5.5 17H2v2.5M18.5 17H22v2.5"/>
            </svg>
            <span class="bhv4-dyn"><span class="bhv4-status-text">${statusText}</span> <span class="bhv4-status-dot">${statusDot}</span></span>
          </span>
        </div>

        <div class="bhv4-body">
          <div class="bhv4-left">
            <div class="bhv4-route-name bhv4-dyn">${escapeHtml((() => { const [a,b] = parseRouteEndpoints(route.name || `${effFrom} – ${effTo}`); return `${a.toUpperCase()} → ${b.toUpperCase()}`; })())}</div>
            <div class="bhv4-times-row">
              <span class="bhv4-time-capsule"><span class="bhv4-dyn bhv4-capsule-inner">${escapeHtml(fromTime || '—')} → ${escapeHtml(toTime || '—')}</span></span>
              <span class="bhv4-duration bhv4-dyn">${escapeHtml(durStr)}</span>
            </div>
            <div class="bhv4-next-stop bhv4-dyn">${isEnroute ? `НАСТУПНА ЗУПИНКА — ${escapeHtml(displayNext.toUpperCase())}` : timings.state === 'waiting' && timings.minsToDeparture !== null ? escapeHtml(formatCountdownUpper(timings.minsToDeparture)) : ''}</div>
          </div>
        </div>

        <div class="bhv4-map-outer">${renderRouteMapV4(route, timings)}</div>
      </div>
    </div>`;
}

function renderSmartRow() {
  const el = document.getElementById('bus-smart-row');
  if (!el) return;

  const routes = findActiveRoutes();
  if (!routes.length) {
    // Повідомлення завжди виводиться під заголовком у bus-list, не тут
    el.innerHTML = '';
    return;
  }

  // Коригуємо індекс якщо кількість рейсів змінилась
  if (smartRowIndex >= routes.length) smartRowIndex = 0;

  const route   = routes[smartRowIndex];
  const timings = getTimingsForDisplay(route);
  el.innerHTML  = buildHeroCard(route, timings, smartRowIndex, routes.length);

  // Свайп (touch — дотик)
  let touchStartX = 0;
  const card = el.firstElementChild;
  card.addEventListener('touchstart', e => { touchStartX = e.touches[0].clientX; }, { passive: true });
  card.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - touchStartX;
    if (Math.abs(dx) < 40) return;
    smartRowIndex = dx < 0
      ? (smartRowIndex + 1) % routes.length
      : (smartRowIndex - 1 + routes.length) % routes.length;
    switchHeroCard();
  }, { passive: true });

  // Тап по крапках
  el.querySelectorAll('.bhv4-dot-nav').forEach(dot => {
    dot.addEventListener('click', e => {
      smartRowIndex = parseInt(e.target.dataset.idx, 10);
      switchHeroCard();
    });
  });
}

/// Свайп: фейдяться тільки .bhv4-dyn елементи (назва, час, стоп, шкала).
// Іконка автобуса і рамка капсули — зафіксовані, не зникають.
function switchHeroCard() {
  const el   = document.getElementById('bus-smart-row');
  if (!el) return;
  const card = el.querySelector('.bhv4');
  if (!card) { renderSmartRow(); renderRouteList(); return; }

  const dyns = card.querySelectorAll('.bhv4-dyn');
  dyns.forEach(d => { d.style.transition = 'opacity 0.08s ease'; d.style.opacity = '0'; });

  setTimeout(() => {
    const routes = findActiveRoutes();
    if (!routes.length) { renderSmartRow(); renderRouteList(); return; }
    if (smartRowIndex >= routes.length) smartRowIndex = 0;

    const route   = routes[smartRowIndex];
    const timings = getTimingsForDisplay(route);
    const isEnroute = timings.state === 'enroute';
    const isUrgent  = timings.state === 'waiting' && timings.minsToDeparture !== null && timings.minsToDeparture <= 10;

    // Оновлюємо клас картки (urgent/enroute для кольору і анімації крапки)
    card.className = `bhv4${isUrgent ? ' bhv4--urgent' : ''}${isEnroute ? ' bhv4--enroute' : ''}`;

    // Крапки-індикатори — миттєво
    const dotsNav = card.querySelector('.bhv4-dots-nav');
    if (dotsNav) {
      dotsNav.innerHTML = routes.length > 1
        ? Array.from({ length: routes.length }, (_, i) =>
            `<span class="bhv4-dot-nav${i === smartRowIndex ? ' bhv4-dot-nav--active' : ''}" data-idx="${i}"></span>`
          ).join('')
        : '';
      dotsNav.querySelectorAll('.bhv4-dot-nav').forEach(dot =>
        dot.addEventListener('click', e => { smartRowIndex = +e.target.dataset.idx; switchHeroCard(); })
      );
    }

    // Статус (текст + крапка)
    const statusWrap = card.querySelector('.bhv4-status .bhv4-dyn');
    if (statusWrap) {
      const txt = isEnroute ? 'в дорозі' : isUrgent ? 'відправляється' : 'очікується';
      const dotCls = isEnroute ? 'enroute' : isUrgent ? 'urgent' : 'waiting';
      const dot = `<span class="bhv4-state-dot bhv4-state-dot--${dotCls}"></span>`;
      statusWrap.innerHTML = `<span class="bhv4-status-text">${txt}</span> <span class="bhv4-status-dot">${dot}</span>`;
    }

    // Назва маршруту
    const nameEl = card.querySelector('.bhv4-route-name');
    if (nameEl) {
      const [n1, n2] = parseRouteEndpoints(route.name || '');
      nameEl.textContent = `${n1.toUpperCase()} → ${n2.toUpperCase()}`;
    }

    // Час всередині капсули
    const capsuleEl = card.querySelector('.bhv4-capsule-inner');
    if (capsuleEl) {
      const effFrom = getEffectiveFrom(route);
      const effTo   = getEffectiveTo(route);
      capsuleEl.textContent = `${getStopHHMM(route, effFrom) || '—'} → ${getStopHHMM(route, effTo) || '—'}`;
    }

    // Тривалість
    const durEl = card.querySelector('.bhv4-duration');
    if (durEl) {
      const d = timings.toMin !== null && timings.fromMin !== null ? timings.toMin - timings.fromMin : null;
      durEl.textContent = d !== null
        ? (d >= 60 ? `${Math.floor(d/60)} год${d%60 ? ' '+d%60+' хв':''}` : `${d} хв`)
        : '';
    }

    // Наступна зупинка / відлік
    const nextEl = card.querySelector('.bhv4-next-stop');
    if (nextEl) {
      const [, labelB] = parseRouteEndpoints(route.name || '');
      const lastStop   = route.stops[route.stops.length - 1].name;
      const dispNext   = timings.nextStop === lastStop ? labelB : (timings.nextStop || labelB);
      nextEl.textContent = isEnroute
        ? `НАСТУПНА ЗУПИНКА — ${dispNext.toUpperCase()}`
        : isUrgent || timings.state === 'waiting' && timings.minsToDeparture !== null
          ? formatCountdownUpper(timings.minsToDeparture)
          : '';
    }

    // Мітки А і Б на прогрес-шкалі (оновлюємо при зміні маршруту)
    const labelsEl = card.querySelector('.bhv4-labels');
    if (labelsEl) {
      const [lA, lB] = parseRouteEndpoints(route.name || '');
      labelsEl.innerHTML =
        `<span class="bhv4-label bhv4-label--a">${escapeHtml(lA.toUpperCase())}</span>` +
        `<span class="bhv4-label bhv4-label--b">${escapeHtml(lB.toUpperCase())}</span>`;
    }

    // Шкала прогресу — трек (сіра лінія) статичний, міняємо тільки fill і крапки
    const mapOuter = card.querySelector('.bhv4-map-outer');
    if (mapOuter) {
      const pct = (timings.progress * 100).toFixed(1);
      const totalKm = route.stops[route.stops.length - 1].km || 1;
      const movingDot = timings.state === 'enroute'
        ? `<span class="bhv4-dot bhv4-dot--current" style="left:${pct}%"></span>` : '';
      const dotsHtml = route.stops.map(s => {
        const dp = totalKm ? (s.km / totalKm) * 100 : 0;
        const passed = totalKm ? (s.km / totalKm) <= timings.progress + 0.01 : false;
        return `<span class="bhv4-dot${passed ? ' bhv4-dot--passed' : ''}" style="left:${dp.toFixed(1)}%"></span>`;
      }).join('');
      const track = mapOuter.querySelector('.bhv4-track');
      if (track) track.innerHTML = `<div class="bhv4-fill" style="width:${pct}%"></div>${dotsHtml}${movingDot}`;
    }

    renderRouteList();

    // Фейд-ін тільки динамічних елементів
    card.querySelectorAll('.bhv4-dyn').forEach(d => {
      d.style.opacity = '0';
      d.style.transition = 'opacity 0.12s ease';
      requestAnimationFrame(() => requestAnimationFrame(() => { d.style.opacity = '1'; }));
    });
  }, 80);
}

// ── Route list (список рейсів) ─────────────────────────────────────────
function renderRouteList() {
  const el = document.getElementById('bus-list');
  if (!el) return;

  const all      = getFilteredRoutes();
  const future   = all.filter(r => !isPastRoute(r));
  const past     = all.filter(r => isPastRoute(r));
  // Для сьогодні: за замовчуванням тільки майбутні (можна розгорнути).
  // При showAll: актуальні зверху, минулі знизу (не перемішані за часом).
  // Для інших днів: завжди всі — немає сенсу ховати "минулі" вчорашнього дня.
  const toRender = isViewingToday() ? (showAll ? [...future, ...past] : future) : all;

  if (!all.length) {
    const dd0 = getDayData();
    const updStr0 = dd0.fetchedTime
      ? `Оновлено: ${escapeHtml(dd0.fetchedTime)} | ${escapeHtml(dd0.fetchedAt)}`
      : 'Дані оновлюються...';
    const titleHtml0 = buildListTitleHtml(updStr0);
    const hasFilter = fromStop || toStop;
    if (hasFilter) {
      const msg = `На ${isViewingToday() ? 'сьогодні' : dd0.fetchedAt || 'цей день'} рейсів ${fromStop ? `з ${fromStop}` : ''}${fromStop && toStop ? ' до ' : ''}${toStop || ''} не заплановано`;
      el.innerHTML = titleHtml0 + `<div class="empty-state">${msg}</div>`;
    } else {
      const noMoreMsg = isViewingToday()
        ? `<div class="bhv4-empty">СЬОГОДНІ РЕЙСІВ БІЛЬШЕ НЕ ЗАПЛАНОВАНО</div>`
        : `<div class="bhv4-empty">НА ЦЕЙ ДЕНЬ РЕЙСІВ НЕ ЗНАЙДЕНО</div>`;
      el.innerHTML = titleHtml0 + noMoreMsg;
      const updRow = document.getElementById('buses-updated-row');
      if (updRow && busData) {
        updRow.innerHTML = buildSourceHtml();
      }
    }
    return;
  }

  if (!toRender.length) {
    const noMoreMsg = isViewingToday()
      ? `<div class="bhv4-empty">СЬОГОДНІ РЕЙСІВ БІЛЬШЕ НЕ ЗАПЛАНОВАНО</div>` : '';
    el.innerHTML = `
      <button class="bus-show-all" id="bus-show-all-btn">
        Показати всі ${all.length} рейси ↓
      </button>${noMoreMsg}`;
    document.getElementById('bus-show-all-btn').addEventListener('click', () => {
      showAll = true;
      renderRouteList();
    });
    return;
  }

  const activeRoutes  = findActiveRoutes();
  const highlighted   = activeRoutes[smartRowIndex] || findNextRoute();
  const carrierInfo = id => busData.carriers?.[id] || { name: id, phone: '0332 224 500' };

  const buildCard = route => {
    const isPast     = isPastRoute(route);
    const isNext     = highlighted && route.id === highlighted.id;
    const isSelectable = !isViewingToday();
    const effFrom = getEffectiveFrom(route);
    const effTo   = getEffectiveTo(route);
    const fromTime = getStopHHMM(route, effFrom);
    const toTime   = getStopHHMM(route, effTo);
    const price    = getSegmentPrice(route, effFrom, effTo);
    const fromMins = getStopMins(route, effFrom) || 0;
    const toMins   = getStopMins(route, effTo)   || 0;
    const segDur   = toMins - fromMins;
    const durStr   = segDur >= 60
      ? `${Math.floor(segDur / 60)} год${segDur % 60 ? ' ' + (segDur % 60) + ' хв' : ''}`
      : `${segDur} хв`;
    const c        = carrierInfo(route.carrier);
    const expanded = expandedIds.has(route.id);

    const isEnroute = isViewingToday() && getRouteState(route) === 'enroute' && route.status !== 'cancelled';
    // Для рейсу "в дорозі" — визначаємо поточну і наступну зупинку
    const liveTimings     = isEnroute ? getRouteTimings(route) : null;
    const liveCurrentStop = liveTimings?.currentStop || null;
    const liveNextStop    = liveTimings?.nextStop    || null;

    const fromIdx   = route.stops.findIndex(s => s.name === effFrom);
    const stopsHtml = route.stops.map((s, idx) => {
      const isFrom    = s.name === effFrom;
      const isTo      = s.name === effTo;
      const hl        = isFrom || isTo;
      const isCurrent = isEnroute && s.name === liveCurrentStop;
      const isNextS   = isEnroute && s.name === liveNextStop;
      const t         = getStopHHMM(route, s.name);
      let cls = 'bs-stop-row';
      if (hl)        cls += ' hl';
      if (isCurrent) cls += ' bs-stop--current';
      if (isNextS)   cls += ' bs-stop--next';
      const prefixHtml = isCurrent
        ? '<span class="bs-stop-icon bs-stop-icon--current"></span>'
        : isNextS && !isTo
        ? '<span class="bs-stop-icon bs-stop-icon--next">▷</span>'
        : isFrom
        ? '<span class="bs-stop-icon bs-stop-icon--from">●</span>'
        : isTo
        ? '<span class="bs-stop-icon bs-stop-icon--to"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/></svg></span>'
        : '';
      // Зупинки до «Звідки» — без ціни (юзер сідає пізніше, ціни нерелевантні)
      const segPrice = (isFrom || idx < fromIdx) ? null : getSegmentPrice(route, effFrom, s.name);
      const priceHtml = segPrice ? `<span class="bs-stop-price">${segPrice} грн</span>` : '';
      return `
        <div class="${cls}">
          <span class="bs-stop-time">${escapeHtml(t || '—')}</span>
          <span class="bs-stop-name">${prefixHtml}${escapeHtml(s.name.toUpperCase())}</span>
          ${priceHtml}
        </div>`;
    }).join('');

    const liveDot = isEnroute ? `<span class="bs-live-dot"></span>` : '';

    const statusBadge = route.status === 'cancelled'
      ? `<span class="bs-status cancelled">Скасовано</span>`
      : route.status === 'delayed'
      ? `<span class="bs-status delayed">Затримка</span>`
      : '';

    const autoNote = route.auto_generated
      ? `<div class="bs-autogen">розрахований зворотний рейс</div>`
      : '';

    const [ep1, ep2] = parseRouteEndpoints(route.name);
    // Коли фільтр "звідки→куди" активний і зупинки знайдено в маршруті —
    // показуємо сегмент фільтру, а не повну назву (щоб не плутати пасажира)
    const filterActive = fromStop && toStop &&
      route.stops.some(s => s.name === fromStop) &&
      route.stops.some(s => s.name === toStop);
    const routeLabel = `${ep1.toUpperCase()} → ${ep2.toUpperCase()}`;
    const fromStopTime = filterActive ? getStopHHMM(route, fromStop) : null;
    const fromTimeStr = fromStopTime ? ` / ${fromStopTime}` : '';
    const fullLabel = filterActive && (ep1.toUpperCase() !== fromStop.toUpperCase() || ep2.toUpperCase() !== toStop.toUpperCase())
      ? `<span class="bs-route-full">${escapeHtml(fromStop.toUpperCase())} - ${escapeHtml(toStop.toUpperCase())}${escapeHtml(fromTimeStr)}</span>`
      : '';

    return `
      <div class="bus-card${isPast ? ' past' : ''}${isNext ? ' next' : ''}${isSelectable ? ' selectable' : ''}${isEnroute ? ' enroute' : ''}" data-route-id="${escapeHtml(route.id)}">
        ${(() => {
          if (isEnroute) return '<span class="bs-live-corner"><span class="bs-live-label">В ДОРОЗІ</span><span class="bs-live-dot"></span></span>';
          if (route.status === 'cancelled') return '<span class="bs-live-corner"><span class="bs-status cancelled">Скасовано</span></span>';
          if (isViewingToday() && !isPast && route.status !== 'cancelled') {
            const minsLeft = getRouteTimings(route).minsToDeparture;
            if (minsLeft !== null && minsLeft <= 15 && minsLeft > 0) {
              return `<span class="bs-live-corner bs-live-corner--soon"><span class="bs-soon-badge"><span class="bs-soon-label">ЧЕРЕЗ ${minsLeft} ХВ</span><span class="bs-soon-dot"></span></span></span>`;
            }
          }
          return '';
        })()}
        <div class="bus-card-main">
          <div class="bs-time-block">
            <span class="bus-card-time">${escapeHtml(fromTime || '—')}</span>
            <span class="bs-arr">${escapeHtml(toTime || '—')}</span>
          </div>
          <div class="bus-card-info">
            <div class="bus-card-route">${escapeHtml(routeLabel)}${fullLabel}</div>
            <div class="bus-card-meta">
              <span>${escapeHtml(durStr)}</span>
              <span class="bus-meta-sep">·</span>
              <span>${escapeHtml(price || '—')} грн</span>
              <span class="bus-meta-sep">·</span>
              <span>${escapeHtml(c.name)}</span>
            </div>
            ${autoNote}
          </div>
        </div>
        ${route.stops && route.stops.length > 2
          ? `<button class="bs-toggle" data-id="${escapeHtml(route.id)}">
               ${expanded ? 'Сховати зупинки ▴' : 'Всі зупинки ▾'}
             </button>
             <div class="bs-stops-body"${expanded ? '' : ' hidden'}>${stopsHtml}</div>`
          : route.vopas_url
          ? `<a class="bs-vopas-link" href="${escapeHtml(route.vopas_url)}" target="_blank" rel="noopener">Усі зупинки рейсу на VOPAS →</a>`
          : ''}
      </div>`;
  };

  let toggleHtml = '';
  let noMoreHtml = '';
  if (isViewingToday()) {
    if (!showAll && past.length > 0) {
      toggleHtml = `
        <button class="bus-show-all" id="bus-show-all-btn">
          Показати всі ${all.length} рейси за сьогодні ↓
        </button>`;
    } else if (showAll && past.length > 0) {
      toggleHtml = `
        <button class="bus-show-all bus-show-all--less" id="bus-show-all-btn">
          Сховати минулі ↑
        </button>`;
    }
    // Якщо всі рейси сьогодні завершились — повідомлення внизу списку
    if (future.length === 0 && all.length > 0) {
      noMoreHtml = `<div class="bhv4-empty">СЬОГОДНІ РЕЙСІВ БІЛЬШЕ НЕ ЗАПЛАНОВАНО</div>`;
    }
  }

  // Коли showAll: рендеримо майбутні → кнопка "Сховати минулі" → минулі
  // Коли !showAll: рендеримо тільки майбутні → кнопка "Показати всі"
  let cards;
  if (isViewingToday() && showAll && past.length > 0) {
    const futureCards = future.map(buildCard).join('');
    const pastCards   = past.map(buildCard).join('');
    cards = futureCards + toggleHtml + pastCards + noMoreHtml;
    toggleHtml = '';
    noMoreHtml = '';
  } else {
    cards = toRender.map(buildCard).join('');
  }

  const updRow = document.getElementById('buses-updated-row');
  if (updRow && busData) updRow.innerHTML = buildSourceHtml();
  const dd = getDayData();
  const updatedStr2 = dd.fetchedTime
    ? `Оновлено: ${escapeHtml(dd.fetchedTime)} | ${escapeHtml(dd.fetchedAt)}`
    : 'Дані оновлюються...';
  el.innerHTML = buildListTitleHtml(updatedStr2) + cards + toggleHtml + noMoreHtml;

  el.querySelectorAll('.bs-toggle').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const id = btn.dataset.id;
      if (expandedIds.has(id)) expandedIds.delete(id);
      else expandedIds.add(id);
      renderRouteList();
    });
  });

  // Для майбутніх днів: тап на картку → показати у hero-віджеті
  if (!isViewingToday()) {
    el.querySelectorAll('.bus-card.selectable').forEach(card => {
      card.addEventListener('click', () => {
        const rid = card.dataset.routeId;
        if (!rid) return;
        selectedRouteId = rid;
        renderSmartRow();
        renderRouteList();
        // Прокручуємо до hero-картки щоб побачити результат
        document.getElementById('bus-smart-row')?.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      });
    });
  }

  const showAllBtn = document.getElementById('bus-show-all-btn');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      showAll = !showAll;
      renderRouteList();
    });
  }
}

// ── Week strip (тижнева смужка — 2 сторінки по 7 днів зі свайпом) ──────
function getWeekDays(page = 0) {
  const now   = new Date();
  const dow   = now.getDay() === 0 ? 6 : now.getDay() - 1;
  const mon   = new Date(now);
  mon.setDate(now.getDate() - dow + page * 7);
  mon.setHours(0, 0, 0, 0);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(mon);
    d.setDate(mon.getDate() + i);
    return d;
  });
}

function renderWeekStrip() {
  const el = document.getElementById('bus-week-strip');
  if (!el) return;

  const todayISO = getTodayISO();
  const dayNames = ['Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб', 'Нд'];

  function pageHtml(page) {
    return '<div class="bus-week-days">' +
      getWeekDays(page).map((d, i) => {
        const iso = `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
        const num = String(d.getDate()).padStart(2, '0');
        return `<button class="bus-week-day${iso === todayISO ? ' bus-week-day--today' : ''}${iso === busDay ? ' bus-week-day--active' : ''}${iso < todayISO ? ' bus-week-day--past' : ''}" data-iso="${iso}">
          <span class="bus-week-day-name">${dayNames[i]}</span>
          <span class="bus-week-day-num">${num}</span>
        </button>`;
      }).join('') +
    '</div>';
  }

  el.innerHTML = `
    <div class="bus-week-track">
      ${pageHtml(0)}
      ${pageHtml(1)}
    </div>
    <div class="bus-week-pages">
      <span class="bus-week-page-dot${weekPage === 0 ? ' active' : ''}" data-page="0"></span>
      <span class="bus-week-page-dot${weekPage === 1 ? ' active' : ''}" data-page="1"></span>
    </div>`;

  const track = el.querySelector('.bus-week-track');

  // Позиціонуємо без анімації — одразу в поточну сторінку
  track.style.transform = `translateX(-${weekPage * 50}%)`;

  // Тап по дню
  el.querySelectorAll('.bus-week-day').forEach(btn => {
    btn.addEventListener('click', () => {
      if (track.dataset.swiped === '1') return; // тап після свайпу ігноруємо
      busDay = btn.dataset.iso;
      showAll = false;
      smartRowIndex = 0;
      selectedRouteId = null;
      renderWeekStrip();
      renderSmartRow();
      renderRouteList();
    });
  });

  // Тап по крапці сторінки
  el.querySelectorAll('.bus-week-page-dot').forEach(dot => {
    dot.addEventListener('click', () => {
      weekPage = parseInt(dot.dataset.page, 10);
      track.style.transition = 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
      track.style.transform   = `translateX(-${weekPage * 50}%)`;
      el.querySelectorAll('.bus-week-page-dot').forEach(d =>
        d.classList.toggle('active', parseInt(d.dataset.page) === weekPage)
      );
    });
  });

  // Свайп — трек рухається за пальцем у реальному часі
  let startX = 0, startY = 0, isHorizSwipe = null;

  track.addEventListener('touchstart', e => {
    startX = e.touches[0].clientX;
    startY = e.touches[0].clientY;
    isHorizSwipe = null;
    track.dataset.swiped = '0';
    track.style.transition = 'none';
  }, { passive: true });

  track.addEventListener('touchmove', e => {
    const dx = e.touches[0].clientX - startX;
    const dy = e.touches[0].clientY - startY;

    // Визначаємо тип свайпу один раз, як тільки є помітний рух
    if (isHorizSwipe === null && (Math.abs(dx) > 4 || Math.abs(dy) > 4)) {
      isHorizSwipe = Math.abs(dx) > Math.abs(dy);
    }
    // Вертикальний рух — не чіпаємо, сторінка скролиться штатно
    if (!isHorizSwipe) return;

    // Горизонтальний — блокуємо вертикальний скрол сторінки
    e.preventDefault();
    const clamped = weekPage === 0 ? Math.min(dx, 0) : Math.max(dx, 0);
    track.style.transform = `translateX(calc(-${weekPage * 50}% + ${clamped}px))`;
  }, { passive: false }); // passive: false — щоб e.preventDefault() спрацював

  track.addEventListener('touchend', e => {
    const dx = e.changedTouches[0].clientX - startX;
    const newPage = dx < -40 && weekPage === 0 ? 1
                  : dx >  40 && weekPage === 1 ? 0
                  : weekPage;

    track.style.transition = 'transform 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)';
    track.style.transform   = `translateX(-${newPage * 50}%)`;

    if (newPage !== weekPage) {
      track.dataset.swiped = '1';
      weekPage = newPage;
      el.querySelectorAll('.bus-week-page-dot').forEach(d =>
        d.classList.toggle('active', parseInt(d.dataset.page) === weekPage)
      );
    }
    // Знімаємо прапор після анімації щоб наступний тап на день проходив
    setTimeout(() => { if (track.isConnected) track.dataset.swiped = '0'; }, 350);
  }, { passive: true });
}

// ── Search panel (панель пошуку "Звідки → Куди") ──────────────────────
function renderSearchPanel() {
  const el = document.getElementById('bus-search-panel');
  if (!el) return;

  const hasFilter = fromStop || toStop;

  el.innerHTML = `
    <div class="bs-search-row">
      <div class="bs-search-field" id="bs-from-field">
        <span class="bs-field-icon bs-field-icon--from">●</span>
        <input class="bs-search-input bs-search-input--tap" id="bs-from-input"
               type="text" placeholder="Звідки"
               value="${escapeHtml(fromStop)}" readonly>
      </div>
      <button class="bs-swap-btn" id="bs-swap-btn" title="Поміняти напрямок">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
          <path d="M5 8l-4 4 4 4"/><path d="M19 8l4 4-4 4"/><line x1="1" y1="12" x2="23" y2="12"/>
        </svg>
      </button>
      <div class="bs-search-field" id="bs-to-field">
        <svg class="bs-field-icon bs-field-icon--to" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
          <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/>
          <circle cx="12" cy="9" r="2.5" fill="currentColor" stroke="none"/>
        </svg>
        <input class="bs-search-input bs-search-input--tap" id="bs-to-input"
               type="text" placeholder="Куди"
               value="${escapeHtml(toStop)}" readonly>
      </div>
    </div>
    ${hasFilter ? `<div class="bs-filter-clear-row"><button class="bs-filter-clear-btn" id="bs-reset-btn">✕ СКИНУТИ ФІЛЬТР</button></div>` : ''}
  `;

  document.getElementById('bs-from-input').addEventListener('click', () => openDropdown('from'));
  document.getElementById('bs-to-input').addEventListener('click',   () => openDropdown('to'));

  document.getElementById('bs-reset-btn')?.addEventListener('click', () => {
    fromStop = '';
    toStop   = '';
    showAll  = false;
    savePrefs();
    renderSearchPanel();
    renderSmartRow();
    renderRouteList();
  });

  document.getElementById('bs-swap-btn').addEventListener('click', () => {
    [fromStop, toStop] = [toStop, fromStop];
    document.getElementById('bs-from-input').value = fromStop;
    document.getElementById('bs-to-input').value   = toStop;
    closeDropdown();
    showAll = false;
    savePrefs();
    renderSmartRow();
    renderRouteList();
  });

  // Додаємо/прибираємо клас filter-active — CSS зробить правильний padding-top
  const page = document.getElementById('page-buses');
  if (page) page.classList.toggle('filter-active', !!(fromStop || toStop));
}

function buildSourceHtml() {
  if (!busData?.source) return '';
  return `<a href="https://vopas.com.ua" target="_blank" rel="noopener" class="buses-updated-link">${escapeHtml(busData.source)}</a>`;
}
export async function initBuses() {
  const el = document.getElementById('buses-content');
  if (!el) return;

  loadPrefs();

  // Створюємо overlay дропдауна один раз (position: fixed — фіксована позиція)
  if (!document.getElementById('bs-dropdown')) {
    const dd = document.createElement('div');
    dd.id        = 'bs-dropdown';
    dd.className = 'bs-dropdown';
    dd.hidden    = true;
    document.body.appendChild(dd);
  }

  // Закривати дропдаун при кліку поза ним
  document.addEventListener('click', e => {
    const dd = document.getElementById('bs-dropdown');
    if (!dd || dd.hidden) return;
    if (!dd.contains(e.target) &&
        e.target.id !== 'bs-from-input' &&
        e.target.id !== 'bs-to-input') {
      closeDropdown();
    }
  }, true);

  try {
    const res = await fetch(`./data/schedule.json?v=${Math.floor(Date.now() / 60000)}`); // cache-bust кожну хвилину
    if (!res.ok) throw new Error(res.status);
    busData = await res.json();
  } catch {
    busData = null;
  }

  if (!busData) {
    el.innerHTML = '<div class="empty-state">Розклад тимчасово недоступний</div>';
    return;
  }

  el.innerHTML = `
    <div id="bus-week-strip" class="bus-week-strip"></div>
    <div id="bus-search-panel" class="bus-search"></div>
    <div id="bus-smart-row" class="bus-smart-row"></div>
    <div id="bus-list" class="bus-list"></div>
    <div id="buses-updated-row" class="buses-updated"></div>
  `;

  busDay = getTodayISO();
  renderSearchPanel();
  renderWeekStrip();
  renderSmartRow();
  renderRouteList();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    renderSmartRow();
    renderRouteList();
  }, 60_000);
}
