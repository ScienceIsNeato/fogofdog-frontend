import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, Dimensions } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import { updateLocation, updateZoom, setCenterOnUser } from '../../store/slices/explorationSlice';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location'; // Import expo-location
import FogOverlay from '../../components/FogOverlay';
import LocationButton from '../../components/LocationButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { logger } from '../../utils/logger';

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

// Location setup helper functions
const handleLocationPermissionDenied = (
  dispatch: ReturnType<typeof useAppDispatch>,
  isActive: boolean
) => {
  if (isActive) {
    dispatch(
      updateLocation({
        latitude: DEFAULT_LOCATION.latitude,
        longitude: DEFAULT_LOCATION.longitude,
      })
    );
  }
};

const handleLocationError = (
  error: Error,
  dispatch: ReturnType<typeof useAppDispatch>,
  isActive: boolean
) => {
  if (isActive) {
    logger.error('Error fetching location:', error, {
      component: 'MapScreen',
      action: 'useEffect',
    });
    dispatch(
      updateLocation({
        latitude: DEFAULT_LOCATION.latitude,
        longitude: DEFAULT_LOCATION.longitude,
      })
    );
  }
};

const setupLocationWatcher = async (
  dispatch: ReturnType<typeof useAppDispatch>,
  isActive: boolean
) => {
  if (!isActive) return null;

  return await Location.watchPositionAsync(
    {
      accuracy: Location.Accuracy.High,
      timeInterval: 5000,
      distanceInterval: 10,
    },
    (newLocation) => {
      if (isActive) {
        dispatch(
          updateLocation({
            latitude: newLocation.coords.latitude,
            longitude: newLocation.coords.longitude,
          })
        );
      }
    }
  );
};

// Hook for location setup logic
const useLocationSetup = (
  dispatch: ReturnType<typeof useAppDispatch>,
  mapRef: React.RefObject<MapView>
) => {
  useEffect(() => {
    let isActive = true;
    let subscription: Location.LocationSubscription | null = null;

    const setupLocation = async () => {
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (!isActive) return;

      if (status !== 'granted') {
        handleLocationPermissionDenied(dispatch, isActive);
        return;
      }

      try {
        let location = await Location.getCurrentPositionAsync({});
        if (!isActive) return;

        const userLatitude = location.coords.latitude;
        const userLongitude = location.coords.longitude;

        if (isActive) {
          dispatch(updateLocation({ latitude: userLatitude, longitude: userLongitude }));
        }

        const userRegion = {
          latitude: userLatitude,
          longitude: userLongitude,
          latitudeDelta: DEFAULT_LOCATION.latitudeDelta,
          longitudeDelta: DEFAULT_LOCATION.longitudeDelta,
        };

        if (isActive && mapRef.current) {
          mapRef.current.animateToRegion(userRegion, 1000);
        }

        const localSubscription = await setupLocationWatcher(dispatch, isActive);
        if (isActive && localSubscription) {
          subscription = localSubscription;
        } else if (localSubscription) {
          localSubscription.remove();
        }
      } catch (error) {
        handleLocationError(
          error instanceof Error ? error : new Error(String(error)),
          dispatch,
          isActive
        );
      }
    };

    setupLocation();

    return () => {
      isActive = false;
      if (subscription) {
        subscription.remove();
      }
    };
  }, [dispatch, mapRef]);
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

// Map event handlers
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

  const onRegionChange = (region: Region) => {
    setCurrentRegion(region);

    if (isMapCenteredOnUser && currentLocation) {
      const latDiff = Math.abs(region.latitude - currentLocation.latitude);
      const lonDiff = Math.abs(region.longitude - currentLocation.longitude);
      const threshold = Math.min(region.latitudeDelta, region.longitudeDelta) * 0.1;
      if (latDiff > threshold || lonDiff > threshold) {
        dispatch(setCenterOnUser(false));
      }
    }
  };

  const onPanDrag = () => {
    mapRef.current
      ?.getCamera()
      .then((camera) => {
        // Rotation functionality temporarily removed
        logger.debug('Camera position updated', {
          component: 'MapScreen',
          action: 'onPanDrag',
          heading: camera.heading,
        });
      })
      .catch((err) => {
        logger.error('Error getting camera:', err, {
          component: 'MapScreen',
          action: 'onPanDrag',
        });
      });
  };

  const onRegionChangeComplete = (region: Region) => {
    setCurrentRegion(region);
    const zoom = Math.round(Math.log(360 / region.latitudeDelta) / Math.LN2);
    handleZoomChange(zoom);
  };

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
  currentRegion: Region | undefined;
  mapDimensions: { width: number; height: number };
  insets: SafeAreaInsets;
  isMapCenteredOnUser: boolean;
  onRegionChange: (region: Region) => void;
  onPanDrag: () => void;
  onRegionChangeComplete: (region: Region) => void;
  centerOnUserLocation: () => void;
  setMapDimensions: (dimensions: { width: number; height: number }) => void;
}

// Render component for the map view and overlays
const MapScreenRenderer = ({
  mapRef,
  currentLocation,
  currentRegion,
  mapDimensions,
  insets,
  isMapCenteredOnUser,
  onRegionChange,
  onPanDrag,
  onRegionChangeComplete,
  centerOnUserLocation,
  setMapDimensions,
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

    {currentRegion && (
      <FogOverlay
        mapRegion={{
          ...currentRegion,
          width: mapDimensions.width,
          height: mapDimensions.height,
        }}
      />
    )}

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

  return {
    dispatch,
    currentLocation,
    isMapCenteredOnUser,
    mapRef,
    currentRegion,
    setCurrentRegion,
    mapDimensions,
    setMapDimensions,
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
    mapDimensions,
    setMapDimensions,
  } = useMapScreenState();

  const insets = useSafeAreaInsets();

  // Use our custom hooks
  useLocationSetup(dispatch, mapRef);
  useZoomRestriction(currentRegion, mapRef);

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
      currentRegion={currentRegion}
      mapDimensions={mapDimensions}
      insets={insets}
      isMapCenteredOnUser={isMapCenteredOnUser}
      onRegionChange={onRegionChange}
      onPanDrag={onPanDrag}
      onRegionChangeComplete={onRegionChangeComplete}
      centerOnUserLocation={centerOnUserLocation}
      setMapDimensions={setMapDimensions}
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
