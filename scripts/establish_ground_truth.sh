#!/bin/bash

# Ground Truth Establishment Script
# Parses @checkpoint / @description annotations from Maestro YAML tests and
# builds a manifest JSON that maps each screenshot checkpoint to a reference
# image. The manifest is consumed by run_integration_tests.sh for visual
# regression via SSIM comparison.
#
# This script runs AFTER a clean Maestro test pass (not during). It reads
# the screenshots Maestro captured and asks the user to accept/reject each
# one as the ground truth reference.
#
# Usage:
#   ./scripts/establish_ground_truth.sh <test-yaml> [--artifacts-dir <dir>]
#
# Examples:
#   # Uses most recent local artifacts for smoke-test
#   ./scripts/establish_ground_truth.sh .maestro/smoke-test.yaml
#
#   # Explicit artifacts directory
#   ./scripts/establish_ground_truth.sh .maestro/smoke-test.yaml \
#       --artifacts-dir test_artifacts/local/android/smoke-test
#
# What it does:
#   1. Parses @checkpoint / @description annotations from the YAML
#   2. Locates screenshots in the artifacts directory
#   3. Shows each screenshot with its description (opens in Preview/xdg-open)
#   4. Prompts user to accept (Y/n) each checkpoint as ground truth
#   5. Copies accepted screenshots to test_data/ground_truth/
#   6. Writes the manifest JSON to test_data/ground_truth/{test-name}.json
#
# The manifest format:
#   {
#     "test": "smoke-test",
#     "platform": "android",
#     "created": "2026-02-20T12:34:56Z",
#     "checkpoints": [
#       {
#         "name": "01-map-loaded",
#         "description": "MapScreen visible after fresh launch...",
#         "reference": "smoke-test/01-map-loaded-reference.png",
#         "threshold": 0.90
#       }
#     ]
#   }

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
cd "$PROJECT_DIR"

GROUND_TRUTH_DIR="test_data/ground_truth"
DEFAULT_THRESHOLD="0.90"

# =============================================================================
# Helpers
# =============================================================================

log() {
    echo "[ground-truth] $1"
}

die() {
    log "❌ $1"
    exit 1
}

# Open an image for the user to view. Cross-platform.
show_image() {
    local path="$1"
    if [[ "$(uname)" == "Darwin" ]]; then
        open -a Preview "$path" 2>/dev/null || open "$path" 2>/dev/null || true
    elif command -v xdg-open >/dev/null 2>&1; then
        xdg-open "$path" 2>/dev/null || true
    else
        log "  (cannot open image viewer — inspect manually: $path)"
    fi
}

# =============================================================================
# Parse command line
# =============================================================================

TEST_YAML=""
ARTIFACTS_DIR=""
PLATFORM=""

while [[ $# -gt 0 ]]; do
    case $1 in
        --help|-h)
            echo "Usage: $0 <test.yaml> [--artifacts-dir <dir>] [--platform ios|android]"
            echo ""
            echo "Establishes ground truth screenshots for visual regression testing."
            echo ""
            echo "Options:"
            echo "  --artifacts-dir <dir>   Path to Maestro output for this test"
            echo "  --platform <p>          Platform (android|ios) — auto-detected from artifacts"
            echo ""
            echo "The test YAML must contain @checkpoint / @description annotations."
            exit 0
            ;;
        --artifacts-dir)
            ARTIFACTS_DIR="$2"
            shift 2
            ;;
        --platform)
            PLATFORM="$2"
            shift 2
            ;;
        *)
            TEST_YAML="$1"
            shift
            ;;
    esac
done

if [ -z "$TEST_YAML" ]; then
    die "No test YAML specified. Usage: $0 <test.yaml>"
fi

if [ ! -f "$TEST_YAML" ]; then
    die "Test file not found: $TEST_YAML"
fi

TEST_NAME=$(basename "$TEST_YAML" .yaml)

# =============================================================================
# Auto-detect artifacts directory
# =============================================================================

if [ -z "$ARTIFACTS_DIR" ]; then
    # Try local artifacts — check both platforms, prefer the most recent
    local_android="test_artifacts/local/android/$TEST_NAME"
    local_ios="test_artifacts/local/ios/$TEST_NAME"
    ci_android="test_artifacts/ci/android/$TEST_NAME"
    ci_ios="test_artifacts/ci/ios/$TEST_NAME"

    # Find the most recently modified one
    best=""
    best_mtime=0
    for candidate in "$local_android" "$local_ios" "$ci_android" "$ci_ios"; do
        if [ -d "$candidate" ]; then
            mtime=$(stat -f %m "$candidate" 2>/dev/null || stat -c %Y "$candidate" 2>/dev/null || echo 0)
            if [ "$mtime" -gt "$best_mtime" ]; then
                best="$candidate"
                best_mtime="$mtime"
            fi
        fi
    done

    if [ -z "$best" ]; then
        die "No artifacts found for $TEST_NAME. Run the test first:\n  ./scripts/run_integration_tests.sh $TEST_YAML"
    fi

    ARTIFACTS_DIR="$best"
    log "Auto-detected artifacts: $ARTIFACTS_DIR"
fi

if [ ! -d "$ARTIFACTS_DIR" ]; then
    die "Artifacts directory not found: $ARTIFACTS_DIR"
fi

# Auto-detect platform from path
if [ -z "$PLATFORM" ]; then
    if [[ "$ARTIFACTS_DIR" == *"/android/"* ]]; then
        PLATFORM="android"
    elif [[ "$ARTIFACTS_DIR" == *"/ios/"* ]]; then
        PLATFORM="ios"
    else
        PLATFORM="unknown"
    fi
fi

# =============================================================================
# Parse @checkpoint / @description annotations from the YAML
# =============================================================================

parse_checkpoints() {
    local yaml_file="$1"

    # State machine: collect @checkpoint, then multi-line @description,
    # then expect a takeScreenshot command.
    local current_name=""
    local current_desc=""
    local in_description=false

    while IFS= read -r line; do
        # Strip leading whitespace for pattern matching
        local trimmed="${line#"${line%%[![:space:]]*}"}"

        if [[ "$trimmed" =~ ^#\ @checkpoint:\ (.+) ]]; then
            # Emit previous checkpoint if we have one
            if [ -n "$current_name" ]; then
                echo "CHECKPOINT:${current_name}:${current_desc}"
            fi
            current_name="${BASH_REMATCH[1]}"
            current_desc=""
            in_description=false
        elif [[ "$trimmed" =~ ^#\ @description:\ (.+) ]]; then
            current_desc="${BASH_REMATCH[1]}"
            in_description=true
        elif [ "$in_description" = true ] && [[ "$trimmed" =~ ^#\ \ \ (.+) ]]; then
            # Continuation line of @description (indented with 2 extra spaces after #)
            current_desc="${current_desc} ${BASH_REMATCH[1]}"
        elif [[ "$trimmed" =~ ^-\ takeScreenshot: ]]; then
            in_description=false
            # takeScreenshot encountered — checkpoint is complete
        else
            in_description=false
        fi
    done < "$yaml_file"

    # Emit the last one
    if [ -n "$current_name" ]; then
        echo "CHECKPOINT:${current_name}:${current_desc}"
    fi
}

# Read checkpoints into arrays
CHECKPOINT_NAMES=()
CHECKPOINT_DESCS=()

while IFS= read -r checkpoint_line; do
    if [[ "$checkpoint_line" =~ ^CHECKPOINT:([^:]+):(.*)$ ]]; then
        CHECKPOINT_NAMES+=("${BASH_REMATCH[1]}")
        CHECKPOINT_DESCS+=("${BASH_REMATCH[2]}")
    fi
done < <(parse_checkpoints "$TEST_YAML")

if [ ${#CHECKPOINT_NAMES[@]} -eq 0 ]; then
    die "No @checkpoint annotations found in $TEST_YAML"
fi

log "Found ${#CHECKPOINT_NAMES[@]} checkpoints in $TEST_YAML"
for (( i=0; i<${#CHECKPOINT_NAMES[@]}; i++ )); do
    log "  ${CHECKPOINT_NAMES[$i]}: ${CHECKPOINT_DESCS[$i]:0:80}..."
done

# =============================================================================
# Review each checkpoint
# =============================================================================

mkdir -p "$GROUND_TRUTH_DIR/$TEST_NAME"

ACCEPTED=()
REJECTED=()

echo ""
echo "=============================================="
echo "  Ground Truth Review: $TEST_NAME ($PLATFORM)"
echo "=============================================="
echo ""

for (( i=0; i<${#CHECKPOINT_NAMES[@]}; i++ )); do
    name="${CHECKPOINT_NAMES[$i]}"
    desc="${CHECKPOINT_DESCS[$i]}"

    screenshot="$ARTIFACTS_DIR/${name}.png"
    if [ ! -f "$screenshot" ]; then
        log "⚠️  Screenshot not found: $screenshot"
        log "   Skipping checkpoint: $name"
        REJECTED+=("$name (missing)")
        continue
    fi

    echo "──────────────────────────────────────────────"
    echo "Checkpoint $((i+1))/${#CHECKPOINT_NAMES[@]}: $name"
    echo ""
    echo "Description:"
    echo "  $desc"
    echo ""
    echo "Screenshot: $screenshot"
    echo ""

    show_image "$screenshot"

    while true; do
        read -r -p "Accept as ground truth? [Y/n/s(kip)] " answer
        answer="${answer:-Y}"
        case "$answer" in
            [Yy]*)
                # Copy to ground truth directory
                cp "$screenshot" "$GROUND_TRUTH_DIR/$TEST_NAME/${name}-reference.png"
                ACCEPTED+=("$name")
                log "✅ Accepted: $name"
                break
                ;;
            [Nn]*)
                REJECTED+=("$name (rejected)")
                log "❌ Rejected: $name"
                break
                ;;
            [Ss]*)
                REJECTED+=("$name (skipped)")
                log "⏭️  Skipped: $name"
                break
                ;;
            *)
                echo "  Please answer Y (accept), N (reject), or S (skip)"
                ;;
        esac
    done
    echo ""
done

# =============================================================================
# Write manifest JSON
# =============================================================================

if [ ${#ACCEPTED[@]} -eq 0 ]; then
    log "No checkpoints accepted — manifest not written."
    exit 1
fi

MANIFEST="$GROUND_TRUTH_DIR/${TEST_NAME}.json"
CREATED=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Build JSON manually (works without jq for writing)
{
    echo "{"
    echo "  \"test\": \"$TEST_NAME\","
    echo "  \"platform\": \"$PLATFORM\","
    echo "  \"created\": \"$CREATED\","
    echo "  \"checkpoints\": ["

    for (( i=0; i<${#ACCEPTED[@]}; i++ )); do
        name="${ACCEPTED[$i]}"
        # Find the description for this checkpoint
        desc=""
        for (( j=0; j<${#CHECKPOINT_NAMES[@]}; j++ )); do
            if [ "${CHECKPOINT_NAMES[$j]}" = "$name" ]; then
                desc="${CHECKPOINT_DESCS[$j]}"
                break
            fi
        done
        # JSON-escape the description using Python for safe output
        json_desc="$(python3 -c 'import json, sys; print(json.dumps(sys.argv[1]))' "$desc")"

        if [ $i -gt 0 ]; then echo "    ,"; fi
        echo "    {"
        echo "      \"name\": \"$name\","
        echo "      \"description\": $json_desc,"
        echo "      \"reference\": \"$TEST_NAME/${name}-reference.png\","
        echo "      \"threshold\": $DEFAULT_THRESHOLD"
        echo "    }"
    done

    echo "  ]"
    echo "}"
} > "$MANIFEST"

echo ""
echo "=============================================="
echo "  Summary"
echo "=============================================="
echo ""
log "Accepted: ${#ACCEPTED[@]}/${#CHECKPOINT_NAMES[@]} checkpoints"
if [ ${#REJECTED[@]} -gt 0 ]; then
    log "Rejected/Skipped: ${REJECTED[*]}"
fi
echo ""
log "Manifest written: $MANIFEST"
log "Reference images: $GROUND_TRUTH_DIR/$TEST_NAME/"
echo ""
log "To add ROI regions, edit the manifest JSON manually:"
log "  Add \"roi\": {\"x\": 100, \"y\": 200, \"w\": 400, \"h\": 300} to any checkpoint."
echo ""
log "To update a single checkpoint, re-run this script after a new test pass."
