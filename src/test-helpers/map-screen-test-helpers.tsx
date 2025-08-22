import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import {
  createMockStoreWithUser,
  testUsers,
  mockNavigation,
  createMockRoute,
} from './shared-mocks';

// Common mock props for MapScreen components
export const mockMapProps = {
  navigation: mockNavigation,
  route: createMockRoute('Map'),
};

// Mock location data
export const mockLocation = {
  coords: {
    latitude: 37.78825,
    longitude: -122.4324,
    altitude: 0,
    accuracy: 5,
    altitudeAccuracy: null,
    heading: null,
    speed: null,
  },
  timestamp: Date.now(),
};

// Mock exploration path
export const mockExplorationPath = [
  { latitude: 37.78825, longitude: -122.4324 },
  { latitude: 37.78845, longitude: -122.4344 },
  { latitude: 37.78865, longitude: -122.4364 },
];

// Store with exploration data
export const createMapStoreWithExploration = (pathLength = 3) => {
  const store = createMockStoreWithUser(testUsers.defaultUser);

  // Dispatch some exploration data
  store.dispatch({
    type: 'exploration/setCurrentLocation',
    payload: mockLocation,
  });

  // Add path points
  for (let i = 0; i < pathLength; i++) {
    store.dispatch({
      type: 'exploration/addPathPoint',
      payload: mockExplorationPath[i % mockExplorationPath.length],
    });
  }

  return store;
};

// Mock services setup
export const setupServiceMocks = () => {
  const mocks = {
    LocationStorageService: {
      getAllStoredLocations: jest.fn().mockResolvedValue([]),
      storeLocation: jest.fn().mockResolvedValue(undefined),
      clearStoredLocations: jest.fn().mockResolvedValue(undefined),
    },
    DataClearingService: {
      getDataStats: jest.fn().mockResolvedValue({
        totalPoints: 6,
        recentPoints: 0,
        oldestDate: null,
        newestDate: null,
      }),
      clearDataByTimeRange: jest.fn().mockResolvedValue(undefined),
      clearAllData: jest.fn().mockResolvedValue(undefined),
    },
    AuthPersistenceService: {
      saveExplorationState: jest.fn().mockResolvedValue(undefined),
      getExplorationState: jest.fn().mockResolvedValue(null),
    },
    BackgroundLocationService: {
      initialize: jest.fn().mockResolvedValue(undefined),
      startBackgroundLocationTracking: jest.fn().mockResolvedValue(undefined),
      stopBackgroundLocationTracking: jest.fn().mockResolvedValue(undefined),
    },
  };

  // Apply mocks
  jest.doMock('../../services/LocationStorageService', () => ({
    default: mocks.LocationStorageService,
  }));

  jest.doMock('../../services/DataClearingService', () => ({
    default: mocks.DataClearingService,
  }));

  jest.doMock('../../services/AuthPersistenceService', () => ({
    default: mocks.AuthPersistenceService,
  }));

  jest.doMock('../../services/BackgroundLocationService', () => ({
    default: mocks.BackgroundLocationService,
  }));

  return mocks;
};

// Expo Location mock
export const mockExpoLocation = () => {
  jest.doMock('expo-location', () => ({
    requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({
      status: 'granted',
    }),
    requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue({
      status: 'granted',
    }),
    getCurrentPositionAsync: jest.fn().mockResolvedValue(mockLocation),
    watchPositionAsync: jest.fn().mockResolvedValue({
      remove: jest.fn(),
    }),
    LocationAccuracy: {
      High: 4,
    },
  }));
};

// React Native Maps mock
export const mockMapView = () => {
  jest.doMock('react-native-maps', () => ({
    default: 'MapView',
    Marker: 'Marker',
    Circle: 'Circle',
    Polyline: 'Polyline',
  }));
};

// Complete mock setup for MapScreen tests
export const setupMapScreenMocks = () => {
  const serviceMocks = setupServiceMocks();
  mockExpoLocation();
  mockMapView();

  return serviceMocks;
};

// Test wrapper factory for MapScreen components
export const createMapScreenTestWrapper = (store = createMapStoreWithExploration()) => {
  const MapScreenTestWrapper = ({ children }: { children: React.ReactNode }) => (
    <Provider store={store}>{children}</Provider>
  );

  MapScreenTestWrapper.displayName = 'MapScreenTestWrapper';
  return MapScreenTestWrapper;
};

// Common test scenarios for MapScreen
export const runMapScreenRenderTest = (Component: React.ComponentType<any>, props = {}) => {
  const store = createMapStoreWithExploration();
  const TestWrapper = createMapScreenTestWrapper(store);
  const renderResult = render(
    React.createElement(
      TestWrapper,
      null,
      React.createElement(Component, { ...mockMapProps, ...props })
    )
  );

  return { ...renderResult, store };
};

// Background service test helpers
export const expectBackgroundServiceToBeRunning = (mocks: ReturnType<typeof setupServiceMocks>) => {
  expect(mocks.BackgroundLocationService.initialize).toHaveBeenCalled();
  expect(mocks.BackgroundLocationService.startBackgroundLocationTracking).toHaveBeenCalled();
};

export const expectDataPersistence = (mocks: ReturnType<typeof setupServiceMocks>) => {
  expect(mocks.AuthPersistenceService.saveExplorationState).toHaveBeenCalled();
};
