// Стенд: ВІДЖЕТ ПОГОДИ — ДВА СТАНИ (компактний ↔ розгорнутий).
//
// 🔴 ЗАРАДИ ЧОГО. 19.08 Вова замовив переробку: «зараз віджет займає забагато
// вертикального простору… зробити значно компактнішим, але не втратити детальний
// прогноз». Було 121px у шапці, яку бачать першою; стало ≈51px і панель на 7 днів
// під стрілкою.
//
// 🔑 ЩО САМЕ ТУТ СТЕРЕЖЕТЬСЯ І ЧОМУ САМЕ ЦЕ:
//   1. КОМПАКТНІСТЬ — числом. Інакше «компактний» тихо роздується назад першою ж
//      правкою, і ніхто не помітить: віджет не падає, він просто знову високий.
//   2. ОПИС НЕ ОБРІЗАЄТЬСЯ НА ЖОДНІЙ РЕАЛЬНІЙ ШИРИНІ. Рівно цей дефект уже був
//      08.08: міряли на одному екрані (390), а на 375 «Мінлива хмарність»
//      перетворювалась на «Мінлива хмарніс…». Тому беремо НАЙДОВШИЙ опис словника
//      і чотири ширини, які назвав Вова: 320 · 375 · 390 · 430.
//   3. ЖЕСТ НЕ КРАДЕ СКРОЛ. Вимога сформульована прямо: «не роби так, щоб
//      звичайний вертикальний scroll випадково відкривав погоду». Перевіряємо, що
//      свайп ПОЗА віджетом не розгортає його.
//   4. РОЗГОРТАННЯ НЕ РОБИТЬ НОВОГО ЗАПИТУ. «Не дублюй API-запити через
//      відкриття/закриття віджета» — рахуємо звернення до api.open-meteo.com.
//
// ⚠️ Погоду підміняємо власною відповіддю: справжній Open-Meteo у пісочниці
// недосяжний (той самий підхід, що у стенді `weather.mjs`).
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

const ряд = (n, v) => Array.from({ length: n }, (_, i) => v(i));
// 🔴 Код 2 = «Мінлива хмарність» — НАЙДОВШИЙ опис у `weather-icons.js`. Саме він
// ловив обрізку 08.08, тому стенд стоїть на найгіршому випадку, а не на «Ясно».
const ПОГОДА = {
  current: { temperature_2m: 23.4, apparent_temperature: 21.2, weather_code: 2 },
  daily: {
    time: ряд(7, i => new Date(Date.now() + i * 864e5).toISOString().slice(0, 10)),
    weather_code: [2, 61, 0, 3, 71, 95, 45],
    temperature_2m_max: ряд(7, i => 24 - i),
    temperature_2m_min: ряд(7, i => 14 - i),
  },
  hourly: {
    // 48 годин і навмисно РІЗНА ймовірність опадів: перша доба суха (10%), друга
    // мокра (70%). Так перевірка «краплю показуємо лише коли є що показувати»
    // спирається на обидва випадки, а не на один.
    time: ряд(48, i => new Date(Date.now() + i * 36e5).toISOString().slice(0, 13) + ':00'),
    temperature_2m: ряд(48, () => 20),
    precipitation_probability: ряд(48, i => (i < 24 ? 10 : 70)),
    weather_code: ряд(48, () => 2),
  },
};

// Свайп справжніми подіями дотику: `page.touchscreen` уміє тап, але не протяг,
// а нам потрібен саме рух пальця з дельтою.
async function свайп(page, selector, dy) {
  await page.evaluate(([sel, d]) => {
    const el = document.querySelector(sel);
    const r = el.getBoundingClientRect();
    const x = r.left + r.width / 2;
    const y0 = r.top + r.height / 2;
    const точка = (y) => ({ identifier: 1, target: el, clientX: x, clientY: y });
    const подія = (type, y) => {
      const t = new Touch(точка(y));
      el.dispatchEvent(new TouchEvent(type, {
        bubbles: true, cancelable: true,
        touches: type === 'touchend' ? [] : [t],
        changedTouches: [t], targetTouches: type === 'touchend' ? [] : [t],
      }));
    };
    подія('touchstart', y0);
    подія('touchmove', y0 + d / 2);
    подія('touchend', y0 + d);
  }, [selector, dy]);
  await page.waitForTimeout(420);   // перехід 300мс + запас
}

const { url, stop } = await serve();
const b = await launch(chromium);

// ── 1. Заміри на чотирьох ширинах ────────────────────────────────────────────
const ШИРИНИ = [320, 375, 390, 430];
const заміри = [];

for (const w of ШИРИНИ) {
  const ctx = await b.newContext({
    viewport: { width: w, height: 844 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  let запитів = 0;
  await mockSupabase(p, { posts: [], threads: [], messages: [], thread_user_state: [], announcements: [] });
  await p.route('**://api.open-meteo.com/**', r => {
    запитів++;
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(ПОГОДА) });
  });
  if (REV) {
    const body = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }

  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForSelector('.hm-wx-toggle', { timeout: 15000 });
  await p.waitForTimeout(400);

  const зг = await p.evaluate(() => {
    const d = document.querySelector('.hm-wx-desc');
    return {
      висота: Math.round(document.querySelector('.hm-wx').getBoundingClientRect().height),
      панель: Math.round(document.querySelector('.hm-wx-panel').getBoundingClientRect().height),
      описОбрізано: d.scrollWidth > d.clientWidth,
      опис: d.textContent.trim(),
      верх: document.querySelector('.hm-wx-when')?.textContent.trim() || '',
      мінмакс: document.querySelector('.hm-wx-sub').textContent.replace(/\s+/g, ' ').trim(),
      числаОбрізано: (() => { const e = document.querySelector('.hm-wx-mm'); return e.scrollWidth > e.clientWidth; })(),
      стрілкаФон: getComputedStyle(document.querySelector('.hm-wx-toggle')).backgroundColor,
      стрілкаЛінія: parseFloat(getComputedStyle(document.querySelector('.hm-wx-toggle')).borderLeftWidth),
      стрілкаЗона: Math.round(document.querySelector('.hm-wx-toggle').getBoundingClientRect().width),
      іконкаPx: Math.round(document.querySelector('.hm-wx-now img')?.getBoundingClientRect().width || 0),
      місце: document.querySelector('.hm-wx-place-n')?.textContent.trim() || '',
      стрілка: document.querySelector('.hm-wx-toggle').getAttribute('aria-expanded'),
      бокСторінки: document.documentElement.scrollWidth > document.documentElement.clientWidth,
    };
  });

  const запитівДоРозгортання = запитів;
  await p.click('.hm-wx-toggle');
  await p.waitForTimeout(450);

  const рз = await p.evaluate(() => {
    const wx = document.querySelector('.hm-wx');
    const r = wx.getBoundingClientRect();
    const дні = [...document.querySelectorAll('.hm-wx-day')];
    return {
      висота: Math.round(r.height),
      днів: дні.length,
      іконки: [...document.querySelectorAll('.hm-wx-day .hm-wx-icon img')]
        .map(e => Math.round(e.getBoundingClientRect().width)),
      деньВилазить: дні.some(d => {
        const b = d.getBoundingClientRect();
        return b.right > r.right + 0.5 || b.left < r.left - 0.5;
      }),
      бокСторінки: document.documentElement.scrollWidth > document.documentElement.clientWidth,
      стрілка: document.querySelector('.hm-wx-toggle').getAttribute('aria-expanded'),
      перший: дні[0]?.querySelector('.hm-wx-wd')?.textContent.trim() || '',
      мінмаксРядка: (дні[0]?.querySelector('.hm-wx-min')?.textContent.trim() || '') + ' ' +
                    (дні[0]?.querySelector('.hm-wx-max')?.textContent.trim() || ''),
      датаЄ: !!дні[0]?.querySelector('.hm-wx-date')?.textContent.trim(),
      // Смужки діапазону: скільки їх і чи мають ненульову ширину.
      смужки: [...document.querySelectorAll('.hm-wx-bar-fill')]
        .map(e => Math.round(e.getBoundingClientRect().width)),
      // Ліва межа заповнення у відсотках — саме вона має рухатись за даними.
      лівіМежі: [...document.querySelectorAll('.hm-wx-bar-fill')].map(e => e.style.left),
      // Краплю малюємо лише там, де ймовірність значуща.
      дощі: [...document.querySelectorAll('.hm-wx-rain:not(.hm-wx-rain--none)')]
        .map(e => e.textContent.trim()),
      // Стан погоди словами прибрано з рядка, але він мусить лишитись у підписі
      // для читача екрана — інакше це вже втрата інформації, а не обмін.
      станУПідписі: /Мінлива хмарність|Дощ|Ясно|Сніг|Гроза|Туман|Хмарно/i
        .test(дні[1]?.getAttribute('aria-label') || ''),
    };
  });

  заміри.push({ w, зг, рз, запитівДоРозгортання, запитівПісля: запитів });
  await ctx.close();
}

for (const { w, зг, рз } of заміри) {
  ok(`${w}px: у згорнутому стані панель прогнозу має нульову висоту`,
     зг.панель === 0, `${зг.панель}px`);
  ok(`${w}px: розгорнутий показує всі 7 днів`, рз.днів === 7, `${рз.днів}`);
  ok(`${w}px: іконки днів мають ненульовий розмір`,
     рз.іконки.length === 7 && рз.іконки.every(v => v >= 12), рз.іконки.join('·'));
  ok(`${w}px: жоден день не вилазить за межі віджета`, !рз.деньВилазить);
  ok(`${w}px: сторінка не поїхала вбік — ні згорнута, ні розгорнута`,
     !зг.бокСторінки && !рз.бокСторінки);
}

// 🔴 Головне число замовлення. 121px — те, що було; 70 — стеля, за якою «значно
// компактніше» перестає бути правдою.
const найвищий = Math.max(...заміри.map(z => z.зг.висота));
ok('🔴 згорнутий віджет компактний на ВСІХ ширинах (≤70px, було 121)',
   найвищий <= 70, `найвищий: ${найвищий}px`);

// 🔴 19.08, ТРЕТЯ РЕДАКЦІЯ — ЦЯ ПЕРЕВІРКА ЗМІНИЛА ЗМІСТ РАЗОМ ІЗ ФОРМОЮ РЯДКА.
// Раніше опис стояв САМ у своєму рядку, і вимога «не обрізається» була досяжна.
// Вова попросив звести опис і діапазон в один рядок («має бути хмарно, 13/24
// градуси, а зверху сьогодні»), і це змінило арифметику: найдовший опис словника
// (133px) плюс числа (~54px) це ~187px, а колонці на телефоні дістається 135-174px.
// 📐 Тобто рядок не вміщається НА ЖОДНОМУ телефоні, і питання лише в тому, що
// обрізати. Вимагати «нічого не обрізається» означало б вимагати неможливого —
// сторож став би червоним назавжди й нічого не стеріг.
// ➡️ Стережемо ТЕ, ЩО справді має бути істиною: ріжеться СЛОВО, а не ЧИСЛО.
//    Слово впізнається з іконки поруч; обрізане «13°/2…» було б неправдою про
//    погоду. Сама гарантія «числа цілі» — окремою перевіркою нижче.
const найдовший = заміри.filter(z => z.w >= 375);
ok('🔴 при браку місця ріжеться слово, а не число',
   найдовший.every(z => !z.зг.числаОбрізано),
   найдовший.map(z => `${z.w}: числа ${z.зг.числаОбрізано ? 'ОБРІЗАНО' : 'цілі'}, слово ${z.зг.описОбрізано ? 'з крапками' : 'ціле'}`).join(' · '));
// Контроль: перевірка вище має бути здатна впасти. Якщо опис перестане впиратись
// у межу — це привід переглянути розкладку, і рядок про це скаже.
ok('КОНТРОЛЬ: найдовший опис справді впирається в межу рядка',
   найдовший.some(z => z.зг.описОбрізано),
   найдовший.some(z => z.зг.описОбрізано) ? 'так, місця бракує' : 'уже вміщається — можна переглянути розкладку');

ok('🔴 зверху стоїть день', заміри.every(z => z.зг.верх === 'Сьогодні'),
   заміри.map(z => `${z.w}:${z.зг.верх}`).join(' · '));
ok('🔴 знизу — опис і діапазон разом',
   заміри.every(z => /·\s*\d+°\/\d+°$/.test(z.зг.мінмакс)),
   заміри.map(z => `${z.w}:${z.зг.мінмакс}`).join(' · '));

// 🔴 ГОЛОВНА ГАРАНТІЯ НОВОГО РЯДКА. Найдовший опис словника разом із числами
// (~191px) не вміщається в колонку жодного телефона (135-174px) — питання лише в
// тому, ЩО обрізати. Обрано слово: його можна впізнати з іконки поруч, а
// обрізане число («13°/2…») було б не менш зручним, а НЕПРАВДИВИМ.
ok('🔴 числа не обрізаються НІ НА ЯКІЙ ширині, навіть із найдовшим описом',
   заміри.every(z => !z.зг.числаОбрізано),
   заміри.map(z => `${z.w}:${z.зг.числаОбрізано ? 'ОБРІЗАНО' : 'ціле'}`).join(' · '));

// 🔴 Скарга Вови по знімку: стрілка в кружечку впритул до капсули «Луцьк»
// читалась як позначка ЛОКАЦІЇ, а не як окрема дія. Рішення його: без кружечка,
// відділити тонкою лінією зліва. Стережемо обидві половини — і що заливки нема,
// і що лінія є, і що площа дотику не постраждала.
ok('🔴 стрілка більше не кружечок (немає заливки)',
   заміри.every(z => /rgba\(0, 0, 0, 0\)|transparent/.test(z.зг.стрілкаФон)),
   заміри[0].зг.стрілкаФон);
ok('🔴 стрілку відділено лінією зліва',
   заміри.every(z => z.зг.стрілкаЛінія >= 1), `${заміри[0].зг.стрілкаЛінія}px`);
ok('площа дотику стрілки лишилась пальцевою (≥30px)',
   заміри.every(z => z.зг.стрілкаЗона >= 30),
   заміри.map(z => `${z.w}:${z.зг.стрілкаЗона}`).join(' · '));
ok('іконка поточної погоди видна в компактному рядку на всіх ширинах',
   заміри.every(z => z.зг.іконкаPx >= 16), заміри.map(z => `${z.w}:${z.зг.іконкаPx}`).join(' · '));
ok('назва населеного пункту лишилась видною і не порожня',
   заміри.every(z => z.зг.місце.length > 0), заміри.map(z => `${z.w}:${z.зг.місце}`).join(' · '));
ok('стрілка чесно каже свій стан (aria-expanded)',
   заміри.every(z => z.зг.стрілка === 'false' && z.рз.стрілка === 'true'));
ok('перший рядок прогнозу підписаний «Сьогодні»',
   заміри.every(z => z.рз.перший === 'Сьогодні'), заміри[0].рз.перший);
ok('у рядку дня є і дата, і обидві температури',
   заміри.every(z => z.рз.датаЄ && /\d+°\s*\d+°/.test(z.рз.мінмаксРядка)), заміри[0].рз.мінмаксРядка);

// 🔴 СМУЖКА ДІАПАЗОНУ — те, заради чого міняли форму рядка. Сім чисел стовпчиком
// доводилось порівнювати в голові; смужка показує це формою.
ok('🔴 смужка діапазону є в кожному з 7 днів',
   заміри.every(z => z.рз.смужки.length === 7), заміри.map(z => `${z.w}:${z.рз.смужки.length}`).join(' · '));
ok('🔴 смужки мають ненульову ширину (не «є в DOM», а видно)',
   заміри.every(z => z.рз.смужки.every(v => v >= 3)),
   заміри.map(z => `${z.w}:${Math.min(...z.рз.смужки)}`).join(' · '));
// Контроль: смужка мусить РУХАТИСЬ за даними, інакше вона декорація. У фікстурі
// кожен наступний день холодніший, отже ліва межа заповнення має повзти вліво.
const межі = заміри[2].рз.лівіМежі.map(v => parseFloat(v));
ok('🔴 смужка рухається за даними, а не намальована однаково',
   new Set(межі).size > 1 && межі[0] > межі[6], межі.join('% · ') + '%');

// 🔴 ДОЩ. Показуємо тільки там, де є що показувати: 10% це шум, а не прогноз.
ok('🔴 краплю показано лише для днів зі значущою ймовірністю',
   заміри.every(z => z.рз.дощі.length > 0 && z.рз.дощі.length < 7),
   `днів із краплею: ${заміри[0].рз.дощі.length} із 7 — ${заміри[0].рз.дощі.join(', ')}`);
ok('🔴 стан погоди словами лишився в підписі для читача екрана',
   заміри.every(z => z.рз.станУПідписі));

// 🔴 «Не дублюй API-запити через відкриття/закриття віджета» — слова замовлення.
const зайві = заміри.filter(z => z.запитівПісля !== z.запитівДоРозгортання).map(z => z.w);
ok('🔴 розгортання НЕ робить нового запиту погоди',
   зайві.length === 0, зайві.length ? `новий запит на ${зайві.join(', ')}px` : `запитів: ${заміри[0].запитівПісля}`);

// ── 2. Жести ─────────────────────────────────────────────────────────────────
{
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  await mockSupabase(p, { posts: [], threads: [], messages: [], thread_user_state: [], announcements: [] });
  await p.route('**://api.open-meteo.com/**', r =>
    r.fulfill({ contentType: 'application/json', body: JSON.stringify(ПОГОДА) }));
  if (REV) {
    const body = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2000);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForSelector('.hm-wx-toggle', { timeout: 15000 });
  await p.waitForTimeout(400);

  const відкрито = () => p.evaluate(() =>
    document.querySelector('.hm-wx').classList.contains('hm-wx--open'));

  ok('старт: віджет згорнутий', (await відкрито()) === false);

  await свайп(p, '.hm-wx-main', -60);
  ok('🔴 свайп ВГОРУ по віджету розгортає', (await відкрито()) === true);

  await свайп(p, '.hm-wx-main', 60);
  ok('🔴 свайп ВНИЗ по віджету стискає', (await відкрито()) === false);

  // Дрібний рух — це тремтіння пальця, а не намір. Інакше віджет відкривався б
  // від будь-якого дотику, і людина не розуміла б, чому.
  await свайп(p, '.hm-wx-main', -12);
  ok('короткий рух (12px) віджет НЕ чіпає', (await відкрото_безпечно(p)) === false);

  // 🔴 Ключова вимога: жест працює ТІЛЬКИ на віджеті.
  await свайп(p, '#hm-caps, .hm-sec, main', -80).catch(() => {});
  ok('🔴 свайп ПОЗА віджетом його не відкриває', (await відкрито()) === false);

  // Тап по стрілці лишається гарантованим способом.
  await p.click('.hm-wx-toggle');
  await p.waitForTimeout(420);
  ok('тап по стрілці розгортає', (await відкрито()) === true);
  await p.click('.hm-wx-toggle');
  await p.waitForTimeout(420);
  ok('повторний тап стискає', (await відкрито()) === false);

  // Тап по дню має відкривати ТУ САМУ модалку по годинах, що й раніше.
  await p.click('.hm-wx-toggle');
  await p.waitForTimeout(420);
  await p.locator('.hm-wx-day').nth(1).click();
  await p.waitForTimeout(600);
  const модалка = await p.evaluate(() => !!document.querySelector('.wxd-head-place, .wxd-src'));
  ok('🔴 тап по дню відкриває модалку по годинах (стара поведінка ціла)', модалка);

  await ctx.close();
}

async function відкрото_безпечно(page) {
  return page.evaluate(() => document.querySelector('.hm-wx').classList.contains('hm-wx--open'));
}

await b.close();
await stop();
done();
