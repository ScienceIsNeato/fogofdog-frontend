#!/bin/bash

# Integration Test Runner - Ensures app readiness before running Maestro tests

set -e

if [ $# -eq 0 ]; then
    echo "Usage: $0 <test-file>"
    echo "Example: $0 .maestro/background-gps-test.yaml"
    exit 1
fi

TEST_FILE="$1"

if [ ! -f "$TEST_FILE" ]; then
    echo "Error: Test file '$TEST_FILE' not found"
    exit 1
fi

echo "🔍 Running app readiness check..."
./scripts/bundle-check.sh

echo "🎭 Starting integration test: $TEST_FILE"
maestro test "$TEST_FILE" 