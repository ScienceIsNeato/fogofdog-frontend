/**
 * Tile Coordinate Utilities
 *
 * Implements standard web mercator (slippy map) tile coordinate math.
 * All popular tile-based mapping services (OSM, Google Maps, Mapbox) use this system.
 *
 * Tile coordinates: (z, x, y) where:
 *   z = zoom level (0-19)
 *   x = tile column (west=0, increases east)
 *   y = tile row (north=0, increases south)
 */

import type { MapRegion } from '../types/map';

export interface TileCoord {
  z: number;
  x: number;
  y: number;
}

export interface TileBounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

const TILE_SIZE = 256;

// Maximum latitude supported by Web Mercator projection (≈ 85.0511°)
const MAX_MERCATOR_LATITUDE = 85.0511;

/**
 * Converts latitude/longitude to web mercator tile coordinates at a given zoom level.
 * Clamps latitude to the valid Web Mercator range to prevent NaN results.
 */
export function latLonToTile(lat: number, lon: number, zoom: number): TileCoord {
  const z = Math.floor(zoom);
  const numTiles = Math.pow(2, z);
  const x = Math.floor(((lon + 180) / 360) * numTiles);
  // Clamp latitude to Web Mercator valid range to prevent NaN from tan/log
  const clampedLat = Math.max(-MAX_MERCATOR_LATITUDE, Math.min(MAX_MERCATOR_LATITUDE, lat));
  const latRad = (clampedLat * Math.PI) / 180;
  const y = Math.floor(
    ((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * numTiles
  );
  return {
    z,
    x: Math.max(0, Math.min(x, numTiles - 1)),
    y: Math.max(0, Math.min(y, numTiles - 1)),
  };
}

/**
 * Returns the geographic bounding box of a tile.
 */
export function tileToBounds(x: number, y: number, z: number): TileBounds {
  const numTiles = Math.pow(2, z);
  const west = (x / numTiles) * 360 - 180;
  const east = ((x + 1) / numTiles) * 360 - 180;
  const northRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / numTiles)));
  const southRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (y + 1)) / numTiles)));
  return {
    north: (northRad * 180) / Math.PI,
    south: (southRad * 180) / Math.PI,
    east,
    west,
  };
}

/**
 * Returns all tile coordinates visible in the given map region at the specified zoom level.
 *
 * Note: For regions that cross the antimeridian (where westLon > eastLon or
 * eastLon > 180), the x-range would wrap incorrectly. We guard against this
 * by returning an empty array — FogOfDog operates in continental US so this
 * is a defensive measure, not a user-facing limitation.
 */
export function getVisibleTiles(region: MapRegion, zoom: number): TileCoord[] {
  const z = Math.floor(zoom);
  const northLat = region.latitude + region.latitudeDelta / 2;
  const southLat = region.latitude - region.latitudeDelta / 2;
  const westLon = region.longitude - region.longitudeDelta / 2;
  const eastLon = region.longitude + region.longitudeDelta / 2;

  const topLeft = latLonToTile(northLat, westLon, z);
  const bottomRight = latLonToTile(southLat, eastLon, z);

  // Guard against antimeridian crossing or inverted ranges
  if (topLeft.x > bottomRight.x || topLeft.y > bottomRight.y) {
    return [];
  }

  const tiles: TileCoord[] = [];
  for (let x = topLeft.x; x <= bottomRight.x; x++) {
    for (let y = topLeft.y; y <= bottomRight.y; y++) {
      tiles.push({ z, x, y });
    }
  }
  return tiles;
}

/**
 * Converts a tile's geographic bounds to screen pixel coordinates
 * given the current map region and viewport dimensions.
 */
export function tileToScreenRect(
  tile: TileCoord,
  region: MapRegion & { width: number; height: number }
): { x: number; y: number; width: number; height: number } {
  const bounds = tileToBounds(tile.x, tile.y, tile.z);

  const lonToX = (lon: number) =>
    ((lon - (region.longitude - region.longitudeDelta / 2)) / region.longitudeDelta) * region.width;

  const latToY = (lat: number) =>
    ((region.latitude + region.latitudeDelta / 2 - lat) / region.latitudeDelta) * region.height;

  const left = lonToX(bounds.west);
  const top = latToY(bounds.north);
  const right = lonToX(bounds.east);
  const bottom = latToY(bounds.south);

  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

/**
 * Returns the integer zoom level best matching the given latitude delta
 * (as reported by react-native-maps region).
 *
 * Guards against non-positive or non-finite deltas (e.g. transient map events)
 * by clamping the result to a safe range.
 */
export function regionToZoom(latitudeDelta: number): number {
  const MIN_ZOOM = 0;
  const MAX_ZOOM = 20;

  if (!Number.isFinite(latitudeDelta) || latitudeDelta <= 0) {
    return MIN_ZOOM;
  }

  // latitudeDelta ≈ 360 / 2^z → z ≈ log2(360 / latitudeDelta)
  const raw = Math.round(Math.log2(360 / latitudeDelta));
  return Math.max(MIN_ZOOM, Math.min(raw, MAX_ZOOM));
}

/**
 * Returns the tile size in pixels for standard 256px tiles.
 */
export function getTileSize(): number {
  return TILE_SIZE;
}
