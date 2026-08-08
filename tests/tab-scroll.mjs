// Стенд №51: ПРОКРУТКА ВКЛАДОК — НЕЗАЛЕЖНА, БЕЗ РИВКА, І ТАП ПО АКТИВНІЙ ВЕДЕ ВГОРУ.
//
// 🔴 ЗАМОВЛЕННЯ ВОВИ (08.08, дослівно): «заходжу на вкладку "Дошка" і гортаю, потім
// переходжу на "Громаду", і чомусь відбувається такий ривок. Спочатку відображається
// той самий діапазон прокруту, а потім різко переключається на початок… Кожна сторінка
// вона незалежна по факту». І друге: «прокрутив вниз до самого низу і хоче швидко
// повернутися наверх — може ще раз натиснути на стрічку, як це в Instagram».
//
// 🔑 КОРІНЬ, ЯКИЙ ЦЕЙ СТЕНД СТЕРЕЖЕ. Вкладки не «синхронізовані» — скролер у
// застосунку ОДИН: `.app-main` (`style/base.css`), усі `#page-*` лежать усередині.
// Ривок давало те, що `scrollTop = 0` стояв у `setTimeout(…, 220)`, тобто ПІСЛЯ
// показу нової вкладки: один кадр на чужому зміщенні, потім стрибок.
//
// ⚠️ ЧОМУ МІРЯЄМО КАДРАМИ, А НЕ КІНЦЕВИМ СТАНОМ. Кінцевий стан був правильний і ДО
// фіксу — прокрутка однаково доїжджала в нуль, просто через 220мс і на очах у людини.
// Перевірка «після переходу scrollTop === 0» була б зеленою на зламаному коді. Тому
// стенд знімає зміщення СЕРІЄЮ через `requestAnimationFrame` протягом усього переходу
// і питає: чи був хоч один кадр, намальований на чужій прокрутці.
// Це той самий урок, що вже коштував проєкту хибних висновків: критерій має міряти те,
// що побачить Вова, а не те, що зручно перевірити.
//
// ⚠️ `serviceWorkers: 'block'` — інакше запити йдуть через `sw.js` повз `page.route`.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

// Дошці потрібні оголошення, щоб було що гортати.
const NOW = new Date().toISOString();
const POSTS = Array.from({ length: 24 }, (_, i) => ({
  id: `p${i}`, type: 'board', category: 'продам', location: 'Олика',
  title: `ОГОЛОШЕННЯ НОМЕР ${i + 1}`, text: 'опис оголошення для висоти списку',
  price: '100', author: 'Сусід', owner_uid: 'u-other', contact: '', photos: [],
  status: 'published', published_at: NOW, created_at: NOW,
}));

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();

await mockSupabase(p, { posts: POSTS, threads: [], messages: [], thread_user_state: [], announcements: [] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  const body = projectFile('bundle.js', REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(200);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await p.waitForTimeout(1500);

const зміщення = () => p.evaluate(() => document.querySelector('.app-main')?.scrollTop ?? -1);

// Прокрутити Дошку глибоко — «дві повних сторінки», як каже Вова.
const глибина = await p.evaluate(() => {
  const m = document.querySelector('.app-main');
  if (!m) return -1;
  m.scrollTop = Math.min(m.scrollHeight - m.clientHeight, window.innerHeight * 2);
  return m.scrollTop;
});
ok('сцена: Дошку прокручено вглиб', глибина > 400, `${Math.round(глибина)}px`);

// ── 1. РИВОК: чи є кадр, намальований на ЧУЖІЙ прокрутці ────────────────────
// Знімаємо `scrollTop` кожен кадр протягом усього переходу (перехід триває 220мс,
// беремо із запасом), одразу після виклику switchTab.
const кадри = await p.evaluate(async () => {
  const m = document.querySelector('.app-main');
  const проби = [];
  let стоп = false;
  const тік = () => {
    if (стоп) return;
    проби.push(m.scrollTop);
    requestAnimationFrame(тік);
  };
  requestAnimationFrame(тік);
  window.switchTab('community');
  await new Promise(r => setTimeout(r, 700));
  стоп = true;
  return проби;
});

const максКадр = Math.max(...кадри);
ok('🔴 жоден кадр Громади не намальований на прокрутці Дошки (ривка немає)',
   максКадр < 40, `найбільше зміщення за перехід: ${Math.round(максКадр)}px`);
ok('після переходу Громада стоїть згори', (await зміщення()) < 40, `${await зміщення()}px`);

// ── 2. НЕЗАЛЕЖНІСТЬ: повернення на Дошку віддає ЇЇ місце ────────────────────
// Прокручуємо Громаду на своє зміщення — воно не має нічого спільного з Дошкою.
await p.evaluate(() => { document.querySelector('.app-main').scrollTop = 300; });
await p.waitForTimeout(200);
await p.evaluate(() => window.switchTab('board'));
await p.waitForTimeout(800);
const назадНаДошці = await зміщення();
ok('🔴 повернення на Дошку віддає ЇЇ власне місце, а не чуже',
   Math.abs(назадНаДошці - глибина) < 60, `${Math.round(назадНаДошці)}px проти ${Math.round(глибина)}px`);

await p.evaluate(() => window.switchTab('community'));
await p.waitForTimeout(800);
const назадНаГромаді = await зміщення();
ok('🔴 і Громада теж памʼятає своє (300px), а не Дошчине',
   Math.abs(назадНаГромаді - 300) < 60, `${Math.round(назадНаГромаді)}px`);

// ── 3. ТАП ПО АКТИВНІЙ ВКЛАДЦІ → ВГОРУ ──────────────────────────────────────
await p.evaluate(() => window.switchTab('board'));
await p.waitForTimeout(800);
const передТапом = await зміщення();
ok('сцена: стоїмо на Дошці прокрученими', передТапом > 400, `${Math.round(передТапом)}px`);

// Тап саме по кнопці таб-бару — тим самим шляхом, що й палець.
// Знімаємо рух КАДРАМИ: нам потрібен не лише результат «опинились угорі», а сам
// підйом. Миттєвий стрибок дав би той самий результат.
const підйом = await p.evaluate(async () => {
  const m = document.querySelector('.app-main');
  const проби = [];
  let стоп = false;
  const тік = () => { if (стоп) return; проби.push(m.scrollTop); requestAnimationFrame(тік); };
  requestAnimationFrame(тік);
  document.querySelector('.tab-item[data-tab="board"]')?.click();
  await new Promise(r => setTimeout(r, 1400));
  стоп = true;
  return проби;
});
const післяТапу = await зміщення();
ok('🔴 повторний тап по активній вкладці піднімає вгору',
   післяТапу < 40, `${Math.round(післяТапу)}px`);

// ── ПЛАВНІСТЬ: рух видно, і він РОЗГАНЯЄТЬСЯ ────────────────────────────────
// 🔴 Замовлення Вови (друга редакція): «щоб воно не різко так пропало і зʼявилося,
// а щоб плавно проскролювалось… створити відчуття, що воно починає піднімати і
// набирає швидкість». Перша редакція здалеку робила миттєвий стрибок — відхилено.
//
// ⚠️ Перевірка «в кінці ми вгорі» тут БЕЗСИЛА: миттєвий стрибок теж дає нуль. Тому
// міряємо проміжні кадри — скільки їх було між стартом і нулем.
const проміжні = підйом.filter(v => v > 20 && v < підйом[0] - 20).length;
ok('🔴 підйом АНІМОВАНИЙ, а не стрибок (є проміжні кадри)',
   проміжні >= 8, `проміжних кадрів: ${проміжні}`);

// Розгін: перша третина шляху має бути ПОВІЛЬНІШОЮ за середню — це і є «починає
// піднімати і набирає швидкість». Порівнюємо пройдену відстань по третинах часу.
const рух = підйом.slice(0, підйом.findIndex(v => v <= 0) + 1 || підйом.length);
const третина = Math.max(1, Math.floor(рух.length / 3));
const шлях = (a, b) => Math.abs((рух[Math.min(b, рух.length - 1)] ?? 0) - (рух[a] ?? 0));
const перша = шлях(0, третина);
const середня = шлях(третина, третина * 2);
ok('🔴 рух РОЗГАНЯЄТЬСЯ: старт мʼякший за середину',
   перша < середня, `перша третина ${Math.round(перша)}px проти середньої ${Math.round(середня)}px`);

// Працює на КОЖНІЙ кнопці, а не лише на Дошці — пряма вимога Вови
// («це треба реалізувати на всі кнопки tab-бару»).
const усіВкладки = ['shotam', 'community', 'buses'];
const провал = [];
for (const t of усіВкладки) {
  await p.evaluate((x) => window.switchTab(x), t);
  await p.waitForTimeout(700);
  const можнаГортати = await p.evaluate(() => {
    const m = document.querySelector('.app-main');
    m.scrollTop = 500;
    return m.scrollTop;
  });
  if (можнаГортати < 100) continue;   // вкладка коротша за екран — гортати нічого
  await p.evaluate((x) => document.querySelector(`.tab-item[data-tab="${x}"]`)?.click(), t);
  await p.waitForTimeout(1200);
  const після = await зміщення();
  if (після >= 40) провал.push(`${t}: ${Math.round(після)}px`);
}
ok('🔴 те саме працює на ВСІХ кнопках таб-бару', провал.length === 0,
   провал.join(' · ') || 'усі перевірені вкладки піднімаються');

// ── 4. ТАП ПО АКТИВНІЙ ВКЛАДЦІ ЩЕ Й ОНОВЛЮЄ ДАНІ ────────────────────────────
// «Бажано, щоб було легеньке оновлення інформації — не завантажувало сторінку, а
// просто оновило якусь інформацію, якщо не оновлена» (Вова). Міряємо наслідок:
// чи сходив застосунок у базу за профілями після тапу.
//
// ⚠️ ПЕРША ВЕРСІЯ ЦІЄЇ ПЕРЕВІРКИ БУЛА ХИБНА: вона рахувала виклики RPC профілів
// (`get_avatars`) і показала нуль — а це правда, але не про те. На картках списку
// Дошки автор не малюється взагалі, тож гідрувати нема кого, і нуль тут — коректна
// поведінка, а не поламане оновлення. Міряти треба ТЕ, ЩО ЗОНА СПРАВДІ ПЕРЕЧИТУЄ:
// для Дошки це `posts`.
await p.evaluate(() => window.switchTab('board'));
await p.waitForTimeout(900);
await p.evaluate(() => { window.__cstlQueries = {}; });
await p.evaluate(() => document.querySelector('.tab-item[data-tab="board"]')?.click());
await p.waitForTimeout(1500);
const запитів = await p.evaluate(() => (window.__cstlQueries || {}).posts || 0);
ok('🔴 тап по активній вкладці тягне легке оновлення даних', запитів >= 1,
   `перечитувань posts: ${запитів}`);
ok('оновлення саме ЛЕГКЕ — сторінка не перезавантажувалась',
   await p.evaluate(() => !!document.getElementById('board-content')?.innerHTML),
   'вкладка на місці');

// 🔴 08.08 — ДВА НОВІ ІНВАРІАНТИ. Обидва — наслідки МОЇХ регресій того ж дня, тож
// стережемо їх числами, а не «виглядає добре».

// (1) БЛИМАННЯ ЧУЖОЇ ШАПКИ ПРИ ПЕРЕХОДІ.
// Вова: «натискаю на іншу сторінку — спочатку блимає верхня частина екрана, потім
// перемикає». Причина: перехресне згасання тримало ОБИДВІ сторінки в потоці 220мс,
// а `.app-main` — один скролер на застосунок, тож `scrollTop = 0` у цей момент
// показував верх СТАРОЇ сторінки.
// ⚠️ Міряємо не «чи є згасання», а сам дефект: жоден кадр не має містити двох
//    сторінок у потоці. Так сторож переживе будь-яку майбутню анімацію, якщо вона
//    буде зроблена накладенням шарів, а не `display`+`opacity`.
const перехід = await p.evaluate(async () => {
  const main = document.querySelector('.app-main');
  const вид = () => [...document.querySelectorAll('[id^="page-"]')]
    .filter(e => getComputedStyle(e).display !== 'none').map(e => e.id);
  await new Promise(r => { window.switchTab('community'); setTimeout(r, 700); });
  main.scrollTop = 1500;
  await new Promise(r => setTimeout(r, 150));
  const кадри = []; let стоп = false;
  const писати = () => { кадри.push(вид().length); if (!стоп) requestAnimationFrame(писати); };
  requestAnimationFrame(писати);
  document.querySelector('.tab-item[data-tab="board"]').click();
  await new Promise(r => setTimeout(r, 700)); стоп = true;
  return { кадрів: кадри.length, подвійних: кадри.filter(n => n > 1).length };
});
ok('🔴 при переході НІКОЛИ не видно двох сторінок одночасно',
   перехід.кадрів > 5 && перехід.подвійних === 0,
   `${перехід.подвійних} подвійних кадрів із ${перехід.кадрів}`);

// (2) РІВНІСТЬ ПІДЙОМУ ДОВЕРХУ.
// Вова: «зроби, щоб плавний скрол був максимально плавний… зараз складається
// відчуття перепадами». Кадри не губились — гуляла ДЕЛЬТА на кадр: 2 … 176 … 1.
// Око бачить різницю між сусідніми кадрами, тож міряємо саме її: відношення піку
// до середнього. У easeInOutCubic воно ≈2.75, у синуса — π/2 ≈ 1.57.
// ⚠️ Поріг 1.9, а не 1.6: у стенді трапляється зайвий кадр на межі, і надто вузький
//    поріг зробив би сторожа хитким. 1.9 усе одно ловить повернення кубічної кривої.
const плавність = await p.evaluate(async () => {
  const main = document.querySelector('.app-main');
  main.scrollTop = 1600;
  await new Promise(r => setTimeout(r, 150));
  const точки = []; let стоп = false;
  const писати = () => { точки.push(main.scrollTop); if (!стоп) requestAnimationFrame(писати); };
  requestAnimationFrame(писати);
  document.querySelector('.tab-item[data-tab="board"]').click();
  await new Promise(r => setTimeout(r, 1400)); стоп = true;
  const д = [];
  for (let i = 1; i < точки.length; i++) { const x = точки[i - 1] - точки[i]; if (x > 0.5) д.push(x); }
  if (!д.length) return null;
  const сер = д.reduce((a, c) => a + c, 0) / д.length;
  return { пік: Math.round(Math.max(...д)), середнє: Math.round(сер), кадрів: д.length,
           відношення: +(Math.max(...д) / сер).toFixed(2) };
});
ok('сцена: підйом доверху справді відбувся', !!плавність && плавність.кадрів > 10,
   плавність ? `${плавність.кадрів} рухомих кадрів` : 'руху не було');
if (плавність) {
  ok('🔴 дельта на кадр рівна: пік не більший за середнє в 1.9 раза',
     плавність.відношення <= 1.9,
     `пік ${плавність.пік}px · середнє ${плавність.середнє}px · відношення ${плавність.відношення}`);
  ok('🔴 жоден кадр не перестрибує 100px (пʼята частина екрана)',
     плавність.пік <= 100, `${плавність.пік}px`);
}

// (3) РЯД СПІЛЬНОТ У «СТРІЧЦІ» ЇДЕ РАЗОМ ЗІ СТОРІНКОЮ.
// Вова: «зробимо так, щоб верхній блок з іконками спільнот у стрічці скролився разом
// зі сторінкою… логіку таку саму, як в інстаграмі, тільки без історій поки».
// ⚠️ Міряємо РУХ, а не `position: static`. Значення властивості можна лишити
//    правильним і однаково приліпити бар чимось іншим (батьківський sticky, fixed
//    у медіа-запиті). Рухається чи ні — це те, що бачить людина.
// ⚠️ У моку стрічка порожня, тож прокручувати нема що: висоту додаємо в СПИСОК
//    ПОСТІВ, тобто туди ж, куди її дав би справжній контент, а не в сам бар.
const стрічка = await p.evaluate(async () => {
  await new Promise(r => { window.switchTab('shotam'); setTimeout(r, 1500); });
  const main = document.querySelector('.app-main');
  const bar = document.querySelector('#page-shotam .fd-topbar');
  if (!bar) return null;
  const список = document.querySelector('#page-shotam .fd-list') || bar.parentElement;
  const filler = document.createElement('div');
  filler.style.height = '1600px';
  список.appendChild(filler);
  await new Promise(r => setTimeout(r, 120));
  main.scrollTop = 0; await new Promise(r => setTimeout(r, 120));
  const до = bar.getBoundingClientRect().top;
  main.scrollTop = 400; await new Promise(r => setTimeout(r, 200));
  const після = bar.getBoundingClientRect().top;
  filler.remove();
  return { поїхав: Math.round(до - після), позиція: getComputedStyle(bar).position };
});
ok('сцена: «Стрічка» відкрилась і ряд спільнот на місці', !!стрічка,
   стрічка ? `position: ${стрічка.позиція}` : 'топбару немає');
if (стрічка) {
  ok('🔴 ряд спільнот їде разом зі сторінкою (не липне до верху)',
     стрічка.поїхав >= 380, `при прокрутці 400px бар поїхав на ${стрічка.поїхав}px`);
}

await ctx.close(); await b.close(); await stop();
done();
