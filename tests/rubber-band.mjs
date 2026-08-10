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
import { launch, serve, reporter, projectFile, pixelsOf } from './_lib.mjs';
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
  // ⚠️ `home.css` у списку ОБОВʼЯЗКОВО: бордова смуга живе саме там. Без нього
  // контроль підміняв би лише вкладку і «доводив» смугу на… поточному коді.
  for (const f of ['style/community.css', 'style/board.css', 'style/home.css']) {
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

// ── ГРОМАДА: рідна гумка + бордовий запас угору ─────────────────────────────
// 🔴 ТРЕТІЙ ЗАХІД, і два попередні тут варто памʼятати:
//   1. просто `contain` → над бордовим блоком сірий провал (фото-тло прибите,
//      а блок їде) — відкат;
//   2. свій відскок на JS → числа правильні, але Вова: «дьоргається, зроби як
//      у стрічці». Кадри малював головний потік, рідну гумку веде композитор.
// ✅ Тепер: рідний відскок, а діра закрита ГЕОМЕТРІЄЮ — бордова рамка 260px
// угору на самій шапці. У спокої вона вище нуля прокрутки, тобто невидима.
//
// 🔬 Стенд міряє ТРИ речі, і третя найважливіша.
const гром = await наВкладці('community');
ok('🔴 Громада: рідний відскок увімкнено (кадри малює композитор, не скрипт)',
   гром.overscroll === 'contain', `overscroll-behavior-y: ${гром.overscroll}`);

const шапка = await p.evaluate(() => {
  const el = document.querySelector('.hm-top');
  if (!el) return null;
  const s = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  const привіт = document.querySelector('.hm-hi');
  return {
    рамка: parseFloat(s.borderTopWidth),
    колірРамки: s.borderTopColor,
    clip: s.backgroundClip || s.webkitBackgroundClip,
    верхБлока: Math.round(r.top),
    верхПривітання: привіт ? Math.round(привіт.getBoundingClientRect().top) : null,
  };
});

ok('🔴 бордовий запас угору є (рамка 260px кольору верхнього стопу градієнта)',
   !!шапка && шапка.рамка >= 200 && /94,\s*23,\s*35/.test(шапка.колірРамки),
   шапка ? `${шапка.рамка}px ${шапка.колірРамки}` : 'нема');

// 🔴 ГОЛОВНА ПЕРЕВІРКА: рамка не сміє зсунути ЖОДНОГО пікселя вмісту.
// `margin-top` мусить компенсувати її РІВНО. Розійдеться компенсація — поїде
// вся сторінка, і це буде набагато гірше за проблему, яку лікуємо.
//
// ⚠️ ТУТ СТОЯЛА ВИГАДАНА КОНСТАНТА, і це варто памʼятати. Перша редакція
// перевіряла «привітання на 96px» — число я не зміряв, а припустив, і стенд
// одразу «знайшов» зсув на неіснуючі 4px. Живий замір origin/main проти
// поточного коду показав: привітання 100 → 100, капсули 213 → 213, контакти
// без змін, зсунулась лише рамка блока (−260, як і задумано).
// ➡️ Тому тут НЕМАЄ магічних чисел. Перевіряється структурний інваріант:
// внутрішній край бордової шапки (тобто там, де починається градієнт і текст)
// збігається з нижнім краєм шапки застосунку. Він істинний і до зміни, і після,
// і не залежить від висоти екрана, safe-area чи шрифту.
const стик = await p.evaluate(() => {
  const top = document.querySelector('.hm-top');
  const hdr = document.querySelector('.app-header');
  if (!top || !hdr) return null;
  const s = getComputedStyle(top);
  return {
    внутрішнійКрай: +(top.getBoundingClientRect().top + parseFloat(s.borderTopWidth)).toFixed(1),
    низШапкиЗастосунку: +hdr.getBoundingClientRect().bottom.toFixed(1),
  };
});
ok('🔴 вміст НЕ зʼїхав: бордова шапка починається рівно під шапкою застосунку',
   !!стик && Math.abs(стик.внутрішнійКрай - стик.низШапкиЗастосунку) <= 1,
   стик ? `край блока ${стик.внутрішнійКрай} · низ шапки ${стик.низШапкиЗастосунку}` : 'нема');

// Градієнт мусить малюватись у СТАРІЙ області — інакше видима частина бордо
// змінила б відтінок, а Вова цю різницю ловить (історія кольору шапки).
ok('градієнт обмежено padding-box, тож його геометрія не змінилась',
   !!шапка && /padding-box/.test(шапка.clip || ''), шапка ? шапка.clip : '—');

// ── СМУГА МУСИТЬ ЗЛИВАТИСЬ ІЗ БЛОКОМ (замовлення Вови 10.08) ────────────────
// «Він просто бордовий. Можеш зробити з лівого краю по праву градієнтом і
// переливом, як і сам блок… щоб воно зливалося просто».
//
// 🔬 МІРЯЄМО ПІКСЕЛІ, А НЕ ПРАВИЛА. «Зливається» — властивість картинки; правило
// можна написати правильно і все одно дістати шов, бо в `--brand-grad` ДВА шари
// і геометрія рахується від розміру екрана. Саме так і сталось у роботі: перша
// редакція смуги повторила лише радіальну підсвітку, читалась як «готово», а
// замір показав на правому краю стик у 19 пунктів каналу.
//
// 🔑 ЧОМУ КЛОН, А НЕ ЖИВИЙ БЛОК: смуга живе в `border-top` і в спокої лежить
// вище нуля прокрутки, накрита непрозорою `.app-header` — знімати на екрані
// нема чого. Клон несе той самий клас і ту саму ширину, тобто градієнт і рамка
// рахуються з тих самих чисел.
await p.evaluate(() => {
  const el = document.querySelector('.hm-top');
  const хост = document.createElement('div');
  хост.id = 'seam-probe';
  хост.style.cssText = `position:fixed;left:0;top:0;z-index:99999;width:${el.getBoundingClientRect().width}px;`;
  const c = el.cloneNode(true);
  c.style.margin = '0';
  хост.appendChild(c);
  document.body.appendChild(хост);
});
const { w: шир, px, ярк } = await pixelsOf(p, '#seam-probe');
const R = шапка.рамка;
const наX = f => Math.round(f * (шир - 1));

// 1. ШОВ: останній ряд смуги проти першого ряду блока, по всій ширині.
let шов = 0;
for (let x = 2; x < шир - 2; x++) {
  const a = px(x, R - 2), c = px(x, R + 1);
  шов = Math.max(шов, Math.abs(a[0] - c[0]), Math.abs(a[1] - c[1]), Math.abs(a[2] - c[2]));
}
// Поріг 8 лежить у розриві між заміряними станами: пласка смуга дає 17-19,
// смуга з обома шарами — 3. Це не «з запасом на око», це середина прірви.
ok('🔴 смуга ЗЛИВАЄТЬСЯ з блоком: стику не видно (різниця каналу ≤ 8)',
   шов <= 8, `максимальна різниця каналу на стику = ${шов}`);

// 2. ПЕРЕЛИВ: смуга не пласка — ліворуч світліше, праворуч сходить у бордо.
// Саме це Вова й просив; без цієї перевірки шов можна було б «полагодити»,
// зробивши смугу рівномірно темною, і вона знову стала б пласкою.
const низ = [0.06, 0.26, 0.5, 0.8, 0.97].map(f => ярк(px(наX(f), R - 2)));
const розмах = +(Math.max(...низ) - Math.min(...низ)).toFixed(1);
ok('🔴 смуга має ПЕРЕЛИВ зліва направо, а не рівне бордо (розмах ≥ 4)',
   розмах >= 4, `ліво ${низ[0]} · пік ${низ[1]} · право ${низ[4]} → розмах ${розмах}`);
ok('перелив живий і у ВЕРХНІЙ частині смуги (її видно при сильному відтягуванні)',
   (() => { const в = [0.06, 0.26, 0.8, 0.97].map(f => ярк(px(наX(f), 4)));
            return Math.max(...в) - Math.min(...в) >= 3; })());

await p.evaluate(() => document.getElementById('seam-probe')?.remove());

ok('відскок не «протікає» на сторінку (не auto — таб-бар не обріжеться)',
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
