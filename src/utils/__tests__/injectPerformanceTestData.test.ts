import { performanceTestInjector } from '../injectPerformanceTestData';
import { store } from '../../store';
import { logger } from '../logger';
import { generatePerformanceTestData, generateStreetAlignedTestData } from '../performanceTestData';
import { computeExploredIds } from '../../services/StreetDataService';
import { markSegmentsExplored, markIntersectionsExplored } from '../../store/slices/streetSlice';
import { DeviceEventEmitter } from 'react-native';

// Mock dependencies
jest.mock('../../store');
jest.mock('../logger');
jest.mock('../performanceTestData');
jest.mock('../../services/StreetDataService');
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
const mockGenerateStreetAligned = generateStreetAlignedTestData as jest.MockedFunction<
  typeof generateStreetAlignedTestData
>;
const mockComputeExploredIds = computeExploredIds as jest.MockedFunction<typeof computeExploredIds>;

describe('PerformanceTestDataInjector', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockStore.dispatch = jest.fn();
    mockStore.getState = jest.fn(() => ({
      user: { isAuthenticated: false, user: null, isLoading: false, error: null },
      exploration: { path: [] },
      street: {
        preferStreets: false,
        segments: {},
        exploredSegmentIds: [],
        intersections: {},
        preferUnexplored: false,
      },
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
        '🎯 Starting REAL-TIME injection: 2 points with 3000ms intervals from default location'
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
        street: {
          preferStreets: false,
          segments: {},
          exploredSegmentIds: [],
          intersections: {},
          preferUnexplored: false,
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

  describe('street-aligned path generation', () => {
    beforeEach(() => {
      mockStore.getState = jest.fn(() => ({
        user: { isAuthenticated: false, user: null, isLoading: false, error: null },
        exploration: { path: [], currentLocation: { latitude: 44.046, longitude: -123.024 } },
        street: {
          preferStreets: true,
          segments: { seg_1: { id: 'seg_1', streetName: 'Oak St' } },
          intersections: { n1: { id: 'n1' } },
          exploredSegmentIds: [],
          preferUnexplored: false,
        },
      })) as any;

      mockGenerateStreetAligned.mockReturnValue([
        { latitude: 44.046, longitude: -123.024, timestamp: 0 },
        { latitude: 44.047, longitude: -123.025, timestamp: 1000 },
      ]);
    });

    it('should delegate to street generator and dispatch explored IDs', async () => {
      jest.useFakeTimers();
      mockComputeExploredIds.mockReturnValue({ segmentIds: ['seg_1'], intersectionIds: ['n1'] });

      const injectionPromise = performanceTestInjector.injectRealTimeData(2);
      jest.runAllTimers();
      await injectionPromise;

      expect(mockGenerateStreetAligned).toHaveBeenCalled();
      expect(mockGenerateData).not.toHaveBeenCalled();
      expect(mockComputeExploredIds).toHaveBeenCalled();
      expect(mockStore.dispatch).toHaveBeenCalledWith(markSegmentsExplored(['seg_1']));
      expect(mockStore.dispatch).toHaveBeenCalledWith(markIntersectionsExplored(['n1']));

      jest.useRealTimers();
    });

    it('should skip exploration dispatch when computeExploredIds returns empty', async () => {
      jest.useFakeTimers();
      mockComputeExploredIds.mockReturnValue({ segmentIds: [], intersectionIds: [] });

      const injectionPromise = performanceTestInjector.injectRealTimeData(2);
      jest.runAllTimers();
      await injectionPromise;

      expect(mockGenerateStreetAligned).toHaveBeenCalled();
      expect(mockStore.dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'street/markSegmentsExplored' })
      );
      expect(mockStore.dispatch).not.toHaveBeenCalledWith(
        expect.objectContaining({ type: 'street/markIntersectionsExplored' })
      );

      jest.useRealTimers();
    });

    it('should pass preferUnexplored flag when enabled', async () => {
      jest.useFakeTimers();

      // Enable preferUnexplored in state
      mockStore.getState = jest.fn(() => ({
        user: { isAuthenticated: false, user: null, isLoading: false, error: null },
        exploration: { path: [], currentLocation: { latitude: 44.046, longitude: -123.024 } },
        street: {
          preferStreets: true,
          preferUnexplored: true,
          segments: { seg_1: { id: 'seg_1', streetName: 'Oak St' } },
          intersections: { n1: { id: 'n1' } },
          exploredSegmentIds: ['seg_already_explored'],
        },
      })) as any;

      mockComputeExploredIds.mockReturnValue({ segmentIds: [], intersectionIds: [] });

      const injectionPromise = performanceTestInjector.injectRealTimeData(2);
      jest.runAllTimers();
      await injectionPromise;

      // Verify generateStreetAlignedTestData was called with preferUnexplored options
      expect(mockGenerateStreetAligned).toHaveBeenCalledWith(
        2,
        expect.any(Object),
        expect.objectContaining({
          preferUnexplored: true,
          exploredSegmentIds: ['seg_already_explored'],
        })
      );

      jest.useRealTimers();
    });

    it('should fall back to random walk when preferStreets is disabled', async () => {
      jest.useFakeTimers();

      // Disable preferStreets
      mockStore.getState = jest.fn(() => ({
        user: { isAuthenticated: false, user: null, isLoading: false, error: null },
        exploration: { path: [], currentLocation: { latitude: 44.046, longitude: -123.024 } },
        street: {
          preferStreets: false,
          preferUnexplored: true, // Should be ignored since preferStreets is false
          segments: { seg_1: { id: 'seg_1' } },
          intersections: { n1: { id: 'n1' } },
          exploredSegmentIds: [],
        },
      })) as any;

      mockGenerateData.mockReturnValue([
        { latitude: 44.046, longitude: -123.024, timestamp: 0 },
      ]);

      const injectionPromise = performanceTestInjector.injectRealTimeData(1);
      jest.runAllTimers();
      await injectionPromise;

      // Should use regular generator, not street-aligned
      expect(mockGenerateData).toHaveBeenCalled();
      expect(mockGenerateStreetAligned).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should fall back to random walk when no street data is loaded', async () => {
      jest.useFakeTimers();

      // preferStreets is true, but no segments loaded
      mockStore.getState = jest.fn(() => ({
        user: { isAuthenticated: false, user: null, isLoading: false, error: null },
        exploration: { path: [], currentLocation: { latitude: 44.046, longitude: -123.024 } },
        street: {
          preferStreets: true,
          preferUnexplored: false,
          segments: {}, // Empty
          intersections: {},
          exploredSegmentIds: [],
        },
      })) as any;

      mockGenerateData.mockReturnValue([
        { latitude: 44.046, longitude: -123.024, timestamp: 0 },
      ]);

      const injectionPromise = performanceTestInjector.injectRealTimeData(1);
      jest.runAllTimers();
      await injectionPromise;

      // Should fall back to regular generator since no street data
      expect(mockGenerateData).toHaveBeenCalled();
      expect(mockGenerateStreetAligned).not.toHaveBeenCalled();

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
        street: {
          preferStreets: false,
          segments: {},
          exploredSegmentIds: [],
          intersections: {},
          preferUnexplored: false,
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
