#!/usr/bin/env bash
# =============================================================================
# Android-specific functions for deploy_app.sh
# Sourced (not executed) — requires deploy_app.sh variables/helpers in scope.
# =============================================================================

# ── Quick-check helpers ────────────────────────────────────────────────────

quick_is_android_emu_running() {
    adb devices 2>/dev/null | grep -q "emulator"
}

# ── Emulator management ───────────────────────────────────────────────────

is_android_emu_running() {
    adb devices 2>/dev/null | grep -q "emulator"
}

boot_android_emulator() {
    local no_window_arg=""
    [[ "${1:-}" == "--no-window" ]] && no_window_arg="--no-window"

    if is_android_emu_running; then
        ok "Android Emulator already running"
        return 0
    fi

    info "Booting Android Emulator..."
    "$SCRIPT_DIR/internal/launch-device.sh" android $no_window_arg

    # Wait for boot
    local attempts=0
    while ! is_android_emu_running && [ $attempts -lt 30 ]; do
        sleep 2
        attempts=$((attempts + 1))
    done

    if is_android_emu_running; then
        ok "Android Emulator booted"
    else
        die "Android Emulator failed to boot after 60s"
    fi
}

# ── App management ─────────────────────────────────────────────────────────

is_app_installed_android() {
    adb shell pm list packages 2>/dev/null | grep -q "$APP_BUNDLE_ID"
}

clear_data_android() {
    if is_android_emu_running; then
        info "Clearing app data..."
        adb shell pm clear "$APP_BUNDLE_ID" 2>/dev/null || {
            # App might not be installed yet — that's fine
            info "App not installed yet, nothing to clear"
        }
        ok "Android app data cleared"
    else
        warn "No Android emulator running for data clearing"
    fi
}

# ── Java / Build ───────────────────────────────────────────────────────────

resolve_java_home() {
    local candidate=""

    if [ -x "/usr/libexec/java_home" ]; then
        candidate=$(/usr/libexec/java_home -v 17 2>/dev/null || true)
        [ -z "$candidate" ] && candidate=$(/usr/libexec/java_home 2>/dev/null || true)
        if [ -n "$candidate" ] && [ -x "$candidate/bin/java" ]; then
            echo "$candidate"
            return 0
        fi
    fi

    if command -v brew >/dev/null 2>&1; then
        local brew_prefix
        brew_prefix=$(brew --prefix openjdk@17 2>/dev/null || true)
        if [ -n "$brew_prefix" ] && [ -x "$brew_prefix/libexec/openjdk.jdk/Contents/Home/bin/java" ]; then
            echo "$brew_prefix/libexec/openjdk.jdk/Contents/Home"
            return 0
        fi
    fi

    return 1
}

ensure_java_home_for_android() {
    if [ -n "${JAVA_HOME:-}" ] && [ -x "${JAVA_HOME}/bin/java" ]; then
        info "Using JAVA_HOME: $JAVA_HOME"
        return 0
    fi

    if [ -n "${JAVA_HOME:-}" ]; then
        warn "JAVA_HOME is invalid: $JAVA_HOME"
    else
        warn "JAVA_HOME is not set"
    fi

    local detected_java_home
    detected_java_home=$(resolve_java_home || true)
    if [ -z "$detected_java_home" ]; then
        die "Unable to locate a valid JDK for Android build. Install OpenJDK 17 and set JAVA_HOME."
    fi

    export JAVA_HOME="$detected_java_home"
    export PATH="$JAVA_HOME/bin:$PATH"
    ok "Using detected JAVA_HOME: $JAVA_HOME"
}

build_android() {
    ensure_java_home_for_android

    info "Building native Android app..."
    info "This may take several minutes on first build."

    cd "$PROJECT_DIR"
    local build_log="/tmp/expo_build_android_$(date +%s).log"

    # Run expo build in background, capturing output to log file
    "$PROJECT_DIR/node_modules/.bin/expo" run:android --no-bundler > "$build_log" 2>&1 &
    local expo_pid=$!

    # Monitor build progress — poll log for success/failure
    local elapsed=0
    local max_wait=600  # 10 minutes
    while kill -0 "$expo_pid" 2>/dev/null && [ $elapsed -lt $max_wait ]; do
        if grep -q "BUILD SUCCESSFUL" "$build_log" 2>/dev/null; then
            info "Build succeeded — terminating Expo process"
            kill "$expo_pid" 2>/dev/null || true
            wait "$expo_pid" 2>/dev/null || true
            break
        fi
        if grep -q "BUILD FAILED\|Could not determine" "$build_log" 2>/dev/null; then
            kill "$expo_pid" 2>/dev/null || true
            wait "$expo_pid" 2>/dev/null || true
            echo ""
            tail -30 "$build_log"
            echo ""
            die "Android build failed — see log: $build_log"
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    if kill -0 "$expo_pid" 2>/dev/null; then
        kill -9 "$expo_pid" 2>/dev/null || true
        wait "$expo_pid" 2>/dev/null || true
        die "Android build timed out after $((max_wait / 60)) minutes — see log: $build_log"
    fi

    if ! grep -q "BUILD SUCCESSFUL" "$build_log" 2>/dev/null; then
        echo ""
        tail -30 "$build_log"
        echo ""
        die "Android build did not succeed — see log: $build_log"
    fi

    save_native_fingerprint "android"
    ok "Android native build complete"
}

# ── GPS ────────────────────────────────────────────────────────────────────

setup_gps_android() {
    info "Setting emulator location (Eugene, Oregon)..."
    # adb emu geo fix takes longitude first, then latitude
    adb emu geo fix -123.1044 44.0248 2>/dev/null || {
        warn "Could not set GPS via adb emu geo fix"
        info "You can manually set location in the emulator's Extended Controls (⋯ > Location)"
        return 0
    }
    ok "Android location set"
}

# ── Launch ─────────────────────────────────────────────────────────────────

launch_app_android() {
    info "Launching app on Android Emulator..."
    adb shell monkey -p "$APP_BUNDLE_ID" -c android.intent.category.LAUNCHER 1 2>/dev/null || {
        adb shell am start -n "$APP_BUNDLE_ID/.MainActivity" 2>/dev/null || true
    }

    if [ "$MODE" = "development" ]; then
        local dev_url="exp+fogofdog://expo-development-client/?url=http%3A%2F%2F10.0.2.2%3A${METRO_PORT}"
        local deep_link_output=""
        deep_link_output=$(adb shell am start -W -a android.intent.action.VIEW -d "$dev_url" 2>/dev/null || true)
        if echo "$deep_link_output" | grep -Eq "Status: ok|intent has been delivered"; then
            info "Android dev-client deep link sent to Metro (10.0.2.2:${METRO_PORT})"
        else
            warn "Could not confirm Android dev-client deep link delivery"
        fi
    fi

    ok "App launched"
}
