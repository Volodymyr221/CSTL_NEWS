#!/usr/bin/env bash
# UserPromptSubmit — попереджає, коли контекст (вікно памʼяті сесії) заповнюється.
# Рахує РЕАЛЬНЕ використання з останнього ходу асистента, а не розмір файлу
# транскрипту: оцінка «по байтах» бреше в рази.
set -uo pipefail
input=$(cat)
dir="$(dirname "$0")"

transcript=""
if command -v python3 >/dev/null 2>&1; then
  transcript=$(echo "$input" | python3 -c "import sys,json
try: d=json.load(sys.stdin)
except Exception: sys.exit(0)
print(d.get('transcript_path') or '')" 2>/dev/null)
fi
[[ -n "$transcript" && -f "$transcript" ]] || exit 0

result=$(bash "$dir/lib/compute-context-pct.sh" "$transcript" 2>/dev/null) || exit 0
percent=$(echo "$result" | awk '{print $1}')
tokens_k=$(( $(echo "$result" | awk '{print $2}') / 1000 ))

if   (( percent >= 90 )); then msg="🔴 КОНТЕКСТ ${percent}% (${tokens_k}K) — роби /finish зараз"
elif (( percent >= 80 )); then msg="⚠️ КОНТЕКСТ ${percent}% (${tokens_k}K) — скоро /finish"
else exit 0
fi
echo "{\"systemMessage\": \"${msg}\"}"
exit 0
