#!/usr/bin/env node
// .claude/hooks/token-guard.js — CSTL
// ТОКЕН-ЗАПОБІЖНИК: якщо ОДИН Agent/Task-виклик спалює > LIMIT токенів
// (input+output за один виклик) → пише прапорець-файл .claude/.token-halt.
// Після цього КОЖЕН наступний інструмент блокується (deny), доки прапорець
// не приберуть — Рома явно підтверджує продовження, тоді `rm .claude/.token-halt`.
//
// Два режими (argv[2]):
//   'post' — PostToolUse (matcher Agent|Task): прочитати usage, за перевищення
//            записати прапорець (сам PostToolUse не блокує — лише сигналить).
//   'pre'  — PreToolUse (усі інструменти): якщо прапорець є → deny (exit 2),
//            КРІМ Bash-команди що прибирає сам прапорець (щоб можна було зняти).
//
// Fail-open: будь-яка помилка хука → exit 0 (сесію не ламаємо).
// Рівень: той самий що byyou-context-guard / byyou-push-lock (сторож сесії).

const fs = require('fs');
const path = require('path');

const FLAG = path.join(__dirname, '..', '.token-halt');   // .claude/.token-halt (у .gitignore)
const LIMIT = 350000;
const mode = process.argv[2] || 'pre';

// Витягнути суму токенів з tool_response захищено (кілька можливих форм).
function tokensFrom(resp) {
  if (!resp || typeof resp !== 'object') return 0;
  const u = resp.usage || resp.totalUsage || {};
  const inT  = Number(u.input_tokens  || u.inputTokens  || 0) || 0;
  const outT = Number(u.output_tokens || u.outputTokens || 0) || 0;
  let sum = inT + outT;
  if (!sum && typeof resp.totalTokens === 'number') sum = resp.totalTokens;
  if (!sum && typeof resp.subagent_tokens === 'number') sum = resp.subagent_tokens;
  if (!sum && resp.usage && typeof resp.usage.total_tokens === 'number') sum = resp.usage.total_tokens;
  return sum || 0;
}

let input = '';
process.stdin.on('data', c => (input += c));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input || '{}');

    if (mode === 'post') {
      const tool = data.tool_name || '';
      if (!/^(Agent|Task)$/.test(tool)) process.exit(0);
      const spent = tokensFrom(data.tool_response);
      if (spent > LIMIT) {
        const info = `HALT ${new Date().toISOString()} tool=${tool} tokens=${spent} limit=${LIMIT}`;
        try { fs.writeFileSync(FLAG, info + '\n'); } catch (_) {}
        console.error(
          '\n=== 🛑 ТОКЕН-ЗАПОБІЖНИК СПРАЦЮВАВ ===\n' +
          `Один ${tool}-виклик спалив ${spent.toLocaleString()} токенів (поріг ${LIMIT.toLocaleString()}).\n` +
          'Уся подальша робота сесії ЗУПИНЕНА. Продовження — лише коли Рома явно підтвердить,\n' +
          'тоді прибрати прапорець:  rm .claude/.token-halt'
        );
      }
      process.exit(0);   // PostToolUse не блокує тул що вже виконався
    }

    // mode === 'pre'
    if (!fs.existsSync(FLAG)) process.exit(0);
    // Дозволити ЗНЯТТЯ прапорця (Рома підтвердив продовження).
    const cmd = (data.tool_input && data.tool_input.command) || '';
    if (data.tool_name === 'Bash' && /\brm\b/.test(cmd) && /\.token-halt/.test(cmd)) process.exit(0);
    let why = '';
    try { why = fs.readFileSync(FLAG, 'utf8').trim(); } catch (_) {}
    console.error(
      '\n=== 🛑 СЕСІЯ НА ПАУЗІ (токен-запобіжник) ===\n' +
      (why ? why + '\n' : '') +
      'Усі інструменти заблоковано після дорогого Agent/Task-виклику.\n' +
      'Щоб продовжити: Рома підтверджує → прибрати прапорець:  rm .claude/.token-halt'
    );
    process.exit(2);
  } catch (_) {
    process.exit(0);   // fail-open
  }
});
