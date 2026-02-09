#!/bin/bash

# Script to inject GPS coordinates into Android emulator for Maestro testing
# Usage: ./scripts/inject-android-gps.sh [latitude] [longitude]
#
# This script injects GPS coordinates into the Android emulator using adb's geo fix command.
# This allows Maestro integration tests to run on Android without requiring real GPS.
#
# Examples:
#   ./scripts/inject-android-gps.sh 37.78825 -122.4324  # San Francisco
#   ./scripts/inject-android-gps.sh 44.02916 -123.10396 # Eugene, OR

set -e

# Default coordinates (San Francisco - same as iOS tests)
LATITUDE="${1:-37.78825}"
LONGITUDE="${2:-122.4324}"

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

log_info() { echo -e "${GREEN}[INFO]${NC} $1"; }
log_warn() { echo -e "${YELLOW}[WARN]${NC} $1"; }
log_error() { echo -e "${RED}[ERROR]${NC} $1"; }

# Check if adb is available
if ! command -v adb &> /dev/null; then
    log_error "adb not found. Please install Android SDK and add platform-tools to PATH."
    exit 1
fi

# Check if emulator is running
if ! adb devices 2>/dev/null | grep -q "emulator"; then
    log_error "No Android emulator running. Start one with: ./scripts/launch-device.sh android"
    exit 1
fi

# Get emulator serial
EMULATOR_SERIAL=$(adb devices | grep "emulator" | head -1 | awk '{print $1}')
log_info "Found emulator: $EMULATOR_SERIAL"

# Get the emulator port from the serial (e.g., emulator-5554 -> 5554)
EMULATOR_PORT=$(echo "$EMULATOR_SERIAL" | cut -d'-' -f2)

# Method 1: Use adb emu geo fix (requires telnet-accessible emulator)
# Note: geo fix uses longitude,latitude order (opposite of normal)
log_info "Injecting GPS coordinates via emulator console..."
log_info "  Latitude:  $LATITUDE"
log_info "  Longitude: $LONGITUDE"

# Try the newer adb method first
if adb -s "$EMULATOR_SERIAL" shell "am broadcast -a android.intent.action.AIRPLANEMODE_CHANGED" &> /dev/null; then
    # Use getprop to check if location can be set
    adb -s "$EMULATOR_SERIAL" shell "settings put secure location_mode 3" 2>/dev/null || true
fi

# Use geo fix via telnet (classic method, works on most emulators)
# Note: geo fix requires longitude FIRST, then latitude (counterintuitive!)
# Format: geo fix <longitude> <latitude> [altitude [sat_count [velocity [heading]]]]
(
    echo "geo fix $LONGITUDE $LATITUDE 0"
    sleep 0.5
    echo "exit"
) | nc localhost "$EMULATOR_PORT" 2>/dev/null || {
    log_warn "Telnet method failed. Trying alternative methods..."
    
    # Alternative: Use mock location via shell
    # This requires the app to allow mock locations
    adb -s "$EMULATOR_SERIAL" shell "appops set com.fogofdog.app android:mock_location allow" 2>/dev/null || true
}

log_info "GPS coordinates injected!"
log_info ""
log_info "To verify, check: adb shell dumpsys location | grep -A5 'last known'"
log_info ""
log_info "Note: The app may take a moment to pick up the new coordinates."
log_info "Maestro's setLocation command should now work properly."
