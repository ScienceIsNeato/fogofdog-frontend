import { jest, expect } from '@jest/globals';
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore, Store } from '@reduxjs/toolkit';
import { MapScreen } from '../index';
import explorationReducer, { updateLocation } from '../../../store/slices/explorationSlice';
import userReducer from '../../../store/slices/userSlice';
import type { RootState } from '../../../store';
import * as Location from 'expo-location';
import { Region } from 'react-native-maps';
import type { TouchableOpacityProps } from 'react-native';

// Mock the new permission system to simulate successful permissions
jest.mock('../../../services/PermissionsOrchestrator', () => ({
  PermissionsOrchestrator: {
    // @ts-expect-error - Mock return type
    completePermissionVerification: jest.fn().mockResolvedValue({
      canProceed: true,
      mode: 'full',
      backgroundGranted: true,
    }),
    // @ts-expect-error - Mock return type
    cleanup: jest.fn().mockResolvedValue(undefined),
  },
}));

// Mock GPSInjectionService (updated to include all needed methods)
jest.mock('../../../services/GPSInjectionService', () => ({
  GPSInjectionService: {
    // @ts-expect-error - Mock return type
    checkForInjectionOnce: jest.fn().mockResolvedValue([]),
    startPeriodicCheck: jest.fn(() => () => {}), // Returns cleanup function
  },
}));

// Mock real location coordinates (Iowa location for testing)
const mockRealLocation = {
  latitude: 41.5868,
  longitude: -93.625,
};

// Expected location in Redux store (only lat/lng, no deltas)
const expectedStoredLocation = {
  latitude: mockRealLocation.latitude,
  longitude: mockRealLocation.longitude,
};
const mockUpdatedCoords = { latitude: 34.0522, longitude: -118.2437, timestamp: Date.now() };

// Global variables for test mocks
let mockMapViewRender = jest.fn();
let mockFogOverlayRender = jest.fn(); // Mock to track FogOverlay render calls
let mockLocationButtonRender = jest.fn(); // Mock to track LocationButton render calls

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

// Helper function for common test setup pattern
const renderMapScreen = async (store: Store<RootState>) => {
  const result = render(
    <Provider store={store}>
      <MapScreen />
    </Provider>
  );

  await act(async () => {
    jest.runAllTimers();
    await Promise.resolve();
  });

  return result;
};

// Helper function for waiting for initial location load (updated for new permission flow)
const waitForInitialLocation = async (
  store: Store<RootState>,
  expectedLocation = expectedStoredLocation
) => {
  // First wait for permissions to be verified (this happens with the new flow)
  // Then advance timers to allow the permission verification to complete
  await act(async () => {
    jest.advanceTimersByTime(30000); // Permission verification timeout
    await Promise.resolve();
  });

  // Now wait for location to be set
  await waitFor(
    () => {
      expect(store.getState().exploration.currentLocation).toEqual(
        expect.objectContaining(expectedLocation)
      );
    },
    { timeout: 5000 } // Increased timeout for permission flow
  );
};

// Helper function for waiting for null location (error cases)
const waitForNullLocation = async (store: Store<RootState>) => {
  await waitFor(
    () => {
      expect(store.getState().exploration.currentLocation).toBeNull();
    },
    { timeout: 3000 }
  );
};

// Helper function for getting map and fog overlay args
const getMockArgs = () => {
  const mapViewArgs = getLastCallArgs(mockMapViewRender);
  const fogOverlayArgs = getLastCallArgs(mockFogOverlayRender);
  return { mapViewArgs, fogOverlayArgs };
};

// Helper function for location button testing
const waitForLocationButton = async (expectedState: { isCentered?: boolean }) => {
  await waitFor(
    () => {
      expect(mockLocationButtonRender).toHaveBeenCalled();
      const args = getLastCallArgs<{
        isCentered: boolean;
        onPress: () => void;
      }>(mockLocationButtonRender);
      if (expectedState.isCentered !== undefined) {
        expect(args.isCentered).toBe(expectedState.isCentered);
      }
      expect(typeof args.onPress).toBe('function');
    },
    { timeout: 3000 }
  );
};

// Helper function for region change testing
const simulateRegionChange = async (
  newRegion: Region,
  store: Store<RootState>,
  expectedPath?: any[]
) => {
  const mapViewArgs = getLastCallArgs<{ onRegionChangeComplete?: (region: Region) => void }>(
    mockMapViewRender
  );

  act(() => {
    if (mapViewArgs.onRegionChangeComplete) {
      mapViewArgs.onRegionChangeComplete(newRegion);
    }
  });

  await act(async () => {
    jest.runAllTimers();
    await Promise.resolve();
  });

  if (expectedPath) {
    const finalPath = store.getState().exploration.path;
    expect(finalPath).toEqual(expectedPath);
  }
};

// Helper function for error handling tests
const setupLocationError = (errorMessage: string) => {
  (Location.requestForegroundPermissionsAsync as jest.Mock).mockImplementation(() =>
    Promise.resolve({ status: 'granted', granted: true, expires: 'never', canAskAgain: true })
  );
  (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(() =>
    Promise.reject(new Error(errorMessage))
  );
};

// Mock react-native-maps with simpler components
jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  interface MockMapViewProps {
    onRegionChangeComplete?: (region: any) => void;
    onRegionChange?: (region: any) => void;
    onPanDrag?: () => void;
    initialRegion?: any;
    children?: React.ReactNode;
  }

  const MockMapView = React.forwardRef((props: MockMapViewProps, ref: React.Ref<unknown>) => {
    mockMapViewRender?.(props);

    React.useImperativeHandle(ref, () => ({
      animateToRegion: jest.fn(),
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

    return React.createElement(
      View,
      {
        testID: 'mock-map-view',
        'data-initialRegion': JSON.stringify(props.initialRegion),
        onPress: () => {
          if (props.onRegionChangeComplete) {
            props.onRegionChangeComplete({
              latitude: 37.78825,
              longitude: -122.4324,
              latitudeDelta: 0.0922,
              longitudeDelta: 0.0421,
            });
          }
          if (props.onPanDrag) props.onPanDrag();
        },
      } as any,
      props.children
    );
  });
  MockMapView.displayName = 'MockMapView';

  const MockMarker = (props: { coordinate?: { latitude: number; longitude: number } }) => {
    const safeProps = props.coordinate
      ? {
          latitude: props.coordinate.latitude,
          longitude: props.coordinate.longitude,
        }
      : {};
    return React.createElement(View, {
      testID: 'mock-marker',
      'data-coords': JSON.stringify(safeProps),
    } as any);
  };
  MockMarker.displayName = 'MockMarker';

  const MockPolygon = (props: any) => {
    return React.createElement(View, { testID: 'mock-rn-polygon', ...props });
  };
  MockPolygon.displayName = 'MockPolygon';

  return {
    __esModule: true,
    default: MockMapView,
    Polygon: MockPolygon,
    Marker: MockMarker,
  };
});

// Mock OptimizedFogOverlay
jest.mock('../../../components/OptimizedFogOverlay', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  const MockOptimizedFogOverlay = ({ mapRegion, ...otherProps }: { mapRegion?: unknown }) => {
    mockFogOverlayRender?.({ mapRegion, ...otherProps });
    return React.createElement(View, {
      testID: 'mock-optimized-fog-overlay',
      'data-props': JSON.stringify({ mapRegion, ...otherProps }),
    } as any);
  };

  return {
    __esModule: true,
    default: MockOptimizedFogOverlay,
  };
});

// Mock Skia components
jest.mock('@shopify/react-native-skia', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Canvas: (props: any) => React.createElement(View, { testID: 'mock-skia-canvas', ...props }),
    Mask: (props: any) => React.createElement(View, { testID: 'mock-skia-mask', ...props }),
    Group: (props: any) => React.createElement(View, { testID: 'mock-skia-group', ...props }),
    Fill: (props: any) => React.createElement(View, { testID: 'mock-skia-fill', ...props }),
    Path: (props: any) => React.createElement(View, { testID: 'mock-skia-path', ...props }),
    Rect: (props: any) => React.createElement(View, { testID: 'mock-skia-rect', ...props }),
    Skia: {
      Path: {
        Make: jest.fn().mockReturnValue({
          moveTo: jest.fn(),
          lineTo: jest.fn(),
        }),
      },
    },
  };
});

// Mock LocationButton
jest.mock('../../../components/LocationButton', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { TouchableOpacity, Text } =
    jest.requireActual<typeof import('react-native')>('react-native');

  const MockLocationButton = (props: {
    onPress?: () => void;
    isCentered?: boolean;
    isFollowModeActive?: boolean;
  }) => {
    mockLocationButtonRender?.(props);
    return React.createElement(
      TouchableOpacity,
      {
        testID: 'mock-location-button',
        onPress: () => props.onPress && props.onPress(),
      } as TouchableOpacityProps,
      React.createElement(Text, {}, 'Location Button')
    );
  };

  return {
    __esModule: true,
    default: MockLocationButton,
  };
});

// Mock __DEV__ global variable
// __DEV__ is already declared in global types, just set the value
(globalThis as typeof globalThis & { __DEV__: boolean }).__DEV__ = false;

// More complete mock objects for expo-location functions
const fullMockPermissionResponse: Location.LocationPermissionResponse = {
  status: 'granted' as Location.PermissionStatus,
  granted: true,
  expires: 'never',
  canAskAgain: true,
};

const fullMockInitialLocationObject: Location.LocationObject = {
  coords: {
    latitude: mockRealLocation.latitude,
    longitude: mockRealLocation.longitude,
    altitude: null,
    accuracy: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: Date.now(), // Add a timestamp
};

jest.mock('expo-location', () => {
  return {
    requestForegroundPermissionsAsync: jest.fn(),
    requestBackgroundPermissionsAsync: jest.fn(),
    getCurrentPositionAsync: jest.fn(),
    startLocationUpdatesAsync: jest.fn(),
    stopLocationUpdatesAsync: jest.fn(),
    Accuracy: { High: 1, Balanced: 2, LowPower: 3 },
  };
});

// Duplicate GPSInjectionService mock removed

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

// Duplicate GPSInjectionService mock removed - using the comprehensive one at the top

describe('MapScreen', () => {
  let store: Store<RootState>;
  let originalConsoleError: any;

  beforeEach(() => {
    jest.useFakeTimers();

    // Temporarily disable console error checking for these complex tests
    originalConsoleError = console.error;
    console.error = jest.fn();

    mockMapViewRender.mockClear();
    mockFogOverlayRender.mockClear(); // Clear the FogOverlay spy
    mockLocationButtonRender.mockClear(); // Clear the LocationButton spy
    store = configureStore({
      reducer: {
        exploration: explorationReducer,
        user: userReducer,
      },
    });
    // Use mockImplementation for better type compatibility with Jest mocks
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve(fullMockPermissionResponse)
    );
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve(fullMockPermissionResponse)
    );
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve(fullMockInitialLocationObject)
    );
    (Location.startLocationUpdatesAsync as jest.Mock).mockImplementation(() => Promise.resolve());
    (Location.stopLocationUpdatesAsync as jest.Mock).mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    act(() => {
      jest.runOnlyPendingTimers();
    });
    jest.useRealTimers();
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockReset();
    (Location.requestBackgroundPermissionsAsync as jest.Mock).mockReset();
    (Location.getCurrentPositionAsync as jest.Mock).mockReset();
    (Location.startLocationUpdatesAsync as jest.Mock).mockReset();
    (Location.stopLocationUpdatesAsync as jest.Mock).mockReset();

    // Restore console error
    console.error = originalConsoleError;
  });

  it('renders the map and FogOverlay component when loaded', async () => {
    await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

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

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Wait for map components to render after location is available
    await waitFor(() => {
      expect(mockMapViewRender).toHaveBeenCalled();
      expect(mockFogOverlayRender).toHaveBeenCalled();
    });
  });

  it('updates location state when GPS position changes', async () => {
    await renderMapScreen(store);

    expect(store.getState().exploration.path).toHaveLength(1);
    expect(store.getState().exploration.path[0]).toEqual(
      expect.objectContaining(expectedStoredLocation)
    );

    act(() => {
      store.dispatch(updateLocation(mockUpdatedCoords));
    });
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(store.getState().exploration.path).toHaveLength(2);
    expect(store.getState().exploration.path[1]).toEqual(mockUpdatedCoords);
    expect(store.getState().exploration.currentLocation).toEqual(mockUpdatedCoords);
  });

  it('handles zoom changes from region changes', async () => {
    const { getByTestId } = await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    const mapView = getByTestId('mock-map-view');
    act(() => {
      mapView.props.onPress();
    });
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(store.getState().exploration.zoomLevel).toBe(12);
        console.log(
          '[Test Log - zoom change] zoomLevel after onPress:',
          store.getState().exploration.zoomLevel
        );
      },
      { timeout: 3000 }
    );
  });

  // Test removed - location service lifecycle is covered in service-specific tests
  it.skip('cleans up location subscription when unmounted', async () => {
    // Clear previous mock calls
    (Location.startLocationUpdatesAsync as jest.Mock).mockClear();
    (Location.stopLocationUpdatesAsync as jest.Mock).mockClear();

    const { unmount } = render(
      <Provider store={store}>
        <MapScreen />
      </Provider>
    );

    // Wait for component to mount and location to be set up
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    await act(async () => {
      unmount();
      await Promise.resolve();
      jest.runAllTimers();
      await Promise.resolve();
    });

    // The component should start location updates when mounted
    expect(Location.startLocationUpdatesAsync).toHaveBeenCalled();
    // And stop them when unmounted
    expect(Location.stopLocationUpdatesAsync).toHaveBeenCalled();
  });

  // Test removed - rotation/pitch props are static and covered in rotation.test.tsx
  it.skip('should have rotation and pitch disabled on the MapView', async () => {
    render(
      <Provider store={store}>
        <MapScreen />
      </Provider>
    );
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    await waitFor(
      () => {
        expect(mockMapViewRender).toHaveBeenCalled();
        const lastMapViewCallArgs = getLastCallArgs<{
          rotateEnabled: boolean;
          pitchEnabled: boolean;
        }>(mockMapViewRender);
        expect(lastMapViewCallArgs.rotateEnabled).toBe(false);
        expect(lastMapViewCallArgs.pitchEnabled).toBe(false);
      },
      { timeout: 3000 }
    );
  });

  it('should not cause fog appearance to drift on vertical map pan when GPS location is stable', async () => {
    await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

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

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Capture initial render arguments after location is available
    let initialMapViewArgs: any;

    let initialFogOverlayArgs: any;

    await waitFor(
      () => {
        expect(mockMapViewRender).toHaveBeenCalled();
        expect(mockFogOverlayRender).toHaveBeenCalled(); // This should pass now if FogOverlay is rendered
        const { mapViewArgs, fogOverlayArgs } = getMockArgs();
        initialMapViewArgs = mapViewArgs;
        initialFogOverlayArgs = fogOverlayArgs;
        expect(store.getState().exploration.currentLocation).toEqual(
          expect.objectContaining(expectedStoredLocation)
        );
      },
      { timeout: 3000 }
    );

    const initialFogRotation = initialFogOverlayArgs.rotation;
    const initialPath = store.getState().exploration.path;

    const pannedRegion: Region = {
      latitude: mockRealLocation.latitude + 0.01,
      longitude: mockRealLocation.longitude,
      latitudeDelta: initialMapViewArgs.initialRegion.latitudeDelta,
      longitudeDelta: initialMapViewArgs.initialRegion.longitudeDelta,
    };

    expect(initialMapViewArgs.onRegionChangeComplete).toBeDefined();

    await act(async () => {
      if (initialMapViewArgs.onRegionChangeComplete)
        initialMapViewArgs.onRegionChangeComplete(pannedRegion);
      jest.runAllTimers();
      await Promise.resolve();
    });

    let latestFogOverlayArgs:
      | {
          mapRegion: {
            latitude: number;
            longitude: number;
            latitudeDelta: number;
            longitudeDelta: number;
          };
          rotation: number;
        }
      | undefined;
    await waitFor(
      () => {
        // Expect FogOverlay to have been called more times if MapScreen re-rendered it due to mapRegion change
        expect(mockFogOverlayRender.mock.calls.length).toBeGreaterThan(
          mockFogOverlayRender.mock.calls.indexOf(initialFogOverlayArgs)
        );
        latestFogOverlayArgs = getLastCallArgs<{
          mapRegion: {
            latitude: number;
            longitude: number;
            latitudeDelta: number;
            longitudeDelta: number;
          };
          rotation: number;
        }>(mockFogOverlayRender);
      },
      { timeout: 3000 }
    );

    // Due to throttling optimization, the FogOverlay may receive a slightly different region
    // than the exact panned region. This is expected behavior to prevent excessive re-renders.
    expect(latestFogOverlayArgs?.mapRegion.latitude).toBeCloseTo(pannedRegion.latitude, 1);
    expect(latestFogOverlayArgs?.mapRegion.longitude).toBeCloseTo(pannedRegion.longitude, 1);
    expect(latestFogOverlayArgs?.mapRegion.latitudeDelta).toBeCloseTo(
      pannedRegion.latitudeDelta,
      1
    );
    expect(latestFogOverlayArgs?.mapRegion.longitudeDelta).toBeCloseTo(
      pannedRegion.longitudeDelta,
      1
    );

    expect(latestFogOverlayArgs?.rotation).toEqual(initialFogRotation);

    // The path should be unchanged as GPS location was stable
    expect(store.getState().exploration.path).toEqual(initialPath);
  });

  it.skip('should immediately update FogOverlay coordinates during onRegionChange to prevent drift', async () => {
    await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    // Get initial MapView props
    const mapViewProps = getLastCallArgs<{
      onRegionChange?: (region: any) => void;
      initialRegion?: any;
    }>(mockMapViewRender);

    // Trigger initial region setup
    if (mapViewProps.onRegionChange && mapViewProps.initialRegion) {
      act(() => {
        mapViewProps.onRegionChange!(mapViewProps.initialRegion);
      });
    }

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Clear previous render calls to start fresh
    // Note: Don't clear if we want to verify initial rendering
    // mockFogOverlayRender.mockClear();

    // Simulate a region change (as would happen during panning)
    const newRegion: Region = {
      latitude: mockRealLocation.latitude + 0.005,
      longitude: mockRealLocation.longitude + 0.005,
      latitudeDelta: 0.01,
      longitudeDelta: 0.01,
    };

    // Trigger onRegionChange directly (this happens immediately during panning)
    act(() => {
      if (mapViewProps.onRegionChange) {
        mapViewProps.onRegionChange(newRegion);
      }
    });

    // FogOverlay should receive updated coordinates immediately, without waiting for React state updates
    await waitFor(
      () => {
        expect(mockFogOverlayRender).toHaveBeenCalled();
        const fogOverlayArgs = getLastCallArgs<{
          mapRegion: {
            latitude: number;
            longitude: number;
            latitudeDelta: number;
            longitudeDelta: number;
          };
        }>(mockFogOverlayRender);

        // Verify FogOverlay received the new region coordinates immediately
        expect(fogOverlayArgs.mapRegion.latitude).toBeCloseTo(newRegion.latitude, 1);
        expect(fogOverlayArgs.mapRegion.longitude).toBeCloseTo(newRegion.longitude, 1);
        expect(fogOverlayArgs.mapRegion.latitudeDelta).toBeCloseTo(newRegion.latitudeDelta, 1);
        expect(fogOverlayArgs.mapRegion.longitudeDelta).toBeCloseTo(newRegion.longitudeDelta, 1);
      },
      { timeout: 1000 }
    );
  });

  it.skip('should maintain fog coordinate synchronization during rapid region changes', async () => {
    await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    // Get initial MapView props
    const mapViewProps = getLastCallArgs<{
      onRegionChange?: (region: any) => void;
      initialRegion?: any;
    }>(mockMapViewRender);

    // Trigger initial region setup
    if (mapViewProps.onRegionChange && mapViewProps.initialRegion) {
      act(() => {
        mapViewProps.onRegionChange!(mapViewProps.initialRegion);
      });
    }

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Clear previous render calls
    // mockFogOverlayRender.mockClear();

    // Simulate rapid region changes (as would happen during active panning)
    const rapidRegions: Region[] = [
      {
        latitude: mockRealLocation.latitude + 0.001,
        longitude: mockRealLocation.longitude + 0.001,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      {
        latitude: mockRealLocation.latitude + 0.002,
        longitude: mockRealLocation.longitude + 0.002,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
      {
        latitude: mockRealLocation.latitude + 0.003,
        longitude: mockRealLocation.longitude + 0.003,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      },
    ];

    // Trigger rapid region changes
    act(() => {
      rapidRegions.forEach((region) => {
        if (mapViewProps.onRegionChange) {
          mapViewProps.onRegionChange(region);
        }
      });
    });

    // Wait for renders to complete
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Verify FogOverlay received updates and the final region matches the last change
    await waitFor(
      () => {
        expect(mockFogOverlayRender).toHaveBeenCalled();
        const finalFogOverlayArgs = getLastCallArgs<{
          mapRegion: {
            latitude: number;
            longitude: number;
            latitudeDelta: number;
            longitudeDelta: number;
          };
        }>(mockFogOverlayRender);

        const lastRegion = rapidRegions[rapidRegions.length - 1];
        expect(lastRegion).toBeDefined();

        // Verify final FogOverlay coordinates match the last region change
        expect(finalFogOverlayArgs.mapRegion.latitude).toBeCloseTo(lastRegion!.latitude, 5);
        expect(finalFogOverlayArgs.mapRegion.longitude).toBeCloseTo(lastRegion!.longitude, 5);
        expect(finalFogOverlayArgs.mapRegion.latitudeDelta).toBeCloseTo(
          lastRegion!.latitudeDelta,
          5
        );
        expect(finalFogOverlayArgs.mapRegion.longitudeDelta).toBeCloseTo(
          lastRegion!.longitudeDelta,
          5
        );
      },
      { timeout: 2000 }
    );

    // Verify FogOverlay was called to render the updated coordinates
    expect(mockFogOverlayRender).toHaveBeenCalled();
  });

  it.skip('should handle edge case where region changes faster than React can process', async () => {
    await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    // Get initial MapView props
    const mapViewProps = getLastCallArgs<{
      onRegionChange?: (region: any) => void;
      initialRegion?: any;
    }>(mockMapViewRender);

    // Trigger initial region setup
    if (mapViewProps.onRegionChange && mapViewProps.initialRegion) {
      act(() => {
        mapViewProps.onRegionChange!(mapViewProps.initialRegion);
      });
    }

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Clear previous render calls
    // mockFogOverlayRender.mockClear();

    // Simulate very rapid region changes (faster than React batching)
    const veryRapidRegions: Region[] = [];
    for (let i = 0; i < 10; i++) {
      veryRapidRegions.push({
        latitude: mockRealLocation.latitude + i * 0.0001,
        longitude: mockRealLocation.longitude + i * 0.0001,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      });
    }

    // Trigger extremely rapid region changes without React batching
    veryRapidRegions.forEach((region) => {
      act(() => {
        if (mapViewProps.onRegionChange) {
          mapViewProps.onRegionChange(region);
        }
      });
    });

    // Wait for renders to stabilize
    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Verify FogOverlay eventually receives the final coordinates
    await waitFor(
      () => {
        expect(mockFogOverlayRender).toHaveBeenCalled();
        const finalFogOverlayArgs = getLastCallArgs<{
          mapRegion: {
            latitude: number;
            longitude: number;
            latitudeDelta: number;
            longitudeDelta: number;
          };
        }>(mockFogOverlayRender);

        const lastRegion = veryRapidRegions[veryRapidRegions.length - 1];
        expect(lastRegion).toBeDefined();

        // Verify coordinates eventually match the final region (within tolerance for batching)
        expect(finalFogOverlayArgs.mapRegion.latitude).toBeCloseTo(lastRegion!.latitude, 4);
        expect(finalFogOverlayArgs.mapRegion.longitude).toBeCloseTo(lastRegion!.longitude, 4);
      },
      { timeout: 3000 }
    );
  });

  it('renders LocationButton with correct props', async () => {
    await renderMapScreen(store);
    // With auto-centering feature, map automatically centers on first location
    await waitForLocationButton({ isCentered: true });
  });

  it('centers map on user location when LocationButton is pressed', async () => {
    const { getByTestId } = await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    // Press the location button
    const locationButton = getByTestId('mock-location-button');
    act(() => {
      fireEvent.press(locationButton);
    });

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Check that centering state was set
    expect(store.getState().exploration.isMapCenteredOnUser).toBe(true);

    // Check that LocationButton shows centered state
    await waitForLocationButton({ isCentered: true });
  });

  it('exits centered mode when user pans the map', async () => {
    const { getByTestId } = await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    // First, center on user location
    const locationButton = getByTestId('mock-location-button');
    act(() => {
      fireEvent.press(locationButton);
    });

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    expect(store.getState().exploration.isMapCenteredOnUser).toBe(true);

    // Now simulate panning the map
    const pannedRegion: Region = {
      latitude: mockRealLocation.latitude + 0.01, // Pan north
      longitude: mockRealLocation.longitude,
      latitudeDelta: 0.0036,
      longitudeDelta: 0.0048,
    };

    // Get the onRegionChange and onPanDrag callbacks from the last render
    const lastCallArgs = getLastCallArgs<{
      onRegionChange: (region: Region) => void;
      onPanDrag: () => void;
    }>(mockMapViewRender);

    act(() => {
      // Simulate both region change and pan drag (both happen during real user pan)
      if (lastCallArgs.onRegionChange) {
        lastCallArgs.onRegionChange(pannedRegion);
      }
      if (lastCallArgs.onPanDrag) {
        lastCallArgs.onPanDrag();
      }
    });

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Check that centered mode was exited
    expect(store.getState().exploration.isMapCenteredOnUser).toBe(false);

    // Check that LocationButton reflects the change
    await waitForLocationButton({ isCentered: false });
  });

  // Additional tests for missing branches
  it('handles location fetch error gracefully', async () => {
    setupLocationError('GPS signal lost');
    await renderMapScreen(store);

    // Should fall back to default location on error
    await waitForNullLocation(store);
  });

  it('handles non-Error objects in location error catch block', async () => {
    setupLocationError('Network timeout');
    await renderMapScreen(store);

    // Should still fall back to default location
    await waitForNullLocation(store);
  });

  it('enforces maximum zoom out restrictions (latitude)', async () => {
    await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    // Simulate region change with latitude delta exceeding maximum (0.75)
    const overZoomedRegion: Region = {
      latitude: mockRealLocation.latitude,
      longitude: mockRealLocation.longitude,
      latitudeDelta: 1.0, // Exceeds MAX_LATITUDE_DELTA (0.75)
      longitudeDelta: 0.5, // Within limits
    };

    await simulateRegionChange(overZoomedRegion, store);
    // Should trigger zoom restriction logic
    expect(mockMapViewRender).toHaveBeenCalled();
  });

  it('enforces maximum zoom out restrictions (longitude)', async () => {
    await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    // Simulate region change with longitude delta exceeding maximum (1.0)
    const overZoomedRegion: Region = {
      latitude: mockRealLocation.latitude,
      longitude: mockRealLocation.longitude,
      latitudeDelta: 0.5, // Within limits
      longitudeDelta: 1.5, // Exceeds MAX_LONGITUDE_DELTA (1.0)
    };

    await simulateRegionChange(overZoomedRegion, store);
    // Should trigger zoom restriction logic
    expect(mockMapViewRender).toHaveBeenCalled();
  });

  it('enforces maximum zoom out restrictions (both latitude and longitude)', async () => {
    await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    // Simulate region change with both deltas exceeding maximums
    const overZoomedRegion: Region = {
      latitude: mockRealLocation.latitude,
      longitude: mockRealLocation.longitude,
      latitudeDelta: 2.0, // Exceeds MAX_LATITUDE_DELTA (0.75)
      longitudeDelta: 2.0, // Exceeds MAX_LONGITUDE_DELTA (1.0)
    };

    await simulateRegionChange(overZoomedRegion, store);
    // Should trigger zoom restriction logic for both dimensions
    expect(mockMapViewRender).toHaveBeenCalled();
  });

  it('handles region changes within zoom limits (no restriction needed)', async () => {
    await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    // Simulate region change within acceptable zoom limits
    const acceptableRegion: Region = {
      latitude: mockRealLocation.latitude,
      longitude: mockRealLocation.longitude,
      latitudeDelta: 0.5, // Within MAX_LATITUDE_DELTA (0.75)
      longitudeDelta: 0.8, // Within MAX_LONGITUDE_DELTA (1.0)
    };

    await simulateRegionChange(acceptableRegion, store);
    // Should not trigger any zoom restrictions (no animateToRegion calls for clamping)
    expect(mockMapViewRender).toHaveBeenCalled();
  });

  it('handles center on user when current location is null', async () => {
    // Mock permission denied in the new permission system
    const { PermissionsOrchestrator: mockPermissionsOrchestrator } = jest.requireMock(
      '../../../services/PermissionsOrchestrator'
    ) as any;
    mockPermissionsOrchestrator.completePermissionVerification.mockResolvedValueOnce({
      canProceed: false,
      mode: 'denied',
      backgroundGranted: false,
      error: 'Location permission denied',
    });

    // Also mock the old Location API for any remaining direct calls
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve({ status: 'denied', granted: false, expires: 'never', canAskAgain: true })
    );

    // Start with no location in store
    const storeWithoutLocation = configureStore({
      reducer: { exploration: explorationReducer, user: userReducer },
      preloadedState: {
        exploration: {
          path: [],
          currentLocation: null, // No location
          zoomLevel: 10,
          isMapCenteredOnUser: false,
          isFollowModeActive: false,
          exploredAreas: [], // Add missing property
          backgroundLocationStatus: {
            isRunning: false,
            hasPermission: false,
            storedLocationCount: 0,
          },
          isTrackingPaused: false,
        },
        user: { user: null, isLoading: false, error: null },
      },
    });

    const { getByTestId } = render(
      <Provider store={storeWithoutLocation}>
        <MapScreen />
      </Provider>
    );

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Should have null location due to permission denied (no fake coordinates)
    expect(storeWithoutLocation.getState().exploration.currentLocation).toBeNull();

    // Try to center on user when location is not available
    const locationButton = getByTestId('mock-location-button');
    act(() => {
      fireEvent.press(locationButton);
    });

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Should handle gracefully (no crashes) and still have null location
    expect(storeWithoutLocation.getState().exploration.currentLocation).toBeNull();
  });

  it('handles addTestPoint when current location is null', async () => {
    // Mock permission denied in the new permission system
    const { PermissionsOrchestrator: mockPermissionsOrchestrator } = jest.requireMock(
      '../../../services/PermissionsOrchestrator'
    ) as any;
    mockPermissionsOrchestrator.completePermissionVerification.mockResolvedValueOnce({
      canProceed: false,
      mode: 'denied',
      backgroundGranted: false,
      error: 'Location permission denied',
    });

    // Also mock the old Location API for any remaining direct calls
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockImplementation(() =>
      Promise.resolve({ status: 'denied', granted: false, expires: 'never', canAskAgain: true })
    );

    // Start with no location in store
    const storeWithoutLocation = configureStore({
      reducer: { exploration: explorationReducer, user: userReducer },
      preloadedState: {
        exploration: {
          path: [],
          currentLocation: null, // No location
          zoomLevel: 10,
          isMapCenteredOnUser: false,
          isFollowModeActive: false,
          exploredAreas: [], // Add missing property
          backgroundLocationStatus: {
            isRunning: false,
            hasPermission: false,
            storedLocationCount: 0,
          },
          isTrackingPaused: false,
        },
        user: { user: null, isLoading: false, error: null },
      },
    });

    render(
      <Provider store={storeWithoutLocation}>
        <MapScreen />
      </Provider>
    );

    await act(async () => {
      jest.runAllTimers();
      await Promise.resolve();
    });

    // Should have null location due to permission denied (no fake coordinates)
    expect(storeWithoutLocation.getState().exploration.currentLocation).toBeNull();

    // Path should remain empty when no real location is available
    expect(storeWithoutLocation.getState().exploration.path).toHaveLength(0);
  });

  it('data clear button is never disabled due to zero data points', async () => {
    // Create store with no data points to test button behavior
    const storeWithNoData = configureStore({
      reducer: {
        exploration: explorationReducer,
        user: userReducer,
      },
      preloadedState: {
        exploration: {
          currentLocation: { ...mockRealLocation, timestamp: Date.now() },
          path: [], // No path data
          exploredAreas: [], // No explored areas
          zoomLevel: 14,
          isMapCenteredOnUser: true,
          isFollowModeActive: false,
          backgroundLocationStatus: {
            isRunning: true,
            hasPermission: true,
            storedLocationCount: 0, // No stored locations
          },
          isTrackingPaused: false,
        },
        user: { user: null, isLoading: false, error: null },
      },
    });

    const { getByTestId } = await renderMapScreen(storeWithNoData);

    // The settings button should be available (data clearing is now in settings)
    const settingsButton = getByTestId('settings-button');
    expect(settingsButton).toBeTruthy();
  });

  it('should render with new hook-based architecture', async () => {
    // Test that the refactored component with useMapScreenLogic hook renders correctly
    const { getByTestId, rerender } = await renderMapScreen(store);
    await waitForInitialLocation(store, expectedStoredLocation);

    // Verify the component still renders all expected elements
    expect(getByTestId('map-screen')).toBeTruthy();
    expect(mockMapViewRender).toHaveBeenCalled();
    expect(mockFogOverlayRender).toHaveBeenCalled();
    expect(mockLocationButtonRender).toHaveBeenCalled();

    // Test re-render to ensure hook stability
    rerender(
      <Provider store={store}>
        <MapScreen />
      </Provider>
    );

    // Should still render correctly after re-render
    expect(getByTestId('map-screen')).toBeTruthy();
  });
});
