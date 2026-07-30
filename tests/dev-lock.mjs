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
// ⚠️ ЧОГО ЦЕЙ СТЕНД НЕ ПЕРЕВІРЯЄ І ЧОМУ ЧЕСНО ЦЕ СКАЗАТИ: справжній вхід через Google
// (OAuth) з пісочниці недосяжний — там чужий домен і жива сесія. Тобто «пошта зі
// списку відкриває додаток» доводиться лише шляхом device-прапорця (перевірка 3) плюс
// окремою перевіркою самої функції хешування. Живий вхід двома акаунтами — за Вовою
// на iPhone.
import { chromium } from 'playwright';
import { createHash } from 'crypto';
import { chromiumPath, serve, projectFile, reporter } from './_lib.mjs';

const { ok, done } = reporter();

// Сторож присутності: якщо рубильник колись приберуть або перейменують — стенд
// мусить сказати це прямо, а не мовчки міряти не те.
const SRC = projectFile('src/core/dev-lock.js');
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
  const state = await page.evaluate(() => ({
    gate:      !!document.querySelector('.dev-lock'),
    bodyClass: document.body.classList.contains('dev-locked'),
    gateText:  (document.querySelector('.dev-lock-title') || {}).textContent || '',
    hasBtn:    !!document.querySelector('.dev-lock-btn'),
    hasInput:  !!document.querySelector('.dev-lock-input'),
    hasLabel:  /код/i.test((document.querySelector('.dev-lock-label') || {}).textContent || ''),
    hasOwnerLink: !!document.querySelector('.dev-lock-link'),
    blurred:   (() => {
      const bg = document.querySelector('.dev-lock-bg');
      if (!bg) return 0;
      const m = getComputedStyle(bg).filter.match(/blur\(([\d.]+)px\)/);
      return m ? Number(m[1]) : 0;
    })(),
    // ⬇️ ГОЛОВНЕ: чи побудований застосунок ПІД заслінкою.
    // Беремо ознаки, які зʼявляються тільки з init(): віджети Громади наповнені,
    // і хоча б один блок перестав бути «Завантаження…».
    newsBuilt: !!document.querySelector('.cm-news-feed'),
    blockBuilt: !!document.querySelector('.cm-contact-row, .cm-contact-chip, .cm-board-note'),
    loading:   document.querySelectorAll('.cm-loading').length,
    splash:    !!document.getElementById('splash'),
  }));
  await ctx.close();
  return state;
}

// ── 1. ЧУЖА ЛЮДИНА (не localhost) — замкнено ────────────────────────────────
const outsider = await visit('cstl.local');
if (LOCK_ON) {
  ok('чужий хост: заслінка показана', outsider.gate);
  ok('чужий хост: заголовок «йдуть технічні розробки»', /розроб/i.test(outsider.gateText), `текст: "${outsider.gateText}"`);
  ok('чужий хост: є кнопка «Увійти»', outsider.hasBtn);
  ok('чужий хост: є поле коду розробника', outsider.hasInput && outsider.hasLabel);
  ok('чужий хост: є запасний вхід для власника', outsider.hasOwnerLink);
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
  await page.waitForSelector('.dev-lock-input', { timeout: 10000 });

  const tryCode = async value => {
    await page.fill('.dev-lock-input', value);
    await page.click('[data-dl-submit]');
    // PBKDF2 з 200 000 повторів — це помітний час, чекаємо на відповідь у примітці.
    await page.waitForFunction(() => {
      const b = document.querySelector('[data-dl-submit]');
      return b && !b.disabled;
    }, { timeout: 15000 }).catch(() => {});
    return page.evaluate(() => ({
      note: (document.querySelector('[data-dl-note]') || {}).textContent || '',
      gate: !!document.querySelector('.dev-lock'),
      built: !!document.querySelector('.cm-news-feed'),
      tries: (() => { try { return JSON.parse(localStorage.getItem('cstl_dev_tries') || '{}'); } catch { return {}; } })(),
    }));
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
  await page.waitForSelector('.dev-lock-input', { timeout: 10000 });
  await page.fill('.dev-lock-input', process.env.DEV_CODE);
  await page.click('[data-dl-submit]');
  await page.waitForSelector('.dev-lock', { state: 'detached', timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(2500);
  const after = await page.evaluate(() => ({
    gate: !!document.querySelector('.dev-lock'),
    built: !!document.querySelector('.cm-news-feed'),
    door: localStorage.getItem('cstl_dev_ok'),
  }));
  ok('правильний код: заслінка зникла', !after.gate);
  ok('правильний код: застосунок побудований', after.built);
  ok('правильний код: пристрій позначений саме як «code»', after.door === 'code', `прапорець = ${after.door}`);
  await ctx.close();
} else {
  console.log('ℹ️  Успішний вхід кодом не перевірявся: запусти `DEV_CODE=\'код\' node tests/dev-lock.mjs`');
}

// ── 4. Список допущених: хеші, а НЕ відкриті пошти ───────────────────────────
// Репозиторій публічний. Якщо колись хтось впише адресу текстом — стенд упаде.
const rawBlock = (SRC.match(/ALLOWED_EMAIL_SHA256\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
// ⚠️ Коментарі з блоку прибираємо ДО підрахунку. Перша версія цієї перевірки цього
// не робила — і впала на порожньому списку, бо порахувала лапки у рядках-підказках
// («// 'a1b2…' ← головна пошта»). Тобто міряла не список, а власні коментарі: рівно
// та помилка, від якої застерігає правило «мірку перевіряй так само, як код».
const listBlock = rawBlock.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
ok('у списку допущених немає відкритих пошт (лише хеші)', !/@/.test(listBlock),
   listBlock.includes('@') ? 'знайдено «@» — це відкрита адреса в публічному репозиторії' : 'чисто');
const quoted = listBlock.match(/'[^']*'/g) || [];
const hashes = listBlock.match(/'[0-9a-f]{64}'/g) || [];
ok('усі записи списку — хеші по 64 hex-символи', hashes.length === quoted.length,
   `записів ${quoted.length}, з них правильних хешів ${hashes.length}`);
ok('список допущених НЕ порожній', hashes.length > 0,
   hashes.length ? `${hashes.length} допущені пошти` : 'порожній список замкне і Вову теж — деплоїти не можна');

// Той самий контроль для СПИСКУ КОДІВ: у публічному репозиторії мусять лежати
// лише хеші PBKDF2, і в жодному разі не сам код відкритим текстом.
const rawCodes = (SRC.match(/ALLOWED_CODE_PBKDF2\s*=\s*\[([\s\S]*?)\]/) || [])[1] || '';
const codeBlock = rawCodes.split('\n').map(l => l.replace(/\/\/.*$/, '')).join('\n');
const codeQuoted = codeBlock.match(/'[^']*'/g) || [];
const codeHashes = codeBlock.match(/'[0-9a-f]{64}'/g) || [];
ok('усі записи списку кодів — хеші по 64 hex-символи', codeHashes.length === codeQuoted.length,
   `записів ${codeQuoted.length}, з них правильних хешів ${codeHashes.length}`);
if (!codeHashes.length) {
  console.log('⚠️  СПИСОК КОДІВ ПОРОЖНІЙ — двері «код» зачинені, працює лише пошта власника.');
  console.log('   Порадити хеш: node tests/tools/dev-code-hash.mjs \'код\'');
}

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

// ── 5. 🔴 БРАУЗЕР І ТЕРМІНАЛ МУСЯТЬ ДАВАТИ ОДИН І ТОЙ САМИЙ ХЕШ ──────────────
// Це остання неперевірена ланка замка. Хеші у списку я порахував у терміналі
// (`sha256sum`), а перевіряє їх БРАУЗЕР (`crypto.subtle.digest`). Якби ці два
// шляхи розійшлись хоч на кодуванні тексту чи регістрі hex — список ніколи б не
// збігся, і замок не пустив би самого Вову. Симптом виглядав би як «увійшов, а
// пише що пошти немає в списку», тобто найгірший з можливих.
//
// ⚠️ Навмисно на НЕЙТРАЛЬНОМУ прикладі, а не на справжніх поштах: збіг алгоритму
// не залежить від тексту, а справжні адреси в публічному репозиторії — саме те,
// чого ми уникали хешуванням.
const SAMPLE = 'test@example.com';
const NODE_HASH = createHash('sha256').update(SAMPLE, 'utf8').digest('hex');
const ctx5 = await browser.newContext();
const pg5 = await ctx5.newPage();
await pg5.goto(`http://127.0.0.1:${port}/`, { waitUntil: 'domcontentloaded' });
const browserHash = await pg5.evaluate(async s => {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
  return [...new Uint8Array(buf)].map(b => b.toString(16).padStart(2, '0')).join('');
}, SAMPLE);
await ctx5.close();
ok('хеш у браузері = хеш у терміналі (той самий алгоритм і кодування)',
   browserHash === NODE_HASH, `${browserHash.slice(0, 16)}… vs ${NODE_HASH.slice(0, 16)}…`);
ok('хеш має вигляд 64 hex-символи в нижньому регістрі', /^[0-9a-f]{64}$/.test(browserHash));

await browser.close();
await stop();
done();
