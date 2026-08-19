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
// ⚠️ `geoGroupOf` прибрано з цього списку 11.08 разом із його єдиним ужитком:
// стара стрічка плиток дописувала мітку розділу на КОЖНУ картку, бо в одному
// вікні лежали новини з різних розділів. Тепер сторінка = один розділ, і його
// назву каже шапка секції — мітка на картці повторювала б її втретє.
import { ensureNewsLoaded, newsCardsHtml, openArticle, NEWS_GEO_GROUPS, articlesOfGroup, countNewCommunity, newsLoadFailed, handleImgError } from './news.js';
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
    // 🔴 08.08 — ЗАПИТ РОЗШИРЕНО ПІД МОДАЛКУ ПО ГОДИНАХ.
    // Вова: «інформація має бути правдива, а не просто написано аби написати».
    // Це правило починається САМЕ ТУТ: показати можна рівно те, що ми попросили.
    // Макет, який приніс Вова, малював вітер, вологість, схід/захід, тиск, видимість
    // і УФ — шість показників, яких у нашій відповіді не було ЖОДНОГО. Домалювати їх
    // означало б їх вигадати, тож потрібні поля додано в запит, а зайві не додано.
    // ⚠️ ЧОГО ТУТ СВІДОМО НЕМА — і це не забудькуватість:
    //   • `relative_humidity_2m_mean` у `daily` — поле НОВІШЕ за решту, і я не маю
    //     як його перевірити (егрес-проксі цього середовища не пускає до
    //     api.open-meteo.com). Невідомий параметр Open-Meteo відповідає помилкою на
    //     ВЕСЬ запит, тобто погода зникла б цілком. Вологість рахуємо з `hourly`,
    //     яке точно є, і чесно підписуємо «у середньому за день».
    //   • тиск, видимість, УФ — Вова їх не обрав; не тягнемо байти заради рядка,
    //     який ніхто не читає.
    const weatherRes = await fetch(
      `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}` +
      `&current=temperature_2m,weather_code,apparent_temperature,relative_humidity_2m,wind_speed_10m,wind_direction_10m` +
      `&hourly=temperature_2m,apparent_temperature,precipitation_probability,weather_code,wind_speed_10m,wind_direction_10m,relative_humidity_2m` +
      `&daily=weather_code,temperature_2m_max,temperature_2m_min,sunrise,sunset` +
      `&forecast_days=7&timezone=auto`
    );
    const cityName = (await cityP) || 'Олика';
    const data = await weatherRes.json();
    // Open-Meteo на негодящий параметр відповідає 400 з `{error:true, reason:...}`,
    // а не порожнім тілом. Без цієї перевірки ми пішли б далі з `data.current ===
    // undefined` і впали б у catch із загальним «недоступна» — тобто справжня
    // причина (яке саме поле не те) не дійшла б ні до консолі, ні до мене.
    if (data && data.error) throw new Error(`Open-Meteo: ${data.reason || 'відмова'}`);
    // `fetchedAt` — час ЦІЄЇ відповіді. Модалка підписує ним дані внизу («оновлено
    // 5 хв тому»), і це не прикраса: кеш живе між перемиканнями вкладок, тож без
    // мітки людина не має як відрізнити свіжі числа від тих, що лежать з ранку.
    _wxData = { ...data, city: cityName, fetchedAt: Date.now() }; // кеш для модалки по годинах
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
    // Межі тижня — спільна шкала для всіх смужок. Саме тому смужки можна
    // порівнювати між собою: у кожної однаковий нуль і однакова стеля.
    const тижМін = Math.round(Math.min(...day.temperature_2m_min));
    const тижМакс = Math.round(Math.max(...day.temperature_2m_max));

    const forecastHtml = day.time.map((dateStr, i) => {
      const d = new Date(dateStr + 'T00:00:00');
      // 🔴 08.08 — СЬОГОДНІШНІЙ ДЕНЬ ПІДПИСАНИЙ ТАК САМО, ЯК РЕШТА.
      // Було `'Сьог'` — обрубок, який стирчав серед двобуквених «Нд · Пн · Вт» і
      // читався як обрізаний текст, а не як задум (Вова: «пише сього… можливо просто
      // написати субота, так само як в усіх інших»).
      // 🔑 Нічого не втрачено: «який із них сьогодні» каже НЕ підпис, а вигляд —
      // клас `--today` дає білий текст і підсвічене тло. Тобто ознака лишилась там,
      // де вона й має бути (у вигляді), а підпис звільнився під свою єдину роботу —
      // назвати день. Заразом зникає єдиний нерівний елемент ряду.
      const wd = WEEKDAYS_UA[d.getDay()];
      // 🔴 08.08 — ІКОНКА «СЬОГОДНІ» ОПИСУЄ ТЕ, ЩО ПОПЕРЕДУ, А НЕ ВСЮ ДОБУ.
      // Скарга Вови (Метельне, 22:00): «пише по іконці дощ, але дощу не було і не
      // планується». Іконка бралась із `daily.weather_code[i]` — це найзначніша
      // погода за ВСЮ календарну добу, разом із годинами, які вже минули. О десятій
      // вечора вона показувала ранок, а не залишок дня.
      // 🔑 Це та сама неузгодженість, що Т2 і Т5, лише третя її грань: капсула
      // говорила «Мінлива хмарність» (з `current`), модалка показувала години з 0%,
      // а клітинка над ними — дощ. Три поверхні, три різні відповіді про один день.
      // ➡️ Для СЬОГОДНІ беремо найзначнішу погоду серед годин, які ще попереду —
      //    тобто рівно того набору, який покаже модалка. Тепер клітинку можна
      //    перевірити тапом: іконка = найгірший стан у стрічці годин.
      // ⚠️ Інші дні лишаються на `daily`: там минулого немає, і денний код чесний.
      const кодДня = i === 0
        ? (найзначнішаПогодаПопереду(data, dateStr) ?? day.weather_code[i])
        : day.weather_code[i];
      const dayInfo = weatherCodeInfo(кодДня);
      const tMax = Math.round(day.temperature_2m_max[i]);
      const tMin = Math.round(day.temperature_2m_min[i]);
      // 🔴 19.08 — СМУЖКА ДІАПАЗОНУ. Скарга Вови на перший варіант списку по суті
      // була про те, що це «14 чисел стовпчиком»: щоб зрозуміти, коли похолодає,
      // доводиться прочитати їх усі й порівняти в голові. Смужка масштабована на
      // мінімум і максимум ТИЖНЯ, тож «у пʼятницю тепліше» видно за формою, не
      // читаючи. Око порівнює довжину швидше за цифри — тому так роблять і Apple,
      // і Google.
      // 📐 Рахується з тих самих чисел, що вже прийшли; жодного нового поля.
      // ⚠️ Захист від ділення на нуль: якщо тиждень рівний (розмах 0), смужка
      // малюється повною — це чесніше, ніж NaN у стилі.
      const розмах = тижМакс - тижМін || 1;
      const відс = v => Math.round(((v - тижМін) / розмах) * 100);
      const лівий = відс(tMin);
      const правий = відс(tMax);
      // Ймовірність опадів дня — максимум серед годин цієї доби. Дані вже є в
      // тій самій відповіді (`hourly.precipitation_probability`), ми їх просто не
      // показували. 🛑 Нижче 30% не малюємо нічого: 10-20% це шум, а не прогноз,
      // і рядок від нього лише рябіє.
      const дощ = ймовірністьОпадівДня(data, dateStr);
      const дощHtml = дощ >= 30
        ? `<span class="hm-wx-rain">${ICONS.droplet}<span>${дощ}%</span></span>`
        : '<span class="hm-wx-rain hm-wx-rain--none" aria-hidden="true"></span>';
      // 🔴 19.08 — «СЬОГОДНІ» СЛОВОМ, І ЦЕ НЕ ВІДКІТ РІШЕННЯ 08.08.
      // Тоді підпис скоротили до `Нд`, бо клітинки стояли РЯДОМ по горизонталі в
      // сімох вузьких колонках, і довге слово серед двобуквених читалось як
      // обрубок. Тепер дні йдуть СПИСКОМ згори вниз — колонка підпису одна на всіх
      // і вільна, тож причини скорочувати більше немає, а «Сьогодні» читається
      // швидше за «Вт» (не треба згадувати, який сьогодні день).
      const підпис = i === 0 ? 'Сьогодні' : wd;
      const дата = `${d.getDate()}.${pad(d.getMonth() + 1)}`;
      return `
        <button type="button" class="hm-wx-day${i === 0 ? ' hm-wx-day--today' : ''}" data-wx-day="${i}"
                aria-label="${escapeHtml(підпис)} ${дата}, ${escapeHtml(dayInfo.text)}, від ${tMin} до ${tMax} градусів${дощ >= 30 ? `, ймовірність опадів ${дощ} відсотків` : ''}">
          <span class="hm-wx-wd">${escapeHtml(підпис)}</span>
          <span class="hm-wx-date">${дата}</span>
          <span class="hm-wx-icon">${dayInfo.icon}</span>
          ${дощHtml}
          <span class="hm-wx-min">${tMin}°</span>
          <span class="hm-wx-bar" aria-hidden="true">
            <span class="hm-wx-bar-fill" style="left:${лівий}%;right:${100 - правий}%"></span>
          </span>
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

    // 🔴 19.08 — ДВА СТАНИ ЗАМІСТЬ ОДНОГО (замовлення Вови).
    // Було: температура + опис + капсула НП + ряд із 7 днів — усе завжди на екрані,
    // 121px висоти в шапці, яку людина бачить першою.
    // Стало: компактний рядок (іконка · температура · опис · мін/макс · стрілка), а
    // прогноз на 7 днів — у панелі, що розгортається тапом по стрілці або свайпом.
    // ⚠️ Дані НЕ чіпані: той самий один запит, той самий кеш `_wxData`, той самий
    // перехід `openWeatherDayModal(i)` по тапу на день. Розгортання нічого не
    // довантажує — панель уже в розмітці, змінюється лише її висота.
    const tMaxToday = Math.round(day.temperature_2m_max[0]);
    const tMinToday = Math.round(day.temperature_2m_min[0]);
    el.classList.remove('hm-wx--loading');
    el.innerHTML = `
      <div class="hm-wx-main" data-wx-head>
        <button class="hm-wx-toggle" type="button" data-wx-toggle
                aria-expanded="false" aria-controls="hm-wx-panel"
                aria-label="Показати прогноз на 7 днів"><span class="hm-wx-toggle-ic">${ICONS.chevronDown}</span></button>
        <span class="hm-wx-now" aria-hidden="true">${info.icon}</span>
        <div class="hm-wx-t">${temp}°</div>
        <div class="hm-wx-txt">
          <div class="hm-wx-when">Сьогодні</div>
          <div class="hm-wx-sub"><span class="hm-wx-desc">${escapeHtml(info.text)}</span><span
            class="hm-wx-mm"> · ${tMinToday}°/${tMaxToday}°</span></div>
        </div>
        <button class="hm-wx-toggle" type="button" data-wx-toggle
                aria-expanded="false" aria-controls="hm-wx-panel"
                aria-label="Показати прогноз на 7 днів"><span class="hm-wx-toggle-ic">${ICONS.chevronDown}</span></button>
        <button class="hm-wx-place" type="button" data-wx-place
                aria-label="Вибрати населений пункт">
          <span class="hm-wx-place-pin" aria-hidden="true">${ICONS.pin}</span>
          <span class="hm-wx-place-n">${escapeHtml(cityName || 'Олика')}</span>
          <span class="hm-wx-place-ch" aria-hidden="true">${ICONS.chevronDown}</span>
        </button>
      </div>
      <div class="hm-wx-panel" id="hm-wx-panel" data-wx-panel>
        <div class="hm-wx-panel-in">
          <div class="hm-wx-note">${escapeHtml(subLine(temp, feels, hint))}</div>
          <div class="hm-wx-days">${forecastHtml}</div>
        </div>
      </div>
    `;
    attachWeatherFold(el);

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

// 🔴 ЙМОВІРНІСТЬ ОПАДІВ ЗА ДОБУ — максимум серед годин цього дня.
// Чому максимум, а не середнє: людину цікавить «чи потрапляю під дощ», а не
// «скільки в середньому по добі». Середнє від двох злив і двадцяти двох сухих
// годин дало б спокійне число там, де дощ таки буде.
// ⚠️ Повертає 0, якщо погодинних даних немає — тоді рядок просто не малює краплю,
// а не вигадує «0%». Відсутність даних і «дощу не буде» — різні речі.
function ймовірністьОпадівДня(data, dateStr) {
  const h = data.hourly;
  if (!h?.time || !h.precipitation_probability) return 0;
  let best = 0;
  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].startsWith(dateStr)) continue;
    const v = h.precipitation_probability[i];
    if (typeof v === 'number' && v > best) best = v;
  }
  return Math.round(best);
}

// ── РОЗГОРТАННЯ ПОГОДИ (19.08) ───────────────────────────────────────────────
// Два способи керування, як просив Вова: тап по стрілці (гарантований) і свайп
// по компактному рядку (швидкий).
//
// 🔴 ЧОМУ ВИСОТУ РУХАЄ JS, А НЕ САМИЙ CSS. `height: auto` не анімується — перехід
// з 0 на auto браузер робить стрибком. Тому беремо `scrollHeight` (реальна висота
// вмісту) і ведемо `height` числом; після відкриття віддаємо `auto` назад, щоб
// панель пережила поворот екрана і зміну шрифту, не лишившись зі старим числом.
//
// 🛑 ЖЕСТ ЖИВЕ ТІЛЬКИ НА КОМПАКТНОМУ РЯДКУ, і в CSS цей рядок має `touch-action:
// none`. Це не дрібниця, а суть вимоги «звичайний скрол не має випадково
// відкривати погоду»: якби ми слухали свайп на всьому віджеті й не забирали жест
// у браузера, кожна спроба прогорнути сторінку з-під погоди і гортала б сторінку,
// і розгортала панель — одна дія, два наслідки. Тепер вертикальний рух, що
// ПОЧАВСЯ на рядку погоди (≈52px заввишки), належить віджету; будь-де інше
// сторінка гортається як завжди.
// ⚠️ Ціна названа чесно: почавши тягнути палець рівно з рядка погоди, сторінку не
// прогорнеш. Це та сама угода, що в будь-якої «ручки» аркуша, і саме тому зона
// зроблена вузькою.
const WX_ANIM_MS  = 300;   // у межах 250-350, як просив Вова
const WX_SWIPE_MIN = 32;   // менший рух — це тремтіння пальця, а не намір

function attachWeatherFold(root) {
  const head   = root.querySelector('[data-wx-head]');
  const toggle = root.querySelector('[data-wx-toggle]');
  const panel  = root.querySelector('[data-wx-panel]');
  if (!head || !toggle || !panel) return;

  let open = false;
  let timer = null;
  // Повага до системного «зменшити рух»: там перемикаємось миттєво, без анімації.
  const reduced = !!window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;

  panel.style.height = '0px';

  function setOpen(next) {
    if (next === open) return;
    open = next;
    root.classList.toggle('hm-wx--open', open);
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    toggle.setAttribute('aria-label', open ? 'Сховати прогноз на 7 днів' : 'Показати прогноз на 7 днів');

    if (timer) { clearTimeout(timer); timer = null; }
    if (reduced) { panel.style.height = open ? 'auto' : '0px'; return; }

    // Старт завжди з ЧИСЛА, інакше переходу нема з чого починати (тому й міряємо
    // поточну висоту, а не покладаємось на те, що там стоїть).
    panel.style.height = panel.getBoundingClientRect().height + 'px';
    void panel.offsetHeight;                       // змусити браузер зафіксувати старт
    panel.style.height = (open ? panel.scrollHeight : 0) + 'px';
    timer = setTimeout(() => { if (open) panel.style.height = 'auto'; timer = null; }, WX_ANIM_MS);
  }

  toggle.addEventListener('click', e => { e.stopPropagation(); setOpen(!open); });
  // Тап по самому рядку теж перемикає — стрілка лишається гарантованим способом,
  // але поціляти в неї пальцем не обовʼязково. Капсула НП має власну дію, тому
  // клік із неї сюди не доходить.
  head.addEventListener('click', e => {
    if (e.target.closest('[data-wx-place]') || e.target.closest('[data-wx-toggle]')) return;
    setOpen(!open);
  });

  let sy = null, sx = null;
  head.addEventListener('touchstart', e => {
    if (e.touches.length !== 1) { sy = null; return; }
    sy = e.touches[0].clientY;
    sx = e.touches[0].clientX;
  }, { passive: true });
  head.addEventListener('touchend', e => {
    if (sy == null) return;
    const dy = e.changedTouches[0].clientY - sy;
    const dx = e.changedTouches[0].clientX - sx;
    sy = null;
    if (Math.abs(dy) < WX_SWIPE_MIN) return;          // не дотягнув — нічого не робимо
    if (Math.abs(dy) <= Math.abs(dx) * 1.5) return;   // рух радше вбік, ніж угору/вниз
    setOpen(dy < 0);                                  // вгору = розгорнути, вниз = стиснути
  }, { passive: true });
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
// Наскільки стан «значніший» за інший. Порядок не за номером коду WMO (там 45 туман
// стоїть перед 61 дощем, але 95 гроза важливіша за обидва) — за тим, наскільки він
// міняє плани людини. Використовується, щоб згорнути кілька годин в ОДНУ іконку.
function вагаПогоди(code) {
  if (code >= 95) return 8;                        // гроза
  if (code >= 71 && code <= 77) return 7;          // сніг
  if (code === 85 || code === 86) return 7;        // снігові зливи
  if (code >= 80 && code <= 82) return 6;          // зливи
  if (code >= 61 && code <= 67) return 6;          // дощ
  if (code >= 51 && code <= 57) return 5;          // мряка
  if (code === 45 || code === 48) return 4;        // туман
  if (code === 3) return 3;                        // хмарно
  if (code === 1 || code === 2) return 2;          // мінлива хмарність
  return 1;                                        // ясно
}

// 🔴 НАЙЗНАЧНІША ПОГОДА СЕРЕД ГОДИН, ЩО ЩЕ ПОПЕРЕДУ (для клітинки «сьогодні»).
// Повертає null, якщо годин попереду немає або немає погодинних даних — тоді
// викликач лишається на денному коді, а не вигадує.
// ⚠️ Поточна година ВХОДИТЬ (`>= nowH`), рівно як у модалці, де вона підписана
//    «Зараз». Інакше о 22:30 клітинка описувала б лише 23:00 і сперечалась би з
//    карткою «Зараз», яку людина бачить першою.
function найзначнішаПогодаПопереду(data, dateStr) {
  const h = data.hourly;
  if (!h?.time || !h.weather_code) return null;
  const offsetSec = data.utc_offset_seconds ?? 7200;
  const nowH = new Date(Date.now() + offsetSec * 1000).getUTCHours();
  let best = null;
  for (let i = 0; i < h.time.length; i++) {
    if (!h.time[i].startsWith(dateStr)) continue;
    if (+h.time[i].slice(11, 13) < nowH) continue;
    const c = h.weather_code[i];
    if (typeof c !== 'number' || !Number.isFinite(c)) continue;
    if (best === null || вагаПогоди(c) > вагаПогоди(best)) best = c;
  }
  return best;
}

// 🔑 ЄДИНЕ ДЖЕРЕЛО «КОЛИ ПОЧНЕТЬСЯ ДОЩ» для капсули і для модалки дня.
// Повертає ПЕРШУ годину за порогом 40%, а не найгіршу за добу: людині треба знати,
// коли брати парасольку, а не коли буде найгірше. Нижче 40 — це вгадування, і про
// нього краще мовчати.
// ⚠️ `fromHour` — година, ПІСЛЯ якої шукаємо. Для сьогодні це `nowH - 1`, тобто
//    поточна година ВХОДИТЬ у пошук. Спершу тут стояло `nowH` (тільки майбутні), і
//    це давало розбіжність на годину: модалка показує поточну годину карткою
//    «Зараз» і рахувала її, а капсула — ні. О 19:30 при 55% о 19:00 капсула казала
//    «о 20:00», модалка — «з 19:00». Спіймав сторож Т5.
const RAIN_MIN = 40;
function першаМокраГодина(hourly, dateStr, fromHour = -1) {
  const t = hourly?.time, p = hourly?.precipitation_probability;
  if (!t || !p) return null;
  for (let i = 0; i < t.length; i++) {
    if (!t[i].startsWith(dateStr)) continue;
    const h = +t[i].slice(11, 13);
    if (h <= fromHour) continue;
    const v = p[i];
    // Пропуск даних НЕ рахуємо за нуль: ми не знаємо, а не «сухо».
    if (typeof v === 'number' && Number.isFinite(v) && v >= RAIN_MIN) return { h, precip: v };
  }
  return null;
}

function weatherHint(data) {
  const h = data.hourly, d = data.daily;
  try {
    // 1. Найближчі опади сьогодні: перша година попереду з ймовірністю ≥ 60%.
    //    60, а не 50: на половині шансів казати «буде дощ» — це вгадування.
    const offsetSec = data.utc_offset_seconds ?? 7200;
    const now = new Date(Date.now() + offsetSec * 1000);
    const today = now.toISOString().slice(0, 10);
    const nowH = now.getUTCHours();
    // 🔴 08.08 — КАПСУЛА І МОДАЛКА БЕРУТЬ ОДНУ Й ТУ САМУ ГОДИНУ.
    // Було два незалежні пороги: тут 60%, а в пораді модалки 40%. На реальному дні
    // це давало пару «опади о 20:00» у капсулі і «Можливий дощ з 18:00» у модалці,
    // за один тап одне від одного — та сама хвороба, що й Т2 (два описи одного дня),
    // лише про годину. Тепер обидві поверхні кличуть `першаМокраГодина`, тож
    // розійтись не можуть у принципі.
    // ⚠️ Слово різне і це навмисно: у капсулі місця на одне-два слова, тож слабший
    //    випадок (40-59%) вона підписує «можливі», а не мовчить — мовчання читалось
    //    би як «сухо».
    const мокра = першаМокраГодина(h, today, nowH - 1);
    if (мокра) {
      const коли = мокра.h === nowH ? 'зараз' : `о ${pad(мокра.h)}:00`;
      return мокра.precip >= 60 ? `опади ${коли}` : `можливі опади ${коли}`;
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
        <span class="wxp-row-n"><span class="wxp-row-ic" aria-hidden="true">${ICONS.pin}</span>За моїм місцем розташування</span>
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
// 🔴 08.08 — ПЕРЕПИСАНО З ГРАФІКІВ НА КАРТКИ ПО ГОДИНАХ.
//
// Замовлення Вови: «воно трошки може бути незрозуміло для старших людей… зробити
// погодинно, такими карточками, як в синоптику… вони відкрили карточку, вони
// побачили, що там вісім годин сонце, дев'ять годин сонце, в десять годин,
// наприклад, починається вже дощ… І саме головне, інформація має бути правдива,
// а не просто написано аби написати».
//
// 🔑 МОДАЛКА ВІДПОВІДАЄ НА ОДНЕ ПИТАННЯ: «що буде о котрій годині». Усе, що не
// служить цьому питанню, звідси прибрано — разом із двома графіками і скрабером
// (рішення Вови 08.08, замість «лишаємо як є» від 05.08). Тягнути палець по
// кривій — найважчий з можливих способів дізнатись, чи буде дощ о шостій.
//
// 🛑 ТРИ ПРАВИЛА ПРАВДИВОСТІ. Вони важливіші за вигляд, і кожне з них — це
//    виправлення конкретного дефекту, знайденого 08.08 при читанні коду:
//    1. Показуємо лише те, що є у відповіді. Порожнє значення — це «—», НІКОЛИ
//       не нуль. Було `precipitation_probability ?? 0`, тобто пропуск даних
//       читався як упевнене «дощу не буде».
//    2. Минулі години не показуються. Було: модалка малювала всі 24 години від
//       00:00, тож о 14:07 чотирнадцять уже прожитих годин стояли нарівні з
//       прогнозом.
//    3. Один день — один опис. Було: капсула брала `current.weather_code`
//       («Мінлива хмарність»), а шапка модалки `daily.weather_code`
//       («Хмарно») — два різні тексти за півекрана один від одного. Тепер для
//       СЬОГОДНІ обидві поверхні беруть `current`, для інших днів — `daily`.

/** Число або null. Саме null, а не 0: нуль — це значення, а не його відсутність. */
function wxNum(v) {
  return typeof v === 'number' && Number.isFinite(v) ? v : null;
}
const WX_EMPTY = '—';

// Крапля для відсотка опадів. Локальна, а не в `core/icons.js`: реєстр там тримає
// лише те, що повторюється між ≥2 файлами — це його власне правило.
// Джерело: Tabler Icons `droplet` (MIT), той самий набір що й решта іконок сайту.
const WX_DROP = '<svg class="cat-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M7.502 19.423c2.602 2.105 6.395 2.105 8.996 0c2.602 -2.105 3.262 -5.708 1.566 -8.546l-4.89 -7.26c-.42 -.625 -1.287 -.803 -1.936 -.397a1.4 1.4 0 0 0 -.41 .397l-4.893 7.26c-1.695 2.838 -1.035 6.441 1.567 8.546z"/></svg>';

/** Сторона світу словами. 8 румбів: людині не потрібні 16, а «335°» не потрібні тим паче. */
const WIND_DIRS_UA = ['Пн', 'ПнСх', 'Сх', 'ПдСх', 'Пд', 'ПдЗх', 'Зх', 'ПнЗх'];
function windDirUA(deg) {
  const n = wxNum(deg);
  if (n === null) return null;
  return WIND_DIRS_UA[Math.round((((n % 360) + 360) % 360) / 45) % 8];
}

/** Середнє лише по НАЯВНИХ значеннях. Порожній набір → null, не 0. */
function wxAvg(values) {
  const nums = values.map(wxNum).filter(v => v !== null);
  if (!nums.length) return null;
  return nums.reduce((a, b) => a + b, 0) / nums.length;
}

// 🔴 ОДНА ПОРАДА, А НЕ СПИСОК ПОРАД — і кожна названа числом, з якого зроблена.
// Той самий принцип, що в `subLine` вище: рівно одне повідомлення, виграє
// найважливіше. Порада, яку не можна перевірити оком по картках нижче, — це
// «написано аби написати», тож кожна називає годину або градус.
// 🛑 Немає підстав — немає рядка. Порожній рядок краще за вигаданий.
function wxAdvice(hours, dayMaxT, nowHour = null) {
  // 1. Дощ — і саме ПОЧАТОК дощу, а не найгірша година.
  // ⚠️ Перша редакція шукала спершу годину з ≥60%, і на реальному наборі це дало
  //    «дощ близько 20:00 — 80%», хоча падати починало о 18:00 (55%). Тобто порада
  //    мовчазно казала «до восьмої сухо» — рівно та підміна, від якої Вова
  //    застерігав. Тому беремо ПЕРШУ годину за порогом, а сила слова залежить від
  //    її ж відсотка.
  // Поріг тут НЕ свій — той самий `RAIN_MIN`, що й у капсулі на Громаді. Два
  // незалежні пороги вже розводили ці дві поверхні на різні години (капсула казала
  // «опади о 20:00», модалка «Можливий дощ з 18:00»), і це читалось як помилка.
  const rain = hours.find(h => h.precip !== null && h.precip >= RAIN_MIN);
  if (rain) {
    const слово = rain.precip >= 60 ? 'Дуже ймовірний дощ' : 'Можливий дощ';
    // «зараз», а не «з 19:00», коли йдеться про поточну годину: інакше порада
    // сперечається з карткою, яка ту саму годину підписує «Зараз».
    const коли = rain.h === nowHour ? 'зараз' : `з ${rain.hh}:00`;
    return `${слово} ${коли} — ${Math.round(rain.precip)}%`;
  }
  // 2. Вечірнє похолодання. Має сенс лише коли вдень справді тепло: інакше
  //    «увечері 11°» — це не новина, а просто опис прохолодного дня.
  const evening = hours.filter(h => h.h >= 18);
  const evFeels = evening.map(h => h.feels ?? h.t).filter(v => v !== null);
  if (evFeels.length && dayMaxT !== null && dayMaxT >= 18) {
    const низ = Math.min(...evFeels);
    if (низ <= 12) return `Увечері похолодає до ${Math.round(низ)}° — візьміть щось тепліше`;
  }
  // 3. Вітер. 30 км/год — межа, за якою він відчутний, а не «свіжо».
  const winds = hours.map(h => h.wind).filter(v => v !== null);
  if (winds.length) {
    const макс = Math.max(...winds);
    if (макс >= 30) return `Сильний вітер, до ${Math.round(макс)} км/год`;
  }
  return null;
}

export function openWeatherDayModal(dayIndex) {
  if (!_wxData || !_wxData.hourly) return;
  const daily = _wxData.daily;
  const hourly = _wxData.hourly;
  const dateStr = daily.time[dayIndex];
  if (!dateStr) return;

  // Актуальна година — по timezone з відповіді Open-Meteo (timezone=auto вже рахує
  // геодані користувача при фетчі; якщо геолокація недоступна, getCoords() підставляє
  // Олику → Open-Meteo сам резолвить її у Europe/Kyiv, тож окремий фолбек не потрібен).
  const offsetSec = _wxData.utc_offset_seconds ?? 7200;   // 7200с=+2год — фолбек лише якщо API не віддав поле
  const nowLocal = new Date(Date.now() + offsetSec * 1000);
  const nowDateStr = nowLocal.toISOString().slice(0, 10);
  const nowHour = nowLocal.getUTCHours();
  const isToday = dateStr === nowDateStr;

  // Зрізаємо години обраного дня (hourly.time відсортовані, timezone=auto, старт 00:00).
  let idxs = [];
  hourly.time.forEach((t, i) => { if (t.startsWith(dateStr)) idxs.push(i); });
  if (!idxs.length) return;
  const усіГодини = idxs;
  // ПРАВИЛО 2 — минулого не показуємо.
  if (isToday) {
    const майбутні = idxs.filter(i => +hourly.time[i].slice(11, 13) >= nowHour);
    // Пізній вечір: якщо не лишилось жодної повної години — лишаємо останню наявну,
    // щоб модалка не відкривалась порожньою.
    idxs = майбутні.length ? майбутні : усіГодини.slice(-1);
  }

  const hours = idxs.map(i => {
    const код = wxNum(hourly.weather_code?.[i]);
    return {
      h: +hourly.time[i].slice(11, 13),
      hh: hourly.time[i].slice(11, 13),
      t: wxNum(hourly.temperature_2m?.[i]),
      feels: wxNum(hourly.apparent_temperature?.[i]),
      precip: wxNum(hourly.precipitation_probability?.[i]),
      wind: wxNum(hourly.wind_speed_10m?.[i]),
      dir: windDirUA(hourly.wind_direction_10m?.[i]),
      // Код погоди відсутній → НЕ підставляємо 0 («Ясно»): картка лишиться без іконки.
      info: код === null ? null : weatherCodeInfo(код),
    };
  });

  const d = new Date(dateStr + 'T00:00:00');
  const dayName = isToday ? 'Сьогодні' : WEEKDAYS_UA_FULL[d.getDay()];
  const dateLabel = `${d.getDate()} ${CM_MONTHS[d.getMonth()]}`;
  const tMax = wxNum(daily.temperature_2m_max?.[dayIndex]);
  const tMin = wxNum(daily.temperature_2m_min?.[dayIndex]);

  // ПРАВИЛО 3 — для сьогодні опис береться звідти ж, звідки його бере капсула.
  const cur = _wxData.current || {};
  const headCode = isToday ? wxNum(cur.weather_code) : wxNum(daily.weather_code?.[dayIndex]);
  const headInfo = headCode === null ? null : weatherCodeInfo(headCode);
  const curT = isToday ? wxNum(cur.temperature_2m) : null;
  const curFeels = isToday ? wxNum(cur.apparent_temperature) : null;

  const hoursHtml = hours.map(h => {
    if (h.t === null) return '';   // без градусів картка нічого не каже — не малюємо її
    const зараз = isToday && h.h === nowHour;
    return `
      <li class="wxd-h${зараз ? ' wxd-h--now' : ''}">
        <span class="wxd-h-time">${зараз ? 'Зараз' : `${h.hh}:00`}</span>
        <span class="wxd-h-ic" aria-hidden="true">${h.info ? h.info.icon : ''}</span>
        <span class="wxd-h-t">${Math.round(h.t)}°</span>
        <span class="wxd-h-p${(h.precip ?? 0) >= 40 ? ' wxd-h-p--wet' : ''}">
          <span class="wxd-drop" aria-hidden="true">${WX_DROP}</span>${h.precip === null ? WX_EMPTY : `${Math.round(h.precip)}%`}</span>
        <span class="wxd-h-w">${h.wind === null ? WX_EMPTY : `${Math.round(h.wind)} км/год`}</span>
      </li>`;
  }).join('');

  // ── Смуга дня. Кожне поле малюється ЛИШЕ якщо воно прийшло. ──
  // Вітер — НАЙСИЛЬНІШИЙ за показані години, а не «зараз»: одне правило працює і
  // для сьогодні, і для майбутніх днів, де жодного «зараз» не існує.
  const вітри = hours.filter(h => h.wind !== null);
  const найвітряніша = вітри.length ? вітри.reduce((a, b) => (b.wind > a.wind ? b : a)) : null;
  // Вологість — середнє по ВСІХ годинах доби (не лише показаних), тому й підпис
  // «у середньому за день». Рахуємо самі, бо готового денного поля не запитуємо
  // (пояснення — у коментарі до запиту вище).
  const вологість = wxAvg(усіГодини.map(i => hourly.relative_humidity_2m?.[i]));
  const схід = (daily.sunrise?.[dayIndex] || '').slice(11, 16);
  const захід = (daily.sunset?.[dayIndex] || '').slice(11, 16);

  const факти = [
    схід && захід ? ['Схід і захід', `${схід} — ${захід}`] : null,
    найвітряніша ? ['Вітер', `до ${Math.round(найвітряніша.wind)} км/год${найвітряніша.dir ? `, ${найвітряніша.dir}` : ''}`] : null,
    вологість !== null ? ['Вологість', `${Math.round(вологість)}% у середньому за день`] : null,
  ].filter(Boolean);

  const порада = wxAdvice(hours, tMax, isToday ? nowHour : null);

  const bodyHtml = `
    <div class="wxd-head">
      <div class="wxd-head-top">
        <div class="wxd-head-day">${escapeHtml(dayName)} · ${escapeHtml(dateLabel)}</div>
        ${tMax !== null && tMin !== null
          ? `<div class="wxd-head-range">${Math.round(tMax)}° <span>/ ${Math.round(tMin)}°</span></div>` : ''}
      </div>
      <div class="wxd-head-place">${escapeHtml(_wxData.city || 'Олика')}</div>
      <div class="wxd-head-now">
        ${headInfo ? `<span class="wxd-head-ic" aria-hidden="true">${headInfo.icon}</span>` : ''}
        <div class="wxd-head-txt">
          <div class="wxd-head-desc">${escapeHtml(headInfo ? headInfo.text : WX_EMPTY)}</div>
          ${curT !== null
            ? `<div class="wxd-head-sub">зараз ${Math.round(curT)}°${curFeels !== null ? `, відчувається ${Math.round(curFeels)}°` : ''}</div>`
            : ''}
        </div>
      </div>
    </div>

    <div class="wxd-sec-title">Погодинно</div>
    <ul class="wxd-hours" tabindex="0">${hoursHtml}</ul>
    <div class="wxd-scroll" aria-hidden="true"><span class="wxd-scroll-thumb"></span></div>

    ${порада ? `<div class="wxd-advice"><span class="wxd-advice-ic" aria-hidden="true">${ICONS.bulb}</span>${escapeHtml(порада)}</div>` : ''}

    ${факти.length ? `<ul class="wxd-facts">${факти.map(([k, v]) => `
      <li class="wxd-fact"><span class="wxd-fact-k">${escapeHtml(k)}</span><span class="wxd-fact-v">${escapeHtml(v)}</span></li>`).join('')}</ul>` : ''}

    <div class="wxd-src">Дані Open-Meteo${_wxData.fetchedAt ? ` · оновлено ${formatTime(_wxData.fetchedAt)}` : ''}</div>`;

  // swipeClose:false — власний wireWeatherSwipe нижче.
  const { close, el } = openModal({
    bodyHtml,
    variant: 'sheet',
    className: 'app-modal--weather',
    swipeClose: false,
    // 🔴 МАЙБУТНІЙ ДЕНЬ ВІДКРИВАЄТЬСЯ НА РАНКУ, А НЕ НА ПІВНОЧІ.
    // Стрічка чесно містить усі 24 години (ховати нічні — це ховати дані), але
    // перше, що людина бачить, має бути те, заради чого вона зайшла. Заміряно на
    // знімку: при старті з 00:00 у полі зору 00…04 — тобто «Понеділок» зустрічає
    // порожньою ніччю, а приклад Вови («о восьмій сонце, о десятій дощ») лежить
    // за екран прокрутки вправо.
    // Сьогоднішній день не чіпаємо: там перша картка і так «Зараз».
    // ⚠️ ЗСУВ РАХУЄТЬСЯ ВІД ПЕРШОЇ КАРТКИ, А НЕ ВІД САМОЇ СТРІЧКИ — і це не
    //    причісування, а виправлення. Було `ранок.offsetLeft - стрічка.offsetLeft`,
    //    але `offsetLeft` дитини ВКЛЮЧАЄ `padding-left` стрічки (16px). Виходило, що
    //    прокрутка з'їдала цей відступ, і картка 07:00 ставала впритул до краю
    //    екрана — рівно те, на що поскаржився Вова: «перша карточка дуже близько
    //    притиснута до лівого краю».
    //    Різниця двох `offsetLeft` дітей від падінга не залежить взагалі, тож
    //    прокручена картка стає рівно там, де стояла б перша — на одній лінії з
    //    текстом шапки і рядками фактів.
    onMount: (wrap) => {
      const стрічка = wrap.querySelector('.wxd-hours');
      if (!стрічка) return;
      const перша = стрічка.children[0];
      if (!isToday) {
        const ранок = стрічка.children[7];        // 07:00, якщо доба повна
        if (перша && ранок) стрічка.scrollLeft = ранок.offsetLeft - перша.offsetLeft;
      }
      wireHoursScrollHint(wrap, стрічка);
    },
  });
  wireWeatherSwipe(el, close);
}

// 🔴 08.08 — ПОКАЖЧИК «ТУТ Є ЩЕ, ГОРТАЙ».
// Вова: «людина має розуміти, що є ще що можна скролити… можливо зверху додати
// якісь позначення у вигляді кружечків, типу як перший слайд, другий слайд».
// 🛑 КРУЖЕЧКИ ТУТ НЕ ПІДХОДЯТЬ, і Вова погодився: їх було б 24 (повна доба) або 11
// (залишок сьогодні). Крапки читаються, коли їх три-п'ять; двадцять чотири
// зливаються в сіру смужку, з якої нічого не зрозуміло, і забирають висоту.
// ➡️ Той самий СЕНС («де я і скільки ще»), але у формі, що масштабується: тонка
// смужка-прогрес, довжина повзунка = яка частка дня видима.
// Плюс згасання вмісту на краю — щоб край не читався як кінець списку.
//
// ⚠️ ЗГАСАННЯ ЗРОБЛЕНО МАСКОЮ, А НЕ НАКЛАДЕНИМ ГРАДІЄНТОМ, і це не примха: аркуш
//    має вертикальний градієнт, тобто «колір фону» на висоті стрічки не один, і
//    градієнт-заглушка кольором просто не збіглася б із тлом. Маска ж гасить сам
//    вміст і працює на будь-якому фоні.
// ⚠️ Маска ставиться КЛАСОМ, а не постійно: на кінці списку згасання прибирається,
//    інакше воно обіцяло б продовження, якого немає.
function wireHoursScrollHint(wrap, стрічка) {
  const смуга = wrap.querySelector('.wxd-scroll');
  const повзунок = wrap.querySelector('.wxd-scroll-thumb');
  const оновити = () => {
    const хід = стрічка.scrollWidth - стрічка.clientWidth;
    // Гортати нема куди — і смуга, і згасання зникають. Показувати покажчик
    // прокрутки там, де прокрутки немає, — це та сама неправда, лише про інтерфейс.
    if (хід <= 1) {
      смуга?.setAttribute('hidden', '');
      стрічка.classList.remove('has-more', 'has-prev');
      return;
    }
    смуга?.removeAttribute('hidden');
    const частка = стрічка.clientWidth / стрічка.scrollWidth;
    if (повзунок) {
      повзунок.style.width = `${(частка * 100).toFixed(2)}%`;
      повзунок.style.left = `${((стрічка.scrollLeft / стрічка.scrollWidth) * 100).toFixed(2)}%`;
    }
    стрічка.classList.toggle('has-more', стрічка.scrollLeft < хід - 1);
    стрічка.classList.toggle('has-prev', стрічка.scrollLeft > 1);
  };
  стрічка.addEventListener('scroll', оновити, { passive: true });
  оновити();
}

// Свайп вниз по аркушу закриває модалку. Не заважає скраберу: якщо палець
// на стрічці годин — свайп ігнорується (там гортання вбік). close — від primitive
// core/modal.js (Потік C1, крок 6).
function wireWeatherSwipe(overlay, close) {
  const sheet = overlay.querySelector('.app-modal-sheet');
  if (!sheet) return;
  let startY = 0, dragging = false, travel = 1;
  const drag = createDragTracker();   // швидкість пальця → нативне завершення жесту
  const fade = createBackdropFade(overlay.querySelector('.app-modal-backdrop'));
  sheet.addEventListener('touchstart', e => {
    // 08.08: був виняток для `.wx-chart-svg-wrap` (графіка вже нема). Тепер виняток
    // для стрічки годин, і причина та сама: там палець возить вміст ВБІК, і якщо
    // дозволити цьому жесту тягнути ще й аркуш, гортання годин перетворюється на
    // випадкове закриття модалки.
    if (e.target.closest('.wxd-hours')) return;
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
    // 1. Дані — ТІЛЬКИ Supabase. 🔴 05.08: JSON-фолбек прибрано (рішення Вови).
    //
    // Тут стояло те саме, що в `board.js`: якщо база не відповіла, віджет тягнув
    // `data/community-board.json` і показував сім ВИГАДАНИХ оголошень із
    // ВИГАДАНИМИ ТЕЛЕФОНАМИ — без жодної позначки, що це заглушка. Тобто те
    // саме порушення стояло у ДВОХ місцях, і прибирати його треба було теж у
    // двох, інакше Громада й далі показувала б вигадані номери, коли Дошка вже
    // чесно каже «недоступно». Розгорнутий розбір — у `board.js`, гілка 2.
    let posts = [], ok = false;
    if (isSupabaseReady()) {
      const p = await fetchPublishedPosts();
      if (p !== null) { posts = p; ok = true; }
    }

    // 2. Лише оголошення (type board), уся громада без фільтра населеного пункту.
    //    Порядок ВИПАДКОВИЙ (рішення Вови 13.07): віджет не дублює «свіжі вгорі»
    //    вкладки, а дає рівний шанс усім оголошенням — кожне відкриття Громади
    //    показує інший набір.
    const ads = posts.filter(p => (p.type || 'board') === 'board');
    const shown = bwShuffle(ads).slice(0, BOARD_ROWS);

    el.classList.remove('cm-loading');
    // ⚠️ «Порожньо» і «не змогли спитати» — РІЗНІ речі, і казати їх треба
    // по-різному. До 05.08 обидва випадки давали «На дошці поки порожньо»:
    // при збої мережі людина читала, що оголошень немає, хоча вони є.
    el.innerHTML = ads.length
      ? shown.map(bwRowHtml).join('')
      : ok
        ? '<div class="hm-empty">На дошці поки порожньо — подайте перше оголошення</div>'
        : '<div class="hm-empty">Не вдалось завантажити оголошення</div>';

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
const NEWS_LINES_PER_PAGE = 2;   // тихих рядків під великою карткою
const NEWS_CYCLE_MS = 7000;      // довше за капсули: тут треба встигнути прочитати
let _newsTimer = null, _newsIO = null;

// 🔴 ВЕЛИКА КАРТКА = НАЙСВІЖІША З ФОТО, а не просто найсвіжіша (11.08).
//
// 📐 Ціна заміряна ДО рішення, по живих `data/articles.json`: перша новина з
// фотографією стоїть на позиції **1** у Громаді, Україні й Світі та на позиції
// **2** у Волині, тобто максимальна втрата свіжості — **0.6 години**. За це ми
// отримуємо велику картку, яка ніколи не буває порожньою плитою.
// ⚠️ Якщо фото немає в УСІЙ категорії — беремо найсвіжішу як є; вона намалюється
// з монограмою джерела (`.nc-img--mono`), і це свідомо, бо порожній розділ гірший
// за розділ без картинки.
function heroOf(list) {
  return list.find(a => a.image) || list[0];
}

// Сторінка каруселі = одна категорія: велика картка + до двох тихих рядків.
// Порожня категорія сторінки не дає взагалі (`null` відсіється фільтром) —
// карток-заглушок не малюємо, це правило проєкту.
function newsPageOf(arts, group) {
  const all = articlesOfGroup(arts, group);
  if (!all.length) return null;
  const hero = heroOf(all);
  const lines = all.filter(a => a !== hero).slice(0, NEWS_LINES_PER_PAGE);
  return { group, hero, lines };
}

function paintCmNews(el, arts) {
  // 🔴 ЗБІЙ І ПОРОЖНЕЧА — ДВА РІЗНІ ЕКРАНИ (11.08).
  // До цього обидва стани давали той самий напис «Новини зʼявляться…», тобто
  // застосунок стверджував «новин немає» там, де насправді «не зміг прочитати».
  // Той самий клас помилки, за який 05.08 прибирали демо-оголошення Дошки.
  if (newsLoadFailed()) {
    el.innerHTML = `
      <div class="hm-nerr">
        <div class="hm-nerr-tx">Не вдалось завантажити новини</div>
        <button class="hm-nerr-btn" type="button" data-cm-news-retry>Спробувати ще</button>
      </div>`;
    return;
  }

  const pages = NEWS_GEO_GROUPS.map(g => newsPageOf(arts, g)).filter(Boolean);

  if (!pages.length) {
    el.innerHTML = '<div class="hm-empty">Новини зʼявляться, щойно вийде перша за сьогодні</div>';
    paintNewsBadge(arts);
    return;
  }

  // 🆕 12.08 — СКЕЛЕТ ЗГАСАЄ, А НЕ СТРИБАЄ (аудит `improve-animations`).
  // Сірі смужки-заглушки замінювались карткою одним `innerHTML`, тобто миттєво.
  // Клац помітний саме тому, що скелет уже намалював ФОРМУ: око чекає, що на
  // тому самому місці проявиться вміст, а він телепортується.
  // ⚠️ Клас вішаємо ЛИШЕ коли до цього справді був скелет — інакше блок мигав би
  // на кожному перемальовуванні (їх багато: повтор після збою, гасіння бейджа).
  const бувСкелет = !!el.querySelector('.hm-nsk');

  el.innerHTML = `
    <div class="hm-nwrap">
      <div class="hm-ntrack" id="hm-ntrack">
        ${pages.map(p => `
          <div class="hm-npage" data-news-group="${escapeHtml(p.group)}">
            ${newsCardsHtml([p.hero], { variant: 'hero' })}
            ${p.lines.length ? `<div class="hm-nlines">${newsCardsHtml(p.lines, { variant: 'line' })}</div>` : ''}
          </div>`).join('')}
      </div>
      <div class="hm-ndots" aria-hidden="true">
        ${pages.map((_, i) => `<i${i === 0 ? ' class="on"' : ''}></i>`).join('')}
      </div>
    </div>`;

  if (бувСкелет) el.firstElementChild?.classList.add('hm-news-in');

  paintNewsCat(pages[0].group);
  startNewsCarousel(el, pages);
  paintNewsBadge(arts);
}

// Назва поточної категорії живе в ШАПЦІ секції — «НОВИНИ · ГРОМАДА».
// 🔑 Один рядок замість двох: до 11.08 «Новини» стояло в шапці, а назва категорії
// окремим написом над стрічкою — два підписи одне під одним коштували ~20px
// висоти й казали одне й те саме двічі.
function paintNewsCat(group) {
  const el = document.getElementById('hm-ncat');
  if (el && el.textContent !== group) el.textContent = group;
}

// Розділ, який людина зараз бачить у віджеті. Читаємо з РОЗМІТКИ сторінки, що
// стоїть у вікні, а не з окремої змінної: другий лічильник того самого стану вже
// розходився з першим (B-27), а тут джерело правди — те саме, за чим малюються
// крапки. Віджета немає або дані не приїхали → перший розділ, як і було.
function visibleNewsGroup() {
  const track = document.getElementById('hm-ntrack');
  if (!track) return CM_NEWS_GROUP;
  const pages = [...track.querySelectorAll('.hm-npage')];
  if (!pages.length) return CM_NEWS_GROUP;
  const left = track.scrollLeft;
  let best = pages[0], bestD = Infinity;
  pages.forEach(p => {
    const d = Math.abs(p.offsetLeft - track.offsetLeft - left);
    if (d < bestD) { bestD = d; best = p; }
  });
  return best.dataset.newsGroup || CM_NEWS_GROUP;
}

// Авто-гортання сторінок. Прокрутку робить сам браузер (`scrollTo` зі `smooth`),
// а не наша анімація: так жест пальцем і авто-рух не борються за той самий
// елемент — це вже коштувало окремого блока роботи 02.08 у модалці оголошення.
function startNewsCarousel(el, pages) {
  clearInterval(_newsTimer); _newsTimer = null;
  if (_newsIO) { _newsIO.disconnect(); _newsIO = null; }

  const track = el.querySelector('#hm-ntrack');
  const dots = [...el.querySelectorAll('.hm-ndots i')];
  if (!track || pages.length < 2) return;

  // 🔑 Одиниця гортання — СТОРІНКА (категорія), а не картка. До 11.08 у стрічці
  // лежали дев'ять окремих плиток, і крапки доводилось перераховувати з індексу
  // картки в індекс категорії. Тепер одне до одного: сторінка = крапка = розділ.
  const cards = [...track.querySelectorAll('.hm-npage')];

  // Яка сторінка зараз у вікні — рахуємо за реальним положенням прокрутки, а не
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
    paintNewsCat(pages[i] ? pages[i].group : pages[0].group);
    dots.forEach((d, j) => d.classList.toggle('on', j === i));
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
    // «Спробувати ще» після збою мережі. Стоїть ПЕРШИМ: кнопка лежить усередині
    // секції, тож без цієї гілки тап по ній відкривав би хаб — тобто екран, який
    // теж не має даних. Людина отримала б другий глухий кут замість повтору.
    if (e.target.closest('[data-cm-news-retry]')) {
      renderCommunityNews();
      return;
    }
    // Картка → стаття. Стоїть перед хабом: картки лежать усередині віджета, а сам
    // віджет теж веде в хаб — без цієї черговості тап по новині відкривав би хаб.
    const card = e.target.closest('[data-article-id]');
    if (card) {
      const id = Number(card.dataset.articleId);
      if (Number.isFinite(id)) openArticle(id);
      return;
    }
    // Будь-яке інше місце віджета (шапка, «Усі новини», порожнє поле) → хаб.
    // 🔑 Категорію беремо ТУ, ЯКА ЗАРАЗ У ВІКНІ, а не жорстко Громаду (11.08).
    // Аргумент лишився той самий, що й був: людина має потрапити туди, куди
    // дивилась. Просто до 11.08 віджет завжди показував Громаду першою, а тепер
    // він гортає чотири розділи — і «завжди Громада» стало б тією самою
    // помилкою, від якої цей рядок і застерігав.
    openNewsHub(visibleNewsGroup());
  });

  // Хаб відкрили → новини побачено → бейдж гасне. Слухаємо ПОДІЮ, а не імпортуємо
  // хаб назад (він уже імпортований звідси — зворотний імпорт замкнув би коло).
  window.addEventListener('cstl-news-seen', () => paintNewsBadge(arts));
}
