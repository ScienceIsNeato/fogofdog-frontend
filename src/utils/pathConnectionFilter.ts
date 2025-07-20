/**
 * Filters GPS path connections to prevent inappropriate line drawing.
 *
 * Rules applied:
 * A) Only connects points that are adjacent in time-sorted order
 * B) Rejects connections with time gaps >120 seconds
 * C) Rejects connections requiring travel speeds >100 mph
 */

import { GeoPoint } from '../types/user';

export interface PathSegment {
  start: GeoPoint;
  end: GeoPoint;
}

/**
 * Calculates the Haversine distance between two geographic points in meters
 */
function calculateDistance(point1: GeoPoint, point2: GeoPoint): number {
  const R = 6371000; // Earth's radius in meters
  const φ1 = (point1.latitude * Math.PI) / 180;
  const φ2 = (point2.latitude * Math.PI) / 180;
  const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

/**
 * Calculates travel speed between two points in mph
 */
function calculateSpeed(point1: GeoPoint, point2: GeoPoint): number {
  const distanceMeters = calculateDistance(point1, point2);
  const timeDiffSeconds = Math.abs(point2.timestamp - point1.timestamp) / 1000;

  if (timeDiffSeconds === 0) return 0;

  const speedMps = distanceMeters / timeDiffSeconds; // meters per second
  // convert to mph

  return speedMps * 2.237;
}

/**
 * Determines if two points should be connected based on filtering rules
 */
function shouldConnect(point1: GeoPoint, point2: GeoPoint): { connect: boolean; reason?: string } {
  // Rule B: Check time gap (120 seconds = 2 minutes)
  const timeDiffSeconds = Math.abs(point2.timestamp - point1.timestamp) / 1000;
  if (timeDiffSeconds > 120) {
    return {
      connect: false,
      reason: `Time gap too large: ${timeDiffSeconds.toFixed(1)}s (max: 120s)`,
    };
  }

  // Rule C: Check travel speed (100 mph limit)
  const speed = calculateSpeed(point1, point2);
  if (speed > 100) {
    return {
      connect: false,
      reason: `Speed too high: ${speed.toFixed(1)}mph (max: 100mph)`,
    };
  }

  return { connect: true };
}

/**
 * Logs connection decision details
 */
function logConnectionDecision(
  point1: GeoPoint,
  point2: GeoPoint,
  decision: { connect: boolean; reason?: string }
): void {
  const distance = calculateDistance(point1, point2);
  const speed = calculateSpeed(point1, point2);
  const timeDiff = Math.abs(point2.timestamp - point1.timestamp) / 1000;

  if (decision.connect) {
    // eslint-disable-next-line no-console
    console.log(
      `✅ Connecting points: ${distance.toFixed(1)}m, ${speed.toFixed(1)}mph, ${timeDiff.toFixed(1)}s`
    );
  } else {
    // eslint-disable-next-line no-console
    console.log(
      `❌ Rejecting connection: ${decision.reason} (${distance.toFixed(1)}m, ${speed.toFixed(1)}mph, ${timeDiff.toFixed(1)}s)`
    );
  }
}

/**
 * Main filtering function that processes GPS path points and returns valid segments
 */
export class PathConnectionFilter {
  static filterPathConnections(points: GeoPoint[]): PathSegment[] {
    // Filter out null/undefined points and ensure all points have required properties
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

    if (validPoints.length < 2) {
      return [];
    }

    // Sort points by timestamp to ensure chronological order
    const sortedPoints = [...validPoints].sort((a, b) => a.timestamp - b.timestamp);

    const segments: PathSegment[] = [];

    // Process adjacent pairs in chronological order (Rule A)
    for (let i = 0; i < sortedPoints.length - 1; i++) {
      const currentPoint = sortedPoints[i];
      const nextPoint = sortedPoints[i + 1];

      // Safety check to ensure points exist
      if (!currentPoint || !nextPoint) continue;

      const decision = shouldConnect(currentPoint, nextPoint);

      // Log the decision for debugging
      logConnectionDecision(currentPoint, nextPoint, decision);

      if (decision.connect) {
        segments.push({
          start: currentPoint,
          end: nextPoint,
        });
      }
    }

    // eslint-disable-next-line no-console
    console.log(
      `📊 PathConnectionFilter: ${segments.length}/${sortedPoints.length - 1} connections approved`
    );

    return segments;
  }
}

// Export the main filtering function as a standalone function for convenience
export const filterPathConnections = PathConnectionFilter.filterPathConnections;
