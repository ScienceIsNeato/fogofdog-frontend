import { GeoPoint, GPSPointWithAccuracy } from '../types/user';
import { streetDataService } from '../services/StreetDataService';
import { StreetSegment } from '../types/street';

/**
 * Performance test data generators for interactive testing
 * These can be used to inject different amounts of GPS data into the app
 */

/**
 * GPS noise configuration options
 */
export interface GPSNoiseOptions {
  noiseStdDev?: number; // Standard deviation in meters (default: 5m)
  accuracyRange?: [number, number]; // Min/max accuracy in meters (default: [3, 15])
  dropoutProbability?: number; // Probability of signal loss (default: 0.02)
  driftProbability?: number; // Probability of sustained drift (default: 0.05)
  driftDuration?: number; // Number of points drift lasts (default: 5)
  driftMagnitude?: number; // Drift offset in meters (default: 10m)
}

/**
 * Generate Gaussian random number using Box-Muller transform
 * More realistic than uniform distribution for GPS noise
 */
function gaussianRandom(mean: number, stdDev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z0 = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z0 * stdDev;
}

/**
 * Convert meters to degrees latitude (approximate)
 */
function metersToDegrees(meters: number): number {
  return meters / 111000;
}

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
  STREET_BASED_WALK: 'street_based_walk',
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
    applyNoise?: boolean;
    noiseOptions?: GPSNoiseOptions;
  } = {}
): GeoPoint[] => {
  const {
    radiusKm = 0.05, // 50m radius for realistic walking speed
    startTime = Date.now(), // Start from current time to avoid "forking worms" with real GPS
    intervalSeconds = 30, // 30 second intervals for walking speed
    startingLocation,
    applyNoise = true, // Apply noise by default for realism
    noiseOptions,
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

  // Apply GPS noise if requested
  if (applyNoise) {
    return addGPSNoise(points, noiseOptions);
  }

  return points;
};

/**
 * Generate GPS points along actual streets using StreetDataService
 * This is an async function that fetches real street data
 */
export const generateStreetBasedPath = async (
  count: number,
  options: {
    startTime?: number;
    intervalSeconds?: number;
    startingLocation?: { latitude: number; longitude: number };
    radiusKm?: number;
    preferUnexplored?: boolean;
    noiseOptions?: GPSNoiseOptions;
  } = {}
): Promise<GeoPoint[]> => {
  const {
    startTime = Date.now(),
    intervalSeconds = 30,
    startingLocation,
    radiusKm = 1, // 1km radius for street fetching
    preferUnexplored = false,
    noiseOptions,
  } = options;

  const baseCoords = startingLocation ?? BASE_COORDINATES;
  const startPoint: GeoPoint = {
    latitude: baseCoords.latitude,
    longitude: baseCoords.longitude,
    timestamp: startTime,
  };

  // Set current location in service
  streetDataService.setCurrentLocation(startPoint);

  // Fetch streets in bounding box
  const bbox = {
    south: baseCoords.latitude - radiusKm / 111,
    west: baseCoords.longitude - radiusKm / (111 * Math.cos((baseCoords.latitude * Math.PI) / 180)),
    north: baseCoords.latitude + radiusKm / 111,
    east: baseCoords.longitude + radiusKm / (111 * Math.cos((baseCoords.latitude * Math.PI) / 180)),
  };

  const streets = await streetDataService.fetchStreetsInBoundingBox(bbox);

  if (streets.length === 0) {
    // Fall back to realistic drive pattern if no streets found
    return generatePerformanceTestData(count, TestPatterns.REALISTIC_DRIVE, options);
  }

  // Filter streets if preferUnexplored is set
  const availableStreets = preferUnexplored ? streets.filter((s) => !s.isExplored) : streets;

  if (availableStreets.length === 0) {
    // If no unexplored streets, use all streets
    return generateStreetBasedPathFromStreets(
      count,
      streets,
      startPoint,
      startTime,
      intervalSeconds,
      noiseOptions
    );
  }

  return generateStreetBasedPathFromStreets(
    count,
    availableStreets,
    startPoint,
    startTime,
    intervalSeconds,
    noiseOptions
  );
};

/**
 * Add realistic GPS noise to a set of GPS points
 * Implements Gaussian noise, accuracy simulation, dropout, and drift
 */
export const addGPSNoise = (
  basePoints: GeoPoint[],
  options: GPSNoiseOptions = {}
): GPSPointWithAccuracy[] => {
  const {
    noiseStdDev = 5, // 5m standard deviation
    accuracyRange = [3, 15], // 3-15m accuracy range
    dropoutProbability = 0.02, // 2% dropout rate
    driftProbability = 0.05, // 5% drift probability
    driftDuration = 5, // 5 points of drift
    driftMagnitude = 10, // 10m drift offset
  } = options;

  const noisyPoints: GPSPointWithAccuracy[] = [];
  let driftRemaining = 0;
  let driftLatOffset = 0;
  let driftLonOffset = 0;

  for (let i = 0; i < basePoints.length; i++) {
    const point = basePoints[i];
    if (!point) continue;

    // Simulate signal dropout
    if (Math.random() < dropoutProbability) {
      continue; // Skip this point (signal lost)
    }

    // Check if we should start a new drift period
    if (driftRemaining === 0 && Math.random() < driftProbability) {
      driftRemaining = driftDuration;
      // Random drift direction
      const driftAngle = Math.random() * 2 * Math.PI;
      driftLatOffset = metersToDegrees(Math.cos(driftAngle) * driftMagnitude);
      driftLonOffset = metersToDegrees(Math.sin(driftAngle) * driftMagnitude);
    }

    // Apply Gaussian noise
    const noiseLatMeters = gaussianRandom(0, noiseStdDev);
    const noiseLonMeters = gaussianRandom(0, noiseStdDev);
    const noiseLatDegrees = metersToDegrees(noiseLatMeters);
    const noiseLonDegrees = metersToDegrees(noiseLonMeters);

    // Apply drift if active
    const driftLat = driftRemaining > 0 ? driftLatOffset : 0;
    const driftLon = driftRemaining > 0 ? driftLonOffset : 0;

    // Simulate accuracy variation
    const accuracy = accuracyRange[0] + Math.random() * (accuracyRange[1] - accuracyRange[0]);

    noisyPoints.push({
      latitude: point.latitude + noiseLatDegrees + driftLat,
      longitude: point.longitude + noiseLonDegrees + driftLon,
      timestamp: point.timestamp,
      accuracy,
    });

    if (driftRemaining > 0) {
      driftRemaining--;
    }
  }

  return noisyPoints;
};

/**
 * Generate path from street segments with GPS noise
 */
const generateStreetBasedPathFromStreets = (
  count: number,
  streets: StreetSegment[],
  startPoint: GeoPoint,
  startTime: number,
  intervalSeconds: number,
  noiseOptions?: GPSNoiseOptions
): GeoPoint[] => {
  const basePoints: GeoPoint[] = [];

  // Pick random street segments and interpolate along them
  let currentStreetIndex = Math.floor(Math.random() * streets.length);
  let pointsOnCurrentStreet = 0;
  const maxPointsPerStreet = Math.max(5, Math.floor(count / streets.length));

  for (let i = 0; i < count; i++) {
    const timestamp = startTime + i * intervalSeconds * 1000;

    // Switch streets periodically
    if (pointsOnCurrentStreet >= maxPointsPerStreet) {
      currentStreetIndex = (currentStreetIndex + 1) % streets.length;
      pointsOnCurrentStreet = 0;
    }

    const currentStreet = streets[currentStreetIndex];
    if (!currentStreet || currentStreet.coordinates.length === 0) {
      // Fallback to start point
      basePoints.push({
        latitude: startPoint.latitude,
        longitude: startPoint.longitude,
        timestamp,
      });
      continue;
    }

    // Pick a random point along the street
    const coordIndex = Math.floor(Math.random() * currentStreet.coordinates.length);
    const coord = currentStreet.coordinates[coordIndex];

    if (!coord) {
      // Fallback
      basePoints.push({
        latitude: startPoint.latitude,
        longitude: startPoint.longitude,
        timestamp,
      });
      continue;
    }

    basePoints.push({
      latitude: coord.latitude,
      longitude: coord.longitude,
      timestamp,
    });

    pointsOnCurrentStreet++;
  }

  // Apply realistic GPS noise to all base points
  return addGPSNoise(basePoints, noiseOptions);
};
