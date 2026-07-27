// Стенд №12: ЧЕРНЕТКА КОМПОЗЕРА «Стрічки».
// Аудит 27.07: тап повз лист знищував набраний допис без питання.
//
// ⚠️ Стенд ганяє СПРАВЖНІЙ код: витягує блок функцій чернетки прямо з src/tabs/feed.js
// і виконує його. Копія тут була б безглузда — вона перевіряла б саму себе, а не те,
// що поїде на прод.
import { readFileSync } from 'fs';
import { projectFile } from './_lib.mjs';

const SRC = projectFile('src/tabs/feed.js');

// ── дістаємо рівно блок чернетки ──
const from = SRC.indexOf('const DRAFT_TTL');
const to   = SRC.indexOf('function openComposer');
if (from < 0 || to < 0 || to < from) { console.log('❌ не знайшов блок чернетки у feed.js'); process.exit(1); }
const block = SRC.slice(from, to);

// ── мінімальне оточення: ДВА сховища ──
// sessionStorage — те, де чернетка живе тепер (гине разом із закриттям застосунку).
// localStorage — щоб перевірити прибирання за першою версією, яка писала саме туди.
const mk = () => { const m = new Map(); return { m,
  api: { get length() { return m.size; }, key: i => [...m.keys()][i],
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k) } }; };
const ss = mk(), ls = mk();
const store = ss.m;                      // «сховище» в перевірках нижче = сесійне
globalThis.sessionStorage = ss.api;
globalThis.localStorage   = ls.api;
const api = new Function(`${block}\nreturn { readDraft, writeDraft, clearDraft, draftKey, DRAFT_TTL };`)();
const { readDraft, writeDraft, clearDraft, draftKey, DRAFT_TTL } = api;

const res = []; const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };
const reset = () => { ss.m.clear(); ls.m.clear(); };

// 1. Головний сценарій: написав → закрив → відкрив, текст на місці.
reset();
writeDraft('p1', { text: 'Довгий допис про ярмарок', type: 'post', date: '', time: '', loc: '', showAuthor: false });
let d = readDraft('p1');
ok('написане повертається після закриття', d?.text === 'Довгий допис про ярмарок', d?.text ?? 'нічого');

// 2. Поля події теж переживають закриття.
reset();
writeDraft('p1', { text: '', type: 'event', date: '2026-08-12', time: '10:00', loc: 'Центральна площа', showAuthor: false });
d = readDraft('p1');
ok('подія: дата/час/місце і тип збережені',
   d?.date === '2026-08-12' && d?.time === '10:00' && d?.loc === 'Центральна площа' && d?.type === 'event',
   JSON.stringify({ date: d?.date, time: d?.time, loc: d?.loc, type: d?.type }));

// 3. «Від себе» не губиться.
reset();
writeDraft('p1', { text: 'абв', type: 'post', date: '', time: '', loc: '', showAuthor: true });
ok('підпис «від себе» збережено', readDraft('p1')?.showAuthor === true);

// 4. Порожня форма НЕ створює чернетку — інакше тост показувався б ні про що.
reset();
writeDraft('p1', { text: '', type: 'post', date: '', time: '', loc: '', showAuthor: false });
ok('порожня форма не лишає чернетки', readDraft('p1') === null && store.size === 0, `у сховищі ${store.size}`);

// 5. Самі пробіли — теж порожньо.
reset();
writeDraft('p1', { text: '   \n  ', type: 'post', date: '', time: '', loc: '', showAuthor: false });
ok('текст із самих пробілів не рахується', readDraft('p1') === null);

// 6. Стер написане — чернетка зникає (а не висить старою версією).
reset();
writeDraft('p1', { text: 'щось', type: 'post', date: '', time: '', loc: '', showAuthor: false });
writeDraft('p1', { text: '',      type: 'post', date: '', time: '', loc: '', showAuthor: false });
ok('очищене поле прибирає чернетку', readDraft('p1') === null && store.size === 0);

// 7. Публікація прибирає чернетку.
reset();
writeDraft('p1', { text: 'опубліковано', type: 'post', date: '', time: '', loc: '', showAuthor: false });
clearDraft('p1');
ok('після публікації чернетки нема', readDraft('p1') === null);

// 8. Чернетки різних сторінок не змішуються.
reset();
writeDraft('p1', { text: 'для першої', type: 'post', date: '', time: '', loc: '', showAuthor: false });
writeDraft('p2', { text: 'для другої', type: 'post', date: '', time: '', loc: '', showAuthor: false });
ok('кожна сторінка має свою чернетку',
   readDraft('p1')?.text === 'для першої' && readDraft('p2')?.text === 'для другої');

// 9. Стара чернетка (понад тиждень) не воскресає і прибирається зі сховища.
reset();
sessionStorage.setItem(draftKey('p1'), JSON.stringify({ text: 'торішнє', ts: Date.now() - DRAFT_TTL - 1000 }));
const stale = readDraft('p1');
ok('протухла чернетка не підставляється', stale === null);
ok('стара чернетка прибирається зі сховища', store.size === 0, `лишилось ${store.size}`);

// 10. Сміття у сховищі не валить застосунок.
reset();
sessionStorage.setItem(draftKey('p1'), '{зламаний json');
let crashed = false;
try { readDraft('p1'); } catch { crashed = true; }
ok('пошкоджені дані не кидають помилку', !crashed);

// ── 🔑 ВИПАДОК ВОВИ: «закрив додаток, відкрив написати пост — а там знову старий текст» ──
// Закриття застосунку = знищення сесійного сховища; локальне при цьому лишається жити.
// Саме на цій різниці й тримається виправлення.
reset();
writeDraft('p1', { text: 'великий пост, який писав раніше', type: 'post', date: '', time: '', loc: '', showAuthor: false });
ok('поки застосунок відкритий — чернетка на місці', readDraft('p1')?.text.startsWith('великий пост'));
ss.m.clear();                                   // ← застосунок закрили і відкрили заново
ok('після закриття застосунку чернетки НЕМА', readDraft('p1') === null,
   readDraft('p1')?.text ?? 'порожньо');

// Чернетка не має писатись у постійне сховище — інакше вона переживе закриття.
reset();
writeDraft('p1', { text: 'перевірка сховища', type: 'post', date: '', time: '', loc: '', showAuthor: false });
ok('чернетка лежить у СЕСІЙНОМУ сховищі', ss.m.size === 1, `сесійне ${ss.m.size}`);
ok('у постійному сховищі її НЕМА', ls.m.size === 0, `постійне ${ls.m.size}`);

// Прибирання за першою версією: у неї чернетка лежала в постійному сховищі.
ls.m.set('cstl_fd_draft_p9', JSON.stringify({ text: 'спадок першої версії', ts: Date.now() }));
ls.m.set('cstl_other_key', 'не чіпати');
// У джерелі це самовиклична функція — беремо її разом з дужками і просто виконуємо.
const purge = SRC.slice(SRC.indexOf('(function purgeLegacyDrafts'), SRC.indexOf('function openComposer'));
new Function(purge)();
ok('стара «вічна» чернетка прибирається зі сховища', !ls.m.has('cstl_fd_draft_p9'));
ok('чужі ключі прибирання не чіпає', ls.m.get('cstl_other_key') === 'не чіпати');

// ── СТРУКТУРНА перевірка проводки: де саме чиститься чернетка ──
// Це не стиль, а суть фікса: якщо `clearDraft` заповзе в `close()`, чернетка
// зникатиме при ТАПІ ПОВЗ ЛИСТ — тобто рівно в тому випадку, заради якого все й робилось.
const composer = SRC.slice(SRC.indexOf('function openComposer'));
const closeFn = composer.slice(composer.indexOf('const close = () => {'),
                               composer.indexOf('const close = () => {') + 400);
ok('clearDraft НЕ викликається у close() (інакше тап повз лист стирав би чернетку)',
   !closeFn.includes('clearDraft'));
// ⚠️ Міряємо СТРУКТУРУ, а не відстань у символах. Перша версія цієї перевірки шукала
// clearDraft у межах 600 символів після `if (res.ok)` — і завалилась просто тому, що
// я дописав пояснювальний коментар. Критерій, який ламає звичайний коментар, — поганий.
const okStart = composer.indexOf('if (res.ok) {');
const okEnd   = composer.indexOf('} else {', okStart);
const okBlock = composer.slice(okStart, okEnd);
ok('clearDraft викликається всередині гілки успіху', okBlock.includes('clearDraft(pageId)'),
   `гілка успіху ${okBlock.length} символів`);
ok('у режимі редагування чернетка не чіпається',
   /if \(!edit\) clearDraft\(pageId\)/.test(composer) && /if \(edit\) return;/.test(composer));

const bad = res.filter(r => !r).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
