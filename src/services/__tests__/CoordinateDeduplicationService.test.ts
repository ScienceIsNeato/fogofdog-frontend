import { CoordinateDeduplicationService, globalGPSEvents } from '../CoordinateDeduplicationService';
import { StoredLocationData } from '../LocationStorageService';
import { GPSEvent } from '../../types/GPSEvent';

// Mock the logger to avoid console output during tests
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('CoordinateDeduplicationService', () => {
  beforeEach(() => {
    // Clear the global GPS events queue before each test
    CoordinateDeduplicationService.clearDuplicateHistory();
  });

  describe('isWithinRange', () => {
    it('should return true for coordinates exactly 10m apart', () => {
      const coord1: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      // Calculate a point approximately 9m north (should be within 10m)
      const coord2: StoredLocationData = {
        latitude: 37.788331, // ~9m north
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      const result = CoordinateDeduplicationService.isWithinRange(coord1, coord2, 10);
      expect(result).toBe(true);
    });

    it('should return false for coordinates more than 10m apart', () => {
      const coord1: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      // Calculate a point approximately 50m north
      const coord2: StoredLocationData = {
        latitude: 37.789, // ~50m+ north
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      const result = CoordinateDeduplicationService.isWithinRange(coord1, coord2, 10);
      expect(result).toBe(false);
    });

    it('should handle identical coordinates', () => {
      const coord: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      const result = CoordinateDeduplicationService.isWithinRange(coord, coord, 10);
      expect(result).toBe(true);
    });
  });

  describe('shouldProcessCoordinate', () => {
    it('should process the first coordinate', () => {
      const coord: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      const result = CoordinateDeduplicationService.shouldProcessCoordinate(coord);
      expect(result.shouldProcess).toBe(true);
      expect(result.wasAdded).toBe(true);
      expect(result.reason).toBe('Coordinate added to GPS events queue');
      expect(globalGPSEvents.size()).toBe(1);
    });

    it('should skip coordinates within 10m of previously processed coordinates', () => {
      const firstCoordinate = { latitude: 40.7128, longitude: -74.006, timestamp: Date.now() };
      const secondCoordinate = {
        latitude: 40.71285,
        longitude: -74.00605,
        timestamp: Date.now() + 1000,
      }; // About 5-6m apart, within 10m

      const firstResult = CoordinateDeduplicationService.shouldProcessCoordinate(firstCoordinate);
      expect(firstResult.shouldProcess).toBe(true);
      expect(firstResult.wasAdded).toBe(true);

      const secondResult = CoordinateDeduplicationService.shouldProcessCoordinate(secondCoordinate);
      expect(secondResult.shouldProcess).toBe(false);
      expect(secondResult.wasAdded).toBe(false);
      expect(secondResult.reason).toContain('within 10m of recent coordinate and <30s elapsed');
      expect(globalGPSEvents.size()).toBe(1); // Only first coordinate added
    });

    it('should process coordinates more than 10m away from any previous coordinate', () => {
      const firstCoord: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      // Coordinate far from the first one (more than 10m)
      const farCoord: StoredLocationData = {
        latitude: 37.7883,
        longitude: -122.4325,
        timestamp: Date.now() + 1000,
      };

      const firstResult = CoordinateDeduplicationService.shouldProcessCoordinate(firstCoord);
      expect(firstResult.shouldProcess).toBe(true);

      const secondResult = CoordinateDeduplicationService.shouldProcessCoordinate(farCoord);
      expect(secondResult.shouldProcess).toBe(true);
      expect(secondResult.wasAdded).toBe(true);
      expect(globalGPSEvents.size()).toBe(2); // Both coordinates added
    });
  });

  describe('GPS Events Queue Integration', () => {
    it('should add coordinates to the global GPS events queue', () => {
      const coord: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: 1234567890,
      };

      CoordinateDeduplicationService.shouldProcessCoordinate(coord);

      const latestEvent = globalGPSEvents.getLatest();
      expect(latestEvent).not.toBeNull();
      expect(latestEvent!.latitude).toBe(coord.latitude);
      expect(latestEvent!.longitude).toBe(coord.longitude);
      expect(latestEvent!.timestamp).toBe(coord.timestamp);
    });

    it('should maintain chronological order in the queue', () => {
      const coords: StoredLocationData[] = [
        { latitude: 37.78825, longitude: -122.4324, timestamp: 1000 },
        { latitude: 37.78835, longitude: -122.4334, timestamp: 2000 },
        { latitude: 37.78845, longitude: -122.4344, timestamp: 3000 },
      ];

      coords.forEach((coord) => {
        CoordinateDeduplicationService.shouldProcessCoordinate(coord);
      });

      const events = globalGPSEvents.toArray();
      expect(events).toHaveLength(3);
      expect(events[0]?.timestamp).toBe(1000);
      expect(events[1]?.timestamp).toBe(2000);
      expect(events[2]?.timestamp).toBe(3000);
    });

    it('should handle multiple different coordinate clusters', () => {
      // First cluster
      const coord1: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      // Second cluster (far from first)
      const coord2: StoredLocationData = {
        latitude: 37.78925, // About 100m north
        longitude: -122.4324,
        timestamp: Date.now() + 1000,
      };

      // Near first cluster (should be rejected)
      const nearCoord1: StoredLocationData = {
        latitude: 37.7883, // About 5m north of coord1
        longitude: -122.4324,
        timestamp: Date.now() + 2000,
      };

      // Near second cluster (should be rejected)
      const nearCoord2: StoredLocationData = {
        latitude: 37.7893, // About 5m north of coord2
        longitude: -122.4324,
        timestamp: Date.now() + 3000,
      };

      const result1 = CoordinateDeduplicationService.shouldProcessCoordinate(coord1);
      expect(result1.shouldProcess).toBe(true);

      const result2 = CoordinateDeduplicationService.shouldProcessCoordinate(coord2);
      expect(result2.shouldProcess).toBe(true);

      // Check nearby coordinates are properly rejected
      const nearResult1 = CoordinateDeduplicationService.shouldProcessCoordinate(nearCoord1);
      expect(nearResult1.shouldProcess).toBe(false);

      const nearResult2 = CoordinateDeduplicationService.shouldProcessCoordinate(nearCoord2);
      expect(nearResult2.shouldProcess).toBe(false);

      expect(globalGPSEvents.size()).toBe(2); // Only the two cluster centers
    });
  });

  describe('getGPSEvents', () => {
    it('should return the global GPS events queue', () => {
      const queue = CoordinateDeduplicationService.getGPSEvents();
      expect(queue).toBe(globalGPSEvents);
    });
  });

  describe('getDuplicateEntries', () => {
    it('should return GPS events from the queue', () => {
      const baseCoord: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      const nearbyCoord: StoredLocationData = {
        latitude: 37.78826,
        longitude: -122.43241,
        timestamp: Date.now() + 1000,
      };

      CoordinateDeduplicationService.shouldProcessCoordinate(baseCoord);
      CoordinateDeduplicationService.shouldProcessCoordinate(nearbyCoord); // Should be rejected

      const entries = CoordinateDeduplicationService.getDuplicateEntries();
      expect(entries).toHaveLength(1);
      expect(entries[0]).toBeInstanceOf(GPSEvent);
      expect(entries[0]?.latitude).toBe(baseCoord.latitude);
      expect(entries[0]?.longitude).toBe(baseCoord.longitude);
    });
  });

  describe('clearDuplicateHistory', () => {
    it('should clear all GPS events from the queue', () => {
      const coord: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      CoordinateDeduplicationService.shouldProcessCoordinate(coord);
      expect(globalGPSEvents.size()).toBe(1);

      CoordinateDeduplicationService.clearDuplicateHistory();
      expect(globalGPSEvents.size()).toBe(0);

      // Should be able to process the same coordinate again after clearing
      const freshResult = CoordinateDeduplicationService.shouldProcessCoordinate(coord);
      expect(freshResult.shouldProcess).toBe(true);
      expect(freshResult.wasAdded).toBe(true);
    });
  });

  describe('getDeduplicationStats', () => {
    it('should return correct statistics about the GPS events queue', () => {
      const coords: StoredLocationData[] = [
        { latitude: 37.78825, longitude: -122.4324, timestamp: 1000 },
        { latitude: 37.78835, longitude: -122.4334, timestamp: 2000 },
        { latitude: 37.78845, longitude: -122.4344, timestamp: 3000 },
      ];

      coords.forEach((coord) => {
        CoordinateDeduplicationService.shouldProcessCoordinate(coord);
      });

      const stats = CoordinateDeduplicationService.getDeduplicationStats();
      expect(stats.totalEventsInQueue).toBe(3);
      expect(stats.latestEvent?.timestamp).toBe(3000);
      expect(stats.queueTimeSpan).toBe(2000); // 3000 - 1000
    });

    it('should handle empty queue statistics', () => {
      const stats = CoordinateDeduplicationService.getDeduplicationStats();
      expect(stats.totalEventsInQueue).toBe(0);
      expect(stats.latestEvent).toBeNull();
      expect(stats.queueTimeSpan).toBe(0);
    });
  });

  describe('legacy compatibility methods', () => {
    describe('isWithinRange', () => {
      it('should check if two coordinates are within specified range', () => {
        const coord1: StoredLocationData = {
          latitude: 37.78825,
          longitude: -122.4324,
          timestamp: Date.now(),
        };

        const coord2: StoredLocationData = {
          latitude: 37.78826,
          longitude: -122.43241,
          timestamp: Date.now(),
        };

        const coord3: StoredLocationData = {
          latitude: 37.79825,
          longitude: -122.4424,
          timestamp: Date.now(),
        };

        expect(CoordinateDeduplicationService.isWithinRange(coord1, coord2, 100)).toBe(true);
        expect(CoordinateDeduplicationService.isWithinRange(coord1, coord3, 100)).toBe(false);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle coordinates with same location but different timestamps', () => {
      const coord1 = { latitude: 40.7128, longitude: -74.006, timestamp: 1000 };
      const coord2 = { latitude: 40.7128, longitude: -74.006, timestamp: 2000 }; // Same location

      const result1 = CoordinateDeduplicationService.shouldProcessCoordinate(coord1);
      expect(result1.shouldProcess).toBe(true);

      const result2 = CoordinateDeduplicationService.shouldProcessCoordinate(coord2);
      expect(result2.shouldProcess).toBe(false); // Same location, should be rejected
      expect(result2.reason).toContain('within 10m of recent coordinate and <30s elapsed');
    });

    it('should handle very small coordinate differences', () => {
      const coord1: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      // Very small difference (should be within 10m)
      const coord2: StoredLocationData = {
        latitude: 37.788251,
        longitude: -122.432401,
        timestamp: Date.now() + 1000,
      };

      const result1 = CoordinateDeduplicationService.shouldProcessCoordinate(coord1);
      expect(result1.shouldProcess).toBe(true);

      const result2 = CoordinateDeduplicationService.shouldProcessCoordinate(coord2);
      expect(result2.shouldProcess).toBe(false); // Should be within 10m range
      expect(result2.wasAdded).toBe(false);
    });

    it('should handle error scenarios gracefully', () => {
      // Mock an error in the GPS events queue
      const originalAppend = globalGPSEvents.append;
      globalGPSEvents.append = jest.fn().mockImplementation(() => {
        throw new Error('Test error');
      });

      const coord: StoredLocationData = {
        latitude: 37.78825,
        longitude: -122.4324,
        timestamp: Date.now(),
      };

      const result = CoordinateDeduplicationService.shouldProcessCoordinate(coord);
      expect(result.shouldProcess).toBe(true); // Should default to processing on error
      expect(result.wasAdded).toBe(false);
      expect(result.reason).toBe('Error occurred, defaulting to process');

      // Restore original method
      globalGPSEvents.append = originalAppend;
    });
  });

  describe('shouldProcessCoordinate with time-based deduplication', () => {
    beforeEach(() => {
      // Clear the global GPS events queue before each test
      globalGPSEvents.clear();
    });

    it('should process first coordinate', () => {
      const coordinate = { latitude: 40.7128, longitude: -74.006, timestamp: Date.now() };
      const result = CoordinateDeduplicationService.shouldProcessCoordinate(coordinate);

      expect(result.shouldProcess).toBe(true);
      expect(result.wasAdded).toBe(true);
      expect(result.reason).toBe('Coordinate added to GPS events queue');
    });

    it('should reject coordinates within 10m and 30s time window', () => {
      const coordinate1 = { latitude: 40.7128, longitude: -74.006, timestamp: Date.now() };
      const coordinate2 = {
        latitude: 40.71285,
        longitude: -74.00605,
        timestamp: Date.now() + 1000,
      }; // ~5-6m away

      // Process first coordinate
      CoordinateDeduplicationService.shouldProcessCoordinate(coordinate1);

      // Process second coordinate immediately (within time window)
      const result = CoordinateDeduplicationService.shouldProcessCoordinate(coordinate2);

      expect(result.shouldProcess).toBe(false);
      expect(result.wasAdded).toBe(false);
      expect(result.reason).toContain('within 10m of recent coordinate and <30s elapsed');
    });

    it('should accept coordinates within 10m but outside 30s time window', () => {
      const coordinate1 = { latitude: 40.7128, longitude: -74.006, timestamp: 1000 };
      const coordinate2 = { latitude: 40.71285, longitude: -74.00605, timestamp: 32000 }; // ~5-6m away

      // Mock Date.now to simulate time passing
      const originalNow = Date.now;
      let currentTime = 1000;
      Date.now = jest.fn(() => currentTime);

      try {
        // Process first coordinate
        CoordinateDeduplicationService.shouldProcessCoordinate(coordinate1);

        // Advance time by 31 seconds
        currentTime += 31000;

        // Process second coordinate (same location, but after time window)
        const result = CoordinateDeduplicationService.shouldProcessCoordinate(coordinate2);

        expect(result.shouldProcess).toBe(true);
        expect(result.wasAdded).toBe(true);
        expect(result.reason).toBe('Coordinate added to GPS events queue');
      } finally {
        Date.now = originalNow;
      }
    });

    it('should accept coordinates >10m away regardless of time', () => {
      const coordinate1 = { latitude: 40.7128, longitude: -74.006, timestamp: Date.now() };
      const coordinate2 = { latitude: 40.714, longitude: -74.007, timestamp: Date.now() + 1000 }; // ~100m away

      // Process first coordinate
      CoordinateDeduplicationService.shouldProcessCoordinate(coordinate1);

      // Process second coordinate immediately (far away)
      const result = CoordinateDeduplicationService.shouldProcessCoordinate(coordinate2);

      expect(result.shouldProcess).toBe(true);
      expect(result.wasAdded).toBe(true);
      expect(result.reason).toBe('Coordinate added to GPS events queue');
    });

    it('should allow walking in circles after time window expires', () => {
      const startLocation = { latitude: 40.7128, longitude: -74.006, timestamp: 1000 };
      const farLocation = { latitude: 40.714, longitude: -74.007, timestamp: 6000 }; // ~100m away
      const backToStart = { latitude: 40.71285, longitude: -74.00605, timestamp: 37000 }; // ~5-6m from start

      // Mock Date.now to control time
      const originalNow = Date.now;
      let currentTime = 1000;
      Date.now = jest.fn(() => currentTime);

      try {
        // Start at location 1
        CoordinateDeduplicationService.shouldProcessCoordinate(startLocation);

        // Move to far location (should be accepted)
        currentTime += 5000; // 5 seconds later
        const result1 = CoordinateDeduplicationService.shouldProcessCoordinate(farLocation);
        expect(result1.shouldProcess).toBe(true);

        // Return close to start location after time window expires
        currentTime += 31000; // 31 seconds later (36 seconds total)
        const result2 = CoordinateDeduplicationService.shouldProcessCoordinate(backToStart);
        expect(result2.shouldProcess).toBe(true);
        expect(result2.wasAdded).toBe(true);
        expect(result2.reason).toBe('Coordinate added to GPS events queue');
      } finally {
        Date.now = originalNow;
      }
    });

    it('should check against all events within time window, not just latest', () => {
      const coordinate1 = { latitude: 40.7128, longitude: -74.006, timestamp: 1000 };
      const coordinate2 = { latitude: 40.714, longitude: -74.007, timestamp: 6000 }; // Far from coordinate1
      const coordinate3 = { latitude: 40.71285, longitude: -74.00605, timestamp: 16000 }; // Close to coordinate1

      // Mock Date.now to control time
      const originalNow = Date.now;
      let currentTime = 1000;
      Date.now = jest.fn(() => currentTime);

      try {
        // Add first coordinate
        CoordinateDeduplicationService.shouldProcessCoordinate(coordinate1);

        // Add second coordinate (far away)
        currentTime += 5000;
        CoordinateDeduplicationService.shouldProcessCoordinate(coordinate2);

        // Try to add third coordinate (close to first, within time window)
        currentTime += 10000; // 15 seconds total from first coordinate
        const result = CoordinateDeduplicationService.shouldProcessCoordinate(coordinate3);

        expect(result.shouldProcess).toBe(false);
        expect(result.wasAdded).toBe(false);
        expect(result.reason).toContain('within 10m of recent coordinate and <30s elapsed');
      } finally {
        Date.now = originalNow;
      }
    });
  });
});
