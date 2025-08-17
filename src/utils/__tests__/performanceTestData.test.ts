import { generatePerformanceTestData, TestPatterns } from '../performanceTestData';

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
  });
});
