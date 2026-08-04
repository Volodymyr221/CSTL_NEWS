// tests/tools/news-tile-audit.mjs — ЛІНІЙКА КАРТКИ НОВИНИ на головній.
//
// Не стенд (нічого не «падає») — інструмент виміру під замовлення Вови 04.08:
// «чому вони квадратні?». Питання про форму, тож міряємо саме форму й читабельність:
//   • чи має плитка ВЛАСНУ ПОВЕРХНЮ (фон · обідок · радіус) — чи текст лежить
//     просто на фото-фоні сторінки;
//   • реальний контраст тексту до того, що ПІД ним (фото, не «біле полотно»);
//   • геометрію рядка входу «Усі новини» в кожній секції.
//
// ⚠️ Міряємо getComputedStyle РЕАЛЬНОГО вузла, а не читаємо CSS очима: 01.08 уже
// був випадок, коли коментар стверджував «картка з обідком», а `border-top-width`
// на живій сторінці дорівнював 0. Опис і код розходяться мовчки.
//
// ⚠️ `serviceWorkers: 'block'` — обовʼязково, інакше запити йдуть повз page.route.
//
// Запуск:  node tests/tools/news-tile-audit.mjs [мітка]
// Знімки:  tests/tools/_shots/tile-<мітка>-{block,card}.png

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';
import { chromiumPath, serve, ROOT } from '../_lib.mjs';

const LABEL = process.argv[2] || 'було';
const SHOTS = join(ROOT, 'tests', 'tools', '_shots');
mkdirSync(SHOTS, { recursive: true });

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({
  viewport: { width: 390, height: 844 },
  isMobile: true, hasTouch: true, serviceWorkers: 'block',
});
const page = await ctx.newPage();
await page.route('**://*.supabase.co/**', r => r.abort());

// Погоду підміняємо (не глушимо): порожня шапка має іншу висоту, а ми міряємо
// позиції на сторінці.
const day = n => Array.from({ length: n }, (_, i) =>
  new Date(Date.now() + i * 864e5).toISOString().slice(0, 10));
const hours = day(1).flatMap(d => Array.from({ length: 24 }, (_, h) => `${d}T${String(h).padStart(2, '0')}:00`));
await page.route('**://api.open-meteo.com/**', r => r.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({
    utc_offset_seconds: 10800,
    current: { temperature_2m: 18.4, weather_code: 3, apparent_temperature: 17.2 },
    hourly: {
      time: hours,
      temperature_2m: hours.map((_, i) => 14 + (i % 12)),
      precipitation_probability: hours.map((_, i) => (i * 7) % 100),
      weather_code: hours.map(() => 3),
    },
    daily: {
      time: day(7), weather_code: [3, 1, 61, 0, 2, 3, 80],
      temperature_2m_max: [24, 26, 21, 27, 25, 23, 20],
      temperature_2m_min: [13, 14, 12, 15, 14, 13, 11],
    },
  }),
}));
await page.route('**://nominatim.openstreetmap.org/**', r => r.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ address: { village: 'Олика' } }),
}));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2000);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
await page.waitForTimeout(7000);   // 4с фолбек погоди + запас на статті

// 🔴 ПРОКРУТКА ДО БЛОКА — ДО будь-якого виміру, а не після.
// Перший запуск цього інструмента дав «непрозорої поверхні немає»: блок новин
// лежав нижче згину, `elementsFromPoint` за межами вікна повертає ПОРОЖНІЙ
// список, і проба мовчки прочитала ніщо як «фону немає». Той самий клас помилки,
// що вимір `rect.top` у прихованого блока — інструмент не падає, він бреше.
// 🔴 І СТРІЧКУ В НУЛЬ. Друга брехня того самого виміру: карусель гортається сама
// раз на 7с, тож на момент проби перша картка вже виїхала ліворуч, `left` став
// відʼємним, а `elementsFromPoint` за межами вікна повертає порожній список —
// і «фону не знайдено» означало насправді «я міряв поза екраном».
await page.$eval('#cm-news-board', el => el.scrollIntoView({ block: 'center' }));
await page.$eval('#hm-ntrack', el => { el.scrollLeft = 0; });
await page.waitForTimeout(500);

// ── 1. Поверхня плитки: що НАСПРАВДІ намальовано ─────────────────────────────
const tile = await page.evaluate(() => {
  const c = document.querySelector('#hm-ntrack > .nc');
  if (!c) return null;
  const s = getComputedStyle(c);
  const img = c.querySelector('.nc-img');
  const si = img ? getComputedStyle(img) : null;
  const r = c.getBoundingClientRect();
  return {
    w: Math.round(r.width), h: Math.round(r.height),
    bg: s.backgroundColor,
    borderTop: s.borderTopWidth,
    radius: s.borderTopLeftRadius,
    overflow: s.overflow,
    shadow: s.boxShadow,
    imgRadius: si ? si.borderTopLeftRadius : '—',
    // Кольори тексту — на чому саме вони лежать, дивимось нижче пробою пікселя.
    titleColor: getComputedStyle(c.querySelector('.nc-title') || c).color,
    excerptColor: (() => { const e = c.querySelector('.nc-excerpt'); return e ? getComputedStyle(e).color : '—'; })(),
  };
});

// ── 2. Контраст: текст плитки проти того, що ПІД ним ─────────────────────────
// Пробуємо піксель фону в точці тексту через elementsFromPoint: якщо у плитки
// немає власної поверхні, під літерою опиниться фото сторінки.
const under = await page.evaluate(() => {
  const t = document.querySelector('#hm-ntrack > .nc .nc-title');
  if (!t) return null;
  const r = t.getBoundingClientRect();
  const x = Math.round(r.left + 6), y = Math.round(r.top + r.height / 2);
  const chain = document.elementsFromPoint(x, y).slice(0, 6).map(n => {
    const s = getComputedStyle(n);
    return {
      el: (n.id ? '#' + n.id : (n.className || n.tagName).toString()).slice(0, 34),
      bg: s.backgroundColor,
    };
  });
  // Перша НЕпрозора поверхня під текстом — вона і є фактичним тлом літери.
  const solid = chain.find(c => c.bg && c.bg !== 'rgba(0, 0, 0, 0)' && !/^rgba\(.*,\s*0\)$/.test(c.bg));
  return { chain, solid: solid || null };
});

// ── 3. Рядок входу секції в КОЖНОМУ блоці ────────────────────────────────────
const heads = await page.evaluate(() =>
  [...document.querySelectorAll('#cm-content .hm-sec')]
    .filter(s => !s.hasAttribute('hidden'))
    .map(s => {
      const k = s.querySelector('.hm-kicker');
      const m = s.querySelector('.hm-more');
      const ks = k ? getComputedStyle(k) : null;
      const ms = m ? getComputedStyle(m) : null;
      return {
        sec: s.id || '(без id)',
        kicker: k ? k.textContent.trim() : '—',
        kFont: ks ? `${ks.fontWeight} ${ks.fontSize} ${ks.textTransform}` : '—',
        more: m ? m.textContent.trim() : '🔴 НЕМАЄ',
        mFont: ms ? `${ms.fontWeight} ${ms.fontSize} ${ms.textTransform}` : '—',
        mColor: ms ? ms.color : '—',
      };
    }));

// ── Друк ─────────────────────────────────────────────────────────────────────
console.log(`\n╔══ ЛІНІЙКА КАРТКИ НОВИНИ — «${LABEL}» ══════════════════════════\n`);

console.log('▸ ПОВЕРХНЯ ПЛИТКИ (перша картка стрічки)');
if (!tile) console.log('  🔴 плитки не знайдено (#hm-ntrack > .nc)');
else {
  console.log(`  розмір         ${tile.w}×${tile.h}px`);
  console.log(`  фон            ${tile.bg}`);
  console.log(`  обідок зверху  ${tile.borderTop}`);
  console.log(`  радіус кута    ${tile.radius}`);
  console.log(`  радіус фото    ${tile.imgRadius}`);
  console.log(`  тінь           ${tile.shadow}`);
  console.log(`  колір заголовка ${tile.titleColor}`);
  console.log(`  колір опису     ${tile.excerptColor}`);
}

console.log('\n▸ ЩО ПІД ТЕКСТОМ ЗАГОЛОВКА (шар за шаром)');
if (!under) console.log('  🔴 заголовка не знайдено');
else {
  under.chain.forEach((c, i) => console.log(`  ${i}. ${c.el.padEnd(34)} ${c.bg}`));
  console.log(`  ➡️ фактичне тло літери: ${under.solid ? under.solid.el + ' ' + under.solid.bg : '🔴 непрозорої поверхні немає — текст на фото'}`);
}

console.log('\n▸ РЯДОК ВХОДУ В КОЖНІЙ СЕКЦІЇ');
heads.forEach(h => {
  console.log(`  ${h.sec.padEnd(14)} кікер «${h.kicker}» [${h.kFont}]`);
  console.log(`  ${''.padEnd(14)} вхід  «${h.more}» [${h.mFont}] ${h.mColor}`);
});

// ── Знімки ───────────────────────────────────────────────────────────────────
const sec = await page.$('#cm-news-board');
if (sec) {
  await sec.scrollIntoViewIfNeeded();
  await page.waitForTimeout(400);
  await sec.screenshot({ path: join(SHOTS, `tile-${LABEL}-block.png`) });
  console.log(`\n📸 блок новин → tests/tools/_shots/tile-${LABEL}-block.png`);
}
const card = await page.$('#hm-ntrack > .nc');
if (card) {
  await card.screenshot({ path: join(SHOTS, `tile-${LABEL}-card.png`) });
  console.log(`📸 одна плитка → tests/tools/_shots/tile-${LABEL}-card.png`);
}

await browser.close();
await stop();
