import { BoundingBox } from '../types/street';
import { GeoPoint } from '../types/user';

/**
 * Viewport-based tile system utilities for efficient street data loading
 * Based on STREET_DATA_INTEGRATION_PLAN_V2.md
 */

// Tile system constants
const TILE_SIZE_METERS = 256; // 256m × 256m tiles (2-3 city blocks)
const BUFFER_TILES = 1; // Load 1 tile beyond visible viewport for smooth panning
const EARTH_RADIUS_METERS = 6371000; // Earth radius in meters

/**
 * Tile coordinate in the tile grid system
 */
export interface TileCoordinate {
  x: number; // Longitude tile index
  y: number; // Latitude tile index
  zoom: number; // Tile zoom level (fixed at 15 for now)
}

/**
 * Tile state in the loading lifecycle
 */
export enum TileState {
  NOT_LOADED = 'not_loaded',
  QUEUED = 'queued',
  LOADING = 'loading',
  LOADED = 'loaded',
  ERROR = 'error',
  EXPIRED = 'expired',
}

/**
 * Tile with metadata for loading and caching
 */
export interface Tile {
  coordinate: TileCoordinate;
  boundingBox: BoundingBox;
  state: TileState;
  loadedAt?: number; // Timestamp when loaded
  expiresAt?: number; // TTL-based expiration timestamp
  priority: number; // Priority for download queue (0-100, higher = more urgent)
  errorMessage?: string; // Error message if state is ERROR
  retryCount?: number; // Number of retry attempts
}

/**
 * Map viewport information
 */
export interface MapViewport {
  center: GeoPoint;
  widthMeters: number; // Viewport width in meters
  heightMeters: number; // Viewport height in meters
  boundingBox: BoundingBox;
}

/**
 * Convert latitude/longitude to tile coordinate
 * Uses Web Mercator projection (EPSG:3857)
 */
export function latLonToTile(lat: number, lon: number, zoom = 15): TileCoordinate {
  // Convert to tile coordinates using Web Mercator
  const n = Math.pow(2, zoom);
  const x = Math.floor(((lon + 180) / 360) * n);
  const latRad = (lat * Math.PI) / 180;
  const y = Math.floor(((1 - Math.log(Math.tan(latRad) + 1 / Math.cos(latRad)) / Math.PI) / 2) * n);

  return { x, y, zoom };
}

/**
 * Convert tile coordinate to bounding box
 */
export function tileToBoundingBox(tile: TileCoordinate): BoundingBox {
  const n = Math.pow(2, tile.zoom);

  // Convert tile boundaries to lat/lon
  const west = (tile.x / n) * 360 - 180;
  const east = ((tile.x + 1) / n) * 360 - 180;

  const northLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * tile.y) / n)));
  const southLatRad = Math.atan(Math.sinh(Math.PI * (1 - (2 * (tile.y + 1)) / n)));

  const north = (northLatRad * 180) / Math.PI;
  const south = (southLatRad * 180) / Math.PI;

  return { north, south, east, west };
}

/**
 * Calculate required tiles for a viewport with buffer zone
 */
export function calculateRequiredTiles(viewport: MapViewport, zoom = 15): TileCoordinate[] {
  const centerTile = latLonToTile(viewport.center.latitude, viewport.center.longitude, zoom);

  // Calculate how many tiles are needed to cover viewport
  const viewportWidthTiles = Math.ceil(viewport.widthMeters / TILE_SIZE_METERS);
  const viewportHeightTiles = Math.ceil(viewport.heightMeters / TILE_SIZE_METERS);

  const tiles: TileCoordinate[] = [];

  // Include buffer tiles around viewport for smooth panning
  const startX = centerTile.x - Math.floor(viewportWidthTiles / 2) - BUFFER_TILES;
  const endX = centerTile.x + Math.ceil(viewportWidthTiles / 2) + BUFFER_TILES;
  const startY = centerTile.y - Math.floor(viewportHeightTiles / 2) - BUFFER_TILES;
  const endY = centerTile.y + Math.ceil(viewportHeightTiles / 2) + BUFFER_TILES;

  for (let x = startX; x <= endX; x++) {
    for (let y = startY; y <= endY; y++) {
      tiles.push({ x, y, zoom });
    }
  }

  return tiles;
}

/**
 * Check if a tile coordinate is within the visible viewport (no buffer)
 */
export function isInViewport(tile: TileCoordinate, viewport: MapViewport): boolean {
  const tileBbox = tileToBoundingBox(tile);
  const vpBbox = viewport.boundingBox;

  // Check if tile overlaps with viewport
  return !(
    tileBbox.east < vpBbox.west ||
    tileBbox.west > vpBbox.east ||
    tileBbox.north < vpBbox.south ||
    tileBbox.south > vpBbox.north
  );
}

/**
 * Calculate distance from tile center to viewport center (in tile units)
 */
export function distanceFromViewportCenter(tile: TileCoordinate, viewport: MapViewport): number {
  const centerTile = latLonToTile(viewport.center.latitude, viewport.center.longitude, tile.zoom);

  const dx = tile.x - centerTile.x;
  const dy = tile.y - centerTile.y;

  return Math.sqrt(dx * dx + dy * dy);
}

/**
 * Prioritize tiles for loading
 * Visible tiles get priority 100, buffer tiles get priority based on distance
 */
export function prioritizeTiles(
  tiles: TileCoordinate[],
  viewport: MapViewport
): Omit<Tile, 'state' | 'loadedAt' | 'expiresAt'>[] {
  return tiles.map((coord) => {
    const visible = isInViewport(coord, viewport);
    const distance = distanceFromViewportCenter(coord, viewport);

    return {
      coordinate: coord,
      boundingBox: tileToBoundingBox(coord),
      priority: visible ? 100 : Math.max(0, 50 - Math.floor(distance * 10)),
    };
  });
}

/**
 * Calculate viewport from map region
 * Approximates viewport size in meters using haversine formula
 */
export function calculateViewportFromRegion(
  center: GeoPoint,
  latitudeDelta: number,
  longitudeDelta: number
): MapViewport {
  // Calculate width in meters at the center latitude
  const latRad = (center.latitude * Math.PI) / 180;
  const widthMeters = longitudeDelta * EARTH_RADIUS_METERS * Math.cos(latRad) * (Math.PI / 180);

  // Calculate height in meters
  const heightMeters = latitudeDelta * EARTH_RADIUS_METERS * (Math.PI / 180);

  // Calculate bounding box
  const boundingBox: BoundingBox = {
    north: center.latitude + latitudeDelta / 2,
    south: center.latitude - latitudeDelta / 2,
    east: center.longitude + longitudeDelta / 2,
    west: center.longitude - longitudeDelta / 2,
  };

  return {
    center,
    widthMeters,
    heightMeters,
    boundingBox,
  };
}

/**
 * Get unique tile key for caching and deduplication
 */
export function getTileKey(tile: TileCoordinate): string {
  return `${tile.zoom}/${tile.x}/${tile.y}`;
}

/**
 * Parse tile key back to TileCoordinate
 */
export function parseTileKey(key: string): TileCoordinate | null {
  const parts = key.split('/');
  if (parts.length !== 3) return null;

  const zoom = parseInt(parts[0] || '0', 10);
  const x = parseInt(parts[1] || '0', 10);
  const y = parseInt(parts[2] || '0', 10);

  if (isNaN(zoom) || isNaN(x) || isNaN(y)) return null;

  return { zoom, x, y };
}

/**
 * Calculate the number of tiles that would be loaded for a viewport
 * Useful for capacity planning and debugging
 */
export function estimateTileCount(viewport: MapViewport, zoom = 15): number {
  const tiles = calculateRequiredTiles(viewport, zoom);
  return tiles.length;
}
