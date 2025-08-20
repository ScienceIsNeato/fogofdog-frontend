import AsyncStorage from '@react-native-async-storage/async-storage';
import { StatsPersistenceService } from '../StatsPersistenceService';
import { ExplorationStats } from '../StatsCalculationService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('StatsPersistenceService', () => {
  const mockStats: ExplorationStats = {
    distance: 1500.5,
    area: 25000.75,
    time: 3600000, // 1 hour
  };

  const validPersistentData = {
    totalStats: mockStats,
    lastUpdated: Date.now(),
    version: '1.0.0',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  describe('loadStats', () => {
    it('should return null when no data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await StatsPersistenceService.loadStats();

      expect(result).toBeNull();
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('fogofdog_exploration_stats');
    });

    it('should load and return valid persistent stats', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(validPersistentData));

      const result = await StatsPersistenceService.loadStats();

      expect(result).toEqual(mockStats);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('fogofdog_exploration_stats');
    });

    it('should return null for invalid data structure', async () => {
      global.expectConsoleErrors = true; // This test expects console warnings

      const invalidData = {
        totalStats: { distance: -1 }, // Invalid negative distance
        lastUpdated: Date.now(),
        version: '1.0.0',
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(invalidData));

      const result = await StatsPersistenceService.loadStats();

      expect(result).toBeNull();
    });

    it('should return null for corrupted JSON data', async () => {
      global.expectConsoleErrors = true; // This test expects console errors

      mockAsyncStorage.getItem.mockResolvedValue('invalid json data');

      const result = await StatsPersistenceService.loadStats();

      expect(result).toBeNull();
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      global.expectConsoleErrors = true; // This test expects console errors

      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await StatsPersistenceService.loadStats();

      expect(result).toBeNull();
    });

    it('should validate all required fields', async () => {
      global.expectConsoleErrors = true; // This test expects console warnings

      const incompleteData = {
        totalStats: {
          distance: 100,
          area: 50,
          // Missing time field
        },
        lastUpdated: Date.now(),
        version: '1.0.0',
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(incompleteData));

      const result = await StatsPersistenceService.loadStats();

      expect(result).toBeNull();
    });
  });

  describe('saveStats', () => {
    it('should save stats with debouncing', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();

      // Call saveStats (should be debounced)
      StatsPersistenceService.saveStats(mockStats);

      // Verify no immediate save
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();

      // Fast-forward past debounce time and flush promises
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Flush microtasks

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'fogofdog_exploration_stats',
        expect.stringContaining('"distance":1500.5')
      );
    });

    it('should debounce multiple rapid saves', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();

      // Make multiple rapid calls
      StatsPersistenceService.saveStats(mockStats);
      StatsPersistenceService.saveStats(mockStats);
      StatsPersistenceService.saveStats(mockStats);

      // Fast-forward past debounce time
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Flush microtasks

      // Should only save once
      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
    });

    it('should handle save errors gracefully', async () => {
      global.expectConsoleErrors = true; // This test expects console errors

      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      // This should not throw an error - the debounced save catches errors internally
      expect(() => {
        StatsPersistenceService.saveStats(mockStats);
        jest.advanceTimersByTime(5000);
      }).not.toThrow();

      await Promise.resolve(); // Flush microtasks

      // Should have attempted to save
      expect(mockAsyncStorage.setItem).toHaveBeenCalled();
    });
  });

  describe('saveStatsImmediate', () => {
    it('should save stats immediately without debouncing', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();

      await StatsPersistenceService.saveStatsImmediate(mockStats);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'fogofdog_exploration_stats',
        expect.stringContaining('"distance":1500.5')
      );
    });

    it('should cancel pending debounced saves', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();

      // Start a debounced save
      StatsPersistenceService.saveStats(mockStats);

      // Immediately save (should cancel debounced save)
      await StatsPersistenceService.saveStatsImmediate(mockStats);

      // Fast-forward past debounce time
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Flush microtasks

      // Should only have saved once (immediate save)
      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(1);
    });

    it('should throw error on save failure', async () => {
      global.expectConsoleErrors = true; // This test expects console errors

      const error = new Error('Storage error');
      mockAsyncStorage.setItem.mockRejectedValue(error);

      await expect(StatsPersistenceService.saveStatsImmediate(mockStats)).rejects.toThrow(
        'Storage error'
      );
    });

    it('should save data with correct structure', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();

      await StatsPersistenceService.saveStatsImmediate(mockStats);

      const savedData = JSON.parse(mockAsyncStorage.setItem.mock.calls[0]![1] as string);

      expect(savedData).toMatchObject({
        totalStats: mockStats,
        version: '1.0.0',
      });
      expect(savedData.lastUpdated).toBeGreaterThan(0);
    });
  });

  describe('clearStats', () => {
    it('should remove stats from storage', async () => {
      mockAsyncStorage.removeItem.mockResolvedValue();

      await StatsPersistenceService.clearStats();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('fogofdog_exploration_stats');
    });

    it('should cancel pending saves when clearing', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();
      mockAsyncStorage.removeItem.mockResolvedValue();

      // Start a debounced save
      StatsPersistenceService.saveStats(mockStats);

      // Clear stats (should cancel save)
      await StatsPersistenceService.clearStats();

      // Fast-forward past debounce time
      jest.advanceTimersByTime(5000);
      await Promise.resolve(); // Flush microtasks

      // Should not have saved
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
      expect(mockAsyncStorage.removeItem).toHaveBeenCalled();
    });

    it('should throw error on clear failure', async () => {
      global.expectConsoleErrors = true; // This test expects console errors

      const error = new Error('Storage error');
      mockAsyncStorage.removeItem.mockRejectedValue(error);

      await expect(StatsPersistenceService.clearStats()).rejects.toThrow('Storage error');
    });
  });

  describe('hasPersistedStats', () => {
    it('should return true when data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('some data');

      const result = await StatsPersistenceService.hasPersistedStats();

      expect(result).toBe(true);
    });

    it('should return false when no data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await StatsPersistenceService.hasPersistedStats();

      expect(result).toBe(false);
    });

    it('should return false on storage error', async () => {
      global.expectConsoleErrors = true; // This test expects console errors

      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await StatsPersistenceService.hasPersistedStats();

      expect(result).toBe(false);
    });
  });

  describe('getStatsMetadata', () => {
    it('should return metadata when data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(validPersistentData));

      const result = await StatsPersistenceService.getStatsMetadata();

      expect(result).toEqual({
        lastUpdated: validPersistentData.lastUpdated,
        version: validPersistentData.version,
      });
    });

    it('should return null when no data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await StatsPersistenceService.getStatsMetadata();

      expect(result).toBeNull();
    });

    it('should return null on parsing error', async () => {
      global.expectConsoleErrors = true; // This test expects console errors

      mockAsyncStorage.getItem.mockResolvedValue('invalid json');

      const result = await StatsPersistenceService.getStatsMetadata();

      expect(result).toBeNull();
    });
  });

  describe('exportStatsData', () => {
    it('should export raw data', async () => {
      const rawData = JSON.stringify(validPersistentData);
      mockAsyncStorage.getItem.mockResolvedValue(rawData);

      const result = await StatsPersistenceService.exportStatsData();

      expect(result).toBe(rawData);
    });

    it('should return null on error', async () => {
      global.expectConsoleErrors = true; // This test expects console errors

      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await StatsPersistenceService.exportStatsData();

      expect(result).toBeNull();
    });
  });

  describe('importStatsData', () => {
    it('should import valid data successfully', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();
      const rawData = JSON.stringify(validPersistentData);

      const result = await StatsPersistenceService.importStatsData(rawData);

      expect(result).toBe(true);
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith('fogofdog_exploration_stats', rawData);
    });

    it('should reject invalid data', async () => {
      global.expectConsoleErrors = true; // This test expects console warnings

      const invalidData = JSON.stringify({ invalid: 'data' });

      const result = await StatsPersistenceService.importStatsData(invalidData);

      expect(result).toBe(false);
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('should reject malformed JSON', async () => {
      global.expectConsoleErrors = true; // This test expects console errors

      const result = await StatsPersistenceService.importStatsData('invalid json');

      expect(result).toBe(false);
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('should return false on storage error', async () => {
      global.expectConsoleErrors = true; // This test expects console errors

      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));
      const rawData = JSON.stringify(validPersistentData);

      const result = await StatsPersistenceService.importStatsData(rawData);

      expect(result).toBe(false);
    });
  });
});
