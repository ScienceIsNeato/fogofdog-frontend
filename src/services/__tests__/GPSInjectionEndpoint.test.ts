import AsyncStorage from '@react-native-async-storage/async-storage';
import { GPSInjectionEndpoint } from '../GPSInjectionEndpoint';
import { logger } from '../../utils/logger';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock __DEV__ global
const originalDev = (global as any).__DEV__;

describe('GPSInjectionEndpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).__DEV__ = true;
  });

  afterEach(() => {
    (global as any).__DEV__ = originalDev;
  });

  describe('startServer', () => {
    it('should start server in development mode', async () => {
      (global as any).__DEV__ = true;

      await GPSInjectionEndpoint.startServer();

      expect(logger.info).toHaveBeenCalledWith(
        'GPS injection polling started - will process via app state changes',
        {
          component: 'GPSInjectionEndpoint',
          action: 'startPollingForInjection',
        }
      );
    });

    it('should not start server in production mode', async () => {
      (global as any).__DEV__ = false;

      await GPSInjectionEndpoint.startServer();

      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should handle errors during server start', async () => {
      (global as any).__DEV__ = true;
      const error = new Error('Server start failed');

      // Mock the private method to throw an error
      const originalStartPolling = (GPSInjectionEndpoint as any).startPollingForInjection;
      (GPSInjectionEndpoint as any).startPollingForInjection = jest.fn().mockRejectedValue(error);

      await GPSInjectionEndpoint.startServer();

      expect(logger.error).toHaveBeenCalledWith('Failed to start GPS injection endpoint', error, {
        component: 'GPSInjectionEndpoint',
        action: 'startServer',
      });

      // Restore original method
      (GPSInjectionEndpoint as any).startPollingForInjection = originalStartPolling;
    });
  });

  describe('stopServer', () => {
    it('should stop server when server exists', () => {
      // Set up server state
      (GPSInjectionEndpoint as any).server = { close: jest.fn() };

      GPSInjectionEndpoint.stopServer();

      expect(logger.info).toHaveBeenCalledWith('GPS Injection endpoint stopped', {
        component: 'GPSInjectionEndpoint',
        action: 'stopServer',
      });
      expect((GPSInjectionEndpoint as any).server).toBeNull();
    });

    it('should handle stopping when no server exists', () => {
      (GPSInjectionEndpoint as any).server = null;

      GPSInjectionEndpoint.stopServer();

      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('injectCoordinates', () => {
    it('should inject coordinates successfully', async () => {
      const coordinates = [
        { latitude: 40.7128, longitude: -74.006, timestamp: Date.now() },
        { latitude: 34.0522, longitude: -118.2437, timestamp: Date.now() },
      ];

      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await GPSInjectionEndpoint.injectCoordinates(coordinates);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@fogofdog:gps_injection_data',
        JSON.stringify([
          { latitude: 40.7128, longitude: -74.006 },
          { latitude: 34.0522, longitude: -118.2437 },
        ])
      );

      expect(logger.info).toHaveBeenCalledWith('Injected 2 GPS coordinates', {
        component: 'GPSInjectionEndpoint',
        action: 'injectCoordinates',
        count: 2,
      });
    });

    it('should handle empty coordinates array', async () => {
      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await GPSInjectionEndpoint.injectCoordinates([]);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@fogofdog:gps_injection_data',
        JSON.stringify([])
      );

      expect(logger.info).toHaveBeenCalledWith('Injected 0 GPS coordinates', {
        component: 'GPSInjectionEndpoint',
        action: 'injectCoordinates',
        count: 0,
      });
    });

    it('should handle AsyncStorage errors', async () => {
      const coordinates = [{ latitude: 40.7128, longitude: -74.006, timestamp: Date.now() }];
      const error = new Error('AsyncStorage failed');

      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(error);

      await expect(GPSInjectionEndpoint.injectCoordinates(coordinates)).rejects.toThrow(error);

      expect(logger.error).toHaveBeenCalledWith('Failed to inject GPS coordinates', error, {
        component: 'GPSInjectionEndpoint',
        action: 'injectCoordinates',
      });
    });

    it('should convert coordinates to simple format correctly', async () => {
      const coordinates = [
        {
          latitude: 40.7128,
          longitude: -74.006,
          timestamp: 1640995200000,
          accuracy: 5.0,
        },
      ];

      (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

      await GPSInjectionEndpoint.injectCoordinates(coordinates);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        '@fogofdog:gps_injection_data',
        JSON.stringify([{ latitude: 40.7128, longitude: -74.006 }])
      );
    });
  });
});
