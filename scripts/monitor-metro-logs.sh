#!/bin/bash

# Monitor Metro Logs - tail the current Metro log file

if [ ! -f /tmp/METRO_CURRENT_LOG_FILENAME.txt ]; then
    echo "❌ No Metro log file found. Start Metro first with: ./scripts/refresh-metro.sh"
    exit 1
fi

CURRENT_LOG_FILE=$(cat /tmp/METRO_CURRENT_LOG_FILENAME.txt)

if [ ! -f "$CURRENT_LOG_FILE" ]; then
    echo "❌ Metro log file not found: $CURRENT_LOG_FILE"
    echo "💡 Start Metro with: ./scripts/refresh-metro.sh"
    exit 1
fi

echo "📋 Monitoring Metro logs: $CURRENT_LOG_FILE"
echo "📋 Press Ctrl+C to stop monitoring"
echo ""

tail -f "$CURRENT_LOG_FILE"