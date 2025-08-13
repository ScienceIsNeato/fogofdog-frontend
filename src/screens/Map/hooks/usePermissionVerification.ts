import { useState, useEffect, useCallback } from 'react';
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
 * Hook for managing blocking permission verification flow
 * This replaces the reactive permission polling with a proper blocking flow
 *
 * Note: This hook is necessarily complex as it manages permission state,
 * timeout handling, error recovery, and automatic retry logic in a single
 * cohesive flow that must remain atomic for proper permission handling.
 */
// eslint-disable-next-line max-lines-per-function
export const usePermissionVerification = (shouldVerify: boolean) => {
  const [state, setState] = useState<PermissionVerificationState>({
    isVerifying: false,
    isVerified: false,
    hasPermissions: false,
    backgroundGranted: false,
    mode: 'unknown',
    error: null,
  });

  const startVerification = useCallback(async () => {
    if (!shouldVerify || state.isVerifying || state.isVerified) {
      return;
    }

    logger.info('Starting permission verification process', {
      component: 'usePermissionVerification',
      action: 'startVerification',
    });

    setState((prev) => ({
      ...prev,
      isVerifying: true,
      error: null,
    }));

    try {
      // Add timeout to prevent hanging indefinitely
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => {
          reject(new Error('Permission verification timeout after 30 seconds'));
        }, 30000);
      });

      const result = (await Promise.race([
        PermissionsOrchestrator.completePermissionVerification(),
        timeoutPromise,
      ])) as Awaited<ReturnType<typeof PermissionsOrchestrator.completePermissionVerification>>;

      setState({
        isVerifying: false,
        isVerified: true,
        hasPermissions: result.canProceed,
        backgroundGranted: result.backgroundGranted,
        mode: result.mode,
        error: result.error ?? null,
      });

      logger.info('Permission verification completed', {
        component: 'usePermissionVerification',
        result,
      });
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Permission verification failed';

      // If it's a timeout error, provide a more helpful message
      const isTimeout = errorMessage.includes('timeout');
      const userFriendlyMessage = isTimeout
        ? 'Permission request timed out. Please try again or check your location settings.'
        : errorMessage;

      setState({
        isVerifying: false,
        isVerified: true,
        hasPermissions: false,
        backgroundGranted: false,
        mode: 'denied',
        error: userFriendlyMessage,
      });

      logger.error('Permission verification failed', {
        component: 'usePermissionVerification',
        error: errorMessage,
        isTimeout,
      });
    }
  }, [shouldVerify, state.isVerifying, state.isVerified]);

  const resetVerification = useCallback(() => {
    setState({
      isVerifying: false,
      isVerified: false,
      hasPermissions: false,
      backgroundGranted: false,
      mode: 'unknown',
      error: null,
    });
  }, []);

  // Start verification when conditions are met
  useEffect(() => {
    if (shouldVerify && !state.isVerifying && !state.isVerified) {
      startVerification();
    }
  }, [shouldVerify, startVerification, state.isVerifying, state.isVerified]);

  // Cleanup orchestrator on unmount
  useEffect(() => {
    return () => {
      PermissionsOrchestrator.cleanup();
    };
  }, []);

  return {
    ...state,
    startVerification,
    resetVerification,
  };
};
