# Android Emulator Alternatives Research

**Date:** 2026-02-14  
**Context:** FogOfDog Frontend — React Native (Expo) app with Maestro UI testing on Apple Silicon M2 Mac  
**Current Setup:** Android Studio AVD (Pixel 8 Pro), launched via `scripts/internal/launch-device.sh` (called by `deploy_app.sh`)

## Pain Points with Current AVD

1. **RAM:** 50+GB consumed on M2 Mac
2. **Gestures:** Mouse/trackpad click, drag, pinch-to-zoom don't work properly
3. **System resources:** Mac gets overwhelmed

## Priority Order (per user)

1. **Local non-AVD emulator** (e.g. Genymotion)
2. **Free cloud solution** if comparable to local
3. **Optimized AVD** as fallback

---

## Option Comparison

### 1. Physical Android Device via USB

| Criteria                  | Assessment                                                                                                                                                                        |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Silicon M2**      | ✅ N/A — it's a real phone, no emulation                                                                                                                                          |
| **RAM/CPU usage**         | ✅ **Near zero** — just adb daemon (~50MB)                                                                                                                                        |
| **Mouse/gesture support** | ✅ Touch screen works natively — no trackpad translation needed                                                                                                                   |
| **Maestro compatibility** | ✅ **Full support** — Maestro auto-detects USB devices via `adb`. From docs: "maestro test will automatically detect and use any local emulator or USB-connected physical device" |
| **Expo dev client**       | ✅ Full support — `npx expo run:android --device` or connect via network                                                                                                          |
| **Cost**                  | 💰 $80-150 one-time for a decent test phone (Samsung Galaxy A15 ~$100, Pixel 7a ~$150, or used Pixel 6 ~$80)                                                                      |
| **Setup complexity**      | 🟢 Low — plug in USB, enable Developer Options + USB Debugging                                                                                                                    |
| **GPS mocking**           | ✅ Maestro supports `setLocation` on physical devices. Also works via `adb emu geo fix` or mock location apps (requires enabling "Allow mock locations" in Developer Options)     |

**Verdict:** ⭐⭐⭐⭐⭐ THE BEST OPTION for your situation. Solves ALL three pain points simultaneously: zero RAM overhead, real touch gestures, real GPS hardware. A $100 Samsung Galaxy A-series or Pixel is a one-time cost that eliminates months of emulator frustration.

**GPS mocking detail for FogOfDog:** On a physical device, use `adb shell appops set <package> android:mock_location allow` and either:

- Maestro's built-in `setLocation` command (works in your existing `.maestro/*.yaml` flows)
- A mock location app like "Fake GPS" for interactive dev testing
- Your existing `gps-injection.json` data can be replayed via adb commands

---

### 2. Genymotion Desktop

| Criteria                  | Assessment                                                                                                                                                                                                                                                                    |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Silicon M2**      | ⚠️ **Partial** — Genymotion Desktop uses VirtualBox under the hood, which has had inconsistent Apple Silicon support. As of 2025-2026, VirtualBox 7.x has a "developer preview" for ARM Macs but it's not production-stable. Genymotion SaaS (browser-based) works on any OS. |
| **RAM/CPU usage**         | 🟡 Better than AVD but still runs a full Android VM. Typically 2-4GB RAM for the VM vs AVD's unbounded consumption.                                                                                                                                                           |
| **Mouse/gesture support** | ✅ Genymotion has good gesture emulation — multi-touch, GPS, accelerometer all controllable from the UI                                                                                                                                                                       |
| **Maestro compatibility** | ✅ Genymotion exposes `adb` — Maestro works with it. Well-documented in the community.                                                                                                                                                                                        |
| **Expo dev client**       | ✅ Standard Android emulator from Expo's perspective — works with `expo start --dev-client`                                                                                                                                                                                   |
| **Cost**                  | 🟡 **Free tier removed in recent years.** Current pricing: ~$136/year for "Desktop" license for individual developers. SaaS plans start higher. No truly free personal tier anymore.                                                                                          |
| **Setup complexity**      | 🟡 Medium — requires VirtualBox install, Genymotion account, downloading device images. On Apple Silicon specifically, VirtualBox ARM complications add friction.                                                                                                             |
| **GPS mocking**           | ✅ Excellent — built-in GPS simulation widget with route playback, GPX file import, and manual coordinate setting                                                                                                                                                             |

**Verdict:** ⭐⭐⭐ Would be great IF it had stable Apple Silicon support. The VirtualBox dependency on ARM Macs is the dealbreaker. If/when Genymotion ships a native ARM Mac version (they've mentioned it), this becomes a solid option. Currently too risky on M2.

---

### 3. Optimized AVD (Current Emulator, Tuned)

| Criteria                  | Assessment                                                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Silicon M2**      | ✅ Native ARM64 system images run via Hypervisor.Framework — this is already the best virtual path on Apple Silicon                                              |
| **RAM/CPU usage**         | 🟡 **Can be reduced significantly** with proper settings (see tuning guide below) — but still fundamentally a full Android VM                                    |
| **Mouse/gesture support** | ❌ **This is the core issue.** The AVD's gesture support on macOS with trackpad is notoriously poor. Pinch-to-zoom requires Ctrl+Shift click-drag. No known fix. |
| **Maestro compatibility** | ✅ Native — AVD is Maestro's primary target                                                                                                                      |
| **Expo dev client**       | ✅ Native — this is the default Expo Android dev path                                                                                                            |
| **Cost**                  | ✅ Free                                                                                                                                                          |
| **Setup complexity**      | 🟢 Already set up                                                                                                                                                |
| **GPS mocking**           | ✅ Built-in GPS controls in Extended Controls panel, plus `adb emu geo fix`                                                                                      |

**Tuning guide to reduce the 50GB RAM problem:**

```bash
# 1. Reduce AVD RAM allocation (edit ~/.android/avd/Pixel_8_Pro.avd/config.ini)
hw.ramSize=2048        # Default is often 4096+, 2GB is fine for most apps

# 2. Launch with optimization flags
emulator -avd Pixel_8_Pro \
  -no-boot-anim \       # Skip boot animation (faster startup)
  -no-snapshot-load \    # Cold boot (already in your script)
  -noaudio \             # Disable audio (saves resources)
  -gpu host \            # Use Mac GPU directly (better than swiftshader)
  -memory 2048 \         # Cap RAM at 2GB
  -no-window \           # For CI/headless Maestro runs only
  -cores 2               # Limit CPU cores (undocumented but works)

# 3. Use a smaller system image
# Instead of Pixel 8 Pro (high-res, big image), use "Medium Phone" API 34
# with Google APIs (not Google Play — smaller image)

# 4. Disable unnecessary features in config.ini
hw.keyboard=yes
hw.gpu.enabled=yes
hw.gpu.mode=host
disk.dataPartition.size=2G    # Reduce from default 6G+
```

**Why 50GB RAM?** The Android emulator on macOS can leak memory over long sessions, and the QEMU process doesn't aggressively release memory. Restarting the emulator periodically helps. The `-memory` flag caps the guest VM RAM but doesn't fully control host memory usage.

**Verdict:** ⭐⭐⭐ The tuning helps with RAM but **cannot fix the gesture problem**. If gestures aren't critical for daily dev (you mostly use Maestro for testing), this is free and already working.

---

### 4. Firebase Test Lab

| Criteria                  | Assessment                                                                                                                                                                                                                                          |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Silicon M2**      | ✅ Cloud-based — runs anywhere                                                                                                                                                                                                                      |
| **RAM/CPU usage**         | ✅ Zero local resources                                                                                                                                                                                                                             |
| **Mouse/gesture support** | ❌ N/A — no interactive UI. This is batch testing only.                                                                                                                                                                                             |
| **Maestro compatibility** | ❌ **Not directly compatible.** Firebase Test Lab runs Instrumentation tests, Robo tests, or Game Loop tests. It does NOT support running Maestro YAML flows. You'd need to wrap Maestro in a custom test runner, which is fragile and unsupported. |
| **Expo dev client**       | ❌ Not for dev — this is CI testing only. You upload an APK and tests run.                                                                                                                                                                          |
| **Cost**                  | 🟢 Free tier: 10 virtual device runs/day (60 min) + 5 physical device runs/day (30 min). Blaze plan: $1/hr virtual, $5/hr physical.                                                                                                                 |
| **Setup complexity**      | 🟡 Medium — requires Firebase project, gcloud CLI, APK uploads                                                                                                                                                                                      |
| **GPS mocking**           | ⚠️ Limited — physical devices may allow it; virtual devices have basic location support                                                                                                                                                             |

**Verdict:** ⭐⭐ Not suitable for your workflow. Firebase Test Lab is for CI testing with Android-native test frameworks (Espresso, UI Automator), not Maestro. Also doesn't help with interactive development.

---

### 5. Samsung Remote Test Lab

| Criteria                  | Assessment                                                                                                                                                                                     |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Silicon M2**      | ✅ Browser-based — runs anywhere                                                                                                                                                               |
| **RAM/CPU usage**         | ✅ Zero local resources                                                                                                                                                                        |
| **Mouse/gesture support** | ✅ Real device gestures via browser — click, swipe work. Pinch requires multi-touch simulation.                                                                                                |
| **Maestro compatibility** | ❌ **No adb access.** Samsung RTL streams a real device's screen to your browser — you interact visually, but there's no `adb` connection to your local machine. Maestro cannot connect to it. |
| **Expo dev client**       | ⚠️ You can install APKs via their web UI, but connecting to your local Metro server requires network tunneling (complex, unreliable).                                                          |
| **Cost**                  | ✅ Free (limited session time: ~5-20 min depending on device, ~2 concurrent sessions)                                                                                                          |
| **Setup complexity**      | 🟢 Low — Samsung account + browser                                                                                                                                                             |
| **GPS mocking**           | ❌ No GPS mocking on remote devices                                                                                                                                                            |

**Verdict:** ⭐ Not suitable. No adb = no Maestro. No local Metro connection = no Expo dev loop. Only useful for manual spot-checking on Samsung-specific devices.

---

### 6. Corellium

| Criteria                  | Assessment                                                                                                                                                                                                                                      |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Silicon M2**      | ✅ Cloud-based                                                                                                                                                                                                                                  |
| **RAM/CPU usage**         | ✅ Zero local resources                                                                                                                                                                                                                         |
| **Mouse/gesture support** | ✅ Browser-based interaction with real ARM Android VMs                                                                                                                                                                                          |
| **Maestro compatibility** | ⚠️ Corellium provides `adb` access to their virtual devices, so Maestro could theoretically connect. But requires network configuration and isn't a documented workflow.                                                                        |
| **Expo dev client**       | ⚠️ Possible but requires VPN/tunnel to your Metro server                                                                                                                                                                                        |
| **Cost**                  | ❌ **Enterprise pricing only.** No free tier for regular developers. "Viper" product for app security testing starts at thousands/year. "Solo" (EDU) is students only. This is targeted at government/security researchers, not app developers. |
| **Setup complexity**      | 🔴 High — enterprise onboarding, VPN setup                                                                                                                                                                                                      |
| **GPS mocking**           | ⚠️ Possible via adb but not a primary feature                                                                                                                                                                                                   |

**Verdict:** ⭐ Not suitable. Enterprise security tool priced for government/research, not indie app development. Massive overkill.

---

### 7. Other Alternatives Considered

#### BlueStacks / NoxPlayer / LDPlayer

| Criteria                  | Assessment                                                                                                                                   |
| ------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **Apple Silicon M2**      | ❌ **None of these support macOS**, let alone Apple Silicon. They are Windows-only (some have old Intel Mac versions that are discontinued). |
| **Maestro compatibility** | Theoretically yes (they expose adb), but moot since they don't run on Mac.                                                                   |

**Verdict:** ❌ Not applicable — Windows only.

#### Maestro Cloud

| Criteria                  | Assessment                                                                                    |
| ------------------------- | --------------------------------------------------------------------------------------------- |
| **What it is**            | Maestro's own cloud testing service — upload your APK + YAML flows, they run on their devices |
| **Maestro compatibility** | ✅ Perfect — it IS Maestro                                                                    |
| **Cost**                  | Paid service. Free tier gives some runs. Plans start ~$40/mo for small teams.                 |
| **For dev?**              | ❌ Not for interactive development. CI/CD testing only.                                       |
| **GPS mocking**           | ✅ Supports `setLocation` in YAML flows                                                       |

**Verdict:** ⭐⭐⭐ Good for CI Maestro testing (replaces running Maestro locally against an emulator). Does NOT help with interactive development. Worth evaluating for your CI pipeline, but doesn't solve the daily dev experience.

#### Android Device Streaming (Google)

| Criteria                  | Assessment                                                                             |
| ------------------------- | -------------------------------------------------------------------------------------- |
| **What it is**            | Stream real Pixel/Samsung devices from Google's data center directly in Android Studio |
| **Apple Silicon M2**      | ✅ Runs in Android Studio                                                              |
| **Maestro compatibility** | ⚠️ Provides `adb` access — Maestro should work but latency is high (cloud device)      |
| **Cost**                  | 30 free min/month, then $0.15/min ($9/hr)                                              |
| **For dev?**              | ⚠️ High latency makes interactive dev painful                                          |

**Verdict:** ⭐⭐ Too expensive and high latency for daily use. Good for occasional physical device testing.

---

## Summary Matrix

| Option                    | M2 Mac      | RAM      | Gestures  | Maestro    | Expo Dev   | Cost         | GPS Mock | Score       |
| ------------------------- | ----------- | -------- | --------- | ---------- | ---------- | ------------ | -------- | ----------- |
| **Physical Device (USB)** | ✅          | ✅ 0GB   | ✅ Native | ✅ adb     | ✅ Full    | $80-150 once | ✅       | ⭐⭐⭐⭐⭐  |
| **Optimized AVD**         | ✅          | 🟡 2-4GB | ❌ Poor   | ✅ Native  | ✅ Full    | Free         | ✅       | ⭐⭐⭐      |
| **Genymotion Desktop**    | ⚠️ VBox ARM | 🟡 2-4GB | ✅ Good   | ✅ adb     | ✅         | ~$136/yr     | ✅       | ⭐⭐⭐      |
| **Maestro Cloud**         | ✅          | ✅ 0GB   | N/A       | ✅         | ❌ CI only | ~$40/mo      | ✅       | ⭐⭐⭐ (CI) |
| **Firebase Test Lab**     | ✅          | ✅ 0GB   | N/A       | ❌         | ❌ CI only | Free tier    | ⚠️       | ⭐⭐        |
| **Device Streaming**      | ✅          | ✅ 0GB   | ✅        | ⚠️ Latency | ⚠️ Latency | $9/hr        | ⚠️       | ⭐⭐        |
| **Samsung RTL**           | ✅          | ✅ 0GB   | ✅        | ❌ No adb  | ❌         | Free         | ❌       | ⭐          |
| **Corellium**             | ✅          | ✅ 0GB   | ✅        | ⚠️         | ⚠️         | $$$$         | ⚠️       | ⭐          |
| **BlueStacks etc.**       | ❌          | —        | —         | —          | —          | —            | —        | ❌          |

---

## 🏆 Recommendation

### Primary: Buy a Cheap Android Phone ($80-150)

This is the clear winner and it's not close. Here's why:

1. **Solves all three pain points simultaneously:**

   - RAM: literally zero emulator overhead
   - Gestures: real touch screen — no trackpad-to-gesture translation bugs
   - Resources: your M2 Mac only runs Metro + adb daemon

2. **Perfect Maestro compatibility:** Maestro auto-detects USB devices. Your existing `.maestro/*.yaml` flows (smoke-test, background-gps-test, login-to-map-test, etc.) will work unchanged.

3. **Better testing fidelity:** You're testing on real hardware with real GPS, real sensors, real memory constraints. For a GPS-heavy app like FogOfDog, this matters.

4. **Recommended test phones (early 2026):**

   - **Samsung Galaxy A15** (~$100 new) — good budget phone, widely used by real users
   - **Google Pixel 7a** (~$130-150 refurbished) — clean Android, excellent adb support, good GPS
   - **Google Pixel 6** (~$80 used) — still gets security updates, great developer phone
   - **Samsung Galaxy A25** (~$130 new) — 5G, OLED, solid test device

5. **One-time cost vs. ongoing emulator pain.** You will recoup the $100 in the first week of saved debugging time.

### Secondary: Optimize AVD for CI/Headless Maestro

Keep the AVD for automated CI testing where you don't need gestures. Apply the tuning settings above to reduce resource consumption. (**Done:** `scripts/internal/launch-device.sh` already includes optimization flags and crashpad cleanup.)

### Tertiary: Evaluate Maestro Cloud for CI

If you're running Maestro in CI (GitHub Actions), Maestro Cloud handles device provisioning automatically. Worth evaluating when you set up Android CI — avoids maintaining an emulator in CI entirely.

---

## Implementation Steps

### Step 1: Physical Device Setup (30 minutes)

```bash
# 1. On the phone:
#    Settings > About Phone > tap "Build Number" 7 times
#    Settings > Developer Options > enable "USB Debugging"
#    Settings > Developer Options > enable "Allow mock locations" (for GPS testing)

# 2. Connect via USB, approve the debugging prompt on the phone

# 3. Verify connection
adb devices
# Should show: XXXXXXXXX  device

# 4. Install Expo dev client
npx expo run:android --device

# 5. Run Maestro test
./scripts/run_integration_tests.sh .maestro/smoke-test.yaml
# Maestro auto-detects the USB device
```

### Step 2: Update launch-device.sh (DONE)

**Completed:** `scripts/internal/launch-device.sh` now detects physical devices via `adb devices`. The script also includes crashpad orphan cleanup and emulator tuning flags.

### Step 3: AVD Optimization (if keeping for CI)

```bash
# Edit ~/.android/avd/Pixel_8_Pro.avd/config.ini
hw.ramSize=2048
disk.dataPartition.size=2G
hw.gpu.mode=host
hw.audioInput=no
hw.audioOutput=no
```
