import { useState, useEffect, useCallback } from 'react';
import { useOnboardingContext } from '../../../contexts/OnboardingContext';
import { OnboardingService } from '../../../services/OnboardingService';
import { logger } from '../../../utils/logger';

/**
 * Check onboarding status from storage and sync with local state
 */
const useOnboardingStorageSync = ({
  isFirstTimeUser,
  showOnboarding,
  hasCompletedOnboarding,
  setShowOnboarding,
  setHasCompletedOnboarding,
}: {
  isFirstTimeUser: boolean;
  showOnboarding: boolean;
  hasCompletedOnboarding: boolean;
  setShowOnboarding: (value: boolean) => void;
  setHasCompletedOnboarding: (value: boolean) => void;
}) => {
  useEffect(() => {
    const checkOnboardingStatus = async () => {
      try {
        const isStillFirstTime = await OnboardingService.isFirstTimeUser();

        logger.info('Onboarding storage check on mount', {
          component: 'useMapScreenOnboarding',
          action: 'mount_storage_check',
          contextIsFirstTimeUser: isFirstTimeUser,
          storageIsFirstTimeUser: isStillFirstTime,
          currentShowOnboarding: showOnboarding,
          currentHasCompleted: hasCompletedOnboarding,
        });

        if (!isStillFirstTime && showOnboarding) {
          logger.info('Correcting onboarding state from storage', {
            component: 'useMapScreenOnboarding',
            action: 'correct_from_storage',
          });
          setShowOnboarding(false);
          setHasCompletedOnboarding(true);
        } else if (isStillFirstTime && !showOnboarding) {
          logger.info('Correcting onboarding state - user needs onboarding', {
            component: 'useMapScreenOnboarding',
            action: 'correct_needs_onboarding',
          });
          setShowOnboarding(true);
          setHasCompletedOnboarding(false);
        }
      } catch (error) {
        logger.error('Failed to check onboarding status on mount', {
          component: 'useMapScreenOnboarding',
          error: error instanceof Error ? error.message : String(error),
        });
      }
    };

    checkOnboardingStatus();
  }, [
    hasCompletedOnboarding,
    isFirstTimeUser,
    showOnboarding,
    setShowOnboarding,
    setHasCompletedOnboarding,
  ]);
};

/**
 * Create onboarding completion and skip handlers
 */
const useOnboardingHandlers = ({
  showOnboarding,
  hasCompletedOnboarding,
  setShowOnboarding,
  setHasCompletedOnboarding,
}: {
  showOnboarding: boolean;
  hasCompletedOnboarding: boolean;
  setShowOnboarding: (value: boolean | ((prev: boolean) => boolean)) => void;
  setHasCompletedOnboarding: (value: boolean | ((prev: boolean) => boolean)) => void;
}) => {
  const handleOnboardingComplete = useCallback(async () => {
    logger.info('Setting onboarding state to complete', {
      component: 'useMapScreenOnboarding',
      action: 'complete',
      previousShowOnboarding: showOnboarding,
      previousHasCompleted: hasCompletedOnboarding,
    });

    try {
      await OnboardingService.markOnboardingCompleted();

      // Use functional updates to ensure immediate state synchronization
      setShowOnboarding((prev) => {
        logger.info('Setting showOnboarding to false (complete)', {
          component: 'useMapScreenOnboarding',
          previousValue: prev,
          newValue: false,
        });
        return false;
      });

      setHasCompletedOnboarding((prev) => {
        logger.info('Setting hasCompletedOnboarding to true (complete)', {
          component: 'useMapScreenOnboarding',
          previousValue: prev,
          newValue: true,
        });
        return true;
      });
    } catch (error) {
      logger.error('Failed to complete onboarding', {
        component: 'useMapScreenOnboarding',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [hasCompletedOnboarding, showOnboarding, setShowOnboarding, setHasCompletedOnboarding]);

  const handleOnboardingSkip = useCallback(async () => {
    logger.info('Setting onboarding state to skipped', {
      component: 'useMapScreenOnboarding',
      action: 'skip',
      previousShowOnboarding: showOnboarding,
      previousHasCompleted: hasCompletedOnboarding,
    });

    try {
      await OnboardingService.markOnboardingCompleted();

      // Use functional updates to ensure immediate state synchronization
      setShowOnboarding((prev) => {
        logger.info('Setting showOnboarding to false (skip)', {
          component: 'useMapScreenOnboarding',
          previousValue: prev,
          newValue: false,
        });
        return false;
      });

      setHasCompletedOnboarding((prev) => {
        logger.info('Setting hasCompletedOnboarding to true (skip)', {
          component: 'useMapScreenOnboarding',
          previousValue: prev,
          newValue: true,
        });
        return true;
      });
    } catch (error) {
      logger.error('Failed to skip onboarding', {
        component: 'useMapScreenOnboarding',
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }, [hasCompletedOnboarding, showOnboarding, setShowOnboarding, setHasCompletedOnboarding]);

  return { handleOnboardingComplete, handleOnboardingSkip };
};

export const useMapScreenOnboarding = () => {
  const { isFirstTimeUser } = useOnboardingContext();

  // Onboarding and permission state management
  const [showOnboarding, setShowOnboarding] = useState(isFirstTimeUser);
  const [hasCompletedOnboarding, setHasCompletedOnboarding] = useState(!isFirstTimeUser);

  // Use storage sync hook to handle component remounts
  useOnboardingStorageSync({
    isFirstTimeUser,
    showOnboarding,
    hasCompletedOnboarding,
    setShowOnboarding,
    setHasCompletedOnboarding,
  });

  // Location services should only start when both conditions are met
  const canStartLocationServices = hasCompletedOnboarding && !showOnboarding;

  // Use handlers helper
  const { handleOnboardingComplete, handleOnboardingSkip } = useOnboardingHandlers({
    showOnboarding,
    hasCompletedOnboarding,
    setShowOnboarding,
    setHasCompletedOnboarding,
  });

  return {
    showOnboarding,
    hasCompletedOnboarding,
    canStartLocationServices,
    handleOnboardingComplete,
    handleOnboardingSkip,
  };
};
