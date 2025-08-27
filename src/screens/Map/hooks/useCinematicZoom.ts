import { useEffect, useMemo, useRef } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { calculateExplorationBounds } from '../index';
import { logger } from '../../../utils/logger';
import { calculateZoomAnimation, gaussianEasing } from '../../../utils/mapZoomUtils';

// Import map constraints from constants
import { constrainRegion } from '../../../constants/mapConstraints';
import type { Region } from 'react-native-maps';
import type MapView from 'react-native-maps';
import type { GeoPoint } from '../../../types/user';

// Animation constants for cinematic zoom
const CINEMATIC_ZOOM_DELAY = 800; // ms to show wide view
const CINEMATIC_ZOOM_DURATION = 1800; // ms for zoom animation
const ANIMATION_FPS = 60; // Target frame rate for smooth animation

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
 * Start the Gaussian zoom animation between start and end regions
 */
const startGaussianAnimation = (
  mapRef: React.RefObject<MapView>,
  startRegion: Region,
  endRegion: Region,
  currentLocation: GeoPoint
) => {
  const frameInterval = 1000 / ANIMATION_FPS;
  const totalFrames = Math.floor(CINEMATIC_ZOOM_DURATION / frameInterval);
  let currentFrame = 0;

  const animationInterval = setInterval(() => {
    const progress = currentFrame / totalFrames;
    const easedProgress = gaussianEasing(progress, 2.5);

    const interpolatedRegion: Region = {
      latitude: currentLocation.latitude,
      longitude: currentLocation.longitude,
      latitudeDelta:
        startRegion.latitudeDelta +
        (endRegion.latitudeDelta - startRegion.latitudeDelta) * easedProgress,
      longitudeDelta:
        startRegion.longitudeDelta +
        (endRegion.longitudeDelta - startRegion.longitudeDelta) * easedProgress,
    };

    mapRef.current?.animateToRegion(interpolatedRegion, frameInterval * 0.8);

    currentFrame++;
    if (currentFrame >= totalFrames) {
      clearInterval(animationInterval);

      logger.info('[ZOOM_DEBUG] Cinematic zoom ending - final region', {
        endRegion: {
          lat: endRegion.latitude.toFixed(6),
          lng: endRegion.longitude.toFixed(6),
          latDelta: endRegion.latitudeDelta.toFixed(6),
          lngDelta: endRegion.longitudeDelta.toFixed(6),
        },
        reason: 'cinematic_zoom_end',
        duration: 100,
      });

      mapRef.current?.animateToRegion(endRegion, 100);
      setTimeout(() => {
        if (mapRef.current) {
          (mapRef.current as any)._cinematicZoomActive = false;
          logger.info('[ZOOM_DEBUG] Cinematic zoom flag cleared');
        }
      }, 200);
    }
  }, frameInterval);
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
      // Calculate zoom animation from 2km legend to 50m legend
      const zoomParams = calculateZoomAnimation(
        '2km', // Start at 2km scale
        '50m', // End at 50m scale
        currentLocation,
        400 // Assume 400px map width
      );

      // Apply constraints to ensure we never exceed 20km zoom level
      const startRegion = constrainRegion(zoomParams.startRegion);
      const endRegion = constrainRegion(zoomParams.endRegion);

      // Delay then start Gaussian zoom animation
      const timeoutId = setTimeout(() => {
        // TEMP DEBUG: Log cinematic zoom start
        logger.info('[ZOOM_DEBUG] Cinematic zoom starting - initial region', {
          startRegion: {
            lat: startRegion.latitude.toFixed(6),
            lng: startRegion.longitude.toFixed(6),
            latDelta: startRegion.latitudeDelta.toFixed(6),
            lngDelta: startRegion.longitudeDelta.toFixed(6),
          },
          endRegion: {
            lat: endRegion.latitude.toFixed(6),
            lng: endRegion.longitude.toFixed(6),
            latDelta: endRegion.latitudeDelta.toFixed(6),
            lngDelta: endRegion.longitudeDelta.toFixed(6),
          },
          reason: 'cinematic_zoom_start',
          duration: 200,
        });

        // Set initial zoom level to 2km scale
        mapRef.current?.animateToRegion(startRegion, 200);

        // Start the Gaussian zoom animation after a brief moment
        setTimeout(() => {
          startGaussianAnimation(mapRef, startRegion, endRegion, currentLocation);

          logger.info('Gaussian cinematic zoom animation started', {
            component: 'MapScreen',
            action: 'cinematicZoom',
            from: `${zoomParams.startScale}m scale`,
            to: `${zoomParams.endScale}m scale`,
            duration: CINEMATIC_ZOOM_DURATION,
            easing: 'gaussian',
          });
        }, 400); // Brief pause at 2km scale before zooming
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
