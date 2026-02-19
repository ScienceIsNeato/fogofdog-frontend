#!/usr/bin/env bash
# =============================================================================
# iOS-specific functions for deploy_app.sh
# Sourced (not executed) — requires deploy_app.sh variables/helpers in scope.
# =============================================================================

# ── Quick-check helpers (used by status/logs/stop actions) ──────────────────

quick_is_ios_sim_booted() {
    xcrun simctl list devices booted --json 2>/dev/null \
        | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .udid' 2>/dev/null \
        | head -1 | grep -q .
}

quick_get_ios_sim_name() {
    xcrun simctl list devices booted --json 2>/dev/null \
        | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .name' 2>/dev/null \
        | head -1
}

# ── Simulator management ───────────────────────────────────────────────────

is_ios_sim_booted() {
    xcrun simctl list devices booted --json 2>/dev/null \
        | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | .udid' 2>/dev/null \
        | head -1 | grep -q .
}

list_booted_ios_simulators() {
    xcrun simctl list devices booted --json 2>/dev/null \
        | jq -r '.devices | to_entries[] | .value[] | select(.state == "Booted") | "\(.name)\t\(.udid)"' 2>/dev/null \
        | sort -f
}

set_target_ios_simulator() {
    local booted_sims
    booted_sims=$(list_booted_ios_simulators)
    if [ -z "$booted_sims" ]; then
        TARGET_IOS_SIM_UDID=""
        TARGET_IOS_SIM_NAME=""
        return 1
    fi

    # Reuse already-selected target if still booted
    if [ -n "$TARGET_IOS_SIM_UDID" ] && echo "$booted_sims" | awk -F'\t' '{print $2}' | grep -qx "$TARGET_IOS_SIM_UDID"; then
        TARGET_IOS_SIM_NAME=$(echo "$booted_sims" | awk -F'\t' -v udid="$TARGET_IOS_SIM_UDID" '$2 == udid {print $1; exit}')
        return 0
    fi

    local preferred_udid=""
    if [ -n "${FOGOFDOG_IOS_SIM_UDID:-}" ]; then
        preferred_udid="${FOGOFDOG_IOS_SIM_UDID}"
    elif [ -f "$IOS_SIM_SELECTION_FILE" ]; then
        preferred_udid=$(cat "$IOS_SIM_SELECTION_FILE" 2>/dev/null || true)
    fi

    if [ -n "$preferred_udid" ] && echo "$booted_sims" | awk -F'\t' '{print $2}' | grep -qx "$preferred_udid"; then
        TARGET_IOS_SIM_UDID="$preferred_udid"
    else
        TARGET_IOS_SIM_UDID=$(echo "$booted_sims" | head -n 1 | cut -f2)
    fi

    TARGET_IOS_SIM_NAME=$(echo "$booted_sims" | awk -F'\t' -v udid="$TARGET_IOS_SIM_UDID" '$2 == udid {print $1; exit}')
    if [ -n "$TARGET_IOS_SIM_UDID" ]; then
        echo "$TARGET_IOS_SIM_UDID" > "$IOS_SIM_SELECTION_FILE"
    fi
}

shutdown_extra_ios_simulators() {
    set_target_ios_simulator || return 0

    local booted_count
    booted_count=$(list_booted_ios_simulators | wc -l | tr -d ' ')
    if [ "$booted_count" -le 1 ]; then
        return 0
    fi

    warn "Multiple iOS simulators booted; using ${TARGET_IOS_SIM_NAME} (${TARGET_IOS_SIM_UDID})"
    while IFS=$'\t' read -r sim_name sim_udid; do
        [ -z "$sim_udid" ] && continue
        if [ "$sim_udid" != "$TARGET_IOS_SIM_UDID" ]; then
            info "Shutting down extra simulator: ${sim_name} (${sim_udid})"
            xcrun simctl shutdown "$sim_udid" 2>/dev/null || true
        fi
    done <<< "$(list_booted_ios_simulators)"
}

get_ios_sim_udid() {
    set_target_ios_simulator || true
    echo "$TARGET_IOS_SIM_UDID"
}

get_ios_sim_name() {
    set_target_ios_simulator || true
    echo "$TARGET_IOS_SIM_NAME"
}

# ── Boot ───────────────────────────────────────────────────────────────────

boot_ios_simulator() {
    if is_ios_sim_booted; then
        set_target_ios_simulator || true
        shutdown_extra_ios_simulators
        ok "iOS Simulator already booted: $(get_ios_sim_name)"
        return 0
    fi

    info "Booting iOS Simulator..."
    "$SCRIPT_DIR/internal/launch-device.sh" ios
    
    # Wait for boot
    local attempts=0
    while ! is_ios_sim_booted && [ $attempts -lt 30 ]; do
        sleep 2
        attempts=$((attempts + 1))
    done

    if is_ios_sim_booted; then
        set_target_ios_simulator || true
        shutdown_extra_ios_simulators
        ok "iOS Simulator booted: $(get_ios_sim_name)"
    else
        die "iOS Simulator failed to boot after 60s"
    fi
}

# ── App management ─────────────────────────────────────────────────────────

is_app_installed_ios() {
    local udid
    udid=$(get_ios_sim_udid)
    [ -n "$udid" ] && xcrun simctl listapps "$udid" 2>/dev/null | grep -q "$APP_BUNDLE_ID"
}

clear_data_ios() {
    local udid
    udid=$(get_ios_sim_udid)
    if [ -n "$udid" ]; then
        info "Terminating app..."
        xcrun simctl terminate "$udid" "$APP_BUNDLE_ID" 2>/dev/null || true
        info "Uninstalling app to clear all data..."
        xcrun simctl uninstall "$udid" "$APP_BUNDLE_ID" 2>/dev/null || true
        ok "iOS app data cleared (will reinstall)"
    else
        warn "No booted simulator found for data clearing"
    fi
}

# ── Build ──────────────────────────────────────────────────────────────────

build_ios() {
    local config="Debug"
    [ "$MODE" = "release" ] && config="Release"

    info "Building native iOS app (configuration: $config)..."
    info "This may take several minutes on first build."

    cd "$PROJECT_DIR"
    local build_log="/tmp/expo_build_ios_$(date +%s).log"
    local ios_device_name

    # Determine target device: physical (from .envrc) or simulator
    if [ "$PHYSICAL_DEVICE" = true ]; then
        if [ -z "$LOCAL_DEVICE_NAME" ]; then
            die "LOCAL_DEVICE_NAME not set in .envrc (required for --physical)"
        fi
        ios_device_name="$LOCAL_DEVICE_NAME"
        info "Target physical device: $ios_device_name"
    else
        ios_device_name=$(get_ios_sim_name)
    fi

    # Run expo build in background, capturing output to log file
    if [ -n "$ios_device_name" ]; then
        [ "$PHYSICAL_DEVICE" != true ] && info "Target iOS simulator: $ios_device_name ($(get_ios_sim_udid))"
        "$PROJECT_DIR/node_modules/.bin/expo" run:ios --configuration "$config" --no-bundler --device "$ios_device_name" > "$build_log" 2>&1 &
    else
        "$PROJECT_DIR/node_modules/.bin/expo" run:ios --configuration "$config" --no-bundler > "$build_log" 2>&1 &
    fi
    local expo_pid=$!

    # Monitor build progress — poll log for success/failure
    local elapsed=0
    local max_wait=600  # 10 minutes
    while kill -0 "$expo_pid" 2>/dev/null && [ $elapsed -lt $max_wait ]; do
        if grep -q "Build Succeeded" "$build_log" 2>/dev/null; then
            if [ "$PHYSICAL_DEVICE" = true ]; then
                info "Build succeeded — waiting for device install..."
                local install_wait=0
                while kill -0 "$expo_pid" 2>/dev/null && [ $install_wait -lt 120 ]; do
                    if grep -q "Complete 100%" "$build_log" 2>/dev/null; then
                        info "App installed on device — terminating Expo process"
                        kill "$expo_pid" 2>/dev/null || true
                        wait "$expo_pid" 2>/dev/null || true
                        break
                    fi
                    sleep 2
                    install_wait=$((install_wait + 2))
                done
                if kill -0 "$expo_pid" 2>/dev/null; then
                    warn "Expo still running after install wait — killing"
                    kill "$expo_pid" 2>/dev/null || true
                    wait "$expo_pid" 2>/dev/null || true
                fi
            else
                info "Build succeeded — terminating Expo process"
                kill "$expo_pid" 2>/dev/null || true
                wait "$expo_pid" 2>/dev/null || true
            fi
            break
        fi
        if grep -q "Failed to build iOS project" "$build_log" 2>/dev/null; then
            kill "$expo_pid" 2>/dev/null || true
            wait "$expo_pid" 2>/dev/null || true
            echo ""
            tail -30 "$build_log"
            echo ""
            die "iOS build failed — see log: $build_log"
        fi
        sleep 2
        elapsed=$((elapsed + 2))
    done

    if kill -0 "$expo_pid" 2>/dev/null; then
        kill -9 "$expo_pid" 2>/dev/null || true
        wait "$expo_pid" 2>/dev/null || true
        die "iOS build timed out after $((max_wait / 60)) minutes — see log: $build_log"
    fi

    if ! grep -q "Build Succeeded" "$build_log" 2>/dev/null; then
        echo ""
        tail -30 "$build_log"
        echo ""
        die "iOS build did not succeed — see log: $build_log"
    fi

    save_native_fingerprint "ios"
    ok "iOS native build complete"
}

# ── GPS ────────────────────────────────────────────────────────────────────

setup_gps_ios() {
    local udid
    udid=$(get_ios_sim_udid)
    if [ -z "$udid" ]; then
        warn "No booted iOS simulator found for GPS setup"
        return 0
    fi

    info "Setting simulator location (Eugene, Oregon)..."
    xcrun simctl location "$udid" set "44.0248,-123.1044" 2>/dev/null || true
    ok "iOS location set"
}

# ── Launch ─────────────────────────────────────────────────────────────────

launch_app_ios() {
    if [ "$PHYSICAL_DEVICE" = true ]; then
        info "Launching app on physical device '$LOCAL_DEVICE_NAME'..."
        if xcrun devicectl device process launch --terminate-existing --device "$LOCAL_DEVICE_NAME" "$APP_BUNDLE_ID" 2>/dev/null; then
            ok "App launched on '$LOCAL_DEVICE_NAME'"
        else
            warn "devicectl launch failed — you may need to open the app manually on '$LOCAL_DEVICE_NAME'"
        fi
        if [ "$MODE" = "release" ]; then
            ok "Release build — no Metro needed, app runs standalone"
        else
            info "App should auto-connect to Metro at $(get_local_ip):${METRO_PORT}"
        fi
        return 0
    fi

    local udid
    udid=$(get_ios_sim_udid)
    if [ -n "$udid" ]; then
        info "Launching app on iOS Simulator..."
        xcrun simctl launch "$udid" "$APP_BUNDLE_ID" 2>/dev/null || true
        ok "App launched"
    fi
}
