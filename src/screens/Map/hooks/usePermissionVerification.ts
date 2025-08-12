import { useState, useEffect, useCallback } from 'react';
import { PermissionsOrchestrator } from '../../../services/PermissionsOrchestrator';
import { logger } from '../../../utils/logger';

export interface PermissionVerificationState {
  isVerifying: boolean;
  isVerified: boolean;
  hasPermissions: boolean;
  backgroundGranted: boolean;
  mode: 'full' | 'limited' | 'denied' | 'unknown';
  error: string | null;
}

/**
 * Hook for managing blocking permission verification flow
 * This replaces the reactive permission polling with a proper blocking flow
 */
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

    setState(prev => ({
      ...prev,
      isVerifying: true,
      error: null,
    }));

    try {
      const result = await PermissionsOrchestrator.completePermissionVerification();
      
      setState({
        isVerifying: false,
        isVerified: true,
        hasPermissions: result.canProceed,
        backgroundGranted: result.backgroundGranted,
        mode: result.mode,
        error: null,
      });

      logger.info('Permission verification completed', {
        component: 'usePermissionVerification',
        result,
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Permission verification failed';
      
      setState({
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
