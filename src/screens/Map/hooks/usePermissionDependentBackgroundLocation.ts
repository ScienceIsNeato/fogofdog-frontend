import { useEffect, useState } from 'react';
import { BackgroundLocationService } from '../../../services/BackgroundLocationService';
import { PermissionAlert } from '../../../components/PermissionAlert';
import { logger } from '../../../utils/logger';

interface PermissionDependentLocationState {
  isInitializing: boolean;
  isInitialized: boolean;
  hasPermissions: boolean;
  error?: string | undefined;
}

/**
 * Handle successful initialization
 */
const handleSuccessfulInit = async (
  setState: React.Dispatch<React.SetStateAction<PermissionDependentLocationState>>
): Promise<void> => {
  const started = await BackgroundLocationService.startBackgroundLocationTracking();

  setState({
    isInitializing: false,
    isInitialized: true,
    hasPermissions: true,
    error: undefined,
  });

  logger.info(`Background location service ${started ? 'started' : 'failed to start'}`, {
    component: 'usePermissionDependentBackgroundLocation',
    action: 'initialize',
    started,
  });
};

/**
 * Handle failed initialization
 */
const handleFailedInit = (
  setState: React.Dispatch<React.SetStateAction<PermissionDependentLocationState>>,
  result: { hasPermissions: boolean; errorMessage?: string }
): void => {
  setState({
    isInitializing: false,
    isInitialized: false,
    hasPermissions: false,
    error: result.errorMessage,
  });

  logger.warn('Background location service initialization failed', {
    component: 'usePermissionDependentBackgroundLocation',
    action: 'initialize',
    hasPermissions: result.hasPermissions,
    error: result.errorMessage,
  });

  // Show permission alert if permissions were denied
  if (!result.hasPermissions && result.errorMessage) {
    PermissionAlert.show({
      errorMessage: result.errorMessage,
    });
  }
};

/**
 * Initialize location service with permission check
 */
const initializeLocationService = async (
  setState: React.Dispatch<React.SetStateAction<PermissionDependentLocationState>>
): Promise<void> => {
  try {
    setState((prev) => ({ ...prev, isInitializing: true, error: undefined }));

    const result = await BackgroundLocationService.initializeWithPermissionCheck();

    if (result.success && result.hasPermissions) {
      await handleSuccessfulInit(setState);
    } else {
      handleFailedInit(setState, result);
    }
  } catch (_error) {
    setState({
      isInitializing: false,
      isInitialized: false,
      hasPermissions: false,
      error: 'Failed to initialize background location service',
    });

    logger.error('Background location service initialization error', _error, {
      component: 'usePermissionDependentBackgroundLocation',
      action: 'initialize',
    });
  }
};

/**
 * Hook to handle permission-dependent initialization of background location service
 * This ensures we only initialize the service when permissions are granted
 */
export const usePermissionDependentBackgroundLocation = () => {
  const [state, setState] = useState<PermissionDependentLocationState>({
    isInitializing: false,
    isInitialized: false,
    hasPermissions: false,
  });

  useEffect(() => {
    initializeLocationService(setState);
  }, []);

  return state;
};
