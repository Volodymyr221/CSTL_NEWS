// Стенд: РОЗКЛАД ВИТРАТ ПО АГЕНТАХ у кабінеті.
//
// 🔴 ЗАРАДИ ЧОГО (замовлення Вови 17.09): «В нас 4 агенти. І не зрозуміло, який
// запускався — немає статистики по агентам».
//
// 🔬 Доти вкладка «Витрати AI» звалювала все в одну купу: «$2.71 · 35 запусків» —
// без жодної підказки, хто саме їх зробив. А витрачають агенти дуже по-різному:
// новинний ходить у веб-пошук (найдорожчий), свята пишуть коротко, спільноти — по
// одному допису. Сума без розкладу — як рахунок без позицій.
//
// 🔑 ЩО МІРЯЄМО: не наявність розмітки, а ЧИСЛА на екрані при відомому журналі.
// Підкидаємо `ai_spend.json`, де кожен агент витратив РІЗНУ суму, і питаємо, що
// показала сторінка. Перевірка «блок є» зеленіла б і на нулях у всіх картках.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';

const { ok, done } = reporter('admin-agents');
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, serviceWorkers: 'block' });
const p = await ctx.newPage();

const міс = new Date().toISOString().slice(0, 7);
const t = (год) => Date.now() - год * 3600e3;
const журнал = {
  runs: [
    { ts: t(1),  mission: 'Громада №1',            model: 'claude-sonnet-5', cost_usd: 0.30, found: 3, web_searches: 4, cache_read: 0, cache_write: 0, input_tokens: 0, output_tokens: 0 },
    { ts: t(2),  mission: 'Громада:dedup',         model: 'claude-sonnet-5', cost_usd: 0.03, found: 0, web_searches: 0, cache_read: 0, cache_write: 0, input_tokens: 0, output_tokens: 0 },
    { ts: t(3),  mission: 'olyka:news:ярмарок',    model: 'claude-opus-5',   cost_usd: 0.04, found: 1, web_searches: 0, cache_read: 0, cache_write: 0, input_tokens: 0, output_tokens: 0 },
    { ts: t(4),  mission: 'holiday:День міста',    model: 'claude-sonnet-5', cost_usd: 0.01, found: 1, web_searches: 0, cache_read: 0, cache_write: 0, input_tokens: 0, output_tokens: 0 },
    { ts: t(5),  mission: 'holiday:Спас',          model: 'claude-sonnet-5', cost_usd: 0.01, found: 1, web_searches: 0, cache_read: 0, cache_write: 0, input_tokens: 0, output_tokens: 0 },
  ],
  totals: { cost_usd: 0.39, runs: 5, web_searches: 4 },
  months: { [міс]: { cost_usd: 0.50, fair_usd: 0.39, runs: 5, web_searches: 4 } },
  agent_status: { стан: 'пауза', причина: 'темп випереджає бюджет', відновиться: '19.09',
                  ts: Date.now(), витрачено_міс: 0.39, стеля_міс: 3.4 },
};
await p.route('**/data/ai_spend.json*', r => r.fulfill({ status: 200,
  contentType: 'application/json', headers: { 'access-control-allow-origin': '*' },
  body: JSON.stringify(журнал) }));

await p.goto(url.replace(/\/$/, '') + '/admin.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1200);
// Малюємо вкладку напряму: вхід адміна в пісочниці не пройти.
await p.evaluate(async () => {
  const el = document.createElement('div');
  el.id = 'проба';
  document.body.appendChild(el);
  await window.renderSpend(el);
});
await p.waitForTimeout(600);

const s = await p.evaluate(() => {
  const root = document.getElementById('проба');
  const карток = [...root.querySelectorAll('.agent-card')].map(c => ({
    назва: c.querySelector('.agent-name')?.textContent.trim() || '',
    сума:  c.querySelector('.agent-sum')?.textContent.trim() || '',
    мета:  c.querySelector('.agent-meta')?.textContent.trim() || '',
    тихий: c.classList.contains('agent-card--idle'),
  }));
  return { карток, текст: root.innerText, міток: root.querySelectorAll('.spend-row-agent').length };
});

ok('🔴 показано РІВНО 4 агенти', s.карток.length === 4, `${s.карток.length} шт.`);
const знайти = ч => s.карток.find(c => c.назва.includes(ч)) || {};
ok('📰 Новини — своя сума (0.30 + 0.03 дедуп)', знайти('Новини').сума === '$0.33', знайти('Новини').сума);
ok('🏰 OLYKA CASTLE — своя сума', знайти('OLYKA').сума === '$0.04', знайти('OLYKA').сума);
ok('🎉 Свята — дві дрібні складені', знайти('Свята').сума === '$0.02', знайти('Свята').сума);
ok('📜 Історія — цього місяця не запускалась', знайти('Історія').сума === '$0.00', знайти('Історія').сума);
ok('🔑 і саме вона позначена як ТИХА (не плутається з робочими)', знайти('Історія').тихий === true);
ok('🔴 КОНТРОЛЬ: суми РІЗНІ (а не нулі чи одне й те саме число)',
   new Set(s.карток.map(c => c.сума)).size >= 3, s.карток.map(c => c.сума).join(' · '));
ok('кожен рядок журналу підписаний агентом', s.міток === 5, `${s.міток} з 5`);
ok('🔴 картка місяця показує ЧЕСНЕ число, не записане', /\$0\.39/.test(s.текст) , s.текст.slice(0, 60));
ok('…і чесно каже, що було записано інше', /було записано \$0\.50/.test(s.текст));

await b.close(); await stop();
done();
