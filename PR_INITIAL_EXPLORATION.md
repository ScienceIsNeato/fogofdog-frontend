# PR #30 Initial Exploration — Pre-slop-mop Baseline

**PR:** [Fix/white screen first time user experience](https://github.com/ScienceIsNeato/fogofdog-frontend/pull/30)
**Branch:** `fix/white-screen-first-time-user-experience` → `main`
**Stats:** 3 commits, 36 files changed, +2,307 / -573 lines
**Generated:** 2026-01-30 (before slop-mop application)

---

## Problem Being Solved

First-time users completing onboarding and granting GPS permissions see a persistent white screen displaying **"Getting your location..."** before the map renders. The screen hangs long enough to feel broken. Compounding this, the cinematic zoom animation that is supposed to play on first map load either fires too early (behind onboarding panels), fires against stale/missing location data, or gets triggered spuriously by GPS injection during development.

There are three interlocking failure modes:

1. **Animation timing race:** The cinematic zoom fires the moment the Map screen mounts, regardless of whether GPS data is available or onboarding is complete. The animation plays behind modal overlays or against an empty map region.

2. **GPS acquisition stall:** After permission is granted, there is no aggressive retry loop to acquire the first location fix. The app waits passively, and the "Getting your location..." text persists until the OS delivers coordinates — which can take several seconds on a cold start.

3. **GPS injection pollution:** During development, synthetic GPS injection events re-trigger the cinematic animation sequence, causing visual glitches that are indistinguishable from production bugs during testing.

---

## Root Causes

### RC1: No guard on animation start relative to GPS readiness

`useCinematicZoom` previously started its animation sequence on mount without checking whether a valid location was available. The animation assumes a known user position to compute the "Field Goal Kicker" camera angle. When location is null or stale, the animation either renders against `(0,0)` coordinates or against whatever region was last cached.

### RC2: Passive GPS acquisition on permission grant

When `expo-location` permission transitions to "granted," the code relied on the standard `watchPositionAsync` interval to deliver the first coordinate. There was no burst/retry strategy for the critical first fix. On iOS, the first `CLLocationManager` update after permission grant can take 1–5 seconds depending on GPS signal strength and whether the app had been recently backgrounded.

### RC3: DeviceEventEmitter injection bypasses animation guards

GPS injection via `GPSInjectionEndpoint` dispatched Redux actions that looked identical to real location updates. The cinematic animation hook had no way to distinguish injected coordinates from organic GPS fixes, so injection events could re-arm and re-trigger the animation sequence.

### RC4: Constants tuned for injection, not production

`MIN_MOVEMENT_THRESHOLD_METERS` was lowered from 5m to 3m and `REAL_TIME_INJECTION_INTERVAL_MS` from 1000ms to 3000ms. These constants are shared between production location processing and development injection tooling. Lowering the movement threshold makes the exploration system more sensitive to noise in production GPS data (which typically has 3–5m accuracy on iOS).

---

## Prediction: Will This PR Address the Problem?

**Partially — with a known blocking quality issue remaining.**

The PR correctly addresses all three technical failure modes:

- The `canStartCinematicAnimation` flag gates animation start behind GPS acquisition completion. This eliminates the timing race (RC1).
- The new `useGPSAcquisition` hook implements a 500ms retry loop that aggressively polls for the first location fix (RC2).
- Explicit `__DEV__`-only guards and injection-source tracking prevent synthetic events from re-triggering animation (RC3).

**However, the PR has an unresolved blocking gate failure:** SonarQube reports **9.3% duplication on new code** against a 3% threshold. This was flagged in CI but not resolved before the PR was opened. The duplication likely originates in the expanded `useCinematicZoom.ts` (which contains multiple similar coordinate-transformation helpers) and the new deployment scripts (which duplicate logic from the existing deployment pipeline).

**Risk assessment for RC4:** The constant changes (5m→3m threshold) are not reverted and are not guarded behind an environment check. In production, this will cause the fog-of-war system to register movement on GPS noise alone. This is a latent regression that the white-screen fix does not address.

**Functional prediction:** If merged as-is, the white screen bug will be fixed and the cinematic animation will play correctly on first load. The app will not crash. However, the duplication gate failure means this PR cannot merge through the existing CI pipeline without either raising the threshold or refactoring the duplicated code.

---

## Baseline Quality State (at time of PR open)

| Gate                  | Status   | Notes                                     |
| --------------------- | -------- | ----------------------------------------- |
| Tests                 | PASS     | 761–776 tests passing                     |
| Coverage              | PASS     | 78.52–79.17% (threshold: 78%)             |
| ESLint                | PASS     | Zero warnings                             |
| SonarQube duplication | **FAIL** | 9.3% new code duplication (threshold: 3%) |
| TypeScript            | PASS     | Strict mode clean                         |
| Security audit        | PASS     | No high-severity vulns                    |

---

## Files of Interest for Post-slop-mop Comparison

- `src/screens/Map/index.tsx` — Major refactor, hook decomposition
- `src/screens/Map/hooks/useCinematicZoom.ts` — New animation logic, likely duplication source
- `src/screens/Map/hooks/useGPSAcquisition.ts` — New hook, core fix
- `src/services/GPSInjectionEndpoint.ts` — Injection isolation
- `src/config/appConstants.ts` — Threshold changes (RC4)
- `scripts/deploy_release_build_to_simulator.sh` — New script, possible duplication with existing deploy scripts
- `.maestro/first-time-user-complete-flow.yaml` — E2E test with documented fragility
