import {
  latLonToTile,
  tileToBoundingBox,
  calculateRequiredTiles,
  isInViewport,
  distanceFromViewportCenter,
  prioritizeTiles,
  calculateViewportFromRegion,
  getTileKey,
  parseTileKey,
  estimateTileCount,
  TileCoordinate,
  MapViewport,
} from '../viewportUtils';
import { GeoPoint } from '../../types/user';

describe('viewportUtils', () => {
  describe('latLonToTile', () => {
    it('should convert lat/lon to tile coordinates', () => {
      // Eugene, Oregon South Hills
      const tile = latLonToTile(44.0462, -123.0236, 15);

      expect(tile.zoom).toBe(15);
      expect(tile.x).toBeGreaterThan(0);
      expect(tile.y).toBeGreaterThan(0);
    });

    it('should produce consistent results for same location', () => {
      const tile1 = latLonToTile(44.0462, -123.0236, 15);
      const tile2 = latLonToTile(44.0462, -123.0236, 15);

      expect(tile1).toEqual(tile2);
    });

    it('should produce different tiles for different locations', () => {
      const tile1 = latLonToTile(44.0462, -123.0236, 15);
      const tile2 = latLonToTile(45.5231, -122.6765, 15); // Portland, OR

      expect(tile1.x).not.toBe(tile2.x);
      expect(tile1.y).not.toBe(tile2.y);
    });
  });

  describe('tileToBoundingBox', () => {
    it('should convert tile to bounding box', () => {
      const tile: TileCoordinate = { x: 5242, y: 11493, zoom: 15 };
      const bbox = tileToBoundingBox(tile);

      expect(bbox.north).toBeGreaterThan(bbox.south);
      expect(bbox.east).toBeGreaterThan(bbox.west);
      expect(bbox.north).toBeLessThan(90);
      expect(bbox.south).toBeGreaterThan(-90);
      expect(bbox.east).toBeLessThan(180);
      expect(bbox.west).toBeGreaterThan(-180);
    });

    it('should produce consistent bounding boxes', () => {
      const tile: TileCoordinate = { x: 100, y: 200, zoom: 15 };
      const bbox1 = tileToBoundingBox(tile);
      const bbox2 = tileToBoundingBox(tile);

      expect(bbox1).toEqual(bbox2);
    });
  });

  describe('calculateRequiredTiles', () => {
    it('should calculate tiles for a viewport', () => {
      const viewport: MapViewport = {
        center: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
        widthMeters: 500,
        heightMeters: 500,
        boundingBox: { north: 44.05, south: 44.04, east: -123.02, west: -123.03 },
      };

      const tiles = calculateRequiredTiles(viewport, 15);

      expect(tiles.length).toBeGreaterThan(0);
      expect(tiles[0]?.zoom).toBe(15);
    });

    it('should include buffer tiles', () => {
      const viewport: MapViewport = {
        center: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
        widthMeters: 256, // Exactly 1 tile wide
        heightMeters: 256, // Exactly 1 tile tall
        boundingBox: { north: 44.05, south: 44.04, east: -123.02, west: -123.03 },
      };

      const tiles = calculateRequiredTiles(viewport, 15);

      // Should have center tile (1) + buffer tiles around it
      // With BUFFER_TILES = 1, we expect at least 9 tiles (3x3 grid)
      expect(tiles.length).toBeGreaterThanOrEqual(9);
    });

    it('should scale with viewport size', () => {
      const smallViewport: MapViewport = {
        center: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
        widthMeters: 256,
        heightMeters: 256,
        boundingBox: { north: 44.05, south: 44.04, east: -123.02, west: -123.03 },
      };

      const largeViewport: MapViewport = {
        center: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
        widthMeters: 1024,
        heightMeters: 1024,
        boundingBox: { north: 44.06, south: 44.03, east: -123.01, west: -123.04 },
      };

      const smallTiles = calculateRequiredTiles(smallViewport, 15);
      const largeTiles = calculateRequiredTiles(largeViewport, 15);

      expect(largeTiles.length).toBeGreaterThan(smallTiles.length);
    });
  });

  describe('isInViewport', () => {
    const viewport: MapViewport = {
      center: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
      widthMeters: 500,
      heightMeters: 500,
      boundingBox: { north: 44.05, south: 44.04, east: -123.02, west: -123.03 },
    };

    it('should identify tile at center as visible', () => {
      const centerTile = latLonToTile(viewport.center.latitude, viewport.center.longitude, 15);
      const visible = isInViewport(centerTile, viewport);

      expect(visible).toBe(true);
    });

    it('should identify far-away tile as not visible', () => {
      const farTile: TileCoordinate = {
        x: 0,
        y: 0,
        zoom: 15,
      };

      const visible = isInViewport(farTile, viewport);
      expect(visible).toBe(false);
    });
  });

  describe('distanceFromViewportCenter', () => {
    const viewport: MapViewport = {
      center: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
      widthMeters: 500,
      heightMeters: 500,
      boundingBox: { north: 44.05, south: 44.04, east: -123.02, west: -123.03 },
    };

    it('should return 0 for center tile', () => {
      const centerTile = latLonToTile(viewport.center.latitude, viewport.center.longitude, 15);
      const distance = distanceFromViewportCenter(centerTile, viewport);

      expect(distance).toBe(0);
    });

    it('should return positive distance for offset tile', () => {
      const centerTile = latLonToTile(viewport.center.latitude, viewport.center.longitude, 15);
      const offsetTile: TileCoordinate = {
        x: centerTile.x + 5,
        y: centerTile.y + 5,
        zoom: 15,
      };

      const distance = distanceFromViewportCenter(offsetTile, viewport);
      expect(distance).toBeGreaterThan(0);
    });

    it('should increase with distance from center', () => {
      const centerTile = latLonToTile(viewport.center.latitude, viewport.center.longitude, 15);

      const nearTile: TileCoordinate = { x: centerTile.x + 1, y: centerTile.y + 1, zoom: 15 };
      const farTile: TileCoordinate = { x: centerTile.x + 10, y: centerTile.y + 10, zoom: 15 };

      const nearDistance = distanceFromViewportCenter(nearTile, viewport);
      const farDistance = distanceFromViewportCenter(farTile, viewport);

      expect(farDistance).toBeGreaterThan(nearDistance);
    });
  });

  describe('prioritizeTiles', () => {
    const viewport: MapViewport = {
      center: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
      widthMeters: 500,
      heightMeters: 500,
      boundingBox: { north: 44.05, south: 44.04, east: -123.02, west: -123.03 },
    };

    it('should prioritize visible tiles', () => {
      const tiles = calculateRequiredTiles(viewport, 15);
      const prioritized = prioritizeTiles(tiles, viewport);

      // At least some tiles should have priority 100 (visible)
      const visibleTiles = prioritized.filter((t) => t.priority === 100);
      expect(visibleTiles.length).toBeGreaterThan(0);
    });

    it('should give lower priority to buffer tiles', () => {
      const tiles = calculateRequiredTiles(viewport, 15);
      const prioritized = prioritizeTiles(tiles, viewport);

      // Buffer tiles should have priority < 100
      const bufferTiles = prioritized.filter((t) => t.priority < 100);
      expect(bufferTiles.length).toBeGreaterThan(0);
    });

    it('should return priority between 0 and 100', () => {
      const tiles = calculateRequiredTiles(viewport, 15);
      const prioritized = prioritizeTiles(tiles, viewport);

      prioritized.forEach((tile) => {
        expect(tile.priority).toBeGreaterThanOrEqual(0);
        expect(tile.priority).toBeLessThanOrEqual(100);
      });
    });
  });

  describe('calculateViewportFromRegion', () => {
    it('should calculate viewport from region', () => {
      const center: GeoPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
      };

      const viewport = calculateViewportFromRegion(center, 0.01, 0.01);

      expect(viewport.center).toEqual(center);
      expect(viewport.widthMeters).toBeGreaterThan(0);
      expect(viewport.heightMeters).toBeGreaterThan(0);
      expect(viewport.boundingBox.north).toBeGreaterThan(viewport.boundingBox.south);
      expect(viewport.boundingBox.east).toBeGreaterThan(viewport.boundingBox.west);
    });

    it('should produce larger viewports for larger deltas', () => {
      const center: GeoPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
      };

      const small = calculateViewportFromRegion(center, 0.005, 0.005);
      const large = calculateViewportFromRegion(center, 0.02, 0.02);

      expect(large.widthMeters).toBeGreaterThan(small.widthMeters);
      expect(large.heightMeters).toBeGreaterThan(small.heightMeters);
    });
  });

  describe('getTileKey and parseTileKey', () => {
    it('should generate unique keys for tiles', () => {
      const tile1: TileCoordinate = { x: 100, y: 200, zoom: 15 };
      const tile2: TileCoordinate = { x: 101, y: 200, zoom: 15 };

      const key1 = getTileKey(tile1);
      const key2 = getTileKey(tile2);

      expect(key1).not.toBe(key2);
    });

    it('should parse tile key back to coordinate', () => {
      const tile: TileCoordinate = { x: 100, y: 200, zoom: 15 };
      const key = getTileKey(tile);
      const parsed = parseTileKey(key);

      expect(parsed).toEqual(tile);
    });

    it('should handle invalid keys gracefully', () => {
      expect(parseTileKey('invalid')).toBeNull();
      expect(parseTileKey('15/abc/200')).toBeNull();
      expect(parseTileKey('')).toBeNull();
    });

    it('should round-trip tile coordinates', () => {
      const tiles: TileCoordinate[] = [
        { x: 0, y: 0, zoom: 15 },
        { x: 12345, y: 67890, zoom: 15 },
        { x: 999, y: 888, zoom: 10 },
      ];

      tiles.forEach((tile) => {
        const key = getTileKey(tile);
        const parsed = parseTileKey(key);
        expect(parsed).toEqual(tile);
      });
    });
  });

  describe('estimateTileCount', () => {
    it('should estimate tile count for viewport', () => {
      const viewport: MapViewport = {
        center: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
        widthMeters: 500,
        heightMeters: 500,
        boundingBox: { north: 44.05, south: 44.04, east: -123.02, west: -123.03 },
      };

      const count = estimateTileCount(viewport, 15);
      expect(count).toBeGreaterThan(0);
    });

    it('should match actual tile count', () => {
      const viewport: MapViewport = {
        center: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
        widthMeters: 500,
        heightMeters: 500,
        boundingBox: { north: 44.05, south: 44.04, east: -123.02, west: -123.03 },
      };

      const estimated = estimateTileCount(viewport, 15);
      const actual = calculateRequiredTiles(viewport, 15).length;

      expect(estimated).toBe(actual);
    });
  });
});
