#!/bin/bash

# Setup E2E Test Environment
# This script installs the correct end-to-end testing build on the iOS simulator.
# It should be run once, or whenever native dependencies change.

set -e

APP_NAME="FogOfDog"
BUNDLE_ID="com.fogofdog.app"
BUILD_PATH="/Users/pacey/Library/Developer/Xcode/DerivedData/Build/Products/Release-iphonesimulator/${APP_NAME}.app"

# Check for force flag
FORCE_REINSTALL=false
if [ "$1" = "--force" ]; then
    FORCE_REINSTALL=true
    echo "🔄 Force flag detected - will rebuild and reinstall"
fi

# Get the current simulator device ID
SIMULATOR_ID=$(xcrun simctl list devices | grep "iPhone.*Booted" | head -1 | sed 's/.*(\([^)]*\)).*/\1/')
if [ -z "$SIMULATOR_ID" ]; then
    echo "❌ No booted iOS simulator found. Please start the iOS simulator first."
    exit 1
fi

echo "📲 Setting up E2E build for integration testing..."
echo "Using simulator: $SIMULATOR_ID"

# Step 1: Check if Release build exists
if [ "$FORCE_REINSTALL" = true ]; then
    echo "🔄 Force mode: will rebuild regardless of existing build"
    NEEDS_BUILD=true
elif [ -d "$BUILD_PATH" ]; then
    echo "✅ Release build already exists at $BUILD_PATH"
    NEEDS_BUILD=false
else
    echo "📦 Release build not found, will build..."
    NEEDS_BUILD=true
fi

# Step 2: Check if RELEASE app is installed on simulator
if [ "$FORCE_REINSTALL" = true ]; then
    echo "🔄 Force mode: will reinstall app regardless of current state"
    NEEDS_INSTALL=true
else
    APP_INSTALLED=$(xcrun simctl listapps "$SIMULATOR_ID" | grep "$BUNDLE_ID" || echo "")
    if [ -n "$APP_INSTALLED" ]; then
        # Check if it's a development build by looking at the app info
        APP_INFO=$(xcrun simctl listapps "$SIMULATOR_ID" | grep -A5 -B5 "$BUNDLE_ID")
        if echo "$APP_INFO" | grep -q "Development\|Debug"; then
            echo "🔄 Development build detected, will replace with Release build"
            NEEDS_INSTALL=true
        else
            echo "✅ Release app already installed on simulator"
            NEEDS_INSTALL=false
        fi
    else
        echo "📱 App not installed on simulator, will install..."
        NEEDS_INSTALL=true
    fi
fi

# Step 3: Build if needed
if [ "$NEEDS_BUILD" = true ]; then
    echo "🔨 Building Release configuration..."
    echo "This may take a few minutes..."
    npx expo run:ios --configuration Release --no-install
    NEEDS_INSTALL=true  # Force install after rebuild
fi

# Step 4: Install if needed
if [ "$NEEDS_INSTALL" = true ]; then
    echo "📱 Installing app on simulator..."
    # First uninstall any existing version to ensure clean state
    echo "🗑️ Removing any existing app version..."
    xcrun simctl uninstall "$SIMULATOR_ID" "$BUNDLE_ID" 2>/dev/null || true
    echo "📦 Installing Release build..."
    xcrun simctl install "$SIMULATOR_ID" "$BUILD_PATH"
fi

echo "✅ E2E build setup completed successfully."
echo "You can now run integration tests using ./scripts/run_integration_tests.sh" 