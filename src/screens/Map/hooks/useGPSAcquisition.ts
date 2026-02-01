import { useEffect } from 'react';
import * as Location from 'expo-location';
import { useAppDispatch } from '../../../store/hooks';
import { updateLocation } from '../../../store/slices/explorationSlice';
import { processGeoPoint } from '../../../store/slices/statsSlice';
import { logger } from '../../../utils/logger';
import { GeoPoint } from '../../../types/user';

/**
 * Hook for GPS acquisition on app start.
 * Continuously retries until first location is acquired.
 * Skips in test environment to avoid interfering with test scenarios.
 */
export const useGPSAcquisition = (): void => {
  const dispatch = useAppDispatch();

  useEffect(() => {
    // Skip GPS acquisition in test environment
    if (process.env.NODE_ENV === 'test') {
      return;
    }

    let isActive = true;
    let retryIntervalId: NodeJS.Timeout | null = null;

    const attemptGPSAcquisition = async (): Promise<boolean> => {
      try {
        const location = await Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Lowest, // Fastest response
        });

        if (isActive) {
          const geoPoint: GeoPoint = {
            latitude: location.coords.latitude,
            longitude: location.coords.longitude,
            timestamp: Date.now(),
          };

          logger.info('GPS: First location acquired on app start', {
            component: 'useGPSAcquisition',
            coordinate: `${geoPoint.latitude.toFixed(6)}, ${geoPoint.longitude.toFixed(6)}`,
          });

          // Update Redux immediately
          dispatch(updateLocation(geoPoint));
          dispatch(processGeoPoint({ geoPoint }));
          return true; // Success
        }
      } catch (_error) {
        // Expected during onboarding/permissions - just retry
        return false;
      }
      return false;
    };

    const startGPSRetryLoop = () => {
      // Try immediately
      attemptGPSAcquisition().then((success) => {
        if (success || !isActive) return;

        // Set up retry loop
        retryIntervalId = setInterval(async () => {
          const success = await attemptGPSAcquisition();
          if (success && retryIntervalId) {
            clearInterval(retryIntervalId);
            retryIntervalId = null;
          }
        }, 500);
      });
    };

    startGPSRetryLoop();

    return () => {
      isActive = false;
      if (retryIntervalId) {
        clearInterval(retryIntervalId);
      }
    };
  }, [dispatch]);
};
