import { GeoPoint } from '../types/user';
import type { StreetSegment, Intersection, StreetPoint } from '../types/street';
import { closestPointOnSegment, haversineDistance } from '../services/StreetDataService';

/**
 * Performance test data generators for interactive testing
 * These can be used to inject different amounts of GPS data into the app
 */

// Eugene, Oregon South Hills area coordinates (as requested by user)
const BASE_COORDINATES = {
  latitude: 44.0462, // Eugene South Hills
  longitude: -123.0236,
};

// Different test patterns for various scenarios
export const TestPatterns = {
  SINGLE_POINT: 'single',
  RANDOM_WALK: 'random_walk',
  CIRCULAR_PATH: 'circular',
  GRID_PATTERN: 'grid',
  REALISTIC_DRIVE: 'realistic_drive',
  HIKING_TRAIL: 'hiking_trail',
  STREET_ALIGNED: 'street_aligned',
} as const;

export type TestPattern = (typeof TestPatterns)[keyof typeof TestPatterns];

/**
 * Generate realistic movement coordinates with natural path variations
 * Designed for walking/jogging speeds with organic direction changes
 */
const generateRealisticDriveCoordinates = (
  i: number,
  baseCoords: { latitude: number; longitude: number },
  points: GeoPoint[]
): { latitude: number; longitude: number } => {
  if (i === 0) {
    return { latitude: baseCoords.latitude, longitude: baseCoords.longitude };
  }

  const prevPoint = points[i - 1];
  if (!prevPoint) {
    return { latitude: baseCoords.latitude, longitude: baseCoords.longitude };
  }

  // Calculate direction influenced by previous direction
  const prev2Point = i > 1 ? points[i - 2] : null;
  const prevDirection = prev2Point
    ? Math.atan2(
        prevPoint.longitude - prev2Point.longitude,
        prevPoint.latitude - prev2Point.latitude
      )
    : Math.random() * 2 * Math.PI;

  // Add randomness for swirling effect
  const directionChange = (Math.random() - 0.5) * Math.PI * 0.5;
  const newDirection = prevDirection + directionChange;

  // Realistic movement distance: 8-20m per step (ensures visibility above 3m threshold)
  const distanceMeters = 8 + Math.random() * 12;
  const distanceDegrees = distanceMeters / 111000;

  return {
    latitude: prevPoint.latitude + Math.cos(newDirection) * distanceDegrees,
    longitude: prevPoint.longitude + Math.sin(newDirection) * distanceDegrees,
  };
};

/**
 * Generate coordinates for other patterns
 */
const generateOtherPatternCoordinates = (
  pattern: TestPattern,
  i: number,
  count: number,
  options: { baseCoords: { latitude: number; longitude: number }; radiusDegrees: number }
): { latitude: number; longitude: number } => {
  const { baseCoords, radiusDegrees } = options;
  let latitude = baseCoords.latitude;
  let longitude = baseCoords.longitude;

  switch (pattern) {
    case TestPatterns.SINGLE_POINT:
      // All points at the same location (no change needed)
      break;
    case TestPatterns.CIRCULAR_PATH: {
      const angle = (i / count) * 2 * Math.PI;
      latitude += Math.cos(angle) * radiusDegrees;
      longitude += Math.sin(angle) * radiusDegrees;
      break;
    }
    case TestPatterns.GRID_PATTERN: {
      const gridSize = Math.ceil(Math.sqrt(count));
      const row = Math.floor(i / gridSize);
      const col = i % gridSize;
      latitude += (row / gridSize - 0.5) * radiusDegrees * 2;
      longitude += (col / gridSize - 0.5) * radiusDegrees * 2;
      break;
    }
    case TestPatterns.HIKING_TRAIL: {
      const trailProgress = i / count;
      const windingFactor = Math.sin(trailProgress * Math.PI * 4) * 0.3;
      latitude += trailProgress * radiusDegrees + windingFactor * radiusDegrees;
      longitude += trailProgress * radiusDegrees * 0.3 + windingFactor * radiusDegrees * 0.5;
      break;
    }

    default:
      // RANDOM_WALK and any other patterns use random distribution
      latitude += (Math.random() - 0.5) * radiusDegrees * 2;
      longitude += (Math.random() - 0.5) * radiusDegrees * 2;
      break;
  }

  return { latitude, longitude };
};

/**
 * Generate test geopoints for performance testing
 */
export const generatePerformanceTestData = (
  count: number,
  pattern: TestPattern = TestPatterns.RANDOM_WALK,
  options: {
    radiusKm?: number;
    startTime?: number;
    intervalSeconds?: number;
    startingLocation?: { latitude: number; longitude: number };
  } = {}
): GeoPoint[] => {
  const {
    radiusKm = 0.05, // 50m radius for realistic walking speed
    startTime = Date.now(), // Start from current time to avoid "forking worms" with real GPS
    intervalSeconds = 30, // 30 second intervals for walking speed
    startingLocation,
  } = options;

  // Use provided starting location or default to Eugene South Hills
  const baseCoords = startingLocation ?? BASE_COORDINATES;

  const points: GeoPoint[] = [];

  // Convert km to degrees (rough approximation: 1 degree ≈ 111km)
  const radiusDegrees = radiusKm / 111;

  for (let i = 0; i < count; i++) {
    const timestamp = startTime + i * intervalSeconds * 1000;

    // Generate coordinates based on pattern
    const { latitude, longitude } =
      pattern === TestPatterns.REALISTIC_DRIVE
        ? generateRealisticDriveCoordinates(i, baseCoords, points)
        : generateOtherPatternCoordinates(pattern, i, count, { baseCoords, radiusDegrees });

    points.push({
      latitude,
      longitude,
      timestamp,
    });
  }

  return points;
};

// ---------------------------------------------------------------------------
// Street-aligned test-data generation
// ---------------------------------------------------------------------------

/** Choose the intersection end of `seg` that is closer to `point`. */
function nearerEndId(point: StreetPoint, seg: StreetSegment): string {
  const first = seg.points[0];
  const last = seg.points[seg.points.length - 1];
  if (!first) return seg.startNodeId;
  if (!last) return seg.endNodeId;
  const dStart = haversineDistance(
    point.latitude,
    point.longitude,
    first.latitude,
    first.longitude
  );
  const dEnd = haversineDistance(point.latitude, point.longitude, last.latitude, last.longitude);
  return dStart <= dEnd ? seg.startNodeId : seg.endNodeId;
}

/** Pick a random exit segment at `intersection`, optionally preferring unexplored. */
function pickNextSegment(params: {
  intersection: Intersection;
  excludeId: string;
  preferUnexplored: boolean;
  exploredIds: string[];
}): string | null {
  const { intersection, excludeId, preferUnexplored, exploredIds } = params;
  const candidates = intersection.connectedSegmentIds.filter((id) => id !== excludeId);
  if (candidates.length === 0) return null;

  if (preferUnexplored) {
    const unexplored = candidates.filter((id) => !exploredIds.includes(id));
    if (unexplored.length > 0)
      return unexplored[Math.floor(Math.random() * unexplored.length)] ?? null;
  }
  return candidates[Math.floor(Math.random() * candidates.length)] ?? null;
}

/** Interpolate `maxPts` evenly-spaced points from `from` toward `to`. */
function stepsToward(
  from: StreetPoint,
  to: StreetPoint,
  stepMeters: number,
  maxPts: number
): StreetPoint[] {
  const totalDist = haversineDistance(from.latitude, from.longitude, to.latitude, to.longitude);
  const n = Math.min(maxPts, Math.max(1, Math.round(totalDist / stepMeters)));
  const result: StreetPoint[] = [];
  for (let i = 1; i <= n; i++) {
    const t = Math.min((i * stepMeters) / totalDist, 1);
    result.push({
      latitude: from.latitude + t * (to.latitude - from.latitude),
      longitude: from.longitude + t * (to.longitude - from.longitude),
    });
  }
  return result;
}

/**
 * Generate GPS points that follow the provided street graph.
 *
 * Algorithm:
 *  1. Snap `startingLocation` to the nearest segment.
 *  2. Walk toward the nearer intersection on that segment.
 *  3. At each intersection choose a random (or prefer-unexplored) exit.
 *  4. Repeat until `count` points have been emitted.
 */
export const generateStreetAlignedTestData = (
  count: number,
  streetData: { segments: StreetSegment[]; intersections: Intersection[] },
  options: {
    startingLocation?: { latitude: number; longitude: number };
    intervalSeconds?: number;
    startTime?: number;
    preferUnexplored?: boolean;
    exploredSegmentIds?: string[];
  } = {}
): GeoPoint[] => {
  const {
    startingLocation,
    intervalSeconds = 30,
    startTime = Date.now(),
    preferUnexplored = false,
    exploredSegmentIds = [],
  } = options;

  const segMap: Record<string, StreetSegment> = Object.fromEntries(
    streetData.segments.map((s) => [s.id, s])
  );
  const intMap: Record<string, Intersection> = Object.fromEntries(
    streetData.intersections.map((i) => [i.id, i])
  );

  const start: StreetPoint = startingLocation ?? BASE_COORDINATES;
  const path = walkStreets({ start, segMap, intMap, count, preferUnexplored, exploredSegmentIds });

  return path.slice(0, count).map((pt, idx) => ({
    latitude: pt.latitude,
    longitude: pt.longitude,
    timestamp: startTime + idx * intervalSeconds * 1000,
  }));
};

/** Core street-walk loop – returns raw StreetPoint path. */
function walkStreets(params: {
  start: StreetPoint;
  segMap: Record<string, StreetSegment>;
  intMap: Record<string, Intersection>;
  count: number;
  preferUnexplored: boolean;
  exploredSegmentIds: string[];
}): StreetPoint[] {
  const { start, segMap, intMap, count, preferUnexplored, exploredSegmentIds } = params;
  const STEP_M = 15; // ~15 m between generated points
  const points: StreetPoint[] = [start];

  // Find nearest segment
  let bestSeg: StreetSegment | null = null;
  let bestDist = Infinity;
  for (const seg of Object.values(segMap)) {
    const { distance } = closestPointOnSegment(start, seg.points);
    if (distance < bestDist) {
      bestDist = distance;
      bestSeg = seg;
    }
  }
  if (!bestSeg) return points;

  let currentSegId = bestSeg.id;
  let targetIntId = nearerEndId(start, bestSeg);

  while (points.length < count) {
    const targetInt = intMap[targetIntId];
    if (!targetInt) break;

    // Generate steps toward this intersection
    const last = points[points.length - 1]!;
    const steps = stepsToward(last, targetInt, STEP_M, count - points.length);
    points.push(...steps);

    // Choose next segment
    const nextSegId = pickNextSegment({
      intersection: targetInt,
      excludeId: currentSegId,
      preferUnexplored,
      exploredIds: exploredSegmentIds,
    });
    if (!nextSegId) break; // dead end

    currentSegId = nextSegId;
    const nextSeg = segMap[nextSegId];
    if (nextSeg) {
      targetIntId = nextSeg.startNodeId === targetInt.id ? nextSeg.endNodeId : nextSeg.startNodeId;
    }
  }
  return points;
}
