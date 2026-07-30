#!/usr/bin/env node
// scripts/check-imports.js — guard перед esbuild.
//
// Виявляє забуті ESM-імпорти: коли identifier викликається у файлі,
// але не імпортований, не задекларований локально і не у whitelist глобалів.
//
// Парсинг через regex (без AST). Свідомі обмеження:
//   • dynamic calls obj[key]() — пропускаються
//   • method calls obj.method() — пропускаються через negative-lookbehind на крапку
//   • Виклики у рядках/коментарях прибираються strip-функцією
//
// Запускається з build.js. Exit 0 — чисто, exit 1 — є попередження.

'use strict';

const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, '..', 'src');

// ── Whitelist глобалів (НЕ попереджуємо про ці імена) ────────────────────────
const WHITELIST = new Set([
  // JS keywords/literals що матчаться як виклики (if(, while(, etc.)
  'if', 'while', 'for', 'switch', 'return', 'throw', 'typeof', 'delete',
  'void', 'async', 'await', 'yield', 'function', 'class', 'super',
  'this', 'extends', 'instanceof', 'in', 'of', 'do', 'try', 'catch',
  'finally', 'case', 'break', 'continue', 'else', 'new', 'true',
  'false', 'null', 'undefined', 'with', 'debugger', 'static',
  'export', 'import', 'from', 'as', 'default',

  // JS builtins
  'console', 'Math', 'JSON', 'Object', 'Array', 'String', 'Number',
  'Boolean', 'Date', 'Promise', 'Error', 'TypeError', 'RangeError',
  'SyntaxError', 'Symbol', 'Map', 'Set', 'WeakMap', 'WeakSet',
  'Reflect', 'Proxy', 'RegExp', 'parseInt', 'parseFloat', 'isNaN',
  'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'encodeURI',
  'decodeURI', 'NaN', 'Infinity',

  // Browser/Node globals
  'window', 'document', 'localStorage', 'sessionStorage', 'fetch',
  'setTimeout', 'setInterval', 'clearTimeout', 'clearInterval',
  'requestAnimationFrame', 'cancelAnimationFrame', 'requestIdleCallback',
  'IntersectionObserver', 'MutationObserver', 'ResizeObserver',
  'PerformanceObserver', 'URL', 'URLSearchParams', 'FormData', 'Blob',
  'File', 'FileReader', 'Image', 'HTMLElement', 'Element', 'Node',
  'NodeList', 'Event', 'CustomEvent', 'KeyboardEvent', 'TouchEvent',
  'MouseEvent', 'PointerEvent', 'PopStateEvent', 'crypto', 'navigator',
  'location', 'history', 'alert', 'confirm', 'prompt', 'screen', 'atob', 'btoa',
  'performance', 'caches', 'self', 'addEventListener', 'removeEventListener',
  'matchMedia', 'getComputedStyle', 'AbortController', 'AbortSignal',
  'Notification', 'Worker', 'ServiceWorker', 'BroadcastChannel',
  'Response', 'Request', 'Headers', 'Uint8Array', 'Promise',

  // Module globals (CommonJS / Node)
  'require', 'module', 'exports', 'process', 'Buffer', '__dirname',
  '__filename', 'global', 'globalThis',
]);

// ── Збирання .js файлів у src/ ───────────────────────────────────────────────
function collectJsFiles(dir) {
  const result = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      result.push(...collectJsFiles(full));
    } else if (entry.name.endsWith('.js')) {
      result.push(full);
    }
  }
  return result;
}

// ── Прибрати коментарі і рядкові літерали з одного рядка ─────────────────────
function stripLine(line) {
  let s = line.replace(/\/\/.*$/, '');
  // Прості рядкові літерали — замінюємо вміст на порожній
  s = s.replace(/'(?:\\.|[^'\\])*'/g, "''");
  s = s.replace(/"(?:\\.|[^"\\])*"/g, '""');
  s = s.replace(/`(?:\\.|[^`\\])*`/g, '``');
  return s;
}

// ── Прибрати multi-line block comments перед аналізом всього файлу ───────────
//
// 🔴 29.07 — СЛІПА ПЛЯМА, ЯКА ПОКЛАЛА ДЕПЛОЙ #3529.
// У `board-chat.js` є HTML-атрибут `accept="image/*"` усередині шаблонного рядка.
// Для цієї регулярки `/*` там — ПОЧАТОК блок-коментаря. Поки у файлі нижче не було
// жодного `*/`, збігу не траплялось і все мовчало. Щойно з'явився ПЕРШИЙ звичайний
// блок-коментар (`/* … */` за 400 рядків нижче) — регулярка «закрила» коментар на
// ньому і викинула ВЕСЬ проміжок разом із десятком оголошень. Виклики лишились,
// оголошення зникли → 9 хибних «called but not imported/declared».
// ⚠️ Тобто помилку дав не той рядок, у якому її показали, і не той, що її вніс.
//
// Лікуємо корінь: спершу гасимо ОДНОРЯДКОВІ рядки в подвійних лапках (саме там
// живуть HTML-атрибути), і лише потім шукаємо блок-коментарі.
// ⚠️ Одинарні лапки НЕ чіпаємо навмисно: у проєкті українські коментарі рясніють
// апострофами («ім'я», «оголошень»), і парне гасіння з'їдало б живий код між ними.
// ⚠️ Довжину рядка зберігаємо (пробіли замість вмісту) — номери рядків і колонок
// мусять лишитись тими самими, інакше повідомлення вкажуть не туди.
function blankDoubleQuoted(content) {
  return content.replace(/"(?:\\.|[^"\\\n])*"/g, m => '"' + ' '.repeat(Math.max(0, m.length - 2)) + '"');
}
function stripBlockComments(content) {
  return blankDoubleQuoted(content).replace(/\/\*[\s\S]*?\*\//g, '');
}

// ── Витягнути імпортовані імена ──────────────────────────────────────────────
function extractImports(content) {
  const imports = new Set();
  // named: import { a, b as c } from '...'
  for (const m of content.matchAll(/import\s*\{([\s\S]+?)\}\s*from\s*['"][^'"]+['"]/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split(/\s+as\s+/).pop().trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) imports.add(name);
    }
  }
  // default: import X from '...'
  for (const m of content.matchAll(/import\s+([A-Za-z_$][\w$]*)\s*(?:,\s*\{[^}]*\})?\s*from\s*['"][^'"]+['"]/g)) {
    imports.add(m[1]);
  }
  // namespace: import * as X from '...'
  for (const m of content.matchAll(/import\s*\*\s*as\s+([A-Za-z_$][\w$]*)\s+from\s*['"][^'"]+['"]/g)) {
    imports.add(m[1]);
  }
  return imports;
}

// ── Витягнути локальні declarations (включно з параметрами функцій) ──────────
function extractDeclarations(content) {
  const decls = new Set();

  // const/let/var X = ...   (можливо з export)
  for (const m of content.matchAll(/(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/g)) {
    decls.add(m[1]);
  }
  // function X / async function X / export function X / export default function X / function* X
  for (const m of content.matchAll(/(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)\s*\(/g)) {
    decls.add(m[1]);
  }
  // class X
  for (const m of content.matchAll(/(?:export\s+(?:default\s+)?)?class\s+([A-Za-z_$][\w$]*)/g)) {
    decls.add(m[1]);
  }

  // Object destructuring: const { a, b: alias, c = def } = ...
  for (const m of content.matchAll(/(?:const|let|var)\s*\{([^}]+)\}\s*=/g)) {
    for (const part of m[1].split(',')) {
      let name = part.trim();
      if (!name) continue;
      if (name.includes(':')) name = name.split(':')[1].trim();
      name = name.split('=')[0].trim();
      name = name.replace(/[\{\}\s]/g, '');
      if (/^[A-Za-z_$][\w$]*$/.test(name)) decls.add(name);
    }
  }

  // Array destructuring: const [a, b] = ...
  for (const m of content.matchAll(/(?:const|let|var)\s*\[([^\]]+)\]\s*=/g)) {
    for (const part of m[1].split(',')) {
      const name = part.trim().split('=')[0].trim();
      if (/^[A-Za-z_$][\w$]*$/.test(name)) decls.add(name);
    }
  }

  // Параметри function declaration: function name(p1, p2 = default, ...rest)
  for (const m of content.matchAll(/function\s*\*?\s*[A-Za-z_$][\w$]*\s*\(([^)]*)\)/g)) {
    addParams(m[1], decls);
  }
  // Method definition в класах і об'єктах: і ПАРАМЕТРИ, і сама НАЗВА методу.
  // Назва потрібна бо скорочений метод об'єкта (`{ start(pos) { … } }` — звичайний
  // ESM-патерн) виглядає для шукача викликів як виклик `start(` → чекер лаявся на
  // коректний код. Друга сліпа пляма того ж роду, що й async-стрілки (24.07).
  // Ключові слова, які теж підпадають (`if (…) {`), і так у WHITELIST.
  for (const m of content.matchAll(/(?:^|\n)\s*(?:async\s+|static\s+|get\s+|set\s+)*([A-Za-z_$][\w$]*)\s*\(([^)]*)\)\s*\{/g)) {
    decls.add(m[1]);
    addParams(m[2], decls);
  }
  // Arrow function params: (a, b) => / a =>
  for (const m of content.matchAll(/\(([^)]*)\)\s*=>/g)) {
    addParams(m[1], decls);
  }
  for (const m of content.matchAll(/(?<![.\w$])([A-Za-z_$][\w$]*)\s*=>/g)) {
    decls.add(m[1]);
  }
  // Catch param: catch (e)
  for (const m of content.matchAll(/catch\s*\(\s*([A-Za-z_$][\w$]*)\s*\)/g)) {
    decls.add(m[1]);
  }
  // For loop variables: for (const x of ...) / for (let i = 0; ...)
  for (const m of content.matchAll(/for\s*\(\s*(?:const|let|var)\s+([A-Za-z_$][\w$]*)/g)) {
    decls.add(m[1]);
  }

  return decls;
}

function addParams(paramsStr, decls) {
  for (const part of paramsStr.split(',')) {
    let name = part.trim();
    if (!name) continue;
    // Асинхронна стрілка всередині виклику — напр. `new Promise(async (resolve) => …)`.
    // Регулярка вище захоплює сюди хвіст зовнішньої дужки («async (resolve»), тож ім'я
    // не розпізнавалось і параметр помилково вважався невідомим. Беремо те, що після
    // останньої відкритої дужки. (Таких місць у src/ понад 40 — сліпа пляма чекера.)
    if (name.includes('(')) name = name.slice(name.lastIndexOf('(') + 1);
    name = name.replace(/^\.\.\./, '').split('=')[0].trim();
    // Destructuring у параметрі — пропускаємо (рідко і складно парсити)
    if (name.startsWith('{') || name.startsWith('[')) continue;
    if (/^[A-Za-z_$][\w$]*$/.test(name)) decls.add(name);
  }
}

// ── Знайти всі виклики (з номерами рядків) ───────────────────────────────────
function findCalls(originalContent) {
  const lines = originalContent.split('\n');
  const calls = [];
  // Стираємо block-комменти на рівні файлу, мепимо рядки через зсув
  const cleaned = stripBlockComments(originalContent);
  const cleanedLines = cleaned.split('\n');

  for (let i = 0; i < cleanedLines.length; i++) {
    const stripped = stripLine(cleanedLines[i] || '');
    const callPat = /(?<![.\w$])([A-Za-z_$][\w$]*)\s*\(/g;
    for (const m of stripped.matchAll(callPat)) {
      calls.push({ name: m[1], line: i + 1 });
    }
  }
  return calls;
}

// ── Аналіз одного файлу ──────────────────────────────────────────────────────
function analyzeFile(filePath) {
  const content = fs.readFileSync(filePath, 'utf8');
  const imports = extractImports(content);
  const decls = extractDeclarations(stripBlockComments(content));
  const calls = findCalls(content);

  const issues = [];
  const seen = new Set();
  for (const { name, line } of calls) {
    if (WHITELIST.has(name)) continue;
    if (imports.has(name)) continue;
    if (decls.has(name)) continue;
    const key = `${name}@${line}`;
    if (seen.has(key)) continue;
    seen.add(key);
    issues.push({ name, line });
  }
  return issues;
}

// ── Пастка: зворотна лапка в HTML-коментарі всередині шаблонного рядка ────────
//
// 🔴 ЧОМУ ЦЯ ПЕРЕВІРКА ІСНУЄ. За одну сесію (30.07) вона спіймала б мене ПʼЯТЬ разів,
// а один раз через неї в репозиторій потрапила ЗЛАМАНА збірка. Механіка проста і
// підла: у розмітці всередині шаблонного рядка пишеш коментар з поясненням, у ньому
// згадуєш селектор у зворотних лапках — і ця лапка ЗАКРИВАЄ сам шаблонний рядок.
// Далі решта розмітки стає кодом, і esbuild віддає щось на кшталт
//   "Expected ";" but found "margin""
// на рядку, який виглядає абсолютно нормальним коментарем. Причина й повідомлення
// не мають між собою нічого спільного, тому шукати доводиться щоразу заново.
//
// Що робимо: у `.js` файлах HTML-коментарі (`<!-- -->`) бувають ЛИШЕ всередині
// шаблонних рядків (це розмітка). Отже зворотна лапка в такому коментарі — завжди
// помилка. Кажемо це прямо, з номером рядка, ДО того як esbuild скаже незрозуміле.
//
// ⚠️ Свідома межа: перевірка НЕ ловить лапку в звичайному `//`-коментарі всередині
// шаблонного рядка (буває рідше) і не парсить AST. Вона закриває саме той випадок,
// який реально стріляв.
function checkBacktickInHtmlComment(src) {
  const issues = [];
  const re = /<!--[\s\S]*?-->/g;
  let m;
  while ((m = re.exec(src)) !== null) {
    if (!m[0].includes('`')) continue;
    const line = src.slice(0, m.index).split('\n').length;
    issues.push({ line, snippet: m[0].split('\n')[0].trim().slice(0, 60) });
  }
  return issues;
}

// ── Main ────────────────────────────────────────────────────────────────────
function main() {
  if (!fs.existsSync(SRC_DIR)) {
    console.error('check-imports: src/ не знайдено — пропускаю');
    process.exit(0);
  }

  const files = collectJsFiles(SRC_DIR).sort();
  let totalIssues = 0;
  let totalFiles = 0;

  for (const file of files) {
    const rel = path.relative(path.join(__dirname, '..'), file);
    const issues = analyzeFile(file);
    // Зворотна лапка в HTML-коментарі — окремий клас помилки (див. функцію вище).
    const ticks = checkBacktickInHtmlComment(fs.readFileSync(file, 'utf8'));
    totalFiles++;
    if (issues.length === 0 && ticks.length === 0) {
      console.log(`✓ ${rel} — clean`);
    } else {
      for (const { name, line } of issues) {
        console.log(`✗ ${rel}:${line} — '${name}' called but not imported/declared`);
      }
      for (const { line, snippet } of ticks) {
        console.log(`✗ ${rel}:${line} — ЗВОРОТНА ЛАПКА в HTML-коментарі: вона закриє шаблонний рядок`);
        console.log(`    ${snippet}`);
        console.log(`    → прибери лапки з коментаря (пиши .board-fab-label без них)`);
      }
      totalIssues += issues.length + ticks.length;
    }
  }

  console.log('');
  if (totalIssues === 0) {
    console.log(`check-imports: ${totalFiles} файл(и/ів) перевірено, проблем не знайдено`);
    process.exit(0);
  } else {
    console.log(`check-imports: ${totalIssues} проблем(и/у) у ${totalFiles} файл(і/ах)`);
    process.exit(1);
  }
}

main();
