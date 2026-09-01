// ІНСТРУМЕНТ: чи не губиться мітка «бачив», якщо хаб відкрити ДО того,
// як застосунок дізнався, хто я.
//
// 🗣️ Скарга Вови (01.09): «якщо я його прочитав, воно мені не має вибивати
// другий раз, коли я заходжу в додаток».
//
// 🔬 ГІПОТЕЗА З КОДУ: `seenKey()` = `base + ':' + (currentUserId() || 'anon')`.
// `initAuth()` кличеться БЕЗ await (це задокументовано), тож у перші секунди
// `currentUserId()` === null. `openNewsHub()` кличе `markNewsSeen()` одразу,
// не чекаючи `authReady()`. Отже мітка може лягти під `:anon`, а читатись
// потім під `:<uid>` — і «прочитане» зникає назавжди.
// ⚠️ Переносу `:anon` → `:<uid>` у `board-shared.js` НЕМАЄ (є лише перенос
// найстарішого ключа без суфікса).
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const UID = '11111111-2222-3333-4444-555555555555';
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block' });
const p = await ctx.newPage();
await mockSupabase(p, {}, { user: { id: UID, email: 'vova@example.com' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());

const ключі = () => p.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).filter(k => k.includes('news_seen'))
        .map(k => [k, localStorage.getItem(k)])));
const бейдж = () => p.evaluate(() =>
  document.querySelector('.cm-news-new')?.textContent.trim() || '—');
const хтоЯ = () => p.evaluate(() => {
  try { return (window.__cstlWhoAmI && window.__cstlWhoAmI()) || 'невідомо'; } catch { return 'невідомо'; }
});

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForSelector('#cm-news-content', { timeout: 15000 });

console.log('\n══ КРОК 1: одразу після відкриття (авторизація ще їде) ══');
console.log('  ключі:', await ключі());

// Відкриваємо хаб ЯКОМОГА ШВИДШЕ — саме так робить людина, яка зайшла читати.
await p.evaluate(() => document.querySelector('#cm-news-board [data-cm-news-all]')?.click());
await p.waitForTimeout(300);
console.log('\n══ КРОК 2: одразу після відкриття хаба ══');
console.log('  ключі:', await ключі());

await p.evaluate(() => document.querySelector('.nh-back')?.click());
await p.waitForTimeout(2500);   // даємо авторизації доїхати
console.log('\n══ КРОК 3: коли авторизація доїхала ══');
console.log('  ключі:', await ключі());
console.log('  бейдж:', await бейдж());

console.log('\n══ КРОК 4: ПЕРЕЗАХІД ══');
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(3000);
console.log('  ключі:', await ключі());
console.log('  бейдж:', await бейдж(), ' ← якщо тут знову число, мітку загублено');

await b.close(); await stop();
