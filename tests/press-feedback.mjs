// Стенд: КНОПКИ ЗАСТОСУНКУ ВІДПОВІДАЮТЬ НА НАТИСК (базове правило §1).
//
// 📐 ЗНАХІДКА АУДИТУ `apple-design` (09.08). З 339 справжніх тап-цілей на 14
// екранах **152 були «німі»**: і правила `:active` немає, І рідне підсвічування
// вимкнене (`-webkit-tap-highlight-color: transparent`). Тобто на натиск не
// стається РІВНО НІЧОГО, аж поки палець не відпустять. Скіл: «Waiting for
// `click`/touch-up to show feedback feels dead».
//
// Лікування — базове правило в `style/base.css` (`opacity: 0.62` на натиск).
//
// 🔴 ЧОМУ САМЕ `opacity`, І ЧОМУ ЦЕ ВАЖЛИВО СТЕРЕГТИ.
// Спокуса зробити «як у таб-барі» — `transform: scale()`. Але `transform` на
// предку створює **containing block**: будь-який `position: fixed` усередині
// такої кнопки перестає кріпитись до екрана. Правило чіпає сотні вузлів наосліп,
// тож властивість, що вміє тихо ламати розкладку, тут заборонена. Окрема
// перевірка нижче стежить, щоб базове правило НЕ переїхало на `transform`.
//
// 🛑 ПРО ПРИХОВАНІ ЖЕСТИ. `.header-logo` і `.deploy-stamp` (5 тапів → адмінка)
// лишаються німими СВІДОМО: відгук на натиск виказав би таємний вхід. Стенд це
// закріплює — щоб наступна сесія не «дочистила» їх як пропущені.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     CSS_REV=origin/main node tests/press-feedback.mjs
// підсовує `style/base.css` ДО фіксу. Перевірки «кнопка згасає» мусять УПАСТИ,
// а перевірки про приховані жести й про заборону `transform` — лишитись
// зеленими: разом вони доводять, що стенд міряє саме додане правило.
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
await p.waitForTimeout(400);
// ⚠️ Заставка `#splash` (fixed, z-9999) живе 3.5с + згасання і перехоплює
// справжній натиск мишею. Без цього очікування стенд «доводить», що не реагує
// НІЧОГО — саме так уже сталось із `tests/tabbar-press.mjs`.
await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
await p.waitForTimeout(200);

// Зміряти `opacity` вузла, поки він натиснутий. Тиснемо БЕЗ відпускання, тож
// жодна дія не спрацьовує — екран лишається тим самим.
const прозорістьПідНатиском = async (selector) => {
  const el = p.locator(selector).first();
  if (!(await el.count())) return { нема: true };
  const box = await el.boundingBox();
  if (!box) return { нема: true };
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await p.mouse.down();
  await p.waitForTimeout(120);
  const під = await p.evaluate(s => parseFloat(getComputedStyle(document.querySelector(s)).opacity), selector);
  await p.mouse.up();
  await p.waitForTimeout(150);
  const спокій = await p.evaluate(s => parseFloat(getComputedStyle(document.querySelector(s)).opacity), selector);
  // ⚠️ Натиск із відпусканням — це справжній клік, і він СПРАЦЬОВУЄ.
  // Тап по бургеру відкриває бічне меню, і воно накриває шапку — наступна
  // кнопка вимірялась би крізь нього й показала б «не реагує» на цілком робочому
  // коді. Стенд уже спіймався на цьому один раз (і `tabbar-press.mjs` — на гейті
  // правил Дошки). Тому після кожного виміру повертаємо екран у спокій.
  //
  // 🔴 10.08 — ЧОМУ ТУТ ЗʼЯВИЛОСЬ ОЧІКУВАННЯ, І ЧОМУ ЦЕ НЕ «ПІДГОНКА ПІД ЗЕЛЕНЕ».
  // Меню тепер ІГНОРУЄ закриття, поки панель ще виїжджає (~0.28с) — це фікс бага
  // «привид тапу»: на iOS система доганяє дотик після повернення з чужого
  // застосунку, і той другий клік влучав або в затемнення, або в ✕ (хрестик
  // накриває бургер на 86% площі). Правило: у вікні анімації тап не рахується
  // рішенням людини. Див. `panelArriving()` у `src/core/sidebar.js` і сторож
  // `tests/sidebar-ghost-tap.mjs`.
  // ➡️ Прибирання клікало ✕ через 150мс після відкриття, тобто РІВНО в це вікно —
  // меню лишалось відкритим і накривало шапку, а наступна кнопка («Збережене»)
  // показувала «не реагує» на робочому коді. Стенд спіймав справжню зміну
  // поведінки; чекаємо доїзду панелі, як це робить і людина.
  // ⚠️ Чекати ОДНОГО лише доїзду геометрії МАЛО, і це заміряно: сторож тримається
  // ще й на тривалості з CSS (крива різко сповільнюється, тож панель підходить на
  // 1px до місця раніше, ніж анімація закінчується). Тому прибирання не вгадує
  // момент, а ДОБИВАЄТЬСЯ результату: тисне ✕, доки меню справді не закриється.
  for (let спроба = 0; спроба < 6; спроба++) {
    const відкрите = await p.evaluate(() => {
      const sb = document.getElementById('sidebar');
      return !!sb && sb.getBoundingClientRect().left < innerWidth - 20;
    });
    if (!відкрите) break;
    await p.evaluate(() => document.getElementById('sidebar-close')?.click());
    await p.waitForTimeout(200);
  }
  await p.evaluate(() => document.querySelector('.brules-ok')?.click());
  await p.waitForTimeout(450);
  return { під, спокій };
};

// ── Кнопки, що були німі: шапка Громади ─────────────────────────────────────
for (const [sel, назва] of [['#sidebar-toggle', 'бургер (три рисочки)'],
                            ['#saved-hub-btn', '«Збережене» в шапці']]) {
  const р = await прозорістьПідНатиском(sel);
  if (р.нема) { ok(`«${назва}» знайдено на екрані`, false, 'вузла немає'); continue; }
  ok(`🔴 «${назва}» згасає під пальцем`, р.під < 0.8, `opacity ${р.під}`);
  ok(`«${назва}» повертається у спокій`, р.спокій === 1, `opacity ${р.спокій}`);
}

// ── 🛑 Приховані жести мусять лишитись німими ───────────────────────────────
for (const [sel, назва] of [['.header-logo', 'лого (таємний перемикач діагностики)'],
                            ['.deploy-stamp', 'лічильник версії (5 тапів → адмінка)']]) {
  const р = await прозорістьПідНатиском(sel);
  if (р.нема) { ok(`«${назва}» знайдено на екрані`, false, 'вузла немає'); continue; }
  ok(`🛑 «${назва}» НЕ реагує на натиск — інакше таємний вхід себе викаже`,
     р.під === 1, `opacity ${р.під}`);
}

// ── 🔴 Базове правило не сміє бути на `transform` ───────────────────────────
// `transform` на предку робить containing block і ламає `position: fixed`
// усередині. Міряємо не текст CSS, а наслідок: під натиском матриця має лишатись
// одиничною на звичайній кнопці.
const трансформ = await p.evaluate(() => {
  const el = document.getElementById('sidebar-toggle');
  return getComputedStyle(el).transform;
});
ok('🔴 базовий відгук не використовує transform (не ламає position: fixed)',
   трансформ === 'none' || /matrix\(1,\s*0,\s*0,\s*1/.test(трансформ), трансформ);

// ── §14: згасання лишається і при «менше руху» ──────────────────────────────
// Скіл: «Reduced motion doesn't mean *no* feedback… Keep opacity changes».
await p.emulateMedia({ reducedMotion: 'reduce' });
await p.waitForTimeout(250);
const тихо = await прозорістьПідНатиском('#sidebar-toggle');
ok('при «менше руху» відгук лишається (opacity — це не рух)',
   тихо.під < 0.8, `opacity ${тихо.під}`);

await ctx.close(); await b.close(); await stop();
done();
