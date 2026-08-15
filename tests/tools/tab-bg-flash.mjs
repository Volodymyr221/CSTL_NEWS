// tests/tools/tab-bg-flash.mjs — КОНТРОЛЬНИЙ ДОСЛІД, не сторож.
//
// 🔴 ПИТАННЯ. Після фікса перемальовки (PR #921) Вова сказав: **«блим є досі»** —
// і слово, яким він описав колір, вказує не на фотографії, а на СВІТЛО.
//
// Що знайдено читанням коду:
//   • `switchTab` (`src/app.js`) СИНХРОННО ховає стару сторінку, показує нову
//     і переставляє `main.dataset.tab` — тобто вміст нової вкладки стає видимим
//     У ТОМУ Ж КАДРІ;
//   • але `.app-main` має `transition: background-color 0.3s ease` (`base.css`),
//     а фони вкладок РІЗНІ:
//        Громада  #1A0A0E  (майже чорний, `style/home.css`)
//        Стрічка  #ECEEF1  (світло-сірий, `--app-bg`)
//        Дошка    #E6E6E3  (`--board-bg`)
//   ➡️ Отже вміст нової вкладки малюється миттєво, а тло під ним ще 0.3 секунди
//     ПЕРЕТІКАЄ з кольору попередньої вкладки. Найбільший перепад — Громада ↔
//     Стрічка: з майже чорного у майже білий.
//
// ЩО МІРЯЄМО: колір тла `.app-main` по кадрах після перемикання, і скільки кадрів
// він відрізняється від кінцевого. Це «блим», який не має стосунку ні до
// перемальовки списку, ні до завантаження фотографій.
import { chromium } from 'playwright';
import { launch } from '../_lib.mjs';

const html = `<!doctype html><meta charset="utf-8"><style>
  *{box-sizing:border-box;margin:0;padding:0}
  html,body{height:100%}
  /* Рівно те, що в базі: спільний скролер із плавним фоном. */
  .app-main{height:100%;overflow-y:auto;transition:background-color 0.3s ease;background:#F5F1E8}
  .app-main[data-tab="community"]{background:#1A0A0E}
  .app-main[data-tab="shotam"]{background:#ECEEF1}
  .app-main[data-tab="board"]{background:#E6E6E3}
  .page{padding:12px;color:#111}
  .card{background:#fff;border-radius:12px;padding:14px;margin-bottom:10px}
</style>
<div class="app-main" id="main" data-tab="community">
  <div class="page" id="p-community">Громада</div>
  <div class="page" id="p-shotam" style="display:none">
    ${Array.from({ length: 6 }, (_, i) => `<div class="card">Допис ${i}</div>`).join('')}
  </div>
</div>
<script>
const main = document.getElementById('main');
// Те саме, що робить switchTab: синхронно ховаємо/показуємо і міняємо data-tab.
window.__switch = (to) => {
  document.getElementById('p-community').style.display = to === 'community' ? 'block' : 'none';
  document.getElementById('p-shotam').style.display    = to === 'shotam'    ? 'block' : 'none';
  main.dataset.tab = to;
};
window.__bg = () => getComputedStyle(main).backgroundColor;
</script>`;

const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
const p = await ctx.newPage();
await p.setContent(html);
await p.waitForTimeout(500);

async function run(to, label) {
  const frames = await p.evaluate(async (t) => {
    const out = [];
    window.__switch(t);
    for (let i = 0; i < 24; i++) { out.push(window.__bg()); await new Promise(r => requestAnimationFrame(r)); }
    return out;
  }, to);
  const final = frames[frames.length - 1];
  const off = frames.filter(f => f !== final).length;
  console.log(`\n── ${label}`);
  console.log(`   кінцевий фон: ${final}`);
  console.log(`   кадрів, де фон ІНШИЙ: ${off} (≈${Math.round(off * 16.7)}мс)`);
  console.log(`   перші кадри: ${frames.slice(0, 6).join(' · ')}`);
  return off;
}

console.log('🔬 ЧИ ПЕРЕТІКАЄ ТЛО ПІД УЖЕ НАМАЛЬОВАНИМ ВМІСТОМ');
console.log('   Вміст нової вкладки видно одразу, а `.app-main` міняє колір 0.3с.');

await run('shotam', 'Громада (майже чорна) → Стрічка (світла)');
await p.waitForTimeout(600);
await run('community', 'Стрічка → Громада');
await p.waitForTimeout(600);
await run('shotam', 'Громада → Стрічка (ще раз — саме цей шлях описував Вова)');

console.log('\n🔑 Якщо кадрів «іншого фону» багато — людина бачить, як під готовим');
console.log('   вмістом протікає чуже тло. Це і читається як «сторінка блимає».');

await b.close();
