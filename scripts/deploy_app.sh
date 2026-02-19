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

# Source platform-specific functions
source "$SCRIPT_DIR/internal/deploy-ios-functions.sh"
source "$SCRIPT_DIR/internal/deploy-android-functions.sh"

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
PHYSICAL_DEVICE=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --action)   ACTION="$2";  shift 2 ;;
        --device)   DEVICE="$2";  shift 2 ;;
        --mode)     MODE="$2";    shift 2 ;;
        --data)     DATA="$2";    shift 2 ;;
        --force)    FORCE=true;   shift   ;;
        --skip-gps) SKIP_GPS=true; shift  ;;
        --dry-run)  DRY_RUN=true; shift   ;;
        --physical) PHYSICAL_DEVICE=true; shift ;;
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
  --physical  Deploy to physical iOS device (uses LOCAL_DEVICE_NAME from .envrc)
  --dry-run   Show what would be done without doing it
  --help      Show this help

EXAMPLES:
  ./scripts/deploy_app.sh --device android --mode development --data current
  ./scripts/deploy_app.sh --device ios --mode development --data fresh-install
  ./scripts/deploy_app.sh --device ios --mode development --data current --physical
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

get_local_ip() {
    # Get the primary LAN IP address (for Metro connection over WiFi)
    ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null || echo "localhost"
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


# Source fingerprinting functions (native build detection + clean prebuild)
source "$SCRIPT_DIR/internal/deploy-fingerprint-functions.sh"

# =============================================================================
# Metro management (non-greedy cleanup)
# =============================================================================

is_metro_running() {
    lsof -ti:$METRO_PORT >/dev/null 2>&1
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
    local host_mode="lan"
    # iOS simulator uses localhost; physical iOS device uses lan (like Android)
    [ "$DEVICE" = "ios" ] && [ "$PHYSICAL_DEVICE" != true ] && host_mode="localhost"

    info "Starting Metro server via scripts/internal/refresh-metro.sh..."
    "$PROJECT_DIR/scripts/internal/refresh-metro.sh" --host "$host_mode" --no-open

    if [ -f /tmp/METRO_CURRENT_LOG_FILENAME.txt ]; then
        local log_file
        log_file=$(cat /tmp/METRO_CURRENT_LOG_FILENAME.txt)
        info "Monitor logs: tail -f $log_file"
    fi
}

# =============================================================================
# Decision engine — the brain
# =============================================================================

needs_native_build() {
    if [ "$FORCE" = true ]; then
        info "Force rebuild requested"
        return 0  # yes, needs build
    fi

    # Physical device: can't reliably check if app is installed/current.
    # Use native fingerprint to detect if a rebuild is needed.
    if [ "$PHYSICAL_DEVICE" = true ]; then
        if is_native_dirty "ios"; then
            report_native_changes "ios"
            info "Native config changed since last build — rebuild needed"
            return 0
        fi
        ok "Native config unchanged — skipping rebuild (app should be on device)"
        return 1
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
                report_native_changes "ios"
                info "Native config changed since last build — rebuild needed"
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
                report_native_changes "android"
                info "Native config changed since last build — rebuild needed"
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

if [ "$PHYSICAL_DEVICE" = true ]; then
    ok "Physical device '$LOCAL_DEVICE_NAME' — ensure it's plugged in and unlocked"
else
    case "$DEVICE" in
        ios)     run_step "boot_ios_simulator" boot_ios_simulator       ;;
        android) run_step "boot_android_emulator" boot_android_emulator ;;
    esac
fi

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

if [ "$PHYSICAL_DEVICE" = true ]; then
    step "GPS setup"
    ok "Physical device — using real GPS"
elif [ "$SKIP_GPS" = false ]; then
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
            if [ "$PHYSICAL_DEVICE" = true ]; then
                # Can't programmatically verify physical device app state
                return 0
            fi
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
            adb get-state 2>/dev/null | grep -q "^device$" || return 1
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
if [ "$PHYSICAL_DEVICE" = true ]; then
    echo -e "  ├── Device:   ${BOLD}$DEVICE${NC} (physical: $LOCAL_DEVICE_NAME)"
else
    echo -e "  ├── Device:   ${BOLD}$DEVICE${NC}"
fi
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

if [ "$PHYSICAL_DEVICE" = true ]; then
    if [ "$MODE" = "development" ]; then
        echo -e "  ├── ${CYAN}Metro connection:${NC}"
        echo -e "  │   ${DIM}Device should auto-connect to Metro at $(get_local_ip):${METRO_PORT}${NC}"
        echo -e "  │   ${DIM}If not, open the app on your phone and it will find the server${NC}"
    else
        echo -e "  ├── ${CYAN}Standalone app:${NC}"
        echo -e "  │   ${DIM}Release build — just open the app on your phone${NC}"
        echo -e "  │   ${DIM}No Metro server or local network required${NC}"
    fi
    echo -e "  │"
    echo -e "  ├── ${CYAN}Monitor device logs:${NC}"
    echo -e "  │   ${DIM}# Over WiFi (recommended — no cable needed):${NC}"
    echo -e "  │   ${DIM}idevicesyslog -u \$(xcrun xctrace list devices 2>/dev/null | grep '$LOCAL_DEVICE_NAME' | grep -oE '[0-9A-Fa-f-]{25}') -n | grep -i fog${NC}"
    echo -e "  │   ${DIM}# Over USB (if WiFi doesn't work):${NC}"
    echo -e "  │   ${DIM}idevicesyslog -u \$(xcrun xctrace list devices 2>/dev/null | grep '$LOCAL_DEVICE_NAME' | grep -oE '[0-9A-Fa-f-]{25}') | grep -i fog${NC}"
    echo -e "  │   ${DIM}# Install if missing: brew install libimobiledevice${NC}"
    echo -e "  │   ${DIM}# Or in Xcode: Window → Devices and Simulators → View Device Logs${NC}"
else
    echo -e "  ├── ${CYAN}Inject GPS coordinates:${NC}"
    if [ "$DEVICE" = "android" ]; then
        echo -e "  │   ${DIM}adb emu geo fix <longitude> <latitude>${NC}"
        echo -e "  │   ${DIM}Example: adb emu geo fix -123.1044 44.0248${NC}"
    else
        echo -e "  │   ${DIM}xcrun simctl location booted set <lat>,<lon>${NC}"
        echo -e "  │   ${DIM}Example: xcrun simctl location booted set 44.0248,-123.1044${NC}"
    fi
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
