// Стенд №31: ЗАСЛІНКА РОЗРОБКИ СПРАВДІ ЗАМИКАЄ ДОДАТОК.
//
// Вова 30.07: «щоб коли інші користувачі відкривають додаток, їм вибивало що додаток
// знаходиться в процесі розробки… щоб він більше нікому не був доступний, поки я не
// скажу це зробити».
//
// 🔴 ЩО САМЕ МІРЯЄМО (урок 27.07 — критерій має міряти НАСЛІДОК, а не форму запису).
// Не «чи є в коді слово DEV_LOCK» і не «чи існує клас .dev-lock у CSS», а три наслідки
// на живому застосунку:
//   1. чужа людина бачить заслінку — і застосунок під нею НЕ побудований
//      (це важливіше за саму заслінку: намалювати накривало і зібрати під ним
//       робочий застосунок — рівно та помилка, яку легко зробити);
//   2. КОНТРОЛЬ: на localhost замок не діє — інакше цей стенд «доводив» би замок,
//      навіть якби той просто ламав завантаження всім і завжди;
//   3. підтверджений пристрій проходить (прапорець у localStorage) — без цього
//      Вова замкнув би сам себе, коли телефон без інтернету.
//
// ⚠️ ЧОМУ ТУТ ПІДМІНА ДОМЕНУ. Замок свідомо не діє на localhost/127.0.0.1 (пояснення —
// у шапці `src/core/dev-lock.js`). Тобто на звичайній адресі стенда перевірити
// ЗАМКНЕНИЙ стан неможливо. Тому Chromium запускається з `--host-resolver-rules`,
// який вішає вигадане імʼя `cstl.local` на 127.0.0.1: сервер той самий, а
// `location.hostname` уже НЕ localhost — рівно як на GitHub Pages.
//
// ⚠️ ЧОГО ЦЕЙ СТЕНД НЕ ПЕРЕВІРЯЄ І ЧОМУ ЧЕСНО ЦЕ СКАЗАТИ: наскрізний вхід СПРАВЖНІМ
// кодом. Стенд не знає коду Вови і не має знати — інакше код лежав би в репозиторії
// поруч зі своїм замком. Тому цей шлях перевіряється окремо і руками:
//   DEV_CODE='код' node tests/dev-lock.mjs        (+3 перевірки, секція 3.6)
//
// 🆕 30.07: двері «пошта власника через Google» ПРИБРАНІ на прохання Вови, тож
// перевірок навколо OAuth тут більше немає — натомість стенд стежить, щоб вони
// не повернулись непоміченими (секція 4).
import { chromium } from 'playwright';
import { chromiumPath, serve, projectFile, reporter } from './_lib.mjs';

const { ok, done } = reporter();

// 🔴 ОДИН МАРКЕР «ЗАСТОСУНОК ПОБУДОВАНИЙ» НА ВЕСЬ СТЕНД (31.07).
// Було ТРИ копії селектора `.cm-news-feed`, і коли той клас видалили разом із
// вкладеним скролером віджета новин, вони зламались ПО-РІЗНОМУ й непомітно:
//   • позитивні перевірки («на localhost застосунок побудований») чесно впали;
//   • негативна («хибний код застосунку НЕ побудував») лишилась ЗЕЛЕНОЮ — бо
//     мертвий селектор завжди дає false, тобто вона проходила з хибної причини
//     і більше не спіймала б справжній регрес;
//   • гілка `DEV_CODE` (ручна перевірка справжнім кодом) падала б завжди.
// Тому маркер один і міряє НАСЛІДОК, а не назву контейнера: «у віджеті новин є
// хоч одна справжня картка статті» — ознака, що init() відпрацював і дані є.
const BUILT_MARKER = '#cm-news-content [data-article-id]';

// Сторож присутності: якщо рубильник колись приберуть або перейменують — стенд
// мусить сказати це прямо, а не мовчки міряти не те.
// 🛑 25.08 — СТЕНД НЕ ВМІВ ПАДАТИ НА СТАРОМУ КОДІ. `projectFile` тут кликався БЕЗ
// ревізії, тобто читав файл із диска завжди — і контрольний прогін
// `BUNDLE_REV=origin/main` лишався ЗЕЛЕНИМ, хоч би що ти в ньому міряв. Це вже
// друга така знахідка за день (перша — правило класу в `feed-auth-race.mjs`).
// ⚠️ ЧЕСНО ПРО МЕЖУ: ревізія міняє лише ЧИТАННЯ ВИХІДНИХ ФАЙЛІВ. Браузерна половина
// стенду піднімає локальний сервер із ПОТОЧНИМ `bundle.js`, і на неї `BUNDLE_REV`
// не впливає — тож контроль доводить статичні інваріанти, а не поведінку в браузері.
const REV = process.env.BUNDLE_REV || '';
const SRC = projectFile('src/core/dev-lock.js', REV);
if (!/export const DEV_LOCK\s*=\s*(true|false)/.test(SRC)) {
  console.log('❌ у core/dev-lock.js немає рубильника `export const DEV_LOCK = true|false`');
  process.exit(1);
}
const LOCK_ON = /export const DEV_LOCK\s*=\s*true/.test(SRC);

const { url, stop } = await serve();
const port = new URL(url).port;

const executablePath = chromiumPath();
const browser = await chromium.launch({
  ...(executablePath ? { executablePath } : {}),
  args: [
    // Вигадане імʼя → 127.0.0.1. Дає НЕ-localhost хост на тому самому сервері.
    `--host-resolver-rules=MAP cstl.local 127.0.0.1`,
    // 🔴 БЕЗ ЦЬОГО РЯДКА КОД НЕ ПЕРЕВІРИТИ, і це не дрібниця стенда.
    // `crypto.subtle` (яким рахується хеш) існує лише у ЗАХИЩЕНОМУ контексті: https
    // або localhost. `http://cstl.local` — ні те, ні інше, тому там хеш не рахується
    // взагалі й замок чесно лишається зачиненим (fail-closed). Прод — https, отже
    // працює; а стенду треба явно сказати вважати цей хост захищеним.
    // ⚠️ Перша версія стенда цього не мала — і «правильний код» падав, хоча код
    // правильний. Симптом виглядав як баг продукту, а був умовами вимірювання.
    // ⚠️ Свого `--user-data-dir` НЕ ставимо: Playwright і так запускає браузер із
    // тимчасовим профілем, а прибитий шлях у стенді — те, від чого відходили в
    // `_lib.mjs` (абсолютні шляхи вбивали стенди на іншій машині/сесії).
    `--unsafely-treat-insecure-origin-as-secure=http://cstl.local:${port}`,
  ],
});

// Одна сцена = один чистий контекст (свій localStorage).
async function visit(host, { deviceFlag = false } = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  // Мережа назовні не потрібна; Supabase глушимо — заслінка мусить працювати
  // і тоді, коли сервер недосяжний (правило «помилка падає в бік замка»).
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.route('**://api.open-meteo.com/**', r => r.abort());
  if (deviceFlag) {
    await page.addInitScript(door => {
      try { localStorage.setItem('cstl_dev_ok', door); } catch (_) {}
    }, deviceFlag);
  }
  await page.goto(`http://${host}:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);        // даємо застосунку шанс побудуватись
  const state = await page.evaluate(M => ({
    gate:      !!document.querySelector('.dev-lock'),
    bodyClass: document.body.classList.contains('dev-locked'),
    gateText:  (document.querySelector('.dev-lock-title') || {}).textContent || '',
    gateBody:  (document.querySelector('.dev-lock-text') || {}).textContent || '',
    hasBtn:    !!document.querySelector('.dev-lock-btn'),
    hasInput:  !!document.querySelector('.dev-lock-input'),
    hasLabel:  /код/i.test((document.querySelector('.dev-lock-label') || {}).textContent || ''),
    // 🔴 Поле коду міряємо ВИДИМІСТЮ, а не наявністю в DOM. Форма лежить у розмітці
    // завжди (їй потрібні свої id і слухачі), і `!!querySelector` сказав би «є» навіть
    // тоді, коли чужа людина не бачить нічого. Саме та підміна форми на наслідок,
    // від якої застерігає урок 27.07.
    inputShown: (() => {
      const i = document.querySelector('.dev-lock-input');
      return !!i && !!i.offsetParent;      // offsetParent === null у прихованого вузла
    })(),
    revealText: (document.querySelector('[data-dl-reveal]') || {}).textContent || '',
    // Двері «пошта власника» прибрані — кнопки Google на екрані бути не може.
    hasGoogle: /google/i.test(document.querySelector('.dev-lock-in') ? document.querySelector('.dev-lock-in').textContent : ''),
    blurred:   (() => {
      const bg = document.querySelector('.dev-lock-bg');
      if (!bg) return 0;
      const m = getComputedStyle(bg).filter.match(/blur\(([\d.]+)px\)/);
      return m ? Number(m[1]) : 0;
    })(),
    // ⬇️ ГОЛОВНЕ: чи побудований застосунок ПІД заслінкою.
    // Беремо ознаки, які зʼявляються тільки з init(): віджети Громади наповнені,
    // і хоча б один блок перестав бути «Завантаження…».
    // ⚠️ 31.07: маркер переїхав у спільну константу BUILT_MARKER — пояснення чому
    // саме такий і що зламалось до цього, лежить біля неї вгорі файлу.
    newsBuilt: !!document.querySelector(M),
    blockBuilt: !!document.querySelector('.cm-contact-row, .cm-contact-chip, .cm-board-note'),
    loading:   document.querySelectorAll('.cm-loading').length,
    splash:    !!document.getElementById('splash'),
  }), BUILT_MARKER);
  await ctx.close();
  return state;
}

// ── 1. ЧУЖА ЛЮДИНА (не localhost) — замкнено ────────────────────────────────
const outsider = await visit('cstl.local');
if (LOCK_ON) {
  ok('чужий хост: заслінка показана', outsider.gate);
  // Заголовок Вова переписав 30.07 у саркастичний бік, і слова «розробки» в ньому
  // більше нема — воно переїхало в підпис. Тому міряємо ДВА вузли: що заголовок
  // непорожній і що людині пояснено, чому її не пускають. Прибити тут точний рядок
  // означало б ламати стенд на кожну правку тексту.
  ok('чужий хост: заголовок є і він непорожній', outsider.gateText.trim().length > 0, `"${outsider.gateText.trim()}"`);
  ok('чужий хост: людині пояснено, що додаток ще закритий',
     /розроб/i.test(outsider.gateText + ' ' + outsider.gateBody), `підпис: "${outsider.gateBody.trim()}"`);
  ok('чужий хост: є кнопка «Увійти»', outsider.hasBtn);
  ok('чужий хост: поле коду існує в розмітці', outsider.hasInput && outsider.hasLabel);
  // 🔴 Замовлення Вови: «код розробника треба якось по-іншому зробити, щоб це знали
  // тільки розробники». Отже поле НЕ мусить бути видно доти, доки не тапнули.
  ok('чужий хост: поле коду СХОВАНЕ до тапу', !outsider.inputShown);
  ok('чужий хост: є тихий вхід для розробників', /розробник/i.test(outsider.revealText), `"${outsider.revealText.trim()}"`);
  ok('чужий хост: входу через Google на екрані НЕМА', !outsider.hasGoogle);
  // Фон розмитий — саме те, що просив Вова («сторінка буде заблюрена»).
  // Міряємо ОБЧИСЛЕНИЙ `filter`, а не наявність класу: клас без blur нічого не дає.
  ok('чужий хост: фон справді розмитий (blur ≥ 8px)', outsider.blurred >= 8, `blur(${outsider.blurred}px)`);
  ok('чужий хост: сторінка під заслінкою не прокручується', outsider.bodyClass);
  // 🔴 Найважливіша перевірка стенда.
  ok('чужий хост: застосунок ПІД заслінкою НЕ побудований (стрічка новин)', !outsider.newsBuilt);
  ok('чужий хост: застосунок ПІД заслінкою НЕ побудований (віджети)', !outsider.blockBuilt);
  ok('чужий хост: заставку прибрано (не висить над заслінкою)', !outsider.splash);
} else {
  ok('рубильник вимкнений (DEV_LOCK=false) → заслінки нема', !outsider.gate);
}

// ── 2. КОНТРОЛЬ: localhost — замок не діє, застосунок будується ──────────────
const local = await visit('127.0.0.1');
ok('КОНТРОЛЬ localhost: заслінки НЕМА', !local.gate);
ok('КОНТРОЛЬ localhost: застосунок побудований', local.newsBuilt,
   'без цього стенд «довів» би замок, навіть якби той просто ламав завантаження всім');

// ── 3. ПІДТВЕРДЖЕНИЙ ПРИСТРІЙ проходить навіть без мережі ───────────────────
// Три значення прапорця: 'code' (зайшли кодом), 'email' (поштою власника) і '1' —
// прапорець ПЕРШОЇ версії заслінки. Третій перевіряємо навмисно: у Вови на телефоні
// він уже може лежати, і якби нова версія його не розуміла, вона замкнула б власника.
for (const door of ['code', 'email', '1']) {
  const trusted = await visit('cstl.local', { deviceFlag: door });
  ok(`підтверджений пристрій (${door}): заслінки нема`, !trusted.gate);
  ok(`підтверджений пристрій (${door}): застосунок побудований`, trusted.newsBuilt,
     'інакше замок замкнув би своїх — без інтернету або після оновлення версії');
}

// ── 3.5 КОД РОЗРОБНИКА: хибний не пускає, гальмо підбору працює ──────────────
// Сцена: чужий хост, вводимо навмисно неправильний код.
{
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.goto(`http://cstl.local:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-dl-reveal]', { timeout: 10000 });
  // Поле сховане — спершу тап по «Вхід для розробників». Заразом це і є перевірка,
  // що тап справді ВІДКРИВАЄ форму: якби не відкривав, `waitForSelector` зі станом
  // `visible` упав би тут, а не десь далі з незрозумілим симптомом.
  await page.click('[data-dl-reveal]');
  await page.waitForSelector('.dev-lock-input', { state: 'visible', timeout: 10000 });
  ok('тап по «Вхід для розробників» відкриває поле коду', true);
  ok('після відкриття форми саме посилання зникає',
     !(await page.locator('[data-dl-reveal]').isVisible()));

  const tryCode = async value => {
    await page.fill('.dev-lock-input', value);
    await page.click('[data-dl-submit]');
    // PBKDF2 з 200 000 повторів — це помітний час, чекаємо на відповідь у примітці.
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-dl-submit]');
      return b && !b.disabled;
    }, { timeout: 15000 }).catch(() => {});
    return page.evaluate(M => ({
      note: (document.querySelector('[data-dl-note]') || {}).textContent || '',
      gate: !!document.querySelector('.dev-lock'),
      built: !!document.querySelector(M),
      tries: (() => { try { return JSON.parse(localStorage.getItem('cstl_dev_tries') || '{}'); } catch { return {}; } })(),
    }), BUILT_MARKER);
  };

  const wrong = await tryCode('очевидно-не-той-код');
  ok('хибний код: заслінка лишається', wrong.gate);
  ok('хибний код: застосунок так і НЕ побудований', !wrong.built);
  ok('хибний код: людині сказано, що код не той', /не той/i.test(wrong.note), `"${wrong.note}"`);
  ok('хибна спроба порахована', (wrong.tries.n || 0) === 1, `n = ${wrong.tries.n}`);

  // Гальмо: після TRIES_FREE=5 хибних спроб мусить зʼявитись пауза.
  let last = wrong;
  for (let i = 0; i < 5; i++) last = await tryCode('знову-не-той-' + i);
  ok('після 6 хибних спроб увімкнулось гальмо (пауза)', (last.tries.until || 0) > Date.now(),
     `n = ${last.tries.n}, пауза до ${last.tries.until ? new Date(last.tries.until).toISOString().slice(11, 19) : '—'}`);
  ok('людині сказано, скільки чекати', /через \d+ с/i.test(last.note), `"${last.note}"`);
  await ctx.close();
}

// ── 3.6 УСПІШНИЙ ВХІД КОДОМ (лише коли код передано в оточенні) ──────────────
// Наскрізну перевірку «правильний код відкриває додаток» стенд НЕ може зробити сам:
// у списку лежить хеш СПРАВЖНЬОГО коду Вови, а самого коду стенд не знає (і не має
// знати — інакше він лежав би в репозиторії). Тому шлях перевіряється так:
//   DEV_CODE='код' node tests/dev-lock.mjs
// Я прогнав це руками з тимчасовим тестовим хешем — доказ у журналі сесії.
if (process.env.DEV_CODE) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await ctx.newPage();
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.goto(`http://cstl.local:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForSelector('[data-dl-reveal]', { timeout: 10000 });
  await page.click('[data-dl-reveal]');                        // поле сховане до тапу
  await page.waitForSelector('.dev-lock-input', { state: 'visible', timeout: 10000 });
  await page.fill('.dev-lock-input', process.env.DEV_CODE);
  await page.click('[data-dl-submit]');
  await page.waitForSelector('.dev-lock', { state: 'detached', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const after = await page.evaluate(M => ({
    gate: !!document.querySelector('.dev-lock'),
    built: !!document.querySelector(M),
    door: localStorage.getItem('cstl_dev_ok'),
  }), BUILT_MARKER);
  ok('правильний код: заслінка зникла', !after.gate);
  ok('правильний код: застосунок побудований', after.built);
  ok('правильний код: пристрій позначений саме як «code»', after.door === 'code', `прапорець = ${after.door}`);
  await ctx.close();
} else {
  console.log('ℹ️  Успішний вхід кодом не перевірявся: запусти `DEV_CODE=\'код\' node tests/dev-lock.mjs`');
}

// ── 4. Список кодів: хеші, а НЕ відкритий код ────────────────────────────────
// ⚠️ Тут раніше перевірявся ще й `ALLOWED_EMAIL_SHA256`. Двері «пошта власника»
// прибрані 30.07 на прохання Вови, тому й перевірка пішла. Натомість доданий
// сторож нижче: якщо список пошт колись повернуть, стенд мусить сказати це вголос,
// а не мовчки лишити мертву перевірку.
ok('двері «пошта власника» справді прибрані з коду', !/ALLOWED_EMAIL_SHA256\s*=/.test(SRC),
   'якщо їх повертають — поверни і перевірки на відкриті адреси в публічному репо');
ok('заслінка більше не тягне Google-вхід', !/signInWithGoogle/.test(SRC));

// У публічному репозиторії мусять лежати лише хеші PBKDF2, і в жодному разі не
// сам код відкритим текстом.
const rawCodes = (SRC.match(/ALLOWED_CODE_PBKDF2\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
// ⚠️ Коментарі з блоку прибираємо ДО підрахунку. Перша версія цієї перевірки цього
// не робила — і впала на порожньому списку, бо порахувала лапки у рядках-підказках
// («// 'a1b2…' ← код»). Тобто міряла не список, а власні коментарі: рівно та
// помилка, від якої застерігає правило «мірку перевіряй так само, як код».
const codeBlock = rawCodes.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
const codeQuoted = codeBlock.match(/'[^']*'/g) || [];
const codeHashes = codeBlock.match(/'[0-9a-f]{64}'/g) || [];
ok('усі записи списку кодів — хеші по 64 hex-символи', codeHashes.length === codeQuoted.length,
   `записів ${codeQuoted.length}, з них правильних хешів ${codeHashes.length}`);
// 🔴 Тепер це критично, а не інформаційно: код — ЄДИНІ двері. Порожній список
// означає, що всередину не зайде ніхто, включно з Вовою на новому пристрої.
ok('список кодів НЕ порожній', codeHashes.length > 0,
   codeHashes.length ? `${codeHashes.length} код(и)` : 'порожній список замкне і Вову — деплоїти не можна');

// ── 4.5 🔴 САМ КОД НЕ НАПИСАНИЙ ПОРУЧ ІЗ ВЛАСНИМ ХЕШЕМ ──────────────────────
// Ця перевірка існує через справжню помилку: разом із хешем я вписав у КОМЕНТАРІЙ і
// сам код відкритим текстом («регістр не має значення, тож …»). Хешування після цього
// не означало нічого — репозиторій публічний. Перевірка №4 цього не бачила, бо
// навмисно ВІДРІЗАЄ коментарі перед підрахунком.
// Тому: беремо кожне слово з коментарів усередині блоку `ALLOWED_CODE_PBKDF2`,
// проганяємо через СПРАВЖНІЙ `devCodeHash` і порівнюємо зі списком. Якщо якесь слово
// дає хеш зі списку — код лежить поруч зі своїм замком, і стенд це кричить.
// ⚠️ Слів тут одиниці, а PBKDF2 повільний (200 000 повторів ≈ 0.15с на слово) —
// саме тому перевіряємо ЛИШЕ цей блок, а не весь файл.
if (codeHashes.length) {
  const words = [...new Set((rawCodes.match(/[^\s'"\/*,;:()«»]{4,}/g) || [])
    .filter(w => !/^[0-9a-f]{64}$/.test(w)))];        // самі хеші не перевіряємо
  const ctx45 = await browser.newContext();
  const pg45 = await ctx45.newPage();
  await pg45.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
  const leaked = await pg45.evaluate(async ([base, list, cands]) => {
    const m = await import(base + '/src/core/dev-code.js');
    const bad = [];
    for (const w of cands) if (list.includes(await m.devCodeHash(w))) bad.push(w);
    return bad;
  }, [url, codeHashes.map(h => h.replace(/'/g, '')), words]);
  await ctx45.close();
  ok('сам код НЕ написаний у коментарях поруч із хешем', leaked.length === 0,
     leaked.length ? `ВІДКРИТИЙ КОД У РЕПОЗИТОРІЇ: ${leaked.join(', ')}` : `перевірено слів: ${words.length}`);
}

// ── 5. 🔴 ПАРАМЕТРИ ХЕША НЕ МОЖНА МІНЯТИ НЕПОМІТНО ───────────────────────────
// Тут раніше звірявся хеш у браузері з хешем у терміналі. Та перевірка стерегла
// СПИСОК ПОШТ, який рахувався `shasum`-ом; пошти прибрані 30.07, і разом з ними
// зникла причина. Лишати її означало б тримати перевірку з мертвим обґрунтуванням.
//
// Натомість стережемо справжню вцілілу небезпеку. Хеш коду в `ALLOWED_CODE_PBKDF2`
// пораховано з КОНКРЕТНОЮ сіллю і КОНКРЕТНОЮ кількістю повторів. Змінить хтось
// `CODE_SALT` або `CODE_ITERATIONS` — усі збережені хеші стають недійсними МОВЧКИ:
// помилки не буде, застосунок просто перестане пускати кого завгодно, а симптом
// виглядатиме як «код правильний, а не заходить». Тепер це падіння стенда.
// ⚠️ Значення прибиті навмисно: у цьому й сенс сторожа. Міняєш параметр — мусиш
// перерахувати хеші (`node tests/tools/dev-code-hash.mjs`) і оновити рядок тут.
const EXPECTED_SALT = 'cstl-dev-lock-2026-07';
const EXPECTED_ITER = 200000;
const ctx5 = await browser.newContext();
const pg5 = await ctx5.newPage();
await pg5.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
const params = await pg5.evaluate(async base => {
  const m = await import(base + '/src/core/dev-code.js');
  return {
    salt: m.CODE_SALT,
    iter: m.CODE_ITERATIONS,
    // Контроль самої мірки: нормалізація мусить зводити регістр і зайві пробіли.
    // Якщо вона зламається, «правильний код» перестане збігатись — і без цього
    // рядка стенд шукав би причину в чому завгодно, крім неї.
    norm: m.normalizeDevCode('  ДВА   Слова  '),
    hashLooksRight: /^[0-9a-f]{64}$/.test(await m.devCodeHash('контрольний-рядок') || ''),
  };
}, url);
await ctx5.close();
ok('сіль хеша не змінена', params.salt === EXPECTED_SALT, `${params.salt}`);
ok('кількість повторів PBKDF2 не змінена', params.iter === EXPECTED_ITER, `${params.iter}`);
ok('нормалізація коду працює (регістр + зайві пробіли)', params.norm === 'два слова', `"${params.norm}"`);
ok('хеш має вигляд 64 hex-символи в нижньому регістрі', params.hashLooksRight);

// ── 🔴 «НЕ МОЖУ ПЕРЕВІРИТИ» ≠ «КОД НЕ ТОЙ» (25.08) ───────────────────────────
//
// Скарга Вови зі знімком: «як так що з тел версії підходить код, а з компʼютера ні».
// Код був ПРАВИЛЬНИЙ. Сайт відкрито по `http://`, а `crypto.subtle` існує лише в
// захищеному контексті — отже хеш не рахувався взагалі. Замок писав «Код не той»
// І нараховував хибну спробу, тож після пʼяти таких видавав паузу 60 секунд людині,
// яка жодного разу не помилилась.
//
// 🛑 Міряємо ТРИ речі окремо, бо ламаються вони незалежно:
const DC = projectFile('src/core/dev-code.js', REV);
ok('є окрема відповідь на «чи браузер може перевірити код»',
   /export function devCryptoReady\(\)/.test(DC));
ok('сам хеш спирається на ту саму відповідь (одне місце правди)',
   /if \(!devCryptoReady\(\)\) return null;/.test(DC));

// 🔑 Головне: вихід мусить стояти ДО нарахування хибної спроби. Інакше повідомлення
// полагоджене, а покарання лишилось — тобто половина вади на місці.
const submit = (SRC.match(/async function onSubmitCode\([\s\S]*?\n\}/) || [''])[0];
const позиціяВиходу = submit.search(/\n\s+if \(!devCryptoReady\(\)\) \{/);
const позиціяКари   = submit.search(/\n\s+const pause = noteWrongTry\(\);/);
ok('незахищене зʼєднання НЕ рахується як хибна спроба',
   позиціяВиходу >= 0 && позиціяКари > позиціяВиходу,
   submit ? `вихід ${позиціяВиходу}, кара ${позиціяКари}` : 'обробник не знайдено');
ok('людина дізнається СПРАВЖНЮ причину, а не «код не той»',
   /https:\/\//.test(submit) && /не може перевірити код/.test(submit));
// І та сама причина названа ОДРАЗУ при відкритті заслінки, а не лише після невдачі.
const gate = (SRC.match(/function showGate\(\)[\s\S]*?\n\}/) || [''])[0];
ok('причину видно ще до першої спроби', /devCryptoReady\(\)/.test(gate));
// 🛑 КОНТРОЛЬ: замок НЕ послаблено — без криптографії доступу так само немає.
ok('КОНТРОЛЬ: без криптографії замок лишається зачиненим',
   !/devCryptoReady\(\)[\s\S]{0,80}unlock\(/.test(SRC));

await browser.close();
await stop();
done();
