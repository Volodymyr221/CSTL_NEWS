// Стенд: ЗАСТОСУНОК ЩЕ РАЗ СПИТАЄ ІМʼЯ — АЛЕ НЕ ДОКУЧАТИМЕ.
//
// 🔴 НАВІЩО ЗАВЕДЕНИЙ (27.09.2026). Оцінка готовності 26.09 знайшла тиху ваду:
// профіль можна було створити ПОРОЖНІМ, і застосунок більше не питав ніколи.
//   • кнопка «Пізніше» кличе `finish(false)`, тобто ЗБЕРІГАЄ анкету з порожнім
//     імʼям — рядок у `profiles` створюється;
//   • запрошення доповнити стояло на умові «рядка ще немає» (`if (!profile)`) —
//     а рядок уже є;
//   • тригер `profiles_guard_name` у базі порожнє імʼя пропускає свідомо
//     (`if norm = '' then return new`).
// ➡️ Людина лишалась «Жителем» назавжди — на своїх оголошеннях і питаннях, —
//    поки сама не залізе в Кабінет. Сусід при цьому не знає, хто продає.
//
// 🔑 ЩО ТУТ СТЕРЕЖЕТЬСЯ — ДВІ ПРОТИЛЕЖНІ РЕЧІ ОДНОЧАСНО, і саме тому стенд є.
// Лікувати це «питати щоразу, поки імені немає» було б гірше за хворобу: PWA
// відкривають по кілька разів на день, і людина навчилась би закривати вікно не
// читаючи. Тому стеля: PROFILE_ASK_MAX запитів, далі тиша й Кабінет.
//   Прогін 1 — ще питає (вада полагоджена).
//   Прогін 2 — після стелі МОВЧИТЬ (лікування не стало докучанням).
//   Прогін 3 — КОНТРОЛЬ: імʼя є → не питає жодного разу, навіть на нулі лічильника.
// Без третього перші два нічого не доводять: вікно, яке лізе завжди, пройшло б
// перший і був би «зелений» стенд на зламаному застосунку.
//
// 🔴 КОНТРОЛЬ РЕВІЗІЄЮ: BUNDLE_REV=origin/main node tests/profile-name-ask.mjs
// На коді до 27.09 прогін 1 мусить упасти — там вікно не приходить узагалі
// (заміряно: 5/7). ⚠️ Прогони 2 і 3 у контролі зеленіють ХИБНО — на старому
// коді вікно не приходить НІКОЛИ, тож «мовчить» там правда з іншої причини.
// Доводить фікс саме прогін 1; 2 і 3 стережуть його від перелікування.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const BUNDLE_REV = process.env.BUNDLE_REV || '';
const ASK_KEY = 'cstl_profile_ask';
const UID = 'u-bezimenniy';

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);
const errs = [];

// Житель, який колись натиснув «Пізніше»: рядок у `profiles` Є, імені в ньому
// НЕМА. Саме цей стан і робив вікно недосяжним назавжди.
const БЕЗ_ІМЕНІ = [{ uid: UID, email: 'test@example.invalid', name: null, surname: null,
                     avatar_url: null, birth_date: null }];
const З_ІМЕНЕМ  = [{ uid: UID, email: 'test@example.invalid', name: 'Петро', surname: 'Коваль',
                     avatar_url: null, birth_date: null }];

// @param профілі  що лежить у таблиці `profiles`
// @param лічильник скільки разів ми вже питали (null = ключа немає)
async function прогін(профілі, лічильник) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  p.on('pageerror', e => errs.push(String(e)));
  await mockSupabase(p, { profiles: профілі, posts: [], announcements: [] },
                     { user: { id: UID, email: 'test@example.invalid', user_metadata: {} } });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  if (BUNDLE_REV) {
    const body = projectFile('bundle.js', BUNDLE_REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }
  // Лічильник мусить лежати ДО завантаження застосунку — його читають при вході.
  // ⚠️ `addInitScript` виконується в кожному документі до будь-якого коду
  // сторінки; писати після `goto` було б запізно, вікно вже вирішило б.
  if (лічильник !== null) {
    await p.addInitScript(([k, uid, n]) => {
      try { localStorage.setItem(k, JSON.stringify({ [uid]: n })); } catch { /* приватне вікно */ }
    }, [ASK_KEY, UID, лічильник]);
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2500);   // сплеш + вхід + запит профілю
  const стан = await p.evaluate((k) => {
    // Екран 2 «Раді вас бачити» — питаємо по полю імені, а не по заголовку:
    // заголовок може бути переписаний, поле — це суть вікна.
    const поле = document.querySelector('#acc-name');
    let мапа = null;
    try { мапа = JSON.parse(localStorage.getItem(k) || 'null'); } catch { /* ok */ }
    return { питає: !!poleВидиме(поле), мапа };
    function poleВидиме(el) {
      return el && el.offsetParent !== null;
    }
  }, ASK_KEY);
  await ctx.close();
  return стан;
}

// ── ПРОГІН 1: імені немає, ще не питали ──────────────────────────────────────
const перший = await прогін(БЕЗ_ІМЕНІ, 0);
ok('🔴 профіль без імені — застосунок питає знову', перший.питає,
   перший.питає ? 'питає' : 'МОВЧИТЬ — вада повернулась');
ok('запит порахований (інакше стеля ніколи не настане)',
   (перший.мапа || {})[UID] === 1, JSON.stringify(перший.мапа));

// ── ПРОГІН 2: стеля вичерпана ────────────────────────────────────────────────
// 3 — це PROFILE_ASK_MAX у `src/core/account-ui.js`. 🛑 Число тут стоїть числом
// навмисно: якщо стелю колись піднімуть, цей рядок мусить почервоніти й змусити
// перечитати, чи це ще «нагадування», а не «докучання».
const після = await прогін(БЕЗ_ІМЕНІ, 3);
ok('🛑 після трьох запитів застосунок МОВЧИТЬ', !після.питає,
   після.питає ? 'усе одно лізе' : 'мовчить');
ok('і лічильник більше не росте', (після.мапа || {})[UID] === 3, JSON.stringify(після.мапа));

// ── ПРОГІН 3: КОНТРОЛЬ — імʼя є ──────────────────────────────────────────────
const зіменем = await прогін(З_ІМЕНЕМ, 0);
ok('🔑 КОНТРОЛЬ: імʼя заповнене — не питає навіть на нулі лічильника', !зіменем.питає,
   зіменем.питає ? 'питає дарма' : 'мовчить');
ok('КОНТРОЛЬ: і нічого не рахує', ((зіменем.мапа || {})[UID] || 0) === 0,
   JSON.stringify(зіменем.мапа));

ok('помилок у консолі нема', errs.length === 0, errs.slice(0, 2).join(' | '));

await b.close();
await stop();
done();
