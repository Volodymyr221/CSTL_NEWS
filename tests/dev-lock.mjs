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
  // Вигадане імʼя → 127.0.0.1. Дає НЕ-localhost хост на тому самому сервері.
  args: [`--host-resolver-rules=MAP cstl.local 127.0.0.1`],
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
    await page.addInitScript(() => { try { localStorage.setItem('cstl_dev_ok', '1'); } catch (_) {} });
  }
  await page.goto(`http://${host}:${port}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);        // даємо застосунку шанс побудуватись
  const state = await page.evaluate(() => ({
    gate:      !!document.querySelector('.dev-lock'),
    bodyClass: document.body.classList.contains('dev-locked'),
    gateText:  (document.querySelector('.dev-lock-title') || {}).textContent || '',
    hasBtn:    !!document.querySelector('.dev-lock-btn'),
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
  ok('чужий хост: заголовок «Додаток у розробці»', /розробц/i.test(outsider.gateText), `текст: "${outsider.gateText}"`);
  ok('чужий хост: є кнопка «Увійти»', outsider.hasBtn);
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
const trusted = await visit('cstl.local', { deviceFlag: true });
ok('підтверджений пристрій: заслінки нема', !trusted.gate);
ok('підтверджений пристрій: застосунок побудований', trusted.newsBuilt,
   'інакше Вова замкнув би сам себе, коли телефон без інтернету');

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
// Порожній список = не пускає НІКОГО, включно з Вовою. Це не помилка стенда, а
// сигнал «ще не налаштовано» — тому попередження, а не падіння.
if (!hashes.length) console.log('⚠️  СПИСОК ДОПУЩЕНИХ ПОРОЖНІЙ — перед деплоєм вписати хеші пошт Вови, інакше замкне і його');

await browser.close();
await stop();
done();
