import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  DeviceEventEmitter,
  AppState,
  Text,
  Alert,
  TouchableOpacity,
  Linking,
} from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  updateLocation,
  updateZoom,
  setCenterOnUser,
  toggleFollowMode,
  setFollowMode,
  processBackgroundLocations,
} from '../../store/slices/explorationSlice';
import MapView, { Marker, Region } from 'react-native-maps';
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
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';

import { GPSInjectionService } from '../../services/GPSInjectionService';
import { BackgroundLocationService } from '../../services/BackgroundLocationService';
import { AuthPersistenceService } from '../../services/AuthPersistenceService';
import { DataClearingService } from '../../services/DataClearingService';
import { PermissionsOrchestrator } from '../../services/PermissionsOrchestrator';
import { DataStats, ClearType } from '../../types/dataClear';
import { GeoPoint } from '../../types/user';
import { useOnboardingContext } from '../../navigation';
// Performance optimizations available via OptimizedFogOverlay component

// Unified location task name
const LOCATION_TASK = 'unified-location-task';

// Default deltas for zoom level (approx 400m diameter view)
const DEFAULT_ZOOM_DELTAS = {
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

// Define max zoom out deltas (approx 50 mile view diameter / 25 mile radius)
const MAX_LATITUDE_DELTA = 0.75;
const MAX_LONGITUDE_DELTA = 1.0;

// Types for better type safety
interface LocationCoordinate {
  latitude: number;
  longitude: number;
}

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
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: Region | undefined;
}

const handleLocationUpdate = ({
  location,
  dispatch,
  mapRef,
  isMapCenteredOnUser,
  isFollowModeActive,
  currentRegion,
}: HandleLocationUpdateOptions) => {
  dispatch(updateLocation(location));

  // Auto-center map if follow mode is active OR if user clicked center once
  const shouldCenterMap = isFollowModeActive || isMapCenteredOnUser;

  if (shouldCenterMap && mapRef.current) {
    const newRegion = {
      latitude: location.latitude,
      longitude: location.longitude,
      latitudeDelta: currentRegion?.latitudeDelta ?? DEFAULT_ZOOM_DELTAS.latitudeDelta,
      longitudeDelta: currentRegion?.longitudeDelta ?? DEFAULT_ZOOM_DELTAS.longitudeDelta,
    };
    mapRef.current.animateToRegion(newRegion, 500);
  }
};

// OLD PERMISSION SYSTEM REMOVED
// Permissions are now handled by PermissionVerificationService before MapScreen services start

// Helper: defineUnifiedLocationTask
function defineUnifiedLocationTask() {
  TaskManager.defineTask(LOCATION_TASK, async ({ data, error }) => {
    if (error) {
      logger.warn('Location task error', { error: error?.message || String(error) });
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

// Helper: startLocationUpdates
// Note: This function handles complex location service setup with both foreground and background
// modes, error handling, and permission validation. Breaking it down would lose critical
// error handling flow and state consistency.
// eslint-disable-next-line max-lines-per-function
async function startLocationUpdates(backgroundGranted: boolean = false) {
  try {
    if (backgroundGranted) {
      // Use task-based location updates for background tracking
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
        component: 'MapScreen',
        action: 'startLocationUpdates',
        backgroundGranted: true,
      });

      await Location.startLocationUpdatesAsync(LOCATION_TASK, locationOptions);
    } else {
      // Use watchPositionAsync for foreground-only tracking
      logger.info('Starting location updates in foreground-only mode', {
        component: 'MapScreen',
        action: 'startLocationUpdates',
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
    }

    logger.info('Location updates started successfully', {
      component: 'MapScreen',
      action: 'startLocationUpdates',
      mode: backgroundGranted ? 'background' : 'foreground-only',
    });
  } catch (error) {
    logger.error('Failed to start location updates', {
      component: 'MapScreen',
      action: 'startLocationUpdates',
      backgroundGranted,
      errorMessage: error instanceof Error ? error.message : String(error),
      error: error instanceof Error ? error.message : String(error),
    });

    // Only show permission alert if it's actually a permission issue AND we don't have any permissions
    // If backgroundGranted is false but we have foreground permission, that's a valid user choice
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      // If we have foreground permission but not background, this is a user choice, not an error
      if (!backgroundGranted) {
        logger.info(
          'Location service failed due to background permission limitation - this is expected with foreground-only permission',
          {
            component: 'MapScreen',
            action: 'startLocationUpdates',
            backgroundGranted,
            note: 'User chose "Keep Only While Using" - app should work in foreground-only mode',
          }
        );
        // Don't show error dialog - this is a valid user choice
        // Don't throw error either - app should continue working in foreground-only mode
        return;
      } else {
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
    } else {
      logger.info('Location tracking error (non-permission related) - not showing alert', {
        component: 'MapScreen',
        action: 'handleLocationUpdate',
        errorType: 'non_permission',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
      throw error; // Non-permission errors should still be thrown
    }
  }
}

// Helper: setupLocationListeners
function setupLocationListeners({
  isActiveRef,
  dispatch,
  mapRef,
  isMapCenteredOnUser,
  isFollowModeActive,
  currentRegion,
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: Region | undefined;
}) {
  const locationUpdateListener = DeviceEventEmitter.addListener(
    'locationUpdate',
    (location: { latitude: number; longitude: number }) => {
      if (isActiveRef.current) {
        const geoPoint: GeoPoint = {
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: Date.now(),
        };
        handleLocationUpdate({
          location: geoPoint,
          dispatch,
          mapRef,
          isMapCenteredOnUser,
          isFollowModeActive,
          currentRegion,
        });
      }
    }
  );

  const gpsInjectionListener = DeviceEventEmitter.addListener(
    'GPS_COORDINATES_INJECTED',
    (location: { latitude: number; longitude: number }) => {
      logger.info('🎯 GPS injection event received in MapScreen', {
        component: 'MapScreen',
        action: 'gpsInjectionListener',
        location: `${location.latitude}, ${location.longitude}`,
        isActive: isActiveRef.current,
      });

      if (isActiveRef.current) {
        logger.info('📍 Processing GPS injection - calling handleLocationUpdate', {
          component: 'MapScreen',
          action: 'gpsInjectionListener',
          location: `${location.latitude}, ${location.longitude}`,
        });

        const geoPoint: GeoPoint = {
          latitude: location.latitude,
          longitude: location.longitude,
          timestamp: Date.now(),
        };

        handleLocationUpdate({
          location: geoPoint,
          dispatch,
          mapRef,
          isMapCenteredOnUser,
          isFollowModeActive,
          currentRegion,
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
    }
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
  isMapCenteredOnUser,
  isFollowModeActive,
  currentRegion,
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: Region | undefined;
}) {
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
      handleLocationUpdate({
        location: geoPoint,
        dispatch,
        mapRef,
        isMapCenteredOnUser,
        isFollowModeActive,
        currentRegion,
      });
    }
  } catch (error) {
    logger.warn('Could not get initial location, will wait for location service', {
      component: 'MapScreen',
      action: 'getInitialLocation',
      error: error instanceof Error ? error.message : String(error),
    });
    // Only show permission alert if it's a real permission issue, not a user choice
    if (error instanceof Error && error.message.toLowerCase().includes('permission')) {
      // Only show alert for truly critical permission issues
      PermissionAlert.show({
        errorMessage:
          'Unable to get your current location. Please ensure location services are enabled and try again.',
        onDismiss: () => {
          logger.info('Initial location error alert dismissed');
        },
      });
    } else {
      logger.info('Initial location error (non-permission related) - not showing alert', {
        component: 'MapScreen',
        action: 'getInitialLocation',
        errorType: 'non_permission',
        errorMessage: error instanceof Error ? error.message : String(error),
      });
    }
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
    mapRef: React.RefObject<MapView>;
    isMapCenteredOnUser: boolean;
    isFollowModeActive: boolean;
    currentRegion: Region | undefined;
  }
) => {
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

// SIMPLIFIED LOCATION SERVICE INITIALIZATION
// Permissions are already verified by PermissionVerificationService
const initializeLocationServicesDirectly = async ({
  isActiveRef,
  dispatch,
  mapRef,
  isMapCenteredOnUser,
  isFollowModeActive,
  currentRegion,
  backgroundGranted = false, // Default to false, must be explicitly passed
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: Region | undefined;
  backgroundGranted?: boolean; // Add parameter for actual background permission status
}) => {
  try {
    logger.info('Initializing location services (permissions already verified)', {
      component: 'MapScreen',
      action: 'initializeLocationServicesDirectly',
      backgroundGranted,
    });

    // Use the actual background permission status passed from permission verification
    await initializeLocationServices(backgroundGranted, {
      isActiveRef,
      dispatch,
      mapRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      currentRegion,
    });

    logger.info('Location services initialized successfully');
  } catch (error) {
    logger.error('Failed to initialize location services', {
      component: 'MapScreen',
      action: 'initializeLocationServicesDirectly',
      error: error instanceof Error ? error.message : String(error),
    });
    throw error;
  }
};

// Configuration interface for location service
interface LocationServiceConfig {
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: Region | undefined;
  isTrackingPaused: boolean;
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
    const { mapRef, isMapCenteredOnUser, isFollowModeActive, currentRegion } = config;

    try {
      logger.info('Starting location services (tracking resumed)', {
        backgroundGranted,
        component: 'createStartLocationServices',
      });
      const isActiveRef = { current: true };

      await initializeLocationServicesDirectly({
        isActiveRef,
        dispatch,
        mapRef,
        isMapCenteredOnUser,
        isFollowModeActive,
        currentRegion,
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
const useUnifiedLocationService = (
  dispatch: ReturnType<typeof useAppDispatch>,
  config: LocationServiceConfig,
  allowLocationRequests: boolean = true,
  onPermissionsGranted?: (granted: boolean) => void,
  permissionsVerified: boolean = false, // NEW: Only start location services after permissions are verified
  backgroundGranted: boolean = false // Add backgroundGranted parameter
  // eslint-disable-next-line max-params
) => {
  const { mapRef, isMapCenteredOnUser, isFollowModeActive, currentRegion, isTrackingPaused } =
    config;
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
      isMapCenteredOnUser,
      isFollowModeActive,
      currentRegion,
    });

    return () => {
      isActiveRef.current = false;
      cleanupLocationListeners(listeners);
    };
  }, [dispatch, mapRef, isMapCenteredOnUser, isFollowModeActive, currentRegion]);

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
      config,
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
    config,
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

// Hook for zoom restriction logic
const useZoomRestriction = (
  currentRegion: Region | undefined,
  mapRef: React.RefObject<MapView>
) => {
  useEffect(() => {
    if (currentRegion && mapRef.current) {
      let clampedLatitudeDelta = currentRegion.latitudeDelta;
      let clampedLongitudeDelta = currentRegion.longitudeDelta;
      let needsAdjustment = false;

      if (currentRegion.latitudeDelta > MAX_LATITUDE_DELTA) {
        clampedLatitudeDelta = MAX_LATITUDE_DELTA;
        needsAdjustment = true;
      }
      if (currentRegion.longitudeDelta > MAX_LONGITUDE_DELTA) {
        clampedLongitudeDelta = MAX_LONGITUDE_DELTA;
        needsAdjustment = true;
      }

      if (needsAdjustment) {
        const clampedRegion: Region = {
          latitude: currentRegion.latitude,
          longitude: currentRegion.longitude,
          latitudeDelta: clampedLatitudeDelta,
          longitudeDelta: clampedLongitudeDelta,
        };
        mapRef.current.animateToRegion(clampedRegion, 200);
      }
    }
  }, [currentRegion, mapRef]);
};

// Individual event handler functions
const createZoomHandler = (dispatch: ReturnType<typeof useAppDispatch>) => (newZoom: number) => {
  dispatch(updateZoom(newZoom));
};

const createCenterOnUserHandler =
  (options: {
    currentLocation: LocationCoordinate | null;
    currentRegion: Region | undefined;
    mapRef: React.RefObject<MapView>;
    dispatch: ReturnType<typeof useAppDispatch>;
    isFollowModeActive: boolean;
  }) =>
  () => {
    const { currentLocation, currentRegion, mapRef, dispatch, isFollowModeActive } = options;
    // Toggle follow mode
    dispatch(toggleFollowMode());

    // If follow mode was OFF and is now ON, center the map immediately
    if (!isFollowModeActive && currentLocation && mapRef.current) {
      const userRegion = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: currentRegion?.latitudeDelta ?? DEFAULT_ZOOM_DELTAS.latitudeDelta,
        longitudeDelta: currentRegion?.longitudeDelta ?? DEFAULT_ZOOM_DELTAS.longitudeDelta,
      };
      mapRef.current.animateToRegion(userRegion, 300);
      dispatch(setCenterOnUser(true));
    }
  };

// Extracted event handler helpers for useMapEventHandlers
function handleRegionChange({
  region,
  setCurrentRegion,
  setCurrentFogRegion,
  mapDimensions,
  workletUpdateRegion,
}: {
  region: Region;
  setCurrentRegion: (region: Region) => void;
  setCurrentFogRegion: (region: (Region & { width: number; height: number }) | undefined) => void;
  mapDimensions: { width: number; height: number };
  workletUpdateRegion: (region: Region & { width: number; height: number }) => void;
}) {
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

function handlePanDrag({
  mapRef,
  dispatch,
}: {
  mapRef: React.RefObject<MapView>;
  dispatch: ReturnType<typeof useAppDispatch>;
}) {
  // User is panning/dragging - disable both centered state and follow mode
  dispatch(setCenterOnUser(false));
  dispatch(setFollowMode(false));

  // Handle camera position update asynchronously
  mapRef.current
    ?.getCamera()
    .then((camera) => {
      logger.throttledDebug(
        'MapScreen:onPanDrag',
        'Camera position updated',
        {
          component: 'MapScreen',
          action: 'onPanDrag',
          heading: camera.heading,
        },
        1000 // 1 second interval
      );
    })
    .catch((err) => {
      logger.error('Error getting camera:', err, {
        component: 'MapScreen',
        action: 'onPanDrag',
      });
    });
}

function handleRegionChangeComplete({
  region,
  setCurrentRegion,
  handleZoomChange,
}: {
  region: Region;
  setCurrentRegion: (region: Region) => void;
  handleZoomChange: (zoom: number) => void;
}) {
  setCurrentRegion(region);
  const zoom = Math.round(Math.log(360 / region.latitudeDelta) / Math.LN2);
  handleZoomChange(zoom);
}

// Refactor useMapEventHandlers to use helpers
const useMapEventHandlers = (options: {
  dispatch: ReturnType<typeof useAppDispatch>;
  currentLocation: LocationCoordinate | null;
  currentRegion: Region | undefined;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  mapRef: React.RefObject<MapView>;
  setCurrentRegion: (region: Region) => void;
  setCurrentFogRegion: (region: (Region & { width: number; height: number }) | undefined) => void;
  mapDimensions: { width: number; height: number };
  workletUpdateRegion: (region: Region & { width: number; height: number }) => void;
}) => {
  const {
    dispatch,
    currentLocation,
    currentRegion,
    isFollowModeActive,
    mapRef,
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
    dispatch,
    isFollowModeActive,
  });

  const onRegionChange = throttle(
    (region: Region) =>
      handleRegionChange({
        region,
        setCurrentRegion,
        setCurrentFogRegion,
        mapDimensions,
        workletUpdateRegion,
      }),
    16
  ); // ~60fps

  const onPanDrag = () => handlePanDrag({ mapRef, dispatch });

  const onRegionChangeComplete = (region: Region) =>
    handleRegionChangeComplete({ region, setCurrentRegion, handleZoomChange });

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
  mapRef: React.RefObject<MapView>;
  currentLocation: LocationCoordinate | null;
  insets: SafeAreaInsets;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  onRegionChange: (region: Region) => void;
  onPanDrag: () => void;
  onRegionChangeComplete: (region: Region) => void;
  centerOnUserLocation: () => void;
  setMapDimensions: (dimensions: { width: number; height: number }) => void;
  currentFogRegion: (Region & { width: number; height: number }) | undefined;
  handleSettingsPress: () => void;
  // workletMapRegion?: ReturnType<typeof useWorkletMapRegion>; // Available for future worklet integration
}

// Loading state component
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
      <Text style={styles.loadingText}>Getting your location...</Text>
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
const MapScreenRenderer = ({
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
  handleSettingsPress,
}: MapScreenRendererProps) => {
  // Don't render map until we have a real location
  if (!currentLocation) {
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

  // Create initial region from current location
  const initialRegion = {
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude,
    latitudeDelta: DEFAULT_ZOOM_DELTAS.latitudeDelta,
    longitudeDelta: DEFAULT_ZOOM_DELTAS.longitudeDelta,
  };

  return (
    <View
      style={styles.container}
      testID="map-screen"
      onLayout={(event) => {
        const { width, height } = event.nativeEvent.layout;
        setMapDimensions({ width, height });
      }}
    >
      <MapView
        ref={mapRef}
        style={styles.map}
        initialRegion={initialRegion}
        onRegionChange={onRegionChange}
        onPanDrag={onPanDrag}
        onRegionChangeComplete={onRegionChangeComplete}
        showsUserLocation={false}
        showsMyLocationButton={false}
        rotateEnabled={false}
        pitchEnabled={false}
      >
        {currentLocation && (
          <Marker
            key={`marker-${currentLocation.latitude}-${currentLocation.longitude}-${Date.now()}`}
            coordinate={{
              latitude: currentLocation.latitude,
              longitude: currentLocation.longitude,
            }}
            title="You are here"
            anchor={{ x: 0.5, y: 0.5 }}
          >
            <View style={USER_MARKER_STYLE} />
          </Marker>
        )}
      </MapView>

      {/* Use OptimizedFogOverlay for better performance with many GPS points */}
      {currentFogRegion && <OptimizedFogOverlay mapRegion={currentFogRegion} />}

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
    currentRegion: Region | undefined;
    mapRef: React.RefObject<MapView>;
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
  if (isMapCenteredOnUser && mapRef.current) {
    const newRegion = {
      latitude: mostRecent.latitude,
      longitude: mostRecent.longitude,
      latitudeDelta: currentRegion?.latitudeDelta ?? DEFAULT_ZOOM_DELTAS.latitudeDelta,
      longitudeDelta: currentRegion?.longitudeDelta ?? DEFAULT_ZOOM_DELTAS.longitudeDelta,
    };
    mapRef.current.animateToRegion(newRegion, 500);
  }
};

// Custom hook for app state change handling
const useAppStateChangeHandler = (
  dispatch: ReturnType<typeof useAppDispatch>,
  isMapCenteredOnUser: boolean,
  currentRegion: Region | undefined,
  mapRef: React.RefObject<MapView>
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
    mapRef: React.RefObject<MapView>;
    isMapCenteredOnUser: boolean;
    currentRegion: Region | undefined;
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
    isMapCenteredOnUser: options.isMapCenteredOnUser,
    isFollowModeActive: false, // Don't trigger follow mode after data clear
    currentRegion: options.currentRegion,
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
    mapRef: React.RefObject<MapView>;
    isMapCenteredOnUser: boolean;
    currentRegion: Region | undefined;
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
    mapRef: React.RefObject<MapView>;
    isMapCenteredOnUser: boolean;
    currentRegion: Region | undefined;
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
  currentRegion: Region | undefined
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
    (Region & { width: number; height: number }) | undefined
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
  const updateFogRegion = useCallback((region: Region & { width: number; height: number }) => {
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
  const mapRef = useRef<MapView>(null);
  const [currentRegion, setCurrentRegion] = useState<Region | undefined>(undefined);
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
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: Region | undefined;
  isTrackingPaused: boolean;
  explorationState: any;
}

// Helper hook to set up all MapScreen services and effects
const useMapScreenServices = (
  dispatch: ReturnType<typeof useAppDispatch>,
  config: MapScreenServicesConfig,
  allowLocationRequests: boolean = true,
  setPermissionsGranted?: (granted: boolean) => void,
  permissionsVerified: boolean = false, // New parameter to control GPS injection
  backgroundGranted: boolean = false // Add backgroundGranted parameter
  // eslint-disable-next-line max-params
) => {
  const {
    mapRef,
    isMapCenteredOnUser,
    isFollowModeActive,
    currentRegion,
    isTrackingPaused,
    explorationState,
  } = config;

  // Only log when location services actually start/stop, not on every render
  // (Removed excessive debug logging that was flooding console)

  // Use simplified unified location service
  useUnifiedLocationService(
    dispatch,
    {
      mapRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      currentRegion,
      isTrackingPaused,
    },
    allowLocationRequests,
    setPermissionsGranted,
    permissionsVerified, // Pass permissions verification state
    backgroundGranted // Pass the background permission status
  );

  useZoomRestriction(currentRegion, mapRef);

  // Persist exploration state whenever it changes
  useExplorationStatePersistence(explorationState);

  // Only start GPS injection check AFTER permissions are verified
  useEffect(() => {
    if (permissionsVerified) {
      logger.info('Permissions verified, starting GPS injection service', {
        component: 'useMapScreenServices',
        action: 'startGPSInjection',
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
  }, [permissionsVerified]);

  // Add AppState listener to process stored locations when app becomes active
  useAppStateChangeHandler(dispatch, isMapCenteredOnUser, currentRegion, mapRef);
};

// Helper hook for MapScreen Redux state
const useMapScreenReduxState = () => {
  const explorationState = useAppSelector((state) => state.exploration);
  const isTrackingPaused = useAppSelector((state) => state.exploration.isTrackingPaused);
  const insets = useSafeAreaInsets();

  return { explorationState, isTrackingPaused, insets };
};

// Component for rendering MapScreen UI elements
const MapScreenUI: React.FC<{
  mapRef: React.RefObject<MapView>;
  currentLocation: GeoPoint | null;
  insets: any;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  onRegionChange: (region: Region) => void;
  onPanDrag: () => void;
  onRegionChangeComplete: (region: Region) => void;
  centerOnUserLocation: () => void;
  setMapDimensions: (dimensions: { width: number; height: number }) => void;
  currentFogRegion: (Region & { width: number; height: number }) | undefined;
  isClearing: boolean;
  dataStats: DataStats;
  handleClearSelection: (type: ClearType) => Promise<void>;
  handleSettingsPress: () => void;
  isSettingsModalVisible: boolean;
  setIsSettingsModalVisible: (visible: boolean) => void;
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
}) => {
  return (
    <>
      <MapScreenRenderer
        mapRef={mapRef}
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
        // workletMapRegion={workletMapRegion} // Available for future worklet integration
      />

      {/* Tracking Control Button */}
      <TrackingControlButton
        style={{
          position: 'absolute',
          bottom: 160, // Above the data clear button
          alignSelf: 'center',
        }}
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

// Custom hook for onboarding state management
const useMapScreenOnboarding = () => {
  const { isFirstTimeUser } = useOnboardingContext();

  // Onboarding and permission state management
  const [showOnboarding, setShowOnboarding] = useState(isFirstTimeUser);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(!isFirstTimeUser);

  // Location services should only start when both conditions are met
  const canStartLocationServices = hasCompletedOnboarding && !showOnboarding;

  // Only log onboarding state changes, not every render
  // (Removed excessive debug logging that was flooding console)

  const handleOnboardingComplete = useCallback(() => {
    logger.info('Onboarding completed from MapScreen', {
      component: 'MapScreen',
      action: 'handleOnboardingComplete',
    });
    setShowOnboarding(false);
    setHasCompletedOnboarding(true); // Mark onboarding as completed
  }, []);

  const handleOnboardingSkip = useCallback(() => {
    logger.info('Onboarding skipped from MapScreen', {
      component: 'MapScreen',
      action: 'handleOnboardingSkip',
    });
    setShowOnboarding(false);
    setHasCompletedOnboarding(true); // Mark onboarding as completed (skipped)
  }, []);

  return {
    showOnboarding,
    hasCompletedOnboarding,
    canStartLocationServices,
    handleOnboardingComplete,
    handleOnboardingSkip,
  };
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
const useMapScreenHookStates = () => {
  const onboarding = useMapScreenOnboarding();
  const mapState = useMapScreenState();
  const reduxState = useMapScreenReduxState();

  return { onboarding, mapState, reduxState };
};

// Helper function to initialize services and handlers
const useMapScreenServicesAndHandlers = (
  onboarding: any,
  mapState: any,
  reduxState: any,
  permissionsVerified: boolean = false,
  backgroundGranted: boolean = false // Add backgroundGranted parameter
  // eslint-disable-next-line max-params
) => {
  const dataClearing = useDataClearing(
    mapState.dispatch,
    {
      mapRef: mapState.mapRef,
      isMapCenteredOnUser: mapState.isMapCenteredOnUser,
      currentRegion: mapState.currentRegion,
    },
    reduxState.explorationState
  );
  const navigation = useMapScreenNavigation(dataClearing.setIsSettingsModalVisible);

  useMapScreenServices(
    mapState.dispatch,
    {
      mapRef: mapState.mapRef,
      isMapCenteredOnUser: mapState.isMapCenteredOnUser,
      isFollowModeActive: mapState.isFollowModeActive,
      currentRegion: mapState.currentRegion,
      isTrackingPaused: reduxState.isTrackingPaused,
      explorationState: reduxState.explorationState,
    },
    onboarding.canStartLocationServices,
    undefined, // setPermissionsGranted callback
    permissionsVerified, // Pass permissions verification state
    backgroundGranted // Pass background permission status
  );

  const eventHandlers = useMapEventHandlers({
    dispatch: mapState.dispatch,
    currentLocation: mapState.currentLocation,
    currentRegion: mapState.currentRegion,
    isMapCenteredOnUser: mapState.isMapCenteredOnUser,
    isFollowModeActive: mapState.isFollowModeActive,
    mapRef: mapState.mapRef,
    setCurrentRegion: mapState.setCurrentRegion,
    setCurrentFogRegion: mapState.setCurrentFogRegion,
    mapDimensions: mapState.mapDimensions,
    workletUpdateRegion: mapState.updateFogRegion,
  });

  return { dataClearing, navigation, eventHandlers };
};

// Custom hook that combines all map screen logic
const useMapScreenLogic = (
  permissionsVerified: boolean = false,
  backgroundGranted: boolean = false // Add backgroundGranted parameter
) => {
  const { onboarding, mapState, reduxState } = useMapScreenHookStates();
  // Only log significant render state changes, not every render
  // (Removed excessive render logging that was flooding console)

  const { dataClearing, navigation, eventHandlers } = useMapScreenServicesAndHandlers(
    onboarding,
    mapState,
    reduxState,
    permissionsVerified,
    backgroundGranted // Pass background permission status
  );

  return {
    showOnboarding: onboarding.showOnboarding,
    handleOnboardingComplete: onboarding.handleOnboardingComplete,
    handleOnboardingSkip: onboarding.handleOnboardingSkip,
    uiProps: {
      mapRef: mapState.mapRef,
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
    },
  };
};

// Main component - now uses proper blocking permission verification flow
// Note: This component manages complex permission states, critical error handling,
// onboarding flow, and UI coordination. The complexity is necessary for proper
// permission verification and error recovery flows.
// eslint-disable-next-line max-lines-per-function
export const MapScreen = () => {
  // Get onboarding state first
  const { showOnboarding, handleOnboardingComplete, handleOnboardingSkip } =
    useMapScreenOnboarding();

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

  // Pass permissions verification state to the logic hook
  const { uiProps } = useMapScreenLogic(permissionsVerified, backgroundGranted);

  // Show permission verification screen while verifying OR if permissions are denied
  const showPermissionScreen =
    shouldVerifyPermissions && (isVerifying || (isVerified && !hasPermissions));

  // Show "Allow Once" warning if user selected that option
  const showOnceOnlyWarning = isVerified && mode === 'once_only';

  return (
    <>
      <MapScreenUI {...uiProps} />
      <OnboardingOverlay
        visible={showOnboarding}
        onComplete={handleOnboardingComplete}
        onSkip={handleOnboardingSkip}
      />
      {showPermissionScreen && (
        <View style={styles.loadingContainer}>
          {mode === 'denied' ? (
            // Critical error state - no location permission
            <View style={styles.criticalErrorContainer}>
              <Text style={styles.criticalErrorTitle}>📍 Location Access Required</Text>
              <Text style={styles.criticalErrorMessage}>
                FogOfDog needs location access to track your exploration and create your fog map.
                Without location permissions, the app cannot function.
              </Text>
              {error && <Text style={styles.criticalErrorDetails}>{error}</Text>}
              <View style={styles.criticalErrorButtons}>
                <TouchableOpacity
                  style={styles.criticalErrorButtonPrimary}
                  onPress={() => {
                    logger.info('User opening Settings to fix location permissions');
                    Linking.openSettings();
                  }}
                >
                  <Text style={styles.criticalErrorButtonPrimaryText}>Open Settings</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.criticalErrorButtonSecondary}
                  onPress={async () => {
                    logger.info(
                      'User going back to retry permission verification after updating settings'
                    );
                    resetVerification();
                    // Clear any cached permission state since user may have changed settings
                    try {
                      await PermissionsOrchestrator.clearStoredPermissionState();
                      logger.info('Cleared cached permission state for fresh verification');
                    } catch (error) {
                      logger.warn('Failed to clear cached permission state', { error });
                    }
                    // The useEffect in usePermissionVerification will automatically restart verification
                    // when shouldVerifyPermissions is true and state is reset
                  }}
                >
                  <Text style={styles.criticalErrorButtonSecondaryText}>Back</Text>
                </TouchableOpacity>
              </View>
            </View>
          ) : (
            // Normal loading state
            <>
              <Text style={styles.loadingText}>
                {error ? `Permission error: ${error}` : 'Verifying location permissions...'}
              </Text>
              {error && (
                <TouchableOpacity
                  style={styles.retryButton}
                  onPress={() => {
                    logger.info('User requested permission verification retry');
                    resetVerification();
                  }}
                >
                  <Text style={styles.retryButtonText}>Try Again</Text>
                </TouchableOpacity>
              )}
            </>
          )}
        </View>
      )}
      {showOnceOnlyWarning && (
        <View style={styles.warningContainer}>
          <View style={styles.warningBox}>
            <Text style={styles.warningTitle}>⚠️ Limited Functionality</Text>
            <Text style={styles.warningText}>
              You selected &ldquo;Allow Once&rdquo; which only provides a single location. FogOfDog
              needs continuous location access to track your exploration and clear the fog.
            </Text>
            <Text style={styles.warningText}>
              To use the app properly, please go to Settings → Privacy &amp; Security → Location
              Services → FogOfDog and select &ldquo;While Using App&rdquo; or &ldquo;Always&rdquo;.
            </Text>
            <View style={styles.warningButtons}>
              <TouchableOpacity
                style={styles.warningButtonSecondary}
                onPress={() => {
                  logger.info('User dismissed Allow Once warning');
                  // Reset verification to hide the warning
                  // This allows the user to continue with limited functionality
                  resetVerification();
                }}
              >
                <Text style={styles.warningButtonSecondaryText}>Continue Anyway</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.warningButtonPrimary}
                onPress={() => {
                  logger.info('User chose to open settings from Allow Once warning');
                  Linking.openSettings();
                }}
              >
                <Text style={styles.warningButtonPrimaryText}>Open Settings</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      )}
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
});
