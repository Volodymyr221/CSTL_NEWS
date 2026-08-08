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
const nowLocal = new Date(Date.now() + OFF * 1000);
const nowHour = nowLocal.getUTCHours();
const дата = n => new Date(nowLocal.getTime() + n * 864e5).toISOString().slice(0, 10);
const pad = n => String(n).padStart(2, '0');

function зробитиПогоду({ дірки = false } = {}) {
  const код = h => (h < 9 ? 0 : h < 15 ? 1 : h < 18 ? 3 : 61);
  const опади = h => (h < 15 ? 5 : h < 18 ? 20 : 55);
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

async function сцена({ погода, width = 390, day = 0 }) {
  const ctx = await browser.newContext({
    viewport: { width, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
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
  // Опис у капсулі читаємо ДО відкриття модалки — для перевірки Т2.
  const описКапсули = await p.evaluate(() => document.querySelector('.hm-wx-desc')?.textContent.trim() || '');
  await p.locator(`[data-wx-day="${day}"]`).click();
  await p.waitForTimeout(500);
  return { p, ctx, падіння, описКапсули };
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
  const { p, ctx, падіння, описКапсули } = await сцена({ погода: зробитиПогоду() });
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

    // ── Порада: обчислена, і збігається з картками ──
    const першаМокра = s.карти.find(c => parseInt(c.оп, 10) >= 40);
    ok('🔴 порада називає ПОЧАТОК дощу, а не найгіршу годину',
       !!s.порада && !!першаМокра && s.порада.includes(першаМокра.час.slice(0, 2)),
       `порада «${s.порада}» · перша мокра година ${першаМокра?.час}`);
    ok('🔴 відсоток у пораді збігається з відсотком на картці',
       !!s.порада && !!першаМокра && s.порада.includes(першаМокра.оп.replace(/\D/g, '') + '%'),
       `${s.порада} ↔ ${першаМокра?.оп}`);

    // ── Колір і контраст ──
    const [r, g, b] = (s.колірТексту.match(/\d+/g) || []).map(Number);
    ok('🔴 текст модалки БІЛИЙ (а не темний --ink крізь .app-modal-body)',
       r === 255 && g === 255 && b === 255, s.колірТексту);

    ok('графіки і скрабер прибрані повністю', s.графіківЛишилось === 0, `${s.графіківЛишилось} залишків`);
    ok('джерело даних підписано', /Open-Meteo/.test(s.джерело || ''), s.джерело);
    ok('смуга фактів показує схід/захід, вітер і вологість',
       s.факти.length === 3, s.факти.join(' · '));
    ok('стрічка годин гортається вбік', s.стрічкаГортається, 'scrollWidth > clientWidth');
    ok('на екрані видно щонайменше 3 картки одразу',
       s.видимихКарток >= 3, `${s.видимихКарток} повністю видимих`);
  }
  await ctx.close();
}

// ══════════ СЦЕНА 2: дірки в даних ══════════
// Головна перевірка правдивості. Стара версія тут писала «0%» — тобто впевнено
// стверджувала «дощу не буде» там, де даних немає взагалі.
{
  const { p, ctx } = await сцена({ погода: зробитиПогоду({ дірки: true }) });
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
  const { p, ctx } = await сцена({ погода: зробитиПогоду(), day: 2 });
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
    };
  });
  ok('сцена: майбутній день відкрився', !!s);
  if (s) {
    ok('майбутній день показує повну добу — нічого не приховано',
       s.карток === 24, `${s.карток} карток`);
    ok('🔴 стрічка відкрита на РАНКУ, а не на півночі',
       s.першаВидима === '07:00', `перша видима: ${s.першаВидима}`);
    ok('🔴 у майбутньому дні немає ані «Зараз», ані рядка «зараз N°»',
       !s.зараз && s.підРядок === null, `картка «зараз»: ${s.зараз} · рядок: ${s.підРядок}`);
  }
  await ctx.close();
}

// ══════════ СЦЕНА 4: вузький екран 375px ══════════
{
  const { p, ctx } = await сцена({ погода: зробитиПогоду(), width: 375 });
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
