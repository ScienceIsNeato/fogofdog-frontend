import { GPSEvent, GPSEvents } from '../GPSEvent';

describe('GPSEvent', () => {
  let event1: GPSEvent;

  beforeEach(() => {
    event1 = new GPSEvent(40.7128, -74.006, 1000);
  });

  describe('Constructor', () => {
    it('should create a GPSEvent with provided coordinates and timestamp', () => {
      const event = new GPSEvent(40.7128, -74.006, 1234567890);

      expect(event.latitude).toBe(40.7128);
      expect(event.longitude).toBe(-74.006);
      expect(event.timestamp).toBe(1234567890);
    });

    it('should use current timestamp if not provided', () => {
      const mockTimestamp = 1234567890;
      jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

      const event = new GPSEvent(40.7128, -74.006);

      expect(event.timestamp).toBe(mockTimestamp);

      jest.restoreAllMocks();
    });
  });

  describe('Distance Calculations', () => {
    it('should calculate distance between two events correctly', () => {
      // Distance between NYC and Times Square (approximately 4.5km)
      const nyc = new GPSEvent(40.7128, -74.006);
      const timesSquare = new GPSEvent(40.7589, -73.9851);

      const distance = nyc.distanceTo(timesSquare);

      expect(distance).toBeGreaterThan(4000);
      expect(distance).toBeLessThan(6000);
    });

    it('should return 0 distance for same coordinates', () => {
      const event1 = new GPSEvent(40.7128, -74.006);
      const event2 = new GPSEvent(40.7128, -74.006);

      const distance = event1.distanceTo(event2);

      expect(distance).toBe(0);
    });

    it('should check if events are within specified distance', () => {
      const event1 = new GPSEvent(40.7128, -74.006);
      const event2 = new GPSEvent(40.7129, -74.0061); // Very close

      expect(event1.isWithinDistance(event2, 100)).toBe(true);
      expect(event1.isWithinDistance(event2, 10)).toBe(false);
    });
  });

  describe('Conversion Methods', () => {
    it('should convert to coordinate object', () => {
      const coordinate = event1.toCoordinate();

      expect(coordinate).toEqual({
        latitude: 40.7128,
        longitude: -74.006,
      });
    });

    it('should convert to location data object', () => {
      const locationData = event1.toLocationData();

      expect(locationData).toEqual({
        latitude: 40.7128,
        longitude: -74.006,
        timestamp: 1000,
      });
    });
  });

  describe('Static Factory Methods', () => {
    describe('fromCoordinate', () => {
      it('should create GPSEvent from coordinate object', () => {
        const coordinate = { latitude: 40.7128, longitude: -74.006 };
        const event = GPSEvent.fromCoordinate(coordinate, 1234567890);

        expect(event.latitude).toBe(40.7128);
        expect(event.longitude).toBe(-74.006);
        expect(event.timestamp).toBe(1234567890);
      });

      it('should use current timestamp if not provided', () => {
        const mockTimestamp = 1234567890;
        jest.spyOn(Date, 'now').mockReturnValue(mockTimestamp);

        const coordinate = { latitude: 40.7128, longitude: -74.006 };
        const event = GPSEvent.fromCoordinate(coordinate);

        expect(event.timestamp).toBe(mockTimestamp);

        jest.restoreAllMocks();
      });
    });

    describe('fromLocationData', () => {
      it('should create GPSEvent from location data object', () => {
        const locationData = {
          latitude: 40.7128,
          longitude: -74.006,
          timestamp: 1234567890,
        };
        const event = GPSEvent.fromLocationData(locationData);

        expect(event.latitude).toBe(40.7128);
        expect(event.longitude).toBe(-74.006);
        expect(event.timestamp).toBe(1234567890);
      });
    });
  });
});

describe('GPSEvents', () => {
  let queue: GPSEvents;

  beforeEach(() => {
    queue = new GPSEvents(5, 10); // Max 5 events, 10m deduplication
  });

  describe('Constructor', () => {
    it('should create empty queue with default settings', () => {
      const queue = new GPSEvents();

      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });

    it('should create queue with custom settings', () => {
      const queue = new GPSEvents(100, 20);

      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });
  });

  describe('append with time-based deduplication', () => {
    it('should add first event', () => {
      const event = new GPSEvent(40.7128, -74.006, 1000);
      const result = queue.append(event);

      expect(result).toBe(true);
      expect(queue.size()).toBe(1);
    });

    it('should reject duplicate coordinates within time window', () => {
      const event1 = new GPSEvent(40.7128, -74.006, 1000);
      const event2 = new GPSEvent(40.7128, -74.006, 15000); // 14 seconds later, same location

      queue.append(event1);
      const result = queue.append(event2);

      expect(result).toBe(false);
      expect(queue.size()).toBe(1);
    });

    it('should accept duplicate coordinates outside time window', () => {
      const event1 = new GPSEvent(40.7128, -74.006, 1000);
      const event2 = new GPSEvent(40.7128, -74.006, 32000); // 31 seconds later, same location

      queue.append(event1);
      const result = queue.append(event2);

      expect(result).toBe(true);
      expect(queue.size()).toBe(2);
    });

    it('should reject coordinates within 10m and within time window', () => {
      const event1 = new GPSEvent(40.7128, -74.006, 1000);
      const event2 = new GPSEvent(40.71285, -74.00605, 15000); // ~5-6m away, 14 seconds later

      queue.append(event1);
      const result = queue.append(event2);

      expect(result).toBe(false);
      expect(queue.size()).toBe(1);
    });

    it('should accept coordinates within 10m but outside time window', () => {
      const event1 = new GPSEvent(40.7128, -74.006, 1000);
      const event2 = new GPSEvent(40.7129, -74.0061, 32000); // ~8m away, 31 seconds later

      queue.append(event1);
      const result = queue.append(event2);

      expect(result).toBe(true);
      expect(queue.size()).toBe(2);
    });

    it('should accept coordinates >10m away regardless of time', () => {
      const event1 = new GPSEvent(40.7128, -74.006, 1000);
      const event2 = new GPSEvent(40.714, -74.007, 5000); // ~100m away, 4 seconds later

      queue.append(event1);
      const result = queue.append(event2);

      expect(result).toBe(true);
      expect(queue.size()).toBe(2);
    });

    it('should check against all events within time window, not just the latest', () => {
      const event1 = new GPSEvent(40.7128, -74.006, 1000);
      const event2 = new GPSEvent(40.714, -74.007, 5000); // Far from event1
      const event3 = new GPSEvent(40.71285, -74.00605, 15000); // Close to event1, within time window

      queue.append(event1);
      queue.append(event2);
      const result = queue.append(event3);

      expect(result).toBe(false); // Should be rejected due to proximity to event1
      expect(queue.size()).toBe(2);
    });

    it('should accept coordinates close to old events outside time window', () => {
      const event1 = new GPSEvent(40.7128, -74.006, 1000);
      const event2 = new GPSEvent(40.714, -74.007, 5000); // Far from event1
      const event3 = new GPSEvent(40.7129, -74.0061, 35000); // Close to event1, but outside time window

      queue.append(event1);
      queue.append(event2);
      const result = queue.append(event3);

      expect(result).toBe(true); // Should be accepted - allows walking in circles
      expect(queue.size()).toBe(3);
    });

    it('should use custom time window when provided', () => {
      const customQueue = new GPSEvents(1000, 10, 10000); // 10 second time window
      const event1 = new GPSEvent(40.7128, -74.006, 1000);
      const event2 = new GPSEvent(40.7128, -74.006, 12000); // 11 seconds later, same location

      customQueue.append(event1);
      const result = customQueue.append(event2);

      expect(result).toBe(true); // Should be accepted with shorter time window
      expect(customQueue.size()).toBe(2);
    });

    it('should maintain max size by removing oldest events', () => {
      const events = [
        new GPSEvent(40.7128, -74.006, 1000),
        new GPSEvent(40.7589, -73.9851, 2000),
        new GPSEvent(40.6892, -74.0445, 3000),
        new GPSEvent(40.7505, -73.9934, 4000),
        new GPSEvent(40.7614, -73.9776, 5000),
        new GPSEvent(40.7831, -73.9712, 6000), // This should push out the first
      ];

      events.forEach((event) => queue.append(event));

      expect(queue.size()).toBe(5); // Max size
      expect(queue.getFirst()?.timestamp).toBe(2000); // First event removed
      expect(queue.getLatest()?.timestamp).toBe(6000);
    });
  });

  describe('Queue Operations', () => {
    beforeEach(() => {
      // Add some test events
      queue.append(new GPSEvent(40.7128, -74.006, 1000));
      queue.append(new GPSEvent(40.7589, -73.9851, 2000));
      queue.append(new GPSEvent(40.6892, -74.0445, 3000));
    });

    it('should get latest event', () => {
      const latest = queue.getLatest();

      expect(latest?.timestamp).toBe(3000);
      expect(latest?.latitude).toBe(40.6892);
    });

    it('should get previous event', () => {
      const previous = queue.getPrevious();

      expect(previous?.timestamp).toBe(2000);
      expect(previous?.latitude).toBe(40.7589);
    });

    it('should get first event', () => {
      const first = queue.getFirst();

      expect(first?.timestamp).toBe(1000);
      expect(first?.latitude).toBe(40.7128);
    });

    it('should return null for empty queue operations', () => {
      const emptyQueue = new GPSEvents();

      expect(emptyQueue.getLatest()).toBeNull();
      expect(emptyQueue.getPrevious()).toBeNull();
      expect(emptyQueue.getFirst()).toBeNull();
    });

    it('should handle single event queue', () => {
      const singleQueue = new GPSEvents();
      const event = new GPSEvent(40.7128, -74.006);
      singleQueue.append(event);

      expect(singleQueue.getLatest()).toBe(event);
      expect(singleQueue.getPrevious()).toBeNull();
      expect(singleQueue.getFirst()).toBe(event);
    });
  });

  describe('Array Operations', () => {
    beforeEach(() => {
      queue.append(new GPSEvent(40.7128, -74.006, 3000)); // Third chronologically
      queue.append(new GPSEvent(40.7589, -73.9851, 1000)); // First chronologically
      queue.append(new GPSEvent(40.6892, -74.0445, 2000)); // Second chronologically
    });

    it('should convert to array in insertion order', () => {
      const array = queue.toArray();

      expect(array).toHaveLength(3);
      expect(array[0]?.timestamp).toBe(3000);
      expect(array[1]?.timestamp).toBe(1000);
      expect(array[2]?.timestamp).toBe(2000);
    });

    it('should get chronological array sorted by timestamp', () => {
      const chronological = queue.getChronologicalArray();

      expect(chronological).toHaveLength(3);
      expect(chronological[0]?.timestamp).toBe(1000);
      expect(chronological[1]?.timestamp).toBe(2000);
      expect(chronological[2]?.timestamp).toBe(3000);
    });

    it('should get last N events', () => {
      const lastTwo = queue.getLastN(2);

      expect(lastTwo).toHaveLength(2);
      expect(lastTwo[0]?.timestamp).toBe(1000);
      expect(lastTwo[1]?.timestamp).toBe(2000);
    });

    it('should handle getLastN with count larger than queue size', () => {
      const lastTen = queue.getLastN(10);

      expect(lastTen).toHaveLength(3); // Only 3 events in queue
    });
  });

  describe('Time Range Operations', () => {
    beforeEach(() => {
      queue.append(new GPSEvent(40.7128, -74.006, 1000));
      queue.append(new GPSEvent(40.7589, -73.9851, 2000));
      queue.append(new GPSEvent(40.6892, -74.0445, 3000));
      queue.append(new GPSEvent(40.7505, -73.9934, 4000));
    });

    it('should get events in time range', () => {
      const eventsInRange = queue.getEventsInTimeRange(1500, 3500);

      expect(eventsInRange).toHaveLength(2);
      expect(eventsInRange[0]?.timestamp).toBe(2000);
      expect(eventsInRange[1]?.timestamp).toBe(3000);
    });

    it('should return empty array for time range with no events', () => {
      const eventsInRange = queue.getEventsInTimeRange(5000, 6000);

      expect(eventsInRange).toHaveLength(0);
    });
  });

  describe('Utility Methods', () => {
    it('should clear all events', () => {
      queue.append(new GPSEvent(40.7128, -74.006));
      queue.append(new GPSEvent(40.7589, -73.9851));

      expect(queue.size()).toBe(2);

      queue.clear();

      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });

    it('should report correct size and empty status', () => {
      expect(queue.isEmpty()).toBe(true);
      expect(queue.size()).toBe(0);

      queue.append(new GPSEvent(40.7128, -74.006));

      expect(queue.isEmpty()).toBe(false);
      expect(queue.size()).toBe(1);
    });
  });

  describe('Static Factory Methods', () => {
    it('should create queue from coordinates array', () => {
      const coordinates = [
        { latitude: 40.7128, longitude: -74.006, timestamp: 1000 },
        { latitude: 40.7589, longitude: -73.9851, timestamp: 2000 },
        { latitude: 40.6892, longitude: -74.0445, timestamp: 3000 },
      ];

      const queue = GPSEvents.fromCoordinates(coordinates);

      expect(queue.size()).toBe(3);
      expect(queue.getFirst()?.timestamp).toBe(1000);
      expect(queue.getLatest()?.timestamp).toBe(3000);
    });

    it('should create queue with custom settings from coordinates', () => {
      const coordinates = [
        { latitude: 40.7128, longitude: -74.006 },
        { latitude: 40.7589, longitude: -73.9851 },
      ];

      const queue = GPSEvents.fromCoordinates(coordinates, 10, 5);

      expect(queue.size()).toBe(2);
    });

    it('should handle empty coordinates array', () => {
      const queue = GPSEvents.fromCoordinates([]);

      expect(queue.size()).toBe(0);
      expect(queue.isEmpty()).toBe(true);
    });
  });
});
