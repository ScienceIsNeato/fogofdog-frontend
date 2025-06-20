#!/bin/bash

# Bundle Health Check Script
# Validates that the React Native bundle builds successfully before running integration tests
# This prevents the dreaded "white screen" during Maestro tests

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
  echo -e "${BLUE}🔍 Bundle Check:${NC} $1"
}

print_success() {
  echo -e "${GREEN}✅${NC} $1"
}

print_error() {
  echo -e "${RED}❌${NC} $1"
}

print_warning() {
  echo -e "${YELLOW}⚠️${NC} $1"
}

print_status "Starting React Native bundle validation..."

# Step 0: Refresh Metro server to ensure clean connection
print_status "Refreshing Metro server..."
./scripts/refresh-metro.sh

# Step 1: Clean TypeScript compilation check
print_status "Checking TypeScript compilation..."
if npx tsc --noEmit --skipLibCheck; then
  print_success "TypeScript compilation passed"
else
  print_error "TypeScript compilation failed - this will cause bundle errors"
  exit 1
fi

# Step 2: Check for obvious import/export issues
print_status "Checking for import/export issues..."
# Run lint:fix proactively (silent) then check if any unfixable issues remain
npm run lint:fix > /dev/null 2>&1
if npm run lint:check > /dev/null 2>&1; then
  print_success "No import/export issues found"
else
  print_warning "Some linting issues remain after auto-fix - may affect bundle"
fi

# Step 3: Test bundle creation with timeout (reduced from 120s to 90s)
print_status "Testing bundle creation (this may take 30-60 seconds)..."

# Create a temporary bundle to test
BUNDLE_OUTPUT="/tmp/fogofdog-bundle-test.js"
BUNDLE_MAP="/tmp/fogofdog-bundle-test.js.map"

# Clean up any existing test bundles
rm -f "$BUNDLE_OUTPUT" "$BUNDLE_MAP"

# Try to create the bundle with a slightly reduced timeout
timeout 90s npx react-native bundle \
  --platform ios \
  --dev false \
  --entry-file index.ts \
  --bundle-output "$BUNDLE_OUTPUT" \
  --sourcemap-output "$BUNDLE_MAP" \
  --reset-cache \
  --verbose 2>&1 | tee /tmp/bundle-check.log

BUNDLE_EXIT_CODE=$?

# Check if bundle was created successfully
if [ $BUNDLE_EXIT_CODE -eq 0 ] && [ -f "$BUNDLE_OUTPUT" ]; then
  BUNDLE_SIZE=$(stat -f%z "$BUNDLE_OUTPUT" 2>/dev/null || stat -c%s "$BUNDLE_OUTPUT" 2>/dev/null || echo "unknown")
  print_success "Bundle created successfully (${BUNDLE_SIZE} bytes)"
  
  # Clean up test bundle
  rm -f "$BUNDLE_OUTPUT" "$BUNDLE_MAP"
  
  print_success "🎉 Bundle health check PASSED - safe to run Maestro tests!"
  exit 0
else
  print_error "Bundle creation FAILED!"
  echo ""
  echo "📋 Bundle error details:"
  echo "----------------------------------------"
  tail -20 /tmp/bundle-check.log
  echo "----------------------------------------"
  echo ""
  print_error "❌ DO NOT run Maestro tests - fix bundle errors first!"
  
  # Clean up
  rm -f "$BUNDLE_OUTPUT" "$BUNDLE_MAP"
  exit 1
fi