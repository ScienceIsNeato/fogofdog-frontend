#!/bin/bash

# Integration Test Runner - Works in both local and CI environments
# Captures Metro console logs and saves them as test artifacts

set -e

# Environment detection
IS_CI=${CI:-false}
IS_GITHUB_ACTIONS=${GITHUB_ACTIONS:-false}

# Configuration
APP_BUNDLE_ID="com.fogofdog.app"
SIMULATOR_DEVICE="iPhone 15 Pro"
SIMULATOR_OS="17.5"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# Parse arguments and flags
TEST_FILES=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            echo "Usage: $0 [test-file1] [test-file2] ..."
            echo ""
            echo "Options:"
            echo "  --help, -h      Show this help message"
            echo ""
            echo "Examples:"
            echo "  $0                                          # Run all tests (default)"
            echo "  $0 .maestro/background-gps-test.yaml       # Run single test"
            echo "  $0 .maestro/login-to-map-test.yaml .maestro/background-gps-test.yaml  # Run specific tests"
            echo ""
            echo "Environment variables:"
            echo "  CI=true         Automatically detected in CI environments"
            exit 0
            ;;
        *)
            TEST_FILES+=("$1")
            shift
            ;;
    esac
done

# Determine which tests to run
if [ ${#TEST_FILES[@]} -eq 0 ]; then
    # No specific tests provided - run all tests
    TEST_FILES=(
        ".maestro/login-to-map-test.yaml"
        ".maestro/background-gps-test.yaml"
    )
    log "Running all integration tests"
fi

# Validate test files exist
for TEST_FILE in "${TEST_FILES[@]}"; do
    if [ ! -f "$TEST_FILE" ]; then
        log "❌ Error: Test file '$TEST_FILE' not found"
        exit 1
    fi
done

log "🎭 Integration Test Runner (CI: $IS_CI)"
log "Test files: ${TEST_FILES[*]}"

# --- Environment Setup ---
if [ "$IS_CI" = "true" ]; then
    log "🔧 Setting up CI environment..."
    
    # Install Maestro if not available
    if ! command_exists maestro; then
        log "📦 Installing Maestro..."
        curl -Ls "https://get.maestro.mobile.dev" | bash
        export PATH="$PATH:$HOME/.maestro/bin"
    fi
    
    # List available simulators for debugging
    log "Available simulators:"
    xcrun simctl list devices available
fi

# --- Simulator Management ---
log "📱 Setting up iOS Simulator..."

if [ "$IS_CI" = "true" ]; then
    # In CI, create/find simulator
    SIMULATOR_UDID=$(xcrun simctl list devices | grep "$SIMULATOR_DEVICE" | grep "$SIMULATOR_OS" | head -1 | grep -o '[A-F0-9-]\{36\}' || true)
    
    if [ -z "$SIMULATOR_UDID" ]; then
        log "🔨 Creating new simulator: $SIMULATOR_DEVICE ($SIMULATOR_OS)"
        SIMULATOR_UDID=$(xcrun simctl create "CI-$SIMULATOR_DEVICE" "com.apple.CoreSimulator.SimDeviceType.iPhone-15-Pro" "com.apple.CoreSimulator.SimRuntime.iOS-17-5")
        log "✅ Created simulator with UDID: $SIMULATOR_UDID"
    else
        log "✅ Found existing simulator with UDID: $SIMULATOR_UDID"
    fi
    
    # Boot the simulator
    log "🚀 Booting simulator..."
    xcrun simctl boot "$SIMULATOR_UDID" || true
    
    # Wait for simulator to be ready
    log "⏳ Waiting for simulator to be ready..."
    timeout=60
    while [ $timeout -gt 0 ]; do
        if xcrun simctl list devices | grep "$SIMULATOR_UDID" | grep -q "Booted"; then
            log "✅ Simulator is booted and ready"
            break
        fi
        sleep 2
        timeout=$((timeout - 2))
    done
    
    if [ $timeout -le 0 ]; then
        log "❌ Simulator failed to boot within 60 seconds"
        exit 1
    fi
else
    # Local environment - check for running simulator
    if ! pgrep -x "Simulator" > /dev/null; then
        log "🚀 Starting iOS Simulator..."
        open -a Simulator
        log "⏳ Waiting for Simulator to launch..."
        sleep 10
    fi
    
    # Get booted device UDID
    SIMULATOR_UDID=$(xcrun simctl list devices | grep "Booted" | awk -F'[()]' '{print $2}')
    
    if [ -z "$SIMULATOR_UDID" ]; then
        log "❌ No booted device found. Please launch a simulator and run the script again."
        exit 1
    else
        log "✅ Simulator is running (Device UDID: $SIMULATOR_UDID)."
    fi
fi

# --- App Installation ---
if [ "$IS_CI" = "true" ]; then
    log "🏗️ Building and installing app for CI..."
    
    # Build the app for simulator
    log "📦 Running Expo export..."
    npx expo export --platform ios
    
    # Setup EAS CLI for building
    log "🔧 Setting up EAS CLI..."
    if [ -z "$EXPO_TOKEN" ]; then
        log "❌ EXPO_TOKEN not available - cannot build app for testing"
        exit 1
    fi
    
    # Install EAS CLI if not available
    if ! command_exists eas; then
        log "📦 Installing EAS CLI..."
        npm install -g @expo/eas-cli
    fi
    
    # Build for simulator (development build)
    log "🔨 Building test version with EAS..."
    eas build --platform ios --profile development --local --output ./build/app.tar.gz
    
    # Extract and install the app
    log "📲 Installing app on simulator..."
    mkdir -p build
    cd build
    tar -xzf app.tar.gz
    APP_PATH=$(find . -name "*.app" -type d | head -1)
    
    if [ -z "$APP_PATH" ]; then
        log "❌ Could not find .app bundle in build output"
        exit 1
    fi
    
    # Install the app
    xcrun simctl install "$SIMULATOR_UDID" "$APP_PATH"
    log "✅ App installed successfully"
    cd ..
else
    # Local environment - check if app is installed
    if ! xcrun simctl appinfo "$SIMULATOR_UDID" "$APP_BUNDLE_ID" > /dev/null 2>&1; then
        log "❌ App '$APP_BUNDLE_ID' is not installed on the booted simulator."
        log "👉 Please run './scripts/setup-e2e-tests.sh' first to install the correct build."
        exit 1
    fi
    
    log "🔍 Running app readiness check (refreshes Metro and validates bundle)..."
    ./scripts/bundle-check.sh
fi

# --- Test Execution Setup ---
# Create test artifacts directory
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
if [ "$IS_CI" = "true" ]; then
    ARTIFACTS_DIR="test_artifacts/ci_integration_${TIMESTAMP}"
else
    ARTIFACTS_DIR="test_artifacts/integration_${TIMESTAMP}"
fi
mkdir -p "$ARTIFACTS_DIR"

# Start Metro if in CI (for development builds)
if [ "$IS_CI" = "true" ]; then
    log "🚀 Starting Metro bundler for CI..."
    npx expo start --dev-client --tunnel &
    METRO_PID=$!
    sleep 10
fi

# --- Run Tests ---
log "🎭 Running integration tests..."

OVERALL_RESULT="PASSED"
FAILED_TESTS=()

for TEST_FILE in "${TEST_FILES[@]}"; do
    log "🧪 Running test: $TEST_FILE"
    
    # Launch the app before each test
    log "📲 Launching app '$APP_BUNDLE_ID'..."
    xcrun simctl launch "$SIMULATOR_UDID" "$APP_BUNDLE_ID"
    log "⏳ Waiting for app to launch and connect..."
    sleep 10
    
    # Capture Metro logs (local only)
    if [ "$IS_CI" != "true" ]; then
        log "📱 Capturing Metro console logs..."
        METRO_LOG=$(ls -t /tmp/metro_console_*.log 2>/dev/null | head -1)
    fi
    
    # Run the test
    if maestro test "$TEST_FILE"; then
        MAESTRO_RESULT="PASSED"
        MAESTRO_EXIT_CODE=0
        log "✅ Test passed: $TEST_FILE"
    else
        MAESTRO_RESULT="FAILED"
        MAESTRO_EXIT_CODE=1
        log "❌ Test failed: $TEST_FILE"
        OVERALL_RESULT="FAILED"
        FAILED_TESTS+=("$TEST_FILE")
    fi
    
    # Analyze console logs (local only)
    if [ "$IS_CI" != "true" ] && [ -n "$METRO_LOG" ] && [ -f "$METRO_LOG" ]; then
        log "📋 Analyzing console logs for critical errors..."
        cp "$METRO_LOG" "$ARTIFACTS_DIR/metro_console_$(basename "$TEST_FILE" .yaml).log"
        
        # Check for critical runtime errors
        if grep "ERROR \[" "$METRO_LOG" > "$ARTIFACTS_DIR/console_errors_$(basename "$TEST_FILE" .yaml).log"; then
            log "❌ CRITICAL: Console errors detected!"
            cat "$ARTIFACTS_DIR/console_errors_$(basename "$TEST_FILE" .yaml).log"
            OVERALL_RESULT="FAILED"
            if [[ ! " ${FAILED_TESTS[*]} " =~ " ${TEST_FILE} " ]]; then
                FAILED_TESTS+=("$TEST_FILE")
            fi
        fi
        
        # Check for warnings (log but don't fail)
        if grep -i "WARN" "$METRO_LOG" > "$ARTIFACTS_DIR/console_warnings_$(basename "$TEST_FILE" .yaml).log"; then
            log "⚠️  Console warnings detected - saved to artifacts"
        fi
    fi
    
    # Terminate the app between tests
    xcrun simctl terminate "$SIMULATOR_UDID" "$APP_BUNDLE_ID" || true
    sleep 2
done

# --- Cleanup ---
log "🧹 Cleaning up..."

# Stop Metro if we started it
if [ "$IS_CI" = "true" ] && [ -n "$METRO_PID" ]; then
    kill $METRO_PID 2>/dev/null || true
fi

# Shutdown simulator if in CI
if [ "$IS_CI" = "true" ]; then
    xcrun simctl shutdown "$SIMULATOR_UDID" || true
fi

# Copy Maestro test artifacts
MAESTRO_TEST_DIR=$(find ~/.maestro/tests -name "*$(date +%Y-%m-%d)*" -type d | tail -1)
if [ -n "$MAESTRO_TEST_DIR" ] && [ -d "$MAESTRO_TEST_DIR" ]; then
    cp -r "$MAESTRO_TEST_DIR"/* "$ARTIFACTS_DIR/" 2>/dev/null || true
    log "📁 Maestro test artifacts copied to: $ARTIFACTS_DIR/"
fi

# Create test summary
cat > "$ARTIFACTS_DIR/test_summary.txt" << EOF
Integration Test Summary
========================
Environment: $([ "$IS_CI" = "true" ] && echo "CI" || echo "Local")
Timestamp: $TIMESTAMP
Simulator: $SIMULATOR_DEVICE
Simulator UDID: $SIMULATOR_UDID
Overall Result: $OVERALL_RESULT
Failed Tests: ${FAILED_TESTS[*]}

Test Files Run:
$(printf '%s\n' "${TEST_FILES[@]}")

Artifacts Location: $ARTIFACTS_DIR
EOF

# --- Results ---
log "📊 Test Results Summary"
log "======================"
log "Environment: $([ "$IS_CI" = "true" ] && echo "CI" || echo "Local")"
log "Overall Result: $OVERALL_RESULT"

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    log "❌ Failed Tests:"
    for test in "${FAILED_TESTS[@]}"; do
        log "   - $test"
    done
fi

log "📁 Test artifacts saved to: $ARTIFACTS_DIR"

# Exit with appropriate code
if [ "$OVERALL_RESULT" = "PASSED" ]; then
    log "🎉 All integration tests passed!"
    exit 0
else
    log "💥 Some integration tests failed!"
    exit 1
fi 