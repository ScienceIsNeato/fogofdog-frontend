import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { logger } from '../utils/logger';

const ONBOARDING_STORAGE_KEY = '@fogofdog_onboarding_completed';

/**
 * Check if E2E test mode is enabled via app config
 * When enabled, onboarding is automatically skipped for automated testing
 */
const isE2ETestMode = (): boolean => {
  return Constants.expoConfig?.extra?.e2eTestMode === true;
};

export class OnboardingService {
  /**
   * Check if this is a first-time user (onboarding not completed)
   * Returns true for first-time users, false for returning users
   * In E2E test mode, always returns false (skip onboarding)
   */
  static async isFirstTimeUser(): Promise<boolean> {
    // Skip onboarding in E2E test mode for automated testing
    if (isE2ETestMode()) {
      logger.info('E2E test mode: skipping onboarding', {
        component: 'OnboardingService',
        action: 'isFirstTimeUser',
      });
      return false;
    }

    try {
      const completionStatus = await AsyncStorage.getItem(ONBOARDING_STORAGE_KEY);

      // Return true (first time) if no completion status or invalid value
      const isCompleted = completionStatus === 'true';
      const isFirstTime = !isCompleted;

      logger.debug('Onboarding first-time check', {
        component: 'OnboardingService',
        action: 'isFirstTimeUser',
        isFirstTime,
        storedValue: completionStatus,
      });

      return isFirstTime;
    } catch (error) {
      logger.error('Failed to check first-time user status, defaulting to first-time', error, {
        component: 'OnboardingService',
        action: 'isFirstTimeUser',
      });

      // Default to first-time user on error (safer for UX)
      return true;
    }
  }

  /**
   * Mark onboarding as completed for this user
   * Should be called after successful onboarding completion
   */
  static async markOnboardingCompleted(): Promise<void> {
    try {
      await AsyncStorage.setItem(ONBOARDING_STORAGE_KEY, 'true');

      logger.info('Onboarding marked as completed', {
        component: 'OnboardingService',
        action: 'markOnboardingCompleted',
      });
    } catch (error) {
      logger.error('Failed to mark onboarding as completed', error, {
        component: 'OnboardingService',
        action: 'markOnboardingCompleted',
      });

      // Don't throw - onboarding completion failure shouldn't crash app
    }
  }

  /**
   * Reset onboarding state (for testing/debugging purposes)
   * This will cause onboarding to show again on next app launch
   */
  static async resetOnboarding(): Promise<void> {
    try {
      await AsyncStorage.removeItem(ONBOARDING_STORAGE_KEY);

      logger.info('Onboarding state reset', {
        component: 'OnboardingService',
        action: 'resetOnboarding',
      });
    } catch (error) {
      logger.error('Failed to reset onboarding state', error, {
        component: 'OnboardingService',
        action: 'resetOnboarding',
      });

      // Don't throw - reset failure shouldn't crash app
    }
  }
}
