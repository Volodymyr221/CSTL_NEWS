#!/bin/bash
# Рахує реальний % контексту з останнього assistant turn (usage), не з байтів.
# Usage: ./compute-context-pct.sh <transcript_path>  →  stdout "<percent> <tokens>"
transcript_path="${1:-}"
if [[ -z "$transcript_path" || ! -f "$transcript_path" ]]; then exit 1; fi
CONTEXT_LIMIT=1000000
tokens=$(python3 - "$transcript_path" <<'PY'
import json, sys
path = sys.argv[1]
last = None
with open(path, 'r', encoding='utf-8') as f:
    for line in f:
        line = line.strip()
        if not line: continue
        try: obj = json.loads(line)
        except Exception: continue
        msg = obj.get('message')
        if not isinstance(msg, dict): continue
        if msg.get('role') != 'assistant': continue
        usage = msg.get('usage')
        if isinstance(usage, dict): last = usage
if not last: sys.exit(1)
total = ((last.get('input_tokens') or 0) + (last.get('cache_read_input_tokens') or 0) + (last.get('cache_creation_input_tokens') or 0))
print(total)
PY
) || exit 1
case "$tokens" in ''|*[!0-9]*) exit 1 ;; esac
if [[ "$tokens" -le 0 ]]; then exit 1; fi
percent=$(( tokens * 100 / CONTEXT_LIMIT ))
echo "$percent $tokens"
