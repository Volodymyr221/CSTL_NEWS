// Стенд: «ПРИВИД ТАПУ» НЕ ЗАКРИВАЄ ЩОЙНО ВІДКРИТЕ МЕНЮ + У ЗАКРИТОМУ СТАНІ НЕМА РОЗМИТТЯ.
//
// 🔴 ЗАМОВЛЕННЯ ВОВИ (10.08, дослівно): «проблема з бургером та тим що це меню
// пропадає не виправлена, розбери це комплексно, можливо подивись на це з іншої
// сторони… але не поламай ту логіку плавності і тд як зараз… можливо щось не до
// кінця згортається чи виключається».
//
// 🔑 ЩО ЗАМІРЯВ ПРИЛАД І ЧОМУ ПОПЕРЕДНІ ДВА ЗАХОДИ НЕ ДОПОМОГЛИ.
// Питання було одне: що лежить під пальцем у точці бургера після відкриття меню.
//   0–25мс   → ЗАТЕМНЕННЯ (панель ще за краєм екрана)
//   ~30–120  → глухе місце панелі
//   ≥150мс   → `#sidebar-close`, ХРЕСТИК САМОГО МЕНЮ
//   266мс    → панель доїхала
// Тобто закрити щойно відкрите меню можуть ДВА різні елементи, а обидва попередні
// заходи дивились лише на затемнення і закривали перше вікно з двох.
// Причина в геометрії: ✕ меню стоїть РІВНО НА БУРГЕРІ — заміряно
// `332,9 · 38×38` проти `332,14 · 44×44`, перекриття 1235px² = 86% площі бургера.
// На iOS після повернення з чужого застосунку система доганяє/дублює дотик, і цей
// другий клік влучає туди ж, куди перший.
//
// ➡️ ПРАВИЛО, ЯКЕ СТЕРЕЖЕ ЦЕЙ ФАЙЛ: поки панель не доїхала, закриття не приймається
// НІ ВІД ЧОГО — байдуже, у що тап фізично влучив.
//
// 🔬 ЩО САМЕ МІРЯЄМО — наслідок, а не форму запису коду:
//   • меню лишилось відкритим (положення панелі на екрані), а не «у коді є гейт»;
//   • обчислений `backdrop-filter` затемнення, а не наявність слова в CSS;
//   • чи перехоплює шар тапи (`elementFromPoint`) — це і є «застосунок мертвий».
//
// 🛡 ДВА КОНТРОЛІ ПРОТИ САМООМАНИ (правило проєкту про мірку — перед порівнянням
// зміряй, що дає порівняння стану з самим собою):
//   1. НЕ ПЕРЕСТАРАЛИСЬ: свідомий тап по ✕ і по затемненню ПІСЛЯ доїзду мусить
//      закривати меню. Якби сторож зеленів і тут, і там, він доводив би лише те,
//      що меню взагалі не закривається.
//   2. ЗАПОБІЖНИК СТЕЛІ: при штучно затягнутій анімації закриття мусить
//      відновитись через `CEILING_MS` — інакше правило «не доїхала — не закриваємо»
//      замкнуло б людину в меню назавжди.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     BUNDLE_REV=origin/main CSS_REV=origin/main node tests/sidebar-ghost-tap.mjs
// На коді ДО фіксу 🔴-перевірки мусять УПАСТИ.
//
// ⚠️ `serviceWorkers: 'block'` — інакше запити йдуть через `sw.js` повз `page.route`
// (восьмий випадок брехливої перевірки в цьому проєкті).
// ⚠️ Сплеш-заставку чекаємо явно: перша редакція приладу міряла `#splash` і
// показувала, що під пальцем лежить заставка, а не меню.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile, blockExternal } from './_lib.mjs';

const { ok, done } = reporter();
const BUNDLE_REV = process.env.BUNDLE_REV || '';
const CSS_REV = process.env.CSS_REV || '';

const srv = await serve();
const browser = await launch(chromium);
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },   // iPhone 14 — пристрій Вови
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
await blockExternal(page);

if (BUNDLE_REV) {
  const code = projectFile('bundle.js', BUNDLE_REV);
  await page.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: code }));
}
if (CSS_REV) {
  const css = projectFile('style/sidebar.css', CSS_REV);
  await page.route('**/style/sidebar.css', r => r.fulfill({ contentType: 'text/css; charset=utf-8', body: css }));
}

await page.goto(srv.url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#sidebar-toggle', { timeout: 15000 });
await page.waitForFunction(() => {
  const s = document.getElementById('splash');
  return !s || s.hidden || getComputedStyle(s).display === 'none' || getComputedStyle(s).opacity === '0';
}, { timeout: 15000 }).catch(() => {});
await page.waitForTimeout(400);

// ── Приладдя ────────────────────────────────────────────────────────────────
const бургер = await page.evaluate(() => {
  const r = document.getElementById('sidebar-toggle').getBoundingClientRect();
  return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + r.height / 2) };
});

// Меню відкрите = панель зайшла в екран. Міряємо положення, а не класи: клас може
// залипнути (саме це й був баг), а положення — те, що бачить око.
const менюВідкрите = () => page.evaluate(() =>
  document.getElementById('sidebar').getBoundingClientRect().left < innerWidth - 20);

const станЗатемнення = () => page.evaluate(() => {
  const el = document.getElementById('sidebar-overlay');
  const cs = getComputedStyle(el);
  // ⚠️ 11.08 — фільтр живе на `::before`, а не на самому шарі (див. `style/sidebar.css`).
  const b = getComputedStyle(el, '::before');
  return {
    фільтр: b.backdropFilter || b.webkitBackdropFilter || 'none',
    прозорість: parseFloat(cs.opacity),
    видно: cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01,
    ловитьТап: document.elementFromPoint(30, innerHeight / 2) === el,
  };
});

const закритиНачисто = async () => {
  await page.evaluate(() => document.getElementById('sidebar-close')?.click());
  await page.waitForTimeout(800);
  // Якщо гейт стелі ще тримає — добиваємо після неї, щоб наступна сцена почалась з нуля.
  if (await менюВідкрите()) {
    await page.waitForTimeout(700);
    await page.evaluate(() => document.getElementById('sidebar-close')?.click());
    await page.waitForTimeout(500);
  }
};

// СЦЕНА: відкрити бургером і через `затримка` мс повторити тап у ТУ САМУ точку —
// саме так iOS доганяє дотик після повернення з чужого застосунку.
async function привид(затримка) {
  await page.evaluate(async ([b, d]) => {
    document.getElementById('sidebar-toggle').click();
    const t0 = performance.now();
    while (performance.now() - t0 < d) await new Promise(r => requestAnimationFrame(r));
    const ціль = document.elementFromPoint(b.x, b.y);
    ціль?.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: b.x, clientY: b.y }));
  }, [бургер, затримка]);
  await page.waitForTimeout(800);
  const відкрите = await менюВідкрите();
  await закритиНачисто();
  return відкрите;
}

// ── 1. Небезпека справді існує (діагностика, не вирок) ──────────────────────
await page.evaluate(() => document.getElementById('sidebar-toggle').click());
await page.waitForTimeout(700);
const перекриття = await page.evaluate(() => {
  const b = document.getElementById('sidebar-toggle').getBoundingClientRect();
  const x = document.getElementById('sidebar-close').getBoundingClientRect();
  const s = Math.max(0, Math.min(b.right, x.right) - Math.max(b.left, x.left))
          * Math.max(0, Math.min(b.bottom, x.bottom) - Math.max(b.top, x.top));
  return Math.round(s / (b.width * b.height) * 100);
});
ok('хрестик меню накриває бургер (тому привид тапу і небезпечний)',
   перекриття > 50, `${перекриття}% площі бургера`);
await закритиНачисто();

// ── 2. 🔴 ПРИВИД ТАПУ НЕ ЗАКРИВАЄ МЕНЮ — обидва вікна ───────────────────────
// 0мс — вікно затемнення. 150 і 250мс — вікно ХРЕСТИКА, те саме, яке пропустили
// два попередні заходи. Кожна затримка перевіряється окремо, щоб при падінні було
// видно, ЯКЕ саме вікно відкрилось назад.
//
// ⚠️ ЧЕСНО ПРО ВАГУ КОЖНОЇ: контрольний прогін на `origin/main` валить **0мс і
// 250мс**, а 80 і 150 там лишаються зеленими. Отже несучі — саме ці дві, а решта
// дві сторожать межі й нічого самі по собі не доводять. 150мс тримаємо попри це:
// прилад ловив на ньому хрестик, просто попадання залежить від того, на якому
// кадрі браузер віддасть панель. Мовчазно викидати перевірку, яка «і так зелена»,
// не можна — але й вважати її доказом теж.
for (const мс of [0, 80, 150, 250]) {
  ok(`🔴 привид через ${мс}мс НЕ закриває меню`, await привид(мс));
}

// ── 3. 🛡 КОНТРОЛЬ: не перестаралися — свідоме закриття працює ──────────────
// Якщо ці дві перевірки теж зеленітимуть при зламаному коді, попередній блок не
// доводить нічого: «меню не закрилось» стало б властивістю застосунку, а не фіксу.
await page.evaluate(() => document.getElementById('sidebar-toggle').click());
await page.waitForTimeout(700);                     // панель доїхала
await page.evaluate(() => document.getElementById('sidebar-close').click());
await page.waitForTimeout(700);
ok('🛡 КОНТРОЛЬ: тап по ✕ ПІСЛЯ доїзду закриває меню', !(await менюВідкрите()));

await page.evaluate(() => document.getElementById('sidebar-toggle').click());
await page.waitForTimeout(700);
await page.mouse.click(30, 500);                    // лівий край = затемнення
await page.waitForTimeout(700);
ok('🛡 КОНТРОЛЬ: тап по затемненню ПІСЛЯ доїзду закриває меню', !(await менюВідкрите()));
await закритиНачисто();

// ── 4. 🛡 ЗАПОБІЖНИК СТЕЛІ: застрягла панель не замикає людину в меню ───────
// Штучно розтягуємо виїзд на 5с. Правило «не доїхала — не закриваємо» без стелі
// тримало б меню відкритим усі 5с; стеля мусить відпустити раніше.
//
// ⚠️ ПРИЛАД ТУТ УЖЕ ЗБРЕХАВ ОДИН РАЗ — і це варто знати, перш ніж «лагодити» код
// за цією перевіркою. Перша редакція розтягувала `transition-duration` і одразу
// міряла геометрію: перевірка червоніла на СПРАВНОМУ коді, бо 5с діяли й на
// ЗАКРИТТЯ — меню було вже закрите станом, але панель ще їхала за екран усі 5с, і
// геометрія чесно казала «видно». Ламалась не стеля, а мірка. Тому сповільнення
// знімається ОДРАЗУ після тапу: перевіряємо, чи закриття ПРИЙНЯЛОСЬ, а не чи
// встигла доїхати штучно загальмована анімація.
await page.addStyleTag({ content: '#sidebar { transition-duration: 5s !important; }' });
await page.evaluate(() => document.getElementById('sidebar-toggle').click());
await page.waitForTimeout(900);                      // > CEILING_MS (600), але < 5с
await page.evaluate(() => {
  document.getElementById('sidebar-close').click();   // закриття в «застряглому» стані
  document.querySelectorAll('style').forEach(s => {   // …і одразу віддаємо звичайну швидкість
    if (s.textContent.includes('transition-duration: 5s')) s.remove();
  });
});
await page.waitForTimeout(700);
ok('🛡 ЗАПОБІЖНИК: при застряглій панелі закриття відновлюється після стелі',
   !(await менюВідкрите()));
await закритиНачисто();

// ── 5. 🔴 РОЗМИТТЯ ІСНУЄ ЛИШЕ ДОКИ ЙОГО ВИДНО ──────────────────────────────
let ст = await станЗатемнення();
ok('🔴 закрито: розмиття фону НЕМА взагалі (нема чому застигати)',
   ст.фільтр === 'none', `backdrop-filter=${ст.фільтр}`);
ok('закрито: шар не перехоплює тапи', !ст.ловитьТап);

await page.evaluate(() => document.getElementById('sidebar-toggle').click());
await page.waitForTimeout(700);
ст = await станЗатемнення();
ok('відкрито: розмиття на місці (вигляд не змінився)', /blur\(3px\)/.test(ст.фільтр), ст.фільтр);

// Плавність: знімаємо ВЕСЬ хід згасання кадр за кадром і питаємо дві речі —
// чи були проміжні значення прозорості (тобто згасання, а не ривок) і чи дожив
// блюр до кінця цього згасання. Міряти «яка прозорість рівно через 60мс» не можна:
// браузер не зобовʼязаний віддати кадр у конкретну мить (це вже давало хибне
// падіння в стенді №55).
const хід = await page.evaluate(() => new Promise(res => {
  const el = document.getElementById('sidebar-overlay');
  el.classList.remove('sidebar-overlay--show');
  const t0 = performance.now(); const кадри = [];
  const тік = () => {
    const cs = getComputedStyle(el), b = getComputedStyle(el, '::before');
    кадри.push({ мс: Math.round(performance.now() - t0), op: parseFloat(cs.opacity),
                 ф: b.backdropFilter || b.webkitBackdropFilter || 'none' });
    if (performance.now() - t0 < 500) requestAnimationFrame(тік); else res(кадри);
  };
  requestAnimationFrame(тік);
}));
const проміжні = хід.filter(k => k.op > 0.01 && k.op < 0.99).length;
ok('🔴 згасання лишилось плавним, а не ривком (вимога Вови)', проміжні >= 3,
   `проміжних кадрів: ${проміжні} з ${хід.length}`);
const блюрПоки = хід.filter(k => k.op > 0.01).every(k => k.ф !== 'none');
ok('🔴 розмиття тримається весь час, поки затемнення ще видно', блюрПоки);
ok('…і зникає, коли зникло затемнення', хід[хід.length - 1].ф === 'none');

// ── 6. 🔴 ЗАЛИПЛИЙ СТАН: клас показу є, меню закрите ───────────────────────
// Рівно те, що Вова бачить після Instagram. Раніше запобіжник знімав видимість,
// але НЕ фільтр — тобто найдорожче (шар, що семплить фон щокадру) переживало і
// меню, і сам запобіжник.
await закритиНачисто();
const залипле = await page.evaluate(() => {
  const ov = document.getElementById('sidebar-overlay');
  ov.hidden = false;
  ov.classList.add('sidebar-overlay--show');
  const cs = getComputedStyle(ov), b = getComputedStyle(ov, '::before');
  const r = {
    фільтр: b.backdropFilter || b.webkitBackdropFilter || 'none',
    видно: cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01,
    ловитьТап: document.elementFromPoint(30, innerHeight / 2) === ov,
  };
  ov.classList.remove('sidebar-overlay--show');
  ov.hidden = true;
  return r;
});
ok('🔴 ЗАЛИПЛО: розмиття знято запобіжником', залипле.фільтр === 'none', залипле.фільтр);
ok('🔴 ЗАЛИПЛО: шар не видно людині', !залипле.видно);
ok('🔴 ЗАЛИПЛО: застосунок не «мертвий» — тапи проходять', !залипле.ловитьТап);

await browser.close();
await srv.stop();
done();
