// Стенд: ГУМОВІ МЕЖІ — Є ТАМ, ДЕ БЕЗПЕЧНО, І НЕМАЄ ТАМ, ДЕ НІ (§9 `apple-design`).
//
// Скіл: «At an edge, resist progressively instead of stopping hard. A hard stop
// reads as frozen». Замовлення Вови 10.08 — «давай спробуємо».
//
// 🔴 ЧОМУ ЦЕ НЕ «УВІМКНУТИ СКРІЗЬ», А РІШЕННЯ ПО ВКЛАДКАХ.
// Обидві «стіни» в проєкті ставили не від незнання, а як ФІКС двох дефектів,
// які знайшов сам Вова:
//   • Громада (17.07) — «беж заповнює весь низ, а bounce показує порожнечу»;
//   • Дошка — гумка відтягує вміст і над шапкою відкривається незакрита смуга;
//     там ДВА обхідні шляхи вже пробували із заміром, обидва провалились.
//
// 📐 Перезамір 10.08 розділив ці випадки:
//   • Громада після перебудови в Home Dashboard має ТЕМНИЙ власний фон
//     (`rgb(26,10,14)`) і згори, і знизу → відтягування відкриває той самий
//     колір, що вже на екрані. Стара підстава зникла разом із бежем.
//   • Дошка має світло-сірий фон (`#E6E6E3`) під БОРДОВОЮ шапкою → гумка
//     відкрила б сіру смугу над бордовим. Підстава жива.
//
// 🔬 ЩО САМЕ СТЕРЕЖЕ ЦЕЙ СТЕНД — пару, а не одне значення.
// «Гумка увімкнена» саме по собі нічого не гарантує: вона безпечна ЛИШЕ доки
// фон під нею збігається з екраном. Тому перевіряється зв'язка: на Громаді
// відскок Є **і** фон темний; на Дошці відскоку НЕМА. Хтось освітлить фон
// Громади — стенд почервоніє, і це правильно: разом із фоном повернеться і
// стара проблема.
//
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки в проєкті.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     CSS_REV=origin/main node tests/rubber-band.mjs
// на коді ДО зміни перевірка про Громаду мусить УПАСТИ, а про Дошку — лишитись
// зеленою: разом вони доводять, що змінено рівно одну вкладку.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.CSS_REV || '';
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };
const NOW = new Date().toISOString();

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();
await mockSupabase(p,
  { posts: [{ id: 'p-1', type: 'board', category: 'sell', title: 'ВЕЛОСИПЕД', text: 'опис',
              price: '2500', location: 'Олика', author: 'Петро', owner_uid: 'u-o', contact: '',
              photos: [], status: 'published', published_at: NOW, created_at: NOW }],
    threads: [], messages: [], thread_user_state: [], announcements: [] },
  { user: ME, profiles: [{ uid: 'u-me', name: 'Вова', avatar_url: '' }] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  for (const f of ['style/community.css', 'style/board.css']) {
    const body = projectFile(f, REV);
    await p.route(`**/${f}`, r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
  }
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1600);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });

const наВкладці = async (tab) => {
  await p.evaluate(t => window.switchTab && window.switchTab(t), tab);
  await p.waitForTimeout(1400);
  if (tab === 'board') {
    await p.evaluate(() => document.querySelector('.brules-ok')?.click());
    await p.waitForTimeout(800);
  }
  return p.evaluate(() => {
    const m = document.querySelector('.app-main');
    const s = getComputedStyle(m);
    const m2 = /rgba?\(([^)]+)\)/.exec(s.backgroundColor);
    const [r, g, bl] = m2 ? m2[1].split(',').map(x => parseFloat(x)) : [255, 255, 255];
    // Яскравість за формулою sRGB — те саме, чим у проєкті рахують контраст.
    const яскравість = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * bl);
    return { overscroll: s.overscrollBehaviorY, фон: s.backgroundColor, яскравість };
  });
};

// ── ГРОМАДА: гумка Є, і фон під нею темний ──────────────────────────────────
const гром = await наВкладці('community');
ok('🔴 Громада: відскок увімкнено (край пружинить, а не впирається в стіну)',
   гром.overscroll === 'contain', `overscroll-behavior-y: ${гром.overscroll}`);

// 🔴 Друга половина пари. Без неї перша перевірка дозволила б увімкнути гумку на
// світлому фоні — тобто повернути рівно той дефект, який колись і закривали.
ok('🔴 Громада: фон вкладки ТЕМНИЙ — відтягнута зона збігається з екраном',
   гром.яскравість < 60, `${гром.фон} · яскравість ${гром.яскравість}`);

ok('відскок не «протікає» на сторінку (contain, а не auto — таб-бар не обріжеться)',
   гром.overscroll !== 'auto', гром.overscroll);

// ── ДОШКА: гумка свідомо вимкнена ───────────────────────────────────────────
const дошка = await наВкладці('board');
ok('🛑 Дошка: відскок лишається вимкненим (сіра смуга над бордовою шапкою)',
   дошка.overscroll === 'none', `overscroll-behavior-y: ${дошка.overscroll}`);

// Пояснення, чому саме там не можна — числом, а не словами.
ok('доказ для Дошки: її фон СВІТЛИЙ, тож відтягнута зона не збіглась би з шапкою',
   дошка.яскравість > 180, `${дошка.фон} · яскравість ${дошка.яскравість}`);

await ctx.close(); await b.close(); await stop();
done();
