import React from 'react';
import { render, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore, Store } from '@reduxjs/toolkit';
import { MapScreen } from '../index';
import explorationReducer from '../../../store/slices/explorationSlice';
import userReducer from '../../../store/slices/userSlice';
import type { RootState } from '../../../store';
import * as Location from 'expo-location';

// Mock react-native-maps with getCamera support
jest.mock('react-native-maps', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  
  const MockMapView = React.forwardRef((props: any, ref: any) => {
    const { children, onPanDrag, style, initialRegion, ...restProps } = props;

    React.useImperativeHandle(ref, () => ({
      animateToRegion: jest.fn(),
      getCamera: jest.fn(() => Promise.resolve({ heading: 45 })), // Return a heading of 45 degrees
    }));

    return React.createElement(View, {
      testID: 'mock-map-view',
      style: style,
      'data-initialRegion': JSON.stringify(initialRegion),
      onPress: onPanDrag,
      onPanDrag: onPanDrag,
      ...restProps
    }, children);
  });
  MockMapView.displayName = 'MockMapView';

  const MockMarkerComponent = (props: any) => {
    const safeProps = props.coordinate ? {
      latitude: props.coordinate.latitude,
      longitude: props.coordinate.longitude
    } : {};
    return React.createElement(View, {
      testID: 'mock-marker',
      'data-coords': JSON.stringify(safeProps)
    });
  };
  MockMarkerComponent.displayName = 'MockMarker';

  return {
    __esModule: true,
    default: MockMapView, 
    Marker: MockMarkerComponent,
  };
});

// Mock FogOverlay to verify rotation is passed correctly
jest.mock('../../../components/FogOverlay', () => {
  const React = jest.requireActual('react');
  const { View } = jest.requireActual('react-native');
  
  const MockFogOverlay = (props: any) => {
    return React.createElement(View, {
      testID: 'mock-fog-overlay',
      'data-map-region': JSON.stringify(props.mapRegion),
      'data-rotation': props.rotation
    });
  };
  
  return {
    __esModule: true,
    default: MockFogOverlay,
  };
});

// Mock expo-location
const mockLocationCoords = { 
  latitude: 41.6867, 
  longitude: -91.5802 
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
  watchPositionAsync: jest.fn(),
  Accuracy: { High: 1, Balanced: 2, LowPower: 3 },
}));

describe('Map Rotation Tests', () => {
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
    (Location.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue(mockPermissionResponse);
    (Location.getCurrentPositionAsync as jest.Mock).mockResolvedValue(mockLocationObject);
    (Location.watchPositionAsync as jest.Mock).mockImplementation((options, callback) => {
      callback(mockLocationObject);
      return Promise.resolve({ remove: jest.fn() });
    });
  });
  
  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
    jest.resetAllMocks();
  });
  
  it('renders MapView with onPanDrag handler', async () => {
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
    
    // Get the MapView
    const mapView = getByTestId('mock-map-view');
    
    // Verify onPanDrag handler exists
    expect(mapView.props.onPanDrag).toBeDefined();
    expect(typeof mapView.props.onPanDrag).toBe('function');
  });
  
  it('renders FogOverlay with rotation prop', async () => {
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
    
    // Get the FogOverlay component
    const fogOverlay = getByTestId('mock-fog-overlay');
    
    // Verify rotation prop exists (initially 0)
    expect(fogOverlay.props['data-rotation']).toBeDefined();
    expect(typeof fogOverlay.props['data-rotation']).toBe('number');
  });
});