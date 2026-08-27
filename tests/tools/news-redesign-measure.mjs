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
// Мережа назовні не потрібна: статті лежать у репозиторії.
await page.route('**://*.supabase.co/**', r => r.abort());
await page.route('**://api.open-meteo.com/**', r => r.abort());
// 🔴 ЧУЖІ ФОТО ПІДМІНЮЄМО СВОЇМ, А НЕ РІЖЕМО. Хости джерел із цього середовища
// недосяжні, і без підміни КОЖНА картка малювалась би запасним виглядом — тобто
// вигляд «з фотографією», заради якого редизайн і робиться, ніколи не потрапляв
// би в замір. Підміна дає обидва випадки чесно: фото є там, де воно є в даних.
const фото = (await import('node:fs')).readFileSync('images/kino-castle.jpg');
await page.route(/(img\.konkurent|uimg\.pravda|static\.rayon|rada\.info|upload\.wikimedia)/,
  r => r.fulfill({ contentType: 'image/jpeg', body: фото }));
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
  // 🔴 ЧИ ВЛАЗИТЬ ТЕКСТ У ВУАЛЬ. Вова: «чому все не влазить? Треба все бачити».
  // Заголовок і анонс лежать ПОВЕРХ фотографії й читаються лише завдяки вуалі.
  // Якщо текстовий блок переріс вуаль — верхній рядок опиняється на голому фото,
  // і на світлому знімку його не видно взагалі. Міряємо наслідок, не висоту в CSS.
  const вуаль = [...n.querySelectorAll('.nc--hero')].map(c => {
    const b = c.querySelector('.nc-body'), v = c.querySelector('.nc-veil');
    if (!b || !v) return null;
    const hb = b.getBoundingClientRect().height, hv = v.getBoundingClientRect().height;
    return { текст: Math.round(hb), вуаль: Math.round(hv), влазить: hb <= hv,
             'чисте фото': Math.round(c.getBoundingClientRect().height - hb) };
  }).filter(Boolean);
  const сторінка = n.querySelector('.hm-npage');
  return {
    вуаль,
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
console.log('\n── Текст поверх фото: чи влазить у вуаль ──');
out.вуаль.forEach((v, i) => console.log(
  `   картка ${i + 1}: текст ${String(v.текст).padStart(3)}px, вуаль ${String(v.вуаль).padStart(3)}px  ` +
  `${v.влазить ? '✅ влазить' : '❌ ВИЛІЗАЄ'}  · чистого фото зверху ${v['чисте фото']}px`));
console.log(`\n   сторінка каруселі: ${out['висота сторінки каруселі']}px`);
console.log(`   уся Громада:       ${out['висота всієї Громади']}px`);
console.log(`   новини від видимої зони: ${Math.round(100 * (out.блоки.find(b => b.блок === 'cm-news-board')?.висота || 0) / VIEW)}%\n`);

await browser.close();
await stop();
