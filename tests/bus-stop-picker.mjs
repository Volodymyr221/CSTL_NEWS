// Стенд: СПИСОК ЗУПИНОК ПОМІЩАЄТЬСЯ НА ЕКРАНІ І НЕ СМИКАЄ СТОРІНКУ.
//
// 🔴 ЗАМОВЛЕННЯ ВОВИ — ДВА ЗНІМКИ З ТЕЛЕФОНА (10.08). Він відкрив Автобуси і
// тапнув «Звідки»/«Куди». На знімках видно два дефекти:
//   1. список зупинок обрізаний — «Жорнище» перерізане навпіл, «Звірів» видно
//      лише крізь щілину над клавіатурою;
//   2. на другому знімку шапка «CSTL LIFE» поїхала вгору і обрізалась, хоча
//      сторінку ніхто не гортав.
//
// 🔑 КОРІНЬ ОДИН НА ОБИДВА — і він не в клавіатурі.
// (1) `.bs-dropdown` мав `max-height: 56vh` у CSS. Але список починається не від
//     верху екрана, а під панеллю пошуку (≈470px). 470 + 56vh(473) = **943 при
//     екрані 844** — низ виїжджав за екран НАВІТЬ БЕЗ КЛАВІАТУРИ. Клавіатура
//     лише робила видимою давню помилку. `vh` (і `dvh`) на iOS клавіатуру не
//     враховують узагалі — єдине джерело правди це `visualViewport`.
// (2) «Звідки»/«Куди» — `readonly`-інпути в ролі кнопок. Вони однаково ловлять
//     фокус, а iOS на фокус у полі прокручує webview «щоб показати поле» — це і
//     є з'їхала шапка.
//
// 🔬 ЩО МІРЯЄМО — і як ця перевірка вже раз збрехала.
// Перша редакція стенда просто відкривала список і дивилась на його низ. Вона
// дала **7/7 і на коді ДО фіксу** — тобто не доводила нічого. Причина: у
// пісочниці панель пошуку стоїть вище, ніж на телефоні Вови (список починається
// на 184px замість ≈470px), і 184 + 56vh = 657 < 844 — переповнення просто не
// відтворювалось. **Шістнадцятий випадок брехливої перевірки в проєкті.**
// ➡️ Тепер сцена ВІДТВОРЮЄТЬСЯ явно: список ставиться на ту саму низьку
// позицію, що на телефоні, і зменшення видимої зони імітується подією
// `visualViewport`. Новий код перераховує висоту, старий тримає сталі 56vh.
// Так само з фокусом: він мірявся ПІСЛЯ того, як код сам переводив його на поле
// пошуку (через 80мс) — тобто перехідний фокус на тригері був невидимий.
// Тепер міряємо між `pointerdown` і `pointerup`, коли фокус іще на тригері.
//
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки в проєкті.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     BUNDLE_REV=origin/main node tests/bus-stop-picker.mjs
// на коді ДО фіксу обидві 🔴-перевірки мусять УПАСТИ.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();
await mockSupabase(p,
  { posts: [], threads: [], messages: [], thread_user_state: [], announcements: [] },
  { user: ME, profiles: [{ uid: 'u-me', name: 'Вова', avatar_url: '' }] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
if (REV) {
  const body = projectFile('bundle.js', REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1600);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
await p.evaluate(() => window.switchTab && window.switchTab('buses'));
await p.waitForTimeout(2600);

const тригер = p.locator('#bs-from-input');
ok('сцена: вкладка Автобуси і поле «Звідки» на екрані', await тригер.count() > 0);

// Тиснемо СПРАВЖНІМ дотиком — саме він у Safari дає і фокус, і прокрутку.
const box = await тригер.boundingBox();
await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
await p.mouse.down();
// 🔴 Фокус міряємо ТУТ, поки палець ще притиснутий: код сам переводить фокус на
// поле пошуку через 80мс, і після відпускання перехідного фокуса вже не видно.
const фокусПідНатиском = await p.evaluate(() => {
  const a = document.activeElement;
  return a ? (a.id || a.tagName) : '—';
});
await p.mouse.up();
await p.waitForTimeout(700);

ok('🔴 поле-кнопка «Звідки» НЕ забирає фокус у момент натиску (iOS не прокручує сторінку)',
   фокусПідНатиском !== 'bs-from-input' && фокусПідНатиском !== 'bs-to-input', `фокус під пальцем: ${фокусПідНатиском}`);

const стан = await p.evaluate(() => {
  const dd = document.getElementById('bs-dropdown');
  if (!dd || dd.hidden) return { нема: true };
  const r = dd.getBoundingClientRect();
  const a = document.activeElement;
  return {
    верх: Math.round(r.top), низ: Math.round(r.bottom), екран: window.innerHeight,
    фокусНаТригері: a && (a.id === 'bs-from-input' || a.id === 'bs-to-input'),
    фокус: a ? (a.id || a.tagName) : '—',
    прокрутка: Math.round(window.scrollY),
  };
});

if (стан.нема) {
  ok('список зупинок відкрився', false, 'дропдаун схований');
} else {
  ok('список зупинок відкрився', true, `верх ${стан.верх}px`);

  // 🔴 ГОЛОВНЕ: низ списку всередині екрана.
  ok('🔴 низ списку зупинок НЕ виїжджає за екран',
     стан.низ <= стан.екран, `низ ${стан.низ}px при екрані ${стан.екран}px`);

  // Поле пошуку всередині списку фокус отримати МАЄ — інакше зникне набір.
  ok('поле «Пошук зупинки» отримало фокус', стан.фокус === 'bs-dd-filter', стан.фокус);

  // Список мусить лишитись прокручуваним — «помістити» не означає «обрізати».
  const скрол = await p.evaluate(() => {
    const l = document.querySelector('#bs-dropdown .bs-dd-list');
    return l ? { вміст: l.scrollHeight, вікно: l.clientHeight } : null;
  });
  ok('список лишився прокручуваним (зупинки не втрачені)',
     !!скрол && скрол.вміст > скрол.вікно, скрол ? `${скрол.вміст} у вікні ${скрол.вікно}` : 'нема');
}

// ── 🔴 СЦЕНА ТЕЛЕФОНА: список починається низько ────────────────────────────
// На телефоні Вови список стартує на ≈470px (під панеллю пошуку з живими
// даними), а не на 184px як у порожній пісочниці. Ставимо ту саму геометрію і
// повідомляємо про зміну видимої зони — рівно те, що робить клавіатура.
const низько = await p.evaluate(() => {
  const dd = document.getElementById('bs-dropdown');
  if (!dd || dd.hidden) return null;
  dd.style.top = '470px';
  window.visualViewport?.dispatchEvent(new Event('resize'));
  return null;
});
void низько;
await p.waitForTimeout(300);
const післяЗсуву = await p.evaluate(() => {
  const dd = document.getElementById('bs-dropdown');
  const r = dd.getBoundingClientRect();
  return { верх: Math.round(r.top), низ: Math.round(r.bottom), екран: window.innerHeight };
});
ok('🔴 при низькій позиції (як на телефоні) список НЕ виїжджає за екран',
   післяЗсуву.низ <= післяЗсуву.екран,
   `верх ${післяЗсуву.верх}px · низ ${післяЗсуву.низ}px при екрані ${післяЗсуву.екран}px`);

// ── Закриття: слухачі знято, висота скинута ─────────────────────────────────
// Якщо `max-height` лишиться на схованому вузлі, наступне відкриття з іншої
// позиції успадкує чужу висоту.
await p.evaluate(() => document.getElementById('bs-dd-x')?.click());
await p.waitForTimeout(400);
ok('після закриття висота списку скинута',
   await p.evaluate(() => {
     const dd = document.getElementById('bs-dropdown');
     return !!dd && dd.hidden && !dd.style.maxHeight;
   }));

await ctx.close(); await b.close(); await stop();
done();
