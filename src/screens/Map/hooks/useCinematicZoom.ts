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
 * Start a single smooth 5-second cinematic zoom animation
 * Uses React Native Maps' built-in smooth animation instead of high-frequency frame sampling
 */
const startSingleSmoothAnimation = (
  mapRef: React.RefObject<MapView>,
  startRegion: Region,
  endRegion: Region
) => {
  // Set the cinematic zoom active flag
  if (mapRef.current) {
    (mapRef.current as any)._cinematicZoomActive = true;
  }

  logger.info('[ZOOM_DEBUG] Starting single smooth 5-second cinematic zoom', {
    totalDuration: `${CINEMATIC_ZOOM_DURATION}ms (5 seconds)`,
    startRegion: { latDelta: startRegion.latitudeDelta.toFixed(6) },
    endRegion: { latDelta: endRegion.latitudeDelta.toFixed(6) },
    approach: 'single_smooth_animation',
    designReason: 'simplified_single_call_approach',
  });

  // Use a single animateToRegion call with the full 5-second duration
  // React Native Maps will handle the smooth interpolation internally
  mapRef.current?.animateToRegion(endRegion, CINEMATIC_ZOOM_DURATION);

  // Clear the cinematic zoom flag after animation completes
  setTimeout(() => {
    if (mapRef.current) {
      (mapRef.current as any)._cinematicZoomActive = false;
      logger.info('[ZOOM_DEBUG] Single smooth zoom completed');
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
    if (explorationBounds && mapRef.current && currentLocation && !hasRunCinematicZoom.current) {
      // Mark that cinematic zoom has run
      hasRunCinematicZoom.current = true;
      // Set a flag to prevent other animations during cinematic zoom
      (mapRef.current as any)._cinematicZoomActive = true;
      logger.info('[ZOOM_DEBUG] Cinematic zoom flag set - preventing other animations');
      // HEURISTIC SOLUTION: Start cinematic zoom from where the mysterious animation ends
      // This eliminates the disjointed transition by matching heights
      const heuristicStartRegion: Region = {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: DEFAULT_ZOOM_DELTAS.latitudeDelta, // Match the mysterious animation's end height
        longitudeDelta: DEFAULT_ZOOM_DELTAS.longitudeDelta,
      };

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

      // Delay then start single smooth zoom animation from the matched height
      const timeoutId = setTimeout(() => {
        // Start the single smooth zoom from current position to 50m scale
        startSingleSmoothAnimation(mapRef, heuristicStartRegion, endRegion);

        logger.info('5-second single smooth cinematic zoom started from matched height', {
          component: 'MapScreen',
          action: 'cinematicZoom',
          from: `current height (${DEFAULT_ZOOM_DELTAS.latitudeDelta.toFixed(6)} latDelta)`,
          to: `50m scale`,
          totalDuration: `${CINEMATIC_ZOOM_DURATION}ms (5 seconds)`,
          approach: 'single_smooth_animation_call',
          simplifiedDesign: '1 animateToRegion call with 5-second duration',
        });
      }, CINEMATIC_ZOOM_DELAY);

      return () => clearTimeout(timeoutId);
    }
    // No cleanup needed if conditions aren't met
    return undefined;
  }, [explorationBounds, currentLocation, mapRef]);

  // Create initial region - always use current location with reasonable zoom, never the massive exploration bounds
  const initialRegion: Region | null = currentLocation
    ? {
        latitude: currentLocation.latitude,
        longitude: currentLocation.longitude,
        latitudeDelta: DEFAULT_ZOOM_DELTAS.latitudeDelta,
        longitudeDelta: DEFAULT_ZOOM_DELTAS.longitudeDelta,
      }
    : null;

  return {
    initialRegion,
    explorationBounds,
  };
};
