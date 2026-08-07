// Стенд №47: ПУНКТ «ПОВІДОМЛЕННЯ» У FAB-МЕНЮ ДОШКИ СПРАВДІ ВІДКРИВАЄ ЕКРАН.
//
// 🔴 ЗАРАДИ ЧОГО ВІН ІСНУЄ — баг B-30 (знайдений Вовою живим тестом 07.08).
// Симптом дослівно: «заходив у вкладку "повідомлення" через меню FAB в дошці і
// тапав на цю вкладку — і воно не відкривалось». Мовчки, без тосту, без екрана.
//
// КОРІНЬ. `closeFab` був оголошений як `const` УСЕРЕДИНІ `renderAll()`, а
// `syncMsgFab()` — функція рівня модуля — його викликала. Різні області
// видимості: у зібраному `bundle.js` esbuild навіть перейменував локальну на
// `closeFab2`, а виклик усередині `syncMsgFab` лишився звертанням до
// неіснуючого глобального імені → `ReferenceError` у момент тапу. Обробник падав
// на ПЕРШОМУ рядку, тож `requireAuth` і `openThreadsList` не виконувались ніколи.
//
// 🔑 ЧОМУ ЦЕ НЕ ЛОВИЛОСЬ 46 СТЕНДАМИ. Ламався лише пункт, ВСТАВЛЕНИЙ пізніше
// через `syncMsgFab()` — тобто в людини без власних оголошень, але з розмовами
// (пункт домальовується, коли асинхронно приїжджають треди). Пункт, намальований
// `renderFab()`, отримував обробник із правильної області видимості й працював.
// А будь-який наступний повний рендер «лікував» баг — тому в пісочниці він і не
// відтворювався. Наявний сторож `board-fab-icon.mjs` дивиться на ТЕКСТ коду і
// каже лише «пункт малюється за правилом» — він був зелений увесь час.
// ➡️ Це рівно та знахідка A-1 аудиту Дошки: сторожі стережуть ВИГЛЯД, а не
// поведінку. Цей стенд міряє НАСЛІДОК: після тапу екран або є, або його немає.
//
// 🔴 КОНТРОЛЬ (обовʼязковий, інакше стенд нічого не вартий):
//     BUNDLE_REV=<git-ish> node tests/board-fab-messages.mjs
// підсовує сторінці `bundle.js` із зазначеної ревізії. На ревізії ДО фіксу
// перевірки мусять УПАСТИ — саме так і доведено, що вони міряють цей баг, а не
// щось поруч.
//
// ⚠️ `serviceWorkers: 'block'` — інакше запити другої вкладки йдуть через
// `sw.js` повз `page.route`, і підміна тихо не спрацьовує (восьмий випадок
// брехливої перевірки в цьому проєкті).
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

// ── Сцена: житель БЕЗ власних оголошень, але З розмовою ─────────────────────
// Саме ця пара умов і веде в зламану гілку: на момент першого рендера Дошки
// `canSeeMessages()` = false (треди ще не приїхали) → пункт малює НЕ `renderFab`,
// а `syncMsgFab()` після події `cstl-threads-changed`.
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };
const NOW = new Date().toISOString();

const POSTS = [{
  id: 'p-1', type: 'board', category: 'sell', title: 'ВЕЛОСИПЕД ДОРОСЛИЙ',
  text: 'Робочий стан, торг доречний.', price: '2500', location: 'Олика',
  author: 'Сусід', owner_uid: 'u-other', contact: '', photos: [],
  status: 'published', published_at: NOW, created_at: NOW,
}];

const THREADS = [{
  id: 't-1', post_id: 'p-1', author_uid: 'u-other', buyer_uid: ME.id,
  author_name: 'Сусід', buyer_name: 'Вова',
  last_message_at: NOW, last_message_text: 'Ще актуально?',
  post: POSTS[0],
}];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();

// Помилки сторінки — це і є симптом B-30. Ловимо ДО переходу.
const pageErrors = [];
p.on('pageerror', e => pageErrors.push(String(e && e.message || e)));

// `slow.threads` — розмови приїжджають ПІСЛЯ першого рендера Дошки. Це не
// «уповільнити щоб спрацювало»: саме так поводиться телефон у мережі, і саме
// цей порядок подій відкриває гілку `syncMsgFab()`, де жив B-30.
await mockSupabase(p,
  { posts: POSTS, threads: THREADS, messages: [], thread_user_state: [], announcements: [] },
  { user: ME, slow: { threads: 2200 } });
await p.route('**://api.open-meteo.com/**', r => r.abort());
// Контроль: підсунути bundle.js із зазначеної ревізії (див. шапку).
if (REV) {
  const body = projectFile('bundle.js', REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(200);
// 🔑 ПЕРЕДУМОВА СЦЕНИ МІРЯЄТЬСЯ, А НЕ ВГАДУЄТЬСЯ ЗА ЧАСОМ.
// Спершу хотілось просто «зробити знімок через 800мс — пункту ще нема». Але це
// прив'язка до швидкості заглушки: приїдуть треди на кадр раніше — і стенд тихо
// перевірятиме ЗДОРОВУ гілку (`renderFab`), лишаючись зеленим на зламаному коді.
// Тому питаємо DOM, ЯК саме пункт зʼявився:
//   • `renderFab()` малює меню цілим — у мутації додається вузол `#board-fab`,
//     а кнопка всередині окремою addedNode не приходить;
//   • `syncMsgFab()` робить `insertAdjacentHTML('afterbegin')` у ГОТОВЕ меню —
//     і саме кнопка приходить addedNode.
// Отже лічильник > 0 = сцена та, яку описав Вова.
await p.evaluate(() => {
  window.__msgFabInserts = 0;
  new MutationObserver(muts => {
    for (const m of muts) for (const n of m.addedNodes) {
      if (n.nodeType === 1 && n.matches && n.matches('[data-fab="messages"]')) window.__msgFabInserts++;
    }
  }).observe(document.body, { subtree: true, childList: true });
});
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(800);
await p.evaluate(() => document.querySelector('.brules-ok')?.click());

// Даємо тредам приїхати → `cstl-threads-changed` → `syncMsgFab()` вставляє пункт.
await p.waitForSelector('#board-fab-menu [data-fab="messages"]', { timeout: 8000 }).catch(() => {});
await p.waitForTimeout(400);

const сцена = await p.evaluate(() => ({
  пунктЄ: !!document.querySelector('#board-fab-menu [data-fab="messages"]'),
  вставок: window.__msgFabInserts,
}));

// ── ПЕРЕДУМОВА СЦЕНИ ────────────────────────────────────────────────────────
// Якщо ці дві не виконались — сцена не та, і решта перевірок нічого не доводить.
ok('сцена: вхід у листування є в меню', сцена.пунктЄ);
ok('сцена: пункт вставив саме syncMsgFab (зламана гілка B-30)',
   сцена.вставок > 0, `вставок: ${сцена.вставок}`);

// ── ГОЛОВНЕ: ТАП ВІДКРИВАЄ ЕКРАН ────────────────────────────────────────────
await p.evaluate(() => document.getElementById('board-trigger')?.click());
await p.waitForTimeout(350);
const менюВідкрите = await p.evaluate(() =>
  !!document.getElementById('board-fab')?.classList.contains('open'));
ok('сцена: FAB-меню розкрилось', менюВідкрите);

const помилокДоТапу = pageErrors.length;
await p.evaluate(() => document.querySelector('#board-fab-menu [data-fab="messages"]')?.click());
await p.waitForTimeout(1200);

const s = await p.evaluate(() => {
  const scr = document.querySelector('.pm-screen--list');
  const r = scr?.getBoundingClientRect();
  return {
    екранУDOM: !!scr,
    видимий: !!scr?.classList.contains('visible'),
    уМежахЕкрана: r ? Math.round(r.top) < window.innerHeight - 100 : false,
    заголовок: scr?.querySelector('.pm-head-name')?.textContent.trim() || '',
    менюЗакрилось: !document.getElementById('board-fab')?.classList.contains('open'),
  };
});
const новіПомилки = pageErrors.slice(помилокДоТапу);

ok('🔴 тап по «Повідомлення» створив екран списку розмов', s.екранУDOM);
ok('🔴 екран справді видимий (не лишився за краєм)', s.видимий && s.уМежахЕкрана,
   `visible=${s.видимий} top у межах=${s.уМежахЕкрана}`);
ok('екран називає себе «Повідомлення»', /Повідомлення/.test(s.заголовок), s.заголовок);
ok('FAB-меню закрилось за собою', s.менюЗакрилось);

// 🔑 Пряма підпис під коренем бага: тап не має кидати ReferenceError.
ok('🔴 тап не кинув жодної помилки сторінки', новіПомилки.length === 0,
   новіПомилки.join(' | ') || 'помилок нема');
ok('за всю сцену немає ReferenceError по closeFab',
   !pageErrors.some(m => /closeFab/.test(m)),
   pageErrors.filter(m => /closeFab/.test(m)).join(' | ') || 'нема');

await ctx.close(); await b.close(); await stop();
done();
