#!/bin/bash

# Refresh Metro Server - kill existing and start fresh with persistent logging.
# This is the single entrypoint for Metro lifecycle in local dev scripts.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
APP_BUNDLE_ID="com.fogofdog.app"
METRO_PORT="${METRO_PORT:-8081}"
HOST_MODE="localhost"
NO_OPEN=false

while [[ $# -gt 0 ]]; do
    case "$1" in
        --host)
            HOST_MODE="${2:-}"
            shift 2
            ;;
        --no-open)
            NO_OPEN=true
            shift
            ;;
        *)
            echo "Unknown argument: $1"
            echo "Usage: $0 [--host localhost|lan|tunnel] [--no-open]"
            exit 1
            ;;
    esac
done

echo "🔄 Stopping existing Metro processes..."
pkill -f "expo.*start" 2>/dev/null || true
pkill -f "react-native.*start" 2>/dev/null || true
if lsof -ti:"$METRO_PORT" >/dev/null 2>&1; then
    lsof -ti:"$METRO_PORT" | xargs kill -9 2>/dev/null || true
fi
sleep 1

TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
METRO_LOG_FILE="/tmp/metro_console_${TIMESTAMP}.log"
echo "📅 Metro server started at $(date)" > "$METRO_LOG_FILE"
echo "$METRO_LOG_FILE" > /tmp/METRO_CURRENT_LOG_FILENAME.txt

echo "🚀 Starting Metro server..."
echo "📝 Logs: $METRO_LOG_FILE"

(
    cd "$PROJECT_DIR"
    exec nohup "$PROJECT_DIR/node_modules/.bin/expo" start --clear --dev-client --host "$HOST_MODE" > "$METRO_LOG_FILE" 2>&1
) &
METRO_PID=$!
disown "$METRO_PID" 2>/dev/null || true
echo "$METRO_PID" > /tmp/METRO_PID.txt

echo "⏳ Waiting for Metro readiness on :$METRO_PORT..."
READY=false
for _ in $(seq 1 30); do
    if curl -fsS "http://127.0.0.1:${METRO_PORT}/status" 2>/dev/null | grep -q "packager-status:running"; then
        READY=true
        break
    fi
    sleep 1
done

if [ "$READY" != true ]; then
    echo "❌ Metro did not become ready on http://127.0.0.1:${METRO_PORT}/status"
    echo "📋 Last Metro log lines:"
    tail -n 40 "$METRO_LOG_FILE" || true
    exit 1
fi

echo "✅ Metro ready (PID: $(lsof -ti:${METRO_PORT} | head -1))"
echo "📋 To monitor logs: ./scripts/monitor-metro-logs.sh"

if [ "$NO_OPEN" = true ]; then
    exit 0
fi

DEVICE_UDID=$(xcrun simctl list devices booted --json 2>/dev/null | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .udid' | head -1)
if [ -z "$DEVICE_UDID" ]; then
    echo "⚠️  No booted iOS simulator found. Metro is ready."
    exit 0
fi

if ! xcrun simctl listapps "$DEVICE_UDID" 2>/dev/null | grep -q "$APP_BUNDLE_ID"; then
    echo "⚠️  App $APP_BUNDLE_ID not installed on simulator $DEVICE_UDID"
    exit 0
fi

echo "📱 Booted simulator: $DEVICE_UDID"
xcrun simctl terminate "$DEVICE_UDID" "$APP_BUNDLE_ID" 2>/dev/null || true
xcrun simctl launch "$DEVICE_UDID" "$APP_BUNDLE_ID" >/dev/null 2>&1 || true
xcrun simctl openurl "$DEVICE_UDID" "exp+fogofdog://expo-development-client/?url=http%3A%2F%2F127.0.0.1%3A${METRO_PORT}" >/dev/null 2>&1 || true
echo "✅ App launch triggered via dev-client URL"
