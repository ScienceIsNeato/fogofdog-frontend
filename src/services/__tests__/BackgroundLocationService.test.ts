import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { BackgroundLocationService } from '../BackgroundLocationService';
import { LocationStorageService } from '../LocationStorageService';
import {
  createMockPermissionResponse,
  createMockTaskData,
  setupTaskManagerMocks,
  getTaskCallbackFromMock,
} from '../../__tests__/test-helpers/background-service-helpers';

// Mock expo modules at the top level
jest.mock('expo-location', () => ({
  requestBackgroundPermissionsAsync: jest.fn(),
  getBackgroundPermissionsAsync: jest.fn(),
  startLocationUpdatesAsync: jest.fn(),
  stopLocationUpdatesAsync: jest.fn(),
  Accuracy: {
    Balanced: 'balanced',
    BestForNavigation: 'bestForNavigation',
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

      expect(mockedTaskManager.defineTask).toHaveBeenCalledWith(
        'background-location-task',
        expect.any(Function)
      );
      expect((BackgroundLocationService as any).isInitialized).toBe(true);
    });

    it('should handle initialization errors', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedTaskManager.defineTask.mockImplementation(() => {
        throw new Error('Task definition error');
      });

      await expect(BackgroundLocationService.initialize()).rejects.toThrow('Task definition error');
      expect(consoleSpy).toHaveBeenCalled();

      consoleSpy.mockRestore();
    });
  });

  describe('startBackgroundLocationTracking', () => {
    it('should start tracking successfully when permissions are granted', async () => {
      // Mock successful permission request
      mockedLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
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
      expect(mockedLocation.requestBackgroundPermissionsAsync).toHaveBeenCalled();
      expect(mockedLocation.startLocationUpdatesAsync).toHaveBeenCalledWith(
        'background-location-task',
        expect.objectContaining({
          accuracy: Location.Accuracy.Balanced,
          timeInterval: 30000,
          distanceInterval: 20,
          deferredUpdatesInterval: 60000,
          foregroundService: expect.objectContaining({
            notificationTitle: 'FogOfDog is tracking your exploration',
            notificationBody: 'Discovering new areas in the background',
          }),
        })
      );
    });

    it('should return false when background permissions are denied', async () => {
      mockedLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
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
      mockedLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
        status: 'granted' as any,
        granted: true,
        expires: 'never',
        canAskAgain: true,
      });

      mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(true);

      const result = await BackgroundLocationService.startBackgroundLocationTracking();

      expect(result).toBe(true);
      expect(mockedLocation.startLocationUpdatesAsync).not.toHaveBeenCalled();
    });

    it('should handle errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedLocation.requestBackgroundPermissionsAsync.mockRejectedValue(
        new Error('Permission error')
      );

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
      mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(true);
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
    it('should handle task execution with valid data', async () => {
      // Reset mock and initialize fresh
      setupTaskManagerMocks(mockedTaskManager, mockedLocationStorageService);
      (BackgroundLocationService as any).isInitialized = false;

      // Initialize to register the task
      await BackgroundLocationService.initialize();

      // Get the task callback that was registered
      const taskCallback = getTaskCallbackFromMock(mockedTaskManager);
      const mockTaskData = createMockTaskData({ hasLocations: true });

      await taskCallback(mockTaskData);

      expect(mockedLocationStorageService.storeBackgroundLocation).toHaveBeenCalledWith({
        latitude: 40.7128,
        longitude: -74.006,
        timestamp: expect.any(Number),
        accuracy: 5,
      });
    });

    it('should handle task execution with error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      // Reset mock and initialize fresh
      setupTaskManagerMocks(mockedTaskManager, mockedLocationStorageService);
      (BackgroundLocationService as any).isInitialized = false;

      // Initialize to register the task
      await BackgroundLocationService.initialize();

      const taskCallback = getTaskCallbackFromMock(mockedTaskManager);
      const mockTaskData = createMockTaskData({ hasError: true });

      await taskCallback(mockTaskData);

      expect(consoleSpy).toHaveBeenCalled();
      expect(mockedLocationStorageService.storeBackgroundLocation).not.toHaveBeenCalled();

      consoleSpy.mockRestore();
    });

    it('should handle task execution with no data', async () => {
      // Reset mock and initialize fresh
      setupTaskManagerMocks(mockedTaskManager, mockedLocationStorageService);
      (BackgroundLocationService as any).isInitialized = false;

      // Initialize to register the task
      await BackgroundLocationService.initialize();

      const taskCallback = getTaskCallbackFromMock(mockedTaskManager);
      const mockTaskData = createMockTaskData({ hasLocations: false });

      await taskCallback(mockTaskData);

      expect(mockedLocationStorageService.storeBackgroundLocation).not.toHaveBeenCalled();
    });

    it('should handle locations without accuracy', async () => {
      // Reset mock and initialize fresh
      mockedTaskManager.defineTask.mockClear();
      (BackgroundLocationService as any).isInitialized = false;

      // Initialize to register the task
      await BackgroundLocationService.initialize();

      const defineTaskCall = mockedTaskManager.defineTask.mock.calls[0];
      const taskCallback = defineTaskCall![1];

      const mockTaskData = {
        data: {
          locations: [
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
          ],
        },
        error: null,
        executionInfo: {
          taskName: 'background-location-task',
          taskInstanceId: 'test-instance',
          eventId: 'test-event',
          appState: 'background' as const,
        },
      };

      await taskCallback(mockTaskData);

      expect(mockedLocationStorageService.storeBackgroundLocation).toHaveBeenCalledWith({
        latitude: 40.7128,
        longitude: -74.006,
        timestamp: expect.any(Number),
      });
    });
  });
});
