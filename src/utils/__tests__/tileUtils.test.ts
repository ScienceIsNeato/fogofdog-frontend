import {
  latLonToTile,
  tileToBounds,
  getVisibleTiles,
  tileToScreenRect,
  regionToZoom,
  getTileSize,
} from '../tileUtils';

describe('tileUtils', () => {
  describe('latLonToTile', () => {
    it('converts San Francisco coordinates at zoom 14', () => {
      // GPS injection test location
      const tile = latLonToTile(37.78825, -122.4324, 14);
      expect(tile.z).toBe(14);
      // Tile coordinates for SF area at zoom 14
      expect(tile.x).toBeGreaterThan(2610);
      expect(tile.x).toBeLessThan(2630);
      expect(tile.y).toBeGreaterThan(6320);
      expect(tile.y).toBeLessThan(6340);
    });

    it('returns integer tile coordinates', () => {
      const tile = latLonToTile(0, 0, 10);
      expect(Number.isInteger(tile.x)).toBe(true);
      expect(Number.isInteger(tile.y)).toBe(true);
      expect(Number.isInteger(tile.z)).toBe(true);
    });

    it('handles equator and prime meridian (0,0)', () => {
      const tile = latLonToTile(0, 0, 1);
      expect(tile.x).toBeGreaterThanOrEqual(0);
      expect(tile.y).toBeGreaterThanOrEqual(0);
    });

    it('clamps extreme coordinates to valid range', () => {
      const northPole = latLonToTile(85, 180, 5);
      const numTiles = Math.pow(2, 5);
      expect(northPole.x).toBeGreaterThanOrEqual(0);
      expect(northPole.x).toBeLessThan(numTiles);
      expect(northPole.y).toBeGreaterThanOrEqual(0);
      expect(northPole.y).toBeLessThan(numTiles);
    });

    it('rounds zoom level down', () => {
      const tile = latLonToTile(37.78825, -122.4324, 14.9);
      expect(tile.z).toBe(14);
    });
  });

  describe('tileToBounds', () => {
    it('returns bounding box with correct structure', () => {
      const bounds = tileToBounds(0, 0, 1);
      expect(bounds).toHaveProperty('north');
      expect(bounds).toHaveProperty('south');
      expect(bounds).toHaveProperty('east');
      expect(bounds).toHaveProperty('west');
    });

    it('north is greater than south', () => {
      const bounds = tileToBounds(5, 5, 4);
      expect(bounds.north).toBeGreaterThan(bounds.south);
    });

    it('east is greater than west', () => {
      const bounds = tileToBounds(5, 5, 4);
      expect(bounds.east).toBeGreaterThan(bounds.west);
    });

    it('round-trips with latLonToTile (center of tile)', () => {
      const z = 14;
      const { x, y } = latLonToTile(37.78825, -122.4324, z);
      const bounds = tileToBounds(x, y, z);
      // The original coordinates should be within the tile bounds
      expect(37.78825).toBeGreaterThan(bounds.south);
      expect(37.78825).toBeLessThan(bounds.north);
      expect(-122.4324).toBeGreaterThan(bounds.west);
      expect(-122.4324).toBeLessThan(bounds.east);
    });
  });

  describe('getVisibleTiles', () => {
    const sfRegion = {
      latitude: 37.78825,
      longitude: -122.4324,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
    };

    it('returns an array of tile coordinates', () => {
      const tiles = getVisibleTiles(sfRegion, 14);
      expect(Array.isArray(tiles)).toBe(true);
      expect(tiles.length).toBeGreaterThan(0);
    });

    it('all tiles have the correct zoom level', () => {
      const tiles = getVisibleTiles(sfRegion, 14);
      for (const tile of tiles) {
        expect(tile.z).toBe(14);
      }
    });

    it('returns more tiles at higher zoom levels', () => {
      const tilesZ14 = getVisibleTiles(sfRegion, 14);
      const tilesZ15 = getVisibleTiles(sfRegion, 15);
      expect(tilesZ15.length).toBeGreaterThanOrEqual(tilesZ14.length);
    });

    it('covers at least 1 tile', () => {
      const smallRegion = {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.001,
        longitudeDelta: 0.001,
      };
      const tiles = getVisibleTiles(smallRegion, 16);
      expect(tiles.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('tileToScreenRect', () => {
    const region = {
      latitude: 37.78825,
      longitude: -122.4324,
      latitudeDelta: 0.05,
      longitudeDelta: 0.05,
      width: 390,
      height: 844,
    };

    it('returns a rect with x, y, width, height', () => {
      const tile = latLonToTile(37.78825, -122.4324, 14);
      const rect = tileToScreenRect(tile, region);
      expect(rect).toHaveProperty('x');
      expect(rect).toHaveProperty('y');
      expect(rect).toHaveProperty('width');
      expect(rect).toHaveProperty('height');
    });

    it('width and height are positive', () => {
      const tile = latLonToTile(37.78825, -122.4324, 14);
      const rect = tileToScreenRect(tile, region);
      expect(rect.width).toBeGreaterThan(0);
      expect(rect.height).toBeGreaterThan(0);
    });
  });

  describe('regionToZoom', () => {
    it('returns integer zoom level', () => {
      const zoom = regionToZoom(0.0922);
      expect(Number.isInteger(zoom)).toBe(true);
    });

    it('returns higher zoom for smaller delta', () => {
      const zoomFar = regionToZoom(0.5);
      const zoomClose = regionToZoom(0.01);
      expect(zoomClose).toBeGreaterThan(zoomFar);
    });
  });

  describe('getTileSize', () => {
    it('returns 256', () => {
      expect(getTileSize()).toBe(256);
    });
  });
});
