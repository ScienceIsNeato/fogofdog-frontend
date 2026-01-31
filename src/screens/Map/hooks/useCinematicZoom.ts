import { useEffect, useMemo, useRef } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { calculateExplorationBounds } from '../index';
import { logger } from '../../../utils/logger';

// Module loaded successfully

import type { Region } from 'react-native-maps';
import type MapView from 'react-native-maps';
import type { GeoPoint } from '../../../types/user';

// Type-safe interface for MapView with cinematic zoom tracking
interface MapViewWithCinematicState extends MapView {
  _cinematicZoomActive?: boolean;
}

// Animation constants for cinematic zoom
const CINEMATIC_ZOOM_DELAY = 50; // ms to show wide view - minimal delay
const CINEMATIC_ZOOM_DURATION = 5000; // ms for extended cinematic zoom animation (5 seconds)

const DEFAULT_ZOOM_DELTAS = {
  latitudeDelta: 0.0922,
  longitudeDelta: 0.0421,
};

interface UseCinematicZoomProps {
  mapRef: React.RefObject<MapView>;
  currentLocation: GeoPoint | null;
  canStartAnimation?: boolean; // Only start animation when onboarding + permissions complete
}

/**
 * Calculate exploration bounds for cinematic zoom if conditions are met
 */
const useExplorationBounds = (explorationPath: GeoPoint[]) => {
  return useMemo(() => {
    // Calculate exploration bounds if we have at least one GPS point
    if (explorationPath.length >= 1) {
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
 * Calculate travel direction from recent path points
 */
const calculateTravelDirection = (
  pathSegment: GeoPoint[]
): { directionLat: number; directionLng: number } => {
  const recentPoints = pathSegment.slice(-Math.min(5, pathSegment.length));
  let directionLat = 0;
  let directionLng = 0;

  if (recentPoints.length >= 2) {
    // Calculate average direction vector from recent movement
    for (let i = 1; i < recentPoints.length; i++) {
      const prev = recentPoints[i - 1];
      const curr = recentPoints[i];
      if (prev && curr) {
        directionLat += curr.latitude - prev.latitude;
        directionLng += curr.longitude - prev.longitude;
      }
    }
    // Normalize by number of segments
    directionLat /= recentPoints.length - 1;
    directionLng /= recentPoints.length - 1;
  }

  return { directionLat, directionLng };
};

/**
 * Calculate total distance of a path segment
 */
const calculatePathDistance = (pathSegment: GeoPoint[]): number => {
  let totalDistance = 0;
  for (let i = 1; i < pathSegment.length; i++) {
    const prevPoint = pathSegment[i - 1];
    const currPoint = pathSegment[i];
    if (prevPoint && currPoint) {
      totalDistance += calculateDistance(prevPoint, currPoint);
    }
  }
  return totalDistance;
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
  const totalDistance = calculatePathDistance(pathSegment);

  // Field Goal Kicker Algorithm: Start from behind user's travel direction
  const gpsMarkerLat = pathEnd.latitude;
  const gpsMarkerLng = pathEnd.longitude;

  // Calculate travel direction vector from recent points
  let { directionLat, directionLng } = calculateTravelDirection(pathSegment);

  // Fallback if no clear direction: use start-to-end vector
  if (Math.abs(directionLat) < 0.0001 && Math.abs(directionLng) < 0.0001) {
    directionLat = pathEnd.latitude - pathStart.latitude;
    directionLng = pathEnd.longitude - pathStart.longitude;
  }

  // Step 3: Determine zoom level and calculate starting position
  const journeySpan = Math.max(
    Math.abs(pathEnd.latitude - pathStart.latitude),
    Math.abs(pathEnd.longitude - pathStart.longitude)
  );
  const zoomDelta = Math.max(journeySpan * 1.8, 0.006); // Cinematic zoom with min 600m view

  // Calculate how far to walk backwards (GPS marker should be at 10% from edge)
  const bufferRatio = 0.1; // 10% buffer from screen edge
  const distanceFromCenter = zoomDelta * (0.5 - bufferRatio); // Distance from center to near-edge

  // Normalize direction vector
  const directionMagnitude = Math.sqrt(directionLat * directionLat + directionLng * directionLng);
  const normalizedDirLat = directionMagnitude > 0 ? directionLat / directionMagnitude : 0;
  const normalizedDirLng = directionMagnitude > 0 ? directionLng / directionMagnitude : 0;

  // Walk backwards from GPS marker position to find starting point
  const startLat = gpsMarkerLat - normalizedDirLat * distanceFromCenter;
  const startLng = gpsMarkerLng - normalizedDirLng * distanceFromCenter;

  const startLatDelta = zoomDelta;
  const startLngDelta = zoomDelta;

  return {
    startRegion: {
      latitude: startLat,
      longitude: startLng,
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
    (mapRef.current as MapViewWithCinematicState)._cinematicZoomActive = true;
  }

  // Use shared calculation for consistent positioning
  const cinematicStartRegion = calculateCinematicStartRegion(explorationPath, currentLocation);
  const { pathDistance } = calculateCinematicStartPoint(explorationPath, currentLocation);
  const hasValidPathDirection = pathDistance > 10;

  if (!hasValidPathDirection) {
    logger.debug('Using random direction for cinematic animation', {
      component: 'useCinematicZoom',
      reason: 'insufficient_path_distance',
      pathDistance: `${pathDistance.toFixed(0)}m`,
    });
  }

  // End at current location with close zoom
  const endRegion = {
    latitude: currentLocation.latitude,
    longitude: currentLocation.longitude,
    latitudeDelta: 0.001, // 50m scale
    longitudeDelta: 0.001,
  };

  logger.debug('Starting cinematic map animation', {
    component: 'useCinematicZoom',
    duration: CINEMATIC_ZOOM_DURATION,
    pathDistance: pathDistance.toFixed(0),
  });

  // Single smooth cinematic animation - map rendering delayed until animation starts
  // This eliminates the "jerk" since user never sees the jump to start position
  mapRef.current?.animateToRegion(cinematicStartRegion, 0); // Instant positioning at start

  // Single smooth animation from cinematic start to current location
  setTimeout(() => {
    if (mapRef.current) {
      mapRef.current.animateToRegion(endRegion, CINEMATIC_ZOOM_DURATION);
    }
  }, 50); // Tiny delay to ensure initial positioning

  logger.debug('Cinematic pan animation executing', {
    component: 'useCinematicZoom',
    duration: CINEMATIC_ZOOM_DURATION,
    pathDistance: pathDistance.toFixed(0),
  });

  // Clear the cinematic zoom flag after animation completes
  setTimeout(() => {
    if (mapRef.current) {
      (mapRef.current as MapViewWithCinematicState)._cinematicZoomActive = false;
      logger.debug('Cinematic animation completed', { component: 'useCinematicZoom' });
    }
  }, CINEMATIC_ZOOM_DURATION + 100); // Small buffer to ensure animation completes
};

/**
 * Determine if cinematic zoom should be shown based on current conditions
 */
const shouldShowCinematicZoom = (
  currentLocation: GeoPoint | null,
  canStartAnimation: boolean,
  isGPSInjectionRunning: boolean
): boolean => {
  return currentLocation !== null && canStartAnimation && !isGPSInjectionRunning;
};

/**
 * Custom hook for cinematic zoom functionality
 * Calculates exploration bounds and handles zoom animation
 */
// eslint-disable-next-line max-lines-per-function
export const useCinematicZoom = ({
  mapRef,
  currentLocation,
  canStartAnimation = true,
}: UseCinematicZoomProps) => {
  // Hook called with proper parameters

  // Get exploration path for cinematic zoom calculation
  const explorationPath = useAppSelector((state) => state.exploration.path);

  // Default GPS injection status to prevent selector warnings
  const defaultGpsInjectionStatus = useMemo(
    () => ({ isRunning: false, type: null, message: '' }),
    []
  );

  // Get GPS injection status to prevent animation during live injection
  const gpsInjectionStatus = useAppSelector(
    (state) => state.exploration.gpsInjectionStatus || defaultGpsInjectionStatus
  );

  // Track last animation location to prevent unnecessary repeats
  const lastAnimationLocation = useRef<GeoPoint | null>(null);
  const isAnimationInProgress = useRef(false);

  const explorationBounds = useExplorationBounds(explorationPath);

  // Mount-based trigger - run on mount and evaluate conditions
  useEffect(() => {
    // Skip if animation already in progress
    if (isAnimationInProgress.current) {
      return;
    }

    // Evaluate if we should show the animation
    const shouldShow = shouldShowCinematicZoom(
      currentLocation,
      canStartAnimation,
      gpsInjectionStatus.isRunning
    );

    // Evaluation completed

    logger.debug('Cinematic zoom evaluation', {
      component: 'useCinematicZoom',
      shouldShow,
      pathLength: explorationPath.length,
      hasCurrentLocation: !!currentLocation,
      canStartAnimation,
      lastAnimationLocation: lastAnimationLocation.current,
      currentLocation: currentLocation
        ? `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`
        : null,
    });

    if (shouldShow && mapRef.current && currentLocation) {
      // Mark animation in progress and store current location
      isAnimationInProgress.current = true;
      lastAnimationLocation.current = currentLocation;

      // Set a flag to prevent other animations during cinematic zoom
      (mapRef.current as MapViewWithCinematicState)._cinematicZoomActive = true;
      logger.debug('Animation lock enabled', { component: 'useCinematicZoom' });

      logger.debug('Cinematic zoom animation configured', {
        component: 'useCinematicZoom',
        strategy: 'mount_based_trigger',
      });

      // Delay then start path-following animation
      const timeoutId = setTimeout(() => {
        // Start the cinematic pan animation
        startCinematicPanAnimation(mapRef, explorationPath, currentLocation);

        logger.debug('Cinematic animation sequence initiated', {
          component: 'useCinematicZoom',
          pathLength: explorationPath.length,
        });

        // Clear animation in progress flag after animation completes
        setTimeout(() => {
          isAnimationInProgress.current = false;
        }, CINEMATIC_ZOOM_DURATION + 200);
      }, CINEMATIC_ZOOM_DELAY);

      return () => clearTimeout(timeoutId);
    }
    // No cleanup needed if conditions aren't met
    return undefined;
  }, [canStartAnimation, currentLocation, explorationPath, gpsInjectionStatus.isRunning, mapRef]); // Include all dependencies

  // Create initial region - use cinematic start position to eliminate jump
  const initialRegion: Region | null = useMemo(() => {
    logger.info('🎬 CINEMATIC_DEBUG: Computing initial region', {
      component: 'useCinematicZoom',
      hasCurrentLocation: !!currentLocation,
      currentLocation: currentLocation
        ? `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`
        : null,
      canStartAnimation,
      explorationPathLength: explorationPath.length,
      timestamp: new Date().toISOString(),
    });

    if (!currentLocation) {
      logger.info(
        '🎬 CINEMATIC_DEBUG: No currentLocation - returning null (will show loading state)',
        {
          component: 'useCinematicZoom',
          reason: 'waiting_for_gps_location',
        }
      );
      return null; // Wait for real location
    }

    const region = calculateCinematicStartRegion(explorationPath, currentLocation);

    logger.info('🎬 CINEMATIC_DEBUG: Returning region based on currentLocation', {
      component: 'useCinematicZoom',
      region: `${region.latitude.toFixed(6)}, ${region.longitude.toFixed(6)}`,
      deltas: `${region.latitudeDelta.toFixed(6)}, ${region.longitudeDelta.toFixed(6)}`,
    });

    return region;
  }, [currentLocation, explorationPath]);

  return {
    initialRegion,
    explorationBounds,
  };
};
