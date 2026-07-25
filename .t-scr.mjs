import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT='/home/user/CSTL_NEWS';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css'};
const server=http.createServer((q,s)=>{const u=decodeURIComponent(q.url.split('?')[0]);
  const f=path.join(ROOT,u==='/'?'/index.html':u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)){s.writeHead(404);return s.end();}
  s.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(s);});
await new Promise(r=>server.listen(0,r));
const src=fs.readFileSync(ROOT+'/src/tabs/feed.js','utf8');
const RING=+src.match(/CIRCLE_RING = (\d+)/)[1],PAD=+src.match(/CIRCLE_PAD\s+= (\d+)/)[1],GAP=+src.match(/CIRCLE_GAP\s+= (\d+)/)[1];
fs.writeFileSync(ROOT+'/.h.html',`<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="./style.css"></head><body>
<div class="app-main" data-tab="shotam"><div class="fd-topbar" id="bar">
  <div class="fd-circles-wrap"><div class="fd-circles" id="cs"></div></div></div></div>
<script>
const RING=${RING},PAD=${PAD},GAP=${GAP};
const el=document.getElementById('cs'),bar=document.getElementById('bar');
window.__build=n=>{el.innerHTML=Array.from({length:n},()=>
 '<button class="fd-circle"><span class="fd-circle-ring"><span class="fd-circle-ava fd-circle-ava--ph">О</span></span>'+
 '<span class="fd-circle-label">ОЛИЦЬКА МІСЬКА РАДА</span></button>').join('');
 el.classList.remove('is-fit'); if(el.scrollWidth<=el.clientWidth+1) el.classList.add('is-fit');
 const items=[...el.querySelectorAll('.fd-circle')];
 items.forEach(it=>it.style.setProperty('--dx','0px'));
 const inner=el.clientWidth-PAD*2,w=items.length*RING+(items.length-1)*GAP;
 const sx=w<=inner?PAD+(inner-w)/2:PAD, b=el.getBoundingClientRect().left-el.scrollLeft;
 items.forEach((it,i)=>{const r=it.getBoundingClientRect();
  it.style.setProperty('--dx',(sx+i*(RING+GAP)-(r.left-b+(r.width-RING)/2)).toFixed(1)+'px');});
 return {maxScroll: el.scrollWidth-el.clientWidth};};
window.__scrollTo=x=>{el.scrollLeft=x; return el.scrollLeft;};
window.__sh=v=>bar.style.setProperty('--sh',String(v));
window.__vis=()=>{const W=el.clientWidth, bl=el.getBoundingClientRect().left;
  const rings=[...el.querySelectorAll('.fd-circle-ring')].map(r=>{const b=r.getBoundingClientRect();
    return {l:+(b.left-bl).toFixed(0), r:+(b.right-bl).toFixed(0)};});
  const seen=rings.filter(r=>r.r>0&&r.l<W).length;
  return {rings, seen, W, first:rings[0], last:rings[rings.length-1]};};
window.__ready=1;</script></body></html>`);
const b=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const page=await (await b.newContext({viewport:{width:430,height:932},isMobile:true,hasTouch:true})).newPage();
await page.goto(`http://127.0.0.1:${server.address().port}/.h.html`,{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__ready);
let issues=0;
for (const n of [4,8]) {
  const info=await page.evaluate(k=>window.__build(k),n);
  for (const frac of [0,0.5,1]) {
    const sx=Math.round(info.maxScroll*frac);
    await page.evaluate(v=>window.__scrollTo(v),sx);
    await page.evaluate(()=>window.__sh(1)); await page.waitForTimeout(60);
    const v=await page.evaluate(()=>window.__vis());
    const emptyRight = v.W - v.last.r;
    const flag = (v.seen<n && v.last.r < v.W-40) ? '  ⛔ ПОРОЖНЬО СПРАВА' : (Math.abs(v.first.l-(v.W-v.last.r))>6 && v.seen===n ? '  ⚠️ не по центру' : '');
    if (flag) issues++;
    console.log(`   ${n} спільнот · горизонт. скрол ${String(sx).padStart(3)}/${info.maxScroll} → видно ${v.seen}/${n} · зліва ${v.first.l} · справа від останньої ${emptyRight}${flag}`);
  }
  console.log('');
}
console.log(issues? `⛔ Знайдено проблемних станів: ${issues}` : '✓ проблем нема');
fs.unlinkSync(ROOT+'/.h.html'); await b.close(); server.close();
