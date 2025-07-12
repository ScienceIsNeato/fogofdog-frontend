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
import { updateLocation, updateZoom, setCenterOnUser } from '../../store/slices/explorationSlice';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import FogOverlay from '../../components/FogOverlay';
import LocationButton from '../../components/LocationButton';
import DataClearSelectionDialog from '../../components/DataClearSelectionDialog';
import { PermissionAlert } from '../../components/PermissionAlert';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';
import { GPSInjectionService } from '../../services/GPSInjectionService';
import { BackgroundLocationService } from '../../services/BackgroundLocationService';
import { AuthPersistenceService } from '../../services/AuthPersistenceService';
import { DataClearingService } from '../../services/DataClearingService';
import { DataStats, ClearType } from '../../types/dataClear';

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
  location: { latitude: number; longitude: number };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
  currentRegion: Region | undefined;
}

const handleLocationUpdate = ({
  location,
  dispatch,
  mapRef,
  isMapCenteredOnUser,
  currentRegion,
}: HandleLocationUpdateOptions) => {
  dispatch(updateLocation(location));
  if (isMapCenteredOnUser && mapRef.current) {
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
  currentRegion,
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
  currentRegion: Region | undefined;
}) {
  const locationUpdateListener = DeviceEventEmitter.addListener(
    'locationUpdate',
    (location: { latitude: number; longitude: number }) => {
      if (isActiveRef.current) {
        handleLocationUpdate({
          location,
          dispatch,
          mapRef,
          isMapCenteredOnUser,
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
        handleLocationUpdate({
          location,
          dispatch,
          mapRef,
          isMapCenteredOnUser,
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
  currentRegion,
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
  currentRegion: Region | undefined;
}) {
  try {
    const initialLocation = await Location.getCurrentPositionAsync({
      accuracy: Location.Accuracy.High,
    });
    if (isActiveRef.current) {
      handleLocationUpdate({
        location: {
          latitude: initialLocation.coords.latitude,
          longitude: initialLocation.coords.longitude,
        },
        dispatch,
        mapRef,
        isMapCenteredOnUser,
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
  currentRegion: Region | undefined;
}) => {
  const storedLocations = await BackgroundLocationService.processStoredLocations();
  if (storedLocations.length === 0) return;

  logger.info(`Processed ${storedLocations.length} stored background locations on startup`);
  // Update Redux with the most recent stored location if available
  const mostRecent = storedLocations[storedLocations.length - 1];
  if (options.isActiveRef.current && mostRecent) {
    handleLocationUpdate({
      location: {
        latitude: mostRecent.latitude,
        longitude: mostRecent.longitude,
      },
      dispatch: options.dispatch,
      mapRef: options.mapRef,
      isMapCenteredOnUser: options.isMapCenteredOnUser,
      currentRegion: options.currentRegion,
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
  currentRegion,
}: {
  isActiveRef: { current: boolean };
  dispatch: ReturnType<typeof useAppDispatch>;
  mapRef: React.RefObject<MapView>;
  isMapCenteredOnUser: boolean;
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
      currentRegion,
    });

    await getInitialLocation({
      isActiveRef,
      dispatch,
      mapRef,
      isMapCenteredOnUser,
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

// Refactor useUnifiedLocationService to use helpers and further reduce line count
const useUnifiedLocationService = (
  dispatch: ReturnType<typeof useAppDispatch>,
  mapRef: React.RefObject<MapView>,
  isMapCenteredOnUser: boolean,
  currentRegion: Region | undefined
) => {
  // Only initialize the unified location service on mount/unmount
  useEffect(() => {
    const isActiveRef = { current: true };

    // Set up listeners for location and GPS injection events
    const listeners = setupLocationListeners({
      isActiveRef,
      dispatch,
      mapRef,
      isMapCenteredOnUser,
      currentRegion,
    });

    // Initialize unified location service once
    setupUnifiedLocationService({
      isActiveRef,
      dispatch,
      mapRef,
      isMapCenteredOnUser,
      currentRegion,
    });

    return () => {
      isActiveRef.current = false;
      cleanupLocationListeners(listeners);
      Location.stopLocationUpdatesAsync(LOCATION_TASK)?.catch(() => {
        /* ignore error if task is already stopped */
      });
      // Stop background location tracking
      BackgroundLocationService.stopBackgroundLocationTracking().catch(() => {
        /* ignore error if already stopped */
      });
      logger.info('Unified location service stopped with background tracking.');
    };
  }, [dispatch, mapRef, isMapCenteredOnUser, currentRegion]);
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
  (
    currentLocation: LocationCoordinate | null,
    currentRegion: Region | undefined,
    mapRef: React.RefObject<MapView>,
    dispatch: ReturnType<typeof useAppDispatch>
  ) =>
  () => {
    if (currentLocation && mapRef.current) {
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
  isMapCenteredOnUser,
  currentLocation,
  dispatch,
}: {
  region: Region;
  setCurrentRegion: (region: Region) => void;
  isMapCenteredOnUser: boolean;
  currentLocation: LocationCoordinate | null;
  dispatch: ReturnType<typeof useAppDispatch>;
}) {
  setCurrentRegion(region);
  if (isMapCenteredOnUser && currentLocation) {
    const latDiff = Math.abs(region.latitude - currentLocation.latitude);
    const lonDiff = Math.abs(region.longitude - currentLocation.longitude);
    const threshold = Math.min(region.latitudeDelta, region.longitudeDelta) * 0.1;
    if (latDiff > threshold || lonDiff > threshold) {
      dispatch(setCenterOnUser(false));
    }
  }
}

function handlePanDrag({ mapRef }: { mapRef: React.RefObject<MapView> }) {
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
  mapRef: React.RefObject<MapView>;
  setCurrentRegion: (region: Region) => void;
}) => {
  const {
    dispatch,
    currentLocation,
    currentRegion,
    isMapCenteredOnUser,
    mapRef,
    setCurrentRegion,
  } = options;

  const handleZoomChange = createZoomHandler(dispatch);
  const centerOnUserLocation = createCenterOnUserHandler(
    currentLocation,
    currentRegion,
    mapRef,
    dispatch
  );

  const onRegionChange = (region: Region) =>
    handleRegionChange({
      region,
      setCurrentRegion,
      isMapCenteredOnUser,
      currentLocation,
      dispatch,
    });

  const onPanDrag = () => handlePanDrag({ mapRef });

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
  onRegionChange: (region: Region) => void;
  onPanDrag: () => void;
  onRegionChangeComplete: (region: Region) => void;
  centerOnUserLocation: () => void;
  setMapDimensions: (dimensions: { width: number; height: number }) => void;
  memoizedMapRegion: (Region & { width: number; height: number }) | undefined;
}

// Render component for the map view and overlays
const MapScreenRenderer = ({
  mapRef,
  currentLocation,
  insets,
  isMapCenteredOnUser,
  onRegionChange,
  onPanDrag,
  onRegionChangeComplete,
  centerOnUserLocation,
  setMapDimensions,
  memoizedMapRegion,
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
          isLocationAvailable={false}
          isCentered={isMapCenteredOnUser}
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

      {memoizedMapRegion && <FogOverlay mapRegion={memoizedMapRegion} />}

      <LocationButton
        onPress={centerOnUserLocation}
        isLocationAvailable={currentLocation !== null}
        isCentered={isMapCenteredOnUser}
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
    currentRegion: options.currentRegion,
  });
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
    } catch (_error) {
      // Silent fail - stats will be updated next cycle
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

  const handleClearSelection = async (type: ClearType) => {
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
      await refetchLocationAfterClear(type, {
        dispatch,
        mapRef,
        isMapCenteredOnUser,
        currentRegion,
      });

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
  dataStats: DataStats;
  isClearing: boolean;
  onPress: () => void;
}> = ({ dataStats, isClearing, onPress }) => (
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
    disabled={dataStats.totalPoints === 0 || isClearing}
  >
    <Text style={{ fontSize: 24 }}>🗑️</Text>
  </TouchableOpacity>
);

const useMapScreenState = () => {
  const dispatch = useAppDispatch();
  const { currentLocation, isMapCenteredOnUser } = useAppSelector((state) => state.exploration);
  const mapRef = useRef<MapView>(null);
  const [currentRegion, setCurrentRegion] = useState<Region | undefined>(undefined);
  const [mapDimensions, setMapDimensions] = useState({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  });

  // Data clearing state
  const [dataStats, setDataStats] = useState<DataStats>({
    totalPoints: 0,
    recentPoints: 0,
    oldestDate: null,
    newestDate: null,
  });
  const [isDataClearDialogVisible, setIsDataClearDialogVisible] = useState(false);

  const [isClearing, setIsClearing] = useState(false);

  // Memoize the mapRegion object to prevent unnecessary FogOverlay re-renders
  const memoizedMapRegion = useMemo(() => {
    if (!currentRegion) return undefined;

    return {
      ...currentRegion,
      width: mapDimensions.width,
      height: mapDimensions.height,
    };
  }, [currentRegion, mapDimensions]);

  return {
    dispatch,
    currentLocation,
    isMapCenteredOnUser,
    mapRef,
    currentRegion,
    setCurrentRegion,
    setMapDimensions,
    memoizedMapRegion,
    dataStats,
    setDataStats,
    isDataClearDialogVisible,
    setIsDataClearDialogVisible,
    isClearing,
    setIsClearing,
  };
};

export const MapScreen = () => {
  const {
    dispatch,
    currentLocation,
    isMapCenteredOnUser,
    mapRef,
    currentRegion,
    setCurrentRegion,
    setMapDimensions,
    memoizedMapRegion,
  } = useMapScreenState();

  const {
    dataStats,
    isDataClearDialogVisible,
    setIsDataClearDialogVisible,
    isClearing,
    handleClearSelection,
  } = useDataClearing(dispatch, mapRef, isMapCenteredOnUser, currentRegion);

  const insets = useSafeAreaInsets();

  // Get exploration state for persistence
  const explorationState = useAppSelector((state) => state.exploration);

  // Use simplified unified location service
  useUnifiedLocationService(dispatch, mapRef, isMapCenteredOnUser, currentRegion);
  useZoomRestriction(currentRegion, mapRef);

  // Persist exploration state whenever it changes
  useExplorationStatePersistence(explorationState);

  // Start GPS injection check only once on mount
  useGPSInjectionService();

  // Add AppState listener to process stored locations when app becomes active
  useAppStateChangeHandler(dispatch, isMapCenteredOnUser, currentRegion, mapRef);

  const { centerOnUserLocation, onRegionChange, onPanDrag, onRegionChangeComplete } =
    useMapEventHandlers({
      dispatch,
      currentLocation,
      currentRegion,
      isMapCenteredOnUser,
      mapRef,
      setCurrentRegion,
    });

  return (
    <>
      <MapScreenRenderer
        mapRef={mapRef}
        currentLocation={currentLocation}
        insets={insets}
        isMapCenteredOnUser={isMapCenteredOnUser}
        onRegionChange={onRegionChange}
        onPanDrag={onPanDrag}
        onRegionChangeComplete={onRegionChangeComplete}
        centerOnUserLocation={centerOnUserLocation}
        setMapDimensions={setMapDimensions}
        memoizedMapRegion={memoizedMapRegion}
      />

      {/* Data Clear Button */}
      <ClearButton
        dataStats={dataStats}
        isClearing={isClearing}
        onPress={() => setIsDataClearDialogVisible(true)}
      />

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
