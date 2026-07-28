// Стенд №15: ТОЧКОВЕ ОНОВЛЕННЯ ПОСТА НЕ ЗСУВАЄ ЕКРАН.
//
// Скарга Вови 27.07: «після редагування або закріплення стрічка перезавантажується,
// блимає і кидає на самий верх — пост доводиться шукати заново».
//
// 🔴 ЩО САМЕ МІРЯЄМО (урок 27.07: критерій має міряти те, що ПОБАЧИТЬ ВОВА).
// Не «чи викликався renderFeed» і не форму запису коду, а ЗСУВ У ПІКСЕЛЯХ тієї картки,
// на яку людина зараз дивиться. Нуль пікселів = екран не поїхав.
//
// Кожна перевірка має ПАРУ: те саме без якоря (контроль). Якщо контроль теж дає нуль —
// значить стенд не міряє нічого, і зелене світло нічого не варте.
//
// 🔴 ПЕРША ВЕРСІЯ ЦЬОГО СТЕНДА ЗБРЕХАЛА — і це важливо запам'ятати.
// Контроль (рух БЕЗ якоря) давав нуль зсуву, тобто «проблеми не існує». Причина:
// у Chromium є ВЛАСНИЙ вбудований якір прокрутки (`overflow-anchor`, увімкнений за
// замовчуванням) — він сам компенсував зміну висоти. У Safari (а це і є iPhone Вови)
// `overflow-anchor` НЕ реалізовано взагалі. Тобто стенд міряв поведінку браузера,
// якого у Вови нема, і «доводив» відсутність бага, який він бачить на екрані.
// Тому нижче в списку стоїть `overflow-anchor: none` — це не хитрість, а приведення
// стенда до умов iPhone. Заразом воно й пояснює, ЧОМУ свій якір узагалі потрібен.
//
// ⚠️ Ганяємо СПРАВЖНІЙ `keepScroll` — текстом витягнутий із src/tabs/feed.js.
import { chromium } from 'playwright';
import { launch, projectFile, reporter } from './_lib.mjs';

// Механізм живе у СПІЛЬНОМУ модулі (ним користуються і «Стрічка», і Дошка).
// Знімаємо `export` — і весь модуль можна виконати як звичайний код усередині браузера.
const SRC = projectFile('src/tabs/feed.js');
const KEEP_SCROLL = projectFile('src/core/list-patch.js').replace(/^export /gm, '');
if (!KEEP_SCROLL.includes('function keepScroll')) {
  console.log('❌ не знайшов keepScroll у core/list-patch.js'); process.exit(1);
}

const { ok, done } = reporter();

// Список із 14 карток різної висоти — як справжня стрічка (є короткі, є з фото).
const PAGE = `<!doctype html><html><head><meta charset="utf-8"><style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  /* overflow-anchor:none — умови Safari/iPhone (див. шапку файлу). */
  #sc{height:600px;overflow-y:auto;overflow-anchor:none;background:#eee}
  article{background:#fff;margin:0 0 8px;padding:8px;font:14px/1.4 sans-serif}
</style></head><body>
  <div id="sc">${Array.from({ length: 14 }, (_, i) =>
    `<article data-post="${i + 1}" style="height:${180 + (i % 4) * 90}px">пост ${i + 1}</article>`).join('')}</div>
</body></html>`;

const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 700 } });
await page.setContent(PAGE);

// Один прогін сценарію. anchorDrift — на скільки пікселів поїхала картка, яку видно.
// withAnchor=false — той самий рух без keepScroll (контроль).
const run = (name, withAnchor) => page.evaluate(({ name, withAnchor, src }) => {
  const keepScroll = new Function(src + '\nreturn keepScroll;')();
  const sc = document.getElementById('sc');

  // Повертаємо список у вихідний стан перед кожним прогоном — інакше сценарії
  // тягли б наслідки один одного і числа означали б казна-що.
  sc.innerHTML = Array.from({ length: 14 }, (_, i) =>
    `<article data-post="${i + 1}" style="height:${180 + (i % 4) * 90}px">пост ${i + 1}</article>`).join('');
  sc.scrollTop = 1200;

  const top = () => sc.getBoundingClientRect().top;
  // Картка, яку людина зараз бачить угорі екрана — та сама, що її обирає якір.
  const visible = [...sc.querySelectorAll('[data-post]')].find(c => c.getBoundingClientRect().bottom > top() + 1);
  const watchId = visible.dataset.post;
  const posOf = id => {
    const el = sc.querySelector(`[data-post="${id}"]`);
    return el ? el.getBoundingClientRect().top - top() : null;
  };
  const before = posOf(watchId);
  const scrollBefore = sc.scrollTop;

  // Мутація: над видимою областю (щоб зсув взагалі був можливий).
  const mutate = {
    // порожня дія — шумовий поріг
    noop: () => {},
    // редагування: текст поста ВИЩЕ по списку став на 200px довшим
    edit: () => { sc.querySelector('[data-post="2"]').style.height = '420px'; },
    // закріплення: картка знизу переїхала на початок списку
    pin: () => { const n = sc.querySelector('[data-post="12"]'); sc.insertBefore(n, sc.firstElementChild); },
    // видалення картки вище по списку
    del: () => { sc.querySelector('[data-post="3"]').remove(); },
  }[name];

  const skip = name === 'pin' ? '12' : (name === 'del' ? '3' : null);
  if (withAnchor) keepScroll(sc, mutate, skip); else mutate();

  return { drift: Math.round((posOf(watchId) ?? 0) - before), scrollBefore, scrollAfter: sc.scrollTop,
           gone: posOf(watchId) === null };
}, { name, withAnchor, src: KEEP_SCROLL });

// 1. ШУМОВИЙ ПОРІГ — спершу міряємо порівняння стану З САМИМ СОБОЮ.
// Якщо тут не нуль, усі наступні числа нічого не означають.
const noop = await run('noop', true);
ok('шумовий поріг: порожня зміна не рухає екран', noop.drift === 0, `дрейф ${noop.drift}px`);

// 2. РЕДАГУВАННЯ поста, що стоїть ВИЩЕ по списку (текст став довшим на 200px).
const editOn  = await run('edit', true);
const editOff = await run('edit', false);
ok('редагування: картка під пальцем не зсувається', editOn.drift === 0, `дрейф ${editOn.drift}px`);
ok('   контроль — без якоря зсув справді є', editOff.drift !== 0, `дрейф ${editOff.drift}px`);

// 3. ЗАКРІПЛЕННЯ: пост знизу переїхав на початок списку.
const pinOn  = await run('pin', true);
const pinOff = await run('pin', false);
ok('закріплення: екран лишається на місці', pinOn.drift === 0, `дрейф ${pinOn.drift}px`);
ok('   контроль — без якоря зсув справді є', pinOff.drift !== 0, `дрейф ${pinOff.drift}px`);

// 4. ВИДАЛЕННЯ картки вище по списку.
const delOn  = await run('del', true);
const delOff = await run('del', false);
ok('видалення: екран лишається на місці', delOn.drift === 0, `дрейф ${delOn.drift}px`);
ok('   контроль — без якоря зсув справді є', delOff.drift !== 0, `дрейф ${delOff.drift}px`);

// 5. СИМПТОМ ВОВИ ДОСЛІВНО: «кидає на самий верх».
// Так було тому, що екран спільноти після кожної дії ЗНОСИВСЯ і будувався заново —
// а новий контейнер починає прокрутку з нуля за визначенням, хоч би що ми міряли.
const rebuilt = await page.evaluate(() => {
  const sc = document.getElementById('sc');
  sc.scrollTop = 1200;
  const was = sc.scrollTop;
  const fresh = sc.cloneNode(true);          // «переоткриття екрана»: новий вузол з тим самим вмістом
  sc.replaceWith(fresh); fresh.id = 'sc';
  return { was, now: fresh.scrollTop };
});
ok('стара поведінка (екран будувався заново) справді кидала на початок',
   rebuilt.was > 0 && rebuilt.now === 0, `було ${rebuilt.was} → стало ${rebuilt.now}`);

// 6. ДРУГА ПОЛОВИНА СКАРГИ — «блимає». Блимало тому, що повна перемальовка
// (`innerHTML = …`) знищує ВСІ вузли разом з картинками і створює їх наново.
// Точковий патч чіпає рівно один. Міряємо, скільки карток пережило дію.
const alive = await page.evaluate(() => {
  const sc = document.getElementById('sc');
  const snap = () => [...sc.querySelectorAll('[data-post]')];
  const build = () => { sc.innerHTML = Array.from({ length: 14 }, (_, i) =>
    `<article data-post="${i + 1}" style="height:${180 + (i % 4) * 90}px">пост ${i + 1}</article>`).join(''); };

  build();
  const beforeFull = snap();
  build();                                            // повний рендер
  const survivedFull = beforeFull.filter(n => n.isConnected).length;

  build();
  const beforePatch = snap();
  const one = sc.querySelector('[data-post="5"]');    // точковий патч однієї картки
  const node = document.createElement('article');
  node.dataset.post = '5'; node.style.height = '200px'; node.textContent = 'пост 5 (оновлено)';
  one.replaceWith(node);
  const survivedPatch = beforePatch.filter(n => n.isConnected).length;

  return { survivedFull, survivedPatch, total: beforePatch.length };
});
ok('повний рендер перестворював УСІ картки (звідси блимання)',
   alive.survivedFull === 0, `вціліло ${alive.survivedFull} з ${alive.total}`);
ok('точковий патч чіпає рівно одну картку',
   alive.survivedPatch === alive.total - 1, `вціліло ${alive.survivedPatch} з ${alive.total}`);

// 6. Якір не «губить» картку: після всіх дій та сама картка досі в списку.
ok('картка під пальцем нікуди не зникла', !editOn.gone && !pinOn.gone && !delOn.gone);

// ── ВІДКРІПЛЕННЯ: чому тут якоря МАЛО ────────────────────────────────────────────
// Вова 27.07: «при відкріпленні воно стрибає доверху». Заміряно: коли картка йде ЗГОРИ,
// компенсувати нема чим — контенту над людиною фізично меншає, і прокрутка впирається
// в нуль. Тому картка тепер СКЛАДАЄТЬСЯ за 260мс: список сідає на очах, а не ривком.
const LEAVE = KEEP_SCROLL;   // той самий модуль: там і якір, і згортання картки

const unpin = await page.evaluate(async ({ leave }) => {
  const { collapseCard, cardVisible, CARD_LEAVE_MS } =
    new Function(leave + '\nreturn { collapseCard: collapseNode, cardVisible: isNodeVisible, CARD_LEAVE_MS };')();
  const sc = document.getElementById('sc');
  const H = [520, 300, 380, 260, 340, 300, 420, 280];
  const build = () => { sc.innerHTML = H.map((h, i) =>
    `<article data-post="${i + 1}" style="height:${h}px">пост ${i + 1}</article>`).join(''); };
  const top = () => sc.getBoundingClientRect().top;
  const posOf = id => sc.querySelector(`[data-post="${id}"]`).getBoundingClientRect().top - top();
  const frame = () => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

  // Умови Вови: закріплений пост зверху (520px), людина трохи прокрутила (200px).
  // Відкріплюємо — картка має поїхати на своє місце за датою (пʼятою).
  const setup = () => { build(); sc.scrollTop = 200; };
  const moveDown = () => sc.insertBefore(sc.querySelector('[data-post="1"]'), sc.children[5]);

  // а) СТАРА поведінка — миттєва перестановка.
  setup();
  const beforeA = posOf('2');
  moveDown();
  const instant = Math.round(posOf('2') - beforeA);

  // б) НОВА — картка складається.
  //
  // 🔴 ТРЕТЯ РЕДАКЦІЯ ЦІЄЇ ПЕРЕВІРКИ. Дві попередні міряли рух ВИБІРКОЮ ПО КАДРАХ
  // («пікселів за кадр», потім «пікселів за мілісекунду») — і обидві виявились
  // крихкими: у headless-браузері під навантаженням (17 стендів поспіль) кадри
  // просто не приходять, уся анімація лягає між двома вимірами, і плавний рух
  // виглядає як стрибок 36.9 px/мс. Тест падав, хоча код був незмінний.
  //
  // Тому міряємо не «як швидко», а ДЕТЕРМІНОВАНІ факти, які не залежать від кадрів:
  //   • одразу після дії картка ЩЕ на місці (нічого не перескочило);
  //   • на висоті стоїть перехід потрібної тривалості (звідки й береться плавність);
  //   • перестановка стається ЛИШЕ після цього часу, а не в тому ж кадрі.
  // Разом це і є «рух розтягнутий у часі», тобто протилежність ривка.
  setup();
  const visible = cardVisible(sc.querySelector('[data-post="1"]'), sc);
  const beforeB = posOf('2');
  const card = sc.querySelector('[data-post="1"]');
  let placed = false, placedAt = 0;
  const startedAt = performance.now();
  collapseCard(card, () => { moveDown(); placed = true; placedAt = performance.now(); });

  await frame();                                   // дати перехіду стартувати
  const stillThere = [...sc.children].indexOf(card) === 0;   // картка ще зверху
  const cs = getComputedStyle(card);
  const transMs = Math.round((parseFloat(cs.transitionDuration) || 0) * 1000);
  const midShift = Math.round(posOf('2') - beforeB);

  await new Promise(r => setTimeout(r, CARD_LEAVE_MS + 250));
  const settled = Math.round(posOf('2') - beforeB);
  const newIndex = [...sc.children].indexOf(sc.querySelector('[data-post="1"]'));
  const took = Math.round(placedAt - startedAt);

  return { instant, stillThere, transMs, midShift, settled, placed, took, visible,
           newIndex, ms: CARD_LEAVE_MS };
}, { leave: LEAVE });

ok('картку зверху видно (умова, за якої вмикається згортання)', unpin.visible);
ok('стара поведінка: увесь зсув за ОДИН кадр (це і є «стрибок»)', unpin.instant !== 0,
   `${unpin.instant}px одним кроком`);
// Нова поведінка — три детерміновані факти замість крихкої вибірки по кадрах.
ok('нова: одразу після дії картка ЩЕ на місці (нічого не перескочило)', unpin.stillThere,
   `зсув на старті ${unpin.midShift}px`);
ok('нова: на висоту картки поставлено перехід потрібної тривалості',
   unpin.transMs === unpin.ms, `${unpin.transMs}мс (очікуємо ${unpin.ms})`);
ok('нова: перестановка стається ЛИШЕ після анімації, а не в тому ж кадрі',
   unpin.placed && unpin.took >= unpin.ms, `через ${unpin.took}мс`);
ok('наприкінці список усе одно сідає (рух відбувся)', unpin.settled !== 0,
   `${unpin.settled}px разом`);
ok('після згортання картка стоїть на новому місці', unpin.placed && unpin.newIndex > 0,
   `індекс ${unpin.newIndex}`);

await browser.close();
done();
