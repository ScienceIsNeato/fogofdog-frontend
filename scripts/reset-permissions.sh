#!/bin/bash

# Reset Permissions Script for FogOfDog Development
# This script resets location permissions and optionally refreshes the app

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# App bundle identifier
APP_BUNDLE_ID="com.fogofdog.app"

# Function to print colored output
print_status() {
    echo -e "${BLUE}📱${NC} $1"
}

print_success() {
    echo -e "${GREEN}✅${NC} $1"
}

print_warning() {
    echo -e "${YELLOW}⚠️${NC} $1"
}

print_error() {
    echo -e "${RED}❌${NC} $1"
}

# Function to get booted simulator UDID
get_simulator_udid() {
    xcrun simctl list devices | grep "Booted" | head -1 | grep -o '[A-F0-9-]\{36\}'
}

# Function to show help
show_help() {
    echo "Usage: $0 [OPTIONS]"
    echo ""
    echo "Reset location permissions for FogOfDog app in iOS Simulator"
    echo ""
    echo "Options:"
    echo "  -r, --refresh    Also refresh Metro and restart the app"
    echo "  -s, --simulator  Specify simulator UDID (optional)"
    echo "  -h, --help       Show this help message"
    echo ""
    echo "Examples:"
    echo "  $0                 # Just reset permissions"
    echo "  $0 --refresh       # Reset permissions and refresh app"
    echo "  $0 -s ABC123       # Reset permissions for specific simulator"
    echo ""
}

# Parse command line arguments
REFRESH_APP=false
SIMULATOR_UDID=""

while [[ $# -gt 0 ]]; do
    case $1 in
        -r|--refresh)
            REFRESH_APP=true
            shift
            ;;
        -s|--simulator)
            SIMULATOR_UDID="$2"
            shift 2
            ;;
        -h|--help)
            show_help
            exit 0
            ;;
        *)
            print_error "Unknown option: $1"
            show_help
            exit 1
            ;;
    esac
done

print_status "Starting permission reset for FogOfDog..."

# Get simulator UDID if not provided
if [ -z "$SIMULATOR_UDID" ]; then
    print_status "Finding booted iOS Simulator..."
    SIMULATOR_UDID=$(get_simulator_udid)
    
    if [ -z "$SIMULATOR_UDID" ]; then
        print_error "No booted iOS Simulator found!"
        print_warning "Please start an iOS Simulator and try again."
        exit 1
    fi
    
    print_success "Found booted simulator: $SIMULATOR_UDID"
else
    print_status "Using specified simulator: $SIMULATOR_UDID"
fi

# Reset location permissions
print_status "Resetting location permissions..."
if xcrun simctl privacy "$SIMULATOR_UDID" reset location "$APP_BUNDLE_ID" 2>/dev/null; then
    print_success "Location permissions reset successfully!"
else
    print_error "Failed to reset permissions. App might not be installed."
    exit 1
fi

# Optional: Refresh the app
if [ "$REFRESH_APP" = true ]; then
    print_status "Refreshing Metro and restarting app..."
    
    # Check if refresh-metro.sh exists
    if [ -f "./scripts/refresh-metro.sh" ]; then
        if ./scripts/refresh-metro.sh; then
            print_success "App refreshed successfully!"
        else
            print_warning "Metro refresh completed with warnings (this is normal)"
        fi
    else
        print_warning "refresh-metro.sh script not found, skipping app refresh"
    fi
fi

print_success "Permission reset complete!"
print_status "The app will now show permission dialogs on next launch."

# Show next steps
echo ""
print_status "Next steps:"
echo "  1. Launch the FogOfDog app in the simulator"
echo "  2. Complete the onboarding tutorial (if first-time user)"
echo "  3. Grant location permissions when prompted"
echo "  4. Test your permission flow changes"
echo ""

if [ "$REFRESH_APP" = false ]; then
    print_status "Tip: Use --refresh flag to automatically restart the app:"
    echo "  $0 --refresh"
fi



