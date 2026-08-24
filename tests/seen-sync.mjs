// tests/seen-sync.mjs — «ПРОЧИТАВ НА ТЕЛЕФОНІ — НА КОМПʼЮТЕРІ ТЕЖ ПРОЧИТАНО».
//
// 🔴 НАВІЩО (питання Вови 24.08, дослівно): «А не можна щоб синхронізація була
// з акаунтом, тобто якщо прочитаю з телефону і зайду з компʼютера, то і там буде
// рівно те саме прочитано?»
//
// Вранці того ж дня мітки «бачив» стали ІМЕННИМИ (щоб другий акаунт на телефоні
// не успадковував чужі), але лишились на пристрої — свідомий борг. Цей стенд
// сторожить його закриття.
//
// 🔑 ДВА КОНТЕКСТИ = ДВА ПРИСТРОЇ, і це протилежність `account-scope.mjs`.
// Там один контекст навмисно (один телефон, дві людини). Тут навпаки: окремий
// контекст має ВЛАСНИЙ `localStorage`, тобто це фізично інша машина, і мітка
// може дійти до неї ЛИШЕ через базу. Якби ми лишились в одному контексті, стенд
// зеленів би від локального сховища і не довів би нічого.
//
// 🛑 КОНТРОЛЬ УСЕРЕДИНІ СЦЕНИ. «Компʼютер бачить прочитане» — зелене й тоді,
// коли застосунок просто НІКОЛИ не показує «нових» (наприклад, лічильник
// зламався і завжди 0). Тому та сама сцена міряє ДРУГИЙ бік: чужий акаунт на
// тому самому компʼютері МУСИТЬ побачити ті самі новини як нові. Якщо обидва
// показують 0 — міряємо не синхронізацію, а мертвий лічильник.
//
// ⚠️ Межа, названа чесно: «сервером» тут є заглушка бази (`_board-fixture.mjs`),
// а не Supabase. Вона емулює головне правило — мітка рухається тільки вперед —
// але доїзд до справжньої бази доводиться окремо, запитом до неї (журнал 24.08,
// 6/6). Стенд доводить, що ЗАСТОСУНОК користується спільним джерелом.

import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();

// Три статті Громади, усі свіжі — щоб «нових» було що рахувати.
const ARTICLES = [1, 2, 3].map(i => ({
  id: 6000 + i, title: 'НОВИНА ГРОМАДИ ' + i, excerpt: 'Опис.', content: 'Текст.',
  category: 'Суспільство', geo: 'Громада', image: null, source: 'CSTL NEWS',
  sourceUrl: null, exclusive: false, ts: Date.now() - i * 3600e3,
}));

const USER_A = { id: 'uid-a', email: 'a@example.com', user_metadata: { full_name: 'Володимир' } };
const USER_B = { id: 'uid-b', email: 'b@example.com', user_metadata: { full_name: 'Олександр' } };

const { url, stop } = await serve();
const b = await launch(chromium);

const json = (r, body) => r.fulfill({ status: 200, contentType: 'application/json',
  headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });

/**
 * Відкрити застосунок на ОКРЕМОМУ пристрої (свій контекст = свій localStorage).
 * `seen` — рядки таблиці `user_seen_marks`, тобто те, що вже знає «сервер».
 */
async function пристрій(user, seen = []) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  await mockSupabase(p, { posts: [], user_seen_marks: seen, profiles: [] }, { user });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.route('**/data/articles.json*', r => json(r, ARTICLES));
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2400);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.evaluate(() => window.switchTab && window.switchTab('community'));
  await p.waitForTimeout(1500);
  return { ctx, p };
}

/** Скільки новин застосунок вважає НОВИМИ — те, що людина бачить у віджеті. */
async function новихНаЕкрані(p) {
  return p.evaluate(() => {
    const el = document.querySelector('.cm-news-new');
    if (!el) return 0;                       // бейдж не малюється, коли нових нема
    const m = el.textContent.match(/\d+/);
    return m ? Number(m[0]) : 0;
  });
}

/** Що «сервер» знає про мітки цієї людини. */
async function наСервері(p) {
  return p.evaluate(() => (window.__cstlTables?.user_seen_marks || [])
    .map(r => ({ uid: r.uid, scope: r.scope, seen_at: r.seen_at })));
}

// 🔴 ОБИДВІ ЛЮДИНИ — ДАВНІ КОРИСТУВАЧІ, І ЦЕ УМОВА СЦЕНИ, А НЕ ДЕКОРАЦІЯ.
// Перша редакція стенда відкривала застосунок на ЧИСТОМУ пристрої — і «нових»
// там 0 ЗАВЖДИ, бо `countNewCommunity` навмисно віддає нуль першому запуску
// («хто щойно поставив застосунок, нічого не пропускав» — `tabs/news.js`).
// Тобто сцена не могла показати «нові» В ПРИНЦИПІ, і перевірка «на компʼютері
// вже прочитано» світилась зеленим ні над чим.
// 🔑 Спіймав це КОНТРОЛЬ усередині сцени: нуль показали ОБИДВА акаунти. Без
// нього стенд звітував би «синхронізація працює» над мертвим лічильником.
const ДВА_ДНІ_ТОМУ = new Date(Date.now() - 2 * 864e5).toISOString();
const давнійКористувач = (u) => [{ uid: u.id, scope: 'news', seen_at: ДВА_ДНІ_ТОМУ }];

// ── ТЕЛЕФОН: людина відкриває новини ────────────────────────────────────────
const телефон = await пристрій(USER_A, давнійКористувач(USER_A));

const булоНових = await новихНаЕкрані(телефон.p);
ok('на телефоні спершу є непрочитані новини', булоНових > 0, `${булоНових} нових`);

// Відкриваємо хаб новин — саме він ставить мітку.
await телефон.p.evaluate(() => document.querySelector('#cm-news-board [data-cm-news-all]')?.click());
await телефон.p.waitForTimeout(1200);

const мітки = await наСервері(телефон.p);
ok('🔴 мітка з телефона доїхала до спільного сховища',
   мітки.some(r => r.uid === USER_A.id && r.scope === 'news'),
   JSON.stringify(мітки));

await телефон.ctx.close();

// ── КОМПʼЮТЕР: та сама людина, ІНШИЙ пристрій ───────────────────────────────
// 🔑 Новий контекст = порожній `localStorage`. Усе, що ця машина може знати про
// прочитане, приходить ЛИШЕ з бази — саме це питання Вови і перевіряє.
const компʼютер = await пристрій(USER_A, мітки);
const наКомпі = await новихНаЕкрані(компʼютер.p);

ok('🔴 на компʼютері новини вже НЕ нові — синхронізувалось',
   наКомпі === 0, `${наКомпі} нових (очікували 0)`);
await компʼютер.ctx.close();

// ── 🛑 КОНТРОЛЬ: чужий акаунт на тому самому компʼютері ─────────────────────
// Без цієї перевірки попередня була б зеленою і на зламаному лічильнику, який
// завжди показує 0. Тут той самий екран, ті самі дані, інша людина — і новини
// МУСЯТЬ бути новими.
const чужий = await пристрій(USER_B, [...мітки, ...давнійКористувач(USER_B)]);
const уЧужого = await новихНаЕкрані(чужий.p);

ok('🛑 КОНТРОЛЬ: чужий акаунт бачить ті самі новини НОВИМИ',
   уЧужого > 0,
   уЧужого > 0 ? `${уЧужого} нових — лічильник живий, мітка не протекла`
               : 'нуль і в чужого — міряємо мертвий лічильник, а не синхронізацію');
await чужий.ctx.close();

// ── 🔴 МІТКА РУХАЄТЬСЯ ТІЛЬКИ ВПЕРЕД ───────────────────────────────────────
// Найнебезпечніший випадок: відкритий зі вчора таб прокидається і дописує свою
// СТАРУ мітку. Якби це проходило, синхронізація стала б гіршою за її
// відсутність — усе прочитане «непрочиталось» би назад.
const свіжа = мітки.find(r => r.uid === USER_A.id && r.scope === 'news');
const старий = await пристрій(USER_A, [
  { uid: USER_A.id, scope: 'news', seen_at: new Date(Date.parse(свіжа.seen_at)).toISOString() },
]);

const відкат = await старий.p.evaluate(async (вчора) => {
  const supa = window.supabase.createClient();
  await supa.rpc('seed_seen', { p_scope: 'news', p_seen_at: вчора });
  return (window.__cstlTables?.user_seen_marks || [])
    .filter(r => r.scope === 'news').map(r => r.seen_at)[0];
}, new Date(Date.parse(свіжа.seen_at) - 864e5).toISOString());

ok('🔴 вчорашня мітка НЕ відкотила свіжу',
   Date.parse(відкат) >= Date.parse(свіжа.seen_at),
   `було ${свіжа.seen_at} · стало ${відкат}`);

await старий.ctx.close();

await b.close();
stop();
done();
