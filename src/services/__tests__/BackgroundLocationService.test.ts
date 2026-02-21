import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { BackgroundLocationService } from '../BackgroundLocationService';
import { LocationStorageService } from '../LocationStorageService';
import { CoordinateDeduplicationService } from '../CoordinateDeduplicationService';
import {
  createMockPermissionResponse,
  setupTaskManagerMocks,
} from '../../test-helpers/background-service-helpers';

// Mock expo modules at the top level
jest.mock('expo-location', () => ({
  requestBackgroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  hasStartedLocationUpdatesAsync: jest.fn().mockResolvedValue(false),
  Accuracy: {
    Balanced: 'balanced',
    BestForNavigation: 'bestForNavigation',
    High: 'high',
  },
}));

jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
}));

jest.mock('../LocationStorageService', () => ({
  LocationStorageService: {
    storeBackgroundLocation: jest.fn().mockResolvedValue(undefined),
    getStoredLocationCount: jest.fn().mockResolvedValue(0),
    getStoredBackgroundLocations: jest.fn().mockResolvedValue([]),
    clearStoredBackgroundLocations: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockedLocation = Location as jest.Mocked<typeof Location>;
const mockedTaskManager = TaskManager as jest.Mocked<typeof TaskManager>;
const mockedLocationStorageService = LocationStorageService as jest.Mocked<
  typeof LocationStorageService
>;

describe('BackgroundLocationService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Clear deduplication state before each test
    CoordinateDeduplicationService.clearDuplicateHistory();
    // Reset static state
    (BackgroundLocationService as any).isInitialized = false;
    (BackgroundLocationService as any).isRunning = false;

    // Reset mocks to default behavior
    mockedTaskManager.defineTask.mockImplementation(() => {});
    mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(false);
    mockedLocation.requestBackgroundPermissionsAsync.mockResolvedValue(
      createMockPermissionResponse('granted')
    );
    mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue(
      createMockPermissionResponse('granted')
    );
    mockedLocation.startLocationUpdatesAsync.mockResolvedValue(undefined);
    mockedLocation.stopLocationUpdatesAsync.mockResolvedValue(undefined);
    mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(false);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('static methods', () => {
    it('should have static methods available', () => {
      expect(typeof BackgroundLocationService.initialize).toBe('function');
      expect(typeof BackgroundLocationService.startBackgroundLocationTracking).toBe('function');
      expect(typeof BackgroundLocationService.stopBackgroundLocationTracking).toBe('function');
      expect(typeof BackgroundLocationService.getStatus).toBe('function');
      expect(typeof BackgroundLocationService.processStoredLocations).toBe('function');
    });
  });

  describe('initialize', () => {
    it('should initialize successfully', async () => {
      await BackgroundLocationService.initialize();

      // defineTask is called at module top-level, not during initialize()
      // initialize() cleans up stale location updates and sets isInitialized
      expect(mockedLocation.hasStartedLocationUpdatesAsync).toHaveBeenCalledWith(
        'background-location-task'
      );
      expect((BackgroundLocationService as any).isInitialized).toBe(true);
    });

    it('should clean up stale location updates from previous session', async () => {
      mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);

      await BackgroundLocationService.initialize();

      expect(mockedLocation.stopLocationUpdatesAsync).toHaveBeenCalledWith(
        'background-location-task'
      );
      expect((BackgroundLocationService as any).isInitialized).toBe(true);
    });

    it('should handle hasStartedLocationUpdatesAsync errors gracefully', async () => {
      mockedLocation.hasStartedLocationUpdatesAsync.mockRejectedValue(new Error('Not available'));

      await BackgroundLocationService.initialize();

      // Should still initialize despite cleanup error
      expect((BackgroundLocationService as any).isInitialized).toBe(true);
    });
  });

  describe('initializeWithPermissionCheck', () => {
    it('should initialize successfully when permissions are already granted', async () => {
      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue(
        createMockPermissionResponse('granted')
      );

      const result = await BackgroundLocationService.initializeWithPermissionCheck();

      expect(result.success).toBe(true);
      expect(result.hasPermissions).toBe(true);
      expect(result.errorMessage).toBeUndefined();
      // defineTask is called at module top-level, not during initialization
      expect((BackgroundLocationService as any).isInitialized).toBe(true);
    });

    it('should request permissions and initialize when permissions are not granted initially', async () => {
      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue(
        createMockPermissionResponse('denied')
      );
      mockedLocation.requestBackgroundPermissionsAsync.mockResolvedValue(
        createMockPermissionResponse('granted')
      );

      const result = await BackgroundLocationService.initializeWithPermissionCheck();

      expect(result.success).toBe(true);
      expect(result.hasPermissions).toBe(true);
      expect(result.errorMessage).toBeUndefined();
      expect(mockedLocation.requestBackgroundPermissionsAsync).toHaveBeenCalled();
    });

    it('should fail gracefully when permissions are denied after request', async () => {
      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue(
        createMockPermissionResponse('denied')
      );
      mockedLocation.requestBackgroundPermissionsAsync.mockResolvedValue(
        createMockPermissionResponse('denied')
      );

      const result = await BackgroundLocationService.initializeWithPermissionCheck();

      expect(result.success).toBe(false);
      expect(result.hasPermissions).toBe(false);
      expect(result.errorMessage).toBe(
        'Location permissions are required for FogOfDog to function. Please enable location permissions in your device settings.'
      );
      expect(mockedTaskManager.defineTask).not.toHaveBeenCalled();
      expect((BackgroundLocationService as any).isInitialized).toBe(false);
    });

    it('should fail gracefully when permissions request throws error', async () => {
      (global as any).expectConsoleErrors = true; // This test expects console errors

      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue(
        createMockPermissionResponse('denied')
      );
      mockedLocation.requestBackgroundPermissionsAsync.mockRejectedValue(
        new Error('Permission request failed')
      );

      const result = await BackgroundLocationService.initializeWithPermissionCheck();

      expect(result.success).toBe(false);
      expect(result.hasPermissions).toBe(false);
      expect(result.errorMessage).toBe(
        'Failed to request location permissions. Please check your device settings.'
      );
    });

    it('should not initialize twice if already initialized', async () => {
      // First initialization
      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue(
        createMockPermissionResponse('granted')
      );

      await BackgroundLocationService.initializeWithPermissionCheck();
      expect((BackgroundLocationService as any).isInitialized).toBe(true);

      // Second initialization attempt
      const result = await BackgroundLocationService.initializeWithPermissionCheck();

      expect(result.success).toBe(true);
      expect(result.hasPermissions).toBe(true);
      // isInitialized should still be true (not re-initialized)
      expect((BackgroundLocationService as any).isInitialized).toBe(true);
    });
  });

  describe('getPermissionStatus', () => {
    it('should return permission status when permissions are granted', async () => {
      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue(
        createMockPermissionResponse('granted')
      );

      const status = await BackgroundLocationService.getPermissionStatus();

      expect(status.hasPermissions).toBe(true);
      expect(status.canAskAgain).toBe(true);
      expect(status.status).toBe('granted');
    });

    it('should return permission status when permissions are denied', async () => {
      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'denied' as any,
        granted: false,
        expires: 'never',
        canAskAgain: false,
      });

      const status = await BackgroundLocationService.getPermissionStatus();

      expect(status.hasPermissions).toBe(false);
      expect(status.canAskAgain).toBe(false);
      expect(status.status).toBe('denied');
    });

    it('should handle permission check errors', async () => {
      (global as any).expectConsoleErrors = true; // This test expects console errors

      mockedLocation.getBackgroundPermissionsAsync.mockRejectedValue(
        new Error('Permission check failed')
      );

      const status = await BackgroundLocationService.getPermissionStatus();

      expect(status.hasPermissions).toBe(false);
      expect(status.canAskAgain).toBe(true);
      expect(status.status).toBe('undetermined');
    });
  });

  describe('startBackgroundLocationTracking', () => {
    it('should start tracking successfully when permissions are granted', async () => {
      // Mock checking permissions (not requesting)
      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted' as any,
        granted: true,
        expires: 'never',
        canAskAgain: true,
      });

      // Mock task not already registered
      mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(false);
      mockedLocation.startLocationUpdatesAsync.mockResolvedValue(undefined);

      const result = await BackgroundLocationService.startBackgroundLocationTracking();

      expect(result).toBe(true);
      expect(mockedLocation.getBackgroundPermissionsAsync).toHaveBeenCalled();
      expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
        'background-location-task',
        expect.objectContaining({
          accuracy: Location.Accuracy.High,
          timeInterval: 30000,
          distanceInterval: 10,
          foregroundService: expect.objectContaining({
            notificationTitle: 'FogOfDog Tracking',
            notificationBody: 'Recording your route in the background',
            killServiceOnDestroy: false,
          }),
          showsBackgroundLocationIndicator: true,
          pausesUpdatesAutomatically: false,
        })
      );
    });

    it('should return false when background permissions are denied', async () => {
      (global as any).expectConsoleErrors = true; // This test expects console warnings

      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'denied' as any,
        granted: false,
        expires: 'never',
        canAskAgain: true,
      });

      const result = await BackgroundLocationService.startBackgroundLocationTracking();

      expect(result).toBe(false);
      expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('should handle already registered task', async () => {
      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted' as any,
        granted: true,
        expires: 'never',
        canAskAgain: true,
      });

      // Source now uses hasStartedLocationUpdatesAsync (not isTaskRegisteredAsync)
      // to check if location updates are already active
      mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);

      const result = await BackgroundLocationService.startBackgroundLocationTracking();

      expect(result).toBe(true);
      expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedLocation.getBackgroundPermissionsAsync.mockRejectedValue(new Error('Permission error'));

      const result = await BackgroundLocationService.startBackgroundLocationTracking();

      expect(result).toBe(false);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('stopBackgroundLocationTracking', () => {
    it('should stop tracking successfully', async () => {
      mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(true);
      mockedLocation.stopLocationUpdatesAsync.mockResolvedValue(undefined);

      await BackgroundLocationService.stopBackgroundLocationTracking();

      expect(mockedLocation.stopLocationUpdatesAsync).toHaveBeenCalledWith(
        'background-location-task'
      );
      expect((BackgroundLocationService as any).isRunning).toBe(false);
    });

    it('should handle task not registered', async () => {
      mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(false);

      await BackgroundLocationService.stopBackgroundLocationTracking();

      expect(mockedLocation.stopLocationUpdatesAsync).not.toHaveBeenCalled();
      expect((BackgroundLocationService as any).isRunning).toBe(false);
    });

    it('should handle E_TASK_NOT_FOUND error gracefully when stopping', async () => {
      // Mock task as registered
      mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(true);

      // Mock Location.stopLocationUpdatesAsync to throw E_TASK_NOT_FOUND error
      const taskNotFoundError = new Error(
        "The operation couldn't be completed. (E_TASK_NOT_FOUND error 0.)"
      );
      (taskNotFoundError as any).code = 'E_TASK_NOT_FOUND';
      mockedLocation.stopLocationUpdatesAsync.mockRejectedValue(taskNotFoundError);

      await BackgroundLocationService.stopBackgroundLocationTracking();

      expect(mockedTaskManager.isTaskRegisteredAsync).toHaveBeenCalledWith(
        'background-location-task'
      );
      expect(mockedLocation.stopLocationUpdatesAsync).toHaveBeenCalledWith(
        'background-location-task'
      );

      // Should not throw error and should complete successfully
      // The error should be handled gracefully and logged as info
    });

    it('should handle errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedTaskManager.isTaskRegisteredAsync.mockRejectedValue(new Error('Task error'));

      await BackgroundLocationService.stopBackgroundLocationTracking();

      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('getStatus', () => {
    it('should return correct status when running with permissions', async () => {
      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted' as any,
        granted: true,
        expires: 'never',
        canAskAgain: true,
      });
      mockedLocation.hasStartedLocationUpdatesAsync.mockResolvedValue(true);
      mockedLocationStorageService.getStoredLocationCount.mockResolvedValue(5);
      (BackgroundLocationService as any).isRunning = true;

      const status = await BackgroundLocationService.getStatus();

      expect(status).toEqual({
        isRunning: true,
        hasPermission: true,
        storedLocationCount: 5,
      });
    });

    it('should return correct status when not running', async () => {
      mockedLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: 'denied' as any,
        granted: false,
        expires: 'never',
        canAskAgain: true,
      });
      mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(false);
      mockedLocationStorageService.getStoredLocationCount.mockResolvedValue(0);

      const status = await BackgroundLocationService.getStatus();

      expect(status).toEqual({
        isRunning: false,
        hasPermission: false,
        storedLocationCount: 0,
      });
    });

    it('should handle errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedLocation.getBackgroundPermissionsAsync.mockRejectedValue(new Error('Permission error'));

      const status = await BackgroundLocationService.getStatus();

      expect(status).toEqual({
        isRunning: false,
        hasPermission: false,
        storedLocationCount: 0,
      });
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('processStoredLocations', () => {
    it('should process and clear stored locations', async () => {
      const mockStoredLocations = [
        { latitude: 40.7128, longitude: -74.006, timestamp: Date.now() },
        { latitude: 34.0522, longitude: -118.2437, timestamp: Date.now() },
      ];

      mockedLocationStorageService.getStoredBackgroundLocations.mockResolvedValue(
        mockStoredLocations
      );

      const result = await BackgroundLocationService.processStoredLocations();

      expect(result).toEqual(mockStoredLocations);
      expect(mockedLocationStorageService.getStoredBackgroundLocations).toHaveBeenCalled();
      expect(mockedLocationStorageService.clearStoredBackgroundLocations).toHaveBeenCalled();
    });

    it('should handle empty stored locations', async () => {
      mockedLocationStorageService.getStoredBackgroundLocations.mockResolvedValue([]);

      const result = await BackgroundLocationService.processStoredLocations();

      expect(result).toEqual([]);
      expect(mockedLocationStorageService.clearStoredBackgroundLocations).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedLocationStorageService.getStoredBackgroundLocations.mockRejectedValue(
        new Error('Storage error')
      );

      const result = await BackgroundLocationService.processStoredLocations();

      expect(result).toEqual([]);
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('task manager integration', () => {
    // defineTask is called at module top-level, not during initialize().
    // Test handleBackgroundLocations directly since that's what the task callback invokes.
    it('should handle task execution with valid data', async () => {
      setupTaskManagerMocks(mockedTaskManager, mockedLocationStorageService);
      (BackgroundLocationService as any).isInitialized = false;

      await BackgroundLocationService.initialize();

      // Test handleBackgroundLocations directly
      const mockLocations = [
        {
          coords: {
            latitude: 40.7128,
            longitude: -74.006,
            altitude: null,
            accuracy: 5,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        },
      ];

      await BackgroundLocationService.handleBackgroundLocations(mockLocations as any);

      expect(mockedLocationStorageService.storeBackgroundLocation).toHaveBeenCalledWith({
        latitude: 40.7128,
        longitude: -74.006,
        timestamp: expect.any(Number),
        accuracy: 5,
      });
    });

    it('should handle empty locations array without storing anything', async () => {
      setupTaskManagerMocks(mockedTaskManager, mockedLocationStorageService);
      (BackgroundLocationService as any).isInitialized = false;

      await BackgroundLocationService.initialize();

      // handleBackgroundLocations with empty array should not store anything
      await BackgroundLocationService.handleBackgroundLocations([]);

      expect(mockedLocationStorageService.storeBackgroundLocation).not.toHaveBeenCalled();
    });

    it('should handle task execution with no data', async () => {
      setupTaskManagerMocks(mockedTaskManager, mockedLocationStorageService);
      (BackgroundLocationService as any).isInitialized = false;

      await BackgroundLocationService.initialize();

      // Empty locations array
      await BackgroundLocationService.handleBackgroundLocations([]);

      expect(mockedLocationStorageService.storeBackgroundLocation).not.toHaveBeenCalled();
    });

    it('should handle locations without accuracy', async () => {
      (BackgroundLocationService as any).isInitialized = false;

      await BackgroundLocationService.initialize();

      const mockLocations = [
        {
          coords: {
            latitude: 40.7128,
            longitude: -74.006,
            altitude: null,
            accuracy: null,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        },
      ];

      await BackgroundLocationService.handleBackgroundLocations(mockLocations as any);

      expect(mockedLocationStorageService.storeBackgroundLocation).toHaveBeenCalledWith({
        latitude: 40.7128,
        longitude: -74.006,
        timestamp: expect.any(Number),
      });
    });
  });
});
