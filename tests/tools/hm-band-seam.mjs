// Прилад: ЧИ ЗЛИВАЄТЬСЯ БОРДОВА СМУГА ЗАПАСУ З САМИМ БЛОКОМ.
//
// Замовлення Вови 10.08: «зверху, коли я натягую сторінку, є цей бордовий блок,
// але він просто бордовий. Можеш зробити з лівого краю по праву градієнтом і
// переливом, як і сам блок… щоб воно зливалося просто. І так само в дошці».
//
// 🔬 ЩО САМЕ МІРЯЄМО — ПІКСЕЛІ, А НЕ ТЕКСТ CSS.
// «Зливається» — це властивість КАРТИНКИ, і перевіряти її читанням правил було б
// тим самим класом помилки, що вже коштував проєкту шести брехливих перевірок:
// правило можна написати правильно і все одно отримати шов. Тому прилад робить
// знімок і читає з нього ряди пікселів — останній ряд смуги і перший ряд блока —
// по всій ширині. Якщо шва немає, ряди збігаються.
//
// 🔑 ЧОМУ КЛОН, А НЕ ЖИВИЙ БЛОК. Смуга живе у `border-top` і в спокої лежить вище
// нуля прокрутки, накрита непрозорою `.app-header` — на екрані її просто нема
// чого знімати. Клон несе ТОЙ САМИЙ клас і ТУ САМУ ширину, тобто і градієнт, і
// рамка рахуються з тих самих чисел. Це не «схожий зразок», це той самий рецепт.
//
// 🔑 НАВІЩО ДВІ ЗОНИ В ОДНОМУ ПРИЛАДІ. Числа для смуги виводяться з ГЕОМЕТРІЇ
// блока (ширина екрана і висота самого блока), а вона в Громади й Дошки різна.
// Один прилад на дві зони не дає спокуси перенести підібране число з одної в
// іншу — він щоразу показує, що насправді дає ця зона.
//
// Запуск (руками, у стенди не входить — це вимірювач, не сторож):
//     node tests/tools/hm-band-seam.mjs                  ← Громада
//     TARGET=board node tests/tools/hm-band-seam.mjs      ← Дошка
//     CSS_REV=origin/main TARGET=board node …            ← стан до зміни
import { chromium } from 'playwright';
import { launch, serve, projectFile, pixelsOf, cloneForShot } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const REV = process.env.CSS_REV || '';
const TARGET = process.env.TARGET || 'home';
const ЗОНИ = {
  home:  { tab: 'community', sel: '.hm-top',      назва: 'Громада · .hm-top' },
  board: { tab: 'board',     sel: '.bd-titlebar', назва: 'Дошка · .bd-titlebar' },
};
const зона = ЗОНИ[TARGET];
if (!зона) { console.log(`невідомий TARGET=${TARGET}; є: ${Object.keys(ЗОНИ).join(', ')}`); process.exit(1); }

const NOW = new Date().toISOString();
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();
await mockSupabase(p,
  { posts: [{ id: 'p-1', type: 'board', category: 'sell', title: 'ВЕЛОСИПЕД', text: 'опис',
              price: '2500', location: 'Олика', author: 'Петро', owner_uid: 'u-o', contact: '',
              photos: [], status: 'published', published_at: NOW, created_at: NOW }],
    threads: [], messages: [], thread_user_state: [], announcements: [] },
  { user: ME, profiles: [{ uid: 'u-me', name: 'Вова', avatar_url: '' }] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  for (const f of ['style/home.css', 'style/board.css', 'style/community.css']) {
    const body = projectFile(f, REV);
    await p.route(`**/${f}`, r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
  }
}
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
await p.evaluate(t => window.switchTab && window.switchTab(t), зона.tab);
await p.waitForTimeout(1400);
if (зона.tab === 'board') {
  await p.evaluate(() => document.querySelector('.brules-ok')?.click());
  await p.waitForTimeout(800);
}

const геом = await cloneForShot(p, зона.sel);
if (!геом) { console.log(`❌ ${зона.sel} не знайдено`); await b.close(); await stop(); process.exit(1); }

const { w, px, ярк, hex } = await pixelsOf(p, '#seam-probe');
const R = геом.рамка;
const наX = f => Math.round(f * (w - 1));
const ЧАСТКИ = [0.02, 0.06, 0.26, 0.5, 0.8, 0.97];
const ряд = y => ЧАСТКИ.map(f => px(наX(f), y));

console.log(`\n${зона.назва}${REV ? `  (CSS_REV=${REV})` : ''}`);
console.log(`ширина ${w} · рамка(смуга) ${R}px · висота блока ${геом.висотаБлока}px`);
console.log('\nряд' + ' '.repeat(17) + ЧАСТКИ.map(f => `x=${Math.round(f * 100)}%`.padEnd(14)).join(''));
const друк = (наз, r) => console.log(наз.padEnd(20) + r.map(c => `${hex(c)}(${String(ярк(c)).padStart(5)})`.padEnd(14)).join(''));
if (R > 0) { друк('верх смуги', ряд(4)); друк('низ смуги', ряд(R - 2)); }
друк('верх блока', ряд(R + 1));

if (R > 0) {
  let шов = 0, деШов = 0;
  for (let x = 2; x < w - 2; x++) {
    const a = px(x, R - 2), c = px(x, R + 1);
    const d = Math.max(Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1]), Math.abs(a[2] - c[2]));
    if (d > шов) { шов = d; деШов = x; }
  }
  const низ = ряд(R - 2).map(ярк), верх = ряд(4).map(ярк);
  console.log(`\nШОВ (низ смуги ↔ верх блока): максимальна різниця каналу = ${шов} на x=${деШов}`);
  console.log(`ПЕРЕЛИВ унизу смуги: розмах ${(Math.max(...низ) - Math.min(...низ)).toFixed(1)}` +
              ` · угорі смуги: розмах ${(Math.max(...верх) - Math.min(...верх)).toFixed(1)}`);
} else {
  console.log('\nсмуги немає (border-top: 0) — показано лише верхній ряд блока,' +
              '\nсаме з нього виводиться колір правого краю майбутньої смуги.');
}
console.log('');

await ctx.close(); await b.close(); await stop();
