// tests/carousel-shared.mjs — ОДНА КАРУСЕЛЬ НА ВЕСЬ ЗАСТОСУНОК.
//
// 🔴 ЗАРАДИ ЧОГО. 25.08 з'явився `core/auto-carousel.js`, але карусель новин лишилась
// власною копією — у проєкті два дні жили ДВІ реалізації того самого механізму. У шапці
// модуля це чесно записали як борг. 26.08 борг закрито; цей стенд стереже, щоб копія не
// відросла назад.
// 🛑 Дві копії в цьому проєкті вже розходились двічі: два списки антиспаму і дві копії
// розмітки шкали автобуса. Розходяться вони не одразу, а в мить, коли одну з них
// полагодять — і вада читається як «полагодили, а в другому місці досі зламано».
//
// 🔑 ГОЛОВНЕ: перевірити не «чи є виклик модуля», а що карусель ПІСЛЯ переведення справді
// РУХАЄТЬСЯ. Виклик можна написати правильно і все одно зламати рух — наприклад, забути
// зупинювач і отримати два таймери, або промахнутись селектором слайда і дістати
// «слайдів менше двох», де модуль тихо виходить.
//
// ⚠️ ЗАПОБІЖНИК ВІД ПОМИЛКИ ВИМІРУ, ЯКА В ЦЬОМУ ПРОЄКТІ ВЖЕ БУЛА: модуль навмисно спить,
// поки блока не видно (`IntersectionObserver`). Стенд, який міряє нерухомий блок за
// межами екрана, «доведе» поломку там, де все справне — це рівно та помилка, на якій
// 25.08 спіймався сторож віджета Стрічки. Тому спершу доводимо блок у вікно і
// ПЕРЕВІРЯЄМО це окремо.

import { chromium } from 'playwright';
import { chromiumPath, serve, reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';
const читати = (шлях) => { try { return projectFile(шлях, REV); } catch { return ''; } };

// ── 1. КОПІЯ НЕ ВІДРОСЛА ──────────────────────────────────────────────────────
const MOD = читати('src/core/auto-carousel.js');
const CB  = читати('src/tabs/community-blocks.js');
const HF  = читати('src/tabs/home-feed.js');

ok('спільний модуль існує', /export function startAutoCarousel/.test(MOD));
ok('🔴 новини Громади крутить СПІЛЬНИЙ модуль',
   /import \{ startAutoCarousel \}/.test(CB) && /startAutoCarousel\(track/.test(CB));
ok('віджет Стрічки крутить той самий модуль',
   /import \{ startAutoCarousel \}/.test(HF) && /startAutoCarousel\(track/.test(HF));

// 🔑 Найважливіша перевірка розділу: у споживача не лишилось ВЛАСНОГО двигуна. Виклик
// модуля поруч зі старим таймером виглядав би як переведення, а насправді крутив би
// доріжку двічі — і швидше, ніж задумано.
const БЕЗ_КОМЕНТАРІВ = (s) => s.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const CB_КОД = БЕЗ_КОМЕНТАРІВ(CB);
ok('🔴 у новин не лишилось власного таймера гортання',
   !/_newsTimer/.test(CB_КОД) && !/setInterval\(step/.test(CB_КОД));
ok('🔴 у новин не лишилось власного спостерігача видимості',
   !/_newsIO/.test(CB_КОД));
// Зупинку старого екземпляра модуль на себе НЕ бере: віджет перемальовується, і без цього
// на тому самому треку працювало б два таймери.
ok('старий екземпляр зупиняється перед новим', /_stopNewsCarousel\(\)/.test(CB_КОД));

// 🛑 Обґрунтування, яке пережило свою підставу, у цьому проєкті вже коштувало правки.
ok('🔴 шапка модуля не стверджує, що новини НЕ переведені',
   !/карусель новин на цей модуль ЩЕ НЕ ПЕРЕВЕДЕНА/i.test(MOD));

// Дві речі, яких немає в підручниках — саме їх найлегше «спростити» при переписуванні.
ok('прокрутку робить браузер, а не власна анімація', /behavior: 'smooth'/.test(MOD));
ok('поточний слайд рахується за положенням прокрутки, а не лічильником',
   /track\.scrollLeft/.test(MOD) && !/currentIndex\+\+/.test(MOD));

// ── 2. ЖИВИЙ РУХ ──────────────────────────────────────────────────────────────
// ⚠️ ЧЕСНО ПРО МЕЖУ ЦИХ ТРЬОХ ПЕРЕВІРОК: на контрольному прогоні (`BUNDLE_REV=origin/main`)
// вони ЗЕЛЕНІ — і це правильно. Стара копія теж крутила доріжку, тож рух там був. Вони
// доводять не факт переведення (його стереже розділ 1), а що переведення не ЗЛАМАЛО рух:
// не забуто зупинювач, не промазано селектором слайда, `onSlide` доїжджає до крапок.
// 📐 Контроль 26.08: 10/15 — червоніють рівно п'ять кодових перевірок розділу 1.
const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

async function сцена({ still = false } = {}) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    reducedMotion: still ? 'reduce' : 'no-preference',
  });
  const page = await ctx.newPage();
  if (REV) {
    const old = projectFile('bundle.js', REV);
    await page.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.route('**://api.open-meteo.com/**', r => r.abort());
  await page.route('**://**/*.{png,jpg,jpeg,webp,gif}', r => r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2500);
  await page.evaluate(() => window.switchTab && window.switchTab('community'));
  await page.waitForTimeout(1500);
  return { ctx, page };
}

// Цикл новин читаємо з КОДУ, а не вписуємо числом: зміниться там — стенд поїде за ним,
// а не почне падати з «нічого не рухається».
const ЦИКЛ = Number((CB.match(/NEWS_CYCLE_MS\s*=\s*(\d+)/) || [, 7000])[1]);

async function поміряти(page) {
  // Доводимо блок новин у вікно — інакше модуль СПИТЬ, і ми виміряли б власний запобіжник.
  await page.evaluate(() => document.getElementById('hm-ntrack')
    ?.scrollIntoView({ block: 'center', behavior: 'instant' }));
  await page.waitForTimeout(400);
  const видно = await page.evaluate(() => {
    const t = document.getElementById('hm-ntrack');
    if (!t) return null;
    const r = t.getBoundingClientRect();
    return r.top < window.innerHeight && r.bottom > 0;
  });
  const до = await page.evaluate(() => {
    const t = document.getElementById('hm-ntrack');
    if (!t) return null;
    const dots = [...document.querySelectorAll('.hm-ndots i')];
    return {
      left: t.scrollLeft, слайдів: t.querySelectorAll('.hm-npage').length,
      крапка: dots.findIndex(d => d.classList.contains('on')),
      кат: document.getElementById('hm-ncat')?.textContent || '',
    };
  });
  await page.waitForTimeout(ЦИКЛ + 2000);   // цикл + запас на плавну прокрутку
  const після = await page.evaluate(() => {
    const t = document.getElementById('hm-ntrack');
    const dots = [...document.querySelectorAll('.hm-ndots i')];
    return {
      left: t.scrollLeft,
      крапка: dots.findIndex(d => d.classList.contains('on')),
      кат: document.getElementById('hm-ncat')?.textContent || '',
    };
  });
  return { видно, до, після };
}

const { ctx, page } = await сцена();
const рух = await поміряти(page);

ok('блок новин справді у вікні — міряємо рух, а не сплячий модуль', рух.видно === true);
ok('у каруселі більше однієї сторінки — інакше рухатись нічому',
   (рух.до?.слайдів || 0) > 1, `сторінок: ${рух.до?.слайдів}`);
ok('🔴 карусель новин ГОРТАЄТЬСЯ САМА після переведення на спільний модуль',
   рух.після.left > (рух.до?.left ?? 0), `${рух.до?.left} → ${рух.після.left}`);
// Рух доріжки без переїзду крапки означав би, що `onSlide` не доїхав до споживача —
// тобто переведення зроблено наполовину.
ok('🔴 крапка переїхала разом зі слайдом',
   рух.після.крапка > (рух.до?.крапка ?? 0),
   `${рух.до?.крапка} → ${рух.після.крапка}`);
ok('назва категорії в шапці змінилась слідом',
   рух.після.кат !== рух.до?.кат, `${рух.до?.кат} → ${рух.після.кат}`);
await ctx.close();

// ── 3. КОНТРОЛЬ: ЩО МИ МІРЯЄМО САМЕ АВТО-РУХ ──────────────────────────────────
// 🔑 Без цього перевірка вище була б зелена від будь-якого зміщення доріжки. З
// «зменшити рух» модуль навмисно не заводить таймер — тож доріжка МУСИТЬ стояти. Якщо
// вона й тут поїхала, ми міряємо не карусель.
const { ctx: ctx2, page: page2 } = await сцена({ still: true });
const тиша = await поміряти(page2);
ok('🔴 КОНТРОЛЬ: із «зменшити рух» карусель стоїть',
   тиша.після.left === (тиша.до?.left ?? -1), `${тиша.до?.left} → ${тиша.після.left}`);
await ctx2.close();

await browser.close();
await stop();
done();
