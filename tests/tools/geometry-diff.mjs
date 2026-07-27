// Стенд №9: «НІЧОГО НЕ ЗЛАМАВ ПО ДОРОЗІ» (пряма вимога Вови).
// Знімає геометрію КОЖНОГО видимого елемента застосунку і порівнює два стани.
// Запуск: SNAP=before node tests/tools/geometry-diff.mjs   → знімок «до»
//         SNAP=after  node tests/tools/geometry-diff.mjs   → знімок «після» + порівняння
// Між знімками CSS у робочому дереві міняється (git stash), сервер віддає його наживо.
import { chromium } from 'playwright';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { launch, serve } from '../_lib.mjs';
import { tmpdir } from 'os';
import { join } from 'path';

// Сервер піднімаємо самі — раніше стенд мовчки падав, якщо його забули запустити руками.
const { url: HOME_URL, stop: stopServer } = await serve();

const MODE = process.env.SNAP || 'after';
const HOME = HOME_URL;

const b = await launch(chromium);
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await p.route('**://*.supabase.co/**', r => r.abort());
await p.route('**://api.open-meteo.com/**', r => r.abort());

const snap = {};
// Кілька станів екрана — щоб порівняння покрило не лише стартову сторінку.
const views = [
  ['громада', async () => {}],
  ['сайдбар', async () => { await p.click('#sidebar-toggle').catch(() => {}); }],
  ['політика', async () => {
    const n = await p.$$eval('.sidebar-item', els =>
      els.findIndex(e => /Політика/i.test(e.innerText)));
    if (n >= 0) await p.$$eval('.sidebar-item', (els, i) => els[i].click(), n);
  }],
  ['збережене', async () => {
    await p.evaluate(() => document.querySelectorAll('.app-modal').forEach(m => m.remove()));
    await p.click('#saved-hub-btn').catch(() => {});
  }],
];

await p.goto(HOME, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);

for (const [name, act] of views) {
  await act();
  await p.waitForTimeout(500);
  snap[name] = await p.evaluate(() => {
    const out = [];
    // Живі віджети: вміст залежить від даних і ЧАСУ (стрічка оголошень крутиться,
    // смужка автобуса повзе). Самі КОНТЕЙНЕРИ звіряємо, а їхніх дітей — ні:
    // інакше шум даних забиває сигнал про розкладку.
    const LIVE = '.cmbw-strip, .cm-news-feed, .cm-ev-carousel, #cm-bus-content, #cm-weather-content, #cm-board-content';
    document.querySelectorAll('*').forEach(e => {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (e.parentElement?.closest(LIVE)) return;
      const r = e.getBoundingClientRect();
      if (r.width < 1 && r.height < 1) return;
      const key = e.tagName + '.' + (e.className || '').toString().trim().replace(/\s+/g, '.') + '#' + (e.id || '');
      out.push([key, Math.round(r.left), Math.round(r.top), Math.round(r.width), Math.round(r.height)]);
    });
    return out;
  });
}
await b.close();

// Знімки кладемо в системну тимчасову теку — не в репозиторій (це проміжні дані).
const file = join(tmpdir(), `cstl-geometry-${MODE}.json`);
writeFileSync(file, JSON.stringify(snap));
console.log(`знімок «${MODE}» збережено · екранів: ${Object.keys(snap).length}, вузлів: ${Object.values(snap).reduce((a, v) => a + v.length, 0)}`);

if (MODE === 'after') {
  const beforeFile = file.replace('after.json', 'before.json');
  if (!existsSync(beforeFile)) { console.log('немає before.json — спершу зніми SNAP=before'); process.exit(0); }
  const before = JSON.parse(readFileSync(beforeFile, 'utf8'));
  // ⚠️ ДАНІ МІНЯЮТЬСЯ МІЖ ЗАПУСКАМИ: стрічка оголошень/новин щоразу тягне інший набір
  // і в іншому порядку. Порівняння «за індексом» на цьому дає сотні хибних розбіжностей
  // (перевірено: той самий CSS двічі → 324 «різниці»). Тому звіряємо лише вузли з
  // УНІКАЛЬНИМ ключем — це каркас (шапка, таб-бар, сайдбар, модалка, блоки), який від
  // даних не залежить. Вузли, що повторюються (картки), з порівняння випадають самі.
  const uniq = (list) => {
    const seen = new Map();
    for (const [k, ...box] of list) seen.set(k, seen.has(k) ? null : box);
    return new Map([...seen].filter(([, v]) => v));
  };
  let diffs = 0, checked = 0;
  for (const view of Object.keys(snap)) {
    const A = uniq(before[view] || []), B = uniq(snap[view] || []);
    const bad = [];
    for (const [k, boxA] of A) {
      const boxB = B.get(k);
      if (!boxB) continue;                     // вузол є лише в одному прогоні — це дані
      checked++;
      if (boxA.join(',') !== boxB.join(','))
        bad.push(`${k}: ${boxA.join(',')} → ${boxB.join(',')}`);
    }
    if (bad.length) { console.log(`❌ «${view}»: ${bad.length} розбіжностей`); bad.slice(0, 10).forEach(x => console.log('     ' + x)); diffs += bad.length; }
    else console.log(`✅ «${view}»: каркас не зрушив (звірено ${A.size} унікальних вузлів)`);
  }
  console.log(`\n${diffs ? '❌' : '✅'} звірено ${checked} вузлів · розбіжностей: ${diffs}`);
  process.exit(diffs ? 1 : 0);
}
await stopServer();
