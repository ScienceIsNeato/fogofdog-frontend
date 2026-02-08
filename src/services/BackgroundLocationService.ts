import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { LocationStorageService, StoredLocationData } from './LocationStorageService';
import { CoordinateDeduplicationService } from './CoordinateDeduplicationService';
import { logger } from '../utils/logger';
import { AppState, Platform } from 'react-native';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

/**
 * CRITICAL: Task definition MUST be at module top-level!
 *
 * expo-task-manager requires TaskManager.defineTask() to be called during
 * module initialization (not inside a function that runs later). If the task
 * is registered with the OS from a previous session but the handler isn't
 * defined yet, the OS will execute the task and fail with:
 * "Task X has been executed but looks like it is not defined"
 *
 * This must run immediately when the module loads, before any async code.
 */
TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
  // Use trace for per-tick task execution (noisy in normal dev)
  logger.trace('Background location task executed', {
    component: 'BackgroundLocationService',
    action: 'backgroundTask',
    appState: AppState.currentState,
    locationsReceived: (data as { locations?: Location.LocationObject[] })?.locations?.length ?? 0,
    timestamp: new Date().toISOString(),
  });

  if (error) {
    // Check if this is a transient location error that we can ignore
    const errorMessage = error.message || '';
    const isTransientLocationError =
      // iOS transient errors
      errorMessage.includes('kCLErrorDomain Code=0') ||
      errorMessage.includes('kCLErrorLocationUnknown') ||
      // Android transient errors
      errorMessage.includes('LocationUnavailableException') ||
      errorMessage.includes('Location request was denied') ||
      errorMessage.includes('Provider is disabled') ||
      errorMessage.includes('GooglePlayServicesNotAvailableException');

    if (isTransientLocationError) {
      // Log as warning instead of error for transient location issues
      logger.warn('Transient background location error (location service not ready)', {
        component: 'BackgroundLocationService',
        action: 'backgroundTask',
        error: errorMessage,
        note: 'This is usually temporary and resolves automatically',
      });
      return;
    }

    // Log other errors as actual errors
    logger.error('Background location task error', {
      component: 'BackgroundLocationService',
      action: 'backgroundTask',
      errorMessage: error?.message || 'Unknown error',
      errorType: typeof error,
    });
    return;
  }

  if (data) {
    const { locations } = data as { locations: Location.LocationObject[] };
    // Call the static method directly (not via `this` since we're at module scope)
    await BackgroundLocationService.handleBackgroundLocations(locations);
  }
});

export interface BackgroundLocationServiceStatus {
  isRunning: boolean;
  hasPermission: boolean;
  lastLocationTime?: number;
  storedLocationCount: number;
}

export interface InitializationResult {
  success: boolean;
  hasPermissions: boolean;
  errorMessage?: string;
}

export interface PermissionStatus {
  hasPermissions: boolean;
  canAskAgain: boolean;
  status: string;
}

export class BackgroundLocationService {
  private static isInitialized = false;
  private static isRunning = false;
  private static appStateSubscription: any;
  private static lastBackgroundUpdate: number = 0;

  /**
   * Initialize the background location service
   * Note: Task definition now happens at module top-level
   * This method ensures the current Metro session's handler is connected
   * by stopping any stale OS-level tracking and re-registering
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    // Check if OS thinks location updates are running from a previous session
    // If so, we need to stop and restart to connect the current handler
    try {
      const wasRunning = await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (wasRunning) {
        logger.info('Stopping stale location updates from previous session', {
          component: 'BackgroundLocationService',
          action: 'initialize',
        });
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      }
    } catch (error) {
      // Ignore errors during cleanup - may not have been running
      logger.debug('No stale location updates to clean up', {
        component: 'BackgroundLocationService',
        action: 'initialize',
      });
    }

    this.isInitialized = true;
    logger.info('Background location service initialized', {
      component: 'BackgroundLocationService',
      action: 'initialize',
    });
  }

  /**
   * Initialize the background location service with permission checking
   * This will only initialize if permissions are granted, and handles graceful failure
   */
  static async initializeWithPermissionCheck(): Promise<InitializationResult> {
    if (this.isInitialized) {
      return {
        success: true,
        hasPermissions: true,
      };
    }

    try {
      // Check current permissions
      const permissionStatus = await this.getPermissionStatus();

      // If permissions are already granted, initialize immediately
      if (permissionStatus.hasPermissions) {
        await this.initialize();
        return {
          success: true,
          hasPermissions: true,
        };
      }

      // If permissions are not granted, try to request them
      try {
        const { status, granted } = await Location.requestBackgroundPermissionsAsync();

        if (granted && status === 'granted') {
          // Permissions granted, proceed with initialization
          await this.initialize();
          return {
            success: true,
            hasPermissions: true,
          };
        } else {
          // Permissions denied
          return {
            success: false,
            hasPermissions: false,
            errorMessage:
              'Location permissions are required for FogOfDog to function. Please enable location permissions in your device settings.',
          };
        }
      } catch (permissionError) {
        logger.error('Failed to request location permissions', permissionError, {
          component: 'BackgroundLocationService',
          action: 'initializeWithPermissionCheck',
        });

        return {
          success: false,
          hasPermissions: false,
          errorMessage:
            'Failed to request location permissions. Please check your device settings.',
        };
      }
    } catch (error) {
      logger.error('Failed to initialize with permission check', error, {
        component: 'BackgroundLocationService',
        action: 'initializeWithPermissionCheck',
      });

      return {
        success: false,
        hasPermissions: false,
        errorMessage: 'Failed to initialize location services. Please restart the app.',
      };
    }
  }

  /**
   * Get the current permission status for location services
   */
  static async getPermissionStatus(): Promise<PermissionStatus> {
    try {
      const { status, granted, canAskAgain } = await Location.getBackgroundPermissionsAsync();

      return {
        hasPermissions: granted,
        canAskAgain: canAskAgain ?? true,
        status,
      };
    } catch (error) {
      logger.error('Failed to get permission status', error, {
        component: 'BackgroundLocationService',
        action: 'getPermissionStatus',
      });

      return {
        hasPermissions: false,
        canAskAgain: true,
        status: 'undetermined',
      };
    }
  }

  /**
   * Start background location tracking
   */
  static async startBackgroundLocationTracking(): Promise<boolean> {
    try {
      if (!this.isInitialized) {
        await this.initialize();
      }

      // Check if we have the necessary permissions (don't request, just check)
      const { status } = await Location.getBackgroundPermissionsAsync();
      if (status !== 'granted') {
        logger.warn('Background location permission not granted', {
          component: 'BackgroundLocationService',
          action: 'startBackgroundLocationTracking',
          status,
        });
        return false;
      }

      // Check if location updates are already actively running
      // NOTE: isTaskRegisteredAsync only checks if task is DEFINED, not if it's actively tracking
      // We need hasStartedLocationUpdatesAsync to check if OS is actually sending updates
      const isLocationUpdatesActive =
        await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      if (isLocationUpdatesActive) {
        logger.info('Background location updates already active', {
          component: 'BackgroundLocationService',
          action: 'startBackgroundLocationTracking',
        });
        this.isRunning = true;
        return true;
      }

      // Start location updates with enhanced configuration
      // Android-specific: retry with delay if foreground service fails to start
      const startLocationUpdates = async (retryCount = 0): Promise<void> => {
        try {
          await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
            accuracy: Location.Accuracy.High, // Higher accuracy for better tracking
            timeInterval: 30000, // 30 seconds - longer than foreground
            distanceInterval: 10, // 10 meters - more frequent updates
            foregroundService: {
              notificationTitle: 'FogOfDog Tracking',
              notificationBody: 'Recording your route in the background',
              killServiceOnDestroy: false,
            },
            showsBackgroundLocationIndicator: true, // iOS
            pausesUpdatesAutomatically: false, // iOS
          });
        } catch (startError) {
          const errorMessage = (startError as Error)?.message || '';
          const isAndroid = Platform.OS === 'android';

          // Android transient errors that can be resolved with retry
          const isAndroidForegroundServiceError =
            isAndroid && errorMessage.includes('Foreground service cannot be started');

          // SharedPreferences null = native module not fully initialized yet (race condition)
          const isSharedPreferencesError =
            isAndroid && errorMessage.includes('SharedPreferences.getAll()');

          const isTransientAndroidError =
            isAndroidForegroundServiceError || isSharedPreferencesError;

          // On Android, retry with delay for transient native module errors
          if (isTransientAndroidError && retryCount < 5) {
            const delayMs = (retryCount + 1) * 1000; // Longer delays: 1s, 2s, 3s, 4s, 5s
            logger.warn(
              `Android native module error, retrying in ${delayMs}ms (attempt ${retryCount + 1}/5)`,
              {
                component: 'BackgroundLocationService',
                action: 'startBackgroundLocationTracking',
                retryCount,
                errorType: isSharedPreferencesError ? 'SharedPreferences' : 'ForegroundService',
              }
            );
            await new Promise((resolve) => setTimeout(resolve, delayMs));
            return startLocationUpdates(retryCount + 1);
          }
          throw startError;
        }
      };

      await startLocationUpdates();

      // Add AppState listener to process stored locations
      this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);

      this.isRunning = true;
      logger.info('Background location tracking started with AppState integration', {
        component: 'BackgroundLocationService',
        action: 'startBackgroundLocationTracking',
      });
      return true;
    } catch (error) {
      logger.error('Failed to start background location tracking', error, {
        component: 'BackgroundLocationService',
        action: 'startBackgroundLocationTracking',
      });
      return false;
    }
  }

  /**
   * Stop background location tracking
   */
  static async stopBackgroundLocationTracking(): Promise<void> {
    try {
      const isTaskRunning = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (isTaskRunning) {
        try {
          await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
          logger.info('Background location tracking stopped', {
            component: 'BackgroundLocationService',
            action: 'stopBackgroundLocationTracking',
          });
        } catch (stopError: unknown) {
          // Handle the specific case where task is not found (already stopped)
          // This can happen on Android with TaskNotFoundException or expo's E_TASK_NOT_FOUND
          const err = stopError instanceof Error ? stopError : new Error(String(stopError));
          const errorCode = (stopError as { code?: string })?.code;
          const errorMessage = err.message;
          const isTaskNotFound =
            errorCode === 'E_TASK_NOT_FOUND' ||
            errorMessage.includes('E_TASK_NOT_FOUND') ||
            errorMessage.includes('TaskNotFoundException') ||
            (errorMessage.includes('Task') && errorMessage.includes('not found'));

          if (isTaskNotFound) {
            logger.info('Background location task was already stopped', {
              component: 'BackgroundLocationService',
              action: 'stopBackgroundLocationTracking',
              note: 'Task not found - already stopped or never started',
            });
          } else {
            // Log but don't throw - stopping should be best-effort
            logger.warn('Error stopping background location (non-fatal)', {
              component: 'BackgroundLocationService',
              action: 'stopBackgroundLocationTracking',
              error: errorMessage,
            });
          }
        }
      } else {
        logger.info('Background location task was not registered', {
          component: 'BackgroundLocationService',
          action: 'stopBackgroundLocationTracking',
          note: 'Task not registered - nothing to stop',
        });
      }

      // Remove AppState listener
      if (this.appStateSubscription) {
        this.appStateSubscription.remove();
        this.appStateSubscription = null;
      }

      this.isRunning = false;
    } catch (error) {
      logger.error('Failed to stop background location tracking', error, {
        component: 'BackgroundLocationService',
        action: 'stopBackgroundLocationTracking',
      });
    }
  }

  /**
   * Get the current status of the background location service
   */
  static async getStatus(): Promise<BackgroundLocationServiceStatus> {
    try {
      const { status } = await Location.getBackgroundPermissionsAsync();
      const hasPermission = status === 'granted';
      // Use hasStartedLocationUpdatesAsync for accurate "is actively tracking" status
      const isLocationUpdatesActive =
        await Location.hasStartedLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
      const storedLocationCount = await LocationStorageService.getStoredLocationCount();

      return {
        isRunning: isLocationUpdatesActive && this.isRunning,
        hasPermission,
        storedLocationCount,
      };
    } catch (error) {
      logger.error('Failed to get background location service status', error, {
        component: 'BackgroundLocationService',
        action: 'getStatus',
      });
      return {
        isRunning: false,
        hasPermission: false,
        storedLocationCount: 0,
      };
    }
  }

  /**
   * Handle background location updates
   * Note: Called from module-level task handler, so must be accessible (not private)
   */
  static async handleBackgroundLocations(locations: Location.LocationObject[]): Promise<void> {
    try {
      // Log background performance
      this.logBackgroundPerformance(locations);

      let processedCount = 0;
      let skippedCount = 0;

      for (const location of locations) {
        const locationData: StoredLocationData = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: location.timestamp,
          ...(location.coords.accuracy !== undefined &&
            location.coords.accuracy !== null && { accuracy: location.coords.accuracy }),
        };

        // Check if this coordinate should be processed or skipped
        const deduplicationResult =
          CoordinateDeduplicationService.shouldProcessCoordinate(locationData);

        if (deduplicationResult.shouldProcess) {
          await LocationStorageService.storeBackgroundLocation(locationData);
          processedCount++;
        } else {
          skippedCount++;
          // Log already handled by CoordinateDeduplicationService
        }
      }

      logger.info(
        `Background location batch: ${processedCount} processed, ${skippedCount} skipped (duplicates)`,
        {
          component: 'BackgroundLocationService',
          action: 'handleBackgroundLocations',
          totalReceived: locations.length,
          processed: processedCount,
          skipped: skippedCount,
        }
      );
    } catch (error) {
      logger.error('Failed to handle background locations', error, {
        component: 'BackgroundLocationService',
        action: 'handleBackgroundLocations',
      });
    }
  }

  /**
   * Process stored background locations and return them for Redux update
   * This should be called when the app comes to foreground
   */
  static async processStoredLocations(): Promise<StoredLocationData[]> {
    try {
      const storedLocations = await LocationStorageService.getStoredBackgroundLocations();

      if (storedLocations.length > 0) {
        logger.info(`Processing ${storedLocations.length} stored background locations`, {
          component: 'BackgroundLocationService',
          action: 'processStoredLocations',
          count: storedLocations.length,
        });

        // Return stored locations for direct Redux update without emitting events
        // This prevents triggering individual UI animations for batch background locations

        // Clear the stored locations after retrieving them
        await LocationStorageService.clearStoredBackgroundLocations();
      }

      return storedLocations;
    } catch (error) {
      logger.error('Failed to process stored locations', error, {
        component: 'BackgroundLocationService',
        action: 'processStoredLocations',
      });
      return [];
    }
  }

  /**
   * Handle app state changes to process stored locations
   */
  private static readonly handleAppStateChange = async (nextAppState: string) => {
    logger.info(`App state changed to: ${nextAppState}`, {
      component: 'BackgroundLocationService',
      action: 'handleAppStateChange',
    });

    if (nextAppState === 'active') {
      // Process any stored locations when app becomes active
      logger.info('App became active, processing stored locations', {
        component: 'BackgroundLocationService',
        action: 'handleAppStateChange',
      });
      await BackgroundLocationService.processStoredLocations();
    }
  };

  /**
   * Log background task execution frequency for debugging
   */
  private static logBackgroundPerformance(locations: Location.LocationObject[]) {
    const now = Date.now();
    const timeSinceLastUpdate = now - this.lastBackgroundUpdate;

    logger.info('Background location performance', {
      component: 'BackgroundLocationService',
      action: 'logBackgroundPerformance',
      timeSinceLastUpdate,
      expectedInterval: 30000,
      locationsInBatch: locations.length,
      intervalDifference: timeSinceLastUpdate - 30000,
      backgroundUpdateIntervalMs: timeSinceLastUpdate,
      expectedIntervalMs: 30000,
    });

    this.lastBackgroundUpdate = now;
  }
}
