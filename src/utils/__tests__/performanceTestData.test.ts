import {
  generatePerformanceTestData,
  generateStreetAlignedTestData,
  TestPatterns,
} from '../performanceTestData';
import type { StreetSegment, Intersection } from '../../types/street';

describe('performanceTestData', () => {
  describe('generatePerformanceTestData', () => {
    it('should generate single point', () => {
      const points = generatePerformanceTestData(1, TestPatterns.SINGLE_POINT);

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
      const points = generatePerformanceTestData(5, TestPatterns.RANDOM_WALK);

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
      const points = generatePerformanceTestData(3, TestPatterns.REALISTIC_DRIVE);

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
      });

      expect(points[0]!.latitude).toBe(45.0);
      expect(points[0]!.longitude).toBe(-122.0);
    });

    it('should use custom time parameters', () => {
      const startTime = Date.now() - 1000;
      const points = generatePerformanceTestData(2, TestPatterns.RANDOM_WALK, {
        startTime,
        intervalSeconds: 60,
      });

      expect(points[0]!.timestamp).toBe(startTime);
      expect(points[1]!.timestamp).toBe(startTime + 60000); // 60 seconds later
    });

    it('should generate circular path pattern', () => {
      const points = generatePerformanceTestData(8, TestPatterns.CIRCULAR_PATH);

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
      const points = generatePerformanceTestData(4, TestPatterns.GRID_PATTERN);

      expect(points).toHaveLength(4);
      points.forEach((point) => {
        expect(point.latitude).toBeGreaterThan(43);
        expect(point.latitude).toBeLessThan(45);
        expect(point.longitude).toBeGreaterThan(-124);
        expect(point.longitude).toBeLessThan(-122);
      });
    });

    it('should generate hiking trail pattern', () => {
      const points = generatePerformanceTestData(3, TestPatterns.HIKING_TRAIL);

      expect(points).toHaveLength(3);
      points.forEach((point) => {
        expect(typeof point.latitude).toBe('number');
        expect(typeof point.longitude).toBe('number');
        expect(typeof point.timestamp).toBe('number');
      });
    });

    it('should generate RANDOM_WALK pattern data', () => {
      const points = generatePerformanceTestData(5, TestPatterns.RANDOM_WALK);

      expect(points).toHaveLength(5);
      if (points.length > 1) {
        expect(points[0]?.timestamp).toBeLessThan(points[points.length - 1]?.timestamp ?? 0);
      }
    });

    it('should generate CIRCULAR_PATH pattern data', () => {
      const points = generatePerformanceTestData(4, TestPatterns.CIRCULAR_PATH);

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
      };

      const points = generatePerformanceTestData(2, TestPatterns.REALISTIC_DRIVE, customOptions);

      expect(points).toHaveLength(2);
      if (points.length > 0) {
        expect(points[0]?.timestamp).toBeGreaterThanOrEqual(customOptions.startTime);
      }
    });

    it('should handle edge cases', () => {
      // Test with minimal count
      const singlePoint = generatePerformanceTestData(1, TestPatterns.REALISTIC_DRIVE);
      expect(singlePoint).toHaveLength(1);

      // Test with zero count should still return empty array gracefully
      const zeroPoints = generatePerformanceTestData(0, TestPatterns.REALISTIC_DRIVE);
      expect(zeroPoints).toHaveLength(0);
    });
  });

  describe('generateStreetAlignedTestData', () => {
    // T-shaped graph: int_1 connects to int_2 (East) via seg_a and to int_3 (North) via seg_b
    const segments: StreetSegment[] = [
      {
        id: 'seg_a',
        name: 'Main St',
        points: [
          { latitude: 44.0462, longitude: -123.0236 },
          { latitude: 44.0462, longitude: -123.0226 },
        ],
        startNodeId: 'int_1',
        endNodeId: 'int_2',
        lengthMeters: 80,
      },
      {
        id: 'seg_b',
        name: 'Oak Ave',
        points: [
          { latitude: 44.0462, longitude: -123.0236 },
          { latitude: 44.0472, longitude: -123.0236 },
        ],
        startNodeId: 'int_1',
        endNodeId: 'int_3',
        lengthMeters: 110,
      },
    ];

    const intersections: Intersection[] = [
      {
        id: 'int_1',
        latitude: 44.0462,
        longitude: -123.0236,
        streetNames: ['Main St', 'Oak Ave'],
        connectedSegmentIds: ['seg_a', 'seg_b'],
      },
      {
        id: 'int_2',
        latitude: 44.0462,
        longitude: -123.0226,
        streetNames: ['Main St'],
        connectedSegmentIds: ['seg_a'],
      },
      {
        id: 'int_3',
        latitude: 44.0472,
        longitude: -123.0236,
        streetNames: ['Oak Ave'],
        connectedSegmentIds: ['seg_b'],
      },
    ];

    it('should generate valid GeoPoints along street graph', () => {
      const points = generateStreetAlignedTestData(5, { segments, intersections });

      expect(points.length).toBeGreaterThan(0);
      expect(points.length).toBeLessThanOrEqual(5);
      points.forEach((p, i) => {
        expect(typeof p.latitude).toBe('number');
        expect(typeof p.longitude).toBe('number');
        expect(typeof p.timestamp).toBe('number');
        if (i > 0) expect(p.timestamp).toBeGreaterThan(points[i - 1]!.timestamp);
      });
    });

    it('should use custom starting location', () => {
      const start = { latitude: 44.0462, longitude: -123.0231 };
      const points = generateStreetAlignedTestData(
        3,
        { segments, intersections },
        {
          startingLocation: start,
        }
      );

      expect(points.length).toBeGreaterThan(0);
      expect(points[0]!.latitude).toBe(start.latitude);
      expect(points[0]!.longitude).toBe(start.longitude);
    });

    it('should apply custom time parameters', () => {
      const startTime = 5_000_000;
      const points = generateStreetAlignedTestData(
        3,
        { segments, intersections },
        {
          startTime,
          intervalSeconds: 10,
        }
      );

      expect(points[0]!.timestamp).toBe(startTime);
      if (points.length > 1) expect(points[1]!.timestamp).toBe(startTime + 10_000);
    });

    it('should return single start point when no segments exist', () => {
      const points = generateStreetAlignedTestData(5, { segments: [], intersections: [] });

      // walkStreets returns [start] when bestSeg is null
      expect(points).toHaveLength(1);
    });

    it('should stop at dead-end intersections before reaching count', () => {
      // Single isolated segment — both endpoints are dead ends
      const soloSeg: StreetSegment[] = [
        {
          id: 'solo',
          name: 'Solo St',
          points: [
            { latitude: 44.0462, longitude: -123.0236 },
            { latitude: 44.0462, longitude: -123.022 },
          ],
          startNodeId: 'end_a',
          endNodeId: 'end_b',
          lengthMeters: 140,
        },
      ];
      const soloInt: Intersection[] = [
        {
          id: 'end_a',
          latitude: 44.0462,
          longitude: -123.0236,
          streetNames: ['Solo St'],
          connectedSegmentIds: ['solo'],
        },
        {
          id: 'end_b',
          latitude: 44.0462,
          longitude: -123.022,
          streetNames: ['Solo St'],
          connectedSegmentIds: ['solo'],
        },
      ];

      const points = generateStreetAlignedTestData(50, {
        segments: soloSeg,
        intersections: soloInt,
      });

      expect(points.length).toBeGreaterThan(1);
      expect(points.length).toBeLessThan(50);
    });

    it('should prefer unexplored segments when flag is set', () => {
      const points = generateStreetAlignedTestData(
        5,
        { segments, intersections },
        {
          preferUnexplored: true,
          exploredSegmentIds: ['seg_a'],
        }
      );

      expect(points.length).toBeGreaterThan(0);
    });

    it('should fall back to any candidate when all are explored', () => {
      const points = generateStreetAlignedTestData(
        5,
        { segments, intersections },
        {
          preferUnexplored: true,
          exploredSegmentIds: ['seg_a', 'seg_b'],
        }
      );

      // All candidates explored — falls through to random selection
      expect(points.length).toBeGreaterThan(0);
    });

    it('should break gracefully when targeted intersection is missing', () => {
      // seg_x.endNodeId points to a non-existent intersection
      const brokenSeg: StreetSegment[] = [
        {
          id: 'seg_x',
          name: 'Broken St',
          points: [
            { latitude: 44.0462, longitude: -123.0236 },
            { latitude: 44.0465, longitude: -123.0236 },
          ],
          startNodeId: 'int_ok',
          endNodeId: 'int_missing',
          lengthMeters: 33,
        },
      ];
      const partialInt: Intersection[] = [
        {
          id: 'int_ok',
          latitude: 44.0462,
          longitude: -123.0236,
          streetNames: ['Broken St'],
          connectedSegmentIds: ['seg_x'],
        },
      ];

      // Start near the END of the segment so nearerEndId returns int_missing
      const points = generateStreetAlignedTestData(
        5,
        {
          segments: brokenSeg,
          intersections: partialInt,
        },
        { startingLocation: { latitude: 44.0465, longitude: -123.0236 } }
      );

      expect(points.length).toBeGreaterThan(0);
    });
  });
});
