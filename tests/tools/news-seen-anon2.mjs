// Той самий механізм, але відтворений ДЕТЕРМІНОВАНО: мітка ставиться, поки
// застосунок ще не знає, хто я (як у перші секунди на живому телефоні),
// а читається вже під акаунтом.
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';
const UID='11111111-2222-3333-4444-555555555555';
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep?{executablePath:ep}:{}) });

async function прогін(підпис, user) {
  const ctx = await b.newContext({ viewport:{width:390,height:844}, isMobile:true, hasTouch:true, serviceWorkers:'block', storageState: прогін.state });
  const p = await ctx.newPage();
  await mockSupabase(p, {}, user?{user}:{});
  await p.route('**://api.open-meteo.com/**', r=>r.abort());
  await p.goto(url,{waitUntil:'domcontentloaded'});
  await p.evaluate(()=>window.switchTab&&window.switchTab('community'));
  await p.waitForSelector('#cm-news-content',{timeout:15000});
  await p.waitForTimeout(2000);
  const до = await p.evaluate(()=>document.querySelector('.cm-news-new')?.textContent.trim()||'—');
  await p.evaluate(()=>document.querySelector('#cm-news-board [data-cm-news-all]')?.click());
  await p.waitForTimeout(700);
  await p.evaluate(()=>document.querySelector('.nh-back')?.click());
  await p.waitForTimeout(700);
  const після = await p.evaluate(()=>document.querySelector('.cm-news-new')?.textContent.trim()||'—');
  const ключі = await p.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('news_seen')).sort());
  console.log(`${підпис}\n  бейдж до хаба: ${до}   після хаба: ${після}\n  ключі: ${ключі.join(' | ')}`);
  прогін.state = await ctx.storageState();
  await ctx.close();
}
console.log('\n══ 1. ЧИТАЮ ЯК ГІСТЬ (= авторизація ще не доїхала) ══');
await прогін('', null);
console.log('\n══ 2. ЗАХОДЖУ ПІД АКАУНТОМ, сховище те саме ══');
await прогін('', { id:UID, email:'vova@example.com' });
await b.close(); await stop();
