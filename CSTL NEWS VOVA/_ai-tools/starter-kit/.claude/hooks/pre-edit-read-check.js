#!/usr/bin/env node
// PreToolUse хук: блокує Edit якщо файл не був прочитаний у поточній сесії.
// Логіка:
//   1. Читаємо payload зі stdin (JSON від Claude Code).
//   2. Якщо tool_name !== 'Edit' — пропускаємо (Write створює новий файл).
//   3. Витягуємо file_path з tool_input.
//   4. Скануємо transcript_path (.jsonl з історією сесії):
//      - Read tool_use з тим самим file_path → "прочитано"
//      - Bash tool_use з командою cat/head/tail/less + цей шлях → теж "прочитано"
//   5. Bypass: фраза "read-bypass: ok" у останніх 5 повідомленнях асистента.
//   6. Знайдено → exit 0. Не знайдено → exit 2 з повідомленням українською.

'use strict';

const fs = require('fs');

// ── Збираємо payload зі stdin ─────────────────────────────────────────────
let raw = '';
try {
  raw = fs.readFileSync(0, 'utf8');
} catch {
  // Якщо stdin порожній — пропускаємо, не блокуємо нічого.
  process.exit(0);
}

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  // Некоректний JSON — не наша справа, пропускаємо.
  process.exit(0);
}

// ── Перевірки чи це Edit з валідним файлом ───────────────────────────────
const toolName = payload.tool_name;
if (toolName !== 'Edit') {
  process.exit(0);
}

const filePath = payload.tool_input && payload.tool_input.file_path;
if (!filePath || typeof filePath !== 'string') {
  process.exit(0);
}

const transcriptPath = payload.transcript_path;
if (!transcriptPath || !fs.existsSync(transcriptPath)) {
  // Без транскрипту перевірити не можемо — пропускаємо, щоб не ламати роботу.
  process.exit(0);
}

// ── Читаємо транскрипт сесії (.jsonl — один JSON на рядок) ───────────────
let lines;
try {
  lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
} catch {
  process.exit(0);
}

// Шляхи можуть бути абсолютні або відносні від cwd. Беремо обидва варіанти.
const cwd = payload.cwd || process.cwd();
const targets = new Set([filePath]);
if (filePath.startsWith(cwd + '/')) {
  targets.add(filePath.slice(cwd.length + 1));
}
// Команди типу `cat ./src/...` можуть містити шлях з префіксом ./
for (const t of [...targets]) {
  targets.add('./' + t);
}

const fileBasename = filePath.split('/').pop();

// Останні 5 повідомлень асистента — для bypass-перевірки
const assistantTexts = [];

let foundRead = false;

for (const line of lines) {
  let entry;
  try {
    entry = JSON.parse(line);
  } catch {
    continue;
  }

  // Текст асистента (для bypass)
  if (entry.type === 'assistant' && entry.message && Array.isArray(entry.message.content)) {
    for (const block of entry.message.content) {
      if (block && block.type === 'text' && typeof block.text === 'string') {
        assistantTexts.push(block.text);
      }
    }
  }

  // Шукаємо tool_use у асистентських повідомленнях
  if (entry.type === 'assistant' && entry.message && Array.isArray(entry.message.content)) {
    for (const block of entry.message.content) {
      if (!block || block.type !== 'tool_use') continue;
      const name = block.name;
      const input = block.input || {};

      // Read з тим самим шляхом
      if (name === 'Read' && typeof input.file_path === 'string' && targets.has(input.file_path)) {
        foundRead = true;
      }

      // Bash cat/head/tail/less з цим шляхом — теж рахується
      if (name === 'Bash' && typeof input.command === 'string') {
        const cmd = input.command;
        const readish = /(^|[\s|&;()])(cat|head|tail|less|more|bat)(\s+-[^\s]*)*\s+/;
        if (readish.test(cmd)) {
          // Перевіряємо чи серед аргументів є наш файл або його basename
          for (const t of targets) {
            if (cmd.includes(t)) { foundRead = true; break; }
          }
          if (!foundRead && fileBasename && cmd.includes(fileBasename)) {
            // Слабша перевірка — basename, на випадок відносних шляхів
            foundRead = true;
          }
        }
      }
    }
  }
}

// ── Bypass: фраза "read-bypass: ok" у останніх 5 текстах асистента ───────
const recent = assistantTexts.slice(-5);
const bypass = recent.some(t => t && t.toLowerCase().includes('read-bypass: ok'));

if (foundRead || bypass) {
  process.exit(0);
}

// ── Не знайдено Read для цього файлу — блокуємо ──────────────────────────
const msg =
  'Edit без попереднього Read. Виконай Read цього файлу перш ніж робити Edit.\n' +
  'Файл: ' + filePath + '\n' +
  'Bypass (якщо точно знаєш що робиш): напиши у відповіді "read-bypass: ok".';

process.stderr.write(msg + '\n');
process.exit(2);
