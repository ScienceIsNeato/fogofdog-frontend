import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MapScreen } from '../index';
import explorationSlice from '../../../store/slices/explorationSlice';
import userSlice from '../../../store/slices/userSlice';
import { BackgroundLocationService } from '../../../services/BackgroundLocationService';
import * as Location from 'expo-location';

// Extend global type for jest console setup
declare global {
  // eslint-disable-next-line no-var
  var expectConsoleErrors: boolean;
}

// Mock dependencies
jest.mock('expo-modules-core');
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn(),
  requestBackgroundPermissionsAsync: jest.fn(),
  getForegroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  getCurrentPositionAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  Accuracy: { High: 1, Balanced: 2, LowPower: 3 },
}));
jest.mock('expo-task-manager');
jest.mock('react-native-maps', () => {
  // Use import instead of require to satisfy ESLint
  const ReactNative = jest.requireActual('react-native');
  const { View } = ReactNative;
  return {
    __esModule: true,
    default: View,
    Marker: View,
    PROVIDER_GOOGLE: 'google',
  };
});
jest.mock('../../../services/BackgroundLocationService');
jest.mock('../../../services/GPSInjectionService', () => ({
  GPSInjectionService: {
    startPeriodicCheck: jest.fn(() => jest.fn()),
  },
}));

const mockedLocation = Location as jest.Mocked<typeof Location>;
const mockedBackgroundLocationService = BackgroundLocationService as jest.Mocked<
  typeof BackgroundLocationService
>;

describe('MapScreen - Background Location Integration', () => {
  let store: any;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();

    // Setup store
    store = configureStore({
      reducer: {
        exploration: explorationSlice,
        user: userSlice,
      },
    });

    // Setup Location mocks
    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });

    mockedLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });

    mockedLocation.getForegroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });

    mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });

    mockedLocation.getCurrentPositionAsync.mockResolvedValue({
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

    // Setup BackgroundLocationService mocks
    mockedBackgroundLocationService.initialize.mockResolvedValue();
    mockedBackgroundLocationService.startBackgroundLocationTracking.mockResolvedValue(true);
    mockedBackgroundLocationService.processStoredLocations.mockResolvedValue([]);
    mockedBackgroundLocationService.stopBackgroundLocationTracking.mockResolvedValue();
  });

  it('should initialize BackgroundLocationService when permissions are granted', async () => {
    render(
      <Provider store={store}>
        <MapScreen />
      </Provider>
    );

    // Wait for permission verification to complete first
    await waitFor(
      () => {
        expect(mockedBackgroundLocationService.initialize).toHaveBeenCalled();
      },
      { timeout: 3000 } // Give more time for async permission flow
    );

    await waitFor(() => {
      expect(mockedBackgroundLocationService.startBackgroundLocationTracking).toHaveBeenCalled();
    });
  });

  it('should process stored locations on startup', async () => {
    const storedLocations = [
      { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() - 60000 },
      { latitude: 37.775, longitude: -122.4195, timestamp: Date.now() - 30000 },
    ];

    mockedBackgroundLocationService.processStoredLocations.mockResolvedValue(storedLocations);

    render(
      <Provider store={store}>
        <MapScreen />
      </Provider>
    );

    await waitFor(
      () => {
        expect(mockedBackgroundLocationService.processStoredLocations).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );
  });

  it('should handle background permission denial gracefully', async () => {
    // This test expects console warnings for permission denial
    global.expectConsoleErrors = true;

    mockedLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: true,
      expires: 'never',
    });

    render(
      <Provider store={store}>
        <MapScreen />
      </Provider>
    );

    await waitFor(
      () => {
        expect(mockedBackgroundLocationService.initialize).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    // Should still initialize but not start background tracking
    expect(mockedBackgroundLocationService.startBackgroundLocationTracking).not.toHaveBeenCalled();
  });

  it('should stop background tracking on unmount', async () => {
    const { unmount } = render(
      <Provider store={store}>
        <MapScreen />
      </Provider>
    );

    await waitFor(
      () => {
        expect(mockedBackgroundLocationService.initialize).toHaveBeenCalled();
      },
      { timeout: 3000 }
    );

    unmount();

    expect(mockedBackgroundLocationService.stopBackgroundLocationTracking).toHaveBeenCalled();
  });

  it('should handle foreground permission denial', async () => {
    // This test expects console warnings for permission denial
    global.expectConsoleErrors = true;

    mockedLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.DENIED,
      granted: false,
      canAskAgain: true,
      expires: 'never',
    });

    render(
      <Provider store={store}>
        <MapScreen />
      </Provider>
    );

    // Should not initialize BackgroundLocationService if foreground permissions denied
    await waitFor(() => {
      expect(mockedBackgroundLocationService.initialize).not.toHaveBeenCalled();
    });
  });
});
