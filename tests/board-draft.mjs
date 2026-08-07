// Стенд №46: ЧЕРНЕТКА ПОДАЧІ ОГОЛОШЕННЯ (Дошка).
//
// НАВІЩО (аудит Дошки під MVP, 07.08, знахідка C-1): модалка «Нове оголошення»
// закривається тапом по фону, свайпом вниз і ✕ — і до цієї зміни будь-який із трьох
// способів стирав набране НАЗАВЖДИ, без питання й без відновлення. Це найдовша форма
// застосунку: у живій базі трапляються описи на 1296 символів.
//
// ⚠️ Стенд ганяє СПРАВЖНІЙ код: склеює спільний примітив `src/core/draft.js` з
// налаштуванням саме цієї форми зі `src/tabs/community-modal.js`. Копія тут
// перевіряла б саму себе, а не те, що поїде на прод.
//
// 🔑 Головна перевірка — НЕ «чернетка зберігається», а **де саме її стирають**.
// Правильне місце одне: гілка УСПІХУ публікації. Якби стирання жило в `close()`,
// страховка рятувала б від усього, крім того випадку, заради якого заведена —
// випадкового закриття. Цей самий висновок уже зроблено у «Стрічці» 27.07, і саме
// його найлегше зламати при наступному рефакторі.
import { readFileSync } from 'fs';
import { projectFile } from './_lib.mjs';

const SRC  = projectFile('src/tabs/community-modal.js');
const CORE = projectFile('src/core/draft.js');

const core = CORE.replace(/\bexport\s+function\b/g, 'function')
                 .replace(/\bexport\s+const\b/g, 'const');

// налаштування саме цієї форми: префікс ключа + критерій непорожньої чернетки
const from = SRC.indexOf('const draftStore = createDraftStore(');
const to   = SRC.indexOf('export function openBoardModal');
if (from < 0 || to < 0 || to < from) {
  console.log('❌ не знайшов налаштування чернетки у community-modal.js'); process.exit(1);
}
const block = core + '\n' + SRC.slice(from, to);

const mk = () => { const m = new Map(); return { m,
  api: { get length() { return m.size; }, key: i => [...m.keys()][i],
    getItem: k => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: k => m.delete(k) } }; };
const ss = mk(), ls = mk();
globalThis.sessionStorage = ss.api;
globalThis.localStorage   = ls.api;

const api = new Function(`${block}\nreturn { draftStore, DEFAULT_TTL };`)();
const { draftStore, DEFAULT_TTL } = api;

const res = []; const ok = (n, c, i = '') => { res.push(c); console.log(`${c ? '✅' : '❌'} ${n}${i ? '  — ' + i : ''}`); };
const reset = () => { ss.m.clear(); ls.m.clear(); };
const full = (o = {}) => ({ title: '', text: '', category: '', price: '',
  negotiable: false, location: 'Вся Олицька громада', contact: '+380', hadPhotos: false, ...o });

// 1. Головний сценарій: набрав опис → закрив випадково → відкрив, текст на місці.
reset();
draftStore.write('', full({ text: 'Продам мотоцикл у гарному стані, торг при огляді.' }));
ok('набраний опис повертається після закриття',
   draftStore.read()?.text === 'Продам мотоцикл у гарному стані, торг при огляді.',
   draftStore.read()?.text ?? 'нічого');

// 2. Усі поля форми переживають закриття — не лише текст.
reset();
draftStore.write('', full({ title: 'Продам велосипед', text: 'опис', category: 'продам',
  price: '2500', location: 'Котів', contact: '+380501112233' }));
const d = draftStore.read();
ok('заголовок, категорія, ціна, локація і контакт збережені',
   d?.title === 'Продам велосипед' && d?.category === 'продам' && d?.price === '2500'
   && d?.location === 'Котів' && d?.contact === '+380501112233',
   JSON.stringify({ t: d?.title, c: d?.category, p: d?.price, l: d?.location }));

// 3. «Ціна договірна» — теж стан, який прикро втратити.
reset();
draftStore.write('', full({ title: 'Куплю', negotiable: true }));
ok('«договірна» збережена', draftStore.read()?.negotiable === true);

// 4. 🔴 ПОРОЖНЯ ФОРМА НЕ СТВОРЮЄ ЧЕРНЕТКИ.
// Інакше тост «відновлено незбережене» вилазив би при кожному відкритті форми.
reset();
draftStore.write('', full());
ok('порожня форма не лишає чернетки',
   draftStore.read() === null && ss.m.size === 0, `у сховищі ${ss.m.size}`);

// 5. 🔴 САМА ЛОКАЦІЯ НЕ РОБИТЬ ЧЕРНЕТКУ.
// У локації є значення за замовчуванням, тож якби вона рахувалась, чернетка
// створювалась би від самого відкриття форми — ще до того, як людина щось написала.
reset();
draftStore.write('', full({ location: 'Жорнище' }));
ok('сама лише локація не рахується за початок писання',
   draftStore.read() === null, `у сховищі ${ss.m.size}`);

// 6. Стер усе написане — чернетка зникає, а не лишається привидом.
reset();
draftStore.write('', full({ text: 'щось' }));
draftStore.write('', full());
ok('стирання останнього символу прибирає чернетку',
   draftStore.read() === null && ss.m.size === 0);

// 7. Прострочена чернетка не воскресає.
reset();
ss.m.set('cstl_bd_draft', JSON.stringify({ text: 'торішнє', ts: Date.now() - DEFAULT_TTL - 1000 }));
ok('прострочена чернетка не підставляється', draftStore.read() === null);

// 8. Зіпсоване сховище не валить форму.
reset();
ss.m.set('cstl_bd_draft', '{зламаний json');
let crashed = false;
try { draftStore.read(); } catch { crashed = true; }
ok('зіпсована чернетка не кидає виняток', !crashed);

// 9. Чернетка живе в СЕСІЙНОМУ сховищі, не в постійному.
// Рішення 27.07: страховка від випадкового тапу, а не архів написаного.
reset();
draftStore.write('', full({ text: 'абв' }));
ok('чернетка в сесійному сховищі, у постійному її немає',
   ss.m.size === 1 && ls.m.size === 0, `сесійне ${ss.m.size} · постійне ${ls.m.size}`);

// 10. Факт наявності фото зберігається (самі фото — ні, це `File` у памʼяті).
reset();
draftStore.write('', full({ text: 'абв', hadPhotos: true }));
ok('позначка про втрачені фото збережена — тост скаже про них',
   draftStore.read()?.hadPhotos === true);

// ── Перевірки САМОГО КОДУ модалки: де стирають і де відновлюють ──

// 11. 🔴 clearDraft НЕ в close() — інакше тап повз лист сам би стер чернетку.
const closeFn = SRC.slice(SRC.indexOf('onClose:'), SRC.indexOf('onClose:') + 260);
ok('стирання НЕ висить на закритті модалки', !/draftStore\.clear/.test(closeFn));

// 12. 🔴 clearDraft САМЕ в гілці успішної публікації.
const okBranch = SRC.slice(SRC.indexOf('// ── Створення НОВОГО поста ──'),
                           SRC.indexOf("showToast('Опубліковано"));
ok('стирання стоїть у гілці успіху публікації', /draftStore\.clear\(\)/.test(okBranch),
   `гілка успіху ${okBranch.length} символів`);

// 13. У режимі редагування чернетка не чіпається — текст уже в базі.
ok('у режимі редагування чернетка не читається', /isEdit \? null : draftStore\.read\(\)/.test(SRC));

// 14. Збереження висить на renderPreview — єдиній точці після зміни будь-якого поля.
ok('збереження прив\'язане до спільної точки оновлення', /if \(!isEdit\) saveDraftSoon\(\)/.test(SRC));

// 15. Відновлення переносить КОЖНЕ поле явно — чернетка приходить зі сховища, тобто
// ззовні, і розсипати її по стану цілком означало б дозволити старій або зіпсованій
// версії підкласти поле, якого форма не чекає (`photos`, `uploadingCount`).
// ⚠️ Перша версія цієї перевірки забороняла рядок `Object.assign(state, restored)` —
// і впала на ВЛАСНОМУ КОМЕНТАРІ в коді, де він згаданий як «так не робити». Тобто
// міряла ФОРМУ ЗАПИСУ, а не наслідок. Тепер міряємо наслідок: усі сім полів форми
// справді перенесені поіменно.
const restoredFields = ['title', 'text', 'category', 'price', 'negotiable', 'location', 'contact'];
const missing = restoredFields.filter(f => !new RegExp(`state\\.${f}\\s*=\\s*!?!?restored\\.${f}`).test(SRC));
ok('усі поля чернетки переносяться поіменно', missing.length === 0,
   missing.length ? 'не перенесені: ' + missing.join(', ') : `${restoredFields.length} з ${restoredFields.length}`);

const bad = res.filter(x => !x).length;
console.log(`\n${bad ? '❌' : '✅'} ${res.length - bad}/${res.length} перевірок пройдено`);
process.exit(bad ? 1 : 0);
