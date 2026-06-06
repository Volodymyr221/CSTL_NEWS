import { escapeHtml } from '../core/utils.js';
import {
  toMinutes, minsToHHMM, nowMinutes,
  getStopMins, getStopHHMM, getRouteState, getRouteTimings,
  formatCountdownUpper,
} from '../core/bus-schedule.js';

const PREFS_KEY = 'bus_prefs_v2';

let busData       = null;
let fromStop      = '';
let toStop        = '';
let showAll       = false;
let timerInterval = null;
let expandedIds   = new Set();
let activeField   = null; // 'from' | 'to' — яке поле зараз відкрите в дропдауні
let smartRowIndex = 0;    // поточна картка у каруселі hero

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
  if (!isDayActive(route.days)) return false;
  const stops   = getOrderedStops(route);
  const fromIdx = fromStop ? stops.findIndex(s => s.name === fromStop) : 0;
  const toIdx   = toStop   ? stops.findIndex(s => s.name === toStop)   : stops.length - 1;
  if (fromStop && fromIdx === -1) return false;
  if (toStop   && toIdx   === -1) return false;
  if (fromStop && toStop  && fromIdx >= toIdx) return false;
  return true;
}

// «Past» = рейс завершився (прибув на кінцеву). Рейс у дорозі тепер НЕ past.
function isPastRoute(route) {
  return getRouteState(route) === 'past';
}

function getFilteredRoutes() {
  if (!busData) return [];
  return busData.routes
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
  const all    = getFilteredRoutes(); // вже відсортовані за часом відправлення
  const result = all.filter(r => {
    if (r.status === 'cancelled') return false; // скасований — не показуємо в каруселі
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
  busData.routes.forEach(r => r.stops.forEach(s => seen.add(s.name)));
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

  const statusDot  = isEnroute ? '🟢' : isUrgent ? '🔴' : '🔵';
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
    el.innerHTML = `<div class="bhv4-empty">СЬОГОДНІ РЕЙСІВ БІЛЬШЕ НЕ ЗАПЛАНОВАНО</div>`;
    return;
  }

  // Коригуємо індекс якщо кількість рейсів змінилась
  if (smartRowIndex >= routes.length) smartRowIndex = 0;

  const route   = routes[smartRowIndex];
  const timings = getRouteTimings(route);
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
    const timings = getRouteTimings(route);
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
      const dot = isEnroute ? '🟢' : isUrgent ? '🔴' : '🔵';
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
  const toRender = showAll ? all : future;

  if (!all.length) {
    const hasFilter = fromStop || toStop;
    if (hasFilter) {
      const msg = `На сьогодні рейсів ${fromStop ? `з ${fromStop}` : ''}${fromStop && toStop ? ' до ' : ''}${toStop || ''} не заплановано`;
      el.innerHTML = `<div class="empty-state">${msg}</div>`;
    } else {
      el.innerHTML = ''; // hero вже показує "СЬОГОДНІ РЕЙСІВ БІЛЬШЕ НЕ ЗАПЛАНОВАНО"
    }
    return;
  }

  if (!toRender.length) {
    el.innerHTML = `
      <button class="bus-show-all" id="bus-show-all-btn">
        Показати всі ${all.length} рейси ↓
      </button>`;
    document.getElementById('bus-show-all-btn').addEventListener('click', () => {
      showAll = true;
      renderRouteList();
    });
    return;
  }

  const activeRoutes  = findActiveRoutes();
  const highlighted   = activeRoutes[smartRowIndex] || findNextRoute();
  const carrierInfo = id => busData.carriers?.[id] || { name: id, phone: '0332 224 500' };

  const cards = toRender.map(route => {
    const isPast  = isPastRoute(route);
    const isNext  = highlighted && route.id === highlighted.id;
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

    const stopsHtml = route.stops.map(s => {
      const isFrom = s.name === effFrom;
      const isTo   = s.name === effTo;
      const hl     = isFrom || isTo;
      const t      = getStopHHMM(route, s.name);
      // Час прибуття на зупинку (з км + час відправлення). Ціну прибрано —
      // квиткова застаріває, час корисніший для пасажира.
      return `
        <div class="bs-stop-row${hl ? ' hl' : ''}">
          <span class="bs-stop-time">${escapeHtml(t || '—')}</span>
          <span class="bs-stop-name">${isFrom ? '▶\u202f' : isTo ? '◀\u202f' : ''}${escapeHtml(s.name)}</span>
        </div>`;
    }).join('');

    const statusBadge = route.status === 'cancelled'
      ? `<span class="bs-status cancelled">Скасовано</span>`
      : route.status === 'delayed'
      ? `<span class="bs-status delayed">Затримка</span>`
      : '';

    const autoNote = route.auto_generated
      ? `<div class="bs-autogen">розрахований зворотний рейс</div>`
      : '';

    const [ep1, ep2] = parseRouteEndpoints(route.name);
    const routeLabel = `${ep1.toUpperCase()} → ${ep2.toUpperCase()}`;

    return `
      <div class="bus-card${isPast ? ' past' : ''}${isNext ? ' next' : ''}">
        <div class="bus-card-main">
          <div class="bs-time-block">
            <span class="bus-card-time">${escapeHtml(fromTime || '—')}</span>
            <span class="bs-arr">${escapeHtml(toTime || '—')}</span>
          </div>
          <div class="bus-card-info">
            <div class="bus-card-route">${escapeHtml(routeLabel)}${statusBadge}</div>
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
  }).join('');

  let toggleHtml = '';
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

  el.innerHTML = `<div class="bus-list-title">РОЗКЛАД АВТОБУСНИХ МАРШРУТІВ<span class="bus-list-updated-sub">Оновлено: ${escapeHtml(busData?.verifiedTime || '')} | ${escapeHtml(busData?.verifiedAt || '')}</span></div>` + cards + toggleHtml;

  el.querySelectorAll('.bs-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.id;
      if (expandedIds.has(id)) expandedIds.delete(id);
      else expandedIds.add(id);
      renderRouteList();
    });
  });

  const showAllBtn = document.getElementById('bus-show-all-btn');
  if (showAllBtn) {
    showAllBtn.addEventListener('click', () => {
      showAll = !showAll;
      renderRouteList();
    });
  }
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
      ${hasFilter ? `<button class="bs-clear-btn" id="bs-reset-btn" title="Скинути маршрут">✕</button>` : ''}
    </div>
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
}

// ── Init (ініціалізація вкладки) ──────────────────────────────────────
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
    <div id="bus-search-panel" class="bus-search"></div>
    <div id="bus-smart-row" class="bus-smart-row"></div>
    <div id="bus-list" class="bus-list"></div>
    <div class="buses-updated">${escapeHtml(busData.source)}</div>
  `;

  renderSearchPanel();
  renderSmartRow();
  renderRouteList();

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    renderSmartRow();
    renderRouteList();
  }, 60_000);
}
