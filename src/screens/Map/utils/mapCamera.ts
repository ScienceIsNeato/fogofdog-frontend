/**
 * Map camera utilities — pure functions for camera control and region calculations.
 * Shared by location service, map event handlers, and orchestration hooks.
 */
import type { CameraRef } from '@maplibre/maplibre-react-native';
import type { MapRegion } from '../../../types/map';
import { regionToZoomLevel } from '../../../types/map';
import type { GeoPoint } from '../../../types/user';

// Default deltas for zoom level (approx 400m diameter view)
export const DEFAULT_ZOOM_DELTAS = {
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

/**
 * Animate the map camera to a region (center + deltas).
 * Bridges the react-native-maps Region concept to MapLibre's Camera API.
 */
export const animateMapToRegion = (
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

/**
 * Move the map center without changing zoom level.
 * Used for GPS re-centering to prevent zoom drift from delta→zoom round-trip conversion.
 */
export const centerMapOnCoordinate = (
  cameraRef: React.RefObject<CameraRef | null>,
  coordinate: { latitude: number; longitude: number },
  duration: number = 300
) => {
  cameraRef.current?.setCamera({
    centerCoordinate: [coordinate.longitude, coordinate.latitude],
    animationDuration: duration,
    animationMode: 'easeTo',
  });
};

/**
 * Calculate region that encompasses exploration path with padding.
 */
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
