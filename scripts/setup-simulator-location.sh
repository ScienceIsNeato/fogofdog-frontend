#!/bin/bash

# Setup iOS Simulator Location for Development
# This script sets a default location in the iOS Simulator for FogOfDog development

set -e

# Default development location (Eugene, Oregon South Hills)
DEFAULT_LAT="44.0248"
DEFAULT_LON="-123.1044"
LOCATION_NAME="Eugene, Oregon South Hills"

echo "🌍 Setting up iOS Simulator location for development..."

# Check if simulator is running
if ! xcrun simctl list devices booted --json | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .name' | grep -q .; then
    echo "❌ No booted iOS simulator found."
    echo "   Please start the iOS Simulator first, then run this script."
    exit 1
fi

# Get booted simulator info
SIMULATOR_INFO=$(xcrun simctl list devices booted --json | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | "\(.name) (\(.udid))"' | head -n1)
echo "📱 Found booted simulator: $SIMULATOR_INFO"

# Set the location
echo "📍 Setting location to: $LOCATION_NAME ($DEFAULT_LAT, $DEFAULT_LON)"
xcrun simctl location booted set "$DEFAULT_LAT,$DEFAULT_LON"

echo "✅ Simulator location set successfully!"
echo ""
echo "💡 The FogOfDog app should now automatically get this location when started."
echo "   This eliminates the need for manual GPS injection during development."
echo ""
echo "🔧 To set a custom location, use:"
echo "   xcrun simctl location booted set <latitude>,<longitude>"
echo ""
echo "🔄 To clear the location (back to no location):"
echo "   xcrun simctl location booted clear"
