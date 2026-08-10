import { chromium } from 'playwright';
import { launch, serve, blockExternal, projectFile } from '../_lib.mjs';
const REV = process.env.REV || '';
const srv = await serve(); const browser = await launch(chromium);
const ctx = await browser.newContext({ viewport:{width:390,height:844}, serviceWorkers:'block' });
const page = await ctx.newPage(); await blockExternal(page);
if (REV) for (const [f,t] of [['bundle.js','text/javascript'],['style/sidebar.css','text/css']]) {
  const b = projectFile(f, REV); await page.route('**/'+f, r=>r.fulfill({contentType:t+'; charset=utf-8', body:b})); }
await page.goto(srv.url,{waitUntil:'domcontentloaded'});
await page.waitForSelector('#sidebar-toggle');
await page.waitForFunction(()=>{const s=document.getElementById('splash');return !s||s.hidden||getComputedStyle(s).display==='none'||getComputedStyle(s).opacity==='0';},{timeout:15000}).catch(()=>{});
await page.waitForTimeout(400);
await page.evaluate(()=>document.getElementById('sidebar-toggle').click());
await page.waitForTimeout(700);
console.log(REV||'ПОТОЧНИЙ', await page.evaluate(()=>{
  const h=document.querySelector('.sidebar-head').getBoundingClientRect();
  const f=document.getElementById('sidebar-foot').getBoundingClientRect();
  const n=document.getElementById('sidebar-nav').getBoundingClientRect();
  const b=[...document.querySelectorAll('.sb-social-btn')].map(e=>Math.round(e.getBoundingClientRect().height));
  return { шапка:Math.round(h.height), підвал:Math.round(f.height), різниця:Math.round(f.height-h.height),
           список:Math.round(n.height), кнопки:b,
           підписи:[...document.querySelectorAll('.sb-social-lb')].map(e=>e.textContent.trim()) };
}));
await browser.close(); await srv.stop();
