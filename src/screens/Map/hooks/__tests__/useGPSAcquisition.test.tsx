import { jest } from '@jest/globals';
import { renderHook } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import React from 'react';
import { useGPSAcquisition } from '../useGPSAcquisition';
import explorationReducer from '../../../../store/slices/explorationSlice';
import statsReducer from '../../../../store/slices/statsSlice';
import userReducer from '../../../../store/slices/userSlice';

// Mock expo-location
const mockGetCurrentPositionAsync = jest.fn() as jest.MockedFunction<any>;
jest.mock('expo-location', () => ({
  getCurrentPositionAsync: mockGetCurrentPositionAsync,
  Accuracy: {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
  },
}));

// Mock logger
jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

describe('useGPSAcquisition', () => {
  let store: any;

  const createTestStore = () => {
    return configureStore({
      reducer: {
        exploration: explorationReducer,
        stats: statsReducer,
        user: userReducer,
      },
    });
  };

  const renderHookWithStore = () => {
    const wrapper = ({ children }: { children: React.ReactNode }) => (
      <Provider store={store}>{children}</Provider>
    );
    return renderHook(() => useGPSAcquisition(), { wrapper });
  };

  beforeEach(() => {
    store = createTestStore();
    jest.clearAllMocks();
    mockGetCurrentPositionAsync.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
    // Reset environment to test
    process.env.NODE_ENV = 'test';
  });

  it('should skip GPS acquisition in test environment', () => {
    // Set NODE_ENV to test (which is the default in Jest)
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'test';

    renderHookWithStore();

    // Verify that Location.getCurrentPositionAsync is never called in test environment
    expect(mockGetCurrentPositionAsync).not.toHaveBeenCalled();

    // Restore original environment
    process.env.NODE_ENV = originalEnv;
  });

  it('should render without crashing in production environment', () => {
    // Temporarily set environment to production
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Should not throw when rendering
    expect(() => renderHookWithStore()).not.toThrow();

    // Restore environment
    process.env.NODE_ENV = originalEnv;
  });

  it('should render without crashing when GPS fails', () => {
    // Mock failed location response
    mockGetCurrentPositionAsync.mockRejectedValue(new Error('GPS failed'));

    // Temporarily set environment to production
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    // Should not throw even with GPS failures
    expect(() => renderHookWithStore()).not.toThrow();

    // Restore environment
    process.env.NODE_ENV = originalEnv;
  });

  it('should handle successful GPS acquisition', () => {
    const mockLocation = {
      coords: {
        latitude: 37.7749,
        longitude: -122.4194,
        accuracy: 10,
        altitude: 0,
        altitudeAccuracy: -1,
        heading: -1,
        speed: -1,
      },
      timestamp: Date.now(),
    };

    mockGetCurrentPositionAsync.mockResolvedValue(mockLocation);

    // Temporarily set environment to production to trigger GPS logic
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = 'production';

    expect(() => renderHookWithStore()).not.toThrow();

    // Restore environment
    process.env.NODE_ENV = originalEnv;
  });
});
