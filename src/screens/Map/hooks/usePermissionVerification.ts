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
 * Hook for handling permission verification timeout
 */
const usePermissionTimeout = () => {
  const createTimeoutPromise = useCallback((timeoutMs: number = 30000) => {
    return new Promise((_, reject) => {
      setTimeout(() => {
        reject(new Error(`Permission verification timeout after ${timeoutMs / 1000} seconds`));
      }, timeoutMs);
    });
  }, []);

  const handleTimeoutError = useCallback((error: unknown): string => {
    const errorMessage = error instanceof Error ? error.message : 'Permission verification failed';
    const isTimeout = errorMessage.includes('timeout');

    return isTimeout
      ? 'Permission request timed out. Please try again or check your location settings.'
      : errorMessage;
  }, []);

  return { createTimeoutPromise, handleTimeoutError };
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
  const { createTimeoutPromise, handleTimeoutError } = usePermissionTimeout();

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
      const result = (await Promise.race([
        PermissionsOrchestrator.completePermissionVerification(),
        createTimeoutPromise(),
      ])) as Awaited<ReturnType<typeof PermissionsOrchestrator.completePermissionVerification>>;

      updateState({
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
      const userFriendlyMessage = handleTimeoutError(error);

      updateState({
        isVerifying: false,
        isVerified: true,
        hasPermissions: false,
        backgroundGranted: false,
        mode: 'denied',
        error: userFriendlyMessage,
      });

      logger.error('Permission verification failed', {
        component: 'usePermissionVerification',
        error: userFriendlyMessage,
        isTimeout: userFriendlyMessage.includes('timeout'),
      });
    }
  }, [
    shouldVerify,
    state.isVerifying,
    state.isVerified,
    updateState,
    createTimeoutPromise,
    handleTimeoutError,
  ]);

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
