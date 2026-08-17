// tests/docs-refs.mjs — СТОРОЖ ДОКУМЕНТАЦІЇ.
//
// НАВІЩО. 06.08.2026 аудит документації знайшов 65 посилань на файли, яких немає,
// і пʼять місць, де два документи прямо суперечили один одному. Найдорожча знахідка:
// `HOT_RULES.md` (читається ПЕРШИМ) обіцяв сторожі `kb-guard.test.js` і
// `kb-tapinput.test.js` для найкрихкішого місця проєкту — клавіатури на iOS. Обох
// файлів НІКОЛИ не було в git. Тобто документація не просто помилялась, вона
// ЗНІМАЛА ОБЕРЕЖНІСТЬ там, де проєкт уже двічі обпікся (PR #638, #641).
//
// 🔑 КОРІНЬ той самий, що вже двічі бив по коду: списки файлів і числа існують
// КОПІЯМИ в кількох документах, і ніщо їх не звіряє. Копії розходяться завжди —
// так розійшлись два списки антиспаму (`utils.js` ↔ тригер у базі) і два описи
// `messages-ui.js`. Різниця лише в тому, що зламану копію в коді ловив стенд, а
// зламану копію в тексті не ловило НІЩО. Цей файл закриває саме це.
//
// ЩО МІРЯЄМО. Три речі, кожна — числом:
//   1. посилання на файли в навігаційному шарі документації існують на диску;
//   2. кількість стендів, названа в документації, збігається з кількістю на диску;
//   3. тека журналів сесій рівно одна (їх уже було дві, і історія липня лежала
//      розрізаною навпіл — три журнали навіть збіглися іменами).
//
// 🛑 ЧОГО НЕ МІРЯЄМО І ЧОМУ. Літопис не перевіряємо: `SESSION_STATE_VOVA.md`
// (5635 рядків історії), `_session-log/`, `_archive/`, `BYYOU_ARCHIVE_*`. Там
// згадуються файли, які на той момент СПРАВДІ існували, і це правильний запис
// минулого. Сторож стереже те, за чим новий чат орієнтується СЬОГОДНІ.

import { readdirSync, readFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const VOVA = join(ROOT, 'CSTL NEWS VOVA');

let passed = 0, total = 0;
const fails = [];
function check(ok, label) {
  total++;
  if (ok) passed++; else fails.push(label);
}

// ── Навігаційний шар: що читає новий чат, щоб зорієнтуватись ──────────────────
function navDocs() {
  const list = [
    'CLAUDE.md',
    'CSTL NEWS VOVA/CLAUDE.md',
    'CSTL NEWS VOVA/START_HERE.md',
    'CSTL NEWS VOVA/HOT_RULES.md',
    'CSTL NEWS VOVA/CSTL_BUGS.md',
    'CSTL NEWS VOVA/ВОВА_ПРОФІЛЬ.md',
    'CSTL NEWS VOVA/RODMAP.md',
    'CSTL NEWS VOVA/_ai-tools/NEW_SESSION_PROMPT.md',
    'CSTL NEWS VOVA/_ai-tools/AUDIT_2026-07.md',
    'CSTL NEWS VOVA/_ai-tools/BACKLOG_VOVA_2026-08.md',
  ];
  for (const dir of ['CSTL NEWS VOVA/docs', '.claude/commands']) {
    const full = join(ROOT, dir);
    if (!existsSync(full)) continue;
    for (const f of readdirSync(full)) if (f.endsWith('.md')) list.push(`${dir}/${f}`);
  }
  return list.filter(p => existsSync(join(ROOT, p)));
}

// ── Свідомо згадана відсутність ───────────────────────────────────────────────
// 🔑 Головна складність сторожа: «файла нема» саме́ по собі НЕ помилка. Половина
// найцінніших уроків проєкту звучить як «цього файлу немає, і ось чому» — демо-дані
// з вигаданими телефонами, сторожі, яких ніколи не було, важкі картинки, які
// видалили. Якби сторож падав на них, його б вимкнули за тиждень, і він не стеріг
// би нічого. Тому виняток заводиться ЯВНО і З ПРИЧИНОЮ — рядок без причини не
// пройде рецензію очима.
const KNOWN_MISSING = new Map([
  ['images/cork2.png',             'ВИДАЛЕНО 16.08 — 2.8 МБ мертвого фото: фон Дошки став CSS-градієнтом ще 28.07, браузер файл не тягнув, але він роздував артефакт деплою. Згадки лишені як урок про найважчий файл проєкту'],
  ['cork2.png',                    'те саме, скорочена форма'],
  ['data/curated.json',            'задум, який не збудували — ручні ексклюзиви лежать у articles.json'],
  ['curated.json',                 'те саме, скорочена форма'],
  ['data/community-board.json',    'ВИДАЛЕНО 05.08 — демо-оголошення з вигаданими телефонами'],
  // 🔴 17.08 — збори переїхали у Supabase (таблиця `fundraisers`). Файл видалено,
  // бо адмінка не може писати в git: для цього їй потрібен був би ключ запису в
  // репозиторій, а він лежав би у браузері. Згадки лишились у літописі й у двох
  // документах як опис того, звідки дані прийшли.
  ['data/fundraisers.json',        'ВИДАЛЕНО 17.08 — дані переїхали в таблицю Supabase `fundraisers`, щоб збори можна було створювати з адмінки; схема — scripts/supabase_fundraisers.sql'],
  ['fundraisers.json',             'те саме, скорочена форма'],
  ['community-board.json',         'те саме, скорочена форма'],
  ['.github/workflows/auto-merge.yml', 'вимкнено й видалено 05.07 — пуш у claude/** нічого не деплоїть'],
  ['auto-merge.yml',               'те саме, скорочена форма'],
  ['kb-guard.test.js',             'НІКОЛИ не існував — урок 27.07 про брехливу перевірку'],
  ['kb-tapinput.test.js',          'НІКОЛИ не існував — той самий урок'],
  ['tests/board-header.mjs',       'згадка в історичному тексті; живий сторож — board-header-flow.mjs'],
  ['tests/community-home.mjs',     'забрав відкат Громади 03.08 (PR #766)'],
  ['tests/tools/community-audit.mjs', 'забрав відкат Громади 03.08 (PR #766)'],
  ['home-smoke.mjs',               'забрав відкат Громади 03.08 (PR #766)'],
  ['home-fund-shot.mjs',           'забрав відкат Громади 03.08 (PR #766)'],
  ['src/tabs/submit.js',           'ВИДАЛЕНО — саме видалення й було фіксом багів B-07/B-18'],
  ['submit.js',                    'те саме, скорочена форма'],
  ['sync.sh',                      'ВИДАЛЕНО — саме це й було фіксом бага B-20'],
  ['scripts/fetch_news.py',        'задум; реальний парсер — scripts/parse_rss.py'],
  ['.github/workflows/fetch_news.yml', 'задум; реальний — rss-parser.yml'],
  ['docs/HOW_TO_PUBLISH.md',       'заплановано і не створено; роль редактора вакантна з 26.07'],
  ['HOW_TO_PUBLISH.md',            'те саме, скорочена форма'],
  ['BOARD.md',                     'доба спільної роботи; проєкт одноосібний з 18.07'],
  ['_ai-tools/BOARD.md',           'доба спільної роботи, той самий документ зі шляхом'],
  ['docs/FOUNDERS_AGREEMENT.md',   'угода засновників не складалась — проєкт одноосібний'],
  ['_ai-tools/archive/ROLES_SURVEY_2026-07.md', 'опитування засновників не проводилось'],
  ['editor.html',                  'згадується як рішення, якого НЕ робимо («не окрема editor.html»)'],
  ['publish_queue.py',             'задум кабінету редактора, не реалізований'],
  ['stop-hook-git-check.sh',       'хук харнесу поза репозиторієм (~/.claude/)'],
  ['images/IMG_2321.png',          'видалено 26.07 — важкі картинки, 34МБ → 21МБ'],
  ['images/cork.png',              'видалено 26.07 разом з іншими важкими'],
  ['images/bus-hero.png',          'видалено 26.07 — на нього не було жодного посилання'],
  ['bus-hero.png',                 'те саме, скорочена форма'],
  ['icons/castle-icon2.png',       'видалено 26.07 — важка іконка 1.7МБ'],
  ['images/0C9D1101-186A-40C1-AABB-86C6004BF4CB.png', 'видалено 26.07 — важка картинка 1.6МБ'],
  ['icons/75777DAD-1ACD-4845-B685-A1ECC71560FD.png',  'видалено 26.07 — важка іконка 1.3МБ'],
  ['tests/docs-refs.mjs',          'цей самий сторож — згадка в CLAUDE.md з`являється раніше за файл у деяких перевірках'],
]);

// Приклади імен у шаблонах («створи _session-log/vova-2026-08-06.md») — не посилання.
const EXAMPLE_RE = /^(_session-log\/)?vova-\d{4}-\d{2}-\d{2}[a-z]?\.md$/;

const REF_RE = /`([A-Za-z_.][A-Za-z0-9_./\-]*\.(?:js|mjs|css|json|html|yml|py|sql|md|sh|png))`/g;

function fileExists(ref) {
  if (existsSync(join(ROOT, ref)) || existsSync(join(VOVA, ref))) return true;
  // пошук за базовим іменем — документи часто називають файл без шляху
  const base = ref.split('/').pop();
  const stack = [ROOT];
  while (stack.length) {
    const dir = stack.pop();
    let entries;
    try { entries = readdirSync(dir, { withFileTypes: true }); } catch { continue; }
    for (const e of entries) {
      if (e.isDirectory()) {
        if (e.name === '.git' || e.name === 'node_modules' || e.name === 'shots') continue;
        stack.push(join(dir, e.name));
      } else if (e.name === base) return true;
    }
  }
  return false;
}

// Збираємо всі згадки один раз — далі ними користуються і перевірка, і контроль.
function collectBroken(docs) {
  const broken = new Map();
  for (const rel of docs) {
    const txt = readFileSync(join(ROOT, rel), 'utf8');
    for (const m of new Set([...txt.matchAll(REF_RE)].map(x => x[1]))) {
      if (m.startsWith('http') || m.startsWith('~/') || m.startsWith('/root') || m.includes('*')) continue;
      if (KNOWN_MISSING.has(m) || EXAMPLE_RE.test(m)) continue;
      if (!fileExists(m)) {
        if (!broken.has(m)) broken.set(m, []);
        broken.get(m).push(rel);
      }
    }
  }
  return broken;
}

console.log('🧪 docs-refs — сторож документації\n');

// ── 1. Биті посилання ─────────────────────────────────────────────────────────
const docs = navDocs();
check(docs.length >= 20, `навігаційний шар знайдено (${docs.length} документів, чекали ≥20)`);

const broken = collectBroken(docs);
for (const [ref, where] of broken) {
  check(false, `битий шлях \`${ref}\` ← ${where.join(', ')}`);
}
check(broken.size === 0, `битих посилань немає (знайдено ${broken.size})`);

// ── 2. Кількість стендів у документації = кількість на диску ──────────────────
const standCount = readdirSync(join(ROOT, 'tests'))
  .filter(f => f.endsWith('.mjs') && f !== 'run.mjs' && !f.startsWith('_')).length;

// ⚠️ Міряємо ПРИСУТНІСТЬ актуального числа, а не відсутність усіх інших.
// Перша версія цієї перевірки падала на рядку «Стенди — 30 / 396 перевірок» у
// блоці «(попередній стан, сесія O)» — тобто лаяла ПРАВИЛЬНИЙ запис історії.
// Це був би десятий випадок брехливої перевірки в проєкті: критерій міряв те, що
// зручно порахувати, замість того, що справді має бути правдою.
for (const doc of ['CSTL NEWS VOVA/CLAUDE.md', 'CSTL NEWS VOVA/START_HERE.md']) {
  const txt = readFileSync(join(ROOT, doc), 'utf8');
  // ⚠️ 07.08 — ДОДАНО СЛОВОФОРМИ «перевірки/перевірка».
  // Патерн приймав лише «перевірок», і рядок «Стенди — 46 / 782 перевірки» повз нього
  // проходив, хоча число там правильне. Українська вимагає «перевірки» для чисел на
  // 2-4, тож сторож змушував писати неграмотно — тобто мірка диктувала мову тексту
  // замість того, щоб перевіряти факт. Одинадцятий випадок, коли підозрюваною має
  // бути перевірка, а не те, що вона лає.
  const mentions = [...txt.matchAll(/(\d+)\s*(?:стенд(?:и|ів|а)?|\/\s*\d+\s*перевір(?:ок|ки|ка))/g)].map(m => +m[1]);
  check(mentions.includes(standCount),
    `${doc}: названо актуальну кількість стендів (${standCount})${mentions.includes(standCount) ? '' : ` — у тексті лише ${[...new Set(mentions)].join(', ')}`}`);
}

// ── 3. Тека журналів сесій рівно одна ─────────────────────────────────────────
const logDirs = [];
(function walk(dir, depth) {
  if (depth > 2) return;
  let entries;
  try { entries = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (!e.isDirectory()) continue;
    if (e.name === '.git' || e.name === 'node_modules') continue;
    if (e.name === '_session-log') logDirs.push(join(dir, e.name));
    else walk(join(dir, e.name), depth + 1);
  }
})(ROOT, 0);
check(logDirs.length === 1, `тека журналів рівно одна (знайдено ${logDirs.length}: ${logDirs.map(d => d.replace(ROOT, '.')).join(', ')})`);
check(logDirs.length === 1 && logDirs[0] === join(ROOT, '_session-log'), 'журнали лежать у корені репозиторію');

// ── КОНТРОЛЬ ──────────────────────────────────────────────────────────────────
// Без цього «0 знахідок» не доводить нічого — так само виглядав би зламаний пошук.
//
// ⚠️ УРОК, КУПЛЕНИЙ ПРИ НАПИСАННІ ЦЬОГО Ж ФАЙЛУ (06.08). Перший живий контроль
// я зробив так: дописав у `HOT_RULES.md` рядок із `src/core/неіснуючий-модуль.js`
// і прогнав сторожа. Сторож сказав «✅ 10/10» — тобто НЕ побачив битого шляху.
// Виглядало як діра в стороже. Насправді діра була в КОНТРОЛІ: шаблон `REF_RE`
// свідомо описує латиничні імена (усі файли проєкту такі), а я взяв кирилицю.
// Повторив із `src/core/kb-guard-v2.js` — сторож упав, як і мусив.
// 🔑 Це рівно те правило, що вже записане в `CLAUDE.md`: **мірку перевіряти так
// само, як код**, і при розбіжності першою підозрюваною робити перевірку.
// 🛑 Тому контроль нижче — не формальність: він міряє САМ МЕХАНІЗМ пошуку.
const canary = 'src/core/цього-файлу-точно-нема-12345.js';
check(fileExists(canary) === false, 'КОНТРОЛЬ: неіснуючий файл визначається як відсутній');
check(fileExists('src/core/utils.js') === true, 'КОНТРОЛЬ: наявний файл визначається як наявний');
check(fileExists('utils.js') === true, 'КОНТРОЛЬ: пошук за базовим іменем працює');
check(KNOWN_MISSING.size > 0 && [...KNOWN_MISSING.values()].every(v => v && v.length > 15),
  'КОНТРОЛЬ: кожен виняток має причину (не порожній рядок)');

// ── Підсумок ──────────────────────────────────────────────────────────────────
if (fails.length) {
  console.log('❌ ПРОВАЛЕНО:');
  for (const f of fails) console.log(`❌   ${f}`);
  console.log('\n🔑 Що робити: або виправити посилання в документі, або — якщо файла');
  console.log('   свідомо немає і це урок — додати його в KNOWN_MISSING З ПРИЧИНОЮ.');
} else {
  console.log('✅ документація звірена з диском');
}
console.log(`\n${fails.length ? '❌' : '✅'} ${passed}/${total} перевірок пройдено`);
process.exit(fails.length ? 1 : 0);
