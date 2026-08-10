// Стенд: ЗОНА ДОТИКУ ДРІБНИХ КЕРУНКІВ (§10 скіла `apple-design`).
//
// 📐 ЗНАХІДКА АУДИТУ (09.08). Найдрібніші керунки застосунку:
//   `.bus-week-page-dot` — **5×5px**, `.bhv4-dot-nav` — 6×6,
//   поля пошуку Автобусів — **16px заввишки** при рамці 44px.
// У перше майже неможливо попасти пальцем; у друге палець потрапляє лише в
// тонкий рядок посередині нормальної на вигляд рамки.
//
// 🔬 ЩО САМЕ МІРЯЄМО — і чому не розміри з CSS.
// Питання не «який `width` у крапки», а «куди можна ткнути, щоб влучити».
// Тому стенд бере `document.elementFromPoint()` у точках навколо центра і
// питає, чи керунок усе ще ловить палець. Це міряє НАСЛІДОК (зону), а не
// запис у стилях: невидимий `::after` у CSS «не існує», а для пальця існує.
//
// 🔴 ЧЕСНО ПРО 44×44. Норму Apple тут НЕ досягнуто, і стенд цього не вдає.
// Крапки тижня стоять із кроком 11px — зона в 44px перекрила б сусідні, і вони
// крали б одна в одної натиск. «Попадає не туди» гірше за «важко попасти».
// Тому перевіряється домовлена ціль: **ширина ≥ кроку, висота ≥ 24px**, і
// ОКРЕМО — що сусідня крапка свою зону зберегла. Друга перевірка тут головна:
// без неї «збільшив зону» легко перетворюється на «зламав сусіда».
//
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки в проєкті.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     CSS_REV=origin/main node tests/tap-targets.mjs
// підсовує `style/base.css` ДО фіксу — перевірки зони мусять УПАСТИ, а
// «сусід не вкрадений» лишитись зеленою (до фіксу красти не було чим).
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.CSS_REV || '';
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
  const body = projectFile('style/base.css', REV);
  await p.route('**/style/base.css', r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
}

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1600);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
await p.evaluate(() => window.switchTab && window.switchTab('buses'));
await p.waitForTimeout(2600);

// Зона дотику: від центра керунка розходимось по осях, поки `elementFromPoint`
// усе ще віддає САМ керунок (або його псевдо-нащадка — псевдо повертається як
// сам елемент). Крок 1px, стеля 60px, щоб не зациклитись.
const зона = (selector, індекс = 0) => p.evaluate(([sel, i]) => {
  const el = document.querySelectorAll(sel)[i];
  if (!el) return null;
  const r = el.getBoundingClientRect();
  const cx = r.left + r.width / 2, cy = r.top + r.height / 2;
  const ловить = (x, y) => { const t = document.elementFromPoint(x, y); return t === el || el.contains(t); };
  if (!ловить(cx, cy)) return { центрНеЛовить: true };
  let л = 0, пр = 0, вг = 0, вн = 0;
  while (л < 60 && ловить(cx - л - 1, cy)) л++;
  while (пр < 60 && ловить(cx + пр + 1, cy)) пр++;
  while (вг < 60 && ловить(cx, cy - вг - 1)) вг++;
  while (вн < 60 && ловить(cx, cy + вн + 1)) вн++;
  return { ш: л + пр + 1, в: вг + вн + 1, свій: Math.round(r.width) + '×' + Math.round(r.height) };
}, [selector, індекс]);

// ── Крапки тижня в Автобусах ────────────────────────────────────────────────
const крапка = await зона('.bus-week-page-dot', 0);
if (!крапка || крапка.центрНеЛовить) {
  ok('крапки-сторінки тижня знайдено на екрані', false, JSON.stringify(крапка));
} else {
  ok(`🔴 зона крапки тижня ширша за саму крапку (${крапка.свій})`,
     крапка.ш >= 11, `зона ${крапка.ш}×${крапка.в}`);
  ok('🔴 зона крапки тижня заввишки щонайменше 24px',
     крапка.в >= 24, `${крапка.в}px`);

  // 🔴 ГОЛОВНА ПЕРЕВІРКА: сусід не вкрадений.
  const сусід = await зона('.bus-week-page-dot', 1);
  ok('🔴 СУСІДНЯ крапка ловить власний центр (зони не перекрились)',
     !!сусід && !сусід.центрНеЛовить, сусід ? `зона ${сусід.ш}×${сусід.в}` : 'нема');
}

// ── Крапки навігації на банері маршруту ─────────────────────────────────────
// 🛑 СВІДОМО НЕ ПЕРЕВІРЯЄМО ТУТ. `.bhv4-dot-nav` живе на банері маршруту, який
// малюється лише за живих даних рейсів; у тестовій сцені він 0×0 і лежить у
// точці (0,0). Перевірка на ньому падала б не через код, а через відсутність
// сцени — і сторож почав би брехати в найгірший бік: «зламано» на справному.
// Те саме правило CSS доводять крапки тижня вище; коли зʼявиться надійна сцена
// з рейсом, сюди можна дописати ті самі три рядки.

// ── Поле пошуку: слухає всю висоту рамки, а не тонкий рядок ─────────────────
const поле = await зона('#bs-from-input');
if (!поле || поле.центрНеЛовить) {
  ok('поле пошуку «Від» знайдено на екрані', false, JSON.stringify(поле));
} else {
  ok(`🔴 поле «Від» слухає всю висоту рамки, а не рядок тексту (${поле.свій})`,
     поле.в >= 40, `зона заввишки ${поле.в}px`);
}

// ── Що НЕ мало змінитись: вигляд самих крапок ───────────────────────────────
// Зона — невидима. Якщо крапка почала виглядати більшою, це вже не «зона дотику»,
// а зміна дизайну, якої ніхто не замовляв (HOT_RULES №9).
const вигляд = await p.evaluate(() => {
  const d = document.querySelector('.bus-week-page-dot');
  const r = d.getBoundingClientRect();
  return { ш: Math.round(r.width), в: Math.round(r.height) };
});
ok('🛑 сама крапка на вигляд лишилась 5×5 (виросла тільки невидима зона)',
   вигляд.ш === 5 && вигляд.в === 5, `${вигляд.ш}×${вигляд.в}`);

await ctx.close(); await b.close(); await stop();
done();
