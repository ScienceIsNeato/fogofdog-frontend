#!/bin/bash

# Integration Test Runner - Ensures app is running before executing Maestro tests
# Captures Metro console logs and saves them as test artifacts
# Includes visual regression testing using SSIM comparison

set -e

# Parse command line arguments
CREATE_REFERENCE=false
TEST_FILE=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --create-reference)
            CREATE_REFERENCE=true
            shift
            ;;
        *)
            if [ -z "$TEST_FILE" ]; then
                TEST_FILE="$1"
            else
                echo "Error: Multiple test files specified"
                exit 1
            fi
            shift
            ;;
    esac
done

if [ -z "$TEST_FILE" ]; then
    echo "Usage: $0 [--create-reference] <test-file>"
    echo "Example: $0 .maestro/background-gps-test.yaml"
    echo "         $0 --create-reference .maestro/smoke-test.yaml"
    exit 1
fi

if [ ! -f "$TEST_FILE" ]; then
    echo "Error: Test file '$TEST_FILE' not found"
    exit 1
fi

# --- Start: Environment Validation ---

# 1. Define App Bundle ID
APP_BUNDLE_ID="com.fogofdog.app"

# 2. Define target simulator (from .detoxrc.js - known working config)
TARGET_DEVICE="iPhone 15 Pro"
TARGET_RUNTIME="iOS 18.4"

# 3. Check for existing booted device first
BOOTED_DEVICE_UDID=$(xcrun simctl list devices | grep "Booted" | awk -F'[()]' '{print $2}' | head -1)

if [ -n "$BOOTED_DEVICE_UDID" ]; then
    echo "✅ Simulator already running (Device UDID: $BOOTED_DEVICE_UDID)."
else
    # 4. Find the target device UDID
    echo "🔍 Looking for $TARGET_DEVICE simulator..."
    DEVICE_UDID=$(xcrun simctl list devices | grep "$TARGET_DEVICE" | grep -v "unavailable" | head -1 | awk -F'[()]' '{print $2}')
    
    if [ -z "$DEVICE_UDID" ]; then
        echo "❌ $TARGET_DEVICE not found. Available devices:"
        xcrun simctl list devices | grep "iPhone"
        exit 1
    fi
    
    # 5. Boot the specific simulator
    echo "🚀 Booting $TARGET_DEVICE (UDID: $DEVICE_UDID)..."
    xcrun simctl boot "$DEVICE_UDID"
    
    # 6. Wait for boot to complete
    echo "⏳ Waiting for simulator to boot..."
    TIMEOUT=30
    ELAPSED=0
    
    while [ $ELAPSED -lt $TIMEOUT ]; do
        BOOTED_DEVICE_UDID=$(xcrun simctl list devices | grep "Booted" | awk -F'[()]' '{print $2}' | head -1)
        if [ -n "$BOOTED_DEVICE_UDID" ]; then
            echo "✅ Simulator is running (Device UDID: $BOOTED_DEVICE_UDID)."
            break
        fi
        sleep 2
        ELAPSED=$((ELAPSED + 2))
    done
    
    if [ -z "$BOOTED_DEVICE_UDID" ]; then
        echo "❌ Failed to boot simulator after ${TIMEOUT}s."
        exit 1
    fi
    
    # 7. Open Simulator app
    open -a Simulator
    sleep 3
fi

# 5. Check if the app is installed
if ! xcrun simctl appinfo "$BOOTED_DEVICE_UDID" "$APP_BUNDLE_ID" > /dev/null 2>&1; then
    echo "❌ App '$APP_BUNDLE_ID' is not installed on the booted simulator."
    echo "👉 Please run './scripts/setup-e2e-tests.sh' first to install the correct build."
    exit 1
fi

# --- End: Environment Validation ---

echo "🔍 Running app readiness check (refreshes Metro and validates bundle)..."
./scripts/bundle-check.sh

# --- App Launch ---
echo "📲 Launching app '$APP_BUNDLE_ID'..."
xcrun simctl launch "$BOOTED_DEVICE_UDID" "$APP_BUNDLE_ID"
echo "⏳ Waiting for app to launch and connect to Metro..."
sleep 5 # Give the app time to connect

# Create test artifacts directory
TIMESTAMP=$(date +"%Y-%m-%d_%H%M%S")
ARTIFACTS_DIR="test_artifacts/integration_${TIMESTAMP}"
mkdir -p "$ARTIFACTS_DIR"

# Set Maestro output directory to our artifacts directory
export MAESTRO_OUTPUT_DIR="$PWD/$ARTIFACTS_DIR"

echo "📱 Capturing Metro console logs..."
# Find the most recent Metro log file
METRO_LOG=$(ls -t /tmp/metro_console_*.log 2>/dev/null | head -1)

echo "🎭 Starting integration test: $TEST_FILE"
echo "📸 Screenshots will be saved to: $ARTIFACTS_DIR"

# Run the test and capture exit code
if maestro test "$TEST_FILE"; then
    MAESTRO_RESULT="PASSED"
    MAESTRO_EXIT_CODE=0
else
    MAESTRO_RESULT="FAILED"
    MAESTRO_EXIT_CODE=1
fi

# Move any screenshots from current directory to artifacts directory
# Handle both .png and .png.png files
if find . -maxdepth 1 \( -name "*.png" -o -name "*.png.png" \) | grep -q .; then
    echo "📸 Moving screenshots to artifacts directory..."
    
    # Process .png files
    for file in *.png; do
        if [ -f "$file" ]; then
            mv "$file" "$ARTIFACTS_DIR/"
            echo "  Moved: $file"
        fi
    done
    
    # Process .png.png files (if any exist)
    for file in *.png.png; do
        if [ -f "$file" ]; then
            # Fix .png.png duplication by removing the extra .png
            new_name="${file%.png}"
            mv "$file" "$ARTIFACTS_DIR/$new_name"
            echo "  Moved and renamed: $file → $new_name"
        fi
    done
fi

echo "📋 Analyzing console logs for critical errors..."

# Copy Metro console logs if available
if [ -n "$METRO_LOG" ] && [ -f "$METRO_LOG" ]; then
    cp "$METRO_LOG" "$ARTIFACTS_DIR/metro_console.log"
    echo "Metro console logs saved to: $ARTIFACTS_DIR/metro_console.log"

    # Check for critical runtime errors that should fail the test
    CRITICAL_ERRORS_FOUND=false

    # Check for actual ERROR level logs (not WARN logs that contain "error" in message)
    if grep "ERROR \[" "$METRO_LOG" > "$ARTIFACTS_DIR/console_errors.log"; then
        echo "❌ CRITICAL: Console errors detected!"
        echo "Console errors found:"
        cat "$ARTIFACTS_DIR/console_errors.log"
        CRITICAL_ERRORS_FOUND=true
    fi

    # Check for warnings (log but don't fail) - filter out benign Metro warnings
    if grep -i "WARN" "$METRO_LOG" | grep -v "Bundler cache is empty, rebuilding" > "$ARTIFACTS_DIR/console_warnings.log"; then
        # Only report warnings if there are any after filtering
        if [ -s "$ARTIFACTS_DIR/console_warnings.log" ]; then
            echo "⚠️  Console warnings detected - saved to: $ARTIFACTS_DIR/console_warnings.log"
        else
            echo "✅ Only benign Metro warnings detected (filtered out)"
            rm "$ARTIFACTS_DIR/console_warnings.log"  # Clean up empty file
        fi
    else
        echo "✅ No significant console warnings detected"
    fi

    # Determine final test result
    if [ "$CRITICAL_ERRORS_FOUND" = true ]; then
        TEST_RESULT="FAILED"
        EXIT_CODE=1
        echo ""
        echo "🚨 TEST FAILED: Critical runtime errors detected even though Maestro test passed"
        echo "🔍 Check console_errors.log for details"
    elif [ "$MAESTRO_EXIT_CODE" -eq 0 ]; then
        TEST_RESULT="PASSED"
        EXIT_CODE=0
        echo "✅ No critical errors detected in Metro logs"
    else
        TEST_RESULT="FAILED"
        EXIT_CODE=1
    fi
else
    echo "⚠️  No Metro console logs found"
    TEST_RESULT="$MAESTRO_RESULT"
    EXIT_CODE="$MAESTRO_EXIT_CODE"
fi

# Copy Maestro test artifacts if they exist
MAESTRO_TEST_DIR=$(find ~/.maestro/tests -name "*$(date +%Y-%m-%d)*" -type d | tail -1)
if [ -n "$MAESTRO_TEST_DIR" ] && [ -d "$MAESTRO_TEST_DIR" ]; then
    cp -r "$MAESTRO_TEST_DIR"/* "$ARTIFACTS_DIR/" 2>/dev/null || true
    echo "Maestro test artifacts copied to: $ARTIFACTS_DIR/"
fi

# Visual regression testing (only if Maestro test passed)
VISUAL_REGRESSION_RESULT="SKIPPED"
if [ "$MAESTRO_EXIT_CODE" -eq 0 ] && [ "$CRITICAL_ERRORS_FOUND" = false ]; then
    echo ""
    echo "🖼️  Running visual regression testing..."
    
    # Extract test name from file path for screenshot naming
    TEST_NAME=$(basename "$TEST_FILE" .yaml)
    FINAL_SCREENSHOT="$ARTIFACTS_DIR/${TEST_NAME}-final.png"
    REFERENCE_SCREENSHOT="test_data/reference_screenshots/${TEST_NAME}-final.png"
    
    # Find the final screenshot (look for common final screenshot patterns)
    ACTUAL_FINAL_SCREENSHOT=""
    for pattern in "*final*.png" "*after-restart*.png" "*complete*.png"; do
        FOUND_SCREENSHOT=$(find "$ARTIFACTS_DIR" -name "$pattern" | head -1)
        if [ -n "$FOUND_SCREENSHOT" ]; then
            ACTUAL_FINAL_SCREENSHOT="$FOUND_SCREENSHOT"
            break
        fi
    done
    
    # If no final screenshot found, use the last screenshot taken
    if [ -z "$ACTUAL_FINAL_SCREENSHOT" ]; then
        ACTUAL_FINAL_SCREENSHOT=$(find "$ARTIFACTS_DIR" -name "*.png" | tail -1)
    fi
    
    if [ -n "$ACTUAL_FINAL_SCREENSHOT" ]; then
        # Copy the final screenshot to a standardized name
        cp "$ACTUAL_FINAL_SCREENSHOT" "$FINAL_SCREENSHOT"
        echo "📸 Final screenshot: $(basename "$ACTUAL_FINAL_SCREENSHOT")"
        
        if [ "$CREATE_REFERENCE" = true ]; then
            # Create reference screenshot
            mkdir -p "test_data/reference_screenshots"
            cp "$FINAL_SCREENSHOT" "$REFERENCE_SCREENSHOT"
            echo "✅ Reference screenshot created: $REFERENCE_SCREENSHOT"
            VISUAL_REGRESSION_RESULT="REFERENCE_CREATED"
        elif [ -f "$REFERENCE_SCREENSHOT" ]; then
            # Compare with reference using SSIM
            echo "🔍 Comparing with reference screenshot..."
            
            # Extract SSIM value using ffmpeg
            SSIM_OUTPUT=$(ffmpeg -i "$FINAL_SCREENSHOT" -i "$REFERENCE_SCREENSHOT" -lavfi ssim -f null - 2>&1 | grep "All:" | awk '{print $4}' || echo "0.0")
            
            if [ -n "$SSIM_OUTPUT" ] && [ "$SSIM_OUTPUT" != "0.0" ]; then
                # Use bc for floating point comparison
                SSIM_THRESHOLD="0.98"
                if command -v bc >/dev/null 2>&1; then
                    SSIM_PASS=$(echo "$SSIM_OUTPUT > $SSIM_THRESHOLD" | bc -l)
                else
                    # Fallback for systems without bc
                    SSIM_PASS=$(awk "BEGIN {print ($SSIM_OUTPUT > $SSIM_THRESHOLD) ? 1 : 0}")
                fi
                
                echo "📊 SSIM Score: $SSIM_OUTPUT (threshold: $SSIM_THRESHOLD)"
                
                if [ "$SSIM_PASS" -eq 1 ]; then
                    echo "✅ Visual regression test PASSED"
                    VISUAL_REGRESSION_RESULT="PASSED"
                else
                    echo "❌ Visual regression test FAILED"
                    VISUAL_REGRESSION_RESULT="FAILED"
                    
                    # Create diff image for debugging
                    DIFF_IMAGE="$ARTIFACTS_DIR/visual_diff.png"
                    if command -v ffmpeg >/dev/null 2>&1; then
                        ffmpeg -i "$REFERENCE_SCREENSHOT" -i "$FINAL_SCREENSHOT" -lavfi "[0:v][1:v]blend=all_mode=difference" -y "$DIFF_IMAGE" 2>/dev/null || true
                        if [ -f "$DIFF_IMAGE" ]; then
                            echo "🔍 Visual diff saved to: visual_diff.png"
                        fi
                    fi
                    
                    # Update test result if visual regression failed
                    if [ "$TEST_RESULT" = "PASSED" ]; then
                        TEST_RESULT="FAILED"
                        EXIT_CODE=1
                    fi
                fi
            else
                echo "⚠️  Could not extract SSIM value from ffmpeg output"
                VISUAL_REGRESSION_RESULT="ERROR"
            fi
        else
            echo "⚠️  No reference screenshot found. Run with --create-reference to create one."
            VISUAL_REGRESSION_RESULT="NO_REFERENCE"
        fi
    else
        echo "⚠️  No final screenshot found in test artifacts"
        VISUAL_REGRESSION_RESULT="NO_SCREENSHOT"
    fi
else
    echo "⏭️  Skipping visual regression testing (Maestro test failed or critical errors found)"
fi

# Create test summary
cat > "$ARTIFACTS_DIR/test_summary.txt" << EOF
Integration Test Summary
========================
Test File: $TEST_FILE
Timestamp: $TIMESTAMP
Maestro Result: $MAESTRO_RESULT
Visual Regression Result: $VISUAL_REGRESSION_RESULT
Final Result: $TEST_RESULT
Exit Code: $EXIT_CODE
Critical Errors Found: $CRITICAL_ERRORS_FOUND
Create Reference Mode: $CREATE_REFERENCE

Artifacts Location: $ARTIFACTS_DIR
EOF

echo ""
echo "🎯 Integration test completed: $TEST_RESULT"
echo "📁 Test artifacts saved to: $ARTIFACTS_DIR"

# Exit with the final result (fails if critical errors found)
exit $EXIT_CODE 