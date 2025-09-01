#!/bin/bash

# Integration Test Runner - Works in both local and CI environments
# Supports both individual test execution and CI batch execution
# Includes visual regression testing using SSIM comparison

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

# Parse command line arguments
CREATE_REFERENCE=false
FORCE_REBUILD=false
TEST_FILES=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            echo "Usage: $0 [options] [test-file1] [test-file2] ..."
            echo ""
            echo "Options:"
            echo "  --help, -h              Show this help message"
            echo "  --create-reference      Create reference screenshots for visual regression"
            echo "  --force-rebuild         Force rebuild of the app (ignores existing build)"
            echo "  --all                   Run all available tests (default in CI)"
            echo ""
            echo "Examples:"
            echo "  $0                                          # Run all tests (default)"
            echo "  $0 .maestro/background-gps-test.yaml       # Run single test"
            echo "  $0 --create-reference .maestro/smoke-test.yaml  # Create reference screenshot"
            echo "  $0 --force-rebuild .maestro/data-clearing-test.yaml  # Force rebuild and test"
            echo ""
            echo "Environment variables:"
            echo "  CI=true         Automatically detected in CI environments"
            exit 0
            ;;
        --create-reference)
            CREATE_REFERENCE=true
            shift
            ;;
        --force-rebuild)
            FORCE_REBUILD=true
            shift
            ;;
        --all)
            # Explicit --all flag (mainly for local use)
            shift
            ;;
        *)
            TEST_FILES+=("$1")
            shift
            ;;
    esac
done

# Determine which tests to run
if [ ${#TEST_FILES[@]} -eq 0 ] || [ "$IS_CI" = "true" ]; then
    # No specific tests provided or in CI - run all tests
    TEST_FILES=(
        ".maestro/smoke-test.yaml"
        ".maestro/robust-login.yaml"
        ".maestro/background-gps-test.yaml"
        ".maestro/comprehensive-persistence-test.yaml"
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

# --- E2E Build Setup ---
log "🔧 Setting up E2E build..."
if [ "$FORCE_REBUILD" = "true" ]; then
    log "🔨 Force rebuild requested - removing existing build..."
    rm -rf "/Users/pacey/Library/Developer/Xcode/DerivedData/Build/Products/Release-iphonesimulator/FogOfDog.app"
fi

if ! ./scripts/setup-e2e-tests.sh; then
    log "❌ E2E setup failed"
    exit 1
fi

# --- Inject Data for Specific Tests ---
for TEST_FILE in "${TEST_FILES[@]}"; do
    if [[ "$TEST_FILE" == *"/data-clearing-test.yaml" ]]; then
        log "💉 Injecting historical data for data clearing test..."
        node ./scripts/gps/gps-injector-direct.js --mode absolute --lat 37.7749 --lon -122.4194 --time-delta-hours -2
        node ./scripts/gps/gps-injector-direct.js --mode absolute --lat 37.7759 --lon -122.4294 --time-delta-hours -25
        node ./scripts/gps/gps-injector-direct.js --mode absolute --lat 37.7769 --lon -122.4394 --time-delta-hours -50
        log "✅ Historical data injected."
    fi
done

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
log "✅ App build and installation handled by E2E setup script"

# --- Setup Test Environment ---
log "🧪 Setting up test environment..."

# Create artifacts directory
if [ "$IS_CI" = "true" ]; then
    ARTIFACTS_DIR="test_artifacts/ci"
else
    ARTIFACTS_DIR="test_artifacts/local"
fi

mkdir -p "$ARTIFACTS_DIR"
log "📁 Artifacts will be saved to: $ARTIFACTS_DIR"

# --- Visual Regression Testing Setup ---
if [ "$CREATE_REFERENCE" = "true" ]; then
    log "📸 Creating reference screenshots mode enabled"
    REFERENCE_DIR="test_data/reference_screenshots"
    mkdir -p "$REFERENCE_DIR"
fi

# Function to compare screenshots using SSIM
compare_screenshots() {
    local test_name="$1"
    local screenshot_path="$2"
    
    if [ "$CREATE_REFERENCE" = "true" ]; then
        # Copy screenshot as reference
        cp "$screenshot_path" "$REFERENCE_DIR/${test_name}-reference.png"
        log "📸 Created reference screenshot: ${test_name}-reference.png"
        return 0
    fi
    
    local reference_path="$REFERENCE_DIR/${test_name}-reference.png"
    
    if [ ! -f "$reference_path" ]; then
        log "⚠️  No reference screenshot found for $test_name, skipping comparison"
        return 0
    fi
    
    # Use ImageMagick to compare screenshots
    if command_exists magick; then
        local similarity=$(magick compare -metric SSIM "$reference_path" "$screenshot_path" null: 2>&1 || echo "0")
        local threshold=0.95
        
        if (( $(echo "$similarity > $threshold" | bc -l) )); then
            log "✅ Visual regression test passed for $test_name (SSIM: $similarity)"
            return 0
        else
            log "❌ Visual regression test failed for $test_name (SSIM: $similarity, threshold: $threshold)"
            # Save diff image
            magick compare "$reference_path" "$screenshot_path" "$ARTIFACTS_DIR/${test_name}-diff.png"
            return 1
        fi
    else
        log "⚠️  ImageMagick not available, skipping visual comparison for $test_name"
        return 0
    fi
}

# --- Test Execution ---
log "🎯 Starting test execution..."

FAILED_TESTS=()
TOTAL_TESTS=${#TEST_FILES[@]}
PASSED_TESTS=0

for TEST_FILE in "${TEST_FILES[@]}"; do
    TEST_NAME=$(basename "$TEST_FILE" .yaml)
    log "🧪 Running test: $TEST_NAME"
    
    # Create test-specific artifact directory
    TEST_ARTIFACTS_DIR="$ARTIFACTS_DIR/$TEST_NAME"
    mkdir -p "$TEST_ARTIFACTS_DIR"
    
    # Run the test with artifact collection
    if maestro test "$TEST_FILE" --output "$TEST_ARTIFACTS_DIR"; then
        log "✅ Test passed: $TEST_NAME"
        
        # Check for screenshots and run visual regression if available
        SCREENSHOT_PATH="$TEST_ARTIFACTS_DIR/screenshot.png"
        if [ -f "$SCREENSHOT_PATH" ]; then
            if ! compare_screenshots "$TEST_NAME" "$SCREENSHOT_PATH"; then
                log "❌ Visual regression failed for: $TEST_NAME"
                FAILED_TESTS+=("$TEST_NAME (visual regression)")
            fi
        fi
        
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        log "❌ Test failed: $TEST_NAME"
        
        # Capture debugging information on failure
        if [ "$IS_CI" = "true" ]; then
            log "🔍 Capturing debug information for failed test..."
            
            # Take a screenshot of current state
            xcrun simctl io booted screenshot "$TEST_ARTIFACTS_DIR/failure_screenshot.png" 2>/dev/null || true
            
            # Get app state information
            log "📱 Current simulator state:"
            xcrun simctl list devices | grep -A 5 "iPhone 15 Pro" || true
            
            # List installed apps
            log "📦 Installed apps containing 'fog':"
            xcrun simctl listapps booted | grep -i fog || echo "No fog apps found"
            
            # Check if app is running
            log "🏃 Running processes containing 'fog':"
            xcrun simctl spawn booted ps aux | grep -i fog || echo "No fog processes found"
            
            # Check simulator logs for errors
            log "📋 Recent simulator logs (last 20 lines):"
            xcrun simctl spawn booted log show --last 20 --predicate 'process CONTAINS "fog"' || true
            
            # Copy Maestro debug output if available
            MAESTRO_DEBUG_DIR=$(find ~/.maestro/tests -name "*$(date +%Y-%m-%d)*" -type d | tail -1)
            if [ -n "$MAESTRO_DEBUG_DIR" ] && [ -d "$MAESTRO_DEBUG_DIR" ]; then
                log "📸 Copying Maestro debug output..."
                cp -r "$MAESTRO_DEBUG_DIR"/* "$TEST_ARTIFACTS_DIR/" 2>/dev/null || true
            fi
        fi
        
        FAILED_TESTS+=("$TEST_NAME")
    fi
    
    log "📊 Progress: $PASSED_TESTS/$TOTAL_TESTS tests completed"
done

# --- Cleanup ---
log "🧹 Cleaning up..."

if [ "$IS_CI" = "true" ]; then
    # In CI, shutdown simulator
    log "🛑 Shutting down CI simulator..."
    xcrun simctl shutdown "$SIMULATOR_UDID" || true
    
    # Clean up build artifacts
    rm -f build.tar.gz
    rm -rf *.app
else
    # In local environment, optionally stop Metro
    if [ -n "$METRO_PID" ]; then
        log "🛑 Stopping Metro bundler..."
        kill $METRO_PID 2>/dev/null || true
    fi
fi

# --- Results Summary ---
log "📊 Test Results Summary"
log "Total tests: $TOTAL_TESTS"
log "Passed: $PASSED_TESTS"
log "Failed: $((TOTAL_TESTS - PASSED_TESTS))"

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    log "❌ Failed tests:"
    for failed_test in "${FAILED_TESTS[@]}"; do
        log "  - $failed_test"
    done
    log "📁 Test artifacts saved to: $ARTIFACTS_DIR"
    exit 1
else
    log "✅ All tests passed!"
    log "📁 Test artifacts saved to: $ARTIFACTS_DIR"
    exit 0
fi 