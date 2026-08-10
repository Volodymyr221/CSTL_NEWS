// Стенд: ПОВНОЕКРАННІ СТОРІНКИ ЗАКРИВАЮТЬСЯ ВБІК, А НЕ ВНИЗ.
//
// Скарга Вови 10.08 (зі знімком «Повідомлення»): «коли закриваю кнопкою
// "Повернутися", воно згортається вниз, а має так само, як свайпом… усі сторінки,
// які накладаються зверху і закриваються з кнопки назад, повинні згортатися так
// само, як свайпом».
//
// 🔑 ЧОМУ ЦЕ ДЕФЕКТ, А НЕ СМАК. Жест «назад» від лівого краю обслуговує САМА iOS:
// вона малює свій перехід, і сторінка їде ВПРАВО. Наш CSS водночас казав
// «донизу». Тобто одна дія — закрити сторінку — виглядала по-різному залежно від
// того, чим її закрили. Chromium системного жесту не має і показати цю
// розбіжність не може, тому стенд міряє ЄДИНЕ, що тут можна заміряти чесно:
// напрямок, у який іде сторінка.
//
// 📐 ЧОМУ ПОРІВНЮЄМО МІЖ СОБОЮ, А НЕ З ЧИСЛОМ. `.nh-screen` (хаб новин) і
// `.fd-screen` (сторінка спільноти) вже їдуть убік — тобто в застосунку є
// ПРАВИЛО, а `.pm-screen` був із нього винятком. Тому стенд перевіряє не «чи
// translateX у pm-screen», а що ВСІ повноекранні сторінки поводяться однаково.
// Заведеться нова — правило вже написане, і його порушення буде видно.
//
// ⚠️ `serviceWorkers: 'block'` — восьмий випадок брехливої перевірки в проєкті.
//
// 🔴 КОНТРОЛЬ (обовʼязковий):
//     CSS_REV=origin/main node tests/screen-exit-direction.mjs
// на коді ДО фіксу «Повідомлення» мусять їхати ВНИЗ, а решта сторінок — убік:
// разом вони доводять, що виправлено саме винятка, а не переписано правило.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';

const { ok, done } = reporter();
const REV = process.env.CSS_REV || '';

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({
  viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true,
  serviceWorkers: 'block',
});
const p = await ctx.newPage();
if (REV) {
  for (const f of ['style/messages.css', 'style/news-hub.css', 'style/feed.css']) {
    const body = projectFile(f, REV);
    await p.route(`**/${f}`, r => r.fulfill({ contentType: 'text/css; charset=utf-8', body }));
  }
}
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);

// 🔬 Міряємо ЗАКРИТИЙ стан кожної сторінки — саме туди вона їде при закритті.
// Порожній вузол із потрібним класом достатньо: напрямок задає CSS, а не вміст.
// Матрицю читаємо з ОБЧИСЛЕНОГО стилю, тобто те, що справді застосує браузер.
const напрямки = await p.evaluate(() => {
  const зміряти = (cls) => {
    const el = document.createElement('div');
    el.className = cls;
    document.body.appendChild(el);
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    el.remove();
    return { x: Math.round(m.m41), y: Math.round(m.m42) };
  };
  return {
    'Повідомлення / Мої оголошення (.pm-screen)': зміряти('pm-screen'),
    'Хаб новин (.nh-screen)':                     зміряти('nh-screen'),
    'Сторінка спільноти (.fd-screen)':            зміряти('fd-screen'),
  };
});

for (const [назва, v] of Object.entries(напрямки)) {
  const убік = Math.abs(v.x) > 40 && Math.abs(v.y) < 10;
  ok(`🔴 ${назва} — закривається ВБІК, не вниз`, убік, `зсув x=${v.x} y=${v.y}`);
}

// 🔑 Правило, а не збіг: усі сторінки їдуть в ОДИН бік і на ту саму відстань.
// Без цієї перевірки одна сторінка могла б поїхати вліво, друга вправо — кожна
// «вбік», а разом хаос.
const усі = Object.values(напрямки);
ok('усі повноекранні сторінки їдуть в ОДИН бік (вправо, на власну ширину)',
   усі.every(v => v.x > 40) && new Set(усі.map(v => v.x)).size === 1,
   усі.map(v => v.x).join(' · '));

// Відкритий стан мусить стояти на нулі — інакше сторінка була б зсунута весь час.
const відкриті = await p.evaluate(() => {
  const зміряти = (cls, open) => {
    const el = document.createElement('div');
    el.className = cls + ' ' + open;
    document.body.appendChild(el);
    const m = new DOMMatrixReadOnly(getComputedStyle(el).transform);
    el.remove();
    return { x: Math.round(m.m41), y: Math.round(m.m42) };
  };
  return [зміряти('pm-screen', 'visible'), зміряти('nh-screen', 'open'), зміряти('fd-screen', 'open')];
});
ok('у ВІДКРИТОМУ стані кожна сторінка стоїть рівно на місці (0,0)',
   відкриті.every(v => v.x === 0 && v.y === 0),
   відкриті.map(v => `${v.x},${v.y}`).join(' · '));

await ctx.close(); await b.close(); await stop();
done();
