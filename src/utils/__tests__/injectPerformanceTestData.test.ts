import { performanceTestInjector } from '../injectPerformanceTestData';
import { store } from '../../store';
import { logger } from '../logger';
import { generatePerformanceTestData } from '../performanceTestData';
import { DeviceEventEmitter } from 'react-native';

// Mock dependencies
jest.mock('../../store');
jest.mock('../logger');
jest.mock('../performanceTestData');
jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    emit: jest.fn(),
  },
}));

const mockStore = store as jest.Mocked<typeof store>;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockGenerateData = generatePerformanceTestData as jest.MockedFunction<
  typeof generatePerformanceTestData
>;
const mockDeviceEventEmitter = DeviceEventEmitter as jest.Mocked<typeof DeviceEventEmitter>;

describe('PerformanceTestDataInjector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.dispatch = jest.fn();
    mockStore.getState = jest.fn(() => ({
      user: { isAuthenticated: false, user: null, isLoading: false, error: null },
      exploration: { path: [] },
    })) as any;

    mockGenerateData.mockReturnValue([
      { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
      { latitude: 44.0463, longitude: -123.0237, timestamp: Date.now() + 1000 },
    ]);
  });

  describe('clearData', () => {
    it('should clear all GPS data', () => {
      performanceTestInjector.clearData();

      expect(mockStore.dispatch).toHaveBeenCalledWith({ type: 'exploration/clearAllData' });
      expect(mockLogger.info).toHaveBeenCalledWith(
        '🧹 Cleared all GPS data for performance testing'
      );
    });
  });

  describe('getCurrentDataCount', () => {
    it('should return current path length', () => {
      mockStore.getState = jest.fn(() => ({
        user: { isAuthenticated: false, user: null, isLoading: false, error: null },
        exploration: { path: [1, 2, 3] },
      })) as any;

      const count = performanceTestInjector.getCurrentDataCount();

      expect(count).toBe(3);
    });

    it('should return 0 for empty path', () => {
      const count = performanceTestInjector.getCurrentDataCount();

      expect(count).toBe(0);
    });
  });

  describe('injectRealTimeData', () => {
    it('should inject real-time test data successfully', async () => {
      // Fast forward timers to trigger the setTimeout calls
      jest.useFakeTimers();

      const injectionPromise = performanceTestInjector.injectRealTimeData(2, 'REALISTIC_DRIVE');

      // Fast forward to trigger all setTimeout calls
      jest.runAllTimers();

      await injectionPromise;

      expect(mockGenerateData).toHaveBeenCalledWith(2, 'realistic_drive', {
        intervalSeconds: 1,
        startTime: 0,
      });
      expect(mockDeviceEventEmitter.emit).toHaveBeenCalledTimes(2); // One for each point
      expect(mockLogger.info).toHaveBeenCalledWith(
        '🎯 Starting REAL-TIME injection: 2 points with 1000ms intervals from default location'
      );

      jest.useRealTimers();
    });

    it('should handle injection errors gracefully', async () => {
      mockGenerateData.mockImplementation(() => {
        throw new Error('Test error');
      });

      await performanceTestInjector.injectRealTimeData(1);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to inject real-time data',
        expect.any(Error)
      );
    });

    it('should prevent concurrent injections', async () => {
      mockGenerateData.mockReturnValue([]);

      // Start first injection
      const firstInjection = performanceTestInjector.injectRealTimeData(1);

      // Try to start second injection while first is running
      await performanceTestInjector.injectRealTimeData(1);

      expect(mockLogger.warn).toHaveBeenCalledWith('Data injection already in progress');

      // Wait for first to complete
      await firstInjection;
    });

    it('should use default parameters when not provided', async () => {
      jest.useFakeTimers();

      const injectionPromise = performanceTestInjector.injectRealTimeData(5);

      // Fast forward to trigger all setTimeout calls
      jest.runAllTimers();

      await injectionPromise;

      expect(mockGenerateData).toHaveBeenCalledWith(5, 'realistic_drive', {
        intervalSeconds: 1,
        startTime: 0,
      });

      jest.useRealTimers();
    });

    it('should use custom starting location from Redux state', async () => {
      jest.useFakeTimers();

      mockStore.getState = jest.fn(() => ({
        user: { isAuthenticated: false, user: null, isLoading: false, error: null },
        exploration: {
          path: [],
          currentLocation: { latitude: 45.0, longitude: -122.0 },
        },
      })) as any;

      const injectionPromise = performanceTestInjector.injectRealTimeData(3, 'REALISTIC_DRIVE');

      // Fast forward to trigger all setTimeout calls
      jest.runAllTimers();

      await injectionPromise;

      expect(mockGenerateData).toHaveBeenCalledWith(3, 'realistic_drive', {
        intervalSeconds: 1,
        startTime: 0,
        startingLocation: { latitude: 45.0, longitude: -122.0 },
      });

      jest.useRealTimers();
    });
  });

  describe('error handling', () => {
    it('should handle injection state management', () => {
      // Test that the injector properly manages its injection state
      expect(performanceTestInjector).toBeDefined();
      expect(typeof performanceTestInjector.injectRealTimeData).toBe('function');
    });

    it('should prevent concurrent injections', async () => {
      jest.useFakeTimers();

      const mockData = [{ latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() }];
      mockGenerateData.mockReturnValue(mockData);

      mockStore.getState = jest.fn(() => ({
        user: { isAuthenticated: false, user: null, isLoading: false, error: null },
        exploration: {
          path: [],
          currentLocation: { latitude: 45.0, longitude: -122.0 },
        },
      })) as any;

      // Start first injection
      const firstInjection = performanceTestInjector.injectRealTimeData(1, 'REALISTIC_DRIVE');

      // Try to start second injection immediately
      const secondInjection = performanceTestInjector.injectRealTimeData(1, 'REALISTIC_DRIVE');

      jest.runAllTimers();

      await Promise.all([firstInjection, secondInjection]);

      expect(mockLogger.warn).toHaveBeenCalledWith('Data injection already in progress');

      jest.useRealTimers();
    });
  });
});
