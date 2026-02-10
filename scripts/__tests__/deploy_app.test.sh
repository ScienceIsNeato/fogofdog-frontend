#!/bin/bash

# =============================================================================
# deploy_app.test.sh — Unit tests for deploy_app.sh
# =============================================================================
#
# Run these tests with:
#   cd scripts/__tests__ && ./deploy_app.test.sh
#
# Or via slop-mop:
#   sm validate shell:deploy-tests
#
# =============================================================================

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
DEPLOY_SCRIPT="$SCRIPT_DIR/../deploy_app.sh"

# Test counters
TESTS_RUN=0
TESTS_PASSED=0
TESTS_FAILED=0

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BOLD='\033[1m'
NC='\033[0m'

# =============================================================================
# Test helpers
# =============================================================================

test_start() {
    TESTS_RUN=$((TESTS_RUN + 1))
    echo -n "  [$TESTS_RUN] $1... "
}

test_pass() {
    TESTS_PASSED=$((TESTS_PASSED + 1))
    echo -e "${GREEN}PASS${NC}"
}

test_fail() {
    TESTS_FAILED=$((TESTS_FAILED + 1))
    echo -e "${RED}FAIL${NC}"
    echo -e "      ${RED}$1${NC}"
}

assert_exit_code() {
    local expected=$1
    local actual=$2
    local msg="${3:-}"
    if [ "$expected" != "$actual" ]; then
        test_fail "Expected exit code $expected, got $actual. $msg"
        return 1
    fi
    return 0
}

assert_output_contains() {
    local output="$1"
    local expected="$2"
    if ! echo "$output" | grep -q "$expected"; then
        test_fail "Output did not contain: $expected"
        return 1
    fi
    return 0
}

assert_output_not_contains() {
    local output="$1"
    local unexpected="$2"
    if echo "$output" | grep -q "$unexpected"; then
        test_fail "Output unexpectedly contained: $unexpected"
        return 1
    fi
    return 0
}

# =============================================================================
# Argument Parsing Tests
# =============================================================================

echo ""
echo -e "${BOLD}Testing Argument Parsing${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_start "Missing --device should fail"
output=$("$DEPLOY_SCRIPT" --mode development --data current 2>&1 || true)
if assert_output_contains "$output" "Missing --device"; then
    test_pass
fi

test_start "Missing --mode should fail"
output=$("$DEPLOY_SCRIPT" --device android --data current 2>&1 || true)
if assert_output_contains "$output" "Missing --mode"; then
    test_pass
fi

test_start "Missing --data should fail"
output=$("$DEPLOY_SCRIPT" --device android --mode development 2>&1 || true)
if assert_output_contains "$output" "Missing --data"; then
    test_pass
fi

test_start "Invalid --device value should fail"
output=$("$DEPLOY_SCRIPT" --device banana --mode development --data current 2>&1 || true)
if assert_output_contains "$output" "Invalid --device"; then
    test_pass
fi

test_start "Invalid --mode value should fail"
output=$("$DEPLOY_SCRIPT" --device android --mode banana --data current 2>&1 || true)
if assert_output_contains "$output" "Invalid --mode"; then
    test_pass
fi

test_start "Invalid --data value should fail"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data banana 2>&1 || true)
if assert_output_contains "$output" "Invalid --data"; then
    test_pass
fi

test_start "Unknown argument should fail"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data current --unknown 2>&1 || true)
if assert_output_contains "$output" "Unknown argument"; then
    test_pass
fi

test_start "--help should show usage and exit 0"
output=$("$DEPLOY_SCRIPT" --help 2>&1)
exit_code=$?
if [ $exit_code -eq 0 ] && echo "$output" | grep -qi "usage:"; then
    test_pass
else
    test_fail "Expected exit 0 and usage text"
fi

# =============================================================================
# Dry Run Tests
# =============================================================================

echo ""
echo -e "${BOLD}Testing Dry Run Mode${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_start "--dry-run should show DRY RUN banner"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data current --dry-run 2>&1 || true)
if assert_output_contains "$output" "DRY RUN"; then
    test_pass
fi

test_start "--dry-run should show '[DRY RUN] Would execute'"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data current --dry-run 2>&1 || true)
if assert_output_contains "$output" "\[DRY RUN\] Would execute"; then
    test_pass
fi

test_start "--dry-run should not write to .deployment_history"
history_before=""
if [ -f "$SCRIPT_DIR/../../.deployment_history" ]; then
    history_before=$(cat "$SCRIPT_DIR/../../.deployment_history")
fi
"$DEPLOY_SCRIPT" --device android --mode development --data current --dry-run 2>&1 || true
history_after=""
if [ -f "$SCRIPT_DIR/../../.deployment_history" ]; then
    history_after=$(cat "$SCRIPT_DIR/../../.deployment_history")
fi
if [ "$history_before" = "$history_after" ]; then
    test_pass
else
    test_fail ".deployment_history was modified during dry run"
fi

# =============================================================================
# Banner and Output Tests
# =============================================================================

echo ""
echo -e "${BOLD}Testing Output Format${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_start "Banner should show device type"
output=$("$DEPLOY_SCRIPT" --device ios --mode development --data current --dry-run 2>&1 || true)
if assert_output_contains "$output" "Device:.*ios"; then
    test_pass
fi

test_start "Banner should show mode"
output=$("$DEPLOY_SCRIPT" --device android --mode release --data current --dry-run 2>&1 || true)
if assert_output_contains "$output" "Mode:.*release"; then
    test_pass
fi

test_start "Banner should show timeout"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data current --dry-run 2>&1 || true)
if assert_output_contains "$output" "Timeout:.*600s"; then
    test_pass
fi

# =============================================================================
# GPS Injection Command Tests
# =============================================================================

echo ""
echo -e "${BOLD}Testing Actionable Output${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_start "Android deploy should show 'adb emu geo fix' command"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data current --dry-run 2>&1 || true)
if assert_output_contains "$output" "adb emu geo fix"; then
    test_pass
fi

test_start "iOS deploy should show 'xcrun simctl location' command"
output=$("$DEPLOY_SCRIPT" --device ios --mode development --data current --dry-run 2>&1 || true)
if assert_output_contains "$output" "xcrun simctl location"; then
    test_pass
fi

test_start "Development mode should show log tail command"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data current --dry-run 2>&1 || true)
if assert_output_contains "$output" "Tail logs"; then
    test_pass
fi

test_start "Development mode should show Stop Metro command"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data current --dry-run 2>&1 || true)
if assert_output_contains "$output" "Stop Metro"; then
    test_pass
fi

# =============================================================================
# Step Skip Logic Tests
# =============================================================================

echo ""
echo -e "${BOLD}Testing Minimal Steps Logic${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"

test_start "--skip-gps should skip GPS setup"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data current --skip-gps --dry-run 2>&1 || true)
if assert_output_contains "$output" "Skipped (--skip-gps)"; then
    test_pass
fi

test_start "data=current should preserve app data"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data current --dry-run 2>&1 || true)
if assert_output_contains "$output" "Keeping current app data"; then
    test_pass
fi

test_start "data=fresh-install should clear app data step"
output=$("$DEPLOY_SCRIPT" --device android --mode development --data fresh-install --dry-run 2>&1 || true)
if assert_output_contains "$output" "Clear app data"; then
    test_pass
fi

# =============================================================================
# Summary
# =============================================================================

echo ""
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo -e "${BOLD}Test Summary${NC}"
echo -e "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo -e "  Total:  $TESTS_RUN"
echo -e "  Passed: ${GREEN}$TESTS_PASSED${NC}"
echo -e "  Failed: ${RED}$TESTS_FAILED${NC}"
echo ""

if [ $TESTS_FAILED -gt 0 ]; then
    echo -e "${RED}Some tests failed!${NC}"
    exit 1
else
    echo -e "${GREEN}All tests passed!${NC}"
    exit 0
fi
