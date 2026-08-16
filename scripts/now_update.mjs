// scripts/now_update.mjs — ГЕНЕРАТОР ПУЛЬСУ (`CSTL NEWS VOVA/NOW.md`).
//
// 🔴 НАВІЩО. 15.08.2026 Вова: «працюю на двох акаунтах… інший акаунт не розуміє
// до кінця, що вже зроблено… ніби щось у репозиторії відстає». Заміряно — git НЕ
// відстає (робота другого акаунта була в `main`). Відставали ДОКУМЕНТИ, і рівно
// в тих полях, які людина переписує руками:
//
//   • `CACHE_NAME` у `START_HERE.md` стояв `0620`, а правда була `0609`;
//   • «Поточний стан» у трьох документах мав три різні дати (11.08 / 12.08 / 13.08)
//     при сьогоднішньому 15.08.
//
// 🔑 ПРИНЦИП: **що не пишеться руками — те не дрейфує.** Усе, що можна дістати з
// git і з файлів (гілка · коміт · CACHE_NAME · PR · стенди · що не доїхало в main),
// генерується сюди автоматично. Людині (і Claude) лишається тільки те, чого git не
// знає: над чим працюємо, що не доробили, що спитати у Вови, що далі.
//
// 🛑 ЧОГО ЦЕЙ СКРИПТ НЕ РОБИТЬ. Не чіпає жодного тексту поза блоком
// `<!-- AUTO:START -->…<!-- AUTO:END -->`. Прозу пише Claude при `/onovy` та
// `/finish`; генератор її не перезаписує НІКОЛИ — інакше перший же прогін зітер би
// живий опис стану, заради якого файл і заведено.
//
// ЗАПУСК:
//   node scripts/now_update.mjs           # перезаписати авто-блок
//   node scripts/now_update.mjs --check   # нічого не писати; код 1 якщо блок застарів

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW_PATH = join(ROOT, 'CSTL NEWS VOVA', 'NOW.md');

const START = '<!-- AUTO:START -->';
const END = '<!-- AUTO:END -->';

// ── git-помічник ─────────────────────────────────────────────────────────────
// Будь-яка команда може впасти (немає origin, порожній репозиторій, мережі нема).
// Пульс має згенеруватись ЗАВЖДИ: краще рядок «невідомо», ніж падіння генератора
// і зовсім протухлий файл.
// `-c core.quotepath=false` — інакше git екранує кирилицю в іменах файлів у
// вісімкові коди, і список «не доїхало в main» стає нечитабельним.
// `TZ=UTC` — дати комітів мусять бути в ОДНІЙ зоні: без цього `%ad` віддає
// авторський час у зоні, де коміт зробили, і сусідні рядки показують «06:24» та
// «09:11» для комітів, що йшли поспіль.
function git(...args) {
  try {
    return execFileSync('git', ['-c', 'core.quotepath=false', ...args],
      { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, TZ: 'UTC' } }).trim();
  } catch (_) {
    return '';
  }
}

// 🔑 Автокоміти парсерів (`auto(news)`, `auto(vopas)`) — це НЕ робота людини.
// Якщо їх не відсіювати, «останній коміт» майже завжди показуватиме парсер новин,
// і пульс виглядатиме свіжим, коли насправді ніхто нічого не робив.
const isAuto = (subject) => /^auto\(/.test(subject);

function lastHumanCommits(ref, n) {
  const raw = git('log', '--format=%h|%cd|%s', '--date=format-local:%d.%m %H:%M', '-40', ref);
  if (!raw) return [];
  return raw.split('\n')
    .map(l => { const [h, d, ...rest] = l.split('|'); return { h, d, s: rest.join('|') }; })
    .filter(c => c.s && !isAuto(c.s))
    .slice(0, n);
}

// ── збір фактів ──────────────────────────────────────────────────────────────
function collect() {
  const branch = git('branch', '--show-current') || '(відокремлена голова)';
  const head = lastHumanCommits('HEAD', 1)[0];

  // CACHE_NAME читається з sw.js — це ЄДИНЕ джерело правди. Раніше його копію
  // тримали в START_HERE.md руками, і копія розійшлась.
  let cache = 'не знайдено';
  const swPath = join(ROOT, 'sw.js');
  if (existsSync(swPath)) {
    const m = readFileSync(swPath, 'utf8').match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/);
    if (m) cache = m[1];
  }

  // Останній PR у main. Squash-мердж лишає «(#NNN)» у заголовку коміта.
  const mainLog = git('log', '--format=%s', '-40', 'origin/main') || git('log', '--format=%s', '-40', 'main');
  const prMatch = mainLog.split('\n').map(s => s.match(/\(#(\d+)\)\s*$/)).find(Boolean);
  const lastPr = prMatch ? `#${prMatch[1]}` : 'не видно в останніх комітах';

  // 🔴 ЧЕСНА МІРКА «що не доїхало в main»: `diff` на ДВІ крапки.
  // На три крапки (`main...HEAD`) міряється від точки розходження — після
  // squash-мерджа це показує роботу, яка НАСПРАВДІ ВЖЕ в main. Саме на цьому
  // 15.08 я мало не доповів про застряглу роботу, якої не існувало.
  const base = git('rev-parse', '--verify', '-q', 'origin/main') ? 'origin/main' : 'main';
  const diffRaw = git('diff', '--name-only', `${base}..HEAD`);
  const AUTO_DATA = /^(data\/|CSTL NEWS VOVA\/_ai-tools\/HEALTH\.md)/;
  const notInMain = diffRaw ? diffRaw.split('\n').filter(f => f && !AUTO_DATA.test(f)) : [];

  const dirty = git('status', '--porcelain').split('\n').filter(Boolean).length;

  // Кількість стендів — рахуємо з диска, а не з памʼяті документа.
  const testsDir = join(ROOT, 'tests');
  const stands = existsSync(testsDir)
    ? readdirSync(testsDir).filter(f => f.endsWith('.mjs') && f !== 'run.mjs' && !f.startsWith('_')).length
    : 0;

  // Журнал сесії за сьогодні — правило `/startuem` Крок 0. 15.08 його не створили,
  // і ніхто не помітив, бо ніщо це не перевіряло.
  const today = new Date().toISOString().slice(0, 10);
  const logDir = join(ROOT, '_session-log');
  const journal = existsSync(logDir) && readdirSync(logDir).some(f => f.includes(today));

  // Статус активного потоку /byyou.
  let plan = 'файла немає';
  const planPath = join(ROOT, 'CSTL NEWS VOVA', '_ai-tools', 'BYYOU_PLAN.md');
  if (existsSync(planPath)) {
    const t = readFileSync(planPath, 'utf8');
    const st = t.match(/\*\*Статус:\*\*\s*`?([^`\n—]+)`?/);
    const flow = t.match(/\*\*Потік:\*\*\s*(.+)/);
    plan = `${(st ? st[1] : '?').trim()} — ${flow ? flow[1].trim() : 'потік не названо'}`;
  }

  return { branch, head, cache, lastPr, notInMain, dirty, stands, journal, today, plan,
           commits: lastHumanCommits('HEAD', 5) };
}

// ── рендер авто-блока ────────────────────────────────────────────────────────
function render(f) {
  const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
  const L = [];
  L.push(START);
  L.push('');
  L.push('> 🤖 **Блок нижче генерує `scripts/now_update.mjs`. Руками не правити** —');
  L.push('> при наступному прогоні правку зітре. Проза під блоком не чіпається ніколи.');
  L.push('');
  L.push(`**Зріз на:** ${stamp} UTC`);
  L.push('');
  L.push('| поле | значення |');
  L.push('|---|---|');
  L.push(`| гілка | \`${f.branch}\` |`);
  L.push(`| останній коміт людини | ${f.head ? `\`${f.head.h}\` ${f.head.d} — ${f.head.s}` : 'немає'} |`);
  L.push(`| \`CACHE_NAME\` (з \`sw.js\`) | \`${f.cache}\` |`);
  L.push(`| останній PR у \`main\` | ${f.lastPr} |`);
  L.push(`| стендів на диску | ${f.stands} |`);
  L.push(`| незакомічених файлів | ${f.dirty === 0 ? '0 ✅' : `${f.dirty} ⚠️`} |`);
  L.push(`| журнал за ${f.today} | ${f.journal ? 'є ✅' : '**НЕМАЄ** ⚠️'} |`);
  L.push(`| потік \`/byyou\` | ${f.plan} |`);
  L.push('');

  L.push('**Не доїхало в `main`** (чесна мірка — `diff` на дві крапки):');
  if (!f.notInMain.length) {
    L.push('');
    L.push('- ✅ нічого. Уся робота гілки вже в `main`.');
  } else {
    L.push('');
    for (const p of f.notInMain.slice(0, 20)) L.push(`- \`${p}\``);
    if (f.notInMain.length > 20) L.push(`- …ще ${f.notInMain.length - 20}`);
  }
  L.push('');

  L.push('**Останні кроки (без автокомітів парсерів):**');
  L.push('');
  if (!f.commits.length) L.push('- немає');
  else for (const c of f.commits) L.push(`- \`${c.h}\` ${c.d} — ${c.s}`);
  L.push('');
  L.push(END);
  return L.join('\n');
}

// ── шаблон при першому створенні ─────────────────────────────────────────────
// Розділи навмисно з підказками-заглушками: сторож `tests/docs-fresh.mjs` вважає
// заглушку НЕзаповненим розділом і падає. Так порожній пульс не проїде мовчки.
const TEMPLATE = `# NOW — пульс проєкту CSTL

> 🔴 **ЦЕЙ ФАЙЛ ЧИТАЄТЬСЯ ПЕРШИМ У КОЖНОМУ НОВОМУ ЧАТІ.**
> Він навмисно малий: його самого має бути ДОСИТЬ, щоб зрозуміти, де ми стоїмо.
> Історія живе окремо (\`_ai-tools/SESSION_STATE_VOVA.md\`, \`_session-log/\`) і
> читається **вибірково за темою**, ніколи цілком.

${START}
${END}

---

## 🎯 ЗАРАЗ

_(один абзац: над чим працюємо цієї хвилини)_

## ✅ ЗРОБЛЕНО В ЦІЙ СЕСІЇ

_(з журналу сесії, з номерами PR і деплоїв)_

## 🚧 НЕ ДОРОБЛЕНО

_(почате й покинуте — з причиною, чому покинуте)_

## ❓ ВІДКРИТІ ПИТАННЯ ДО ВОВИ

_(на що чекаю відповіді, щоб рушити далі)_

## ➡️ ДАЛІ

_(черга великих задач — звірена з BACKLOG_VOVA / AUDIT)_

## 🛑 НЕ ЧІПАТИ

_(крихкі місця, де вже обпікались)_
`;

// ── головне ──────────────────────────────────────────────────────────────────
const check = process.argv.includes('--check');

if (!existsSync(NOW_PATH)) {
  if (check) {
    console.error('❌ NOW.md не існує. Створи: node scripts/now_update.mjs');
    process.exit(1);
  }
  writeFileSync(NOW_PATH, TEMPLATE, 'utf8');
  console.log('📄 Створено CSTL NEWS VOVA/NOW.md із шаблону.');
}

const text = readFileSync(NOW_PATH, 'utf8');
const i = text.indexOf(START);
const j = text.indexOf(END);
if (i === -1 || j === -1 || j < i) {
  console.error(`❌ У NOW.md немає маркерів ${START} … ${END}. Відновити можна, видаливши файл і запустивши генератор.`);
  process.exit(1);
}

const fresh = render(collect());
const current = text.slice(i, j + END.length);

// 🔴 ДВА РІВНІ ПОРІВНЯННЯ — і це не ускладнення, а виправлення реальної вади.
//
// Перша редакція `--check` порівнювала блок цілком. Наслідок спіймано на першому
// ж повному прогоні: сторож `docs-fresh` дав **17/18**, бо блок містить хеш
// останнього коміта — тобто застаріває РІВНО В МОМЕНТ будь-якого коміту. Сторож,
// який червоніє після кожного коміту, перестають читати, і він перестає ловити
// справжнє відставання. Та сама вада вже була з лічильником незакомічених файлів.
//
// 🔑 Розвʼязання — розділити те, що МУСИТЬ бути точним завжди, і те, що
// природно біжить попереду документа:
//
//   ЛЕТКЕ ЗАВЖДИ  — час зрізу, лічильник незакоміченого. Не значать нічого для
//                   свіжості; у файлі лишаються, бо на передачі їх корисно бачити.
//   ЛЕТКЕ МʼЯКО   — хеш/список комітів і «що не доїхало в main». Біжать з кожним
//                   комітом. Усередині сесії відставання тут нормальне; його
//                   міряє окремо `tests/docs-fresh.mjs` з допуском у 8 кроків.
//
// `--check`            (щоденний, у `npm test`) — мʼякий: стежить за тим, що
//                      дрейфувати не має права: гілка, `CACHE_NAME`, останній PR,
//                      число стендів, наявність журналу, статус потоку.
// `--check --strict`   (перед передачею, у `/onovy`) — плюс «Не доїхало в `main`».
//
// 🔴 15.08.2026 — `--strict` БУВ НЕЗДІЙСНЕННИЙ ЗА ПОБУДОВОЮ, і це знайшлось під
// час самої передачі. Він вимагав збігу ще й хеша останнього коміту та списку
// «Останні кроки» — а вони міняються ТИМ САМИМ КОМІТОМ, що записує пульс:
//
//     коміт A → пульс описує A → комітимо пульс = коміт B → пульс описує A, HEAD = B
//
// `--amend` не рятує (теж новий хеш). Збіжності немає в принципі, тож крок 5
// скіла `/onovy` не міг стати зеленим НІКОЛИ — а червоний сторож, який не можна
// задовольнити, перестають читати. Це гірше, ніж його відсутність.
//
// ✅ ЩО ЗМІНЕНО: хеш і «Останні кроки» тепер летючі в ОБОХ режимах — вони
// самопосилальні за природою. А «Не доїхало в `main`» переїхало у СТРОГІ:
// саме воно й важить на передачі (наступний чат читає його як правду про те,
// де лежить робота), і воно НЕ самопосилальне — коміт пульсу не міняє того,
// що вже злито в `main`.
const VOLATILE_ALWAYS = [
  /^\*\*Зріз на:\*\*.*$/m,
  /^\| незакомічених файлів \|.*$/m,
  // 🛑 САМОПОСИЛАЛЬНІ ПОЛЯ — пульс не може описати подію, якою сам стає.
  /^\| останній коміт людини \|.*$/m,
  /\*\*Останні кроки[\s\S]*$/m,
  // ⚠️ Номер PR — ТЕЖ самопосилальний, і це знайшлось лише з ДРУГОГО заходу.
  // Перша редакція фікса зробила летючим хеш коміту й вважала справу закритою,
  // але пульс їде в `main` СВОЇМ PR — тож щойно він злився, «останній PR» став
  // на одиницю більшим за те, що в ньому написано. Той самий цикл, поверхом вище:
  //   пульс каже #932 → комітимо → мерджимо → це PR #933 → пульс знову відстав.
  // Ганятись за цим означало б мерджити пульс нескінченно.
  /^\| останній PR у `main` \|.*$/m,
];
const VOLATILE_SOFT = [
  /\*\*Не доїхало в `main`\*\*[\s\S]*?(?=\n\*\*Останні кроки)/m,
];
const strip = (s, strict) =>
  [...VOLATILE_ALWAYS, ...(strict ? [] : VOLATILE_SOFT)]
    .reduce((acc, re) => acc.replace(re, ''), s).trim();

if (check) {
  const strict = process.argv.includes('--strict');
  if (strip(current, strict) === strip(fresh, strict)) {
    console.log(`✅ Пульс свіжий — авто-блок NOW.md збігається з git${strict ? ' (строга звірка)' : ''}.`);
    process.exit(0);
  }
  console.error(`❌ Пульс ВІДСТАВ від git${strict ? ' (строга звірка перед передачею)' : ''}. Онови: node scripts/now_update.mjs`);
  process.exit(1);
}

writeFileSync(NOW_PATH, text.slice(0, i) + fresh + text.slice(j + END.length), 'utf8');
console.log('✅ NOW.md — авто-блок оновлено з git.');
