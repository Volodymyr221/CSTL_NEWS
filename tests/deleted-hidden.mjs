// Стенд: КЛІЄНТ САМ ВІДСІЮЄ ВИДАЛЕНЕ — НЕ ПОКЛАДАЄТЬСЯ НА RLS.
//
// 🔴 ЗАРАДИ ЧОГО (скарга Вови 17.09, дослівно):
//   «з одного акаунту я надіслав два тестових питання. Одне я з них видалив, і на
//    тому акаунті, з якого я писав, воно видалилось… А з іншого акаунту воно
//    показується. Це не має глючити… це ж соцмережа. Якщо я видаляю те, що
//    написав, воно не тільки в мене видаляється, воно у всіх зникає».
//
// 🔬 ЩО НАСПРАВДІ БУЛО (звірено в базі того ж дня). Дані чесні: питання #96 мало
// `deleted_at = 2026-09-09 20:48`. Політика бази теж правильна:
//     (deleted_at is null and post_visible_row(status, owner_uid)) OR is_admin()
// 🛑 Уся річ у хвості `OR is_admin()`: Вова дивиться з єдиного адмінського акаунта,
// і база законно віддає йому все, включно з видаленим. А клієнт власного фільтра
// не мав ЖОДНОГО — він покладався на RLS як на єдиний захист.
//
// 🔑 УРОК, ШИРШИЙ ЗА ЦЕЙ БАГ: RLS відповідає на «кому МОЖНА це прочитати», а не на
// «що тут ДОРЕЧНО показати». Щойно чиїсь права ширші за звичайні — фільтра не
// лишається взагалі.
//
// ⚠️ ЧЕСНО ПРО МЕЖУ ЦЬОГО СТЕНДА. Він міряє МЕРЕЖУ — що саме клієнт просить у бази,
// — а не пікселі на екрані. Домалювати сюди перевірку «на екрані нічого немає» не
// вийшло: вкладки «Питання» і «Дошка» в пісочниці не піднімаються без живої
// авторизації, а стенд, який мовчки показує порожню сторінку, «доводив» би
// відсутність видаленого навіть на повністю зламаному застосунку.
// 🔑 Натомість перевірка нижче ловить те, що справді може зламатись: НОВИЙ запит до
// `posts`, доданий завтра без фільтра. Вона не залежить від розмітки й не гниє.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter('deleted-hidden');
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();

const запити = [];
await p.route('**/rest/v1/posts*', route => {
  запити.push(decodeURIComponent(route.request().url()));
  route.fulfill({ status: 200, contentType: 'application/json',
    headers: { 'access-control-allow-origin': '*' }, body: '[]' });
});
await p.route('**://api.open-meteo.com/**', r => r.abort());

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2200);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(600);
// Проходимо вкладками, які читають `posts`, щоб зібрати всі запити.
for (const t of ['board', 'discussions', 'community']) {
  await p.evaluate(tab => window.switchTab && window.switchTab(tab), t);
  await p.waitForTimeout(1200);
}

const без = запити.filter(u => !/deleted_at=is\.null/.test(u));
ok('🔑 запити до `posts` узагалі були (сцена не порожня)', запити.length > 0, `${запити.length} шт.`);
ok('🔴 ГОЛОВНЕ: КОЖЕН запит просить лише НЕвидалене',
   запити.length > 0 && без.length === 0,
   без.length ? `без фільтра ${без.length}: ${без[0].slice(0, 110)}` : 'усі з `deleted_at=is.null`');

// 🛑 МУТАЦІЯ: перевірка мусить уміти ВПАСТИ. Підкидаємо той самий URL без фільтра —
// якщо умова вище зеленіє і на ньому, вона не стереже нічого.
const підробка = [...запити, url + '/rest/v1/posts?select=*&status=eq.published'];
const безПідробки = підробка.filter(u => !/deleted_at=is\.null/.test(u));
ok('🛑 МУТАЦІЯ: запит без фільтра перевірка ЛОВИТЬ', безПідробки.length === 1,
   `спіймано ${безПідробки.length}`);

await b.close(); await stop();
done();
