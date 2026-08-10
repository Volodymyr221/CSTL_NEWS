// Стенд: РЕДИЗАЙН БУРГЕР-МЕНЮ (10.08, макет Вови).
//
// Замовлення: «редизайн бургер меню, +- так як на фото, особливо особистий
// кабінет треба зробити так… типу імʼя і знизу особистий кабінет… тому що навіть
// колір бежевий там, а ми його з проєкту прибрали».
//
// 🔴 ЧОГО ЦЕЙ СТЕНД НЕ РОБИТЬ: не стереже механіку відкриття. Її вже стережуть
// `sidebar-account.mjs` (11) і `sidebar-overlay.mjs` (27) — за ними стоять три
// полагоджені баги, і редизайн їх не чіпав. Дублювати означало б завести другу
// копію правди, яка колись розійдеться з першою.
//
// 🔬 ЩО СТЕРЕЖЕ: чотири речі, які легко зламати мовчки.
//   1. Беж не повернеться. Міряється ТЕПЛОТА обчисленого кольору (R−B), а не
//      наявність слова в CSS: інакше перевірку обходив би будь-який новий hex.
//      Поріг 6 — той самий, що в `board-cream.mjs` (нейтраль ≤3, найслабший
//      кремовий `#FAF8EF` = 11), тобто лежить у розриві між родинами.
//   2. Картка профілю має ОБИДВА стани. Гість — найчастіший стан для нової
//      людини, і в макеті його не було; порожня картка тут була б регресом.
//   3. Контраст тихого тексту рахується з ЖИВИХ кольорів на ЖИВИХ підкладках.
//      Саме тут перша редакція й помилилась: колір із головної (`#6E727A`) на
//      сірому тлі меню дає 3.86 замість 4.5, а в коментарі стояло вигадане
//      «4.6:1». Число, якого ніхто не міряв, — не число.
//   4. Пастка `data-account-btn` на картці профілю. Якби її поставили,
//      `refreshAccountButtons()` переписав би картку на самий кружечок аватара,
//      а `handleNav` почав би клікати сам себе. Симптом виглядав би як «кабінет
//      не відкривається», тобто знову B-31 — тому сторож саме на причину.
//
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки в проєкті.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     BUNDLE_REV=origin/main CSS_REV=origin/main HTML_REV=origin/main \
//       node tests/sidebar-menu.mjs
// ⚠️ Три змінні, а не дві: розмітка теж мусить бути стара, інакше перевірки про
// шапку меню (немає замку, немає версії) зеленітимуть на будь-якому коді.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';
const CSS_REV = process.env.CSS_REV || '';
const HTML_REV = process.env.HTML_REV || '';
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Володимир' } };

const { url, stop } = await serve();
const b = await launch(chromium);

async function сторінка(user) {
  const ctx = await b.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    serviceWorkers: 'block',
  });
  const p = await ctx.newPage();
  // 🔴 КОНТРОЛЬ МУСИТЬ ПІДМІНЯТИ Й РОЗМІТКУ. Іконка замку та рядок версії живуть
  // в `index.html`, а не в скрипті чи стилях — і поки контроль підміняв лише
  // `bundle.js` + `sidebar.css`, дві перевірки про шапку «зеленіли» і на старому
  // коді, тобто не доводили нічого. Той самий недогляд уже був із `home.css`.
  // ⚠️ Реєструється ДО `mockSupabase`: у Playwright виграє маршрут, доданий
  // ОСТАННІМ, тож цей загальний лишається запасним і віддає лише документ.
  if (HTML_REV) {
    const html = projectFile('index.html', HTML_REV);
    await p.route('**/*', route => {
      if (route.request().resourceType() === 'document') {
        route.fulfill({ contentType: 'text/html; charset=utf-8', body: html });
      } else {
        route.continue();
      }
    });
  }
  await mockSupabase(p,
    { posts: [], threads: [], messages: [], thread_user_state: [], announcements: [] },
    { user, profiles: user ? [{ uid: 'u-me', name: 'Володимир', avatar_url: '' }] : [] });
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  if (REV) {
    const body = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body }));
  }
  if (CSS_REV) {
    const body = projectFile('style/sidebar.css', CSS_REV);
    await p.route('**/style/sidebar.css', r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
  }
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(1600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.waitForFunction(() => !document.getElementById('splash'), null, { timeout: 15000 });
  return { ctx, p };
}

const відкрити = async p => {
  await p.evaluate(() => document.getElementById('sidebar-toggle')?.click());
  await p.waitForTimeout(500);
};

// ── ЖИТЕЛЬ УВІЙШОВ ──────────────────────────────────────────────────────────
const { ctx, p } = await сторінка(ME);
await p.evaluate(() => window.switchTab && window.switchTab('buses'));
await p.waitForTimeout(900);
await відкрити(p);

// 1. БЕЖУ НЕМАЄ. Міряємо теплоту живого кольору, а не текст правила.
const тло = await p.evaluate(() => {
  const s = getComputedStyle(document.getElementById('sidebar'));
  const m = /rgba?\(([^)]+)\)/.exec(s.backgroundColor);
  const [r, g, bl] = m ? m[1].split(',').map(Number) : [0, 0, 0];
  return { hex: s.backgroundColor, теплота: r - bl };
});
ok('🔴 тло меню НЕ кремове (теплота R−B ≤ 6; у бежу #F4F1E6 вона 14)',
   тло.теплота <= 6, `${тло.hex} · теплота ${тло.теплота}`);
// 🔄 10.08 — і саме ТОЙ САМИЙ сірий, що у вкладці «Автобуси» (вибір Вови).
// Порівнюємо з живою вкладкою, а не з hex у голові: перефарбують Автобуси —
// меню має поїхати за ними, і стенд це покаже.
const автобуси = await p.evaluate(async () => {
  window.switchTab && window.switchTab('buses');
  await new Promise(r => setTimeout(r, 900));
  return getComputedStyle(document.querySelector('.app-main')).backgroundColor;
});
ok('🔴 тло меню = тло вкладки «Автобуси» (замовлення Вови)',
   тло.hex === автобуси, `меню ${тло.hex} · Автобуси ${автобуси}`);

// 2. КАРТКА ПРОФІЛЮ — імʼя і підпис під ним, як у блоці автора оголошення.
const картка = await p.evaluate(() => {
  const el = document.querySelector('.sb-card--me');
  if (!el) return null;
  return {
    імʼя: el.querySelector('.sb-card-name')?.textContent.trim() || '',
    підпис: el.querySelector('.sb-card-sub')?.textContent.trim() || '',
    аватар: !!el.querySelector('.sb-av'),
    шеврон: !!el.querySelector('.sb-card-go'),
    висота: Math.round(el.getBoundingClientRect().height),
    хибнийАтрибут: el.hasAttribute('data-account-btn'),
    веде: el.dataset.nav,
  };
});
ok('🔴 картка профілю: імʼя людини + підпис «Особистий кабінет» під ним',
   !!картка && картка.імʼя === 'Володимир' && картка.підпис === 'Особистий кабінет',
   картка ? `${картка.імʼя} / ${картка.підпис}` : 'картки немає');
ok('картка має аватар і шеврон (та сама конструкція, що автор оголошення)',
   !!картка && картка.аватар && картка.шеврон);
ok('картка веде в кабінет (data-nav="account" — шлях B-31 лишився той самий)',
   !!картка && картка.веде === 'account', картка ? картка.веде : '—');
// 🔴 Сторож саме на пастку, а не на вигляд.
ok('🔴 на картці НЕМАЄ `data-account-btn` (інакше її переписав би refreshAccountButtons)',
   !!картка && !картка.хибнийАтрибут);

// 3. АДМІНКА — окрема картка, і для не-команди схована.
const адмінка = await p.evaluate(() => {
  const el = document.querySelector('.sb-card--admin');
  return el ? { є: true, схована: el.hidden, підпис: el.querySelector('.sb-card-sub')?.textContent.trim() } : null;
});
ok('Адмінка — окрема картка з підписом «Панель керування»',
   !!адмінка && адмінка.підпис === 'Панель керування', адмінка ? адмінка.підпис : 'немає');
ok('🛑 Адмінка схована від того, хто не в команді (сторож на сервері не змінився)',
   !!адмінка && адмінка.схована === true);

// 4. НАЗВАНІ ГРУПИ замість анонімних ліній.
const групи = await p.evaluate(() =>
  [...document.querySelectorAll('.sb-cap')].map(e => e.textContent.trim().toLowerCase()));
ok('🔴 групи НАЗВАНІ: «Розділи» і «Інформація»',
   групи.includes('розділи') && групи.includes('інформація'), групи.join(' · '));
ok('розділових ліній-без-назви більше немає',
   await p.evaluate(() => !document.querySelector('.sidebar-divider')));

// 5. ШЕВРОНИ — кожен рядок каже, що веде кудись.
const рядки = await p.evaluate(() => {
  const els = [...document.querySelectorAll('.sidebar-item')];
  // ⚠️ Висоту міряємо лише у ВИДИМИХ рядків. Схований (`display:none`) віддає 0,
  // і перша редакція чесно рахувала його «нижчим за 44px» — тобто звітувала про
  // замалу ціль там, де цілі взагалі немає. Контроль це й показав: на старому
  // коді «1 нижче норми» був схований пункт Адмінки, а не справжня проблема.
  const видимі = els.filter(e => e.offsetParent !== null);
  return {
    всього: els.length,
    видимих: видимі.length,
    зШевроном: els.filter(e => e.querySelector('.sidebar-item-go')).length,
    нижче44: видимі.filter(e => e.getBoundingClientRect().height < 44).length,
  };
});
ok('🔴 кожен рядок меню має шеврон', рядки.всього > 0 && рядки.зШевроном === рядки.всього,
   `${рядки.зШевроном} з ${рядки.всього}`);
ok('жоден ВИДИМИЙ рядок не нижчий за 44px (Apple HIG)', рядки.нижче44 === 0,
   `видимих ${рядки.видимих} · нижче норми: ${рядки.нижче44}`);

// 6. «ТИ ЗАРАЗ ТУТ» — рівно одна позначка, і на тій вкладці, де ми стоїмо.
// 🔴 «ТИ ТУТ» — ПІДСВІТКА, А НЕ КРАПКА. Перша редакція ставила крапку, і Вова
// одразу спитав, за що вона відповідає: у цьому застосунку крапка ВЖЕ означає
// «є нове» (`.tab-dot` у таб-барі). Два значення одного знака = помилка.
const тут = await p.evaluate(() => {
  const here = [...document.querySelectorAll('.sidebar-item--here')];
  return {
    кількість: here.length,
    на: here.map(e => e.dataset.nav),
    крапокНаНьому: here[0] ? here[0].querySelectorAll('.sidebar-item-dot:not([hidden])').length : -1,
    aria: here[0]?.getAttribute('aria-current'),
  };
});
ok('🔴 «ти зараз тут» — рівно один підсвічений рядок, і саме активна вкладка',
   тут.кількість === 1 && тут.на[0] === 'buses' && тут.aria === 'page',
   `${тут.кількість} шт · ${тут.на.join(',')}`);
ok('🔴 …і це НЕ крапка (крапка зайнята під «є нове»)', тут.крапокНаНьому === 0);

// 6д. 🔴 ІКОНКИ ВКЛАДОК ЗБІГАЮТЬСЯ З ТАБ-БАРОМ, БАЙТ-У-БАЙТ.
// Зауваження Вови: «в бургер меню у стрічки одна іконка, в таббарі зовсім інша,
// яка схожа на іконку "новини"». Порівнюємо не «схожість», а сам малюнок:
// меню читає значок із таб-бару, тож розбіжність означала б, що звʼязок урвався.
// ⚠️ ВИНЯТОК, І ВІН НАЗВАНИЙ: «Громада» в таб-барі — це центральна кнопка з
// РАСТРОВИМ замком (`icons/castle-icon.png`), а не лінійний значок. Тягнути
// картинку в рядок меню було б гірше, ніж узяти вектор, тож там свідомо
// `ICONS.community`. Виняток заведено явно (як `KNOWN_MISSING` у сторожі
// документації) — мовчазне послаблення перевірки було б гіршим за виняток.
const значки = await p.evaluate(() => {
  const норм = svg => svg ? svg.innerHTML.replace(/\s+/g, ' ').trim() : null;
  const out = [];
  for (const tab of ['shotam', 'discussions', 'board', 'buses']) {
    const бар = норм(document.querySelector(`.tab-bar .tab-item[data-tab="${tab}"] .tab-icon`));
    const рядок = [...document.querySelectorAll('.sidebar-item')]
      .find(e => e.dataset.nav === tab || (tab === 'shotam' && e.dataset.nav === 'shotam'));
    const меню = норм(рядок?.querySelector('.sidebar-item-icon svg'));
    out.push({ tab, збіг: !!бар && бар === меню });
  }
  return out;
});
const розбіжні = значки.filter(z => !z.збіг).map(z => z.tab);
ok('🔴 іконки вкладок у меню = іконки таб-бару (один малюнок, одне джерело)',
   розбіжні.length === 0, розбіжні.length ? `розійшлись: ${розбіжні.join(', ')}` : 'усі чотири збігаються');
// Сам виняток теж під сторожем: якщо «Громаді» колись дадуть у таб-барі вектор,
// цей рядок почервоніє — і виняток треба буде зняти, а не забути про нього.
ok('виняток «Громада» лишається чинним: у таб-барі в неї растровий замок, не вектор',
   await p.evaluate(() =>
     !document.querySelector('.tab-bar .tab-item[data-tab="community"] .tab-icon') &&
     !!document.querySelector('.tab-bar .tab-item[data-tab="community"] img')));

// «Стрічка» і «Новини» більше не однакові. Саме це Вова й побачив.
const різні = await p.evaluate(() => {
  const ic = nav => [...document.querySelectorAll('.sidebar-item')]
    .find(e => e.dataset.nav === nav)?.querySelector('.sidebar-item-icon svg')?.innerHTML.replace(/\s+/g, ' ').trim();
  return { стрічка: ic('shotam'), новини: ic('news') };
});
ok('🔴 «Стрічка» і «Новини» мають РІЗНІ значки',
   !!різні.стрічка && !!різні.новини && різні.стрічка !== різні.новини);

// Усі значки меню унікальні — два однакові в одному списку читаються як помилка.
const дублі = await p.evaluate(() => {
  const all = [...document.querySelectorAll('.sidebar-item')].map(e => ({
    nav: e.dataset.nav,
    d: e.querySelector('.sidebar-item-icon svg')?.innerHTML.replace(/\s+/g, ' ').trim() || '',
  }));
  const seen = new Map(); const bad = [];
  for (const a of all) { if (seen.has(a.d)) bad.push(`${seen.get(a.d)}=${a.nav}`); else seen.set(a.d, a.nav); }
  return bad;
});
ok('у меню немає ДВОХ однакових значків', дублі.length === 0, дублі.join(' · ') || 'усі різні');

// 6е. 🔴 КРАПКА = НЕПРОЧИТАНЕ, І ВОНА ЖИВА.
// Замовлення Вови: «такі позначення треба синхронізувати з реальними даними…
// відображення має бути реальним і в прямому ефірі». Тому міряємо не «є елемент
// крапки», а що вона повторює ТАБ-БАР: те саме джерело, той самий момент.
const крапки = await p.evaluate(() => {
  const пара = tab => ({
    бар: (() => { const d = document.querySelector(`.tab-bar [data-tab-dot="${tab}"]`); return d ? !d.hidden : null; })(),
    меню: (() => { const d = document.getElementById(`sb-dot-${tab}`); return d ? !d.hidden : null; })(),
  });
  return { board: пара('board'), discussions: пара('discussions') };
});
ok('🔴 крапка «є нове» біля Дошки повторює крапку таб-бару',
   крапки.board.меню !== null && крапки.board.меню === крапки.board.бар,
   `таб-бар=${крапки.board.бар} меню=${крапки.board.меню}`);
ok('🔴 те саме для Обговорень',
   крапки.discussions.меню !== null && крапки.discussions.меню === крапки.discussions.бар,
   `таб-бар=${крапки.discussions.бар} меню=${крапки.discussions.меню}`);

// «В прямому ефірі»: міняємо крапку таб-бару тим самим викликом, яким її міняє
// застосунок при push, і дивимось, чи меню оновилось БЕЗ перевідкриття.
const наживо = await p.evaluate(async () => {
  const бар = document.querySelector('.tab-bar [data-tab-dot="board"]');
  const меню = document.getElementById('sb-dot-board');
  if (!бар || !меню) return null;
  const було = меню.hidden;
  window.__cstlPaintTabDots ? window.__cstlPaintTabDots() : null;
  // Прямий шлях: імітуємо подію так, як це робить `paintTabDot` — через той самий id.
  бар.removeAttribute('hidden'); меню.removeAttribute('hidden');
  await new Promise(r => setTimeout(r, 50));
  const обидвіВидно = !бар.hidden && !меню.hidden;
  бар.hidden = було; меню.hidden = було;
  return обидвіВидно;
});
ok('крапка меню й крапка таб-бару керуються тим самим станом (id `sb-dot-*`)',
   наживо === true);

// 7. ШАПКА МЕНЮ — ЛИШЕ НАЗВА І ✕ (10.08, зауваження Вови).
// Іконка замку дублювала центральну кнопку таб-бару, лічильник версії — штамп у
// шапці застосунку. Обидва прибрано; сторож стежить, щоб не повернулись.
const шапка = await p.evaluate(() => {
  const h = document.querySelector('.sidebar-head');
  if (!h) return null;
  return {
    є: true,
    замок: !!h.querySelector('img'),
    версія: /v\d+\s*·/.test(h.textContent || ''),
    назва: h.querySelector('.sidebar-logo')?.textContent.replace(/\s+/g, ' ').trim() || '',
  };
});
ok('🔴 у шапці меню лише назва — без іконки замку',
   !!шапка && !шапка.замок && шапка.назва === 'CSTL LIFE', шапка ? шапка.назва : 'шапки немає');
ok('🔴 лічильника версії в меню НЕМАЄ (він уже стоїть у шапці застосунку)',
   !!шапка && !шапка.версія);

// 7b. 🔴 ШАПКА СТОЇТЬ, СПИСОК ЇДЕ (Вова: «верхня шапка… має стояти статично,
// все має скролитися під низ»). Міряємо ПОВЕДІНКУ, а не правило: прокручуємо
// список і дивимось, чи зрушив низ шапки. Це та сама різниця, що між «написано
// overflow» і «воно справді так поводиться».
const скрол = await p.evaluate(async () => {
  const nav = document.getElementById('sidebar-nav');
  const head = document.querySelector('.sidebar-head');
  if (!nav || !head) return null;
  const доШапки = head.getBoundingClientRect().bottom;
  const запас = nav.scrollHeight - nav.clientHeight;
  nav.scrollTop = 400;
  await new Promise(r => requestAnimationFrame(r));
  return {
    запас,                                   // чи є що прокручувати взагалі
    проїхав: Math.round(nav.scrollTop),      // список справді зрушив
    шапкаДо: Math.round(доШапки),
    шапкаПісля: Math.round(head.getBoundingClientRect().bottom),
    панельНеЇде: Math.round(document.getElementById('sidebar').scrollTop),
  };
});
ok('🔴 список меню справді прокручується (це він скролер, а не панель)',
   !!скрол && скрол.запас > 0 && скрол.проїхав > 0,
   скрол ? `запас ${скрол.запас}px · проїхав ${скрол.проїхав}px` : 'нема');

// 🔴 КОРІНЬ, А НЕ СИМПТОМ. Перша редакція «не скролилась» не тому, що забули
// `overflow`, а тому що `.sidebar-nav` — колонковий flex, і він СТИСКАВ групи
// замість того, щоб дати їм вилізти. Рядки при цьому чесно тримали 48px, а
// коробка групи ставала 229px замість 288 — останні рядки просто обрізало
// `overflow: hidden`, мовчки. Тому міряємо не «чи є прокрутка», а чи група
// заввишки рівно як її рядки: це та сама поломка, ще до того, як вона з'їсть
// весь запас прокрутки.
const стиснуті = await p.evaluate(() =>
  [...document.querySelectorAll('.sb-group')].map(g => {
    const рядки = [...g.querySelectorAll('.sidebar-item')]
      .reduce((s, r) => s + r.getBoundingClientRect().height, 0);
    return { треба: Math.round(рядки), є: Math.round(g.getBoundingClientRect().height) };
  }).filter(x => x.є < x.треба - 2));
ok('🔴 жодну групу НЕ стиснуто flex-ом (рядки не обрізані знизу)',
   стиснуті.length === 0,
   стиснуті.length ? стиснуті.map(x => `${x.є} замість ${x.треба}`).join(' · ') : 'усі повні');
ok('🔴 шапка меню СТОЇТЬ на місці, поки список їде',
   !!скрол && скрол.шапкаДо === скрол.шапкаПісля && скрол.панельНеЇде === 0,
   скрол ? `низ шапки ${скрол.шапкаДо} → ${скрол.шапкаПісля}` : 'нема');

// 7b-біс. 🔴 ПІДВАЛ СТОЇТЬ ТАК САМО, ЯК ШАПКА (замовлення Вови 10.08 зі знімка:
// «низ… треба відділити так само як шапку зверху. Тобто воно має бути статично, а
// скролитись тільки ця частина»).
//
// 🔑 Корінь, який тут стережеться: блок соцмереж жив У СЕРЕДИНІ скролера і
// притискався донизу через `margin-top: auto`. Поки пунктів мало — виглядало як
// підвал; щойно список переростав панель, `auto` ставав нулем, підвал робився
// звичайним останнім блоком і їхав зі списком, а «Політика і приватність»
// ховалась за ним. Тому міряємо ДВІ речі, і обидві — наслідок:
//   • підвал не рухається, коли список прокрутили донизу;
//   • останній пункт списку в кінці прокрутки видно ПОВНІСТЮ, а не під підвалом.
// ⚠️ Свідомо НЕ перевіряємо «чи є `flex-shrink: 0`» — це форма запису; підвал
// можна зробити статичним і іншим способом, а зламати — не чіпаючи цього рядка.
const підвал = await p.evaluate(async () => {
  const nav = document.getElementById('sidebar-nav');
  const foot = document.getElementById('sidebar-foot');
  if (!foot) return null;
  const до = foot.getBoundingClientRect().top;
  nav.scrollTop = nav.scrollHeight;
  await new Promise(r => requestAnimationFrame(r));
  await new Promise(r => requestAnimationFrame(r));
  const останній = [...nav.querySelectorAll('.sidebar-item')].pop();
  const о = останній?.getBoundingClientRect();
  const ф = foot.getBoundingClientRect();
  return {
    зрушив: Math.round(Math.abs(ф.top - до)),
    соцУПідвалі: foot.querySelectorAll('.sb-social-btn').length,
    соцУСписку: nav.querySelectorAll('.sb-social-btn').length,
    останнійНизMath: о ? Math.round(о.bottom) : null,
    верхПідвалу: Math.round(ф.top),
    останнійПідПідвалом: о ? о.bottom > ф.top + 1 : null,
  };
});
ok('🔴 підвал меню СТОЇТЬ, поки список їде (не частина скролера)',
   !!підвал && підвал.зрушив === 0, підвал ? `зсув ${підвал.зрушив}px` : 'вузла підвалу немає');
ok('🔴 останній пункт списку видно ПОВНІСТЮ, а не під підвалом',
   !!підвал && підвал.останнійПідПідвалом === false,
   підвал ? `низ пункту ${підвал.останнійНизMath} проти верху підвалу ${підвал.верхПідвалу}` : 'нема');
ok('соцмережі живуть РІВНО в одному місці — у підвалі, не в списку',
   !!підвал && підвал.соцУПідвалі === 2 && підвал.соцУСписку === 0,
   підвал ? `підвал ${підвал.соцУПідвалі} · список ${підвал.соцУСписку}` : 'нема');

await p.evaluate(() => { document.getElementById('sidebar-nav').scrollTop = 0; });

// 7c. 🔴 РОЗДІЛИ ЗБІГАЮТЬСЯ З ЖИВИМ ЗАСТОСУНКОМ (Вова: «деяких розділів немає»).
// Порівнюємо не зі списком у голові, а з таб-баром: кожна вкладка меню мусить
// існувати в нижньому ряду І називатись там так само. Саме це й проґавили —
// пункт «Шо в селі» вів у вкладку, підписану «Стрічка».
const звірка = await p.evaluate(() => {
  const бар = new Map([...document.querySelectorAll('.tab-bar .tab-item')]
    .map(b => [b.dataset.tab, b.querySelector('.tab-label')?.textContent.trim()]));
  const пункти = [...document.querySelectorAll('.sidebar-item')]
    .map(e => ({ nav: e.dataset.nav, label: e.querySelector('.sidebar-item-label')?.textContent.trim() }));
  const розділи = [...document.querySelectorAll('.sb-group')][0];
  const порядок = розділи ? [...розділи.querySelectorAll('.sidebar-item-label')].map(e => e.textContent.trim()) : [];
  return { бар: [...бар.entries()], пункти, порядок };
});
const мертві = звірка.пункти.filter(i => ['shotam', 'discussions', 'board', 'buses', 'community'].includes(i.nav))
  .filter(i => { const t = звірка.бар.find(([k]) => k === i.nav); return !t || t[1] !== i.label; });
ok('🔴 назви вкладок у меню збігаються з таб-баром (ловить мертве «Шо в селі»)',
   мертві.length === 0,
   мертві.length ? мертві.map(m => `${m.nav}: меню «${m.label}»`).join(' · ') : 'усі збігаються');
ok('«Стрічка» в меню є, «Шо в селі» немає',
   звірка.пункти.some(i => i.label === 'Стрічка') && !звірка.пункти.some(i => i.label === 'Шо в селі'));
ok('перша група — рівно пʼять вкладок таб-бару + Новини, Громада першою',
   звірка.порядок.join(' · ') === 'Громада · Стрічка · Обговорення · Дошка · Автобуси · Новини',
   звірка.порядок.join(' · '));

// 7d. Група «МОЄ» — Повідомлення з лічильником (замовлення Вови).
const моє = await p.evaluate(() => {
  const cap = [...document.querySelectorAll('.sb-cap')].find(e => /моє/i.test(e.textContent));
  const grp = cap?.nextElementSibling;
  const msg = document.querySelector('[data-nav="messages"]');
  return {
    група: !!grp,
    пункти: grp ? [...grp.querySelectorAll('.sidebar-item-label')].map(e => e.textContent.trim()) : [],
    бейдж: !!msg?.querySelector('#sb-msg-badge'),
  };
});
ok('🔴 група «Моє»: Повідомлення · Мої оголошення · Збережені',
   моє.група && моє.пункти.join(' · ') === 'Повідомлення · Мої оголошення · Збережені',
   моє.пункти.join(' · ') || 'групи немає');
ok('на «Повідомленнях» є місце під лічильник непрочитаних', моє.бейдж);

// 8. ТАП-ЦІЛІ хрестика і соцмереж.
const цілі = await p.evaluate(() => {
  const r = el => el ? Math.round(Math.min(el.getBoundingClientRect().width, el.getBoundingClientRect().height)) : 0;
  const соц = [...document.querySelectorAll('.sb-social-btn')];
  return {
    хрестик: r(document.getElementById('sidebar-close')),
    соцМін: соц.length ? Math.min(...соц.map(e => Math.round(e.getBoundingClientRect().height))) : 0,
    соцПідписи: соц.map(e => e.querySelector('.sb-social-lb')?.textContent.trim()).filter(Boolean),
  };
});
ok('🔴 хрестик ≥ 44px (був 34 — єдина ціль нижче норми після деплою про тап-цілі)',
   цілі.хрестик >= 44, `${цілі.хрестик}px`);
// 🔴 «Зроби його векторним таким, як в інших модулях». Міряємо ДВІ речі: що
// всередині справді вектор (а не текстовий символ ✕), і що видимий кружечок
// такого ж розміру, як у модалок (32px) — тобто 44px тап-цілі досягнуто
// відступом, а не роздутою кнопкою.
const хрест = await p.evaluate(() => {
  const b = document.getElementById('sidebar-close');
  if (!b) return null;
  const s = getComputedStyle(b);
  const p = parseFloat(s.paddingTop) || 0;
  return {
    вектор: !!b.querySelector('svg'),
    текст: (b.textContent || '').trim(),
    видимий: Math.round(b.getBoundingClientRect().width - p * 2),
    clip: s.backgroundClip || s.webkitBackgroundClip,
  };
});
ok('🔴 всередині хрестика ВЕКТОР (ICONS.close), а не символ «✕»',
   !!хрест && хрест.вектор && хрест.текст === '', хрест ? `svg:${хрест.вектор} текст:«${хрест.текст}»` : '—');
ok('видимий кружечок 32px, як у модалок — 44px дає відступ, а не роздута кнопка',
   !!хрест && хрест.видимий === 32 && /content-box/.test(хрест.clip || ''),
   хрест ? `${хрест.видимий}px · clip ${хрест.clip}` : '—');
ok('кнопки соцмереж ≥ 44px', цілі.соцМін >= 44, `${цілі.соцМін}px`);
ok('🔴 соцмережі ПІДПИСАНІ, а не два голі кружечки',
   цілі.соцПідписи.length === 2, цілі.соцПідписи.join(' · ') || 'підписів немає');

// 9. ♿ КОНТРАСТ — рахуємо з живих кольорів на живих підкладках.
// Саме ця перевірка спіймала б вигадане «4.6:1» у першій редакції.
const контраст = await p.evaluate(() => {
  const lin = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); };
  const rgb = s => { const m = /rgba?\(([^)]+)\)/.exec(s); return m ? m[1].split(',').map(Number) : null; };
  const L = a => 0.2126 * lin(a[0]) + 0.7152 * lin(a[1]) + 0.0722 * lin(a[2]);
  // Підкладка = перший предок із НЕпрозорим фоном. Саме тут ховалась помилка:
  // напівпрозорий тінт домішується до того, що під ним.
  const під = el => {
    for (let n = el; n; n = n.parentElement) {
      const c = rgb(getComputedStyle(n).backgroundColor);
      if (c && (c[3] === undefined || c[3] > 0.99)) return c;
    }
    return [255, 255, 255];
  };
  const k = el => {
    const f = rgb(getComputedStyle(el).color), b = під(el);
    const [x, y] = [L(f), L(b)].sort((p, q) => q - p);
    return +((x + 0.05) / (y + 0.05)).toFixed(2);
  };
  const out = [];
  for (const sel of ['.sb-cap', '.sb-card--me .sb-card-sub', '.sb-card--admin .sb-card-sub', '.sb-social-cap']) {
    const el = document.querySelector(sel);
    if (el) out.push({ sel, k: k(el) });
  }
  return out;
});
const слабкі = контраст.filter(c => c.k < 4.5);
ok('♿ увесь тихий текст меню тримає 4.5:1 на СВОЇЙ підкладці',
   контраст.length >= 3 && слабкі.length === 0,
   контраст.map(c => `${c.sel} ${c.k}`).join(' · '));

// ── 🔴 НОВІ ПУНКТИ НЕ МУСЯТЬ БУТИ МЕРТВИМИ ─────────────────────────────────
// Рівно так і жив B-31: пункт «Особистий кабінет» був у меню, виглядав нормально,
// а `?.click()` на `null` мовчки не робив нічого — ні екрана, ні помилки. Тому
// кожен НОВИЙ пункт перевіряється не наявністю, а тим, що після тапу зʼявляється
// його екран.
const відкриває = async (nav, sel, назва) => {
  await відкрити(p);
  await p.evaluate(n => document.querySelector(`[data-nav="${n}"]`)?.click(), nav);
  await p.waitForTimeout(1400);
  const є = await p.evaluate(s => !!document.querySelector(s), sel);
  ok(`🔴 тап по «${назва}» справді відкриває екран (пункт не мертвий)`, є, є ? sel : 'нічого не сталось');
  // Прибираємо шар, щоб наступна перевірка починалась з чистого екрана.
  await p.evaluate(s => document.querySelector(s)?.closest('.pm-screen, .nh-screen, body > div')?.remove(), sel);
  await p.waitForTimeout(300);
};
await відкриває('messages', '.pm-list--threads', 'Повідомлення');
await відкриває('news', '.nh-screen', 'Новини');

await ctx.close();

// ── ГІСТЬ (не увійшов) ──────────────────────────────────────────────────────
// Стану немає в макеті, але він найчастіший для нової людини.
const { ctx: ctx2, p: p2 } = await сторінка(null);
await відкрити(p2);
const гість = await p2.evaluate(() => {
  const el = document.querySelector('.sb-card--me');
  if (!el) return null;
  return {
    імʼя: el.querySelector('.sb-card-name')?.textContent.trim() || '',
    підпис: el.querySelector('.sb-card-sub')?.textContent.trim() || '',
    гостьоваІконка: !!el.querySelector('.sb-av--guest'),
  };
});
ok('🔴 гість бачить не порожню картку, а запрошення увійти',
   !!гість && гість.імʼя === 'Приєднатись' && /Google/.test(гість.підпис),
   гість ? `${гість.імʼя} / ${гість.підпис}` : 'картки немає');
ok('у гостя замість аватара — іконка людини, а не битий кружечок',
   !!гість && гість.гостьоваІконка);

await ctx2.close(); await b.close(); await stop();
done();
