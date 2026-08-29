// Стенд: ОНБОРДИНГ БРАУЗЕРНОГО ГОСТЯ — ЗГОДА, ПОТІМ ВСТАНОВЛЕННЯ (29.08).
//
// 🗣️ Скарга Вови зі скріна в Safari: внизу екрана стояли ОДНОЧАСНО банер згоди
// («Користуючись CSTL LIFE…») і банер «Встанови CSTL Life на екран», а розгорнута
// підказка ще й наїжджала на згоду. Плюс: «хрестик маленький, старші люди можуть
// не попасти» і «Як встановити… це геть нічого не пояснює».
//
// 🔴 ЩО САМЕ СТЕРЕЖЕ ЦЕЙ СТЕНД — не вигляд, а ЧЕРГУ і РОЗМІР ЦІЛІ. Обидві речі
// ламаються мовчки: банер, показаний на кадр раніше, виглядає як «просто два
// блоки», а зменшений хрестик узагалі ніде не проявиться, крім чужого пальця.
import { chromium } from 'playwright';
import { chromiumPath, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });

// UA справжнього Safari на iPhone: гілка iOS у банері вибирається саме за ним,
// і без підміни ми міряли б настільну гілку, якої людина зі скріна не бачить.
const UA_SAFARI = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 '
                + '(KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1';
const UA_CHROME = 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 '
                + '(KHTML, like Gecko) CriOS/128.0 Mobile/15E148 Safari/604.1';

async function відкрити(userAgent) {
  const ctx = await browser.newContext({
    viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
    userAgent, serviceWorkers: 'block',
  });
  const page = await ctx.newPage();
  await page.route('**://*.supabase.co/**', r => r.abort());
  await page.route('**://api.open-meteo.com/**', r => r.abort());
  await page.goto(url, { waitUntil: 'domcontentloaded' });
  return { ctx, page };
}

const видно = (page, с) => page.evaluate(s => !!document.querySelector(s), с);

// ── СЦЕНА 1: ЧЕРГА ───────────────────────────────────────────────────────────
{
  const { ctx, page } = await відкрити(UA_SAFARI);
  // Банер iOS зʼявляється через 2500 мс ПІСЛЯ згоди; чекаємо з запасом, щоб
  // «не встиг» не зарахувалось як «правильно дочекався черги».
  await page.waitForTimeout(4000);

  const згодаЄ  = await видно(page, '.consent-bar');
  const банерЄ  = await видно(page, '.pwa-cta');
  ok('банер згоди показано новому гостю', згодаЄ, String(згодаЄ));
  // 🔴 ГОЛОВНА ПЕРЕВІРКА ЦЬОГО СТЕНДА.
  ok('🔴 банер встановлення НЕ показується, поки висить згода', !банерЄ, String(банерЄ));

  // Банер згоди — теж технічне сповіщення, і правило для нього те саме.
  const згодаНадБаром = await page.evaluate(() => {
    const б = document.querySelector('.consent-bar');
    const кружок = document.querySelector('.tab-item--home');
    if (!б || !кружок) return { нема: true };
    const rк = кружок.getBoundingClientRect();
    return { зазор: Math.round((rк.bottom - 25 - 58) - б.getBoundingClientRect().bottom) };
  });
  ok('🔴 банер згоди теж стоїть НАД таб-баром', згодаНадБаром.зазор >= 0,
     JSON.stringify(згодаНадБаром));

  await page.click('.consent-accept');
  await page.waitForTimeout(1200);
  ok('після «Погоджуюсь» згода зникла', !(await видно(page, '.consent-bar')));
  ok('🔴 і тільки тепер зʼявився банер встановлення', await видно(page, '.pwa-cta'));

  // ── РОЗМІР ЦІЛІ ────────────────────────────────────────────────────────────
  const ціль = await page.evaluate(() => {
    const x = document.querySelector('.pwa-cta-x');
    const go = document.querySelector('.pwa-cta-go');
    const rx = x.getBoundingClientRect(), rg = go.getBoundingClientRect();
    // Перекриття хрестика і кнопки: саме воно робило «зручний хрестик» крадієм
    // тапів у головної дії. Рахуємо площу перетину прямокутників.
    const w = Math.max(0, Math.min(rx.right, rg.right) - Math.max(rx.left, rg.left));
    const h = Math.max(0, Math.min(rx.bottom, rg.bottom) - Math.max(rx.top, rg.top));
    return { хш: Math.round(rx.width), хв: Math.round(rx.height),
             кв: Math.round(rg.height), перетин: Math.round(w * h) };
  });
  ok('🔴 область натиску ✕ не менша за 44×44', ціль.хш >= 44 && ціль.хв >= 44,
     `${ціль.хш}×${ціль.хв}`);
  ok('🔴 кнопка теж не менша за 44 у висоту', ціль.кв >= 44, `${ціль.кв}px`);
  ok('🛑 ✕ і кнопка НЕ перекриваються (інакше хрестик краде тапи)',
     ціль.перетин === 0, `${ціль.перетин}px²`);

  // ── НАД ТАБ-БАРОМ, А НЕ ПОВЕРХ НЬОГО ───────────────────────────────────────
  // 🗣️ Вова зі знімка: «банер налазить на таббар… зроби так щоб погодження з
  // умовами і інструкція як встановити були над таб баром».
  // 📐 Міряємо ГЕОМЕТРІЄЮ, а не значенням `bottom`: кружок «Громади» піднімається
  // над низом бару на 83px, тобто «вище за сам бар» ще нічого не доводить. Питання
  // одне: чи перекриває банер найвищу точку бару.
  const надБаром = await page.evaluate(() => {
    const б = document.querySelector('.pwa-cta');
    const кружок = document.querySelector('.tab-item--home');
    if (!б || !кружок) return { нема: !б ? 'банера' : 'таб-бару' };
    const rб = б.getBoundingClientRect();
    // Найвища точка бару — верх кружка «Громади», а не верх самого бару:
    // ::before висотою 58px стоїть на bottom:25px усередині кнопки.
    const rк = кружок.getBoundingClientRect();
    const верхКружка = rк.bottom - 25 - 58;
    return { низБанера: Math.round(rб.bottom), верхКружка: Math.round(верхКружка),
             зазор: Math.round(верхКружка - rб.bottom) };
  });
  ok('🔴 банер стоїть НАД таб-баром, не перекриває кружок «Громади»',
     надБаром.зазор >= 0, JSON.stringify(надБаром));

  // ── ВИДИМІСТЬ ХРЕСТИКА ─────────────────────────────────────────────────────
  // 🔴 ДВІ РІЗНІ ВАДИ, І ПЕРША РЕДАКЦІЯ ЛІКУВАЛА ЛИШЕ ОДНУ. 44×44 — про те, чи
  // ПОПАДЕ палець. Видимість — про те, чи людина взагалі побачить кнопку і
  // потягнеться до неї. Вова з живого екрана: «кнопку закриття Х погано видно,
  // бо вона маленька». Тому міряємо і знак, і підкладку під ним.
  const хрестик = await page.evaluate(() => {
    const x = document.querySelector('.pwa-cta-x');
    const s = getComputedStyle(x);
    return { кегль: parseFloat(s.fontSize), тло: s.backgroundImage, колір: s.color };
  });
  ok('🔴 знак ✕ не дрібніший за 17px', хрестик.кегль >= 17, `${хрестик.кегль}px`);
  ok('🔴 під ним видима підкладка, а не порожнє місце',
     /gradient/.test(хрестик.тло), хрестик.тло.slice(0, 60));

  // ── ІКОНКА ─────────────────────────────────────────────────────────────────
  const іконка = await page.evaluate(() => {
    const i = document.querySelector('.pwa-cta-ic');
    return { тег: i ? i.tagName : null, src: i ? (i.getAttribute('src') || '') : '' };
  });
  ok('🔑 іконка банера — справжня іконка застосунку, а не емодзі',
     іконка.тег === 'IMG' && /icon-192\.png$/.test(іконка.src), JSON.stringify(іконка));

  // ── ІНСТРУКЦІЯ ─────────────────────────────────────────────────────────────
  await page.click('.pwa-cta-go');
  await page.waitForTimeout(500);
  ok('🔴 банер ховається, коли відкрилась інструкція', !(await видно(page, '.pwa-cta')));
  ok('інструкція відкрилась', await видно(page, '.pwa-guide-sheet'));

  const крок = async () => page.evaluate(() => ({
    номер: (document.querySelector('.pwa-guide-now') || {}).textContent,
    назва: (document.querySelector('.pwa-guide-name') || {}).textContent,
    схем:  document.querySelectorAll('.pwa-guide-pic svg').length,
    кнопка: (document.querySelector('.pwa-guide-next') || {}).textContent,
  }));

  // 🔴 ЧОТИРИ КРОКИ, А НЕ ТРИ — і це не оформлення, а ПРАВДА про чужий екран.
  // Знімок Вови з живого iPhone: у меню ⋯ пункти «Поширити · Додати до папки
  // «Закладки» · Додати закладку до… · Нова вкладка · Нова приватна вкладка».
  // «На Початковий екран» там НЕМАЄ — він на крок глибше, в аркуші «Поширити».
  // 🛑 Стенд тримає саме цю послідовність: інструкція, що зникає на один крок,
  // виглядає справною, а людину заводить у глухий кут.
  const назви = [];
  for (let i = 1; i <= 4; i++) {
    const к = await крок();
    назви.push(к.назва);
    ok(`крок ${i} із 4, зі схемою`, к.номер === String(i) && к.схем === 1, JSON.stringify(к));
    if (i === 4) ok('на останньому кроці кнопка каже «Готово»', /Готово/.test(к.кнопка), к.кнопка);
    else { await page.click('.pwa-guide-next'); await page.waitForTimeout(250); }
  }
  ok('🔴 крок «Поширити» на місці — без нього шлях обривається',
     назви.some(н => /Поширити/.test(н)), JSON.stringify(назви));
  ok('🛑 усі чотири кроки різні', new Set(назви).size === 4, JSON.stringify(назви));

  // ── ЧЕСНІСТЬ ПРО ТЕ, ЩО САМЕ СТАВИМО ──────────────────────────────────────
  // 🗣️ Вова: сказати, що поки це веб-версія. Людина, яка чекала магазин
  // застосунків, інакше вирішить на кроці «Поширити», що її обманули.
  const шапка = await page.evaluate(() =>
    (document.querySelector('.pwa-guide-head') || {}).textContent || '');
  ok('🔴 сказано, що це веб-версія (PWA), а не застосунок з магазину',
     /веб-верс/i.test(шапка) && /PWA/.test(шапка), шапка.slice(0, 90));

  // ── СВАЙП ──────────────────────────────────────────────────────────────────
  // Гортання — те, що рука пробує САМА; коли воно не працює, екран здається зламаним.
  const свайп = async (звідки, куди) => page.evaluate(([x1, x2]) => {
    const el = document.querySelector('.pwa-guide-sheet');
    const т = (x, id) => new Touch({ identifier: id, target: el, clientX: x, clientY: 400 });
    el.dispatchEvent(new TouchEvent('touchstart', { changedTouches: [т(x1, 1)], bubbles: true }));
    el.dispatchEvent(new TouchEvent('touchend',   { changedTouches: [т(x2, 1)], bubbles: true }));
  }, [звідки, куди]);

  await свайп(300, 80);   // вліво = вперед; ми на 4-му, тобто на краю
  await page.waitForTimeout(200);
  const край = await крок();
  ok('🛑 свайп на КРАЮ нічого не робить (не закриває аркуш жестом)',
     край.номер === '4' && await видно(page, '.pwa-guide-sheet'), край.номер);

  await свайп(80, 300);   // вправо = назад
  await page.waitForTimeout(250);
  ok('🔴 свайп вправо гортає на крок назад', (await крок()).номер === '3');
  await свайп(300, 80);
  await page.waitForTimeout(250);
  ok('🔴 свайп вліво гортає вперед', (await крок()).номер === '4');

  // Дрібний рух і вертикальний свайп кроки НЕ гортають — інакше звичайна
  // прокрутка аркуша перемикала б сторінки випадково.
  await свайп(300, 275);
  await page.waitForTimeout(200);
  ok('🛑 рух коротший за поріг кроки не гортає', (await крок()).номер === '4');

  await page.click('.pwa-guide-next'); await page.waitForTimeout(400);
  ok('«Готово» закриває інструкцію', !(await видно(page, '.pwa-guide-sheet')));

  // 🔴 ПАУЗА ПІСЛЯ ПРОЧИТАНОЇ ІНСТРУКЦІЇ. Без неї банер вилазив би наступного ж
  // візиту людині, яка щойно все прочитала, — те саме «переслідування».
  const пауза = await page.evaluate(() => !!localStorage.getItem('cstl-install-snooze-v1'));
  ok('🔴 після інструкції банер замовкає на 7 днів', пауза, String(пауза));

  await ctx.close();
}

// ── СЦЕНА 2: НЕ SAFARI НА iPHONE ─────────────────────────────────────────────
// 🔴 Клас «показуємо одне, а веде в нікуди»: на iPhone додати на екран уміє лише
// Safari, а `isIOS()` дивиться на СИСТЕМУ. У Chrome кроки «Поділитись → На
// початковий екран» відправили б людину шукати кнопку, якої в неї немає.
{
  const { ctx, page } = await відкрити(UA_CHROME);
  await page.waitForTimeout(1500);
  await page.click('.consent-accept');
  await page.waitForTimeout(3500);
  ok('банер показано і в Chrome на iPhone', await видно(page, '.pwa-cta'));
  await page.click('.pwa-cta-go');
  await page.waitForTimeout(500);
  const текст = await page.evaluate(() =>
    (document.querySelector('.pwa-guide-sheet') || {}).textContent || '');
  ok('🔴 у Chrome кажемо про Safari, а не показуємо мертві кроки',
     /Safari/.test(текст), текст.slice(0, 80));
  ok('🛑 і кроків «Поділитись» там немає',
     !/початковий екран/.test(текст) || /Safari/.test(текст), текст.slice(0, 80));
  ok('🛑 схем-кроків у цьому аркуші немає',
     await page.evaluate(() => document.querySelectorAll('.pwa-guide-pic svg').length === 0));
  await ctx.close();
}

await browser.close();
await stop();
done();
