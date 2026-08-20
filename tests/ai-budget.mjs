// Стенд: ЗАПОБІЖНИКИ ВИТРАТ НА МОДЕЛЬ.
//
// 🔴 ЗАРАДИ ЧОГО. 20.08 Вова поклав на баланс $5 і поставив пряму вимогу: «щоб
// ці гроші не зʼїло за один день» і «щоб вхолосту не робили». На той момент:
//   • новинний агент мав місячну стелю ($4) і стелю прогону ($1.20) з 08.07;
//   • конвеєр редактора (свята + агент спільноти) не мав ЖОДНОЇ стелі;
//   • добової стелі не було НІДЕ — тобто місячні $4 технічно зникали за добу.
//
// 🛑 ЧОМУ ЦЕЙ СТЕНД НЕ ШУКАЄ СЛОВА В КОДІ. Перевірка «у файлі є рядок MAX_DAY»
// зелена і на коді, де стелю порахували, але забули за нею спинитись. Тому тут
// запобіжник ЗАПУСКАЄТЬСЯ по-справжньому — на підробленому журналі витрат — і
// ми дивимось, чи він каже «стоп». Плюс контроль: на порожньому журналі він
// мусить мовчати, інакше «спиняє завжди» теж зійшло б за успіх.
import { execFileSync } from 'child_process';
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { tmpdir } from 'os';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { reporter } from './_lib.mjs';

const { ok, done } = reporter();
const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');

/** Запускає `spend.budget_block()` у тимчасовій теці з підробленим журналом. */
function запобіжник(журнал, env = {}) {
  const дір = mkdtempSync(join(tmpdir(), 'cstl-budget-'));
  mkdirSync(join(дір, 'data'), { recursive: true });
  writeFileSync(join(дір, 'data', 'ai_spend.json'), JSON.stringify(журнал));
  const код = `
import sys; sys.path.insert(0, ${JSON.stringify(ROOT)})
from editor.core import spend
print(spend.budget_block())`;
  return execFileSync('python3', ['-c', код], {
    cwd: дір, encoding: 'utf-8', env: { ...process.env, ...env },
  }).trim();
}

const місяць = new Date().toISOString().slice(0, 7);
const зараз = Date.now();

// ── 1. МІСЯЧНА СТЕЛЯ СПИНЯЄ ──────────────────────────────────────────────────
const надМісяць = запобіжник({
  runs: [], totals: {}, months: { [місяць]: { cost_usd: 4.5, runs: 9 } },
});
ok('🔴 місячна стеля СПИНЯЄ виклик моделі (не просто рахує)',
   /місячна стеля/.test(надМісяць), надМісяць || '— мовчить');

// ── 2. ДОБОВА СТЕЛЯ СПИНЯЄ ───────────────────────────────────────────────────
// Головна вимога Вови: місячної мало, бо $4 можна витратити за одну добу.
const надДобу = запобіжник({
  runs: [{ ts: зараз - 3600e3, cost_usd: 0.9 }, { ts: зараз - 600e3, cost_usd: 0.5 }],
  totals: {}, months: { [місяць]: { cost_usd: 1.4, runs: 2 } },
});
ok('🔴 добова стеля СПИНЯЄ («щоб не зʼїло за один день»)',
   /добова стеля/.test(надДобу), надДобу || '— мовчить');

// ── 3. ВІКНО РУХОМЕ, А НЕ КАЛЕНДАРНЕ ─────────────────────────────────────────
// Календарна доба дала б обхід: витратити все ввечері й повторити після півночі.
const учора = запобіжник({
  runs: [{ ts: зараз - 30 * 3600e3, cost_usd: 3.0 }],
  totals: {}, months: { [місяць]: { cost_usd: 3.0, runs: 1 } },
});
ok('витрати старші за 24 год у добову стелю не рахуються',
   !/добова стеля/.test(учора), учора || 'пропускає — правильно');

// ── 4. КОНТРОЛЬ: НА ЧИСТОМУ ЖУРНАЛІ ЗАПОБІЖНИК МОВЧИТЬ ───────────────────────
// Без цієї перевірки «спиняє завжди» виглядало б як робочий запобіжник.
const чисто = запобіжник({ runs: [], totals: {}, months: {} });
ok('КОНТРОЛЬ: на чистому журналі запобіжник НЕ спиняє',
   чисто === '', чисто || 'мовчить');

// ── 5. СТЕЛЮ МОЖНА ЗАДАТИ ЗМІННОЮ СЕРЕДОВИЩА ─────────────────────────────────
// Щоб змінити ліміт, не треба правити код — інакше «тимчасово підняти» означало б
// коміт у бойову гілку.
const строгіше = запобіжник(
  { runs: [], totals: {}, months: { [місяць]: { cost_usd: 0.5, runs: 1 } } },
  { AI_MAX_MONTH_USD: '0.10' });
ok('стелю можна змінити змінною середовища, не правкою коду',
   /місячна стеля/.test(строгіше), строгіше || '— мовчить');

// ── 6. КОШИК ОДИН НА ВСІХ АГЕНТІВ ────────────────────────────────────────────
// Три окремі ліміти по $4 дали б $12 — рівно те, чого просили уникнути.
const spendPy = readFileSync(join(ROOT, 'editor/core/spend.py'), 'utf-8');
const newsPy = readFileSync(join(ROOT, 'scripts/ai_news_agent.py'), 'utf-8');
ok('🔴 усі агенти рахують з ОДНОГО журналу (спільний кошик)',
   /data\/ai_spend\.json/.test(spendPy) && /data\/ai_spend\.json/.test(newsPy));
ok('обидва читають ту саму змінну стелі (не розʼїдуться при зміні)',
   /AI_MAX_MONTH_USD/.test(spendPy) && /AI_MAX_MONTH_USD/.test(newsPy)
   && /AI_MAX_DAY_USD/.test(spendPy) && /AI_MAX_DAY_USD/.test(newsPy));

// ── 7. ЗАПОБІЖНИК СТОЇТЬ ПЕРЕД РОБОТОЮ, А НЕ ПІСЛЯ ───────────────────────────
const runPy = readFileSync(join(ROOT, 'editor/run.py'), 'utf-8');
ok('🔴 конвеєр редактора питає стелю ПЕРЕД запуском місії',
   runPy.indexOf('budget_block()') < runPy.indexOf('Pipeline(mission).run'),
   `стеля на ${runPy.indexOf('budget_block()')}, робота на ${runPy.indexOf('Pipeline(mission).run')}`);
ok('`--dry-run` стеля не глушить (він не витрачає грошей)',
   /if not args\.dry_run:\s*\n\s*блок = spend\.budget_block\(\)/.test(runPy));

// ── 7б. ДОБОВА СТЕЛЯ НОВИННОГО АГЕНТА ТЕЖ ЖИВА ───────────────────────────────
// Він окремий скрипт зі своїм лічильником, тому перевіряємо його теж запуском,
// а не збігом слів: підсовуємо витрату $1.5 за годину тому і питаємо функцію.
const деньНовин = execFileSync('python3', ['-c', `
import importlib.util, json, time
spec = importlib.util.spec_from_file_location('ag', ${JSON.stringify(join(ROOT, 'scripts/ai_news_agent.py'))})
m = importlib.util.module_from_spec(spec); spec.loader.exec_module(m)
print(m.day_spend_usd(), m.MAX_DAY_COST_USD)`], {
  cwd: (() => {
    const d = mkdtempSync(join(tmpdir(), 'cstl-news-budget-'));
    mkdirSync(join(d, 'data'), { recursive: true });
    writeFileSync(join(d, 'data', 'ai_spend.json'), JSON.stringify(
      { runs: [{ ts: зараз - 3600e3, cost_usd: 1.5 }], totals: {}, months: {} }));
    return d;
  })(),
  encoding: 'utf-8',
}).trim().split(/\s+/).map(Number);
ok('🔴 новинний агент теж має живу добову стелю (не лише місячну)',
   деньНовин[0] >= деньНовин[1] && деньНовин[1] > 0,
   `за добу $${деньНовин[0]} проти стелі $${деньНовин[1]}`);

// ── 8. ВХОЛОСТУ НЕ ХОДИМО ────────────────────────────────────────────────────
// Друга вимога Вови. Ці пропуски вже були — стенд не дає їх випадково зняти.
ok('🔴 новинний агент не кличе модель, коли чернеток уже досить',
   /пропускаю виклик API/.test(newsPy));
const planPy = readFileSync(join(ROOT, 'editor/sources/plan.py'), 'utf-8');
ok('🔴 агент спільноти не кличе модель, коли тем у плані немає',
   /план вичерпано/.test(planPy));
const brandPy = readFileSync(join(ROOT, 'editor/writers/brand_writer.py'), 'utf-8');
ok('без ключа модель не кличеться взагалі',
   /немає ANTHROPIC_API_KEY — пропускаю/.test(brandPy));

done();
