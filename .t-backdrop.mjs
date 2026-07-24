import { chromium } from 'playwright';
import http from 'node:http'; import fs from 'node:fs'; import path from 'node:path';
const ROOT='/home/user/CSTL_NEWS';
const MIME={'.html':'text/html','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png'};
const server=http.createServer((q,s)=>{const u=decodeURIComponent(q.url.split('?')[0]);
  const f=path.join(ROOT,u==='/'?'/index.html':u);
  if(!f.startsWith(ROOT)||!fs.existsSync(f)||fs.statSync(f).isDirectory()){s.writeHead(404);return s.end();}
  s.writeHead(200,{'Content-Type':MIME[path.extname(f)]||'application/octet-stream'});
  fs.createReadStream(f).pipe(s);});
await new Promise(r=>server.listen(0,r));
const base=`http://127.0.0.1:${server.address().port}/`;

fs.writeFileSync(ROOT+'/.t-h.html',`<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="./style.css"></head><body>
<script type="module">
import { createBackdropFade } from './src/core/sheet-motion.js';
// «Наскільки темно» = прозорість × альфа кольору фону. Саме це бачить око.
window.__dark = el => { const cs=getComputedStyle(el);
  const m=(cs.backgroundColor||'').match(/[\\d.]+/g)||[];
  const a=m[3]!==undefined?+m[3]:(m.length?1:0);
  return +( (+cs.opacity) * a ).toFixed(3); };
window.__mk = (cls, attachFirst) => {
  const el=document.createElement('div'); el.className=cls;
  if (attachFirst) document.body.appendChild(el);
  const fade=createBackdropFade(el, cls.includes('fd-sheet-back')?'bg':'opacity');  // як у бойовому коді
  if (!attachFirst) document.body.appendChild(el);   // ⬅️ САМЕ ТАК робить feed.js: дротує ДО вставки
  return { el, fade };
};
window.__ready=1;
</script></body></html>`);

const browser=await chromium.launch({executablePath:'/opt/pw-browsers/chromium'});
const page=await (await browser.newContext({viewport:{width:390,height:844}})).newPage();
await page.goto(base+'.t-h.html',{waitUntil:'networkidle'});
await page.waitForFunction(()=>window.__ready);
let pass=0,fail=0; const t=(n,c,x='')=>{c?(pass++,console.log('  ✓',n)):(fail++,console.log('  ✗',n,x));};

const KINDS=[
  ['app-modal-backdrop','Сайдбар/Кабінет/Світло/Погода (спільний примітив)'],
  ['board-backdrop visible','Дошка — модалка оголошення'],
  ['board-backdrop bd-chat-backdrop visible','Обговорення — модалка-чат'],
  ['fd-sheet-back open','Стрічка — коментарі/композер (фон = контейнер аркуша)'],
];
for (const [cls,label] of KINDS) {
  for (const attachFirst of [true,false]) {
    const how = attachFirst ? 'елемент у DOM до дротування' : 'дротування ДО вставки в DOM (як у Стрічці)';
    const r = await page.evaluate(([c,a])=>{
      const {el,fade}=window.__mk(c,a);
      const rest=window.__dark(el);          // спокій — «певний відтінок» модалки
      fade.track(0);                         // палець торкнувся, ще не зрушив
      const start=window.__dark(el);
      fade.track(0.5);                       // протягнув половину
      const half=window.__dark(el);
      el.remove();
      return {rest,start,half};
    },[cls,attachFirst]);
    console.log(`\n── ${label}\n   ${how}`);
    console.log(`   спокій ${r.rest} · старт жесту ${r.start} · половина ${r.half}`);
    t('на старті жесту НЕ темніше за спокій', r.start <= r.rest + 0.001, `спокій ${r.rest} → старт ${r.start}`);
    t('на старті жесту без стрибка (≈ спокій)', Math.abs(r.start-r.rest) < 0.02, `${r.rest} → ${r.start}`);
    t('далі світлішає', r.half < r.rest + 0.001, `${r.rest} → ${r.half}`);
  }
}
console.log(`\nПідсумок: ${pass} ✓ / ${fail} ✗`);
fs.unlinkSync(ROOT+'/.t-h.html');
await browser.close(); server.close(); process.exit(fail?1:0);
