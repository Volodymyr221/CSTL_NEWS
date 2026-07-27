// Знімок ЖИВОГО тоста в застосунку — щоб Вова побачив результат до деплою.
import { chromium } from 'playwright';
import { ROOT, launch, serve } from '../_lib.mjs';

// Сервер піднімаємо самі — раніше стенд мовчки падав, якщо його забули запустити руками.
const { url: HOME_URL, stop: stopServer } = await serve();
const b=await launch(chromium);
const p=await b.newPage({viewport:{width:390,height:600},deviceScaleFactor:3,isMobile:true});
await p.route('**://*.supabase.co/**', r=>r.abort());
await p.route('**://api.open-meteo.com/**', r=>r.abort());
await p.goto(HOME_URL,{waitUntil:'domcontentloaded'});
await p.waitForTimeout(1500);
// Малюємо три випадки один під одним справжнім CSS застосунку.
await p.evaluate(() => {
  document.getElementById('splash')?.remove();   // заставка z-index 9999 накриває тост
  document.querySelectorAll('.toast').forEach(e=>e.remove());
  const mk=(txt,top,err)=>{const d=document.createElement('div');
    d.className='toast visible'+(err?' toast--error':'');d.textContent=txt;
    d.style.top=top+'px';document.body.appendChild(d);};
  mk('Пост закріплено', 14, false);
  mk('Закріплено вже 3 — спершу відкріпи якийсь', 70, false);
  mk('Сповіщення вимкнені в налаштуваннях телефону — увімкни їх, щоб отримувати нагадування', 140, false);
  mk('🚫 Пост містить заборонені слова', 250, true);
});
await p.waitForTimeout(300);
const out = process.argv[2] || join(ROOT, 'toast-preview.png');
await p.screenshot({ path: out });
await b.close();
console.log('знімок збережено:', out);
await stopServer();
