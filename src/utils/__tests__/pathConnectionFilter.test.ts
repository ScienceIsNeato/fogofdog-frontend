import { PathConnectionFilter } from '../pathConnectionFilter';
import { GeoPoint } from '../../types/user';

describe('PathConnectionFilter', () => {
  const createPoint = (lat: number, lng: number, timestamp: number): GeoPoint => ({
    latitude: lat,
    longitude: lng,
    timestamp,
  });

  describe('filterPathConnections', () => {
    it('should return empty array for empty input', () => {
      const result = PathConnectionFilter.filterPathConnections([]);
      expect(result).toEqual([]);
    });

    it('should return empty array for single point', () => {
      const points = [createPoint(37.7749, -122.4194, 1000)];
      const result = PathConnectionFilter.filterPathConnections(points);
      expect(result).toEqual([]);
    });

    it('should connect two nearby points in time', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000), // San Francisco
        createPoint(37.7751, -122.4196, 2000), // Very close, 1 second later
      ];

      const result = PathConnectionFilter.filterPathConnections(points);
      expect(result).toHaveLength(1);
      expect(result[0]!.start).toEqual(points[0]);
      expect(result[0]!.end).toEqual(points[1]);
    });

    it('should reject connection with large time gap (>120s)', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000),
        createPoint(37.7751, -122.4196, 122000), // 121 seconds later (>120s)
      ];

      const result = PathConnectionFilter.filterPathConnections(points);
      expect(result).toHaveLength(0);
    });

    it('should reject connection requiring high speed (>100mph)', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000),
        createPoint(38.7749, -122.4194, 2000), // ~111km in 1 second = way over 100mph
      ];

      const result = PathConnectionFilter.filterPathConnections(points);
      expect(result).toHaveLength(0);
    });

    it('should sort points by timestamp before processing', () => {
      const points = [
        createPoint(37.7751, -122.4196, 3000), // Third chronologically
        createPoint(37.7749, -122.4194, 1000), // First chronologically
        createPoint(37.775, -122.4195, 2000), // Second chronologically
      ];

      const result = PathConnectionFilter.filterPathConnections(points);
      expect(result).toHaveLength(2);

      // Should connect in chronological order
      expect(result[0]!.start.timestamp).toBe(1000);
      expect(result[0]!.end.timestamp).toBe(2000);
      expect(result[1]!.start.timestamp).toBe(2000);
      expect(result[1]!.end.timestamp).toBe(3000);
    });

    it('should handle mix of valid and invalid connections', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000),
        createPoint(37.775, -122.4195, 2000), // Valid: close in time and space
        createPoint(37.7751, -122.4196, 130000), // Invalid: >120s gap
        createPoint(37.7752, -122.4197, 131000), // Valid: close to previous
      ];

      const result = PathConnectionFilter.filterPathConnections(points);
      expect(result).toHaveLength(2); // First->second and third->fourth
      expect(result[0]!.start.timestamp).toBe(1000);
      expect(result[0]!.end.timestamp).toBe(2000);
      expect(result[1]!.start.timestamp).toBe(130000);
      expect(result[1]!.end.timestamp).toBe(131000);
    });

    it('should filter out null/undefined points', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000),
        null as any,
        createPoint(37.775, -122.4195, 2000),
        undefined as any,
        createPoint(37.7751, -122.4196, 3000),
      ];

      const result = PathConnectionFilter.filterPathConnections(points);
      expect(result).toHaveLength(2); // Should connect the 3 valid points
    });

    it('should filter out points with invalid coordinates', () => {
      const points = [
        createPoint(37.7749, -122.4194, 1000),
        { latitude: NaN, longitude: -122.4195, timestamp: 2000 } as GeoPoint,
        createPoint(37.775, -122.4195, 3000),
      ];

      const result = PathConnectionFilter.filterPathConnections(points);
      expect(result).toHaveLength(1); // Should connect first and third points
      expect(result[0]!.start.timestamp).toBe(1000);
      expect(result[0]!.end.timestamp).toBe(3000);
    });
  });
});
