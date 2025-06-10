# Maestro Background GPS Validation Plan

This document outlines the plan to validate background GPS updates using Maestro.

## CURRENT STATUS (Updated)

### ✅ COMPLETED
- Removed aggressive location polling from MapScreen.tsx
- Created new simplified Maestro test: `.maestro/background-gps-test.yaml`
- Identified correct GPS injection script: `tools/gps-injector-direct.js`
- Fixed Maestro test syntax errors (replaced `run` with `runScript`)

### 🚫 CURRENT BLOCKING ISSUES
1. **File editing problems**: AI assistant experiencing persistent file editing failures
2. **Shebang issue**: `tools/gps-injector-direct.js` contains `#!/usr/bin/env node` which causes JavaScript syntax error in Maestro
3. **Environment variable parsing**: Script needs to parse Maestro env vars instead of command-line args

### 🎯 IMMEDIATE NEXT STEPS
1. **Fix the GPS injector script**:
   - Remove the shebang line (`#!/usr/bin/env node`)
   - Modify `parseArgs()` function to read from `process.env` instead of `process.argv`
   - Keep the script working for both command-line and Maestro usage

2. **Test the fixed script**:
   - Run: `maestro test .maestro/background-gps-test.yaml`
   - Verify GPS injection works during background/foreground cycles

### 📋 WORKING TEST FLOW
The test should execute:
1. Launch app and login to map screen
2. Assert "You are here" marker visible (initial point)
3. Background the app
4. Inject GPS coordinate 100m south using `tools/gps-injector-direct.js`
5. Foreground the app
6. Assert "You are here" marker visible (southern point)
7. Inject GPS coordinate 100m east
8. Assert "You are here" marker visible (eastern point)

## ERROR LOG
- Multiple syntax errors in Maestro YAML files (resolved)
- JavaScript engine errors due to shebang in Node.js script (pending fix)
- AI assistant file editing failures (investigating backend model change)

## LESSONS LEARNED
1. Maestro uses `runScript` not `run` for JavaScript execution
2. Maestro's JS engine doesn't support Node.js shebangs
3. Environment variables must be passed via `env:` in Maestro YAML
4. The existing `tools/gps-injector-direct.js` is the right approach for GPS injection

## 1. Review and Simplify Maestro Test

*   **File:** `.maestro/04_validate-fog-background.yaml`
*   **Objective:** Simplify the test to follow the user's requested flow.
    1.  Login and navigate to the map screen.
    2.  Wait for the initial location to be registered.
    3.  Background the app.
    4.  Inject a new GPS coordinate (100m south).
    5.  Foreground the app.
    6.  Wait for the new location to be processed.
    7.  Inject another GPS coordinate (100m east).
    8.  Assert that the fog is cleared at all three points (initial, south, east).

## 2. Implement a "No-Fog" Check Helper Flow

*   **File:** `.maestro/lib/utils.js` (or a similar helper file)
*   **Objective:** Create a reusable javascript function that can be called from Maestro to check for the absence of fog at a specific screen coordinate. This is more reliable than image-based assertions.
*   **Logic:**
    *   The function will take `x` and `y` coordinates as input.
    *   It will take a screenshot and check the color of a pixel at the specified coordinates. This is the most robust method to verify the fog of war.

## 3. Modify Maestro Test (`04_validate-fog-background.yaml`)

*   I will update the Maestro test file to implement the simplified flow.
*   It will use `maestro.js` to call the no-fog check at the three locations.

### Initial Location
- Get user's initial location from the app state or UI.
- Convert lat/lon to screen pixels.
- Call no-fog check.

### South Location
- After backgrounding and injecting new coordinates.
- Get the new location.
- Convert to pixels.
- Call no-fog check.

### East Location
- After injecting the final coordinates.
- Get the new location.
- Convert to pixels.
- Call no-fog check.

## 4. Execute the Test

*   Run the Maestro test and observe its execution.
*   `maestro test .maestro/04_validate-fog-background.yaml`

## 5. Analyze Results and Iterate

*   If the test passes, the task is complete.
*   If the test fails, I will analyze the output and logs to identify the point of failure.
*   I will iterate on the `MapScreen.tsx` component and the Maestro test until the test passes reliably. 