import { GeoPoint } from '../types/user';

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
} as const;

export type TestPattern = (typeof TestPatterns)[keyof typeof TestPatterns];

/**
 * Generate realistic drive coordinates for walking speed paths with swirls
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

  // Walking speed distance: 25-75m
  const distanceMeters = 25 + Math.random() * 50;
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
    radiusKm = 1.0, // 1km radius by default
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
