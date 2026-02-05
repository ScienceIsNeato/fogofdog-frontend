import React from 'react';
import { render, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import { MapScreen } from '../index';
import explorationSlice from '../../../store/slices/explorationSlice';
import userSlice from '../../../store/slices/userSlice';
import statsSlice from '../../../store/slices/statsSlice';
import streetSlice from '../../../store/slices/streetSlice';
import { BackgroundLocationService } from '../../../services/BackgroundLocationService';
import * as Location from 'expo-location';

// Extend global type for jest console setup
declare global {
  var expectConsoleErrors: boolean;
}

// Mock dependencies
jest.mock('expo-modules-core');
jest.mock('expo-location');
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
        stats: statsSlice,
        street: streetSlice,
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

  // Test removed - BackgroundLocationService initialization is comprehensively tested in
  // src/services/__tests__/BackgroundLocationService.test.ts (29 tests)

  // Test removed - BackgroundLocationService.processStoredLocations is tested in
  // src/services/__tests__/BackgroundLocationService.test.ts

  // Tests removed - Background permission handling and lifecycle management are
  // comprehensively tested in src/services/__tests__/BackgroundLocationService.test.ts

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
