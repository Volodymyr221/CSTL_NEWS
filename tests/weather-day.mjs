// Стенд: МОДАЛКА ДНЯ «ПОГОДА ПО ГОДИНАХ» (переписана 08.08 з графіків на картки).
//
// Замовлення Вови: «зробити погодинно, такими карточками, як в синоптику…
// користувачам, старшим людям особливо, має бути легко дізнаватися про погоду.
// Тобто вони відкрили карточку, вони побачили, що там вісім годин сонце, дев'ять
// годин сонце, в десять годин, наприклад, починається вже дощ… І саме головне,
// **інформація має бути правдива, а не просто написано аби написати**».
//
// 🔴 ЩО САМЕ МІРЯЄМО І ЧОМУ ЦЕЙ СТЕНД ВЗАГАЛІ Є.
// «Правдива інформація» — вимога, яку неможливо перевірити оком на знімку: число
// «10%» виглядає однаково і коли воно прийшло з API, і коли ми підставили нуль
// замість пропуску. Тому сторож ходить із ДВОХ боків: годує модалку відомим
// набором і звіряє показане з тим, що згодували; а на завідомо ЗІПСОВАНОМУ наборі
// (з дірками) вимагає прочерк, а не число.
//
// ⚠️ КОЖНА ЧЕРВОНА ПЕРЕВІРКА МАЄ КОНТРОЛЬ. У цій сесії шість моїх замірів
// виявились тавтологіями (міряли не те, що здавалось), тож окремі сцени тут
// зроблені так, щоб на старому коді стенд БУВ ЧЕРВОНИЙ — інакше він нічого не
// стереже. Контролі підписані словом «контроль».
//
// ⚠️ ЧОГО СТЕНД НЕ ПОКРИВАЄ І НЕ МОЖЕ. Він годує модалку МОКОМ, тобто перевіряє
// «показано те, що прийшло», а не «прийшла правда». Чи збігається прогноз
// Open-Meteo з реальністю за вікном — не питання коду; егрес-проксі середовища
// взагалі не пускає до api.open-meteo.com. Це перевіряє Вова на пристрої.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

// ── Набір даних. Сценарій рівно той, який назвав Вова: зранку сонце, ввечері дощ.
const OFF = 7200;                                   // +2 год, як Europe/Kyiv улітку

// 🔴 15.08.2026 — ГОДИННИК СЦЕНИ ЗАФІКСОВАНО НА 11:00, І ЦЕ ТРЕТІЙ ЗАХІД.
// Історія одна й та сама, тричі: сцена залежала від того, КОЛИ запущено стенд.
//   1) дощ стояв «з 18:00» жорстко → щовечора після 18:00 усі години ставали
//      мокрими, «різних станів» не лишалось;
//   2) полагодили привʼязкою до поточної години — і стало зелено вдень, але
//      ОПІВНОЧІ попереду лишається 0-1 година, тож «видно 3 картки» і «стани
//      РІЗНІ» падають знову. Заміряно: прогін о 00:02 за Києвом дав 44/46,
//      «видно 1 картку» замість 3;
//   3) тепер година ВЗАГАЛІ не береться з реального часу.
// 🔑 Шапка цього ж файлу вже казала: «там, де перевірка про конкретну годину,
// годинник треба ФІКСУВАТИ, а не сподіватись на вдалий час» — але правило
// застосували лише до одного розділу (`БАЗА` нижче), а головний набір лишили
// на живому часі. Тепер правило діє на весь стенд.
// ⚠️ Дата лишається СЬОГОДНІШНЬОЮ — фіксуємо лише годину, щоб `daily.time`
// виглядав живим. Годинник сторінки підмінюється тією ж міткою, тож застосунок
// бачить несуперечливий світ.
const _зараз = new Date();
const ГОДИНА_СЦЕНИ = 11;                            // 11:00 за Києвом — попереду 13 годин
const КЛЮЧ_ЧАСУ = Date.UTC(_зараз.getUTCFullYear(), _зараз.getUTCMonth(), _зараз.getUTCDate(),
                           ГОДИНА_СЦЕНИ - OFF / 3600, 0, 0);
const nowLocal = new Date(КЛЮЧ_ЧАСУ + OFF * 1000);
const nowHour = nowLocal.getUTCHours();             // завжди 11
const дата = n => new Date(nowLocal.getTime() + n * 864e5).toISOString().slice(0, 10);
const pad = n => String(n).padStart(2, '0');

// 🔴 СЦЕНАРІЙ ПРИВʼЯЗАНИЙ ДО ПОТОЧНОЇ ГОДИНИ, А НЕ ДО 18:00.
// Перша редакція ставила дощ на «з 18:00» жорстко — і стенд був зелений цілий день,
// але щовечора після 18:00 падав: усі показані години ставали дощем, «різних станів»
// не лишалось, а поточна година вже була мокра. Тобто сцена розсипалась саме тоді,
// коли Вова застосунком і користується.
// Тепер сухо → хмарно → дощ рахуються ВІД `nowHour`, тож набір однаковий о будь-якій
// порі: перші дві години попереду сухі, далі хмарно, з +3 години — дощ 55%.
const СУХО = 2, ХМАРИ = 3;   // скільки годин попереду сухо / хмарно, далі дощ
function зробитиПогоду({ дірки = false } = {}) {
  const відНині = h => h - nowHour;               // <0 для минулих годин
  const код = h => (відНині(h) < СУХО ? 0 : відНині(h) < ХМАРИ ? 3 : 61);
  const опади = h => (відНині(h) < СУХО ? 5 : відНині(h) < ХМАРИ ? 20 : 55);
  const години = [], темп = [], відч = [], пр = [], кд = [], вітер = [], напрям = [], вол = [];
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
    години.push(`${дата(d)}T${pad(h)}:00`);
    темп.push(14 + Math.round(11 * Math.sin(((h - 4) / 24) * Math.PI)));
    відч.push(13 + Math.round(11 * Math.sin(((h - 4) / 24) * Math.PI)));
    // Сцена «дірки»: ймовірність опадів відсутня. Саме тут стара версія писала 0%.
    пр.push(дірки ? null : (d === 0 ? опади(h) : 15));
    кд.push(d === 0 ? код(h) : 2);
    вітер.push(дірки ? null : 7 + (h % 5));
    напрям.push(315);
    вол.push(50 + (h % 20));
  }
  return {
    utc_offset_seconds: OFF,
    current: { temperature_2m: 25.1, apparent_temperature: 24.3, weather_code: 2, relative_humidity_2m: 55, wind_speed_10m: 10, wind_direction_10m: 315 },
    daily: {
      time: Array.from({ length: 7 }, (_, i) => дата(i)),
      weather_code: [61, 0, 2, 3, 61, 71, 45],
      temperature_2m_max: [25, 26, 28, 25, 23, 22, 23],
      temperature_2m_min: [18, 14, 15, 16, 14, 12, 13],
      // Сцена «дірки» — без сходу/заходу: смуга фактів мусить просто не з'явитись.
      ...(дірки ? {} : {
        sunrise: Array.from({ length: 7 }, (_, i) => `${дата(i)}T05:50`),
        sunset: Array.from({ length: 7 }, (_, i) => `${дата(i)}T20:45`),
      }),
    },
    hourly: {
      time: години, temperature_2m: темп, apparent_temperature: відч,
      precipitation_probability: пр, weather_code: кд,
      wind_speed_10m: вітер, wind_direction_10m: напрям, relative_humidity_2m: вол,
    },
  };
}

const { url, stop } = await serve();
const browser = await launch(chromium);

// ⚠️ `clock` — мітка часу, на яку підміняється годинник сторінки. Без неї сцена
//    залежить від того, КОЛИ запущено стенд, і це вже двічі давало хибне червоне
//    (спершу дощ «з 18:00», потім кількість карток). Там, де перевірка про
//    конкретну годину, годинник треба фіксувати, а не сподіватись на вдалий час.
async function сцена({ погода, width = 390, day = 0, clock = null }) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  if (clock !== null) {
    await p.addInitScript(`{ const F=Date; const T=${clock};
      class D extends F { constructor(...a){ if(!a.length) super(T); else super(...a);} static now(){return T;} }
      window.Date = D; }`);
  }
  const падіння = [];
  p.on('pageerror', e => падіння.push(String(e)));
  await mockSupabase(p, { posts: [], threads: [], messages: [], thread_user_state: [], announcements: [] });
  await p.route('**://api.open-meteo.com/**', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(погода) }));
  if (REV) {
    const body = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1200);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForSelector('[data-wx-day]', { timeout: 15000 });
  // 🔴 19.08 — СПЕРШУ РОЗГОРНУТИ ПРОГНОЗ. Віджет погоди отримав два стани
  // (замовлення Вови «зробити значно компактнішим»), і кнопки днів живуть у
  // панелі, згорнутій за замовчуванням: у ній нульова висота, тож клік по дню
  // перехоплював елемент, що лежить поверх. Сам перехід між станами стереже
  // окремий стенд `weather-fold.mjs`; тут нас цікавить лише модалка дня.
  await p.evaluate(() => {
    const wx = document.querySelector('.hm-wx');
    if (wx && !wx.classList.contains('hm-wx--open')) document.querySelector('.hm-wx-toggle')?.click();
  });
  await p.waitForTimeout(450);
  // Опис і підрядок капсули читаємо ДО відкриття модалки — для перевірок Т2 і Т5.
  const описКапсули = await p.evaluate(() => document.querySelector('.hm-wx-desc')?.textContent.trim() || '');
  // 🔄 19.08 — ПІДКАЗКА ПЕРЕЇХАЛА З КОМПАКТНОГО РЯДКА В ПАНЕЛЬ.
  // У `.hm-wx-sub` тепер мін/макс дня (те, що Вова просив показувати завжди), а
  // рядок «відчувається N°» / «дощ з 16:00» живе в `.hm-wx-note` всередині
  // розгорнутої панелі. Інформація не зникла — вона перестала бути тим, що видно
  // не питаючи. Перевірка ж стосується ЗМІСТУ підказки, тож читаємо її з нового
  // місця; панель на цей момент уже розгорнута кроком вище.
  const підКапсули = await p.evaluate(() =>
    document.querySelector('.hm-wx-note')?.textContent.trim() || '');
  await p.locator(`[data-wx-day="${day}"]`).click();
  await p.waitForTimeout(500);
  return { p, ctx, падіння, описКапсули, підКапсули };
}

// Контраст за WCAG: відносна яскравість → співвідношення. Потрібен, щоб «білий
// текст на синьому» був ЗАМІРЯНИМ твердженням, а не смаком.
function контраст(rgb, [r2, g2, b2] = [255, 255, 255]) {
  const l = ([r, g, b]) => {
    const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; };
    return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
  };
  const a = l(rgb), b = l([r2, g2, b2]);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

// ══════════ СЦЕНА 1: сьогодні, повні дані ══════════
{
  const { p, ctx, падіння, описКапсули, підКапсули } = await сцена({ погода: зробитиПогоду(), clock: КЛЮЧ_ЧАСУ });
  const s = await p.evaluate(() => {
    const sh = document.querySelector('.app-modal--weather .app-modal-sheet');
    if (!sh) return null;
    const карти = [...sh.querySelectorAll('.wxd-h')].map(c => ({
      час: c.querySelector('.wxd-h-time')?.textContent.trim(),
      t: c.querySelector('.wxd-h-t')?.textContent.trim(),
      оп: c.querySelector('.wxd-h-p')?.textContent.replace(/\s+/g, ''),
      alt: c.querySelector('.wxd-h-ic img')?.getAttribute('alt') || null,
      ікШир: Math.round(c.querySelector('.wxd-h-ic img')?.getBoundingClientRect().width || 0),
    }));
    // ⚠️ Усе через `?.` і з дефолтами: на СТАРОМУ коді цих вузлів немає зовсім, і
    //    стенд мусить видати чесне червоне, а не впасти з винятком. Перша редакція
    //    падала на `getComputedStyle(null)` — тобто контроль на old-bundle не
    //    читався взагалі, хоч і «не проходив».
    const заг = sh.querySelector('.wxd-head-day');
    const cs = заг ? getComputedStyle(заг) : { color: '(немає вузла)' };
    const стрічка = sh.querySelector('.wxd-hours');
    return {
      карти,
      опис: sh.querySelector('.wxd-head-desc')?.textContent.trim(),
      порада: sh.querySelector('.wxd-advice')?.textContent.trim() || null,
      факти: [...sh.querySelectorAll('.wxd-fact')].map(f => f.querySelector('.wxd-fact-k').textContent.trim()),
      джерело: sh.querySelector('.wxd-src')?.textContent.trim() || null,
      колірТексту: cs.color,
      графіківЛишилось: sh.querySelectorAll('.wx-chart, .wx-cursor, .wx-readout').length,
      видимихКарток: (() => {
        if (!стрічка) return 0;
        const r = стрічка.getBoundingClientRect();
        return [...стрічка.children].filter(c => {
          const b = c.getBoundingClientRect();
          return b.left >= r.left - 1 && b.right <= r.right + 1;
        }).length;
      })(),
      стрічкаГортається: !!стрічка && стрічка.scrollWidth > стрічка.clientWidth + 4,
      хрестик: (() => {
        const k = sh.querySelector('.app-modal-close');
        if (!k) return { svg: false, текст: '(кнопки нема)', зсувX: 99, зсувY: 99 };
        const svg = k.querySelector('svg');
        const kb = k.getBoundingClientRect();
        const sb = svg && svg.getBoundingClientRect();
        return {
          svg: !!svg,
          текст: k.textContent.trim(),
          зсувX: sb ? Math.round((sb.left + sb.right) / 2 - (kb.left + kb.right) / 2) : 99,
          зсувY: sb ? Math.round((sb.top + sb.bottom) / 2 - (kb.top + kb.bottom) / 2) : 99,
        };
      })(),
      // Перетин ✕ з написами шапки — прямокутник проти прямокутника.
      ...(() => {
        const кн = sh.querySelector('.app-modal-close');
        const написи = [...sh.querySelectorAll('.wxd-head-day, .wxd-head-range, .wxd-head-place')];
        if (!кн || !написи.length) return { перетини: ['(немає кнопки або шапки)'], кнопкаЄ: !!кн, шапкаЄ: !!написи.length, просвітДоКнопки: null };
        const k = кн.getBoundingClientRect();
        const перетини = написи.filter(e => {
          const b = e.getBoundingClientRect();
          return k.left < b.right && b.left < k.right && k.top < b.bottom && b.top < k.bottom;
        }).map(e => e.className);
        const діап = sh.querySelector('.wxd-head-range');
        return {
          перетини, кнопкаЄ: k.width > 0, шапкаЄ: true,
          просвітДоКнопки: діап ? Math.round(k.left - діап.getBoundingClientRect().right) : null,
        };
      })(),
    };
  });

  ok('сцена: модалка дня відкрилась картками', !!s && s.карти.length > 0, s ? `${s.карти.length} карток` : 'НЕ ВІДКРИЛАСЬ');
  ok('жодного падіння при відкритті', падіння.length === 0, падіння[0] || 'чисто');

  if (s) {
    // ── Т1: минулого не показуємо ──
    const години = s.карти.map(c => c.час);
    const минулі = години.filter(ч => /^\d\d:00$/.test(ч) && +ч.slice(0, 2) < nowHour);
    ok('🔴 Т1 — жодної години, що вже минула',
       минулі.length === 0, минулі.length ? `протекли: ${минулі.join(', ')}` : `перша: ${години[0]}`);
    ok('🔴 Т1 — поточна година підписана «Зараз» і стоїть першою',
       години[0] === 'Зараз', години.slice(0, 3).join(' · '));
    // Контроль: стара версія малювала всі 24 від 00:00. Тобто «карток менше за 24»
    // — це і є слід фіксу, поки доба не почалась (о 00:00 їх законно 24).
    ok('контроль: набір справді зрізано, а не збігся випадково',
       nowHour === 0 ? s.карти.length === 24 : s.карти.length === 24 - nowHour,
       `${s.карти.length} карток при поточній годині ${nowHour}`);

    // ── Т2: один день — один опис ──
    ok('🔴 Т2 — опис у модалці збігається з описом у капсулі',
       s.опис === описКапсули, `модалка «${s.опис}» · капсула «${описКапсули}»`);

    // ── Картки несуть те, що просив Вова ──
    ok('🔴 у кожній картці є іконка НЕНУЛЬОВОГО розміру',
       s.карти.every(c => c.ікШир > 8), `найменша ${Math.min(...s.карти.map(c => c.ікШир))}px`);
    ok('🔴 «вісім годин сонце, в десять дощ» читається: стани по годинах РІЗНІ',
       new Set(s.карти.map(c => c.alt)).size >= 2,
       [...new Set(s.карти.map(c => c.alt))].join(' → '));
    ok('у кожній картці є градуси', s.карти.every(c => /^-?\d+°$/.test(c.t || '')), s.карти[0]?.t);

    // 🗑 Перевірки поради ПЕРЕЇХАЛИ у сцену 5 (фіксований годинник).
    // Тут вони теж залежали від години: пізно ввечері дощ у сцені припадає вже на
    // наступну добу, поради законно немає — і перевірка «порада називає початок
    // дощу» падала. Третій випадок тієї самої залежності в цьому файлі за день.
    // (Т5 переїхала в окрему сцену з фіксованим годинником — див. нижче.)

    // ── Колір і контраст ──
    const [r, g, b] = (s.колірТексту.match(/\d+/g) || []).map(Number);
    ok('🔴 текст модалки БІЛИЙ (а не темний --ink крізь .app-modal-body)',
       r === 255 && g === 255 && b === 255, s.колірТексту);

    ok('графіки і скрабер прибрані повністю', s.графіківЛишилось === 0, `${s.графіківЛишилось} залишків`);
    ok('джерело даних підписано', /Open-Meteo/.test(s.джерело || ''), s.джерело);
    ok('смуга фактів показує схід/захід, вітер і вологість',
       s.факти.length === 3, s.факти.join(' · '));
    // 🔴 08.08 — КНОПКА ✕ НЕ НАЛЯГАЄ НА ШАПКУ.
    // Скарга Вови: «кругла кнопка налягає на надписи. Зроби так, як це в інших
    // модалках». Заміряно тоді: ✕ y 12…44 · x 344…376, а діапазон «26° / 16°»
    // y 37…64 · x 308…374 — перекриття 7px по вертикалі, майже повне по горизонталі.
    // Сторож міряє ПЕРЕТИН прямокутників, а не наявність падінга: падінг можна
    // поставити і все одно не влучити, якщо кнопка чи шрифт зміняться.
    ok('🔴 кнопка ✕ не перетинається з жодним написом шапки',
       s.перетини.length === 0,
       s.перетини.length ? s.перетини.join(' · ') : `просвіт ${s.просвітДоКнопки}px`);
    ok('контроль: замір справді бачить кнопку і шапку (не порожні прямокутники)',
       s.кнопкаЄ && s.шапкаЄ, `кнопка: ${s.кнопкаЄ} · шапка: ${s.шапкаЄ}`);

    // 🔴 08.08 — ✕ ВЕКТОРНИЙ. Вова: «всередині хрестик невекторний, зроби в усіх
    // модалках». Текстовий гліф малює шрифт пристрою, тобто вигляд кнопки залежав
    // від телефона. Міряємо наявність `<svg>` І відсутність тексту в кнопці —
    // саме разом: порожня кнопка без svg теж «не має тексту».
    ok('🔴 ✕ у кнопці закриття — вектор, а не текстовий гліф',
       s.хрестик.svg && !s.хрестик.текст, JSON.stringify(s.хрестик));
    ok('✕ по центру кола (inline-SVG сам не центрується — потрібен flex)',
       Math.abs(s.хрестик.зсувX) <= 1 && Math.abs(s.хрестик.зсувY) <= 1,
       `зсув x ${s.хрестик.зсувX}px · y ${s.хрестик.зсувY}px`);

    // 🗑 Перевірки прокрутки і покажчика ПЕРЕЇХАЛИ у сцену 3 (майбутній день).
    // Причина: тут кількість карток = скільки годин лишилось СЬОГОДНІ, тобто пізно
    // ввечері їх 3-4, стрічка вміщається і гортати нема куди — покажчик тоді чесно
    // ховається, і перевірка «він показаний» падала б щовечора.
    // ⚠️ Це другий захід на ту саму граблю: раніше я зробив незалежним від години
    //    лише ПОЧАТОК дощу, а кількість карток лишив залежною. Сцена мусить не
    //    залежати від годинника ЦІЛКОМ, а не наполовину.
  }
  await ctx.close();
}

// ══════════ СЦЕНА 2: дірки в даних ══════════
// Головна перевірка правдивості. Стара версія тут писала «0%» — тобто впевнено
// стверджувала «дощу не буде» там, де даних немає взагалі.
{
  const { p, ctx } = await сцена({ погода: зробитиПогоду({ дірки: true }), clock: КЛЮЧ_ЧАСУ });
  const s = await p.evaluate(() => {
    const sh = document.querySelector('.app-modal--weather .app-modal-sheet');
    if (!sh) return null;
    return {
      опади: [...sh.querySelectorAll('.wxd-h-p')].map(e => e.textContent.replace(/\s+/g, '')),
      вітри: [...sh.querySelectorAll('.wxd-h-w')].map(e => e.textContent.trim()),
      факти: [...sh.querySelectorAll('.wxd-fact-k')].map(e => e.textContent.trim()),
      порада: sh.querySelector('.wxd-advice')?.textContent.trim() || null,
    };
  });
  ok('сцена: модалка вижила на даних із дірками', !!s);
  if (s) {
    ok('🔴 ПРАВДИВІСТЬ — відсутня ймовірність опадів це «—», а НЕ «0%»',
       s.опади.every(t => t.includes('—')) && !s.опади.some(t => /0%/.test(t)),
       s.опади[0]);
    ok('🔴 відсутній вітер теж прочерк, а не нуль',
       s.вітри.every(t => t === '—'), s.вітри[0]);
    ok('🔴 поля, яких у відповіді немає, НЕ малюються (схід/захід зник)',
       !s.факти.includes('Схід і захід'), s.факти.join(' · ') || '(порожньо)');
    ok('🔴 без підстав немає й поради (порожній рядок краще за вигаданий)',
       s.порада === null, s.порада || '(немає — правильно)');
  }
  await ctx.close();
}

// ══════════ СЦЕНА 3: майбутній день ══════════
{
  const { p, ctx } = await сцена({ погода: зробитиПогоду(), day: 2, clock: КЛЮЧ_ЧАСУ });
  const s = await p.evaluate(() => {
    const sh = document.querySelector('.app-modal--weather .app-modal-sheet');
    if (!sh) return null;
    const l = sh.querySelector('.wxd-hours');
    if (!l) return { карток: 0, підРядок: null, зараз: false, першаВидима: '(стрічки немає)' };
    const перша = [...l.children].find(c => c.offsetLeft - l.offsetLeft >= l.scrollLeft - 1);
    return {
      карток: l.children.length,
      підРядок: sh.querySelector('.wxd-head-sub')?.textContent.trim() || null,
      зараз: !!sh.querySelector('.wxd-h--now'),
      першаВидима: перша?.querySelector('.wxd-h-time')?.textContent.trim(),
      лівоКартки: перша ? Math.round(перша.getBoundingClientRect().left) : -1,
      лівоТексту: Math.round(sh.querySelector('.wxd-head-day').getBoundingClientRect().left),
    };
  });
  ok('сцена: майбутній день відкрився', !!s);
  if (s) {
    ok('майбутній день показує повну добу — нічого не приховано',
       s.карток === 24, `${s.карток} карток`);
    ok('🔴 стрічка відкрита на РАНКУ, а не на півночі',
       s.першаВидима === '07:00', `перша видима: ${s.першаВидима}`);
    // 🔴 08.08 — КАРТКА ПОЧИНАЄТЬСЯ ТАМ ЖЕ, ДЕ ТЕКСТ. Вова: «перша карточка дуже
    // близько притиснута до лівого краю. Зроби початок на тому самому рівні, де
    // починається текст».
    // Міряємо ПІСЛЯ прокрутки на 07:00 — бо саме там воно й ламалось: `scroll-snap`
    // вирівнює картку по краю скролпорту (padding-box), тобто зʼїдав відступ.
    ok('🔴 ліва межа картки збігається з лівою межею тексту',
       s.лівоКартки === s.лівоТексту, `картка ${s.лівоКартки}px · текст ${s.лівоТексту}px`);
    // Контроль: різниця мусить бути саме нулем, а не «десь близько» — інакше
    // перевірка пройшла б і на старому коді, де було 0 проти 16.
    ok('контроль: замір бачить обидві межі', s.лівоТексту > 0, `${s.лівоТексту}px`);
    ok('🔴 у майбутньому дні немає ані «Зараз», ані рядка «зараз N°»',
       !s.зараз && s.підРядок === null, `картка «зараз»: ${s.зараз} · рядок: ${s.підРядок}`);

    // ── Прокрутка і покажчик: саме тут, бо повна доба = 24 картки о будь-якій порі.
    const пк = await p.evaluate(async () => {
      const l = document.querySelector('.wxd-hours');
      const b = document.querySelector('.wxd-scroll');
      const t = document.querySelector('.wxd-scroll-thumb');
      const зняти = () => ({
        схована: !b || b.hasAttribute('hidden'),
        ширинаПовзунка: t ? Math.round(t.getBoundingClientRect().width) : 0,
        ширинаСмуги: b ? Math.round(b.getBoundingClientRect().width) : 0,
        зсув: t && b ? Math.round(t.getBoundingClientRect().left - b.getBoundingClientRect().left) : -1,
        more: l.classList.contains('has-more'),
        prev: l.classList.contains('has-prev'),
        гортається: l.scrollWidth > l.clientWidth + 4,
      });
      l.scrollLeft = 0; l.dispatchEvent(new Event('scroll'));
      const нуль = зняти();
      l.scrollLeft = l.scrollWidth; l.dispatchEvent(new Event('scroll'));
      await new Promise(r => setTimeout(r, 60));
      return { нуль, вкінці: зняти() };
    });
    ok('стрічка годин гортається вбік', пк.нуль.гортається, 'scrollWidth > clientWidth');
    ok('покажчик прокрутки показано (стрічка гортається)', !пк.нуль.схована, JSON.stringify(пк.нуль));
    ok('🔴 довжина повзунка = видима частка дня (менша за смугу, але видима)',
       пк.нуль.ширинаПовзунка > 8 && пк.нуль.ширинаПовзунка < пк.нуль.ширинаСмуги,
       `${пк.нуль.ширинаПовзунка}px зі ${пк.нуль.ширинаСмуги}px`);
    ok('🔴 повзунок їде вправо разом зі стрічкою',
       пк.вкінці.зсув > пк.нуль.зсув, `${пк.нуль.зсув}px → ${пк.вкінці.зсув}px`);
    ok('🔴 на початку згасає ПРАВИЙ край (є що гортати), лівого згасання нема',
       пк.нуль.more && !пк.нуль.prev, `more:${пк.нуль.more} prev:${пк.нуль.prev}`);
    ok('🔴 у кінці згасання праворуч ЗНИКАЄ — не обіцяє неіснуючого продовження',
       !пк.вкінці.more && пк.вкінці.prev, `more:${пк.вкінці.more} prev:${пк.вкінці.prev}`);
  }
  await ctx.close();
}

// ══════════ СЦЕНА 4: вузький екран 375px ══════════
{
  const { p, ctx } = await сцена({ погода: зробитиПогоду(), width: 375, clock: КЛЮЧ_ЧАСУ });
  const s = await p.evaluate(() => {
    const sh = document.querySelector('.app-modal--weather .app-modal-sheet');
    const l = sh && sh.querySelector('.wxd-hours');
    if (!l) return { видимих: 0, сторінкаПоїхала: false, обрізаніЧисла: -1, фактиОбрізані: -1 };
    const r = l.getBoundingClientRect();
    return {
      видимих: [...l.children].filter(c => {
        const b = c.getBoundingClientRect();
        return b.left >= r.left - 1 && b.right <= r.right + 1;
      }).length,
      // Горизонтального переповнення сторінки бути не може: аркуш ширший за екран
      // ламає всю модалку, а стрічка мусить гортатись усередині себе.
      сторінкаПоїхала: document.documentElement.scrollWidth > window.innerWidth + 1,
      обрізаніЧисла: [...sh.querySelectorAll('.wxd-h-t, .wxd-h-time')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).length,
      фактиОбрізані: [...sh.querySelectorAll('.wxd-fact-v')]
        .filter(e => e.scrollWidth > e.clientWidth + 1).length,
    };
  });
  ok('375px: сторінка не поїхала вбік', !s.сторінкаПоїхала);
  ok('375px: видно щонайменше 3 картки', s.видимих >= 3, `${s.видимих}`);
  ok('🔴 375px: жодне число в картці не обрізане', s.обрізаніЧисла === 0, `${s.обрізаніЧисла} обрізаних`);
  ok('🔴 375px: значення у смузі фактів не обрізані', s.фактиОбрізані === 0, `${s.фактиОбрізані} обрізаних`);
  await ctx.close();
}

// ══════════ СЦЕНА 5: Т5 — капсула і модалка про ту саму годину ══════════
// 🔴 Годинник ФІКСОВАНО на 13:00, і це принципово. Сцена перевіряє конкретну
// годину початку дощу, тож вона мусить існувати незалежно від того, коли стенд
// запущено. Раніше Т5 жила в сцені 1 на живому годиннику — і після 21:00 падала,
// бо дощ (nowHour+3) припадав уже на наступну добу і обидві поверхні законно
// мовчали. Це вже ТРЕТІЙ випадок такої залежності в цьому файлі за один день.
{
  const БАЗА = Date.UTC(2026, 7, 8, 11, 0, 0);   // 13:00 за Києвом
  const дата = n => new Date(БАЗА + 7200e3 + n * 864e5).toISOString().slice(0, 10);
  const H = [], Tm = [], Fl = [], P = [], C = [], Wd = [], Dr = [], Rh = [];
  for (let d = 0; d < 7; d++) for (let h = 0; h < 24; h++) {
    H.push(`${дата(d)}T${pad(h)}:00`);
    Tm.push(20); Fl.push(19);
    P.push(d === 0 ? (h >= 16 ? 55 : 5) : 10);   // дощ із 16:00, тобто через 3 год
    C.push(d === 0 ? (h >= 16 ? 61 : 1) : 2);
    Wd.push(7); Dr.push(315); Rh.push(50);
  }
  const НАБІР = {
    utc_offset_seconds: 7200,
    current: { temperature_2m: 24, apparent_temperature: 22, weather_code: 2 },
    daily: { time: Array.from({ length: 7 }, (_, i) => дата(i)),
             weather_code: [61, 0, 2, 3, 61, 71, 45],
             temperature_2m_max: [25, 26, 28, 25, 23, 22, 23],
             temperature_2m_min: [18, 14, 15, 16, 14, 12, 13],
             sunrise: Array.from({ length: 7 }, (_, i) => `${дата(i)}T05:50`),
             sunset:  Array.from({ length: 7 }, (_, i) => `${дата(i)}T20:45`) },
    hourly: { time: H, temperature_2m: Tm, apparent_temperature: Fl,
              precipitation_probability: P, weather_code: C,
              wind_speed_10m: Wd, wind_direction_10m: Dr, relative_humidity_2m: Rh },
  };
  const { p, ctx, підКапсули } = await сцена({ погода: НАБІР, clock: БАЗА });
  const порада = await p.evaluate(() =>
    document.querySelector('.app-modal--weather .wxd-advice')?.textContent.trim() || '');
  const гк = (підКапсули.match(/(\d{2}):00/) || [])[1] || null;
  const гм = (порада.match(/(\d{2}):00/) || [])[1] || null;
  ok('сцена: дощ у наборі справді попереду (є про що казати)', гк !== null || гм !== null,
     `капсула «${підКапсули}» · модалка «${порада}»`);
  ok('🔴 Т5 — капсула і модалка називають ту саму годину дощу',
     гк !== null && гк === гм, `капсула «${підКапсули}» · модалка «${порада}»`);
  ok('🔴 названа година — ПОЧАТОК дощу (16:00), а не найгірша за добу',
     гк === '16', `названо ${гк}:00`);
  // Відсоток у пораді мусить збігатися з відсотком на тій самій картці — інакше
  // порада стверджує своє число, якого на екрані ніде більше немає.
  const картка = await p.evaluate(() => {
    const c = [...document.querySelectorAll('.wxd-h')]
      .find(e => e.querySelector('.wxd-h-time')?.textContent.trim() === '16:00');
    return c ? c.querySelector('.wxd-h-p')?.textContent.replace(/\s+/g, '') : null;
  });
  ok('🔴 відсоток у пораді збігається з відсотком на картці 16:00',
     !!картка && порада.includes(картка.replace(/\D/g, '') + '%'),
     `порада «${порада}» ↔ картка «${картка}»`);
  await ctx.close();
}

// ══════════ КОНТРАСТ ГРАДІЄНТА (числом, не на око) ══════════
// Вова: «цей голубий виглядає так звичайно… більш насиченіший». Старий градієнт
// світлішав ДОНИЗУ до #C5DDFB — білий текст на ньому мав контраст 1.3:1, тобто
// був майже нечитний; саме тому текст там і малювався темним.
{
  const css = projectFile('style/community.css');
  const m = /\.app-modal--weather \.app-modal-sheet \{[\s\S]*?background: linear-gradient\(([^;]+)\);/.exec(css);
  const стопи = m ? [...m[1].matchAll(/#([0-9A-Fa-f]{6})/g)].map(x => x[1]) : [];
  ok('сцена: градієнт аркуша знайдено в CSS', стопи.length >= 2, стопи.join(' → '));
  const пари = стопи.map(h => [0, 2, 4].map(i => parseInt(h.slice(i, i + 2), 16)));
  const мін = пари.length ? Math.min(...пари.map(c => контраст(c))) : 0;
  ok('🔴 білий текст читомий на ВСІХ стопах градієнта (AA ≥ 4.5:1)',
     мін >= 4.5, `найгірший стоп: ${мін.toFixed(2)}:1`);
  ok('🔴 градієнт ТЕМНІШАЄ донизу (низ контрастніший за верх)',
     пари.length >= 2 && контраст(пари[пари.length - 1]) > контраст(пари[0]),
     `верх ${контраст(пари[0]).toFixed(1)}:1 → низ ${контраст(пари[пари.length - 1]).toFixed(1)}:1`);
  // Контроль: старий блідий стоп мусить цю ж перевірку валити.
  ok('контроль: старий #C5DDFB справді провалює поріг',
     контраст([0xC5, 0xDD, 0xFB]) < 4.5, `${контраст([0xC5, 0xDD, 0xFB]).toFixed(2)}:1`);
}

await browser.close();
await stop();
done();
