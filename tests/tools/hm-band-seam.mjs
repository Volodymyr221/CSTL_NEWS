// Прилад: ЧИ ЗЛИВАЄТЬСЯ БОРДОВА СМУГА ЗАПАСУ З САМИМ БЛОКОМ (Громада).
//
// Замовлення Вови 10.08: «зверху, коли я натягую сторінку, є цей бордовий блок,
// але він просто бордовий. Можеш зробити з лівого краю по праву градієнтом і
// переливом, як і сам блок… щоб воно зливалося просто».
//
// 🔬 ЩО САМЕ МІРЯЄМО — ПІКСЕЛІ, А НЕ ТЕКСТ CSS.
// «Зливається» — це властивість КАРТИНКИ, і перевіряти її читанням правил було б
// тим самим класом помилки, що вже коштував проєкту шести брехливих перевірок:
// правило можна написати правильно і все одно отримати шов. Тому прилад робить
// знімок і читає з нього два ряди пікселів — останній ряд смуги і перший ряд
// блока — по всій ширині. Якщо шва немає, ряди збігаються.
//
// 🔑 ЧОМУ КЛОН, А НЕ ЖИВИЙ БЛОК. Смуга живе у `border-top` і в спокої лежить вище
// нуля прокрутки, накрита непрозорою `.app-header` — на екрані її просто нема
// чого знімати. Клон несе ТОЙ САМИЙ клас і ТУ САМУ ширину, тобто і градієнт, і
// рамка рахуються з тих самих чисел. Це не «схожий зразок», це той самий рецепт.
//
// Запуск (руками, у стенди не входить — це вимірювач, не сторож):
//     node tests/tools/hm-band-seam.mjs
//     CSS_REV=origin/main node tests/tools/hm-band-seam.mjs   ← до зміни
import { chromium } from 'playwright';
import { launch, serve, projectFile } from '../_lib.mjs';

const REV = process.env.CSS_REV || '';
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  const body = projectFile('style/home.css', REV);
  await p.route('**/style/home.css', r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
}
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(1200);

const рамка = await p.evaluate(() => {
  const el = document.querySelector('.hm-top');
  if (!el) return null;
  const s = getComputedStyle(el);
  // Клон у чистому контейнері: та сама ширина, та сама рамка, нульові поля —
  // щоб знімок містив УВЕСЬ border-box, включно зі смугою.
  const хост = document.createElement('div');
  хост.id = 'seam-probe';
  хост.style.cssText = `position:fixed;left:0;top:0;z-index:99999;width:${el.getBoundingClientRect().width}px;background:#000;`;
  const c = el.cloneNode(true);
  c.style.margin = '0';
  хост.appendChild(c);
  document.body.appendChild(хост);
  return { рамка: parseFloat(s.borderTopWidth), ширина: Math.round(el.getBoundingClientRect().width) };
});
if (!рамка) { console.log('❌ .hm-top не знайдено'); await b.close(); await stop(); process.exit(1); }

// 🔴 ЗНІМОК РОЗБИРАЄ САМ БРАУЗЕР, а не саморобний читач PNG.
// Перша редакція цього приладу декодувала PNG руками — і видала кислотні
// `#00ffff` / `#feff00` там, де на екрані бордо. Тобто прилад брехав першим же
// прогоном (черговий випадок у довгому ряду; правило проєкту: спершу зміряй,
// що дає порівняння стану з самим собою). Тепер байти повертаються в сторінку і
// їх декодує `createImageBitmap` — той самий код, що малює цей PNG на екрані.
const buf = await p.locator('#seam-probe').screenshot();
const png = await p.evaluate(async b64 => {
  const бін = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
  const bmp = await createImageBitmap(new Blob([бін], { type: 'image/png' }));
  const cv = new OffscreenCanvas(bmp.width, bmp.height);
  const g = cv.getContext('2d', { willReadFrequently: true });
  g.drawImage(bmp, 0, 0);
  const d = g.getImageData(0, 0, bmp.width, bmp.height).data;
  return { w: bmp.width, h: bmp.height, out: Array.from(d) };
}, buf.toString('base64'));

const { w, h, out } = png;
const піксель = (x, y) => { const o = (y * w + x) * 4; return [out[o], out[o + 1], out[o + 2]]; };

// ── 0. САМОПЕРЕВІРКА ЧИТАЧА: відомий колір мусить прочитатись точно ─────────
// Без цього кроку будь-яке число нижче — віра, а не замір.
const еталон = await (async () => {
  await p.evaluate(() => {
    const d = document.createElement('div');
    d.id = 'seam-selftest';
    d.style.cssText = 'position:fixed;left:0;top:0;z-index:99999;width:40px;height:40px;background:#5E1723;';
    document.body.appendChild(d);
  });
  const sb = await p.locator('#seam-selftest').screenshot();
  const px = await p.evaluate(async b64 => {
    const бін = Uint8Array.from(atob(b64), c => c.charCodeAt(0));
    const bmp = await createImageBitmap(new Blob([бін], { type: 'image/png' }));
    const cv = new OffscreenCanvas(bmp.width, bmp.height);
    const g = cv.getContext('2d', { willReadFrequently: true });
    g.drawImage(bmp, 0, 0);
    const d = g.getImageData(20, 20, 1, 1).data;
    return [d[0], d[1], d[2]];
  }, sb.toString('base64'));
  await p.evaluate(() => document.getElementById('seam-selftest')?.remove());
  return px;
})();
const еталонОк = еталон[0] === 0x5E && еталон[1] === 0x17 && еталон[2] === 0x23;
console.log(`\nсамоперевірка читача: #5E1723 прочитано як rgb(${еталон.join(',')}) → ${еталонОк ? 'ОК' : '❌ ЧИТАЧ БРЕШЕ'}`);
if (!еталонОк) { await b.close(); await stop(); process.exit(1); }
const R = рамка.рамка;

// ── 1. ШОВ: останній ряд смуги проти першого ряду блока ─────────────────────
let максШов = 0, деШов = 0;
for (let x = 2; x < w - 2; x++) {
  const a = піксель(x, R - 2), c = піксель(x, R + 1);
  const d = Math.max(Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1]), Math.abs(a[2] - c[2]));
  if (d > максШов) { максШов = d; деШов = x; }
}

// ── 2. ПЕРЕЛИВ: чи смуга справді світліша ліворуч ───────────────────────────
const ряд = y => [0.06, 0.26, 0.5, 0.8, 0.97].map(k => піксель(Math.round(k * (w - 1)), y));
const ярк = ([r, g, bl]) => +(0.2126 * r + 0.7152 * g + 0.0722 * bl).toFixed(1);
const низСмуги = ряд(R - 2), верхСмуги = ряд(4), верхБлока = ряд(R + 1);

const hex = ([r, g, bl]) => '#' + [r, g, bl].map(v => v.toString(16).padStart(2, '0')).join('');
console.log(`\nширина ${w} · висота знімка ${h} · рамка ${R}px${REV ? `  (CSS_REV=${REV})` : ''}`);
console.log('\nряд                 x=6%      x=26%     x=50%     x=80%     x=97%');
const рядок = (наз, r) => console.log(`${наз.padEnd(20)}${r.map(c => `${hex(c)}(${String(ярк(c)).padStart(4)})`).join(' ')}`);
рядок('верх смуги', верхСмуги);
рядок('низ смуги', низСмуги);
рядок('верх блока', верхБлока);
console.log(`\nШОВ (низ смуги ↔ верх блока): максимальна різниця каналу = ${максШов} на x=${деШов}`);
console.log(`ПЕРЕЛИВ у низу смуги: ліво ${ярк(низСмуги[0])} · пік ${ярк(низСмуги[1])} · право ${ярк(низСмуги[4])}` +
            `  → розмах ${(ярк(низСмуги[1]) - ярк(низСмуги[4])).toFixed(1)}`);
console.log(`ПЕРЕЛИВ угорі смуги: розмах ${(ярк(верхСмуги[1]) - ярк(верхСмуги[4])).toFixed(1)}\n`);

await ctx.close(); await b.close(); await stop();
