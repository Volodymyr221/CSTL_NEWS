// ІНСТРУМЕНТ (не сторож): ЧОМУ «N НОВИХ» НЕ ГАСНЕ ПІСЛЯ ПРОЧИТАННЯ.
//
// 🗣️ Скарга Вови (31.08): «писало плюс сім нова. Я перенажимаю усі новини, читаю
// статті… закриваю додаток, заходжу і знову пише сім нових».
//
// Прилад відтворює саме цей шлях на ЖИВОМУ застосунку і друкує, ЯКИЙ КЛЮЧ
// сховища читається в кожен момент. Нічого не стверджує — лише міряє.
//
// Запуск: node tests/tools/news-badge-probe.mjs

import { chromium } from 'playwright';
import { chromiumPath, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const UID = '11111111-2222-3333-4444-555555555555';
const { url, stop } = await serve();
const ep = chromiumPath();
const b = await chromium.launch({ ...(ep ? { executablePath: ep } : {}) });
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, {}, { user: { id: UID, email: 'vova@example.com' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());

// 🔑 СІЄМО СТАН ВОВИ: мітка «бачив» місячної давнини. Без цього бейджа немає
// зовсім, і прилад міряв би порожнечу — рівно та помилка, на якій цей проєкт
// уже спіймався (перша редакція `seen-sync` світилась зеленою над чистим
// пристроєм, де «нових» не буває за побудовою).
const СТАРА = Date.now() - 30 * 24 * 3600e3;
// 🛑 СІЄМО РІВНО ОДИН РАЗ. Перша редакція приладу сіяла на КОЖНОМУ завантаженні
// сторінки — і «доводила» ваду на кроці 3, хоча насправді сама ж туди й клала
// стару мітку. Сторож-сентинель робить посів одноразовим.
await p.addInitScript(([uid, ts]) => {
  try {
    if (localStorage.getItem('__probe_seeded')) return;
    localStorage.setItem('__probe_seeded', '1');
    localStorage.setItem('cstl_news_seen_ts:' + uid, String(ts));
  } catch (_) {}
}, [UID, СТАРА]);

// 🔑 Знімок УСІХ ключів «бачив» — саме за іменами ключів і видно розбіжність.
const мітки = () => p.evaluate(() => Object.fromEntries(
  Object.keys(localStorage).filter(k => k.includes('seen'))
        .map(k => [k, localStorage.getItem(k)])));
const бейдж = () => p.evaluate(() =>
  document.querySelector('.cm-news-new')?.textContent.trim() || '—');

async function зайти(підпис) {
  await p.goto(url, { waitUntil: 'domcontentloaded' });
  await p.waitForTimeout(400);
  await p.evaluate(() => document.querySelector('.consent-ok, [data-consent-ok], .pwa-cta button')?.click());
  await p.evaluate(() => window.switchTab && window.switchTab('community'));
  await p.waitForTimeout(3000);
  console.log(`\n=== ${підпис} ===`);
  console.log('бейдж:', await бейдж());
  console.log('мітки:', await мітки());
  console.log('uid застосунку:', await p.evaluate(() => window.__uid ?? 'не виставлено'));
}

await зайти('1. ПЕРШИЙ ЗАПУСК');

// Тап по «Усі новини» — рівно те, що робить Вова.
await p.evaluate(() => document.querySelector('#cm-news-board .hm-sec-head')?.click());
await p.waitForTimeout(1200);
console.log('\n=== 2. ПІСЛЯ «УСІ НОВИНИ» ===');
console.log('хаб відкрито:', await p.evaluate(() => !!document.querySelector('.nh-screen')));
console.log('бейдж:', await бейдж());
console.log('мітки:', await мітки());

// Чи гасне бейдж, коли людина читає САМУ СТАТТЮ з віджета (вимога Вови 31.08).
await p.evaluate(() => { localStorage.removeItem('__probe_seeded'); });
await p.evaluate(([uid, ts]) => localStorage.setItem('cstl_news_seen_ts:' + uid, String(ts)),
                 [UID, Date.now() - 30 * 24 * 3600e3]);
await p.reload({ waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
console.log('\n=== 2б. ТАП ПО САМІЙ СТАТТІ У ВІДЖЕТІ ===');
console.log('бейдж ДО:', await бейдж());
await p.evaluate(() => document.querySelector('#cm-news-board [data-article-id]')?.click());
await p.waitForTimeout(1200);
console.log('стаття відкрилась:', await p.evaluate(() => !!document.querySelector('#article-modal.open, #article-modal[style*="block"], .article-modal.open')));
console.log('бейдж ПІСЛЯ:', await бейдж());

await зайти('3. ПЕРЕЗАПУСК ЗАСТОСУНКУ (те, що Вова називає «закрив і зайшов»)');

await stop(); await b.close();

// ── ЩО ЦЕЙ ПРИЛАД ПОКАЗАВ 31.08 ──────────────────────────────────────────────
// 1. У пісочниці механізм СПРАВНИЙ: «20 нових» → тап «Усі новини» → бейдж зник →
//    перезапуск → бейдж не повернувся. Скаргу Вови відтворити НЕ вдалось.
// 2. Гіпотезу «перегони входу» (бейдж малюється під міткою гостя і не
//    перемальовується після відновлення сесії) вимір СПРОСТУВАВ: ключ пишеться
//    під `uid`, ключа `:anon` не зʼявляється взагалі.
// 3. ✅ ЗАМІРЯНА СПРАВЖНЯ ВАДА: тап по САМІЙ СТАТТІ у віджеті бейдж не змінює —
//    20 нових → 20 нових. Гасить його лише відкриття хаба.
//    🔑 Корінь структурний: «бачив» це ОДНЕ ЧИСЛО (коли востаннє відкривав хаб),
//    і виразити «прочитав одну з семи» воно не вміє в принципі.
//
// 🛑 УРОК ПРО САМ ПРИЛАД. Перша редакція сіяла стару мітку через `addInitScript`,
// тобто НА КОЖНОМУ завантаженні сторінки — і «доводила» ваду на кроці 3, хоча
// сама ж її туди й клала. Сіяти стан треба РІВНО ОДИН РАЗ (сентинель нижче).
