import { LocationDataSourceService } from '../LocationDataSourceService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Location from 'expo-location';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-file-system');
jest.mock('expo-location');

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;
const mockLocation = Location as jest.Mocked<typeof Location>;

describe('LocationDataSourceService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    LocationDataSourceService.reset();

    // Default: no file exists
    (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: false });

    // Default: no AsyncStorage data
    mockAsyncStorage.getItem.mockResolvedValue(null);
  });

  describe('getCurrentPosition', () => {
    it('returns null when no location source is available', async () => {
      // Use fake timers to avoid 30s timeout from retry delays
      jest.useFakeTimers();

      // No file, no AsyncStorage, GPS fails
      (mockLocation.getCurrentPositionAsync as jest.Mock).mockRejectedValue(
        new Error('Location services disabled')
      );

      // Suppress expected warnings from retry logic
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const resultPromise = LocationDataSourceService.getCurrentPosition();

      // Fast-forward through all retry delays
      await jest.runAllTimersAsync();

      const result = await resultPromise;

      expect(result).toBeNull();

      warnSpy.mockRestore();
      errorSpy.mockRestore();
      jest.useRealTimers();
    });

    it('uses AsyncStorage injection when file not available', async () => {
      const mockCoordinates = [{ latitude: 40.7128, longitude: -74.006, timestamp: 1234567890 }];

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockCoordinates));

      const result = await LocationDataSourceService.getCurrentPosition();

      expect(result).not.toBeNull();
      expect(result?.source).toBe('async-storage-injection');
      expect(result?.location.latitude).toBe(40.7128);
      expect(result?.location.longitude).toBe(-74.006);
    });

    it('falls back to real GPS when no injection available', async () => {
      (mockLocation.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
        coords: { latitude: 51.5074, longitude: -0.1278 },
        timestamp: 1234567890,
      });

      const result = await LocationDataSourceService.getCurrentPosition();

      expect(result).not.toBeNull();
      expect(result?.source).toBe('real-gps');
      expect(result?.location.latitude).toBe(51.5074);
      expect(result?.location.longitude).toBe(-0.1278);
    });

    it('prioritizes file over AsyncStorage over real GPS', async () => {
      // All sources available
      const fileCoords = { coordinates: [{ latitude: 1, longitude: 1, timestamp: 1 }] };
      const asyncCoords = [{ latitude: 2, longitude: 2, timestamp: 2 }];

      (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (mockFileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(JSON.stringify(fileCoords));
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(asyncCoords));
      (mockLocation.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
        coords: { latitude: 3, longitude: 3 },
        timestamp: 3,
      });

      const result = await LocationDataSourceService.getCurrentPosition();

      // Should use file (highest priority)
      expect(result?.source).toBe('file-injection');
      expect(result?.location.latitude).toBe(1);
    });
  });

  describe('getNextInjectedCoordinate', () => {
    it('returns null when no coordinates are loaded', () => {
      const result = LocationDataSourceService.getNextInjectedCoordinate();
      expect(result).toBeNull();
    });

    it('cycles through coordinates after loading from file', async () => {
      const mockCoordinates = {
        coordinates: [
          { latitude: 1, longitude: 1, timestamp: 1 },
          { latitude: 2, longitude: 2, timestamp: 2 },
          { latitude: 3, longitude: 3, timestamp: 3 },
        ],
      };

      (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (mockFileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
        JSON.stringify(mockCoordinates)
      );

      // Load coordinates
      await LocationDataSourceService.getCurrentPosition();

      // Get next coordinates
      const second = LocationDataSourceService.getNextInjectedCoordinate();
      expect(second?.latitude).toBe(2);

      const third = LocationDataSourceService.getNextInjectedCoordinate();
      expect(third?.latitude).toBe(3);

      // Should wrap around
      const first = LocationDataSourceService.getNextInjectedCoordinate();
      expect(first?.latitude).toBe(1);
    });
  });

  describe('getCurrentSourceType', () => {
    it('defaults to real-gps', () => {
      expect(LocationDataSourceService.getCurrentSourceType()).toBe('real-gps');
    });

    it('updates after loading from file', async () => {
      const mockCoordinates = {
        coordinates: [{ latitude: 1, longitude: 1, timestamp: 1 }],
      };

      (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (mockFileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
        JSON.stringify(mockCoordinates)
      );

      await LocationDataSourceService.getCurrentPosition();

      expect(LocationDataSourceService.getCurrentSourceType()).toBe('file-injection');
    });
  });

  describe('isUsingInjectedGPS', () => {
    it('returns false by default', () => {
      expect(LocationDataSourceService.isUsingInjectedGPS()).toBe(false);
    });

    it('returns true after loading injected coordinates', async () => {
      const mockCoordinates = {
        coordinates: [{ latitude: 1, longitude: 1, timestamp: 1 }],
      };

      (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (mockFileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
        JSON.stringify(mockCoordinates)
      );

      await LocationDataSourceService.getCurrentPosition();

      expect(LocationDataSourceService.isUsingInjectedGPS()).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears all state', async () => {
      const mockCoordinates = {
        coordinates: [{ latitude: 1, longitude: 1, timestamp: 1 }],
      };

      (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (mockFileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
        JSON.stringify(mockCoordinates)
      );

      await LocationDataSourceService.getCurrentPosition();
      expect(LocationDataSourceService.isUsingInjectedGPS()).toBe(true);

      LocationDataSourceService.reset();

      expect(LocationDataSourceService.isUsingInjectedGPS()).toBe(false);
      expect(LocationDataSourceService.getCurrentSourceType()).toBe('real-gps');
      expect(LocationDataSourceService.getNextInjectedCoordinate()).toBeNull();
    });
  });

  describe('writeInjectionFile', () => {
    it('writes coordinates to file', async () => {
      (mockFileSystem.writeAsStringAsync as jest.Mock).mockResolvedValue(undefined);

      const coordinates = [{ latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() }];

      const result = await LocationDataSourceService.writeInjectionFile(coordinates);

      expect(result).toBe(true);
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalledWith(
        expect.stringContaining('gps-injection.json'),
        expect.stringContaining('37.7749')
      );
    });

    it('returns false on write error', async () => {
      (mockFileSystem.writeAsStringAsync as jest.Mock).mockRejectedValue(new Error('Write failed'));

      // Suppress expected error from write failure
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await LocationDataSourceService.writeInjectionFile([]);

      expect(result).toBe(false);

      errorSpy.mockRestore();
    });
  });

  describe('clearInjectionData', () => {
    it('clears both file and AsyncStorage', async () => {
      (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (mockFileSystem.deleteAsync as jest.Mock).mockResolvedValue(undefined);
      mockAsyncStorage.removeItem.mockResolvedValue();

      await LocationDataSourceService.clearInjectionData();

      expect(mockFileSystem.deleteAsync).toHaveBeenCalled();
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@fogofdog:gps_injection_data');
    });
  });

  describe('error handling', () => {
    it('handles invalid file JSON gracefully', async () => {
      (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (mockFileSystem.readAsStringAsync as jest.Mock).mockResolvedValue('invalid json');

      // Should fall through to next source
      (mockLocation.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
        coords: { latitude: 51.5074, longitude: -0.1278 },
        timestamp: 1234567890,
      });

      // Suppress expected error from JSON parse failure
      const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const result = await LocationDataSourceService.getCurrentPosition();

      expect(result?.source).toBe('real-gps');

      errorSpy.mockRestore();
    });

    it('handles empty coordinates array in file', async () => {
      (mockFileSystem.getInfoAsync as jest.Mock).mockResolvedValue({ exists: true });
      (mockFileSystem.readAsStringAsync as jest.Mock).mockResolvedValue(
        JSON.stringify({ coordinates: [] })
      );

      (mockLocation.getCurrentPositionAsync as jest.Mock).mockResolvedValue({
        coords: { latitude: 51.5074, longitude: -0.1278 },
        timestamp: 1234567890,
      });

      // Suppress expected warning about empty coordinates
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

      const result = await LocationDataSourceService.getCurrentPosition();

      // Should fall through to real GPS
      expect(result?.source).toBe('real-gps');

      warnSpy.mockRestore();
    });
  });
});
