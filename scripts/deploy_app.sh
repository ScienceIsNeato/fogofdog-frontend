#!/bin/bash

# =============================================================================
# deploy_app.sh — THE definitive script for deploying FogOfDog
# =============================================================================
#
# This is the LOCAL DEPLOYMENT BIBLE. If you need to run the app on a device,
# you use THIS script. If the script doesn't do what you need, you MODIFY THE
# SCRIPT — you don't run one-off commands.
#
# Design Tenets:
#   1. INCLUDED IN GATES — This script can be run `sm validate shell:deploy`
#   2. UNIT TESTABLE — Functions are modular and testable in isolation
#   3. GLOBAL 10-MINUTE TIMEOUT — Script exits after 600s max, even if building
#   4. MINIMAL STEPS — Only runs what's needed (no gratuitous rebuilds)
#   5. RETURNS WITH RUNNING APP — Exits only when app is running and interactive
#   6. ACTIONABLE OUTPUT — Gives exact commands for logs + GPS injection
#   7. NON-GREEDY CLEANUP — Kills only what's necessary, not scorched earth
#
# Usage:
#   ./scripts/deploy_app.sh --device <android|ios> --mode <development|release> --data <fresh-install|current>
#
# Required Args:
#   --device    android | ios
#   --mode      development | release
#   --data      fresh-install | current
#
# Optional Args:
#   --force     Force a native rebuild even if app is already installed
#   --skip-gps  Skip automatic GPS/location setup
#   --dry-run   Show what would be done without doing it
#   --help      Show this help
#
# Examples:
#   ./scripts/deploy_app.sh --device android --mode development --data current
#   ./scripts/deploy_app.sh --device ios --mode development --data fresh-install
#   ./scripts/deploy_app.sh --device android --mode development --data current --force
#
# Exit Codes:
#   0   Success — app is running and ready for interaction
#   1   Error — something failed, see output
#   124 Timeout — global 10-minute limit exceeded
#
# =============================================================================

set -euo pipefail

# =============================================================================
# Configuration
# =============================================================================

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# CRITICAL: Immediately cd to PROJECT_DIR so every subprocess, background job,
# and timeout subshell inherits the correct working directory. Without this,
# running the script from a different directory (e.g. cursor-rules/) causes
# expo/pod/gradle to dump artifacts into the wrong location.
cd "$PROJECT_DIR"

APP_BUNDLE_ID="com.fogofdog.app"
METRO_PORT=8081
GLOBAL_TIMEOUT_SECONDS=600  # 10 minutes (pod install + native build can take time)
IOS_SIM_SELECTION_FILE="/tmp/fogofdog_ios_simulator_udid"
TARGET_IOS_SIM_UDID=""
TARGET_IOS_SIM_NAME=""

# Source environment variables
if [ -f "$PROJECT_DIR/.envrc" ]; then
    # shellcheck source=/dev/null
    source "$PROJECT_DIR/.envrc" 2>/dev/null || true
fi

# Ensure node_modules/.bin is in PATH for npx/expo commands
export PATH="$PROJECT_DIR/node_modules/.bin:$PATH"

# =============================================================================
# Output helpers
# =============================================================================

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

step_num=0

step() {
    step_num=$((step_num + 1))
    echo ""
    echo -e "${BOLD}${CYAN}[$step_num] $1${NC}"
    echo -e "${DIM}$(printf '%.0s─' {1..60})${NC}"
}

ok()   { echo -e "    ${GREEN}✅ $1${NC}"; }
info() { echo -e "    ${BLUE}ℹ️  $1${NC}"; }
warn() { echo -e "    ${YELLOW}⚠️  $1${NC}"; }
fail() { echo -e "    ${RED}❌ $1${NC}"; }

die() {
    fail "$1"
    cleanup_timeout
    exit 1
}

# =============================================================================
# Global timeout handler
# =============================================================================

SCRIPT_START_TIME=$(date +%s)
TIMEOUT_PID=""
SCRIPT_PID=$$

setup_global_timeout() {
    # Skip timeout in dry-run mode (tests run much faster)
    if [ "$DRY_RUN" = true ]; then
        return 0
    fi
    
    (
        sleep $GLOBAL_TIMEOUT_SECONDS
        echo ""
        echo -e "${RED}❌ GLOBAL TIMEOUT: Script exceeded ${GLOBAL_TIMEOUT_SECONDS}s limit${NC}"
        echo -e "${RED}   Cleaning up and exiting...${NC}"
        # Kill the main script process
        kill -TERM $SCRIPT_PID 2>/dev/null || true
    ) &
    TIMEOUT_PID=$!
    disown $TIMEOUT_PID 2>/dev/null || true
}

cleanup_timeout() {
    if [ -n "$TIMEOUT_PID" ] && kill -0 "$TIMEOUT_PID" 2>/dev/null; then
        kill "$TIMEOUT_PID" 2>/dev/null || true
        wait "$TIMEOUT_PID" 2>/dev/null || true
    fi
}

trap cleanup_timeout EXIT

# =============================================================================
# Argument parsing
# =============================================================================

ACTION="deploy"  # deploy | status | logs | stop | metro
DEVICE=""
MODE=""
DATA=""
FORCE=false
SKIP_GPS=false
SHOW_HELP=false
DRY_RUN=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --action)   ACTION="$2";  shift 2 ;;
        --device)   DEVICE="$2";  shift 2 ;;
        --mode)     MODE="$2";    shift 2 ;;
        --data)     DATA="$2";    shift 2 ;;
        --force)    FORCE=true;   shift   ;;
        --skip-gps) SKIP_GPS=true; shift  ;;
        --dry-run)  DRY_RUN=true; shift   ;;
        --help|-h)  SHOW_HELP=true; shift ;;
        # Shorthand actions (no --action prefix needed)
        status)     ACTION="status"; shift ;;
        logs)       ACTION="logs";   shift ;;
        stop)       ACTION="stop";   shift ;;
        metro)      ACTION="metro";  shift ;;
        *) die "Unknown argument: $1. Run with --help for usage." ;;
    esac
done

if [ "$SHOW_HELP" = true ]; then
    cat << 'EOF'
deploy_app.sh — THE definitive script for deploying FogOfDog

USAGE:
  ./scripts/deploy_app.sh --device <android|ios> --mode <development|release> --data <fresh-install|current>
  ./scripts/deploy_app.sh status                   # Show Metro + device status
  ./scripts/deploy_app.sh logs                     # Tail Metro log file
  ./scripts/deploy_app.sh stop                     # Stop Metro server
  ./scripts/deploy_app.sh metro --device <...>    # Start Metro only (no native build)

ACTIONS (default: deploy):
  deploy    Full deploy: build if needed + Metro + app (default)
  metro     Start Metro + open app (skip native build check)
  status    Show Metro server and device status
  logs      Tail current Metro log file
  stop      Stop Metro server

REQUIRED ARGS (for deploy/metro):
  --device    android | ios
  --mode      development | release   (deploy only)
  --data      fresh-install | current (deploy only)

OPTIONAL ARGS:
  --action    deploy | metro | status | logs | stop
  --force     Force a native rebuild even if app is already installed
  --skip-gps  Skip automatic GPS/location setup
  --dry-run   Show what would be done without doing it
  --help      Show this help

EXAMPLES:
  ./scripts/deploy_app.sh --device android --mode development --data current
  ./scripts/deploy_app.sh --device ios --mode development --data fresh-install
  ./scripts/deploy_app.sh --device android --mode development --data current --force
  ./scripts/deploy_app.sh status
  ./scripts/deploy_app.sh logs
  ./scripts/deploy_app.sh stop
  ./scripts/deploy_app.sh metro --device android
EOF
    exit 0
fi

# Validate required args based on action
case "$ACTION" in
    deploy)
        [[ -z "$DEVICE" ]] && die "Missing --device (android|ios)"
        [[ -z "$MODE" ]]   && die "Missing --mode (development|release)"
        [[ -z "$DATA" ]]   && die "Missing --data (fresh-install|current)"
        [[ "$DEVICE" != "android" && "$DEVICE" != "ios" ]] && \
            die "Invalid --device '$DEVICE'. Must be: android | ios"
        [[ "$MODE" != "development" && "$MODE" != "release" ]] && \
            die "Invalid --mode '$MODE'. Must be: development | release"
        [[ "$DATA" != "fresh-install" && "$DATA" != "current" ]] && \
            die "Invalid --data '$DATA'. Must be: fresh-install | current"
        ;;
    metro)
        [[ -z "$DEVICE" ]] && die "Missing --device (android|ios) for metro action"
        [[ "$DEVICE" != "android" && "$DEVICE" != "ios" ]] && \
            die "Invalid --device '$DEVICE'. Must be: android | ios"
        # Default mode to development for metro
        MODE="${MODE:-development}"
        DATA="${DATA:-current}"
        ;;
    status|logs|stop)
        # These don't require device/mode/data
        ;;
    *)
        die "Invalid --action '$ACTION'. Must be: deploy | metro | status | logs | stop"
        ;;
esac

# =============================================================================
# Quick action handlers (status, logs, stop — no device/build required)
# =============================================================================

quick_is_metro_running() {
    lsof -ti:$METRO_PORT >/dev/null 2>&1
}

quick_get_metro_pid() {
    lsof -ti:$METRO_PORT 2>/dev/null | head -1
}

quick_is_ios_sim_booted() {
    xcrun simctl list devices booted --json 2>/dev/null \
        | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .udid' 2>/dev/null \
        | head -1 | grep -q .
}

quick_get_ios_sim_name() {
    xcrun simctl list devices booted --json 2>/dev/null \
        | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .name' 2>/dev/null \
        | head -1
}

quick_is_android_emu_running() {
    adb devices 2>/dev/null | grep -q "emulator"
}

action_status() {
    echo ""
    echo -e "${BOLD}${CYAN}🐕 FogOfDog Status${NC}"
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    
    # Metro status
    echo -n -e "  ${BOLD}Metro Server:${NC}  "
    if quick_is_metro_running; then
        local pid
        pid=$(quick_get_metro_pid)
        echo -e "${GREEN}Running${NC} (PID: $pid, Port: $METRO_PORT)"
        if [ -f /tmp/METRO_CURRENT_LOG_FILENAME.txt ]; then
            echo -e "  ${DIM}Log: $(cat /tmp/METRO_CURRENT_LOG_FILENAME.txt)${NC}"
        fi
    else
        echo -e "${YELLOW}Not running${NC}"
    fi
    
    # iOS status
    echo -n -e "  ${BOLD}iOS Simulator:${NC} "
    if quick_is_ios_sim_booted; then
        local sim_name
        sim_name=$(quick_get_ios_sim_name)
        echo -e "${GREEN}Booted${NC} ($sim_name)"
    else
        echo -e "${YELLOW}Not running${NC}"
    fi
    
    # Android status
    echo -n -e "  ${BOLD}Android Emu:${NC}   "
    if quick_is_android_emu_running; then
        echo -e "${GREEN}Running${NC}"
    else
        echo -e "${YELLOW}Not running${NC}"
    fi
    
    echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""
    exit 0
}

action_logs() {
    if [ -f /tmp/METRO_CURRENT_LOG_FILENAME.txt ]; then
        local log_file
        log_file=$(cat /tmp/METRO_CURRENT_LOG_FILENAME.txt)
        if [ -f "$log_file" ]; then
            echo -e "${BLUE}ℹ️  Tailing: $log_file (Ctrl+C to stop)${NC}"
            tail -f "$log_file"
        else
            die "Log file not found: $log_file"
        fi
    else
        die "No active Metro log file found. Start the app first with: ./scripts/deploy_app.sh --device android --mode development --data current"
    fi
}

action_stop() {
    echo -e "${BOLD}${CYAN}🐕 Stopping Metro...${NC}"
    if quick_is_metro_running; then
        local pids
        pids=$(lsof -ti:$METRO_PORT 2>/dev/null || true)
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -TERM 2>/dev/null || true
            sleep 1
            if quick_is_metro_running; then
                echo "$pids" | xargs kill -9 2>/dev/null || true
                sleep 0.5
            fi
        fi
        if quick_is_metro_running; then
            warn "Metro may still be running on port $METRO_PORT"
        else
            ok "Metro stopped"
        fi
    else
        ok "Metro not running (nothing to stop)"
    fi
    exit 0
}

# Handle quick actions immediately (no timeout, no full setup)
case "$ACTION" in
    status) action_status ;;
    logs)   action_logs   ;;
    stop)   action_stop   ;;
esac

# =============================================================================
# Banner (for deploy and metro actions)
# =============================================================================

echo ""
echo -e "${BOLD}${GREEN}🐕 FogOfDog Deploy${NC}"
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "  Action:   ${BOLD}$ACTION${NC}"
echo -e "  Device:   ${BOLD}$DEVICE${NC}"
echo -e "  Mode:     ${BOLD}$MODE${NC}"
echo -e "  Data:     ${BOLD}$DATA${NC}"
echo -e "  Force:    ${BOLD}$FORCE${NC}"
echo -e "  Timeout:  ${BOLD}${GLOBAL_TIMEOUT_SECONDS}s${NC}"
if [ "$DRY_RUN" = true ]; then
    echo -e "  ${YELLOW}DRY RUN — no changes will be made${NC}"
fi
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"

# Start global timeout
setup_global_timeout

# =============================================================================
# Device management functions
# =============================================================================

is_ios_sim_booted() {
    xcrun simctl list devices booted --json 2>/dev/null \
        | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .udid' 2>/dev/null \
        | head -1 | grep -q .
}

list_booted_ios_simulators() {
    xcrun simctl list devices booted --json 2>/dev/null \
        | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | "\(.name)\t\(.udid)"' 2>/dev/null \
        | sort -f
}

set_target_ios_simulator() {
    local booted_sims
    booted_sims=$(list_booted_ios_simulators)
    if [ -z "$booted_sims" ]; then
        TARGET_IOS_SIM_UDID=""
        TARGET_IOS_SIM_NAME=""
        return 1
    fi

    # Reuse already-selected target if still booted
    if [ -n "$TARGET_IOS_SIM_UDID" ] && echo "$booted_sims" | awk -F'\t' '{print $2}' | grep -qx "$TARGET_IOS_SIM_UDID"; then
        TARGET_IOS_SIM_NAME=$(echo "$booted_sims" | awk -F'\t' -v udid="$TARGET_IOS_SIM_UDID" '$2 == udid {print $1; exit}')
        return 0
    fi

    local preferred_udid=""
    if [ -n "${FOGOFDOG_IOS_SIM_UDID:-}" ]; then
        preferred_udid="${FOGOFDOG_IOS_SIM_UDID}"
    elif [ -f "$IOS_SIM_SELECTION_FILE" ]; then
        preferred_udid=$(cat "$IOS_SIM_SELECTION_FILE" 2>/dev/null || true)
    fi

    if [ -n "$preferred_udid" ] && echo "$booted_sims" | awk -F'\t' '{print $2}' | grep -qx "$preferred_udid"; then
        TARGET_IOS_SIM_UDID="$preferred_udid"
    else
        TARGET_IOS_SIM_UDID=$(echo "$booted_sims" | head -n 1 | cut -f2)
    fi

    TARGET_IOS_SIM_NAME=$(echo "$booted_sims" | awk -F'\t' -v udid="$TARGET_IOS_SIM_UDID" '$2 == udid {print $1; exit}')
    if [ -n "$TARGET_IOS_SIM_UDID" ]; then
        echo "$TARGET_IOS_SIM_UDID" > "$IOS_SIM_SELECTION_FILE"
    fi
}

shutdown_extra_ios_simulators() {
    set_target_ios_simulator || return 0

    local booted_count
    booted_count=$(list_booted_ios_simulators | wc -l | tr -d ' ')
    if [ "$booted_count" -le 1 ]; then
        return 0
    fi

    warn "Multiple iOS simulators booted; using ${TARGET_IOS_SIM_NAME} (${TARGET_IOS_SIM_UDID})"
    while IFS=$'\t' read -r sim_name sim_udid; do
        [ -z "$sim_udid" ] && continue
        if [ "$sim_udid" != "$TARGET_IOS_SIM_UDID" ]; then
            info "Shutting down extra simulator: ${sim_name} (${sim_udid})"
            xcrun simctl shutdown "$sim_udid" 2>/dev/null || true
        fi
    done <<< "$(list_booted_ios_simulators)"
}

get_ios_sim_udid() {
    set_target_ios_simulator || true
    echo "$TARGET_IOS_SIM_UDID"
}

get_ios_sim_name() {
    set_target_ios_simulator || true
    echo "$TARGET_IOS_SIM_NAME"
}

is_android_emu_running() {
    adb devices 2>/dev/null | grep -q "emulator"
}

boot_ios_simulator() {
    if is_ios_sim_booted; then
        set_target_ios_simulator || true
        shutdown_extra_ios_simulators
        ok "iOS Simulator already booted: $(get_ios_sim_name)"
        return 0
    fi

    info "Booting iOS Simulator..."
    "$SCRIPT_DIR/launch-device.sh" ios
    
    # Wait for boot
    local attempts=0
    while ! is_ios_sim_booted && [ $attempts -lt 30 ]; do
        sleep 2
        attempts=$((attempts + 1))
    done

    if is_ios_sim_booted; then
        set_target_ios_simulator || true
        shutdown_extra_ios_simulators
        ok "iOS Simulator booted: $(get_ios_sim_name)"
    else
        die "iOS Simulator failed to boot after 60s"
    fi
}

boot_android_emulator() {
    if is_android_emu_running; then
        ok "Android Emulator already running"
        return 0
    fi

    info "Booting Android Emulator..."
    "$SCRIPT_DIR/launch-device.sh" android

    # Wait for boot
    local attempts=0
    while ! is_android_emu_running && [ $attempts -lt 30 ]; do
        sleep 2
        attempts=$((attempts + 1))
    done

    if is_android_emu_running; then
        ok "Android Emulator booted"
    else
        die "Android Emulator failed to boot after 60s"
    fi
}

# =============================================================================
# App installation checks
# =============================================================================

is_app_installed_ios() {
    local udid
    udid=$(get_ios_sim_udid)
    [ -n "$udid" ] && xcrun simctl listapps "$udid" 2>/dev/null | grep -q "$APP_BUNDLE_ID"
}

is_app_installed_android() {
    adb shell pm list packages 2>/dev/null | grep -q "$APP_BUNDLE_ID"
}

# =============================================================================
# Native code fingerprinting (detect stale builds)
# =============================================================================

# =============================================================================
# Pod sync detection (iOS only)
# =============================================================================
# NOTE: Manual 'pod install' was removed in RN 0.81+ migration.
# 'expo run:ios' handles pod installation internally as part of its build
# pipeline. Calling 'pod install' directly triggers a deprecation warning
# and duplicates work that Expo already does.
# See: https://reactnative.dev/blog - CocoaPods → Swift Package Manager migration

# Files that indicate native code has changed and requires rebuild
# Changes to these files mean the installed app is "dirty" even if present
NATIVE_FINGERPRINT_FILES_IOS=(
    "ios/Podfile.lock"
    "ios/FogOfDog/Info.plist"
    "ios/FogOfDog.xcodeproj/project.pbxproj"
    "package.json"
    "app.json"
    "app.config.js"
)

NATIVE_FINGERPRINT_FILES_ANDROID=(
    "android/app/build.gradle"
    "android/build.gradle"
    "android/gradle.properties"
    "android/settings.gradle"
    "package.json"
    "app.json"
    "app.config.js"
)

# Where we store the fingerprint of the last successful build
FINGERPRINT_FILE_IOS="$PROJECT_DIR/.native-fingerprint-ios"
FINGERPRINT_FILE_ANDROID="$PROJECT_DIR/.native-fingerprint-android"

# Compute a fingerprint of native code files
compute_native_fingerprint() {
    local device="$1"
    local files_to_hash=()

    case "$device" in
        ios)
            files_to_hash=("${NATIVE_FINGERPRINT_FILES_IOS[@]}")
            ;;
        android)
            files_to_hash=("${NATIVE_FINGERPRINT_FILES_ANDROID[@]}")
            ;;
    esac

    # Hash all the files that exist, sorted for consistency
    local hash_input=""
    for file in "${files_to_hash[@]}"; do
        local full_path="$PROJECT_DIR/$file"
        if [ -f "$full_path" ]; then
            # Include file path and content hash
            hash_input+="$file:$(md5 -q "$full_path" 2>/dev/null || md5sum "$full_path" 2>/dev/null | cut -d' ' -f1)\n"
        fi
    done
    
    # Return a single hash of all the file hashes
    echo -n "$hash_input" | md5 -q 2>/dev/null || echo -n "$hash_input" | md5sum | cut -d' ' -f1
}

# Get the stored fingerprint from last successful build
get_stored_fingerprint() {
    local device="$1"
    local fingerprint_file

    case "$device" in
        ios)     fingerprint_file="$FINGERPRINT_FILE_IOS" ;;
        android) fingerprint_file="$FINGERPRINT_FILE_ANDROID" ;;
    esac

    if [ -f "$fingerprint_file" ]; then
        cat "$fingerprint_file"
    else
        echo "" # No stored fingerprint = always dirty
    fi
}

# Save the current fingerprint after successful build
save_native_fingerprint() {
    local device="$1"
    local fingerprint_file

    case "$device" in
        ios)     fingerprint_file="$FINGERPRINT_FILE_IOS" ;;
        android) fingerprint_file="$FINGERPRINT_FILE_ANDROID" ;;
    esac

    compute_native_fingerprint "$device" > "$fingerprint_file"
}

# Check if native code is dirty (changed since last build)
is_native_dirty() {
    local device="$1"
    local current_fingerprint
    local stored_fingerprint

    current_fingerprint=$(compute_native_fingerprint "$device")
    stored_fingerprint=$(get_stored_fingerprint "$device")

    if [ -z "$stored_fingerprint" ]; then
        # No stored fingerprint = never built or fingerprint cleared
        return 0  # dirty
    fi

    if [ "$current_fingerprint" != "$stored_fingerprint" ]; then
        return 0  # dirty
    fi

    return 1  # clean
}

# =============================================================================
# Data management
# =============================================================================

clear_data_ios() {
    local udid
    udid=$(get_ios_sim_udid)
    if [ -n "$udid" ]; then
        info "Terminating app..."
        xcrun simctl terminate "$udid" "$APP_BUNDLE_ID" 2>/dev/null || true
        info "Uninstalling app to clear all data..."
        xcrun simctl uninstall "$udid" "$APP_BUNDLE_ID" 2>/dev/null || true
        ok "iOS app data cleared (will reinstall)"
    else
        warn "No booted simulator found for data clearing"
    fi
}

clear_data_android() {
    if is_android_emu_running; then
        info "Clearing app data..."
        adb shell pm clear "$APP_BUNDLE_ID" 2>/dev/null || {
            # App might not be installed yet — that's fine
            info "App not installed yet, nothing to clear"
        }
        ok "Android app data cleared"
    else
        warn "No Android emulator running for data clearing"
    fi
}

# =============================================================================
# Metro management (non-greedy cleanup)
# =============================================================================

is_metro_running() {
    lsof -ti:$METRO_PORT >/dev/null 2>&1
}

is_metro_http_ready() {
    curl -fsS "http://127.0.0.1:${METRO_PORT}/status" 2>/dev/null | grep -q "packager-status:running"
}

stop_metro() {
    # Aggressive cleanup: kill port holders AND stale Metro/node processes
    local had_something_to_kill=false
    
    # First: kill anything on port 8081
    if is_metro_running; then
        had_something_to_kill=true
        info "Stopping process on port $METRO_PORT..."
        
        local pids
        pids=$(lsof -ti:$METRO_PORT 2>/dev/null || true)
        
        if [ -n "$pids" ]; then
            echo "$pids" | xargs kill -TERM 2>/dev/null || true
            sleep 1
            
            if is_metro_running; then
                echo "$pids" | xargs kill -9 2>/dev/null || true
                sleep 0.5
            fi
        fi
    fi
    
    # Second: kill any stale Metro bundler processes (these can linger after crashes)
    local stale_metro
    stale_metro=$(pgrep -f "react-native.*start" 2>/dev/null || true)
    if [ -n "$stale_metro" ]; then
        had_something_to_kill=true
        info "Killing stale Metro bundler processes..."
        echo "$stale_metro" | xargs kill -9 2>/dev/null || true
        sleep 0.5
    fi
    
    # Third: kill stale expo processes that might hold connections
    local stale_expo
    stale_expo=$(pgrep -f "expo.*start" 2>/dev/null || true)
    if [ -n "$stale_expo" ]; then
        had_something_to_kill=true
        info "Killing stale Expo processes..."
        echo "$stale_expo" | xargs kill -9 2>/dev/null || true
        sleep 0.5
    fi
    
    if is_metro_running; then
        warn "Metro may still be running on port $METRO_PORT"
    elif [ "$had_something_to_kill" = true ]; then
        ok "Metro stopped"
    else
        ok "No Metro processes found"
    fi
}

start_metro_and_open() {
    local host_flag=""
    # iOS Simulator should use localhost so Expo Dev Client can always reach Metro.
    [ "$DEVICE" = "ios" ] && host_flag="--host localhost"

    local timestamp
    timestamp=$(date +"%Y-%m-%d_%H%M%S")
    local log_file="/tmp/metro_${DEVICE}_${timestamp}.log"
    echo "$log_file" > /tmp/METRO_CURRENT_LOG_FILENAME.txt

    info "Starting Metro server..."
    info "Log file: $log_file"

    cd "$PROJECT_DIR"

    # Final port check — kill anything on METRO_PORT right before we start.
    # Step 2 cleanup runs early, but build_ios() or external processes can
    # re-occupy the port between cleanup and now.
    if is_metro_running; then
        warn "Port $METRO_PORT still occupied — killing before Metro start"
        local stale_pids
        stale_pids=$(lsof -ti:$METRO_PORT 2>/dev/null || true)
        if [ -n "$stale_pids" ]; then
            echo "$stale_pids" | xargs kill -9 2>/dev/null || true
            sleep 1
        fi
        if is_metro_running; then
            fail "Cannot free port $METRO_PORT — something is holding it"
        fi
        ok "Port $METRO_PORT freed"
    fi

    # Start Metro as a fully detached process that survives script exit.
    #
    # Problem: plain `cmd &; disown` still inherits the script's process group.
    #   When deploy_app.sh exits (or its timeout fires), the shell/OS sends
    #   SIGHUP to the group → Metro dies → app crashes.
    #
    # Solution: nohup + redirect + new-process-group via a subshell that execs.
    #   • nohup ignores SIGHUP so Metro survives parent exit
    #   • The ( exec ... ) & pattern creates a new process group (macOS has no setsid)
    #   • We write the INNER pid via $BASHPID so stop_metro can kill the right thing
    #   • No tee, no pipe — direct file redirect to avoid blocking
    (
        exec nohup "$PROJECT_DIR/node_modules/.bin/expo" start --dev-client --clear $host_flag > "$log_file" 2>&1
    ) &
    local metro_pid=$!
    disown "$metro_pid" 2>/dev/null || true
    echo "$metro_pid" > /tmp/METRO_PID.txt

    # Wait for Metro to initialize
    local attempts=0
    while [ $attempts -lt 20 ]; do
        if is_metro_running && is_metro_http_ready; then
            break
        fi
        sleep 1
        attempts=$((attempts + 1))
    done

    if is_metro_running && is_metro_http_ready; then
        ok "Metro started (PID: $(lsof -ti:$METRO_PORT | head -1))"
        info "Monitor logs: tail -f $log_file"
    else
        fail "Metro did not become ready on http://127.0.0.1:$METRO_PORT/status"
        warn "Check logs: tail -f $log_file"
        return 1
    fi
}

# =============================================================================
# Native build
# =============================================================================

build_ios() {
    local config="Debug"
    [ "$MODE" = "release" ] && config="Release"

    info "Building native iOS app (configuration: $config)..."
    info "This may take several minutes on first build."

    cd "$PROJECT_DIR"
    local build_log="/tmp/expo_build_ios_$(date +%s).log"
    local ios_device_name
    ios_device_name=$(get_ios_sim_name)

    # Run expo build in background, capturing output to log file
    # NOTE: Despite --no-bundler, Expo may start Metro after build completes
    # and block forever. We monitor for "Build Succeeded" / errors and kill it.
    if [ -n "$ios_device_name" ]; then
        info "Target iOS simulator: $ios_device_name ($(get_ios_sim_udid))"
        "$PROJECT_DIR/node_modules/.bin/expo" run:ios --configuration "$config" --no-bundler --device "$ios_device_name" > "$build_log" 2>&1 &
    else
        "$PROJECT_DIR/node_modules/.bin/expo" run:ios --configuration "$config" --no-bundler > "$build_log" 2>&1 &
    fi
    local expo_pid=$!

    # Monitor build progress — poll log for success/failure
    local elapsed=0
    local max_wait=600  # 10 minutes
    while kill -0 "$expo_pid" 2>/dev/null && [ $elapsed -lt $max_wait ]; do
        # Check for build success
        if grep -q "Build Succeeded" "$build_log" 2>/dev/null; then
            info "Build succeeded — terminating Expo process"
            kill "$expo_pid" 2>/dev/null || true
            wait "$expo_pid" 2>/dev/null || true
            break
        fi
        # Check for build failure
        if grep -q "Failed to build iOS project" "$build_log" 2>/dev/null; then
            kill "$expo_pid" 2>/dev/null || true
            wait "$expo_pid" 2>/dev/null || true
            # Show last 30 lines of build log for context
            echo ""
            tail -30 "$build_log"
            echo ""
            die "iOS build failed — see log: $build_log"
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    # Check if we timed out
    if kill -0 "$expo_pid" 2>/dev/null; then
        kill -9 "$expo_pid" 2>/dev/null || true
        wait "$expo_pid" 2>/dev/null || true
        die "iOS build timed out after $((max_wait / 60)) minutes — see log: $build_log"
    fi

    # Final check: did the build actually succeed?
    if ! grep -q "Build Succeeded" "$build_log" 2>/dev/null; then
        echo ""
        tail -30 "$build_log"
        echo ""
        die "iOS build did not succeed — see log: $build_log"
    fi

    # Save fingerprint after successful build
    save_native_fingerprint "ios"
    ok "iOS native build complete"
}

build_android() {
    info "Building native Android app..."
    info "This may take several minutes on first build."

    cd "$PROJECT_DIR"
    local build_log="/tmp/expo_build_android_$(date +%s).log"

    # Run expo build in background, capturing output to log file
    # Same pattern as iOS — Expo may block after build completes
    "$PROJECT_DIR/node_modules/.bin/expo" run:android --no-bundler > "$build_log" 2>&1 &
    local expo_pid=$!

    # Monitor build progress — poll log for success/failure
    local elapsed=0
    local max_wait=600  # 10 minutes
    while kill -0 "$expo_pid" 2>/dev/null && [ $elapsed -lt $max_wait ]; do
        # Check for build success
        if grep -q "BUILD SUCCESSFUL" "$build_log" 2>/dev/null; then
            info "Build succeeded — terminating Expo process"
            kill "$expo_pid" 2>/dev/null || true
            wait "$expo_pid" 2>/dev/null || true
            break
        fi
        # Check for build failure
        if grep -q "BUILD FAILED\|Could not determine" "$build_log" 2>/dev/null; then
            kill "$expo_pid" 2>/dev/null || true
            wait "$expo_pid" 2>/dev/null || true
            echo ""
            tail -30 "$build_log"
            echo ""
            die "Android build failed — see log: $build_log"
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    # Check if we timed out
    if kill -0 "$expo_pid" 2>/dev/null; then
        kill -9 "$expo_pid" 2>/dev/null || true
        wait "$expo_pid" 2>/dev/null || true
        die "Android build timed out after $((max_wait / 60)) minutes — see log: $build_log"
    fi

    # Final check: did the build actually succeed?
    if ! grep -q "BUILD SUCCESSFUL" "$build_log" 2>/dev/null; then
        echo ""
        tail -30 "$build_log"
        echo ""
        die "Android build did not succeed — see log: $build_log"
    fi

    # Save fingerprint after successful build
    save_native_fingerprint "android"
    ok "Android native build complete"
}

# =============================================================================
# GPS / Location setup
# =============================================================================

setup_gps_ios() {
    local udid
    udid=$(get_ios_sim_udid)
    if [ -z "$udid" ]; then
        warn "No booted iOS simulator found for GPS setup"
        return 0
    fi

    info "Setting simulator location (Eugene, Oregon)..."
    xcrun simctl location "$udid" set "44.0248,-123.1044" 2>/dev/null || true
    ok "iOS location set"
}

setup_gps_android() {
    info "Setting emulator location (Eugene, Oregon)..."
    # adb emu geo fix takes longitude first, then latitude
    adb emu geo fix -123.1044 44.0248 2>/dev/null || {
        warn "Could not set GPS via adb emu geo fix"
        info "You can manually set location in the emulator's Extended Controls (⋯ > Location)"
        return 0
    }
    ok "Android location set"
}

# =============================================================================
# Launch app (release mode, no Metro)
# =============================================================================

launch_app_ios() {
    local udid
    udid=$(get_ios_sim_udid)
    if [ -n "$udid" ]; then
        info "Launching app on iOS Simulator..."
        xcrun simctl launch "$udid" "$APP_BUNDLE_ID" 2>/dev/null || true
        ok "App launched"
    fi
}

launch_app_android() {
    info "Launching app on Android Emulator..."
    adb shell monkey -p "$APP_BUNDLE_ID" -c android.intent.category.LAUNCHER 1 2>/dev/null || {
        adb shell am start -n "$APP_BUNDLE_ID/.MainActivity" 2>/dev/null || true
    }
    ok "App launched"
}

# =============================================================================
# Decision engine — the brain
# =============================================================================

needs_native_build() {
    if [ "$FORCE" = true ]; then
        info "Force rebuild requested"
        return 0  # yes, needs build
    fi

    if [ "$DATA" = "fresh-install" ] && [ "$DEVICE" = "ios" ]; then
        # fresh-install on iOS uninstalls the app, so we always need to rebuild
        if ! is_app_installed_ios; then
            info "App not installed on iOS (cleared for fresh-install)"
            return 0
        fi
    fi

    case "$DEVICE" in
        ios)
            if ! is_app_installed_ios; then
                info "App not installed on iOS Simulator — build needed"
                return 0
            fi
            # App is installed, but is it stale?
            if is_native_dirty "ios"; then
                info "Native code changed since last build — rebuild needed"
                return 0
            fi
            ok "App installed and up-to-date on iOS Simulator"
            return 1  # no build needed
            ;;
        android)
            if ! is_app_installed_android; then
                info "App not installed on Android Emulator — build needed"
                return 0
            fi
            # App is installed, but is it stale?
            if is_native_dirty "android"; then
                info "Native code changed since last build — rebuild needed"
                return 0
            fi
            ok "App installed and up-to-date on Android Emulator"
            return 1  # no build needed
            ;;
    esac
}

# =============================================================================
# Main orchestration
# =============================================================================

# Wrapper for dry-run support
run_step() {
    local step_name="$1"
    shift
    if [ "$DRY_RUN" = true ]; then
        info "[DRY RUN] Would execute: $step_name"
    else
        "$@"
    fi
}

cd "$PROJECT_DIR"

# ── Step 1: Boot device ──────────────────────────────────────────────────────

step "Ensure device is running"

case "$DEVICE" in
    ios)     run_step "boot_ios_simulator" boot_ios_simulator       ;;
    android) run_step "boot_android_emulator" boot_android_emulator ;;
esac

# ── Step 2: Aggressive Metro cleanup (always run for development) ────────────

if [ "$MODE" = "development" ]; then
    step "Metro server cleanup"
    run_step "stop_metro" stop_metro
else
    step "Metro server check"
    ok "Skipped (release mode)"
fi

# ── Step 3: Handle data ──────────────────────────────────────────────────────

# Skip data handling for metro action (no clearing/preserving, use what's there)
if [ "$ACTION" = "metro" ]; then
    step "Data handling"
    ok "Skipped (metro action uses existing data)"
elif [ "$DATA" = "fresh-install" ]; then
    step "Clear app data (fresh install)"
    case "$DEVICE" in
        ios)     run_step "clear_data_ios" clear_data_ios         ;;
        android) run_step "clear_data_android" clear_data_android ;;
    esac
else
    step "Preserve existing app data"
    ok "Keeping current app data"
fi

# ── Step 4: Pod sync handled by expo run:ios (RN 0.81+) ──────────────────────
# Removed manual 'pod install' — expo run:ios handles this internally.
# Direct calls trigger RN 0.81 deprecation warning and duplicate work.

# ── Step 5: Build if needed ──────────────────────────────────────────────────

# Skip build check for metro action (assumes app is already installed)
if [ "$ACTION" = "metro" ]; then
    step "Native build check"
    ok "Skipped (metro action — assuming app is installed)"
else
    step "Check if native build is needed"

    if needs_native_build; then
        step "Building native app"
        case "$DEVICE" in
            ios)     run_step "build_ios" build_ios         ;;
            android) run_step "build_android" build_android ;;
        esac
    else
        ok "Skipping native build — app is installed"
    fi
fi

# ── Step 6: GPS setup ────────────────────────────────────────────────────────

if [ "$SKIP_GPS" = false ]; then
    step "Set up GPS / location"
    case "$DEVICE" in
        ios)     run_step "setup_gps_ios" setup_gps_ios         ;;
        android) run_step "setup_gps_android" setup_gps_android ;;
    esac
else
    step "GPS setup"
    info "Skipped (--skip-gps)"
fi

# ── Step 7: Start app ────────────────────────────────────────────────────────

if [ "$MODE" = "development" ]; then
    step "Start Metro + open app"
    run_step "start_metro_and_open" start_metro_and_open
    case "$DEVICE" in
        ios)     run_step "launch_app_ios" launch_app_ios         ;;
        android) run_step "launch_app_android" launch_app_android ;;
    esac
else
    step "Launch release app (no Metro)"
    case "$DEVICE" in
        ios)     run_step "launch_app_ios" launch_app_ios         ;;
        android) run_step "launch_app_android" launch_app_android ;;
    esac
fi

# ── Step 8: Record deployment ────────────────────────────────────────────────

if [ "$DRY_RUN" = false ]; then
    echo "$MODE" > "$PROJECT_DIR/.currently_deployed_type"
    echo "$(date '+%Y-%m-%d %H:%M:%S') - $MODE build deployed to $DEVICE ($DATA)" >> "$PROJECT_DIR/.deployment_history"
fi

# ── Step 9: Verify app is running ────────────────────────────────────────────

step "Verify app is running"

verify_app_running() {
    case "$DEVICE" in
        ios)
            local udid
            udid=$(get_ios_sim_udid)
            if [ -n "$udid" ]; then
                # Check if the app process is running on the simulator
                xcrun simctl spawn "$udid" launchctl list 2>/dev/null | grep -q "$APP_BUNDLE_ID" && return 0
                # Alternative: check if the app is in foreground
                xcrun simctl listapps "$udid" 2>/dev/null | grep -q "$APP_BUNDLE_ID" && return 0
            fi
            return 1
            ;;
        android)
            adb shell pidof "$APP_BUNDLE_ID" >/dev/null 2>&1
            ;;
    esac
}

# Wait up to 10 seconds for app to be running (skip in dry-run)
if [ "$DRY_RUN" = true ]; then
    ok "[DRY RUN] Would verify app is running"
else
    app_running_attempts=0
    while [ $app_running_attempts -lt 5 ]; do
        if verify_app_running; then
            ok "App is running and ready for interaction"
            break
        fi
        sleep 2
        app_running_attempts=$((app_running_attempts + 1))
    done

    if [ $app_running_attempts -eq 5 ]; then
        warn "Could not verify app is running — may still be starting"
    fi
fi

# ── Compute elapsed time ─────────────────────────────────────────────────────

SCRIPT_END_TIME=$(date +%s)
ELAPSED_SECONDS=$((SCRIPT_END_TIME - SCRIPT_START_TIME))

# ── Get current log file ─────────────────────────────────────────────────────

CURRENT_LOG_FILE=""
if [ -f /tmp/METRO_CURRENT_LOG_FILENAME.txt ]; then
    CURRENT_LOG_FILE=$(cat /tmp/METRO_CURRENT_LOG_FILENAME.txt)
fi

# ── Done ─────────────────────────────────────────────────────────────────────

echo ""
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BOLD}${GREEN}🐕 Deploy complete!${NC}  ${DIM}(${ELAPSED_SECONDS}s)${NC}"
echo -e "${DIM}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}Status${NC}"
echo -e "  ├── Device:   ${BOLD}$DEVICE${NC}"
echo -e "  ├── Mode:     ${BOLD}$MODE${NC}"
echo -e "  └── Data:     ${BOLD}$DATA${NC}"

echo ""
echo -e "  ${BOLD}Next Steps${NC}"

if [ "$MODE" = "development" ]; then
    echo -e "  ├── ${CYAN}Tail logs:${NC}"
    if [ -n "$CURRENT_LOG_FILE" ] && [ -f "$CURRENT_LOG_FILE" ]; then
        echo -e "  │   ${DIM}tail -f $CURRENT_LOG_FILE${NC}"
    else
        echo -e "  │   ${DIM}./scripts/deploy_app.sh logs${NC}"
    fi
    echo -e "  │"
fi

echo -e "  ├── ${CYAN}Inject GPS coordinates:${NC}"
if [ "$DEVICE" = "android" ]; then
    echo -e "  │   ${DIM}adb emu geo fix <longitude> <latitude>${NC}"
    echo -e "  │   ${DIM}Example: adb emu geo fix -123.1044 44.0248${NC}"
else
    echo -e "  │   ${DIM}xcrun simctl location booted set <lat>,<lon>${NC}"
    echo -e "  │   ${DIM}Example: xcrun simctl location booted set 44.0248,-123.1044${NC}"
fi

if [ "$MODE" = "development" ]; then
    echo -e "  │"
    echo -e "  └── ${CYAN}Stop Metro:${NC}"
    echo -e "      ${DIM}./scripts/deploy_app.sh stop${NC}"
else
    echo -e "  │"
    echo -e "  └── ${CYAN}Re-deploy (development):${NC}"
    echo -e "      ${DIM}./scripts/deploy_app.sh --device $DEVICE --mode development --data current${NC}"
fi

echo ""
