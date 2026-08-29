// Стенд: ЗАПРОШЕННЯ УВІЙТИ ДЛЯ ГОСТЯ.
//
// 🗣️ ЗАМОВЛЕННЯ ВОВИ (29.08): «заходить новий користувач… він сто відсотків має
// через деякий час побачити вспливаючу іконку: авторизуйтеся, чи станьте
// учасником громади».
//
// 🔴 ЧОМУ ЦЕЙ СТОРОЖ ВЗАГАЛІ ПОТРІБЕН. Тут кожна вада — ТИХА: запрошення або не
// приходить ніколи, або приходить занадто рано, або приходить удруге. Жодна з
// них не падає, не пише в консоль і не видно на знімку екрана. Побачити їх можна
// лише ВИКОНАВШИ модуль і порахувавши, скільки разів він озвався.
//
// 🛑 І найдорожча з них — не «не показали», а «показали поверх чужого вікна».
// На iOS через 2.5 с після запуску сам виходить банер «встанови на екран»; два
// спливаючих поспіль людина закриває не читаючи, і другого разу вже не буде.
//
// 🔴 КОНТРОЛЬ: BUNDLE_REV=origin/main node tests/join-invite.mjs
// До 29.08 модуля не існувало — стенд мусить упасти цілком.
import { chromium } from 'playwright';
import { projectFile, launch, serve } from './_lib.mjs';

const REV = process.env.BUNDLE_REV || '';
const res = [];
const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };

let src = '';
try { src = projectFile('src/core/join-invite.js', REV); } catch { /* модуля ще немає */ }

console.log(`\n── ЗАПРОШЕННЯ УВІЙТИ${REV ? `   (КОНТРОЛЬ на ${REV})` : ''}`);
ok('модуль існує', src.length > 0);

// Порогів у коді не має бути «магічними» числами по тексту — вони названі, бо
// саме їх Вова змінюватиме, не читаючи решти.
ok('пороги названі, а не вкраплені в код',
   /ACTIONS_BEFORE\s*=/.test(src) && /SNOOZE_DAYS\s*=/.test(src) && /SETTLE_MS\s*=/.test(src));
// 🔑 Вхід відкривається ТІЄЮ САМОЮ подією, що й контекстний гейт. Другий спосіб
// відкривати вхід довелося б правити парами — і він би розійшовся.
ok('вхід відкривається спільною подією, без другого шляху',
   /cstl-need-login/.test(src) && !/openJoin|openModal/.test(src));

const inline = src.replace(/^import .*$/gm, '').replace(/^export /gm, '');

// Сцена: справжній модуль, підроблені «хто я» і годинник. Перемикаємо вкладки
// подією `cstl-tab-changed` — рівно тією, яку шле `app.js`.
const scene = (opts) => `<!doctype html><html><head><meta charset="utf-8"></head>
<body>${opts.busyHtml || ''}<script type="module">
  let logged = ${opts.logged ? 'true' : 'false'};
  const isLoggedIn = () => logged;
  const onAuthChange = (cb) => { window.__auth = cb; };
  ${opts.seen ? `try { localStorage.setItem('cstl-join-invite-v1', String(Date.now())); } catch {}` : ''}
  ${inline}

  let invites = 0;
  document.addEventListener('cstl-need-login', () => { invites++; });
  initJoinInvite();

  const tab = () => window.dispatchEvent(new CustomEvent('cstl-tab-changed'));
  const wait = (ms) => new Promise(r => setTimeout(r, ms));

  ${opts.body}
  document.title = JSON.stringify(out);
<\/script></body></html>`;

// 🔴 СТОРІНКА ПІДНІМАЄТЬСЯ НА СПРАВЖНЬОМУ ДОМЕНІ, А НЕ `setContent` НА ПОРОЖНЬОМУ.
// Перша редакція стенда цього не робила — і перевірка «вже показували, не
// повторюємо» падала на СПРАВНОМУ коді: без домену `localStorage` браузеру
// недоступний, модуль ловив це своїм `catch` і чесно вважав, що не показував
// нічого. Тобто стенд міряв не застосунок, а власну сцену.
// 🔑 `goto` дає походження, `setContent` після нього його зберігає — тож памʼять
// пристрою поводиться так само, як у людини в телефоні.
const { url: BASE, stop } = await serve();

async function run(opts) {
  const browser = await launch(chromium);
  const p = await browser.newPage();
  const errs = [];
  p.on('pageerror', e => errs.push(e.message));
  await p.goto(BASE + '/index.html');
  await p.evaluate(() => { try { localStorage.clear(); } catch {} });
  await p.setContent(scene(opts));
  await p.waitForFunction(() => document.title.startsWith('{'), null, { timeout: 8000 }).catch(() => {});
  let out = {};
  try { out = JSON.parse(await p.title()); } catch {}
  await browser.close();
  if (errs.length) console.log('   ⚠️', errs.slice(0, 1).join(' | '));
  return out;
}

if (!src) {
  ok('після трьох переходів запрошення приходить', false, 'модуля немає');
  ok('до порога — мовчить', false);
  ok('удруге не приходить', false);
  ok('залогіненому не приходить', false);
  ok('не перебиває банер встановлення', false);
  ok('🔴 не перебиває інструкцію «Як встановити»', false);
  ok('уже показане раніше — не повторюємо', false);
} else {
  // 1-3. Основний сценарій + межа + одноразовість.
  const a = await run({ body: `
    const out = {};
    tab(); tab(); await wait(1200);
    out.доПорога = invites;          // два переходи — ще рано
    tab(); await wait(1200);
    out.наПорозі = invites;          // третій — саме час
    tab(); tab(); tab(); await wait(1200);
    out.після = invites;             // більше не турбуємо` });
  ok('до порога — мовчить',                        a.доПорога === 0, `запрошень: ${a.доПорога}`);
  ok('після трьох переходів запрошення приходить',  a.наПорозі === 1, `запрошень: ${a.наПорозі}`);
  ok('удруге не приходить',                         a.після === 1,   `усього: ${a.після}`);

  // 4. Залогіненому не пропонуємо входити — це базова повага до людини.
  const b = await run({ logged: true, body: `
    const out = {};
    tab(); tab(); tab(); tab(); await wait(1200);
    out.разів = invites;` });
  ok('залогіненому не приходить', b.разів === 0, `запрошень: ${b.разів}`);

  // 5-БІС. 🔴 ІНСТРУКЦІЯ «ЯК ВСТАНОВИТИ» (`.pwa-guide`) — знайдено при злитті двох
  // сесій 29.08: «b» додала цю поверхню, «c» — це запрошення, і зустрілись вони
  // вперше в `main`. Людина читає крок 1/4 з чужим меню в руках; вікно поверх неї
  // збиває саме те, заради чого інструкцію відкрили.
  const g = await run({ busyHtml: '<div class="pwa-guide">інструкція</div>', body: `
    const out = {};
    tab(); tab(); tab(); await wait(1200);
    out.підІнструкцією = invites;` });
  ok('🔴 не перебиває інструкцію «Як встановити»', g.підІнструкцією === 0, `запрошень: ${g.підІнструкцією}`);

  // 5. 🛑 Найдорожчий випадок: банер «встанови на екран» уже на екрані.
  const c = await run({ busyHtml: '<div class="pwa-cta">банер</div>', body: `
    const out = {};
    tab(); tab(); tab(); await wait(1200);
    out.підБанером = invites;
    document.querySelector('.pwa-cta').remove();   // банер закрили
    tab(); await wait(1200);
    out.післяБанера = invites;` });
  ok('не перебиває банер встановлення', c.підБанером === 0, `запрошень: ${c.підБанером}`);
  // 🔑 І не губиться: коли екран звільнився, наступний перехід доводить справу.
  ok('після закриття банера — доводить справу', c.післяБанера === 1, `запрошень: ${c.післяБанера}`);

  // 6. Показували менше місяця тому — мовчимо на цьому пристрої.
  const d = await run({ seen: true, body: `
    const out = {};
    tab(); tab(); tab(); tab(); await wait(1200);
    out.разів = invites;` });
  ok('уже показане раніше — не повторюємо', d.разів === 0, `запрошень: ${d.разів}`);
}

await stop();

const good = res.filter(Boolean).length;
console.log(`\n${good === res.length ? '✅' : '❌'} ${good}/${res.length} перевірок пройдено`);
process.exit(good === res.length ? 0 : 1);
