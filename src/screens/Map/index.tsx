import React, { useEffect, useState, useRef } from 'react';
import { View, StyleSheet, TouchableOpacity, Text, Dimensions } from 'react-native';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  updateLocation,
  updateZoom,
  addPathPoint,
  setCenterOnUser,
} from '../../store/slices/explorationSlice';
import MapView, { Marker, Region } from 'react-native-maps';
import * as Location from 'expo-location'; // Import expo-location
import FogOverlay from '../../components/FogOverlay';
import LocationButton from '../../components/LocationButton';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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

// MapComponent definition removed as it wasn't in the attached file context provided
// If MapComponent is needed elsewhere, it should be managed separately.

export const MapScreen = () => {
  const dispatch = useAppDispatch();
  const { currentLocation, isMapCenteredOnUser } = useAppSelector((state) => state.exploration);
  const mapRef = useRef<MapView>(null);
  const [currentRegion, setCurrentRegion] = useState<Region | undefined>(DEFAULT_LOCATION);
  const [mapRotation, setMapRotation] = useState(0); // Track map rotation angle
  const [mapDimensions, setMapDimensions] = useState({
    width: Dimensions.get('window').width,
    height: Dimensions.get('window').height,
  });

  const insets = useSafeAreaInsets();

  useEffect(() => {
    let isActive = true;
    let subscription: Location.LocationSubscription | null = null;

    const setupLocation = async () => {
      // console.log('[MapScreen useEffect] Initiating location setup via setupLocation.');
      let { status } = await Location.requestForegroundPermissionsAsync();
      if (!isActive) return;
      // console.log('[MapScreen useEffect] Permission status:', status);

      if (status !== 'granted') {
        // console.log('[MapScreen useEffect] Permission denied. Dispatching default location.');
        if (isActive)
          dispatch(
            updateLocation({
              latitude: DEFAULT_LOCATION.latitude,
              longitude: DEFAULT_LOCATION.longitude,
            })
          );
        return;
      }

      try {
        // console.log('[MapScreen useEffect] Requesting current position.');
        let location = await Location.getCurrentPositionAsync({});
        if (!isActive) return;

        const userLatitude = location.coords.latitude;
        const userLongitude = location.coords.longitude;
        // console.log('[MapScreen useEffect] Current position fetched:', { userLatitude, userLongitude });

        if (isActive)
          dispatch(updateLocation({ latitude: userLatitude, longitude: userLongitude }));
        // console.log('[MapScreen useEffect] Dispatched updateLocation with fetched position.');

        const userRegion = {
          latitude: userLatitude,
          longitude: userLongitude,
          latitudeDelta: DEFAULT_LOCATION.latitudeDelta,
          longitudeDelta: DEFAULT_LOCATION.longitudeDelta,
        };
        if (isActive) setCurrentRegion(userRegion);
        if (isActive && mapRef.current) {
          mapRef.current.animateToRegion(userRegion, 1000);
        }

        if (isActive) {
          const localSubscription = await Location.watchPositionAsync(
            {
              accuracy: Location.Accuracy.High,
              timeInterval: 5000,
              distanceInterval: 10,
            },
            (newLocation) => {
              if (isActive) {
                // Check inside callback too
                // console.log('[MapScreen locationSubscription] New location received:', newLocation.coords);
                dispatch(
                  updateLocation({
                    latitude: newLocation.coords.latitude,
                    longitude: newLocation.coords.longitude,
                  })
                );
                // console.log('[MapScreen locationSubscription] Dispatched updateLocation with new subscription data.');
              }
            }
          );
          // console.log('[MapScreen useEffect] Location watch subscription set up.');
          if (isActive) {
            subscription = localSubscription;
          } else {
            // console.log('[MapScreen useEffect] Component unmounted during watchPositionAsync setup, removing immediate subscription.');
            localSubscription.remove();
          }
        }
      } catch (error) {
        if (isActive) {
          console.error('[MapScreen useEffect] Error fetching location:', error);
          dispatch(
            updateLocation({
              latitude: DEFAULT_LOCATION.latitude,
              longitude: DEFAULT_LOCATION.longitude,
            })
          );
        }
      }
    };

    setupLocation();

    return () => {
      isActive = false;
      // console.log('[MapScreen useEffect Cleanup] Cleanup function CALLED.');
      if (subscription) {
        // console.log('[MapScreen useEffect Cleanup] Removing location subscription.');
        subscription.remove();
      } else {
        // console.log('[MapScreen useEffect Cleanup] Subscription was null/undefined, or already removed.');
      }
    };
  }, [dispatch]);

  // Zoom Restriction Effect
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
        // Animate back to the clamped region
        mapRef.current.animateToRegion(clampedRegion, 200); // 200ms animation
      }
    }
  }, [currentRegion]);

  const handleZoomChange = (newZoom: number) => {
    // console.log('[MapScreen handleZoomChange] New zoom level:', newZoom);
    dispatch(updateZoom(newZoom));
  };

  // Function to center map on user location
  const centerOnUserLocation = () => {
    if (currentLocation && mapRef.current) {
      const userRegion = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: currentRegion?.latitudeDelta || DEFAULT_LOCATION.latitudeDelta,
        longitudeDelta: currentRegion?.longitudeDelta || DEFAULT_LOCATION.longitudeDelta,
      };
      mapRef.current.animateToRegion(userRegion, 300);
      dispatch(setCenterOnUser(true));
    }
  };

  // Log details for debugging
  // console.log('[MapScreen Render] path points:', path.length);
  // console.log('[MapScreen Render] Marker using currentLocation:', JSON.stringify(currentLocation));

  // Function to add test points around the current location
  const addTestPoint = () => {
    if (currentLocation) {
      // Add a point 100 meters east of current location
      const testPoint = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude + 0.001, // Approximately 100m east
      };
      dispatch(addPathPoint(testPoint));
      console.log(`[MapScreen] Added test point at: ${testPoint.latitude}, ${testPoint.longitude}`);
    }
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
        ref={mapRef} // Assign ref
        style={styles.map}
        initialRegion={DEFAULT_LOCATION}
        onRegionChange={(region) => {
          // Update continuously during pan/zoom to keep fog pinned to map
          setCurrentRegion(region);

          // Check if user manually panned away from their location
          if (isMapCenteredOnUser && currentLocation) {
            const latDiff = Math.abs(region.latitude - currentLocation.latitude);
            const lonDiff = Math.abs(region.longitude - currentLocation.longitude);
            // If the center has moved significantly from user location, exit centered mode
            // Using a threshold based on the current zoom level
            const threshold = Math.min(region.latitudeDelta, region.longitudeDelta) * 0.1;
            if (latDiff > threshold || lonDiff > threshold) {
              dispatch(setCenterOnUser(false));
            }
          }
        }}
        onPanDrag={() => {
          // Additional handler for pan events
          if (mapRef.current) {
            // Get current camera properties if available through the ref
            mapRef.current
              .getCamera()
              .then((camera) => {
                if (camera.heading !== undefined) {
                  setMapRotation(camera.heading);
                }
              })
              .catch((err) => {
                console.log('[MapScreen] Error getting camera:', err);
              });
          }
        }}
        onRegionChangeComplete={(region) => {
          // Use onRegionChangeComplete for stability
          setCurrentRegion(region); // Update state
          const zoom = Math.round(Math.log(360 / region.latitudeDelta) / Math.LN2);
          handleZoomChange(zoom);
        }}
        showsUserLocation={false}
        showsMyLocationButton={false}
        rotateEnabled={false} // Disable rotation
        pitchEnabled={false} // Disable pitch (3D tilting)
        // Optional: Set minZoomLevel if calculable and preferred over clamping
      >
        {/* Current Location Marker */}
        {currentLocation && (
          <Marker coordinate={currentLocation} title="You are here" anchor={{ x: 0.5, y: 0.5 }}>
            <View
              style={{
                width: 20,
                height: 20,
                backgroundColor: 'cyan',
                borderRadius: 10,
                borderColor: 'white',
                borderWidth: 2,
              }}
            />
          </Marker>
        )}
      </MapView>

      {/* New Skia-based Fog Overlay */}
      {currentRegion && (
        <FogOverlay
          mapRegion={{
            ...currentRegion,
            width: mapDimensions.width,
            height: mapDimensions.height,
          }}
          rotation={mapRotation}
        />
      )}

      {/* Location Button */}
      <LocationButton
        onPress={centerOnUserLocation}
        isLocationAvailable={currentLocation !== null}
        isCentered={isMapCenteredOnUser}
        style={{
          position: 'absolute',
          top: insets.top + 10,
          right: 10,
        }}
      />

      {/* Test button to add a point - for debugging only */}
      {__DEV__ && (
        <TouchableOpacity style={styles.testButton} onPress={addTestPoint}>
          <Text style={styles.testButtonText}>Add Test Point</Text>
        </TouchableOpacity>
      )}

      {/* Debug info - can be removed in production */}
      {/* {__DEV__ && (
        <View style={styles.debugInfo}>
          <View style={styles.debugOverlay}>
            <View style={styles.debugDot} />
          </View>
        </View>
      )} */}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  map: {
    ...StyleSheet.absoluteFillObject, // Make map fill container
  },
  testButton: {
    position: 'absolute',
    bottom: 30,
    left: 20,
    backgroundColor: 'rgba(0, 150, 255, 0.7)',
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
    elevation: 5,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 3,
  },
  testButtonText: {
    color: 'white',
    fontWeight: 'bold',
  },
});
