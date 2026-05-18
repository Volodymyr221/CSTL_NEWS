// src/core/bus-schedule.js
// Спільна логіка розкладу автобусів — використовується і вкладкою Автобуси,
// і блоком Громади. До виокремлення (18.05.2026) логіка дублювалась і
// розходилась — шкала прогресу на двох вкладках показувала різні значення.
//
// Чисті функції: приймають route і поточний час, нічого не знають про DOM.

// Вікно орієнтиру для countdown-шкали — за стільки хвилин до автобуса
// починає рости прогрес-бар. Раніше 60, тепер шкала en-route використовується
// як основна, а countdown — для майбутніх рейсів.
export const HERO_MAX_WAIT_MIN = 60;

// HH:MM → хвилини від початку доби (00:00 = 0, 13:30 = 810)
export function toMinutes(hhmm) {
  if (!hhmm || typeof hhmm !== 'string') return 0;
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
}

// Хвилини від 00:00 → "HH:MM"
export function minsToHHMM(mins) {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

// Хвилин з 00:00 у поточному часі (для Date — local)
export function nowMinutes(date = new Date()) {
  return date.getHours() * 60 + date.getMinutes();
}

// Час прибуття автобуса на зазначену зупинку (хвилини від 00:00).
// Рахується пропорційно кілометражу: departure_time + (stop.km / totalKm) * duration_min
// Якщо зупинки немає у маршруті — null.
export function getStopMins(route, stopName) {
  const stop = route.stops.find(s => s.name === stopName);
  if (!stop) return null;
  const totalKm = route.stops[route.stops.length - 1].km;
  if (totalKm === 0) return toMinutes(route.departure_time);
  return toMinutes(route.departure_time) + Math.round((stop.km / totalKm) * route.duration_min);
}

// Час прибуття на зупинку у форматі "HH:MM"
export function getStopHHMM(route, stopName) {
  const m = getStopMins(route, stopName);
  return m !== null ? minsToHHMM(m) : null;
}

// Поточний стан рейсу відносно даного часу:
//   'waiting' — ще не виїхав з 1-ї зупинки
//   'enroute' — їде зараз (між 1-ю і останньою зупинкою)
//   'past'    — вже прибув на кінцеву зупинку
export function getRouteState(route, nowMin = nowMinutes()) {
  const fromMin = getStopMins(route, route.stops[0].name);
  const toMin   = getStopMins(route, route.stops[route.stops.length - 1].name);
  if (fromMin === null || toMin === null) return 'waiting';
  if (nowMin < fromMin) return 'waiting';
  if (nowMin > toMin)   return 'past';
  return 'enroute';
}

// Найближча зупинка до поточної позиції автобуса у дорозі.
// Повертає { current, next } — current = ім'я зупинки яку рейс щойно пройшов/зараз стоїть,
// next = наступна. Для рейсів waiting/past — current = first/last stop.
export function getCurrentPosition(route, nowMin = nowMinutes()) {
  const stops = route.stops;
  const first = stops[0].name;
  const last  = stops[stops.length - 1].name;

  const state = getRouteState(route, nowMin);
  if (state === 'waiting') return { current: first, next: stops[1]?.name || last };
  if (state === 'past')    return { current: last,  next: null };

  // enroute — знаходимо останню зупинку чий час <= now
  let current = first, next = last, currentIdx = 0;
  for (let i = 0; i < stops.length; i++) {
    const m = getStopMins(route, stops[i].name);
    if (m !== null && m <= nowMin) {
      current = stops[i].name;
      currentIdx = i;
    }
  }
  if (currentIdx < stops.length - 1) next = stops[currentIdx + 1].name;
  return { current, next };
}

// Повна інформація про таймінги рейсу для рендера hero/міні-блоку.
// Єдина точка істини — обидві вкладки (Автобуси, Громада) користуються цим.
export function getRouteTimings(route, nowMin = nowMinutes()) {
  const stops    = route.stops;
  const fromMin  = getStopMins(route, stops[0].name);
  const toMin    = getStopMins(route, stops[stops.length - 1].name);
  const state    = getRouteState(route, nowMin);
  const { current, next } = getCurrentPosition(route, nowMin);

  const minsToDeparture = fromMin !== null ? Math.max(0, fromMin - nowMin) : null;
  const minsToArrival   = toMin   !== null ? Math.max(0, toMin   - nowMin) : null;

  // Прогрес шкали — залежить від стану:
  // waiting: 0..1 від (now до fromMin) у вікні HERO_MAX_WAIT_MIN (countdown)
  // enroute: 0..1 від fromMin до toMin (позиція автобуса на маршруті)
  // past:    1
  let progress = 0;
  if (state === 'enroute' && toMin !== null && fromMin !== null && toMin > fromMin) {
    progress = (nowMin - fromMin) / (toMin - fromMin);
  } else if (state === 'past') {
    progress = 1;
  } else if (state === 'waiting' && minsToDeparture !== null) {
    progress = Math.max(0, Math.min(1, 1 - minsToDeparture / HERO_MAX_WAIT_MIN));
  }

  return {
    state,
    fromMin,
    toMin,
    minsToDeparture,
    minsToArrival,
    currentStop: current,
    nextStop: next,
    progress: Math.max(0, Math.min(1, progress)),
  };
}

// Форматує "ЧЕРЕЗ X ГОД Y ХВ" / "ЧЕРЕЗ X ХВ" — uppercase для табло-стилю
export function formatCountdownUpper(mins) {
  if (mins == null) return '';
  if (mins < 60) return `ЧЕРЕЗ ${mins} ХВ`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `ЧЕРЕЗ ${h} ГОД ${m} ХВ` : `ЧЕРЕЗ ${h} ГОД`;
}

// Форматує "X год Y хв" / "X хв" — нижній регістр для деталей
export function formatDuration(mins) {
  if (mins == null) return '';
  if (mins < 60) return `${mins} хв`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h} год ${m} хв` : `${h} год`;
}
