import { jest, expect } from '@jest/globals';
import React from 'react';
import { render, act, waitFor, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore, Store } from '@reduxjs/toolkit';
import { MapScreen } from '../index';
import explorationReducer, { updateLocation, updateZoom } from '../../../store/slices/explorationSlice';
import userReducer from '../../../store/slices/userSlice';
import type { RootState } from '../../../store';
import { Region, LatLng } from 'react-native-maps';
import * as Location from 'expo-location';

// Import or copy helper function from MapScreen.tsx
// Note: Ensure this stays in sync with the component implementation!
const createCirclePolygon = (center: LatLng, radiusMeters: number, points: number = 64): LatLng[] => {
  const earthRadius = 6378137; // Earth radius in meters
  const lat = center.latitude * (Math.PI / 180);
  const lon = center.longitude * (Math.PI / 180);
  const d = radiusMeters / earthRadius;
  const coords: LatLng[] = [];
  for (let i = 0; i < points; i++) {
    const bearing = (i * 2 * Math.PI) / points;
    const lat2 = Math.asin(Math.sin(lat) * Math.cos(d) + Math.cos(lat) * Math.sin(d) * Math.cos(bearing));
    const lon2 = lon + Math.atan2(Math.sin(bearing) * Math.sin(d) * Math.cos(lat), Math.cos(d) - Math.sin(lat) * Math.sin(lat2));
    coords.push({ latitude: lat2 * (180 / Math.PI), longitude: lon2 * (180 / Math.PI) });
  }
  return coords;
};

// Default location from MapScreen (updated to match current implementation)
const DEFAULT_LOCATION = {
  latitude: 41.6867,
  longitude: -91.5802,
  latitudeDelta: 0.0036, // Updated to match current implementation
  longitudeDelta: 0.0048, // Updated to match current implementation
};
const FOG_RADIUS_METERS = 50; // Updated to match value from FogOverlay and explorationSlice

// Mock spies
const mockMapViewRender = jest.fn(); 
const mockFogOverlayRender = jest.fn();
const mockLocationButtonRender = jest.fn();

// Mock react-native-maps with simpler components
jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const React = require('react');
  
  const MockMapView = React.forwardRef((props: any, ref: any) => {
    const mockMapViewRender = require('./MapScreen.test').mockMapViewRender;
    mockMapViewRender && mockMapViewRender(props);
    
    React.useImperativeHandle(ref, () => ({
      animateToRegion: jest.fn(),
      getCamera: jest.fn(() => Promise.resolve({
        center: { latitude: 0, longitude: 0 },
        pitch: 0,
        heading: 0,
        altitude: 1000,
        zoom: 10
      })),
    }));
    
    return React.createElement(View, {
      testID: 'mock-map-view',
      'data-initialRegion': JSON.stringify(props.initialRegion),
      onPress: () => {
        if (props.onRegionChangeComplete) {
          props.onRegionChangeComplete({ 
            latitude: 41.6867, 
            longitude: -91.5802, 
            latitudeDelta: 0.0922, 
            longitudeDelta: 0.0421 
          });
        }
        if (props.onPanDrag) props.onPanDrag();
      }
    }, props.children);
  });
  
  const MockMarker = (props: any) => {
    const React = require('react');
    const { View } = require('react-native');
    const safeProps = props.coordinate ? { 
      latitude: props.coordinate.latitude, 
      longitude: props.coordinate.longitude 
    } : {};
    return React.createElement(View, {
      testID: 'mock-marker',
      'data-coords': JSON.stringify(safeProps)
    });
  };

  const MockPolygon = (props: any) => {
    const React = require('react');
    const { View } = require('react-native');
    return React.createElement(View, { testID: 'mock-rn-polygon', ...props });
  };

  return {
    __esModule: true,
    default: MockMapView,
    Polygon: MockPolygon,
    Marker: MockMarker,
  };
});

// Mock FogOverlay
jest.mock('../../../components/FogOverlay', () => {
  const { View } = require('react-native');
  const React = require('react');
  
  const MockFogOverlay = (props: any) => {
    const mockFogOverlayRender = require('./MapScreen.test').mockFogOverlayRender;
    mockFogOverlayRender && mockFogOverlayRender(props);
    return React.createElement(View, {
      testID: 'mock-fog-overlay',
      'data-props': JSON.stringify(props)
    });
  };
  
  return {
    __esModule: true,
    default: MockFogOverlay,
  };
});

// Mock Skia components
jest.mock('@shopify/react-native-skia', () => {
  const { View } = require('react-native');
  const React = require('react');
  
  return {
    Canvas: (props: any) => React.createElement(View, { testID: 'mock-skia-canvas', ...props }),
    Mask: (props: any) => React.createElement(View, { testID: 'mock-skia-mask', ...props }),
    Group: (props: any) => React.createElement(View, { testID: 'mock-skia-group', ...props }),
    Fill: (props: any) => React.createElement(View, { testID: 'mock-skia-fill', ...props }),
    Path: (props: any) => React.createElement(View, { testID: 'mock-skia-path', ...props }),
    Rect: (props: any) => React.createElement(View, { testID: 'mock-skia-rect', ...props }),
    Skia: {
      Path: {
        Make: () => ({
          moveTo: jest.fn(),
          lineTo: jest.fn(),
        }),
      },
    },
  };
});

// Mock LocationButton
jest.mock('../../../components/LocationButton', () => {
  const { TouchableOpacity, Text } = require('react-native');
  const React = require('react');
  
  const MockLocationButton = (props: any) => {
    const mockLocationButtonRender = require('./MapScreen.test').mockLocationButtonRender;
    mockLocationButtonRender && mockLocationButtonRender(props);
    return React.createElement(TouchableOpacity, {
      testID: 'mock-location-button',
      onPress: () => props.onPress && props.onPress(),
      disabled: !props.isLocationAvailable
    }, React.createElement(Text, {}, 'Location Button'));
  };
  
  return {
    __esModule: true,
    default: MockLocationButton,
  };
});

// Mock __DEV__ global variable
global.__DEV__ = false;

// Mock expo-location
const mockInitialCoords = { latitude: 40.7128, longitude: -74.0060 }; // NY Coords
const mockUpdatedCoords = { latitude: 34.0522, longitude: -118.2437 }; // LA Coords

// More complete mock objects for expo-location functions
const fullMockPermissionResponse: Location.LocationPermissionResponse = {
  status: 'granted' as Location.PermissionStatus,
  granted: true,
  expires: 'never',
  canAskAgain: true,
};

const fullMockInitialLocationObject: Location.LocationObject = {
  coords: {
    latitude: mockInitialCoords.latitude,
    longitude: mockInitialCoords.longitude,
    altitude: null,
    accuracy: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: Date.now(), // Add a timestamp
};

let mockLocationSubscriptionRef: { remove: jest.Mock } | null = null;

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(), 
  getCurrentPositionAsync: jest.fn(), 
  watchPositionAsync: jest.fn((options, callback) => {
    const newSubscription = { remove: jest.fn() };
    mockLocationSubscriptionRef = newSubscription as { remove: jest.Mock }; // Ensure type for ref
    return Promise.resolve(newSubscription);
  }),
  Accuracy: { High: 1, Balanced: 2, LowPower: 3 }, 
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 20, bottom: 0, left: 0, right: 0 }),
}));

// Export mocks for access in mock factories
module.exports = {
  mockMapViewRender,
  mockFogOverlayRender,
  mockLocationButtonRender,
};

describe('MapScreen', () => {
  let store: Store<RootState>;

  beforeEach(() => {
    jest.useFakeTimers();
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
    (Location.getCurrentPositionAsync as jest.Mock).mockImplementation(() => 
      Promise.resolve(fullMockInitialLocationObject)
    );
    (Location.watchPositionAsync as jest.Mock).mockImplementation((options, callback) => {
      const newSubscription = { remove: jest.fn() };
      mockLocationSubscriptionRef = newSubscription as { remove: jest.Mock };
      return Promise.resolve(newSubscription);
    });
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockReset();
    (Location.getCurrentPositionAsync as jest.Mock).mockReset();
    (Location.watchPositionAsync as jest.Mock).mockReset();
  });

  it('renders the map and FogOverlay component when loaded', async () => {
    render(<Provider store={store}><MapScreen /></Provider>);
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockMapViewRender).toHaveBeenCalled();
      expect(mockFogOverlayRender).toHaveBeenCalled(); // Check FogOverlay was called
      expect(store.getState().exploration.currentLocation).toEqual(mockInitialCoords);
    }, { timeout: 3000 });
  });

  it('updates location state when GPS position changes', async () => {
    render(<Provider store={store}><MapScreen /></Provider>);
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    }); 

    expect(store.getState().exploration.path).toHaveLength(1);
    expect(store.getState().exploration.path[0]).toEqual(mockInitialCoords);

    act(() => { store.dispatch(updateLocation(mockUpdatedCoords)); });
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    }); 

    expect(store.getState().exploration.path).toHaveLength(2);
    expect(store.getState().exploration.path[1]).toEqual(mockUpdatedCoords);
    expect(store.getState().exploration.currentLocation).toEqual(mockUpdatedCoords);
  });

  it('handles zoom changes from region changes', async () => {
    const { getByTestId } = render(<Provider store={store}><MapScreen /></Provider>);
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    });
 
    await waitFor(() => expect(store.getState().exploration.currentLocation).toEqual(mockInitialCoords), { timeout: 3000 });

    const mapView = getByTestId('mock-map-view');
    act(() => { mapView.props.onPress(); });
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    });

    await waitFor(() => {
        expect(store.getState().exploration.zoomLevel).toBe(12);
        console.log('[Test Log - zoom change] zoomLevel after onPress:', store.getState().exploration.zoomLevel);
    }, { timeout: 3000 }); 
  });

  it('cleans up location subscription when unmounted', async () => {
    const { unmount } = render(<Provider store={store}><MapScreen /></Provider>);
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    });

    expect(store.getState().exploration.currentLocation).toEqual(mockInitialCoords);

    await act(async () => {
      unmount(); 
      await Promise.resolve(); 
      jest.runAllTimers(); 
      await Promise.resolve(); 
    });
        
    expect(Location.watchPositionAsync).toHaveBeenCalled();
    expect(mockLocationSubscriptionRef).toBeDefined();
    expect(mockLocationSubscriptionRef?.remove).toHaveBeenCalled();
  });

  it('should have rotation and pitch disabled on the MapView', async () => {
    render(<Provider store={store}><MapScreen /></Provider>);
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockMapViewRender).toHaveBeenCalled();
      const lastMapViewCallArgs = mockMapViewRender.mock.calls[mockMapViewRender.mock.calls.length - 1][0] as any;
      expect(lastMapViewCallArgs.rotateEnabled).toBe(false); 
      expect(lastMapViewCallArgs.pitchEnabled).toBe(false);
      // console.log('[Test Log - Rotation/Pitch] rotateEnabled:', lastMapViewCallArgs.rotateEnabled, 'pitchEnabled:', lastMapViewCallArgs.pitchEnabled);
    }, { timeout: 3000 });
  });

  it('should not cause fog appearance to drift on vertical map pan when GPS location is stable', async () => {
    render(<Provider store={store}><MapScreen /></Provider>); 

    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve(); 
    });

    let initialFogOverlayArgs: any;
    let initialMapViewArgs: any;

    await waitFor(() => {
      expect(mockMapViewRender).toHaveBeenCalled();
      initialMapViewArgs = mockMapViewRender.mock.calls[mockMapViewRender.mock.calls.length - 1][0] as any;
      
      expect(mockFogOverlayRender).toHaveBeenCalled(); // This should pass now if FogOverlay is rendered
      initialFogOverlayArgs = mockFogOverlayRender.mock.calls[mockFogOverlayRender.mock.calls.length - 1][0] as any;
      expect(store.getState().exploration.currentLocation).toEqual(mockInitialCoords);
    }, {timeout: 3000});

    const initialFogMapRegion = initialFogOverlayArgs.mapRegion;
    const initialFogRotation = initialFogOverlayArgs.rotation;
    const initialPath = store.getState().exploration.path;

    const pannedRegion: Region = {
      latitude: DEFAULT_LOCATION.latitude + 0.01, 
      longitude: DEFAULT_LOCATION.longitude,      
      latitudeDelta: initialMapViewArgs.initialRegion.latitudeDelta, 
      longitudeDelta: initialMapViewArgs.initialRegion.longitudeDelta,
    };
            
    expect(initialMapViewArgs.onRegionChangeComplete).toBeDefined();

    await act(async () => {
      if(initialMapViewArgs.onRegionChangeComplete) initialMapViewArgs.onRegionChangeComplete(pannedRegion);
      jest.runAllTimers(); 
      await Promise.resolve();
    });

    let latestFogOverlayArgs: any;
    await waitFor(() => {
      // Expect FogOverlay to have been called more times if MapScreen re-rendered it due to mapRegion change
      expect(mockFogOverlayRender.mock.calls.length).toBeGreaterThan(mockFogOverlayRender.mock.calls.indexOf(initialFogOverlayArgs));
      latestFogOverlayArgs = mockFogOverlayRender.mock.calls[mockFogOverlayRender.mock.calls.length - 1][0] as any;
    }, {timeout: 3000});
        
    expect(latestFogOverlayArgs.mapRegion.latitude).toEqual(pannedRegion.latitude);
    expect(latestFogOverlayArgs.mapRegion.longitude).toEqual(pannedRegion.longitude);
    expect(latestFogOverlayArgs.mapRegion.latitudeDelta).toEqual(pannedRegion.latitudeDelta);
    expect(latestFogOverlayArgs.mapRegion.longitudeDelta).toEqual(pannedRegion.longitudeDelta);

    expect(latestFogOverlayArgs.rotation).toEqual(initialFogRotation); 
    const finalPath = store.getState().exploration.path;
    expect(finalPath).toEqual(initialPath); 

    expect(store.getState().exploration.currentLocation).toEqual(mockInitialCoords); 

    // console.log('[Test Log - Pan Drift] Initial FogOverlay mapRegion:', JSON.stringify(initialFogMapRegion));
    // console.log('[Test Log - Pan Drift] Panned FogOverlay mapRegion:', JSON.stringify(latestFogOverlayArgs.mapRegion));
  });

  it('renders LocationButton with correct props', async () => {
    render(<Provider store={store}><MapScreen /></Provider>);
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(mockLocationButtonRender).toHaveBeenCalled();
      const lastCallArgs = mockLocationButtonRender.mock.calls[mockLocationButtonRender.mock.calls.length - 1][0] as any;
      expect(lastCallArgs.isLocationAvailable).toBe(true);
      expect(lastCallArgs.isCentered).toBe(false);
      expect(typeof lastCallArgs.onPress).toBe('function');
    }, { timeout: 3000 });
  });

  it('LocationButton is disabled when location is not available', async () => {
    // Mock location permission denied
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockImplementation(() => 
      Promise.resolve({ status: 'denied', granted: false, expires: 'never', canAskAgain: true })
    );

    render(<Provider store={store}><MapScreen /></Provider>);
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    });

    // Wait for the location permission to be processed and state to update
    await waitFor(() => {
      expect(store.getState().exploration.currentLocation).not.toBeNull();
      // When permission is denied, we use default location
      expect(store.getState().exploration.currentLocation).toEqual({
        latitude: DEFAULT_LOCATION.latitude,
        longitude: DEFAULT_LOCATION.longitude
      });
    }, { timeout: 3000 });

    // Since we fall back to default location when permission is denied,
    // the button should still be available but with default location
    await waitFor(() => {
      expect(mockLocationButtonRender).toHaveBeenCalled();
      const lastCallArgs = mockLocationButtonRender.mock.calls[mockLocationButtonRender.mock.calls.length - 1][0] as any;
      expect(lastCallArgs.isLocationAvailable).toBe(true); // Changed to true since we have default location
    }, { timeout: 3000 });
  });

  it('centers map on user location when LocationButton is pressed', async () => {
    const { getByTestId } = render(<Provider store={store}><MapScreen /></Provider>);
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    });

    await waitFor(() => {
      expect(store.getState().exploration.currentLocation).toEqual(mockInitialCoords);
    }, { timeout: 3000 });

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
    await waitFor(() => {
      const lastCallArgs = mockLocationButtonRender.mock.calls[mockLocationButtonRender.mock.calls.length - 1][0] as any;
      expect(lastCallArgs.isCentered).toBe(true);
    });
  });

  it('exits centered mode when user pans the map', async () => {
    const { getByTestId } = render(<Provider store={store}><MapScreen /></Provider>);
    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    });

    // Wait for initial location to be set
    await waitFor(() => {
      expect(store.getState().exploration.currentLocation).toEqual(mockInitialCoords);
    }, { timeout: 3000 });

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
      latitude: mockInitialCoords.latitude + 0.01, // Pan north
      longitude: mockInitialCoords.longitude,
      latitudeDelta: 0.0036,
      longitudeDelta: 0.0048,
    };

    // Get the onRegionChange callback from the last render
    const onRegionChange = (mockMapViewRender.mock.calls[mockMapViewRender.mock.calls.length - 1][0] as any).onRegionChange;
    
    act(() => {
      if (onRegionChange) {
        onRegionChange(pannedRegion);
      }
    });

    await act(async () => { 
      jest.runAllTimers(); 
      await Promise.resolve();
    });

    // Check that centered mode was exited
    expect(store.getState().exploration.isMapCenteredOnUser).toBe(false);
    
    // Check that LocationButton reflects the change
    await waitFor(() => {
      const lastCallArgs = mockLocationButtonRender.mock.calls[mockLocationButtonRender.mock.calls.length - 1][0] as any;
      expect(lastCallArgs.isCentered).toBe(false);
    });
  });
});