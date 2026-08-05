// tests/tools/board-audit.mjs — ЖИВИЙ ОБМІР ДОШКИ (05.08.2026).
//
// Інструмент, не стенд: нічого не «падає», він просто називає числа. Запуск
// руками: `node tests/tools/board-audit.mjs`.
//
// ⚠️ ЩО ЦЕЙ ОБМІР МОЖЕ І ЧОГО НЕ МОЖЕ — сказано чесно, бо саме на цьому вже
// шість разів брехала перевірка в цьому проєкті:
//   • Supabase із пісочниці НЕДОСЯЖНИЙ (проксі віддає 403), тому оголошень тут
//     немає і бути не може. Отже все, що стосується СПИСКУ карток, цей
//     інструмент НЕ МІРЯЄ — і не вдає, що міряє;
//   • зате він міряє те, що від даних не залежить: хром вкладки (шапка, пошук,
//     чіпи, FAB), ПОРОЖНІЙ СТАН і гейт правил. Порожній стан — не екзотика: його
//     бачить кожен новий користувач до завантаження і кожен, у кого впала мережа.
// 🔴 `serviceWorkers: 'block'` обовʼязково: без нього запити йдуть повз
// `page.route`, і підміна тихо не діє (восьмий випадок брехливої перевірки).
import { chromium } from 'playwright';
import { chromiumPath, serve, ROOT } from '../_lib.mjs';
import { join } from 'path';

const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 },
  deviceScaleFactor: 2, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errors = [];
p.on('console', m => { if (m.type() === 'error') errors.push(m.text().slice(0, 120)); });
p.on('pageerror', e => errors.push('PAGEERROR ' + String(e).slice(0, 120)));
await p.route('**://*.supabase.co/**', r => r.abort());
await p.route('**://api.open-meteo.com/**', r => r.abort());

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
// Банер згоди і гейт правил Дошки — обидва `fixed` і перехоплюють тапи.
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(300);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(2500);

const gate = await p.evaluate(() => {
  const g = document.querySelector('.app-modal--brules');
  return { є: !!g, кнопка: g?.querySelector('.brules-ok')?.textContent.trim() };
});
await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await p.waitForTimeout(1200);

const M = await p.evaluate(() => {
  const R = el => el ? el.getBoundingClientRect() : null;
  const px = r => r ? Math.round(r.height) : 0;
  const head = document.querySelector('#board-content .bd-controls');
  const search = document.querySelector('#board-content .bd-search');
  const types = document.querySelector('#board-content .bd-types');
  const list = document.querySelector('#board-content .bd-ads');
  const fab = document.querySelector('.board-trigger--fixed, .cm-board-trigger');
  const cards = document.querySelectorAll('#board-content .cm-board-note');
  const vp = window.innerHeight;

  // Що взагалі видно на першому екрані — по точках, а не за списком класів.
  const seen = new Set();
  for (let y = 100; y < vp - 90; y += 12) {
    for (const el of document.elementsFromPoint(195, y)) {
      const c = (el.className || '').toString();
      if (typeof c === 'string' && /bd-|cm-board|board-/.test(c)) { seen.add(c.split(' ')[0]); break; }
    }
  }
  // Порожній стан: чи сказано людині щось осмислене, коли карток нема.
  const body = document.querySelector('#board-content')?.innerText || '';
  return {
    висотаШапки: px(R(head)),
    пошук: px(R(search)),
    чіпи: px(R(types)),
    чіпівШт: document.querySelectorAll('#board-content .bd-types button, #board-content .bd-types .bd-type').length,
    карток: cards.length,
    висотаСписку: px(R(list)),
    fab: fab ? `${Math.round(R(fab).width)}×${Math.round(R(fab).height)}` : 'НЕМАЄ',
    доПершоїКартки: cards[0] ? Math.round(R(cards[0]).top) : null,
    видимеНаЕкрані: [...seen],
    текстПорожнього: body.replace(/\s+/g, ' ').trim().slice(0, 160),
    скролУсього: document.querySelector('#board-content')?.scrollHeight || 0,
  };
});

console.log('── ГЕЙТ ПРАВИЛ ──');
console.log(JSON.stringify(gate));
console.log('── ХРОМ І ПОРОЖНІЙ СТАН ──');
console.log(JSON.stringify(M, null, 1));
console.log('── ПОМИЛКИ КОНСОЛІ ──');
console.log(errors.length ? errors.join('\n') : 'немає');

await p.screenshot({ path: join(ROOT, 'tests/tools/_shots', 'board-empty.png') });
console.log('📸 tests/tools/_shots/board-empty.png');
await b.close(); await stop();
