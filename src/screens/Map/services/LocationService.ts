import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import { DeviceEventEmitter } from 'react-native';
import { logger } from '../../../utils/logger';
import { PermissionAlert } from '../../../components/PermissionAlert';

// Unified location task name
const LOCATION_TASK = 'unified-location-task';

/**
 * Define the unified location task for background tracking
 */
export function defineUnifiedLocationTask() {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      logger.warn('Location task error', {
        errorMessage: error?.message || 'Unknown error',
        errorType: typeof error,
      });
      return Promise.resolve();
    }
    if (data) {
      const { locations } = data as { locations: Location.LocationObject[] };
      if (locations.length > 0) {
        const location = locations[0];
        if (location?.coords) {
          DeviceEventEmitter.emit('locationUpdate', {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          });
        }
      }
    }
    return Promise.resolve();
  });
}

/**
 * Start background location updates with task-based tracking
 */
export async function startBackgroundLocationUpdates(): Promise<void> {
  const locationOptions: any = {
    accuracy: Location.Accuracy.High,
    timeInterval: 3000,
    distanceInterval: 5,
    foregroundService: {
      notificationTitle: 'Fog of Dog',
      notificationBody: 'Tracking your location to reveal the map',
    },
  };

  logger.info('Starting location updates with background service', {
    component: 'LocationService',
    action: 'startBackgroundLocationUpdates',
    backgroundGranted: true,
  });

  await Location.startLocationUpdatesAsync(LOCATION_TASK, locationOptions);

  logger.info('Background location updates started successfully', {
    component: 'LocationService',
    action: 'startBackgroundLocationUpdates',
  });
}

/**
 * Start foreground-only location updates with watchPositionAsync
 */
export async function startForegroundLocationUpdates(): Promise<void> {
  logger.info('Starting location updates in foreground-only mode', {
    component: 'LocationService',
    action: 'startForegroundLocationUpdates',
    backgroundGranted: false,
    note: 'Using watchPositionAsync for foreground-only tracking',
  });

  // Start watching position for foreground-only mode
  await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 3000,
      distanceInterval: 5,
    },
    (location) => {
      // Emit location update event for foreground tracking
      DeviceEventEmitter.emit('locationUpdate', {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      });
    }
  );

  logger.info('Foreground location updates started successfully', {
    component: 'LocationService',
    action: 'startForegroundLocationUpdates',
  });
}

/**
 * Handle permission error for foreground-only mode
 */
export function handleForegroundPermissionError() {
  logger.info(
    'Location service failed due to background permission limitation - this is expected with foreground-only permission',
    {
      component: 'LocationService',
      action: 'startLocationUpdates',
      note: 'User chose "Keep Only While Using" - app should work in foreground-only mode',
    }
  );
  // Don't show error dialog - this is a valid user choice
  // Don't throw error either - app should continue working in foreground-only mode
}

/**
 * Handle permission error for background mode
 */
export function handleBackgroundPermissionError(error: Error) {
  // We have background permission but still getting permission error - this is a real problem
  PermissionAlert.show({
    errorMessage:
      'Unable to start location tracking. Please check your location permissions and try again.',
    onDismiss: () => {
      logger.info('Location update error alert dismissed');
    },
  });
  throw error; // This is a real error, so throw it
}

/**
 * Handle non-permission location errors
 */
export function handleNonPermissionError(error: Error) {
  logger.info('Location tracking error (non-permission related) - not showing alert', {
    component: 'LocationService',
    action: 'handleLocationUpdate',
    errorType: 'non_permission',
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  throw error; // Non-permission errors should still be thrown
}

/**
 * Start location updates with appropriate method based on permission level
 */
export async function startLocationUpdates(backgroundGranted: boolean = false) {
  try {
    if (backgroundGranted) {
      await startBackgroundLocationUpdates();
    } else {
      await startForegroundLocationUpdates();
    }
  } catch (error) {
    logger.error('Failed to start location updates', {
      component: 'LocationService',
      action: 'startLocationUpdates',
      backgroundGranted,
      errorMessage: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    });

    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      if (backgroundGranted) {
        handleBackgroundPermissionError(error);
      } else {
        handleForegroundPermissionError();
      }
    } else {
      handleNonPermissionError(error as Error);
    }
  }
}

/**
 * Get the location task name
 */
export function getLocationTaskName(): string {
  return LOCATION_TASK;
}
