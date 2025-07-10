import AsyncStorage from '@react-native-async-storage/async-storage';
import { GPSInjectionService } from '../GPSInjectionService';
import { logger } from '../../utils/logger';
import { DeviceEventEmitter } from 'react-native';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('../../utils/logger');
jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    emit: jest.fn(),
    addListener: jest.fn(() => ({ remove: jest.fn() })),
  },
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockLogger = logger as jest.Mocked<typeof logger>;
const mockDeviceEventEmitter = DeviceEventEmitter as jest.Mocked<typeof DeviceEventEmitter>;

describe('GPSInjectionService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('checkAndProcessInjectedGPS', () => {
    it('should return empty array when no injection data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await GPSInjectionService.checkAndProcessInjectedGPS();

      expect(result).toEqual([]);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@fogofdog:gps_injection_data');
    });

    it('should process GPS injection data and emit coordinates', async () => {
      const coordinates = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
        { latitude: 37.7849, longitude: -122.4094, timestamp: Date.now() },
      ];

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(coordinates));
      mockAsyncStorage.removeItem.mockResolvedValue();

      const result = await GPSInjectionService.checkAndProcessInjectedGPS();

      expect(result).toEqual(coordinates);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@fogofdog:gps_injection_data');

      // Fast forward timers to trigger the setTimeout calls
      jest.advanceTimersByTime(200);

      expect(mockDeviceEventEmitter.emit).toHaveBeenCalledTimes(2);
      expect(mockDeviceEventEmitter.emit).toHaveBeenCalledWith(
        'GPS_COORDINATES_INJECTED',
        coordinates[0]
      );
      expect(mockDeviceEventEmitter.emit).toHaveBeenCalledWith(
        'GPS_COORDINATES_INJECTED',
        coordinates[1]
      );
    });

    it('should handle invalid JSON gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid json');

      const result = await GPSInjectionService.checkAndProcessInjectedGPS();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Error processing injected GPS data',
        expect.any(Error),
        expect.objectContaining({
          component: 'GPSInjectionService',
          action: 'checkAndProcessInjectedGPS',
        })
      );
    });

    it('should handle invalid coordinate format', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify('not an array'));

      const result = await GPSInjectionService.checkAndProcessInjectedGPS();

      expect(result).toEqual([]);
      expect(mockLogger.warn).toHaveBeenCalledWith(
        'Invalid GPS injection data format',
        expect.objectContaining({
          component: 'GPSInjectionService',
          action: 'checkAndProcessInjectedGPS',
        })
      );
    });
  });

  describe('startPeriodicCheck', () => {
    it('should start periodic checking and return cleanup function', () => {
      const spy = jest
        .spyOn(GPSInjectionService, 'checkAndProcessInjectedGPS')
        .mockImplementation(() => Promise.resolve([]));

      const cleanup = GPSInjectionService.startPeriodicCheck(1000);

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Started periodic GPS injection check',
        expect.objectContaining({
          component: 'GPSInjectionService',
          action: 'startPeriodicCheck',
          intervalMs: 1000,
        })
      );

      // Fast forward time to trigger interval
      jest.advanceTimersByTime(1000);
      expect(spy).toHaveBeenCalledTimes(1);

      // Test cleanup
      cleanup();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Stopped periodic GPS injection check',
        expect.objectContaining({
          component: 'GPSInjectionService',
          action: 'startPeriodicCheck',
        })
      );

      spy.mockRestore();
    });
  });
});
