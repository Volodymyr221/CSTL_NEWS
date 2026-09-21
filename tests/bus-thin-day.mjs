// Стенд: «ДЖЕРЕЛО ПОКАЗУЄ МАЛО РЕЙСІВ» (21.09.2026).
//
// 🔬 ЗАРАДИ ЧОГО, З ЖИВОГО ВИПАДКУ. 21.09 у VOPAS на цю дату стояв РІВНО ОДИН
// рейс при 24 на наступний день. Парсер спрацював точно, а застосунок написав
// «СЬОГОДНІ РЕЙСІВ БІЛЬШЕ НЕ ЗАПЛАНОВАНО» — тобто видав «ми не знаємо» за
// «рейсів немає». Людина читає це і не йде на зупинку.
//
// 🔑 ЩО СТЕРЕЖЕМО — ОБИДВА БОКИ, і другий важливіший:
//   • тонкий день — рядок Є;
//   • звичайний день — рядка НЕМА. Попередження, що висить завжди, це шум, і
//     через місяць його перестають бачити разом зі справжніми.
import { chromium } from 'playwright';
import { launch, serve, reporter, projectFile } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const REV = process.env.BUNDLE_REV || '';

const рейс = (i, час) => ({
  id: `r${i}`, name: `Луцьк Олика`, carrier: 'c1', bus: 'БАЗ',
  days: 'щодня', status: 'scheduled', departure_time: час, arrival_time: час,
  duration_min: 40, stops: [{ name: 'Олика', km: 0 }],
});

// Сцена: сьогодні — скільки скажемо, завтра — 24.
async function сцена({ сьогодні }) {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                   hasTouch: true, serviceWorkers: 'block' });
  const p = await ctx.newPage();
  if (REV) {
    const old = projectFile('bundle.js', REV);
    await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
  }
  const дн = new Date();
  const iso = (зсув) => {
    const d = new Date(дн); d.setDate(d.getDate() + зсув);
    return d.toISOString().slice(0, 10);
  };
  const розклад = {
    version: 1, source: 'VOPAS — vopas.com.ua', updatedAt: '21.09.2026', updatedTime: '04:25',
    carriers: { c1: { name: 'Перевізник', phone: '' } },
    days: {
      [iso(-1)]: { routes: Array.from({ length: 24 }, (_, i) => рейс(i, '08:00')), fetchedAt: '', fetchedTime: '09:00' },
      [iso(0)]:  { routes: Array.from({ length: сьогодні }, (_, i) => рейс(100 + i, '23:50')), fetchedAt: '', fetchedTime: '09:00' },
      [iso(1)]:  { routes: Array.from({ length: 24 }, (_, i) => рейс(200 + i, '08:00')), fetchedAt: '', fetchedTime: '09:00' },
    },
  };
  await p.route('**/data/schedule.json*', r => r.fulfill({
    contentType: 'application/json', body: JSON.stringify(розклад) }));
  await mockSupabase(p, { posts: [], announcements: [], profiles: [] }, {});
  await p.route('**://api.open-meteo.com/**', r => r.abort());
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(2600);
  await p.evaluate(() => document.querySelector('.consent-accept')?.click());
  await p.evaluate(() => window.switchTab?.('buses'));
  await p.waitForTimeout(1400);
  return { ctx, p };
}

const рядок = (p) => p.evaluate(() => {
  const el = document.querySelector('.bus-list-thin');
  if (!el) return null;
  const a = el.querySelector('a');
  return { текст: el.textContent.replace(/\s+/g, ' ').trim(),
           посилання: a ? a.getAttribute('href') : null,
           словом: a ? a.textContent.trim() : null };
});

const { url, stop } = await serve();
const b = await launch(chromium);

// ── 1. 🔴 ТОНКИЙ ДЕНЬ — РЯДОК Є І КАЖЕ ЧИСЛО ТА ДАТУ ──────────────────────
{
  const { ctx, p } = await сцена({ сьогодні: 1 });
  const r = await рядок(p);
  ok('🔴 при одному рейсі проти 24 рядок показано', !!r, JSON.stringify(r));
  ok('🔑 у ньому є число рейсів і дата',
     !!r && /Джерело показує 1 рейс на \d{2}\.\d{2}\.\d{4}/.test(r.текст), r?.текст);
  // 🛑 Посилання СЛОВОМ, не голою адресою — пряма вимога Вови і той самий
  // прийом, що в підвалі екрана.
  ok('🛑 посилання — словом «VOPAS», а не адресою',
     !!r && r.словом === 'VOPAS' && /vopas\.com\.ua/.test(r.посилання || ''),
     `${r?.словом} → ${r?.посилання}`);
  await ctx.close();
}

// ── 2. 🛑 ЗВИЧАЙНИЙ ДЕНЬ — РЯДКА НЕМА ─────────────────────────────────────
//
// Зустрічна межа. Без неї перевірка вище зеленіла б і над рядком, що висить
// завжди, — тобто над шумом.
{
  const { ctx, p } = await сцена({ сьогодні: 20 });
  const r = await рядок(p);
  ok('🛑 при 20 рейсах проти 24 рядка НЕМАЄ', r === null, JSON.stringify(r));
  await ctx.close();
}

// ── 3. 📐 МЕЖА ТРЕТИНИ ─────────────────────────────────────────────────────
{
  const { ctx, p } = await сцена({ сьогодні: 7 });   // 7 < 24/3 = 8 → показуємо
  const нижче = await рядок(p);
  await ctx.close();
  const { ctx: c2, p: p2 } = await сцена({ сьогодні: 9 });  // 9 > 8 → мовчимо
  const вище = await рядок(p2);
  await c2.close();
  ok('📐 нижче третини — кажемо, вище — мовчимо',
     !!нижче && вище === null, `7 → ${нижче ? 'є' : 'нема'} · 9 → ${вище ? 'є' : 'нема'}`);
}

await stop();
await b.close();
done();
