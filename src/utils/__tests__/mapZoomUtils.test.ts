import {
  legendToLatitudeDelta,
  latitudeDeltaToLegend,
  legendValueToMeters,
  gaussianEasing,
  calculateZoomAnimation,
} from '../mapZoomUtils';

describe('mapZoomUtils', () => {
  describe('legendValueToMeters', () => {
    it('should convert legend strings to meters correctly', () => {
      expect(legendValueToMeters('50m')).toBe(50);
      expect(legendValueToMeters('2km')).toBe(2000);
      expect(legendValueToMeters('500m')).toBe(500);
    });

    it('should handle fallback parsing', () => {
      expect(legendValueToMeters('invalid')).toBe(50); // fallback
    });
  });

  describe('gaussianEasing', () => {
    it('should start at 0 and end at 1', () => {
      expect(gaussianEasing(0)).toBeCloseTo(0, 2);
      expect(gaussianEasing(1)).toBeCloseTo(1, 2);
    });

    it('should have smooth curve in middle', () => {
      const mid = gaussianEasing(0.5);
      expect(mid).toBeGreaterThan(0.3);
      expect(mid).toBeLessThan(0.7);
    });

    it('should clamp values to [0, 1]', () => {
      expect(gaussianEasing(-1)).toBe(0);
      expect(gaussianEasing(2)).toBe(1);
    });
  });

  describe('calculateZoomAnimation', () => {
    it('should calculate zoom from 2km to 50m', () => {
      const result = calculateZoomAnimation('2km', '50m', {
        latitude: 37.7749,
        longitude: -122.4194,
      });

      expect(result.startScale).toBe(2000);
      expect(result.endScale).toBe(50);
      expect(result.startRegion.latitudeDelta).toBeGreaterThan(result.endRegion.latitudeDelta);
      expect(result.startRegion.latitude).toBe(37.7749);
      expect(result.endRegion.latitude).toBe(37.7749);
    });
  });

  describe('legendToLatitudeDelta', () => {
    it('should convert legend scales to latitude deltas', () => {
      const delta2km = legendToLatitudeDelta('2km');
      const delta50m = legendToLatitudeDelta('50m');

      expect(delta2km).toBeGreaterThan(delta50m);
      expect(delta2km).toBeGreaterThan(0);
      expect(delta50m).toBeGreaterThan(0);
    });
  });

  describe('latitudeDeltaToLegend', () => {
    it('should convert latitude deltas to expected legend values', () => {
      // Large delta should give large scale
      const largeScale = latitudeDeltaToLegend(0.1);
      expect(largeScale).toBeGreaterThan(1000);

      // Small delta should give small scale
      const smallScale = latitudeDeltaToLegend(0.001);
      expect(smallScale).toBeLessThan(100);
    });
  });
});
