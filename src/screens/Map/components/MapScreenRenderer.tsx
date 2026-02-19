/**
 * Map screen rendering components — MapScreenRenderer, MapViewWithMarker, MapScreenUI.
 * Pure presentational layer with no side-effects; all state is received via props.
 */
import React, { useMemo } from 'react';
import { View, Text } from 'react-native';
import {
  MapView,
  Camera,
  MarkerView,
  type CameraRef,
  type RegionPayload,
} from '@maplibre/maplibre-react-native';

import { useAppSelector } from '../../../store/hooks';
import { getSkinStyle } from '../../../services/SkinStyleService';
import { regionToZoomLevel } from '../../../types/map';
import type { MapRegion } from '../../../types/map';
import type { GeoPoint } from '../../../types/user';
import type { DataStats, ClearType } from '../../../types/dataClear';
import {
  FogImageLayerConnected,
  MapEffectOverlayConnected,
  ScentTrailConnected,
} from '../graphicsConnectors';
import LocationButton from '../../../components/LocationButton';
import { TrackingControlButton } from '../../../components/TrackingControlButton';
import { SettingsButton } from '../../../components/SettingsButton';
import UnifiedSettingsModal from '../../../components/UnifiedSettingsModal';
import { HUDStatsPanel } from '../../../components/HUDStatsPanel';
import { GPSInjectionIndicator } from '../../../components/GPSInjectionIndicator';
import { GPSAcquisitionOverlay } from '../../../components/GPSAcquisitionOverlay';
import { MapDistanceScale } from '../../../components/MapDistanceScale';
import { logger } from '../../../utils/logger';
import { useCinematicZoom } from '../hooks/useCinematicZoom';

import { styles } from '../styles';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface SafeAreaInsets {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

export interface MapScreenRendererProps {
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
  canStartCinematicAnimation?: boolean;
}

interface MapViewWithMarkerProps {
  mapRef: React.RefObject<CameraRef | null>;
  initialRegion: MapRegion;
  currentLocation: GeoPoint | null;
  currentRegion?: MapRegion | undefined;
  currentFogRegion?: (MapRegion & { width: number; height: number }) | undefined;
  mapDimensions: { width: number; height: number };
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number };
  onRegionChange: (region: MapRegion) => void;
  onPanDrag: () => void;
  onRegionChangeComplete: (region: MapRegion) => void;
  isAcquiringGPS: boolean;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_MARKER_STYLE = {
  width: 20,
  height: 20,
  backgroundColor: 'cyan',
  borderRadius: 10,
  borderColor: 'white',
  borderWidth: 2,
};

// ─── Positioning Helpers ──────────────────────────────────────────────────────

export const getLocationButtonStyle = (insets: SafeAreaInsets) => ({
  position: 'absolute' as const,
  top: insets.top + 10,
  right: 10,
});

export const getSettingsButtonStyle = (insets: SafeAreaInsets) => ({
  position: 'absolute' as const,
  top: insets.top + 10,
  left: 10,
});

// ─── Marker Alignment ─────────────────────────────────────────────────────────

/**
 * Calculate adjusted marker coordinate to align with safe-area-compensated fog overlay.
 * The fog overlay accounts for safe area insets, but MapView markers use raw coordinates.
 */
const calculateAdjustedMarkerCoordinate = (
  currentLocation: GeoPoint | null,
  currentRegion: MapRegion | undefined,
  mapDimensions: { width: number; height: number },
  safeAreaInsets?: { top: number; bottom: number; left: number; right: number }
): { latitude: number; longitude: number } => {
  if (!currentLocation || !currentRegion || !safeAreaInsets || mapDimensions.height <= 0) {
    return {
      latitude: currentLocation?.latitude ?? 0,
      longitude: currentLocation?.longitude ?? 0,
    };
  }

  // Net misalignment is half the visual offset = (safeAreaTop/2)/2 = safeAreaTop/4
  const safeAreaVerticalOffset = (safeAreaInsets.top - safeAreaInsets.bottom) / 4;
  const latitudePerPixel = currentRegion.latitudeDelta / mapDimensions.height;
  const latitudeAdjustment = safeAreaVerticalOffset * latitudePerPixel;

  return {
    latitude: currentLocation.latitude + latitudeAdjustment,
    longitude: currentLocation.longitude,
  };
};

// ─── Loading State ────────────────────────────────────────────────────────────

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

// ─── MapViewWithMarker ────────────────────────────────────────────────────────

// PERFORMANCE: Wrapped in React.memo with a custom comparator that ignores
// lat/lon pan changes. During a pan gesture, currentRegion updates at ~60fps
// but the marker adjustment only depends on zoom level (latitudeDelta) and
// dimensions — MapLibre handles the native gesture rendering independently.
const MapViewWithMarker = React.memo<MapViewWithMarkerProps>(
  function MapViewWithMarker({
    mapRef,
    initialRegion,
    currentLocation,
    currentRegion,
    currentFogRegion,
    mapDimensions,
    safeAreaInsets,
    onRegionChange,
    onPanDrag,
    onRegionChangeComplete,
    isAcquiringGPS,
  }) {
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

        {/* Fog layer rendered INSIDE MapView — moves with camera natively, zero lag */}
        {currentFogRegion && !isAcquiringGPS && (
          <FogImageLayerConnected mapRegion={currentFogRegion} safeAreaInsets={safeAreaInsets} />
        )}
      </MapView>
    );
  },
  (prev, next) => {
    const prevDelta = prev.currentRegion?.latitudeDelta ?? 0;
    const nextDelta = next.currentRegion?.latitudeDelta ?? 0;
    const prevFogDelta = prev.currentFogRegion?.latitudeDelta ?? 0;
    const nextFogDelta = next.currentFogRegion?.latitudeDelta ?? 0;
    return (
      prev.currentLocation === next.currentLocation &&
      prev.initialRegion === next.initialRegion &&
      prev.safeAreaInsets === next.safeAreaInsets &&
      prev.mapDimensions.width === next.mapDimensions.width &&
      prev.mapDimensions.height === next.mapDimensions.height &&
      prev.isAcquiringGPS === next.isAcquiringGPS &&
      Math.abs(prevDelta - nextDelta) <= 0.0001 &&
      prev.currentFogRegion === next.currentFogRegion &&
      Math.abs(prevFogDelta - nextFogDelta) <= 0.0001 &&
      prev.onRegionChange === next.onRegionChange &&
      prev.onPanDrag === next.onPanDrag &&
      prev.onRegionChangeComplete === next.onRegionChangeComplete
    );
  }
);

// ─── MapScreenRenderer ───────────────────────────────────────────────────────

export const MapScreenRenderer = ({
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
  canStartCinematicAnimation = true,
}: MapScreenRendererProps) => {
  const { initialRegion } = useCinematicZoom({
    mapRef,
    cinematicZoomActiveRef,
    currentLocation,
    canStartAnimation: canStartCinematicAnimation,
  });

  // PERFORMANCE: Stable reference for mapDimensions — prevents MapViewWithMarker
  // from re-rendering on every fog region pan update.
  const mapViewDimensions = useMemo(
    () => ({
      width: currentFogRegion?.width ?? 0,
      height: currentFogRegion?.height ?? 0,
    }),
    [currentFogRegion?.width, currentFogRegion?.height]
  );

  // PERFORMANCE: Stable region props for MapDistanceScale — only changes with zoom.
  const distanceScaleRegion = useMemo(
    () =>
      currentFogRegion
        ? {
            latitude: currentFogRegion.latitude,
            longitude: currentFogRegion.longitude,
            latitudeDelta: currentFogRegion.latitudeDelta,
            longitudeDelta: currentFogRegion.longitudeDelta,
          }
        : undefined,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [currentFogRegion?.latitudeDelta, currentFogRegion?.longitudeDelta, currentFogRegion?.latitude]
  );

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
        currentFogRegion={currentFogRegion}
        mapDimensions={mapViewDimensions}
        safeAreaInsets={insets}
        onRegionChange={onRegionChange}
        onPanDrag={onPanDrag}
        onRegionChangeComplete={onRegionChangeComplete}
        isAcquiringGPS={isAcquiringGPS}
      />

      {currentFogRegion && !isAcquiringGPS && (
        <MapEffectOverlayConnected
          fogRegion={currentFogRegion}
          safeAreaInsets={insets}
          currentLocation={currentLocation}
        />
      )}

      {currentFogRegion && !isAcquiringGPS && (
        <ScentTrailConnected fogRegion={currentFogRegion} safeAreaInsets={insets} />
      )}

      {distanceScaleRegion && !isAcquiringGPS && (
        <MapDistanceScale region={distanceScaleRegion} mapWidth={currentFogRegion?.width ?? 0} />
      )}

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

// ─── MapScreenUI ──────────────────────────────────────────────────────────────

export interface MapScreenUIProps {
  mapRef: React.RefObject<CameraRef | null>;
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
  isClearing: boolean;
  dataStats: DataStats;
  handleClearSelection: (type: ClearType) => Promise<void>;
  handleSettingsPress: () => void;
  isSettingsModalVisible: boolean;
  setIsSettingsModalVisible: (visible: boolean) => void;
  cinematicZoomActiveRef: React.MutableRefObject<boolean>;
  canStartCinematicAnimation?: boolean;
  gpsInjectionStatus: {
    isRunning: boolean;
    type: 'real-time' | 'historical' | null;
    message: string;
  };
}

export const MapScreenUI: React.FC<MapScreenUIProps> = ({
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
      />

      <TrackingControlButton style={styles.trackingControlButton} />
      <HUDStatsPanel />
      <GPSInjectionIndicator
        isVisible={gpsInjectionStatus.isRunning}
        message={gpsInjectionStatus.message}
      />
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
