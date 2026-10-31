# 💸 НАБІР ЕКОНОМІЇ ТОКЕНІВ ДЛЯ CLAUDE CODE

> Перенесено з проєкту «Громада» (31.10.2026), де він працює щодня. Один файл:
> кинь його в чат Claude Code у будь-якому репозиторії і напиши **«встанови»**.

---

## 🤖 ІНСТРУКЦІЯ ДЛЯ CLAUDE (виконуй сам, по кроках)

1. **Нічого не читай «про запас».** Для установки потрібен лише цей файл. Не запускай
   субагентів (Agent/Task) — роби все сам у цьому чаті.
2. **Створи файли нижче рівно за вказаними шляхами** (від кореня репозиторію), вміст —
   дослівно з блоку `~~~~`. Перед створенням перевір `ls <шлях>`: якщо файл є —
   **злий, не затирай** (особливо `CLAUDE.md` і `.claude/settings.json`).
3. `chmod +x .claude/hooks/*.sh .claude/hooks/*.js`
4. Додай у `.gitignore` рядок `.claude/.token-halt`.
5. **Підлаштуй під проєкт (мінімально):**
   - `scripts/now_update.mjs`: `MAIN` — назва бойової гілки (`main`/`master`), `IS_AUTO` — префікс автокомітів ботів;
   - `CLAUDE.md` → «Коротко про проєкт»: 2-5 рядків. Глянь лише `README` (перші ~40 рядків) і `package.json`/аналог — не більше;
   - якщо в проєкті вже є великі документи — НЕ додавай їх у список MANDATORY; дай на них посилання з приміткою «тільки Grep за темою».
6. Створи `_session-log/session-<РРРР-ММ-ДД>.md` (журнал цієї сесії).
7. Запусти: `node scripts/now_update.mjs && node tests/docs-fresh.mjs`. Червоне — виправ
   (скорочуй текст, не піднімай стелі).
8. Перепиши прозу `docs/NOW.md` під реальний стан (що відомо з цього чату), ще раз
   `node scripts/now_update.mjs`, закоміть усе одним комітом і запуш у робочу гілку.
9. Відповідь людині — 3-5 рядків: що встановлено, що підлаштовано, що лишилось їй.

**Потрібно:** `git`, `node` (≥18), `python3` (для хука контексту; без нього хук мовчить).

---

## 🧠 ЧОМУ ЦЕ ЕКОНОМИТЬ ТОКЕНИ

| механізм | що робить | від чого рятує |
|---|---|---|
| **Пульс `docs/NOW.md`** (≤200 рядків / 16 KB ≈ 5K токенів) | один малий файл замість стосу документів на старті | новий чат читав 1193 KB ≈ 407K токенів при вікні 200K — інструкція була фізично невиконанна |
| **Сторож `docs-fresh`** | падає, якщо пульс > 16 KB або обовʼязкове читання > 60K токенів | тихе розростання «обовʼязкового» списку |
| **Авто-блок з git** (`now_update.mjs`) | гілка, коміти, що не в main — генерується, не пишеться руками | дрейф документів і дорогі розслідування «що вже зроблено» |
| **Важке — лише Grep за темою** | літопис і довідники не читаються цілком | 30-50% вікна на один файл |
| **Скіл `caveman`** | відповіді ~70% коротші | токени виходу і контекст кожного наступного кроку |
| **Субагенти лише на прохання + `token-guard`** | стоп після субагента > 350K | субагент перечитує з нуля те, що чат уже знає |
| **`context-warning`** | сигнал на 70% і 85% вікна | робота в переповненому контексті, де кожен крок дорогий |
| **`/onovy` → новий чат** | передача стану через пульс | продовження в чаті на 90% замість свіжого на ~5K |
| **Журнал сесії по ходу** | факти записуються одразу | реконструкцію з памʼяті наприкінці (дорого і з втратами) |
| **`session-git-sync`** | fetch на старті | години на «відновлення» того, що вже на origin |
| **Літопис різати щомісяця** | старі місяці — в архів | місяць роботи = 300-400 KB, що повільно зʼїдає вікно |

---

## 📦 ФАЙЛИ

### `CLAUDE.md`

Вхід (читається автоматично). Якщо CLAUDE.md уже є — НЕ затирай: додай розділи «Точка входу», «Обовʼязкове читання» (з маркерами) і «Правила економії токенів», а старий зміст винеси в `docs/` і читай за темою.

~~~~markdown
# [НАЗВА ПРОЄКТУ] — контекст для Claude

> Цей файл читається автоматично в кожному чаті — тому він МАЛИЙ. Повний контекст —
> у `docs/`, і читається **за темою через Grep**, а не підряд.

## Точка входу

**Починай завжди з `docs/NOW.md` — пульс проєкту.** Де стоїмо зараз, що не доробили,
що спитати, що далі, чого не чіпати. Стеля — 200 рядків і 16 KB (тримає сторож
`tests/docs-fresh.mjs`). Верхній блок генерує git (`node scripts/now_update.mjs`).

## Обовʼязкове читання на старті (бюджет ≤ 60K токенів — міряє сторож)

<!-- MANDATORY:START — між маркерами сторож рахує бюджет. Додаєш файл — доведи, що бюджет тримається. -->

1. `docs/NOW.md` — пульс, читай ПЕРШИМ.

<!-- MANDATORY:END -->

## 💸 Правила економії токенів (діють завжди)

1. **Не читай важкі файли цілком.** Літопис, великі довідники, журнали — тільки
   `Grep` за темою або `Read` з `offset`/`limit`. Правило: спершу `NOW.md`, і лише
   якщо там бракує — точковий пошук.
2. **Субагентів (Agent/Task) — тільки коли людина прямо попросила.** Кожен стартує
   з нуля і перечитує те, що головний чат уже знає. Запобіжник `token-guard.js`
   зупиняє сесію, якщо один виклик спалив > 350K.
3. **Не перечитуй те, що щойно редагував, і те, що вже в контексті.** Edit/Write
   впали б, якби зміна не лягла.
4. **Вивід команд — коротко:** `| tail -20`, `| head`, `grep -c`, `--stat`, `-q`.
   Не друкуй цілі файли, логи, `package-lock`, збірки.
5. **Незалежні виклики — одним повідомленням паралельно**, а не по черзі.
6. **Відповіді стислі** — скіл `caveman` (без вступів, повторів, самоопису дій).
   Код, числа, попередження і питання до людини — повністю.
7. **Журнал сесії веди по ходу** (`_session-log/session-РРРР-ММ-ДД.md`), а не
   реконструюй наприкінці з памʼяті: це дешевше і нічого не губиться.
8. **Передача в новий чат — `/onovy`**, коли контекст ~70%+ (хук попередить).
   Новий чат із чистим пульсом дешевший за роботу в переповненому.
9. **Літопис різати щомісяця:** старі місяці — в `docs/_archive/`, живий файл —
   лише поточний місяць. Місяць роботи важить 300-400 KB.
10. **Стелю бюджету не піднімати** — вікно від цього не росте. Розрісся файл —
    стискай або винось в архів.

## Коротко про проєкт

[2-5 рядків: що це, стек, де деплой, головна гілка. Не більше.]
~~~~

### `docs/NOW.md`

Пульс проєкту — ЄДИНИЙ файл, який новий чат читає повністю. Створи і одразу перепиши прозу під реальний стан.

~~~~markdown
# NOW — пульс проєкту

> 🔴 Читається ПЕРШИМ у кожному чаті. Його самого має бути досить. Історія живе
> окремо (`_session-log/`, `docs/SESSION_STATE.md`) і читається вибірково, за темою.

<!-- AUTO:START -->
<!-- AUTO:END -->

---

## 🎯 ЗАРАЗ

Встановлено набір економії токенів. Наступний крок — переписати цей пульс під реальний стан проєкту.

## ✅ ЗРОБЛЕНО В ЦІЙ СЕСІЇ

Додано пульс, сторож бюджету читання, генератор авто-блоку, хуки, скіл стислості, команди /start і /onovy.

## 🚧 НЕ ДОРОБЛЕНО

Розділи цього файлу описують лише установку набору — переписати під справжній стан.

## ❓ ВІДКРИТІ ПИТАННЯ

Які файли справді потрібні на старті кожного чату (список MANDATORY у CLAUDE.md)?

## ➡️ ДАЛІ

1. Описати проєкт у CLAUDE.md (2-5 рядків). 2. Перенести сюди живий стан задач.

## 🛑 НЕ ЧІПАТИ

Стелю `tests/docs-fresh.mjs` (200 рядків / 16 KB / 60K токенів) не піднімати.
~~~~

### `scripts/now_update.mjs`

Генератор авто-блоку пульсу з git. Підлаштуй `MAIN` (назва бойової гілки) і `IS_AUTO` (префікс автокомітів ботів, якщо є).

~~~~js
// scripts/now_update.mjs — генератор авто-блоку пульсу docs/NOW.md.
// Принцип: що не пишеться руками — те не дрейфує. Усе, що знає git (гілка, коміти,
// що не доїхало в main, незакомічене), генерується сюди. Прозу поза блоком
// <!-- AUTO:START -->…<!-- AUTO:END --> скрипт НЕ чіпає ніколи.
//   node scripts/now_update.mjs           # перезаписати авто-блок
//   node scripts/now_update.mjs --check   # код 1, якщо блок застарів
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execFileSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = join(ROOT, 'docs', 'NOW.md');
const MAIN = 'main';                       // назва бойової гілки
const IS_AUTO = s => /^auto\(/.test(s);    // автокоміти ботів — не робота людини
const START = '<!-- AUTO:START -->', END = '<!-- AUTO:END -->';

const git = (...a) => { try {
  return execFileSync('git', ['-c', 'core.quotepath=false', ...a],
    { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], env: { ...process.env, TZ: 'UTC' } }).trim();
} catch { return ''; } };

const branch = git('branch', '--show-current') || '(detached)';
const human = git('log', '-40', '--date=format:%d.%m %H:%M', '--format=%h|%ad|%s')
  .split('\n').filter(Boolean).map(l => l.split('|')).filter(([, , s]) => s && !IS_AUTO(s)).slice(0, 4);
const base = git('rev-parse', '--verify', '-q', `origin/${MAIN}`) ? `origin/${MAIN}` : MAIN;
// Дві крапки = чесна різниця файлів (три крапки бреше після злиття main у гілку).
const notInMain = branch === MAIN ? [] : git('diff', '--name-only', `${base}..HEAD`).split('\n').filter(Boolean);
const dirty = git('status', '--porcelain').split('\n').filter(Boolean)
  .filter(l => !l.endsWith('docs/NOW.md')).length;   // сам пульс не рахуємо — інакше --check вічно червоний
const today = new Date().toISOString().slice(0, 10);
const log = join(ROOT, '_session-log', `session-${today}.md`);

const block = [START, '',
  '> 🤖 Блок генерує `scripts/now_update.mjs`. Руками не правити.', '',
  '| поле | значення |', '|---|---|',
  `| гілка | \`${branch}\` |`,
  `| останній коміт людини | ${human[0] ? `\`${human[0][0]}\` ${human[0][1]} — ${human[0][2]}` : '—'} |`,
  `| незакомічених файлів | ${dirty}${dirty ? ' ⚠️' : ' ✅'} |`,
  `| журнал за ${today} | ${existsSync(log) ? '✅ є' : '**НЕМАЄ** ⚠️'} |`, '',
  `**Не доїхало в \`${MAIN}\`:** ${notInMain.length ? '' : 'нічого ✅'}`,
  ...notInMain.slice(0, 15).map(f => `- \`${f}\``),
  ...(notInMain.length > 15 ? [`- …і ще ${notInMain.length - 15}`] : []), '',
  '**Останні кроки:**', ...human.map(([h, d, s]) => `- \`${h}\` ${d} — ${s}`), '', END].join('\n');

const text = readFileSync(NOW, 'utf8');
const a = text.indexOf(START), b = text.indexOf(END);
if (a < 0 || b < 0) { console.error('❌ У docs/NOW.md немає маркерів AUTO:START/END'); process.exit(1); }
const next = text.slice(0, a) + block + text.slice(b + END.length);
if (process.argv.includes('--check')) {
  if (next !== text) { console.error('❌ Авто-блок NOW.md застарів: node scripts/now_update.mjs'); process.exit(1); }
  console.log('✅ авто-блок свіжий'); process.exit(0);
}
writeFileSync(NOW, next);
console.log('✅ docs/NOW.md — авто-блок оновлено з git.');
~~~~

### `tests/docs-fresh.mjs`

Сторож бюджету читання. Стелі НЕ піднімати.

~~~~js
// tests/docs-fresh.mjs — СТОРОЖ БЮДЖЕТУ ЧИТАННЯ.
// Навіщо: обовʼязкове читання на старті сесії розростається непомітно. Заміряно в
// одному проєкті: 8 «обовʼязкових» файлів = 1193 KB ≈ 407 тис. токенів при вікні
// 200 тис. (204%). Новий чат читав верхівки, решту тихо губив — і виглядало це як
// «Claude не в курсі, що ми вже зробили». Сторож міряє бюджет і падає.
//   node tests/docs-fresh.mjs
import { readFileSync, existsSync, statSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const NOW = join(ROOT, 'docs', 'NOW.md');
const ENTRY = join(ROOT, 'CLAUDE.md');
const BYTES_PER_TOKEN = 3;          // кирилиця ≈ 3 байти на токен; латиниця дешевша — це запас
const NOW_MAX_LINES = 200, NOW_MAX_BYTES = 16 * 1024;   // ≈5K токенів — ціна, яку можна платити щоразу
const READ_BUDGET_TOKENS = 60_000;  // ≈30% вікна 200K: решта — на саму роботу
const ONE_FILE_MAX_TOKENS = 25_000; // один файл не має зʼїдати пів бюджету
const SECTIONS = ['ЗАРАЗ', 'ЗРОБЛЕНО', 'НЕ ДОРОБЛЕНО', 'ВІДКРИТІ ПИТАННЯ', 'ДАЛІ', 'НЕ ЧІПАТИ'];

let pass = 0, fail = 0;
const check = (cond, name, info = '') => {
  cond ? pass++ : fail++;
  console.log(`${cond ? '✅' : '❌'} ${name}${info ? '  — ' + info : ''}`);
};

check(existsSync(NOW), 'docs/NOW.md існує');
if (existsSync(NOW)) {
  const t = readFileSync(NOW, 'utf8');
  const lines = t.split('\n').length, bytes = Buffer.byteLength(t);
  check(lines <= NOW_MAX_LINES, `пульс ≤ ${NOW_MAX_LINES} рядків`, `${lines}`);
  check(bytes <= NOW_MAX_BYTES, `пульс ≤ ${NOW_MAX_BYTES / 1024} KB`, `${(bytes / 1024).toFixed(1)} KB`);
  check(t.includes('<!-- AUTO:START -->') && t.includes('<!-- AUTO:END -->'), 'є авто-блок');
  // Порожній розділ гірший за відсутній — він виглядає як відповідь.
  for (const s of SECTIONS) {
    const m = t.match(new RegExp(`\\n##[^\\n]*${s}[^\\n]*\\n([\\s\\S]*?)(?=\\n## |$)`));
    const body = m ? m[1].replace(/<!--[\s\S]*?-->/g, '').trim() : '';
    check(body.length > 10 && !/\[ЗАПОВНИ\]|\bTODO\b/i.test(body), `розділ «${s}» заповнений`, m ? `${body.length} симв.` : 'немає розділу');
  }
}

check(existsSync(ENTRY), 'CLAUDE.md існує');
if (existsSync(ENTRY)) {
  const t = readFileSync(ENTRY, 'utf8');
  const m = t.match(/<!--\s*MANDATORY:START[\s\S]*?-->([\s\S]*?)<!--\s*MANDATORY:END\s*-->/);
  check(!!m, 'у CLAUDE.md є маркери MANDATORY:START/END');
  if (m) {
    const files = [...new Set([...m[1].matchAll(/`([^`\s]+\.md)`/g)].map(x => x[1]))];
    let total = Buffer.byteLength(t);
    for (const f of files) {
      const p = join(ROOT, f);
      if (!existsSync(p)) { check(false, `обовʼязковий файл існує: ${f}`); continue; }
      const size = statSync(p).size, tok = Math.round(size / BYTES_PER_TOKEN);
      total += size;
      check(tok <= ONE_FILE_MAX_TOKENS, `${f} ≤ ${ONE_FILE_MAX_TOKENS / 1000}K токенів`, `≈${Math.round(tok / 1000)}K`);
    }
    const tokens = Math.round(total / BYTES_PER_TOKEN);
    check(tokens <= READ_BUDGET_TOKENS, `обовʼязкове читання ≤ ${READ_BUDGET_TOKENS / 1000}K токенів`,
      `≈${Math.round(tokens / 1000)}K (${files.length} файлів + CLAUDE.md)`);
  }
}
// КОНТРОЛЬ: вада, від якої сторож заведено, бюджет НЕ проходить (інакше стеля бутафорська).
check(Math.round(1193 * 1024 / BYTES_PER_TOKEN) > READ_BUDGET_TOKENS, 'КОНТРОЛЬ: 1193 KB бюджет не проходить');

console.log(`\n${fail ? '❌' : '✅'} ${pass}/${pass + fail} перевірок пройдено`);
process.exit(fail ? 1 : 0);
~~~~

### `.claude/skills/caveman/SKILL.md`

Скіл стислих відповідей (завжди активний).

~~~~markdown
---
name: caveman
description: "Режим стислої комунікації. Скорочує прозу відповідей ~70% без втрати змісту. ЗАВЖДИ активний за замовчуванням. Зберігає повністю: код, числа, назви файлів, команди, попередження, питання до людини."
---

# Caveman — стисла комунікація (завжди активний)

Це не команда, а стиль за замовчуванням. Кожне зайве слово у відповіді — токени
на виході і токени в контексті кожного наступного кроку.

## Прибирати

- Вступи: «Звісно!», «Чудово!», «Гарне питання», «Давайте розглянемо»
- Порожні звʼязки: «Варто зазначити, що…», «Слід відмітити…»
- Самоопис дій: «Я зараз відкрию файл і перегляну його вміст»
- Підсумки щойно сказаного: «Отже, як бачимо з вищесказаного…»
- Зайві ввічливості: «Будь ласка, дайте знати, якщо є питання»
- Таблиці й заголовки там, де вистачить списку з 2-3 рядків

## Зберігати завжди

- **Код** — повністю, без скорочень
- **Технічні деталі** — числа, назви файлів, команди
- **Попередження** — якщо дія незворотна або ризикована
- **Питання до людини** — якщо потрібне її рішення

## Рівень: `full`

Фрагменти замість повних речень — ок. Коротші синоніми — ок. Але думка завершена.

## Вимикати автоматично

- Пояснення нової концепції, якої людина ще не знає → повні речення
- Попередження про незворотну дію → повні речення

## Приклад

❌ «Чудово! Я зараз подивлюсь на файл `sw.js` і перевірю поточне значення `CACHE_NAME`. Це важливо зробити перед змінами, щоб правильно оновити версію.»

✅ «Дивлюсь `sw.js`, перевіряю `CACHE_NAME`.»
~~~~

### `.claude/commands/start.md`

Команда `/start` — старт сесії з мінімальним читанням.

~~~~markdown
# /start — швидкий старт сесії з мінімальним читанням

Без аргументів.

1. **Свіжий стан:** `git fetch origin -q && git status -sb | head -1 && git log --oneline -8`.
   Стан читай з `origin`, а не з файлів на диску.
2. **Журнал сесії:** створи `_session-log/session-<РРРР-ММ-ДД>.md` (є такий — додай
   літеру `b`, `c`). Дописуй рядок після кожної значущої дії: що · навіщо · що НЕ
   спрацювало · слова людини дослівно. Комітуй і пушуй кожні кілька кроків.
3. **Прочитай лише список між `MANDATORY:START/END` у `CLAUDE.md`** (починаючи з
   `docs/NOW.md`). Нічого більше «про запас». Решта — `Grep` за темою, коли тема
   справді виникла.
4. **Відповідь — коротко** (скіл `caveman`):
   > Прочитав. Гілка [X]. [1 рядок стану з NOW.md].
   > Топ-3 з «➡️ ДАЛІ»: 1… 2… 3…
   > Що робимо?
~~~~

### `.claude/commands/onovy.md`

Команда `/onovy` — передача стану в новий чат.

~~~~markdown
# /onovy — передати стан у новий чат (або на інший акаунт)

Коли: контекст ~70%+, сесія закінчується, людина пересідає на інший акаунт.
Мета: **після команди в репозиторії немає нічого, чого не побачить наступний чат**.
Новий чат із чистим пульсом коштує ~5K токенів на вхід; переповнений — сотні тисяч на кожен крок.

1. `date && git branch --show-current && git fetch origin -q && git status --short`
2. **Дописати журнал сесії** `_session-log/session-<дата>.md` — усе значуще, що ще
   не записано (що · навіщо · що НЕ спрацювало · слова людини дослівно · PR#).
3. **Пульс `docs/NOW.md`:** `node scripts/now_update.mjs` (авто-блок з git), потім
   РУКАМИ переписати прозу: 🎯 ЗАРАЗ · ✅ ЗРОБЛЕНО · 🚧 НЕ ДОРОБЛЕНО (з причиною) ·
   ❓ ВІДКРИТІ ПИТАННЯ · ➡️ ДАЛІ · 🛑 НЕ ЧІПАТИ. Жодної заглушки. Тримати ≤200 рядків /
   16 KB: старе — у журнал або літопис, не сюди.
4. **Літопис** `docs/SESSION_STATE.md` — короткий запис сесії зверху. Якщо файл
   > ~150 KB — винести минулі місяці в `docs/_archive/SESSION_STATE_<РРРР-ММ>.md`.
5. **Перевірка:** `node tests/docs-fresh.mjs` — червоне виправити (стискати, не
   піднімати стелю).
6. **Коміт усього + пуш** у робочу гілку. Ще раз `node scripts/now_update.mjs` →
   коміт → пуш (щоб авто-блок бачив останній коміт).
7. **Звіт людині коротко:** що передано, що лишилось недоробленим, перша дія для
   нового чату (`/start`).
~~~~

### `.claude/hooks/token-guard.js`

Запобіжник: зупиняє сесію після субагента, що спалив > 350K токенів.

~~~~js
#!/usr/bin/env node
// .claude/hooks/token-guard.js — ТОКЕН-ЗАПОБІЖНИК для субагентів.
// Якщо ОДИН Agent/Task-виклик спалив > LIMIT токенів → прапорець .claude/.token-halt,
// і КОЖЕН наступний інструмент блокується, доки людина не підтвердить продовження
// (тоді: rm .claude/.token-halt). Субагент стартує «з нуля» і перечитує те, що
// головний чат уже знає, — найдорожчий спосіб робити роботу.
//   'post' — PostToolUse (Agent|Task): заміряти, за перевищення поставити прапорець.
//   'pre'  — PreToolUse (*): прапорець є → deny (exit 2), крім команди, що його знімає.
// Fail-open: будь-яка помилка → exit 0 (сесію не ламаємо).
const fs = require('fs');
const path = require('path');

const FLAG = path.join(process.env.CLAUDE_PROJECT_DIR || path.join(__dirname, '..', '..'), '.claude', '.token-halt');
const LIMIT = 350000;
const mode = process.argv[2] || 'pre';

function tokensFrom(r) {
  if (!r || typeof r !== 'object') return 0;
  const u = r.usage || r.totalUsage || {};
  let sum = (Number(u.input_tokens || u.inputTokens || 0) || 0) + (Number(u.output_tokens || u.outputTokens || 0) || 0);
  if (!sum && typeof r.totalTokens === 'number') sum = r.totalTokens;
  if (!sum && u && typeof u.total_tokens === 'number') sum = u.total_tokens;
  return sum || 0;
}

let input = '';
process.stdin.on('data', c => (input += c));
process.stdin.on('end', () => {
  try {
    const d = JSON.parse(input || '{}');
    if (mode === 'post') {
      if (!/^(Agent|Task)$/.test(d.tool_name || '')) process.exit(0);
      const spent = tokensFrom(d.tool_response);
      if (spent > LIMIT) {
        try { fs.writeFileSync(FLAG, `HALT ${new Date().toISOString()} tool=${d.tool_name} tokens=${spent} limit=${LIMIT}\n`); } catch (_) {}
        console.error(`\n🛑 ТОКЕН-ЗАПОБІЖНИК: один ${d.tool_name}-виклик спалив ${spent.toLocaleString()} токенів (поріг ${LIMIT.toLocaleString()}).\n` +
          'Роботу зупинено. Продовжити — лише після підтвердження людини: rm .claude/.token-halt');
      }
      process.exit(0);
    }
    if (!fs.existsSync(FLAG)) process.exit(0);
    const cmd = (d.tool_input && d.tool_input.command) || '';
    if (d.tool_name === 'Bash' && /\brm\b/.test(cmd) && /\.token-halt/.test(cmd)) process.exit(0);
    console.error('\n🛑 СЕСІЯ НА ПАУЗІ (токен-запобіжник). ' + fs.readFileSync(FLAG, 'utf8').trim() +
      '\nСпитай людину. Після «так»: rm .claude/.token-halt');
    process.exit(2);
  } catch (_) { process.exit(0); }
});
~~~~

### `.claude/hooks/context-warning.sh`

Попередження про заповнення контексту (70% / 85%). Для вікна 1M — `CONTEXT_LIMIT=1000000`.

~~~~bash
#!/usr/bin/env bash
# .claude/hooks/context-warning.sh — UserPromptSubmit: попереджає, коли контекст заповнюється.
# Рахує РЕАЛЬНІ токени з usage останньої відповіді (input + кеш), а не байти файлу.
# Пороги — частка вікна CONTEXT_LIMIT. Не блокує, лише показує systemMessage.
CONTEXT_LIMIT="${CONTEXT_LIMIT:-200000}"   # вікно моделі; для 1M-вікна постав 1000000
input=$(cat)
command -v python3 >/dev/null 2>&1 || exit 0
tokens=$(printf '%s' "$input" | python3 -c '
import json, sys
try: tp = json.load(sys.stdin).get("transcript_path") or ""
except Exception: sys.exit(0)
last = None
try:
    with open(tp, encoding="utf-8") as f:
        for line in f:
            try: m = json.loads(line).get("message")
            except Exception: continue
            if isinstance(m, dict) and m.get("role") == "assistant" and isinstance(m.get("usage"), dict):
                last = m["usage"]
except Exception: sys.exit(0)
if last:
    print((last.get("input_tokens") or 0) + (last.get("cache_read_input_tokens") or 0) + (last.get("cache_creation_input_tokens") or 0))
' 2>/dev/null)
case "$tokens" in ''|*[!0-9]*) exit 0 ;; esac
pct=$(( tokens * 100 / CONTEXT_LIMIT )); k=$(( tokens / 1000 ))
if (( pct >= 85 )); then
  echo "{\"systemMessage\": \"🔴 КОНТЕКСТ ${pct}% (~${k}K) — зроби /onovy і переходь у новий чат\"}"
elif (( pct >= 70 )); then
  echo "{\"systemMessage\": \"⚠️ КОНТЕКСТ ${pct}% (~${k}K) — скоро /onovy; веди журнал сесії щокроку\"}"
fi
exit 0
~~~~

### `.claude/hooks/session-git-sync.sh`

git fetch на старті — щоб не «відновлювати» роботу, яка вже лежить на origin.

~~~~bash
#!/usr/bin/env bash
# .claude/hooks/session-git-sync.sh — SessionStart: git fetch + голосно, якщо щось відстає.
# Навіщо (і до чого тут токени): контейнер може відновитись на застарілий знімок git —
# тоді вже зроблена робота ВИГЛЯДАЄ втраченою, і Claude годинами «відновлює» те, що
# лежить на origin. Один fetch на старті дешевший за будь-яке розслідування.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-.}" 2>/dev/null || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0
if ! timeout 20 git fetch origin --quiet 2>/dev/null; then
  echo "⚠️ GIT-СИНК: git fetch не вдався (мережа?). Рефи можуть бути застарілі."; exit 0
fi
warn=""
if git rev-parse --verify -q origin/main >/dev/null && git rev-parse --verify -q main >/dev/null; then
  n=$(git rev-list --count main..origin/main 2>/dev/null || echo 0)
  [ "${n:-0}" -gt 0 ] && warn+=$'\n'"⚠️ Локальний main відстає від origin/main на ${n} комітів."
fi
cur=$(git branch --show-current 2>/dev/null || true)
if [ -n "$cur" ] && [ "$cur" != main ] && git rev-parse --verify -q "origin/$cur" >/dev/null; then
  n=$(git rev-list --count "$cur..origin/$cur" 2>/dev/null || echo 0)
  [ "${n:-0}" -gt 0 ] && warn+=$'\n'"⚠️ Гілка '$cur' відстає від origin/$cur на ${n} комітів."
fi
if [ -n "$warn" ]; then
  printf '🔄 GIT-СИНК: fetch виконано.%s\n➡️ «Щось зникло / git незрозумілий» — СПЕРШУ git fetch, потім висновки.\n' "$warn"
fi
exit 0
~~~~

### `.claude/settings.json`

Підключення хуків. Якщо файл уже є — ЗЛИЙ розділ `hooks` (не затирай `permissions` та інше).

~~~~json
{
  "hooks": {
    "SessionStart": [
      { "matcher": "startup|resume", "hooks": [
        { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/session-git-sync.sh\"" } ] }
    ],
    "UserPromptSubmit": [
      { "hooks": [
        { "type": "command", "command": "bash \"$CLAUDE_PROJECT_DIR/.claude/hooks/context-warning.sh\"" } ] }
    ],
    "PreToolUse": [
      { "matcher": "*", "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/token-guard.js\" pre" } ] }
    ],
    "PostToolUse": [
      { "matcher": "Agent|Task", "hooks": [
        { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/.claude/hooks/token-guard.js\" post" } ] }
    ]
  }
}
~~~~

---

## ✅ ПІСЛЯ УСТАНОВКИ — звички (людині й Claude)

- Новий чат починай з **`/start`**. Закінчуєш або контекст ~70% → **`/onovy`** → новий чат.
- Пиши задачу конкретно (файл, екран, що не так) — Claude не шукає по всьому репозиторію.
- Не проси «прочитай усе». Проси «знайди, де X» — це Grep, а не читання.
- Субагентів проси явно і лише для справді широкого пошуку.
