#!/bin/bash
set -euo pipefail

# Тільки для Claude Code на веб (remote середовище)
if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

# Встановлення залежностей (esbuild для збірки)
cd "$CLAUDE_PROJECT_DIR"
npm install

# Збірка bundle.js
node build.js
