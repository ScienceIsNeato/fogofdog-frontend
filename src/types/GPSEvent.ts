/**
 * GPSEvent represents a single GPS coordinate event with timestamp
 * Simple data structure for GPS coordinates
 */
export class GPSEvent {
  public readonly latitude: number;
  public readonly longitude: number;
  public readonly timestamp: number;

  constructor(latitude: number, longitude: number, timestamp?: number) {
    this.latitude = latitude;
    this.longitude = longitude;
    this.timestamp = timestamp ?? Date.now();
  }

  /**
   * Calculate distance to another GPS event using Haversine formula
   */
  distanceTo(other: GPSEvent): number {
    const R = 6371000; // Earth's radius in meters
    const lat1Rad = (this.latitude * Math.PI) / 180;
    const lat2Rad = (other.latitude * Math.PI) / 180;
    const deltaLatRad = ((other.latitude - this.latitude) * Math.PI) / 180;
    const deltaLonRad = ((other.longitude - this.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c;
  }

  /**
   * Check if this event is within a certain distance of another event
   */
  isWithinDistance(other: GPSEvent, maxDistanceMeters: number): boolean {
    return this.distanceTo(other) <= maxDistanceMeters;
  }

  /**
   * Convert to a simple coordinate object for compatibility
   */
  toCoordinate(): { latitude: number; longitude: number } {
    return {
      latitude: this.latitude,
      longitude: this.longitude,
    };
  }

  /**
   * Convert to a location data object with timestamp for compatibility
   */
  toLocationData(): { latitude: number; longitude: number; timestamp: number } {
    return {
      latitude: this.latitude,
      longitude: this.longitude,
      timestamp: this.timestamp,
    };
  }

  /**
   * Create a GPSEvent from existing coordinate data
   */
  static fromCoordinate(
    coordinate: { latitude: number; longitude: number },
    timestamp?: number
  ): GPSEvent {
    return new GPSEvent(coordinate.latitude, coordinate.longitude, timestamp);
  }

  /**
   * Create a GPSEvent from existing location data
   */
  static fromLocationData(locationData: {
    latitude: number;
    longitude: number;
    timestamp: number;
  }): GPSEvent {
    return new GPSEvent(locationData.latitude, locationData.longitude, locationData.timestamp);
  }
}

/**
 * GPSEvents manages a queue of GPS events with built-in time-based deduplication
 * All GPS coordinates from any source should flow through this queue
 * Deduplication only occurs for coordinates that are both close in distance AND time
 */
export class GPSEvents {
  private events: GPSEvent[] = [];
  private readonly maxEvents: number;
  private readonly deduplicationDistanceMeters: number;
  private readonly deduplicationTimeWindowMs: number;

  constructor(
    maxEvents: number = 1000,
    deduplicationDistanceMeters: number = 10,
    deduplicationTimeWindowMs: number = 30000 // 30 seconds
  ) {
    this.maxEvents = maxEvents;
    this.deduplicationDistanceMeters = deduplicationDistanceMeters;
    this.deduplicationTimeWindowMs = deduplicationTimeWindowMs;
  }

  /**
   * Append a GPS event to the queue
   * Returns false if the event was rejected due to being too close to a recent event
   * (both in distance AND time)
   */
  append(event: GPSEvent): boolean {
    // Check if this event is too close to any recent event (within time window)
    const currentTime = event.timestamp;

    for (const existingEvent of this.events) {
      const timeDiff = Math.abs(currentTime - existingEvent.timestamp);

      // Only check distance if the events are within the time window
      if (
        timeDiff <= this.deduplicationTimeWindowMs &&
        event.isWithinDistance(existingEvent, this.deduplicationDistanceMeters)
      ) {
        return false; // Reject duplicate (close in both space and time)
      }
    }

    // Add the event to the queue
    this.events.push(event);

    // Maintain max size by removing oldest events
    if (this.events.length > this.maxEvents) {
      this.events.shift();
    }

    return true; // Event was added
  }

  /**
   * Get the most recent GPS event
   */
  getLatest(): GPSEvent | null {
    return this.events.length > 0 ? this.events[this.events.length - 1]! : null;
  }

  /**
   * Get the previous GPS event (second to last)
   */
  getPrevious(): GPSEvent | null {
    return this.events.length > 1 ? this.events[this.events.length - 2]! : null;
  }

  /**
   * Get the first GPS event in the queue
   */
  getFirst(): GPSEvent | null {
    return this.events.length > 0 ? this.events[0]! : null;
  }

  /**
   * Get all events as an array (oldest to newest)
   */
  toArray(): GPSEvent[] {
    return [...this.events];
  }

  /**
   * Get all events in chronological order (sorted by timestamp)
   */
  getChronologicalArray(): GPSEvent[] {
    return [...this.events].sort((a, b) => a.timestamp - b.timestamp);
  }

  /**
   * Get the number of events in the queue
   */
  size(): number {
    return this.events.length;
  }

  /**
   * Check if the queue is empty
   */
  isEmpty(): boolean {
    return this.events.length === 0;
  }

  /**
   * Clear all events from the queue
   */
  clear(): void {
    this.events = [];
  }

  /**
   * Get events within a certain time range
   */
  getEventsInTimeRange(startTime: number, endTime: number): GPSEvent[] {
    return this.events.filter(
      (event) => event.timestamp >= startTime && event.timestamp <= endTime
    );
  }

  /**
   * Get the last N events
   */
  getLastN(n: number): GPSEvent[] {
    return this.events.slice(-n);
  }

  /**
   * Create a GPSEvents queue from an array of coordinates
   */
  static fromCoordinates(
    coordinates: { latitude: number; longitude: number; timestamp?: number }[],
    maxEvents?: number,
    deduplicationDistanceMeters?: number
  ): GPSEvents {
    const queue = new GPSEvents(maxEvents, deduplicationDistanceMeters);

    coordinates.forEach((coord) => {
      const event = new GPSEvent(coord.latitude, coord.longitude, coord.timestamp);
      queue.append(event);
    });

    return queue;
  }
}
