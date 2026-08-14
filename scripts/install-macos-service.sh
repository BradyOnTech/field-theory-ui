#!/bin/zsh
set -euo pipefail

SCRIPT_DIR="${0:A:h}"
PROJECT_ROOT="${SCRIPT_DIR:h}"
INSTALL_ROOT="$HOME/.local/share/field-theory-ui"
LAUNCH_AGENTS_DIR="$HOME/Library/LaunchAgents"
LOG_DIR="$HOME/.local/state/field-theory-ui"
SERVER_PLIST="$LAUNCH_AGENTS_DIR/dev.field-theory-ui.server.plist"
SYNC_PLIST="$LAUNCH_AGENTS_DIR/dev.field-theory-ui.sync.plist"
PLIST_BUDDY="/usr/libexec/PlistBuddy"
DOMAIN="gui/$UID"
NODE_BIN="$(command -v node)"
NODE_BIN_DIR="${NODE_BIN:h}"
NPM_BIN="$(command -v npm)"

mkdir -p "$LAUNCH_AGENTS_DIR" "$LOG_DIR" "$INSTALL_ROOT"
cd "$PROJECT_ROOT"

# LaunchAgents cannot reliably read macOS privacy-protected folders such as
# Documents. Deploy a self-contained runtime copy outside the protected tree.
/usr/bin/rsync -a --delete \
  --exclude '.git/' \
  --exclude 'node_modules/' \
  --exclude 'coverage/' \
  "$PROJECT_ROOT/" "$INSTALL_ROOT/"
if [[ -f "$INSTALL_ROOT/.env" ]]; then
  chmod 600 "$INSTALL_ROOT/.env"
fi

cd "$INSTALL_ROOT"
PATH="$NODE_BIN_DIR:$PATH" "$NPM_BIN" ci
PATH="$NODE_BIN_DIR:$PATH" "$NPM_BIN" run build

create_server_plist() {
  /usr/bin/plutil -create xml1 "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :Label string dev.field-theory-ui.server" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :ProgramArguments array" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :ProgramArguments:0 string /bin/zsh" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :ProgramArguments:1 string $INSTALL_ROOT/scripts/run-server.sh" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :WorkingDirectory string $INSTALL_ROOT" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :EnvironmentVariables dict" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :EnvironmentVariables:FIELD_THEORY_NODE_BIN_DIR string $NODE_BIN_DIR" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :RunAtLoad bool true" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :KeepAlive bool true" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :ThrottleInterval integer 10" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :StandardOutPath string $LOG_DIR/server.log" "$SERVER_PLIST"
  "$PLIST_BUDDY" -c "Add :StandardErrorPath string $LOG_DIR/server-error.log" "$SERVER_PLIST"
}

create_sync_plist() {
  /usr/bin/plutil -create xml1 "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :Label string dev.field-theory-ui.sync" "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :ProgramArguments array" "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :ProgramArguments:0 string /bin/zsh" "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :ProgramArguments:1 string $INSTALL_ROOT/scripts/sync-bookmarks.sh" "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :WorkingDirectory string $INSTALL_ROOT" "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :EnvironmentVariables dict" "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :EnvironmentVariables:FIELD_THEORY_NODE_BIN_DIR string $NODE_BIN_DIR" "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :StartInterval integer 3600" "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :ProcessType string Background" "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :StandardOutPath string $LOG_DIR/sync.log" "$SYNC_PLIST"
  "$PLIST_BUDDY" -c "Add :StandardErrorPath string $LOG_DIR/sync-error.log" "$SYNC_PLIST"
}

launchctl bootout "$DOMAIN" "$SERVER_PLIST" >/dev/null 2>&1 || true
launchctl bootout "$DOMAIN" "$SYNC_PLIST" >/dev/null 2>&1 || true

create_server_plist
create_sync_plist

/usr/bin/plutil -lint "$SERVER_PLIST"
/usr/bin/plutil -lint "$SYNC_PLIST"
launchctl bootstrap "$DOMAIN" "$SERVER_PLIST"
launchctl bootstrap "$DOMAIN" "$SYNC_PLIST"

echo "Field Theory UI service installed."
echo "Runtime:     $INSTALL_ROOT"
echo "Server logs: $LOG_DIR/server.log"
echo "Sync logs:   $LOG_DIR/sync.log"
