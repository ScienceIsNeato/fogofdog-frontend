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

# Check current deployment type
CURRENT_DEPLOYMENT="unknown"
if [ -f ".currently_deployed_type" ]; then
    CURRENT_DEPLOYMENT=$(cat .currently_deployed_type)
    echo "🔍 Current deployment type: $CURRENT_DEPLOYMENT"
else
    echo "⚠️  No deployment tracking file found - will deploy release build"
fi

# Step 1: Determine if we need to deploy release build
NEEDS_RELEASE_DEPLOYMENT=false

if [ "$FORCE_REINSTALL" = true ]; then
    echo "🔄 Force mode: will deploy release build regardless"
    NEEDS_RELEASE_DEPLOYMENT=true
elif [ "$CURRENT_DEPLOYMENT" != "release" ]; then
    echo "🔄 Non-release build detected ($CURRENT_DEPLOYMENT), will deploy release build"
    NEEDS_RELEASE_DEPLOYMENT=true
else
    echo "✅ Release build already deployed"
fi

# Step 2: Deploy release build if needed
if [ "$NEEDS_RELEASE_DEPLOYMENT" = true ]; then
    echo "🚀 Deploying release build using dedicated script..."
    if [ "$FORCE_REINSTALL" = true ]; then
        ./scripts/deploy_release_build_to_simulator.sh --force
    else
        ./scripts/deploy_release_build_to_simulator.sh
    fi
    echo "✅ Release build deployment completed"
else
    echo "✅ Release build already properly deployed"
fi

# Build and installation now handled by deploy_release_build_to_simulator.sh

echo "✅ E2E build setup completed successfully."
echo "You can now run integration tests using ./scripts/run_integration_tests.sh" 