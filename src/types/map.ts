/**
 * Map Types
 *
 * Local type definitions for map-related concepts. These decouple our app code
 * from any specific map engine (react-native-maps, MapLibre, etc.), making
 * future engine swaps trivial.
 */

/**
 * A rectangular map region defined by center + deltas.
 * Compatible with the shape previously imported from react-native-maps.
 */
export interface MapRegion {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
}

/**
 * A simple lat/lng coordinate.
 */
export interface LatLng {
  latitude: number;
  longitude: number;
}

/**
 * Convert lat/lng to MapLibre's [longitude, latitude] GeoJSON position format.
 */
export function toGeoJSONPosition(coord: LatLng): [number, number] {
  return [coord.longitude, coord.latitude];
}

/**
 * Convert a MapRegion (center + deltas) to an approximate zoom level.
 * Useful for bridging react-native-maps style regions to MapLibre's zoom concept.
 */
export function regionToZoomLevel(region: MapRegion): number {
  // Approximate: zoom = log2(360 / longitudeDelta)
  const delta = Math.max(region.longitudeDelta, 0.0001);
  return Math.log2(360 / delta);
}

/**
 * Convert a zoom level + center to an approximate MapRegion (for compatibility).
 */
export function zoomLevelToRegion(
  latitude: number,
  longitude: number,
  zoomLevel: number
): MapRegion {
  const longitudeDelta = 360 / Math.pow(2, zoomLevel);
  const latitudeDelta = longitudeDelta * 0.6; // Rough aspect ratio correction
  return { latitude, longitude, latitudeDelta, longitudeDelta };
}
