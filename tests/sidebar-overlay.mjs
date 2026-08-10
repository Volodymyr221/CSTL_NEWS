// Стенд №55: ЗАТЕМНЕННЯ БУРГЕР-МЕНЮ НЕ ЗАВИСАЄ НА ЕКРАНІ.
//
// 🔴 ЗАМОВЛЕННЯ ВОВИ (09.08, дослівно): «натискаю на іконку соцмереж, Інстаграм,
// мене перекидає в Інстаграм, я закриваю Інстаграм, переходжу назад в додаток,
// відкриваю знов бургер, і меню бургера відкривається, пропадає, але заблюрений
// екран, типу, як під бургер-меню, він залишається… це, можливо, не тільки
// працює, коли я переходжу на соцмережі, але в загальному це треба пофіксити».
//
// 🔑 КОРІНЬ (два незалежні відкладені виклики в `src/core/sidebar.js`):
//   1. `openSidebar()` додавав класи всередині `requestAnimationFrame`. У фоні
//      кадрів немає — виклик чекає. Застосунок повертається, людина вже встигла
//      закрити меню, і аж ТОДІ відкладене «відкрити» виконується поверх
//      закритого стану. Змінна `_open` каже «закрито», розмітка малює відкрите.
//   2. `closeSidebar()` ховав затемнення через `setTimeout(…, 260)`. На iOS цей
//      таймер замерзає разом зі сторінкою. Не спрацював → затемнення лишилось.
//      Плюс усі 260 мс воно лежить поверх екрана і перехоплює тапи, будучи
//      прозорим.
//
// ЩО МІРЯЄМО — те, що бачить і чим тикає Вова, а не форму запису коду:
//   • обчислені `opacity` / `visibility` затемнення (видно чи ні);
//   • `document.elementFromPoint()` у центрі екрана (чи проходить тап);
//   • положення панелі меню відносно екрана (виїхала чи ні).
// 🛑 Свідомо НЕ перевіряємо «чи немає в коді setTimeout» — у цьому проєкті вже
// був випадок, коли перевірка міряла форму запису замість наслідку і пропустила
// справжній баг.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     BUNDLE_REV=origin/main CSS_REV=origin/main node tests/sidebar-overlay.mjs
// підсовує сторінці `bundle.js` і `style/sidebar.css` із зазначеної ревізії.
// На коді ДО фіксу 🔴-перевірки мусять УПАСТИ — інакше стенд міряє не те.
//
// ⚠️ `serviceWorkers: 'block'` — інакше запити йдуть через `sw.js` повз
// `page.route` (восьмий випадок брехливої перевірки в цьому проєкті).
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile, blockExternal } from './_lib.mjs';

const { ok, done } = reporter();
const BUNDLE_REV = process.env.BUNDLE_REV || '';
const CSS_REV = process.env.CSS_REV || '';

const srv = await serve();
const browser = await launch(chromium);
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },   // iPhone 14 — пристрій Вови
  serviceWorkers: 'block',
});
const page = await ctx.newPage();
await blockExternal(page);

// Підміна ревізій для контролю «до/після».
if (BUNDLE_REV) {
  const code = projectFile('bundle.js', BUNDLE_REV);
  await page.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: code }));
}
if (CSS_REV) {
  const css = projectFile('style/sidebar.css', CSS_REV);
  await page.route('**/style/sidebar.css', r => r.fulfill({ contentType: 'text/css; charset=utf-8', body: css }));
}

await page.goto(srv.url, { waitUntil: 'domcontentloaded' });
await page.waitForSelector('#sidebar-toggle', { timeout: 15000 });
await page.waitForTimeout(600);

// ── Приладдя виміру ─────────────────────────────────────────────────────────
// Чи бачить людина затемнення. `hidden` (display:none) і `visibility:hidden`
// однаково дають «не видно» — міряємо наслідок, а не спосіб.
const overlayState = () => page.evaluate(() => {
  const el = document.getElementById('sidebar-overlay');
  if (!el) return { exists: false };
  const cs = getComputedStyle(el);
  const r = el.getBoundingClientRect();
  return {
    exists: true,
    opacity: parseFloat(cs.opacity),
    visible: cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01,
    // Чи перехоплює тап — саме це робить застосунок «мертвим».
    // ⚠️ Точка виміру — ЛІВИЙ край (x=30), а не центр екрана. Панель меню займає
    // 82% ширини справа (на 390px це 320px, тобто від x=70), тож у центрі стоїть
    // ВОНА, і перевірка «затемнення ловить тап» показувала б ✅ на будь-якому
    // коді — контрольний прогін це і викрив.
    eatsTap: document.elementFromPoint(30, innerHeight / 2) === el,
    blur: cs.backdropFilter || cs.webkitBackdropFilter || '',
    area: Math.round(r.width * r.height),
  };
});

// Панель меню: виїхала на екран чи стоїть за правим краєм.
const panelOnScreen = () => page.evaluate(() => {
  const el = document.getElementById('sidebar');
  if (!el) return false;
  const r = el.getBoundingClientRect();
  return r.left < innerWidth - 20;      // хоч частиною зайшла в екран
});

// 🔴 ЧИ НЕ СУПЕРЕЧИТЬ РОЗМІТКА САМА СОБІ. Головний слід бага: стан живе у двох
// місцях (змінна в модулі + класи в розмітці), і відкладені виклики їх
// розводять. Контрольний прогін ловив саме таке: `aria-hidden="true"` (тобто
// «закрито») на панелі з класом `sidebar--open` (тобто «відкрито»).
// Це вимір СТАНУ, а не форми коду: узгодженість або є, або її нема.
const stateAgrees = () => page.evaluate(() => {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const panelOpen = sb.classList.contains('sidebar--open');
  const dimOn = ov.classList.contains('sidebar-overlay--show');
  const aria = sb.getAttribute('aria-hidden') === 'false';
  return { agrees: panelOpen === dimOn && panelOpen === aria, panelOpen, dimOn, aria };
});

// Тап, який може не пройти: якщо розмітка залипла у суперечливому стані, кнопку
// перекриває панель і жест стає недосяжним. Для людини це «застосунок не
// реагує» — тож не падаємо з винятком, а віддаємо це як результат виміру.
// ⚠️ Саме тут контрольний прогін спершу обривався з `TimeoutError` на середині:
// на коді ДО фіксу панель залипає з класом `sidebar--open` і фізично накриває
// бургер. Стенд, що вмирає замість того щоб доповісти, — марний стенд.
// ⚠️ 8 секунд, а не 2-3: перший тап по бургеру доводиться робити, коли
// застосунок ще доводить старт (заставка, перший рендер вкладки), і коротка
// стеля «завалювала» цілком робочий код на самому початку прогону.
const safeClick = async sel => {
  try { await page.click(sel, { timeout: 8000 }); return true; } catch { return false; }
};
const tapBurger = () => safeClick('#sidebar-toggle');
const settle = (ms = 450) => page.waitForTimeout(ms);

// Відхід застосунку у фон і повернення. `document.visibilityState` — властивість
// лише для читання, тому підміняємо її геттер: обробник у застосунку читає саме
// її, тож сцена для нього невідрізненна від справжнього переходу в Instagram.
const goBackground = () => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
});
const goForeground = () => page.evaluate(() => {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
});

// ── 1. Спокійний старт ──────────────────────────────────────────────────────
let st = await overlayState();
ok('Старт: затемнення не видно', st.exists && !st.visible, `opacity=${st.opacity}`);
ok('Старт: тап у центрі екрана проходить', !st.eatsTap);

// ── 2. Відкриття працює і виглядає як раніше ────────────────────────────────
await tapBurger();
await settle();
st = await overlayState();
ok('Відкрито: затемнення видно на весь екран', st.visible && st.area >= 390 * 844,
   `opacity=${st.opacity} площа=${st.area}px²`);
ok('Відкрито: блюр фону на місці', /blur\(3px\)/.test(st.blur), st.blur || '(немає)');
ok('Відкрито: панель меню на екрані', await panelOnScreen());

// Плавність не втрачена. Саме тут фікс міг би нашкодити: сховай ми затемнення
// через `display:none`, перехід зник би і меню спалахувало б ривком.
// ⚠️ Міряємо НЕ «яка прозорість рівно через 60 мс» — перша редакція так і робила
// і показала спершу 0.85, а наступного прогону 1.0 на тому самому коді: браузер
// не зобовʼязаний віддати кадр за конкретні 60 мс. Це був би одинадцятий випадок
// брехливої перевірки в проєкті. Тому знімаємо ВЕСЬ хід згасання кадр за кадром
// і питаємо простішу річ: чи були проміжні значення між 1 і 0.
const fade = await page.evaluate(() => new Promise(resolve => {
  const el = document.getElementById('sidebar-overlay');
  const seen = [];
  el.classList.remove('sidebar-overlay--show');
  const t0 = performance.now();
  const tick = () => {
    seen.push(parseFloat(getComputedStyle(el).opacity));
    if (performance.now() - t0 < 400) requestAnimationFrame(tick); else resolve(seen);
  };
  requestAnimationFrame(tick);
}));
const partial = fade.filter(v => v > 0.01 && v < 0.99).length;
ok('Згасання плавне, а не ривком', partial >= 3,
   `проміжних кадрів: ${partial} з ${fade.length}`);
ok('…і доходить до кінця', !(await overlayState()).visible);
await page.evaluate(() => document.getElementById('sidebar-overlay').classList.add('sidebar-overlay--show'));
await settle(300);

// ── 3. Звичайне закриття тапом по затемненню ────────────────────────────────
await page.mouse.click(30, 500);          // тап по лівому краю = по затемненню
await settle();
st = await overlayState();
ok('Закрито тапом: затемнення не видно', !st.visible, `opacity=${st.opacity}`);
ok('Закрито тапом: панель поїхала за екран', !(await panelOnScreen()));

// ── 4. 🔴 ЗАТЕМНЕННЯ ВІДПУСКАЄ ЕКРАН ОДРАЗУ, НЕ ЧЕКАЮЧИ ТАЙМЕРА ─────────────
// Головна перевірка залежності від `setTimeout`: міряємо стан у ТОМУ Ж кадрі,
// де меню закрили. Старий код ще 260 мс тримав затемнення поверх усього.
await tapBurger();
await settle();
const instant = await page.evaluate(() => {
  document.getElementById('sidebar-toggle').click();      // закриваємо
  const el = document.getElementById('sidebar-overlay');
  return {                                                 // і одразу міряємо
    eatsTap: document.elementFromPoint(30, innerHeight / 2) === el,
    pe: getComputedStyle(el).pointerEvents,
  };
});
ok('🔴 Одразу після закриття затемнення НЕ перехоплює тапи (не чекає таймера)',
   !instant.eatsTap, `pointer-events=${instant.pe}`);
await settle();

// ── 5. 🔴 ГОНКА КАДРУ: відкрити і закрити в одному кадрі ────────────────────
// Точний зліпок того, що робить фон: відкладене «відкрити» виконується вже
// ПІСЛЯ закриття. На старому коді `requestAnimationFrame` домальовував меню
// назад, і воно лишалось висіти.
await page.evaluate(() => {
  const t = document.getElementById('sidebar-toggle');
  t.click();          // відкрити
  t.click();          // і одразу закрити — обидва в одному кадрі
});
await settle(600);
st = await overlayState();
ok('🔴 Гонка кадру: затемнення зняте', !st.visible, `opacity=${st.opacity}`);
ok('🔴 Гонка кадру: панель не лишилась відкритою', !(await panelOnScreen()));
ok('🔴 Гонка кадру: екран не заблокований', !st.eatsTap);
// ⚠️ Найважливіша перевірка блока. «Не видно» ще не означає «чисто»: старий код
// ховав затемнення атрибутом `hidden`, лишаючи на ньому клас `--show`, а на
// панелі — `sidebar--open`. Око цього не бачить, але наступне відкриття
// успадковує залиплий стан. Питаємо прямо: розмітка сама собі не суперечить?
let agr = await stateAgrees();
ok('🔴 Гонка кадру: розмітка не суперечить сама собі', agr.agrees,
   `панель=${agr.panelOpen} затемнення=${agr.dimOn} aria=${agr.aria}`);

// ── 6. 🔴 СЦЕНА ВОВИ: пішов у Instagram із відкритого меню і повернувся ─────
await tapBurger();
await settle();
ok('Сцена Вови: меню відкрите перед виходом', (await overlayState()).visible && await panelOnScreen());

// Тап по іконці Instagram. Це `<a target="_blank">`, тож браузер СПРАВДІ
// відкриває другу вкладку — і наша сторінка стає прихованою по-справжньому.
// ⚠️ Це не декорація сцени, а її суть: поки чужа вкладка попереду, Chromium
// заморожує CSS-переходи рівно так, як iOS морозить сторінку за Instagram.
// Перша редакція стенда цього не врахувала і «завалила» робочий код: анімація
// просто не встигала піти, бо кадрів сторінці ніхто не давав.
const popupPromise = ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);
await page.evaluate(() => document.querySelector('.sb-social-btn')?.click());
const popup = await popupPromise;
await goBackground();                       // застосунок у фоні
await page.waitForTimeout(300);
if (popup) await popup.close();             // закрив Instagram
await page.bringToFront();                  // …і повернувся в застосунок
await goForeground();
await settle(600);
st = await overlayState();
ok('🔴 Сцена Вови: після повернення затемнення НЕМА', !st.visible, `opacity=${st.opacity}`);
ok('🔴 Сцена Вови: екран не заблокований невидимим шаром', !st.eatsTap);
ok('🔴 Сцена Вови: панель меню закрита', !(await panelOnScreen()));
agr = await stateAgrees();
ok('🔴 Сцена Вови: розмітка не суперечить сама собі', agr.agrees,
   `панель=${agr.panelOpen} затемнення=${agr.dimOn} aria=${agr.aria}`);

// ── 6б. 🔴 І ВІДКРИВАЄМО МЕНЮ ЩЕ РАЗ — саме тут баг і вилазив ──────────────
// Скарга Вови 10.08: «повернувся з Instagram, відкриваю бургер — фон блюриться,
// меню зʼявляється і ВІДРАЗУ ЗНИКАЄ, а фон залишається».
// 🔴 ЧОМУ СТОРОЖ ЦЕ ПРОПУСТИВ: сцена 6 закінчувалась на «після повернення
// затемнення нема» — і не робила НАСТУПНОГО кроку. А ламалось саме наступне
// відкриття, яке успадковувало застиглий напівстан. Дірка була не в критеріях,
// а в тому, що сценарій обривався на крок раніше за скаргу.
ok('🔴 після повернення бургер знову відкриває меню', await tapBurger());
await settle(700);
st = await overlayState();
ok('🔴 …і меню ЛИШАЄТЬСЯ відкритим, а не зникає одразу', await panelOnScreen());
ok('🔴 …затемнення при цьому Є (меню без фону — так само розбіжність)', st.visible,
   `opacity=${st.opacity}`);
agr = await stateAgrees();
ok('🔴 …і розмітка не суперечить сама собі', agr.agrees,
   `панель=${agr.panelOpen} затемнення=${agr.dimOn} aria=${agr.aria}`);
await safeClick('#sidebar-close');
await settle();

// ── 6в. 🔴 ЗАПОБІЖНИК: затемнення не може пережити меню ────────────────────
// Симптом цього бага завжди один — панель і затемнення розійшлись. Тепер стан
// пише один `paintState()`, а затемнення виводить свою видимість із класу ПАНЕЛІ
// (`body:not(:has(.sidebar--open))`) — власної правди в нього більше немає.
// Перевіряємо саме ЗАПОБІЖНИК: навмисно створюємо розбіжність (вішаємо клас
// показу на затемнення, коли меню закрите) і дивимось, чи людина його побачить.
// ⚠️ Це не «перевірка того, що ми щойно написали правило»: правило можна
// написати й не тим селектором. Міряється наслідок — чи видно шар на екрані.
const залипле = await page.evaluate(() => {
  const ov = document.getElementById('sidebar-overlay');
  ov.hidden = false;
  ov.classList.add('sidebar-overlay--show');   // ← імітуємо застиглий стан iOS
  const cs = getComputedStyle(ov);
  const видно = cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01;
  const ловитьТап = document.elementFromPoint(30, innerHeight / 2) === ov;
  ov.classList.remove('sidebar-overlay--show');
  ov.hidden = true;
  return { видно, ловитьТап };
});
ok('🔴 ЗАПОБІЖНИК: залипле затемнення БЕЗ мітки меню не видно людині',
   !залипле.видно, `видно=${залипле.видно}`);
ok('🔴 ЗАПОБІЖНИК: і тапи воно не перехоплює (застосунок не «мертвий»)',
   !залипле.ловитьТап);

// ── 6г. 🔴 ЗАПОБІЖНИК НЕ СМІЄ ВИМАГАТИ СВІЖОГО СКРИПТА ─────────────────────
// Перша редакція запобіжника вішала мітку `body.sidebar-open` з JS — і зламала б
// меню НАСМЕРТЬ у вікні «новий CSS уже доїхав, новий bundle.js ще ні»: старий
// скрипт мітки не ставить, отже правило діяло б завжди і меню не відкривалось.
// Це рівно та пастка, на якій обпікся фікс 09.08 («CSS і JS деплояться разом, а
// доїжджають нарізно»). Тому запобіжник спирається на `.sidebar--open` — клас,
// який ставить і СТАРИЙ скрипт. Перевіряємо це прямо: імітуємо стару розмітку
// без жодної мітки й дивимось, чи затемнення все одно показується.
await page.evaluate(() => {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  document.body.className = '';                       // ← «старий JS»: жодних міток на body
  sb.classList.add('sidebar--open');                  // ← те, що старий скрипт ставить
  ov.hidden = false; ov.classList.add('sidebar-overlay--show');
});
// ⚠️ ЧЕКАЄМО ЗГАСАННЯ, і це не «про всяк випадок». Перша редакція читала стилі
// СИНХРОННО одразу після зміни класу — і бачила `opacity: 0`, бо перехід
// (0.25s) щойно почався. Перевірка «падала» на цілком робочому коді, тобто
// хибним був критерій. Той самий клас помилки, що з `MutationObserver` у стенді
// свайпу: міряв момент, а не результат.
await settle(400);
const парою = await page.evaluate(() => {
  const sb = document.getElementById('sidebar');
  const ov = document.getElementById('sidebar-overlay');
  const cs = getComputedStyle(ov);
  const діагноз = { has: document.body.matches(':has(.sidebar--open)'),
                    display: cs.display, visibility: cs.visibility, opacity: cs.opacity };
  const видно = cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01;
  sb.classList.remove('sidebar--open');
  ov.classList.remove('sidebar-overlay--show'); ov.hidden = true;
  return { видно, діагноз };
});
ok('🔴 «новий CSS + старий скрипт»: меню й затемнення ВСЕ ОДНО показуються',
   парою.видно === true, JSON.stringify(парою.діагноз));

// ── 7. Згорнув застосунок із відкритим меню і повернувся ───────────────────
// 🔄 09.08 — ВИМОГА ЦЬОГО БЛОКА ПЕРЕПИСАНА, і це важливо не переплутати назад.
// Спершу тут стояло «меню має бути ЗАКРИТЕ»: перший фікс закривав його на подіях
// фону. На телефоні Вови це обернулось новим багом — *«натиснув на бургер, меню
// відкрилось та відразу закрилось»*, бо на iOS ці події приходять із запізненням,
// уже після тапу.
// 🔑 Правильна вимога: меню, яке людина не закривала, лишається відкритим, а
// подія фону тільки звіряє розмітку зі станом. Закриває меню рівно те, що людина
// натиснула (кнопка, хрестик, затемнення, іконка соцмережі — вона це робить сама).
await tapBurger();
await settle();
await goBackground();
await page.waitForTimeout(200);
await goForeground();
await settle(600);
ok('Згорнув застосунок → повернувся: меню лишилось відкритим',
   (await overlayState()).visible && await panelOnScreen());
agr = await stateAgrees();
ok('🔴 Згорнув застосунок → повернувся: розмітка не суперечить сама собі', agr.agrees,
   `панель=${agr.panelOpen} затемнення=${agr.dimOn} aria=${agr.aria}`);
// Прибираємо за собою — далі блок 8 перевіряє відкриття з чистого стану.
await safeClick('#sidebar-close');
await settle();

// ── 8. Після всього меню лишається робочим ─────────────────────────────────
// 🔑 Це і є дослівна скарга Вови: «відкриваю знов бургер, і меню відкривається,
// пропадає, але заблюрений екран залишається». Перевіряємо обидві половини:
// меню мусить БУТИ, і воно мусить закритись начисто.
const opened = await safeClick('#sidebar-toggle');
await settle();
ok('Меню відкривається після всіх сцен',
   opened && (await overlayState()).visible && await panelOnScreen(),
   opened ? '' : 'бургер став недосяжним для тапу');
// ⚠️ Закриваємо хрестиком, а НЕ бургером: панель виїжджає з правого краю і
// фізично накриває бургер, тобто тапом по ньому меню не закрити навіть на
// живому пристрої. Перша редакція стенда цього не врахувала і зависала на
// повторному тапі — перевірка мусить повторювати досяжний жест, а не зручний.
const closed = await safeClick('#sidebar-close');
await settle();
st = await overlayState();
ok('І закривається начисто',
   closed && !st.visible && !st.eatsTap && !(await panelOnScreen()),
   closed ? `opacity=${st.opacity}` : 'хрестик став недосяжним для тапу');

// ── 9. 🔴 ВІДКЛАДЕНА ПОДІЯ ФОНУ НЕ ЗАКРИВАЄ ЩОЙНО ВІДКРИТЕ МЕНЮ ─────────────
// Заведено 09.08 після того, як перший фікс НЕ полагодив баг у Вови і додав
// новий: *«натиснув на бургер, меню відкрилось та відразу закрилось»*.
// Корінь був у самому фіксі: він закривав меню на `visibilitychange`/`pageshow`,
// а на iOS ці події приходять із запізненням — уже ПІСЛЯ тапу.
// 🔑 Правило, яке стереже ця перевірка: подія фону не МІНЯЄ стан меню, вона лише
// приводить розмітку у відповідність до стану, який уже є.
await safeClick('#sidebar-toggle');
await settle();
await page.evaluate(() => {
  // Пара подій навздогін — саме так iOS віддає їх після повернення в застосунок.
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' });
  document.dispatchEvent(new Event('visibilitychange'));
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'visible' });
  document.dispatchEvent(new Event('visibilitychange'));
  window.dispatchEvent(Object.assign(new Event('pageshow'), { persisted: true }));
});
await settle(600);
ok('🔴 Відкладена подія фону НЕ закриває щойно відкрите меню',
   (await overlayState()).visible && await panelOnScreen());
await safeClick('#sidebar-close');
await settle();

// ── 10. 🔴 ХИМЕРА: НОВИЙ СКРИПТ + СТАРИЙ CSS ───────────────────────────────
// 🔑 НАЙВАЖЛИВІША перевірка цього файлу — саме вона ловить баг, який перший фікс
// не закрив, а створив. У PWA код і стилі доїжджають на телефон ОКРЕМО: на
// пристрої Вови був новий `bundle.js` і ще старий `style/sidebar.css`.
// Перший фікс переклав приховування на нові властивості CSS і перестав ставити
// атрибут `hidden` — а старий CSS ховав затемнення ЛИШЕ ним. Результат: прозорий
// шар лежав поверх екрана, з'їдав усі тапи, і Safari домальовував `backdrop-filter`
// навіть при нульовій прозорості.
// ⚠️ Старий CSS відтворюємо СИНТЕТИЧНО (вирізаємо нові властивості), а не з
// конкретного коміту: прив'язка до ревізії протухне після першого ж рефакторингу,
// а питання тут не «що було в тому коміті», а «чи виживе фікс без нового CSS».
const cssNow = projectFile('style/sidebar.css', CSS_REV);
const cssOld = cssNow
  .replace(/^\s*visibility:\s*(hidden|visible);\s*$/gm, '')
  .replace(/^\s*pointer-events:\s*(none|auto);\s*$/gm, '')
  .replace(/transition:\s*opacity 0\.25s ease, visibility[^;]*;/g, 'transition: opacity 0.25s ease;');
const page2 = await ctx.newPage();
await blockExternal(page2);
if (BUNDLE_REV) {
  const code = projectFile('bundle.js', BUNDLE_REV);
  await page2.route('**/bundle.js', r => r.fulfill({ contentType: 'text/javascript; charset=utf-8', body: code }));
}
await page2.route('**/style/sidebar.css', r => r.fulfill({ contentType: 'text/css; charset=utf-8', body: cssOld }));
await page2.goto(srv.url, { waitUntil: 'domcontentloaded' });
await page2.waitForSelector('#sidebar-toggle', { timeout: 15000 });
await page2.waitForTimeout(800);

const st2 = async () => page2.evaluate(() => {
  const el = document.getElementById('sidebar-overlay');
  const cs = getComputedStyle(el);
  return {
    // Зі старим CSS єдиний спосіб «не видно» — це `display:none` від `hidden`.
    visible: cs.display !== 'none' && cs.visibility !== 'hidden' && parseFloat(cs.opacity) > 0.01,
    eatsTap: document.elementFromPoint(30, innerHeight / 2) === el,
    display: cs.display,
  };
});
try { await page2.click('#sidebar-toggle', { timeout: 8000 }); } catch {}
await page2.waitForTimeout(450);
ok('Старий CSS: меню все одно відкривається', (await st2()).visible);
try { await page2.click('#sidebar-close', { timeout: 8000 }); } catch {}
await page2.waitForTimeout(700);
const s2 = await st2();
ok('🔴 Старий CSS: затемнення все одно ЗНИКАЄ', !s2.visible, `display=${s2.display}`);
ok('🔴 Старий CSS: екран не заблокований прозорим шаром', !s2.eatsTap);

await browser.close();
await srv.stop();
done();
