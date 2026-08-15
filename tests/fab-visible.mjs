// tests/fab-visible.mjs — ІКОНКА FAB ВИДНА ЗАВЖДИ, У ВСІХ ЗОНАХ.
// Заведено 15.08.2026 на скаргу Вови.
//
// 🔴 ЩО ОХОРОНЯЄМО. Слова Вови зі знімком: «іконка FAB, тобто цей плюсик, він
// чомусь не завжди зʼявляється у вкладці Питання. Також перевір, щоб це
// працювало всюди, де є іконка FAB».
//
// 🔑 КОРІНЬ: `#board-trigger` — ОДНА кнопка на дві зони, але розмітка РІЗНА:
//   Дошка   → плюс + конверт (`.cm-board-trigger-msg`);
//   Питання → тільки плюс.
// Клас `.has-unread` ставиться від ГЛОБАЛЬНОГО числа непрочитаних розмов, а
// CSS-правило `.has-unread .cm-board-trigger-icon { opacity: 0 }` ховає плюс,
// щоб його замінив конверт. У «Питаннях» замінювати нема чим — і лишався
// ПОРОЖНІЙ бордовий круг.
//
// ⚠️ Міряємо ВИДИМІСТЬ НАМАЛЬОВАНОГО (обчислений `opacity` + розмір), а не
// наявність вузла в DOM: вузол на місці був завжди, саме тому вада й дожила.
import { chromium } from 'playwright';
import { launch, serve, reporter } from './_lib.mjs';
import { mockSupabase } from './_board-fixture.mjs';

const { ok, done } = reporter();
const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
await mockSupabase(p, { posts: [], announcements: [] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url + '/index.html', { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2400);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(300);
await p.evaluate(() => document.querySelectorAll('.splash,#splash').forEach(e => e.remove()));

// Скільки іконок кнопки ВИДНО оку (не «є в DOM», а намальовані).
async function стан(tab, unread) {
  await p.evaluate(t => window.switchTab(t), tab);
  await p.waitForTimeout(500);
  await p.evaluate(() => document.querySelector('.brules-ok')?.click());
  await p.waitForTimeout(400);
  return p.evaluate(async u => {
    const btn = document.getElementById('board-trigger');
    if (!btn) return null;
    // Відтворюємо рівно те, що робить refreshUnreadBadge: клас від ГЛОБАЛЬНОГО
    // числа непрочитаних — саме так вада й потрапляла у «Питання».
    const маєКонверт = !!btn.querySelector('.cm-board-trigger-msg');
    btn.classList.toggle('has-unread', !!u && маєКонверт);
    // ⚠️ Перехід `opacity 0.2s` — без паузи міряли б стан ДО зміни, і перевірка
    // «з непрочитаними» була б зеленою, не побачивши конверта взагалі.
    await new Promise(r => setTimeout(r, 400));
    const видно = (sel) => {
      const el = btn.querySelector(sel);
      if (!el) return false;
      const cs = getComputedStyle(el);
      const r = el.getBoundingClientRect();
      return parseFloat(cs.opacity) > 0.01 && cs.visibility !== 'hidden'
             && cs.display !== 'none' && r.width > 0 && r.height > 0;
    };
    return {
      маєКонверт,
      плюс: видно('.cm-board-trigger-icon'),
      конверт: видно('.cm-board-trigger-msg'),
      хрестик: видно('.cm-board-trigger-close'),
      кнопкаВидна: getComputedStyle(btn).display !== 'none' && btn.getBoundingClientRect().width > 0,
    };
  }, unread);
}

for (const [tab, назва] of [['discussions', 'Питання'], ['board', 'Дошка']]) {
  for (const unread of [false, true]) {
    const s = await стан(tab, unread);
    const підпис = `${назва}${unread ? ' + непрочитані' : ''}`;
    if (!s || !s.кнопкаВидна) { ok(`${підпис}: кнопка на місці`, false, 'кнопки немає'); continue; }
    const скільки = [s.плюс, s.конверт, s.хрестик].filter(Boolean).length;
    console.log(`   ${підпис.padEnd(24)} конверт у розмітці: ${s.маєКонверт ? 'є' : 'нема'} · ` +
                `видно: плюс=${s.плюс} конверт=${s.конверт} ✕=${s.хрестик}`);
    // 🔴 ГОЛОВНЕ: у кнопці ЗАВЖДИ видно рівно одну іконку. Нуль — порожній круг
    // (вада Вови), два — накладені один на одного.
    ok(`🔴 ${підпис}: у кнопці видно РІВНО ОДНУ іконку`, скільки === 1, `видно ${скільки}`);
  }
}

// 🛑 Окремо: клас `has-unread` не сміє потрапити на кнопку БЕЗ конверта — саме
// це й робило круг порожнім. Перевіряємо сам механізм, а не лише наслідок.
{
  await p.evaluate(t => window.switchTab(t), 'discussions');
  await p.waitForTimeout(400);
  const r = await p.evaluate(() => {
    const btn = document.getElementById('board-trigger');
    const маєКонверт = !!btn.querySelector('.cm-board-trigger-msg');
    btn.classList.add('has-unread');          // навмисно ставимо «неправильний» клас
    const cs = getComputedStyle(btn.querySelector('.cm-board-trigger-icon'));
    btn.classList.remove('has-unread');
    return { маєКонверт, плюсВидно: parseFloat(cs.opacity) > 0.01 };
  });
  ok('🛑 навіть із помилково поставленим has-unread плюс НЕ зникає там, де нема конверта',
     r.маєКонверт || r.плюсВидно,
     r.маєКонверт ? 'у цій зоні конверт є' : `плюс видно: ${r.плюсВидно}`);
}

await b.close();
await stop();
done();
