// Стенд: ГУМКА НА ГРОМАДІ РУХАЄ ЗОНУ, АЛЕ НЕ ЧІПАЄ БОРДОВУ ШАПКУ.
//
// 🔴 ЗАМОВЛЕННЯ ВОВИ (10.08, дослівно): «треба щоб при скролі "натягування"
// вверх верхній бордовий блок з привітанням та погодою не відривався, тільки
// від початку скляних віджетів… гумовий ефект має починатись від скляних
// міні-віджетів до телефонів громади».
//
// 🔑 ЧОМУ ВЗАГАЛІ ПОТРІБЕН ВЛАСНИЙ ВІДСКОК: рідний зсуває ВЕСЬ вміст
// прокрутника, виключити з нього одну дитину неможливо. Повний розбір — у
// шапці `src/core/rubber-zone.js`.
//
// 🔬 ЩО МІРЯЄМО — НАСЛІДОК ЖИВОГО ЖЕСТУ, а не наявність класу чи слухача.
// Стенд справді веде пальцем (`touchscreen`-події) і дивиться, ЩО зрушило:
//   • зона (капсули й далі) — мусить поїхати вниз;
//   • бордова шапка `.hm-top` — мусить лишитись НА МІСЦІ до пікселя;
//   • фото-тло `.hm-bg` — теж (воно `position: fixed`).
// Перевірка «шапка не зрушила» тут головна: саме її порушення Вова й побачив
// на знімку, коли вмикали рідний відскок (PR #872 → відкат #873).
//
// ⚠️ ЩЕ ОДНА ПЕРЕВІРКА, ЯКОЇ ЛЕГКО НЕ ЗРОБИТИ — «БЕЗ СТРИБКА». Технічне
// завдання прямо вимагає: у спокої позиція першої капсули мусить лишитись
// такою самою, як була. Тобто обгортка не має нічого зсунути просто фактом
// свого існування. Міряємо до жесту і після повернення.
//
// 🛑 І контроль конструкції: всередині зони не має бути `position: fixed` —
// `transform` робить із неї containing block, і такий вузол перестав би
// кріпитись до екрана (пастка записана в `style/home.css`).
//
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки в проєкті.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     BUNDLE_REV=origin/main node tests/rubber-zone.mjs
// на коді ДО фіксу зона не рухається зовсім — 🔴-перевірка про рух мусить УПАСТИ.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();
await mockSupabase(p,
  { posts: [], threads: [], messages: [], thread_user_state: [], announcements: [] },
  { user: ME, profiles: [{ uid: 'u-me', name: 'Вова', avatar_url: '' }] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  const body = projectFile('bundle.js', REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(1500);

const позиції = () => p.evaluate(() => {
  const в = s => { const el = document.querySelector(s); return el ? +el.getBoundingClientRect().top.toFixed(1) : null; };
  return { шапка: в('.hm-top'), фото: в('.hm-bg'), капсули: в('#hm-caps'), контакти: в('#cm-contacts') };
});

ok('сцена: бордова шапка і зона гумки на екрані',
   await p.evaluate(() => !!document.querySelector('.hm-top') && !!document.getElementById('hm-rubber')));

const спокій = await позиції();

// ── 🛑 ВЛАСНИЙ ВІДСКОК ВИМКНЕНО — І СТЕНД СТЕРЕЖЕ САМЕ ЦЕ ───────────────────
// Механіка працювала (числа були: палець 120px → зона 53.7px, шапка 56→56).
// Але Вова перевірив наживо: «дьоргається… зроби такою самою плавною як у
// стрічці». У Стрічці гумка РІДНА — її веде композитор; наша малювалась
// скриптом на кожен `touchmove`, головним потоком. На iOS це не буває так само
// гладко (той самий висновок, що тричі зроблено на шапці Дошки).
// ➡️ Тому тут перевіряється ЗВОРОТНЕ: жест не має рухати нічого. Увімкнеш
// назад «з оптимізаціями» — стенд почервоніє, і це буде правильно: то була б
// четверта варіація прийому, який уже визнано непридатним.
await p.touchscreen.tap(195, 400);
await p.evaluate(() => { document.querySelector('.app-main').scrollTop = 0; });
await p.waitForTimeout(150);

await p.evaluate(async () => {
  const cast = (тип, y) => {
    const t = new Touch({ identifier: 1, target: document.body, clientX: 195, clientY: y });
    document.querySelector('.app-main').dispatchEvent(
      new TouchEvent(тип, { touches: тип === 'touchend' ? [] : [t], changedTouches: [t], bubbles: true }));
  };
  cast('touchstart', 300);
  for (let y = 310; y <= 420; y += 10) { cast('touchmove', y); await new Promise(r => setTimeout(r, 12)); }
});
await p.waitForTimeout(80);
const підЖестом = await позиції();

ok('🛑 жест НЕ рухає зону — власний відскок вимкнено',
   Math.abs(підЖестом.капсули - спокій.капсули) < 0.5,
   `${спокій.капсули} → ${підЖестом.капсули}`);
ok('🛑 і бордова шапка, звісно, теж стоїть',
   Math.abs(підЖестом.шапка - спокій.шапка) < 0.5, `${підЖестом.шапка}`);

await p.evaluate(() => {
  const t = new Touch({ identifier: 1, target: document.body, clientX: 195, clientY: 420 });
  document.querySelector('.app-main').dispatchEvent(
    new TouchEvent('touchend', { touches: [], changedTouches: [t], bubbles: true }));
});
await p.waitForTimeout(500);

// Обгортка лишилась у розмітці під майбутній варіант «прибита шапка + власний
// прокрутник». Вона не сміє нічого зсувати самим фактом існування.
const після = await позиції();
ok('🛑 обгортка `#hm-rubber` на місці й нічого не зсуває',
   (await p.evaluate(() => !!document.getElementById('hm-rubber'))) &&
   Math.abs(після.капсули - спокій.капсули) < 0.5,
   `${спокій.капсули} → ${після.капсули}`);

// ── 🛑 Конструкція: у зоні немає `position: fixed` ──────────────────────────
const фіксовані = await p.evaluate(() => {
  const z = document.getElementById('hm-rubber');
  if (!z) return ['немає зони'];
  return [...z.querySelectorAll('*')]
    .filter(e => getComputedStyle(e).position === 'fixed')
    .map(e => e.className && typeof e.className === 'string' ? e.className.split(' ')[0] : e.tagName);
});
ok('🛑 у зоні гумки немає жодного `position: fixed` (transform його зламав би)',
   фіксовані.length === 0, фіксовані.join(', ') || 'жодного');

await ctx.close(); await b.close(); await stop();
done();
