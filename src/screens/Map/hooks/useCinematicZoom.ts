import { useEffect, useMemo } from 'react';
import { useAppSelector } from '../../../store/hooks';
import { calculateExplorationBounds } from '../index';
import { logger } from '../../../utils/logger';
import { calculateZoomAnimation, gaussianEasing } from '../../../utils/mapZoomUtils';
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
 * Custom hook for cinematic zoom functionality
 * Calculates exploration bounds and handles zoom animation
 */
export const useCinematicZoom = ({ mapRef, currentLocation }: UseCinematicZoomProps) => {
  // Get exploration path for cinematic zoom calculation
  const explorationPath = useAppSelector((state) => state.exploration.path);

  // Calculate cinematic initial region or fallback to current location
  const explorationBounds = useMemo(() => {
    // Only use cinematic zoom if we have significant GPS history (5+ points)
    if (explorationPath.length >= 5) {
      return calculateExplorationBounds(explorationPath);
    }
    return null;
  }, [explorationPath]);

  // Cinematic zoom effect - animate from 2km scale to 50m scale with Gaussian easing
  useEffect(() => {
    if (explorationBounds && mapRef.current && currentLocation) {
      // Calculate zoom animation from 2km legend to 50m legend
      const zoomParams = calculateZoomAnimation(
        '2km', // Start at 2km scale
        '50m', // End at 50m scale
        currentLocation,
        400 // Assume 400px map width
      );

      // Use the calculated start region instead of exploration bounds
      const startRegion = zoomParams.startRegion;
      const endRegion = zoomParams.endRegion;

      // Delay then start Gaussian zoom animation
      const timeoutId = setTimeout(() => {
        // Set initial zoom level to 2km scale
        mapRef.current?.animateToRegion(startRegion, 200);

        // Start the Gaussian zoom animation after a brief moment
        setTimeout(() => {
          const frameInterval = 1000 / ANIMATION_FPS;
          const totalFrames = Math.floor(CINEMATIC_ZOOM_DURATION / frameInterval);
          let currentFrame = 0;

          const animationInterval = setInterval(() => {
            const progress = currentFrame / totalFrames;
            const easedProgress = gaussianEasing(progress, 2.5); // Intensity of 2.5 for nice curve

            // Interpolate between start and end regions
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

            // Animate to the interpolated region
            mapRef.current?.animateToRegion(interpolatedRegion, frameInterval * 0.8);

            currentFrame++;
            if (currentFrame >= totalFrames) {
              clearInterval(animationInterval);
              // Ensure we end exactly at the target
              mapRef.current?.animateToRegion(endRegion, 100);
            }
          }, frameInterval);

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

  // Create initial region - use exploration bounds for cinematic effect, or current location
  const initialRegion: Region | null =
    explorationBounds ??
    (currentLocation
      ? {
          latitude: currentLocation.latitude,
          longitude: currentLocation.longitude,
          latitudeDelta: DEFAULT_ZOOM_DELTAS.latitudeDelta,
          longitudeDelta: DEFAULT_ZOOM_DELTAS.longitudeDelta,
        }
      : null);

  return {
    initialRegion,
    explorationBounds,
  };
};
