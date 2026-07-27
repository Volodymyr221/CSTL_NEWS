// Стенд №8: ЗСУВ УБІК ПО ВСЬОМУ ЗАСТОСУНКУ.
// Вова: «це в всіх модалках зміст не має зсуватись в бік».
//
// Міряємо не CSS «на око», а ЖИВИЙ застосунок: піднімаємо справжній index.html
// з bundle.js, тикаємо справжні кнопки і після кожного кроку скануємо ВЕСЬ документ —
// чи є вузол, який можна прокрутити ГОРИЗОНТАЛЬНО. Саме це відчувається пальцем
// як «плаває вбік».
//
// Критерій зсувності:  overflow-x = auto|scroll  І  scrollWidth > clientWidth.
// Тільки `auto`/`scroll` дають ПАЛЬЦЮ прокрутку. Свідомо НЕ вважаємо дефектом:
//   • `visible` — намальовано ширше, але посунути неможливо;
//   • `hidden`/`clip` — зайве просто обрізано, пальцем теж не тягнеться
//     (`hidden` прокручується лише скриптом, а Вова скаржився саме на палець).
//
// ⚠️ Свідомо НЕ вважаємо дефектом горизонтальні СТРІЧКИ (карусель подій, стрічка
// кружечків «Стрічки», чипси фільтрів) — там гортання вбік і є задумом. Вони в
// списку винятків нижче; якщо туди щось додається, це має бути видно в коді стенда.
import { chromium } from 'playwright';
import { launch, serve } from './_lib.mjs';

// Сервер піднімаємо самі — раніше стенд мовчки падав, якщо його забули запустити руками.
const { url: HOME_URL, stop: stopServer } = await serve();

const VP = { width: 390, height: 844 };
const ALLOW = [
  'cm-ev-carousel', 'cmbw-strip', 'cm-news-controls', 'fd-circles',
  'fd-gal', 'bm-thumbs', 'fd-comp-thumbs', 'cm-cat-row', 'bm-cat-row',
];

const b = await launch(chromium);
const p = await b.newPage({ viewport: VP, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
await p.route('**://*.supabase.co/**', r => r.abort());
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(HOME_URL, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);

await p.addInitScript((allow) => {
  window.__ALLOW = allow;
  // Скан усього документа: хто зсувається вбік.
  window.__scan = () => {
    const bad = [];
    document.querySelectorAll('*').forEach(e => {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      const ox = cs.overflowX;
      if (ox !== 'auto' && ox !== 'scroll') return;
      const px = e.scrollWidth - e.clientWidth;
      if (px <= 1) return;
      const cls = (e.className || e.tagName).toString().trim();
      if (window.__ALLOW.some(a => cls.includes(a))) return;   // задумані стрічки
      bad.push({ cls: cls.slice(0, 52), px, ox });
    });
    return bad;
  };
  // Стрес: підкидаємо довге НЕРОЗРИВНЕ посилання в КОЖЕН видимий скролер.
  // Це найчастіше джерело зсуву вбік у реальному житті — людина вставила лінк
  // у коментар/оголошення, і скролер розперло. Перевіряємо всі одразу, а не один.
  window.__stress = () => {
    let n = 0;
    document.querySelectorAll('*').forEach(e => {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden') return;
      if (cs.overflowY !== 'auto' && cs.overflowY !== 'scroll') return;
      if (e.clientHeight < 40 || e.clientWidth < 40) return;
      const d = document.createElement('p');
      d.className = '__stress';
      d.textContent = 'https://example.com/' + 'x'.repeat(120);
      e.appendChild(d); n++;
    });
    return n > 0;
  };
  window.__unstress = () => document.querySelectorAll('.__stress').forEach(e => e.remove());
}, ALLOW);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);

const res = [];
const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };
const fmt = d => d.map(x => `${x.cls} (${x.px}px, overflow-x:${x.ox})`).join('; ');

async function step(name, action, { stress = true } = {}) {
  await action();
  await p.waitForTimeout(450);
  let bad = await p.evaluate(() => window.__scan());
  let note = '';
  if (stress) {
    const applied = await p.evaluate(() => window.__stress());
    if (applied) {
      await p.waitForTimeout(120);
      const bad2 = await p.evaluate(() => window.__scan());
      await p.evaluate(() => window.__unstress());
      if (bad2.length > bad.length) { note = ' [під довгим посиланням]'; bad = bad2; }
    }
  }
  ok(`${name}${note}`, bad.length === 0, fmt(bad) || '0 зсувних вузлів');
}

console.log(`\n── ЖИВИЙ ЗАСТОСУНОК, ${VP.width}×${VP.height} ──`);

await step('старт: Громада', async () => {});
await step('Сайдбар (меню)', () => p.click('#sidebar-toggle'));

// Пункти сайдбара — там документи (Політика, Про проєкт тощо) через примітив.
// Мітки збираємо ОДРАЗУ: частина пунктів веде на іншу сторінку, і хендли після
// навігації протухають («Execution context was destroyed»).
const HOME = HOME_URL;
const labels = await p.$$eval('.sidebar-item', els =>
  els.map(e => e.innerText.trim().replace(/\s+/g, ' ').slice(0, 24)));
for (let i = 0; i < labels.length; i++) {
  if (/Адмін/i.test(labels[i])) { console.log(`   ⏭️  Сайдбар → «${labels[i]}»: окрема сторінка (admin.html), не модалка`); continue; }
  await step(`Сайдбар → «${labels[i]}»`, async () => {
    if (!p.url().startsWith(HOME)) { await p.goto(HOME, { waitUntil: 'domcontentloaded' }); await p.waitForTimeout(1200); }
    await p.evaluate(() => { document.querySelectorAll('.app-modal').forEach(m => m.remove()); });
    if (!await p.$('#sidebar.open, .sidebar.open')) await p.click('#sidebar-toggle').catch(() => {});
    await p.waitForTimeout(200);
    await p.$$eval('.sidebar-item', (els, n) => els[n]?.click(), i).catch(() => {});
  });
}

await p.evaluate(() => document.querySelectorAll('.app-modal').forEach(m => m.remove()));
await step('Погода (блок Громади)', () => p.click('#cm-weather-content').catch(() => {}));
await step('Автобуси (посилання блоку)', () => p.click('.cm-block-title--bus-link').catch(() => {}));
await step('Збережене', () => p.click('#saved-hub-btn').catch(() => {}));

// Вкладки нижнього бару — кожна зі своїми листами/екранами.
const tabs = await p.$$('.tab-item');
for (let i = 0; i < tabs.length; i++) {
  const label = (await tabs[i].innerText()).trim().replace(/\s+/g, ' ').slice(0, 18) || `вкладка ${i + 1}`;
  await step(`Вкладка «${label}»`, async () => {
    await p.evaluate(() => document.querySelectorAll('.app-modal').forEach(m => m.remove()));
    await p.$$eval('.tab-item', (els, n) => els[n]?.click(), i);
  });
}

await b.close();
await stopServer();
const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
