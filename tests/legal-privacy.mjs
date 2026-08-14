// tests/legal-privacy.mjs — ПРАВОВА ВІДПОВІДНІСТЬ: згода, Політика, статистика,
// видалення акаунта. Заведено 14.08.2026 (потік /byyou «правова відповідність»).
//
// 🔑 ЩО САМЕ МІРЯЄМО І ЧОМУ САМЕ ТАК.
// Правовий шар легко «зробити» так, що документ красивий, а поведінка інша —
// і саме розходження між обіцянкою і продуктом було головною знахідкою аудиту
// (Політика обіцяла кнопку видалення акаунта, якої не існувало). Тому кожна
// перевірка тут міряє НАСЛІДОК, а не текст:
//   1) згода прив'язана до РЕДАКЦІЇ — змінили Політику, людину перепитали;
//   2) вимикач статистики справді зупиняє запис у базу (рахуємо звернення);
//   3) кнопка «Видалити акаунт» доходить до RPC, а не лише малює вікно;
//   4) у Політиці названі рівно ті обробки, які в коді справді є.
//
// 🔬 КОНТРОЛЬ (обов'язковий у цьому проєкті): перевірка «статистика вимкнена»
// сама по собі нічого не доводить — нуль звернень буває і від зламаної сцени.
// Тому спершу міряємо ТУ САМУ сцену з УВІМКНЕНОЮ статистикою і вимагаємо, щоб
// звернення були. Дві половини одного заміру, інакше він порожній.

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

// Контроль (доведення падінням) — підміняє зібраний код і стилі версією з git:
//   BUNDLE_REV=origin/main CSS_REV=origin/main node tests/legal-privacy.mjs
// На старому коді мусять упасти рівно ті перевірки, що описують нову поведінку.
const BUNDLE_REV = process.env.BUNDLE_REV || '';
const CSS_REV    = process.env.CSS_REV    || '';
async function useRevs(page) {
  if (BUNDLE_REV) {
    const old = projectFile('bundle.js', BUNDLE_REV);
    await page.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  if (CSS_REV) {
    await page.route('**/style/account.css', r =>
      r.fulfill({ contentType: 'text/css', body: projectFile('style/account.css', CSS_REV) }));
  }
}

// Редакція документів — джерело правди в коді. Стенд НЕ вписує дату числом:
// інакше при кожній правці Політики він падав би на рівному місці й привчав
// «просто оновити число», а це рівно та звичка, через яку сторожі й вимикають.
const LEGAL_UPDATED = (await import('../src/core/legal.js')).LEGAL_UPDATED;

const { url, stop } = await serve();
const b = await launch(chromium);

const newPage = async (init) => {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await mockSupabase(p, { posts: [], announcements: [] });
  await useRevs(p);
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  if (init) await p.addInitScript(init);
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2200);
  return { p, ctx };
};

// ═══ 1. БАНЕР ЗГОДИ — ПЕРШИЙ ВХІД ═══════════════════════════════════════════
const { p, ctx } = await newPage();

const first = await p.evaluate(() => {
  const bar = document.querySelector('.consent-bar');
  return bar ? { текст: bar.querySelector('.consent-text')?.textContent.replace(/\s+/g, ' ').trim() || '',
                 кнопка: bar.querySelector('.consent-accept')?.textContent.trim() || '' } : null;
});
ok('банер згоди приходить гостю при першому вході', !!first, first ? 'є' : 'НЕ прийшов');
ok('текст першого показу — про згоду', /погоджуєтесь/i.test(first?.текст || ''), first?.текст);
ok('кнопка першого показу — «Погоджуюсь»', first?.кнопка === 'Погоджуюсь', first?.кнопка);

await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(500);

const saved = await p.evaluate(() => localStorage.getItem('cstl-legal-consent-v1'));
ok('згода записує саме РЕДАКЦІЮ, а не «1»', saved === LEGAL_UPDATED, `у сховищі «${saved}», у коді «${LEGAL_UPDATED}»`);
ok('банер зник після згоди', await p.evaluate(() => !document.querySelector('.consent-bar')), 'лишився');

await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
ok('банер не повертається при тій самій редакції',
   await p.evaluate(() => !document.querySelector('.consent-bar')), 'прийшов знову');

// ═══ 2. 🔴 ЗМІНА РЕДАКЦІЇ ПЕРЕПИТУЄ ЛЮДИНУ ══════════════════════════════════
// Головна нова поведінка. До 14.08 значення ключа не читав НІХТО: людина, що
// погодилась із редакцією 07.07, лишалась «згодною» з будь-яким наступним
// текстом. Дані для перевірки лежали в сховищі, а перевірки не було.
await p.evaluate(() => localStorage.setItem('cstl-legal-consent-v1', '01.01.2000'));
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);

const again = await p.evaluate(() => {
  const bar = document.querySelector('.consent-bar');
  return bar ? { текст: bar.querySelector('.consent-text')?.textContent.replace(/\s+/g, ' ').trim() || '',
                 кнопка: bar.querySelector('.consent-accept')?.textContent.trim() || '' } : null;
});
ok('стара редакція згоди → банер приходить знову', !!again, again ? 'є' : 'НЕ прийшов');
ok('текст повторного показу інший — «оновили»', /оновили/i.test(again?.текст || ''), again?.текст);
ok('кнопка повторного показу — «Зрозуміло»', again?.кнопка === 'Зрозуміло', again?.кнопка);

await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(400);
ok('повторна згода записує НОВУ редакцію',
   await p.evaluate(() => localStorage.getItem('cstl-legal-consent-v1')) === LEGAL_UPDATED, 'не оновилась');

// ═══ 3. ПОЛІТИКА НАЗИВАЄ ТЕ, ЩО В КОДІ СПРАВДІ Є ════════════════════════════
await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
await p.waitForTimeout(400);
await p.evaluate(() => document.querySelector('[data-nav="policy"]')?.click());
await p.waitForTimeout(600);

const doc = await p.evaluate(() => {
  const el = document.querySelector('.app-modal-body') || document.body;
  return el.textContent.replace(/\s+/g, ' ');
});
ok('документ відкрився з бічного меню', doc.includes('Політика конфіденційності'), 'не відкрився');
// Володілець мусить бути НАЗВАНИЙ поіменно (ст. 12 ЗУ №2297-VI): «команда
// Olyka Castle» — це бренд, за ним людина не знає, до кого звертатись.
ok('володільця названо поіменно', /Володимир Шевчук/.test(doc), 'імені немає');
ok('описано збір статистики користування', /Статистика користування/.test(doc), 'розділу немає');
ok('описано push-сповіщення', /Push-сповіщення/.test(doc), 'розділу немає');
ok('описано самостійне видалення акаунта', /Видалити акаунт/.test(doc), 'не описано');
ok('пояснено долю приватного листування', /Видалений користувач/.test(doc), 'не пояснено');
ok('дата редакції в документі збігається з кодом', doc.includes(LEGAL_UPDATED), `у документі немає ${LEGAL_UPDATED}`);

await ctx.close();

// ═══ 4. ВИМИКАЧ СТАТИСТИКИ — ДВІ ПОЛОВИНИ ОДНОГО ЗАМІРУ ═════════════════════
// Рахуємо звернення до `analytics_events` у підробленій базі. Сцена однакова:
// прийняти згоду і перемкнути дві вкладки (кожне перемикання пише подію
// `tab_view` — див. `app.js`).
const measure = async (off) => {
  const { p: pg, ctx: c } = await newPage(off
    ? () => localStorage.setItem('cstl-analytics-off', '1')
    : null);
  await pg.evaluate(() => document.querySelector('.consent-accept')?.click());
  await pg.waitForTimeout(300);
  await pg.evaluate(() => window.switchTab && window.switchTab('board'));
  await pg.waitForTimeout(700);
  await pg.evaluate(() => window.switchTab && window.switchTab('buses'));
  await pg.waitForTimeout(700);
  const n = await pg.evaluate(() => (window.__cstlQueries || {}).analytics_events || 0);
  await c.close();
  return n;
};

const withOn  = await measure(false);
const withOff = await measure(true);
ok('КОНТРОЛЬ: при увімкненій статистиці події пишуться', withOn > 0, `${withOn} звернень`);
ok('вимикач справді зупиняє запис подій', withOff === 0, `${withOff} звернень при вимкненому`);

// ═══ 5. КАБІНЕТ: вимикач і кнопка видалення ═════════════════════════════════
const ctx2 = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                  hasTouch: true, serviceWorkers: 'block' });
const p2 = await ctx2.newPage();
await mockSupabase(p2, { posts: [], announcements: [], profiles: [] },
                   { user: { id: 'u1', email: 'test@example.com',
                             user_metadata: { full_name: 'Тест Тестенко' } } });
await useRevs(p2);
await p2.route('**://api.open-meteo.com/**', r => r.abort());
await p2.goto(url, { waitUntil: 'domcontentloaded' });
await p2.waitForTimeout(2500);
await p2.evaluate(() => document.querySelector('.consent-accept')?.click());
await p2.waitForTimeout(400);
// Модалка «Доповніть профіль» приходить новачку і накриває кабінет — прибираємо.
await p2.evaluate(() => document.querySelector('.app-modal-close')?.click());
await p2.waitForTimeout(400);
await p2.evaluate(() => document.querySelector('[data-account-btn]')?.click());
await p2.waitForTimeout(900);

const cab = await p2.evaluate(() => ({
  відкрито: !!document.querySelector('#acc-cab'),
  вимикач: !!document.querySelector('[data-priv="analytics"]'),
  вимкнений: document.querySelector('[data-priv="analytics"]')?.classList.contains('off') || false,
  кнопка: document.querySelector('#cf-delete .acc-cab-row-name')?.textContent.trim() || '',
}));
ok('кабінет відкрився', cab.відкрито, 'не відкрився');
ok('у кабінеті є вимикач статистики', cab.вимикач, 'немає');
ok('вимикач стоїть у стані «увімкнено» за замовчуванням', cab.вимикач && !cab.вимкнений, 'вимкнений');
ok('у кабінеті є «Видалити акаунт»', cab.кнопка === 'Видалити акаунт', cab.кнопка || 'кнопки немає');

// Вимикач пише у сховище — тобто діє, а не лише перефарбовується.
await p2.evaluate(() => document.querySelector('[data-priv="analytics"]')?.click());
await p2.waitForTimeout(300);
ok('тап по вимикачу записує відмову у сховище',
   await p2.evaluate(() => localStorage.getItem('cstl-analytics-off')) === '1', 'не записано');

// ── Підтвердження видалення ────────────────────────────────────────────────
await p2.evaluate(() => document.querySelector('#cf-delete')?.click());
await p2.waitForTimeout(500);
const confirm = await p2.evaluate(() => {
  const el = document.querySelector('.acc-del');
  return el ? { текст: el.textContent.replace(/\s+/g, ' '),
                скасувати: !!el.querySelector('[data-del="no"]'),
                видалити: !!el.querySelector('[data-del="yes"]') } : null;
});
ok('вікно підтвердження приходить', !!confirm, 'не прийшло');
ok('вікно каже, що саме зникне', /Буде стерто назавжди/.test(confirm?.текст || ''), 'не сказано');
ok('вікно каже, що лишиться (листування)', /Лишиться/.test(confirm?.текст || ''), 'не сказано');
ok('є обидві кнопки — «Скасувати» і «Видалити»',
   confirm?.скасувати && confirm?.видалити, 'кнопок бракує');

// «Скасувати» не має нічого викликати.
await p2.evaluate(() => { window.__cstlRpcNames = []; });
await p2.evaluate(() => document.querySelector('[data-del="no"]')?.click());
await p2.waitForTimeout(400);
ok('«Скасувати» не чіпає базу',
   await p2.evaluate(() => !(window.__cstlRpcNames || []).includes('delete_my_account')), 'виклик пішов');

// А «Видалити назавжди» — доходить до бази і виводить людину з акаунта.
await p2.evaluate(() => document.querySelector('#cf-delete')?.click());
await p2.waitForTimeout(400);
await p2.evaluate(() => document.querySelector('[data-del="yes"]')?.click());
await p2.waitForTimeout(1200);
ok('«Видалити назавжди» викликає delete_my_account у базі',
   await p2.evaluate(() => (window.__cstlRpcNames || []).includes('delete_my_account')), 'виклику не було');
ok('після видалення кабінет закривається',
   await p2.evaluate(() => !document.querySelector('#acc-cab')), 'лишився відкритим');

await ctx2.close();
await b.close();
await stop();
done();
