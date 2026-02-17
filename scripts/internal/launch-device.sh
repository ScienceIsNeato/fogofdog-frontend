#!/bin/bash

# =============================================================================
# Launch Emulator/Simulator - Quick device launcher for development
# =============================================================================
# Usage (internal helper - called by deploy_app.sh):
#   ./scripts/internal/launch-device.sh [platform]
#
# Platforms:
#   ios      - Launch iOS Simulator
#   android  - Launch Android Emulator
#   both     - Launch both
# =============================================================================

set -e

PLATFORM="${1:-ios}"

# =============================================================================
# Target Device Configuration
# =============================================================================
# These are the canonical devices for FogOfDog development.
# Change these if you need to test on different hardware/OS versions.
#
# To find available iOS simulators:
#   xcrun simctl list devices available
#
# To find available Android AVDs:
#   emulator -list-avds
# =============================================================================

# iOS: Use iPhone 17 Pro with iOS 26 (latest as of Feb 2026)
# Fallback chain: exact match → iPhone 17 Pro (any iOS) → iPhone 16 Pro → iPhone 15 Pro → any iPhone
IOS_TARGET_DEVICE="iPhone 17 Pro"
IOS_TARGET_RUNTIME="iOS 26"  # Prefix match (matches 26.0, 26.1, 26.2, etc.)

# Android: Pixel 8 Pro AVD
ANDROID_TARGET_AVD="Pixel_8_Pro"

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
    log_info "Target: $IOS_TARGET_DEVICE on $IOS_TARGET_RUNTIME"
    
    # Check if already booted
    local booted=$(xcrun simctl list devices booted --json | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .name' | head -1)
    
    if [ -n "$booted" ]; then
        log_success "iOS Simulator already running: $booted"
    else
        local device_udid=""
        local device_name=""
        
        # Priority 1: Exact match - target device on target runtime
        device_udid=$(xcrun simctl list devices available --json | jq -r "
            .devices | to_entries[] 
            | select(.key | contains(\"$IOS_TARGET_RUNTIME\")) 
            | .value[] 
            | select(.name == \"$IOS_TARGET_DEVICE\") 
            | .udid" | head -1)
        
        if [ -n "$device_udid" ]; then
            device_name="$IOS_TARGET_DEVICE ($IOS_TARGET_RUNTIME)"
        fi
        
        # Priority 2: Target device on any iOS version
        if [ -z "$device_udid" ]; then
            device_udid=$(xcrun simctl list devices available --json | jq -r "
                .devices | to_entries[] 
                | .value[] 
                | select(.name == \"$IOS_TARGET_DEVICE\") 
                | .udid" | head -1)
            if [ -n "$device_udid" ]; then
                device_name="$IOS_TARGET_DEVICE (fallback iOS version)"
            fi
        fi
        
        # Priority 3: iPhone 16 Pro (common fallback)
        if [ -z "$device_udid" ]; then
            device_udid=$(xcrun simctl list devices available --json | jq -r '
                .devices | to_entries[] 
                | .value[] 
                | select(.name == "iPhone 16 Pro") 
                | .udid' | head -1)
            if [ -n "$device_udid" ]; then
                device_name="iPhone 16 Pro (fallback device)"
            fi
        fi
        
        # Priority 4: iPhone 15 Pro (older but common)
        if [ -z "$device_udid" ]; then
            device_udid=$(xcrun simctl list devices available --json | jq -r '
                .devices | to_entries[] 
                | .value[] 
                | select(.name == "iPhone 15 Pro") 
                | .udid' | head -1)
            if [ -n "$device_udid" ]; then
                device_name="iPhone 15 Pro (fallback device)"
            fi
        fi
        
        # Priority 5: Any available iPhone
        if [ -z "$device_udid" ]; then
            device_udid=$(xcrun simctl list devices available --json | jq -r '
                .devices | to_entries[] 
                | .value[] 
                | select(.name | contains("iPhone")) 
                | .udid' | head -1)
            if [ -n "$device_udid" ]; then
                device_name="fallback iPhone"
            fi
        fi
        
        if [ -n "$device_udid" ]; then
            log_info "Booting: $device_name (UDID: $device_udid)"
            xcrun simctl boot "$device_udid"
            open -a Simulator
            log_success "iOS Simulator booting: $device_name"
        else
            log_warning "No iOS Simulator found. Create one in Xcode."
            log_warning "Expected: $IOS_TARGET_DEVICE with $IOS_TARGET_RUNTIME"
        fi
    fi
}

# Android Emulator
launch_android() {
    log_info "Launching Android Emulator..."
    log_info "Target: $ANDROID_TARGET_AVD"
    
    # Clean up orphaned crashpad_handler processes from previous sessions.
    # These accumulate across emulator launches and can consume tens of GB of RAM.
    local orphan_count
    orphan_count=$(pgrep -f crashpad_handler 2>/dev/null | wc -l | tr -d ' ')
    if [ "$orphan_count" -gt 0 ]; then
        log_warning "Killing $orphan_count orphaned crashpad_handler processes..."
        pkill -f crashpad_handler 2>/dev/null || true
        sleep 1
    fi
    
    # Check if already running
    local running=$(adb devices 2>/dev/null | grep "emulator" | wc -l)
    
    if [ "$running" -gt 0 ]; then
        log_success "Android Emulator already running"
    else
        local avd_name=""
        
        # Priority 1: Use configured target AVD if it exists
        if emulator -list-avds 2>/dev/null | grep -q "^${ANDROID_TARGET_AVD}$"; then
            avd_name="$ANDROID_TARGET_AVD"
        else
            # Priority 2: Fallback to first available AVD
            avd_name=$(emulator -list-avds 2>/dev/null | head -1)
            if [ -n "$avd_name" ]; then
                log_warning "Target AVD '$ANDROID_TARGET_AVD' not found, using: $avd_name"
            fi
        fi
        
        if [ -n "$avd_name" ]; then
            log_info "Starting AVD: $avd_name (headless mode)"
            # Start in detached background process so it survives parent shell exit.
            # Resource tuning flags:
            #   -no-window         Headless mode (no UI window, control via adb/scrcpy)
            #   -no-snapshot-load  Cold boot (avoids stale snapshot corruption)
            #   -no-audio          Skip audio emulation (saves CPU)
            #   -no-boot-anim      Skip boot animation (faster startup)
            #   -memory 2048       Cap guest RAM at 2GB (prevents host memory ballooning)
            #   -gpu host          Use host GPU acceleration (faster, less CPU)
            local emulator_bin
            emulator_bin=$(command -v emulator)
            (
                exec nohup "$emulator_bin" -avd "$avd_name" \
                    -no-window \
                    -no-snapshot-load \
                    -no-audio \
                    -no-boot-anim \
                    -memory 2048 \
                    -gpu host \
                    > /tmp/android_emulator.log 2>&1
            ) &
            local emulator_pid=$!
            disown "$emulator_pid" 2>/dev/null || true
            echo "$emulator_pid" > /tmp/ANDROID_EMULATOR_PID.txt
            
            log_info "Waiting for emulator to boot..."
            # Wait for device to be ready (up to 60 seconds)
            local count=0
            while [ $count -lt 60 ]; do
                if ! kill -0 "$emulator_pid" 2>/dev/null; then
                    log_warning "Android Emulator process exited before boot completed"
                    tail -20 /tmp/android_emulator.log 2>/dev/null || true
                    return 1
                fi
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
            log_warning "Expected: $ANDROID_TARGET_AVD"
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
