#!/usr/bin/env bash
# =============================================================================
# Native fingerprinting & clean prebuild detection for deploy_app.sh
# Sourced (not executed) — requires deploy_app.sh variables/helpers in scope.
# =============================================================================

# =============================================================================
# Native code fingerprinting (detect stale builds)
# =============================================================================

# =============================================================================
# Pod sync detection (iOS only)
# =============================================================================
# NOTE: Manual 'pod install' was removed in RN 0.81+ migration.
# 'expo run:ios' handles pod installation internally as part of its build
# pipeline. Calling 'pod install' directly triggers a deprecation warning
# and duplicates work that Expo already does.
# See: https://reactnative.dev/blog - CocoaPods → Swift Package Manager migration

# Files that indicate native code has changed and requires rebuild
# Changes to these files mean the installed app is "dirty" even if present
NATIVE_FINGERPRINT_FILES_IOS=(
    "ios/Podfile.lock"
    "ios/FogOfDog/Info.plist"
    "ios/FogOfDog.xcodeproj/project.pbxproj"
    "package.json"
    "app.json"
    "app.config.js"
)

NATIVE_FINGERPRINT_FILES_ANDROID=(
    "android/app/build.gradle"
    "android/build.gradle"
    "android/gradle.properties"
    "android/settings.gradle"
    "package.json"
    "app.json"
    "app.config.js"
)

# Where we store the fingerprint of the last successful build.
# Includes mode (debug/release) because they produce different binaries.
FINGERPRINT_FILE_IOS="$PROJECT_DIR/.native-fingerprint-ios"
FINGERPRINT_FILE_ANDROID="$PROJECT_DIR/.native-fingerprint-android"

# Expo config files that drive native project generation (storyboard, Info.plist,
# asset catalogs, etc.). Changes to these require a CLEAN prebuild — incremental
# prebuild won't regenerate stale native artifacts like SplashScreen.storyboard.
EXPO_CONFIG_FILES=("app.json" "app.config.js")

# Separate fingerprint for clean-prebuild tracking
PREBUILD_FINGERPRINT_IOS="$PROJECT_DIR/.prebuild-fingerprint-ios"
PREBUILD_FINGERPRINT_ANDROID="$PROJECT_DIR/.prebuild-fingerprint-android"

# Compute a fingerprint of native code files
compute_native_fingerprint() {
    local device="$1"
    local files_to_hash=()

    case "$device" in
        ios)
            files_to_hash=("${NATIVE_FINGERPRINT_FILES_IOS[@]}")
            ;;
        android)
            files_to_hash=("${NATIVE_FINGERPRINT_FILES_ANDROID[@]}")
            ;;
    esac

    # Hash all the files that exist, sorted for consistency
    # Include MODE so Debug→Release (or vice versa) triggers a rebuild
    local hash_input="mode:${MODE}\n"
    for file in "${files_to_hash[@]}"; do
        local full_path="$PROJECT_DIR/$file"
        if [ -f "$full_path" ]; then
            # Include file path and content hash
            hash_input+="$file:$(md5 -q "$full_path" 2>/dev/null || md5sum "$full_path" 2>/dev/null | cut -d' ' -f1)\n"
        fi
    done
    
    # Return a single hash of all the file hashes
    echo -n "$hash_input" | md5 -q 2>/dev/null || echo -n "$hash_input" | md5sum | cut -d' ' -f1
}

# Get the stored fingerprint from last successful build
get_stored_fingerprint() {
    local device="$1"
    local fingerprint_file

    case "$device" in
        ios)     fingerprint_file="$FINGERPRINT_FILE_IOS" ;;
        android) fingerprint_file="$FINGERPRINT_FILE_ANDROID" ;;
    esac

    if [ -f "$fingerprint_file" ]; then
        local first_line
        first_line=$(head -1 "$fingerprint_file")
        # Support new format (composite:HASH) and old format (just HASH)
        if [[ "$first_line" == composite:* ]]; then
            echo "${first_line#composite:}"
        else
            echo "$first_line"
        fi
    else
        echo "" # No stored fingerprint = always dirty
    fi
}

# Save the current fingerprint after successful build
# New format stores per-file detail for change diagnostics:
#   Line 1: composite:<hash>         (quick dirty check)
#   Line 2: mode:<build_mode>        (debug/release switch detection)
#   Line 3+: <file>:<hash>           (per-file change tracking)
save_native_fingerprint() {
    local device="$1"
    local fingerprint_file

    case "$device" in
        ios)     fingerprint_file="$FINGERPRINT_FILE_IOS" ;;
        android) fingerprint_file="$FINGERPRINT_FILE_ANDROID" ;;
    esac

    local composite
    composite=$(compute_native_fingerprint "$device")

    local files_to_hash=()
    case "$device" in
        ios)     files_to_hash=("${NATIVE_FINGERPRINT_FILES_IOS[@]}") ;;
        android) files_to_hash=("${NATIVE_FINGERPRINT_FILES_ANDROID[@]}") ;;
    esac

    {
        echo "composite:$composite"
        echo "mode:${MODE}"
        for file in "${files_to_hash[@]}"; do
            local full_path="$PROJECT_DIR/$file"
            if [ -f "$full_path" ]; then
                local file_hash
                file_hash=$(md5 -q "$full_path" 2>/dev/null || md5sum "$full_path" 2>/dev/null | cut -d' ' -f1)
                echo "$file:$file_hash"
            fi
        done
    } > "$fingerprint_file"
}

# Check if native code is dirty (changed since last build)
is_native_dirty() {
    local device="$1"
    local current_fingerprint
    local stored_fingerprint

    current_fingerprint=$(compute_native_fingerprint "$device")
    stored_fingerprint=$(get_stored_fingerprint "$device")

    if [ -z "$stored_fingerprint" ]; then
        # No stored fingerprint = never built or fingerprint cleared
        return 0  # dirty
    fi

    if [ "$current_fingerprint" != "$stored_fingerprint" ]; then
        return 0  # dirty
    fi

    return 1  # clean
}

# Report which native files changed since last build.
# Called after is_native_dirty() returns true for user-facing diagnostics.
# Shows exactly WHY a rebuild is needed instead of just "native code changed".
report_native_changes() {
    local device="$1"
    local fingerprint_file

    case "$device" in
        ios)     fingerprint_file="$FINGERPRINT_FILE_IOS" ;;
        android) fingerprint_file="$FINGERPRINT_FILE_ANDROID" ;;
    esac

    if [ ! -f "$fingerprint_file" ]; then
        info "No previous build fingerprint — first build for this device/mode"
        return
    fi

    # Old format (single hash, no detail) — can't diff, just say "upgraded"
    local first_line
    first_line=$(head -1 "$fingerprint_file")
    if [[ "$first_line" != composite:* ]]; then
        info "Fingerprint format upgraded — cannot determine specific changes"
        return
    fi

    local files_to_hash=()
    case "$device" in
        ios)     files_to_hash=("${NATIVE_FINGERPRINT_FILES_IOS[@]}") ;;
        android) files_to_hash=("${NATIVE_FINGERPRINT_FILES_ANDROID[@]}") ;;
    esac

    # Check for mode change
    local stored_mode
    stored_mode=$(grep "^mode:" "$fingerprint_file" 2>/dev/null | head -1)
    stored_mode="${stored_mode#mode:}"
    if [ -n "$stored_mode" ] && [ "$stored_mode" != "$MODE" ]; then
        info "Build mode changed: ${BOLD}$stored_mode${NC} → ${BOLD}$MODE${NC}"
    fi

    # Compare per-file hashes
    local changed_files=()
    for file in "${files_to_hash[@]}"; do
        local full_path="$PROJECT_DIR/$file"
        if [ -f "$full_path" ]; then
            local current_hash
            current_hash=$(md5 -q "$full_path" 2>/dev/null || md5sum "$full_path" 2>/dev/null | cut -d' ' -f1)
            local stored_hash
            stored_hash=$(grep "^${file}:" "$fingerprint_file" 2>/dev/null | head -1)
            stored_hash="${stored_hash#*:}"
            if [ -z "$stored_hash" ]; then
                changed_files+=("$file ${DIM}(new — not in previous build)${NC}")
            elif [ "$current_hash" != "$stored_hash" ]; then
                changed_files+=("$file")
            fi
        else
            # File was tracked but no longer exists
            if grep -q "^${file}:" "$fingerprint_file" 2>/dev/null; then
                changed_files+=("$file ${DIM}(removed)${NC}")
            fi
        fi
    done

    if [ ${#changed_files[@]} -gt 0 ]; then
        info "Changed native config files:"
        for f in "${changed_files[@]}"; do
            echo -e "    ${YELLOW}→${NC} $f"
        done
    fi
}

# =============================================================================
# Clean prebuild detection
# =============================================================================

# Compute a fingerprint of just the Expo config files that drive native generation.
compute_prebuild_fingerprint() {
    local hash_input=""
    for file in "${EXPO_CONFIG_FILES[@]}"; do
        local full_path="$PROJECT_DIR/$file"
        if [ -f "$full_path" ]; then
            hash_input+="$file:$(md5 -q "$full_path" 2>/dev/null || md5sum "$full_path" 2>/dev/null | cut -d' ' -f1)\n"
        fi
    done
    echo -n "$hash_input" | md5 -q 2>/dev/null || echo -n "$hash_input" | md5sum | cut -d' ' -f1
}

# Check if a clean prebuild is needed (config files changed since last clean prebuild)
needs_clean_prebuild() {
    local device="$1"
    local fingerprint_file

    case "$device" in
        ios)     fingerprint_file="$PREBUILD_FINGERPRINT_IOS" ;;
        android) fingerprint_file="$PREBUILD_FINGERPRINT_ANDROID" ;;
    esac

    # No stored prebuild fingerprint → first build, clean prebuild for safety
    if [ ! -f "$fingerprint_file" ]; then
        return 0
    fi

    local stored current
    stored=$(cat "$fingerprint_file" 2>/dev/null)
    current=$(compute_prebuild_fingerprint)

    if [ "$stored" != "$current" ]; then
        return 0  # config changed → need clean prebuild
    fi

    return 1  # config unchanged → incremental is fine
}

# Save prebuild fingerprint after successful clean prebuild
save_prebuild_fingerprint() {
    local device="$1"
    local fingerprint_file

    case "$device" in
        ios)     fingerprint_file="$PREBUILD_FINGERPRINT_IOS" ;;
        android) fingerprint_file="$PREBUILD_FINGERPRINT_ANDROID" ;;
    esac

    compute_prebuild_fingerprint > "$fingerprint_file"
}
