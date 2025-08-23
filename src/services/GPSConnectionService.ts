/**
 * Unified GPS Connection Service
 *
 * This service provides the single source of truth for GPS point connections
 * and session boundaries. All rendering and calculation logic should use this
 * service to ensure consistency across the application.
 */

import { GeoPoint } from '../types/user';
import { GPSEvent } from '../types/GPSEvent';
import { GPS_CONSTANTS } from '../config/appConstants';
import { logger } from '../utils/logger';

/**
 * Enhanced GPS point with connection metadata
 */
export interface ProcessedGPSPoint extends GeoPoint {
  /** Whether this point connects to the previous point */
  connectsToPrevious: boolean;
  /** Whether this point starts a new session */
  startsNewSession: boolean;
  /** Reason for disconnection if connectsToPrevious is false */
  disconnectionReason?: string;
}

/**
 * GPS segment representing connected points within a session
 */
export interface GPSSegment {
  start: ProcessedGPSPoint;
  end: ProcessedGPSPoint;
  distance: number; // Pre-calculated distance in meters
}

/**
 * Connection decision with reasoning
 */
interface ConnectionDecision {
  connect: boolean;
  reason?: string;
}

/**
 * Unified GPS Connection Service
 *
 * Processes raw GPS points and determines connections based on:
 * - Time gaps (max 120 seconds between points)
 * - Speed limits (max 100 mph between points) - prevents "cheating"
 * - Distance jumps (max 2km between points) - catches GPS errors/jumps
 *
 * Adds session markers when connections are broken.
 */
export class GPSConnectionService {
  // Connection thresholds (unified from pathConnectionFilter and StatsCalculationService)
  private static readonly MAX_TIME_GAP_SECONDS = 120; // 2 minutes
  private static readonly MAX_SPEED_MPH = 100; // 100 mph - prevents "cheating" by connecting unrealistic movement
  private static readonly MAX_DISTANCE_JUMP_METERS = 2000; // 2km - catches GPS errors/jumps, allows reasonable city movement

  /**
   * Calculate Haversine distance between two points in meters
   */
  private static calculateDistance(point1: GeoPoint, point2: GeoPoint): number {
    const lat1Rad = (point1.latitude * Math.PI) / 180;
    const lat2Rad = (point2.latitude * Math.PI) / 180;
    const deltaLatRad = ((point2.latitude - point1.latitude) * Math.PI) / 180;
    const deltaLonRad = ((point2.longitude - point1.longitude) * Math.PI) / 180;

    const a =
      Math.sin(deltaLatRad / 2) * Math.sin(deltaLatRad / 2) +
      Math.cos(lat1Rad) * Math.cos(lat2Rad) * Math.sin(deltaLonRad / 2) * Math.sin(deltaLonRad / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return GPS_CONSTANTS.EARTH_RADIUS_METERS * c;
  }

  /**
   * Calculate travel speed between two points in mph
   */
  private static calculateSpeed(point1: GeoPoint, point2: GeoPoint): number {
    const distanceMeters = this.calculateDistance(point1, point2);
    const timeDiffSeconds = Math.abs(point2.timestamp - point1.timestamp) / 1000;

    if (timeDiffSeconds === 0) return 0;

    const speedMps = distanceMeters / timeDiffSeconds; // meters per second
    return speedMps * 2.237; // convert to mph (1 m/s = 2.237 mph)
  }

  /**
   * Determine if two points should be connected based on unified rules
   */
  private static shouldConnect(point1: GeoPoint, point2: GeoPoint): ConnectionDecision {
    // Rule 1: Check time gap
    const timeDiffSeconds = Math.abs(point2.timestamp - point1.timestamp) / 1000;
    if (timeDiffSeconds > this.MAX_TIME_GAP_SECONDS) {
      return {
        connect: false,
        reason: `Time gap too large: ${timeDiffSeconds.toFixed(1)}s (max: ${this.MAX_TIME_GAP_SECONDS}s)`,
      };
    }

    // Rule 2: Check distance jump (safety filter)
    const distance = this.calculateDistance(point1, point2);
    if (distance > this.MAX_DISTANCE_JUMP_METERS) {
      return {
        connect: false,
        reason: `Distance jump too large: ${(distance / 1000).toFixed(1)}km (max: ${this.MAX_DISTANCE_JUMP_METERS / 1000}km)`,
      };
    }

    // Rule 3: Check travel speed
    const speed = this.calculateSpeed(point1, point2);
    if (speed > this.MAX_SPEED_MPH) {
      return {
        connect: false,
        reason: `Speed too high: ${speed.toFixed(1)}mph (max: ${this.MAX_SPEED_MPH}mph)`,
      };
    }

    // Rule 4: Check minimum movement (for meaningful connections)
    if (distance < GPS_CONSTANTS.MIN_MOVEMENT_THRESHOLD_METERS) {
      return {
        connect: false,
        reason: `Movement too small: ${distance.toFixed(1)}m (min: ${GPS_CONSTANTS.MIN_MOVEMENT_THRESHOLD_METERS}m)`,
      };
    }

    return { connect: true };
  }

  /**
   * Process GPS points and add connection metadata
   * This is the single source of truth for GPS connections
   */
  static processGPSPoints(points: GeoPoint[]): ProcessedGPSPoint[] {
    // Filter out invalid points
    const validPoints = points.filter(
      (point): point is GeoPoint =>
        point != null &&
        typeof point.latitude === 'number' &&
        typeof point.longitude === 'number' &&
        typeof point.timestamp === 'number' &&
        isFinite(point.latitude) &&
        isFinite(point.longitude) &&
        isFinite(point.timestamp)
    );

    if (validPoints.length === 0) {
      return [];
    }

    // Sort points by timestamp to ensure chronological order
    const sortedPoints = [...validPoints].sort((a, b) => a.timestamp - b.timestamp);

    const processedPoints: ProcessedGPSPoint[] = [];

    for (let i = 0; i < sortedPoints.length; i++) {
      const currentPoint = sortedPoints[i]!;
      let connectsToPrevious = false;
      let startsNewSession = false;
      let disconnectionReason: string | undefined;

      if (i === 0) {
        // First point always starts a new session
        startsNewSession = true;
      } else {
        const previousPoint = sortedPoints[i - 1]!;
        const decision = this.shouldConnect(previousPoint, currentPoint);

        connectsToPrevious = decision.connect;

        if (!decision.connect) {
          startsNewSession = true;
          disconnectionReason = decision.reason;

          logger.debug('GPS connection broken - new session started', {
            component: 'GPSConnectionService',
            action: 'processGPSPoints',
            reason: decision.reason,
            previousPoint: {
              lat: previousPoint.latitude.toFixed(6),
              lng: previousPoint.longitude.toFixed(6),
              timestamp: new Date(previousPoint.timestamp).toISOString(),
            },
            currentPoint: {
              lat: currentPoint.latitude.toFixed(6),
              lng: currentPoint.longitude.toFixed(6),
              timestamp: new Date(currentPoint.timestamp).toISOString(),
            },
          });
        }
      }

      processedPoints.push({
        ...currentPoint,
        connectsToPrevious,
        startsNewSession,
        ...(disconnectionReason ? { disconnectionReason } : {}),
      });
    }

    return processedPoints;
  }

  /**
   * Get connected segments from processed GPS points
   * Used for fog rendering and distance calculations
   */
  static getConnectedSegments(processedPoints: ProcessedGPSPoint[]): GPSSegment[] {
    const segments: GPSSegment[] = [];

    for (let i = 1; i < processedPoints.length; i++) {
      const currentPoint = processedPoints[i]!;
      const previousPoint = processedPoints[i - 1]!;

      if (currentPoint.connectsToPrevious) {
        const distance = this.calculateDistance(previousPoint, currentPoint);

        segments.push({
          start: previousPoint,
          end: currentPoint,
          distance,
        });
      }
    }

    return segments;
  }

  /**
   * Calculate total distance from processed points
   * Only counts connected segments
   */
  static calculateTotalDistance(processedPoints: ProcessedGPSPoint[]): number {
    const segments = this.getConnectedSegments(processedPoints);
    return segments.reduce((total, segment) => total + segment.distance, 0);
  }

  /**
   * Get session boundaries from processed points
   */
  static getSessionBoundaries(processedPoints: ProcessedGPSPoint[]): number[] {
    return processedPoints
      .map((point, index) => ({ point, index }))
      .filter(({ point }) => point.startsNewSession)
      .map(({ index }) => index);
  }

  /**
   * Convert GPSEvent to GeoPoint for processing
   */
  static gpsEventToGeoPoint(event: GPSEvent): GeoPoint {
    return {
      latitude: event.latitude,
      longitude: event.longitude,
      timestamp: event.timestamp,
    };
  }
}
