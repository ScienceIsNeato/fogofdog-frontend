/**
 * Location service hook — manages all location tracking (foreground, background, GPS injection).
 * Extracted from Map/index.tsx having grown organically with the app's location requirements.
 */
import { useEffect, useRef, useState } from 'react';
import { DeviceEventEmitter, Platform } from 'react-native';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import type { CameraRef } from '@maplibre/maplibre-react-native';

import { useAppDispatch } from '../../../store/hooks';
import { updateLocation, processBackgroundLocations } from '../../../store/slices/explorationSlice';
import { processGeoPoint, recalculateArea } from '../../../store/slices/statsSlice';
import { PermissionAlert } from '../../../components/PermissionAlert';
import { BackgroundLocationService } from '../../../services/BackgroundLocationService';
import { GPSDiagnosticsService } from '../../../services/GPSDiagnosticsService';
import { logger } from '../../../utils/logger';
import { centerMapOnCoordinate } from '../utils/mapCamera';
import type { GeoPoint } from '../../../types/user';

// Unified location task name
export const LOCATION_TASK = 'unified-location-task';

// Refactor handleLocationUpdate to use an options object
export interface HandleLocationUpdateOptions {
  location: GeoPoint;
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  explorationPath: GeoPoint[];
  isSessionActive: boolean;
}

export const handleLocationUpdate = ({
  location,
  dispatch,
  mapRef,
  cinematicZoomActiveRef,
  isMapCenteredOnUser,
  isFollowModeActive,
  explorationPath,
  isSessionActive,
}: HandleLocationUpdateOptions) => {
  dispatch(updateLocation(location));

  // Process location for stats tracking
  dispatch(processGeoPoint({ geoPoint: location }));

  // Trigger immediate session area recalculation for real-time updates
  // This ensures session area updates immediately when new GPS points are added
  if (isSessionActive && explorationPath.length >= 3) {
    const serializableGPSData = explorationPath.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
      timestamp: point.timestamp || Date.now(),
    }));

    dispatch(recalculateArea(serializableGPSData));

    logger.trace('Triggered real-time area recalculation after GPS point', {
      component: 'MapScreen',
      action: 'handleLocationUpdate',
      pathLength: explorationPath.length,
      newPoint: `${location.latitude.toFixed(6)}, ${location.longitude.toFixed(6)}`,
    });
  }

  // Auto-center map if follow mode is active OR if user clicked center once
  const shouldCenterMap = isFollowModeActive || isMapCenteredOnUser;

  if (shouldCenterMap && mapRef.current && !cinematicZoomActiveRef.current) {
    // Only move the center — don't touch zoom level.
    // Using animateMapToRegion here caused zoom drift because the
    // delta→zoom→visibleBounds→delta round-trip is lossy.
    centerMapOnCoordinate(mapRef, location, 500);
  }
};

// Helper: defineUnifiedLocationTask
function defineUnifiedLocationTask() {
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
          const locationUpdate = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
          };

          logger.trace('Emitting locationUpdate event from background task', {
            component: 'MapScreen',
            action: 'defineUnifiedLocationTask',
            coordinate: `${locationUpdate.latitude.toFixed(6)}, ${locationUpdate.longitude.toFixed(6)}`,
          });

          DeviceEventEmitter.emit('locationUpdate', locationUpdate);
        }
      }
    }
    return Promise.resolve();
  });
}

// Helper: Start background location updates with task-based tracking
// Includes Android foreground service retry — on Android, the foreground service
// can fail to start if the app is still transitioning from background to foreground.
async function startBackgroundLocationUpdates(retryCount = 0): Promise<void> {
  const locationOptions: any = {
    accuracy: Location.Accuracy.High,
    timeInterval: 100, // 100ms for immediate response
    distanceInterval: 0, // Any movement triggers update
    foregroundService: {
      notificationTitle: 'Fog of Dog',
      notificationBody: 'Tracking your location to reveal the map',
    },
  };

  logger.info('Starting location updates with background service', {
    component: 'MapScreen',
    action: 'startBackgroundLocationUpdates',
    backgroundGranted: true,
    retryCount,
  });

  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK, locationOptions);

    logger.info('Background location updates started successfully', {
      component: 'MapScreen',
      action: 'startBackgroundLocationUpdates',
    });
  } catch (error) {
    const errorMessage = (error as Error)?.message || '';
    const isAndroid = Platform.OS === 'android';

    // Android transient errors that can be resolved with retry
    const isAndroidForegroundServiceError =
      isAndroid &&
      (errorMessage.includes('Foreground service cannot be started') ||
        errorMessage.includes('foreground service'));

    // SharedPreferences null = native module not fully initialized yet (race condition)
    const isSharedPreferencesError =
      isAndroid && errorMessage.includes('SharedPreferences.getAll()');

    const isTransientAndroidError = isAndroidForegroundServiceError || isSharedPreferencesError;

    // On Android, retry with increasing delay for transient native module errors
    if (isTransientAndroidError && retryCount < 5) {
      const delayMs = (retryCount + 1) * 1000; // Longer delays: 1s, 2s, 3s, 4s, 5s
      logger.warn(
        `Android native module error, retrying in ${delayMs}ms (attempt ${retryCount + 1}/5)`,
        {
          component: 'MapScreen',
          action: 'startBackgroundLocationUpdates',
          retryCount,
          errorType: isSharedPreferencesError ? 'SharedPreferences' : 'ForegroundService',
        }
      );
      await new Promise((resolve) => setTimeout(resolve, delayMs));
      return startBackgroundLocationUpdates(retryCount + 1);
    }

    // If retries exhausted on Android, fall back to foreground-only mode
    if (isTransientAndroidError) {
      logger.warn(
        'Android native module retries exhausted — falling back to foreground-only tracking',
        {
          component: 'MapScreen',
          action: 'startBackgroundLocationUpdates',
          retryCount,
          errorType: isSharedPreferencesError ? 'SharedPreferences' : 'ForegroundService',
        }
      );
      await startForegroundLocationUpdates();
      return;
    }

    // Non-Android or non-foreground-service errors — rethrow
    throw error;
  }
}

// Helper: Start foreground-only location updates with watchPositionAsync
async function startForegroundLocationUpdates(): Promise<void> {
  logger.info('Starting location updates in foreground-only mode', {
    component: 'MapScreen',
    action: 'startForegroundLocationUpdates',
    backgroundGranted: false,
    note: 'Using watchPositionAsync for foreground-only tracking',
  });

  // Start watching position for foreground-only mode
  await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 100, // 100ms for immediate response
      distanceInterval: 0, // Any movement triggers update
    },
    (location) => {
      // Emit location update event for foreground tracking
      const locationUpdate = {
        latitude: location.coords.latitude,
        longitude: location.coords.longitude,
      };

      // Note: Removed per-update log to reduce noise (fires every 100ms)
      DeviceEventEmitter.emit('locationUpdate', locationUpdate);
    }
  );

  logger.info('Foreground location updates started successfully', {
    component: 'MapScreen',
    action: 'startForegroundLocationUpdates',
  });
}

// Helper: Handle permission error for foreground-only mode
function handleForegroundPermissionError() {
  logger.info(
    'Location service failed due to background permission limitation - this is expected with foreground-only permission',
    {
      component: 'MapScreen',
      action: 'startLocationUpdates',
      note: 'User chose "Keep Only While Using" - app should work in foreground-only mode',
    }
  );
}

// Helper: Handle permission error for background mode
function handleBackgroundPermissionError(error: Error) {
  PermissionAlert.show({
    errorMessage:
      'Unable to start location tracking. Please check your location permissions and try again.',
    onDismiss: () => {
      logger.info('Location update error alert dismissed');
    },
  });
  throw error;
}

// Helper: Handle non-permission location errors
function handleNonPermissionError(error: Error) {
  logger.info('Location tracking error (non-permission related) - not showing alert', {
    component: 'MapScreen',
    action: 'handleLocationUpdate',
    errorType: 'non_permission',
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  throw error;
}

// Helper: startLocationUpdates - now uses extracted functions
async function startLocationUpdates(backgroundGranted: boolean = false) {
  try {
    if (backgroundGranted) {
      await startBackgroundLocationUpdates();
    } else {
      await startForegroundLocationUpdates();
    }
  } catch (error) {
    logger.error('Failed to start location updates', {
      component: 'MapScreen',
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

// Helper callback for location updates
const createLocationUpdateCallback = (params: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUserRef: React.MutableRefObject<boolean>;
  isFollowModeActiveRef: React.MutableRefObject<boolean>;
  explorationPathRef: React.MutableRefObject<GeoPoint[]>;
  isSessionActiveRef: React.MutableRefObject<boolean>;
}) => {
  return (location: { latitude: number; longitude: number }) => {
    if (params.isActiveRef.current) {
      const geoPoint: GeoPoint = {
        latitude: location.latitude,
        longitude: location.longitude,
        timestamp: Date.now(),
      };
      handleLocationUpdate({
        location: geoPoint,
        dispatch: params.dispatch,
        mapRef: params.mapRef,
        cinematicZoomActiveRef: params.cinematicZoomActiveRef,
        isMapCenteredOnUser: params.isMapCenteredOnUserRef.current,
        isFollowModeActive: params.isFollowModeActiveRef.current,
        explorationPath: params.explorationPathRef.current,
        isSessionActive: params.isSessionActiveRef.current,
      });
    }
  };
};

// Helper callback for GPS injection
const createGPSInjectionCallback = (params: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUserRef: React.MutableRefObject<boolean>;
  isFollowModeActiveRef: React.MutableRefObject<boolean>;
  explorationPathRef: React.MutableRefObject<GeoPoint[]>;
  isSessionActiveRef: React.MutableRefObject<boolean>;
}) => {
  return (location: { latitude: number; longitude: number; timestamp?: number }) => {
    logger.info('🎯 GPS injection event received in MapScreen', {
      component: 'MapScreen',
      action: 'gpsInjectionListener',
      location: `${location.latitude}, ${location.longitude}`,
      timestamp: location.timestamp ? new Date(location.timestamp).toISOString() : 'current time',
      isActive: params.isActiveRef.current,
    });

    if (params.isActiveRef.current) {
      logger.info('📍 Processing GPS injection - calling handleLocationUpdate', {
        component: 'MapScreen',
        action: 'gpsInjectionListener',
        location: `${location.latitude}, ${location.longitude}`,
        timestamp: location.timestamp ? new Date(location.timestamp).toISOString() : 'current time',
      });

      const geoPoint: GeoPoint = {
        latitude: location.latitude,
        longitude: location.longitude,
        // Preserve original timestamp from test data, fallback to current time
        timestamp: location.timestamp ?? Date.now(),
      };

      handleLocationUpdate({
        location: geoPoint,
        dispatch: params.dispatch,
        mapRef: params.mapRef,
        cinematicZoomActiveRef: params.cinematicZoomActiveRef,
        isMapCenteredOnUser: params.isMapCenteredOnUserRef.current,
        isFollowModeActive: params.isFollowModeActiveRef.current,
        explorationPath: params.explorationPathRef.current,
        isSessionActive: params.isSessionActiveRef.current,
      });

      logger.info('✅ GPS injection handleLocationUpdate called', {
        component: 'MapScreen',
        action: 'gpsInjectionListener',
      });
    } else {
      logger.warn('❌ GPS injection ignored - MapScreen not active', {
        component: 'MapScreen',
        action: 'gpsInjectionListener',
      });
    }
  };
};

// Helper: setupLocationListeners
// Accepts refs for frequently-changing values so the effect that calls this
// doesn't need to tear down and recreate listeners on every GPS update.
function setupLocationListeners({
  isActiveRef,
  dispatch,
  mapRef,
  cinematicZoomActiveRef,
  isMapCenteredOnUserRef,
  isFollowModeActiveRef,
  explorationPathRef,
  isSessionActiveRef,
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUserRef: React.MutableRefObject<boolean>;
  isFollowModeActiveRef: React.MutableRefObject<boolean>;
  explorationPathRef: React.MutableRefObject<GeoPoint[]>;
  isSessionActiveRef: React.MutableRefObject<boolean>;
}) {
  const params = {
    isActiveRef,
    dispatch,
    mapRef,
    cinematicZoomActiveRef,
    isMapCenteredOnUserRef,
    isFollowModeActiveRef,
    explorationPathRef,
    isSessionActiveRef,
  };

  const locationUpdateListener = DeviceEventEmitter.addListener(
    'locationUpdate',
    createLocationUpdateCallback(params)
  );

  const gpsInjectionListener = DeviceEventEmitter.addListener(
    'GPS_COORDINATES_INJECTED',
    createGPSInjectionCallback(params)
  );

  return { locationUpdateListener, gpsInjectionListener };
}

// Helper: cleanupLocationListeners
function cleanupLocationListeners(listeners: {
  locationUpdateListener: any;
  gpsInjectionListener: any;
}) {
  listeners.locationUpdateListener.remove();
  listeners.gpsInjectionListener.remove();
}

// Helper to get initial location
export async function getInitialLocation({
  isActiveRef,
  dispatch,
  mapRef,
  cinematicZoomActiveRef,
  isMapCenteredOnUser,
  isFollowModeActive,
  explorationPath,
  isSessionActive,
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  explorationPath: GeoPoint[];
  isSessionActive: boolean;
}) {
  logger.info('🎯 GPS_INITIAL: Starting getInitialLocation', {
    component: 'getInitialLocation',
    isActiveRef: isActiveRef.current,
  });

  try {
    const initialLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });

    if (isActiveRef.current) {
      const geoPoint: GeoPoint = {
        latitude: initialLocation.coords.latitude,
        longitude: initialLocation.coords.longitude,
        timestamp: Date.now(),
      };

      // Emit event for cinematic zoom
      DeviceEventEmitter.emit('locationUpdate', geoPoint);

      handleLocationUpdate({
        location: geoPoint,
        dispatch,
        mapRef,
        cinematicZoomActiveRef,
        isMapCenteredOnUser,
        isFollowModeActive,
        explorationPath,
        isSessionActive,
      });
    }
  } catch (error) {
    logger.warn('GPS acquisition failed in getInitialLocation — waiting for retry loop', {
      component: 'getInitialLocation',
      errorMessage: error instanceof Error ? error.message : String(error),
    });
  }
}

// Helper function to process stored locations on startup
const processStoredLocationsOnStartup = async (dispatch: ReturnType<typeof useAppDispatch>) => {
  try {
    const storedLocations = await BackgroundLocationService.processStoredLocations();
    if (storedLocations.length > 0) {
      logger.info(`Processing ${storedLocations.length} stored background locations on startup`);
      dispatch(processBackgroundLocations(storedLocations));
    }
  } catch (error) {
    logger.error('Failed to process stored locations on startup', error, {
      component: 'MapScreen',
      action: 'processStoredLocationsOnStartup',
    });
  }
};

// Helper function to setup background location tracking
const setupBackgroundLocationTracking = async (backgroundGranted: boolean) => {
  if (!backgroundGranted) {
    logger.warn('Background location permission denied, foreground only');
    return;
  }

  const backgroundStarted = await BackgroundLocationService.startBackgroundLocationTracking();
  if (backgroundStarted) {
    logger.info('Background location tracking started successfully');
  } else {
    logger.warn('Failed to start background location tracking');
  }
};

// Helper function for initializing location services
const initializeLocationServices = async (
  backgroundGranted: boolean,
  locationParams: {
    isActiveRef: { current: boolean };
    dispatch: ReturnType<typeof useAppDispatch>;
    mapRef: React.RefObject<CameraRef | null>;
    cinematicZoomActiveRef: React.MutableRefObject<boolean>;
    isMapCenteredOnUser: boolean;
    isFollowModeActive: boolean;
    explorationPath: GeoPoint[];
    isSessionActive: boolean;
  }
) => {
  // Run GPS diagnostics to surface hardware/services issues early
  GPSDiagnosticsService.diagnose().catch((err) =>
    logger.warn('GPS diagnostics failed (non-blocking)', {
      component: 'MapScreen',
      action: 'initializeLocationServices',
      error: err instanceof Error ? err.message : String(err),
    })
  );

  await BackgroundLocationService.initialize();
  await setupBackgroundLocationTracking(backgroundGranted);

  defineUnifiedLocationTask();
  await startLocationUpdates(backgroundGranted);

  await processStoredLocationsOnStartup(locationParams.dispatch);
  await getInitialLocation(locationParams);
};

// Initialize location services with pre-verified permissions
const initializeLocationServicesWithVerifiedPermissions = async ({
  isActiveRef,
  dispatch,
  mapRef,
  cinematicZoomActiveRef,
  isMapCenteredOnUser,
  isFollowModeActive,
  explorationPath,
  isSessionActive,
  backgroundGranted = false,
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  explorationPath: GeoPoint[];
  isSessionActive: boolean;
  backgroundGranted?: boolean;
}) => {
  try {
    logger.info('Initializing location services (permissions already verified)', {
      component: 'MapScreen',
      action: 'initializeLocationServicesWithVerifiedPermissions',
      backgroundGranted,
    });

    await initializeLocationServices(backgroundGranted, {
      isActiveRef,
      dispatch,
      mapRef,
      cinematicZoomActiveRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      explorationPath,
      isSessionActive,
    });

    logger.info('Location services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize location services', {
      component: 'MapScreen',
      action: 'initializeLocationServicesWithVerifiedPermissions',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

// Configuration interface for location service
export interface LocationServiceConfig {
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  isTrackingPaused: boolean;
  explorationPath: GeoPoint[];
  isSessionActive: boolean;
}

// Comprehensive configuration interface for useUnifiedLocationService
export interface UnifiedLocationServiceConfig {
  dispatch: ReturnType<typeof useAppDispatch>;
  locationConfig: LocationServiceConfig;
  allowLocationRequests?: boolean;
  onPermissionsGranted?: (granted: boolean) => void;
  permissionsVerified?: boolean;
  backgroundGranted?: boolean;
}

// Helper functions for location service management
const createStartLocationServices =
  (
    dispatch: ReturnType<typeof useAppDispatch>,
    config: LocationServiceConfig,
    setIsLocationActive: (active: boolean) => void,
    setPermissionsGranted: (granted: boolean) => void,
    backgroundGranted: boolean
    // eslint-disable-next-line max-params
  ) =>
  async () => {
    const {
      mapRef,
      cinematicZoomActiveRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      explorationPath,
      isSessionActive,
    } = config;

    try {
      logger.info('Starting location services (tracking resumed)', {
        backgroundGranted,
        component: 'createStartLocationServices',
      });
      const isActiveRef = { current: true };

      await initializeLocationServicesWithVerifiedPermissions({
        isActiveRef,
        dispatch,
        mapRef,
        cinematicZoomActiveRef,
        isMapCenteredOnUser,
        isFollowModeActive,
        explorationPath,
        isSessionActive,
        backgroundGranted,
      });

      setPermissionsGranted(true);
      setIsLocationActive(true);
    } catch (error) {
      logger.error('Failed to start location services:', error);
      setPermissionsGranted(false);
    }
  };

const createStopLocationServices = (setIsLocationActive: (active: boolean) => void) => async () => {
  try {
    logger.info('Stopping location services (tracking paused)');

    await Location.stopLocationUpdatesAsync(LOCATION_TASK).catch(() => {
      /* ignore error if task is already stopped */
    });

    await BackgroundLocationService.stopBackgroundLocationTracking().catch(() => {
      /* ignore error if already stopped */
    });

    setIsLocationActive(false);
  } catch (error) {
    logger.error('Failed to stop location services:', error);
  }
};

// Refactor useUnifiedLocationService to use helpers and support pause functionality
// eslint-disable-next-line max-lines-per-function
export const useUnifiedLocationService = (config: UnifiedLocationServiceConfig) => {
  const {
    dispatch,
    locationConfig,
    allowLocationRequests = true,
    onPermissionsGranted,
    permissionsVerified = false,
    backgroundGranted = false,
  } = config;

  const {
    mapRef,
    cinematicZoomActiveRef,
    isMapCenteredOnUser,
    isFollowModeActive,
    isTrackingPaused,
    explorationPath,
    isSessionActive,
  } = locationConfig;
  const [isLocationActive, setIsLocationActive] = useState(false);

  // Refs for frequently-changing values — prevents listener teardown/recreate
  // on every GPS update (explorationPath gets a new array ref each point).
  const explorationPathRef = useRef(explorationPath);
  explorationPathRef.current = explorationPath;
  const isMapCenteredOnUserRef = useRef(isMapCenteredOnUser);
  isMapCenteredOnUserRef.current = isMapCenteredOnUser;
  const isFollowModeActiveRef = useRef(isFollowModeActive);
  isFollowModeActiveRef.current = isFollowModeActive;
  const isSessionActiveRef = useRef(isSessionActive);
  isSessionActiveRef.current = isSessionActive;

  // Initialize location service — uses refs so this only re-runs when dispatch/mapRef change.
  useEffect(() => {
    const isActiveRef = { current: true };

    const listeners = setupLocationListeners({
      isActiveRef,
      dispatch,
      mapRef,
      cinematicZoomActiveRef,
      isMapCenteredOnUserRef,
      isFollowModeActiveRef,
      explorationPathRef,
      isSessionActiveRef,
    });

    return () => {
      isActiveRef.current = false;
      cleanupLocationListeners(listeners);
    };
  }, [dispatch, mapRef, cinematicZoomActiveRef]);

  // Separate effect to handle start/stop based on pause state
  useEffect(() => {
    // CRITICAL: Skip location services until permissions are verified
    if (!allowLocationRequests || !permissionsVerified) {
      logger.info('Skipping location services - permissions not verified', {
        component: 'useUnifiedLocationService',
        allowLocationRequests,
        permissionsVerified,
      });
      return;
    }

    const startLocationServices = createStartLocationServices(
      dispatch,
      locationConfig,
      setIsLocationActive,
      (granted) => {
        if (onPermissionsGranted) {
          onPermissionsGranted(granted);
        }
      },
      backgroundGranted
    );
    const stopLocationServices = createStopLocationServices(setIsLocationActive);

    const handleLocationServiceToggle = async () => {
      if (isTrackingPaused && isLocationActive) {
        await stopLocationServices();
      } else if (!isTrackingPaused && !isLocationActive) {
        await startLocationServices();
      }
    };

    handleLocationServiceToggle();
  }, [
    isTrackingPaused,
    dispatch,
    locationConfig,
    isLocationActive,
    allowLocationRequests,
    onPermissionsGranted,
    permissionsVerified,
    backgroundGranted,
  ]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      Location.stopLocationUpdatesAsync(LOCATION_TASK)?.catch(() => {
        /* ignore error if task is already stopped */
      });
      BackgroundLocationService.stopBackgroundLocationTracking().catch(() => {
        /* ignore error if already stopped */
      });
      logger.info('Unified location service stopped on unmount.');
    };
  }, []);
};
