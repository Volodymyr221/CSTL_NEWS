// Стенд №13: ЗАКРІПЛЕННЯ ПОСТА ВСЕРЕДИНІ СПІЛЬНОТИ.
// Вова 27.07: «адмін якоїсь спільноти може закріпляти тільки в себе на спільноті,
// а не в головній стрічці». Ліміт — до 3.
//
// ⚠️ Ганяємо СПРАВЖНІЙ код: `orderPinned` витягується прямо з src/tabs/feed.js.
import { readFileSync } from 'fs';
import { projectFile } from './_lib.mjs';
const SRC = projectFile('src/tabs/feed.js');

const from = SRC.indexOf('const MAX_PINNED');
const to   = SRC.indexOf('function screenListHtml');
if (from < 0 || to < 0) { console.log('❌ не знайшов блок закріплення'); process.exit(1); }
const { orderPinned, MAX_PINNED } =
  new Function(SRC.slice(from, to) + '\nreturn { orderPinned, MAX_PINNED };')();

const res = []; const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };
const P = (id, page, pinned = null) => ({ id, page_id: page, pinned_at: pinned });
const ids = l => l.map(p => p.id).join(',');

// Пости однієї сторінки, як їх віддає база — за датою, свіжіші першими.
const feed = [P(5, 1), P(4, 1), P(3, 1, '2026-07-27T10:00:00Z'), P(2, 1), P(1, 1, '2026-07-27T12:00:00Z')];

ok('закріплені піднімаються вгору', ids(orderPinned(feed)).startsWith('1,3'), ids(orderPinned(feed)));
ok('серед закріплених свіжіше закріплення вище', ids(orderPinned(feed)).startsWith('1,3'),
   'очікуємо 1 (12:00) перед 3 (10:00)');
ok('решта зберігає свій порядок за датою', ids(orderPinned(feed)).endsWith('5,4,2'), ids(orderPinned(feed)));
ok('жоден пост не загубився і не задвоївся',
   orderPinned(feed).length === feed.length && new Set(orderPinned(feed).map(p => p.id)).size === feed.length,
   `${orderPinned(feed).length} з ${feed.length}`);

// 🔑 ГОЛОВНЕ: вхідний масив НЕ мутується. `posts` — спільний стан, і саме його порядок
// малює ГОЛОВНУ стрічку. Якби `orderPinned` сортував на місці, закріплення в спільноті
// мовчки переставило б головну стрічку — рівно те, чого Вова просив не робити.
const before = ids(feed);
orderPinned(feed);
ok('вхідний масив не змінено (головна стрічка не переставиться)', ids(feed) === before,
   `${before} → ${ids(feed)}`);

// Без закріплених нічого не змінюється взагалі.
const plain = [P(3, 1), P(2, 1), P(1, 1)];
ok('без закріплених порядок той самий', ids(orderPinned(plain)) === '3,2,1', ids(orderPinned(plain)));

ok('ліміт закріплених — 3', MAX_PINNED === 3, String(MAX_PINNED));

// ── СТРУКТУРНІ перевірки: де саме застосовано сортування ──
// Це і є вимога Вови, і її неможливо перевірити «на око» — тільки за місцем виклику.
const feedRender = SRC.slice(SRC.indexOf('function renderFeed'), SRC.indexOf('function renderFeed') + 3000);
ok('головна стрічка НЕ сортує за закріпленням', !feedRender.includes('orderPinned'),
   'renderFeed має лишатись за датою');
ok('екран спільноти сортує за закріпленням',
   /const pagePosts = orderPinned\(posts\.filter/.test(SRC));

// Позначка «Закріплено» — тільки на екрані спільноти.
ok('позначка малюється лише при onPage', /onPage && post\.pinned_at/.test(SRC));
// 🔴 ЦЯ ПЕРЕВІРКА БУЛА ХИБНОЮ І ПРОПУСТИЛА СПРАВЖНІЙ БАГ.
// Було: `ok(..., /posts\.map\(postCardHtml\)/.test(SRC))` — тобто «стрічка не передає
// прапорець явно». Вона зеленіла, а баг був: `map` передає другим аргументом ІНДЕКС,
// тож `onPage` ставав 0,1,2,3… — і позначка «Закріплено» вилізала в ГОЛОВНІЙ стрічці
// на всіх картках, крім першої. Критерій перевіряв форму запису замість наслідку.
// Стало: перевіряємо саме наслідок — що індекс НЕ може дійти до прапорця.
ok('головна стрічка не віддає індекс у прапорець onPage',
   !/posts\.map\(postCardHtml\)/.test(SRC) && /posts\.map\(p => postCardHtml\(p\)\)/.test(SRC),
   'renderFeed має кликати через стрілку');
// Пряма перевірка самої пастки: голий `map(fn)` справді робить прапорець істинним.
const probe = ['a', 'b', 'c'].map((post, i) => ((p, onPage = false) => !!onPage)(post, i));
ok('пастка з індексом реальна (тому й перевіряємо форму виклику)',
   probe.join() === 'false,true,true', probe.join());
ok('екран спільноти передає прапорець явно, а не через map',
   /pagePosts\.map\(p => postCardHtml\(p, true\)\)/.test(SRC));

// Ліміт перевіряється по ЦІЙ сторінці, а не глобально.
ok('ліміт рахується в межах однієї спільноти',
   /p\.page_id === post\.page_id && p\.pinned_at/.test(SRC));

// Права не дублюємо в клієнті — їх тримає база.
const supa = projectFile('src/core/supabase.js');
ok('pinned_at приходить із бази у складі поста', (supa.match(/pinned_at/g) || []).length >= 3,
   `${(supa.match(/pinned_at/g) || []).length} згадок`);
ok('є функція закріплення', /export async function setPagePostPinned/.test(supa));

const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
