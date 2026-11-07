// Стенд: «ВІДПОВІСТИ» ПРИ ВІДКРИТІЙ КЛАВІАТУРІ — З ПЕРШОГО ТАПУ (07.11.2026).
//
// 🗣️ Вова 31.10: «Пишу коментар, а потім в тому самому режимі, коли відкрита
// клавіатура, натискаю "Відповісти" — клавіатура ховається і не виділяється,
// кому я відповідаю. Тільки коли клавіатура заховалася і я знову натискаю —
// відкривається. А мало б відразу.»
//
// 🔑 ЧОМУ ЗВИЧАЙНИЙ ТЕСТ ЦЕ ПРОПУСКАВ. Chromium тримає фокус у полі, якщо на
// `pointerdown` стоїть `preventDefault` (старі ліки 26.07), — тож тут усе
// зеленіло. iOS переносить фокус на мишачих подіях ПІСЛЯ `touchend`, і зупиняє
// це лише `preventDefault` на самому `touchend` (урок 09.10, `core/keyboard.js`).
// 🍎 Тому на сторінці стоїть МОДЕЛЬ iOS: дотик до кнопки закінчився і ніхто його
// не перехопив → поле втрачає фокус (= клавіатура ховається).
// 📐 Мутацію перевірено 07.11: на коді до правки стенд червоніє рівно тут.
//
// Сцена справжня: застосунок, Стрічка, лист коментарів, два коментарі.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);

const iso = m => new Date(Date.now() - m * 60000).toISOString();
const pages = [{ id: 1, name: 'Olyka Castle', sort_order: 1 }];
const page_posts = [{ id: 701, page_id: 1, author: 'x', author_uid: 'u', text: 'Допис для коментарів.',
  image_urls: [], photos: [], created_at: iso(30), status: 'published', pages: { name: 'Olyka Castle', avatar_url: null } }];
const page_comments = [
  { id: 9001, post_id: 701, author_uid: 'u-a', text: 'Перший коментар', parent_id: null, created_at: iso(20) },
  { id: 9002, post_id: 701, author_uid: 'u-b', text: 'Другий коментар', parent_id: null, created_at: iso(10) },
];

const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  try { localStorage.setItem('cstl-legal-consent-v1', '05.10.2026'); } catch (_) {}
  window.__ios = { сховалась: 0 };
  // 🍎 Модель iOS — див. шапку. Вішається на window, тобто ПІСЛЯ всіх слухачів
  // застосунку: бачить, чи хтось перехопив дотик.
  window.addEventListener('touchend', e => {
    if (e.defaultPrevented || !e.target.closest || !e.target.closest('button')) return;
    const a = document.activeElement;
    if (a && a.matches && a.matches('input, textarea')) { a.blur(); window.__ios.сховалась++; }
  });
});
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], pages, page_posts, page_comments },
  { user: { id: 'uid-me', email: 'me@example.com', user_metadata: { full_name: 'Вова' } } });
await p.goto(url + '/index.html');
await p.waitForTimeout(3500);
await p.getByText('Поки пропустити').click({ timeout: 500 }).catch(() => {});
await p.evaluate(() => window.switchTab('shotam'));
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('[data-comments="701"]')?.click());
await p.waitForTimeout(1500);

const кнопок = await p.evaluate(() => document.querySelectorAll('.fd-com-sheet .fd-com-reply').length);
ok('сцена: лист відкрито, кнопки «Відповісти» є', кнопок >= 2, `кнопок: ${кнопок}`);

const cdp = await ctx.newCDPSession(p);
const тап = async (sel) => {
  const { x, y } = await p.evaluate(s => { const r = document.querySelector(s).getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const стан = () => p.evaluate(() => {
  const i = document.querySelector('.fd-com-input');
  const bar = document.querySelector('.fd-com-replybar');
  return { фокус: document.activeElement === i, смужка: bar && !bar.hidden,
    кому: document.querySelector('.fd-com-replyto')?.textContent || '',
    підсвічено: [...document.querySelectorAll('.fd-com-row--replying')].map(r => r.dataset.comId),
    сховалась: window.__ios.сховалась };
});

// ── «Клавіатура відкрита»: фокус у полі, як після тапу в нього ───────────────
await p.evaluate(() => document.querySelector('.fd-com-input').focus());
await p.waitForTimeout(200);
ok('контроль: поле у фокусі (клавіатура «відкрита»)', (await стан()).фокус);

// ── 🔴 ГОЛОВНЕ: «Відповісти» на другому коментарі ───────────────────────────
await тап('[data-com-id="9002"] .fd-com-reply');
await p.waitForTimeout(250);
const s1 = await стан();
ok('🔴 клавіатура НЕ ховається від тапу «Відповісти»', s1.фокус && s1.сховалась === 0,
   `фокус: ${s1.фокус}, ховалась разів: ${s1.сховалась}`);
ok('🔴 з першого тапу — смужка «Відповідь для …» зʼявилась', s1.смужка && /Відповідь для/.test(s1.кому),
   `смужка: ${s1.смужка}, текст: ${JSON.stringify(s1.кому)}`);
ok('🔴 і підсвічено САМЕ той коментар, на якому натиснули', s1.підсвічено.includes('9002'),
   `підсвічено: ${JSON.stringify(s1.підсвічено)}`);

// ── Перемкнутись на інший коментар — так само одразу ────────────────────────
await тап('[data-com-id="9001"] .fd-com-reply');
await p.waitForTimeout(250);
const s2 = await стан();
ok('🔴 перемкнути відповідь на інший коментар — теж з першого тапу, без ховання',
   s2.фокус && s2.сховалась === 0 && s2.підсвічено.includes('9001') && !s2.підсвічено.includes('9002'),
   JSON.stringify(s2));

// ── ✕ скасувати відповідь — клавіатура лишається ────────────────────────────
await тап('.fd-com-replyx');
await p.waitForTimeout(200);
const s3 = await стан();
ok('✕ знімає відповідь і не ховає клавіатуру', !s3.смужка && s3.фокус && s3.сховалась === 0, JSON.stringify(s3));

await b.close(); await stop();
done();
