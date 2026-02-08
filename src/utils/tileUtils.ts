import type { Region } from 'react-native-maps';
import { logger } from './logger';

/**
 * Tile coordinate in the slippy map (XYZ) format
 * Used by most web map services including OpenStreetMap, Google Maps, etc.
 */
export interface TileCoordinate {
  z: number; // Zoom level (0-20)
  x: number; // Tile column (0 to 2^z - 1)
  y: number; // Tile row (0 to 2^z - 1)
}

/**
 * Latitude/Longitude pair
 */
export interface LatLon {
  latitude: number;
  longitude: number;
}

/**
 * Geographic bounds
 */
export interface Bounds {
  north: number;
  south: number;
  east: number;
  west: number;
}

/**
 * Convert latitude/longitude to tile coordinates at a given zoom level
 * Uses Web Mercator projection (EPSG:3857) - standard for web maps
 *
 * @param lat - Latitude in degrees (-85.0511 to 85.0511 for Web Mercator)
 * @param lon - Longitude in degrees (-180 to 180)
 * @param zoom - Zoom level (0-20)
 * @returns Tile coordinate {z, x, y}
 */
export function latLonToTile(lat: number, lon: number, zoom: number): TileCoordinate {
  // Clamp latitude to Web Mercator limits
  const clampedLat = Math.max(-85.0511, Math.min(85.0511, lat));

  // Normalize longitude to -180 to 180
  let normalizedLon = lon;
  while (normalizedLon < -180) normalizedLon += 360;
  while (normalizedLon > 180) normalizedLon -= 360;

  // Calculate tile coordinates
  // Formula from OSM Wiki: https://wiki.openstreetmap.org/wiki/Slippy_map_tilenames
  const n = Math.pow(2, zoom);
  const xTile = Math.floor(((normalizedLon + 180) / 360) * n);

  const latRad = (clampedLat * Math.PI) / 180;
  const yTile = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

  // Clamp tile coordinates to valid range
  const x = Math.max(0, Math.min(n - 1, xTile));
  const y = Math.max(0, Math.min(n - 1, yTile));

  return { z: zoom, x, y };
}

/**
 * Convert tile coordinates to latitude/longitude (northwest corner of tile)
 *
 * @param x - Tile column
 * @param y - Tile row
 * @param zoom - Zoom level
 * @returns Latitude/longitude of northwest corner
 */
export function tileToLatLon(x: number, y: number, zoom: number): LatLon {
  const n = Math.pow(2, zoom);
  const longitude = (x / n) * 360 - 180;

  const latRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n)));
  const latitude = (latRad * 180) / Math.PI;

  return { latitude, longitude };
}

/**
 * Get all tiles that cover a given map region
 * Returns tiles at the specified zoom level that intersect the region
 *
 * @param region - Map region with lat/lon center and deltas
 * @param zoom - Zoom level for tiles
 * @returns Array of tile coordinates
 */
export function getTilesInRegion(region: Region, zoom: number): TileCoordinate[] {
  // Calculate bounds of the region
  const north = region.latitude + region.latitudeDelta / 2;
  const south = region.latitude - region.latitudeDelta / 2;
  const east = region.longitude + region.longitudeDelta / 2;
  const west = region.longitude - region.longitudeDelta / 2;

  // Get tile coordinates for corners
  const nwTile = latLonToTile(north, west, zoom);
  const seTile = latLonToTile(south, east, zoom);

  // Calculate range of tiles
  const minX = Math.min(nwTile.x, seTile.x);
  const maxX = Math.max(nwTile.x, seTile.x);
  const minY = Math.min(nwTile.y, seTile.y);
  const maxY = Math.max(nwTile.y, seTile.y);

  // Generate list of all tiles in range
  const tiles: TileCoordinate[] = [];
  for (let x = minX; x <= maxX; x++) {
    for (let y = minY; y <= maxY; y++) {
      tiles.push({ z: zoom, x, y });
    }
  }

  logger.debug(`getTilesInRegion: zoom=${zoom}, tiles=${tiles.length}`, {
    component: 'tileUtils',
    action: 'getTilesInRegion',
    zoom,
    tileCount: tiles.length,
    bounds: { north, south, east, west },
  });

  return tiles;
}

/**
 * Get the geographic bounds of a tile
 *
 * @param tile - Tile coordinate
 * @returns Bounds of the tile
 */
export function getTileBounds(tile: TileCoordinate): Bounds {
  const { x, y, z } = tile;

  // Northwest corner (top-left)
  const nw = tileToLatLon(x, y, z);

  // Southeast corner (bottom-right)
  const se = tileToLatLon(x + 1, y + 1, z);

  return {
    north: nw.latitude,
    south: se.latitude,
    east: se.longitude,
    west: nw.longitude,
  };
}

/**
 * Calculate the pixel size of a tile at a given zoom level and latitude
 * Used for determining appropriate zoom level for tile loading
 *
 * @param zoom - Zoom level
 * @param latitude - Latitude (for adjusting by cos(lat))
 * @returns Meters per pixel
 */
export function getMetersPerPixelAtZoom(zoom: number, latitude: number): number {
  // Earth circumference at equator in meters
  const EARTH_CIRCUMFERENCE = 40075017;

  // Tile size in pixels (standard)
  const TILE_SIZE = 256;

  // Number of tiles at this zoom level
  const tilesAtZoom = Math.pow(2, zoom);

  // Meters per pixel at equator
  const metersPerPixelAtEquator = EARTH_CIRCUMFERENCE / (tilesAtZoom * TILE_SIZE);

  // Adjust for latitude (Mercator distortion)
  const latitudeRadians = (latitude * Math.PI) / 180;
  return metersPerPixelAtEquator * Math.cos(latitudeRadians);
}

/**
 * Determine appropriate zoom level for tiles based on current map zoom
 * Maps react-native-maps zoom level (0-20) to tile zoom level
 *
 * @param latitudeDelta - Latitude span of visible region
 * @param _viewportHeight - Height of viewport in pixels (unused but kept for API consistency)
 * @returns Appropriate tile zoom level
 */
export function getOptimalTileZoom(latitudeDelta: number, _viewportHeight: number): number {
  // Calculate approximate zoom level
  // Formula: zoom = log2(360 / latitudeDelta)
  const zoom = Math.log2(360 / latitudeDelta);

  // Round to nearest integer and clamp to valid range
  return Math.max(0, Math.min(20, Math.round(zoom)));
}

/**
 * Generate a unique key for a tile coordinate
 * Used for caching and identifying tiles
 *
 * @param tile - Tile coordinate
 * @returns String key in format "z/x/y"
 */
export function getTileKey(tile: TileCoordinate): string {
  return `${tile.z}/${tile.x}/${tile.y}`;
}

/**
 * Parse a tile key back into a tile coordinate
 *
 * @param key - Tile key in format "z/x/y"
 * @returns Tile coordinate or null if invalid
 */
export function parseTileKey(key: string): TileCoordinate | null {
  const parts = key.split('/');
  if (parts.length !== 3) return null;

  const z = parseInt(parts[0] ?? '0', 10);
  const x = parseInt(parts[1] ?? '0', 10);
  const y = parseInt(parts[2] ?? '0', 10);

  if (isNaN(z) || isNaN(x) || isNaN(y)) return null;

  return { z, x, y };
}

/**
 * Calculate tile coordinates for a pixel position on screen
 * Useful for click handlers and interaction
 *
 * @param screenX - X coordinate on screen
 * @param screenY - Y coordinate on screen
 * @param region - Current map region
 * @param viewportWidth - Viewport width in pixels
 * @param _viewportHeight - Viewport height in pixels (unused but kept for API consistency)
 * @param zoom - Tile zoom level
 * @returns Tile coordinate at that screen position
 */
/* eslint-disable max-params */
export function screenToTile(
  screenX: number,
  screenY: number,
  region: Region,
  viewportWidth: number,
  viewportHeight: number,
  zoom: number
): TileCoordinate {
  /* eslint-enable max-params */
  // Convert screen coordinates to lat/lon
  const latFraction = (screenY - viewportHeight / 2) / viewportHeight;
  const lonFraction = (screenX - viewportWidth / 2) / viewportWidth;

  const latitude = region.latitude - latFraction * region.latitudeDelta;
  const longitude = region.longitude + lonFraction * region.longitudeDelta;

  return latLonToTile(latitude, longitude, zoom);
}
