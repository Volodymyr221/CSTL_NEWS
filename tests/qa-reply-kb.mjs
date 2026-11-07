// Стенд: ПИТАННЯ ДОШКИ — «ВІДПОВІСТИ» ПРИ ВІДКРИТІЙ КЛАВІАТУРІ (07.11.2026).
//
// Близнюк `tests/comment-reply-kb.mjs` (Стрічка). 🗣️ Вова 31.10 про Стрічку:
// «такі функції мають працювати відразу… це треба перевірити, можливо, ще десь
// так працює погано». Ще десь — саме тут: кнопки екрана питання («Відповісти»,
// «Редагувати», «Ще N») стояли без жодних ліків, а ✕ — теж.
// 🍎 Модель iOS та сама: дотик до кнопки закінчився і ніхто його не перехопив →
// поле втрачає фокус (= клавіатура ховається). Пояснення — у близнюка.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

const t0 = Date.now() - 5 * 864e5;
const POSTS = [
  { id: 701, type: 'chat', text: 'Коли буде концерт на День міста?', title: null,
    author: 'Олена', owner_uid: 'u-olena', status: 'published', location: null, tags: [],
    ts: t0, created_at: new Date(t0).toISOString(), published_at: new Date(t0).toISOString() },
];
const відп = (id, author, uid, text, dt) => ({ id, post_id: 701, author, text, sender_uid: uid,
  reply_to_id: null, created_at: new Date(t0 + dt).toISOString(), edited_at: null, deleted_at: null, client_tag: null });
const COMMENTS = [
  відп(5001, 'Віктор Пилипчук', 'u-viktor', 'Начебто 24 серпня.', 36e5),
  відп(5003, 'Оксана Ковальчук', 'u-oksana', 'Афішу вже повісили біля клубу.', 40e5),
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
await ctx.addInitScript(() => {
  window.__ios = { сховалась: 0 };
  window.addEventListener('touchend', e => {
    if (e.defaultPrevented || !e.target.closest || !e.target.closest('button')) return;
    const a = document.activeElement;
    if (a && a.matches && a.matches('input, textarea')) { a.blur(); window.__ios.сховалась++; }
  });
});
const p = await ctx.newPage();
await mockSupabase(p, { posts: POSTS, comments: COMMENTS, announcements: [], reactions: [], saved_posts: [] },
                   { user: { id: 'u-me', name: 'Я' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url + '#/post/disc/701', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForFunction(() => document.querySelectorAll('.qa-answer-reply').length >= 2, null, { timeout: 8000 }).catch(() => {});

const кнопок = await p.evaluate(() => document.querySelectorAll('.qa-answer-reply').length);
ok('сцена: екран питання відкрито, «Відповісти» є', кнопок >= 2, `кнопок: ${кнопок}`);

const cdp = await ctx.newCDPSession(p);
const тап = async (sel) => {
  const { x, y } = await p.evaluate(s => { const el = document.querySelector(s); el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; }, sel);
  await p.waitForTimeout(250);   // тиша після scrollIntoView — інакше захист «спиняли прокрутку»
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y }] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
};
const стан = () => p.evaluate(() => {
  const i = document.querySelector('.qa-input');
  // Смужку міряємо атрибутом \`hidden\` — саме ним її вмикає \`showDiscCompose\`.
  const bar = document.getElementById('bd-compose');
  return { фокус: document.activeElement === i, смужка: !!bar && !bar.hidden,
    текст: document.getElementById('bd-compose-title')?.textContent || '', сховалась: window.__ios.сховалась };
});

await p.evaluate(() => document.querySelector('.qa-input')?.focus());
await p.waitForTimeout(200);
ok('контроль: поле у фокусі (клавіатура «відкрита»)', (await стан()).фокус);

await тап('[data-answer-reply="5003"]');
await p.waitForTimeout(250);
const s1 = await стан();
ok('🔴 «Відповісти» при відкритій клавіатурі НЕ ховає її', s1.фокус && s1.сховалась === 0,
   `фокус: ${s1.фокус}, ховалась разів: ${s1.сховалась}`);
ok('🔴 і з першого тапу видно смужку «ВІДПОВІДЬ: …»', s1.смужка && /ВІДПОВІДЬ/.test(s1.текст), JSON.stringify(s1));

await тап('#bd-compose-x');
await p.waitForTimeout(200);
const s2 = await стан();
ok('✕ знімає відповідь і не ховає клавіатуру', !s2.смужка && s2.фокус && s2.сховалась === 0, JSON.stringify(s2));

await b.close(); await stop();
done();
