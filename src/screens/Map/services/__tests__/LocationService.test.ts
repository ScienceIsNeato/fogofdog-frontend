import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { DeviceEventEmitter } from 'react-native';
import {
  defineUnifiedLocationTask,
  startBackgroundLocationUpdates,
  startForegroundLocationUpdates,
  handleForegroundPermissionError,
  handleBackgroundPermissionError,
  handleNonPermissionError,
  startLocationUpdates,
  getLocationTaskName,
} from '../LocationService';
import { PermissionAlert } from '../../../../components/PermissionAlert';
import { logger } from '../../../../utils/logger';

// Mock dependencies
jest.mock('expo-location', () => ({
  startLocationUpdatesAsync: jest.fn(),
  watchPositionAsync: jest.fn(),
  Accuracy: {
    High: 4,
  },
}));
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
}));
jest.mock('react-native', () => ({
  DeviceEventEmitter: {
    emit: jest.fn(),
  },
}));
jest.mock('../../../../components/PermissionAlert', () => ({
  PermissionAlert: {
    show: jest.fn(),
  },
}));
jest.mock('../../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

const mockLocation = Location as jest.Mocked<typeof Location>;
const mockTaskManager = TaskManager as jest.Mocked<typeof TaskManager>;
const mockDeviceEventEmitter = DeviceEventEmitter as jest.Mocked<typeof DeviceEventEmitter>;
const mockPermissionAlert = PermissionAlert as jest.Mocked<typeof PermissionAlert>;
const mockLogger = logger as jest.Mocked<typeof logger>;

describe('LocationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('defineUnifiedLocationTask', () => {
    it('should define a location task with proper error handling', () => {
      defineUnifiedLocationTask();

      expect(mockTaskManager.defineTask).toHaveBeenCalledWith(
        'unified-location-task',
        expect.any(Function)
      );
    });

        it('should handle task execution with valid location data', async () => {
      defineUnifiedLocationTask();
      
      const taskCallback = mockTaskManager.defineTask.mock.calls[0]?.[1];
      const mockLocationData = {
        data: {
          locations: [
            {
              coords: {
                latitude: 37.7749,
                longitude: -122.4194,
              },
            },
          ],
        },
        error: null,
        executionInfo: { taskName: 'unified-location-task', eventId: 'test-event', appState: 'active' as const },
      };

      await taskCallback?.(mockLocationData);

      expect(mockDeviceEventEmitter.emit).toHaveBeenCalledWith('locationUpdate', {
        latitude: 37.7749,
        longitude: -122.4194,
      });
    });

        it('should handle task execution with error', async () => {
      defineUnifiedLocationTask();
      
      const taskCallback = mockTaskManager.defineTask.mock.calls[0]?.[1];
      const mockError = { message: 'Location error', code: 'LOCATION_ERROR' };

      await taskCallback?.({ 
        error: mockError, 
        data: null, 
        executionInfo: { taskName: 'unified-location-task', eventId: 'test-event', appState: 'active' as const } 
      });

      expect(mockLogger.warn).toHaveBeenCalledWith('Location task error', {
        errorMessage: 'Location error',
        errorType: 'object',
      });
    });

        it('should handle task execution with no location data', async () => {
      defineUnifiedLocationTask();
      
      const taskCallback = mockTaskManager.defineTask.mock.calls[0]?.[1];

      await taskCallback?.({ 
        data: { locations: [] }, 
        error: null, 
        executionInfo: { taskName: 'unified-location-task', eventId: 'test-event', appState: 'active' as const } 
      });

      expect(mockDeviceEventEmitter.emit).not.toHaveBeenCalled();
    });
  });

  describe('startBackgroundLocationUpdates', () => {
    it('should start background location updates successfully', async () => {
      mockLocation.startLocationUpdatesAsync.mockResolvedValue();

      await startBackgroundLocationUpdates();

      expect(mockLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
        'unified-location-task',
        expect.objectContaining({
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
          foregroundService: expect.objectContaining({
            notificationTitle: 'Fog of Dog',
            notificationBody: 'Tracking your location to reveal the map',
          }),
        })
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting location updates with background service',
        expect.objectContaining({
          component: 'LocationService',
          action: 'startBackgroundLocationUpdates',
          backgroundGranted: true,
        })
      );
    });
  });

  describe('startForegroundLocationUpdates', () => {
    it('should start foreground location updates successfully', async () => {
      const mockWatchPosition = { remove: jest.fn() };
      mockLocation.watchPositionAsync.mockResolvedValue(mockWatchPosition);

      await startForegroundLocationUpdates();

      expect(mockLocation.watchPositionAsync).toHaveBeenCalledWith(
        expect.objectContaining({
          accuracy: Location.Accuracy.High,
          timeInterval: 3000,
          distanceInterval: 5,
        }),
        expect.any(Function)
      );

      expect(mockLogger.info).toHaveBeenCalledWith(
        'Starting location updates in foreground-only mode',
        expect.objectContaining({
          component: 'LocationService',
          action: 'startForegroundLocationUpdates',
          backgroundGranted: false,
        })
      );
    });

    it('should emit location updates for foreground tracking', async () => {
      const mockLocationCallback = jest.fn();
      mockLocation.watchPositionAsync.mockImplementation((_options, callback) => {
        mockLocationCallback.mockImplementation(callback);
        return Promise.resolve({ remove: jest.fn() });
      });

      await startForegroundLocationUpdates();

      const mockLocationData = {
        coords: {
          latitude: 37.7749,
          longitude: -122.4194,
        },
      };

      mockLocationCallback(mockLocationData);

      expect(mockDeviceEventEmitter.emit).toHaveBeenCalledWith('locationUpdate', {
        latitude: 37.7749,
        longitude: -122.4194,
      });
    });
  });

  describe('error handlers', () => {
    it('should handle foreground permission error without showing alert', () => {
      handleForegroundPermissionError();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Location service failed due to background permission limitation'),
        expect.objectContaining({
          component: 'LocationService',
          action: 'startLocationUpdates',
        })
      );

      expect(mockPermissionAlert.show).not.toHaveBeenCalled();
    });

    it('should handle background permission error with alert', () => {
      const mockError = new Error('Permission denied');

      expect(() => handleBackgroundPermissionError(mockError)).toThrow();

      expect(mockPermissionAlert.show).toHaveBeenCalledWith({
        errorMessage: expect.stringContaining('Unable to start location tracking'),
        onDismiss: expect.any(Function),
      });
    });

    it('should handle non-permission error', () => {
      const mockError = new Error('Network error');

      expect(() => handleNonPermissionError(mockError)).toThrow();

      expect(mockLogger.info).toHaveBeenCalledWith(
        expect.stringContaining('Location tracking error (non-permission related)'),
        expect.objectContaining({
          component: 'LocationService',
          action: 'handleLocationUpdate',
          errorType: 'non_permission',
          errorMessage: 'Network error',
        })
      );
    });
  });

  describe('startLocationUpdates', () => {
    it('should start background updates when backgroundGranted is true', async () => {
      mockLocation.startLocationUpdatesAsync.mockResolvedValue();

      await startLocationUpdates(true);

      expect(mockLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
        'unified-location-task',
        expect.any(Object)
      );
    });

    it('should start foreground updates when backgroundGranted is false', async () => {
      mockLocation.watchPositionAsync.mockResolvedValue({ remove: jest.fn() });

      await startLocationUpdates(false);

      expect(mockLocation.watchPositionAsync).toHaveBeenCalled();
    });

    it('should handle permission errors appropriately', async () => {
      const permissionError = new Error('Permission denied');
      mockLocation.startLocationUpdatesAsync.mockRejectedValue(permissionError);

      await expect(startLocationUpdates(true)).rejects.toThrow();

      expect(mockPermissionAlert.show).toHaveBeenCalled();
    });

    it('should handle non-permission errors', async () => {
      const networkError = new Error('Network timeout');
      mockLocation.startLocationUpdatesAsync.mockRejectedValue(networkError);

      await expect(startLocationUpdates(true)).rejects.toThrow();

      expect(mockLogger.error).toHaveBeenCalledWith(
        'Failed to start location updates',
        expect.objectContaining({
          component: 'LocationService',
          action: 'startLocationUpdates',
          backgroundGranted: true,
          errorMessage: 'Network timeout',
        })
      );
    });
  });

  describe('getLocationTaskName', () => {
    it('should return the correct task name', () => {
      expect(getLocationTaskName()).toBe('unified-location-task');
    });
  });
});
