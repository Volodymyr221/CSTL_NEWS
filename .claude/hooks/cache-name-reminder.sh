#!/bin/bash
# PostToolUse Edit|Write — нагадування про bump CACHE_NAME у sw.js
# при зміні файлів які кешує Service Worker.

input=$(cat)
file=""
if command -v python3 >/dev/null 2>&1; then
  file=$(echo "$input" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('tool_input',{}).get('file_path','') or d.get('file_path',''))" 2>/dev/null)
fi
if [[ -z "$file" ]]; then exit 0; fi

trigger=0
if [[ "$file" == *"/src/"* && "$file" == *.js ]]; then trigger=1; fi
if [[ "$file" == *.css ]]; then trigger=1; fi
if [[ "$file" == *"/sw.js" ]]; then trigger=1; fi
if [[ "$file" == *"/index.html" ]]; then trigger=1; fi

if [[ $trigger -eq 1 ]]; then
  now=$(date +"%Y%m%d-%H%M")
  echo "🔄 CACHE_NAME нагадування: змінено $file"
  echo ""
  echo "Перед пушем онови CACHE_NAME у sw.js на: cstl-$now"
  echo ""
  echo "Формат: cstl-YYYYMMDD-HHMM. Виняток: чисто .md або .claude/ — не чіпати."
fi
