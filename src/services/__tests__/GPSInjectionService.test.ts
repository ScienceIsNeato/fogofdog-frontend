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
    // Set NODE_ENV to development for tests to run
    process.env.NODE_ENV = 'development';
    global.__DEV__ = true;
  });

  afterEach(() => {
    // Reset NODE_ENV
    delete process.env.NODE_ENV;
  });

  describe('processInjectedGPS', () => {
    it('should return empty array when no injection data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await GPSInjectionService.processInjectedGPS();

      expect(result).toEqual([]);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('gps_injection_data');
    });

    it('should process base64 encoded GPS injection data', async () => {
      const injectionData = {
        coordinates: [
          { latitude: 37.7749, longitude: -122.4194, timestamp: 123456789, accuracy: 5 }
        ],
        processed: false,
        injectedAt: '2024-01-01T00:00:00Z'
      };
      const base64Data = btoa(JSON.stringify(injectionData));
      
      mockAsyncStorage.getItem.mockResolvedValueOnce(base64Data);
      mockAsyncStorage.setItem.mockResolvedValue();

      const result = await GPSInjectionService.processInjectedGPS();

      expect(result).toEqual(injectionData.coordinates);
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'gps_injection_data',
        JSON.stringify({ ...injectionData, processed: true })
      );
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Decoded base64 GPS injection data',
        expect.any(Object)
      );
    });

    it('should process direct JSON GPS injection data when base64 fails', async () => {
      const injectionData = {
        coordinates: [
          { latitude: 37.7749, longitude: -122.4194, timestamp: 123456789, accuracy: 5 }
        ],
        processed: false,
        injectedAt: '2024-01-01T00:00:00Z'
      };
      const jsonData = JSON.stringify(injectionData);
      
      mockAsyncStorage.getItem.mockResolvedValueOnce(jsonData);
      mockAsyncStorage.setItem.mockResolvedValue();

      const result = await GPSInjectionService.processInjectedGPS();

      expect(result).toEqual(injectionData.coordinates);
      expect(mockLogger.debug).toHaveBeenCalledWith(
        'Using direct JSON GPS injection data',
        expect.any(Object)
      );
    });

    it('should return empty array if data is already processed', async () => {
      const injectionData = {
        coordinates: [
          { latitude: 37.7749, longitude: -122.4194, timestamp: 123456789, accuracy: 5 }
        ],
        processed: true,
        injectedAt: '2024-01-01T00:00:00Z'
      };
      const jsonData = JSON.stringify(injectionData);
      
      mockAsyncStorage.getItem.mockResolvedValueOnce(jsonData);

      const result = await GPSInjectionService.processInjectedGPS();

      expect(result).toEqual([]);
      expect(mockAsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('should try alternative key if main key fails', async () => {
      const injectionData = {
        coordinates: [
          { latitude: 37.7749, longitude: -122.4194, timestamp: 123456789, accuracy: 5 }
        ],
        processed: false,
        injectedAt: '2024-01-01T00:00:00Z'
      };
      const jsonData = JSON.stringify(injectionData);
      
      mockAsyncStorage.getItem
        .mockResolvedValueOnce(null) // First call returns null
        .mockResolvedValueOnce(jsonData); // Second call returns data
      mockAsyncStorage.setItem.mockResolvedValue();

      const result = await GPSInjectionService.processInjectedGPS();

      expect(result).toEqual(injectionData.coordinates);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('gps_injection_data');
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@fogofdog:gps_injection_data');
    });

    it('should handle errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await GPSInjectionService.processInjectedGPS();

      expect(result).toEqual([]);
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to process GPS injection',
        expect.any(Error),
        expect.any(Object)
      );
    });
  });

  describe('clearProcessedInjections', () => {
    it('should clear processed injection data', async () => {
      const injectionData = {
        coordinates: [],
        processed: true,
        injectedAt: '2024-01-01T00:00:00Z'
      };
      const jsonData = JSON.stringify(injectionData);
      
      mockAsyncStorage.getItem.mockResolvedValue(jsonData);
      mockAsyncStorage.removeItem.mockResolvedValue();

      await GPSInjectionService.clearProcessedInjections();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('gps_injection_data');
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Cleared processed GPS injection data',
        expect.any(Object)
      );
    });

    it('should not clear unprocessed injection data', async () => {
      const injectionData = {
        coordinates: [],
        processed: false,
        injectedAt: '2024-01-01T00:00:00Z'
      };
      const jsonData = JSON.stringify(injectionData);
      
      mockAsyncStorage.getItem.mockResolvedValue(jsonData);

      await GPSInjectionService.clearProcessedInjections();

      expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
    });

    it('should handle missing data gracefully', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      await GPSInjectionService.clearProcessedInjections();

      expect(mockAsyncStorage.removeItem).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      await GPSInjectionService.clearProcessedInjections();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to clear GPS injection data',
        expect.any(Error),
        expect.any(Object)
      );
    });
  });

  describe('getInjectionStatus', () => {
    it('should return status for existing injection data', async () => {
      const injectionData = {
        coordinates: [
          { latitude: 37.7749, longitude: -122.4194, timestamp: 123456789, accuracy: 5 }
        ],
        processed: false,
        injectedAt: '2024-01-01T00:00:00Z'
      };
      const jsonData = JSON.stringify(injectionData);
      
      mockAsyncStorage.getItem.mockResolvedValue(jsonData);

      const result = await GPSInjectionService.getInjectionStatus();

      expect(result).toEqual({
        hasInjectionData: true,
        isProcessed: false,
        coordinateCount: 1,
        injectedAt: '2024-01-01T00:00:00Z'
      });
    });

    it('should return false when no data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await GPSInjectionService.getInjectionStatus();

      expect(result).toEqual({ hasInjectionData: false });
    });

    it('should handle errors gracefully', async () => {
      mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await GPSInjectionService.getInjectionStatus();

      expect(result).toEqual({ hasInjectionData: false });
      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to get GPS injection status',
        expect.any(Error),
        expect.any(Object)
      );
    });
  });

  describe('storeInjectionData', () => {
    it('should store injection data', async () => {
      const coordinates = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: 123456789, accuracy: 5 }
      ];
      
      mockAsyncStorage.setItem.mockResolvedValue();

      await GPSInjectionService.storeInjectionData(coordinates);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'gps_injection_data',
        expect.stringContaining('"processed":false')
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        '🧪 Stored GPS injection data with 1 coordinates',
        expect.any(Object)
      );
      expect(mockDeviceEventEmitter.emit).toHaveBeenCalledWith(
        'GPS_COORDINATES_INJECTED',
        coordinates
      );
    });

    it('should handle storage errors by throwing', async () => {
      const coordinates = [
        { latitude: 37.7749, longitude: -122.4194, timestamp: 123456789, accuracy: 5 }
      ];
      
      mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      await expect(GPSInjectionService.storeInjectionData(coordinates)).rejects.toThrow('Storage error');

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to store GPS injection data',
        expect.any(Error),
        expect.any(Object)
      );
    });
  });

  describe('subscribeToInjections', () => {
    it('should subscribe to injection events', () => {
      const callback = jest.fn();
      const mockRemove = jest.fn();
      mockDeviceEventEmitter.addListener.mockReturnValue({ remove: mockRemove });

      const unsubscribe = GPSInjectionService.subscribeToInjections(callback);

      expect(mockDeviceEventEmitter.addListener).toHaveBeenCalledWith(
        'GPS_COORDINATES_INJECTED',
        callback
      );
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Subscribed to GPS injection events',
        expect.any(Object)
      );

      // Test unsubscribe
      unsubscribe();
      expect(mockRemove).toHaveBeenCalled();
      expect(mockLogger.info).toHaveBeenCalledWith(
        'Unsubscribed from GPS injection events',
        expect.any(Object)
      );
    });
  });
}); 