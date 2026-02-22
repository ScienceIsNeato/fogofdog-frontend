#!/usr/bin/env bash
# CI-only script: Called from the android-emulator-runner action.
# Installs the APK, starts Metro, runs Maestro integration tests.
#
# Extracted from inline YAML to avoid sh/Dash multiline parsing issues
# (the emulator-runner action runs scripts via /usr/bin/sh -c on Ubuntu).
set -euo pipefail

##############################################################################
# 1. Find and install the APK (self-contained — no cross-step env vars)
##############################################################################
APK_PATH=$(find "$GITHUB_WORKSPACE/android/app/build/outputs/apk" -name '*.apk' -type f | head -1)
if [ -z "$APK_PATH" ]; then
  echo "❌ No APK found! Searching all of android/ for .apk files:"
  find "$GITHUB_WORKSPACE/android" -name '*.apk' -type f 2>/dev/null || echo "(none)"
  exit 1
fi
echo "📱 Installing APK: $APK_PATH"
adb install -r "$APK_PATH"

##############################################################################
# 2. Start Metro bundler in background
##############################################################################
npx expo start --dev-client --no-dev --minify &
METRO_PID=$!

##############################################################################
# 3. Wait for Metro to be ready (fail explicitly on timeout)
##############################################################################
echo "⏳ Waiting for Metro bundler..."
METRO_READY=false
for i in $(seq 1 60); do
  if curl -s http://localhost:8081/status 2>/dev/null | grep -q "packager-status:running"; then
    echo "✅ Metro is ready"
    METRO_READY=true
    break
  fi
  sleep 2
done
if [ "$METRO_READY" != "true" ]; then
  echo "❌ Metro failed to start within 120s"
  kill "$METRO_PID" 2>/dev/null || true
  exit 1
fi

##############################################################################
# 4. Run integration tests
##############################################################################
TEST_EXIT=0
./scripts/run_integration_tests.sh --platform android --no-window || TEST_EXIT=$?

##############################################################################
# 5. Cleanup
##############################################################################
kill "$METRO_PID" 2>/dev/null || true

exit $TEST_EXIT
