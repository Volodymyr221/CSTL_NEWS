// Стенд №11: ЧИ МОДАЛКИ СПРАВДІ ЗАКРИВАЮТЬСЯ — на живому застосунку.
// Стенди вище міряють РУХ по CSS. Але я переписав саме `close()` у core/modal.js,
// тож треба окремо довести головне: модалка закривається всіма трьома шляхами
// і після себе нічого не лишає. Помилка тут = модалку неможливо закрити взагалі.
import { chromium } from 'playwright';
import { launch, serve } from './_lib.mjs';

// Сервер піднімаємо самі — раніше стенд мовчки падав, якщо його забули запустити руками.
const { url: HOME_URL, stop: stopServer } = await serve();

const HOME = HOME_URL;
const b = await launch(chromium);
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await p.route('**://*.supabase.co/**', r => r.abort());
await p.route('**://api.open-meteo.com/**', r => r.abort());

const errs = [];
p.on('pageerror', e => errs.push(String(e).slice(0, 160)));

await p.goto(HOME, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);

const res = []; const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

const openDoc = async (rx) => {
  await p.evaluate(() => document.querySelectorAll('.app-modal').forEach(m => m.remove()));
  if (!await p.$('.sidebar--open')) await p.click('#sidebar-toggle').catch(() => {});
  await p.waitForTimeout(250);
  const n = await p.$$eval('.sidebar-item', (els, r) => els.findIndex(e => new RegExp(r, 'i').test(e.innerText)), rx);
  if (n < 0) return false;
  await p.$$eval('.sidebar-item', (els, i) => els[i].click(), n);
  await p.waitForTimeout(450);
  return !!(await p.$('.app-modal'));
};

// Стан «модалка живе»: вузол у DOM І body позначено як modal-open.
const alive = () => p.evaluate(() => ({
  node: !!document.querySelector('.app-modal'),
  bodyLocked: document.body.classList.contains('modal-open'),
}));

for (const [way, act] of [
  ['кнопка ✕',    async () => p.click('.app-modal-close')],
  ['тап у фон',   async () => p.click('.app-modal-backdrop', { position: { x: 195, y: 60 } })],
  ['клавіша ESC', async () => p.keyboard.press('Escape')],
]) {
  const opened = await openDoc('Політика');
  if (!opened) { console.log(`   ⏭️  ${way}: модалка не відкрилась у пісочниці`); continue; }

  const before = await alive();
  await act();
  // Одразу після дії аркуш ЩЕ має бути на місці — він їде донизу, а не зникає миттєво.
  await p.waitForTimeout(80);
  const mid = await p.evaluate(() => {
    const s = document.querySelector('.app-modal-sheet');
    return s ? { present: true, top: Math.round(s.getBoundingClientRect().top) } : { present: false };
  });
  await p.waitForTimeout(500);
  const after = await alive();

  ok(`${way}: модалка була відкрита`, before.node && before.bodyLocked);
  ok(`${way}: аркуш ще ВИДНО через 80мс (їде, а не зник)`, mid.present, mid.present ? `top ${mid.top}` : 'зник миттєво');
  ok(`${way}: за 580мс модалку прибрано з DOM`, !after.node);
  ok(`${way}: замок фону знято (body без modal-open)`, !after.bodyLocked);
}

// Подвійне закриття не має нічого зламати (клік по ✕ двічі поспіль).
if (await openDoc('Політика')) {
  await p.click('.app-modal-close');
  await p.click('.app-modal-close', { force: true }).catch(() => {});
  await p.waitForTimeout(500);
  const after = await alive();
  ok('подвійний тап по ✕ не лишає слідів', !after.node && !after.bodyLocked);
}

// Модалку можна відкрити ЗНОВУ після закриття (перевірка, що _active справді звільнився).
const again = await openDoc('Підтримка');
ok('після закриття модалка відкривається знову', again);

ok('без помилок JS', errs.length === 0, errs.slice(0, 2).join(' | ') || 'чисто');

await b.close();
await stopServer();
const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
