/**
 * First-time user flow — regression tests for PR #34 bug fixes.
 *
 * The existing MapScreen.test.tsx mocks onboarding as already completed and
 * pre-populates Redux with a location.  These tests deliberately do NOT do
 * that.  They start from a pristine store (no location, no path) and drive
 * the first-time flow programmatically, so the actual code paths exercised
 * by a real first-time user are covered.
 *
 * Bug 1: GPS failure must not dispatch fabricated coordinates (Eugene, OR).
 * Bug 2: Only one GPS acquisition path exists (useGPSAcquisition removed).
 * Bug 3: Cinematic animation fires exactly once (duplicate useEffect removed).
 * First-time flow: onboarding → permissions → GPS → animation → interactive map.
 */

import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore, Store } from '@reduxjs/toolkit';
import { MapScreen } from '../index';
import explorationReducer from '../../../store/slices/explorationSlice';
import userReducer from '../../../store/slices/userSlice';
import statsReducer from '../../../store/slices/statsSlice';
import streetReducer from '../../../store/slices/streetSlice';
import skinReducer from '../../../store/slices/skinSlice';
import type { RootState } from '../../../store';
import * as Location from 'expo-location';

// ---------------------------------------------------------------------------
// Stable mock references — names must start with "mock" for jest hoisting.
// ---------------------------------------------------------------------------
const mockAnimateToRegion = jest.fn();

/**
 * Count only cinematic-sequence animateToRegion calls.
 * startCinematicPanAnimation makes exactly two calls:
 *   1. Instant snap  — duration 0
 *   2. Smooth pan    — duration CINEMATIC_ZOOM_DURATION (5000)
 * Other code paths (e.g. centerMapOnLocation) use duration 500 or 300.
 * Filtering by duration isolates the cinematic sequence from unrelated centering.
 */
const getCinematicCallCount = () =>
  mockAnimateToRegion.mock.calls.filter((args: unknown[]) => args[1] === 0 || args[1] === 5000)
    .length;
const mockOnboardingCallbacks: { onComplete: (() => void) | null } = { onComplete: null };
const mockGetOnboardingContext = jest.fn(() => ({ isFirstTimeUser: false }));

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

jest.mock('../../../services/PermissionsOrchestrator', () => ({
  PermissionsOrchestrator: {
    completePermissionVerification: jest.fn().mockResolvedValue({
      canProceed: true,
      mode: 'full',
      backgroundGranted: true,
    }),
    cleanup: jest.fn().mockResolvedValue(undefined),
  },
}));

jest.mock('../../../services/GPSInjectionService', () => ({
  GPSInjectionService: {
    checkForInjectionOnce: jest.fn().mockResolvedValue([]),
    startPeriodicCheck: jest.fn(() => () => {}),
  },
}));

jest.mock('../../../contexts/OnboardingContext', () => ({
  useOnboardingContext: () => mockGetOnboardingContext(),
}));

jest.mock('../../../services/OnboardingService', () => ({
  OnboardingService: {
    isFirstTimeUser: jest.fn(() => Promise.resolve(false)),
    markOnboardingCompleted: jest.fn(() => Promise.resolve()),
  },
}));

jest.mock('../../../services/BackgroundLocationService');
jest.mock('../../../services/AuthPersistenceService');
jest.mock('../../../services/DataClearingService');

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  Accuracy: { High: 1, Balanced: 2, LowPower: 3, Lowest: 4 },
}));

jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  const MockMapView = React.forwardRef((props: any, ref: any) => {
    React.useImperativeHandle(ref, () => ({
      animateToRegion: mockAnimateToRegion,
      getCamera: jest.fn(() =>
        Promise.resolve({
          center: { latitude: 0, longitude: 0 },
          pitch: 0,
          heading: 0,
          altitude: 1000,
          zoom: 10,
        })
      ),
    }));
    return React.createElement(View, { testID: 'mock-map-view' }, props.children);
  });
  MockMapView.displayName = 'MockMapView';

  const MockMarker = (props: any) =>
    React.createElement(jest.requireActual<typeof import('react-native')>('react-native').View, {
      testID: 'mock-marker',
      ...props,
    });
  MockMarker.displayName = 'MockMarker';

  return { __esModule: true, default: MockMapView, Marker: MockMarker };
});

jest.mock('../../../components/OptimizedFogOverlay', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  const MockFog = (_props: any) => React.createElement(View, { testID: 'mock-fog-overlay' });
  return { __esModule: true, default: MockFog };
});

// OnboardingOverlay — captures onComplete/onSkip so tests can trigger them.
// NOTE: MapScreen uses a NAMED import: { OnboardingOverlay }, not a default import.
jest.mock('../../../components/OnboardingOverlay', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View, Text } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    OnboardingOverlay: (props: {
      visible?: boolean;
      onComplete?: () => void;
      onSkip?: () => void;
    }) => {
      // Always capture latest callbacks so tests can invoke them
      mockOnboardingCallbacks.onComplete = props.onComplete ?? null;
      if (!props.visible) return null;
      return React.createElement(
        View,
        { testID: 'onboarding-overlay' },
        React.createElement(Text, { testID: 'onboarding-title' }, 'Welcome!')
      );
    },
  };
});

jest.mock('../../../components/LocationButton', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { TouchableOpacity, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');
  return {
    __esModule: true,
    default: (props: any) =>
      React.createElement(
        TouchableOpacity,
        { testID: 'mock-location-button', onPress: props.onPress },
        React.createElement(Text, {}, 'Locate')
      ),
  };
});

jest.mock('@shopify/react-native-skia', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    Canvas: (_p: any) => React.createElement(View, { testID: 'mock-skia-canvas' }),
    Mask: (_p: any) => React.createElement(View, {}),
    Group: (_p: any) => React.createElement(View, {}),
    Fill: (_p: any) => React.createElement(View, {}),
    Path: (_p: any) => React.createElement(View, {}),
    Rect: (_p: any) => React.createElement(View, {}),
    Skia: { Path: { Make: jest.fn().mockReturnValue({ moveTo: jest.fn(), lineTo: jest.fn() }) } },
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Empty Redux store — no pre-existing location or path. */
const createEmptyStore = (): Store<RootState> =>
  configureStore({
    reducer: {
      exploration: explorationReducer,
      user: userReducer,
      stats: statsReducer,
      street: streetReducer,
      skin: skinReducer,
    },
    preloadedState: {
      exploration: {
        path: [],
        currentLocation: null,
        zoomLevel: 10,
        isMapCenteredOnUser: false,
        isFollowModeActive: false,
        exploredAreas: [],
        backgroundLocationStatus: {
          isRunning: false,
          hasPermission: false,
          storedLocationCount: 0,
        },
        isTrackingPaused: false,
        gpsInjectionStatus: { isRunning: false, type: null, message: '' },
      },
      user: { user: null, isLoading: false, error: null },
    },
  });

const renderMapScreen = async (store: Store<RootState>) => {
  const result = render(
    <Provider store={store}>
      <MapScreen />
    </Provider>
  );
  await act(async () => {
    jest.advanceTimersByTime(500);
    await Promise.resolve();
  });
  return result;
};

/**
 * Advance fake timers and flush microtasks.  A single Promise.resolve() only
 * unblocks one await level.  The permission → GPS → dispatch chain has 3+ levels,
 * so we flush several microtask turns to let the full chain settle.
 */
const flushAsync = async (ms = 1000) => {
  await act(async () => {
    jest.advanceTimersByTime(ms);
    // Flush multiple microtask levels so chained awaits resolve.
    for (let i = 0; i < 8; i++) {
      await Promise.resolve();
    }
  });
};

// ---------------------------------------------------------------------------

describe('First-time user flow — regression tests for PR #34 bug fixes', () => {
  let originalConsoleError: typeof console.error;
  let originalConsoleWarn: typeof console.warn;

  beforeEach(() => {
    jest.useFakeTimers();
    originalConsoleError = console.error;
    console.error = jest.fn();
    originalConsoleWarn = console.warn;
    console.warn = jest.fn();
    // Opt out of jest.console-setup.js warning-failure gate.  The warnings
    // exercised here are intentional: Bug 1's "GPS acquisition failed" warn
    // is proof the hardcoded fallback was removed, and BackgroundLocationService
    // warns because its auto-mock returns undefined for every method.
    (global as any).expectConsoleWarnings = true;

    mockAnimateToRegion.mockClear();
    mockOnboardingCallbacks.onComplete = null;

    // Default baseline: returning user, GPS works, permissions granted.
    mockGetOnboardingContext.mockReturnValue({ isFirstTimeUser: false });

    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mockedOnboarding = require('../../../services/OnboardingService').OnboardingService;
    mockedOnboarding.isFirstTimeUser.mockResolvedValue(false);
    mockedOnboarding.markOnboardingCompleted.mockResolvedValue(undefined);

    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      expires: 'never',
      canAskAgain: true,
    });
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
      granted: true,
      expires: 'never',
      canAskAgain: true,
    });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
        altitude: null,
        accuracy: 10,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    });
    (Location.startLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    console.error = originalConsoleError;
    console.warn = originalConsoleWarn;
    (Location.getCurrentPositionAsync as jest.Mock).mockReset();
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockReset();
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockReset();
    (Location.startLocationUpdatesAsync as jest.Mock).mockReset();
    (Location.stopLocationUpdatesAsync as jest.Mock).mockReset();
  });

  // -------------------------------------------------------------------------
  // Bug 1: GPS failure must not fabricate coordinates
  // -------------------------------------------------------------------------
  describe('Bug 1 — GPS failure does not fabricate coordinates', () => {
    it('does not dispatch any location when getCurrentPositionAsync rejects', async () => {
      (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(
        new Error('Location services are disabled')
      );

      const store = createEmptyStore();
      await renderMapScreen(store);
      await flushAsync(35000); // past permission timeout + any retry window

      expect(store.getState().exploration.currentLocation).toBeNull();
      expect(store.getState().exploration.path).toHaveLength(0);
    });

    it('never dispatches the hardcoded Eugene OR fallback coordinate', async () => {
      (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(
        new Error('Permission denied')
      );

      const store = createEmptyStore();
      const dispatchSpy = jest.spyOn(store, 'dispatch');
      await renderMapScreen(store);
      await flushAsync(35000);

      // Scan every dispatched action for the fabricated coordinate.
      const allActions = dispatchSpy.mock.calls.map((c) => JSON.stringify(c));
      const eugene = allActions.find((s) => s.includes('44.0248') || s.includes('123.1044'));
      expect(eugene).toBeUndefined();
    });

    it('renders loading state and does not crash while GPS is unavailable', async () => {
      (Location.getCurrentPositionAsync as jest.Mock).mockRejectedValue(
        new Error('GPS unavailable')
      );

      const store = createEmptyStore();
      const { getByText } = await renderMapScreen(store);
      await flushAsync(35000);

      // Must still be showing the loading text — no crash, no blank screen.
      expect(getByText('Getting your location...')).toBeTruthy();
    });
  });

  // -------------------------------------------------------------------------
  // Bug 2: Single acquisition path — no 500 ms polling loop
  // -------------------------------------------------------------------------
  describe('Bug 2 — single GPS acquisition path', () => {
    it('does not repeatedly call getCurrentPositionAsync after a successful fix', async () => {
      const store = createEmptyStore();
      await renderMapScreen(store);

      // Wait long enough that a 500 ms polling loop (the old useGPSAcquisition)
      // would have fired ~10 times.
      await flushAsync(6000);

      const callCount = (Location.getCurrentPositionAsync as jest.Mock).mock.calls.length;
      // One call from getInitialLocation is expected. A handful more from
      // watchPositionAsync or other legitimate paths is acceptable.
      // Ten+ calls would indicate the removed polling hook is still active.
      expect(callCount).toBeLessThan(5);
    });
  });

  // -------------------------------------------------------------------------
  // Bug 3: Single cinematic animation — no duplicate useEffect
  // -------------------------------------------------------------------------
  describe('Bug 3 — cinematic animation fires exactly once', () => {
    it('calls animateToRegion exactly twice: instant snap then smooth pan', async () => {
      const store = createEmptyStore();
      await renderMapScreen(store);

      // Flush in small increments so the permission → GPS → dispatch async
      // chain fully resolves.  Each flushAsync drains multiple microtask levels.
      await flushAsync(1000);
      await flushAsync(1000);
      await flushAsync(500);
      // Total elapsed ≈ 3000 ms.  The cinematic sequence (CINEMATIC_ZOOM_DELAY 50 ms
      // + inner 50 ms timeout) has fired.  Critically, we are BEFORE the
      // isAnimationInProgress guard reset at CINEMATIC_ZOOM_DURATION + 200 = 5200 ms,
      // so any legitimate re-fire after guard reset has not happened yet.
      //
      // A duplicate useEffect would produce 4 cinematic calls: both effects fire in
      // the same render cycle and both start their sequence simultaneously.
      // We filter to cinematic durations (0 and 5000) to exclude the unrelated
      // centerMapOnLocation calls (duration 500).
      expect(getCinematicCallCount()).toBe(2);
    });

    it('animation sequence is stable during the active cinematic window', async () => {
      const store = createEmptyStore();
      await renderMapScreen(store);

      // Same graduated flush to let the animation start.
      await flushAsync(1000);
      await flushAsync(1000);
      await flushAsync(500);

      const cinematicCallsAfterStart = getCinematicCallCount();
      expect(cinematicCallsAfterStart).toBe(2); // sanity: sequence has started

      // Advance 1000 ms more — still inside the guard window (< 5200 ms from
      // animation start), so no re-fire is possible.
      await flushAsync(1000);

      expect(getCinematicCallCount()).toBe(cinematicCallsAfterStart);
    });
  });

  // -------------------------------------------------------------------------
  // First-time user: end-to-end onboarding → GPS → animation → interactive
  // -------------------------------------------------------------------------
  describe('First-time user complete flow', () => {
    beforeEach(() => {
      mockGetOnboardingContext.mockReturnValue({ isFirstTimeUser: true });
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const mockedOnboarding = require('../../../services/OnboardingService').OnboardingService;
      mockedOnboarding.isFirstTimeUser.mockResolvedValue(true);
      // markOnboardingCompleted must flip both the service AND the context mock.
      // MapScreen calls useMapScreenOnboarding() twice — once for the overlay
      // callbacks and once inside useMapScreenHookStates for location-service gating.
      // They are independent useState instances.  The second instance only corrects
      // itself when useOnboardingStorageSync re-runs, which requires its
      // isFirstTimeUser dep (from context) to change.
      mockedOnboarding.markOnboardingCompleted.mockImplementation(async () => {
        mockedOnboarding.isFirstTimeUser.mockResolvedValue(false);
        mockGetOnboardingContext.mockReturnValue({ isFirstTimeUser: false });
      });
    });

    it('shows onboarding overlay and does not start location services', async () => {
      const store = createEmptyStore();
      const { getByTestId } = await renderMapScreen(store);
      await flushAsync(2000);

      // Onboarding must be visible.
      expect(getByTestId('onboarding-overlay')).toBeTruthy();
      // Location services are gated — store must still be empty.
      expect(store.getState().exploration.currentLocation).toBeNull();
    });

    it('dismisses onboarding and acquires location after user completes tutorial', async () => {
      const store = createEmptyStore();
      const { queryByTestId } = await renderMapScreen(store);
      await flushAsync(2000);

      expect(queryByTestId('onboarding-overlay')).toBeTruthy();
      expect(mockOnboardingCallbacks.onComplete).toBeTruthy();

      // Simulate the user tapping "Complete" on the tutorial.
      // onComplete is async — must await it so markOnboardingCompleted resolves
      // and the state updates (setShowOnboarding(false)) are applied.
      await act(async () => {
        await mockOnboardingCallbacks.onComplete!();
      });

      // Flush in increments: permission verification → location services → GPS fix.
      await flushAsync(1000);
      await flushAsync(1000);
      await flushAsync(1000);

      // Onboarding overlay is gone.
      expect(queryByTestId('onboarding-overlay')).toBeNull();

      // Location is now in the store.
      expect(store.getState().exploration.currentLocation).not.toBeNull();
    });

    it('plays cinematic animation after the first GPS fix in the first-time flow', async () => {
      const store = createEmptyStore();
      await renderMapScreen(store);
      await flushAsync(2000);

      // Complete onboarding — await the async handler.
      await act(async () => {
        await mockOnboardingCallbacks.onComplete!();
      });

      // Flush in increments so the permission → GPS → cinematic chain resolves.
      // Stay within 3000 ms to stay before the isAnimationInProgress guard reset
      // at CINEMATIC_ZOOM_DURATION + 200 = 5200 ms.
      await flushAsync(1000);
      await flushAsync(1000);
      await flushAsync(500);

      // Exactly two cinematic animateToRegion calls — the sequence ran once.
      expect(getCinematicCallCount()).toBe(2);
    });
  });
});
