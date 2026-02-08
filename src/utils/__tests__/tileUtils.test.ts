import {
  latLonToTile,
  tileToLatLon,
  getTilesInRegion,
  getTileBounds,
  getOptimalTileZoom,
  getTileKey,
  parseTileKey,
  TileCoordinate,
} from '../tileUtils';
import type { Region } from 'react-native-maps';

describe('tileUtils', () => {
  describe('latLonToTile', () => {
    it('should convert Dolores Park SF to correct tile at zoom 14', () => {
      const lat = 37.7599;
      const lon = -122.4271;
      const zoom = 14;
      const tile = latLonToTile(lat, lon, zoom);

      expect(tile.z).toBe(14);
      // Actual result is 2620, not 2621 - tile calculation is correct
      expect(tile.x).toBe(2620);
      expect(tile.y).toBe(6333);
    });

    it('should convert equator/prime meridian to tile 0,0 at zoom 0', () => {
      const tile = latLonToTile(0, 0, 0);
      expect(tile).toEqual({ z: 0, x: 0, y: 0 });
    });

    it('should handle maximum latitude (Web Mercator limit)', () => {
      const tile = latLonToTile(85.0511, 0, 10);
      expect(tile.z).toBe(10);
      expect(tile.y).toBe(0); // North pole maps to y=0
    });

    it('should handle minimum latitude (Web Mercator limit)', () => {
      const tile = latLonToTile(-85.0511, 0, 10);
      expect(tile.z).toBe(10);
      const maxTile = Math.pow(2, 10) - 1;
      expect(tile.y).toBe(maxTile); // South pole maps to max y
    });

    it('should clamp latitude beyond Web Mercator limits', () => {
      const tileAbove = latLonToTile(90, 0, 10);
      const tileBelow = latLonToTile(-90, 0, 10);

      // Should be clamped to Web Mercator limits
      expect(tileAbove.y).toBe(0);
      expect(tileBelow.y).toBe(Math.pow(2, 10) - 1);
    });

    it('should normalize longitude wrapping', () => {
      const tile1 = latLonToTile(0, 180, 5);
      const tile2 = latLonToTile(0, -180, 5);

      // Longitude 180 and -180 should map to edge tiles
      expect(tile1.x).toBe(Math.pow(2, 5) - 1);
      expect(tile2.x).toBe(0);
    });

    it('should handle different zoom levels consistently', () => {
      const lat = 37.7599;
      const lon = -122.4271;

      const tile14 = latLonToTile(lat, lon, 14);
      const tile15 = latLonToTile(lat, lon, 15);

      // At zoom 15, tile coordinates should be approximately double zoom 14
      // Allow 1 tile difference due to rounding
      expect(Math.abs(tile15.x - tile14.x * 2)).toBeLessThanOrEqual(1);
      expect(Math.abs(tile15.y - tile14.y * 2)).toBeLessThanOrEqual(1);
    });
  });

  describe('tileToLatLon', () => {
    it('should convert tile back to lat/lon (northwest corner)', () => {
      const { latitude, longitude } = tileToLatLon(2621, 6333, 14);

      // Should be close to Dolores Park area
      expect(latitude).toBeCloseTo(37.76, 1);
      expect(longitude).toBeCloseTo(-122.43, 1);
    });

    it('should convert tile 0,0,0 to approximate center', () => {
      const { latitude, longitude } = tileToLatLon(0, 0, 0);
      expect(latitude).toBeCloseTo(85.0511, 1);
      expect(longitude).toBe(-180);
    });

    it('should have consistent round-trip conversion', () => {
      const lat = 37.7599;
      const lon = -122.4271;
      const zoom = 15;

      const tile = latLonToTile(lat, lon, zoom);
      const latLon = tileToLatLon(tile.x, tile.y, zoom);

      // After round-trip, should be within the same tile
      const tileRoundTrip = latLonToTile(latLon.latitude, latLon.longitude, zoom);
      expect(tileRoundTrip).toEqual(tile);
    });
  });

  describe('getTilesInRegion', () => {
    it('should return single tile for small region', () => {
      const region: Region = {
        latitude: 37.7599,
        longitude: -122.4271,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };

      const tiles = getTilesInRegion(region, 14);

      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles[0]?.z).toBe(14);
    });

    it('should return multiple tiles for larger region', () => {
      const region: Region = {
        latitude: 37.7599,
        longitude: -122.4271,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
      };

      const tiles = getTilesInRegion(region, 14);

      // Should cover multiple tiles
      expect(tiles.length).toBeGreaterThan(4);
    });

    it('should return more tiles at higher zoom levels', () => {
      const region: Region = {
        latitude: 37.7599,
        longitude: -122.4271,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

      const tilesZoom14 = getTilesInRegion(region, 14);
      const tilesZoom15 = getTilesInRegion(region, 15);

      // Higher zoom = more tiles for same geographic area
      expect(tilesZoom15.length).toBeGreaterThan(tilesZoom14.length);
    });

    it('should include all corner tiles', () => {
      const region: Region = {
        latitude: 37.7599,
        longitude: -122.4271,
        latitudeDelta: 0.05,
        longitudeDelta: 0.05,
      };

      const tiles = getTilesInRegion(region, 14);

      // Extract unique x and y coordinates
      const xCoords = Array.from(new Set(tiles.map(t => t.x)));
      const yCoords = Array.from(new Set(tiles.map(t => t.y)));

      // Should have at least 2 different x and y values
      expect(xCoords.length).toBeGreaterThanOrEqual(2);
      expect(yCoords.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('getTileBounds', () => {
    it('should return bounds for a tile', () => {
      const tile: TileCoordinate = { z: 14, x: 2621, y: 6333 };
      const bounds = getTileBounds(tile);

      expect(bounds.north).toBeGreaterThan(bounds.south);
      expect(bounds.east).toBeGreaterThan(bounds.west);

      // Dolores Park area
      expect(bounds.north).toBeCloseTo(37.76, 1);
      expect(bounds.west).toBeCloseTo(-122.43, 1);
    });

    it('should have consistent size at same zoom level', () => {
      const tile1 = getTileBounds({ z: 14, x: 100, y: 100 });
      const tile2 = getTileBounds({ z: 14, x: 200, y: 200 });

      const height1 = tile1.north - tile1.south;
      const height2 = tile2.north - tile2.south;

      // Heights should be roughly equal (allowing for Mercator distortion)
      expect(height1).toBeCloseTo(height2, 2);
    });
  });

  describe('getOptimalTileZoom', () => {
    it('should return reasonable zoom for typical map view', () => {
      const latitudeDelta = 0.1; // ~10km span
      const viewportHeight = 800;

      const zoom = getOptimalTileZoom(latitudeDelta, viewportHeight);

      expect(zoom).toBeGreaterThanOrEqual(0);
      expect(zoom).toBeLessThanOrEqual(20);
      // For latitudeDelta 0.1, optimal zoom is 12
      expect(zoom).toBe(12);
    });

    it('should return higher zoom for smaller delta', () => {
      const viewportHeight = 800;

      const zoomLarge = getOptimalTileZoom(0.5, viewportHeight);
      const zoomSmall = getOptimalTileZoom(0.05, viewportHeight);

      expect(zoomSmall).toBeGreaterThan(zoomLarge);
    });

    it('should clamp to valid range', () => {
      const viewportHeight = 800;

      const zoomVeryLarge = getOptimalTileZoom(360, viewportHeight); // World view
      const zoomVerySmall = getOptimalTileZoom(0.0001, viewportHeight); // Street view

      expect(zoomVeryLarge).toBeGreaterThanOrEqual(0);
      expect(zoomVerySmall).toBeLessThanOrEqual(20);
    });
  });

  describe('getTileKey', () => {
    it('should generate correct key format', () => {
      const tile: TileCoordinate = { z: 14, x: 2621, y: 6333 };
      const key = getTileKey(tile);

      expect(key).toBe('14/2621/6333');
    });

    it('should generate unique keys for different tiles', () => {
      const tile1 = getTileKey({ z: 14, x: 100, y: 200 });
      const tile2 = getTileKey({ z: 14, x: 100, y: 201 });
      const tile3 = getTileKey({ z: 15, x: 100, y: 200 });

      expect(tile1).not.toBe(tile2);
      expect(tile1).not.toBe(tile3);
      expect(tile2).not.toBe(tile3);
    });
  });

  describe('parseTileKey', () => {
    it('should parse valid tile key', () => {
      const key = '14/2621/6333';
      const tile = parseTileKey(key);

      expect(tile).toEqual({ z: 14, x: 2621, y: 6333 });
    });

    it('should return null for invalid format', () => {
      expect(parseTileKey('invalid')).toBeNull();
      expect(parseTileKey('14/2621')).toBeNull();
      expect(parseTileKey('14/2621/6333/extra')).toBeNull();
    });

    it('should return null for non-numeric values', () => {
      expect(parseTileKey('a/b/c')).toBeNull();
      expect(parseTileKey('14/abc/6333')).toBeNull();
    });

    it('should round-trip with getTileKey', () => {
      const original: TileCoordinate = { z: 14, x: 2621, y: 6333 };
      const key = getTileKey(original);
      const parsed = parseTileKey(key);

      expect(parsed).toEqual(original);
    });
  });
});
