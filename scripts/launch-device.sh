#!/bin/bash

# =============================================================================
# Launch Emulator/Simulator - Quick device launcher for development
# =============================================================================
# Usage:
#   ./scripts/launch-device.sh [platform]
#
# Platforms:
#   ios      - Launch iOS Simulator (iPhone 15 Pro)
#   android  - Launch Android Emulator (Pixel_8_Pro)
#   both     - Launch both
# =============================================================================

set -e

PLATFORM="${1:-ios}"

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

# iOS Simulator
launch_ios() {
    log_info "Launching iOS Simulator..."
    
    # Check if already booted
    local booted=$(xcrun simctl list devices booted --json | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .name' | head -1)
    
    if [ -n "$booted" ]; then
        log_success "iOS Simulator already running: $booted"
    else
        # Find iPhone 15 Pro or any available iPhone
        local device_udid=$(xcrun simctl list devices available --json | jq -r '.devices | to_entries[] | .value[] | select(.name | contains("iPhone 15 Pro")) | .udid' | head -1)
        
        if [ -z "$device_udid" ]; then
            # Fallback to any available iPhone
            device_udid=$(xcrun simctl list devices available --json | jq -r '.devices | to_entries[] | .value[] | select(.name | contains("iPhone")) | .udid' | head -1)
        fi
        
        if [ -n "$device_udid" ]; then
            xcrun simctl boot "$device_udid"
            open -a Simulator
            log_success "iOS Simulator booting..."
        else
            log_warning "No iOS Simulator found. Create one in Xcode."
        fi
    fi
}

# Android Emulator
launch_android() {
    log_info "Launching Android Emulator..."
    
    # Check if already running
    local running=$(adb devices 2>/dev/null | grep "emulator" | wc -l)
    
    if [ "$running" -gt 0 ]; then
        log_success "Android Emulator already running"
    else
        # Find available AVD
        local avd_name=$(emulator -list-avds 2>/dev/null | head -1)
        
        if [ -n "$avd_name" ]; then
            log_info "Starting AVD: $avd_name"
            # Start in background, suppress output
            nohup emulator -avd "$avd_name" -no-snapshot-load > /tmp/android_emulator.log 2>&1 &
            
            log_info "Waiting for emulator to boot..."
            # Wait for device to be ready (up to 60 seconds)
            local count=0
            while [ $count -lt 60 ]; do
                if adb shell getprop sys.boot_completed 2>/dev/null | grep -q "1"; then
                    log_success "Android Emulator booted: $avd_name"
                    return 0
                fi
                sleep 2
                count=$((count + 2))
            done
            log_warning "Emulator taking longer than expected to boot"
        else
            log_warning "No Android AVD found. Create one in Android Studio."
        fi
    fi
}

case "$PLATFORM" in
    ios)
        launch_ios
        ;;
    android)
        launch_android
        ;;
    both)
        launch_ios
        launch_android
        ;;
    *)
        echo "Usage: $0 [ios|android|both]"
        exit 1
        ;;
esac
