#!/bin/bash
# .claude/hooks/byyou-context-guard.sh — CSTL
# Stop hook: під час активного /byyou, якщо контекст ≥75% — блокує тихий вихід,
# щоб зберігся handoff у BYYOU_PLAN.md. Порт із NeverMind.
input=$(cat)
dir="$(dirname "$0")"
plan="$dir/../../CSTL NEWS VOVA/_ai-tools/BYYOU_PLAN.md"
[[ -f "$plan" ]] || exit 0
grep -qiE '^\*\*Статус:\*\*[[:space:]]*(🟢[[:space:]]*)?active' "$plan" || exit 0
transcript_path=""
if command -v python3 >/dev/null 2>&1; then
  transcript_path=$(echo "$input" | python3 -c "import sys,json
try:
    d = json.load(sys.stdin)
except Exception:
    sys.exit(0)
print(d.get('transcript_path') or '')
" 2>/dev/null)
fi
[[ -n "$transcript_path" && -f "$transcript_path" ]] || exit 0
result=$(bash "$dir/lib/compute-context-pct.sh" "$transcript_path" 2>/dev/null)
[[ -n "$result" ]] || exit 0
percent=$(echo "$result" | awk '{print $1}')
tokens=$(echo "$result" | awk '{print $2}')
tokens_k=$((tokens / 1000))
THRESHOLD=75
SOFT=60
SOFT_FLAG="$dir/.byyou-handoff-warned"
if [[ "$percent" -ge "$THRESHOLD" ]]; then
  {
    echo "КОНТЕКСТ ${percent}% (${tokens_k}K/1M) — /byyou ПОРА ЗУПИНИТИ"
    echo "ПЕРЕД зупинкою: 1) дозаповни BYYOU_PLAN.md «Де зупинились»; 2) Статус: paused;"
    echo "3) скажи власнику окремим повідомленням і зупинись."
    echo "Новий чат → /byyou → продовжить."
  } >&2
  exit 2
fi
if [[ "$percent" -ge "$SOFT" ]]; then
  if [[ ! -f "$SOFT_FLAG" ]]; then
    touch "$SOFT_FLAG"
    {
      echo "КОНТЕКСТ ${percent}% — /byyou наближається до стопу (75%)."
      echo "Поки контекст свіжий — тримай BYYOU_PLAN.md «Де зупинились» актуальним щокроку."
    } >&2
  fi
else
  [[ -f "$SOFT_FLAG" ]] && rm -f "$SOFT_FLAG"
fi
exit 0
