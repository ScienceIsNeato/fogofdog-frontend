import { GPSConnectionService, ProcessedGPSPoint } from '../GPSConnectionService';
import { GeoPoint } from '../../types/user';

describe('GPSConnectionService', () => {
  const createPoint = (lat: number, lng: number, timestamp: number): GeoPoint => ({
    latitude: lat,
    longitude: lng,
    timestamp,
  });

  describe('processGPSPoints', () => {
    it('should handle empty array', () => {
      const result = GPSConnectionService.processGPSPoints([]);
      expect(result).toEqual([]);
    });

    it('should handle single point', () => {
      const points = [createPoint(37.7749, -122.4194, 1000)];
      const result = GPSConnectionService.processGPSPoints(points);

      expect(result).toHaveLength(1);
      expect(result[0]).toMatchObject({
        latitude: 37.7749,
        longitude: -122.4194,
        timestamp: 1000,
        connectsToPrevious: false,
        startsNewSession: true,
      });
    });

    it('should connect two nearby points in time and space', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000), // San Francisco
        createPoint(37.7751, -122.4196, 2000), // Very close, 1 second later
      ];

      const result = GPSConnectionService.processGPSPoints(points);

      expect(result).toHaveLength(2);
      expect(result[0]!.connectsToPrevious).toBe(false);
      expect(result[0]!.startsNewSession).toBe(true);
      expect(result[1]!.connectsToPrevious).toBe(true);
      expect(result[1]!.startsNewSession).toBe(false);
    });

    it('should break connection on large time gap (>120s)', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000),
        createPoint(37.7751, -122.4196, 122000), // 121 seconds later
      ];

      const result = GPSConnectionService.processGPSPoints(points);

      expect(result).toHaveLength(2);
      expect(result[1]!.connectsToPrevious).toBe(false);
      expect(result[1]!.startsNewSession).toBe(true);
      expect(result[1]!.disconnectionReason).toContain('Time gap too large');
    });

    it('should break connection on high speed (>100mph)', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000),
        createPoint(37.7767, -122.4194, 1100), // ~200m in 0.1s = 7200 mph (under 250m jump but way over speed limit)
      ];

      const result = GPSConnectionService.processGPSPoints(points);

      expect(result).toHaveLength(2);
      expect(result[1]!.connectsToPrevious).toBe(false);
      expect(result[1]!.startsNewSession).toBe(true);
      expect(result[1]!.disconnectionReason).toContain('Speed too high');
    });

    it('should break connection on large distance jump (>2km)', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000), // San Francisco
        createPoint(37.7949, -122.4194, 2000), // ~2.2km north, 1 second later (GPS error/jump)
      ];

      const result = GPSConnectionService.processGPSPoints(points);

      expect(result).toHaveLength(2);
      expect(result[1]!.connectsToPrevious).toBe(false);
      expect(result[1]!.startsNewSession).toBe(true);
      expect(result[1]!.disconnectionReason).toContain('Distance jump too large');
    });

    it('should connect legitimate high-speed movement (highway driving <100mph)', () => {
      // 80 mph = 35.76 m/s, so in 10 seconds = 357.6m
      // Moving ~200m in 10 seconds = 20 m/s = 44.7 mph (reasonable highway speed)
      const points = [
        createPoint(37.7749, -122.4194, 1000),
        createPoint(37.7767, -122.4194, 11000), // ~200m north in 10s = ~45mph (legitimate highway speed)
      ];

      const result = GPSConnectionService.processGPSPoints(points);

      expect(result).toHaveLength(2);
      expect(result[1]!.connectsToPrevious).toBe(true); // Should connect legitimate highway speed
      expect(result[1]!.startsNewSession).toBe(false);
    });

    it('should break connection on tiny movement (<5m)', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000),
        createPoint(37.7749001, -122.4194001, 2000), // ~0.1m movement
      ];

      const result = GPSConnectionService.processGPSPoints(points);

      expect(result).toHaveLength(2);
      expect(result[1]!.connectsToPrevious).toBe(false);
      expect(result[1]!.startsNewSession).toBe(true);
      expect(result[1]!.disconnectionReason).toContain('Movement too small');
    });

    it('should sort points by timestamp before processing', () => {
      const points = [
        createPoint(37.7751, -122.4196, 3000), // Third in time
        createPoint(37.7749, -122.4194, 1000), // First in time
        createPoint(37.775, -122.4195, 2000), // Second in time
      ];

      const result = GPSConnectionService.processGPSPoints(points);

      expect(result).toHaveLength(3);
      // Should be sorted by timestamp
      expect(result[0]!.timestamp).toBe(1000);
      expect(result[1]!.timestamp).toBe(2000);
      expect(result[2]!.timestamp).toBe(3000);
      // First point starts session, others should connect
      expect(result[0]!.startsNewSession).toBe(true);
      expect(result[1]!.connectsToPrevious).toBe(true);
      expect(result[2]!.connectsToPrevious).toBe(true);
    });

    it('should filter out invalid points', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000), // Valid
        { latitude: NaN, longitude: -122.4194, timestamp: 2000 } as GeoPoint, // Invalid lat
        createPoint(37.7751, -122.4196, 3000), // Valid
        { latitude: 37.7752, longitude: Infinity, timestamp: 4000 } as GeoPoint, // Invalid lng
      ];

      const result = GPSConnectionService.processGPSPoints(points);

      expect(result).toHaveLength(2); // Only valid points
      expect(result[0]!.latitude).toBe(37.7749);
      expect(result[1]!.latitude).toBe(37.7751);
    });
  });

  describe('getConnectedSegments', () => {
    it('should return empty array for no connections', () => {
      const processedPoints: ProcessedGPSPoint[] = [
        {
          ...createPoint(37.7749, -122.4194, 1000),
          connectsToPrevious: false,
          startsNewSession: true,
        },
        {
          ...createPoint(37.7751, -122.4196, 122000),
          connectsToPrevious: false,
          startsNewSession: true,
        },
      ];

      const result = GPSConnectionService.getConnectedSegments(processedPoints);
      expect(result).toHaveLength(0);
    });

    it('should return segments for connected points', () => {
      const processedPoints: ProcessedGPSPoint[] = [
        {
          ...createPoint(37.7749, -122.4194, 1000),
          connectsToPrevious: false,
          startsNewSession: true,
        },
        {
          ...createPoint(37.7751, -122.4196, 2000),
          connectsToPrevious: true,
          startsNewSession: false,
        },
        {
          ...createPoint(37.7753, -122.4198, 3000),
          connectsToPrevious: true,
          startsNewSession: false,
        },
      ];

      const result = GPSConnectionService.getConnectedSegments(processedPoints);

      expect(result).toHaveLength(2);
      expect(result[0]!.start.latitude).toBe(37.7749);
      expect(result[0]!.end.latitude).toBe(37.7751);
      expect(result[1]!.start.latitude).toBe(37.7751);
      expect(result[1]!.end.latitude).toBe(37.7753);
      expect(result[0]!.distance).toBeGreaterThan(0);
      expect(result[1]!.distance).toBeGreaterThan(0);
    });
  });

  describe('calculateTotalDistance', () => {
    it('should return 0 for no connections', () => {
      const processedPoints: ProcessedGPSPoint[] = [
        {
          ...createPoint(37.7749, -122.4194, 1000),
          connectsToPrevious: false,
          startsNewSession: true,
        },
        {
          ...createPoint(40.7128, -74.006, 122000), // Disconnected (different city)
          connectsToPrevious: false,
          startsNewSession: true,
        },
      ];

      const result = GPSConnectionService.calculateTotalDistance(processedPoints);
      expect(result).toBe(0);
    });

    it('should calculate total distance for connected points', () => {
      const processedPoints: ProcessedGPSPoint[] = [
        {
          ...createPoint(37.7749, -122.4194, 1000),
          connectsToPrevious: false,
          startsNewSession: true,
        },
        {
          ...createPoint(37.7751, -122.4196, 2000),
          connectsToPrevious: true,
          startsNewSession: false,
        },
        {
          ...createPoint(37.7753, -122.4198, 3000),
          connectsToPrevious: true,
          startsNewSession: false,
        },
      ];

      const result = GPSConnectionService.calculateTotalDistance(processedPoints);
      expect(result).toBeGreaterThan(0);
      // Should be sum of two segment distances
      const segments = GPSConnectionService.getConnectedSegments(processedPoints);
      const expectedTotal = segments.reduce((sum, seg) => sum + seg.distance, 0);
      expect(result).toBeCloseTo(expectedTotal, 2);
    });
  });

  describe('getSessionBoundaries', () => {
    it('should identify session start indices', () => {
      const processedPoints: ProcessedGPSPoint[] = [
        {
          ...createPoint(37.7749, -122.4194, 1000),
          connectsToPrevious: false,
          startsNewSession: true, // Session 1 starts
        },
        {
          ...createPoint(37.7751, -122.4196, 2000),
          connectsToPrevious: true,
          startsNewSession: false,
        },
        {
          ...createPoint(40.7128, -74.006, 122000), // Big gap
          connectsToPrevious: false,
          startsNewSession: true, // Session 2 starts
        },
        {
          ...createPoint(40.713, -74.0062, 123000),
          connectsToPrevious: true,
          startsNewSession: false,
        },
      ];

      const result = GPSConnectionService.getSessionBoundaries(processedPoints);
      expect(result).toEqual([0, 2]); // Sessions start at indices 0 and 2
    });
  });
});
