// Разовий ВИМІР перед редизайном блоку новин (потік /byyou 26.08, крок 1).
//
// 🔴 ЩО САМЕ МІРЯЄМО І ЧОМУ. Вова просить збільшити картки по вертикалі. Питання
// не «на скільки збільшити», а «скільки місця віджет має право зайняти, не ставши
// найважчим блоком Громади». Тому міряємо не сам віджет, а ВСІ віджети сторінки
// поруч — інакше «трохи вище» вирішувалось би на око.
//
// ⚠️ Числа звідси йдуть у BYYOU_PLAN.md як замір «до». Після редизайну той самий
// файл дає замір «після», і різницю можна назвати вголос, а не відчути.
import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
// Мережа назовні не потрібна: статті лежать у репозиторії. Чужі картинки НЕ ріжемо —
// без них картка без фото і картка з фото зрівнялись би, а різниця тут і міряється.
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());
await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(3000);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(2000);

const VIEW = 844 - 56 - 57;   // видима зона: екран мінус шапка і таб-бар

const out = await page.evaluate(() => {
  const секції = [...document.querySelectorAll('#cm-content .hm-sec, #cm-content [id^="cm-"]')]
    .filter(n => n.getBoundingClientRect().height > 20);
  const бачені = new Set();
  const блоки = [];
  for (const n of секції) {
    const id = n.id || n.className;
    if (бачені.has(id)) continue;
    бачені.add(id);
    блоки.push({
      блок: id,
      висота: Math.round(n.getBoundingClientRect().height),
      підпис: (n.querySelector('.hm-kicker') || {}).textContent?.trim().slice(0, 28) || '—',
    });
  }
  const n = document.getElementById('cm-news-board');
  const картки = [...n.querySelectorAll('.nc')].map(c => ({
    варіант: (c.className.match(/nc--\w+/) || ['?'])[0],
    висота: Math.round(c.getBoundingClientRect().height),
    'є фото': !!c.querySelector('img.nc-img'),
    'заголовок px': Math.round((c.querySelector('.nc-title') || {}).getBoundingClientRect?.().height || 0),
  }));
  const сторінка = n.querySelector('.hm-npage');
  return {
    блоки,
    картки,
    'висота сторінки каруселі': сторінка ? Math.round(сторінка.getBoundingClientRect().height) : 0,
    'висота всієї Громади': Math.round(document.getElementById('cm-content').scrollHeight),
  };
});

console.log('\n📐 ЗАМІР «ДО» — БЛОК НОВИН, ' + new Date().toISOString().slice(0, 16).replace('T', ' ') + ' UTC');
console.log(`   екран 390×844, видима зона ${VIEW}px\n`);
console.log('── Віджети Громади, за висотою ──');
out.блоки.sort((a, b) => b.висота - a.висота).forEach(b => {
  const мітка = b.блок === 'cm-news-board' ? '  ⬅ НОВИНИ' : '';
  console.log(`   ${String(b.висота).padStart(5)}px  ${b.блок.padEnd(24)} ${b.підпис}${мітка}`);
});
console.log('\n── Картки всередині віджета новин ──');
out.картки.forEach(c => console.log(
  `   ${String(c.висота).padStart(4)}px  ${c.варіант.padEnd(10)} фото:${c['є фото'] ? 'є ' : 'НЕМА'}  заголовок ${c['заголовок px']}px`));
console.log(`\n   сторінка каруселі: ${out['висота сторінки каруселі']}px`);
console.log(`   уся Громада:       ${out['висота всієї Громади']}px`);
console.log(`   новини від видимої зони: ${Math.round(100 * (out.блоки.find(b => b.блок === 'cm-news-board')?.висота || 0) / VIEW)}%\n`);

await browser.close();
await stop();
