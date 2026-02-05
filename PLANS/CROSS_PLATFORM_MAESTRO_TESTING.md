# Cross-Platform Maestro Testing Plan

## Executive Summary

Enable Maestro integration tests to run against **both iOS and Android**, configurable by
platform. This unlocks:

1. **10x cheaper CI** - Android on Linux ($0.008/min) vs iOS on macOS ($0.08/min)
2. **Android app parity** - Forces us to maintain working Android builds
3. **Developer flexibility** - Test on whichever platform is convenient
4. **Future-proofing** - Foundation for dual-platform releases

---

## Current State

| Aspect             | iOS                | Android            |
| ------------------ | ------------------ | ------------------ |
| Local builds       | ✅ Working         | ❓ Unknown         |
| CI builds          | ✅ EAS testflight  | ❌ Not configured  |
| Maestro tests      | ✅ Local only      | ❌ Not tested      |
| Emulator/Simulator | ✅ Xcode Simulator | ❓ Android Studio? |

---

## Phase 1: Android Local Development Environment

### 1.1 Android SDK & Tooling

**Goal:** Any developer can build and run Android locally.

| Task                                 | Description                    | Effort |
| ------------------------------------ | ------------------------------ | ------ |
| Document Android Studio installation | Step-by-step for macOS         | 1hr    |
| Configure `ANDROID_HOME` environment | In `.envrc` or shell profile   | 30min  |
| Verify Expo Android build            | `npx expo run:android`         | 1hr    |
| Create Android emulator AVD          | Standard device (Pixel 7?)     | 30min  |
| Add Android to `.gitignore` review   | Ensure build artifacts ignored | 15min  |

**Acceptance Criteria:**

```bash
# This should work from scratch on a new dev machine
npx expo run:android --device "Pixel_7_API_34"
```

### 1.2 Android Build Configuration

**Goal:** Android builds work identically to iOS builds.

| Task                             | Description                                    | Effort |
| -------------------------------- | ---------------------------------------------- | ------ |
| Verify `app.json` Android config | Bundle ID, permissions, icons                  | 30min  |
| Test location permissions        | Background GPS on Android                      | 2hr    |
| Verify all native modules        | expo-location, etc.                            | 1hr    |
| Test release build               | `npx expo run:android --configuration Release` | 1hr    |

**Known Differences to Investigate:**

- Background location behavior (Android foreground service vs iOS background modes)
- Map tile rendering (same MapView but different native impl)
- Permission flow UX

---

## Phase 2: Maestro Test Portability

### 2.1 Audit Existing Tests

**Goal:** Identify platform-specific selectors or behaviors.

| Test File                  | iOS-Specific? | Notes                       |
| -------------------------- | ------------- | --------------------------- |
| `login-to-map-test.yaml`   | TBD           | Audit selectors             |
| `background-gps-test.yaml` | TBD           | Background behavior differs |
| `*.yaml`                   | TBD           | Full audit needed           |

**Common Platform Differences:**

```yaml
# iOS uses accessibilityIdentifier, Android uses contentDescription
# Maestro abstracts this, but verify:
- tapOn:
    id: 'login-button' # Should work on both if testID set correctly
```

### 2.2 Test Infrastructure Updates

| Task                                     | Description                    | Effort |
| ---------------------------------------- | ------------------------------ | ------ |
| Add platform detection to test runner    | `--platform ios\|android` flag | 1hr    |
| Update `run_integration_tests.sh`        | Support Android emulator       | 2hr    |
| Create platform-specific test variants   | If absolutely needed           | TBD    |
| Add `bundle-check.sh` Android equivalent | Verify app is running          | 1hr    |

**Proposed Script Interface:**

```bash
# Run on iOS (current behavior)
./scripts/run_integration_tests.sh --platform ios

# Run on Android
./scripts/run_integration_tests.sh --platform android

# Run on both (for full validation)
./scripts/run_integration_tests.sh --platform all
```

### 2.3 Test Data & Fixtures

| Task                                  | Description           | Effort |
| ------------------------------------- | --------------------- | ------ |
| Verify GPS injection works on Android | Maestro `setLocation` | 1hr    |
| Test mock data injection              | Same AsyncStorage?    | 30min  |
| Verify screenshot paths               | For test artifacts    | 30min  |

---

## Phase 3: CI Android Integration

### 3.1 GitHub Actions Android Emulator

**Goal:** Run Maestro tests on Android in CI using Linux runners.

| Task                        | Description                              | Effort |
| --------------------------- | ---------------------------------------- | ------ |
| Add Android emulator action | `reactivecircus/android-emulator-runner` | 2hr    |
| Configure AVD in CI         | API level, device profile                | 1hr    |
| Cache Android SDK/Gradle    | Reduce build time                        | 2hr    |
| Build Android app in CI     | Expo prebuild + gradle                   | 2hr    |

**Proposed Workflow Addition:**

```yaml
run-maestro-android:
  name: 🤖 Maestro Integration Tests (Android)
  runs-on: ubuntu-latest # $0.008/min vs $0.08/min for macOS
  timeout-minutes: 30

  steps:
    - uses: actions/checkout@v4

    - name: Setup Android Emulator
      uses: reactivecircus/android-emulator-runner@v2
      with:
        api-level: 34
        arch: x86_64
        profile: pixel_7
        script: |
          npm ci
          npx expo prebuild --platform android
          cd android && ./gradlew assembleDebug
          npx maestro test .maestro/
```

### 3.2 Workflow Configuration

**Goal:** Platform selection via workflow inputs.

| Task                                 | Description                 | Effort |
| ------------------------------------ | --------------------------- | ------ |
| Add `platform` input to quality-gate | `ios`, `android`, `both`    | 1hr    |
| Conditional job execution            | Matrix or if conditions     | 1hr    |
| Update PR checks                     | Which platform(s) required? | 30min  |

**Proposed Configuration:**

```yaml
on:
  pull_request:
    branches: [main]
  workflow_dispatch:
    inputs:
      platform:
        description: 'Platform for integration tests'
        type: choice
        options:
          - android # Default - cheap
          - ios # Expensive, manual only
          - both # Full validation
        default: android
```

### 3.3 Cost Analysis

| Scenario         | Platform | Runner | Cost/Run | Monthly (20 PRs) |
| ---------------- | -------- | ------ | -------- | ---------------- |
| Current          | iOS      | macOS  | ~$4.80   | $96              |
| Proposed Default | Android  | Linux  | ~$0.24   | $4.80            |
| Full Validation  | Both     | Both   | ~$5.04   | $100.80          |

**Recommendation:** Default to Android for PRs, iOS for pre-release only.

---

## Phase 4: Developer Experience

### 4.1 Local Testing Scripts

| Task                             | Description                       | Effort |
| -------------------------------- | --------------------------------- | ------ |
| Update README with Android setup | Installation guide                | 1hr    |
| Add `npm run test:e2e:android`   | Convenience script                | 30min  |
| Add `npm run test:e2e:ios`       | Explicit iOS                      | 30min  |
| Platform auto-detection          | Detect running emulator/simulator | 1hr    |

### 4.2 Documentation

| Document                  | Content                            | Effort |
| ------------------------- | ---------------------------------- | ------ |
| `docs/ANDROID_SETUP.md`   | Full Android dev environment setup | 2hr    |
| `docs/MAESTRO_TESTING.md` | Cross-platform test guide          | 1hr    |
| Update `CLAUDE.md`        | AI assistant context for Android   | 30min  |
| Update cursor rules       | Android-specific guidance          | 30min  |

---

## Phase 5: Android App Parity (Stretch)

### 5.1 Feature Parity Audit

Once we can build and test Android, audit for feature gaps:

| Feature            | iOS | Android | Notes                     |
| ------------------ | --- | ------- | ------------------------- |
| Background GPS     | ✅  | ❓      | Foreground service needed |
| Map rendering      | ✅  | ❓      | Verify fog overlay        |
| Push notifications | ❓  | ❓      | Future feature            |
| Deep links         | ✅  | ❓      | Scheme handling           |

### 5.2 Play Store Preparation

| Task                      | Description                   | Effort |
| ------------------------- | ----------------------------- | ------ |
| EAS Android build profile | `eas.json` production Android | 1hr    |
| Play Store listing        | Screenshots, description      | 2hr    |
| Internal testing track    | Alpha/beta distribution       | 1hr    |
| Play Store submission     | Review process                | Varies |

---

## Implementation Order

### Sprint 1: Foundation (3-4 hours)

1. ✅ Document Android Studio setup
2. ✅ Verify `npx expo run:android` works locally
3. ✅ Create standard AVD configuration
4. ✅ Run one Maestro test against Android locally

### Sprint 2: Test Portability (2-3 hours)

1. Audit all Maestro tests for platform-specific code
2. Update `run_integration_tests.sh` with `--platform` flag
3. Verify all tests pass on Android locally

### Sprint 3: CI Integration (4-5 hours)

1. Add Android emulator job to `quality-gate.yml`
2. Configure caching for Android SDK
3. Make Android the default for PR integration tests
4. Keep iOS as manual/pre-release option

### Sprint 4: Polish (2-3 hours)

1. Documentation updates
2. Developer convenience scripts
3. Cost monitoring/alerts

---

## Risks & Mitigations

| Risk                         | Impact              | Mitigation                                  |
| ---------------------------- | ------------------- | ------------------------------------------- |
| Android emulator flaky in CI | Tests fail randomly | Use hardware acceleration, stable API level |
| Platform-specific bugs       | False confidence    | Run iOS pre-release                         |
| Android build time           | Slow CI             | Aggressive caching, prebuild                |
| Background GPS differs       | Core feature broken | Dedicated Android GPS test                  |

---

## Success Metrics

1. **CI Cost Reduction**: 90% reduction in integration test costs
2. **Test Coverage**: Same Maestro tests pass on both platforms
3. **Developer Velocity**: Any dev can test on Android in < 5 min setup
4. **Android Readiness**: Unblocks future Play Store release

---

## Open Questions

1. **Which Android API level?** Recommend 34 (Android 14) for modern features
2. **Which emulator device?** Pixel 7 is a good baseline
3. **EAS Android builds?** Defer to Phase 5 or start now?
4. **Play Store timeline?** Is Android release a 2026 goal?

---

## Appendix: Quick Reference Commands

```bash
# === Local Development ===

# Start Android emulator (after setup)
emulator -avd Pixel_7_API_34

# Build and run on Android
npx expo run:android

# Run Maestro against Android
maestro test .maestro/login-to-map-test.yaml

# === CI Debugging ===

# Test Android emulator action locally (with act)
act -j run-maestro-android --container-architecture linux/amd64

# Check Android SDK location
echo $ANDROID_HOME
```
