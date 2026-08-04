// tests/tools/home-audit.mjs — ЛІНІЙКА ГОЛОВНОЇ СТОРІНКИ («Громада»).
//
// Не стенд (нічого не «падає») — інструмент виміру. Дає числа для порівняння
// «було / стало» ОДНИМ методом, щоб порівняння було чесним.
//
// 🔴 НАВІЩО ОКРЕМИЙ ФАЙЛ. Учорашній `tests/tools/community-audit.mjs` забрав відкат
// Громади 03.08 (PR #766) — числа з нього лишились у документах, а перевірити їх
// стало нічим. Цей інструмент міряє ТЕ САМЕ і тими самими одиницями, тому цифри
// з `_ai-tools/AUDIT_GROMADA_2026-08.md` лишаються порівнянними.
//
// 🔴 ЩО МІРЯЄМО — НАСЛІДОК, А НЕ ФОРМУ ЗАПИСУ (урок 27.07, шість брехливих мірок):
//   • висота блока і де він ПОЧИНАЄТЬСЯ — це те, що бачить око, а не те, що в CSS;
//   • «сторінка сама рухається» — двома знімками з паузою, а не підрахунком
//     setInterval у коді (інтервал може бути й нешкідливим, і навпаки);
//   • скролер — той, що РЕАЛЬНО прокручується (вміст вищий за вікно), а не той,
//     у кого просто написано overflow.
//
// ⚠️ `serviceWorkers: 'block'` — обовʼязково. Восьмий випадок брехливої перевірки
// (03.08): застосунок реєструє `sw.js`, і запити йдуть повз `page.route`.
// ⚠️ Заслінка розробки на localhost не діє (`core/dev-lock.js`) — обхідних ключів не треба.
//
// Запуск:  node tests/tools/home-audit.mjs [мітка]
// Знімки:  tests/tools/_shots/home-<мітка>-{first,full}.png

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import { chromiumPath, serve, ROOT } from '../_lib.mjs';

const LABEL = process.argv[2] || 'було';
const SHOTS = join(ROOT, 'tests', 'tools', '_shots');
mkdirSync(SHOTS, { recursive: true });

const VIEW_W = 390, VIEW_H = 844;
// Видима зона = екран − шапка (56) − таб-бар (57). Те саме число, яким міряли
// «фото = 76.6%» 03.08 — інакше порівняння «було/стало» було б нечесним.
const HEADER = 56, TABBAR = 57;
const VIEW = VIEW_H - HEADER - TABBAR;

const { url, stop } = await serve();
const executablePath = chromiumPath();
const browser = await chromium.launch({ ...(executablePath ? { executablePath } : {}) });
const ctx = await browser.newContext({
  viewport: { width: VIEW_W, height: VIEW_H },
  isMobile: true, hasTouch: true,
  serviceWorkers: 'block',          // ⚠️ без цього вимір бреше (урок 03.08)
});
const page = await ctx.newPage();
// Мережа назовні не потрібна: статті лежать у репозиторії. Фото Олики НЕ глушимо —
// саме вони й займають місце, яке ми міряємо.
await page.route('**://*.supabase.co/**', r => r.abort());

// 🔴 ПОГОДУ ПІДМІНЯЄМО, А НЕ ГЛУШИМО. Порожній блок погоди має ІНШУ висоту, ніж
// заповнений, — а шапка головної тепер тримає погоду, тож глушіння дало б
// заниження висоти шапки і брехливе «стало». Дані фіксовані (не з мережі), щоб
// вимір був відтворюваним: та сама температура і ті самі 7 днів щоразу.
const day = n => Array.from({ length: n }, (_, i) => {
  const d = new Date(Date.now() + i * 864e5);
  return d.toISOString().slice(0, 10);
});
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
      time: day(7),
      weather_code: [3, 1, 61, 0, 2, 3, 80],
      temperature_2m_max: [24, 26, 21, 27, 25, 23, 20],
      temperature_2m_min: [13, 14, 12, 15, 14, 13, 11],
    },
  }),
}));
// Назву міста теж підміняємо — інакше вимір чекав би Nominatim із мережі.
await page.route('**://nominatim.openstreetmap.org/**', r => r.fulfill({
  contentType: 'application/json',
  body: JSON.stringify({ address: { village: 'Олика' } }),
}));

await page.goto(url, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);
await page.evaluate(() => window.switchTab && window.switchTab('community'));
// ⚠️ 7с, а не 2.5: погода в шапці має фолбек на координати Олики через 4с (діалог
// геолокації в headless не відповідає ніколи). Знімок на 5-й секунді ловив би
// СКЕЛЕТ і занижував висоту шапки — тобто «стало» вийшло б брехливо кращим.
await page.waitForTimeout(7000);

// ── 1. Блоки: висота · частка видимої зони · де починається ──────────────────
const blocks = await page.evaluate(() => {
  const root = document.getElementById('cm-content');
  if (!root) return [];
  const base = root.getBoundingClientRect().top + (root.closest('.app-main')?.scrollTop || 0);
  // Беремо прямих «смислових» дітей: секції та іменовані контейнери.
  const nodes = [...root.querySelectorAll(':scope > header, :scope > section, :scope > div, :scope > .cm-sheet > section, :scope > .cm-sheet > header')];
  return nodes.map(n => {
    const r = n.getBoundingClientRect();
    const scrollTop = n.closest('.app-main')?.scrollTop || 0;
    return {
      name: (n.id || n.className || n.tagName).toString().slice(0, 46),
      h: Math.round(r.height),
      top: Math.round(r.top + scrollTop - base),
    };
  }).filter(b => b.h > 4);
});

// ── 2. Уся сторінка ──────────────────────────────────────────────────────────
const total = await page.evaluate(() => {
  const main = document.querySelector('.app-main');
  return main ? Math.round(main.scrollHeight) : 0;
});

// ── 3. Скролери — ті, що РЕАЛЬНО прокручуються ───────────────────────────────
const scrollers = await page.evaluate(() => {
  const root = document.getElementById('cm-content');
  if (!root) return [];
  return [...root.querySelectorAll('*')].filter(n => {
    const s = getComputedStyle(n);
    const oy = s.overflowY, ox = s.overflowX;
    const vScroll = (oy === 'auto' || oy === 'scroll') && n.scrollHeight > n.clientHeight + 1;
    const hScroll = (ox === 'auto' || ox === 'scroll') && n.scrollWidth  > n.clientWidth  + 1;
    return vScroll || hScroll;
  }).map(n => (n.className || n.tagName).toString().slice(0, 46));
});

// ── 4. «Сторінка сама рухається» — двома знімками з паузою ───────────────────
// Міряємо НАСЛІДОК: без жодного дотику робимо два знімки першого екрана з
// інтервалом 7с (довше за найдовший тік — hero 6с). Відрізняються = рухається.
const shotA = await page.screenshot();
await page.waitForTimeout(7000);
const shotB = await page.screenshot();
const moves = !shotA.equals(shotB);

// ── 5. Де починається ПЕРША реальна інформація ───────────────────────────────
// Декор (фото, привітання, назви секцій) інформацією не рахуємо — саме це й був
// діагноз №1: «перший екран не містить жодної інформації».
const firstInfo = blocks.find(b => /news|board|event|bus|weather|now|fund/i.test(b.name));

// ── Знімки ───────────────────────────────────────────────────────────────────
writeFileSync(join(SHOTS, `home-${LABEL}-first.png`), shotA);
await page.screenshot({ path: join(SHOTS, `home-${LABEL}-full.png`), fullPage: true });

// ── Звіт ─────────────────────────────────────────────────────────────────────
const pct = h => (h / VIEW * 100).toFixed(1) + '%';
console.log(`\n📏 ГОЛОВНА «${LABEL}» — ${VIEW_W}×${VIEW_H}, видима зона ${VIEW}px\n`);
console.log('Блок'.padEnd(48) + 'висота'.padStart(8) + 'частка'.padStart(9) + 'старт'.padStart(9));
console.log('─'.repeat(74));
for (const b of blocks) {
  console.log(b.name.padEnd(48) + `${b.h}px`.padStart(8) + pct(b.h).padStart(9) + `${b.top}px`.padStart(9));
}
console.log('─'.repeat(74));
console.log(`Уся сторінка:            ${total}px = ${(total / VIEW).toFixed(1)} екрана`);
console.log(`Перша інформація на:     ${firstInfo ? firstInfo.top + 'px (' + firstInfo.name + ')' : '—'}` +
            `${firstInfo && firstInfo.top > VIEW ? '  ⚠️ НИЖЧЕ ПЕРШОГО ЕКРАНА' : ''}`);
console.log(`Вкладених скролерів:     ${scrollers.length}${scrollers.length ? ' → ' + scrollers.join(', ') : ''}`);
console.log(`Сама рухається:          ${moves ? '⚠️ ТАК (два знімки за 7с різні)' : 'ні'}`);
console.log(`\nЗнімки: tests/tools/_shots/home-${LABEL}-{first,full}.png\n`);

await ctx.close();
await browser.close();
await stop();
