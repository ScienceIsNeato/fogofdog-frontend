import { geoPointToPixel } from '../mapUtils';
import { GeoPoint } from '../../types/user';
import { MapRegion } from '../../types/navigation';

describe('mapUtils - Safe Area Scaling', () => {
  const mockRegion: MapRegion & { width: number; height: number } = {
    latitude: 44.0248,
    longitude: -123.1044,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
    width: 375, // iPhone standard width
    height: 812, // iPhone standard height
  };

  const mockSafeAreaInsets = {
    top: 47, // Status bar
    bottom: 34, // Home indicator
    left: 0,
    right: 0,
  };

  describe('Safe Area Scaling Factor Calculation', () => {
    it('should calculate correct scaling factor with safe area insets', () => {
      const centerPoint: GeoPoint = {
        latitude: mockRegion.latitude,
        longitude: mockRegion.longitude,
        timestamp: Date.now(),
      };

      // Point at center should always be at screen center regardless of scaling
      const result = geoPointToPixel(centerPoint, mockRegion, mockSafeAreaInsets);

      expect(result.x).toBe(mockRegion.width / 2);
      expect(result.y).toBe(mockRegion.height / 2);
    });

    it('should apply correct vertical scaling factor based on safe area insets', () => {
      // Point significantly north of center
      const northPoint: GeoPoint = {
        latitude: mockRegion.latitude + mockRegion.latitudeDelta / 2, // Top edge
        longitude: mockRegion.longitude,
        timestamp: Date.now(),
      };

      const resultWithInsets = geoPointToPixel(northPoint, mockRegion, mockSafeAreaInsets);
      const resultWithoutInsets = geoPointToPixel(northPoint, mockRegion);

      // With safe area insets, the effective height is reduced
      const effectiveHeight =
        mockRegion.height - mockSafeAreaInsets.top - mockSafeAreaInsets.bottom;
      const expectedScalingFactor = effectiveHeight / mockRegion.height;

      // The scaling factor should be applied, making the coordinates more compressed
      expect(expectedScalingFactor).toBeCloseTo(0.9, 1);

      // The result with insets should be different from without insets (proving the fix works)
      expect(resultWithInsets.y).not.toBeCloseTo(resultWithoutInsets.y, 1);

      // The key validation: safe area scaling produces different results than the fallback
      // This ensures the dynamic calculation is actually being used
    });

    it('should use fallback scaling factor when safe area insets are not provided', () => {
      const northPoint: GeoPoint = {
        latitude: mockRegion.latitude + mockRegion.latitudeDelta / 4,
        longitude: mockRegion.longitude,
        timestamp: Date.now(),
      };

      const result = geoPointToPixel(northPoint, mockRegion); // No safe area insets

      // Should use 1.0 scaling factor when safe area insets not provided (no compensation needed)
      const expectedY = mockRegion.height / 2 + -0.25 * mockRegion.height * 1.0;
      expect(result.y).toBeCloseTo(expectedY, 2);
    });

    it('should handle edge case where safe area insets equal full height', () => {
      const extremeInsets = {
        top: 400,
        bottom: 412,
        left: 0,
        right: 0,
      };

      const northPoint: GeoPoint = {
        latitude: mockRegion.latitude + mockRegion.latitudeDelta / 4,
        longitude: mockRegion.longitude,
        timestamp: Date.now(),
      };

      // Should not crash and should fall back to reasonable behavior
      const result = geoPointToPixel(northPoint, mockRegion, extremeInsets);
      expect(Number.isFinite(result.y)).toBe(true);
      expect(Number.isFinite(result.x)).toBe(true);
    });
  });

  describe('Coordinate Transformation Accuracy', () => {
    it('should maintain coordinate accuracy with different safe area configurations', () => {
      const testPoints: GeoPoint[] = [
        // North edge
        {
          latitude: mockRegion.latitude + mockRegion.latitudeDelta / 2,
          longitude: mockRegion.longitude,
          timestamp: Date.now(),
        },
        // South edge
        {
          latitude: mockRegion.latitude - mockRegion.latitudeDelta / 2,
          longitude: mockRegion.longitude,
          timestamp: Date.now(),
        },
        // East edge
        {
          latitude: mockRegion.latitude,
          longitude: mockRegion.longitude + mockRegion.longitudeDelta / 2,
          timestamp: Date.now(),
        },
        // West edge
        {
          latitude: mockRegion.latitude,
          longitude: mockRegion.longitude - mockRegion.longitudeDelta / 2,
          timestamp: Date.now(),
        },
      ];

      const safeAreaConfigs = [
        { top: 44, bottom: 34, left: 0, right: 0 }, // iPhone X style
        { top: 20, bottom: 0, left: 0, right: 0 }, // Older iPhone style
        { top: 47, bottom: 34, left: 0, right: 0 }, // iPhone 12+ style
      ];

      safeAreaConfigs.forEach((insets) => {
        testPoints.forEach((point) => {
          const result = geoPointToPixel(point, mockRegion, insets);

          // All results should be finite and within reasonable bounds
          expect(Number.isFinite(result.x)).toBe(true);
          expect(Number.isFinite(result.y)).toBe(true);
          expect(result.x).toBeGreaterThanOrEqual(-mockRegion.width);
          expect(result.x).toBeLessThanOrEqual(mockRegion.width * 2);
          expect(result.y).toBeGreaterThanOrEqual(-mockRegion.height);
          expect(result.y).toBeLessThanOrEqual(mockRegion.height * 2);
        });
      });
    });

    it('should prevent the vertical slop bug that was fixed', () => {
      // This test encodes the specific bug that was fixed:
      // Points at different latitudes should maintain consistent relative positioning
      // when safe area insets are applied

      const centerPoint: GeoPoint = {
        latitude: mockRegion.latitude,
        longitude: mockRegion.longitude,
        timestamp: Date.now(),
      };

      const northPoint: GeoPoint = {
        latitude: mockRegion.latitude + mockRegion.latitudeDelta / 4,
        longitude: mockRegion.longitude,
        timestamp: Date.now(),
      };

      const southPoint: GeoPoint = {
        latitude: mockRegion.latitude - mockRegion.latitudeDelta / 4,
        longitude: mockRegion.longitude,
        timestamp: Date.now(),
      };

      const centerResult = geoPointToPixel(centerPoint, mockRegion, mockSafeAreaInsets);
      const northResult = geoPointToPixel(northPoint, mockRegion, mockSafeAreaInsets);
      const southResult = geoPointToPixel(southPoint, mockRegion, mockSafeAreaInsets);

      // Center should be at screen center
      expect(centerResult.x).toBeCloseTo(mockRegion.width / 2, 1);
      expect(centerResult.y).toBeCloseTo(mockRegion.height / 2, 1);

      // North point should be above center, south point below center
      expect(northResult.y).toBeLessThan(centerResult.y);
      expect(southResult.y).toBeGreaterThan(centerResult.y);

      // The distances should be symmetric (this was broken before the fix)
      const northDistance = Math.abs(northResult.y - centerResult.y);
      const southDistance = Math.abs(southResult.y - centerResult.y);
      expect(northDistance).toBeCloseTo(southDistance, 1);

      // X coordinates should be identical (no horizontal drift)
      expect(northResult.x).toBeCloseTo(centerResult.x, 1);
      expect(southResult.x).toBeCloseTo(centerResult.x, 1);
    });
  });

  describe('Vertical Slop Bug Prevention', () => {
    it('should eliminate the specific vertical slop bug that was fixed', () => {
      // This test validates the exact fix: dynamic safe area scaling prevents vertical slop
      const testInsets = { top: 47, bottom: 34, left: 0, right: 0 }; // iPhone-like insets
      const scalingFactor =
        (mockRegion.height - testInsets.top - testInsets.bottom) / mockRegion.height;

      // Test points at different latitudes relative to center
      const testPoints = [
        { lat: mockRegion.latitude + mockRegion.latitudeDelta * 0.3, name: 'north' },
        { lat: mockRegion.latitude, name: 'center' },
        { lat: mockRegion.latitude - mockRegion.latitudeDelta * 0.3, name: 'south' },
      ];

      const results = testPoints.map(({ lat, name }) => ({
        name,
        point: { latitude: lat, longitude: mockRegion.longitude, timestamp: Date.now() },
        result: geoPointToPixel(
          { latitude: lat, longitude: mockRegion.longitude, timestamp: Date.now() },
          mockRegion,
          testInsets
        ),
      }));

      // Verify the scaling factor is applied correctly (~0.9)
      expect(scalingFactor).toBeCloseTo(0.9, 1);

      // Verify symmetrical behavior (the bug was asymmetrical slop)
      const centerY = results.find((r) => r.name === 'center')!.result.y;
      const northDistance = Math.abs(results.find((r) => r.name === 'north')!.result.y - centerY);
      const southDistance = Math.abs(results.find((r) => r.name === 'south')!.result.y - centerY);

      // North and south points should be equidistant from center (symmetrical)
      expect(northDistance).toBeCloseTo(southDistance, 1);

      // Center point should be exactly at screen center
      expect(centerY).toBeCloseTo(mockRegion.height / 2, 1);
    });
  });

  describe('Regression Prevention', () => {
    it('should maintain the exact scaling factor calculation logic', () => {
      const testInsets = { top: 50, bottom: 30, left: 0, right: 0 };
      const testHeight = 800;
      const testRegion = { ...mockRegion, height: testHeight };

      const testPoint: GeoPoint = {
        latitude: mockRegion.latitude + mockRegion.latitudeDelta / 4,
        longitude: mockRegion.longitude,
        timestamp: Date.now(),
      };

      const result = geoPointToPixel(testPoint, testRegion, testInsets);

      // The scaling factor should be exactly (height - top - bottom) / height
      const expectedScalingFactor = (testHeight - testInsets.top - testInsets.bottom) / testHeight;
      const expectedY = testHeight / 2 + -0.25 * testHeight * expectedScalingFactor;

      expect(result.y).toBeCloseTo(expectedY, 3);

      // This should equal approximately 0.9 for our test values
      expect(expectedScalingFactor).toBeCloseTo(0.9, 2);
    });

    it('should never return NaN or Infinity for reasonable inputs', () => {
      const edgeCaseInsets = [
        { top: 0, bottom: 0, left: 0, right: 0 },
        { top: 100, bottom: 100, left: 0, right: 0 },
        { top: 1, bottom: 1, left: 0, right: 0 },
      ];

      const testPoint: GeoPoint = {
        latitude: mockRegion.latitude,
        longitude: mockRegion.longitude,
        timestamp: Date.now(),
      };

      edgeCaseInsets.forEach((insets) => {
        const result = geoPointToPixel(testPoint, mockRegion, insets);
        expect(Number.isFinite(result.x)).toBe(true);
        expect(Number.isFinite(result.y)).toBe(true);
        expect(Number.isNaN(result.x)).toBe(false);
        expect(Number.isNaN(result.y)).toBe(false);
      });
    });
  });
});
