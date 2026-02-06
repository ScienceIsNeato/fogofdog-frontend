import { useState, useEffect, useCallback } from 'react';
import { DeviceEventEmitter } from 'react-native';
import * as Location from 'expo-location';
import { PermissionsOrchestrator, PermissionMode } from '../../../services/PermissionsOrchestrator';
import { logger } from '../../../utils/logger';

export interface PermissionVerificationState {
  isVerifying: boolean;
  isVerified: boolean;
  hasPermissions: boolean;
  backgroundGranted: boolean;
  mode: PermissionMode | 'unknown';
  error: string | null;
}

/**
 * Hook for managing permission verification state
 */
const usePermissionState = () => {
  const [state, setState] = useState<PermissionVerificationState>({
    isVerifying: false,
    isVerified: false,
    hasPermissions: false,
    backgroundGranted: false,
    mode: 'unknown',
    error: null,
  });

  const updateState = useCallback((updates: Partial<PermissionVerificationState>) => {
    setState((prev) => ({ ...prev, ...updates }));
  }, []);

  const resetState = useCallback(() => {
    setState({
      isVerifying: false,
      isVerified: false,
      hasPermissions: false,
      backgroundGranted: false,
      mode: 'unknown',
      error: null,
    });
  }, []);

  return { state, updateState, resetState };
};

/**
 * Hook for managing PermissionsOrchestrator cleanup
 */
const usePermissionCleanup = () => {
  useEffect(() => {
    return () => {
      PermissionsOrchestrator.cleanup();
    };
  }, []);
};

/**
 * Hook for controlling permission verification flow
 */
const usePermissionVerificationFlow = (
  shouldVerify: boolean,
  state: PermissionVerificationState,
  updateState: (updates: Partial<PermissionVerificationState>) => void
) => {
  const startVerification = useCallback(async () => {
    if (!shouldVerify || state.isVerifying || state.isVerified) {
      return;
    }

    logger.info('Starting permission verification process', {
      component: 'usePermissionVerification',
      action: 'startVerification',
    });

    updateState({
      isVerifying: true,
      error: null,
    });

    try {
      // Wait for permission verification without timeout
      // Users should be able to take as long as they need on permission dialogs
      const result = await PermissionsOrchestrator.completePermissionVerification();

      updateState({
        isVerifying: false,
        isVerified: true,
        hasPermissions: result.canProceed,
        backgroundGranted: result.backgroundGranted,
        mode: result.mode,
        error: result.error ?? null,
      });

      // 🚀 IMMEDIATE GPS QUERY: Don't wait for React render cycle - get GPS NOW
      // This fires before state propagates through the component tree
      if (result.canProceed) {
        Location.getCurrentPositionAsync({
          accuracy: Location.Accuracy.Balanced, // Faster than High, still good enough
        })
          .then((position) => {
            const geoPoint = {
              latitude: position.coords.latitude,
              longitude: position.coords.longitude,
              timestamp: Date.now(),
            };
            logger.info('🚀 Immediate GPS acquired after permission verification', {
              component: 'usePermissionVerification',
              location: `${geoPoint.latitude.toFixed(6)}, ${geoPoint.longitude.toFixed(6)}`,
            });
            // Emit for cinematic zoom and other listeners
            DeviceEventEmitter.emit('locationUpdate', geoPoint);
          })
          .catch((err) => {
            logger.warn('Immediate GPS query failed (will retry via normal flow)', {
              component: 'usePermissionVerification',
              error: err instanceof Error ? err.message : String(err),
            });
          });
      }

      logger.info(
        '🔑 PERMISSION_DEBUG: Verification completed - transitioning to GPS initialization',
        {
          component: 'usePermissionVerification',
          result,
          canProceed: result.canProceed,
          backgroundGranted: result.backgroundGranted,
          mode: result.mode,
          timestamp: new Date().toISOString(),
        }
      );
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Permission verification failed';

      updateState({
        isVerifying: false,
        isVerified: true,
        hasPermissions: false,
        backgroundGranted: false,
        mode: 'denied',
        error: errorMessage,
      });

      logger.error('Permission verification failed', {
        component: 'usePermissionVerification',
        error: errorMessage,
      });
    }
  }, [shouldVerify, state.isVerifying, state.isVerified, updateState]);

  // Start verification when conditions are met
  useEffect(() => {
    if (shouldVerify && !state.isVerifying && !state.isVerified) {
      startVerification();
    }
  }, [shouldVerify, startVerification, state.isVerifying, state.isVerified]);

  return { startVerification };
};

/**
 * Main hook for managing blocking permission verification flow
 * Now composed of focused, single-responsibility hooks for better maintainability
 */
export const usePermissionVerification = (shouldVerify: boolean) => {
  const { state, updateState, resetState } = usePermissionState();
  const { startVerification } = usePermissionVerificationFlow(shouldVerify, state, updateState);

  // Set up cleanup
  usePermissionCleanup();

  return {
    ...state,
    startVerification,
    resetVerification: resetState,
  };
};
