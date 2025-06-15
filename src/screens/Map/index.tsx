import React, { useEffect, useState, useRef, useMemo } from 'react';
import { View, StyleSheet, Dimensions, DeviceEventEmitter } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { updateLocation, updateZoom, setCenterOnUser } from '../../store/slices/explorationSlice';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import FogOverlay from '../../components/FogOverlay';
import LocationButton from '../../components/LocationButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';
import { GPSInjectionService } from '../../services/GPSInjectionService';

// Unified location task name
const LOCATION_TASK = 'unified-location-task';

// Default location (will be used as a fallback or before real location is fetched)
const DEFAULT_LOCATION = {
  latitude: 37.78825,
  longitude: -122.4324,
  // Adjust deltas for initial zoom (approx 400m diameter view)
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
      latitudeDelta: currentRegion?.latitudeDelta ?? DEFAULT_LOCATION.latitudeDelta,
      longitudeDelta: currentRegion?.longitudeDelta ?? DEFAULT_LOCATION.longitudeDelta,
    };
    mapRef.current.animateToRegion(newRegion, 500);
  }
};

// Helper: requestLocationPermissions
async function requestLocationPermissions() {
  const { status: foregroundStatus } = await Location.requestForegroundPermissionsAsync();
  if (foregroundStatus !== 'granted') {
    return { foregroundGranted: false, backgroundGranted: false };
  }
  const { status: backgroundStatus } = await Location.requestBackgroundPermissionsAsync();
  return {
    foregroundGranted: true,
    backgroundGranted: backgroundStatus === 'granted',
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
    logger.warn('Could not get initial location, using default', {
      component: 'MapScreen',
      action: 'getInitialLocation',
      error: error instanceof Error ? error.message : String(error),
    });
    if (isActiveRef.current) {
      dispatch(
        updateLocation({
          latitude: DEFAULT_LOCATION.latitude,
          longitude: DEFAULT_LOCATION.longitude,
        })
      );
    }
  }
}

// Refactor useUnifiedLocationService to use helpers and further reduce line count
const useUnifiedLocationService = (
  dispatch: ReturnType<typeof useAppDispatch>,
  mapRef: React.RefObject<MapView>,
  isMapCenteredOnUser: boolean,
  currentRegion: Region | undefined
) => {
  useEffect(() => {
    const isActiveRef = { current: true };

    const setupUnifiedLocationService = async () => {
      try {
        const { foregroundGranted, backgroundGranted } = await requestLocationPermissions();
        if (!foregroundGranted) {
          logger.warn('Foreground location permission denied, using default location');
          if (isActiveRef.current) {
            dispatch(
              updateLocation({
                latitude: DEFAULT_LOCATION.latitude,
                longitude: DEFAULT_LOCATION.longitude,
              })
            );
          }
          return;
        }
        if (!backgroundGranted) {
          logger.warn('Background location permission denied, foreground only');
        }
        defineUnifiedLocationTask();
        await startLocationUpdates();
        await getInitialLocation({
          isActiveRef,
          dispatch,
          mapRef,
          isMapCenteredOnUser,
          currentRegion,
        });
        logger.info('Unified location service started');
      } catch (error) {
        logger.error('Failed to setup unified location service:', error);
        if (isActiveRef.current) {
          dispatch(
            updateLocation({
              latitude: DEFAULT_LOCATION.latitude,
              longitude: DEFAULT_LOCATION.longitude,
            })
          );
        }
      }
    };

    const listeners = setupLocationListeners({
      isActiveRef,
      dispatch,
      mapRef,
      isMapCenteredOnUser,
      currentRegion,
    });

    setupUnifiedLocationService();

    return () => {
      isActiveRef.current = false;
      cleanupLocationListeners(listeners);
      Location.stopLocationUpdatesAsync(LOCATION_TASK)?.catch(() => {
        /* ignore error if task is already stopped */
      });
      logger.info('Unified location service stopped.');
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
        latitudeDelta: currentRegion?.latitudeDelta ?? DEFAULT_LOCATION.latitudeDelta,
        longitudeDelta: currentRegion?.longitudeDelta ?? DEFAULT_LOCATION.longitudeDelta,
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
}: MapScreenRendererProps) => (
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
      initialRegion={DEFAULT_LOCATION}
      onRegionChange={onRegionChange}
      onPanDrag={onPanDrag}
      onRegionChangeComplete={onRegionChangeComplete}
      showsUserLocation={false}
      showsMyLocationButton={false}
      rotateEnabled={false}
      pitchEnabled={false}
    >
      {currentLocation && (
        <Marker coordinate={currentLocation} title="You are here" anchor={{ x: 0.5, y: 0.5 }}>
          <View style={USER_MARKER_STYLE} />
        </Marker>
      )}
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

// Hook for map screen state initialization
const useMapScreenState = () => {
  const dispatch = useAppDispatch();
  const { currentLocation, isMapCenteredOnUser } = useAppSelector((state) => state.exploration);
  const mapRef = useRef<MapView>(null);
  const [currentRegion, setCurrentRegion] = useState<Region | undefined>(DEFAULT_LOCATION);
  const [mapDimensions, setMapDimensions] = useState({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  });

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

  const insets = useSafeAreaInsets();

  // Use simplified unified location service
  useUnifiedLocationService(dispatch, mapRef, isMapCenteredOnUser, currentRegion);
  useZoomRestriction(currentRegion, mapRef);

  // Start GPS injection check only once on mount

  // The empty dependency array is intentional: we only want to start the periodic check once on mount, not on updates.
  useEffect(() => {
    const stopGPSInjectionCheck = GPSInjectionService.startPeriodicCheck(2000);
    return () => {
      if (typeof stopGPSInjectionCheck === 'function') {
        stopGPSInjectionCheck();
      }
    };
  }, []);

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
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject, // Make map fill container
  },
});
