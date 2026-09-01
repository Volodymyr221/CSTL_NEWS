// Стенд: БЕЙДЖ «N НОВИХ» НАЗИВАЄ СВІЙ РОЗДІЛ.
//
// 🗣️ Скарга Вови (01.09): «вчора прочитав 8 нових статей, сьогодні зранку
// заходжу, нові не зʼявились, а пише так само 8 нових, це фігня якась».
//
// 🔬 ЩО ПОКАЗАВ ЗАМІР (`tests/tools/news-badge-geo-probe.mjs`) — памʼять
// лічильника ЦІЛА: мітка «бачив» переживає перезахід. Вада була в іншому:
// число рахує ЛИШЕ «Громаду», а віджет — карусель, де підпис «НОВИНИ · ___»
// гортається разом із картками. Людина стоїть на ВОЛИНІ, читає вісім статей
// Волині, і число не рухається, бо воно ніколи й не було про Волинь.
// Заміряно: читання на Громаді 20 → 17, читання на Волині 17 → 17.
//
// 🛑 ЧОМУ НЕ «ХОВАТИ БЕЙДЖ ПОЗА ГРОМАДОЮ». Карусель гортається САМА, тож бейдж
// блимав би без дії людини — той клас автоматичного руху, який прибирали
// аудитом 03.08. Тому число носить розділ із собою.
//
// ⚠️ ЦЕЙ СТЕНД СТЕРЕЖЕ ТРИ РЕЧІ ОДРАЗУ, і третя — не косметика:
//   1. бейдж називає розділ (інакше повертається та сама неправда);
//   2. читання статті Громади число гасить;
//   3. шапка НЕ переноситься на другий рядок — повна форма «N нових у Громаді»
//      давала 323px при доступних 322 і ламала розкладку. Без цієї перевірки
//      наступне подовження тексту зламало б шапку мовчки.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const UID = '11111111-2222-3333-4444-555555555555';
const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
const errs = [];
p.on('pageerror', e => errs.push(String(e)));
await mockSupabase(p, {}, { user: { id: UID, email: 'vova@example.com' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());

// Мітка «бачив» місячної давнини — без неї «нових» не буває за побудовою, і
// стенд міряв би порожнечу (на цьому вже спіймався прилад 31.08).
await p.addInitScript(([uid, ts]) => {
  try { localStorage.setItem('cstl_news_seen_ts:' + uid, String(ts)); } catch (_) {}
}, [UID, Date.now() - 30 * 24 * 3600e3]);

await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.evaluate(() => window.switchTab && window.switchTab('community'));
await p.waitForSelector('#cm-news-board .cm-news-new', { timeout: 15000 });
await p.waitForTimeout(800);

const текст = () => p.evaluate(() =>
  document.querySelector('.cm-news-new')?.textContent.trim() || '');
const число = async () => parseInt((await текст()).match(/\d+/)?.[0] || '0', 10);

// ── 1. Бейдж називає свій розділ ────────────────────────────────────────────
const t = await текст();
ok('🔴 бейдж називає розділ «Громада»', /Громаді/.test(t), `«${t}»`);
ok('бейдж показує число', /\d/.test(t), `«${t}»`);

// Повне формулювання лишилось для читача екрана.
const aria = await p.evaluate(() =>
  document.querySelector('.cm-news-new')?.getAttribute('aria-label') || '');
ok('читач екрана дістає повну форму зі словом «нових»',
   /нов/.test(aria) && /Громад/.test(aria), `«${aria}»`);

// ── 2. Шапка не розсипається (заміряна межа) ────────────────────────────────
const шапка = await p.evaluate(() => {
  const head = document.querySelector('#cm-news-board .hm-sec-head');
  const el = id => head.querySelector(id);
  const w = e => (e ? e.getBoundingClientRect().width : 0);
  // Найгірший випадок: найдовша назва розділу в підписі.
  const cat = document.getElementById('hm-ncat');
  if (cat) cat.textContent = 'Громада';
  return {
    висота: Math.round(head.getBoundingClientRect().height),
    сума: Math.round(w(el('.hm-kicker')) + w(el('.cm-news-new')) + w(el('.hm-more'))),
    доступно: Math.round(head.getBoundingClientRect().width),
    вилазить: [...head.children].some(e => e.getBoundingClientRect().right > window.innerWidth + 1),
  };
});
ok('🔴 шапка в ОДИН рядок (не вище 32px)', шапка.висота <= 32, `${шапка.висота}px`);
ok('вміст шапки влазить у ширину', шапка.сума <= шапка.доступно,
   `${шапка.сума} з ${шапка.доступно}px`);
ok('нічого не вилазить за екран', !шапка.вилазить);

// ── 3. Читання статті ГРОМАДИ гасить число ──────────────────────────────────
// Віджет відкривається на Громаді; беремо картку зі сторінки, що у вікні.
const було = await число();
const відкрив = await p.evaluate(() => {
  const pages = [...document.querySelectorAll('#cm-news-content .hm-npage')];
  let best = pages[0], bd = Infinity;
  for (const pg of pages) {
    const d = Math.abs(pg.getBoundingClientRect().left);
    if (d < bd) { bd = d; best = pg; }
  }
  const card = best?.querySelector('[data-article-id]');
  if (!card) return false;
  card.click();
  return true;
});
await p.waitForTimeout(500);
await p.evaluate(() => document.querySelector('#article-modal .nh-back, [data-ad-close]')?.click());
await p.waitForTimeout(400);
const стало = await число();
ok('картка новини відкрилась', відкрив);
ok('🔴 прочитана стаття Громади ЗМЕНШУЄ число', стало === було - 1,
   `${було} → ${стало}`);

ok('помилок у консолі нема', errs.length === 0, errs.slice(0, 2).join(' | '));

await b.close();
await stop();
done();
