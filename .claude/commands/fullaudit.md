# /fullaudit — Незалежний повний аудит УСЬОГО застосунку CSTL

> **Не плутати з `/audit`.** `/audit` — легкий діф-чеклист після своєї ж роботи (тільки змінені файли, той самий агент, без верифікації). `/fullaudit` — **інший клас**: незалежний, об'єктивний, глибокий і широкий аудит **усього застосунку**, з adversarial-верифікацією кожної знахідки. Ліміти токенів/часу — НЕ пріоритет; пріоритет — повнота й правдивість.

Цей скіл живе в репозиторії (`.claude/commands/fullaudit.md`) і працює для будь-кого, хто викличе `/fullaudit` у цьому репо — не лише в одній сесії.

---

## Принципи (чому результат об'єктивний)

1. **Незалежність.** Агент, що ПЕРЕВІРЯЄ, не є агентом, що писав код, і **не бачить контексту «ми щойно зробили X»**. Subagent'и Workflow не успадковують контекст головної розмови — бачать лише промпт, який ти їм даєш. Тому **не передавай їм історію сесії** — тільки хартію вимірювання + карту застосунку. Так вони фізично не можуть підтверджувати себе за інерцією.
2. **Adversarial-верифікація.** Кожна знахідка проходить через **3 незалежні спростувачі з РІЗНИМИ лінзами**, які перечитують реальний код і намагаються довести, що знахідка НЕ справжня. Виживає лише незаперечене.
3. **Whole-app, не діф.** Кожне вимірювання сканує ВЕСЬ застосунок, а не лише нещодавно змінене.
4. **Лише ЗНАХОДИТЬ, не виправляє.** Рішення що робити — за власником.
5. **Обидва боки однаково сильні.** І FIND, і VERIFY агенти — `effort: 'high'`. Слабший спростувач штампував би «спростовано» нашвидкуруч — не допускається.

---

## Крок 0 — SCOUT (інлайн, до Workflow)

Побудуй карту застосунку — інвентар усього коду, щоб кожне вимірювання мало спільну ціль і нічого не пропустило. Через `Glob`/`Bash ls`/`wc -l`:

```
src/**  ·  index.html  ·  admin.html  ·  sw.js  ·  manifest.json
style/**  ·  supabase/functions/**  ·  scripts/*.py + scripts/*.sql
data/*.json (схема)  ·  .github/workflows/**  ·  editor/**
```

Склади короткий текстовий список файлів (шлях + розмір рядків для великих) → передай у Workflow як `args.map`.

---

## Крок 1 — Запусти Workflow (pipeline: FIND → parallel VERIFY)

Виклич інструмент `Workflow` з наведеним нижче скриптом, `args: { map: <карта з Кроку 0> }`. Скрипт: 13 вимірювань шукають паралельно (кожне — весь застосунок), кожна знахідка одразу йде на 3-лінзову верифікацію (pipeline без бар'єру).

```js
export const meta = {
  name: 'fullaudit',
  description: 'Незалежний повнорепозиторний аудит CSTL — 13 вимірювань, adversarial verify',
  phases: [
    { title: 'Find',   detail: '13 вимірювань, кожне сканує весь застосунок' },
    { title: 'Verify', detail: '3 спростувачі-лінзи на кожну знахідку (high effort)' },
  ],
}

const MAP = (args && args.map) ? args.map
  : '(карту не передано — дискаверь сам через Glob/Grep по всьому репо)'

// ── 13 вимірювань (8 базових + 5 CSTL-специфічних). Кожне — весь застосунок. ──
const DIMENSIONS = [
  { key: 'correctness',  charter: 'Правильність/логіка: реальні баги, race conditions (гонки станів), edge cases (граничні випадки), неправильні умови, off-by-one, невірна обробка null/undefined, неправильний порядок await.' },
  { key: 'security',     charter: 'Безпека: XSS (невтеча користувацького вводу в innerHTML/textContent), injection, витік секретів/ключів у код чи логи, дірки в Supabase RLS (row-level security), SECURITY DEFINER без owner-check, довіра клієнтському payload на сервері.' },
  { key: 'data',         charter: 'Цілісність даних/схема: orphaned FK (осиротілі зовнішні ключі), дедуп-логіка (чи справді унікальна), дрейф SQL-міграцій (scripts/*.sql) vs реальні запити в коді, невідповідність data/*.json структури тому, що читає код, constraint-и що суперечать вставкам.' },
  { key: 'performance',  charter: 'Продуктивність: N+1 запити до Supabase, необмежені цикли/рекурсія, важкі payload, зайві повні вибірки, відсутність пагінації, синхронні важкі операції в рендер-шляху, розмір зображень/асетів.' },
  { key: 'deadcode',     charter: 'Мертвий код/дублі: невикористані функції/змінні/експорти/CSS-класи, розбіжні копії однієї логіки між файлами й між власниками (напр. ICONS у бандлі vs власний мірор в admin.html — чи не розійшлись).' },
  { key: 'architecture', charter: 'Архітектурна консистентність: дрейф патернів між модулями (різні способи робити те саме), порушення шарів (tab імпортує з іншого tab), циклічні залежності, розсинхрон конвенцій.' },
  { key: 'silentfail',   charter: 'Тиха відмова (silent failure): порядок onerror (капчур-фаза), мовчазний return при порожніх даних, catch що ковтає помилку без сигналу, fallback що маскує зламаний стан. САМЕ цей клас уже кілька разів пік у цьому репо — копай прискіпливо.' },
  { key: 'crossowner',   charter: 'Крос-власницькі конфлікти: зони де код різних власників торкається одне одного без координації (board.js ↔ board-discussions.js ↔ board-shared.js, admin.html, core/modal.js, core/icons.js, sw.js). Дублі, розсинхрон, суперечливі припущення про спільний стан.' },
  { key: 'sw_cache',     charter: 'Service Worker/кеш/PWA: дисципліна CACHE_NAME, network-first vs cache-first пастки, offline-fallback (index.html замість картинки?), сліди git-конфлікт-маркерів у sw.js, STATIC_ASSETS повнота, «застряглий старий код» після деплою.' },
  { key: 'push_edge',    charter: 'Push/Edge Functions (supabase/functions/**): null-payload (напр. msg.text.length коли text=null для фото), select що не тягне потрібні поля, межі довіри service_role, verify_jwt, VAPID, обробка мертвих підписок (410/404).' },
  { key: 'ios_fragility',charter: 'iOS Safari/PWA-крихкість: touch-латч цілі скролу (рішення на touchstart без переоцінки), visualViewport-клавіатура, sticky/fixed шапки при негативних margin, passive-слухачі + preventDefault, елементи що ламаються саме в standalone-PWA на iOS.' },
  { key: 'build',        charter: 'Build/bundle-цілісність: check-imports, дрейф bundle.js vs src/ (чи бандл відповідає джерелу), IIFE-формат, порядок імпортів у src/app.js, esbuild-конфіг, чи всі нові файли підхоплені.' },
  { key: 'content_pipe', charter: 'Контент-пайплайн: RSS-парсер (scripts/parse_rss.py), sync_cms.py, cabinet (editor/**), дедуп статей/подій/свят, promote_scheduled, дрейф data/articles|events|holidays.json схеми vs код що її читає, класифікатор news/event.' },
]

const FINDINGS_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    findings: {
      type: 'array',
      items: {
        type: 'object', additionalProperties: false,
        properties: {
          title:    { type: 'string' },
          file:     { type: 'string' },
          line:     { type: 'integer' },
          severity: { type: 'string', enum: ['critical','high','medium','low'] },
          scenario: { type: 'string', description: 'Конкретний вхід/стан → що саме ламається' },
          evidence: { type: 'string', description: 'Цитата/опис реального коду, що доводить' },
        },
        required: ['title','file','line','severity','scenario'],
      },
    },
    coverageNote: { type: 'string', description: 'Що під цим кутом НЕ вдалось перевірити і чому (порожньо якщо все охоплено)' },
  },
  required: ['findings'],
}

const VERDICT_SCHEMA = {
  type: 'object', additionalProperties: false,
  properties: {
    real:       { type: 'boolean' },
    confidence: { type: 'string', enum: ['high','medium','low'] },
    reasoning:  { type: 'string', description: 'Конкретно, з посиланням на реально прочитаний код' },
  },
  required: ['real','confidence','reasoning'],
}

const LENSES = [
  { key: 'reachable',  q: 'Чи шлях коду цієї знахідки РЕАЛЬНО досяжний у застосунку (є виклик, не мертвий код, не за неможливою умовою)? Перечитай реальний код.' },
  { key: 'guarded',    q: 'Чи вже є guard / санітизація / early-return / тип-перевірка десь поруч, що це закриває? Перечитай код навколо знахідки.' },
  { key: 'reproduces', q: 'Візьми конкретний вхід зі сценарію і прожени його в голові по РЕАЛЬНОМУ коду — воно справді ламається? Перечитай file:line і повʼязані місця.' },
]

function auditPrompt(d) {
  return `Ти незалежний аудитор коду. Тобі НЕ відомо, що недавно змінювалось — не довіряй жодним припущенням про «нещодавню роботу», читай ЛИШЕ реальний код.
Репозиторій: CSTL LIFE — PWA центру життя громади міста Олика (ванільний JS, GitHub Pages, Supabase, esbuild).
Карта застосунку:
${MAP}

ТВОЄ ВИМІРЮВАННЯ: ${d.charter}

Проскануй ВЕСЬ застосунок під цим кутом (Glob/Grep/Read по src/**, index.html, admin.html, sw.js, style/**, supabase/functions/**, scripts/*, data/*.json, .github/workflows/**, editor/**). НЕ обмежуйся нещодавно зміненим.
Кожна знахідка МУСИТЬ мати: точний file:line, severity, і КОНКРЕТНИЙ сценарій відмови (вхідні дані/стан → що саме ламається) — не «могло б бути безпечніше». Без конкретного сценарію — це не знахідка, не включай.
Якщо під цим кутом чисто — поверни порожній масив findings (не вигадуй проблем). У coverageNote чесно опиши, що не зміг перевірити (напр. жива Supabase RLS без доступу до БД).`
}

function refutePrompt(f, lens) {
  return `Ти незалежний, СИЛЬНИЙ рецензент-СПРОСТУВАЧ. Задача — чесно перевірити, чи ця нібито-знахідка справжня, перечитавши РЕАЛЬНИЙ код. Не штампуй «спростовано» нашвидкуруч — це так само погано, як фальшива знахідка.
Ти НЕ бачив, хто і коли писав цей код. Суди лише за реальним кодом.

ЗНАХІДКА: [${f.severity}] ${f.title}
  місце: ${f.file}:${f.line}
  сценарій відмови: ${f.scenario}
  докази автора: ${f.evidence || '—'}

ТВІЙ ЛІНЗ ПЕРЕВІРКИ: ${lens.q}

Відкрий ${f.file} біля рядка ${f.line}, перечитай реальний код і повʼязані місця. Спробуй спростувати сценарій під своїм лінзом.
Поверни real=true ЛИШЕ якщо після реального перечитування сценарій справді тримається. Якщо непевно, або сценарій не відтворюється, або вже є захист — real=false. confidence — чесно (high лише коли ти реально впевнений і прочитав код). reasoning — конкретно, з посиланням на те, що саме прочитав.`
}

phase('Find')
const results = await pipeline(
  DIMENSIONS,
  // Стадія 1 — пошук (кожне вимірювання, весь застосунок, high effort)
  (d) => agent(auditPrompt(d), {
    label: `find:${d.key}`, phase: 'Find',
    schema: FINDINGS_SCHEMA, effort: 'high', agentType: 'general-purpose',
  }).then(r => ({ d, r })),
  // Стадія 2 — верифікація кожної знахідки цього виміру (3 лінзи паралельно, high effort)
  ({ d, r }) => {
    const list = (r && r.findings) ? r.findings : []
    const coverageNote = (r && r.coverageNote) ? r.coverageNote : ''
    return parallel(list.map(f => () =>
      parallel(LENSES.map(lens => () =>
        agent(refutePrompt(f, lens), {
          label: `verify:${d.key}:${lens.key}`, phase: 'Verify',
          schema: VERDICT_SCHEMA, effort: 'high', agentType: 'general-purpose',
        })
      )).then(verdicts => {
        const v = verdicts.filter(Boolean)
        const reals = v.filter(x => x.real)
        // ≥2/3 real → confirmed.
        // Рівно 1/3 real АЛЕ high-confidence + конкретне пояснення → second-look (НЕ мовчазний drop).
        // Інакше → refuted.
        const strongSingle = reals.length === 1 &&
          reals[0].confidence === 'high' &&
          (reals[0].reasoning || '').trim().length > 40
        let status
        if (reals.length >= 2) status = 'confirmed'
        else if (strongSingle) status = 'second-look'
        else status = 'refuted'
        return { ...f, dimension: d.key, realVotes: reals.length, verdicts: v, status }
      })
    )).then(checked => ({ dimension: d.key, coverageNote, checked: checked.filter(Boolean) }))
  }
)

// results: [{ dimension, coverageNote, checked:[...] }] (по одному на вимірювання)
const clean = results.filter(Boolean)
const flat = clean.flatMap(x => x.checked)
const confirmed  = flat.filter(x => x.status === 'confirmed')
const secondLook = flat.filter(x => x.status === 'second-look')
const refuted    = flat.filter(x => x.status === 'refuted')
const coverage   = clean.map(x => ({ dimension: x.dimension, note: x.coverageNote }))
                        .filter(x => x.note && x.note.trim())
// вимірювання, чий find-агент упав (null) → не перевірені повністю
const ranDims = new Set(clean.map(x => x.dimension))
const failedDims = DIMENSIONS.map(d => d.key).filter(k => !ranDims.has(k))

return { confirmed, secondLook, refuted, coverage, failedDims,
         totals: { dimensions: DIMENSIONS.length,
                   confirmed: confirmed.length,
                   secondLook: secondLook.length,
                   refuted: refuted.length } }
```

**Ітерація скрипта:** Workflow персистить скрипт у файл і повертає шлях — правь той файл і перезапускай `Workflow({scriptPath})`, а не пересилай весь скрипт.

---

## Крок 2 — SYNTHESIS + звіт (інлайн, після Workflow)

З результату Workflow збери звіт **саме в такому форматі**:

1. **🔴 ПІДТВЕРДЖЕНІ ЗНАХІДКИ** (`confirmed`) — ранжовані за severity (critical → low). Кожна:
   `[severity] Заголовок` · `file:line` · **сценарій відмови** (вхід → що ламається) · вимірювання.
2. **🟡 НЕПІДТВЕРДЖЕНО, ВАРТЕ ДРУГОГО ПОГЛЯДУ** (`secondLook`) — знахідки, де рівно 1 з 3 спростувачів сказав «real» з high-confidence і конкретним поясненням. Не викинуті — на людське рішення. Дай file:line + сценарій + чому спростувачі розійшлись.
3. **⚪ СПРОСТОВАНІ** (`refuted`) — лише кількість (за замовчуванням не розписуй; за запитом — покажи).
4. **📊 ТАБЛИЦЯ по 13 вимірюваннях:** знайдено / підтверджено / варте-погляду / спростовано.
5. **🚫 ЩО НЕ ПЕРЕВІРЕНО ЦЬОГО РАЗУ** — з `coverage` (нотатки агентів) + `failedDims` (впалі вимірювання) + відомі обмеження середовища (жива Supabase RLS не звірена, бо MCP `supabase` не авторизований; браузерні смоуки за логіном/прихованих вкладок). **Ця секція обов'язкова — мовчазне «все чисто» без неї заборонено.**

**Аудит лише ЗНАХОДИТЬ.** Нічого не виправляй у цьому запуску — після звіту запитай власника, що робити зі знахідками.

---

## Примітки

- **Зона:** системний скіл (`.claude/`, спільна). Позначай для іншого власника у BOARD/PR.
- **Незалежність від сесії:** НЕ вставляй у промпти агентів опис «що ми недавно робили». Дай лише хартію + карту. У цьому вся об'єктивність.
- **Обсяг:** 13 finder-агентів + (знахідки × 3 verify). Токени не економити — це свідомий вибір задля повноти (глобальний backstop Workflow — 1000 агентів, є запас).
- **Опт-ін Workflow:** виклик `/fullaudit` = дозвіл на оркестрацію (скіл прямо інструктує запустити Workflow).
