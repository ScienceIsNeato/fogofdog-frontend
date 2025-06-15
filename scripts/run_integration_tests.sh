#!/bin/bash

# Integration Test Runner - Ensures app is running before executing Maestro tests
# Captures Metro console logs and saves them as test artifacts

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <test-file>"
    echo "Example: $0 .maestro/background-gps-test.yaml"
    exit 1
fi

TEST_FILE="$1"

if [ ! -f "$TEST_FILE" ]; then
    echo "Error: Test file '$TEST_FILE' not found"
    exit 1
fi

# --- Start: Environment Validation ---

# 1. Define App Bundle ID
APP_BUNDLE_ID="com.fogofdog.app"

# 2. Check if Simulator app is running
if ! pgrep -x "Simulator" > /dev/null; then
    echo "🚀 Starting iOS Simulator..."
    open -a Simulator
    echo "⏳ Waiting for Simulator to launch..."
    sleep 10
fi

# 3. Get Booted Device UDID
BOOTED_DEVICE_UDID=$(xcrun simctl list devices | grep "Booted" | awk -F'[()]' '{print $2}')

if [ -z "$BOOTED_DEVICE_UDID" ]; then
    echo "❌ No booted device found. Please launch a simulator and run the script again."
    exit 1
else
    echo "✅ Simulator is running (Device UDID: $BOOTED_DEVICE_UDID)."
fi

# 4. Check if the app is installed
if ! xcrun simctl appinfo "$BOOTED_DEVICE_UDID" "$APP_BUNDLE_ID" > /dev/null 2>&1; then
    echo "❌ App '$APP_BUNDLE_ID' is not installed on the booted simulator."
    echo "👉 Please run './scripts/setup-e2e-tests.sh' first to install the correct build."
    exit 1
fi

# --- End: Environment Validation ---

echo "🔍 Running app readiness check (refreshes Metro and validates bundle)..."
./scripts/bundle-check.sh

# --- App Launch ---
echo "📲 Launching app '$APP_BUNDLE_ID'..."
xcrun simctl launch "$BOOTED_DEVICE_UDID" "$APP_BUNDLE_ID"
echo "⏳ Waiting for app to launch and connect to Metro..."
sleep 10 # Give the app time to connect

# Create test artifacts directory
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
ARTIFACTS_DIR="test_artifacts/integration_${TIMESTAMP}"
mkdir -p "$ARTIFACTS_DIR"

echo "📱 Capturing Metro console logs..."
# Find the most recent Metro log file
METRO_LOG=$(ls -t /tmp/metro_console_*.log 2>/dev/null | head -1)

echo "🎭 Starting integration test: $TEST_FILE"
# Run the test and capture exit code
if maestro test "$TEST_FILE"; then
    MAESTRO_RESULT="PASSED"
    MAESTRO_EXIT_CODE=0
else
    MAESTRO_RESULT="FAILED"
    MAESTRO_EXIT_CODE=1
fi

echo "📋 Analyzing console logs for critical errors..."

# Copy Metro console logs if available
if [ -n "$METRO_LOG" ] && [ -f "$METRO_LOG" ]; then
    cp "$METRO_LOG" "$ARTIFACTS_DIR/metro_console.log"
    echo "Metro console logs saved to: $ARTIFACTS_DIR/metro_console.log"

    # Check for critical runtime errors that should fail the test
    CRITICAL_ERRORS_FOUND=false

    # Check for actual ERROR level logs (not WARN logs that contain "error" in message)
    if grep "ERROR \[" "$METRO_LOG" > "$ARTIFACTS_DIR/console_errors.log"; then
        echo "❌ CRITICAL: Console errors detected!"
        echo "Console errors found:"
        cat "$ARTIFACTS_DIR/console_errors.log"
        CRITICAL_ERRORS_FOUND=true
    fi

    # Check for warnings (log but don't fail)
    if grep -i "WARN" "$METRO_LOG" > "$ARTIFACTS_DIR/console_warnings.log"; then
        echo "⚠️  Console warnings detected - saved to: $ARTIFACTS_DIR/console_warnings.log"
        # Don't fail the test for warnings, but log them
    fi

    # Determine final test result
    if [ "$CRITICAL_ERRORS_FOUND" = true ]; then
        TEST_RESULT="FAILED"
        EXIT_CODE=1
        echo ""
        echo "🚨 TEST FAILED: Critical runtime errors detected even though Maestro test passed"
        echo "🔍 Check console_errors.log for details"
    elif [ "$MAESTRO_EXIT_CODE" -eq 0 ]; then
        TEST_RESULT="PASSED"
        EXIT_CODE=0
        echo "✅ No critical errors detected in Metro logs"
    else
        TEST_RESULT="FAILED"
        EXIT_CODE=1
    fi
else
    echo "⚠️  No Metro console logs found"
    TEST_RESULT="$MAESTRO_RESULT"
    EXIT_CODE="$MAESTRO_EXIT_CODE"
fi

# Copy Maestro test artifacts if they exist
MAESTRO_TEST_DIR=$(find ~/.maestro/tests -name "*$(date +%Y-%m-%d)*" -type d | tail -1)
if [ -n "$MAESTRO_TEST_DIR" ] && [ -d "$MAESTRO_TEST_DIR" ]; then
    cp -r "$MAESTRO_TEST_DIR"/* "$ARTIFACTS_DIR/" 2>/dev/null || true
    echo "Maestro test artifacts copied to: $ARTIFACTS_DIR/"
fi

# Create test summary
cat > "$ARTIFACTS_DIR/test_summary.txt" << EOF
Integration Test Summary
========================
Test File: $TEST_FILE
Timestamp: $TIMESTAMP
Maestro Result: $MAESTRO_RESULT
Final Result: $TEST_RESULT
Exit Code: $EXIT_CODE
Critical Errors Found: $CRITICAL_ERRORS_FOUND

Artifacts Location: $ARTIFACTS_DIR
EOF

echo ""
echo "🎯 Integration test completed: $TEST_RESULT"
echo "📁 Test artifacts saved to: $ARTIFACTS_DIR"

# Exit with the final result (fails if critical errors found)
exit $EXIT_CODE 