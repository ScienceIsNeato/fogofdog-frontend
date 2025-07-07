import { DataClearingService } from '../DataClearingService';
import { LocationStorageService } from '../LocationStorageService';
import { AuthPersistenceService } from '../AuthPersistenceService';
import { store } from '../../store';
import { clearRecentData, clearAllData } from '../../store/slices/explorationSlice';

// Mock the dependencies
jest.mock('../LocationStorageService');
jest.mock('../AuthPersistenceService');
jest.mock('../../store');

const mockLocationStorageService = LocationStorageService as jest.Mocked<
  typeof LocationStorageService
>;
const mockAuthPersistenceService = AuthPersistenceService as jest.Mocked<
  typeof AuthPersistenceService
>;
const mockStore = store as jest.Mocked<typeof store>;

describe('DataClearingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock store.getState()
    mockStore.getState = jest.fn().mockReturnValue({
      exploration: {
        path: [
          { latitude: 40.7128, longitude: -74.006 },
          { latitude: 34.0522, longitude: -118.2437 },
        ],
        exploredAreas: [{ latitude: 37.7749, longitude: -122.4194 }],
        currentLocation: { latitude: 40.7128, longitude: -74.006 },
        zoomLevel: 14,
      },
    });

    // Mock store.dispatch()
    mockStore.dispatch = jest.fn();
  });

  describe('getDataStats', () => {
    it('should return correct data statistics', async () => {
      const mockStoredLocations = [
        { latitude: 40.7128, longitude: -74.006, timestamp: Date.now() - 1000 },
        { latitude: 34.0522, longitude: -118.2437, timestamp: Date.now() - 25 * 60 * 60 * 1000 }, // 25 hours ago
      ];

      mockLocationStorageService.getStoredBackgroundLocations.mockResolvedValue(
        mockStoredLocations
      );

      const stats = await DataClearingService.getDataStats();

      expect(stats.totalPoints).toBe(5); // 2 path + 1 explored + 2 stored
      expect(stats.recentPoints).toBe(1); // Only 1 location within 24 hours
      expect(stats.oldestDate).toBeInstanceOf(Date);
      expect(stats.newestDate).toBeInstanceOf(Date);
    });

    it('should handle empty data gracefully', async () => {
      mockStore.getState = jest.fn().mockReturnValue({
        exploration: {
          path: [],
          exploredAreas: [],
          currentLocation: null,
          zoomLevel: 14,
        },
      });

      mockLocationStorageService.getStoredBackgroundLocations.mockResolvedValue([]);

      const stats = await DataClearingService.getDataStats();

      expect(stats.totalPoints).toBe(0);
      expect(stats.recentPoints).toBe(0);
      expect(stats.oldestDate).toBeNull();
      expect(stats.newestDate).toBeNull();
    });

    it('should handle errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockLocationStorageService.getStoredBackgroundLocations.mockRejectedValue(
        new Error('Storage error')
      );

      const stats = await DataClearingService.getDataStats();

      expect(stats).toEqual({
        totalPoints: 0,
        recentPoints: 0,
        oldestDate: null,
        newestDate: null,
      });

      consoleSpy.mockRestore();
    });
  });

  describe('clearAllData', () => {
    it('should clear all data successfully', async () => {
      mockLocationStorageService.clearStoredBackgroundLocations.mockResolvedValue();
      mockAuthPersistenceService.saveExplorationState.mockResolvedValue();

      await DataClearingService.clearAllData();

      expect(mockLocationStorageService.clearStoredBackgroundLocations).toHaveBeenCalled();
      expect(mockStore.dispatch).toHaveBeenCalledWith(clearAllData());
      expect(mockAuthPersistenceService.saveExplorationState).toHaveBeenCalled();
    });

    it('should handle errors during clearing', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockLocationStorageService.clearStoredBackgroundLocations.mockRejectedValue(
        new Error('Clear error')
      );

      await expect(DataClearingService.clearAllData()).rejects.toThrow('Clear error');

      consoleSpy.mockRestore();
    });
  });

  describe('clearDataByTimeRange', () => {
    it('should clear data by time range successfully', async () => {
      const startTime = Date.now() - 24 * 60 * 60 * 1000; // 24 hours ago
      const mockStoredLocations = [
        { latitude: 40.7128, longitude: -74.006, timestamp: Date.now() - 48 * 60 * 60 * 1000 }, // 48 hours ago (keep)
        { latitude: 34.0522, longitude: -118.2437, timestamp: Date.now() - 12 * 60 * 60 * 1000 }, // 12 hours ago (clear)
      ];

      mockLocationStorageService.getStoredBackgroundLocations.mockResolvedValue(
        mockStoredLocations
      );
      mockLocationStorageService.clearStoredBackgroundLocations.mockResolvedValue();
      mockLocationStorageService.storeBackgroundLocation.mockResolvedValue();
      mockAuthPersistenceService.saveExplorationState.mockResolvedValue();

      await DataClearingService.clearDataByTimeRange(startTime);

      expect(mockLocationStorageService.getStoredBackgroundLocations).toHaveBeenCalled();
      expect(mockLocationStorageService.clearStoredBackgroundLocations).toHaveBeenCalled();
      expect(mockLocationStorageService.storeBackgroundLocation).toHaveBeenCalledWith(
        mockStoredLocations[0]
      );
      expect(mockStore.dispatch).toHaveBeenCalledWith(clearRecentData(24));
      expect(mockAuthPersistenceService.saveExplorationState).toHaveBeenCalled();
    });

    it('should handle errors during time range clearing', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const startTime = Date.now() - 24 * 60 * 60 * 1000;
      mockLocationStorageService.getStoredBackgroundLocations.mockRejectedValue(
        new Error('Get error')
      );

      await expect(DataClearingService.clearDataByTimeRange(startTime)).rejects.toThrow(
        'Get error'
      );

      consoleSpy.mockRestore();
    });
  });

  describe('clearStoredLocations', () => {
    it('should clear all stored locations when no time range provided', async () => {
      mockLocationStorageService.clearStoredBackgroundLocations.mockResolvedValue();

      await DataClearingService.clearStoredLocations();

      expect(mockLocationStorageService.clearStoredBackgroundLocations).toHaveBeenCalled();
    });

    it('should filter locations by time range when provided', async () => {
      const startTime = Date.now() - 24 * 60 * 60 * 1000;
      const endTime = Date.now();
      const mockStoredLocations = [
        { latitude: 40.7128, longitude: -74.006, timestamp: Date.now() - 48 * 60 * 60 * 1000 }, // Before range (keep)
        { latitude: 34.0522, longitude: -118.2437, timestamp: Date.now() - 12 * 60 * 60 * 1000 }, // In range (clear)
        { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() + 12 * 60 * 60 * 1000 }, // After range (keep)
      ];

      mockLocationStorageService.getStoredBackgroundLocations.mockResolvedValue(
        mockStoredLocations
      );
      mockLocationStorageService.clearStoredBackgroundLocations.mockResolvedValue();
      mockLocationStorageService.storeBackgroundLocation.mockResolvedValue();

      await DataClearingService.clearStoredLocations({ startTime, endTime });

      expect(mockLocationStorageService.storeBackgroundLocation).toHaveBeenCalledTimes(2);
      expect(mockLocationStorageService.storeBackgroundLocation).toHaveBeenCalledWith(
        mockStoredLocations[0]
      );
      expect(mockLocationStorageService.storeBackgroundLocation).toHaveBeenCalledWith(
        mockStoredLocations[2]
      );
    });
  });
});
