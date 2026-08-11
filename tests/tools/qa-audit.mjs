// tests/tools/qa-audit.mjs — ПРИЛАД: чесний обмір вкладки «Питання».
//
// Не оцінка «подобається/не подобається», а числа, які можна покласти поруч ДО і ПІСЛЯ:
// скільки екрана з'їдає шапка · де починається перша реальна інформація · скільки
// на екрані ліній і рамок · скільки різних кольорів тексту · контрасти · тап-цілі.
//
// Запуск:  node tests/tools/qa-audit.mjs            (поточний код)
//          BUNDLE_REV=<git-ish> CSS_REV=<git-ish> node tests/tools/qa-audit.mjs   (стара версія)

import { chromium } from 'playwright';
import { launch, serve, projectFile } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const BUNDLE_REV = process.env.BUNDLE_REV || '';
const CSS_REV    = process.env.CSS_REV    || '';
const SHOT       = process.env.SHOT       || '';

const t0 = Date.now() - 5 * 864e5;
const POSTS = [
  { id: 701, type: 'chat', text: 'Коли буде концерт на День міста?', author: 'Олена',
    owner_uid: 'u-olena', status: 'published', tags: [], ts: t0,
    created_at: new Date(t0).toISOString(), published_at: new Date(t0).toISOString() },
  { id: 702, type: 'chat', text: 'Хтось знає, коли ремонтуватимуть дорогу в Митильному?',
    author: 'Петро', owner_uid: 'u-petro', status: 'published', tags: [], ts: t0 + 6e4,
    created_at: new Date(t0 + 6e4).toISOString(), published_at: new Date(t0 + 6e4).toISOString() },
  { id: 703, type: 'chat', text: 'Чи працює сьогодні амбулаторія?', author: 'Марія',
    owner_uid: 'u-maria', status: 'published', tags: [], ts: t0 + 12e4,
    created_at: new Date(t0 + 12e4).toISOString(), published_at: new Date(t0 + 12e4).toISOString() },
];
const COMMENTS = [
  { id: 5001, post_id: 701, author: 'Віктор', text: 'Начебто 24 серпня, біля будинку культури.',
    sender_uid: 'u-viktor', reply_to_id: null, created_at: new Date(t0 + 36e5).toISOString(),
    edited_at: null, deleted_at: null, client_tag: null },
  { id: 5002, post_id: 701, author: 'Марія', text: 'Так, підтверджую — бачила афішу на дошці.',
    sender_uid: 'u-maria', reply_to_id: 5001, created_at: new Date(t0 + 40e5).toISOString(),
    edited_at: null, deleted_at: null, client_tag: null },
  { id: 5003, post_id: 703, author: 'Ігор', text: 'Працює до 14:00, реєстратура з 8.',
    sender_uid: 'u-igor', reply_to_id: null, created_at: new Date(Date.now() - 36e5).toISOString(),
    edited_at: null, deleted_at: null, client_tag: null },
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block', deviceScaleFactor: 2 });
const p = await ctx.newPage();
if (BUNDLE_REV) {
  const old = projectFile('bundle.js', BUNDLE_REV);
  await p.route('**/bundle.js', r => r.fulfill({ contentType: 'application/javascript', body: old }));
}
if (CSS_REV) {
  const old = projectFile('style/board.css', CSS_REV);
  await p.route('**/style/board.css', r => r.fulfill({ contentType: 'text/css', body: old }));
}
await mockSupabase(p, { posts: POSTS, comments: COMMENTS, announcements: [] },
                  { user: { id: 'u-me', name: 'Я' } });
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(2500);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(300);
await p.evaluate(() => window.switchTab && window.switchTab('discussions'));
await p.waitForTimeout(1600);

const метрики = await p.evaluate(() => {
  const H = window.innerHeight;
  // 🔴 ВИДИМІСТЬ, а не просто «є в DOM». Перша редакція приладу цього не робила і
  // нарахувала 28 ліній, з яких УСІ лежали в ЗАКРИТОМУ меню FAB — тобто число
  // описувало те, чого людина не бачить. Класична для цього проєкту помилка:
  // міряти зручне замість того, що побачить Вова.
  const видно = (el) => {
    let n = el;
    while (n && n.nodeType === 1) {
      const s = getComputedStyle(n);
      if (s.display === 'none' || s.visibility === 'hidden' || parseFloat(s.opacity) === 0) return false;
      if (n.hasAttribute && n.hasAttribute('hidden')) return false;
      n = n.parentElement;
    }
    return true;
  };
  const root = document.getElementById('disc-content');
  const перша = document.querySelector('#disc-content [data-question-open]');
  const шапка = root?.querySelector('.qa-hero, .bd-controls');
  const rect = e => e ? e.getBoundingClientRect() : null;

  // Скільки ЛІНІЙ (рамок і роздільників) видно у першому екрані — головна ознака
  // «важкої» верстки: Apple будує ієрархію простором і типографікою, не лініями.
  let ліній = 0;
  const рамки = [];
  for (const el of document.querySelectorAll('#disc-content *')) {
    const r = el.getBoundingClientRect();
    if (r.top > H || r.bottom < 0 || r.width < 2) continue;
    if (!видно(el)) continue;
    const s = getComputedStyle(el);
    for (const side of ['Top','Right','Bottom','Left']) {
      const w = parseFloat(s['border' + side + 'Width']);
      const c = s['border' + side + 'Color'];
      if (w > 0 && c !== 'rgba(0, 0, 0, 0)' && s.borderStyle !== 'none') {
        ліній++; рамки.push(el.className.split(' ')[0] + '/' + side.toLowerCase());
      }
    }
  }

  // Скільки РІЗНИХ кольорів тексту — розкид палітри в межах одного екрана.
  const кольори = new Set();
  for (const el of document.querySelectorAll('#disc-content *')) {
    const r = el.getBoundingClientRect();
    if (r.top > H || r.bottom < 0) continue;
    if (!видно(el)) continue;
    if (!el.childNodes.length) continue;
    const має = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (має) кольори.add(getComputedStyle(el).color);
  }

  // Тап-цілі менші за 44px (Apple HIG) серед видимих інтерактивних елементів.
  const дрібні = [];
  for (const el of document.querySelectorAll('#disc-content button, #disc-content a, #disc-content input')) {
    const r = el.getBoundingClientRect();
    if (r.top > H || r.bottom < 0 || !r.width) continue;
    if (!видно(el)) continue;
    if (r.height < 44) дрібні.push(`${el.className.split(' ')[0]} ${Math.round(r.height)}px`);
  }

  // Найдрібніший текст на екрані — межа читабельності для 40-70+.
  let мін = 99, мінДе = '';
  for (const el of document.querySelectorAll('#disc-content *')) {
    const r = el.getBoundingClientRect();
    if (r.top > H || r.bottom < 0) continue;
    if (!видно(el)) continue;
    const має = [...el.childNodes].some(n => n.nodeType === 3 && n.textContent.trim());
    if (!має) continue;
    const fs = parseFloat(getComputedStyle(el).fontSize);
    if (fs < мін) { мін = fs; мінДе = el.className.split(' ')[0]; }
  }

  const rКартка = rect(перша);
  return {
    екран: H,
    шапкаВисота: шапка ? Math.round(rect(шапка).height) : null,
    першаКарткаВід: rКартка ? Math.round(rКартка.top) : null,
    відсотокДоІнформації: rКартка ? Math.round(rКартка.top / H * 100) : null,
    карткаВисота: rКартка ? Math.round(rКартка.height) : null,
    карток: document.querySelectorAll('#disc-content [data-question-open]').length,
    карток_видно: [...document.querySelectorAll('#disc-content [data-question-open]')]
      .filter(e => e.getBoundingClientRect().top < H).length,
    ліній, рамки: рамки.slice(0, 14),
    кольорівТексту: кольори.size, кольори: [...кольори],
    дрібніЦілі: дрібні,
    найдрібнішийТекст: `${мін}px (${мінДе})`,
  };
});

console.log('══════ ВКЛАДКА «ПИТАННЯ» — ОБМІР ══════');
console.log(`екран ${метрики.екран}px`);
console.log(`шапка: ${метрики.шапкаВисота}px`);
console.log(`перша картка починається на: ${метрики.першаКарткаВід}px = ${метрики.відсотокДоІнформації}% екрана`);
console.log(`висота картки: ${метрики.карткаВисота}px · видно карток: ${метрики.карток_видно} з ${метрики.карток}`);
console.log(`ЛІНІЙ і рамок у першому екрані: ${метрики.ліній}`);
console.log('  ' + метрики.рамки.join(' · '));
console.log(`різних кольорів тексту: ${метрики.кольорівТексту}`);
метрики.кольори.forEach(c => console.log('  ' + c));
console.log(`тап-цілі < 44px: ${метрики.дрібніЦілі.length ? метрики.дрібніЦілі.join(' · ') : 'немає'}`);
console.log(`найдрібніший текст: ${метрики.найдрібнішийТекст}`);

if (SHOT) {
  await p.screenshot({ path: SHOT });
  await p.evaluate(() => document.querySelector('[data-question-open="701"]')?.click());
  await p.waitForTimeout(900);
  await p.screenshot({ path: SHOT.replace('.png', '-question.png') });
  console.log('знімки:', SHOT);
}

await stop();
await b.close();
