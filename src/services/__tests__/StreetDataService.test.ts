import { StreetDataService } from '../StreetDataService';
import { GeoPoint } from '../../types/user';
import { StreetSegment, StreetType, BoundingBox, OSMResponse } from '../../types/street';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage');

// Mock fetch
global.fetch = jest.fn();

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('StreetDataService', () => {
  let service: StreetDataService;

  beforeEach(() => {
    jest.clearAllMocks();
    (global.fetch as jest.Mock).mockClear();
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
    (AsyncStorage.getAllKeys as jest.Mock).mockClear();
    (AsyncStorage.multiRemove as jest.Mock).mockClear();

    service = StreetDataService.getInstance();
    service.reset();
  });

  describe('getInstance', () => {
    it('should return singleton instance', () => {
      const instance1 = StreetDataService.getInstance();
      const instance2 = StreetDataService.getInstance();
      expect(instance1).toBe(instance2);
    });
  });

  describe('setCurrentLocation', () => {
    it('should set current location', () => {
      const location: GeoPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
      };

      service.setCurrentLocation(location);

      // Verify by using a method that depends on current location
      expect(() => service.getClosestStreets()).not.toThrow();
    });
  });

  describe('fetchStreetsInBoundingBox', () => {
    const mockBbox: BoundingBox = {
      south: 44.04,
      west: -123.03,
      north: 44.05,
      east: -123.02,
    };

    const mockOSMResponse: OSMResponse = {
      version: 0.6,
      generator: 'test',
      elements: [
        {
          type: 'way',
          id: 123456,
          tags: {
            name: 'Main Street',
            highway: 'residential',
          },
          geometry: [
            { lat: 44.0462, lon: -123.0236 },
            { lat: 44.0463, lon: -123.0235 },
          ],
        },
      ],
    };

    it('should fetch streets from Overpass API', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => mockOSMResponse,
      });

      const streets = await service.fetchStreetsInBoundingBox(mockBbox, false);

      expect(streets).toHaveLength(1);
      expect(streets[0]?.name).toBe('Main Street');
      expect(streets[0]?.type).toBe(StreetType.Residential);
      expect(streets[0]?.coordinates).toHaveLength(2);
    });

    it('should use cache if available and valid', async () => {
      const cachedStreets: StreetSegment[] = [
        {
          id: '123456',
          name: 'Cached Street',
          type: StreetType.Residential,
          coordinates: [{ latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() }],
          isExplored: false,
        },
      ];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({
          data: cachedStreets,
          timestamp: Date.now(),
          size: 1000,
        })
      );

      const streets = await service.fetchStreetsInBoundingBox(mockBbox, true);

      expect(streets).toHaveLength(1);
      expect(streets[0]?.name).toBe('Cached Street');
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('should handle API errors and fall back to cache', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(new Error('Network error'));

      const cachedStreets: StreetSegment[] = [
        {
          id: '123456',
          name: 'Cached Street',
          type: StreetType.Residential,
          coordinates: [{ latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() }],
          isExplored: false,
        },
      ];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(
        JSON.stringify({
          data: cachedStreets,
          timestamp: Date.now(),
          size: 1000,
        })
      );

      const streets = await service.fetchStreetsInBoundingBox(mockBbox, false);

      expect(streets).toHaveLength(1);
      expect(streets[0]?.name).toBe('Cached Street');
    });
  });

  describe('getClosestStreets', () => {
    const mockStreets: StreetSegment[] = [
      {
        id: '1',
        name: 'Close Street',
        type: StreetType.Residential,
        coordinates: [
          { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
          { latitude: 44.0463, longitude: -123.0235, timestamp: Date.now() },
        ],
        isExplored: false,
      },
      {
        id: '2',
        name: 'Far Street',
        type: StreetType.Primary,
        coordinates: [
          { latitude: 44.0472, longitude: -123.0246, timestamp: Date.now() },
          { latitude: 44.0473, longitude: -123.0245, timestamp: Date.now() },
        ],
        isExplored: false,
      },
      {
        id: '3',
        name: 'Explored Street',
        type: StreetType.Secondary,
        coordinates: [
          { latitude: 44.0465, longitude: -123.0238, timestamp: Date.now() },
          { latitude: 44.0466, longitude: -123.0237, timestamp: Date.now() },
        ],
        isExplored: true,
        exploredAt: Date.now() - 1000,
      },
    ];

    beforeEach(() => {
      // Manually add streets to service for testing
      mockStreets.forEach((street) => {
        service['streets'].set(street.id, street);
      });
    });

    it('should return closest street to comparison point', async () => {
      const comparisonPoint: GeoPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
      };

      const results = await service.getClosestStreets({
        numResults: 1,
        comparisonPoint,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.street.name).toBe('Close Street');
      expect(results[0]?.distance).toBeLessThan(100); // Should be very close
    });

    it('should return multiple results when requested', async () => {
      const comparisonPoint: GeoPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
      };

      const results = await service.getClosestStreets({
        numResults: 2,
        comparisonPoint,
      });

      expect(results).toHaveLength(2);
      expect(results[0]?.distance).toBeLessThanOrEqual(results[1]?.distance || Infinity);
    });

    it('should filter by unexplored streets', async () => {
      const comparisonPoint: GeoPoint = {
        latitude: 44.0465,
        longitude: -123.0238,
        timestamp: Date.now(),
      };

      const results = await service.getClosestStreets({
        numResults: 10,
        comparisonPoint,
        filter: 'unexplored',
      });

      expect(results.every((r) => !r.street.isExplored)).toBe(true);
    });

    it('should filter by explored streets', async () => {
      const comparisonPoint: GeoPoint = {
        latitude: 44.0465,
        longitude: -123.0238,
        timestamp: Date.now(),
      };

      const results = await service.getClosestStreets({
        numResults: 10,
        comparisonPoint,
        filter: 'explored',
      });

      expect(results.every((r) => r.street.isExplored)).toBe(true);
      expect(results).toHaveLength(1);
      expect(results[0]?.street.name).toBe('Explored Street');
    });

    it('should include direction and bearing', async () => {
      const comparisonPoint: GeoPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
      };

      const results = await service.getClosestStreets({
        numResults: 1,
        comparisonPoint,
      });

      expect(results[0]?.direction).toBeDefined();
      expect(results[0]?.bearing).toBeGreaterThanOrEqual(0);
      expect(results[0]?.bearing).toBeLessThan(360);
    });

    it('should use current location if no comparison point provided', async () => {
      const currentLocation: GeoPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
      };

      service.setCurrentLocation(currentLocation);

      const results = await service.getClosestStreets({ numResults: 1 });

      expect(results).toHaveLength(1);
      expect(results[0]?.street.name).toBe('Close Street');
    });

    it('should throw error if no location provided', async () => {
      await expect(service.getClosestStreets()).rejects.toThrow(
        'No comparison point provided and no current location set'
      );
    });
  });

  describe('getClosestIntersections', () => {
    it('should return closest intersections', async () => {
      const comparisonPoint: GeoPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
      };

      // Mock intersection data
      service['intersections'].set('int1', {
        id: 'int1',
        location: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
        streetNames: ['Main St', 'First Ave'],
        streetIds: ['1', '2'],
        isExplored: false,
      });

      const results = await service.getClosestIntersections({
        numResults: 1,
        comparisonPoint,
      });

      expect(results).toHaveLength(1);
      expect(results[0]?.intersection.streetNames).toContain('Main St');
    });

    it('should filter by exploration status', async () => {
      const comparisonPoint: GeoPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
      };

      service['intersections'].set('int1', {
        id: 'int1',
        location: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
        streetNames: ['Main St', 'First Ave'],
        streetIds: ['1', '2'],
        isExplored: false,
      });

      service['intersections'].set('int2', {
        id: 'int2',
        location: { latitude: 44.0463, longitude: -123.0237, timestamp: Date.now() },
        streetNames: ['Second St', 'Third Ave'],
        streetIds: ['3', '4'],
        isExplored: true,
      });

      const unexplored = await service.getClosestIntersections({
        numResults: 10,
        comparisonPoint,
        filter: 'unexplored',
      });

      expect(unexplored.every((r) => !r.intersection.isExplored)).toBe(true);

      const explored = await service.getClosestIntersections({
        numResults: 10,
        comparisonPoint,
        filter: 'explored',
      });

      expect(explored.every((r) => r.intersection.isExplored)).toBe(true);
    });
  });

  describe('getShortestLoop', () => {
    it('should return loop not possible message for current implementation', async () => {
      const startLocation: GeoPoint = {
        latitude: 44.0462,
        longitude: -123.0236,
        timestamp: Date.now(),
      };

      // Add a street to service
      service['streets'].set('1', {
        id: '1',
        name: 'Test Street',
        type: StreetType.Residential,
        coordinates: [
          { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
          { latitude: 44.0463, longitude: -123.0235, timestamp: Date.now() },
        ],
        isExplored: false,
      });

      const result = await service.getShortestLoop({ startLocation });

      expect(result.isPossible).toBe(false);
      expect(result.reason).toContain('graph traversal');
    });
  });

  describe('markStreetExplored', () => {
    it('should mark street as explored', () => {
      const street: StreetSegment = {
        id: '1',
        name: 'Test Street',
        type: StreetType.Residential,
        coordinates: [{ latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() }],
        isExplored: false,
      };

      service['streets'].set(street.id, street);

      const timestamp = Date.now();
      service.markStreetExplored(street.id, timestamp);

      const updatedStreet = service['streets'].get(street.id);
      expect(updatedStreet?.isExplored).toBe(true);
      expect(updatedStreet?.exploredAt).toBe(timestamp);
    });
  });

  describe('markIntersectionExplored', () => {
    it('should mark intersection as explored', () => {
      const intersection = {
        id: 'int1',
        location: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
        streetNames: ['Main St', 'First Ave'],
        streetIds: ['1', '2'],
        isExplored: false,
      };

      service['intersections'].set(intersection.id, intersection);

      const timestamp = Date.now();
      service.markIntersectionExplored(intersection.id, timestamp);

      const updatedIntersection = service['intersections'].get(intersection.id);
      expect(updatedIntersection?.isExplored).toBe(true);
      expect(updatedIntersection?.exploredAt).toBe(timestamp);
    });
  });

  describe('updateExplorationFromGPSPath', () => {
    it('should mark nearby streets as explored', () => {
      const street: StreetSegment = {
        id: '1',
        name: 'Test Street',
        type: StreetType.Residential,
        coordinates: [
          { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
          { latitude: 44.0463, longitude: -123.0235, timestamp: Date.now() },
        ],
        isExplored: false,
      };

      service['streets'].set(street.id, street);

      const gpsPath: GeoPoint[] = [
        { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
      ];

      service.updateExplorationFromGPSPath(gpsPath);

      const updatedStreet = service['streets'].get(street.id);
      expect(updatedStreet?.isExplored).toBe(true);
    });

    it('should mark nearby intersections as explored', () => {
      const intersection = {
        id: 'int1',
        location: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
        streetNames: ['Main St', 'First Ave'],
        streetIds: ['1', '2'],
        isExplored: false,
      };

      service['intersections'].set(intersection.id, intersection);

      const gpsPath: GeoPoint[] = [
        { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
      ];

      service.updateExplorationFromGPSPath(gpsPath);

      const updatedIntersection = service['intersections'].get(intersection.id);
      expect(updatedIntersection?.isExplored).toBe(true);
    });
  });

  describe('clearCache', () => {
    it('should clear cached street data', async () => {
      (AsyncStorage.getAllKeys as jest.Mock).mockResolvedValueOnce([
        'street_cache_streets_44_-123_45_-122',
        'other_key',
      ]);

      await service.clearCache();

      expect(AsyncStorage.multiRemove).toHaveBeenCalledWith([
        'street_cache_streets_44_-123_45_-122',
      ]);
    });
  });

  describe('reset', () => {
    it('should reset in-memory data', () => {
      service['streets'].set('1', {
        id: '1',
        name: 'Test Street',
        type: StreetType.Residential,
        coordinates: [],
        isExplored: false,
      });

      service.reset();

      expect(service.getAllStreets()).toHaveLength(0);
      expect(service.getAllIntersections()).toHaveLength(0);
    });
  });
});
