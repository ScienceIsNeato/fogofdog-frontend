import * as TaskManager from 'expo-task-manager';
import * as Location from 'expo-location';
import { LocationStorageService, StoredLocationData } from './LocationStorageService';
import { logger } from '../utils/logger';

const BACKGROUND_LOCATION_TASK = 'background-location-task';

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

  /**
   * Initialize the background location service
   * This should be called early in the app lifecycle
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    try {
      // Define the background task
      TaskManager.defineTask(BACKGROUND_LOCATION_TASK, async ({ data, error }) => {
        if (error) {
          logger.error('Background location task error', error, {
            component: 'BackgroundLocationService',
            action: 'backgroundTask',
          });
          return;
        }

        if (data) {
          const { locations } = data as { locations: Location.LocationObject[] };
          await this.handleBackgroundLocations(locations);
        }
      });

      this.isInitialized = true;
      logger.info('Background location service initialized', {
        component: 'BackgroundLocationService',
        action: 'initialize',
      });
    } catch (error) {
      logger.error('Failed to initialize background location service', error, {
        component: 'BackgroundLocationService',
        action: 'initialize',
      });
      throw error;
    }
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

      // Check if we have the necessary permissions
      const { status } = await Location.requestBackgroundPermissionsAsync();
      if (status !== 'granted') {
        logger.warn('Background location permission not granted', {
          component: 'BackgroundLocationService',
          action: 'startBackgroundLocationTracking',
          status,
        });
        return false;
      }

      // Check if task is already running
      const isTaskRunning = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      if (isTaskRunning) {
        logger.info('Background location task already running', {
          component: 'BackgroundLocationService',
          action: 'startBackgroundLocationTracking',
        });
        this.isRunning = true;
        return true;
      }

      // Start location updates
      await Location.startLocationUpdatesAsync(BACKGROUND_LOCATION_TASK, {
        accuracy: Location.Accuracy.Balanced, // Balance between accuracy and battery
        timeInterval: 30000, // 30 seconds - conservative for battery life
        distanceInterval: 20, // 20 meters - reasonable for exploration tracking
        deferredUpdatesInterval: 60000, // 1 minute - batch updates for efficiency
        foregroundService: {
          notificationTitle: 'FogOfDog is tracking your exploration',
          notificationBody: 'Discovering new areas in the background',
          notificationColor: '#4A90E2',
        },
      });

      this.isRunning = true;
      logger.info('Background location tracking started', {
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
        await Location.stopLocationUpdatesAsync(BACKGROUND_LOCATION_TASK);
        logger.info('Background location tracking stopped', {
          component: 'BackgroundLocationService',
          action: 'stopBackgroundLocationTracking',
        });
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
      const isTaskRunning = await TaskManager.isTaskRegisteredAsync(BACKGROUND_LOCATION_TASK);
      const storedLocationCount = await LocationStorageService.getStoredLocationCount();

      return {
        isRunning: isTaskRunning && this.isRunning,
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
   */
  private static async handleBackgroundLocations(
    locations: Location.LocationObject[]
  ): Promise<void> {
    try {
      for (const location of locations) {
        const locationData: StoredLocationData = {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: location.timestamp,
          ...(location.coords.accuracy !== undefined &&
            location.coords.accuracy !== null && { accuracy: location.coords.accuracy }),
        };

        await LocationStorageService.storeBackgroundLocation(locationData);
      }

      logger.info(`Processed ${locations.length} background location(s)`, {
        component: 'BackgroundLocationService',
        action: 'handleBackgroundLocations',
        count: locations.length,
      });
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
}
