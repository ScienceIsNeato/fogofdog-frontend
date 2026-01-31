import { GPSInjectionEndpoint } from '../GPSInjectionEndpoint';
import { logger } from '../../utils/logger';
import { DeviceEventEmitter } from 'react-native';
import { store } from '../../store';
import { updateLocation } from '../../store/slices/explorationSlice';

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
  },
}));

// Mock DeviceEventEmitter
const mockSubscriptionRemove = jest.fn();
jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    addListener: jest.fn(() => ({ remove: mockSubscriptionRemove })),
    emit: jest.fn(),
  },
}));

// Mock store
jest.mock('../../store', () => ({
  store: {
    getState: jest.fn(),
    dispatch: jest.fn(),
  },
}));

// Mock updateLocation action
jest.mock('../../store/slices/explorationSlice', () => ({
  updateLocation: jest.fn().mockReturnValue({ type: 'exploration/updateLocation' }),
}));

// Mock __DEV__ global
const originalDev = (global as any).__DEV__;

describe('GPSInjectionEndpoint', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (global as any).__DEV__ = true;
    // Reset listening state
    (GPSInjectionEndpoint as any).isListening = false;
  });

  afterEach(() => {
    (global as any).__DEV__ = originalDev;
  });

  describe('startServer', () => {
    it('should start server in development mode', async () => {
      (global as any).__DEV__ = true;

      await GPSInjectionEndpoint.startServer();

      expect(DeviceEventEmitter.addListener).toHaveBeenCalledWith(
        'GPS_INJECT_RELATIVE',
        expect.any(Function)
      );

      expect(logger.info).toHaveBeenCalledWith(
        'GPS injection API started - listening for relative movement commands',
        {
          component: 'GPSInjectionEndpoint',
          action: 'startServer',
        }
      );
    });

    it('should not start server in production mode', async () => {
      (global as any).__DEV__ = false;

      await GPSInjectionEndpoint.startServer();

      expect(DeviceEventEmitter.addListener).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });

    it('should not start server twice', async () => {
      (global as any).__DEV__ = true;

      await GPSInjectionEndpoint.startServer();
      await GPSInjectionEndpoint.startServer();

      expect(DeviceEventEmitter.addListener).toHaveBeenCalledTimes(1);
    });

    it('should handle errors when starting server', async () => {
      (global as any).__DEV__ = true;
      const mockError = new Error('DeviceEventEmitter error');
      (DeviceEventEmitter.addListener as jest.Mock).mockImplementationOnce(() => {
        throw mockError;
      });

      await GPSInjectionEndpoint.startServer();

      expect(logger.error).toHaveBeenCalledWith('Failed to start GPS injection API', mockError, {
        component: 'GPSInjectionEndpoint',
        action: 'startServer',
      });
    });
  });

  describe('stopServer', () => {
    it('should stop server and remove subscription when server is running', async () => {
      // Start server first
      await GPSInjectionEndpoint.startServer();
      mockSubscriptionRemove.mockClear();

      GPSInjectionEndpoint.stopServer();

      expect(mockSubscriptionRemove).toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith('GPS injection API stopped', {
        component: 'GPSInjectionEndpoint',
        action: 'stopServer',
      });
    });

    it('should not call remove when server is not running', () => {
      mockSubscriptionRemove.mockClear();

      GPSInjectionEndpoint.stopServer();

      expect(mockSubscriptionRemove).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('injectRelativeMovement', () => {
    it('should inject relative movement successfully', () => {
      GPSInjectionEndpoint.injectRelativeMovement(90, 100);

      expect(DeviceEventEmitter.emit).toHaveBeenCalledWith('GPS_INJECT_RELATIVE', {
        angle: 90,
        distance: 100,
      });

      expect(logger.info).toHaveBeenCalledWith('Injecting relative GPS movement', {
        component: 'GPSInjectionEndpoint',
        action: 'injectRelativeMovement',
        angle: 90,
        distance: 100,
      });
    });

    it('should handle zero distance movement', () => {
      GPSInjectionEndpoint.injectRelativeMovement(0, 0);

      expect(DeviceEventEmitter.emit).toHaveBeenCalledWith('GPS_INJECT_RELATIVE', {
        angle: 0,
        distance: 0,
      });
    });

    it('should not inject movement in production mode', () => {
      (global as any).__DEV__ = false;

      GPSInjectionEndpoint.injectRelativeMovement(90, 100);

      expect(DeviceEventEmitter.emit).not.toHaveBeenCalled();
      expect(logger.info).not.toHaveBeenCalled();
    });
  });

  describe('handleRelativeMovement', () => {
    beforeEach(() => {
      // Setup store mock
      (store.getState as jest.Mock).mockReturnValue({
        exploration: {
          currentLocation: {
            latitude: 44.0521,
            longitude: -123.0868,
            timestamp: Date.now(),
          },
        },
      });
      // updateLocation is already mocked to return the action
    });

    it('should handle relative movement successfully', async () => {
      // Start server to set up the listener
      await GPSInjectionEndpoint.startServer();

      // Get the handler function that was registered
      const handler = (DeviceEventEmitter.addListener as jest.Mock).mock.calls[0][1];

      const result = handler({ angle: 90, distance: 100 });

      expect(store.getState).toHaveBeenCalled();
      expect(store.dispatch).toHaveBeenCalled();
      expect(updateLocation).toHaveBeenCalledWith({
        latitude: expect.any(Number),
        longitude: expect.any(Number),
        timestamp: expect.any(Number),
      });
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Injected relative GPS movement: 100m at 90°'),
        expect.objectContaining({
          component: 'GPSInjectionEndpoint',
          action: 'handleRelativeMovement',
        })
      );
      expect(result).toContain('Moved 100m at 90°');
    });

    it('should handle missing current location', async () => {
      // Mock store with no current location
      (store.getState as jest.Mock).mockReturnValue({
        exploration: {
          currentLocation: null,
        },
      });

      // Start server to set up the listener
      await GPSInjectionEndpoint.startServer();

      // Get the handler function that was registered
      const handler = (DeviceEventEmitter.addListener as jest.Mock).mock.calls[0][1];

      const result = handler({ angle: 90, distance: 100 });

      expect(logger.warn).toHaveBeenCalledWith(
        'No current location available for relative movement',
        {
          component: 'GPSInjectionEndpoint',
          action: 'handleRelativeMovement',
        }
      );
      expect(result).toBe('No current location available for relative movement');
    });

    it('should handle errors in relative movement calculation', async () => {
      // Mock store.getState to throw an error
      (store.getState as jest.Mock).mockImplementationOnce(() => {
        throw new Error('Store access error');
      });

      // Start server to set up the listener
      await GPSInjectionEndpoint.startServer();

      // Get the handler function that was registered
      const handler = (DeviceEventEmitter.addListener as jest.Mock).mock.calls[0][1];

      const result = handler({ angle: 90, distance: 100 });

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to handle relative GPS movement: Store access error',
        expect.any(Error),
        {
          component: 'GPSInjectionEndpoint',
          action: 'handleRelativeMovement',
        }
      );
      expect(result).toContain('Failed to handle relative GPS movement: Store access error');
    });
  });
});
