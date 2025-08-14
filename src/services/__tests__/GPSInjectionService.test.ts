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
      const fixedTimestamp = 1625097600000; // July 1, 2021 00:00:00 UTC
      const coordinates = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: fixedTimestamp },
        { latitude: 37.7849, longitude: -122.4094, timestamp: fixedTimestamp + 1000 },
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

      // eslint-disable-next-line @typescript-eslint/no-deprecated
      const cleanup = GPSInjectionService.startPeriodicCheck(1000);

      expect(mockLogger.warn).toHaveBeenCalledWith(
        'startPeriodicCheck is deprecated - use event-driven checkForInjectionOnce()',
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
        'Stopped deprecated periodic GPS injection check',
        expect.objectContaining({
          component: 'GPSInjectionService',
          action: 'startPeriodicCheck',
        })
      );

      spy.mockRestore();
    });
  });

  describe('checkForInjectionOnce', () => {
    it('should call checkAndProcessInjectedGPS and log action', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await GPSInjectionService.checkForInjectionOnce();

      expect(result).toEqual([]);
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Checking for GPS injection data (one-time check)',
        { component: 'GPSInjectionService', action: 'checkForInjectionOnce' }
      );
    });
  });

  // Note: File processing paths are complex to mock and test in isolation
  // The main GPS injection functionality is covered by existing tests
});
