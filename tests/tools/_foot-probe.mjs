import { chromium } from 'playwright';
import { launch, serve, blockExternal } from '../_lib.mjs';
const srv = await serve();
const browser = await launch(chromium);
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const page = await ctx.newPage();
await blockExternal(page);
await page.goto(srv.url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#sidebar-toggle');
await page.waitForFunction(() => { const s=document.getElementById('splash'); return !s||s.hidden||getComputedStyle(s).display==='none'||getComputedStyle(s).opacity==='0'; },{timeout:15000}).catch(()=>{});
await page.waitForTimeout(400);
await page.evaluate(() => document.getElementById('sidebar-toggle').click());
await page.waitForTimeout(700);
const зміряти = () => page.evaluate(() => {
  const h = document.querySelector('.sidebar-head').getBoundingClientRect();
  const n = document.getElementById('sidebar-nav');
  const nr = n.getBoundingClientRect();
  const f = document.getElementById('sidebar-foot');
  const fr = f.getBoundingClientRect();
  const політика = [...document.querySelectorAll('.sidebar-item')].find(e => /Політика/.test(e.textContent));
  const пр = політика?.getBoundingClientRect();
  return {
    шапкаTop: Math.round(h.top), шапкаBottom: Math.round(h.bottom),
    списокTop: Math.round(nr.top), списокBottom: Math.round(nr.bottom),
    підвалTop: Math.round(fr.top), підвалBottom: Math.round(fr.bottom), підвалH: Math.round(fr.height),
    scrollTop: Math.round(n.scrollTop), scrollH: n.scrollHeight, clientH: n.clientHeight,
    соцмережУПідвалі: f.querySelectorAll('.sb-social-btn').length,
    соцмережУСписку: n.querySelectorAll('.sb-social-btn').length,
    політикаНижнійКрай: пр ? Math.round(пр.bottom) : null,
    політикаПідПідвалом: пр ? пр.bottom > fr.top + 1 : null,
  };
});
console.log('ЗГОРИ  ', await зміряти());
await page.evaluate(() => { const n=document.getElementById('sidebar-nav'); n.scrollTop = n.scrollHeight; });
await page.waitForTimeout(300);
console.log('ДО НИЗУ', await зміряти());
await browser.close(); await srv.stop();
