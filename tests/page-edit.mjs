// Стенд №17: ЗБЕРЕЖЕННЯ СПІЛЬНОТИ ОНОВЛЮЄ ШАПКУ НА МІСЦІ.
//
// Це було останнє місце, де екран спільноти будувався заново після дії — а новий
// контейнер починає прокрутку з нуля. Відкладалось свідомо: масштаб липкого заголовка
// міряється ОДИН раз під конкретну назву, тож самої лише підміни розмітки мало —
// потрібен ще перемір. Тепер екран віддає свій перемір назовні (`screenRemeasure`),
// і `patchPageScreen` його кличе.
//
// 🔴 ЩО МІРЯЄМО (те, що побачить Вова): після збереження лишається ТОЙ САМИЙ вузол
// екрана, прокрутка не рухається, а вміст шапки новий. Плюс усі «зʼявилось/зникло»:
// банера не було → зʼявився; опис прибрали → рядок зник.
//
// ⚠️ Ганяємо СПРАВЖНІЙ код: блок патчу витягнутий текстом із src/tabs/feed.js,
// `avatarHtml` — звідти ж, `escapeHtml` — із src/core/utils.js. Жодних копій:
// копія перевіряла б саму себе.
import { chromium } from 'playwright';
import { launch, projectFile, reporter } from './_lib.mjs';

const SRC   = projectFile('src/tabs/feed.js');
const UTILS = projectFile('src/core/utils.js');
// ⚠️ СПРАВЖНІ стилі проєкту обовʼязкові. Перша версія стенда їх не підключала — і
// показала «прокрутка поїхала на 36px»: без CSS порожній банер має нульову висоту, а
// вставлена картинка 1×1 малює рядок ~18px. У застосунку банер має ФІКСОВАНУ висоту,
// тож підміна картинки не може нічого зсунути. Тобто стенд міряв власну декорацію.
const CSS   = projectFile('style/feed.css');

const cut = (text, from, to, what) => {
  const a = text.indexOf(from), b = text.indexOf(to, a + 1);
  if (a < 0 || b < 0) { console.log(`❌ не знайшов ${what}`); process.exit(1); }
  return text.slice(a, b);
};
const PATCH  = cut(SRC, 'const screenRemeasure', '// ── ЖИВА СИНХРОНІЗАЦІЯ', 'блок patchPageScreen');
const AVATAR = cut(SRC, 'function avatarHtml', '// ── Порядок спільнот', 'avatarHtml');
const ESCAPE = cut(UTILS, 'export function escapeHtml', '\n\n', 'escapeHtml').replace('export ', '');

const { ok, done } = reporter();

// Шапка екрана — та сама розмітка, що її будує openPageScreen.
const SCREEN_HTML = `
  <div class="fd-screen" data-page="7" style="height:400px;overflow-y:auto">
    <div class="fd-screen-top"><div class="fd-banner"></div></div>
    <div class="fd-screen-body">
      <div class="fd-screen-id"><span class="fd-screen-ava-wrap">
        <span class="fd-screen-ava"></span>
      </span></div>
      <div class="fd-screen-title"><div class="fd-screen-title-in">
        <div class="fd-screen-name">Стара назва</div>
        <div class="fd-screen-theme">старий опис</div>
      </div></div>
      <div class="fd-screen-list" style="height:1200px"></div>
    </div>
  </div>`;

const browser = await launch(chromium);
const page = await browser.newPage({ viewport: { width: 390, height: 800 } });
await page.setContent(`<!doctype html><html><head><meta charset="utf-8"><style>
  *,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
  :root{--fd-ink:#111;--fd-muted:#888;--fd-surface:#fff;--fd-bg:#f4f4f4;--fd-line:#ddd;--fd-accent:#722F37}
  ${CSS}
</style></head><body></body></html>`);

const r = await page.evaluate(async ({ patch, avatarSrc, escapeSrc, screenHtml }) => {
  // `pages` — той самий модульний список, з якого патч бере свіжі дані сторінки.
  const pages = [{ id: 7, name: 'Стара назва', theme: 'старий опис', avatar_url: null, banner_url: null }];
  const { patchPageScreen, screenRemeasure } = new Function('pages', `
    ${escapeSrc}
    ${avatarSrc}
    ${patch}
    return { patchPageScreen, screenRemeasure };
  `)(pages);

  document.body.innerHTML = screenHtml;
  const screen = document.querySelector('.fd-screen');
  screen.classList.add('open');            // без цього екран зсунутий за край (translateX)
  screen.scrollTop = 300;
  // Те, що бачить око: положення списку постів усередині екрана. Саме його зсув —
  // і є «поїхало», а не число scrollTop саме по собі.
  const listTop = () => Math.round(
    screen.querySelector('.fd-screen-list').getBoundingClientRect().top
    - screen.getBoundingClientRect().top);
  const seenBefore = listTop();

  // Реєструємо перемір рівно так, як це робить openPageScreen.
  let remeasured = 0;
  screenRemeasure.set(screen, () => { remeasured++; });

  // 1×1 прозорий PNG замість «нової картинки» — щоб не ходити в мережу.
  const PX = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

  // ── Крок 1: змінили все одразу (назва, опис, банер, аватар) ────────────────
  Object.assign(pages[0], { name: 'CSTL LIFE', theme: 'новини Олики', banner_url: PX, avatar_url: PX });
  await patchPageScreen(7);
  const one = {
    sameNode: document.querySelector('.fd-screen') === screen,
    connected: screen.isConnected,
    scroll: screen.scrollTop,
    drift: listTop() - seenBefore,          // на скільки поїхало те, що видно
    name: screen.querySelector('.fd-screen-name').textContent,
    theme: screen.querySelector('.fd-screen-theme')?.textContent ?? null,
    bannerImg: !!screen.querySelector('.fd-banner img'),
    bannerView: screen.querySelector('.fd-banner').classList.contains('fd-banner--view'),
    avaImg: !!screen.querySelector('.fd-screen-ava img'),
    avaView: screen.querySelector('.fd-screen-ava').classList.contains('fd-screen-ava--view'),
    remeasured,
  };

  // ── Крок 2: зворотний бік — усе прибрали, назву змінили ────────────────────
  // Тут вміст шапки СТАЄ НИЖЧИМ (зник рядок опису), тож список під нею законно
  // підіймається. Щоб відрізнити це від «поїхало саме собою», міряємо висоту
  // заголовка до і після: зсув має дорівнювати рівно їй.
  const titleIn = screen.querySelector('.fd-screen-title-in');
  const titleH0 = titleIn.offsetHeight;
  const driftBefore2 = listTop();
  Object.assign(pages[0], { name: 'Ліс', theme: '', banner_url: null, avatar_url: null });
  await patchPageScreen(7);
  const titleH1 = titleIn.offsetHeight;
  const two = {
    themeGone: !screen.querySelector('.fd-screen-theme'),
    bannerImg: !!screen.querySelector('.fd-banner img'),
    bannerView: screen.querySelector('.fd-banner').classList.contains('fd-banner--view'),
    avaView: screen.querySelector('.fd-screen-ava').classList.contains('fd-screen-ava--view'),
    // Заглушка бере ПЕРШУ ЛІТЕРУ нової назви — доказ, що аватар перемальовано з новими даними.
    avaLetter: screen.querySelector('.fd-screen-ava').textContent.trim(),
    scroll: screen.scrollTop,
    drift: listTop() - driftBefore2,
    titleShrunk: titleH0 - titleH1,
    sameNode: document.querySelector('.fd-screen') === screen,
    remeasured,
  };

  return { one, two };
}, { patch: PATCH, avatarSrc: AVATAR, escapeSrc: ESCAPE, screenHtml: SCREEN_HTML });

// ── ГОЛОВНЕ: екран не перебудовано, прокрутка на місці ───────────────────────
ok('екран лишився ТИМ САМИМ вузлом (не перебудований)', r.one.sameNode && r.one.connected);
ok('те, що видно, не зрушило з місця', r.one.drift === 0,
   `зсув ${r.one.drift}px (scrollTop ${r.one.scroll})`);
ok('липкий заголовок перевиміряно після зміни назви', r.one.remeasured === 1,
   `переміряно ${r.one.remeasured} раз(и)`);

// ── Вміст шапки оновився ────────────────────────────────────────────────────
ok('назва оновилась', r.one.name === 'CSTL LIFE', r.one.name);
ok('опис оновився', r.one.theme === 'новини Олики', String(r.one.theme));
ok('банера не було — зʼявився і його можна відкрити', r.one.bannerImg && r.one.bannerView);
ok('аватар став фотографією', r.one.avaImg && r.one.avaView);

// ── Зворотний бік: усе прибрали ─────────────────────────────────────────────
ok('опис прибрали — рядок зник', r.two.themeGone);
ok('банер прибрали — ні картинки, ні класу перегляду', !r.two.bannerImg && !r.two.bannerView);
ok('аватар прибрали — лишилась заглушка з першою літерою НОВОЇ назви',
   !r.two.avaView && r.two.avaLetter === 'Л', `«${r.two.avaLetter}»`);
// Прибраний опис — це на один рядок нижча шапка. Список під нею мусить піднятись
// рівно на цей рядок: не більше (нічого не «поїхало») і не менше (шапка не «залипла»).
ok('список піднявся рівно на висоту прибраного рядка опису',
   r.two.drift === -r.two.titleShrunk && r.two.titleShrunk > 0,
   `зсув ${r.two.drift}px, шапка стала нижчою на ${r.two.titleShrunk}px`);
ok('прокрутка при цьому не скинулась', r.two.scroll === 300, `${r.two.scroll}px`);
ok('вузол той самий і після другого збереження', r.two.sameNode);
ok('перемір відбувся на КОЖНЕ збереження', r.two.remeasured === 2, `${r.two.remeasured}`);

// ── Проводка: у шляху збереження більше нема знесення екрана ────────────────
// Тут перевірка форми доречна: сам симптом («екран будується заново») і був однією
// конкретною командою. Її відсутність — це і є наслідок.
const saveAt = SRC.indexOf('const res = await updatePage');
const saveBlock = SRC.slice(saveAt, saveAt + 1400);
ok('шлях збереження більше не зносить екран',
   !/fd-screen'\)\.forEach\(s => s\.remove\(\)\)/.test(saveBlock));
ok('шлях збереження кличе точкове оновлення',
   saveBlock.includes('patchPageScreen') && saveBlock.includes('refreshFeedCircles'));

await browser.close();
done();
