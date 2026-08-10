import { chromium } from 'playwright';
import { launch, serve, blockExternal } from '../_lib.mjs';
const srv = await serve();
const browser = await launch(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const page = await ctx.newPage();
const помилки = [];
page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|ERR_TUNNEL|ERR_FAILED|net::/.test(m.text())) помилки.push(m.text().slice(0, 160)); });
page.on('pageerror', e => помилки.push('PAGEERROR: ' + String(e).slice(0, 160)));
await blockExternal(page);
await page.goto(srv.url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#sidebar-toggle');
await page.waitForFunction(() => { const s=document.getElementById('splash'); return !s||s.hidden||getComputedStyle(s).display==='none'||getComputedStyle(s).opacity==='0'; },{timeout:15000}).catch(()=>{});
await page.waitForTimeout(600);

const крок = async (назва, fn) => {
  try { await fn(); console.log('✅', назва); } catch (e) { console.log('❌', назва, '—', String(e).split('\n')[0].slice(0,120)); }
};

await крок('меню відкривається бургером', async () => {
  await page.click('#sidebar-toggle');
  await page.waitForTimeout(600);
  const ok = await page.evaluate(() => document.getElementById('sidebar').getBoundingClientRect().left < innerWidth - 20);
  if (!ok) throw new Error('панель не на екрані');
});
await крок('підвал видно і він не перекриває останній пункт', async () => {
  const r = await page.evaluate(() => {
    const n = document.getElementById('sidebar-nav'); n.scrollTop = n.scrollHeight;
    const f = document.getElementById('sidebar-foot').getBoundingClientRect();
    const l = [...n.querySelectorAll('.sidebar-item')].pop().getBoundingClientRect();
    return { видно: f.height > 40 && f.bottom <= innerHeight + 1, чисто: l.bottom <= f.top + 1 };
  });
  if (!r.видно || !r.чисто) throw new Error(JSON.stringify(r));
});
for (const [під, сел] of [['Стрічка','shotam'], ['Дошка','board'], ['Автобуси','buses']]) {
  await крок(`перехід у «${під}» з меню`, async () => {
    await page.evaluate(() => { const n=document.getElementById('sidebar-nav'); n.scrollTop=0; });
    if (!(await page.evaluate(() => document.getElementById('sidebar').getBoundingClientRect().left < innerWidth - 20))) {
      await page.click('#sidebar-toggle'); await page.waitForTimeout(600);
    }
    await page.evaluate(t => [...document.querySelectorAll('.sidebar-item')].find(e => e.textContent.includes(t))?.click(), під);
    await page.waitForTimeout(800);
    // 🔴 ГЕЙТ ПРАВИЛ ДОШКИ (`dismissible: false`) накриває екран і ПЕРЕХОПЛЮЄ ТАПИ —
    // включно з бургером. Перша редакція смоука цього не знала і «завалила» два
    // кроки на цілком робочому коді. Урок уже записаний у `CLAUDE.md`; тут він
    // спрацював удруге. Приймаємо гейт, як це робить людина.
    await page.evaluate(() => document.querySelector('.brules-ok')?.click());
    await page.waitForTimeout(400);
    const tab = await page.evaluate(() => document.querySelector('.app-main')?.dataset.tab);
    if (tab !== сел) throw new Error(`вкладка ${tab}, чекав ${сел}`);
    const меню = await page.evaluate(() => document.getElementById('sidebar').getBoundingClientRect().left < innerWidth - 20);
    if (меню) throw new Error('меню лишилось відкритим після переходу');
  });
}
await крок('соцмережа в підвалі клікабельна', async () => {
  await page.click('#sidebar-toggle'); await page.waitForTimeout(600);
  const n = await page.evaluate(() => document.querySelectorAll('#sidebar-foot .sb-social-btn').length);
  if (n !== 2) throw new Error('кнопок ' + n);
});
console.log(помилки.length ? '❌ помилки консолі:\n' + [...new Set(помилки)].join('\n') : '✅ помилок консолі немає');
await browser.close(); await srv.stop();
