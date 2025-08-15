import { geoPointToPixel, calculateMetersPerPixel, metersToPixels } from '../../utils/mapUtils';

describe('mapUtils', () => {
  describe('geoPointToPixel', () => {
    it('should convert center point correctly', () => {
      const region = {
        latitude: 0,
        longitude: 0,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
        width: 300,
        height: 300,
      };

      const point = { latitude: 0, longitude: 0, timestamp: Date.now() };
      const result = geoPointToPixel(point, region);

      expect(result.x).toBeCloseTo(150, 0);
      expect(result.y).toBeCloseTo(150, 0);
    });

    it('should convert edge points correctly', () => {
      const region = {
        latitude: 40,
        longitude: -74,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
        width: 400,
        height: 500,
      };

      // North edge (with legacy fallback scaling factor applied to Y coordinates)
      const northPoint = { latitude: 40.05, longitude: -74, timestamp: Date.now() };
      const northResult = geoPointToPixel(northPoint, region);
      expect(northResult.x).toBeCloseTo(200, 0);
      expect(northResult.y).toBeCloseTo(27.5, 0); // 250 - (250 * 0.89) = 27.5

      // South edge (with legacy fallback scaling factor applied to Y coordinates)
      const southPoint = { latitude: 39.95, longitude: -74, timestamp: Date.now() };
      const southResult = geoPointToPixel(southPoint, region);
      expect(southResult.x).toBeCloseTo(200, 0);
      expect(southResult.y).toBeCloseTo(472.5, 0); // 250 + (250 * 0.89) = 472.5

      // East edge (no scaling applied to X coordinates)
      const eastPoint = { latitude: 40, longitude: -73.95, timestamp: Date.now() };
      const eastResult = geoPointToPixel(eastPoint, region);
      expect(eastResult.x).toBeCloseTo(400, 0);
      expect(eastResult.y).toBeCloseTo(250, 0);

      // West edge (no scaling applied to X coordinates)
      const westPoint = { latitude: 40, longitude: -74.05, timestamp: Date.now() };
      const westResult = geoPointToPixel(westPoint, region);
      expect(westResult.x).toBeCloseTo(0, 0);
      expect(westResult.y).toBeCloseTo(250, 0);
    });

    it('should handle non-zero center coordinates', () => {
      const region = {
        latitude: 51.5,
        longitude: -0.12,
        latitudeDelta: 0.02,
        longitudeDelta: 0.02,
        width: 400,
        height: 400,
      };

      // Testing a point west of center
      const westPoint = { latitude: 51.5, longitude: -0.125, timestamp: Date.now() };
      const westResult = geoPointToPixel(westPoint, region);
      expect(westResult.x).toBeCloseTo(100, 0); // Based on current implementation

      // Testing a point south of center (with legacy fallback scaling factor applied to Y coordinates)
      const southPoint = { latitude: 51.495, longitude: -0.12, timestamp: Date.now() };
      const southResult = geoPointToPixel(southPoint, region);
      expect(southResult.y).toBeCloseTo(289, 0); // 200 + (100 * 0.89) = 289
    });
  });

  describe('calculateMetersPerPixel', () => {
    it('should calculate correct meters per pixel at equator', () => {
      const region = {
        latitude: 0,
        longitude: 0,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
        width: 1000,
      };

      // At equator, 0.1 degrees is about 11,132 meters
      // So meters per pixel should be approximately 11,132 / 1000 = 11.132
      const result = calculateMetersPerPixel(region);

      expect(result).toBeCloseTo(11.132, 1);
    });

    it('should calculate lower meters per pixel at higher latitudes', () => {
      const equatorRegion = {
        latitude: 0,
        longitude: 0,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
        width: 1000,
      };

      const polarRegion = {
        latitude: 60, // Near polar region
        longitude: 0,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
        width: 1000,
      };

      const equatorMPP = calculateMetersPerPixel(equatorRegion);
      const polarMPP = calculateMetersPerPixel(polarRegion);

      // At higher latitudes, longitudinal distance decreases
      // So meters per pixel should be lower at 60° latitude
      expect(polarMPP).toBeLessThan(equatorMPP);
      expect(polarMPP).toBeCloseTo(equatorMPP * Math.cos((60 * Math.PI) / 180), 1);
    });
  });

  describe('metersToPixels', () => {
    it('should convert meters to pixels correctly', () => {
      const region = {
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
        width: 1000,
      };

      const meters = 100;
      const metersPerPixel = calculateMetersPerPixel(region);
      const expectedPixels = meters / metersPerPixel;

      const result = metersToPixels(meters, region);

      expect(result).toBeCloseTo(expectedPixels, 1);
    });

    // NEW TESTS: Error handling branches
    it('should handle invalid meters values', () => {
      // This test expects console warnings for invalid inputs
      (global as any).expectConsoleErrors = true;

      const region = {
        latitude: 37.7749,
        longitude: -122.4194,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
        width: 1000,
      };

      expect(metersToPixels(-100, region)).toBe(0);
      expect(metersToPixels(0, region)).toBe(0);
      expect(metersToPixels(NaN, region)).toBe(0);
      expect(metersToPixels(Infinity, region)).toBe(0);
    });

    it('should handle invalid region that results in invalid metersPerPixel', () => {
      // This test expects console warnings for invalid inputs
      (global as any).expectConsoleErrors = true;

      const invalidRegion = {
        latitude: NaN,
        longitude: 0,
        latitudeDelta: 0.1,
        longitudeDelta: 0.1,
        width: 1000,
      };

      // When calculateMetersPerPixel returns 1 (default), metersToPixels(100, region) = 100/1 = 100
      expect(metersToPixels(100, invalidRegion)).toBe(100);
    });
  });

  // NEW TESTS: Error handling for other functions
  describe('Error handling', () => {
    describe('geoPointToPixel error cases', () => {
      it('should handle invalid numeric values', () => {
        // This test expects console warnings for invalid inputs
        (global as any).expectConsoleErrors = true;

        const region = {
          latitude: NaN,
          longitude: Infinity,
          latitudeDelta: 0,
          longitudeDelta: 0.1,
          width: 300,
          height: 300,
        };
        const point = { latitude: NaN, longitude: -Infinity, timestamp: Date.now() };
        const result = geoPointToPixel(point, region);
        expect(result).toEqual({ x: 150, y: 150 }); // Fallback to center
      });
    });

    describe('calculateMetersPerPixel error cases', () => {
      it('should handle invalid numeric values', () => {
        // This test expects console warnings for invalid inputs
        (global as any).expectConsoleErrors = true;

        const invalidRegion = {
          latitude: NaN,
          longitude: 0,
          latitudeDelta: Infinity,
          longitudeDelta: 0.1,
          width: 0,
        };
        const result = calculateMetersPerPixel(invalidRegion);
        expect(result).toBe(1);
      });

      it('should handle zero width', () => {
        // This test expects console warnings for invalid inputs
        (global as any).expectConsoleErrors = true;

        const invalidRegion = {
          latitude: 37.7749,
          longitude: -122.4194,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
          width: 0,
        };
        const result = calculateMetersPerPixel(invalidRegion);
        expect(result).toBe(1);
      });
    });
  });
});
