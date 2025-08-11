import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { OnboardingService } from './OnboardingService';
import { AuthPersistenceService } from './AuthPersistenceService';
import { DataClearingService } from './DataClearingService';

const FRESH_INSTALL_KEY = '@fogofdog_fresh_install_mode';

export interface DeveloperSettings {
  onboardingEnabled: boolean;
  freshInstallMode: boolean;
}

export class DeveloperSettingsService {
  /**
   * Check if fresh install mode is enabled
   * This simulates a fresh app install to trigger permission flows
   */
  static async isFreshInstallMode(): Promise<boolean> {
    try {
      const freshInstallStatus = await AsyncStorage.getItem(FRESH_INSTALL_KEY);
      return freshInstallStatus === 'true';
    } catch (error) {
      logger.error('Failed to check fresh install mode', error, {
        component: 'DeveloperSettingsService',
        action: 'isFreshInstallMode',
      });
      return false;
    }
  }

  /**
   * Enable or disable fresh install mode
   */
  static async setFreshInstallMode(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        await AsyncStorage.setItem(FRESH_INSTALL_KEY, 'true');
      } else {
        await AsyncStorage.removeItem(FRESH_INSTALL_KEY);
      }

      logger.info('Fresh install mode updated', {
        component: 'DeveloperSettingsService',
        action: 'setFreshInstallMode',
        enabled,
      });
    } catch (error) {
      logger.error('Failed to set fresh install mode', error, {
        component: 'DeveloperSettingsService',
        action: 'setFreshInstallMode',
      });
      throw error;
    }
  }

  /**
   * Get current developer settings state
   */
  static async getDeveloperSettings(): Promise<DeveloperSettings> {
    try {
      const [isFirstTimeUser, isFreshInstall] = await Promise.all([
        OnboardingService.isFirstTimeUser(),
        this.isFreshInstallMode(),
      ]);

      return {
        onboardingEnabled: isFirstTimeUser,
        freshInstallMode: isFreshInstall,
      };
    } catch (error) {
      logger.error('Failed to get developer settings', error, {
        component: 'DeveloperSettingsService',
        action: 'getDeveloperSettings',
      });

      // Return default state on error
      return {
        onboardingEnabled: false,
        freshInstallMode: false,
      };
    }
  }

  /**
   * Reset app to fresh install state
   * Clears all data and enables fresh install mode
   */
  static async resetToFreshInstall(): Promise<void> {
    try {
      logger.info('Resetting app to fresh install state', {
        component: 'DeveloperSettingsService',
        action: 'resetToFreshInstall',
      });

      // Clear all persistent data
      await Promise.all([
        OnboardingService.resetOnboarding(),
        AuthPersistenceService.clearAllPersistedData(),
        DataClearingService.clearAllData(),
        this.setFreshInstallMode(true),
      ]);

      logger.info('Successfully reset app to fresh install state', {
        component: 'DeveloperSettingsService',
        action: 'resetToFreshInstall',
      });
    } catch (error) {
      logger.error('Failed to reset app to fresh install state', error, {
        component: 'DeveloperSettingsService',
        action: 'resetToFreshInstall',
      });
      throw error;
    }
  }

  /**
   * Toggle onboarding state
   */
  static async toggleOnboarding(enabled: boolean): Promise<void> {
    try {
      if (enabled) {
        // Reset onboarding to show it again
        await OnboardingService.resetOnboarding();
      } else {
        // Mark onboarding as completed
        await OnboardingService.markOnboardingCompleted();
      }

      logger.info('Onboarding state toggled', {
        component: 'DeveloperSettingsService',
        action: 'toggleOnboarding',
        enabled,
      });
    } catch (error) {
      logger.error('Failed to toggle onboarding state', error, {
        component: 'DeveloperSettingsService',
        action: 'toggleOnboarding',
      });
      throw error;
    }
  }
}
