import AsyncStorage from '@react-native-async-storage/async-storage';
import { LocationStorageService, StoredLocationData } from '../LocationStorageService';
import { withConsoleErrorSpy } from '../../__tests__/test-helpers/console-spy-helpers';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage');

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('LocationStorageService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('static methods', () => {
    it('should have static methods available', () => {
      expect(typeof LocationStorageService.storeBackgroundLocation).toBe('function');
      expect(typeof LocationStorageService.getStoredBackgroundLocations).toBe('function');
      expect(typeof LocationStorageService.clearStoredBackgroundLocations).toBe('function');
      expect(typeof LocationStorageService.getStoredLocationCount).toBe('function');
      expect(typeof LocationStorageService.convertToGeoPoints).toBe('function');
    });
  });

  describe('storeBackgroundLocation', () => {
    it('should store location with accuracy successfully', async () => {
      const mockExistingData = JSON.stringify([
        { latitude: 40.7128, longitude: -74.006, timestamp: 1000, accuracy: 10 },
      ]);
      mockedAsyncStorage.getItem.mockResolvedValue(mockExistingData);
      mockedAsyncStorage.setItem.mockResolvedValue(undefined);

      const locationData: StoredLocationData = {
        latitude: 34.0522,
        longitude: -118.2437,
        timestamp: Date.now(),
        accuracy: 5,
      };

      await LocationStorageService.storeBackgroundLocation(locationData);

      expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith('background_locations');
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        'background_locations',
        expect.stringContaining('34.0522')
      );

      // Verify the stored data structure
      const setItemCall = mockedAsyncStorage.setItem.mock.calls[0];
      const storedData = JSON.parse(setItemCall![1]);
      expect(storedData).toHaveLength(2);
      expect(storedData[1]).toEqual(locationData);
    });

    it('should store location without accuracy successfully', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);
      mockedAsyncStorage.setItem.mockResolvedValue(undefined);

      const locationData: StoredLocationData = {
        latitude: 34.0522,
        longitude: -118.2437,
        timestamp: Date.now(),
      };

      await LocationStorageService.storeBackgroundLocation(locationData);

      expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith('background_locations');
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        'background_locations',
        JSON.stringify([locationData])
      );
    });

    it('should handle empty storage initially', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);
      mockedAsyncStorage.setItem.mockResolvedValue(undefined);

      const locationData: StoredLocationData = {
        latitude: 34.0522,
        longitude: -118.2437,
        timestamp: Date.now(),
        accuracy: 5,
      };

      await LocationStorageService.storeBackgroundLocation(locationData);

      const setItemCall = mockedAsyncStorage.setItem.mock.calls[0];
      const storedData = JSON.parse(setItemCall![1]);
      expect(storedData).toHaveLength(1);
      expect(storedData[0]).toEqual(locationData);
    });

    it('should handle invalid JSON in storage', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.getItem.mockResolvedValue('invalid json');
      mockedAsyncStorage.setItem.mockResolvedValue(undefined);

      const locationData: StoredLocationData = {
        latitude: 34.0522,
        longitude: -118.2437,
        timestamp: Date.now(),
      };

      await LocationStorageService.storeBackgroundLocation(locationData);

      // Should still store the new location despite invalid existing data
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        'background_locations',
        JSON.stringify([locationData])
      );

      consoleSpy.mockRestore();
    });

    it('should handle storage errors gracefully', async () => {
      await withConsoleErrorSpy(async (consoleSpy) => {
        mockedAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

        const locationData: StoredLocationData = {
          latitude: 34.0522,
          longitude: -118.2437,
          timestamp: Date.now(),
        };

        // Should not throw - errors are handled internally
        await LocationStorageService.storeBackgroundLocation(locationData);
        expect(consoleSpy).toHaveBeenCalled();
      });
    });

    it('should handle setItem errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.getItem.mockResolvedValue(null);
      mockedAsyncStorage.setItem.mockRejectedValue(new Error('Set error'));

      const locationData: StoredLocationData = {
        latitude: 34.0522,
        longitude: -118.2437,
        timestamp: Date.now(),
      };

      // Should not throw - errors are handled internally
      await LocationStorageService.storeBackgroundLocation(locationData);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getStoredBackgroundLocations', () => {
    it('should return stored locations successfully', async () => {
      const mockLocations = [
        { latitude: 40.7128, longitude: -74.006, timestamp: 1000, accuracy: 10 },
        { latitude: 34.0522, longitude: -118.2437, timestamp: 2000 },
      ];
      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockLocations));

      const result = await LocationStorageService.getStoredBackgroundLocations();

      expect(result).toEqual(mockLocations);
      expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith('background_locations');
    });

    it('should return empty array when no data exists', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);

      const result = await LocationStorageService.getStoredBackgroundLocations();

      expect(result).toEqual([]);
    });

    it('should handle invalid JSON gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.getItem.mockResolvedValue('invalid json');

      const result = await LocationStorageService.getStoredBackgroundLocations();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle storage errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await LocationStorageService.getStoredBackgroundLocations();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle non-array data gracefully', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify({ not: 'array' }));

      const result = await LocationStorageService.getStoredBackgroundLocations();

      expect(result).toEqual([]);
    });
  });

  describe('getStoredLocationCount', () => {
    it('should return correct count for stored locations', async () => {
      const mockLocations = [
        { latitude: 40.7128, longitude: -74.006, timestamp: 1000 },
        { latitude: 34.0522, longitude: -118.2437, timestamp: 2000 },
        { latitude: 51.5074, longitude: -0.1278, timestamp: 3000 },
      ];
      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockLocations));

      const count = await LocationStorageService.getStoredLocationCount();

      expect(count).toBe(3);
    });

    it('should return 0 when no locations exist', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);

      const count = await LocationStorageService.getStoredLocationCount();

      expect(count).toBe(0);
    });

    it('should return 0 for invalid JSON', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.getItem.mockResolvedValue('invalid json');

      const count = await LocationStorageService.getStoredLocationCount();

      expect(count).toBe(0);

      consoleSpy.mockRestore();
    });

    it('should handle storage errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const count = await LocationStorageService.getStoredLocationCount();

      expect(count).toBe(0);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('clearStoredBackgroundLocations', () => {
    it('should clear stored locations successfully', async () => {
      mockedAsyncStorage.removeItem.mockResolvedValue(undefined);

      await LocationStorageService.clearStoredBackgroundLocations();

      expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith('background_locations');
    });

    it('should handle removal errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.removeItem.mockRejectedValue(new Error('Remove error'));

      // Should not throw - errors are handled internally
      await LocationStorageService.clearStoredBackgroundLocations();
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('convertToGeoPoints', () => {
    it('should convert stored locations to GeoPoints', () => {
      const storedLocations: StoredLocationData[] = [
        { latitude: 40.7128, longitude: -74.006, timestamp: 1000, accuracy: 5 },
        { latitude: 34.0522, longitude: -118.2437, timestamp: 2000 },
      ];

      const geoPoints = LocationStorageService.convertToGeoPoints(storedLocations);

      expect(geoPoints).toHaveLength(2);
      expect(geoPoints[0]).toMatchObject({ latitude: 40.7128, longitude: -74.006 });
      expect(geoPoints[1]).toMatchObject({ latitude: 34.0522, longitude: -118.2437 });
      // Ensure timestamps are included
      expect(typeof geoPoints[0].timestamp).toBe('number');
      expect(typeof geoPoints[1].timestamp).toBe('number');
    });

    it('should handle empty array', () => {
      const geoPoints = LocationStorageService.convertToGeoPoints([]);
      expect(geoPoints).toEqual([]);
    });
  });

  describe('edge cases and data validation', () => {
    it('should handle extremely large numbers of locations', async () => {
      const largeLocationArray = Array.from({ length: 1000 }, (_, i) => ({
        latitude: 40.7128 + i * 0.001,
        longitude: -74.006 + i * 0.001,
        timestamp: Date.now() + i * 1000,
        accuracy: Math.random() * 100,
      }));

      mockedAsyncStorage.getItem.mockResolvedValue(JSON.stringify(largeLocationArray));
      mockedAsyncStorage.setItem.mockResolvedValue(undefined);

      const newLocation: StoredLocationData = {
        latitude: 50.0,
        longitude: -75.0,
        timestamp: Date.now(),
      };

      await LocationStorageService.storeBackgroundLocation(newLocation);

      expect(mockedAsyncStorage.setItem).toHaveBeenCalled();
      const setCall = mockedAsyncStorage.setItem.mock.calls[0];
      const storedData = JSON.parse(setCall![1]);
      expect(storedData).toHaveLength(1001);
    });

    it('should preserve data types correctly', async () => {
      const locationWithTypes: StoredLocationData = {
        latitude: 40.7128,
        longitude: -74.006,
        timestamp: 1640995200000, // Specific timestamp
        accuracy: 5.5, // Decimal accuracy
      };

      mockedAsyncStorage.getItem.mockResolvedValue(null);
      mockedAsyncStorage.setItem.mockResolvedValue(undefined);

      await LocationStorageService.storeBackgroundLocation(locationWithTypes);

      const setCall = mockedAsyncStorage.setItem.mock.calls[0];
      const storedData = JSON.parse(setCall![1]);

      expect(typeof storedData[0].latitude).toBe('number');
      expect(typeof storedData[0].longitude).toBe('number');
      expect(typeof storedData[0].timestamp).toBe('number');
      expect(typeof storedData[0].accuracy).toBe('number');
      expect(storedData[0].accuracy).toBe(5.5);
    });
  });
});
