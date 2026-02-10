import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  DeviceEventEmitter,
  AppState,
  Platform,
  Text,
  Alert,
} from 'react-native';
import {
  PermissionDeniedScreen,
  PermissionLoadingScreen,
  AllowOnceWarningOverlay,
} from './components';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  updateLocation,
  updateZoom,
  setCenterOnUser,
  toggleFollowMode,
  setFollowMode,
  processBackgroundLocations,
} from '../../store/slices/explorationSlice';
import {
  processGeoPoint,
  initializeFromHistory,
  setLoading,
  recalculateArea,
} from '../../store/slices/statsSlice';
import { StatsPersistenceService } from '../../services/StatsPersistenceService';
import {
  MapView,
  Camera,
  MarkerView,
  type CameraRef,
  type RegionPayload,
} from '@maplibre/maplibre-react-native';
import type { MapRegion } from '../../types/map';
import { regionToZoomLevel } from '../../types/map';
import { getSkinStyle } from '../../services/SkinStyleService';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import OptimizedFogOverlay from '../../components/OptimizedFogOverlay';
import LocationButton from '../../components/LocationButton';

import { PermissionAlert } from '../../components/PermissionAlert';
import { TrackingControlButton } from '../../components/TrackingControlButton';
import { OnboardingOverlay } from '../../components/OnboardingOverlay';
import { usePermissionVerification } from './hooks/usePermissionVerification';
import { SettingsButton } from '../../components/SettingsButton';
import UnifiedSettingsModal from '../../components/UnifiedSettingsModal';
import { HUDStatsPanel } from '../../components/HUDStatsPanel';
import { GPSInjectionIndicator } from '../../components/GPSInjectionIndicator';
import { GPSAcquisitionOverlay } from '../../components/GPSAcquisitionOverlay';
import { ExplorationNudge } from '../../components/ExplorationNudge';
import { MapDistanceScale } from '../../components/MapDistanceScale';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';
import { useCinematicZoom } from './hooks/useCinematicZoom';
import { useMapScreenOnboarding } from './hooks/useMapScreenOnboarding';

import { GPSInjectionService } from '../../services/GPSInjectionService';
import { BackgroundLocationService } from '../../services/BackgroundLocationService';
import { AuthPersistenceService } from '../../services/AuthPersistenceService';
import { DataClearingService } from '../../services/DataClearingService';
import { GPSDiagnosticsService } from '../../services/GPSDiagnosticsService';

import { DataStats, ClearType } from '../../types/dataClear';
import { GeoPoint } from '../../types/user';

import { constrainRegion } from '../../constants/mapConstraints';
// Performance optimizations available via OptimizedFogOverlay component

/**
 * Animate the map camera to a region (center + deltas).
 * Bridges the react-native-maps Region concept to MapLibre's Camera API.
 */
const animateMapToRegion = (
  cameraRef: React.RefObject<CameraRef | null>,
  region: MapRegion,
  duration: number = 300
) => {
  cameraRef.current?.setCamera({
    centerCoordinate: [region.longitude, region.latitude],
    zoomLevel: regionToZoomLevel(region),
    animationDuration: duration,
    animationMode: 'easeTo',
  });
};

// Unified location task name
const LOCATION_TASK = 'unified-location-task';

// Default deltas for zoom level (approx 400m diameter view)
const DEFAULT_ZOOM_DELTAS = {
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

// Note: Animation constants are now defined in useCinematicZoom hook

// Calculate region that encompasses exploration path with padding
export const calculateExplorationBounds = (explorationPath: GeoPoint[]): MapRegion | null => {
  if (explorationPath.length === 0) return null;

  // Find min/max coordinates
  const firstPoint = explorationPath[0];
  if (!firstPoint) return null;

  let minLat = firstPoint.latitude;
  let maxLat = firstPoint.latitude;
  let minLng = firstPoint.longitude;
  let maxLng = firstPoint.longitude;

  explorationPath.forEach((point) => {
    minLat = Math.min(minLat, point.latitude);
    maxLat = Math.max(maxLat, point.latitude);
    minLng = Math.min(minLng, point.longitude);
    maxLng = Math.max(maxLng, point.longitude);
  });

  // Calculate center and deltas with padding
  const centerLat = (minLat + maxLat) / 2;
  const centerLng = (minLng + maxLng) / 2;
  const latDelta = (maxLat - minLat) * 1.5; // 50% padding
  const lngDelta = (maxLng - minLng) * 1.5; // 50% padding

  // Ensure minimum zoom level (don't zoom in too much for small areas)
  const minLatDelta = DEFAULT_ZOOM_DELTAS.latitudeDelta * 2; // At least 2x normal zoom
  const minLngDelta = DEFAULT_ZOOM_DELTAS.longitudeDelta * 2;

  return {
    latitude: centerLat,
    longitude: centerLng,
    latitudeDelta: Math.max(latDelta, minLatDelta),
    longitudeDelta: Math.max(lngDelta, minLngDelta),
  };
};

// Note: Max zoom constraints are now defined above (20km limit)

// Types for better type safety (using GeoPoint from types/user.ts)

interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

// Refactor handleLocationUpdate to use an options object
interface HandleLocationUpdateOptions {
  location: GeoPoint;
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: MapRegion | undefined;
  explorationPath: GeoPoint[];
  isSessionActive: boolean;
}

const handleLocationUpdate = ({
  location,
  dispatch,
  mapRef,
  cinematicZoomActiveRef,
  isMapCenteredOnUser,
  isFollowModeActive,
  currentRegion,
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
    const newRegion = {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: currentRegion?.latitudeDelta ?? DEFAULT_ZOOM_DELTAS.latitudeDelta,
      longitudeDelta: currentRegion?.longitudeDelta ?? DEFAULT_ZOOM_DELTAS.longitudeDelta,
    };
    animateMapToRegion(mapRef, newRegion, 500);
  }
};

// OLD PERMISSION SYSTEM REMOVED
// Permissions are now handled by PermissionVerificationService before MapScreen services start

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
  // Don't show error dialog - this is a valid user choice
  // Don't throw error either - app should continue working in foreground-only mode
}

// Helper: Handle permission error for background mode
function handleBackgroundPermissionError(error: Error) {
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

// Helper: Handle non-permission location errors
function handleNonPermissionError(error: Error) {
  logger.info('Location tracking error (non-permission related) - not showing alert', {
    component: 'MapScreen',
    action: 'handleLocationUpdate',
    errorType: 'non_permission',
    errorMessage: error instanceof Error ? error.message : String(error),
  });
  throw error; // Non-permission errors should still be thrown
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
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: MapRegion | undefined;
  explorationPath: GeoPoint[];
  isSessionActive: boolean;
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
        isMapCenteredOnUser: params.isMapCenteredOnUser,
        isFollowModeActive: params.isFollowModeActive,
        currentRegion: params.currentRegion,
        explorationPath: params.explorationPath,
        isSessionActive: params.isSessionActive,
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
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: MapRegion | undefined;
  explorationPath: GeoPoint[];
  isSessionActive: boolean;
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
        isMapCenteredOnUser: params.isMapCenteredOnUser,
        isFollowModeActive: params.isFollowModeActive,
        currentRegion: params.currentRegion,
        explorationPath: params.explorationPath,
        isSessionActive: params.isSessionActive,
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
function setupLocationListeners({
  isActiveRef,
  dispatch,
  mapRef,
  cinematicZoomActiveRef,
  isMapCenteredOnUser,
  isFollowModeActive,
  currentRegion,
  explorationPath,
  isSessionActive,
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: MapRegion | undefined;
  explorationPath: GeoPoint[];
  isSessionActive: boolean;
}) {
  const params = {
    isActiveRef,
    dispatch,
    mapRef,
    cinematicZoomActiveRef,
    isMapCenteredOnUser,
    isFollowModeActive,
    currentRegion,
    explorationPath,
    isSessionActive,
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
async function getInitialLocation({
  isActiveRef,
  dispatch,
  mapRef,
  cinematicZoomActiveRef,
  isMapCenteredOnUser,
  isFollowModeActive,
  currentRegion,
  explorationPath,
  isSessionActive,
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: MapRegion | undefined;
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
        currentRegion,
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
      // Dispatch the stored locations to Redux for processing
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

  // Start background location tracking
  const backgroundStarted = await BackgroundLocationService.startBackgroundLocationTracking();
  if (backgroundStarted) {
    logger.info('Background location tracking started successfully');
  } else {
    logger.warn('Failed to start background location tracking');
  }
};

// OLD PERMISSION HANDLING REMOVED
// All permission handling is now done by PermissionVerificationService before this point

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
    currentRegion: MapRegion | undefined;
    explorationPath: GeoPoint[];
    isSessionActive: boolean;
  }
) => {
  // Run GPS diagnostics to surface hardware/services issues early
  // This is fire-and-forget — it logs warnings but doesn't block init
  GPSDiagnosticsService.diagnose().catch((err) =>
    logger.warn('GPS diagnostics failed (non-blocking)', {
      component: 'MapScreen',
      action: 'initializeLocationServices',
      error: err instanceof Error ? err.message : String(err),
    })
  );

  // Initialize BackgroundLocationService
  await BackgroundLocationService.initialize();

  // Setup background location tracking
  await setupBackgroundLocationTracking(backgroundGranted);

  // Start foreground location tracking
  defineUnifiedLocationTask();
  await startLocationUpdates(backgroundGranted);

  // Process any stored background locations
  await processStoredLocationsOnStartup(locationParams.dispatch);

  // Get initial location
  await getInitialLocation(locationParams);
};

// Initialize location services with pre-verified permissions
// Permissions are already verified by PermissionVerificationService
const initializeLocationServicesWithVerifiedPermissions = async ({
  isActiveRef,
  dispatch,
  mapRef,
  cinematicZoomActiveRef,
  isMapCenteredOnUser,
  isFollowModeActive,
  currentRegion,
  explorationPath,
  isSessionActive,
  backgroundGranted = false, // Default to false, must be explicitly passed
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: MapRegion | undefined;
  explorationPath: GeoPoint[];
  isSessionActive: boolean;
  backgroundGranted?: boolean; // Add parameter for actual background permission status
}) => {
  try {
    logger.info('Initializing location services (permissions already verified)', {
      component: 'MapScreen',
      action: 'initializeLocationServicesWithVerifiedPermissions',
      backgroundGranted,
    });

    // Use the actual background permission status passed from permission verification
    await initializeLocationServices(backgroundGranted, {
      isActiveRef,
      dispatch,
      mapRef,
      cinematicZoomActiveRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      currentRegion,
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
interface LocationServiceConfig {
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: MapRegion | undefined;
  isTrackingPaused: boolean;
  explorationPath: GeoPoint[];
  isSessionActive: boolean;
}

// Comprehensive configuration interface for useUnifiedLocationService
interface UnifiedLocationServiceConfig {
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
    backgroundGranted: boolean // Add backgroundGranted parameter
    // eslint-disable-next-line max-params
  ) =>
  async () => {
    const {
      mapRef,
      cinematicZoomActiveRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      currentRegion,
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
        currentRegion,
        explorationPath,
        isSessionActive,
        backgroundGranted, // Pass the actual background permission status
      });

      // Notify that location services started successfully
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
const useUnifiedLocationService = (config: UnifiedLocationServiceConfig) => {
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
    currentRegion,
    isTrackingPaused,
    explorationPath,
    isSessionActive,
  } = locationConfig;
  // Track if location services are currently active
  const [isLocationActive, setIsLocationActive] = useState(false);

  // Initialize location service once on mount
  useEffect(() => {
    const isActiveRef = { current: true };

    // Set up listeners for location and GPS injection events
    const listeners = setupLocationListeners({
      isActiveRef,
      dispatch,
      mapRef,
      cinematicZoomActiveRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      currentRegion,
      explorationPath,
      isSessionActive,
    });

    return () => {
      isActiveRef.current = false;
      cleanupLocationListeners(listeners);
    };
  }, [
    dispatch,
    mapRef,
    isMapCenteredOnUser,
    isFollowModeActive,
    currentRegion,
    explorationPath,
    isSessionActive,
  ]);

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
        // This callback is now handled by the parent useUnifiedLocationService
        // and passed to createStartLocationServices.
        // We can use it here if we need to update a state variable
        // that depends on the permission status, but for now,
        // we just need to ensure the service starts.
        if (onPermissionsGranted) {
          onPermissionsGranted(granted);
        }
      },
      backgroundGranted // Pass the actual background permission status
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
    permissionsVerified, // Add permissionsVerified to dependency array
    backgroundGranted, // Add backgroundGranted to dependency array
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

// Note: Zoom restrictions are now handled in handleRegionChangeComplete to prevent oscillation loops

// Individual event handler functions
const createZoomHandler = (dispatch: ReturnType<typeof useAppDispatch>) => (newZoom: number) => {
  dispatch(updateZoom(newZoom));
};

const createCenterOnUserHandler =
  (options: {
    currentLocation: GeoPoint | null;
    currentRegion: MapRegion | undefined;
    mapRef: React.RefObject<CameraRef | null>;
    cinematicZoomActiveRef: React.MutableRefObject<boolean>;
    dispatch: ReturnType<typeof useAppDispatch>;
    isFollowModeActive: boolean;
  }) =>
  () => {
    const {
      currentLocation,
      currentRegion,
      mapRef,
      cinematicZoomActiveRef,
      dispatch,
      isFollowModeActive,
    } = options;
    // Toggle follow mode
    dispatch(toggleFollowMode());

    // If follow mode was OFF and is now ON, center the map immediately
    // But skip if cinematic zoom is active to prevent conflicts
    if (
      !isFollowModeActive &&
      currentLocation &&
      mapRef.current &&
      !cinematicZoomActiveRef.current
    ) {
      const userRegion = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: currentRegion?.latitudeDelta ?? DEFAULT_ZOOM_DELTAS.latitudeDelta,
        longitudeDelta: currentRegion?.longitudeDelta ?? DEFAULT_ZOOM_DELTAS.longitudeDelta,
      };

      animateMapToRegion(mapRef, userRegion, 300);
      dispatch(setCenterOnUser(true));
    }
  };

// Extracted event handler helpers for useMapEventHandlers

/**
 * Guard against bogus (0,0) regions from react-native-maps Fabric timing issue.
 *
 * When MKMapView initializes under the New Architecture (Fabric), it fires
 * regionDidChangeAnimated: with its default region (near 0,0) BEFORE the
 * initialRegion prop is applied via updateProps. If we accept that region,
 * the fog overlay's viewport culling drops ALL GPS points (which are far from
 * Null Island), resulting in a solid black screen.
 *
 * This guard rejects regions where both |lat| < 0.5 and |lng| < 0.5,
 * which covers Null Island and its surroundings — a location no one is
 * walking their dog.
 */
export function isNullIslandRegion(region: MapRegion): boolean {
  return Math.abs(region.latitude) < 0.5 && Math.abs(region.longitude) < 0.5;
}

function handleRegionChange({
  region,
  setCurrentRegion,
  setCurrentFogRegion,
  mapDimensions,
  workletUpdateRegion,
}: {
  region: MapRegion;
  setCurrentRegion: (region: MapRegion) => void;
  setCurrentFogRegion: (
    region: (MapRegion & { width: number; height: number }) | undefined
  ) => void;
  mapDimensions: { width: number; height: number };
  workletUpdateRegion: (region: MapRegion & { width: number; height: number }) => void;
}) {
  // Reject bogus near-(0,0) regions from Fabric initialization timing issue.
  // See isNullIslandRegion() for details.
  if (isNullIslandRegion(region)) {
    return;
  }

  const regionWithDimensions = {
    ...region,
    width: mapDimensions.width,
    height: mapDimensions.height,
  };

  // Update fog region immediately for synchronization with OptimizedFogOverlay
  workletUpdateRegion(regionWithDimensions);

  // Update region state for other components (async)
  setCurrentRegion(region);

  // Legacy fog region update for backward compatibility
  setCurrentFogRegion(regionWithDimensions);
}

function handlePanDrag({ dispatch }: { dispatch: ReturnType<typeof useAppDispatch> }) {
  // User is panning/dragging - disable both centered state and follow mode
  dispatch(setCenterOnUser(false));
  dispatch(setFollowMode(false));

  logger.throttledDebug(
    'MapScreen:onPanDrag',
    'User dragged map - follow mode disabled',
    {
      component: 'MapScreen',
      action: 'onPanDrag',
    },
    1000 // 1 second interval
  );
}

function handleRegionChangeComplete({
  region,
  setCurrentRegion,
  handleZoomChange,
  mapRef,
  cinematicZoomActiveRef,
}: {
  region: MapRegion;
  setCurrentRegion: (region: MapRegion) => void;
  handleZoomChange: (zoom: number) => void;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
}) {
  // Reject bogus near-(0,0) regions from Fabric initialization timing issue.
  if (isNullIslandRegion(region)) {
    return;
  }

  // Constrain the region to prevent zooming out beyond 20km
  const constrainedRegion = constrainRegion(region);
  const zoom = Math.round(Math.log(360 / constrainedRegion.latitudeDelta) / Math.LN2);

  // If the region was constrained, animate back to the constrained region
  // But skip if cinematic zoom is active to prevent conflicts
  if (
    (constrainedRegion.latitudeDelta !== region.latitudeDelta ||
      constrainedRegion.longitudeDelta !== region.longitudeDelta) &&
    !cinematicZoomActiveRef.current
  ) {
    logger.debug('Applying zoom constraints', {
      component: 'MapScreen',
      reason: 'zoom_constraint_violation',
    });
    animateMapToRegion(mapRef, constrainedRegion, 200);
  }

  setCurrentRegion(constrainedRegion);
  handleZoomChange(zoom);
}

// Refactor useMapEventHandlers to use helpers
const useMapEventHandlers = (options: {
  dispatch: ReturnType<typeof useAppDispatch>;
  currentLocation: GeoPoint | null;
  currentRegion: MapRegion | undefined;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  setCurrentRegion: (region: MapRegion) => void;
  setCurrentFogRegion: (
    region: (MapRegion & { width: number; height: number }) | undefined
  ) => void;
  mapDimensions: { width: number; height: number };
  workletUpdateRegion: (region: MapRegion & { width: number; height: number }) => void;
}) => {
  const {
    dispatch,
    currentLocation,
    currentRegion,
    isFollowModeActive,
    mapRef,
    cinematicZoomActiveRef,
    setCurrentRegion,
    setCurrentFogRegion,
    mapDimensions,
    workletUpdateRegion,
  } = options;

  // Simple throttle function to limit update frequency
  const throttle = (fn: Function, ms: number) => {
    let lastCall = 0;
    return (...args: any[]) => {
      const now = Date.now();
      if (now - lastCall >= ms) {
        lastCall = now;
        fn(...args);
      }
    };
  };

  const handleZoomChange = createZoomHandler(dispatch);
  const centerOnUserLocation = createCenterOnUserHandler({
    currentLocation,
    currentRegion,
    mapRef,
    cinematicZoomActiveRef,
    dispatch,
    isFollowModeActive,
  });

  const onRegionChange = throttle(
    (region: MapRegion) =>
      handleRegionChange({
        region,
        setCurrentRegion,
        setCurrentFogRegion,
        mapDimensions,
        workletUpdateRegion,
      }),
    16
  ); // ~60fps

  const onPanDrag = () => handlePanDrag({ dispatch });

  const onRegionChangeComplete = (region: MapRegion) =>
    handleRegionChangeComplete({
      region,
      setCurrentRegion,
      handleZoomChange,
      mapRef,
      cinematicZoomActiveRef,
    });

  return {
    centerOnUserLocation,
    onRegionChange,
    onPanDrag,
    onRegionChangeComplete,
  };
};

// User location marker style
const USER_MARKER_STYLE = {
  width: 20,
  height: 20,
  backgroundColor: 'cyan',
  borderRadius: 10,
  borderColor: 'white',
  borderWidth: 2,
};

// LocationButton positioning style
const getLocationButtonStyle = (insets: SafeAreaInsets) => ({
  position: 'absolute' as const,
  top: insets.top + 10,
  right: 10,
});

// SettingsButton positioning style
const getSettingsButtonStyle = (insets: SafeAreaInsets) => ({
  position: 'absolute' as const,
  top: insets.top + 10,
  left: 10,
});

// Type definition for MapScreenRenderer props
interface MapScreenRendererProps {
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  currentLocation: GeoPoint | null;
  insets: SafeAreaInsets;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  onRegionChange: (region: MapRegion) => void;
  onPanDrag: () => void;
  onRegionChangeComplete: (region: MapRegion) => void;
  centerOnUserLocation: () => void;
  setMapDimensions: (dimensions: { width: number; height: number }) => void;
  currentFogRegion: (MapRegion & { width: number; height: number }) | undefined;
  handleSettingsPress: () => void;
  canStartCinematicAnimation?: boolean; // Control when cinematic animation can start
  // workletMapRegion?: ReturnType<typeof useWorkletMapRegion>; // Available for future worklet integration
}

// Loading state component — shown only briefly while fallback region loads from AsyncStorage
const MapLoadingState = ({
  setMapDimensions,
  centerOnUserLocation,
  isMapCenteredOnUser,
  isFollowModeActive,
  insets,
}: {
  setMapDimensions: (dimensions: { width: number; height: number }) => void;
  centerOnUserLocation: () => void;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  insets: SafeAreaInsets;
}) => (
  <View
    style={styles.container}
    testID="map-screen"
    onLayout={(event) => {
      const { width, height } = event.nativeEvent.layout;
      setMapDimensions({ width, height });
    }}
  >
    <View style={styles.loadingContainer}>
      <Text style={styles.loadingText}>Preparing map…</Text>
    </View>
    <LocationButton
      onPress={centerOnUserLocation}
      isCentered={isMapCenteredOnUser}
      isFollowModeActive={isFollowModeActive}
      style={getLocationButtonStyle(insets)}
    />
    <SettingsButton
      onPress={() => {
        logger.info('Settings button pressed during loading state');
      }}
      style={getSettingsButtonStyle(insets)}
    />
  </View>
);

// Render component for the map view and overlays
/**
 * Calculate adjusted marker coordinate to align with safe area compensated fog overlay
 * The fog overlay accounts for safe area insets, but MapView markers use raw coordinates
 */
const calculateAdjustedMarkerCoordinate = (
  currentLocation: GeoPoint | null,
  currentRegion: MapRegion | undefined,
  mapDimensions: { width: number; height: number },
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number }
): { latitude: number; longitude: number } => {
  // Return original coordinates if we don't have all required data
  if (!currentLocation || !currentRegion || !safeAreaInsets || mapDimensions.height <= 0) {
    return {
      latitude: currentLocation?.latitude ?? 0,
      longitude: currentLocation?.longitude ?? 0,
    };
  }

  // Calculate the vertical offset needed to align marker with fog overlay center
  // Mathematical reasoning:
  // 1. Safe area creates a visual offset of safeAreaTop/2 (pushes content down)
  // 2. Both MapView and fog overlay are affected by safe area, but differently
  // 3. The net misalignment is half the visual offset = (safeAreaTop/2)/2 = safeAreaTop/4
  // 4. Therefore: markerAdjustment = (safeAreaTop - safeAreaBottom) / 4
  const safeAreaVerticalOffset = (safeAreaInsets.top - safeAreaInsets.bottom) / 4;

  // Convert the pixel offset to a latitude offset
  // Positive offset means marker should move north (higher latitude)
  // Use actual map dimensions height
  const latitudePerPixel = currentRegion.latitudeDelta / mapDimensions.height;
  const latitudeAdjustment = safeAreaVerticalOffset * latitudePerPixel;

  return {
    latitude: currentLocation.latitude + latitudeAdjustment,
    longitude: currentLocation.longitude,
  };
};

// Helper component for rendering the MapView with marker
const MapViewWithMarker = ({
  mapRef,
  initialRegion,
  currentLocation,
  currentRegion,
  mapDimensions,
  safeAreaInsets,
  onRegionChange,
  onPanDrag,
  onRegionChangeComplete,
}: {
  mapRef: React.RefObject<CameraRef | null>;
  initialRegion: MapRegion;
  currentLocation: GeoPoint | null;
  currentRegion?: MapRegion | undefined;
  mapDimensions: { width: number; height: number };
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
  onRegionChange: (region: MapRegion) => void;
  onPanDrag: () => void;
  onRegionChangeComplete: (region: MapRegion) => void;
}) => {
  const activeSkin = useAppSelector((state) => state.skin.activeSkin);
  const mapStyle = getSkinStyle(activeSkin);
  const adjustedCoordinate = currentLocation
    ? calculateAdjustedMarkerCoordinate(
        currentLocation,
        currentRegion,
        mapDimensions,
        safeAreaInsets
      )
    : null;

  // Convert MapLibre region event payload to our MapRegion type
  const handleRegionEvent = (feature: GeoJSON.Feature, callback: (region: MapRegion) => void) => {
    const props = feature.properties as RegionPayload;
    const coords = (feature.geometry as GeoJSON.Point).coordinates;
    if (props.visibleBounds && coords) {
      const [ne, sw] = props.visibleBounds;
      const lat = coords[1] ?? 0;
      const lng = coords[0] ?? 0;
      const neLat = ne?.[1] ?? lat;
      const neLng = ne?.[0] ?? lng;
      const swLat = sw?.[1] ?? lat;
      const swLng = sw?.[0] ?? lng;
      callback({
        latitude: lat,
        longitude: lng,
        latitudeDelta: Math.abs(neLat - swLat),
        longitudeDelta: Math.abs(neLng - swLng),
      });
    }
  };

  return (
    <MapView
      style={styles.map}
      mapStyle={mapStyle}
      rotateEnabled={false}
      pitchEnabled={false}
      attributionEnabled={false}
      logoEnabled={false}
      onRegionIsChanging={(feature) => handleRegionEvent(feature, onRegionChange)}
      onRegionDidChange={(feature) => {
        handleRegionEvent(feature, onRegionChangeComplete);
        // Detect user interaction for pan-drag behavior
        const props = feature.properties as RegionPayload;
        if (props.isUserInteraction) {
          onPanDrag();
        }
      }}
    >
      <Camera
        ref={mapRef}
        defaultSettings={{
          centerCoordinate: [initialRegion.longitude, initialRegion.latitude],
          zoomLevel: regionToZoomLevel(initialRegion),
        }}
      />
      {currentLocation && adjustedCoordinate && (
        <MarkerView
          coordinate={[adjustedCoordinate.longitude, adjustedCoordinate.latitude]}
          anchor={{ x: 0.5, y: 0.5 }}
        >
          <View style={USER_MARKER_STYLE} />
        </MarkerView>
      )}
    </MapView>
  );
};

const MapScreenRenderer = ({
  mapRef,
  cinematicZoomActiveRef,
  currentLocation,
  insets,
  isMapCenteredOnUser,
  isFollowModeActive,
  onRegionChange,
  onPanDrag,
  onRegionChangeComplete,
  centerOnUserLocation,
  setMapDimensions,
  currentFogRegion,
  handleSettingsPress,
  canStartCinematicAnimation = true, // New prop to control animation timing
}: MapScreenRendererProps) => {
  // Use the new cinematic zoom hook (must be before early return)
  const { initialRegion } = useCinematicZoom({
    mapRef,
    cinematicZoomActiveRef,
    currentLocation,
    canStartAnimation: canStartCinematicAnimation,
  });

  // Brief null while fallback region loads from AsyncStorage (~1 frame)
  if (!initialRegion) {
    return (
      <MapLoadingState
        setMapDimensions={setMapDimensions}
        centerOnUserLocation={centerOnUserLocation}
        isMapCenteredOnUser={isMapCenteredOnUser}
        isFollowModeActive={isFollowModeActive}
        insets={insets}
      />
    );
  }

  // Map is always rendered — GPS acquisition overlay appears on top when location unknown
  const isAcquiringGPS = !currentLocation;

  return (
    <View
      style={styles.container}
      testID="map-screen"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setMapDimensions({ width, height });
      }}
    >
      <MapViewWithMarker
        mapRef={mapRef}
        initialRegion={initialRegion}
        currentLocation={currentLocation}
        currentRegion={currentFogRegion}
        mapDimensions={{
          width: currentFogRegion?.width ?? 0,
          height: currentFogRegion?.height ?? 0,
        }}
        safeAreaInsets={insets}
        onRegionChange={onRegionChange}
        onPanDrag={onPanDrag}
        onRegionChangeComplete={onRegionChangeComplete}
      />

      {/* Fog overlay only when we have a real location */}
      {currentFogRegion && !isAcquiringGPS && (
        <OptimizedFogOverlay mapRegion={currentFogRegion} safeAreaInsets={insets} />
      )}

      {/* Distance scale legend */}
      {currentFogRegion && !isAcquiringGPS && (
        <MapDistanceScale region={currentFogRegion} mapWidth={currentFogRegion.width} />
      )}

      {/* GPS acquisition overlay — visible until first location fix */}
      <GPSAcquisitionOverlay visible={isAcquiringGPS} />

      <LocationButton
        onPress={centerOnUserLocation}
        isCentered={isMapCenteredOnUser}
        isFollowModeActive={isFollowModeActive}
        style={getLocationButtonStyle(insets)}
      />
      <SettingsButton onPress={handleSettingsPress} style={getSettingsButtonStyle(insets)} />
    </View>
  );
};

// Custom hook for exploration state persistence
const useExplorationStatePersistence = (explorationState: any) => {
  useEffect(() => {
    const persistExplorationState = async () => {
      try {
        logger.info('🔄 Starting exploration state persistence', {
          component: 'MapScreen',
          action: 'persistExplorationState',
          pathLength: explorationState.path.length,
          hasCurrentLocation: !!explorationState.currentLocation,
        });

        await AuthPersistenceService.saveExplorationState({
          currentLocation: explorationState.currentLocation,
          path: explorationState.path,
          exploredAreas: explorationState.exploredAreas,
          zoomLevel: explorationState.zoomLevel,
          isTrackingPaused: explorationState.isTrackingPaused,
        });

        logger.info('✅ Exploration state persistence completed successfully', {
          component: 'MapScreen',
          action: 'persistExplorationState',
          pathLength: explorationState.path.length,
        });

        // Immediately verify the data was saved
        const savedState = await AuthPersistenceService.getExplorationState();
        logger.info('🔍 Verified saved exploration state', {
          component: 'MapScreen',
          action: 'persistExplorationState',
          savedPathLength: savedState?.path.length ?? 0,
          savedSuccessfully: savedState !== null,
        });
      } catch (error) {
        logger.error('❌ Failed to persist exploration state', error, {
          component: 'MapScreen',
          action: 'persistExplorationState',
        });
      }
    };

    // Only persist if we have meaningful data
    if (explorationState.path.length > 0 || explorationState.currentLocation) {
      logger.info('📊 Triggering exploration state persistence', {
        component: 'MapScreen',
        pathLength: explorationState.path.length,
        hasCurrentLocation: !!explorationState.currentLocation,
      });
      persistExplorationState();
    }
  }, [
    explorationState.currentLocation,
    explorationState.path,
    explorationState.exploredAreas,
    explorationState.zoomLevel,
    explorationState.isTrackingPaused,
  ]);
};

// GPS injection service is now integrated into useMapScreenServices
// and only runs after permissions are verified

// Helper function to process stored locations
const processStoredBackgroundLocations = async (
  storedLocations: any[],
  options: {
    dispatch: ReturnType<typeof useAppDispatch>;
    isMapCenteredOnUser: boolean;
    currentRegion: MapRegion | undefined;
    mapRef: React.RefObject<CameraRef | null>;
  }
) => {
  const { dispatch, isMapCenteredOnUser, currentRegion, mapRef } = options;

  if (storedLocations.length === 0) return;

  logger.info(`Processed ${storedLocations.length} stored background locations`);
  // Update Redux with the most recent stored location if available
  const mostRecent = storedLocations[storedLocations.length - 1];
  if (!mostRecent) return;

  dispatch(
    updateLocation({
      latitude: mostRecent.latitude,
      longitude: mostRecent.longitude,
      timestamp: mostRecent.timestamp,
    })
  );

  // Center map on new location if user tracking is enabled
  // Skip if cinematic zoom is active to prevent interrupting the animation
  if (isMapCenteredOnUser && mapRef.current && !(mapRef.current as any)?._cinematicZoomActive) {
    const newRegion = {
      latitude: mostRecent.latitude,
      longitude: mostRecent.longitude,
      latitudeDelta: currentRegion?.latitudeDelta ?? DEFAULT_ZOOM_DELTAS.latitudeDelta,
      longitudeDelta: currentRegion?.longitudeDelta ?? DEFAULT_ZOOM_DELTAS.longitudeDelta,
    };
    animateMapToRegion(mapRef, newRegion, 500);
  }
};

// Custom hook for app state change handling
const useAppStateChangeHandler = (
  dispatch: ReturnType<typeof useAppDispatch>,
  isMapCenteredOnUser: boolean,
  currentRegion: MapRegion | undefined,
  mapRef: React.RefObject<CameraRef | null>
) => {
  useEffect(() => {
    const handleAppStateChange = async (nextAppState: string) => {
      if (nextAppState !== 'active') return;

      logger.info('App became active, processing stored background locations');
      try {
        const storedLocations = await BackgroundLocationService.processStoredLocations();
        await processStoredBackgroundLocations(storedLocations, {
          dispatch,
          isMapCenteredOnUser,
          currentRegion,
          mapRef,
        });
      } catch (error) {
        logger.error('Failed to process stored locations on app state change', error);
      }
    };

    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription?.remove();
  }, [dispatch, isMapCenteredOnUser, currentRegion, mapRef]);
};

// Helper functions for data clearing
const performDataClear = async (type: ClearType) => {
  if (type === 'all') {
    await DataClearingService.clearAllData();
  } else {
    const hours = type === 'hour' ? 1 : 24;
    const startTime = Date.now() - hours * 60 * 60 * 1000;
    await DataClearingService.clearDataByTimeRange(startTime);
  }
};

const refetchLocationAfterClear = async (
  type: ClearType,
  options: {
    dispatch: ReturnType<typeof useAppDispatch>;
    mapRef: React.RefObject<CameraRef | null>;
    cinematicZoomActiveRef: React.MutableRefObject<boolean>;
    isMapCenteredOnUser: boolean;
    currentRegion: MapRegion | undefined;
  }
) => {
  logger.info('Re-fetching current location after data clear', {
    component: 'MapScreen',
    action: 'handleClearSelection',
    clearType: type,
  });

  const isActiveRef = { current: true };
  await getInitialLocation({
    isActiveRef,
    dispatch: options.dispatch,
    mapRef: options.mapRef,
    cinematicZoomActiveRef: options.cinematicZoomActiveRef,
    isMapCenteredOnUser: options.isMapCenteredOnUser,
    isFollowModeActive: false, // Don't trigger follow mode after data clear
    currentRegion: options.currentRegion,
    explorationPath: [], // Empty after data clear
    isSessionActive: false, // No active session after data clear
  });
};

// Helper function for handling data clear selection
const createDataClearHandler = (
  state: {
    isClearing: boolean;
    setIsClearing: React.Dispatch<React.SetStateAction<boolean>>;
    setDataStats: React.Dispatch<React.SetStateAction<DataStats>>;
    setIsDataClearDialogVisible: React.Dispatch<React.SetStateAction<boolean>>;
  },
  config: {
    dispatch: ReturnType<typeof useAppDispatch>;
    mapRef: React.RefObject<CameraRef | null>;
    cinematicZoomActiveRef: React.MutableRefObject<boolean>;
    isMapCenteredOnUser: boolean;
    currentRegion: MapRegion | undefined;
  }
) => {
  const { isClearing, setIsClearing, setDataStats, setIsDataClearDialogVisible } = state;
  return async (type: ClearType) => {
    logger.info('handleClearSelection called', {
      component: 'MapScreen',
      action: 'handleClearSelection',
      clearType: type,
      isClearing: isClearing,
    });

    if (isClearing) {
      logger.warn('handleClearSelection blocked - already clearing', {
        component: 'MapScreen',
        action: 'handleClearSelection',
        clearType: type,
      });
      return;
    }

    setIsClearing(true);
    try {
      await performDataClear(type);
      await refetchLocationAfterClear(type, config);

      Alert.alert('Success', 'Exploration data has been cleared.');
      const newStats = await DataClearingService.getDataStats();
      setDataStats(newStats);
    } catch (error) {
      logger.error('Failed to clear data', { error });
      Alert.alert('Error', 'Failed to clear exploration data.');
    } finally {
      setIsClearing(false);
      setIsDataClearDialogVisible(false);
    }
  };
};

// Custom hook for data clearing functionality
const useDataClearing = (
  dispatch: ReturnType<typeof useAppDispatch>,
  mapConfig: {
    mapRef: React.RefObject<CameraRef | null>;
    cinematicZoomActiveRef: React.MutableRefObject<boolean>;
    isMapCenteredOnUser: boolean;
    currentRegion: MapRegion | undefined;
  },
  explorationState: any
) => {
  const [dataStats, setDataStats] = useState<DataStats>({
    totalPoints: 0,
    recentPoints: 0,
    oldestDate: null,
    newestDate: null,
  });
  const [isClearing, setIsClearing] = useState(false);
  const [isSettingsModalVisible, setIsSettingsModalVisible] = useState(false);

  const updateDataStats = useCallback(async () => {
    try {
      const stats = await DataClearingService.getDataStats();
      setDataStats(stats);
    } catch (error) {
      logger.debug('Failed to update data stats', {
        component: 'MapScreen',
        action: 'updateDataStats',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, []);

  // Update data stats once on mount - no polling!
  useEffect(() => {
    updateDataStats();
  }, [updateDataStats]); // Include updateDataStats in dependency array

  // Update data stats when path changes (event-driven)
  useEffect(() => {
    if (explorationState.path.length > 0) {
      updateDataStats();
    }
  }, [explorationState.path.length, updateDataStats]);

  const handleClearSelection = createDataClearHandler(
    { isClearing, setIsClearing, setDataStats, setIsDataClearDialogVisible: () => {} },
    { dispatch, ...mapConfig }
  );

  return {
    dataStats,
    isClearing,
    handleClearSelection,
    isSettingsModalVisible,
    setIsSettingsModalVisible,
  };
};

// Custom hook for fog region initialization and management
const useFogRegionState = (
  currentLocation: GeoPoint | null,
  mapDimensions: { width: number; height: number },
  currentRegion: MapRegion | undefined
) => {
  // Initialize worklet-based map region for immediate synchronization
  const initialWorkletRegion = useMemo(() => {
    if (currentLocation) {
      return {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: DEFAULT_ZOOM_DELTAS.latitudeDelta,
        longitudeDelta: DEFAULT_ZOOM_DELTAS.longitudeDelta,
        width: mapDimensions.width,
        height: mapDimensions.height,
      };
    }
    return undefined;
  }, [currentLocation, mapDimensions]);

  // Fog region state for OptimizedFogOverlay
  const [currentFogRegion, setCurrentFogRegion] = useState<
    (MapRegion & { width: number; height: number }) | undefined
  >(undefined);

  // Memoized map region with worklet support
  const memoizedMapRegion = useMemo(() => {
    if (!currentRegion) return undefined;

    return {
      ...currentRegion,
      width: mapDimensions.width,
      height: mapDimensions.height,
    };
  }, [currentRegion, mapDimensions]);

  // Initialize currentFogRegion when memoizedMapRegion is first available
  useEffect(() => {
    if (memoizedMapRegion && !currentFogRegion) {
      setCurrentFogRegion(memoizedMapRegion);
    }
  }, [memoizedMapRegion, currentFogRegion]);

  // Also initialize currentFogRegion from initialWorkletRegion if available
  useEffect(() => {
    if (initialWorkletRegion && !currentFogRegion && !memoizedMapRegion) {
      setCurrentFogRegion(initialWorkletRegion);
    }
  }, [initialWorkletRegion, currentFogRegion, memoizedMapRegion]);

  // Simple region update for OptimizedFogOverlay synchronization
  const updateFogRegion = useCallback((region: MapRegion & { width: number; height: number }) => {
    // Update fog region immediately for synchronization
    setCurrentFogRegion(region);
  }, []);

  return {
    currentFogRegion,
    setCurrentFogRegion,
    memoizedMapRegion,
    updateFogRegion,
  };
};

// Custom hook for data clearing state
const useDataClearingState = () => {
  // Data clearing state
  const [dataStats, setDataStats] = useState<DataStats>({
    totalPoints: 0,
    recentPoints: 0,
    oldestDate: null,
    newestDate: null,
  });
  const [isDataClearDialogVisible, setIsDataClearDialogVisible] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isSettingsMenuVisible, setIsSettingsMenuVisible] = useState(false);

  return {
    dataStats,
    setDataStats,
    isDataClearDialogVisible,
    setIsDataClearDialogVisible,
    isClearing,
    setIsClearing,
    isSettingsMenuVisible,
    setIsSettingsMenuVisible,
  };
};

const useMapScreenState = () => {
  const dispatch = useAppDispatch();
  const { currentLocation, isMapCenteredOnUser, isFollowModeActive } = useAppSelector(
    (state) => state.exploration
  );

  // Debug log to see if currentLocation is actually changing
  React.useEffect(() => {
    logger.info('🗺️ MapScreen currentLocation changed', {
      component: 'MapScreen',
      action: 'currentLocationChange',
      location: currentLocation
        ? `${currentLocation.latitude}, ${currentLocation.longitude}`
        : 'null',
      timestamp: Date.now(),
    });
  }, [currentLocation]);
  const mapRef = useRef<CameraRef>(null);
  const cinematicZoomActiveRef = useRef(false);
  const [currentRegion, setCurrentRegion] = useState<MapRegion | undefined>(undefined);
  const [mapDimensions, setMapDimensions] = useState({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  });

  const fogRegionState = useFogRegionState(currentLocation, mapDimensions, currentRegion);
  const dataClearingState = useDataClearingState();

  return {
    dispatch,
    currentLocation,
    isMapCenteredOnUser,
    isFollowModeActive,
    mapRef,
    cinematicZoomActiveRef,
    currentRegion,
    setCurrentRegion,
    setMapDimensions,
    mapDimensions,
    ...fogRegionState,
    ...dataClearingState,
  };
};

// Configuration for MapScreen services
interface MapScreenServicesConfig {
  mapRef: React.RefObject<CameraRef | null>;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: MapRegion | undefined;
  isTrackingPaused: boolean;
  explorationState: any;
}

// Comprehensive configuration interface for useMapScreenServices
interface MapScreenServicesFullConfig {
  dispatch: ReturnType<typeof useAppDispatch>;
  servicesConfig: MapScreenServicesConfig;
  allowLocationRequests?: boolean;
  setPermissionsGranted?: (granted: boolean) => void;
  permissionsVerified?: boolean;
  backgroundGranted?: boolean;
}

// Helper hook to set up all MapScreen services and effects
const useMapScreenServices = (config: MapScreenServicesFullConfig) => {
  const {
    dispatch,
    servicesConfig,
    allowLocationRequests = true,
    setPermissionsGranted,
    permissionsVerified = false,
    backgroundGranted = false,
  } = config;

  const {
    mapRef,
    cinematicZoomActiveRef,
    isMapCenteredOnUser,
    isFollowModeActive,
    currentRegion,
    isTrackingPaused,
    explorationState,
  } = servicesConfig;

  // Get session state for real-time area calculation
  const isSessionActive = useAppSelector(
    (state) => state.stats.currentSession && !state.stats.currentSession.endTime
  );

  // Only log when location services actually start/stop, not on every render
  // (Removed excessive debug logging that was flooding console)

  // Use simplified unified location service with configuration object
  useUnifiedLocationService({
    dispatch,
    locationConfig: {
      mapRef,
      cinematicZoomActiveRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      currentRegion,
      isTrackingPaused,
      explorationPath: explorationState.path,
      isSessionActive,
    },
    allowLocationRequests,
    ...(setPermissionsGranted && { onPermissionsGranted: setPermissionsGranted }),
    permissionsVerified,
    backgroundGranted,
  });

  // Note: Zoom restrictions now handled in handleRegionChangeComplete to prevent oscillation

  // Persist exploration state whenever it changes
  useExplorationStatePersistence(explorationState);

  // Only start GPS injection check AFTER permissions are verified
  useEffect(() => {
    if (permissionsVerified) {
      logger.info('📍 GPS_DEBUG: Permissions verified - starting GPS services', {
        component: 'useMapScreenServices',
        action: 'startGPSInjection',
        permissionsVerified,
        backgroundGranted,
        allowLocationRequests,
        timestamp: new Date().toISOString(),
      });

      // Check once for any existing GPS injection data
      GPSInjectionService.checkForInjectionOnce()
        .then((injectedData) => {
          if (injectedData.length > 0) {
            logger.info('Found GPS injection data after permission verification', {
              component: 'useMapScreenServices',
              dataCount: injectedData.length,
            });
          }
        })
        .catch((error) => {
          logger.warn('Error checking for GPS injection after permission verification', {
            component: 'useMapScreenServices',
            error: error instanceof Error ? error.message : String(error),
          });
        });
    }
  }, [permissionsVerified, backgroundGranted, allowLocationRequests]);

  // Add AppState listener to process stored locations when app becomes active
  useAppStateChangeHandler(dispatch, isMapCenteredOnUser, currentRegion, mapRef);
};

// Helper hook for MapScreen Redux state
const useMapScreenReduxState = () => {
  const explorationState = useAppSelector((state) => state.exploration);
  const isTrackingPaused = useAppSelector((state) => state.exploration.isTrackingPaused);
  const insets = useSafeAreaInsets();

  // DEBUG: Track currentLocation from Redux to identify GPS timing issues
  useEffect(() => {
    logger.info('📍 GPS_DEBUG: Redux currentLocation state change', {
      component: 'useMapScreenReduxState',
      hasCurrentLocation: !!explorationState.currentLocation,
      currentLocation: explorationState.currentLocation
        ? `${explorationState.currentLocation.latitude.toFixed(6)}, ${explorationState.currentLocation.longitude.toFixed(6)}`
        : null,
      timestamp: new Date().toISOString(),
    });
  }, [explorationState.currentLocation]);

  return {
    explorationState,
    isTrackingPaused,
    insets,
    gpsInjectionStatus: explorationState.gpsInjectionStatus,
  };
};

// Component for rendering MapScreen UI elements
const MapScreenUI: React.FC<{
  mapRef: React.RefObject<CameraRef | null>;
  currentLocation: GeoPoint | null;
  insets: any;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  onRegionChange: (region: MapRegion) => void;
  onPanDrag: () => void;
  onRegionChangeComplete: (region: MapRegion) => void;
  centerOnUserLocation: () => void;
  setMapDimensions: (dimensions: { width: number; height: number }) => void;
  currentFogRegion: (MapRegion & { width: number; height: number }) | undefined;
  isClearing: boolean;
  dataStats: DataStats;
  handleClearSelection: (type: ClearType) => Promise<void>;
  handleSettingsPress: () => void;
  isSettingsModalVisible: boolean;
  setIsSettingsModalVisible: (visible: boolean) => void;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  canStartCinematicAnimation?: boolean; // Control when cinematic animation can start
  gpsInjectionStatus: {
    isRunning: boolean;
    type: 'real-time' | 'historical' | null;
    message: string;
  };
}> = ({
  mapRef,
  currentLocation,
  insets,
  isMapCenteredOnUser,
  isFollowModeActive,
  onRegionChange,
  onPanDrag,
  onRegionChangeComplete,
  centerOnUserLocation,
  setMapDimensions,
  currentFogRegion,
  isClearing,
  dataStats,
  handleClearSelection,
  handleSettingsPress,
  isSettingsModalVisible,
  setIsSettingsModalVisible,
  cinematicZoomActiveRef,
  canStartCinematicAnimation = true,
  gpsInjectionStatus,
}) => {
  return (
    <>
      <MapScreenRenderer
        mapRef={mapRef}
        cinematicZoomActiveRef={cinematicZoomActiveRef}
        currentLocation={currentLocation}
        insets={insets}
        isMapCenteredOnUser={isMapCenteredOnUser}
        isFollowModeActive={isFollowModeActive}
        onRegionChange={onRegionChange}
        onPanDrag={onPanDrag}
        onRegionChangeComplete={onRegionChangeComplete}
        centerOnUserLocation={centerOnUserLocation}
        setMapDimensions={setMapDimensions}
        currentFogRegion={currentFogRegion}
        handleSettingsPress={handleSettingsPress}
        canStartCinematicAnimation={canStartCinematicAnimation}
        // workletMapRegion={workletMapRegion} // Available for future worklet integration
      />

      {/* Tracking Control Button */}
      <TrackingControlButton style={styles.trackingControlButton} />

      {/* HUD Stats Panel */}
      <HUDStatsPanel />

      {/* GPS Injection Indicator */}
      <GPSInjectionIndicator
        isVisible={gpsInjectionStatus.isRunning}
        message={gpsInjectionStatus.message}
      />

      {/* Unified Settings Modal */}
      <UnifiedSettingsModal
        visible={isSettingsModalVisible}
        onClose={() => setIsSettingsModalVisible(false)}
        dataStats={dataStats}
        onClearData={handleClearSelection}
        isClearing={isClearing}
      />
    </>
  );
};

// Custom hook for navigation
const useMapScreenNavigation = (setIsSettingsModalVisible: (visible: boolean) => void) => {
  const handleSettingsPress = useCallback(() => {
    logger.info('Settings button pressed - showing unified settings modal', {
      component: 'MapScreen',
      action: 'handleSettingsPress',
    });
    setIsSettingsModalVisible(true);
  }, [setIsSettingsModalVisible]);

  return {
    handleSettingsPress,
  };
};

// Helper function to gather all hook states
// Accepts onboarding as parameter to avoid duplicate hook calls
const useMapScreenHookStates = (onboarding: ReturnType<typeof useMapScreenOnboarding>) => {
  const mapState = useMapScreenState();
  const reduxState = useMapScreenReduxState();

  return { onboarding, mapState, reduxState };
};

// Configuration interface for useMapScreenServicesAndHandlers
interface MapScreenServicesHandlersConfig {
  onboarding: any;
  mapState: any;
  reduxState: any;
  permissionsVerified?: boolean;
  backgroundGranted?: boolean;
}

// Helper function to initialize services and handlers
const useMapScreenServicesAndHandlers = (config: MapScreenServicesHandlersConfig) => {
  const {
    onboarding,
    mapState,
    reduxState,
    permissionsVerified = false,
    backgroundGranted = false,
  } = config;
  const dataClearing = useDataClearing(
    mapState.dispatch,
    {
      mapRef: mapState.mapRef,
      cinematicZoomActiveRef: mapState.cinematicZoomActiveRef,
      isMapCenteredOnUser: mapState.isMapCenteredOnUser,
      currentRegion: mapState.currentRegion,
    },
    reduxState.explorationState
  );
  const navigation = useMapScreenNavigation(dataClearing.setIsSettingsModalVisible);

  // Debug logging for location service state
  useEffect(() => {
    logger.debug('useMapScreenServicesAndHandlers - allowLocationRequests state', {
      component: 'useMapScreenServicesAndHandlers',
      action: 'allowLocationRequests',
      canStartLocationServices: onboarding.canStartLocationServices,
      permissionsVerified,
      backgroundGranted,
      showOnboarding: onboarding.showOnboarding,
      hasCompletedOnboarding: onboarding.hasCompletedOnboarding,
      timestamp: Date.now(),
    });
  }, [
    onboarding.canStartLocationServices,
    permissionsVerified,
    backgroundGranted,
    onboarding.showOnboarding,
    onboarding.hasCompletedOnboarding,
  ]);

  useMapScreenServices({
    dispatch: mapState.dispatch,
    servicesConfig: {
      mapRef: mapState.mapRef,
      cinematicZoomActiveRef: mapState.cinematicZoomActiveRef,
      isMapCenteredOnUser: mapState.isMapCenteredOnUser,
      isFollowModeActive: mapState.isFollowModeActive,
      currentRegion: mapState.currentRegion,
      isTrackingPaused: reduxState.isTrackingPaused,
      explorationState: reduxState.explorationState,
    },
    allowLocationRequests: onboarding.canStartLocationServices,
    permissionsVerified,
    backgroundGranted,
  });

  const eventHandlers = useMapEventHandlers({
    dispatch: mapState.dispatch,
    currentLocation: mapState.currentLocation,
    currentRegion: mapState.currentRegion,
    isMapCenteredOnUser: mapState.isMapCenteredOnUser,
    isFollowModeActive: mapState.isFollowModeActive,
    mapRef: mapState.mapRef,
    cinematicZoomActiveRef: mapState.cinematicZoomActiveRef,
    setCurrentRegion: mapState.setCurrentRegion,
    setCurrentFogRegion: mapState.setCurrentFogRegion,
    mapDimensions: mapState.mapDimensions,
    workletUpdateRegion: mapState.updateFogRegion,
  });

  return { dataClearing, navigation, eventHandlers };
};

// Custom hook for stats initialization and persistence
const useStatsInitialization = () => {
  const dispatch = useAppDispatch();
  const totalStats = useAppSelector((state) => state.stats.total);
  const explorationState = useAppSelector((state) => state.exploration);
  const isSessionActive = useAppSelector(
    (state) => state.stats.currentSession && !state.stats.currentSession.endTime
  );

  // Initialize stats system
  useEffect(() => {
    const initializeStats = async () => {
      try {
        dispatch(setLoading(true));

        // Load all GPS history from exploration state and initialize stats from it
        const explorationState = await AuthPersistenceService.getExplorationState();
        const gpsHistory = explorationState?.path ?? [];
        dispatch(initializeFromHistory({ gpsHistory }));

        logger.info('Initialized stats from GPS history', {
          component: 'MapScreen',
          action: 'initializeStats',
          historyLength: gpsHistory.length,
        });
      } catch (error) {
        logger.error('Failed to initialize stats system', {
          component: 'MapScreen',
          action: 'initializeStats',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        dispatch(setLoading(false));
      }
    };

    initializeStats();
  }, [dispatch]);

  // Periodically recalculate area from current GPS path during active sessions
  useEffect(() => {
    if (!isSessionActive || explorationState.path.length < 3) {
      return; // Need active session and at least 3 points for area calculation
    }

    const recalculateAreaPeriodically = () => {
      // Convert GeoPoint[] to serializable GPS data for area calculation
      const serializableGPSData = explorationState.path.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        timestamp: point.timestamp || Date.now(),
      }));

      dispatch(recalculateArea(serializableGPSData));

      logger.trace('Triggered periodic area recalculation', {
        component: 'MapScreen',
        action: 'recalculateAreaPeriodically',
        pathLength: explorationState.path.length,
      });
    };

    // Recalculate area every 30 seconds during active sessions
    const areaRecalcInterval = setInterval(recalculateAreaPeriodically, 30000);

    return () => clearInterval(areaRecalcInterval);
  }, [dispatch, isSessionActive, explorationState.path]);

  // Save stats periodically
  useEffect(() => {
    // Only save if we have meaningful stats data
    if (totalStats.distance > 0 || totalStats.area > 0 || totalStats.time > 0) {
      StatsPersistenceService.saveStats(totalStats);
    }
  }, [totalStats]);
};

// Custom hook that combines all map screen logic
// Takes onboarding state as parameter to ensure single source of truth
const useMapScreenLogic = (
  onboarding: ReturnType<typeof useMapScreenOnboarding>,
  permissionsVerified: boolean = false,
  backgroundGranted: boolean = false
) => {
  const { mapState, reduxState } = useMapScreenHookStates(onboarding);
  // Only log significant render state changes, not every render
  // (Removed excessive render logging that was flooding console)

  const { dataClearing, navigation, eventHandlers } = useMapScreenServicesAndHandlers({
    onboarding,
    mapState,
    reduxState,
    permissionsVerified,
    backgroundGranted,
  });

  return {
    showOnboarding: onboarding.showOnboarding,
    handleOnboardingComplete: onboarding.handleOnboardingComplete,
    handleOnboardingSkip: onboarding.handleOnboardingSkip,
    uiProps: {
      mapRef: mapState.mapRef,
      cinematicZoomActiveRef: mapState.cinematicZoomActiveRef,
      currentLocation: mapState.currentLocation,
      insets: reduxState.insets,
      isMapCenteredOnUser: mapState.isMapCenteredOnUser,
      isFollowModeActive: mapState.isFollowModeActive,
      onRegionChange: eventHandlers.onRegionChange,
      onPanDrag: eventHandlers.onPanDrag,
      onRegionChangeComplete: eventHandlers.onRegionChangeComplete,
      centerOnUserLocation: eventHandlers.centerOnUserLocation,
      setMapDimensions: mapState.setMapDimensions,
      currentFogRegion: mapState.currentFogRegion,
      isClearing: dataClearing.isClearing,
      dataStats: dataClearing.dataStats,
      handleClearSelection: dataClearing.handleClearSelection,
      handleSettingsPress: navigation.handleSettingsPress,
      isSettingsModalVisible: dataClearing.isSettingsModalVisible,
      setIsSettingsModalVisible: dataClearing.setIsSettingsModalVisible,
      gpsInjectionStatus: reduxState.gpsInjectionStatus,
    },
  };
};

// Main component - now uses proper blocking permission verification flow
// Note: This component manages complex permission states, critical error handling,
// onboarding flow, and UI coordination. The complexity is necessary for proper
// permission verification and error recovery flows.

// eslint-disable-next-line max-lines-per-function
export const MapScreen = () => {
  // Initialize stats system
  useStatsInitialization();

  // Get onboarding state first
  const onboardingHookState = useMapScreenOnboarding();
  const { showOnboarding, handleOnboardingComplete, handleOnboardingSkip } = onboardingHookState;

  // Start permission verification after onboarding is complete
  const shouldVerifyPermissions = !showOnboarding;

  // Use actual permission verification service
  const {
    isVerifying,
    isVerified,
    hasPermissions,
    backgroundGranted,
    mode,
    error,
    resetVerification,
  } = usePermissionVerification(shouldVerifyPermissions);

  // Map permission verification state to our expected boolean
  const permissionsVerified = isVerified && hasPermissions;

  // DEBUG: Track state transitions that could cause white screen
  useEffect(() => {
    logger.info('🗺️ MAP_DEBUG: State transition detected', {
      component: 'MapScreen',
      showOnboarding,
      shouldVerifyPermissions,
      isVerifying,
      isVerified,
      hasPermissions,
      permissionsVerified,
      backgroundGranted,
      timestamp: new Date().toISOString(),
    });
  }, [
    showOnboarding,
    shouldVerifyPermissions,
    isVerifying,
    isVerified,
    hasPermissions,
    permissionsVerified,
    backgroundGranted,
  ]);

  // DEBUG: Track the onboarding hook state specifically
  useEffect(() => {
    logger.info('🗺️ ONBOARDING_DEBUG: Hook state tracked separately', {
      component: 'MapScreen',
      hookShowOnboarding: onboardingHookState.showOnboarding,
      hookHasCompletedOnboarding: onboardingHookState.hasCompletedOnboarding,
      hookCanStartLocationServices: onboardingHookState.canStartLocationServices,
      mainShowOnboarding: showOnboarding, // This should be the same as hookShowOnboarding
      timestamp: new Date().toISOString(),
    });
  }, [
    onboardingHookState.showOnboarding,
    onboardingHookState.hasCompletedOnboarding,
    onboardingHookState.canStartLocationServices,
    showOnboarding,
  ]);

  // Pass permissions verification state and onboarding state to the logic hook
  // This ensures single source of truth for onboarding state (no duplicate hook calls)
  const { uiProps } = useMapScreenLogic(
    onboardingHookState,
    permissionsVerified,
    backgroundGranted
  );

  // Show permission verification screen while verifying OR if permissions are denied
  const showPermissionScreen =
    shouldVerifyPermissions && (isVerifying || (isVerified && !hasPermissions));

  // Show "Allow Once" warning if user selected that option
  const showOnceOnlyWarning = isVerified && mode === 'once_only';

  // Only allow cinematic animation when onboarding is complete AND permissions are granted
  const canStartCinematicAnimation = !showOnboarding && permissionsVerified;

  return (
    <>
      <MapScreenUI {...uiProps} canStartCinematicAnimation={canStartCinematicAnimation} />
      <HUDStatsPanel />
      <ExplorationNudge />
      <OnboardingOverlay
        visible={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
      {showPermissionScreen && (
        <View style={styles.loadingContainer}>
          {mode === 'denied' ? (
            <PermissionDeniedScreen error={error} onRetry={resetVerification} />
          ) : (
            <PermissionLoadingScreen error={error} onRetry={resetVerification} />
          )}
        </View>
      )}
      <AllowOnceWarningOverlay visible={showOnceOnlyWarning} onDismiss={resetVerification} />
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject, // Make map fill container
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0', // Light background for loading
  },
  loadingText: {
    fontSize: 18,
    color: '#333',
    textAlign: 'center',
    marginBottom: 20,
  },
  retryButton: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 10,
  },
  retryButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  warningContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  warningBox: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    maxWidth: 350,
    alignItems: 'center',
  },
  warningTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 12,
    textAlign: 'center',
  },
  warningText: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 12,
    lineHeight: 22,
  },
  warningButtons: {
    flexDirection: 'row',
    marginTop: 20,
    gap: 12,
  },
  warningButtonPrimary: {
    backgroundColor: '#007AFF',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    flex: 1,
  },
  warningButtonSecondary: {
    backgroundColor: 'transparent',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: '#007AFF',
    flex: 1,
  },
  warningButtonPrimaryText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  warningButtonSecondaryText: {
    color: '#007AFF',
    fontSize: 16,
    fontWeight: '600',
    textAlign: 'center',
  },
  // Critical error styles for denied permissions
  criticalErrorContainer: {
    backgroundColor: '#fff',
    padding: 24,
    borderRadius: 12,
    margin: 20,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 5,
  },
  criticalErrorTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#d32f2f',
    marginBottom: 16,
    textAlign: 'center',
  },
  criticalErrorMessage: {
    fontSize: 16,
    color: '#333',
    textAlign: 'center',
    marginBottom: 16,
    lineHeight: 22,
  },
  criticalErrorDetails: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    marginBottom: 20,
    fontStyle: 'italic',
  },
  criticalErrorButtons: {
    flexDirection: 'column',
    width: '100%',
    gap: 12,
  },
  criticalErrorButtonPrimary: {
    backgroundColor: '#1976d2',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  criticalErrorButtonPrimaryText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
  },
  criticalErrorButtonSecondary: {
    backgroundColor: '#f5f5f5',
    paddingVertical: 14,
    paddingHorizontal: 24,
    borderRadius: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#ddd',
  },
  criticalErrorButtonSecondaryText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '600',
  },
  trackingControlButton: {
    position: 'absolute',
    bottom: 180, // Positioned for equal spacing with HUD separator
    alignSelf: 'center',
  },
});
