#!/usr/bin/env bash
set -e

# Navigate to project root (where this script lives)
cd "$(dirname "$0")"

# Use PORT env var or default to 3939
PORT="${PORT:-3939}"
export PORT

# Step 1: Build if dist/ doesn't exist
if [ ! -d "dist" ]; then
  echo ""
  echo "  dist/ not found — building..."
  echo ""
  npm run build
  echo ""
  echo "  Build complete."
fi

# Step 2: Detect LAN IP
get_lan_ip() {
  # Try to get the LAN IP from network interfaces
  local ip
  ip=$(node -e "
    const os = require('os');
    const interfaces = os.networkInterfaces();
    for (const name in interfaces) {
      for (const addr of interfaces[name] || []) {
        if (addr.family === 'IPv4' && !addr.internal) {
          console.log(addr.address);
          process.exit(0);
        }
      }
    }
    console.log('localhost');
  ")
  echo "$ip"
}

LAN_IP=$(get_lan_ip)
LOCAL_URL="http://localhost:${PORT}"
LAN_URL="http://${LAN_IP}:${PORT}"

# Step 3: Start the server in background
PORT="$PORT" npx tsx server/index.ts &
SERVER_PID=$!

# Wait for server to be ready
echo ""
echo "  Starting Field Theory server..."
READY=false
for i in $(seq 1 30); do
  if curl -sf "http://localhost:${PORT}/api/stats" > /dev/null 2>&1; then
    READY=true
    break
  fi
  sleep 0.5
done

if [ "$READY" = false ]; then
  echo "  ✗ Server failed to start within 15 seconds."
  kill "$SERVER_PID" 2>/dev/null || true
  exit 1
fi

# Step 4: Print URLs
echo ""
printf "  ┌─────────────────────────────────────────┐\n"
printf "  │                                         │\n"
printf "  │   Field Theory UI                       │\n"
printf "  │                                         │\n"
printf "  │   Local:   %-27s│\n" "$LOCAL_URL"
printf "  │   Network: %-27s│\n" "$LAN_URL"
printf "  │                                         │\n"
printf "  └─────────────────────────────────────────┘\n"
echo ""

# Step 5: Generate QR code for LAN URL
LAN_URL="$LAN_URL" node -e "
  const qr = require('qrcode-terminal');
  const url = process.env.LAN_URL;
  qr.generate(url, { small: true }, function(code) {
    console.log('  Scan to open on your device:\n');
    const lines = code.split('\n');
    for (const line of lines) {
      console.log('  ' + line);
    }
    console.log('');
  });
"

# Keep the server running in foreground
echo "  Press Ctrl+C to stop the server."
echo ""

# Trap signals to clean up server process
cleanup() {
  echo ""
  echo "  Stopping server..."
  kill "$SERVER_PID" 2>/dev/null || true
  wait "$SERVER_PID" 2>/dev/null || true
  echo "  Server stopped."
  exit 0
}
trap cleanup INT TERM

# Wait for server process
wait "$SERVER_PID"
