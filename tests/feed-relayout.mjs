// Стенд: ПОВОРОТ ЕКРАНА У «СТРІЧЦІ» НЕ ЛАМАЄ ЗАСТОСУНОК.
//
// 🔴 ЗАРАДИ ЧОГО ВІН ІСНУЄ (17.09). У журналі збоїв застосунку лежала жива
// помилка акаунта Вови, 3 випадки, остання 09.09:
//     ReferenceError: Can't find variable: relayoutCards
// Слухач `resize` у `initFeed` останнім рядком кликав `relayoutCards` — функцію,
// якої в коді НЕМАЄ ЖОДНОЇ. Тобто при кожній зміні ШИРИНИ екрана (поворот
// телефона) обробник падав на півдорозі: список `#feed-list` перемірятись
// устигав, а екрани сторінок (`.fd-screen`) — ні. Людина бачила кнопку
// «Показати більше» там, де ховати вже нічого, або текст без кнопки.
//
// ⚙️ ЧОМУ ЦЬОГО НЕ БАЧИВ ЖОДЕН ІЗ 148 СТЕНДІВ. Помилка жила ЛИШЕ всередині
// обробника і ЛИШЕ при зміні ширини. Ні збірка, ні `node --check`, ні будь-який
// текстовий сторож туди не заглядають: синтаксис бездоганний, а імені не існує
// тільки під час виконання. Побачив це живий телефон Вови — і журнал збоїв,
// заведений 22.08 саме для таких випадків.
//
// 🔑 ЩО САМЕ МІРЯЄМО — ДВІ РІЗНІ РЕЧІ, І ОБИДВІ ПОТРІБНІ:
//   1. поворот не кидає помилки (рівно те, що записав журнал);
//   2. після повороту ПЕРЕМІРЯНО САМЕ ЕКРАН СТОРІНКИ — той бік, який і губився.
// Друга перевірка важлива окремо: прибрати виклик зовсім теж прибрало б помилку,
// але лишило б розкладку старою. Зелене «не падає» без неї брехало б.
//
// ⚠️ `serviceWorkers: 'block'` — інакше застосунок приїжджає з кешу SW, повз
// заглушку бази (у цьому проєкті вже вісім разів через це брехали перевірки).
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

const PAGES = [
  { id: 1, name: 'Туристична Олика', sort_order: 0, avatar_url: null, is_system: false },
];
const POSTS = [{
  id: 101, page_id: 1, text: 'Короткий допис.', photos: [], author_uid: 'u1',
  show_author: false, status: 'published', deleted_at: null,
  created_at: new Date().toISOString(),
}];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

// Помилки сторінки збираємо ТАК САМО, як їх бачить застосунок у людини:
// `pageerror` — це те, що долітає до `window.addEventListener('error')`, тобто
// до нашого журналу збоїв.
const помилки = [];
p.on('pageerror', e => помилки.push(String(e && e.message || e)));

await mockSupabase(p, { pages: PAGES, page_posts: POSTS });
await p.route('**://api.open-meteo.com/**', r => r.abort());

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(200);
await p.evaluate(() => window.switchTab && window.switchTab('shotam'));
await p.waitForTimeout(1800);

// ── КОНТРОЛЬ ПЕРШОГО ПОРЯДКУ: сцена взагалі зібралась ──────────────────────
// Якщо Стрічка не намалювалась, слухач `resize` не поставлено, і все нижче
// зеленіло б над мертвим екраном. Це та сама пастка, що ловила проєкт раніше.
const зібралось = await p.evaluate(() =>
  !!document.getElementById('page-shotam')?.dataset.fdWired);
ok('контроль: Стрічку відкрито і слухачі поставлено', зібралось,
   зібралось ? '' : 'page-shotam без data-fdWired — сцена не зібралась');

// Відкриваємо ЕКРАН СТОРІНКИ — саме він губився при повороті.
await p.evaluate(() => document.querySelector('[data-open-page]')?.click());
await p.waitForTimeout(1200);
const екранЄ = await p.evaluate(() => !!document.querySelector('.fd-screen .fd-text'));
ok('контроль: екран сторінки відкрито', екранЄ,
   екранЄ ? '' : 'немає .fd-screen .fd-text');

// Робимо текст ДОВГИМ уже після того, як екран намалювався. Кнопки «Показати
// більше» зараз бути не може: перемір відбувся, коли текст був коротким.
// 🔑 Це не підгонка сцени, а рівно той стан, який створює поворот: розкладка
//    на екрані більше не відповідає тексту, і її мусить полагодити перемір.
await p.evaluate(() => {
  const el = document.querySelector('.fd-screen .fd-text');
  el.textContent = 'Олика '.repeat(400);
});
await p.waitForTimeout(200);
const доПовороту = await p.evaluate(() =>
  !!document.querySelector('.fd-screen .fd-more'));
ok('контроль: до повороту кнопки «Показати більше» немає', !доПовороту,
   доПовороту ? 'кнопка вже є — сцена нічого не доведе' : '');

// ── СЦЕНА: людина повернула телефон ────────────────────────────────────────
// Міняємо саме ШИРИНУ: обробник навмисно ігнорує зміну лише висоти (клавіатура,
// адресний рядок на iOS), тож зміна висоти нічого б не запустила.
помилки.length = 0;
await p.setViewportSize({ width: 844, height: 390 });
await p.waitForTimeout(1200);

const refError = помилки.filter(m => /relayoutCards|Can't find variable|is not defined/.test(m));
ok('🔴 поворот екрана не кидає помилки в застосунку',
   refError.length === 0, refError.join(' · ') || 'помилок немає');

const післяПовороту = await p.evaluate(() =>
  !!document.querySelector('.fd-screen .fd-more'));
ok('🔴 після повороту ЕКРАН СТОРІНКИ переміряно (кнопка зʼявилась)',
   післяПовороту, післяПовороту ? '' : 'кнопки немає — .fd-screen лишився непереміряним');

// ── КОНТРОЛЬ: прилад уміє червоніти ────────────────────────────────────────
// Без цього рядка «помилок немає» доводило б лише те, що ми їх не ловимо.
await p.evaluate(() => {
  window.addEventListener('resize', () => { неіснуючаФункціяДляКонтролю(); });
});
помилки.length = 0;
await p.setViewportSize({ width: 390, height: 844 });
await p.waitForTimeout(600);
ok('контроль: стенд справді бачить ReferenceError із обробника resize',
   помилки.some(m => /Can't find variable|is not defined/.test(m)),
   помилки.join(' · ') || '(нічого не спіймано — прилад сліпий)');

await b.close(); await stop();
done();
