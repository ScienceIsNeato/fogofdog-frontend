#!/bin/bash

# Refresh Metro Server - kill existing and start fresh with console log capture

# Kill any existing Metro/Expo processes
pkill -f "expo start" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true
lsof -ti:8081 | xargs kill -9 2>/dev/null || true

# Create timestamped log file for integration test artifacts
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
METRO_LOG_FILE="/tmp/metro_console_${TIMESTAMP}.log"

# Start fresh Metro server in background with dual logging
# Logs to both metro.log (local) and timestamped file in /tmp (for integration tests)
nohup npx expo start --clear 2>&1 | tee metro.log "$METRO_LOG_FILE" &

echo "Metro server refreshed"
echo "Local logs: metro.log"
echo "Integration test logs: $METRO_LOG_FILE" 