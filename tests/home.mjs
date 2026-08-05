// Стенд №37: ГОЛОВНА СТОРІНКА — Home Dashboard («Громада»).
//
// Заведено 04.08.2026 разом із перебудовою головної (потік /byyou).
// ⚠️ Не «чи є класи в CSS», а чи ПРАЦЮЮТЬ переходи, якими людина користується
// щодня: погода → модалка по годинах, новина → стаття, «Усі новини» → хаб,
// кнопки секцій → свої вкладки.
//
// 🔴 ЗАРАДИ ЧОГО ВІН ІСНУЄ. Під час самої перебудови делегат кліків новин висів
// на класі `.cm-block--news`, який зник разом зі старою розміткою. Тап по новині
// перестав відкривати статтю — мовчки, без жодної помилки в консолі. Спіймав це
// не огляд коду і не скріншот, а стенд. Тому переходи перевіряються тапом.
//
// ⚠️ ПОГОДУ І НАЗВУ МІСТА ПІДМІНЯЄМО, а не глушимо: порожня шапка має іншу
// висоту, ніж заповнена, і половина перевірок стала б беззмістовною.
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки (03.08):
// без цього запити йдуть повз `page.route` і підміна тихо не діє.
// ⚠️ Гейт правил Дошки (`.app-modal--brules`) блокуючий при першому вході —
// його треба ПРИЙНЯТИ, інакше він перехоплює всі наступні тапи.
// ⚠️ Чекаємо 7с перед перевірками: погода має фолбек на координати Олики через
// 4с (діалог геолокації в headless не відповідає ніколи).
import { chromium } from 'playwright';
import { readFile } from 'fs/promises';
import { join } from 'path';
import { chromiumPath, serve, ROOT } from './_lib.mjs';
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep?{executablePath:ep}:{}) });
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push('pageerror: ' + e.message));
p.on('console', m => { if (m.type()==='error' && !/favicon|net::ERR|Failed to load resource/.test(m.text())) errs.push('console: ' + m.text().slice(0,120)); });
await p.route('**://*.supabase.co/**', r => r.abort());
// Nominatim віддає ДВІ різні форми, і плутати їх не можна:
//   /reverse → обʼєкт із `address` (координати → назва, погода в шапці);
//   /search  → МАСИВ знахідок (назва → координати, вибір населеного пункту 05.08).
// Один спільний мок на обидва шляхи брехав би в один бік і тихо ламав другий.
await p.route('**://nominatim.openstreetmap.org/**', r => {
  const isSearch = r.request().url().includes('/search');
  r.fulfill({
    contentType: 'application/json',
    body: isSearch
      ? JSON.stringify([{ lat: '50.9', lon: '25.6', display_name: 'Дерно, Волинська область' }])
      : JSON.stringify({ address: { village: 'Олика' } }),
  });
});
const day=n=>Array.from({length:n},(_,i)=>new Date(Date.now()+i*864e5).toISOString().slice(0,10));
// 🔴 СІМ ДНІВ ГОДИН, А НЕ ОДИН (05.08). Мок віддавав `hourly` лише на СЬОГОДНІ,
// хоча справжній Open-Meteo при `forecast_days=7` віддає години на всі сім.
// Наслідок був не безневинний: `openWeatherDayModal` для будь-якого дня, крім
// сьогоднішнього, чесно виходив на `if (!idxs.length) return` — і стенд показав
// би це як «застосунок зламався», хоча брехав саме мок. Спіймано новим сторожем
// тапу по дню 05.08: перша ж перевірка «завтра» впала на рівному місці.
const hrs=day(7).flatMap(d=>Array.from({length:24},(_,h)=>`${d}T${String(h).padStart(2,'0')}:00`));
await p.route('**://api.open-meteo.com/**', r => r.fulfill({contentType:'application/json',body:JSON.stringify({
  utc_offset_seconds:10800, current:{temperature_2m:18.4,weather_code:3,apparent_temperature:17.2},
  hourly:{time:hrs,temperature_2m:hrs.map((_,i)=>14+(i%12)),precipitation_probability:hrs.map((_,i)=>(i*7)%100),weather_code:hrs.map(()=>3)},
  daily:{time:day(7),weather_code:[3,1,61,0,2,3,80],temperature_2m_max:[24,26,21,27,25,23,20],temperature_2m_min:[13,14,12,15,14,13,11]}})}));
await p.goto(url, { waitUntil:'domcontentloaded' });
await p.waitForTimeout(2000);
// приймаємо банер згоди — інакше він перехоплює тапи внизу
await p.evaluate(() => document.querySelector('.consent-ok, [data-consent-ok], .pwa-cta button')?.click());
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(7000);

const R=[]; const ok=(n,c,i='')=>{R.push(!!c);console.log(`${c?'✅':'❌'} ${n}${i?'  — '+i:''}`)};

// 1. Шапка
const head = await p.evaluate(() => {
  const t = document.querySelector('.hm-top');
  return { has:!!t, hi:document.querySelector('.hm-hi')?.textContent.trim(),
    wx:document.querySelector('.hm-wx-t')?.textContent.trim(),
    days:document.querySelectorAll('.hm-wx-day').length,
    ava:!!document.querySelector('.hm-ava[data-account-btn]') };
});
ok('шапка намальована', head.has);
ok('привітання є', !!head.hi, head.hi);
ok('погода в шапці', head.wx === '18°', head.wx);
ok('прогноз 7 днів', head.days === 7, String(head.days));
ok('кнопка кабінету на місці', head.ava);

// 1.1 🔴 ВЕРХНІЙ БЛОК НАСТИК ДО ШАПКИ ЗАСТОСУНКУ (замовлення Вови 05.08:
// «блок відʼєднаний від шапки, вони мають бути настик»).
// Заміряно тоді: зазор 6px згори і 14px з боків — від спадкового
// `.cm-content { padding: 6px 14px 0 }`, який редизайн 04.08 не зняв.
// ⚠️ Міряємо НАСЛІДОК (відстань між прямокутниками на екрані), а не наявність
// правила: зазор може повернутись із будь-якого з трьох рівнів розмітки.
const flush = await p.evaluate(() => {
  const h = document.querySelector('.app-header');
  const t = document.querySelector('.hm-top');
  if (!h || !t) return null;
  const hr = h.getBoundingClientRect(), tr = t.getBoundingClientRect();
  return {
    gap: Math.round(tr.top - hr.bottom),
    left: Math.round(tr.left),
    full: Math.round(tr.width) >= window.innerWidth,
    // Тінь має віддавати САМЕ шапка — вона лежить вище блока.
    hdrShadow: getComputedStyle(h).boxShadow !== 'none',
  };
});
ok('🔴 верхній блок Громади настик до шапки', flush && flush.gap === 0, flush ? `зазор ${flush.gap}px` : '—');
ok('🔴 верхній блок на всю ширину', flush && flush.left === 0 && flush.full, flush ? `ліворуч ${flush.left}px` : '—');
ok('шапка має власну тінь (лягає на блок)', flush && flush.hdrShadow);

// 2. Погода → модалка по годинах
await p.locator('.hm-wx-day').nth(0).click();
await p.waitForTimeout(700);
ok('тап по дню відкриває модалку погоди', await p.evaluate(()=>!!document.querySelector('.app-modal--weather')));
await p.evaluate(()=>document.querySelector('.app-modal-close')?.click());
await p.waitForTimeout(500);

// 3. Новина → стаття
await p.locator('#cm-news-board [data-article-id]').first().click();
await p.waitForTimeout(700);
ok('тап по новині відкриває статтю', await p.evaluate(()=>document.getElementById('article-modal')?.classList.contains('open')));
await p.evaluate(()=>window.closeArticleModal && window.closeArticleModal());
await p.waitForTimeout(500);

// 4. «Усі новини» → хаб
await p.locator('#cm-news-board [data-cm-news-all]').click();
await p.waitForTimeout(800);
ok('«Усі новини» відкриває хаб', await p.evaluate(()=>!!document.querySelector('.nh-screen')));
await p.goBack(); await p.waitForTimeout(700);
ok('назад повертає на Громаду', await p.evaluate(()=>document.querySelector('.app-main')?.dataset.tab==='community'));

// 5. Переходи по вкладках із секцій
// ⚠️ «Афіші» тут НЕМАЄ навмисно — див. окрему перевірку нижче.
for (const [sel,tab,name] of [['#hm-board .hm-more','board','Дошка'],['#hm-bus .hm-more','buses','Розклад']]) {
  await p.evaluate(()=>window.switchTab('community')); await p.waitForTimeout(400);
  const has = await p.evaluate(s=>!!document.querySelector(s), sel);
  if (!has) { ok(`кнопка «${name}» існує`, false); continue; }
  await p.locator(sel).click(); await p.waitForTimeout(700);
  // Гейт правил Дошки блокуючий при першому вході — приймаємо, інакше він
  // перехоплює всі наступні тапи (задокументовано в CLAUDE.md).
  await p.evaluate(()=>document.querySelector('.brules-ok, .app-modal--brules button')?.click());
  await p.waitForTimeout(400);
  ok(`«${name}» веде на вкладку ${tab}`, await p.evaluate(()=>document.querySelector('.app-main')?.dataset.tab)===tab);
}
await p.evaluate(()=>window.switchTab('community')); await p.waitForTimeout(500);

// 5.0 🔴 КАПСУЛИ-СТАТУСИ: ЖИВІ ЧИСЛА І ДИСЦИПЛІНОВАНИЙ РУХ.
// Компонент циклічно змінює повідомлення — тобто повертає на сторінку рух,
// якого ми щойно позбулись (було 4 автоматичні рухи, стало 0). Сторож стежить
// саме за тим, щоб цей рух лишався керованим, а числа — справжніми.
const caps = await p.evaluate(()=>{
  const box = document.getElementById('hm-caps');
  const list = [...document.querySelectorAll('.hm-cap2')];
  return {
    є: !!box, n: list.length,
    порожня: box && !box.hidden && list.length === 0,
    тексти: list.map(c => c.querySelector('.hm-cap2-v')?.textContent || ''),
    крапки: document.querySelectorAll('.hm-cap2-dots i').length,
    старі: !!document.getElementById('hm-now'),
  };
});
ok('старої смуги «Зараз» більше немає', !caps.старі);

// 🔴 ІКОНКИ КАПСУЛ — ВЕКТОР, А НЕ ЕМОДЗІ (правило Вови 05.08).
// Були 🚌 📋 📰 💬 — останні емодзі на головній: іконки погоди по днях уже
// векторні (Meteocons). Міряємо і наявність `<svg>`, і ВІДСУТНІСТЬ емодзі —
// поставити вектор поруч із символом, що лишився, легше, ніж здається.
const capIc = await p.evaluate(() => {
  const ics = [...document.querySelectorAll('.hm-cap2-ic')];
  return {
    n: ics.length,
    svg: ics.filter(i => i.querySelector('svg')).length,
    emoji: ics.filter(i => /[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/u.test(i.textContent)).length,
    w: ics[0] ? Math.round(ics[0].querySelector('svg')?.getBoundingClientRect().width || 0) : 0,
  };
});
ok('🔴 іконки капсул векторні', capIc.n > 0 && capIc.svg === capIc.n, `${capIc.svg}/${capIc.n}`);
ok('🔴 емодзі в капсулах не лишилось', capIc.emoji === 0);
ok('іконка капсули не дрібна (≥16px)', capIc.w >= 16, `${capIc.w}px`);
ok('капсули намальовані', caps.n > 0, `${caps.n} шт`);
ok('🔴 порожньої коробки капсул не буває', !caps.порожня);
// Кожне повідомлення мусить містити ЧИСЛО — це статус, а не гасло.
ok('у кожній капсулі є число', caps.тексти.every(t => /\d/.test(t)), caps.тексти.join(' | '));
ok('крапки циклу намальовані', caps.крапки > 0, `${caps.крапки}`);

// Рух: текст мусить справді змінитись. Це наслідок, а не наявність setInterval.
const capBefore = await p.evaluate(()=>[...document.querySelectorAll('.hm-cap2-v')].map(v=>v.textContent));
await p.waitForTimeout(7200);
const capAfter = await p.evaluate(()=>[...document.querySelectorAll('.hm-cap2-v')].map(v=>v.textContent));
ok('🔴 цикл справді міняє повідомлення',
   capBefore.some((t,i)=>t !== capAfter[i]), `${capBefore.join('/')} → ${capAfter.join('/')}`);

// Запобіжник: капсули поза екраном мусять ставати на паузу.
await p.evaluate(()=>{ const m=document.querySelector('.app-main'); m.scrollTop = m.scrollHeight; });
await p.waitForTimeout(900);
const paused = await p.evaluate(()=>[...document.querySelectorAll('.hm-cap2')].map(c=>c.dataset.paused));
ok('🔴 поза екраном цикл спиняється', paused.every(v=>v==='1'), `paused: ${paused.join(',')}`);
await p.evaluate(()=>{ const m=document.querySelector('.app-main'); m.scrollTop = 0; });
await p.waitForTimeout(600);

// 5.1 🔴 СЕКЦІЇ ПОДІЙ НА ГОЛОВНІЙ НЕМАЄ (рішення Вови 04.08 «події прибрати»).
// Причина була не в даних: вести з неї не було куди — вкладки Подій у
// застосунку не існує, і кнопка «Афіша →» вела людину у Стрічку.
// Сторож не дає повернути секцію назад доти, доки не зʼявиться справжній екран.
const ev = await p.evaluate(()=>({
  sec: !!document.getElementById('hm-events'),
  cont: !!document.getElementById('cm-event-content'),
  afisha: [...document.querySelectorAll('#cm-content .hm-more')].some(b => /афіш/i.test(b.textContent)),
}));
ok('🔴 секції подій на головній немає', !ev.sec && !ev.cont);
ok('🔴 кнопки «Афіша», що вела у Стрічку, немає', !ev.afisha);

// 5.13 🔴 ЗБОРИ: ПОРОЖНЬО = СЕКЦІЇ НЕМАЄ ЗОВСІМ (вимога Вови).
// Блок про допомогу, який показує «зборів немає», займає місце й нічого не дає.
//
// ⚠️ 05.08 перевірку ПЕРЕПИСАНО. Було: «секція прихована» — і крапка, з опорою
// на те, що `data/fundraisers.json` у репозиторії порожній. Тобто сторож міряв
// не ПРАВИЛО, а вміст файлу з даними: щойно Вова додав перший запис, стенд упав
// би на цілком робочому коді. Це рівно та хвороба, через яку в проєкті вже
// шість разів брехала перевірка (HOT_RULES: критерій має міряти наслідок).
// Стало: читаємо той самий файл, що читає застосунок, і звіряємо ОБИДВІ
// половини правила — порожньо ховає секцію, непорожньо її показує.
const fundData = JSON.parse(await readFile(join(ROOT, 'data/fundraisers.json'), 'utf8'));
const fundItems = (Array.isArray(fundData) ? fundData : fundData.items || [])
  .filter(it => it && it.active !== false && it.title && it.org && it.url);
const fund = await p.evaluate(() => {
  const sec = document.getElementById('hm-fund');
  return { є: !!sec, прихована: !sec || sec.hidden, карток: document.querySelectorAll('.hm-fund').length };
});
if (!fundItems.length) {
  ok('🔴 без даних секція зборів прихована', fund.прихована, `карток: ${fund.карток}`);
} else {
  ok('🔴 із даними секція зборів видима', !fund.прихована, `у файлі ${fundItems.length}`);
  // Стеля 6 — свідома: більше зборів на головній перетворюють допомогу на каталог.
  ok('🔴 карток стільки ж, скільки записів (стеля 6)',
     fund.карток === Math.min(fundItems.length, 6), `карток: ${fund.карток}`);

  // 5.13.1 🔴 ВАРІАНТ «2» — ВМІСТ ЛЕЖИТЬ ПОВЕРХ ФОТО (макет Вови 05.08).
  // Міряємо НАСЛІДОК, а не наявність класів: чи справді картка темна, чи текст
  // читабельний на ній і чи не зʼїхала кнопка. Саме тут ховається клас помилок,
  // який знімок ловить, а «є клас у CSS» — ні.
  const look = await p.evaluate(() => {
    const card = document.querySelector('.hm-fund');
    if (!card) return null;
    const cs = getComputedStyle(card);
    const ttl = card.querySelector('.hm-fund-ttl');
    const tx = card.querySelector('.hm-fund-go-tx');
    const lh = tx ? (parseFloat(getComputedStyle(tx).lineHeight) || 16) : 0;
    // Яскравість базового тла картки. Темна поверхня — умова того, що білий
    // текст поверх фото взагалі можна читати, коли знімка немає.
    const m = cs.backgroundColor.match(/\d+/g) || cs.background.match(/\d+/g) || [];
    const [r, g, b] = m.map(Number);
    const scrim = card.querySelector('.hm-fund-scrim');
    const ph = card.querySelector('.hm-fund-ph');
    return {
      яскравістьТла: m.length >= 3 ? Math.round(.299 * r + .587 * g + .114 * b) : null,
      градієнтТла: /gradient/.test(cs.backgroundImage),
      заголовокБілий: ttl ? getComputedStyle(ttl).color : '',
      затемнення: !!scrim && getComputedStyle(scrim).position === 'absolute',
      фотоПідШаром: !!ph && getComputedStyle(ph).position === 'absolute',
      кнопкаОдинРядок: tx ? tx.getBoundingClientRect().height < lh * 1.6 : null,
      фактів: card.querySelectorAll('.hm-fund-fact').length,
      текст: card.textContent,
    };
  });
  ok('🔴 картка збору темна (фото — підкладка, не смужка)',
     look && (look.градієнтТла || (look.яскравістьТла != null && look.яскравістьТла < 70)),
     look ? `яскравість: ${look.яскравістьТла}, градієнт: ${look.градієнтТла}` : '—');
  ok('🔴 шар затемнення під текстом є', !!look?.затемнення);
  ok('🔴 фото лежить окремим шаром (absolute)', !!look?.фотоПідШаром);
  ok('заголовок білий', /rgb\(255,\s*255,\s*255\)/.test(look?.заголовокБілий || ''), look?.заголовокБілий);
  // 📐 Кегль напису підбирався під ВУЖЧУ картку у стрічці (249px). Перенос
  // посеред бордової плашки виглядає як зламана верстка — ловимо його висотою.
  ok('🔴 напис у кнопці в один рядок', look?.кнопкаОдинРядок === true);
  // Стеля 2 — у стрічці на комірку лишається 78px, три факти налазили.
  ok('🔴 фактів не більше двох', (look?.фактів ?? 0) <= 2, `фактів: ${look?.фактів}`);

  // 5.13.2 🔴 НА КАРТЦІ НЕМАЄ ВИГАДАНИХ ЧИСЕЛ. Макет Вови мав «Зібрано 82 450 ₴»,
  // «82%» і «124 донати» — жодне з них узяти нізвідки: Monobank не віддає ні
  // суми чужої банки, ні кількості донатерів, а ручне число старіло б мовчки.
  // Це не стилістична прискіпливість: неправда про ЧУЖІ гроші на головній
  // сторінці громади — найдорожча помилка, яку тут можна зробити.
  ok('🔴 немає «зібрано»/«донатів»/відсотка', !/зібрано|донат|%/i.test(look?.текст || ''));
  ok('🔴 сказано, куди веде кнопка', /офіційну банку/i.test(look?.текст || ''));
}

// 5.14 🔴 ВИБІР НАСЕЛЕНОГО ПУНКТУ В ПОГОДІ (05.08).
// Замовлення Вови: локацію винести окремо, при натиску — список сіл громади
// плюс Луцьк. Міряємо наслідок на живій сторінці: чи є чіп, чи відкривається
// шторка, чи справді змінюється показане місце після вибору.
await p.evaluate(() => { const m = document.querySelector('.app-main'); m.scrollTop = 0; });
await p.waitForTimeout(300);
const chip0 = await p.evaluate(() => {
  const c = document.querySelector('[data-wx-place]');
  if (!c) return null;
  const r = c.getBoundingClientRect();
  return { name: c.querySelector('.hm-wx-place-n')?.textContent.trim(), w: Math.round(r.width), h: Math.round(r.height) };
});
ok('🔴 населений пункт винесено окремим елементом', !!chip0, chip0 ? `«${chip0.name}» ${chip0.w}×${chip0.h}` : 'чіпа нема');

// 🔴 ІКОНКИ ВЕКТОРНІ, А НЕ ЕМОДЗІ/СИМВОЛИ — правило Вови від 05.08: «всі ікони,
// включаючи стрілочку донизу, мають бути векторними». Міряємо ДВІ речі, бо
// кожна ловить свій вид зриву: наявність `<svg>` (поставили вектор) і
// відсутність емодзі в тексті (не лишили символ поруч із вектором).
// ⚠️ Розмір теж перевіряємо: `1em` дав би 12px кегля чіпа — рівно та дрібність,
// на яку Вова і поскаржився. Тобто «вектор є» ще не означає «видно».
const icons = await p.evaluate(() => {
  const c = document.querySelector('[data-wx-place]');
  if (!c) return null;
  const pin = c.querySelector('.hm-wx-place-pin svg');
  const ch  = c.querySelector('.hm-wx-place-ch svg');
  const box = el => (el ? Math.round(el.getBoundingClientRect().width) : 0);
  return {
    pin: !!pin, ch: !!ch, pinW: box(pin), chW: box(ch),
    // Емодзі й типографські стрілки в тексті кнопки — те, що замінювали.
    emoji: /[\u{1F300}-\u{1FAFF}\u{2190}-\u{21FF}▲▼▴▾]/u.test(c.textContent),
  };
});
ok('🔴 шпилька в кнопці — вектор', icons && icons.pin);
ok('🔴 стрілка вниз — вектор', icons && icons.ch);
ok('🔴 емодзі й символів-стрілок у кнопці не лишилось', icons && !icons.emoji);
ok('стрілка не дрібна (≥14px)', icons && icons.chW >= 14, icons ? `${icons.chW}px` : '—');
ok('шпилька не дрібна (≥14px)', icons && icons.pinW >= 14, icons ? `${icons.pinW}px` : '—');

// 🔴 КНОПКА КАБІНЕТУ — КОЛИШНІЙ РОЗМІР. Вова 16.07 сам ставив 50px, редизайн
// 04.08 мовчки зробив 38px. Сторож тримає число, щоб це не повторилось.
const ava = await p.evaluate(() => {
  const b = document.querySelector('.hm-ava[data-account-btn]');
  if (!b) return null;
  const ring = getComputedStyle(b, '::before');
  return { tap: Math.round(b.getBoundingClientRect().width), ring: parseFloat(ring.width) || 0 };
});
ok('🔴 кнопка кабінету повернула розмір 50px', ava && ava.ring >= 50, ava ? `коло ${ava.ring}px, тап ${ava.tap}px` : '—');

await p.click('[data-wx-place]');
await p.waitForTimeout(600);
const sheet = await p.evaluate(() => {
  const s = document.querySelector('.app-modal--wxplace');
  if (!s) return null;
  const rows = [...s.querySelectorAll('.wxp-row')].map(b => b.dataset.place);
  return {
    rows: rows.length,
    geo: rows.includes(''),                       // «за моїм місцем»
    olyka: rows.includes('Олика'),
    lutsk: rows.includes('Луцьк'),                // пряме прохання Вови
    groups: [...s.querySelectorAll('.wxp-grp')].map(g => g.textContent.trim()),
    note: !!s.querySelector('.wxp-note'),
  };
});
ok('🔴 тап по пункту відкриває шторку вибору', !!sheet);
ok('у шторці є всі 17 НП громади + Луцьк + геолокація',
   sheet && sheet.rows === 19 && sheet.geo && sheet.olyka && sheet.lutsk, sheet ? `${sheet.rows} рядків` : '—');
ok('Луцьк окремою групою «Міста поруч»',
   sheet && sheet.groups.length === 2 && /міста поруч/i.test(sheet.groups[1]), sheet ? sheet.groups.join(' / ') : '—');
ok('🔴 у шторці сказано, що по селах прогноз однаковий', sheet && sheet.note);

// Вибираємо село → чіп мусить показати САМЕ його.
await p.click('.wxp-row[data-place="Дерно"]');
await p.waitForTimeout(3500);
const afterPick = await p.evaluate(() => ({
  name: document.querySelector('.hm-wx-place-n')?.textContent.trim(),
  saved: localStorage.getItem('wx_place_v1'),
}));
ok('🔴 після вибору показано обране село', afterPick.name === 'Дерно', `чіп: «${afterPick.name}»`);
ok('вибір запамʼятався', afterPick.saved === 'Дерно', String(afterPick.saved));

// 🔴 КОНТРОЛЬ: модалка по годинах ЖИВА. Порада, яку приніс Вова, пропонувала
// замінити тап по дню на перемикання верху картки — це прибрало б скрабер із
// графіками. Вова сказав не чіпати; сторож не дає зробити це випадково.
await p.locator('.hm-wx-day').nth(1).click();
await p.waitForTimeout(600);
ok('🔴 КОНТРОЛЬ: тап по дню ДОСІ відкриває модалку по годинах',
   await p.evaluate(() => !!document.querySelector('.app-modal--weather .wx-chart-svg-wrap')));
await p.evaluate(() => document.querySelector('.app-modal--weather .app-modal-close')?.click());
await p.waitForTimeout(500);
// Повертаємо стан, щоб наступні перевірки бачили сторінку як завжди.
await p.evaluate(() => { localStorage.removeItem('wx_place_v1'); });

// 5.15 🔴 ПЛИТКА НОВИНИ МАЄ ВЛАСНУ ПОВЕРХНЮ (04.08).
// Скарга Вови: «чому вони квадратні?». Заміряно тоді: радіус 0, обідок 0,
// тінь none — бо спільне правило поверхні в `news-card.css` охоплювало три
// варіанти, а четвертий не потрапив у жодне, і `home.css` виставляв колір
// обідка, якого не існує. Це вже ТРЕТІЙ випадок тієї самої хвороби (01.08 те
// саме сталось із `.nc--mini`), тому міряємо НАСЛІДОК на живій сторінці, а не
// наявність правила у файлі.
// ⚠️ Стрічку спершу ставимо в нуль: карусель гортається сама, і перша картка
// встигає виїхати за ліве поле — вимір тоді бреше (спіймано власним
// інструментом `tests/tools/news-tile-audit.mjs`).
await p.$eval('#cm-news-board', el => el.scrollIntoView({ block: 'center' }));
await p.$eval('#hm-ntrack', el => { el.scrollLeft = 0; });
await p.waitForTimeout(400);
const tile = await p.evaluate(()=>{
  const c = document.querySelector('#hm-ntrack > .nc');
  if (!c) return null;
  const s = getComputedStyle(c);
  const img = c.querySelector('.nc-img');
  return {
    radius: parseFloat(s.borderTopLeftRadius) || 0,
    border: parseFloat(s.borderTopWidth) || 0,
    shadow: s.boxShadow && s.boxShadow !== 'none',
    clips:  s.overflow === 'hidden',
    // Гео-мітка дублювала підпис `.hm-ncat` рівно над стрічкою.
    geo:    !!c.querySelector('.nc-badge--geo:not([hidden])') &&
            getComputedStyle(c.querySelector('.nc-badge--geo')).display !== 'none',
    imgR:   img ? parseFloat(getComputedStyle(img).borderTopLeftRadius) || 0 : -1,
  };
});
ok('🔴 плитка новини НЕ квадратна (радіус > 0)', tile && tile.radius > 0, tile ? `${tile.radius}px` : 'плитки нема');
ok('🔴 у плитки є обідок (не лише його колір)', tile && tile.border > 0, tile ? `${tile.border}px` : '—');
ok('плитка має тінь головної', tile && tile.shadow);
ok('🔴 картка обрізає фото (інакше з-під кута визирне прямий ріг)', tile && tile.clips);
ok('фото власного радіуса не має — його дає картка', tile && tile.imgR === 0, tile ? `${tile.imgR}px` : '—');
ok('🔴 гео-мітка на плитці не дублює підпис стрічки', tile && !tile.geo);

// 5.16 🔴 ВХІД У РОЗДІЛ — КАПСОМ У КОЖНІЙ СЕКЦІЇ (замовлення Вови 04.08:
// «назву усі новини треба зробити великими буквами, і так в кожному блоці»).
// Міряємо обчислений `text-transform`, а не текст у розмітці: капс, зроблений
// руками в рядку («УСІ НОВИНИ»), виглядав би так само, але розʼїхався б у
// першій же секції, яку додадуть пізніше.
const heads = await p.evaluate(()=>
  [...document.querySelectorAll('#cm-content .hm-sec')]
    .filter(s => !s.hasAttribute('hidden'))
    .map(s => {
      const m = s.querySelector('.hm-more');
      if (!m) return { sec: s.id, none: true };
      const cs = getComputedStyle(m);
      const r = m.getBoundingClientRect();
      return {
        sec: s.id, caps: cs.textTransform === 'uppercase',
        surface: cs.backgroundColor !== 'rgba(0, 0, 0, 0)',
        area: Math.round(r.width * r.height),
      };
    }));
const withMore = heads.filter(h => !h.none);
ok('🔴 вхід у розділ капсом у КОЖНІЙ секції, де він є',
   withMore.length > 0 && withMore.every(h => h.caps),
   withMore.map(h => `${h.sec}:${h.caps?'капс':'НІ'}`).join(' '));
ok('вхід має власну поверхню (не другий капс у рядку)',
   withMore.every(h => h.surface));
// Порівнюємо з тим, що було до переробки: 116×19 = 2204px².
ok('площа дотику входу більша за колишні 2204px²',
   withMore.every(h => h.area > 2204), withMore.map(h => h.area + 'px²').join(' '));

// 5.2 🔴 ФОТО НА ФОНІ НЕ НАКРИВАЄ ВМІСТ.
// Перша версія мала z-index: 0 — і фото лягло ПОВЕРХ усього непозиціонованого
// (шапка, назви секцій зникли). Міряємо НАСЛІДОК: що реально під пальцем у
// точці заголовка секції — текст чи фон.
const bgz = await p.evaluate(()=>{
  const bg = document.querySelector('.hm-bg');
  const k = document.querySelector('#cm-news-board .hm-kicker');
  const r = k.getBoundingClientRect();
  const at = document.elementFromPoint(r.left + 4, r.top + r.height/2);
  return { z: getComputedStyle(bg).zIndex, hitsBg: at === bg || bg.contains(at), tag: at?.className };
});
ok('🔴 фон лежить ПІД вмістом (z-index відʼємний)', bgz.z === '-1', `z-index: ${bgz.z}`);
ok('🔴 заголовок секції не накритий фоном', !bgz.hitsBg, `під пальцем: "${bgz.tag}"`);

// 6. Блоки наповнились
const filled = await p.evaluate(()=>{
  const t = id => (document.getElementById(id)?.textContent||'').trim();
  const sk = id => document.getElementById(id)?.querySelector('.hm-sk-row');
  return { news:t('cm-news-content').length,
    board:t('cm-board-content').length, bus:t('cm-bus-content').length, cont:t('cm-contacts-content').length,
    stuck:['cm-news-content','cm-board-content','cm-bus-content','cm-contacts-content'].filter(sk) };
});
ok('новини наповнились', filled.news>40, String(filled.news));
ok('оголошення наповнились', filled.board>10, String(filled.board));
ok('автобуси наповнились', filled.bus>10, String(filled.bus));
ok('контакти наповнились', filled.cont>10, String(filled.cont));
ok('жоден блок не завис на скелеті', filled.stuck.length===0, filled.stuck.join(', '));

// 7. 🔴 ТЕЛЕФОНИ: ЕКСТРЕНІ ВІДДІЛЕНІ ВІД ГРОМАДИ.
// Скарга Вови 04.08: під заголовком «Телефони громади» стояли 101/102/103,
// які до громади не належать — заголовок казав неправду. Сторож не дає
// злити ці два списки назад в один.
const ct = await p.evaluate(()=>{
  const c = document.getElementById('cm-contacts-content');
  const sos = [...c.querySelectorAll('.hm-sos-b')];
  const last = sos[sos.length-1];
  return {
    sos: sos.length,
    номери: sos.map(b=>b.querySelector('.hm-sos-n').textContent.trim()),
    групи: [...c.querySelectorAll('.hm-cgrp')].length,
    контакти: [...c.querySelectorAll('.hm-ct')].length,
    // Чи веде екстрена плитка одразу в дзвінок (а не на проміжний екран).
    tel: sos.every(b => (b.getAttribute('href')||'').startsWith('tel:')),
    // 🔴 Сітка не має вилазити за екран: `1fr` без minmax(0,…) розпирався
    // назвами служб і виносив пʼяту плитку за правий край.
    влазить: !last || last.getBoundingClientRect().right <= window.innerWidth + 1,
    копія: !!c.querySelector('[data-copy]'),
  };
});
ok('екстрені служби окремим блоком', ct.sos >= 3, `${ct.sos} плиток`);
ok('порядок екстрених — 101,102,103…', ct.номери[0] === '101' && ct.номери[1] === '102', ct.номери.join(','));
ok('тап по екстреній веде в дзвінок', ct.tel);
ok('🔴 сітка екстрених не вилазить за екран', ct.влазить);
ok('контакти громади згруповані', ct.групи > 0, `${ct.групи} груп`);
ok('у групах є контакти', ct.контакти > 0, `${ct.контакти}`);
ok('є швидка дія «копіювати»', ct.копія);

ok('помилок у консолі нема', errs.length===0, errs.slice(0,3).join(' | '));
const bad = R.filter(r=>!r).length;
console.log(`\n${bad?'❌':'✅'} ${R.length-bad}/${R.length} перевірок пройдено`);
await b.close(); await stop();
process.exit(bad?1:0);
