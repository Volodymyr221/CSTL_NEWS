// tests/tools/apple-a11y-diag.mjs — ХТО САМЕ реагує на `prefers-reduced-motion`.
//
// Навіщо окремий інструмент. `apple-audit.mjs` каже ЛИШЕ число: «Δ15 вузлів
// змінились». Але у стилях проєкту правил `prefers-reduced-motion` всього три і
// всі вузькі (капсули Громади · скелет хабу новин · тремтіння заслінки), а Δ15
// стабільно зʼявляється навіть на Дошці й Автобусах, де таких правил немає.
// Число без імен тут нічого не доводить — треба побачити самі вузли, інакше у
// звіті зʼявиться здогадка замість факту.
//
// Запуск: node tests/tools/apple-a11y-diag.mjs [вкладка]

import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const ВКЛАДКА = process.argv[2] || 'shotam';
const ME = { id: 'u-me', email: 'me@example.com', user_metadata: { name: 'Вова' } };

// Ключ стабільний: імʼя вузла + порядковий номер серед однойменних. Порівняння
// за індексом у DOM тут не працює — розмітка між знімками живе, один доданий
// вузол зсуває всі наступні і дає десятки фальшивих «змін».
const ЗНІМОК = () => {
  const мапа = {}; const лічильник = {};
  for (const el of [...document.querySelectorAll('body *')].slice(0, 1500)) {
    const s = getComputedStyle(el);
    const cls = (el.className && typeof el.className === 'string')
      ? '.' + el.className.trim().split(/\s+/).slice(0, 2).join('.') : '';
    const базове = el.tagName.toLowerCase() + (el.id ? '#' + el.id : '') + cls;
    лічильник[базове] = (лічильник[базове] || 0) + 1;
    мапа[`${базове}#${лічильник[базове]}`] = [s.transitionDuration, s.animationDuration,
      s.animationName, s.scrollBehavior, s.transitionProperty].join(' | ');
  }
  return мапа;
};

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], threads: [], messages: [], thread_user_state: [], announcements: [] },
  { user: ME, profiles: [{ uid: 'u-me', name: 'Вова', avatar_url: '' }] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(1800);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(300);
await p.evaluate(t => window.switchTab && window.switchTab(t), ВКЛАДКА);
await p.waitForTimeout(1500);

const до = await p.evaluate(ЗНІМОК);
// Шум: той самий стан двічі, без жодної зміни налаштувань.
await p.waitForTimeout(400);
const шумЗнімок = await p.evaluate(ЗНІМОК);
const шумні = new Set(Object.keys(до).filter(k => k in шумЗнімок && до[k] !== шумЗнімок[k]));

await p.emulateMedia({ reducedMotion: 'reduce' });
await p.waitForTimeout(400);
const після = await p.evaluate(ЗНІМОК);

const змінені = [];
for (const k of Object.keys(до)) {
  if (!(k in після) || до[k] === після[k] || шумні.has(k)) continue;
  змінені.push({ ключ: k, було: до[k], стало: після[k] });
}

console.log(`Вкладка «${ВКЛАДКА}» · вузлів ${Object.keys(до).length} · шумних ${шумні.size}`);
console.log(`Реагують на prefers-reduced-motion: ${змінені.length}\n`);
for (const з of змінені.slice(0, 20)) {
  console.log(`  ${з.ключ}`);
  console.log(`     було:  ${з.було}`);
  console.log(`     стало: ${з.стало}`);
}
await ctx.close(); await b.close(); await stop();
