#!/bin/bash

# Integration Test Runner - Cross-Platform (iOS + Android)
# Supports both individual test execution and CI batch execution
# Includes visual regression testing using SSIM comparison
#
# Device readiness (emulator/simulator boot, app install, Metro) is handled
# automatically via deploy_app.sh when needed. If a device is already running
# with the app installed, deploy is skipped for fast iteration.
#
# Usage:
#   ./scripts/run_integration_tests.sh --platform android
#   ./scripts/run_integration_tests.sh --platform android --no-window

set -e

# Resolve project root (script lives in scripts/)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

# Environment detection
IS_CI=${CI:-false}
IS_GITHUB_ACTIONS=${GITHUB_ACTIONS:-false}

# Configuration
APP_BUNDLE_ID="com.fogofdog.app"

# Function to log with timestamp
log() {
    echo "[$(date '+%Y-%m-%d %H:%M:%S')] $1"
}

# Function to check if command exists
command_exists() {
    command -v "$1" >/dev/null 2>&1
}

# =============================================================================
# Platform detection helpers
# =============================================================================

is_ios_device_running() {
    if pgrep -x "Simulator" > /dev/null 2>&1; then
        return 0
    fi
    # Also check for booted simulators without the UI process
    xcrun simctl list devices 2>/dev/null | grep -q "Booted" && return 0
    return 1
}

is_android_device_running() {
    adb devices 2>/dev/null | grep -qE "emulator|device$" && return 0
    return 1
}

is_app_installed_ios() {
    local booted_udid
    booted_udid=$(xcrun simctl list devices 2>/dev/null | grep "Booted" | head -1 | grep -o '[A-F0-9-]\{36\}' || true)
    [ -n "$booted_udid" ] && xcrun simctl listapps "$booted_udid" 2>/dev/null | grep -q "$APP_BUNDLE_ID"
}

is_app_installed_android() {
    adb shell pm list packages 2>/dev/null | grep -q "$APP_BUNDLE_ID"
}

# Auto-detect platform from running devices
auto_detect_platform() {
    local ios_running=false
    local android_running=false

    if is_ios_device_running; then ios_running=true; fi
    if is_android_device_running; then android_running=true; fi

    if [ "$ios_running" = "true" ] && [ "$android_running" = "true" ]; then
        log "⚠️  Both iOS and Android devices detected. Use --platform to disambiguate."
        log "    Defaulting to iOS."
        echo "ios"
    elif [ "$ios_running" = "true" ]; then
        echo "ios"
    elif [ "$android_running" = "true" ]; then
        echo "android"
    else
        echo ""
    fi
}

# =============================================================================
# Parse command line arguments
# =============================================================================

CREATE_REFERENCE=false
FORCE_REBUILD=false
NO_WINDOW=false
PLATFORM=""
TEST_FILES=()

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            echo "Usage: $0 [options] [test-file1] [test-file2] ..."
            echo ""
            echo "Options:"
            echo "  --help, -h              Show this help message"
            echo "  --platform ios|android  Target platform (auto-detected if omitted)"
            echo "  --force-rebuild         Force rebuild of the app (ignores existing build)"
            echo "  --no-window             Android: run emulator headless (no GUI window)"
            echo "  --all                   Run all available tests (default in CI)"
            echo ""
            echo "Visual regression:"
            echo "  Ground truth is managed via scripts/establish_ground_truth.sh."
            echo "  Manifests live at test_data/ground_truth/{test-name}.json."
            echo ""
            echo "Examples:"
            echo "  $0 .maestro/smoke-test.yaml                     # Auto-detect platform"
            echo "  $0 --platform android .maestro/smoke-test.yaml  # Run on Android"
            echo "  $0 --platform ios --all                         # Run all on iOS"
            echo "  $0 --create-reference .maestro/smoke-test.yaml  # Create reference screenshot"
            echo ""
            echo "Notes:"
            echo "  Device and app readiness are handled automatically via deploy_app.sh."
            echo "  Pass --no-window to run the Android emulator headless (default: GUI visible)."
            echo ""
            echo "Environment variables:"
            echo "  CI=true         Automatically detected in CI environments"
            exit 0
            ;;
        --platform)
            PLATFORM="$2"
            if [[ "$PLATFORM" != "ios" && "$PLATFORM" != "android" ]]; then
                log "❌ Invalid platform: '$PLATFORM'. Must be 'ios' or 'android'."
                exit 1
            fi
            shift 2
            ;;
        --create-reference)
            CREATE_REFERENCE=true
            shift
            ;;
        --force-rebuild)
            FORCE_REBUILD=true
            shift
            ;;
        --no-window)
            NO_WINDOW=true
            shift
            ;;
        --all)
            shift
            ;;
        *)
            TEST_FILES+=("$1")
            shift
            ;;
    esac
done

# =============================================================================
# Platform resolution
# =============================================================================

if [ -z "$PLATFORM" ]; then
    PLATFORM=$(auto_detect_platform)
    if [ -z "$PLATFORM" ]; then
        log "❌ No running device or emulator detected and no --platform specified."
        log "   Use --platform ios|android to specify a target (deploy_app.sh will boot it)."
        exit 1
    fi
    log "🔍 Auto-detected platform: $PLATFORM"
fi

# Determine which tests to run
if [ ${#TEST_FILES[@]} -eq 0 ] || [ "$IS_CI" = "true" ]; then
    TEST_FILES=(
        ".maestro/smoke-test.yaml"
        ".maestro/background-gps-test.yaml"
        ".maestro/map-skin-test.yaml"
        ".maestro/data-clearing-test.yaml"
        ".maestro/street-navigation-test.yaml"
        ".maestro/first-time-user-complete-flow.yaml"
        # comprehensive-persistence-test.yaml: SKIPPED — tests auth persistence
        # which is currently disabled (auth navigator commented out in navigation/index.tsx).
        # Re-enable when auth is restored.
    )
    log "Running default integration test suite"
fi

# Validate test files exist
for TEST_FILE in "${TEST_FILES[@]}"; do
    if [ ! -f "$TEST_FILE" ]; then
        log "❌ Error: Test file '$TEST_FILE' not found"
        exit 1
    fi
done

log "🎭 Integration Test Runner (Platform: $PLATFORM, CI: $IS_CI)"
log "Test files: ${TEST_FILES[*]}"

# =============================================================================
# Device / Emulator readiness (delegates to deploy_app.sh)
# =============================================================================
# Instead of managing device boot, app installation, and Metro lifecycle here,
# we delegate to deploy_app.sh which is the single source of truth for all
# device management. This script only does a quick check first — if everything
# is already running, deploy_app.sh is skipped entirely for fast iteration.

ensure_device_ready() {
    local needs_deploy=false

    if [ "$FORCE_REBUILD" = "true" ]; then
        needs_deploy=true
    elif [ "$PLATFORM" = "ios" ]; then
        if ! is_ios_device_running || ! is_app_installed_ios; then
            needs_deploy=true
        fi
    else
        if ! is_android_device_running || ! is_app_installed_android; then
            needs_deploy=true
        fi
    fi

    if [ "$needs_deploy" = "true" ]; then
        log "🚀 Device/app not ready — deploying via deploy_app.sh..."
        local deploy_args=(--device "$PLATFORM" --mode development --data current --skip-gps)
        [ "$FORCE_REBUILD" = "true" ] && deploy_args+=(--force)
        [ "$NO_WINDOW" = "true" ] && deploy_args+=(--no-window)
        "$SCRIPT_DIR/deploy_app.sh" "${deploy_args[@]}"
    else
        if [ "$PLATFORM" = "ios" ]; then
            log "✅ iOS device running, app installed"
        else
            log "✅ Android device running, app installed"
        fi
    fi
}

# =============================================================================
# Bundle check (refreshes Metro + validates JS bundle compiles)
# =============================================================================

run_bundle_check() {
    if [ -f "$SCRIPT_DIR/internal/bundle-check.sh" ]; then
        log "🔍 Running bundle health check..."
        if ! "$SCRIPT_DIR/internal/bundle-check.sh" --platform "$PLATFORM"; then
            log "❌ Bundle check failed — fix JS errors before running Maestro tests"
            exit 1
        fi
    else
        log "⚠️  bundle-check.sh not found, skipping bundle validation"
    fi
}

# =============================================================================
# Android fresh-state preparation (deterministic "happy path" start)
# =============================================================================
# Goal: After this function, the Android app launches directly to MapScreen
# with zero UI gates (no onboarding, no permissions dialogs, no dev menu).
#
# Why we manage state here instead of in Maestro:
#   - `launchApp clearState: true` wipes Metro URL → app backgrounds itself
#   - pm clear wipes dev menu "onboarding finished" → welcome screen appears
#   - Maestro has no access to AsyncStorage or SharedPreferences
#
# What we inject:
#   1. Expo dev-menu SharedPreferences (skip dev menu welcome)
#   2. AsyncStorage RKStorage SQLite database:
#      - @fogofdog_onboarding_completed = "true" (skip app onboarding)
#      - @permission_state = pre-granted full permissions (skip permission verification)
#   3. Runtime permissions via pm grant (OS-level location access)

prepare_android_fresh_state() {
    local test_file="${1:-}"
    local seed_onboarding="true"

    # First-time-user test needs onboarding to appear — don't pre-seed completion flag
    if [[ "$test_file" == *"first-time-user-complete-flow"* ]]; then
        seed_onboarding="false"
        log "🧹 Android: Preparing fresh state (onboarding NOT skipped — first-time-user test)"
    else
        log "🧹 Android: Preparing deterministic fresh state..."
    fi

    # Step 1: Clear all app data (equivalent to Maestro's clearState)
    adb shell pm clear "$APP_BUNDLE_ID" >/dev/null 2>&1

    # Step 2: Recreate data directories
    adb shell run-as "$APP_BUNDLE_ID" mkdir -p shared_prefs
    adb shell run-as "$APP_BUNDLE_ID" mkdir -p databases

    # Step 3: Inject Expo dev-menu "onboarding finished" flag.
    # Without this, the dev-client shows a welcome screen with no dismiss path.
    # See: node_modules/expo-dev-menu/android/.../DevMenuPreferences.kt
    adb shell "run-as $APP_BUNDLE_ID sh -c 'printf \"<?xml version=\\\"1.0\\\" encoding=\\\"utf-8\\\" standalone=\\\"yes\\\" ?>\\n<map>\\n    <boolean name=\\\"isOnboardingFinished\\\" value=\\\"true\\\" />\\n</map>\" > shared_prefs/expo.modules.devmenu.sharedpreferences.xml'"

    # Step 4: Inject AsyncStorage database (permissions + optionally onboarding).
    # AsyncStorage uses SQLite at databases/RKStorage, table catalystLocalStorage(key, value).
    # We create the database on the host (macOS sqlite3) and pipe it into the app sandbox.
    inject_async_storage_android "$seed_onboarding"

    # Step 5: Re-grant location permissions (pm clear revokes runtime permissions)
    adb shell pm grant "$APP_BUNDLE_ID" android.permission.ACCESS_FINE_LOCATION 2>/dev/null || true
    adb shell pm grant "$APP_BUNDLE_ID" android.permission.ACCESS_COARSE_LOCATION 2>/dev/null || true
    adb shell pm grant "$APP_BUNDLE_ID" android.permission.ACCESS_BACKGROUND_LOCATION 2>/dev/null || true

    log "✅ Android: Fresh state ready (onboarding_seeded=$seed_onboarding)"
}

# Create and inject an AsyncStorage SQLite database with pre-seeded values.
# This makes the app skip onboarding and permissions verification on launch.
#
# CRITICAL NOTES on the database format:
#   - user_version MUST be 1 (Android SQLiteOpenHelper treats 0 as "new DB"
#     and calls onCreate which drops/recreates all tables)
#   - android_metadata table is required by Android SQLite
#   - Table schema must exactly match: key TEXT PRIMARY KEY (NO "NOT NULL")
inject_async_storage_android() {
    local seed_onboarding="${1:-true}"
    local db_path="/tmp/fogofdog_RKStorage_$$"

    # Build the permission state JSON (needs current timestamp)
    local perm_ts
    perm_ts=$(date +%s)000  # milliseconds
    local perm_json="{\"result\":{\"canProceed\":true,\"hasBackgroundPermission\":true,\"mode\":\"full\"},\"timestamp\":${perm_ts}}"

    # Create SQLite database on host — sqlite3 is available on macOS.
    # Schema matches what @react-native-async-storage/async-storage creates on Android.
    sqlite3 "$db_path" <<EOF
PRAGMA user_version = 1;
CREATE TABLE IF NOT EXISTS android_metadata (locale TEXT);
INSERT INTO android_metadata VALUES ('en_US');
CREATE TABLE IF NOT EXISTS catalystLocalStorage (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
INSERT OR REPLACE INTO catalystLocalStorage (key, value)
VALUES ('@permission_state', '${perm_json}');
EOF

    # Conditionally seed onboarding completion flag.
    # When seed_onboarding=false (e.g., first-time-user test), the onboarding
    # overlay will appear because @fogofdog_onboarding_completed is absent.
    if [ "$seed_onboarding" = "true" ]; then
        sqlite3 "$db_path" <<EOF
INSERT OR REPLACE INTO catalystLocalStorage (key, value)
VALUES ('@fogofdog_onboarding_completed', 'true');
EOF
    fi

    if [ ! -f "$db_path" ]; then
        log "⚠️  Failed to create AsyncStorage database (sqlite3 not available?)"
        return 1
    fi

    # Pipe the binary SQLite file into the app sandbox via adb shell stdin.
    # Verified: binary integrity preserved (MD5 checksum match), no LF→CRLF corruption.
    cat "$db_path" | adb shell "run-as $APP_BUNDLE_ID sh -c 'cat > databases/RKStorage'"

    # Verify it landed
    local remote_size
    remote_size=$(adb shell "run-as $APP_BUNDLE_ID sh -c 'wc -c < databases/RKStorage'" 2>/dev/null | tr -d '[:space:]')
    local local_size
    local_size=$(wc -c < "$db_path" | tr -d '[:space:]')

    local onboarding_label
    if [ "$seed_onboarding" = "true" ]; then
        onboarding_label="completed"
    else
        onboarding_label="NOT seeded"
    fi

    if [ "$remote_size" = "$local_size" ]; then
        log "  💉 AsyncStorage: onboarding=$onboarding_label, permissions=full ($local_size bytes)"
    else
        log "  ⚠️  AsyncStorage size mismatch (local=$local_size, remote=$remote_size)"
    fi

    rm -f "$db_path"
}

# =============================================================================
# Data injection for specific tests
# =============================================================================

inject_test_data() {
    for TEST_FILE in "${TEST_FILES[@]}"; do
        if [[ "$TEST_FILE" == *"/data-clearing-test.yaml" ]]; then
            if [ "$PLATFORM" = "ios" ]; then
                log "💉 Injecting historical data for data clearing test (iOS)..."
                node ./scripts/gps/gps-injector-direct.js --mode absolute --lat 37.7749 --lon -122.4194 --time-delta-hours -2
                node ./scripts/gps/gps-injector-direct.js --mode absolute --lat 37.7759 --lon -122.4294 --time-delta-hours -25
                node ./scripts/gps/gps-injector-direct.js --mode absolute --lat 37.7769 --lon -122.4394 --time-delta-hours -50
                log "✅ Historical data injected."
            else
                log "ℹ️  Skipping historical data injection on Android (test generates data via GPS movements)"
            fi
        fi
    done
}

# =============================================================================
# CI environment: install Maestro if missing
# =============================================================================

ensure_maestro() {
    if command_exists maestro; then return 0; fi

    if [ "$IS_CI" = "true" ]; then
        log "📦 Installing Maestro..."
        curl -Ls "https://get.maestro.mobile.dev" | bash
        export PATH="$PATH:$HOME/.maestro/bin"
    else
        log "❌ Maestro is not installed."
        log "   Install: curl -Ls 'https://get.maestro.mobile.dev' | bash"
        exit 1
    fi
}

# =============================================================================
# Failure diagnostics (platform-aware)
# =============================================================================

capture_failure_debug() {
    local test_artifacts_dir="$1"

    log "🔍 Capturing debug information for failed test..."

    if [ "$PLATFORM" = "ios" ]; then
        xcrun simctl io booted screenshot "$test_artifacts_dir/failure_screenshot.png" 2>/dev/null || true

        log "📱 Simulator state:"
        xcrun simctl list devices | grep -A 3 "Booted" || true

        log "📦 Installed fog apps:"
        xcrun simctl listapps booted 2>/dev/null | grep -i fog || echo "  (none)"

        log "📋 Recent simulator logs:"
        xcrun simctl spawn booted log show --last 20 --predicate 'process CONTAINS "fog"' 2>/dev/null || true
    else
        adb exec-out screencap -p > "$test_artifacts_dir/failure_screenshot.png" 2>/dev/null || true

        log "📱 ADB device info:"
        adb devices -l 2>/dev/null || true

        log "📦 Installed fog packages:"
        adb shell pm list packages 2>/dev/null | grep -i fog || echo "  (none)"

        log "📋 Recent logcat (fog):"
        adb logcat -d -t 30 --pid="$(adb shell pidof "$APP_BUNDLE_ID" 2>/dev/null || echo 0)" 2>/dev/null | tail -20 || true
    fi

    # Copy Maestro debug output if available
    local maestro_debug_dir
    maestro_debug_dir=$(find ~/.maestro/tests -name "*$(date +%Y-%m-%d)*" -type d 2>/dev/null | tail -1)
    if [ -n "$maestro_debug_dir" ] && [ -d "$maestro_debug_dir" ]; then
        cp -r "$maestro_debug_dir"/* "$test_artifacts_dir/" 2>/dev/null || true
    fi
}

# =============================================================================
# Visual regression (manifest-based SSIM comparison)
# =============================================================================
# Ground truth manifests live at test_data/ground_truth/{test-name}.json.
# Each manifest lists checkpoints with reference images, descriptions, optional
# ROI regions, and per-checkpoint SSIM thresholds. Manifests are created by
# scripts/establish_ground_truth.sh after a clean Maestro run.

GROUND_TRUTH_DIR="test_data/ground_truth"
DEFAULT_SSIM_THRESHOLD="0.90"

# Compare all named screenshots from a test run against the ground truth manifest.
# Returns 0 if all checkpoints pass (or no manifest exists), 1 if any fail.
compare_test_screenshots() {
    local test_name="$1"
    local test_output_dir="$2" # where Maestro wrote screenshots

    local manifest="$GROUND_TRUTH_DIR/${test_name}.json"
    if [ ! -f "$manifest" ]; then
        log "⚠️  No ground truth manifest for $test_name — skipping visual regression"
        return 0
    fi

    if ! command_exists magick; then
        log "⚠️  ImageMagick not available — skipping visual regression"
        return 0
    fi

    # jq is required to parse manifests
    if ! command_exists jq; then
        log "⚠️  jq not available — skipping visual regression"
        return 0
    fi

    local checkpoint_count
    checkpoint_count=$(jq '.checkpoints | length' "$manifest")
    local failures=0

    for (( i=0; i<checkpoint_count; i++ )); do
        local cp_name cp_ref cp_threshold cp_roi
        cp_name=$(jq -r ".checkpoints[$i].name" "$manifest")
        cp_ref=$(jq -r ".checkpoints[$i].reference" "$manifest")
        cp_threshold=$(jq -r ".checkpoints[$i].threshold // \"$DEFAULT_SSIM_THRESHOLD\"" "$manifest")
        cp_roi=$(jq -r ".checkpoints[$i].roi // empty" "$manifest")

        # Maestro saves takeScreenshot as {name}.png in the output dir
        local actual="$test_output_dir/${cp_name}.png"
        if [ ! -f "$actual" ]; then
            log "  ⚠️  Checkpoint $cp_name: screenshot not found at $actual"
            continue
        fi

        local reference="$GROUND_TRUTH_DIR/$cp_ref"
        if [ ! -f "$reference" ]; then
            log "  ⚠️  Checkpoint $cp_name: reference image not found at $reference"
            continue
        fi

        local similarity
        if [ -n "$cp_roi" ]; then
            # Crop both images to ROI before comparison: WxH+X+Y
            local crop_spec
            crop_spec=$(echo "$cp_roi" | jq -r '"\(.w)x\(.h)+\(.x)+\(.y)"')
            similarity=$(
                magick compare -metric SSIM \
                    \( "$reference" -crop "$crop_spec" +repage \) \
                    \( "$actual" -crop "$crop_spec" +repage \) \
                    null: 2>&1 || echo "0"
            )
        else
            similarity=$(magick compare -metric SSIM "$reference" "$actual" null: 2>&1 || echo "0")
        fi

        if (( $(echo "$similarity >= $cp_threshold" | bc -l 2>/dev/null || echo 0) )); then
            log "  ✅ $cp_name — SSIM $similarity (threshold $cp_threshold)"
        else
            log "  ❌ $cp_name — SSIM $similarity < threshold $cp_threshold"
            # Generate diff image for debugging
            local diff_path="$test_output_dir/${cp_name}-diff.png"
            magick compare "$reference" "$actual" "$diff_path" 2>/dev/null || true
            failures=$((failures + 1))
        fi
    done

    if [ $failures -gt 0 ]; then
        log "  📸 $failures/$checkpoint_count checkpoints failed visual regression"
        return 1
    fi

    log "  📸 All $checkpoint_count checkpoints passed visual regression"
    return 0
}

# =============================================================================
# Main execution
# =============================================================================

# 1. Ensure Maestro is available
ensure_maestro

# 2. Ensure device + app are ready (delegates to deploy_app.sh if needed)
ensure_device_ready

# 3. Run bundle health check (refreshes Metro)
run_bundle_check

# 4. (Per-test state prep moved to step 7 — each test gets its own fresh state)

# 5. Inject test-specific data (legacy — data-clearing-test now generates data via GPS)
inject_test_data

# 6. Prepare artifacts directory
if [ "$IS_CI" = "true" ]; then
    ARTIFACTS_DIR="test_artifacts/ci/${PLATFORM}"
else
    ARTIFACTS_DIR="test_artifacts/local/${PLATFORM}"
fi
mkdir -p "$ARTIFACTS_DIR"
log "📁 Artifacts: $ARTIFACTS_DIR"

# 7. Run tests
log "🎯 Starting test execution on $PLATFORM..."

FAILED_TESTS=()
TOTAL_TESTS=${#TEST_FILES[@]}
PASSED_TESTS=0

for TEST_FILE in "${TEST_FILES[@]}"; do
    TEST_NAME=$(basename "$TEST_FILE" .yaml)
    log "🧪 Running: $TEST_NAME"

    # Per-test fresh state: each test starts with clean app data + injected prefs.
    # This ensures test isolation — no state leaks between tests.
    # For first-time-user test, onboarding completion flag is NOT seeded.
    if [ "$PLATFORM" = "android" ]; then
        prepare_android_fresh_state "$TEST_FILE"
    fi

    TEST_ARTIFACTS_DIR="$ARTIFACTS_DIR/$TEST_NAME"
    mkdir -p "$TEST_ARTIFACTS_DIR"

    if maestro test "$TEST_FILE" --output "$TEST_ARTIFACTS_DIR" --flatten-debug-output; then
        log "✅ Passed: $TEST_NAME"

        # Compare all named screenshots against ground truth manifest
        if ! compare_test_screenshots "$TEST_NAME" "$TEST_ARTIFACTS_DIR"; then
            FAILED_TESTS+=("$TEST_NAME (visual regression)")
        fi
        PASSED_TESTS=$((PASSED_TESTS + 1))
    else
        log "❌ Failed: $TEST_NAME"
        capture_failure_debug "$TEST_ARTIFACTS_DIR"
        FAILED_TESTS+=("$TEST_NAME")
    fi

    log "📊 Progress: $PASSED_TESTS/$TOTAL_TESTS"
done

# 8. Cleanup
log "🧹 Cleaning up..."
if [ "$IS_CI" = "true" ]; then
    if [ "$PLATFORM" = "ios" ]; then
        # Shutdown all booted simulators (we don't track UDID since deploy_app.sh manages boot)
        xcrun simctl shutdown all 2>/dev/null || true
    fi
    rm -f build.tar.gz
    rm -rf *.app
fi

# 9. Results
log "📊 Test Results Summary ($PLATFORM)"
log "Total: $TOTAL_TESTS | Passed: $PASSED_TESTS | Failed: $((TOTAL_TESTS - PASSED_TESTS))"

if [ ${#FAILED_TESTS[@]} -gt 0 ]; then
    log "❌ Failed tests:"
    for failed_test in "${FAILED_TESTS[@]}"; do
        log "  - $failed_test"
    done
    log "📁 Artifacts: $ARTIFACTS_DIR"
    exit 1
else
    log "✅ All tests passed!"
    log "📁 Artifacts: $ARTIFACTS_DIR"
    exit 0
fi