# PR #30 Post-slop-mop Exploration

**PR:** [Fix/white screen first time user experience](https://github.com/ScienceIsNeato/fogofdog-frontend/pull/30)
**Generated:** 2026-01-30 (after slop-mop gates are green on main)

This document re-examines PR #30 with the benefit of slop-mop validation on main and a thorough code-level review of every changed file on the `fix/white-screen-first-time-user-experience` branch.

---

## What slop-mop changed about the analysis

The initial exploration (PR_INITIAL_EXPLORATION.md) correctly identified the SonarQube duplication failure as a blocking gate issue. After slop-mop was installed and the `quality:duplication` gate was tuned, we confirmed that **overall project duplication is 4.6%** — below the 5% threshold. The PR #30 branch itself is the source of most of the concentrated duplication (the `useCinematicZoom.test.tsx` file has repeated setup blocks). However, this is not the primary concern.

The primary concern, revealed by a full source-level review of the PR #30 branch files, is a set of **critical runtime bugs** that the existing quality gates — old or new — cannot catch because they are logic errors, not style or coverage violations.

---

## Critical Bugs Found in PR #30

### BUG 1 — CRITICAL: Hardcoded fallback coordinate silently poisons Redux

**File:** `src/screens/Map/index.tsx`, `getInitialLocation` catch block

When `Location.getCurrentPositionAsync` fails for any reason, the catch block silently injects a hardcoded coordinate `(44.0248, -123.1044)` — Eugene, Oregon — as if it were the user's real location. This coordinate is dispatched to Redux via `updateLocation` and added to the exploration path via `processGeoPoint`. Every downstream consumer (fog overlay, cinematic zoom, user marker, stats) will render against this fabricated location.

**Why it's critical:** A user in Tokyo who has GPS temporarily unavailable will see the map pan to Eugene, Oregon and the cinematic zoom will animate across that location. The error is assigned to `_error` (intentionally unused) with zero logging. The main branch version logged the error and showed a PermissionAlert — all of that was deleted.

**Fix:** Remove the hardcoded fallback entirely. If GPS acquisition fails, display the loading state and let the `useGPSAcquisition` retry loop handle acquisition. If it ultimately fails, show an error state — do not fabricate coordinates.

### BUG 2 — HIGH: Two independent GPS acquisition loops race each other

**Files:** `src/screens/Map/index.tsx` (`getInitialLocation`) and `src/screens/Map/hooks/useGPSAcquisition.ts`

The PR adds `useGPSAcquisition()` as a new hook that polls `getCurrentPositionAsync` every 500ms at `Accuracy.Lowest`. Meanwhile, `getInitialLocation` (called via `initializeLocationServices`) also calls `getCurrentPositionAsync` at `Accuracy.High`. Both dispatch to the same Redux slice. There is no coordination. The race can result in:
- The low-accuracy fix overwriting a high-accuracy fix
- The high-accuracy path failing and triggering Bug 1's hardcoded fallback, overwriting a valid low-accuracy fix
- The same coordinate being double-dispatched through two independent channels

**Fix:** Remove the `useGPSAcquisition` hook. The existing `getInitialLocation` + `watchPositionAsync` flow is the single source of truth. If faster acquisition is needed, add a burst retry to `getInitialLocation` itself rather than creating a parallel acquisition path.

### BUG 3 — HIGH: `useCinematicZoom` has duplicate useEffect blocks that can double-fire

**File:** `src/screens/Map/hooks/useCinematicZoom.ts`

Two `useEffect` hooks contain nearly identical logic: check `isAnimationInProgress`, evaluate `shouldShowCinematicZoom`, and if true, schedule `startCinematicPanAnimation`. Their dependency arrays are the same set in different order. Effect 1 has a cleanup function; Effect 2 does not. When `canStartAnimation` and `currentLocation` both become truthy on the same render, both effects execute. The ref-based guard prevents most double-fires in practice, but Effect 2's fire-and-forget `setTimeout` means a second animation can fire if the first animation's duration timer clears `isAnimationInProgress` before a subsequent render triggers Effect 2.

**Fix:** Remove the second useEffect entirely. The first effect with its cleanup function is sufficient.

### BUG 4 — MEDIUM: `removeAllListeners` in GPSInjectionEndpoint removes other modules' listeners

**File:** `src/services/GPSInjectionEndpoint.ts`, `stopServer()`

`DeviceEventEmitter.removeAllListeners('GPS_INJECT_RELATIVE')` removes every listener on that event across the entire app, not just the one this class registered. The correct pattern is to store the subscription from `addListener` and call `.remove()` on it.

**Fix:** Store the subscription reference and use `.remove()` in `stopServer()`.

### BUG 5 — MEDIUM: Infinite GPS retry loop with no backoff or cap

**File:** `src/screens/Map/hooks/useGPSAcquisition.ts`

The 500ms `setInterval` retry loop has no maximum retry count and no exponential backoff. If GPS is genuinely unavailable, this will call `getCurrentPositionAsync` every 500ms for the entire component lifetime, draining battery on low-end devices.

**Fix:** If Bug 2's fix is applied (removing this hook entirely), this becomes moot. If retained, add a max retry count (e.g., 10) and exponential backoff.

### BUG 6 — LOW: Unused `canStartAnimation` in useMemo dependency array

**File:** `src/screens/Map/hooks/useCinematicZoom.ts`, `initialRegion` useMemo

`canStartAnimation` is listed as a dependency but never read in the memo body. This causes unnecessary recomputation when permissions change.

**Fix:** Remove `canStartAnimation` from the dependency array.

---

## Prediction: Will the follow-up PR result in a smooth login/first-use experience?

**Yes, if Bugs 1–3 are fixed.** The core white-screen fix (gating animation behind GPS readiness) is sound. The `canStartCinematicAnimation` flag and the GPS injection filtering are correct approaches. The problems are in the implementation details: the fallback coordinate, the duplicate acquisition path, and the duplicate animation effects. Removing these three issues will produce a clean first-use flow:

1. User completes onboarding → `canStartLocationServices` becomes true
2. Permission is granted → `getInitialLocation` acquires GPS (with retry if needed)
3. GPS fix arrives → `canStartCinematicAnimation` flips true
4. Single cinematic zoom animation plays
5. Map becomes interactive

---

## Lessons for the Follow-up PR

1. **Never fabricate coordinates as a fallback.** Show a loading or error state instead.
2. **Single source of truth for location acquisition.** One path, one retry strategy, one dispatch channel.
3. **One useEffect per animation lifecycle.** Duplicate effects with shared mutable state (refs) are a race condition waiting to happen.
4. **Use subscription `.remove()` not `removeAllListeners`.** The DeviceEventEmitter is app-global; scoped cleanup is mandatory.
