// tests/tools/css-snapshot.mjs — ЗЛІПОК ОБЧИСЛЕНИХ СТИЛІВ (доказ «нічого не змінилось»).
//
// Навіщо: перед розділенням `style/community.css` на два файли треба довести, що
// каскад не поїхав. Аналіз селекторів показав 0 конфліктів, але аналіз — це
// припущення; зліпок — наслідок. Знімаємо ДО зміни, знімаємо ПІСЛЯ, порівнюємо.
//
// Запуск: `node tests/tools/css-snapshot.mjs до` → пише у _shots/css-до.json
//         `node tests/tools/css-snapshot.mjs після` → і порівнює з «до».
//
// ⚠️ Міряємо ОБЧИСЛЕНІ стилі живих екранів, а не текст CSS: саме обчислений
// стиль — це те, що бачить людина, і саме він показав би зсув каскаду.
import { chromium } from 'playwright';
import { launch, serve, ROOT } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';

const TAG = process.argv[2] || 'до';
const OUT = join(ROOT, 'tests/tools/_shots', `css-${TAG}.json`);

const POSTS = [
  { id: 1, type: 'board', category: 'Продам', text: 'Продам корову. Тільна, три роки.',
    author: 'Тест', location: 'Олика', contact: '+380000000000', status: 'published', ts: Date.now() },
  { id: 2, type: 'board', category: 'Куплю', text: 'Куплю старі книги до 1960 року.',
    author: 'Тест', location: 'Олика', status: 'published', ts: Date.now() },
];

const { url, stop } = await serve();
const b = await launch(chromium);
const p = await b.newPage({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
await mockSupabase(p, { posts: POSTS, announcements: [] });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2000);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(200);

const snap = {};
for (const tab of ['board', 'community']) {
  await p.evaluate(t => window.switchTab && window.switchTab(t), tab);
  await p.waitForTimeout(2200);
  await p.evaluate(() => document.querySelector('.brules-ok')?.click());
  await p.waitForTimeout(800);
  snap[tab] = await p.evaluate(() => {
    // Беремо КОЖЕН елемент, чий клас належить зонам Дошки або Громади, і
    // фіксуємо властивості, які найпершими їдуть при зсуві каскаду.
    const PROPS = ['background-color', 'color', 'border-top-width', 'border-top-color',
                   'border-radius', 'font-size', 'font-weight', 'padding-top', 'padding-left',
                   'margin-top', 'display', 'position', 'width', 'height', 'box-shadow'];
    const out = {};
    for (const el of document.querySelectorAll('[class]')) {
      const cls = (el.className || '').toString();
      if (!/bd-|cm-board|board-|bm-|cm-ad-|cm-|hm-/.test(cls)) continue;
      const r = el.getBoundingClientRect();
      if (!r.width && !r.height) continue;          // невидиме не міряємо
      const cs = getComputedStyle(el);
      const k = cls.trim().split(/\s+/).join('.') + '@' + Math.round(r.top) + 'x' + Math.round(r.left);
      if (out[k]) continue;
      out[k] = PROPS.map(pr => cs.getPropertyValue(pr)).join('|');
    }
    return out;
  });
}

writeFileSync(OUT, JSON.stringify(snap, null, 1));
const total = Object.values(snap).reduce((n, o) => n + Object.keys(o).length, 0);
console.log(`📸 ${TAG}: заміряно ${total} елементів → ${OUT}`);

if (TAG !== 'до') {
  const before = join(ROOT, 'tests/tools/_shots', 'css-до.json');
  if (!existsSync(before)) { console.log('немає зліпка «до» — порівняти нема з чим'); }
  else {
    const A = JSON.parse(readFileSync(before, 'utf8'));
    let diff = 0, only = 0, shown = 0;
    for (const tab of Object.keys(snap)) {
      const a = A[tab] || {}, c = snap[tab];
      for (const k of new Set([...Object.keys(a), ...Object.keys(c)])) {
        if (!(k in a) || !(k in c)) { only++; continue; }
        if (a[k] !== c[k]) {
          diff++;
          if (shown++ < 10) console.log(`  ≠ ${tab} ${k}\n     було: ${a[k]}\n     стало: ${c[k]}`);
        }
      }
    }
    console.log(`\n🔴 РОЗБІЖНОСТЕЙ СТИЛЮ: ${diff} · елементів лише в одному зліпку: ${only}`);
    console.log(diff === 0 ? '✅ каскад не поїхав' : '❌ каскад змінився — розділення НЕ безпечне');
  }
}
await b.close(); await stop();
