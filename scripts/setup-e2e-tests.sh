#!/bin/bash

# Setup E2E Test Environment
# This script installs the correct end-to-end testing build on the iOS simulator.
# It should be run once, or whenever native dependencies change.

set -e

APP_NAME="FogOfDog"
BUNDLE_ID="com.fogofdog.app"
BUILD_PATH="/Users/pacey/Library/Developer/Xcode/DerivedData/Build/Products/Release-iphonesimulator/${APP_NAME}.app"

# Get the current simulator device ID
SIMULATOR_ID=$(xcrun simctl list devices | grep "iPhone.*Booted" | head -1 | sed 's/.*(\([^)]*\)).*/\1/')
if [ -z "$SIMULATOR_ID" ]; then
    echo "❌ No booted iOS simulator found. Please start the iOS simulator first."
    exit 1
fi

echo "📲 Setting up E2E build for integration testing..."
echo "Using simulator: $SIMULATOR_ID"

# Step 1: Check if Release build exists
if [ -d "$BUILD_PATH" ]; then
    echo "✅ Release build already exists at $BUILD_PATH"
    NEEDS_BUILD=false
else
    echo "📦 Release build not found, will build..."
    NEEDS_BUILD=true
fi

# Step 2: Check if app is installed on simulator
APP_INSTALLED=$(xcrun simctl listapps "$SIMULATOR_ID" | grep "$BUNDLE_ID" || echo "")
if [ -n "$APP_INSTALLED" ]; then
    echo "✅ App already installed on simulator"
    NEEDS_INSTALL=false
else
    echo "📱 App not installed on simulator, will install..."
    NEEDS_INSTALL=true
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