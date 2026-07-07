#!/usr/bin/env bash
# SessionStart hook — синхронізує git при старті / ВІДНОВЛЕННІ сесії.
#
# ЧОМУ: контейнер Claude Code (web) може відновитись на ЗАСТАРІЛИЙ знімок git,
# а сесія просто продовжується (без /start). Тоді локальні рефи відстають від
# GitHub, і вже задеплоєна робота ВИГЛЯДАЄ втраченою (факап 07.07 — години на
# «відновлення» того, що й так було на origin).
#
# ЩО РОБИТЬ: git fetch origin (з таймаутом) + ГОЛОСНО попереджає якщо локальний
# main або поточна гілка відстають від origin. Не блокує — лише інформує.
set -uo pipefail
cd "${CLAUDE_PROJECT_DIR:-/home/user/CSTL_NEWS}" 2>/dev/null || exit 0
command -v git >/dev/null 2>&1 || exit 0
git rev-parse --git-dir >/dev/null 2>&1 || exit 0

if ! timeout 20 git fetch origin --quiet 2>/dev/null; then
  echo "⚠️ GIT-СИНК: git fetch не вдався (мережа?). Рефи можуть бути застарілі — перевір вручну: git fetch origin"
  exit 0
fi

warn=""
if git rev-parse --verify -q origin/main >/dev/null 2>&1 && git rev-parse --verify -q main >/dev/null 2>&1; then
  behind=$(git rev-list --count main..origin/main 2>/dev/null || echo 0)
  [ "${behind:-0}" -gt 0 ] && warn+=$'\n'"⚠️ Локальний main ВІДСТАЄ від origin/main на ${behind} комітів. origin = джерело правди (там задеплоєне). Синхронізуй: git checkout main && git pull origin main."
fi
cur=$(git branch --show-current 2>/dev/null || true)
if [ -n "${cur:-}" ] && [ "$cur" != "main" ] && git rev-parse --verify -q "origin/$cur" >/dev/null 2>&1; then
  cb=$(git rev-list --count "$cur..origin/$cur" 2>/dev/null || echo 0)
  [ "${cb:-0}" -gt 0 ] && warn+=$'\n'"⚠️ Гілка '$cur' відстає від origin/$cur на ${cb} комітів."
fi

if [ -n "$warn" ]; then
  printf '🔄 GIT-СИНК (SessionStart): git fetch виконано.%s\n➡️ ПРАВИЛО: при будь-якому «щось зникло / git незрозумілий» — СПЕРШУ git fetch, потім висновки.\n' "$warn"
else
  echo "🔄 GIT-синк (SessionStart): git fetch ок — локальний git синхронний з origin."
fi
exit 0
