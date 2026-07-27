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

const SRC = projectFile('src/tabs/feed.js');
const from = SRC.indexOf('function keepScroll');
const to   = SRC.indexOf('// Зібрати DOM-вузол картки');
if (from < 0 || to < 0 || to < from) { console.log('❌ не знайшов keepScroll у feed.js'); process.exit(1); }
const KEEP_SCROLL = SRC.slice(from, to);

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

await browser.close();
done();
