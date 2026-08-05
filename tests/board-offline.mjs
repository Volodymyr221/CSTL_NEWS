// Стенд №39: ДОШКА БЕЗ БАЗИ — ЗБІЙ НАЗИВАЄТЬСЯ ЗБОЄМ.
//
// 🔴 ЗАРАДИ ЧОГО ВІН ІСНУЄ (аудит 05.08).
// До 05.08 `renderBoard()` при недоступному Supabase мовчки падав на
// `data/community-board.json` і малював СІМ ВИГАДАНИХ ОГОЛОШЕНЬ із ВИГАДАНИМИ
// ТЕЛЕФОНАМИ — «Іван, +38 050 123 45 67», «Андрій, +38 095 444 55 66» — без
// жодної позначки, що це заглушка. Тобто в людини падала мережа, а вона бачила
// «Продам молоду корову, 18 тис., Олика» з номером, за яким могла подзвонити
// сторонній людині. Те саме стояло у ДРУГОМУ місці — віджеті Дошки на Громаді.
//
// Це та сама межа, яку проєкт уже двічі провів собі сам: «23 переглядають зараз»
// у капсулах і «124 донати» на картці збору відкинуто з тієї ж причини — не
// показувати вигадане як справжнє. Демо писалось, ПОКИ БАЗА БУЛА ПОРОЖНЯ; вона
// вже не порожня, отже фолбек спрацьовував лише при ЗБОЇ — там брехати найдорожче.
//
// 🔑 ЩО САМЕ МІРЯЄМО: не «чи є рядок у коді», а НАСЛІДОК на екрані — скільки
// карток намалювалось, коли бази немає. Текстова перевірка пропустила б повернення
// демо під іншою назвою файлу.
//
// ⚠️ `serviceWorkers: 'block'` — без нього запити йдуть повз `page.route`
// (восьмий випадок брехливої перевірки в цьому проєкті).
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter('board-offline');
const { url, stop } = await serve();
const b = await launch(chromium);
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });

// База НЕДОСЯЖНА — рівно те, що буває при збої мережі або лежачому Supabase.
// Бібліотеку з CDN теж рубаємо: саме її відсутність і робить клієнта порожнім.
await p.route('**://cdn.jsdelivr.net/npm/@supabase/supabase-js**', r => r.abort());
await p.route('**://*.supabase.co/**', r => r.abort());
await p.route('**://api.open-meteo.com/**', r => r.abort());

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(200);
await p.evaluate(() => window.switchTab && window.switchTab('board'));
await p.waitForTimeout(2000);
await p.evaluate(() => document.querySelector('.brules-ok')?.click());
await p.waitForTimeout(1200);

const s = await p.evaluate(() => {
  const root = document.getElementById('board-content');
  const off = root?.querySelector('.bd-offline');
  const btn = root?.querySelector('.bd-offline-btn');
  const r = btn?.getBoundingClientRect();
  return {
    карток: root ? root.querySelectorAll('.cm-board-note').length : -1,
    офлайн: !!off,
    заголовок: off?.querySelector('.bd-offline-ttl')?.textContent.trim() || '',
    кнопка: btn?.textContent.trim() || '',
    тапКнопки: r ? Math.round(r.height) : 0,
    текст: root?.innerText || '',
  };
});

// ── ГОЛОВНЕ ────────────────────────────────────────────────────────────────
ok('🔴 без бази НЕ намальовано жодного оголошення', s.карток === 0, `карток: ${s.карток}`);
ok('🔴 показано стан «недоступно», а не порожній екран', s.офлайн, s.заголовок);
ok('людині сказано, що це збій звʼязку', /недоступн/i.test(s.заголовок), s.заголовок);
// Кнопка має сенс саме тут: причина екрана тимчасова, тож повтор може спрацювати.
ok('є кнопка повтору', /спробувати/i.test(s.кнопка), s.кнопка);
ok('кнопка не менша за тап-ціль Apple HIG 44px', s.тапКнопки >= 44, `${s.тапКнопки}px`);

// 🔴 Жодного вигаданого контакту на екрані. Саме телефони робили стару поведінку
// небезпечною, тому вони — окрема перевірка, а не наслідок «карток нема».
ok('🔴 на екрані немає телефонів', !/\+38[\s\d]{9,}/.test(s.текст),
   (s.текст.match(/\+38[\s\d]{9,}/g) || []).join(' '));

// ── ДРУГИЙ РУБІЖ: демо-файл не має повернутись у код ────────────────────────
// Наслідок вище — головний критерій, але фолбек можна відновити й «тимчасово»,
// тому ловимо саме звертання до файлу. Перевіряємо ОБИДВА місця: те саме
// порушення стояло і в Дошці, і у віджеті Громади.
const board = projectFile('src/tabs/board.js');
const blocks = projectFile('src/tabs/community-blocks.js');
const usesDemo = src => /fetch\(\s*['"`][^'"`]*community-board\.json/.test(src);
ok('🔴 board.js не тягне демо-оголошень', !usesDemo(board));
ok('🔴 віджет Громади не тягне демо-оголошень', !usesDemo(blocks));

// ── КОНТРОЛЬ: перевірка вміє падати ────────────────────────────────────────
// Без цього рядка стенд, який завжди зелений, довів би лише сам себе.
ok('контроль: сторож ловить повернений фолбек',
   usesDemo("const r = await fetch('./data/community-board.json');"));

// ── Віджет Дошки на Громаді — те саме правило, другий екран ─────────────────
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForTimeout(2500);
const w = await p.evaluate(() => {
  const el = document.getElementById('cm-board-content');
  return { текст: el?.innerText || '', рядків: el ? el.querySelectorAll('[data-bw-id]').length : -1 };
});
ok('🔴 віджет Громади без бази не показує оголошень', w.рядків === 0, `рядків: ${w.рядків}`);
ok('🔴 у віджеті немає телефонів', !/\+38[\s\d]{9,}/.test(w.текст));
// «Порожньо» і «не змогли спитати» — різні речі, і сказані вони мають бути по-різному.
ok('віджет каже про невдале завантаження, а не про порожню дошку',
   /не вдалось/i.test(w.текст), w.текст.slice(0, 60));

await b.close(); await stop();
done();
