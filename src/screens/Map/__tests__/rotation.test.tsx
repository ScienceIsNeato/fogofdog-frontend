import React from 'react';
import { render, act, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore, Store } from '@reduxjs/toolkit';
import { MapScreen } from '../index';
import explorationReducer from '../../../store/slices/explorationSlice';
import userReducer from '../../../store/slices/userSlice';
import type { RootState } from '../../../store';
import * as Location from 'expo-location';

// Global variables for test mocks
let mockMapViewRender = jest.fn();

// Helper function to safely get the last call args from a mock
const getLastCallArgs = <T = unknown,>(mockFn: jest.Mock): T => {
  const calls = mockFn.mock.calls;
  if (calls.length === 0) {
    throw new Error('No mock calls found');
  }
  const lastCall = calls[calls.length - 1];
  if (!lastCall?.[0]) {
    throw new Error('No arguments found in last call');
  }
  return lastCall[0] as T;
};

// Mock services that MapScreen depends on
jest.mock('../../../services/GPSInjectionService', () => ({
  GPSInjectionService: {
    startPeriodicCheck: jest.fn(() => jest.fn()), // Return a mock cleanup function
  },
}));

jest.mock('../../../services/BackgroundLocationService', () => ({
  BackgroundLocationService: {
    initialize: jest.fn(() => Promise.resolve()),
    startBackgroundLocationTracking: jest.fn(() => Promise.resolve(true)),
    stopBackgroundLocationTracking: jest.fn(() => Promise.resolve()),
    processStoredLocations: jest.fn(() => Promise.resolve([])),
  },
}));

jest.mock('../../../services/AuthPersistenceService', () => ({
  AuthPersistenceService: {
    saveExplorationState: jest.fn().mockResolvedValue(undefined),
    getExplorationState: jest.fn().mockResolvedValue(null),
  },
}));

jest.mock('../../../services/DataClearingService', () => ({
  DataClearingService: {
    getDataStats: jest.fn().mockResolvedValue({
      totalPoints: 0,
      recentPoints: 0,
      oldestDate: null,
      newestDate: null,
    }),
  },
}));

// Mock other components with minimal implementations
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));
jest.mock('../../../components/FogOverlay', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/LocationButton', () => ({ __esModule: true, default: () => null }));
jest.mock('../../../components/DataClearSelectionDialog', () => ({
  __esModule: true,
  default: () => null,
}));

// Mock react-native-maps
jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  const MockMapView = React.forwardRef((props: any, ref: React.Ref<unknown>) => {
    mockMapViewRender?.(props);
    React.useImperativeHandle(ref, () => ({
      animateToRegion: jest.fn(),
      getCamera: jest.fn(() => Promise.resolve({ heading: 0 })),
    }));
    return React.createElement(View, {
      testID: 'mock-map-view',
      'data-rotateEnabled': props.rotateEnabled,
      'data-pitchEnabled': props.pitchEnabled,
      ...props,
    });
  });
  MockMapView.displayName = 'MockMapView';

  const MockMarker = () => React.createElement(View, { testID: 'mock-marker' });

  return { __esModule: true, default: MockMapView, Marker: MockMarker };
});

// Consolidated mock for expo-location
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: { High: 1, Balanced: 2, LowPower: 3 },
}));

describe('Map Rotation Disabled Tests', () => {
  let store: Store<RootState>;

  beforeEach(() => {
    jest.useFakeTimers();
    mockMapViewRender.mockClear();

    store = configureStore({
      reducer: {
        exploration: explorationReducer,
        user: userReducer,
      },
    });

    const mockPermissionResponse = {
      status: 'granted',
      granted: true,
      expires: 'never',
      canAskAgain: true,
    };
    const mockLocationObject = {
      coords: {
        latitude: 41.6867,
        longitude: -91.5802,
        altitude: null,
        accuracy: null,
        altitudeAccuracy: null,
        heading: null,
        speed: null,
      },
      timestamp: Date.now(),
    };

    // Set up location mocks for each test
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(
      mockPermissionResponse
    );
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Location.getBackgroundPermissionsAsync as jest.Mock).mockResolvedValue({
      status: 'granted',
    });
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(mockLocationObject);
    (Location.startLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.stopLocationUpdatesAsync as jest.Mock).mockResolvedValue(undefined);
    (Location.watchPositionAsync as jest.Mock).mockImplementation((_options, callback) => {
      callback(mockLocationObject);
      return Promise.resolve({ remove: jest.fn() });
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.resetAllMocks();
  });

  it('should have rotation and pitch disabled on the MapView', async () => {
    const { getByTestId } = render(
      <Provider store={store}>
        <MapScreen />
      </Provider>
    );

    // Wait for initial rendering
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Get the MapView and verify rotation/pitch are disabled
    const mapView = getByTestId('mock-map-view');

    expect(mapView.props['data-rotateEnabled']).toBe(false);
    expect(mapView.props['data-pitchEnabled']).toBe(false);
  });

  it.skip('renders FogOverlay without rotation props', async () => {
    const { getByTestId } = render(
      <Provider store={store}>
        <MapScreen />
      </Provider>
    );

    // Wait for initial location to be set and MapView to be rendered
    await waitFor(
      () => {
        expect(store.getState().exploration.currentLocation).not.toBeNull();
        expect(mockMapViewRender).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Manually trigger onRegionChange to simulate map initialization
    const mapViewProps = getLastCallArgs<{
      onRegionChange?: (region: any) => void;
      initialRegion?: any;
    }>(mockMapViewRender);
    if (mapViewProps.onRegionChange && mapViewProps.initialRegion) {
      act(() => {
        mapViewProps.onRegionChange!(mapViewProps.initialRegion);
      });
    }

    // Wait for FogOverlay to render
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Get the FogOverlay component and verify no rotation props
    const fogOverlay = getByTestId('mock-fog-overlay');

    // Verify rotation prop does NOT exist (since we removed rotation entirely)
    expect(fogOverlay.props['data-rotation']).toBeUndefined();

    // Verify it still has the mapRegion prop
    expect(fogOverlay.props['data-map-region']).toBeDefined();
  });
});
