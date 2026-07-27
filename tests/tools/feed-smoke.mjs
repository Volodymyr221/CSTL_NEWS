// ІНСТРУМЕНТ (запускається руками): `node tests/tools/feed-smoke.mjs`
//
// Піднімає СПРАВЖНІЙ застосунок у Chromium і дивиться, чи він не сипле помилками
// після змін у «Стрічці». Supabase із пісочниці недосяжний, тому перевіряємо саме
// те, що від мережі не залежить: застосунок запускається, вкладки перемикаються,
// у зібраному `bundle.js` є весь новий код.
//
// ⚠️ Це НЕ заміна живому тесту на iPhone: Chromium не відтворює ні клавіатуру iOS,
// ні відсутність `overflow-anchor` у Safari. Він ловить падіння й помилки консолі.
import { chromium } from 'playwright';
import { launch, serve, blockExternal } from '../_lib.mjs';

const srv = await serve();
const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
// ⚠️ Записуємо ще й АДРЕСУ ресурсу. Без неї повідомлення «Failed to load resource: 404»
// нічого не доводить: то може бути і чужий сервіс, і справді загублений файл проєкту.
const errors = [];
page.on('console', m => {
  if (m.type() !== 'error') return;
  const url = m.location()?.url || '';
  errors.push(url ? `${m.text()}  ← ${url}` : m.text());
});
page.on('pageerror', e => errors.push('PAGEERROR: ' + e.message));
await blockExternal(page);

await page.goto(srv.url + '/index.html', { waitUntil: 'load' });
await page.waitForTimeout(2500);

// Перемикаємось на «Стрічку» і назад — там живе весь змінений код.
for (const tab of ['shotam', 'community', 'shotam', 'board']) {
  await page.click(`.tab-item[data-tab="${tab}"]`).catch(() => {});
  await page.waitForTimeout(700);
}

const state = await page.evaluate(() => ({
  feedList: !!document.getElementById('feed-list'),
  tabs: document.querySelectorAll('.tab-item').length,
  visible: document.querySelector('.page.active')?.id || null,
}));

const bundle = await (await fetch(srv.url + '/bundle.js')).text();
const need = ['keepScroll', 'patchPostCard', 'insertPostCard', 'removePostCard', 'reorderPagePosts', 'pagePostsOf'];
const missing = need.filter(n => !bundle.includes(n));

// Мережеві помилки очікувані (пісочниця без інтернету) — вони не про наш код.
const real = errors.filter(e => !/supabase|Failed to fetch|net::|ERR_|open-meteo|manifest|icon/i.test(e));

console.log(`вкладка: ${state.visible} · список стрічки: ${state.feedList} · кнопок таб-бару: ${state.tabs}`);
console.log(`нового коду бракує у bundle.js: ${missing.length ? missing.join(', ') : 'нічого'}`);
console.log(`помилок консолі (без мережевих): ${real.length}`);
real.slice(0, 10).forEach(e => console.log('  ❌', e.slice(0, 200)));
console.log(`усіх повідомлень про помилки, разом із мережевими: ${errors.length}`);

await browser.close(); await srv.stop();
process.exit(real.length || missing.length ? 1 : 0);
