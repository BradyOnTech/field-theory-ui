#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"

export PATH="${FIELD_THEORY_NODE_BIN_DIR:+$FIELD_THEORY_NODE_BIN_DIR:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"
cd "$PROJECT_ROOT"

exec "$PROJECT_ROOT/node_modules/.bin/tsx" "$PROJECT_ROOT/server/index.ts"
