#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"

export PATH="${FIELD_THEORY_NODE_BIN_DIR:+$FIELD_THEORY_NODE_BIN_DIR:}/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin:$HOME/.local/bin"
export FT_DATA_DIR="${FT_DATA_DIR:-$HOME/.fieldtheory/bookmarks}"

cd "$PROJECT_ROOT"
# Keep the hourly job quick and predictable. Bookmark media remains available
# from its original URL and can be backfilled manually with `ft media`.
ft sync --no-media

BACKUP_DIR="$HOME/.fieldtheory/backups"
DB_PATH="$FT_DATA_DIR/bookmarks.db"
JSONL_PATH="$FT_DATA_DIR/bookmarks.jsonl"
mkdir -p "$BACKUP_DIR"

if [[ -f "$DB_PATH" ]] && command -v sqlite3 >/dev/null 2>&1; then
  sqlite3 "$DB_PATH" ".backup '$BACKUP_DIR/bookmarks-latest.db'"
fi
if [[ -f "$JSONL_PATH" ]]; then
  cp -p "$JSONL_PATH" "$BACKUP_DIR/bookmarks-latest.jsonl"
fi
