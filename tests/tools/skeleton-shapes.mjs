// 🔧 РАЗОВИЙ ІНСТРУМЕНТ (не стенд): зняти РЕАЛЬНУ форму карток кожної вкладки.
//
// Навіщо: Вова зняв, що кістяк завантаження бреше про форму — на Стрічці показує
// список «фото 64px ліворуч», а приїжджає карусель спільнот + велика картка з
// фото на всю ширину. Щоб зробити кістяк ЧЕСНИМ, треба знати справжню розкладку,
// а не вгадувати її по CSS: у проєкті вже двічі гадали і двічі помилялись.
//
// Запуск: node tests/tools/skeleton-shapes.mjs

import { chromium } from 'playwright';
import { launch, serve } from '../_lib.mjs';
import { mockSupabase } from '../_board-fixture.mjs';

const ВКЛАДКИ = [
  ['shotam',      'Стрічка',   '#feed-list'],
  ['discussions', 'Питання',   '#disc-content'],
  ['community',   'Громада',   '#cm-content'],
  ['board',       'Дошка',     '#board-content'],
  ['buses',       'Автобуси',  '#buses-content'],
];

const { url, stop } = await serve();
const b = await launch(chromium);
const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, isMobile: true,
                                 hasTouch: true, serviceWorkers: 'block' });
const p = await ctx.newPage();
const t0 = Date.now() - 864e5;
const пост = (i, type, extra = {}) => ({
  id: 700 + i, type, status: 'published', author: 'Олена', owner_uid: 'u-o',
  title: type === 'chat' ? null : `Оголошення номер ${i}`,
  text: 'Текст запису про життя громади, достатньо довгий щоб побачити кілька рядків.',
  location: 'Олика', tags: [], category: 'other', price: 500, currency: 'грн',
  ts: t0 + i * 6e4, created_at: new Date(t0 + i * 6e4).toISOString(),
  published_at: new Date(t0 + i * 6e4).toISOString(), ...extra,
});
await mockSupabase(p, {
  posts: [пост(1, 'board'), пост(2, 'board'), пост(3, 'chat'), пост(4, 'chat')],
  announcements: [], comments: [], reactions: [], saved_posts: [],
  pages: [
    { id: 'p1', name: 'ІСТОРІЯ ГРОМАДИ', avatar_url: null },
    { id: 'p2', name: 'OLYKA CASTLE',   avatar_url: null },
    { id: 'p3', name: 'ТУРИСТИЧНА ОЛИКА', avatar_url: null },
  ],
  page_posts: [
    { id: 'pp1', page_id: 'p3', text: 'Олика готується до осіннього сезону',
      image_urls: ['data:image/gif;base64,R0lGODlhAQABAAAAACw='],
      created_at: new Date(t0).toISOString(), published_at: new Date(t0).toISOString() },
  ],
}, {});
await p.route('**://api.open-meteo.com/**', r => r.abort());
await p.goto(url, { waitUntil: 'domcontentloaded' });
await p.waitForTimeout(3000);
await p.evaluate(() => document.querySelector('.consent-accept')?.click());
await p.waitForTimeout(600);

for (const [tab, назва, корінь] of ВКЛАДКИ) {
  await p.evaluate(t => window.switchTab?.(t), tab);
  await p.waitForTimeout(1600);
  const зріз = await p.evaluate((sel) => {
    const root = document.querySelector(sel);
    if (!root) return { нема: sel };
    // Дерево перших двох рівнів + розміри — саме те, що має повторити кістяк.
    const опис = (el, глиб = 0) => {
      if (глиб > 2) return [];
      return [...el.children].slice(0, 4).flatMap(c => {
        const r = c.getBoundingClientRect();
        if (!r.width && !r.height) return [];
        return [
          `${'  '.repeat(глиб)}${c.tagName.toLowerCase()}.${(c.className || '').toString().split(' ').slice(0, 3).join('.')} ` +
          `[${Math.round(r.width)}×${Math.round(r.height)}]`,
          ...опис(c, глиб + 1),
        ];
      });
    };
    return { корінь: sel, розмір: root.getBoundingClientRect().height, дерево: опис(root) };
  }, корінь);
  console.log(`\n══ ${назва} (${tab}) ${'═'.repeat(40)}`);
  if (зріз.нема) { console.log(`   ⚠️ кореня ${зріз.нема} немає в DOM`); continue; }
  console.log(зріз.дерево.join('\n'));
}

await ctx.close();
await stop();
await b.close();
