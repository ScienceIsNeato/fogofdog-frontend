#!/bin/bash

# Bundle Health Check Script
# Validates that the React Native bundle builds successfully before running integration tests
# This prevents the dreaded "white screen" during Maestro tests
#
# Usage: ./bundle-check.sh [--platform ios|android]

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Parse arguments
PLATFORM="ios"
while [[ $# -gt 0 ]]; do
  case "$1" in
    --platform)
      PLATFORM="$2"
      shift 2
      ;;
    *)
      shift
      ;;
  esac
done

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

print_status "Starting React Native bundle validation (platform: ${PLATFORM})..."

# Step 0: Verify Metro is running (do NOT restart — that disrupts the emulator
# connection, especially on Android which uses LAN host mode)
print_status "Checking Metro server..."
METRO_PORT=8081
if curl -fsS "http://127.0.0.1:${METRO_PORT}/status" 2>/dev/null | grep -q "packager-status:running"; then
  print_success "Metro server is running"
else
  print_status "Metro not running — starting via refresh-metro.sh..."
  ./scripts/internal/refresh-metro.sh --no-open
fi

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

# Step 3: Verify Metro can serve the bundle for the target platform
# This is more reliable than `npx react-native bundle` for Expo projects,
# which use @expo/metro-config (not @react-native/metro-config).
print_status "Verifying Metro can serve the ${PLATFORM} bundle..."

METRO_PORT=8081
BUNDLE_URL="http://localhost:${METRO_PORT}/index.bundle?dev=true&platform=${PLATFORM}&minify=false"
BUNDLE_OUTPUT="/tmp/fogofdog-bundle-test-${PLATFORM}.js"

rm -f "$BUNDLE_OUTPUT"

# Fetch the bundle from Metro with a 90s timeout
HTTP_CODE=$(curl -s -o "$BUNDLE_OUTPUT" -w "%{http_code}" --max-time 90 "$BUNDLE_URL" 2>/tmp/bundle-check-curl.log)
CURL_EXIT=$?

if [ $CURL_EXIT -ne 0 ]; then
  print_error "Failed to reach Metro server at localhost:${METRO_PORT}"
  cat /tmp/bundle-check-curl.log 2>/dev/null
  rm -f "$BUNDLE_OUTPUT"
  exit 1
fi

if [ "$HTTP_CODE" = "200" ] && [ -f "$BUNDLE_OUTPUT" ]; then
  BUNDLE_SIZE=$(stat -f%z "$BUNDLE_OUTPUT" 2>/dev/null || stat -c%s "$BUNDLE_OUTPUT" 2>/dev/null || echo "unknown")

  # Check for bundler error payloads (Metro returns 200 but embeds error details)
  if grep -q '"type":"InternalError"\|"type":"TransformError"\|Unable to resolve module' "$BUNDLE_OUTPUT" 2>/dev/null; then
    print_error "Bundle served but contains errors!"
    echo ""
    echo "📋 Bundle error details:"
    echo "----------------------------------------"
    # Extract the error message from the bundle JSON
    head -5 "$BUNDLE_OUTPUT" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message','unknown'))" 2>/dev/null \
      || head -20 "$BUNDLE_OUTPUT"
    echo "----------------------------------------"
    rm -f "$BUNDLE_OUTPUT"
    exit 1
  fi

  print_success "Bundle served successfully (${BUNDLE_SIZE} bytes, platform: ${PLATFORM})"
  rm -f "$BUNDLE_OUTPUT"
  print_success "🎉 Bundle health check PASSED - safe to run Maestro tests!"
  exit 0
else
  print_error "Metro returned HTTP ${HTTP_CODE} for ${PLATFORM} bundle"
  echo ""
  echo "📋 Response details:"
  echo "----------------------------------------"
  head -20 "$BUNDLE_OUTPUT" 2>/dev/null || echo "(empty response)"
  echo "----------------------------------------"
  rm -f "$BUNDLE_OUTPUT"
  exit 1
fi