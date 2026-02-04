import {
  generatePerformanceTestData,
  generateStreetAlignedTestData,
  TestPatterns,
} from '../performanceTestData';
import type { StreetSegment, Intersection } from '../../types/street';

// ---------------------------------------------------------------------------
// Test Fixture Constants
// ---------------------------------------------------------------------------

/**
 * Eugene South Hills base coordinates — the canonical test location for
 * FogOfDog. All street graph fixtures are centred here.
 */
const EUGENE_SOUTH_HILLS = {
  latitude: 44.0462,
  longitude: -123.0236,
} as const;

/** Reasonable latitude/longitude bounds for Eugene, OR test region */
const EUGENE_BOUNDS = {
  latMin: 43,
  latMax: 45,
  lonMin: -124,
  lonMax: -122,
} as const;

/**
 * Fixture for a T-shaped intersection graph:
 *
 *            int_3
 *              |
 *           seg_b (110m)
 *              |
 *   int_1 ---seg_a (80m)--- int_2
 */
const T_GRAPH = {
  /** Intersection at the T-junction centre (Main St & Oak Ave) */
  INT_1: {
    id: 'int_1',
    latitude: EUGENE_SOUTH_HILLS.latitude,
    longitude: EUGENE_SOUTH_HILLS.longitude,
    streetNames: ['Main St', 'Oak Ave'],
    connectedSegmentIds: ['seg_a', 'seg_b'],
  },
  /** Intersection east of int_1 (Main St endpoint) */
  INT_2: {
    id: 'int_2',
    latitude: EUGENE_SOUTH_HILLS.latitude,
    longitude: -123.0226,
    streetNames: ['Main St'],
    connectedSegmentIds: ['seg_a'],
  },
  /** Intersection north of int_1 (Oak Ave endpoint) */
  INT_3: {
    id: 'int_3',
    latitude: 44.0472,
    longitude: EUGENE_SOUTH_HILLS.longitude,
    streetNames: ['Oak Ave'],
    connectedSegmentIds: ['seg_b'],
  },
  /** East–West segment (Main St) */
  SEG_A: {
    id: 'seg_a',
    name: 'Main St',
    points: [
      { latitude: EUGENE_SOUTH_HILLS.latitude, longitude: EUGENE_SOUTH_HILLS.longitude },
      { latitude: EUGENE_SOUTH_HILLS.latitude, longitude: -123.0226 },
    ],
    startNodeId: 'int_1',
    endNodeId: 'int_2',
    lengthMeters: 80,
  },
  /** North–South segment (Oak Ave) */
  SEG_B: {
    id: 'seg_b',
    name: 'Oak Ave',
    points: [
      { latitude: EUGENE_SOUTH_HILLS.latitude, longitude: EUGENE_SOUTH_HILLS.longitude },
      { latitude: 44.0472, longitude: EUGENE_SOUTH_HILLS.longitude },
    ],
    startNodeId: 'int_1',
    endNodeId: 'int_3',
    lengthMeters: 110,
  },
};

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
      expect(points[0]!.latitude).toBeCloseTo(EUGENE_SOUTH_HILLS.latitude, 3);
      expect(points[0]!.longitude).toBeCloseTo(EUGENE_SOUTH_HILLS.longitude, 3);

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
        expect(point.latitude).toBeGreaterThan(EUGENE_BOUNDS.latMin);
        expect(point.latitude).toBeLessThan(EUGENE_BOUNDS.latMax);
        expect(point.longitude).toBeGreaterThan(EUGENE_BOUNDS.lonMin);
        expect(point.longitude).toBeLessThan(EUGENE_BOUNDS.lonMax);
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
        expect(point.latitude).toBeGreaterThan(EUGENE_BOUNDS.latMin);
        expect(point.latitude).toBeLessThan(EUGENE_BOUNDS.latMax);
        expect(point.longitude).toBeGreaterThan(EUGENE_BOUNDS.lonMin);
        expect(point.longitude).toBeLessThan(EUGENE_BOUNDS.lonMax);
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
    // Use T_GRAPH constants for the test fixtures
    const segments: StreetSegment[] = [T_GRAPH.SEG_A, T_GRAPH.SEG_B];
    const intersections: Intersection[] = [T_GRAPH.INT_1, T_GRAPH.INT_2, T_GRAPH.INT_3];

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
      // Start slightly east of the T-junction on Main St
      const start = {
        latitude: EUGENE_SOUTH_HILLS.latitude,
        longitude: (EUGENE_SOUTH_HILLS.longitude + T_GRAPH.INT_2.longitude) / 2,
      };
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
      const DEAD_END_EAST_LON = -123.022;
      const SOLO_SEGMENT_LENGTH = 140;

      const soloSeg: StreetSegment[] = [
        {
          id: 'solo',
          name: 'Solo St',
          points: [
            { latitude: EUGENE_SOUTH_HILLS.latitude, longitude: EUGENE_SOUTH_HILLS.longitude },
            { latitude: EUGENE_SOUTH_HILLS.latitude, longitude: DEAD_END_EAST_LON },
          ],
          startNodeId: 'end_a',
          endNodeId: 'end_b',
          lengthMeters: SOLO_SEGMENT_LENGTH,
        },
      ];
      const soloInt: Intersection[] = [
        {
          id: 'end_a',
          latitude: EUGENE_SOUTH_HILLS.latitude,
          longitude: EUGENE_SOUTH_HILLS.longitude,
          streetNames: ['Solo St'],
          connectedSegmentIds: ['solo'],
        },
        {
          id: 'end_b',
          latitude: EUGENE_SOUTH_HILLS.latitude,
          longitude: DEAD_END_EAST_LON,
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
      const BROKEN_NORTH_LAT = 44.0465;
      const BROKEN_SEGMENT_LENGTH = 33;

      const brokenSeg: StreetSegment[] = [
        {
          id: 'seg_x',
          name: 'Broken St',
          points: [
            { latitude: EUGENE_SOUTH_HILLS.latitude, longitude: EUGENE_SOUTH_HILLS.longitude },
            { latitude: BROKEN_NORTH_LAT, longitude: EUGENE_SOUTH_HILLS.longitude },
          ],
          startNodeId: 'int_ok',
          endNodeId: 'int_missing',
          lengthMeters: BROKEN_SEGMENT_LENGTH,
        },
      ];
      const partialInt: Intersection[] = [
        {
          id: 'int_ok',
          latitude: EUGENE_SOUTH_HILLS.latitude,
          longitude: EUGENE_SOUTH_HILLS.longitude,
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
        { startingLocation: { latitude: BROKEN_NORTH_LAT, longitude: EUGENE_SOUTH_HILLS.longitude } }
      );

      expect(points.length).toBeGreaterThan(0);
    });
  });
});
