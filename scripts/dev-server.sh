#!/bin/bash

# =============================================================================
# Dev Server - Unified Metro/Expo Server Management for iOS and Android
# =============================================================================
# Usage:
#   ./scripts/dev-server.sh [command] [platform]
#
# Commands:
#   start    - Start Metro server (default)
#   stop     - Stop all Metro/Expo processes
#   restart  - Stop then start
#   status   - Show server status
#   logs     - Tail current log file
#
# Platforms:
#   ios      - Launch on iOS Simulator (default)
#   android  - Launch on Android Emulator
#   both     - Launch on both platforms
#   none     - Start Metro only, no device launch
#
# Examples:
#   ./scripts/dev-server.sh                    # Start + iOS (default)
#   ./scripts/dev-server.sh start android     # Start + Android
#   ./scripts/dev-server.sh start both        # Start + both platforms
#   ./scripts/dev-server.sh restart           # Restart Metro + iOS
#   ./scripts/dev-server.sh stop              # Kill all Metro processes
#   ./scripts/dev-server.sh status            # Check if Metro is running
#   ./scripts/dev-server.sh logs              # Tail Metro logs
# =============================================================================

set -e

# Configuration
METRO_PORT=8081
APP_BUNDLE_ID_IOS="com.fogofdog.app"
APP_BUNDLE_ID_ANDROID="com.fogofdog.app"
PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

# Source environment variables (for API keys, etc.)
if [ -f "$PROJECT_DIR/.envrc" ]; then
    # shellcheck source=/dev/null
    source "$PROJECT_DIR/.envrc"
fi

# Parse arguments
COMMAND="${1:-start}"
PLATFORM="${2:-ios}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# =============================================================================
# Helper Functions
# =============================================================================

get_metro_pid() {
    lsof -ti:$METRO_PORT 2>/dev/null | head -1
}

is_metro_running() {
    local pid=$(get_metro_pid)
    [ -n "$pid" ]
}

stop_metro() {
    log_info "Stopping Metro/Expo processes..."
    
    pkill -f "expo start" 2>/dev/null || true
    pkill -f "metro" 2>/dev/null || true
    lsof -ti:$METRO_PORT | xargs kill -9 2>/dev/null || true
    
    # Also kill any stray port 8082 (backup port)
    lsof -ti:8082 | xargs kill -9 2>/dev/null || true
    
    sleep 1
    
    if is_metro_running; then
        log_error "Failed to stop Metro"
        return 1
    fi
    
    log_success "Metro stopped"
}

start_metro() {
    local platform_flag=""
    
    case "$PLATFORM" in
        ios)
            platform_flag="--ios"
            ;;
        android)
            platform_flag="--android"
            ;;
        both)
            platform_flag=""
            ;;
        none)
            platform_flag=""
            ;;
    esac
    
    # Create log file
    local timestamp=$(date +"%Y-%m-%d_%H%M%S")
    local log_file="/tmp/metro_${PLATFORM}_${timestamp}.log"
    echo "$log_file" > /tmp/METRO_CURRENT_LOG_FILENAME.txt
    
    log_info "Starting Metro server for platform: $PLATFORM"
    log_info "Logs: $log_file"
    
    cd "$PROJECT_DIR"
    
    # Start Metro in background
    if [ "$PLATFORM" = "both" ]; then
        # Start without auto-opening, then open both manually
        nohup npx expo start --dev-client --clear 2>&1 | tee "$log_file" &
        sleep 5
        
        # Open iOS
        if check_ios_simulator; then
            log_info "Opening on iOS Simulator..."
            npx expo start --ios 2>/dev/null &
        fi
        
        # Open Android
        if check_android_emulator; then
            log_info "Opening on Android Emulator..."
            npx expo start --android 2>/dev/null &
        fi
    elif [ "$PLATFORM" = "none" ]; then
        nohup npx expo start --dev-client --clear 2>&1 | tee "$log_file" &
    else
        nohup npx expo start --dev-client --clear $platform_flag 2>&1 | tee "$log_file" &
    fi
    
    local metro_pid=$!
    echo "$metro_pid" > /tmp/METRO_PID.txt
    
    log_info "Waiting for Metro to initialize..."
    sleep 3
    
    if is_metro_running; then
        log_success "Metro started (PID: $(get_metro_pid))"
        log_info "Monitor logs: ./scripts/dev-server.sh logs"
    else
        log_error "Metro failed to start"
        return 1
    fi
}

check_ios_simulator() {
    local device_udid=$(xcrun simctl list devices booted --json 2>/dev/null | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .udid' 2>/dev/null | head -1)
    [ -n "$device_udid" ]
}

check_android_emulator() {
    local devices=$(adb devices 2>/dev/null | grep -v "List" | grep -v "^$" | wc -l)
    [ "$devices" -gt 0 ]
}

show_status() {
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
    echo "                    Dev Server Status"
    echo "═══════════════════════════════════════════════════════════════"
    
    # Metro status
    if is_metro_running; then
        local pid=$(get_metro_pid)
        log_success "Metro: Running (PID: $pid, Port: $METRO_PORT)"
        
        # Show log file
        if [ -f /tmp/METRO_CURRENT_LOG_FILENAME.txt ]; then
            echo "       Log: $(cat /tmp/METRO_CURRENT_LOG_FILENAME.txt)"
        fi
    else
        log_warning "Metro: Not running"
    fi
    
    echo ""
    
    # iOS Simulator status
    echo -n "📱 iOS Simulator: "
    if check_ios_simulator; then
        local sim_name=$(xcrun simctl list devices booted --json 2>/dev/null | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .name' 2>/dev/null | head -1)
        echo -e "${GREEN}Booted ($sim_name)${NC}"
    else
        echo -e "${YELLOW}Not running${NC}"
    fi
    
    # Android Emulator status
    echo -n "🤖 Android Emulator: "
    if check_android_emulator; then
        local emu_name=$(adb devices -l 2>/dev/null | grep "emulator" | awk '{print $1}')
        echo -e "${GREEN}Running ($emu_name)${NC}"
    else
        echo -e "${YELLOW}Not running${NC}"
    fi
    
    echo ""
    echo "═══════════════════════════════════════════════════════════════"
}

show_logs() {
    if [ -f /tmp/METRO_CURRENT_LOG_FILENAME.txt ]; then
        local log_file=$(cat /tmp/METRO_CURRENT_LOG_FILENAME.txt)
        if [ -f "$log_file" ]; then
            log_info "Tailing: $log_file (Ctrl+C to stop)"
            tail -f "$log_file"
        else
            log_error "Log file not found: $log_file"
        fi
    else
        log_error "No active log file found"
    fi
}

clear_app_data() {
    log_info "Clearing app data..."
    
    case "$PLATFORM" in
        ios)
            # Clear iOS simulator app data
            local device_udid=$(xcrun simctl list devices booted --json 2>/dev/null | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .udid' 2>/dev/null | head -1)
            if [ -n "$device_udid" ]; then
                xcrun simctl terminate "$device_udid" "$APP_BUNDLE_ID_IOS" 2>/dev/null || true
                # Uninstall and reinstall clears all data
                log_info "Uninstalling app to clear data..."
                xcrun simctl uninstall "$device_udid" "$APP_BUNDLE_ID_IOS" 2>/dev/null || true
                log_success "iOS app data cleared (app uninstalled)"
            else
                log_warning "No booted iOS simulator found"
            fi
            ;;
        android)
            # Clear Android app data
            if check_android_emulator; then
                adb shell pm clear "$APP_BUNDLE_ID_ANDROID" 2>/dev/null || true
                log_success "Android app data cleared"
            else
                log_warning "No connected Android device found"
            fi
            ;;
        both)
            PLATFORM="ios" clear_app_data
            PLATFORM="android" clear_app_data
            ;;
    esac
}

show_help() {
    echo "Dev Server - Unified Metro/Expo Management"
    echo ""
    echo "Usage: ./scripts/dev-server.sh [command] [platform]"
    echo ""
    echo "Commands:"
    echo "  start    Start Metro server (default)"
    echo "  stop     Stop all Metro/Expo processes"
    echo "  restart  Stop then start"
    echo "  fresh    Clear app data + restart (clean slate)"
    echo "  clear    Clear app data on device (keeps server running)"
    echo "  status   Show server and device status"
    echo "  logs     Tail current Metro log file"
    echo "  help     Show this help"
    echo ""
    echo "Platforms:"
    echo "  ios      Launch on iOS Simulator (default)"
    echo "  android  Launch on Android Emulator"
    echo "  both     Launch on both platforms"
    echo "  none     Start Metro only, no device launch"
    echo ""
    echo "Examples:"
    echo "  ./scripts/dev-server.sh                    # Start + iOS"
    echo "  ./scripts/dev-server.sh start android      # Start + Android"
    echo "  ./scripts/dev-server.sh restart both       # Restart + both"
    echo "  ./scripts/dev-server.sh fresh android      # Clear data + restart Android"
    echo "  ./scripts/dev-server.sh status             # Check status"
}

# =============================================================================
# Main
# =============================================================================

case "$COMMAND" in
    start)
        if is_metro_running; then
            log_warning "Metro already running on port $METRO_PORT"
            log_info "Use 'restart' to restart, or 'stop' first"
            exit 1
        fi
        start_metro
        ;;
    stop)
        stop_metro
        ;;
    restart)
        stop_metro
        sleep 2
        start_metro
        ;;
    fresh)
        # Full reset: stop server, clear app data, restart
        stop_metro
        clear_app_data
        sleep 2
        start_metro
        ;;
    clear)
        # Just clear app data without restarting server
        clear_app_data
        # Relaunch the app
        if [ "$PLATFORM" = "android" ] && check_android_emulator; then
            log_info "Relaunching Android app..."
            adb shell am start -n "$APP_BUNDLE_ID_ANDROID/.MainActivity" 2>/dev/null || true
        elif [ "$PLATFORM" = "ios" ] && check_ios_simulator; then
            log_info "Relaunching iOS app..."
            xcrun simctl launch booted "$APP_BUNDLE_ID_IOS" 2>/dev/null || true
        fi
        ;;
    status)
        show_status
        ;;
    logs)
        show_logs
        ;;
    help|--help|-h)
        show_help
        ;;
    *)
        log_error "Unknown command: $COMMAND"
        show_help
        exit 1
        ;;
esac
