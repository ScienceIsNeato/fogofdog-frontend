import React, { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import {
  View,
  StyleSheet,
  Dimensions,
  DeviceEventEmitter,
  AppState,
  TouchableOpacity,
  Text,
  Alert,
} from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  updateLocation,
  updateZoom,
  setCenterOnUser,
  toggleFollowMode,
  setFollowMode,
} from '../../store/slices/explorationSlice';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import OptimizedFogOverlay from '../../components/OptimizedFogOverlay';
import LocationButton from '../../components/LocationButton';
import DataClearSelectionDialog from '../../components/DataClearSelectionDialog';
import { PermissionAlert } from '../../components/PermissionAlert';
import { TrackingControlButton } from '../../components/TrackingControlButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';
import { GPSInjectionService } from '../../services/GPSInjectionService';
import { BackgroundLocationService } from '../../services/BackgroundLocationService';
import { AuthPersistenceService } from '../../services/AuthPersistenceService';
import { DataClearingService } from '../../services/DataClearingService';
import { DataStats, ClearType } from '../../types/dataClear';
import { GeoPoint } from '../../types/user';
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

// Helper: requestLocationPermissions with proper sequence
async function requestLocationPermissions() {
  // Request foreground first
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    logger.warn('Foreground location permission denied');
    return { foregroundGranted: false, backgroundGranted: false };
  }

  // Then request background
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  const backgroundGranted = backgroundStatus === 'granted';

  logger.info('Location permissions requested', {
    component: 'MapScreen',
    action: 'requestLocationPermissions',
    foregroundStatus,
    backgroundStatus,
    backgroundGranted,
  });

  return {
    foregroundGranted: true,
    backgroundGranted,
  };
}

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
async function startLocationUpdates() {
  await Location.startLocationUpdatesAsync(LOCATION_TASK, {
    accuracy: Location.Accuracy.High,
    timeInterval: 3000,
    distanceInterval: 5,
    foregroundService: {
      notificationTitle: 'Fog of Dog',
      notificationBody: 'Tracking your location to reveal the map',
    },
  });
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
      if (isActiveRef.current) {
        logger.info('GPS coordinates injected:', location);
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
    // Show user-friendly error message if initial location fails
    PermissionAlert.show({
      errorMessage:
        'Unable to get your current location. Please ensure location services are enabled and try again.',
      onDismiss: () => {
        logger.info('Initial location error alert dismissed');
      },
    });
  }
}

// Helper function to process stored locations on startup
const processStoredLocationsOnStartup = async (options: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  currentRegion: Region | undefined;
}) => {
  if (!options.isActiveRef.current) return;

  try {
    const storedLocations = await BackgroundLocationService.processStoredLocations();
    await processStoredBackgroundLocations(storedLocations, {
      dispatch: options.dispatch,
      isMapCenteredOnUser: options.isMapCenteredOnUser,
      currentRegion: options.currentRegion,
      mapRef: options.mapRef,
    });
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

// Helper function for setting up unified location service
const setupUnifiedLocationService = async ({
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
}) => {
  try {
    const { foregroundGranted, backgroundGranted } = await requestLocationPermissions();
    if (!foregroundGranted) {
      logger.warn('Foreground location permission denied, showing permission alert');
      PermissionAlert.showCritical({
        errorMessage:
          'Location access is required to use FogOfDog. Please enable location permissions in your device settings and restart the app.',
        onDismiss: () => {
          logger.info('Permission alert dismissed');
        },
      });
      return;
    }

    // Initialize BackgroundLocationService
    await BackgroundLocationService.initialize();

    // Setup background location tracking
    await setupBackgroundLocationTracking(backgroundGranted);

    // Start foreground location tracking
    defineUnifiedLocationTask();
    await startLocationUpdates();

    // Process any stored background locations
    await processStoredLocationsOnStartup({
      isActiveRef,
      dispatch,
      mapRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      currentRegion,
    });

    await getInitialLocation({
      isActiveRef,
      dispatch,
      mapRef,
      isMapCenteredOnUser,
      isFollowModeActive,
      currentRegion,
    });
    logger.info('Unified location service started with background integration');
  } catch (error) {
    logger.error('Failed to setup unified location service:', error);
    PermissionAlert.show({
      errorMessage:
        'Failed to start location services. Please check your location settings and try again.',
      onDismiss: () => {
        logger.info('Location error alert dismissed');
      },
    });
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
    setIsLocationActive: (active: boolean) => void
  ) =>
  async () => {
    const { mapRef, isMapCenteredOnUser, isFollowModeActive, currentRegion } = config;

    try {
      logger.info('Starting location services (tracking resumed)');
      const isActiveRef = { current: true };

      await setupUnifiedLocationService({
        isActiveRef,
        dispatch,
        mapRef,
        isMapCenteredOnUser,
        isFollowModeActive,
        currentRegion,
      });

      setIsLocationActive(true);
    } catch (error) {
      logger.error('Failed to start location services:', error);
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
const useUnifiedLocationService = (
  dispatch: ReturnType<typeof useAppDispatch>,
  config: LocationServiceConfig
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
    const startLocationServices = createStartLocationServices(
      dispatch,
      config,
      setIsLocationActive
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
  }, [isTrackingPaused, dispatch, config, isLocationActive]);

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
  // workletMapRegion?: ReturnType<typeof useWorkletMapRegion>; // Available for future worklet integration
}

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
  // workletMapRegion, // Available for future worklet integration
}: MapScreenRendererProps) => {
  // Don't render map until we have a real location
  if (!currentLocation) {
    return (
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
      </View>
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
        <Marker coordinate={currentLocation} title="You are here" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={USER_MARKER_STYLE} />
        </Marker>
      </MapView>

      {/* Use OptimizedFogOverlay for better performance with many GPS points */}
      {currentFogRegion && <OptimizedFogOverlay mapRegion={currentFogRegion} />}

      <LocationButton
        onPress={centerOnUserLocation}
        isCentered={isMapCenteredOnUser}
        isFollowModeActive={isFollowModeActive}
        style={getLocationButtonStyle(insets)}
      />
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

// Custom hook for GPS injection service
const useGPSInjectionService = () => {
  useEffect(() => {
    const stopGPSInjectionCheck = GPSInjectionService.startPeriodicCheck(2000);
    return () => {
      if (typeof stopGPSInjectionCheck === 'function') {
        stopGPSInjectionCheck();
      }
    };
  }, []);
};

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
  mapRef: React.RefObject<MapView>,
  isMapCenteredOnUser: boolean,
  currentRegion: Region | undefined
) => {
  const [dataStats, setDataStats] = useState<DataStats>({
    totalPoints: 0,
    recentPoints: 0,
    oldestDate: null,
    newestDate: null,
  });
  const [isDataClearDialogVisible, setIsDataClearDialogVisible] = useState(false);
  const [isClearing, setIsClearing] = useState(false);

  const updateDataStats = useCallback(async () => {
    try {
      const stats = await DataClearingService.getDataStats();
      setDataStats(stats);
    } catch (error) {
      // Silent fail - stats will be updated next cycle
      logger.debug('Failed to update data stats, will retry on next cycle', {
        component: 'MapScreen',
        action: 'updateDataStats',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }
  }, [setDataStats]);

  // Update data stats periodically (skip in test environment)
  useEffect(() => {
    updateDataStats();

    // Only set up interval in non-test environments
    if (process.env.NODE_ENV !== 'test') {
      const interval = setInterval(updateDataStats, 30000); // Every 30 seconds
      return () => clearInterval(interval);
    }

    // Return empty cleanup function for test environment
    return () => {};
  }, [updateDataStats]);

  const handleClearSelection = createDataClearHandler(
    { isClearing, setIsClearing, setDataStats, setIsDataClearDialogVisible },
    { dispatch, mapRef, isMapCenteredOnUser, currentRegion }
  );

  return {
    dataStats,
    isDataClearDialogVisible,
    setIsDataClearDialogVisible,
    isClearing,
    handleClearSelection,
  };
};

// Clear button component
const ClearButton: React.FC<{
  isClearing: boolean;
  onPress: () => void;
}> = ({ isClearing, onPress }) => (
  <TouchableOpacity
    testID="data-clear-button"
    style={{
      position: 'absolute',
      bottom: 100,
      right: 20,
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: 'white',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      elevation: 5,
      justifyContent: 'center',
      alignItems: 'center',
    }}
    onPress={onPress}
    disabled={isClearing}
  >
    <Text style={{ fontSize: 24 }}>🗑️</Text>
  </TouchableOpacity>
);

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

  return {
    dataStats,
    setDataStats,
    isDataClearDialogVisible,
    setIsDataClearDialogVisible,
    isClearing,
    setIsClearing,
  };
};

const useMapScreenState = () => {
  const dispatch = useAppDispatch();
  const { currentLocation, isMapCenteredOnUser, isFollowModeActive } = useAppSelector(
    (state) => state.exploration
  );
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
  config: MapScreenServicesConfig
) => {
  const {
    mapRef,
    isMapCenteredOnUser,
    isFollowModeActive,
    currentRegion,
    isTrackingPaused,
    explorationState,
  } = config;
  // Use simplified unified location service
  useUnifiedLocationService(dispatch, {
    mapRef,
    isMapCenteredOnUser,
    isFollowModeActive,
    currentRegion,
    isTrackingPaused,
  });
  useZoomRestriction(currentRegion, mapRef);

  // Persist exploration state whenever it changes
  useExplorationStatePersistence(explorationState);

  // Start GPS injection check only once on mount
  useGPSInjectionService();

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
  setIsDataClearDialogVisible: (visible: boolean) => void;
  isDataClearDialogVisible: boolean;
  dataStats: DataStats;
  handleClearSelection: (type: ClearType) => Promise<void>;
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
  setIsDataClearDialogVisible,
  isDataClearDialogVisible,
  dataStats,
  handleClearSelection,
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
        // workletMapRegion={workletMapRegion} // Available for future worklet integration
      />

      {/* Tracking Control Button */}
      <TrackingControlButton
        style={{
          position: 'absolute',
          bottom: 160, // Above the data clear button
          left: 20,
          right: 20,
        }}
      />

      {/* Data Clear Button */}
      <ClearButton isClearing={isClearing} onPress={() => setIsDataClearDialogVisible(true)} />

      {/* Data Clear Selection Dialog */}
      <DataClearSelectionDialog
        visible={isDataClearDialogVisible}
        dataStats={dataStats}
        onClear={handleClearSelection}
        onCancel={() => {
          setIsDataClearDialogVisible(false);
        }}
        isClearing={isClearing}
      />
    </>
  );
};

export const MapScreen = () => {
  const {
    dispatch,
    currentLocation,
    isMapCenteredOnUser,
    isFollowModeActive,
    mapRef,
    currentRegion,
    setCurrentRegion,
    setMapDimensions,
    currentFogRegion,
    setCurrentFogRegion,
    mapDimensions,
    // Performance optimization with OptimizedFogOverlay
    updateFogRegion,
  } = useMapScreenState();

  const {
    dataStats,
    isDataClearDialogVisible,
    setIsDataClearDialogVisible,
    isClearing,
    handleClearSelection,
  } = useDataClearing(dispatch, mapRef, isMapCenteredOnUser, currentRegion);

  const { explorationState, isTrackingPaused, insets } = useMapScreenReduxState();

  // Set up all services and effects
  useMapScreenServices(dispatch, {
    mapRef,
    isMapCenteredOnUser,
    isFollowModeActive,
    currentRegion,
    isTrackingPaused,
    explorationState,
  });

  const { centerOnUserLocation, onRegionChange, onPanDrag, onRegionChangeComplete } =
    useMapEventHandlers({
      dispatch,
      currentLocation,
      currentRegion,
      isMapCenteredOnUser,
      isFollowModeActive,
      mapRef,
      setCurrentRegion,
      setCurrentFogRegion,
      mapDimensions,
      workletUpdateRegion: updateFogRegion,
    });

  return (
    <MapScreenUI
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
      isClearing={isClearing}
      setIsDataClearDialogVisible={setIsDataClearDialogVisible}
      isDataClearDialogVisible={isDataClearDialogVisible}
      dataStats={dataStats}
      handleClearSelection={handleClearSelection}
    />
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
  },
});
