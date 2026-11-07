// Стенд: АНОНС, ЩО ВЖЕ МИНУВ, НЕ ЧИТАЄТЬСЯ ЯК МАЙБУТНІЙ (07.11.2026).
//
// 🗣️ Вова 07.11: «Якщо якась стара інфа, то позначати, що це було там тоді-то».
// Аудит 07.11: на першому екрані Громади — «5 листопада, відбудеться чергова
// онлайн-зустріч», а на годиннику 7 листопада.
//
// Дві частини:
//   А. ВИКОНУЄМО справжню `pastAnnounce` (вирізану з news.js тієї ревізії, що в
//      BUNDLE_REV) на прикладах із межами — регулярка «є слово Відбулося» зеленіла б
//      і над правилом, що позначає звіти «відбулася зустріч» як анонси.
//   Б. Справжній застосунок, годинник 07.11.2026: віджет Громади не відкривається
//      минулим анонсом, а мітку видно.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';
const src = projectFile('src/tabs/news.js', REV);

// ── А. Логіка ───────────────────────────────────────────────────────────────
const від = src.indexOf('const МІСЯЦІ_Р');
const до  = src.indexOf('function pastBadgeHtml');
ok('контроль: pastAnnounce знайдено в news.js', від > 0 && до > від);
let pastAnnounce = () => null;
if (від > 0 && до > від) {
  pastAnnounce = new Function(`${src.slice(від, до).replace(/^export /gm, '')}; return pastAnnounce;`)();
}
const NOW = new Date(2026, 10, 7, 12, 0).getTime();          // 07.11.2026, полудень
const ts = (d, m) => new Date(2026, m - 1, d, 9).getTime();
const L = (a) => (pastAnnounce(a, NOW) || {}).label || null;

ok('🔴 «5 листопада відбудеться» на 07.11 → «Відбулося 5 листопада»',
   L({ title: '5 листопада, відбудеться чергова онлайн-зустріч «Діалог влади з бізнесом»', ts: ts(4, 11) }) === 'Відбулося 5 листопада',
   L({ title: '5 листопада, відбудеться чергова онлайн-зустріч', ts: ts(4, 11) }));
ok('🔴 анонс на майбутнє (20 листопада) — без мітки',
   L({ title: '20 листопада відбудеться ярмарок', ts: ts(4, 11) }) === null);
ok('🔴 сьогоднішня подія (7 листопада) — ще не «відбулося»',
   L({ title: 'Запрошуємо 7 листопада на толоку', ts: ts(5, 11) }) === null);
ok('🔴 звіт без майбутнього часу («відбулася») — без мітки, це вже минуле',
   L({ title: '5 листопада відбулася зустріч', ts: ts(5, 11) }) === null);
ok('діапазон «22–24 жовтня» минув → «Відбулося 22–24 жовтня»',
   L({ title: '22-24 жовтня пройде фестиваль', ts: ts(10, 10) }) === 'Відбулося 22–24 жовтня', L({ title: '22-24 жовтня пройде фестиваль', ts: ts(10, 10) }));
ok('дата в описі, не в заголовку — теж ловимо',
   L({ title: 'В Олиці відбудеться вебінар', excerpt: '22 жовтня 2026 року в онлайн-форматі', ts: ts(20, 10) }) === 'Відбулося 22 жовтня');
ok('🔴 анонс без дати, старший за 3 дні → «Анонс від 27 серпня»',
   L({ title: 'В Олиці відбудеться молитва за безвісти зниклих', ts: ts(27, 8) }) === 'Анонс від 27 серпня');
ok('анонс без дати, свіжий (вчора) — без мітки',
   L({ title: 'Запрошуємо на прибирання парку', ts: ts(6, 11) }) === null);
ok('грудневий анонс про «15 січня» — це наступний рік, не минуле',
   (pastAnnounce({ title: '15 січня відбудеться концерт', ts: new Date(2026, 11, 20).getTime() }, new Date(2026, 11, 28).getTime())) === null);
ok('слово всередині іншого («пройдено») не робить анонсом',
   L({ title: '5 листопада пройдено навчання', ts: ts(5, 11) }) === null);

// На живих даних: мітка є, але не на всьому підряд (інакше це шум).
const arts = JSON.parse(projectFile('data/articles.json'));
const з = arts.filter(a => pastAnnounce(a, NOW)).length;
ok('на живих articles.json мітки є, але це меншість', з > 0 && з < arts.length * 0.25, `${з} з ${arts.length}`);

// ── Б. Справжній застосунок ─────────────────────────────────────────────────
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
await ctx.addInitScript(() => { try { localStorage.setItem('cstl-legal-consent-v1', '05.10.2026'); } catch (_) {} });
const p = await ctx.newPage();
await p.clock.install({ time: new Date(2026, 10, 7, 12, 0) });
const грм = (id, title, d, m, image) => ({ id, title, excerpt: 'опис', content: '', category: 'Економіка', geo: 'Олика',
  source: 'Олицька громада', ts: ts(d, m), added_ts: ts(d, m), image });
await p.route('**/data/articles.json*', r => r.fulfill({ contentType: 'application/json', body: JSON.stringify([
  грм(900001, '5 листопада, відбудеться чергова онлайн-зустріч', 6, 11, 'https://x.invalid/a.jpg'),   // найсвіжіша, з фото, МИНУЛА
  грм(900002, 'Власники генерації можуть отримувати оплату', 5, 11, 'https://x.invalid/b.jpg'),
  грм(900003, 'В громаді відзначили соціальних працівників', 4, 11, null),
]) }));
await mockSupabase(p, { posts: [] }, {});
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url + '/index.html');
await p.clock.runFor(4500);
await p.waitForTimeout(800);
const стан = await p.evaluate(() => {
  const hero = document.querySelector('.nc--hero');
  return { hero: hero?.dataset.articleId || null,
           мітки: [...document.querySelectorAll('.nc-past')].map(e => e.textContent.trim()) };
});
ok('сцена: віджет новин намальовано', !!стан.hero, JSON.stringify(стан));
ok('🔴 велика картка — НЕ минулий анонс (хоч він найсвіжіший і з фото)', стан.hero === '900002', `hero=${стан.hero}`);
ok('🔴 на минулому анонсі видно «📅 Відбулося 5 листопада»', стан.мітки.some(t => /Відбулося 5 листопада/.test(t)), JSON.stringify(стан.мітки));
await b.close(); await stop();
done();
