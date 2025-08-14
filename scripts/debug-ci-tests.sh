#!/bin/bash

echo "=== CI Test Debug Information ==="
echo "Date: $(date)"
echo "Node version: $(node --version)"
echo "NPM version: $(npm --version)"
echo "Jest version: $(npx jest --version)"
echo "Working directory: $(pwd)"
echo "Environment variables:"
echo "  CI: $CI"
echo "  NODE_ENV: $NODE_ENV"
echo "  GITHUB_ACTIONS: $GITHUB_ACTIONS"

echo ""
echo "=== Package.json test scripts ==="
grep -A 5 -B 5 '"test' package.json

echo ""
echo "=== Jest config check ==="
echo "Jest config file exists: $(test -f jest.config.js && echo 'YES' || echo 'NO')"
echo "Jest setup files:"
ls -la jest.*.js 2>/dev/null || echo "No jest setup files found"

echo ""
echo "=== Test file count ==="
find src -name "*.test.*" -o -name "__tests__" -type d | wc -l | xargs echo "Test files/directories found:"

echo ""
echo "=== Memory and disk space ==="
echo "Available memory:"
free -h 2>/dev/null || echo "free command not available"
echo "Disk space:"
df -h . 2>/dev/null || echo "df command not available"

echo ""
echo "=== Running test with maximum debugging ==="
echo "Starting Jest with full debugging..."

# Set environment variable for CI
export CI=true

# Run Jest with maximum debugging
npx jest --watchAll=false --passWithNoTests --forceExit --detectOpenHandles --verbose --no-cache --debug 2>&1 | tee jest-debug.log

echo ""
echo "=== Jest exit code: $? ==="
echo "Debug log saved to: jest-debug.log"

if [ -f jest-debug.log ]; then
    echo "Log file size: $(wc -l jest-debug.log)"
    echo "Last 20 lines of debug log:"
    tail -20 jest-debug.log
fi
