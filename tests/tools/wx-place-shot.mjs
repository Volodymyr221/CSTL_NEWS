// tests/tools/wx-place-shot.mjs — знімки селектора населеного пункту (05.08).
import { chromium } from 'playwright';
import { chromiumPath, serve, ROOT } from '../_lib.mjs';
import { join } from 'path';
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const p = await (await b.newContext({ viewport:{width:390,height:844}, deviceScaleFactor:2, isMobile:true, hasTouch:true, serviceWorkers:'block' })).newPage();
await p.route('**://*.supabase.co/**', r => r.abort());
const day = n => Array.from({length:n},(_,i)=>new Date(Date.now()+i*864e5).toISOString().slice(0,10));
const hours = day(1).flatMap(d=>Array.from({length:24},(_,h)=>`${d}T${String(h).padStart(2,'0')}:00`));
await p.route('**://api.open-meteo.com/**', r => r.fulfill({ contentType:'application/json', body: JSON.stringify({
  utc_offset_seconds:10800,
  current:{temperature_2m:18.4,weather_code:3,apparent_temperature:17.2},
  hourly:{time:hours,temperature_2m:hours.map((_,i)=>14+(i%12)),
          precipitation_probability:hours.map((_,i)=> i===17?80:10),
          weather_code:hours.map(()=>3)},
  daily:{time:day(7),weather_code:[3,1,61,0,2,3,80],
         temperature_2m_max:[24,27,21,27,25,23,20],temperature_2m_min:[13,14,12,15,14,13,11]},
})}));
await p.route('**://nominatim.openstreetmap.org/**', r => r.fulfill({ contentType:'application/json',
  body: JSON.stringify({ address:{ village:'Олика' } }) }));
await p.goto(url, { waitUntil:'domcontentloaded' });
await p.waitForTimeout(2000);
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(7000);
const head = await p.$('.hm-top');
await head.screenshot({ path: join(ROOT,'tests','tools','_shots','wx-place-card.png') });
console.log('✓ картка →  _shots/wx-place-card.png');
console.log('чіп:', await p.evaluate(()=>{ const c=document.querySelector('[data-wx-place]');
  if(!c) return 'НЕМА'; const r=c.getBoundingClientRect();
  return `«${c.textContent.trim().replace(/\s+/g,' ')}» ${Math.round(r.width)}×${Math.round(r.height)}`; }));
console.log('підказка:', await p.evaluate(()=>document.querySelector('.hm-wx-sub')?.textContent.trim()));
await p.click('[data-wx-place]');
await p.waitForTimeout(700);
await p.screenshot({ path: join(ROOT,'tests','tools','_shots','wx-place-sheet.png') });
console.log('✓ шторка → _shots/wx-place-sheet.png');
console.log('рядків у шторці:', await p.evaluate(()=>document.querySelectorAll('.wxp-row').length));
await b.close(); await stop();
