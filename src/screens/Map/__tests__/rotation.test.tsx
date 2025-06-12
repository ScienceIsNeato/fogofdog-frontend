import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore, Store } from '@reduxjs/toolkit';
import { MapScreen } from '../index';
import explorationReducer from '../../../store/slices/explorationSlice';
import userReducer from '../../../store/slices/userSlice';
import type { RootState } from '../../../store';
import * as Location from 'expo-location';

// Mock react-native-maps
jest.mock('react-native-maps', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  interface MockMapViewProps {
    rotateEnabled?: boolean;
    pitchEnabled?: boolean;
    initialRegion?: any;
    children?: React.ReactNode;
    style?: any;
  }

  const MockMapView = React.forwardRef((props: MockMapViewProps, ref: React.Ref<unknown>) => {
    const { children, style, initialRegion, ...restProps } = props;

    React.useImperativeHandle(ref, () => ({
      animateToRegion: jest.fn(),
      getCamera: jest.fn(() => Promise.resolve({ heading: 0 })), // Always return 0 heading
    }));

    return React.createElement(
      View,
      {
        testID: 'mock-map-view',
        style: style,
        'data-initialRegion': JSON.stringify(initialRegion),
        'data-rotateEnabled': props.rotateEnabled,
        'data-pitchEnabled': props.pitchEnabled,
        ...restProps,
      } as any,
      children
    );
  });
  MockMapView.displayName = 'MockMapView';

  const MockMarkerComponent = (props: { coordinate?: { latitude: number; longitude: number } }) => {
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
  MockMarkerComponent.displayName = 'MockMarker';

  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMarkerComponent,
  };
});

// Mock FogOverlay (no rotation props expected)
jest.mock('../../../components/FogOverlay', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  const MockFogOverlay = (props: any) => {
    return React.createElement(View, {
      testID: 'mock-fog-overlay',
      'data-map-region': JSON.stringify(props.mapRegion),
    } as any);
  };

  return {
    __esModule: true,
    default: MockFogOverlay,
  };
});

// Mock expo-location
const mockLocationCoords = {
  latitude: 41.6867,
  longitude: -91.5802,
};

const mockLocationObject = {
  coords: {
    latitude: mockLocationCoords.latitude,
    longitude: mockLocationCoords.longitude,
    altitude: null,
    accuracy: null,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: Date.now(),
};

const mockPermissionResponse = {
  status: 'granted',
  granted: true,
  expires: 'never',
  canAskAgain: true,
};

jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  watchPositionAsync: jest.fn((_options, callback) => {
    callback(mockLocationObject);
    return Promise.resolve({ remove: jest.fn() });
  }),
  Accuracy: { High: 1, Balanced: 2, LowPower: 3 },
}));

describe('Map Rotation Disabled Tests', () => {
  let store: Store<RootState>;

  beforeEach(() => {
    jest.useFakeTimers();

    store = configureStore({
      reducer: {
        exploration: explorationReducer,
        user: userReducer,
      },
    });

    // Set up location mocks
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(
      mockPermissionResponse
    );
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(mockLocationObject);
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
    (global as any).expectConsoleErrors = true; // This test expects console errors from background location service

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

  it('renders FogOverlay without rotation props', async () => {
    (global as any).expectConsoleErrors = true; // This test expects console errors from background location service

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

    // Get the FogOverlay component and verify no rotation props
    const fogOverlay = getByTestId('mock-fog-overlay');

    // Verify rotation prop does NOT exist (since we removed rotation entirely)
    expect(fogOverlay.props['data-rotation']).toBeUndefined();

    // Verify it still has the mapRegion prop
    expect(fogOverlay.props['data-map-region']).toBeDefined();
  });
});
