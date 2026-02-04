# GPS Follow Mode UX Fix Implementation Plan

**GitHub Issue**: [#11 - Fix GPS Follow Mode UX and Path Rendering Issues](https://github.com/ScienceIsNeato/fogofdog-frontend/issues/11)

**Created**: January 10, 2025  
**Status**: 🚧 PLANNING PHASE

---

## 🎯 PROBLEM SUMMARY

### Current Issues:

1. **Auto-Centering Prevents User Interaction** - App continuously auto-centers making pan/zoom impossible
2. **GPS Path Rendering Issues** - Showing triangular paths instead of orthogonal paths
3. **Persistent Location Errors** - Still getting occasional location errors despite permission fixes

### Root Cause Analysis:

- **Auto-centering occurs in TWO places**:
  - `setupLocationWatcher()` in MapScreen (line ~97-128)
  - `useLocationRefreshPolling()` in MapScreen (line ~173-234)
- **Current "Center" button is useless** since map is always centered
- **Path rendering issues** suggest spurious coordinate injection during app foregrounding

---

## 🗺️ SEQUENTIAL IMPLEMENTATION PLAN

### **PHASE 1: Analysis & Investigation** 📊

#### Step 1.1: Document Current Auto-Centering Behavior

- [ ] **Action**: Add detailed logging to track when auto-centering occurs
- [ ] **Files**: `src/screens/Map/index.tsx`
- [ ] **Code Changes**: Add debug logs in `setupLocationWatcher()` and `useLocationRefreshPolling()`
- [ ] **Outcome**: Clear understanding of when/how often auto-centering happens
- [ ] **Test**: Run Maestro GPS test and analyze logs for auto-centering frequency

#### Step 1.2: Investigate GPS Path Rendering Issues

- [ ] **Action**: Deep dive into coordinate injection during app backgrounding/foregrounding
- [ ] **Files**:
  - `src/services/BackgroundLocationService.ts`
  - `src/screens/Map/index.tsx` (useAppStateHandler)
- [ ] **Investigation**: Check if extra coordinates are injected when app returns from background
- [ ] **Outcome**: Identify source of triangular vs orthogonal path discrepancy
- [ ] **Test**: Run Maestro test with detailed coordinate logging before/during/after backgrounding

#### Step 1.3: Analyze Remaining Location Errors

- [ ] **Action**: Collect and categorize all remaining location errors
- [ ] **Files**: Check error logs, console output during tests
- [ ] **Investigation**: Identify patterns in "two children with same key" errors
- [ ] **Outcome**: Root cause analysis for remaining location errors
- [ ] **Test**: Run full test suite and categorize any location-related errors

### **PHASE 2: Redux State Management Updates** 🏗️

#### Step 2.1: Add Follow Mode State to Redux

- [ ] **Action**: Add `isFollowModeEnabled` to explorationSlice
- [ ] **Files**: `src/store/slices/explorationSlice.ts`
- [ ] **Code Changes**:

  ```typescript
  // Add to initial state
  isFollowModeEnabled: false,

  // Add action
  setFollowMode: (state, action: PayloadAction<boolean>) => {
    state.isFollowModeEnabled = action.payload;
  }
  ```

- [ ] **Test**: Unit tests for new Redux action
- [ ] **Validation**: Ensure state updates correctly

#### Step 2.2: Update Redux State Management Logic

- [ ] **Action**: Replace `isMapCenteredOnUser` logic with `isFollowModeEnabled`
- [ ] **Files**: `src/store/slices/explorationSlice.ts`
- [ ] **Code Changes**: Update existing `setCenterOnUser` to be `setFollowMode`
- [ ] **Test**: Update all existing tests that use `isMapCenteredOnUser`
- [ ] **Validation**: All 223 tests still pass after state changes

### **PHASE 3: Remove Auto-Centering Behaviors** ❌

#### Step 3.1: Remove Auto-Centering from Location Updates

- [ ] **Action**: Remove `mapRef.current.animateToRegion()` calls from location watchers
- [ ] **Files**: `src/screens/Map/index.tsx`
- [ ] **Code Changes**:
  - Remove auto-centering from `setupLocationWatcher()` (lines ~115-126)
  - Remove auto-centering from `useLocationRefreshPolling()` (lines ~204-216)
- [ ] **Test**: Verify location updates still work but don't auto-center
- [ ] **Validation**: Map shows GPS updates without forced centering

#### Step 3.2: Update Location Update Logic with Conditional Centering

- [ ] **Action**: Add conditional centering based on Follow Mode state
- [ ] **Files**: `src/screens/Map/index.tsx`
- [ ] **Code Changes**:
  ```typescript
  // Only auto-center when Follow Mode is enabled
  if (isFollowModeEnabled && mapRef.current) {
    mapRef.current.animateToRegion(newRegion, 500);
  }
  ```
- [ ] **Test**: Verify centering only occurs when Follow Mode is ON
- [ ] **Validation**: Pan/zoom works freely when Follow Mode is OFF

### **PHASE 4: Transform Center Button to Follow Toggle** 🔄

#### Step 4.1: Update LocationButton Component Props

- [ ] **Action**: Change LocationButton to support toggle functionality
- [ ] **Files**: `src/components/LocationButton.tsx`
- [ ] **Code Changes**:
  ```typescript
  interface LocationButtonProps {
    onPress: () => void;
    isLocationAvailable: boolean;
    isFollowModeEnabled: boolean; // Changed from isCentered
    style?: ViewStyle;
  }
  ```
- [ ] **Test**: Update LocationButton tests for new props
- [ ] **Validation**: Component renders correctly with new interface

#### Step 4.2: Update LocationButton Visual States

- [ ] **Action**: Create distinct visual states for Follow Mode toggle
- [ ] **Files**: `src/components/LocationButton.tsx`
- [ ] **Code Changes**:
  - **OFF State**: Default gray background
  - **ON State**: Blue background with different icon or animation
  - **Toggle Visual**: Clear indication of current state
- [ ] **Test**: Visual regression tests for all button states
- [ ] **Validation**: Button clearly shows ON/OFF states

#### Step 4.3: Update LocationButton Accessibility

- [ ] **Action**: Update accessibility labels for toggle behavior
- [ ] **Files**: `src/components/LocationButton.tsx`
- [ ] **Code Changes**:
  ```typescript
  accessibilityLabel: isFollowModeEnabled ? 'Turn off follow mode' : 'Turn on follow mode';
  accessibilityHint: 'Toggles automatic centering on your location';
  ```
- [ ] **Test**: Accessibility testing with screen readers
- [ ] **Validation**: VoiceOver/TalkBack announce correct states

### **PHASE 5: Implement Follow Mode Logic** 🎯

#### Step 5.1: Create Follow Mode Toggle Handler

- [ ] **Action**: Replace center button logic with toggle logic
- [ ] **Files**: `src/screens/Map/index.tsx`
- [ ] **Code Changes**:

  ```typescript
  const handleFollowModeToggle = () => {
    const newFollowMode = !isFollowModeEnabled;
    dispatch(setFollowMode(newFollowMode));

    // If turning ON Follow Mode, center immediately
    if (newFollowMode && currentLocation && mapRef.current) {
      const userRegion = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: currentRegion?.latitudeDelta ?? DEFAULT_LOCATION.latitudeDelta,
        longitudeDelta: currentRegion?.longitudeDelta ?? DEFAULT_LOCATION.longitudeDelta,
      };
      mapRef.current.animateToRegion(userRegion, 300);
    }
  };
  ```

- [ ] **Test**: Unit tests for toggle handler
- [ ] **Validation**: Follow Mode toggles correctly

#### Step 5.2: Implement Smart Gesture Detection

- [ ] **Action**: Auto-disable Follow Mode when user pans/zooms
- [ ] **Files**: `src/screens/Map/index.tsx`
- [ ] **Code Changes**: Update `onRegionChange` to detect manual gestures:

  ```typescript
  const onRegionChange = (region: Region) => {
    setCurrentRegion(region);

    // If Follow Mode is ON and user manually moved map, turn OFF Follow Mode
    if (isFollowModeEnabled && currentLocation) {
      const latDiff = Math.abs(region.latitude - currentLocation.latitude);
      const lonDiff = Math.abs(region.longitude - currentLocation.longitude);
      const threshold = Math.min(region.latitudeDelta, region.longitudeDelta) * 0.1;

      if (latDiff > threshold || lonDiff > threshold) {
        dispatch(setFollowMode(false));
      }
    }
  };
  ```

- [ ] **Test**: Manual gesture detection tests
- [ ] **Validation**: Follow Mode auto-disables on pan/zoom

### **PHASE 6: Fix GPS Path Rendering Issues** 🛤️

#### Step 6.1: Investigate Coordinate Injection During Foregrounding

- [ ] **Action**: Debug app state change handling for extra coordinates
- [ ] **Files**:
  - `src/screens/Map/index.tsx` (useAppStateHandler)
  - `src/services/BackgroundLocationService.ts`
- [ ] **Investigation**: Add detailed logging during app state transitions
- [ ] **Test**: Run Maestro test with comprehensive coordinate logging
- [ ] **Validation**: Identify source of spurious coordinates during foregrounding

#### Step 6.2: Fix Coordinate Processing Logic

- [ ] **Action**: Eliminate duplicate/spurious coordinate injection
- [ ] **Files**: Identified from Step 6.1 investigation
- [ ] **Code Changes**: Based on findings from coordinate investigation
- [ ] **Test**: Maestro GPS test should show orthogonal paths (South→East→North→East)
- [ ] **Validation**: GPS paths render correctly without triangular artifacts

### **PHASE 7: Eliminate Remaining Location Errors** 🔧

#### Step 7.1: Fix "Two Children with Same Key" Errors

- [ ] **Action**: Investigate and fix React key prop issues in location rendering
- [ ] **Files**: Likely in map marker rendering or location list components
- [ ] **Investigation**: Review all components that render location-based data
- [ ] **Code Changes**: Ensure unique keys for all location-based rendered elements
- [ ] **Test**: Run full test suite to verify error elimination
- [ ] **Validation**: Zero "two children with same key" errors

#### Step 7.2: Fix Location Fetch Failures

- [ ] **Action**: Strengthen error handling in location fetching
- [ ] **Files**:
  - `src/services/BackgroundLocationService.ts`
  - `src/screens/Map/index.tsx`
- [ ] **Code Changes**: Add robust error handling and recovery mechanisms
- [ ] **Test**: Simulate location fetch failures and verify graceful handling
- [ ] **Validation**: Location errors handled gracefully without crashes

### **PHASE 8: Update Tests and Documentation** 📝

#### Step 8.1: Update Existing Unit Tests

- [ ] **Action**: Update all tests for Follow Mode changes
- [ ] **Files**:
  - `src/components/__tests__/LocationButton.test.tsx`
  - `src/screens/Map/__tests__/MapScreen.test.tsx`
  - `src/store/slices/__tests__/explorationSlice.test.tsx`
- [ ] **Code Changes**: Replace `isCentered` with `isFollowModeEnabled` throughout tests
- [ ] **Test**: Ensure all 223+ tests pass
- [ ] **Validation**: Test coverage remains above 80%

#### Step 8.2: Create New Follow Mode Tests

- [ ] **Action**: Add comprehensive tests for Follow Mode functionality
- [ ] **Files**: New test cases in existing test files
- [ ] **Test Cases**:
  - Follow Mode toggle ON/OFF
  - Auto-centering when Follow Mode is ON
  - No auto-centering when Follow Mode is OFF
  - Smart gesture detection disabling Follow Mode
  - Visual state changes in LocationButton
- [ ] **Validation**: All new functionality is fully tested

#### Step 8.3: Update Maestro Integration Tests

- [ ] **Action**: Update GPS tests to validate Follow Mode and path accuracy
- [ ] **Files**: `.maestro/background-gps-fog-validation.yaml`
- [ ] **Code Changes**:
  - Test Follow Mode ON/OFF states
  - Validate GPS path rendering accuracy (orthogonal paths)
  - Test pan/zoom disabling Follow Mode
- [ ] **Validation**: All 30+ Maestro test steps pass with new Follow Mode logic

### **PHASE 9: Quality Assurance and Final Validation** ✅

#### Step 9.1: Run Complete Test Suite

- [ ] **Action**: Execute all tests to ensure no regressions
- [ ] **Commands**:
  - `npm run test:coverage`
  - `npm run lint:strict`
  - `npm run format:check`
  - `npm run type-check`
- [ ] **Validation**: All quality gates pass (223+ tests, 80%+ coverage, zero lint errors)

#### Step 9.2: Run Integration Tests

- [ ] **Action**: Full Maestro GPS test suite
- [ ] **Commands**: Run complete `.maestro/background-gps-fog-validation.yaml`
- [ ] **Validation**: All GPS functionality works with Follow Mode
- [ ] **Expected Results**:
  - GPS coordinates render correctly (orthogonal paths)
  - Follow Mode toggles work as expected
  - Pan/zoom disables Follow Mode appropriately
  - No location errors during test execution

#### Step 9.3: Manual Testing Validation

- [ ] **Action**: Comprehensive manual testing of Follow Mode UX
- [ ] **Test Scenarios**:
  - App starts with Follow Mode OFF ✓
  - Toggle shows clear ON/OFF states ✓
  - Pan/zoom auto-disables Follow Mode ✓
  - GPS paths render correctly (orthogonal) ✓
  - Zero location errors ✓
- [ ] **Validation**: All acceptance criteria from Issue #11 are met

---

## 🎯 ACCEPTANCE CRITERIA CHECKLIST

From GitHub Issue #11, we must achieve:

- [ ] **App starts with Follow Mode OFF** - Users can pan/zoom freely by default
- [ ] **Toggle shows clear ON/OFF states** - Visual indication of current Follow Mode
- [ ] **Pan/zoom auto-disables Follow Mode** - Smart gesture detection
- [ ] **GPS paths render correctly (orthogonal)** - Fix triangular path issue
- [ ] **Zero location errors** - Eliminate remaining error conditions

---

## 🔄 ROLLBACK PLAN

If any phase causes regressions:

1. **Immediate Rollback**: Git revert to last known good state
2. **Isolate Issue**: Identify which phase caused the problem
3. **Fix Forward**: Address the specific issue without rolling back entire implementation
4. **Re-test**: Ensure fix doesn't introduce new issues
5. **Continue**: Resume implementation from fixed state

---

## 📊 SUCCESS METRICS

- **Code Quality**: All 223+ tests passing, 80%+ coverage maintained
- **User Experience**: Intuitive Follow Mode toggle behavior
- **GPS Accuracy**: Orthogonal path rendering in Maestro tests
- **Error Elimination**: Zero location-related errors in logs
- **Performance**: No degradation in map interaction responsiveness

---

## 🚀 ESTIMATED TIMELINE

- **Phase 1 (Analysis)**: 2-3 hours
- **Phase 2 (Redux)**: 1-2 hours
- **Phase 3 (Remove Auto-center)**: 1-2 hours
- **Phase 4 (Button Transform)**: 2-3 hours
- **Phase 5 (Follow Mode Logic)**: 2-3 hours
- **Phase 6 (Path Rendering)**: 3-4 hours (investigation heavy)
- **Phase 7 (Error Elimination)**: 2-3 hours
- **Phase 8 (Tests)**: 3-4 hours
- **Phase 9 (QA)**: 1-2 hours

**Total Estimated Time**: 17-26 hours over multiple sessions

---

## 📝 IMPLEMENTATION NOTES

- **TDD Approach**: Write tests first for new functionality
- **Incremental Testing**: Run tests after each major change
- **Logging Strategy**: Add comprehensive logging during investigation phases
- **State Management**: Keep Redux changes minimal and focused
- **Backward Compatibility**: Ensure no breaking changes to existing functionality
- **Performance**: Monitor for any performance impacts during implementation

---

**Status**: ✅ **PLAN COMPLETE** - Ready to begin Phase 1: Analysis & Investigation

**Next Action**: Start with Step 1.1 - Document Current Auto-Centering Behavior
