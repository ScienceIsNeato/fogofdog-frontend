#!/bin/bash

# Setup E2E Test Environment
# This script installs the correct end-to-end testing build on the iOS simulator.
# It should be run once, or whenever native dependencies change.

set -e

echo "📲 Installing the E2E build for integration testing..."
echo "This may take a few minutes if this is the first time..."

# Use the 'e2e' build profile from eas.json to install the app on the simulator
npx expo run:ios --configuration e2e

echo "✅ E2E build installed successfully."
echo "You can now run integration tests using ./scripts/run_integration_tests.sh" 