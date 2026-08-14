#!/bin/zsh
set -euo pipefail

LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
SERVER_PLIST="$LAUNCH_AGENTS_DIR/dev.field-theory-ui.server.plist"
SYNC_PLIST="$LAUNCH_AGENTS_DIR/dev.field-theory-ui.sync.plist"
DOMAIN="gui/$UID"

launchctl bootout "$DOMAIN" "$SERVER_PLIST" >/dev/null 2>&1 || true
launchctl bootout "$DOMAIN" "$SYNC_PLIST" >/dev/null 2>&1 || true

if [[ -f "$SERVER_PLIST" ]]; then
  mv "$SERVER_PLIST" "$HOME/.Trash/dev.field-theory-ui.server.plist"
fi
if [[ -f "$SYNC_PLIST" ]]; then
  mv "$SYNC_PLIST" "$HOME/.Trash/dev.field-theory-ui.sync.plist"
fi

echo "Field Theory UI service removed. Logs and bookmark data were preserved."
