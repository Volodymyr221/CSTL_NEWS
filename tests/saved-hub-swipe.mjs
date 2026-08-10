// Стенд: АРКУШ «ЗБЕРЕЖЕНІ» ЗАКРИВАЄТЬСЯ СВАЙПОМ УНИЗ.
//
// Скарга Вови 10.08 (зі знімком): «модалку збереження не можу закрити свайпом».
//
// 🔑 ЧОМУ ЦЕ БУВ САМЕ ДЕФЕКТ, А НЕ «НЕ ЗРОБЛЕНА ФІЧА». Аркуш має рисочку-грабер
// (`.shub-handle`) — а рисочка це ОБІЦЯНКА жесту. Тобто інтерфейс казав «мене
// можна змахнути», і не робив нічого: закрити можна було лише тапом по
// затемненню. Рисочка, яка бреше, гірша за її відсутність.
//
// 🔴 ЛІКУВАЛОСЬ НЕ КОПІЄЮ. Жест узятий зі спільної `attachSheetDismiss`
// (`core/sheet-motion.js`) — тієї самої, якою закриваються всі модалки. Її туди
// винесено з `core/modal.js` рівно заради цього випадку: скопіювати ~50 рядків
// гортання в другий файл означало б завести другу копію правил (у проєкті вони
// вже двічі розходились). Тому цей стенд перевіряє ще й те, що механіка
// СПІЛЬНА, а не своя.
//
// 🔬 МІРЯЄМО ПОВЕДІНКУ, А НЕ НАЯВНІСТЬ КОДУ: проводимо справжній жест пальцем і
// дивимось, чи аркуш поїхав і чи зник із документа. Перевірка «є слухач
// touchmove» була б зеленою і на аркуші, який нікуди не рухається.
//
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки в проєкті.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     BUNDLE_REV=origin/main node tests/saved-hub-swipe.mjs
// на коді ДО фіксу свайп мусить НЕ закрити аркуш, а тап по затемненню — закрити:
// разом вони доводять, що зламаний був саме жест, а не закриття взагалі.
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

const відкрити = async () => {
  await p.evaluate(() => document.getElementById('saved-hub-btn')?.click());
  await p.waitForTimeout(700);
  return p.evaluate(() => !!document.querySelector('.shub-sheet'));
};
const єАркуш = () => p.evaluate(() => !!document.querySelector('.shub-sheet'));

// Справжній жест пальцем згори аркуша донизу.
const свайпВниз = async () => {
  const box = await p.evaluate(() => {
    const s = document.querySelector('.shub-sheet');
    if (!s) return null;
    const r = s.getBoundingClientRect();
    return { x: Math.round(r.left + r.width / 2), y: Math.round(r.top + 20) };
  });
  if (!box) return [];
  // 🔴 ЧИТАЄМО TRANSFORM СИНХРОННО ПІСЛЯ КОЖНОГО РУХУ, а не через MutationObserver.
  // Перша редакція стенда ставила спостерігач — і він показав лише `translateY(100%)`,
  // тобто КІНЦЕВИЙ зсув закриття. Причина: усі `touchmove` летіли в одному
  // синхронному циклі, а зворотний виклик спостерігача виконується пізніше й читає
  // ВЖЕ ОСТАННЄ значення. Перевірка «аркуш їде за пальцем» при цьому зеленіла б і
  // на аркуші, який за пальцем не їде взагалі, — бо `translateY(100%)` теж
  // підходить під «зсув є». Класика: критерій міряв не те, про що звітував.
  return p.evaluate(({ x, y }) => {
    const s = document.querySelector('.shub-sheet');
    const touch = (ty, cy) => new TouchEvent(ty, {
      bubbles: true, cancelable: true,
      touches: ty === 'touchend' ? [] : [new Touch({ identifier: 1, target: s, clientX: x, clientY: cy })],
      changedTouches: [new Touch({ identifier: 1, target: s, clientX: x, clientY: cy })],
    });
    const кадри = [];
    s.dispatchEvent(touch('touchstart', y));
    for (const d of [40, 90, 150, 220]) {
      s.dispatchEvent(touch('touchmove', y + d));
      кадри.push(s.style.transform);          // ← значення саме цього кадру
    }
    s.dispatchEvent(touch('touchend', y + 220));
    return кадри;
  }, box);
};

ok('аркуш «Збережені» відкривається кнопкою в шапці', await відкрити());

ok('у аркуша є рисочка-грабер (саме вона обіцяє свайп)',
   await p.evaluate(() => !!document.querySelector('.shub-handle')));

const рухи = await свайпВниз();
// Саме СТЕЖЕННЯ 1:1, а не «зсув колись зʼявився»: значення мусять РОСТИ разом із
// пальцем і бути в пікселях (кінцеве `translateY(100%)` закриття сюди не рахується).
const пікселі = рухи.map(t => { const m = /translateY\(([\d.]+)px\)/.exec(t || ''); return m ? +m[1] : null; })
                    .filter(v => v !== null);
ok('🔴 аркуш ЇДЕ ЗА ПАЛЬЦЕМ: зсув росте разом із рухом',
   пікселі.length >= 3 && пікселі.every((v, i) => i === 0 || v > пікселі[i - 1]),
   рухи.map(t => t || '—').join(' · '));

await p.waitForTimeout(700);
ok('🔴 після свайпу аркуш ЗАКРИВСЯ (зник із документа)',
   !(await єАркуш()));

ok('замок прокрутки сторінки знято (`modal-open` більше немає на body)',
   await p.evaluate(() => !document.body.classList.contains('modal-open')));

// ── Контрольна пара: тап по затемненню закривав і ДО фіксу ───────────────────
// Без неї падіння свайпу можна було б списати на «аркуш узагалі не закривається».
ok('аркуш відкривається вдруге (свайп не зламав повторне відкриття)', await відкрити());
await p.evaluate(() => document.querySelector('.shub-backdrop')?.click());
await p.waitForTimeout(600);
ok('🛑 тап по затемненню теж закриває (цей шлях працював і до фіксу)',
   !(await єАркуш()));

// ── Механіка СПІЛЬНА, а не своя копія ───────────────────────────────────────
// Якщо колись хтось напише хабу власний жест, стенд це покаже: у файлі мусить
// лишатись виклик спільного примітиву, а не свої `touchmove`.
// ⚠️ Ця перевірка НЕ падає в контролі — і це нормально: вона читає файл із диска,
// а контроль підміняє лише `bundle.js`. Її роль не «довести фікс», а не дати
// майбутній сесії підмінити спільний жест власною копією.
const код = await p.evaluate(async (base) => (await fetch(base + '/src/core/saved-hub.js')).text(), url);
ok('🔑 хаб бере СПІЛЬНУ `attachSheetDismiss`, а не пише свій жест',
   /attachSheetDismiss\s*\(/.test(код) && !/addEventListener\(\s*['"]touchmove/.test(код));

await ctx.close(); await b.close(); await stop();
done();
