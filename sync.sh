#!/bin/bash
cd ~/Desktop/CSTL_NEWS
echo "⬇️  Підтягую..."
git pull origin main --no-rebase -X ours
git add .
MSG="${1:-sync: update}"
git -c commit.gpgsign=false commit -m "$MSG" 2>/dev/null
echo "⬆️  Відправляю..."
git push origin main && echo "✅ Готово!"
