#!/usr/bin/env bash
# Моніторить розмір сесії і попереджає коли контекст заповнюється.
# Формула: байти файлу / 3 ≈ токени

SESSION_DIR="/root/.claude/projects/-home-user-CSTL-NEWS"

# Беремо найновіший файл сесії
LATEST=$(ls -t "$SESSION_DIR"/*.jsonl 2>/dev/null | head -1)
if [[ -z "$LATEST" ]]; then
  exit 0
fi

BYTES=$(wc -c < "$LATEST")
TOKENS=$(( BYTES / 3 ))

if (( TOKENS >= 900000 )); then
  echo "{\"systemMessage\": \"🔴 КОНТЕКСТ КРИТИЧНИЙ (~${TOKENS}K токенів) — зроби /finish\"}" | sed "s/${TOKENS}K/$(( TOKENS / 1000 ))K/"
elif (( TOKENS >= 800000 )); then
  echo "{\"systemMessage\": \"⚠️ КОНТЕКСТ ~80% (~$(( TOKENS / 1000 ))K токенів) — скоро /finish\"}"
fi

exit 0
