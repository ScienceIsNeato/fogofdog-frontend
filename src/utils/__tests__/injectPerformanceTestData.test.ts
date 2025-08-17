import { performanceTestInjector } from '../injectPerformanceTestData';
import { store } from '../../store';
import { logger } from '../logger';
import { generatePerformanceTestData } from '../performanceTestData';

// Mock dependencies
jest.mock('../../store');
jest.mock('../logger');
jest.mock('../performanceTestData');

const mockStore = store as jest.Mocked<typeof store>;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockGenerateData = generatePerformanceTestData as jest.MockedFunction<
  typeof generatePerformanceTestData
>;

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

  describe('injectCustomData', () => {
    it('should inject custom test data successfully', async () => {
      await performanceTestInjector.injectCustomData(2, 'REALISTIC_DRIVE');

      expect(mockGenerateData).toHaveBeenCalledWith(2, 'realistic_drive', {});
      expect(mockStore.dispatch).toHaveBeenCalledTimes(2); // One for each point
      expect(mockLogger.info).toHaveBeenCalledWith(
        '🚀 Starting injection of 2 custom points (REALISTIC_DRIVE) from default location...'
      );
    });

    it('should handle injection errors gracefully', async () => {
      (mockStore.dispatch as jest.Mock).mockImplementation(() => {
        throw new Error('Test error');
      });

      await performanceTestInjector.injectCustomData(1);

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to inject custom data',
        expect.any(Error)
      );
    });

    it('should prevent concurrent injections', async () => {
      mockGenerateData.mockReturnValue([]);

      // Start first injection
      const firstInjection = performanceTestInjector.injectCustomData(1);

      // Try to start second injection while first is running
      await performanceTestInjector.injectCustomData(1);

      expect(mockLogger.warn).toHaveBeenCalledWith('Data injection already in progress');

      // Wait for first to complete
      await firstInjection;
    });

    it('should use default parameters when not provided', async () => {
      await performanceTestInjector.injectCustomData(5);

      expect(mockGenerateData).toHaveBeenCalledWith(5, 'random_walk', {});
    });

    it('should use custom starting location from Redux state', async () => {
      mockStore.getState = jest.fn(() => ({
        user: { isAuthenticated: false, user: null, isLoading: false, error: null },
        exploration: {
          path: [],
          currentLocation: { latitude: 45.0, longitude: -122.0 },
        },
      })) as any;

      await performanceTestInjector.injectCustomData(3, 'REALISTIC_DRIVE');

      expect(mockGenerateData).toHaveBeenCalledWith(3, 'realistic_drive', {
        startingLocation: { latitude: 45.0, longitude: -122.0 },
      });
    });
  });
});
