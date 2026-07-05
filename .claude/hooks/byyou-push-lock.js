#!/usr/bin/env node
// .claude/hooks/byyou-push-lock.js — CSTL
// PreToolUse(Bash): замок на git push у режимі /byyou. Поки BYYOU_PLAN.md=active
// — git push заблоковано, доки власник не скаже «деплой» у своєму повідомленні
// (читаємо user-текст із транскрипту — слова людини). Порт із NeverMind.
const fs = require('fs');
const path = require('path');
const PLAN_PATH = path.join(__dirname, '..', '..', 'CSTL NEWS VOVA', '_ai-tools', 'BYYOU_PLAN.md');
const RELEASE_MARKER = path.join(__dirname, '..', '.byyou-release');
const RELEASE_WORD = /деплой/i;
const N_RECENT_USER_MESSAGES = 2;
function isByyouActive() {
  try {
    if (!fs.existsSync(PLAN_PATH)) return false;
    const content = fs.readFileSync(PLAN_PATH, 'utf8');
    return /\*\*Статус:\*\*\s*(🟢\s*)?active\b/i.test(content);
  } catch { return false; }
}
function readRecentUserTexts(transcriptPath, n) {
  if (!transcriptPath || !fs.existsSync(transcriptPath)) return '';
  const lines = fs.readFileSync(transcriptPath, 'utf8').split('\n').filter(Boolean);
  const texts = [];
  for (let i = lines.length - 1; i >= 0 && texts.length < n; i--) {
    try {
      const entry = JSON.parse(lines[i]);
      if (entry.type !== 'user' || !entry.message) continue;
      const c = entry.message.content;
      if (Array.isArray(c)) {
        const t = c.filter(b => b.type === 'text' && b.text).map(b => b.text).join('\n');
        if (t) texts.push(t);
      } else if (typeof c === 'string' && c.length > 0) { texts.push(c); }
    } catch {}
  }
  return texts.join('\n');
}
let input = '';
process.stdin.on('data', chunk => input += chunk);
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(input || '{}');
    const command = (data.tool_input && data.tool_input.command) || '';
    if (!/\bgit\s+push\b/.test(command)) process.exit(0);
    if (!isByyouActive()) process.exit(0);
    const userText = readRecentUserTexts(data.transcript_path, N_RECENT_USER_MESSAGES);
    const releaseWindowOpen = fs.existsSync(RELEASE_MARKER);
    if (releaseWindowOpen || RELEASE_WORD.test(userText)) process.exit(0);
    console.error('\n=== BYYOU PUSH-ЗАМОК ===\n');
    console.error('Активний потік /byyou (BYYOU_PLAN.md=active). Push=публікація.\n' +
      'Між брамами push ЗАБЛОКОВАНО. Покажи власнику реліз-нотатки і чекай слово «деплой», тоді повтори push.\n');
    process.exit(2);
  } catch { process.exit(0); }
});
