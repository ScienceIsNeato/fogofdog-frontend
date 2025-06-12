import { StoredLocationData } from './LocationStorageService';
import { logger } from '../utils/logger';
import { GPSEvent, GPSEvents } from '../types/GPSEvent';

export interface DeduplicationResult {
  shouldProcess: boolean;
  wasAdded: boolean;
  reason: string;
}

/**
 * Global GPS events queue - single source of truth for all GPS coordinates
 * All GPS coordinates from any source (device, simulator, CLI, etc.) flow through this queue
 * Uses time-based deduplication: only rejects coordinates that are within 10m AND within 30 seconds
 * This allows users to walk in circles and revisit locations while preventing rapid duplicate coordinates
 */
export const globalGPSEvents = new GPSEvents(1000, 10, 30000); // 1000 events max, 10m deduplication, 30s time window

/**
 * Service for managing GPS coordinate deduplication through the global GPS events queue
 * Simplified to work with the GPSEvents queue which handles deduplication internally
 */
export class CoordinateDeduplicationService {
  /**
   * Process a coordinate by attempting to add it to the global GPS events queue
   * Returns information about whether the coordinate was processed and added
   */
  static shouldProcessCoordinate(coordinate: StoredLocationData): DeduplicationResult {
    try {
      // Create a GPSEvent from the coordinate
      const gpsEvent = GPSEvent.fromLocationData(coordinate);

      // Attempt to add it to the global queue
      const wasAdded = globalGPSEvents.append(gpsEvent);

      if (wasAdded) {
        logger.info(
          `📍 Processing new GPS coordinate (>10m from recent coordinates or >30s elapsed)`,
          {
            component: 'CoordinateDeduplicationService',
            action: 'shouldProcessCoordinate',
            coordinate: `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`,
            totalEventsInQueue: globalGPSEvents.size(),
          }
        );

        return {
          shouldProcess: true,
          wasAdded: true,
          reason: 'Coordinate added to GPS events queue',
        };
      } else {
        const lastEvent = globalGPSEvents.getLatest();
        const distance = lastEvent ? gpsEvent.distanceTo(lastEvent) : 0;
        const timeDiff = lastEvent ? Math.abs(gpsEvent.timestamp - lastEvent.timestamp) : 0;

        logger.info(
          `📍 Skipping GPS coordinate (within 10m of recent coordinate and <30s elapsed)`,
          {
            component: 'CoordinateDeduplicationService',
            action: 'shouldProcessCoordinate',
            incomingCoordinate: `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`,
            lastCoordinate: lastEvent
              ? `${lastEvent.latitude.toFixed(6)}, ${lastEvent.longitude.toFixed(6)}`
              : 'none',
            distance: `${distance.toFixed(1)}m`,
            timeDiff: `${(timeDiff / 1000).toFixed(1)}s`,
            totalEventsInQueue: globalGPSEvents.size(),
          }
        );

        return {
          shouldProcess: false,
          wasAdded: false,
          reason: `Coordinate within 10m of recent coordinate and <30s elapsed (${distance.toFixed(1)}m, ${(timeDiff / 1000).toFixed(1)}s)`,
        };
      }
    } catch (error) {
      logger.error('Error in coordinate deduplication check', error, {
        component: 'CoordinateDeduplicationService',
        action: 'shouldProcessCoordinate',
        coordinate: `${coordinate.latitude.toFixed(6)}, ${coordinate.longitude.toFixed(6)}`,
      });

      // On error, default to processing the coordinate
      return {
        shouldProcess: true,
        wasAdded: false,
        reason: 'Error occurred, defaulting to process',
      };
    }
  }

  /**
   * Get the global GPS events queue for direct access
   */
  static getGPSEvents(): GPSEvents {
    return globalGPSEvents;
  }

  /**
   * Clear all GPS events (useful for testing or reset scenarios)
   */
  static clearDuplicateHistory(): void {
    globalGPSEvents.clear();
    logger.info('Cleared GPS coordinate deduplication history', {
      component: 'CoordinateDeduplicationService',
      action: 'clearDuplicateHistory',
    });
  }

  /**
   * Get statistics about the GPS events queue
   */
  static getDeduplicationStats(): {
    totalEventsInQueue: number;
    latestEvent: GPSEvent | null;
    queueTimeSpan: number;
  } {
    const latest = globalGPSEvents.getLatest();
    const first = globalGPSEvents.getFirst();

    const queueTimeSpan = latest && first ? latest.timestamp - first.timestamp : 0;

    return {
      totalEventsInQueue: globalGPSEvents.size(),
      latestEvent: latest,
      queueTimeSpan,
    };
  }

  /**
   * Legacy compatibility methods - these maintain the old interface
   * but now work with the new GPS events queue
   */

  /**
   * Check if two coordinates are within the specified range (in meters)
   */
  static isWithinRange(
    coord1: StoredLocationData,
    coord2: StoredLocationData,
    rangeMeters: number
  ): boolean {
    const event1 = GPSEvent.fromLocationData(coord1);
    const event2 = GPSEvent.fromLocationData(coord2);
    return event1.isWithinDistance(event2, rangeMeters);
  }

  /**
   * Get all GPS events for debugging/analysis
   */
  static getDuplicateEntries(): GPSEvent[] {
    return globalGPSEvents.toArray();
  }
}
