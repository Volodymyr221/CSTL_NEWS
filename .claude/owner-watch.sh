#!/usr/bin/env bash
# Взаємне автостеження власників CSTL NEWS (Вова ↔ Рома).
# Кожна сесія власника стежить за активністю ІНШОГО власника.
#
# Запуск (через Monitor у /startuem):
#   SELF='<regex імен/пошт ПОТОЧНОЇ людини>' bash .claude/owner-watch.sh
# SELF для Роми: 'Рома|roma\.haranin\.ru1@gmail\.com'
# SELF для Вови: 'Вова|Vova|VShevchukkk|Volodymyr221'
#
# Емітить рядок у stdout ТІЛЬКИ коли з'являється людська активність ІНШОГО
# власника (усе що не SELF і не бот). Тиша = інший не активний.
cd /home/user/CSTL_NEWS || exit 1
SEEN="${WATCH_SEEN:-/tmp/cstl_watch_seen.txt}"
SELF="${SELF:-__nobody__}"
touch "$SEEN"

is_bot() {
  case "$1" in
    *"News Bot"*|*"vopas-parser"*|*"github-actions"*|*"[bot]"*) return 0;;
  esac
  return 1
}

while true; do
  git fetch origin --quiet 2>/dev/null || true
  CUR=$(git for-each-ref --format='%(refname:short) %(objectname:short)' refs/remotes/origin/)

  while read -r ref sha; do
    [ -z "$ref" ] && continue
    old=$(grep -m1 "^$ref " "$SEEN" 2>/dev/null | awk '{print $2}')
    [ "$old" = "$sha" ] && continue   # без змін

    if [ -z "$old" ]; then
      lines=$(git log --no-merges --pretty='%an|%ae|%s' -5 "$sha" 2>/dev/null)
    else
      lines=$(git log --no-merges --pretty='%an|%ae|%s' "$old..$sha" 2>/dev/null)
    fi

    printf '%s\n' "$lines" | while IFS='|' read -r an ae sub; do
      [ -z "$an" ] && continue
      is_bot "$an" && continue
      printf '%s\n' "$an $ae" | grep -qiE "$SELF" && continue   # це я — пропустити
      echo "🔔 Інший власник активний у репо: [$ref] $an — $sub"
    done
  done <<< "$CUR"

  printf '%s\n' "$CUR" > "$SEEN"   # оновити базову точку
  sleep 600
done
