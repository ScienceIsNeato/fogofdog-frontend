import {
  generatePerformanceTestData,
  TestPatterns,
  addGPSNoise,
} from '../performanceTestData';
import { GeoPoint, GPSPointWithAccuracy } from '../../types/user';

describe('performanceTestData', () => {
  describe('generatePerformanceTestData', () => {
    it('should generate single point', () => {
      const points = generatePerformanceTestData(1, TestPatterns.SINGLE_POINT, {
        applyNoise: false,
      });

      expect(points).toHaveLength(1);
      expect(points[0]).toBeDefined();
      expect(points[0]!).toHaveProperty('latitude');
      expect(points[0]!).toHaveProperty('longitude');
      expect(points[0]!).toHaveProperty('timestamp');
      expect(typeof points[0]!.latitude).toBe('number');
      expect(typeof points[0]!.longitude).toBe('number');
      expect(typeof points[0]!.timestamp).toBe('number');
    });

    it('should generate multiple points with random walk', () => {
      const points = generatePerformanceTestData(5, TestPatterns.RANDOM_WALK, {
        applyNoise: false,
      });

      expect(points).toHaveLength(5);
      points.forEach((point, index) => {
        expect(point).toHaveProperty('latitude');
        expect(point).toHaveProperty('longitude');
        expect(point).toHaveProperty('timestamp');

        // Timestamps should be in ascending order
        if (index > 0 && points[index - 1]) {
          expect(point.timestamp).toBeGreaterThan(points[index - 1]!.timestamp);
        }
      });
    });

    it('should generate realistic drive pattern', () => {
      const points = generatePerformanceTestData(3, TestPatterns.REALISTIC_DRIVE, {
        applyNoise: false,
      });

      expect(points).toHaveLength(3);
      // First point should be at base coordinates (Eugene South Hills)
      expect(points[0]!.latitude).toBeCloseTo(44.0462, 3);
      expect(points[0]!.longitude).toBeCloseTo(-123.0236, 3);

      // Subsequent points should be different
      expect(points[1]!.latitude).not.toBe(points[0]!.latitude);
      expect(points[1]!.longitude).not.toBe(points[0]!.longitude);
    });

    it('should use custom starting location', () => {
      const customLocation = { latitude: 45.0, longitude: -122.0 };
      const points = generatePerformanceTestData(1, TestPatterns.SINGLE_POINT, {
        startingLocation: customLocation,
        applyNoise: false,
      });

      expect(points[0]!.latitude).toBe(45.0);
      expect(points[0]!.longitude).toBe(-122.0);
    });

    it('should use custom time parameters', () => {
      const startTime = Date.now() - 1000;
      const points = generatePerformanceTestData(2, TestPatterns.RANDOM_WALK, {
        startTime,
        intervalSeconds: 60,
        applyNoise: false,
      });

      expect(points[0]!.timestamp).toBe(startTime);
      expect(points[1]!.timestamp).toBe(startTime + 60000); // 60 seconds later
    });

    it('should generate circular path pattern', () => {
      const points = generatePerformanceTestData(8, TestPatterns.CIRCULAR_PATH, {
        applyNoise: false,
      });

      expect(points).toHaveLength(8);
      // Should have coordinates within reasonable bounds
      points.forEach((point) => {
        expect(point.latitude).toBeGreaterThan(43);
        expect(point.latitude).toBeLessThan(45);
        expect(point.longitude).toBeGreaterThan(-124);
        expect(point.longitude).toBeLessThan(-122);
      });

      // At least some points should be different from the first
      const uniqueLatitudes = new Set(points.map((p) => p.latitude));
      const uniqueLongitudes = new Set(points.map((p) => p.longitude));
      expect(uniqueLatitudes.size).toBeGreaterThan(1);
      expect(uniqueLongitudes.size).toBeGreaterThan(1);
    });

    it('should generate grid pattern', () => {
      const points = generatePerformanceTestData(4, TestPatterns.GRID_PATTERN, {
        applyNoise: false,
      });

      expect(points).toHaveLength(4);
      points.forEach((point) => {
        expect(point.latitude).toBeGreaterThan(43);
        expect(point.latitude).toBeLessThan(45);
        expect(point.longitude).toBeGreaterThan(-124);
        expect(point.longitude).toBeLessThan(-122);
      });
    });

    it('should generate hiking trail pattern', () => {
      const points = generatePerformanceTestData(3, TestPatterns.HIKING_TRAIL, {
        applyNoise: false,
      });

      expect(points).toHaveLength(3);
      points.forEach((point) => {
        expect(typeof point.latitude).toBe('number');
        expect(typeof point.longitude).toBe('number');
        expect(typeof point.timestamp).toBe('number');
      });
    });

    it('should generate RANDOM_WALK pattern data', () => {
      const points = generatePerformanceTestData(5, TestPatterns.RANDOM_WALK, {
        applyNoise: false,
      });

      expect(points).toHaveLength(5);
      if (points.length > 1) {
        expect(points[0]?.timestamp).toBeLessThan(points[points.length - 1]?.timestamp ?? 0);
      }
    });

    it('should generate CIRCULAR_PATH pattern data', () => {
      const points = generatePerformanceTestData(4, TestPatterns.CIRCULAR_PATH, {
        applyNoise: false,
      });

      expect(points).toHaveLength(4);
      points.forEach((point) => {
        expect(point.latitude).toBeGreaterThan(-90);
        expect(point.latitude).toBeLessThan(90);
        expect(point.longitude).toBeGreaterThan(-180);
        expect(point.longitude).toBeLessThan(180);
      });
    });

    it('should handle custom options', () => {
      const customOptions = {
        startingLocation: { latitude: 40.7128, longitude: -74.006 },
        intervalSeconds: 30,
        startTime: 1000000,
        applyNoise: false,
      };

      const points = generatePerformanceTestData(2, TestPatterns.REALISTIC_DRIVE, customOptions);

      expect(points).toHaveLength(2);
      if (points.length > 0) {
        expect(points[0]?.timestamp).toBeGreaterThanOrEqual(customOptions.startTime);
      }
    });

    it('should handle edge cases', () => {
      // Test with minimal count
      const singlePoint = generatePerformanceTestData(1, TestPatterns.REALISTIC_DRIVE, {
        applyNoise: false,
      });
      expect(singlePoint).toHaveLength(1);

      // Test with zero count should still return empty array gracefully
      const zeroPoints = generatePerformanceTestData(0, TestPatterns.REALISTIC_DRIVE, {
        applyNoise: false,
      });
      expect(zeroPoints).toHaveLength(0);
    });
  });

  describe('GPS Noise Generation', () => {
    it('should apply GPS noise by default', () => {
      const points = generatePerformanceTestData(10, TestPatterns.SINGLE_POINT);

      // With noise applied, points should not all be identical
      const uniqueLatitudes = new Set(points.map((p) => p.latitude));
      const uniqueLongitudes = new Set(points.map((p) => p.longitude));

      // Most points should be unique due to noise
      expect(uniqueLatitudes.size).toBeGreaterThan(1);
      expect(uniqueLongitudes.size).toBeGreaterThan(1);
    });

    it('should add accuracy field to points with noise', () => {
      const points = generatePerformanceTestData(5, TestPatterns.SINGLE_POINT);

      points.forEach((point) => {
        expect(point).toHaveProperty('accuracy');
        const pointWithAccuracy = point as GPSPointWithAccuracy;
        expect(pointWithAccuracy.accuracy).toBeGreaterThan(0);
        expect(pointWithAccuracy.accuracy).toBeLessThan(20); // Within reasonable bounds
      });
    });

    it('should respect applyNoise: false option', () => {
      const baseLocation = { latitude: 45.0, longitude: -122.0 };
      const points = generatePerformanceTestData(5, TestPatterns.SINGLE_POINT, {
        startingLocation: baseLocation,
        applyNoise: false,
      });

      // All points should be identical when noise is disabled
      points.forEach((point) => {
        expect(point.latitude).toBe(45.0);
        expect(point.longitude).toBe(-122.0);
      });
    });

    it('should handle dropout in GPS noise', () => {
      const basePoints: GeoPoint[] = Array.from({ length: 100 }, (_, i) => ({
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now() + i * 1000,
      }));

      // With high dropout probability, should lose some points
      const noisyPoints = addGPSNoise(basePoints, {
        dropoutProbability: 0.3, // 30% dropout
        noiseStdDev: 0, // No position noise
      });

      // Should have fewer points due to dropout
      expect(noisyPoints.length).toBeLessThan(basePoints.length);
      expect(noisyPoints.length).toBeGreaterThan(basePoints.length * 0.5); // But not too many
    });

    it('should apply Gaussian noise correctly', () => {
      const baseLocation = { latitude: 44.0462, longitude: -123.0236 };
      const points = generatePerformanceTestData(100, TestPatterns.SINGLE_POINT, {
        startingLocation: baseLocation,
        noiseOptions: {
          noiseStdDev: 5, // 5m standard deviation
          dropoutProbability: 0, // No dropout for this test
        },
      });

      // Calculate average distance from base point
      const distances = points.map((point) => {
        const latDiff = (point.latitude - baseLocation.latitude) * 111000;
        const lonDiff = (point.longitude - baseLocation.longitude) * 111000;
        return Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);
      });

      const avgDistance = distances.reduce((sum, d) => sum + d, 0) / distances.length;

      // Average distance should be roughly within expected range for Gaussian
      // For 5m std dev, expect average around 4-6m (with some statistical variance)
      expect(avgDistance).toBeGreaterThan(2);
      expect(avgDistance).toBeLessThan(10);
    });

    it('should simulate GPS drift', () => {
      const basePoints: GeoPoint[] = Array.from({ length: 20 }, (_, i) => ({
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now() + i * 1000,
      }));

      const noisyPoints = addGPSNoise(basePoints, {
        noiseStdDev: 1, // Low noise
        driftProbability: 1.0, // Always drift
        driftDuration: 5,
        driftMagnitude: 15, // 15m drift
        dropoutProbability: 0,
      });

      // Should have consecutive points with similar offset (drift)
      expect(noisyPoints.length).toBeGreaterThan(10);

      // Check that some consecutive points are clustered (indicating drift)
      let foundDrift = false;
      for (let i = 1; i < Math.min(10, noisyPoints.length); i++) {
        const prev = noisyPoints[i - 1];
        const curr = noisyPoints[i];
        if (prev && curr) {
          const latDiff = (curr.latitude - prev.latitude) * 111000;
          const lonDiff = (curr.longitude - prev.longitude) * 111000;
          const distance = Math.sqrt(latDiff * latDiff + lonDiff * lonDiff);

          // Drifted points should be close together
          if (distance < 3) {
            foundDrift = true;
            break;
          }
        }
      }

      expect(foundDrift).toBe(true);
    });

    it('should allow custom noise options', () => {
      const points = generatePerformanceTestData(10, TestPatterns.SINGLE_POINT, {
        applyNoise: true,
        noiseOptions: {
          noiseStdDev: 10, // Higher noise
          accuracyRange: [5, 20],
          dropoutProbability: 0,
        },
      });

      expect(points.length).toBe(10); // No dropout
      points.forEach((point) => {
        const pointWithAccuracy = point as GPSPointWithAccuracy;
        expect(pointWithAccuracy.accuracy).toBeGreaterThanOrEqual(5);
        expect(pointWithAccuracy.accuracy).toBeLessThanOrEqual(20);
      });
    });
  });
});
