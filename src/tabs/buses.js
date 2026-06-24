import { escapeHtml, showToast } from '../core/utils.js';
import {
  toMinutes, minsToHHMM, nowMinutes,
  getStopMins, getStopHHMM, getRouteState, getRouteTimings,
  formatCountdownUpper,
} from '../core/bus-schedule.js';
import { getAnonId, savePushSubscription, deletePushSubscription, fetchTrackedRoutesFromDB } from '../core/supabase.js';
import { isLoggedIn, currentUserId, requireAuth, onAuthChange } from '../core/auth.js';

const PREFS_KEY = 'bus_prefs_v2';
const TRACK_KEY = 'bus_track_v2';

// VAPID public key (публічний ключ — безпечно зберігати у коді).
// Private key — тільки у Supabase Edge Function Secrets (VAPID_PRIVATE_KEY).
const VAPID_PUBLIC_KEY = 'BBsRg9Hv7JJLgBU-TEnQOnXtAEMpYPY3WrJyJQE4kHDAxFE1nxjj90rJ90dXzrLaYb1pPoGIJpqx8Zry87gB_4o';

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
// Масив відстежуваних рейсів: [{ routeId, trackDate, boardingStop, alightingStop,
//   notifiedDep, notifiedCanc, notifiedBoard, notifiedWarning, notifiedFuture }]
let trackedRoutes    = [];
let _bannerHideTimer = null;  // таймер автозакриття банеру
let _bannerEntry = null;      // запис трекінгу, який зараз показує банер (для дзвіночка)

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

// ── Push-сповіщення Level B ───────────────────────────────────────────────────

// Перетворює VAPID public key з Base64url у Uint8Array для pushManager.subscribe()
function urlBase64ToUint8Array(b64) {
  const pad  = '='.repeat((4 - b64.length % 4) % 4);
  const base = (b64 + pad).replace(/-/g, '+').replace(/_/g, '/');
  const raw  = atob(base);
  return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
}

// Підписує браузер на Web Push і зберігає у Supabase.
// Запитує дозвіл на сповіщення якщо ще не надано.
// Тихо виходить якщо: заборонено, немає SW, не сьогодні.
// Порівнює два ключі застосунку (applicationServerKey) побайтно.
// Потрібно щоб виявити стару підписку зі старим VAPID-ключем після ротації.
function pushKeysEqual(a, b) {
  if (!a || !b) return false;
  const ua = new Uint8Array(a);
  const ub = new Uint8Array(b);
  if (ua.length !== ub.length) return false;
  for (let i = 0; i < ua.length; i++) if (ua[i] !== ub[i]) return false;
  return true;
}

// Чи здатний цей пристрій/браузер взагалі показувати push (iOS-PWA, дозвіл тощо).
function isPushCapable() {
  return ('Notification' in window) && ('serviceWorker' in navigator) && ('PushManager' in window);
}

// Якщо push недоступний — повертає текст пояснення, інакше null.
// Використовується для чесного стану дзвіночка і тосту при збереженні.
function pushBlockedMsg() {
  if (!isPushCapable()) return 'Сповіщення недоступні на цьому пристрої';
  if (Notification.permission === 'denied') return 'Сповіщення вимкнені в налаштуваннях — нагадування не приходитимуть';
  return null;
}

async function subscribeToPush(routeId, routeName, boardingStop, alightingStop, trackDate, depTime) {
  // Дозволяємо сьогодні І майбутні дні: сервер (send-bus-push) видаляє лише
  // track_date<today і відбирає track_date==today, тож майбутній рядок вистрелить
  // у свій день. Блокуємо тільки минуле (підписка на нього безсенсова).
  if (trackDate < getTodayISO()) return;
  if (!('Notification' in window) || !('serviceWorker' in navigator)) return;
  try {
    let perm = Notification.permission;
    if (perm === 'denied') return;
    if (perm === 'default') perm = await Notification.requestPermission();
    if (perm !== 'granted') return;

    const reg    = await navigator.serviceWorker.ready;
    const appKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

    // Якщо в браузері вже є підписка зі ЗМІНЕНИМ ключем (після ротації VAPID) —
    // скасовуємо її, інакше pushManager.subscribe() кине InvalidStateError
    // і рейс лишиться без сповіщень. Якщо ключ не читається — не чіпаємо
    // (щоб не зламати робочу підписку на iOS, де options можуть бути приховані).
    let sub = await reg.pushManager.getSubscription();
    if (sub) {
      const existingKey = sub.options && sub.options.applicationServerKey;
      if (existingKey && !pushKeysEqual(existingKey, appKey)) {
        await sub.unsubscribe();
        sub = null;
      }
    }
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: appKey,
      });
    }

    const subJson = sub.toJSON();
    const payload = {
      // uid залогіненого жителя (Етап 2). RLS-перепис вимагає user_uuid = auth.uid()::text.
      user_uuid:      currentUserId() || getAnonId(),
      endpoint:       subJson.endpoint,
      p256dh:         subJson.keys.p256dh,
      auth_key:       subJson.keys.auth,
      route_id:       routeId,
      route_name:     routeName || '',
      boarding_stop:  boardingStop  || null,
      alighting_stop: alightingStop || null,
      track_date:     trackDate,
      dep_time:       depTime || null,
    };

    // Зберігаємо з одним повтором: якщо запит обірвався (напр. під час
    // оновлення додатку) — пробуємо ще раз, а не лишаємо рейс без push мовчки.
    let res = await savePushSubscription(payload);
    if (!res.ok) {
      await new Promise(r => setTimeout(r, 1500));
      res = await savePushSubscription(payload);
    }
    if (!res.ok) {
      console.warn('[push] не вдалося зберегти підписку:', res.error);
      showToast('Не вдалося увімкнути сповіщення — спробуйте ще раз');
    }
  } catch (err) {
    console.warn('[push] помилка підписки:', err);
    showToast('Не вдалося увімкнути сповіщення');
  }
}

// Видаляє підписку для конкретного маршруту з Supabase.
// НЕ скасовує браузерну підписку — інші маршрути продовжують працювати.
async function unsubscribeFromPush(routeId, trackDate) {
  // Симетрично до subscribeToPush: знімаємо підписку і для майбутніх днів,
  // інакше серверний рядок завтрашнього рейсу лишиться «висіти». Минуле сервер
  // прибирає сам (track_date<today), тож для нього нічого не робимо.
  if (trackDate < getTodayISO()) return;
  try {
    const reg = await navigator.serviceWorker.ready;
    const sub = await reg.pushManager.getSubscription();
    if (!sub) return;
    await deletePushSubscription(sub.endpoint, routeId, trackDate);
  } catch (err) {
    console.warn('[push] unsubscribe error:', err);
  }
}

// ── Track route (відстеження рейсу) ──────────────────────────────────
// Ключ per-uid — відстеження прив'язане до акаунта (анонім/чужий акаунт не бачить).
function trackKey() { return TRACK_KEY + ':' + (currentUserId() || ''); }

function loadTrackedRoute() {
  if (!isLoggedIn()) { trackedRoutes = []; return; }   // гість → нічого персонального
  try {
    const today = getTodayISO();
    const d = JSON.parse(localStorage.getItem(trackKey()));
    if (Array.isArray(d?.routes)) {
      trackedRoutes = d.routes.filter(t => t.trackDate >= today);
    } else {
      trackedRoutes = [];
    }
    if (!trackedRoutes.length) localStorage.removeItem(trackKey());
  } catch { trackedRoutes = []; }
}

function saveTrackedRoute() {
  if (isLoggedIn()) {
    if (!trackedRoutes.length) localStorage.removeItem(trackKey());
    else localStorage.setItem(trackKey(), JSON.stringify({ routes: trackedRoutes }));
  }
  // Сигнал для інших вкладок (Громада) — оновити їхній віджет автобуса в реальному часі
  window.dispatchEvent(new CustomEvent('cstl-bus-track-changed'));
}

// Гідрація з БД при вході: рейси, відстежені на ІНШОМУ пристрої (push_subscriptions
// per-uid), підтягуємо у локальний кеш → з'являються у hero/модалці тут.
async function hydrateTrackedFromDB() {
  if (!isLoggedIn()) return;
  try {
    const rows = await fetchTrackedRoutesFromDB(currentUserId(), getTodayISO());
    let added = false;
    for (const r of rows) {
      const dup = trackedRoutes.some(t =>
        t.routeId === r.routeId && t.trackDate === r.trackDate &&
        (t.boardingStop || null) === (r.boardingStop || null) &&
        (t.alightingStop || null) === (r.alightingStop || null));
      if (!dup) { trackedRoutes.push(r); added = true; }
    }
    if (added) saveTrackedRoute();
  } catch (e) { console.warn('[bus] hydrateTrackedFromDB:', e && e.message); }
}

function removeTrackedEntry(entry) {
  const idx = trackedRoutes.indexOf(entry);
  if (idx !== -1) trackedRoutes.splice(idx, 1);
  saveTrackedRoute();
}

function findTrackedEntry(routeId, boardingStop, alightingStop, date) {
  const day = date || busDay;
  return trackedRoutes.find(t =>
    t.routeId === routeId &&
    t.trackDate === day &&
    (t.boardingStop || null) === (boardingStop || null) &&
    (t.alightingStop || null) === (alightingStop || null)
  );
}

// Повертає true тільки якщо відстежується САМЕ цей маршрут + САМЕ ці зупинки сегменту
function isRouteSegmentTracked(routeId) {
  return !!findTrackedEntry(routeId, fromStop || null, toStop || null);
}

// Знаходить відстежуваний сегмент для hero-картки (перший запис для цього рейсу сьогодні).
// Якщо route переданий і час висадки вже минув — авто-знімає відстеження.
function getTrackedSegmentForHero(routeId, route = null) {
  const day = isViewingToday() ? getTodayISO() : busDay;
  const entry = trackedRoutes.find(t => t.routeId === routeId && t.trackDate === day) || null;
  if (entry && route && isViewingToday() && entry.alightingStop) {
    const alightMins = getStopMins(route, entry.alightingStop);
    if (alightMins !== null && nowMinutes() >= alightMins) {
      removeTrackedEntry(entry);
      return null;
    }
  }
  return entry;
}

function showBanner(label, route, isSubroute = false, entry = null) {
  const banner = document.getElementById('bus-track-banner');
  if (!banner) return;
  _bannerEntry = entry;          // запис, яким керує дзвіночок на банері
  const lEl = banner.querySelector('.btb-label');
  const rEl = banner.querySelector('.btb-route');
  if (lEl) {
    lEl.textContent = label;
    lEl.classList.toggle('btb-label--subroute', isSubroute);
    lEl.style.letterSpacing = '';
    if (isSubroute && label) {
      lEl.style.letterSpacing = '0px';
      void lEl.offsetWidth; // примусовий перерахунок CSS перед вимірюванням
      const avail = lEl.clientWidth;
      const textW = lEl.scrollWidth;
      const chars = label.length - 1;
      if (chars > 0 && avail > textW) {
        lEl.style.letterSpacing = ((avail - textW) / chars).toFixed(2) + 'px';
      }
    }
  }
  if (rEl) {
    rEl.textContent = route;
    rEl.style.fontSize = '14px';
    let fs = 14;
    while (rEl.scrollWidth > rEl.clientWidth && fs > 9.5) {
      fs -= 0.25;
      rEl.style.fontSize = fs + 'px';
    }
  }
  updateBannerBell();            // дзвіночок + верхній напис під стан notify
  if (_bannerHideTimer) { clearTimeout(_bannerHideTimer); _bannerHideTimer = null; }
  banner.style.transform = '';
  banner.classList.add('visible');
  _bannerHideTimer = setTimeout(() => { hideBanner(); _bannerHideTimer = null; }, 4000);
}

// Малює дзвіночок банера + верхній напис відповідно до стану _bannerEntry.notify.
// 3 стани як у «Збережених»: on (працює) / warn (notify=true, push недоступний) / off.
function updateBannerBell() {
  const banner = document.getElementById('bus-track-banner');
  if (!banner) return;
  const bell = banner.querySelector('.btb-bell');
  const hint = banner.querySelector('.btb-hint');
  if (!bell || !hint || !_bannerEntry) return;
  const notify  = _bannerEntry.notify !== false;
  const blocked = notify && !!pushBlockedMsg();
  bell.classList.remove('sr-bell--on', 'sr-bell--off', 'sr-bell--warn');
  if (!notify) {
    bell.classList.add('sr-bell--off'); bell.innerHTML = SR_BELL_OFF_SVG;
    bell.setAttribute('aria-label', 'Нагадування вимкнені — натисніть щоб увімкнути');
  } else if (blocked) {
    bell.classList.add('sr-bell--warn'); bell.innerHTML = SR_BELL_ON_SVG;
    bell.setAttribute('aria-label', 'Сповіщення недоступні — натисніть');
  } else {
    bell.classList.add('sr-bell--on'); bell.innerHTML = SR_BELL_ON_SVG;
    bell.setAttribute('aria-label', 'Нагадування увімкнені — натисніть щоб вимкнути');
  }
  hint.textContent = notify ? 'СПОВІЩЕННЯ ПРО РЕЙС АКТИВОВАНО' : 'СПОВІЩЕННЯ ПРО РЕЙС ВИМКНЕНО';
}

function hideBanner() {
  const banner = document.getElementById('bus-track-banner');
  if (banner) { banner.style.transform = ''; banner.classList.remove('visible'); }
  if (_bannerHideTimer) { clearTimeout(_bannerHideTimer); _bannerHideTimer = null; }
  _bannerEntry = null;
}

function fmtMins(m) {
  if (m < 60) return `${m} хв`;
  const h = Math.floor(m / 60), min = m % 60;
  return min ? `${h} год ${min} хв` : `${h} год`;
}

function fmtBannerDate(iso) {
  const months = ['СІЧ','ЛЮТ','БЕР','КВІ','ТРА','ЧЕР','ЛИП','СЕР','ВЕР','ЖОВ','ЛИС','ГРУ'];
  const [, m, d] = iso.split('-');
  return `${+d} ${months[+m - 1]}`;
}

function buildBannerTexts(route, tracked) {
  const [a, b] = parseRouteEndpoints(route.name);
  const segFrom = tracked.boardingStop  || a;
  const segTo   = tracked.alightingStop || b;
  const hasSeg  = segFrom.toUpperCase() !== a.toUpperCase() || segTo.toUpperCase() !== b.toUpperCase();

  const startTime = getStopHHMM(route, route.stops[0].name);
  const endTime   = getStopHHMM(route, route.stops[route.stops.length - 1].name);
  const timeStr   = (startTime && endTime) ? `${startTime} → ${endTime}` : '';

  const segFromTime = getStopHHMM(route, segFrom);
  const segToTime   = getStopHHMM(route, segTo);
  const segTimeStr  = (segFromTime && segToTime) ? `${segFromTime} → ${segToTime}` : timeStr;

  const heading    = hasSeg
    ? `${segFrom.toUpperCase()} - ${segTo.toUpperCase()}`
    : `${a.toUpperCase()} → ${b.toUpperCase()}`;

  const dateStr    = tracked.trackDate ? fmtBannerDate(tracked.trackDate) : '';
  const timeLabel  = hasSeg ? segTimeStr : timeStr;
  const subDefault = dateStr && timeLabel ? `${dateStr} | ${timeLabel}` : (timeLabel || dateStr);

  return { heading, subDefault };
}

function checkTrackNotifications(forceInitial = false) {
  const today = getTodayISO();
  // Прибираємо застарілі рейси (вчора і раніше)
  const before = trackedRoutes.length;
  trackedRoutes = trackedRoutes.filter(t => t.trackDate >= today);
  if (before !== trackedRoutes.length) saveTrackedRoute();

  if (!trackedRoutes.length) { hideBanner(); return; }

  // При forceInitial показуємо банер для останнього доданого рейсу
  const forceEntry = forceInitial ? trackedRoutes[trackedRoutes.length - 1] : null;

  for (const tracked of [...trackedRoutes]) {
    checkSingleTracked(tracked, tracked === forceEntry);
  }
}

function checkSingleTracked(tracked, forceInitial) {
  const today = getTodayISO();

  // Нагадування вимкнені для цього рейсу (дзвіночок off) — жодних банерів/сповіщень,
  // але рейс лишається збереженим і піднімається у hero.
  if (tracked.notify === false) return;

  // Майбутній день — банер один раз при додаванні
  if (tracked.trackDate > today) {
    if (!tracked.notifiedFuture) {
      tracked.notifiedFuture = true;
      saveTrackedRoute();
      const dayRoutes = (busData?.days?.[tracked.trackDate] || {}).routes || [];
      const route = dayRoutes.find(r => r.id === tracked.routeId);
      if (!route) return;
      const { heading, subDefault } = buildBannerTexts(route, tracked);
      showBanner(subDefault, heading, true, tracked);
    }
    return;
  }

  if (tracked.trackDate !== today) { removeTrackedEntry(tracked); return; }

  const dayRoutes = (busData?.days ? (busData.days[tracked.trackDate] || {}) : busData || {}).routes || [];
  const route = dayRoutes.find(r => r.id === tracked.routeId);
  if (!route) return;

  const { heading, subDefault } = buildBannerTexts(route, tracked);

  if (route.status === 'cancelled') {
    if (!tracked.notifiedCanc) {
      tracked.notifiedCanc = true;
      saveTrackedRoute();
      showBanner('Рейс скасовано', heading, false, tracked);
    }
    return;
  }

  const state   = getRouteState(route);
  const timings = getRouteTimings(route);

  if (state === 'past') {
    unsubscribeFromPush(tracked.routeId, tracked.trackDate);  // не лишати висячу серверну підписку
    removeTrackedEntry(tracked);
    return;
  }

  // Авто-скидання: якщо час висадки з пункту Б вже минув — сегмент завершено
  if (tracked.alightingStop) {
    const alightMins = getStopMins(route, tracked.alightingStop);
    if (alightMins !== null && nowMinutes() >= alightMins) {
      unsubscribeFromPush(tracked.routeId, tracked.trackDate);  // не лишати висячу серверну підписку
      removeTrackedEntry(tracked);
      return;
    }
  }

  let forceShow = forceInitial;

  if (state === 'enroute') {
    if (!tracked.notifiedDep) { tracked.notifiedDep = true; forceShow = true; saveTrackedRoute(); }
    if (tracked.boardingStop) {
      const boardMins = getStopMins(route, tracked.boardingStop);
      if (boardMins !== null) {
        const minsToBoard = boardMins - nowMinutes();
        if (minsToBoard > 0) {
          if (!tracked.notifiedBoard && minsToBoard <= 15) {
            tracked.notifiedBoard = true; forceShow = true; saveTrackedRoute();
          }
          if (forceShow) showBanner(
            minsToBoard <= 15
              ? `До ${tracked.boardingStop.toUpperCase()} за ${fmtMins(minsToBoard)}`
              : 'В дорозі',
            heading, false, tracked);
          return;
        }
      }
    }
    if (forceShow) showBanner('Вже в дорозі', heading, false, tracked);
    return;
  }

  if (state === 'waiting' && timings.minsToDeparture !== null) {
    const m = timings.minsToDeparture;
    if (!tracked.notifiedWarning && m <= 15) {
      tracked.notifiedWarning = true; forceShow = true; saveTrackedRoute();
    }
    if (forceShow) showBanner(
      m <= 15 ? `Відправляється через ${fmtMins(m)}` : `Через ${fmtMins(m)}`,
      heading, false, tracked);
    return;
  }

  // Стан очікування без таймеру — показуємо підзаголовок (тільки при першому відстеженні)
  if (forceShow) showBanner(subDefault, heading, true, tracked);
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
  if (fromStop) {
    const match = route.stops.find(s => normalizeStopName(s.name) === normalizeStopName(fromStop));
    if (match) return match.name; // повертаємо raw-назву з даних (може бути "Хорлупи пов.")
  }
  return route.stops[0].name;
}

function getEffectiveTo(route) {
  if (toStop) {
    const match = route.stops.find(s => normalizeStopName(s.name) === normalizeStopName(toStop));
    if (match) return match.name;
  }
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
  const fStop = fromStop ? stops.find(s => normalizeStopName(s.name) === normalizeStopName(fromStop)) : null;
  const tStop = toStop   ? stops.find(s => normalizeStopName(s.name) === normalizeStopName(toStop))   : null;
  if (fromStop && !fStop) return false;
  if (toStop   && !tStop) return false;
  // Напрямок: fromStop повинен бути географічно ДО toStop (за км)
  if (fromStop && toStop && fStop.km > tStop.km) return false;
  return true;
}

// «Past» = рейс завершився (прибув на кінцеву). Рейс у дорозі тепер НЕ past.
// Виняток: скасований рейс переходить у «минулі» з моменту часу відправлення.
// Виняток 2: якщо є фільтр «Звідки» і автобус вже проїхав зупинку посадки —
//   для цього користувача рейс є минулим (сісти вже неможливо).
function isPastRoute(route) {
  if (busDay < getTodayISO()) return true;
  if (!isViewingToday()) return false;
  const state = getRouteState(route);
  if (state === 'past') return true;
  if (route.status === 'cancelled' && state !== 'waiting') return true;
  if (state === 'enroute' && fromStop) {
    const boardMins = getStopMins(route, getEffectiveFrom(route));
    if (boardMins !== null && nowMinutes() > boardMins) return true;
  }
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
  const enroute = all.filter(r => {
    if (getRouteState(r) !== 'enroute') return false;
    if (fromStop) {
      const boardMins = getStopMins(r, getEffectiveFrom(r));
      if (boardMins !== null && nowMinutes() > boardMins) return false;
    }
    return true;
  });
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
  // Для майбутніх/минулих днів — відстежувані рейси або вибраний або перший
  if (!isViewingToday()) {
    const trackedForDay = trackedRoutes.filter(t => t.trackDate === busDay);
    if (trackedForDay.length) {
      const trackedIds = new Set(trackedForDay.map(t => t.routeId));
      const tracked = all.filter(r => trackedIds.has(r.id) && r.status !== 'cancelled');
      if (tracked.length) return tracked;
    }
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
    if (state === 'enroute') {
      if (fromStop) {
        const boardMins = getStopMins(r, getEffectiveFrom(r));
        if (boardMins !== null && nowMinutes() > boardMins) return false;
      }
      return true;
    }
    if (state === 'waiting') {
      const t = getRouteTimings(r);
      return t.minsToDeparture !== null && t.minsToDeparture <= 90;
    }
    return false;
  });
  const activeList = result.length ? result : (findNextRoute() ? [findNextRoute()] : []);
  // Відстежувані рейси — піднімаємо на початок (кожен унікальний routeId)
  const trackedTodayIds = [...new Set(
    trackedRoutes.filter(t => t.trackDate === getTodayISO()).map(t => t.routeId)
  )];
  [...trackedTodayIds].reverse().forEach(rid => {
    const ti = activeList.findIndex(r => r.id === rid);
    if (ti > 0) {
      activeList.unshift(activeList.splice(ti, 1)[0]);
    } else if (ti === -1) {
      const tr = all.find(r => r.id === rid && r.status !== 'cancelled');
      if (tr) activeList.unshift(tr);
    }
  });
  return activeList;
}

// Прибирає суфікс " пов." (поворот — технічне позначення на квитках VOPAS).
// "Хорлупи пов." і "Хорлупи" — одна фізична зупинка.
function normalizeStopName(name) {
  return name.replace(/\s+пов\.$/, '').trim();
}

function getAllStops() {
  if (!busData) return [];
  const seen = new Set();
  // Тільки зупинки обраного дня — пошук завжди в рамках поточної дати.
  // Нормалізуємо назви щоб "Хорлупи пов." і "Хорлупи" не дублювались у дропдауні.
  (getDayData().routes || []).forEach(r => r.stops.forEach(s => seen.add(normalizeStopName(s.name))));
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
// Будує HTML лише списку зупинок (без поля вводу і заголовку)
function buildDropdownListHtml(query) {
  const all      = getAllStops();
  const q        = query.trim().toLowerCase();
  const filtered = q ? all.filter(s => s.toLowerCase().includes(q)) : all;
  const current  = activeField === 'from' ? fromStop : toStop;

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

  return clearHtml + itemsHtml;
}

// Навішує обробники на елементи списку (кнопки зупинок + "Очистити")
function attachDropdownListListeners() {
  const dd = document.getElementById('bs-dropdown');
  if (!dd) return;

  document.getElementById('bs-dd-clear')?.addEventListener('click', () => {
    selectStop('', activeField);
  });

  dd.querySelectorAll('.bs-dd-item').forEach(btn => {
    btn.addEventListener('mousedown', e => e.preventDefault()); // не знімати фокус
    btn.addEventListener('click', () => selectStop(btn.dataset.stop, activeField));
  });
}

// Оновлює ТІЛЬКИ список при наборі — поле вводу лишається в DOM,
// тому фокус і клавіатура (на iOS) не зникають.
function updateDropdownList(query) {
  const list = document.querySelector('#bs-dropdown .bs-dd-list');
  if (!list) return;
  list.innerHTML = buildDropdownListHtml(query);
  attachDropdownListListeners();
}

function renderDropdownItems(query) {
  const dd = document.getElementById('bs-dropdown');
  if (!dd) return;

  const title = activeField === 'from' ? 'Звідки їдете?' : 'Куди їдете?';

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
      ${buildDropdownListHtml(query)}
    </div>
  `;

  // Фільтр при наборі — оновлюємо лише список, поле вводу не пересоздаємо
  document.getElementById('bs-dd-filter')?.addEventListener('input', e => {
    updateDropdownList(e.target.value);
  });

  // Закрити ✕
  document.getElementById('bs-dd-x')?.addEventListener('click', closeDropdown);

  // Обробники елементів списку
  attachDropdownListListeners();
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

export function buildHeroCard(route, timings, index, total, seg = null) {
  const [routeA, routeB] = parseRouteEndpoints(route.name || '');
  const segFrom = seg?.boardingStop  || null;
  const segTo   = seg?.alightingStop || null;
  const hasSeg  = !!(segFrom && segTo &&
    (segFrom.toUpperCase() !== routeA.toUpperCase() || segTo.toUpperCase() !== routeB.toUpperCase()));

  const effFrom   = hasSeg ? segFrom : getEffectiveFrom(route);
  const effTo     = hasSeg ? segTo   : getEffectiveTo(route);
  const fromTime  = getStopHHMM(route, effFrom);
  const toTime    = getStopHHMM(route, effTo);
  const isEnroute = timings.state === 'enroute';
  const isUrgent  = timings.state === 'waiting' && timings.minsToDeparture !== null && timings.minsToDeparture <= 10;

  const fromMin = hasSeg ? getStopMins(route, segFrom) : timings.fromMin;
  const toMin   = hasSeg ? getStopMins(route, segTo)   : timings.toMin;
  const durMins = (fromMin !== null && toMin !== null) ? toMin - fromMin : null;
  const durStr  = durMins !== null
    ? (durMins >= 60
        ? `${Math.floor(durMins / 60)} год${durMins % 60 ? ' ' + durMins % 60 + ' хв' : ''}`
        : `${durMins} хв`)
    : '';

  const statusDotClass = isEnroute ? 'enroute' : isUrgent ? 'urgent' : 'waiting';
  const statusDot  = `<span class="bhv4-state-dot bhv4-state-dot--${statusDotClass}"></span>`;
  const statusText = isEnroute ? 'в дорозі' : isUrgent ? 'відправляється' : 'очікується';

  const lastKnownStop = route.stops[route.stops.length - 1].name;
  // Якщо nextStop = остання зупинка в даних (кінець відомого відрізку),
  // показуємо реальну кінцеву з назви маршруту (наприклад Жорнище замість Луцьк)
  const displayNext = timings.nextStop === lastKnownStop ? routeB : (timings.nextStop || routeB);

  let nextStopContent = '';
  if (isEnroute) {
    if (hasSeg) {
      const boardMins = getStopMins(route, segFrom);
      if (boardMins !== null && boardMins - nowMinutes() > 0) {
        nextStopContent = `ДО ${segFrom.toUpperCase()} ЗА ${fmtMins(boardMins - nowMinutes()).toUpperCase()}`;
      } else {
        nextStopContent = `НАСТУПНА ЗУПИНКА — ${displayNext.toUpperCase()}`;
      }
    } else {
      nextStopContent = `НАСТУПНА ЗУПИНКА — ${displayNext.toUpperCase()}`;
    }
  } else if (timings.state === 'waiting' && timings.minsToDeparture !== null) {
    nextStopContent = formatCountdownUpper(timings.minsToDeparture);
  }

  const dotsHtml = total > 1
    ? Array.from({ length: total }, (_, i) =>
        `<span class="bhv4-dot-nav${i === index ? ' bhv4-dot-nav--active' : ''}" data-idx="${i}"></span>`
      ).join('')
    : '';

  const heroTrackBtnHtml = seg
    ? `<button class="bhv4-hero-track-btn" data-untrack-id="${escapeHtml(route.id)}" aria-label="Скасувати відстеження"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>`
    : '';

  // Повний маршрут — eyebrow (надзаголовок) НАД назвою сегмента. Тільки при
  // сегментному відстеженні (коли назва-заголовок = проміжний відрізок).
  const routeFullHtml = hasSeg
    ? `<div class="bhv4-route-full bhv4-dyn">${escapeHtml(routeA.toUpperCase())} → ${escapeHtml(routeB.toUpperCase())}</div>`
    : '';

  // Статичні елементи (не фейдяться при свайпі): іконка автобуса, рамка капсули часу
  // Динамічні (клас bhv4-dyn, фейдяться): назва, час всередині капсули, тривалість,
  // наступна зупинка/відлік, шкала прогресу
  return `
    <div class="bhv4${isUrgent ? ' bhv4--urgent' : ''}${isEnroute ? ' bhv4--enroute' : ''}">
      <img class="bhv4-bg-img" src="./images/bus-hero2.png" alt="" aria-hidden="true">
      <div class="bhv4-overlay"></div>

      <span class="bhv4-dots-nav">${dotsHtml}${heroTrackBtnHtml}</span>

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
            ${routeFullHtml}
            <div class="bhv4-route-name bhv4-dyn">${escapeHtml(hasSeg ? `${segFrom.toUpperCase()} → ${segTo.toUpperCase()}` : `${routeA.toUpperCase()} → ${routeB.toUpperCase()}`)}</div>
            <div class="bhv4-times-row">
              <span class="bhv4-time-capsule"><span class="bhv4-dyn bhv4-capsule-inner">${escapeHtml(fromTime || '—')} → ${escapeHtml(toTime || '—')}</span></span>
              <span class="bhv4-duration bhv4-dyn">${escapeHtml(durStr)}</span>
            </div>
            <div class="bhv4-next-stop bhv4-dyn">${escapeHtml(nextStopContent)}</div>
          </div>
        </div>

        <div class="bhv4-map-outer">${renderRouteMapV4(route, timings)}</div>
      </div>
    </div>`;
}

// Повідомлення для порожнього табло (коли активних рейсів нема).
// Враховує фільтр Звідки/Куди і чи дивимось сьогодні/інший день.
function emptyHeroMessage() {
  if (fromStop || toStop) {
    const seg = `${fromStop ? 'З ' + fromStop.toUpperCase() : ''}${fromStop && toStop ? ' ДО ' : ''}${toStop ? toStop.toUpperCase() : ''}`;
    return `РЕЙСІВ ${seg} ${isViewingToday() ? 'СЬОГОДНІ' : 'НА ЦЕЙ ДЕНЬ'} НЕМАЄ`;
  }
  return isViewingToday()
    ? 'СЬОГОДНІ РЕЙСІВ БІЛЬШЕ НЕ ЗАПЛАНОВАНО'
    : 'НА ЦЕЙ ДЕНЬ РЕЙСІВ НЕ ЗНАЙДЕНО';
}

// Порожнє табло — те саме бордове табло, але з повідомленням по центру.
// Тримається на місці завжди, навіть коли рейсів нема (за бажанням Вови/Роми).
function buildEmptyHeroCard(msg) {
  return `
    <div class="bhv4 bhv4--empty">
      <img class="bhv4-bg-img" src="./images/bus-hero2.png" alt="" aria-hidden="true">
      <div class="bhv4-overlay"></div>
      <div class="bhv4-content bhv4-empty-content">
        <svg class="bhv4-empty-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
          <rect x="2" y="4" width="20" height="13" rx="2"/><path d="M2 9h20"/><path d="M8 4v5M16 4v5"/><circle cx="7" cy="20" r="1.5"/><circle cx="17" cy="20" r="1.5"/><path d="M5.5 17H2v2.5M18.5 17H22v2.5"/>
        </svg>
        <div class="bhv4-empty-msg">${escapeHtml(msg)}</div>
      </div>
    </div>`;
}

function renderSmartRow() {
  const el = document.getElementById('bus-smart-row');
  if (!el) return;

  const routes = findActiveRoutes();
  if (!routes.length) {
    // Табло лишається на місці — повідомлення про відсутність рейсів усередині нього
    el.innerHTML = buildEmptyHeroCard(emptyHeroMessage());
    return;
  }

  // Коригуємо індекс якщо кількість рейсів змінилась
  if (smartRowIndex >= routes.length) smartRowIndex = 0;

  const route   = routes[smartRowIndex];
  const timings = getTimingsForDisplay(route);
  const seg     = getTrackedSegmentForHero(route.id, route);
  el.innerHTML  = buildHeroCard(route, timings, smartRowIndex, routes.length, seg);

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

  // Іконка-закладка «скасувати відстеження» у hero (top-right)
  const heroTrackBtn = el.querySelector('.bhv4-hero-track-btn');
  if (heroTrackBtn) {
    heroTrackBtn.addEventListener('click', () => {
      const rid   = heroTrackBtn.dataset.untrackId;
      const entry = getTrackedSegmentForHero(rid, route);
      if (entry) {
        unsubscribeFromPush(entry.routeId, entry.trackDate);
        removeTrackedEntry(entry);
        checkTrackNotifications(false);
        renderSmartRow();
        renderRouteList();
      }
    });
  }
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
    const seg     = getTrackedSegmentForHero(route.id, route);
    const [routeA, routeB] = parseRouteEndpoints(route.name || '');
    const segFrom = seg?.boardingStop || null;
    const segTo   = seg?.alightingStop || null;
    const hasSeg  = !!(segFrom && segTo &&
      (segFrom.toUpperCase() !== routeA.toUpperCase() ||
       segTo.toUpperCase() !== routeB.toUpperCase()));
    const isEnroute = timings.state === 'enroute';
    const isUrgent  = timings.state === 'waiting' && timings.minsToDeparture !== null && timings.minsToDeparture <= 10;

    // Оновлюємо клас картки (urgent/enroute для кольору і анімації крапки)
    card.className = `bhv4${isUrgent ? ' bhv4--urgent' : ''}${isEnroute ? ' bhv4--enroute' : ''}`;

    // Крапки-навігатори + іконка закладки (коли є будь-яке відстеження) — миттєво
    const dotsNav = card.querySelector('.bhv4-dots-nav');
    if (dotsNav) {
      const trackBtnHtml = seg
        ? `<button class="bhv4-hero-track-btn" data-untrack-id="${escapeHtml(route.id)}" aria-label="Скасувати відстеження"><svg viewBox="0 0 24 24" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>`
        : '';
      const newDotsHtml = routes.length > 1
        ? Array.from({ length: routes.length }, (_, i) =>
            `<span class="bhv4-dot-nav${i === smartRowIndex ? ' bhv4-dot-nav--active' : ''}" data-idx="${i}"></span>`
          ).join('')
        : '';
      dotsNav.innerHTML = newDotsHtml + trackBtnHtml;
      dotsNav.querySelectorAll('.bhv4-dot-nav').forEach(dot =>
        dot.addEventListener('click', e => { smartRowIndex = +e.target.dataset.idx; switchHeroCard(); })
      );
      const heroBtn = dotsNav.querySelector('.bhv4-hero-track-btn');
      if (heroBtn) {
        heroBtn.addEventListener('click', () => {
          const entry = getTrackedSegmentForHero(route.id, route);
          if (entry) {
            unsubscribeFromPush(entry.routeId, entry.trackDate);
            removeTrackedEntry(entry);
            checkTrackNotifications(false);
            renderSmartRow();
            renderRouteList();
          }
        });
      }
    }

    // Статус (текст + крапка)
    const statusWrap = card.querySelector('.bhv4-status .bhv4-dyn');
    if (statusWrap) {
      const txt = isEnroute ? 'в дорозі' : isUrgent ? 'відправляється' : 'очікується';
      const dotCls = isEnroute ? 'enroute' : isUrgent ? 'urgent' : 'waiting';
      const dot = `<span class="bhv4-state-dot bhv4-state-dot--${dotCls}"></span>`;
      statusWrap.innerHTML = `<span class="bhv4-status-text">${txt}</span> <span class="bhv4-status-dot">${dot}</span>`;
    }

    // Назва маршруту (сегмент або повна) + підзаголовок
    const nameEl        = card.querySelector('.bhv4-route-name');
    const existingFull  = card.querySelector('.bhv4-route-full');
    if (nameEl) {
      if (hasSeg) {
        nameEl.textContent = `${segFrom.toUpperCase()} → ${segTo.toUpperCase()}`;
        if (existingFull) {
          existingFull.textContent = `${routeA.toUpperCase()} → ${routeB.toUpperCase()}`;
        } else {
          const fullEl = document.createElement('div');
          fullEl.className = 'bhv4-route-full bhv4-dyn';
          fullEl.textContent = `${routeA.toUpperCase()} → ${routeB.toUpperCase()}`;
          nameEl.insertAdjacentElement('beforebegin', fullEl);   // eyebrow НАД назвою
        }
      } else {
        nameEl.textContent = `${routeA.toUpperCase()} → ${routeB.toUpperCase()}`;
        if (existingFull) existingFull.remove();
      }
    }

    // Час всередині капсули
    const capsuleEl = card.querySelector('.bhv4-capsule-inner');
    if (capsuleEl) {
      const dispFrom = hasSeg ? segFrom : getEffectiveFrom(route);
      const dispTo   = hasSeg ? segTo   : getEffectiveTo(route);
      capsuleEl.textContent = `${getStopHHMM(route, dispFrom) || '—'} → ${getStopHHMM(route, dispTo) || '—'}`;
    }

    // Тривалість
    const durEl = card.querySelector('.bhv4-duration');
    if (durEl) {
      const dFrom = hasSeg ? getStopMins(route, segFrom) : timings.fromMin;
      const dTo   = hasSeg ? getStopMins(route, segTo)   : timings.toMin;
      const d     = dFrom !== null && dTo !== null ? dTo - dFrom : null;
      durEl.textContent = d !== null
        ? (d >= 60 ? `${Math.floor(d/60)} год${d%60 ? ' '+d%60+' хв':''}` : `${d} хв`)
        : '';
    }

    // Наступна зупинка / відлік (з урахуванням сегменту)
    const nextEl = card.querySelector('.bhv4-next-stop');
    if (nextEl) {
      const lastStop = route.stops[route.stops.length - 1].name;
      const dispNext = timings.nextStop === lastStop ? routeB : (timings.nextStop || routeB);
      let nextContent = '';
      if (isEnroute) {
        if (hasSeg) {
          const boardMins = getStopMins(route, segFrom);
          if (boardMins !== null && boardMins - nowMinutes() > 0) {
            nextContent = `ДО ${segFrom.toUpperCase()} ЗА ${fmtMins(boardMins - nowMinutes()).toUpperCase()}`;
          } else {
            nextContent = `НАСТУПНА ЗУПИНКА — ${dispNext.toUpperCase()}`;
          }
        } else {
          nextContent = `НАСТУПНА ЗУПИНКА — ${dispNext.toUpperCase()}`;
        }
      } else if (isUrgent || (timings.state === 'waiting' && timings.minsToDeparture !== null)) {
        nextContent = formatCountdownUpper(timings.minsToDeparture);
      }
      nextEl.textContent = nextContent;
    }

    // Мітки А і Б на прогрес-шкалі (завжди повний маршрут)
    const labelsEl = card.querySelector('.bhv4-labels');
    if (labelsEl) {
      labelsEl.innerHTML =
        `<span class="bhv4-label bhv4-label--a">${escapeHtml(routeA.toUpperCase())}</span>` +
        `<span class="bhv4-label bhv4-label--b">${escapeHtml(routeB.toUpperCase())}</span>`;
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
      // Повідомлення про відсутність рейсів тепер у табло (renderSmartRow)
      el.innerHTML = titleHtml0;
    } else {
      // Повідомлення про відсутність рейсів тепер у табло (renderSmartRow)
      el.innerHTML = titleHtml0;
      const updRow = document.getElementById('buses-updated-row');
      if (updRow && busData) {
        updRow.innerHTML = buildSourceHtml();
      }
    }
    return;
  }

  if (!toRender.length) {
    const dd1 = getDayData();
    const updStr1 = dd1.fetchedTime
      ? `Оновлено: ${escapeHtml(dd1.fetchedTime)} | ${escapeHtml(dd1.fetchedAt)}`
      : 'Дані оновлюються...';
    el.innerHTML = buildListTitleHtml(updStr1) + `
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

    // Маркери ● і 📍 у списку зупинок: якщо немає активного фільтру але є
    // відстежуваний сегмент — показуємо маркери для зупинок сегменту
    const trackedSeg     = getTrackedSegmentForHero(route.id, route);
    const [rA, rB]       = parseRouteEndpoints(route.name || '');
    const hasTrackedSeg  = !!(
      trackedSeg?.boardingStop && trackedSeg?.alightingStop &&
      (trackedSeg.boardingStop.toUpperCase()  !== rA.toUpperCase() ||
       trackedSeg.alightingStop.toUpperCase() !== rB.toUpperCase())
    );
    const hlFrom = (!fromStop && !toStop && hasTrackedSeg) ? trackedSeg.boardingStop  : effFrom;
    const hlTo   = (!fromStop && !toStop && hasTrackedSeg) ? trackedSeg.alightingStop : effTo;

    const isEnroute = isViewingToday() && getRouteState(route) === 'enroute' && route.status !== 'cancelled';
    // Для рейсу "в дорозі" — визначаємо поточну і наступну зупинку
    const liveTimings     = isEnroute ? getRouteTimings(route) : null;
    const liveCurrentStop = liveTimings?.currentStop || null;
    const liveNextStop    = liveTimings?.nextStop    || null;

    const fromIdx   = route.stops.findIndex(s => s.name === effFrom);
    const stopsHtml = route.stops.map((s, idx) => {
      const isFrom    = s.name === hlFrom;
      const isTo      = s.name === hlTo;
      const hl        = isFrom || isTo;
      const isCurrent = isEnroute && s.name === liveCurrentStop;
      const isNextS   = isEnroute && s.name === liveNextStop;
      const t         = getStopHHMM(route, s.name);
      let cls = 'bs-stop-row';
      if (isFrom)    cls += ' hl hl--from';
      else if (isTo) cls += ' hl hl--to';
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
      const priceHtml = '';
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
    // anySegment=true коли хоча б одна вибрана зупинка відрізняється від крайньої точки маршруту.
    // Охоплює всі типи пошуку: тільки "звідки", тільки "куди", або обидва.
    const fromDiffers = fromStop && route.stops.some(s => s.name === fromStop) && ep1.toUpperCase() !== fromStop.toUpperCase();
    const toDiffers   = toStop   && route.stops.some(s => s.name === toStop)   && ep2.toUpperCase() !== toStop.toUpperCase();
    const anySegment  = fromDiffers || toDiffers;
    // Час першої і останньої зупинки маршруту (не сегменту)
    const routeStartTime = getStopHHMM(route, route.stops[0].name);
    const routeEndTime   = getStopHHMM(route, route.stops[route.stops.length - 1].name);
    const routeTimeStr   = (routeStartTime && routeEndTime) ? ` | ${routeStartTime} → ${routeEndTime}` : '';
    // Заголовок = сегмент (без часу), підзаголовок = повний маршрут великими + час маршруту
    const routeLabel = anySegment
      ? `${effFrom.toUpperCase()} - ${effTo.toUpperCase()}`
      : `${ep1.toUpperCase()} → ${ep2.toUpperCase()}`;
    const fullLabel = anySegment
      ? `<span class="bs-route-full">${escapeHtml(ep1.toUpperCase())} → ${escapeHtml(ep2.toUpperCase())}${escapeHtml(routeTimeStr)}</span>`
      : '';
    // Підзаголовок відстежуваного сегменту: коли немає активного фільтру але є відстежуваний сегмент
    const trackedSegDepTime    = hasTrackedSeg ? getStopHHMM(route, trackedSeg.boardingStop)  : null;
    const trackedSegArrival    = hasTrackedSeg ? getStopHHMM(route, trackedSeg.alightingStop) : null;
    const trackedSegTimeStr    = (trackedSegDepTime && trackedSegArrival)
      ? ` | ${trackedSegDepTime} - ${trackedSegArrival}`
      : (trackedSegDepTime ? ` | ${trackedSegDepTime}` : '');
    const trackedSegSubtitle = (!anySegment && hasTrackedSeg)
      ? `<span class="bs-route-full"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>${escapeHtml(trackedSeg.boardingStop.toUpperCase())} - ${escapeHtml(trackedSeg.alightingStop.toUpperCase())}${escapeHtml(trackedSegTimeStr)}</span>`
      : '';

    // Закладка відстеження: проміжний (сегментний) рейс → завжди бордова (.tracked-seg),
    // повний маршрут → чорна (.tracked). Бордова більше не залежить від активного фільтра.
    const isTrackedNow = isRouteSegmentTracked(route.id) || (!!trackedSeg && !anySegment);
    const trackBtnCls  = isTrackedNow ? (hasTrackedSeg ? ' tracked-seg' : ' tracked') : '';

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
            <div class="bus-card-route">${trackedSegSubtitle}${escapeHtml(routeLabel)}${fullLabel}</div>
            <div class="bus-card-meta">
              <span>Орієнтовно: <span style="white-space:nowrap">${escapeHtml(durStr)}</span></span>
              <span class="bus-meta-sep">·</span>
              <span>${c.name.split('\n').map(escapeHtml).join('<br>')}</span>
            </div>
            ${autoNote}
          </div>
          ${busDay >= getTodayISO() && !isPast && route.status !== 'cancelled'
            ? `<button class="bs-track-btn${trackBtnCls}" data-track-id="${escapeHtml(route.id)}" aria-label="${isTrackedNow ? 'Не відстежувати' : 'Відстежити маршрут'}"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg></button>`
            : ''}
        </div>
        ${route.stops && route.stops.length > 2
          ? `<button class="bs-toggle" data-id="${escapeHtml(route.id)}">
               ${expanded ? 'СХОВАТИ ЗУПИНКИ' : 'ВСІ ЗУПИНКИ'} <span class="bs-toggle-arr">${expanded ? '▴' : '▾'}</span>
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
    // Повідомлення про завершення рейсів тепер у табло (renderSmartRow), не в списку
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

  el.querySelectorAll('.bs-track-btn').forEach(btn => {
    btn.addEventListener('click', e => {
      e.stopPropagation();
      const rid = btn.dataset.trackId;
      const tracked = isRouteSegmentTracked(rid);
      const trackedSeg = btn.classList.contains('tracked-seg');
      if (tracked || trackedSeg) {
        const entry = findTrackedEntry(rid, fromStop || null, toStop || null)
          || trackedRoutes.find(t => t.routeId === rid && t.trackDate === busDay);
        if (entry) {
          unsubscribeFromPush(entry.routeId, entry.trackDate);
          removeTrackedEntry(entry);
        }
        checkTrackNotifications(false);
      } else {
        // Гейтинг (Етап 2): відстеження + push-сповіщення — лише для залогінених.
        if (!isLoggedIn()) { requireAuth('відстежувати автобус', () => {}); return; }
        // Дані рейсу денормалізуємо у запис → модалка «Збережені» малюється будь-де
        // (на будь-якій вкладці), без доступу до даних розкладу.
        const route   = (getDayData().routes || []).find(r => r.id === rid);
        const segFrom = fromStop || null;
        const segTo   = toStop   || null;
        const depTime = route ? getStopHHMM(route, getEffectiveFrom(route)) : null;
        const arrTime = route ? getStopHHMM(route, getEffectiveTo(route))   : null;
        const [rA, rB] = parseRouteEndpoints(route?.name || '');
        // Проміжний (сегментний) рейс: посадка/висадка відрізняються від кінців маршруту
        const isSeg = !!(segFrom && segTo &&
          (segFrom.toUpperCase() !== rA.toUpperCase() || segTo.toUpperCase() !== rB.toUpperCase()));
        const title   = isSeg ? `${segFrom} → ${segTo}` : `${rA} → ${rB}`;
        // Повний маршрут-батько + його час (для підзаголовка «це проміжний рейс»)
        const fullTitle = `${rA} → ${rB}`;
        const stops     = route?.stops || [];
        const fullDep   = stops.length ? getStopHHMM(route, stops[0].name) : null;
        const fullArr   = stops.length ? getStopHHMM(route, stops[stops.length - 1].name) : null;
        const fullTimeStr = (fullDep && fullArr) ? `${fullDep} → ${fullArr}` : (fullDep || '');
        // Зберігаємо notifiedDep якщо той самий повний маршрут вже відстежується
        const existing = trackedRoutes.find(t => t.routeId === rid && t.trackDate === busDay);
        trackedRoutes.push({
          routeId:         rid,
          trackDate:       busDay,
          boardingStop:    segFrom,
          alightingStop:   segTo,
          notify:          true,        // нагадування авто-увімкнені при збереженні
          title,                        // денормалізовано для модалки «Збережені»
          isSeg,                        // проміжний рейс → показати повний маршрут окремо
          fullTitle,                    // ВІД → ДО повного маршруту-батька
          fullTimeStr,                  // час повного маршруту HH:MM → HH:MM
          depTime:         depTime || '',
          arrTime:         arrTime || '',
          notifiedDep:     existing ? existing.notifiedDep     : false,
          notifiedWarning: existing ? existing.notifiedWarning : false,
          notifiedCanc:    false,
          notifiedBoard:   false,
          notifiedFuture:  false,
        });
        saveTrackedRoute();
        // Level B: підписка на Web Push (запитає дозвіл якщо ще не надано)
        subscribeToPush(rid, route?.name || '', segFrom, segTo, busDay, depTime);
        // §5.3 — чесний зворотний зв'язок: якщо push завідомо недоступний, кажемо одразу
        const blocked = pushBlockedMsg();
        if (blocked) showToast(`Збережено. ${blocked}`);
        checkTrackNotifications(true);
      }
      renderSmartRow();
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
// ════════════════════════════════════════════════════════════════════════════
// ЗБЕРЕЖЕНІ РЕЙСИ — глобальна іконка в хедері + слайд-модалка керування.
// Збереження = відстеження (trackedRoutes). Дзвіночок (notify) роздільний:
// можна лишити рейс збереженим, але вимкнути нагадування.
// ════════════════════════════════════════════════════════════════════════════

const SR_BOOKMARK_SVG = '<svg viewBox="0 0 24 24" width="19" height="19" fill="currentColor" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>';
const SR_BELL_ON_SVG  = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>';
const SR_BELL_OFF_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M13.73 21a2 2 0 0 1-3.46 0"/><path d="M18.63 13A17.89 17.89 0 0 1 18 8"/><path d="M6.26 6.26A5.86 5.86 0 0 0 6 8c0 7-3 9-3 9h14"/><path d="M18 8a6 6 0 0 0-9.33-5"/><line x1="1" y1="1" x2="23" y2="23"/></svg>';

// Підпис дня (сьогодні / завтра / DD.MM) — локальні компоненти, без зсуву UTC
function savedRouteDayLabel(trackDate) {
  const today = getTodayISO();
  if (trackDate === today) return 'сьогодні';
  const [y, m, d] = today.split('-').map(Number);
  const tm = new Date(y, m - 1, d + 1);
  const tomorrow = `${tm.getFullYear()}-${String(tm.getMonth() + 1).padStart(2, '0')}-${String(tm.getDate()).padStart(2, '0')}`;
  if (trackDate === tomorrow) return 'завтра';
  const [, mm, dd] = trackDate.split('-');
  return `${dd}.${mm}`;
}

// Збережені рейси для UI (відсортовані за датою+часом)
function getSavedRoutesForUI() {
  return [...trackedRoutes]
    .sort((a, b) => (a.trackDate + (a.depTime || '')).localeCompare(b.trackDate + (b.depTime || '')))
    .map(t => ({
      routeId:   t.routeId,
      trackDate: t.trackDate,
      from:      t.boardingStop  || null,
      to:        t.alightingStop || null,
      title:     t.title || `${t.boardingStop || '?'} → ${t.alightingStop || '?'}`,
      timeStr:   (t.depTime && t.arrTime) ? `${t.depTime} → ${t.arrTime}` : (t.depTime || ''),
      dayLabel:  savedRouteDayLabel(t.trackDate),
      notify:    t.notify !== false,
      // Проміжний рейс: показуємо тільки коли є денормалізований повний маршрут
      // (старі записи без fullTitle малюються як звичайні — без падіння).
      isSegment:   t.isSeg === true && !!t.fullTitle,
      fullTitle:   t.fullTitle || '',
      fullTimeStr: t.fullTimeStr || '',
    }));
}

function getSavedCount() { return trackedRoutes.length; }

// Зняти збереження рейсу (зникає зі списку, відстеження стоп)
function unsaveRoute(rid, date, from, to) {
  const entry = findTrackedEntry(rid, from || null, to || null, date);
  if (!entry) return;
  unsubscribeFromPush(entry.routeId, entry.trackDate);
  removeTrackedEntry(entry);   // → saveTrackedRoute → подія → бейдж/модалка оновляться
  checkTrackNotifications(false);
  renderSmartRow();
  renderRouteList();   // оновити закладку рейсу у списку розкладу
}

// Перемкнути нагадування рейсу (дзвіночок). Рейс лишається збереженим.
function toggleRouteReminders(rid, date, from, to) {
  const entry = findTrackedEntry(rid, from || null, to || null, date);
  if (!entry) return;
  // Гейтинг (Етап 2): вмикання сповіщень створює push-підписку → лише залогінені.
  if (entry.notify === false && !isLoggedIn()) { requireAuth('увімкнути сповіщення', () => {}); return; }
  entry.notify = entry.notify === false;   // off→on / on→off
  if (entry.notify) {
    subscribeToPush(rid, entry.title || '', from || null, to || null, date, entry.depTime || null);
  } else {
    unsubscribeFromPush(rid, date);
  }
  saveTrackedRoute();   // → подія → бейдж/модалка
}

// Тап по дзвіночку у стані ⚠️: пробуємо реально увімкнути сповіщення.
// Якщо дозвіл відхилено/недоступно — чесно пояснюємо тостом, не вдаючи що ОК.
async function requestPushForSavedRoute(rid, date, from, to) {
  if (!isLoggedIn()) { requireAuth('увімкнути сповіщення', () => {}); return; }
  if (!isPushCapable()) { showToast('Сповіщення недоступні на цьому пристрої'); return; }
  if (Notification.permission === 'denied') {
    showToast('Сповіщення вимкнені в налаштуваннях телефону/браузера. Увімкніть їх, щоб отримувати нагадування.');
    return;
  }
  const entry = findTrackedEntry(rid, from || null, to || null, date);
  if (!entry) return;
  // subscribeToPush сам запитає дозвіл (по жесту користувача) і збереже підписку.
  await subscribeToPush(rid, entry.title || '', from || null, to || null, date, entry.depTime || null);
  renderSavedRows();   // оновити стан дзвіночка (⚠️ → 🔔 якщо дозвіл надано)
}

// Self-heal: при відкритті Автобусів звіряємо збережені рейси (notify=on, сьогодні+майбутні)
// з реальною push-підпискою і тихо перепідписуємо втрачені. Лише коли дозвіл уже надано —
// без жесту НЕ запитуємо (щоб не зловживати промптом). Upsert ідемпотентний.
function selfHealPushSubscriptions() {
  if (!isPushCapable() || Notification.permission !== 'granted') return;
  const today = getTodayISO();
  for (const t of trackedRoutes) {
    if (t.notify !== false && t.trackDate >= today) {
      subscribeToPush(t.routeId, t.title || '', t.boardingStop || null, t.alightingStop || null, t.trackDate, t.depTime || null);
    }
  }
}

// Іконка хедера: показуємо ЛИШЕ на вкладці Автобуси і коли є збережені рейси.
// Цифра (кількість збережених) — біла, всередині червоної кнопки.
function updateSavedBadge() {
  const btn = document.getElementById('saved-routes-btn');
  if (!btn) return;
  const n = getSavedCount();
  const onBuses = document.querySelector('.app-main')?.dataset.tab === 'buses';
  btn.hidden = n === 0 || !onBuses || !isLoggedIn();
  const cnt = document.getElementById('saved-routes-count');
  if (cnt) cnt.textContent = n > 0 ? String(n) : '';
}

// ── Слайд-модалка «Збережені рейси» ──
let _srModalEl = null;

function srRowHtml(r) {
  // Чесний стан дзвіночка (3 стани): off (вимкнув користувач) / warn (notify=true,
  // але push недоступний — немає дозволу/не iOS-PWA) / on (реально працює).
  const pushBlocked = !!pushBlockedMsg();
  let bellSvg, bellCls, bellLabel;
  if (!r.notify) {
    bellSvg = SR_BELL_OFF_SVG; bellCls = 'sr-bell sr-bell--off'; bellLabel = 'Нагадування вимкнені';
  } else if (pushBlocked) {
    bellSvg = SR_BELL_ON_SVG;  bellCls = 'sr-bell sr-bell--warn'; bellLabel = 'Сповіщення недоступні — натисніть щоб увімкнути';
  } else {
    bellSvg = SR_BELL_ON_SVG;  bellCls = 'sr-bell sr-bell--on';  bellLabel = 'Нагадування увімкнені';
  }
  const data = `data-rid="${escapeHtml(r.routeId)}" data-date="${r.trackDate}" data-from="${escapeHtml(r.from || '')}" data-to="${escapeHtml(r.to || '')}"`;
  // «СЬОГОДНІ/ЗАВТРА/дата» — окремим рядком великими над назвою рейсу.
  const dayTop = r.dayLabel ? `<div class="sr-row-day">${escapeHtml(r.dayLabel)}</div>` : '';
  // Проміжний рейс: заголовок = сегмент ВІД - ДО + час сегмента ЗБОКУ; нижче — повний
  // маршрут-батько з 📍 (той самий патерн, що в картці «Розкладу», .bs-route-full).
  // Звичайний рейс: заголовок = назва, час окремим підрядком знизу (без змін).
  const titleText = r.isSegment
    ? `${r.from} - ${r.to}${r.timeStr ? ' | ' + r.timeStr : ''}`
    : r.title;
  const belowLine = r.isSegment
    ? `<div class="sr-row-full bs-route-full"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>${escapeHtml(r.fullTitle)}${r.fullTimeStr ? ' | ' + escapeHtml(r.fullTimeStr) : ''}</div>`
    : (r.timeStr ? `<div class="sr-row-sub">${escapeHtml(r.timeStr)}</div>` : '');
  return `
    <div class="sr-row">
      <div class="sr-row-info">
        ${dayTop}
        <div class="sr-row-title">${escapeHtml(titleText)}</div>
        ${belowLine}
      </div>
      <button class="${bellCls}" type="button" ${data} aria-label="${escapeHtml(bellLabel)}">${bellSvg}</button>
      <button class="sr-unsave" type="button" ${data} aria-label="Зняти збереження">${SR_BOOKMARK_SVG}</button>
    </div>`;
}

function renderSavedRows() {
  const list = _srModalEl?.querySelector('.sr-list');
  if (!list) return;
  const rows = getSavedRoutesForUI();
  list.innerHTML = rows.length
    ? rows.map(srRowHtml).join('')
    : '<div class="sr-empty">Немає збережених рейсів</div>';
}

function closeSavedModal() {
  if (!_srModalEl) return;
  const m = _srModalEl;
  _srModalEl = null;
  m.classList.remove('open');
  document.body.classList.remove('modal-open');
  setTimeout(() => m.remove(), 240);
}

function openSavedModal() {
  if (_srModalEl) return;
  const wrap = document.createElement('div');
  wrap.className = 'sr-modal';
  wrap.innerHTML = `
    <div class="sr-backdrop"></div>
    <div class="sr-panel" role="dialog" aria-modal="true">
      <div class="sr-head">
        <span class="sr-title">Збережені рейси</span>
        <button class="sr-close" type="button" aria-label="Закрити">✕</button>
      </div>
      <div class="sr-list"></div>
      <div class="sr-handle"></div>
    </div>`;
  document.body.appendChild(wrap);
  document.body.classList.add('modal-open');
  _srModalEl = wrap;
  renderSavedRows();
  requestAnimationFrame(() => wrap.classList.add('open'));

  wrap.querySelector('.sr-backdrop').addEventListener('click', closeSavedModal);
  wrap.querySelector('.sr-close').addEventListener('click', closeSavedModal);

  // Делегований клік: дзвіночок (нагадування) / закладка (зняти)
  wrap.querySelector('.sr-list').addEventListener('click', e => {
    const bell = e.target.closest('.sr-bell');
    const uns  = e.target.closest('.sr-unsave');
    const t = bell || uns;
    if (!t) return;
    const { rid, date, from, to } = t.dataset;
    if (bell) {
      // Стан ⚠️ (notify=true, але push недоступний) → тап = спроба увімкнути
      // (запит дозволу / пояснення), а не вимкнути нагадування.
      if (bell.classList.contains('sr-bell--warn')) requestPushForSavedRoute(rid, date, from || null, to || null);
      else toggleRouteReminders(rid, date, from || null, to || null);
    } else {
      unsaveRoute(rid, date, from || null, to || null);
    }
    renderSavedRows();   // бейдж оновиться через подію cstl-bus-track-changed
  });

  // Свайп вгору по панелі → закрити (модалка спускається зверху)
  const panel = wrap.querySelector('.sr-panel');
  let sy = 0, drag = false, dd = 0;
  panel.addEventListener('touchstart', e => { sy = e.touches[0].clientY; drag = true; dd = 0; panel.style.transition = 'none'; }, { passive: true });
  panel.addEventListener('touchmove', e => {
    if (!drag) return;
    dd = e.touches[0].clientY - sy;
    if (dd >= 0) { panel.style.transform = 'translateY(0)'; return; }   // вниз — ігнор
    panel.style.transform = `translateY(${dd}px)`;
  }, { passive: true });
  panel.addEventListener('touchend', () => {
    if (!drag) return; drag = false;
    panel.style.transition = '';
    if (dd < -70) closeSavedModal();
    else panel.style.transform = '';
    dd = 0;
  }, { passive: true });
}

// Ініціалізація глобальної іконки хедера (викликається з app.js при старті)
export function initSavedRoutesHeader() {
  loadTrackedRoute();
  const btn = document.getElementById('saved-routes-btn');
  if (btn && !btn.dataset.wired) {
    btn.dataset.wired = '1';
    btn.addEventListener('click', openSavedModal);
  }
  updateSavedBadge();
  window.addEventListener('cstl-bus-track-changed', () => {
    updateSavedBadge();
    if (_srModalEl) renderSavedRows();
    updateBannerBell();   // банер ділить той самий запис — синхронізуємо дзвіночок/напис
  });
  // Перемикання вкладок → показати/сховати іконку (вона лише на Автобусах)
  window.addEventListener('cstl-tab-changed', updateSavedBadge);
  // Вхід/вихід → перезавантажити відстеження (per-uid) + підтягнути з БД (крос-девайс).
  // Гість → trackedRoutes порожні, hero/бейдж/іконки зникають.
  onAuthChange(async () => {
    loadTrackedRoute();
    await hydrateTrackedFromDB();
    updateSavedBadge();
    if (document.getElementById('bus-list')) { renderSmartRow(); renderRouteList(); }
    window.dispatchEvent(new CustomEvent('cstl-bus-track-changed'));
  });
}

export async function initBuses() {
  const el = document.getElementById('buses-content');
  if (!el) return;

  loadPrefs();
  loadTrackedRoute();
  selfHealPushSubscriptions();   // перепідписати втрачені push (тихо, лише якщо дозвіл є)

  // Створюємо overlay дропдауна один раз (position: fixed — фіксована позиція)
  if (!document.getElementById('bs-dropdown')) {
    const dd = document.createElement('div');
    dd.id        = 'bs-dropdown';
    dd.className = 'bs-dropdown';
    dd.hidden    = true;
    document.body.appendChild(dd);
  }

  if (!document.getElementById('bus-track-banner')) {
    const banner = document.createElement('div');
    banner.id        = 'bus-track-banner';
    banner.className = 'bus-track-banner';
    banner.innerHTML = `
      <div class="btb-main">
        <div class="btb-icon">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="rgba(0,0,0,0.75)" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          <span class="btb-check">✓</span>
        </div>
        <div class="btb-content">
          <div class="btb-route"></div>
          <div class="btb-label"></div>
        </div>
        <button class="btb-bell sr-bell sr-bell--on" type="button" aria-label="Нагадування">${SR_BELL_ON_SVG}</button>
      </div>
      <div class="btb-hint">СПОВІЩЕННЯ ПРО РЕЙС АКТИВОВАНО</div>`;
    document.body.appendChild(banner);
    // Свайп вниз — закрити банер
    let _swipeStartY = 0;
    banner.addEventListener('touchstart', e => {
      _swipeStartY = e.touches[0].clientY;
      // Зупиняємо авто-таймер поки тримають банер
      if (_bannerHideTimer) { clearTimeout(_bannerHideTimer); _bannerHideTimer = null; }
      banner.style.transition = 'none'; // точне слідування за пальцем без затримки
    }, { passive: true });
    banner.addEventListener('touchmove', e => {
      const dy = e.touches[0].clientY - _swipeStartY;
      if (dy > 0) banner.style.transform = `translateX(-50%) translateY(${dy}px) scale(1)`;
    }, { passive: true });
    const _onBannerRelease = (dy) => {
      if (dy > 40) {
        // Плавно ховаємо вниз
        banner.style.transition = 'transform 0.25s cubic-bezier(0.4,0,1,1)';
        banner.style.transform = `translateX(-50%) translateY(${dy + 80}px) scale(0.85)`;
        setTimeout(() => { banner.style.transition = ''; hideBanner(); }, 260);
      } else {
        // Плавно повертаємо на місце
        banner.style.transition = 'transform 0.3s cubic-bezier(0.22,1,0.36,1)';
        banner.style.transform = '';
        // Після snap-back скидаємо inline-transition щоб стандартна CSS-анімація зникнення не ламалась
        setTimeout(() => { banner.style.transition = ''; }, 320);
        _bannerHideTimer = setTimeout(() => { hideBanner(); _bannerHideTimer = null; }, 3500);
      }
    };
    banner.addEventListener('touchend', e => {
      _onBannerRelease(e.changedTouches[0].clientY - _swipeStartY);
    });
    banner.addEventListener('touchcancel', () => { _onBannerRelease(0); });
    // Дзвіночок на банері: вмикає/вимикає push-нагадування для показаного рейсу.
    // Рейс лишається відстежуваним (це лише сповіщення). Верхній напис і іконка
    // оновлюються, банер тримаємо видимим щоб користувач побачив зміну.
    const _btbBell = banner.querySelector('.btb-bell');
    if (_btbBell) _btbBell.addEventListener('click', async e => {
      e.stopPropagation();
      if (!_bannerEntry) return;
      const from = _bannerEntry.boardingStop || null;
      const to   = _bannerEntry.alightingStop || null;
      if (_btbBell.classList.contains('sr-bell--warn')) {
        await requestPushForSavedRoute(_bannerEntry.routeId, _bannerEntry.trackDate, from, to);
      } else {
        toggleRouteReminders(_bannerEntry.routeId, _bannerEntry.trackDate, from, to);
      }
      updateBannerBell();
      if (_bannerHideTimer) { clearTimeout(_bannerHideTimer); }
      _bannerHideTimer = setTimeout(() => { hideBanner(); _bannerHideTimer = null; }, 4000);
    });
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
    // Нормалізація застарілих назв зупинок (для старого кешу на пристроях)
    const STOP_ALIASES = { 'Гараджа': 'Гаразджа', 'Хорлупи пов.': 'Хромяків' };
    const normalizeStop = name => STOP_ALIASES[name] || name;
    const allDays = busData?.days ? Object.values(busData.days) : (busData ? [busData] : []);
    allDays.forEach(day => (day.routes || []).forEach(r =>
      (r.stops || []).forEach(s => { s.name = normalizeStop(s.name); })
    ));
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
  // Затримка після сплеш-екрану (3500мс показ + 600мс fade + 100мс буфер)
  setTimeout(() => checkTrackNotifications(), 4200);

  if (timerInterval) clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    renderSmartRow();
    renderRouteList();
    checkTrackNotifications();
  }, 60_000);
}
