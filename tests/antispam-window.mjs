// tests/antispam-window.mjs — АНТИСПАМ МАЄ ВІКНО, 25.08.2026.
//
// 🔴 ЧОМУ ЦЕЙ СТЕНД ЗАВЕДЕНО. Скарга Вови: «я вчора написав повідомлення,
// сьогодні зранку не можу те саме слово написати».
//
// Вада була структурна, а не випадкова: рейт-ліміт мав вікно (8 повідомлень за
// 15с), а перевірка на дубль — НЕ МАЛА ЖОДНОГО. Порівнювався останній надісланий
// текст, і збіг блокував відправку НАЗАВЖДИ, поки людина не напише в тому ж
// місці щось інше. Через це найкоротші й найприродніші відповіді — «Окей»,
// «Дякую», «Так» — блокувались НАЙНАДІЙНІШЕ: саме їх і пишуть повторно.
//
// 🛑 І до 25.08 цю поведінку не перевіряв НІХТО: `grep isDuplicateMsg tests/`
// давав нуль. Тобто правило, яке щодня стоїть між людиною і кнопкою
// «Надіслати», жило зовсім без сторожа.
//
// 🔑 МІРЯЄМО НАСЛІДОК, А НЕ ФУНКЦІЮ. `isDuplicateMsg` лежить усередині бандла і
// назовні не виставлена — і виставляти її заради тесту не можна (це змінило б
// код заради перевірки). Тому стенд іде тим самим шляхом, що людина: пише
// відповідь у справжньому питанні, дивиться на тост і на список.
//
// 🔑 ГОДИННИК ПІДМІНЕНО (`clock.install`), бо половина сцени — про ЧАС. На
// живому годиннику довелось би реально чекати 15 секунд, і стенд або гальмував
// би прогін, або міряв би не те.
//
// ⚠️ МЕЖІ. Стенд перевіряє КЛІЄНТСЬКУ половину правила. Друга половина —
// тригери `comments_antispam` / `page_comments_antispam` у базі; вони доведені
// окремо, транзакцією з відкотом на живій базі (запис у
// `scripts/supabase_antispam_shared.sql`). Числа мусять збігатися в обох
// місцях, інакше людина побачить «надіслано», а база мовчки відхилить.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/antispam-window.mjs
//    → перевірка 3 падає (на старому коді дубль блокується і через годину).

import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const BUNDLE_REV = process.env.BUNDLE_REV || '';

const БАЗА = new Date('2026-08-25T09:00:00Z').getTime();
const t0 = БАЗА - 5 * 864e5;

const POSTS = [
  { id: 801, type: 'chat', text: 'Коли вивозять сміття?', title: null,
    author: 'Олена', owner_uid: 'u-olena', status: 'published', location: null, tags: [],
    ts: t0, created_at: new Date(t0).toISOString(), published_at: new Date(t0).toISOString() },
];
const COMMENTS = [];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

if (BUNDLE_REV) {
  const old = projectFile('bundle.js', BUNDLE_REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
}

await p.clock.install({ time: БАЗА });
await mockSupabase(p, { posts: POSTS, comments: COMMENTS, announcements: [],
                        reactions: [], saved_posts: [] },
                  { user: { id: 'u-me', name: 'Я' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.clock.runFor(3000);
await p.waitForTimeout(1200);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(200);
await p.evaluate(() => window.switchTab && window.switchTab('discussions'));
await p.waitForTimeout(800);

// Відкриваємо питання
await p.evaluate(() => document.querySelector('#disc-content .qa-row[data-post-id="801"]')?.click());
await p.waitForTimeout(700);

// Надіслати текст і повернути ПРИРІСТ відповідей + тост.
// 🔑 Саме приріст, а не накопичена сума: при сумі одне падіння зсуває всі
// наступні числа, і три перевірки червоніють через одну ваду. Приріст робить
// кожен крок незалежним — падає рівно те, що справді зламане.
async function надіслати(текст) {
  const було = await p.evaluate(() =>
    document.querySelectorAll('.qa-screen .qa-answer').length);
  await p.evaluate(() => { document.querySelectorAll('.toast').forEach(t => t.remove()); });
  await p.evaluate((t) => {
    const input = document.querySelector('.qa-screen [data-comment-input]');
    if (!input) return;
    input.value = t;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }, текст);
  await p.waitForTimeout(120);
  await p.evaluate(() => {
    const btn = [...document.querySelectorAll('.qa-screen button')]
      .find(b => /Надіслати/i.test(b.textContent || ''));
    btn?.click();
  });
  await p.clock.runFor(400);
  await p.waitForTimeout(500);
  return p.evaluate((б) => ({
    додано: document.querySelectorAll('.qa-screen .qa-answer').length - б,
    тост: (document.querySelector('.toast')?.textContent || '').trim(),
  }), було);
}

// ── 1. Перше «Окей» проходить ───────────────────────────────────────────────
const перше = await надіслати('Окей');
ok('1. перша відповідь проходить',
   перше.додано === 1 && !/щойно/i.test(перше.тост),
   `додано=${перше.додано} тост=«${перше.тост}»`);

// ── 2. Те саме ОДРАЗУ — блокується (це і є справжній спам) ──────────────────
const одразу = await надіслати('Окей');
ok('2. 🛑 миттєвий повтор того самого тексту блокується',
   одразу.додано === 0 && /щойно/i.test(одразу.тост),
   `додано=${одразу.додано} тост=«${одразу.тост}»`);

// ── 3. 🔴 ГОЛОВНА ПЕРЕВІРКА: через годину те саме слово МОЖНА ───────────────
// Саме тут падає старий код: там дубль не має вікна взагалі.
await p.clock.runFor(60 * 60 * 1000);
await p.waitForTimeout(200);
const черезГодину = await надіслати('Окей');
ok('3. 🔴 через ГОДИНУ те саме слово надсилається (скарга Вови)',
   черезГодину.додано === 1 && !/щойно/i.test(черезГодину.тост),
   `додано=${черезГодину.додано} тост=«${черезГодину.тост}»`);

// ── 4. Інший текст одразу — завжди можна ────────────────────────────────────
const інший = await надіслати('Дякую');
ok('4. інший текст одразу проходить (правило не про швидкість письма взагалі)',
   інший.додано === 1 && !/щойно/i.test(інший.тост),
   `додано=${інший.додано} тост=«${інший.тост}»`);

// ── 5. 🛑 МЕЖА ВІКНА: 20 секунд уже досить, щоб повторити ───────────────────
// Доводить, що вікно саме коротке, а не «просто збільшили назавжди».
await p.clock.runFor(20000);
await p.waitForTimeout(200);
const післяВікна = await надіслати('Дякую');
ok('5. через 20с (вікно 15с минуло) повтор дозволено',
   післяВікна.додано === 1 && !/щойно/i.test(післяВікна.тост),
   `додано=${післяВікна.додано} тост=«${післяВікна.тост}»`);

await p.clock.resume();
await b.close();
await stop();
done();
