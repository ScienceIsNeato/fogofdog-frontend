import { useEffect, useMemo, useRef } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { calculateExplorationBounds } from '../index';
import { logger } from '../../../utils/logger';
import { calculateZoomAnimation } from '../../../utils/mapZoomUtils';

// Import map constraints from constants
import { constrainRegion } from '../../../constants/mapConstraints';
import type { Region } from 'react-native-maps';
import type MapView from 'react-native-maps';
import type { GeoPoint } from '../../../types/user';

// Animation constants for cinematic zoom
const CINEMATIC_ZOOM_DELAY = 800; // ms to show wide view
const CINEMATIC_ZOOM_DURATION = 5000; // ms for extended cinematic zoom animation (5 seconds)

const DEFAULT_ZOOM_DELTAS = {
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

interface UseCinematicZoomProps {
  mapRef: React.RefObject<MapView>;
  currentLocation: GeoPoint | null;
}

/**
 * Calculate exploration bounds for cinematic zoom if conditions are met
 */
const useExplorationBounds = (explorationPath: GeoPoint[]) => {
  return useMemo(() => {
    // Only use cinematic zoom if we have significant GPS history (5+ points)
    if (explorationPath.length >= 5) {
      return calculateExplorationBounds(explorationPath);
    }
    return null;
  }, [explorationPath]);
};

/**
 * Calculate distance between two GPS points using Haversine formula
 */
const calculateDistance = (point1: GeoPoint, point2: GeoPoint): number => {
  const R = 6371e3; // Earth's radius in meters
  const φ1 = (point1.latitude * Math.PI) / 180;
  const φ2 = (point2.latitude * Math.PI) / 180;
  const Δφ = ((point2.latitude - point1.latitude) * Math.PI) / 180;
  const Δλ = ((point2.longitude - point1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
};

/**
 * Extract recent path segment within 1km and max 100 points
 */
const extractRecentPathSegment = (
  explorationPath: GeoPoint[],
  currentLocation: GeoPoint,
  maxDistance: number = 1000, // 1km in meters
  maxPoints: number = 100
): GeoPoint[] => {
  if (explorationPath.length === 0) return [];

  // Start from the most recent points and work backwards
  const recentPath: GeoPoint[] = [];
  let totalDistance = 0;

  // Always include current location as the end point
  recentPath.unshift(currentLocation);

  // Work backwards through the path
  for (let i = explorationPath.length - 1; i >= 0 && recentPath.length < maxPoints; i--) {
    const point = explorationPath[i];
    if (!point) continue; // Skip undefined points

    const firstPoint = recentPath[0];
    if (!firstPoint) break; // Safety check

    const distanceToNext = calculateDistance(point, firstPoint);

    // Stop if adding this point would exceed 1km total distance
    if (totalDistance + distanceToNext > maxDistance) {
      break;
    }

    recentPath.unshift(point);
    totalDistance += distanceToNext;
  }

  return recentPath;
};

/**
 * Calculate an intelligent cinematic start point based on recent path
 * Uses path analysis to create a dramatic reveal of the user's journey
 */
const calculateCinematicStartPoint = (
  explorationPath: GeoPoint[],
  currentLocation: GeoPoint
): { startRegion: Region; pathDistance: number } => {
  // Extract recent path segment (max 1km, max 100 points)
  const pathSegment = extractRecentPathSegment(explorationPath, currentLocation);

  if (pathSegment.length < 2) {
    // No meaningful path - use simple offset from current location
    return {
      startRegion: {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: DEFAULT_ZOOM_DELTAS.latitudeDelta, // Standard zoom
        longitudeDelta: DEFAULT_ZOOM_DELTAS.longitudeDelta,
      },
      pathDistance: 0,
    };
  }

  // Calculate path bounds to determine cinematic framing
  const pathStart = pathSegment[0];
  if (!pathStart) {
    // Fallback if no start point
    return {
      startRegion: {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: DEFAULT_ZOOM_DELTAS.latitudeDelta,
        longitudeDelta: DEFAULT_ZOOM_DELTAS.longitudeDelta,
      },
      pathDistance: 0,
    };
  }

  const pathEnd = currentLocation;

  // Calculate total distance of path segment
  let totalDistance = 0;
  for (let i = 1; i < pathSegment.length; i++) {
    const prevPoint = pathSegment[i - 1];
    const currPoint = pathSegment[i];
    if (prevPoint && currPoint) {
      totalDistance += calculateDistance(prevPoint, currPoint);
    }
  }

  // Calculate center point of the journey for dramatic framing
  const centerLat = (pathStart.latitude + pathEnd.latitude) / 2;
  const centerLng = (pathStart.longitude + pathEnd.longitude) / 2;

  // Calculate span of the journey
  const latSpan = Math.abs(pathEnd.latitude - pathStart.latitude);
  const lngSpan = Math.abs(pathEnd.longitude - pathStart.longitude);

  // Create cinematic wide shot that encompasses the journey with padding
  const cinematicPadding = 1.8; // 80% padding for dramatic effect
  const startLatDelta = Math.max(latSpan * cinematicPadding, 0.005); // Min 500m view
  const startLngDelta = Math.max(lngSpan * cinematicPadding, 0.005);

  return {
    startRegion: {
      latitude: centerLat,
      longitude: centerLng,
      latitudeDelta: startLatDelta,
      longitudeDelta: startLngDelta,
    },
    pathDistance: totalDistance,
  };
};

/**
 * Calculate the cinematic start region for consistent positioning
 * Used by both initialRegion and animation to prevent jumps
 */
const calculateCinematicStartRegion = (
  explorationPath: GeoPoint[],
  currentLocation: GeoPoint,
  fixedRandomSeed?: number
): Region => {
  const { startRegion, pathDistance } = calculateCinematicStartPoint(
    explorationPath,
    currentLocation
  );

  const hasValidPathDirection = pathDistance > 10;
  let directionLat, directionLng;

  if (hasValidPathDirection) {
    directionLat = startRegion.latitude - currentLocation.latitude;
    directionLng = startRegion.longitude - currentLocation.longitude;
  } else {
    // Use fixed seed for consistent random direction, or generate new one
    const randomValue = fixedRandomSeed ?? Math.random();
    const randomAngle = randomValue * 2 * Math.PI;
    // Use frame edge distance directly for random direction (no scaling needed)
    const edgeDistanceLat = DEFAULT_ZOOM_DELTAS.latitudeDelta * 0.4; // 40% of frame = edge position
    const edgeDistanceLng = DEFAULT_ZOOM_DELTAS.longitudeDelta * 0.4;
    directionLat = Math.sin(randomAngle) * edgeDistanceLat;
    directionLng = Math.cos(randomAngle) * edgeDistanceLng;
  }

  // For intelligent path direction, scale to edge of frame
  if (hasValidPathDirection) {
    const currentDistance = Math.sqrt(directionLat * directionLat + directionLng * directionLng);
    const frameLatDelta = DEFAULT_ZOOM_DELTAS.latitudeDelta;
    const edgeDistanceLat = frameLatDelta * 0.4;
    const edgeDistanceLng = DEFAULT_ZOOM_DELTAS.longitudeDelta * 0.4;
    const targetDistanceDegrees = Math.sqrt(
      edgeDistanceLat * edgeDistanceLat + edgeDistanceLng * edgeDistanceLng
    );
    const scaleFactor = currentDistance > 0 ? targetDistanceDegrees / currentDistance : 1;

    return {
      latitude: currentLocation.latitude + directionLat * scaleFactor,
      longitude: currentLocation.longitude + directionLng * scaleFactor,
      latitudeDelta: DEFAULT_ZOOM_DELTAS.latitudeDelta,
      longitudeDelta: DEFAULT_ZOOM_DELTAS.longitudeDelta,
    };
  } else {
    // For random direction, use the calculated edge distance directly
    return {
      latitude: currentLocation.latitude + directionLat,
      longitude: currentLocation.longitude + directionLng,
      latitudeDelta: DEFAULT_ZOOM_DELTAS.latitudeDelta,
      longitudeDelta: DEFAULT_ZOOM_DELTAS.longitudeDelta,
    };
  }
};

/**
 * Start a single smooth cinematic animation with intelligent positioning
 * Uses intelligent path direction or random fallback for first-time users
 * Map rendering delayed until animation starts to eliminate visible positioning jump
 */
const startCinematicPanAnimation = (
  mapRef: React.RefObject<MapView>,
  explorationPath: GeoPoint[],
  currentLocation: GeoPoint
) => {
  // Set the cinematic zoom active flag
  if (mapRef.current) {
    (mapRef.current as any)._cinematicZoomActive = true;
  }

  // Use shared calculation for consistent positioning
  const cinematicStartRegion = calculateCinematicStartRegion(explorationPath, currentLocation);
  const { pathDistance } = calculateCinematicStartPoint(explorationPath, currentLocation);
  const hasValidPathDirection = pathDistance > 10;

  if (!hasValidPathDirection) {
    logger.info('[ZOOM_DEBUG] Using random direction for cinematic pan', {
      reason: 'insufficient_path_distance',
      pathDistance: `${pathDistance.toFixed(0)}m`,
      note: 'Ensures first-time users get cinematic experience',
    });
  }

  // End at current location with close zoom
  const endRegion = {
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude,
    latitudeDelta: 0.001, // 50m scale
    longitudeDelta: 0.001,
  };

  logger.info('[ZOOM_DEBUG] Starting smooth path-inspired cinematic animation', {
    totalDuration: `${CINEMATIC_ZOOM_DURATION}ms (5 seconds)`,
    pathDistance: `${pathDistance.toFixed(0)}m`,
    startRegion: {
      lat: cinematicStartRegion.latitude.toFixed(6),
      lng: cinematicStartRegion.longitude.toFixed(6),
      latDelta: cinematicStartRegion.latitudeDelta.toFixed(6),
    },
    endRegion: {
      lat: endRegion.latitude.toFixed(6),
      lng: endRegion.longitude.toFixed(6),
      latDelta: endRegion.latitudeDelta.toFixed(6),
    },
    approach: 'full_zoom_gambit_pan',
    cinematicDesign: 'Single smooth animation: Intelligent start (2km) → Current location (50m)',
  });

  // Calculate target distance for logging
  const frameLatDelta = DEFAULT_ZOOM_DELTAS.latitudeDelta;
  const edgeDistanceLat = frameLatDelta * 0.4;
  const edgeDistanceLng = DEFAULT_ZOOM_DELTAS.longitudeDelta * 0.4;
  const targetDistanceDegrees = Math.sqrt(
    edgeDistanceLat * edgeDistanceLat + edgeDistanceLng * edgeDistanceLng
  );
  const targetDistance = targetDistanceDegrees * 111000; // ~4km at this scale

  // Single smooth cinematic animation - map rendering delayed until animation starts
  // This eliminates the "jerk" since user never sees the jump to start position
  mapRef.current?.animateToRegion(cinematicStartRegion, 0); // Instant positioning at start

  // Single smooth animation from cinematic start to current location
  setTimeout(() => {
    if (mapRef.current) {
      mapRef.current.animateToRegion(endRegion, CINEMATIC_ZOOM_DURATION);
    }
  }, 50); // Tiny delay to ensure initial positioning

  logger.info('[ZOOM_DEBUG] Single smooth cinematic pan + zoom started', {
    duration: `${CINEMATIC_ZOOM_DURATION}ms (5s)`,
    originalPathDistance: `${pathDistance.toFixed(0)}m`,
    framePositionedDistance: `${targetDistance.toFixed(0)}m (~4km to edge)`,
    directionType: hasValidPathDirection ? 'intelligent_path' : 'random_fallback',
    from: `intelligent start at 2km level (${cinematicStartRegion.latitudeDelta.toFixed(6)} latDelta)`,
    to: `current location at 50m level (${endRegion.latitudeDelta.toFixed(6)} latDelta)`,
    note: 'Map rendering delayed until animation starts - eliminates visible jump to start position',
  });

  // Clear the cinematic zoom flag after animation completes
  setTimeout(() => {
    if (mapRef.current) {
      (mapRef.current as any)._cinematicZoomActive = false;
      logger.info('[ZOOM_DEBUG] Cinematic pan animation completed');
    }
  }, CINEMATIC_ZOOM_DURATION + 100); // Small buffer to ensure animation completes
};

/**
 * Custom hook for cinematic zoom functionality
 * Calculates exploration bounds and handles zoom animation
 */
export const useCinematicZoom = ({ mapRef, currentLocation }: UseCinematicZoomProps) => {
  // Get exploration path for cinematic zoom calculation
  const explorationPath = useAppSelector((state) => state.exploration.path);

  // Track if cinematic zoom has already run to prevent multiple triggers
  const hasRunCinematicZoom = useRef(false);

  // Calculate cinematic initial region or fallback to current location
  const explorationBounds = useExplorationBounds(explorationPath);

  // Cinematic zoom effect - animate from 2km scale to 50m scale with Gaussian easing
  useEffect(() => {
    // Only run cinematic zoom once per app session
    // Trigger for any user with current location (not just those with explorationBounds)
    if (mapRef.current && currentLocation && !hasRunCinematicZoom.current) {
      // Mark that cinematic zoom has run
      hasRunCinematicZoom.current = true;
      // Set a flag to prevent other animations during cinematic zoom
      (mapRef.current as any)._cinematicZoomActive = true;
      logger.info('[ZOOM_DEBUG] Cinematic zoom flag set - preventing other animations');

      // Calculate end zoom to 50m scale
      const endZoomParams = calculateZoomAnimation(
        '50m', // Only calculate end scale
        '50m', // Same value to get the region
        currentLocation,
        400
      );
      const endRegion = constrainRegion(endZoomParams.endRegion);

      logger.info('[ZOOM_DEBUG] Heuristic cinematic zoom - matching mysterious animation height', {
        startHeight: `${DEFAULT_ZOOM_DELTAS.latitudeDelta.toFixed(6)} latDelta`,
        endHeight: `${endRegion.latitudeDelta.toFixed(6)} latDelta (50m scale)`,
        strategy: 'match_existing_height',
      });

      // Delay then start path-following animation
      const timeoutId = setTimeout(() => {
        // Start the cinematic pan animation
        startCinematicPanAnimation(mapRef, explorationPath, currentLocation);

        logger.info('5-second single cinematic pan started', {
          component: 'MapScreen',
          action: 'cinematicZoom',
          pathLength: explorationPath.length,
          totalDuration: `${CINEMATIC_ZOOM_DURATION}ms (5 seconds)`,
          approach: 'single_cinematic_pan',
          cinematicDesign: 'single smooth pan from intelligent path start to current location',
        });
      }, CINEMATIC_ZOOM_DELAY);

      return () => clearTimeout(timeoutId);
    }
    // No cleanup needed if conditions aren't met
    return undefined;
  }, [currentLocation, mapRef, explorationPath]);

  // Create initial region - use cinematic start position to eliminate jump
  const initialRegion: Region | null = useMemo(() => {
    if (!currentLocation) return null;
    return calculateCinematicStartRegion(explorationPath, currentLocation);
  }, [currentLocation, explorationPath]);

  return {
    initialRegion,
    explorationBounds,
  };
};
