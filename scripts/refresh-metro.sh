#!/bin/bash

# Refresh Metro Server - kill existing and start fresh with persistent logging
# This is the ONLY script that should be used to start/stop Metro

set -e

# Kill any existing Metro/Expo processes
echo "🔄 Stopping existing Metro processes..."
pkill -f "expo start" 2>/dev/null || true
pkill -f "metro" 2>/dev/null || true
lsof -ti:8081 | xargs kill -9 2>/dev/null || true

# Wait a moment for processes to fully terminate
sleep 2

# Create timestamped log file in /tmp/
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
METRO_LOG_FILE="/tmp/metro_console_${TIMESTAMP}.log"

# Write initial timestamp to log file
echo "📅 Metro server started at $(date)" > "$METRO_LOG_FILE"

# Update current log filename tracker
echo "$METRO_LOG_FILE" > /tmp/METRO_CURRENT_LOG_FILENAME.txt

echo "🚀 Starting Metro server..."
echo "📝 Logs will be written to: $METRO_LOG_FILE"
echo "📂 Current log file tracker: /tmp/METRO_CURRENT_LOG_FILENAME.txt"

# Start fresh Metro server in background with persistent logging
# Use exec to ensure proper signal handling
nohup bash -c "cd $(pwd) && npx expo start --clear --dev-client 2>&1 | tee '$METRO_LOG_FILE'" &

# Store the background process PID for potential cleanup
METRO_PID=$!
echo "$METRO_PID" > /tmp/METRO_PID.txt

echo "✅ Metro server started (PID: $METRO_PID)"
echo "📋 To monitor logs: tail -f $METRO_LOG_FILE"
echo "📋 Or use current log tracker: tail -f \$(cat /tmp/METRO_CURRENT_LOG_FILENAME.txt)"

# Wait a moment for Metro to fully start
echo "⏳ Waiting for Metro to initialize..."
sleep 3

# Check if there's a booted simulator and app installed
DEVICE_UDID=$(xcrun simctl list devices booted --json | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .udid' | head -1)

if [ -n "$DEVICE_UDID" ]; then
    echo "📱 Found booted simulator: $DEVICE_UDID"
    
    # Check if FogOfDog app is installed
    APP_INSTALLED=$(xcrun simctl listapps "$DEVICE_UDID" | grep -c "com.fogofdog.app" || true)
    
    if [ "$APP_INSTALLED" -gt 0 ]; then
        echo "🔄 Reloading app programmatically..."
        
        # Launch the app to bring it to foreground
        xcrun simctl launch "$DEVICE_UDID" com.fogofdog.app
        sleep 2
        
        # Wait for Metro to be fully ready
        echo "⏳ Waiting for Metro to be ready for connections..."
        sleep 3
        
        # Try to trigger reload via Metro's dev server
        echo "📡 Triggering iOS app reload..."
        
        # Method 1: Try Metro's reload endpoint for iOS
        curl -X POST "http://localhost:8081/reload?platform=ios" 2>/dev/null || true
        
        # Method 2: Send reload command via Expo CLI
        echo "r" | timeout 2s npx expo start --no-dev --no-minify 2>/dev/null || true
        
        # Method 3: Fallback - terminate and relaunch
        echo "🔄 Fallback: Restarting app..."
        xcrun simctl terminate "$DEVICE_UDID" com.fogofdog.app 2>/dev/null || true
        sleep 2
        xcrun simctl launch "$DEVICE_UDID" com.fogofdog.app
        
        echo "✅ App reload triggered - should connect to Metro"
    else
        echo "⚠️  FogOfDog app not found on simulator"
        echo "💡 Install app first: xcrun simctl launch $DEVICE_UDID com.fogofdog.app"
    fi
else
    echo "⚠️  No booted simulator found"
    echo "💡 Start simulator first: open -a Simulator"
fi 