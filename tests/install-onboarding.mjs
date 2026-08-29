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

  const к1 = await крок();
  ok('крок 1 із 3, зі схемою', к1.номер === '1' && к1.схем === 1, JSON.stringify(к1));
  await page.click('.pwa-guide-next'); await page.waitForTimeout(250);
  const к2 = await крок();
  ok('крок 2 — інший, і теж зі схемою',
     к2.номер === '2' && к2.назва !== к1.назва && к2.схем === 1, JSON.stringify(к2));
  await page.click('.pwa-guide-next'); await page.waitForTimeout(250);
  const к3 = await крок();
  ok('крок 3 — останній, кнопка каже «Готово»',
     к3.номер === '3' && /Готово/.test(к3.кнопка), JSON.stringify(к3));
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
