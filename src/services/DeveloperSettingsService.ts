import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { OnboardingService } from './OnboardingService';

const PREFER_STREETS_KEY = 'dev_prefer_streets';
const PREFER_UNEXPLORED_KEY = 'dev_prefer_unexplored';

export interface DeveloperSettings {
  onboardingEnabled: boolean;
  preferStreets: boolean;
  preferUnexplored: boolean;
}

export class DeveloperSettingsService {
  /**
   * Get current developer settings state
   */
  static async getDeveloperSettings(): Promise<DeveloperSettings> {
    try {
      const isFirstTimeUser = await OnboardingService.isFirstTimeUser();
      const preferStreetsStr = await AsyncStorage.getItem(PREFER_STREETS_KEY);
      const preferUnexploredStr = await AsyncStorage.getItem(PREFER_UNEXPLORED_KEY);

      return {
        onboardingEnabled: isFirstTimeUser,
        preferStreets: preferStreetsStr === 'true',
        preferUnexplored: preferUnexploredStr === 'true',
      };
    } catch (error) {
      logger.error('Failed to get developer settings', error, {
        component: 'DeveloperSettingsService',
        action: 'getDeveloperSettings',
      });

      // Return default state on error
      return {
        onboardingEnabled: false,
        preferStreets: false,
        preferUnexplored: false,
      };
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

  /**
   * Toggle prefer streets setting
   */
  static async togglePreferStreets(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(PREFER_STREETS_KEY, enabled.toString());

      logger.info('Prefer streets setting toggled', {
        component: 'DeveloperSettingsService',
        action: 'togglePreferStreets',
        enabled,
      });
    } catch (error) {
      logger.error('Failed to toggle prefer streets setting', error, {
        component: 'DeveloperSettingsService',
        action: 'togglePreferStreets',
      });
      throw error;
    }
  }

  /**
   * Toggle prefer unexplored setting
   */
  static async togglePreferUnexplored(enabled: boolean): Promise<void> {
    try {
      await AsyncStorage.setItem(PREFER_UNEXPLORED_KEY, enabled.toString());

      logger.info('Prefer unexplored setting toggled', {
        component: 'DeveloperSettingsService',
        action: 'togglePreferUnexplored',
        enabled,
      });
    } catch (error) {
      logger.error('Failed to toggle prefer unexplored setting', error, {
        component: 'DeveloperSettingsService',
        action: 'togglePreferUnexplored',
      });
      throw error;
    }
  }

  /**
   * Get prefer streets setting
   */
  static async getPreferStreets(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(PREFER_STREETS_KEY);
      return value === 'true';
    } catch (error) {
      logger.error('Failed to get prefer streets setting', error, {
        component: 'DeveloperSettingsService',
        action: 'getPreferStreets',
      });
      return false;
    }
  }

  /**
   * Get prefer unexplored setting
   */
  static async getPreferUnexplored(): Promise<boolean> {
    try {
      const value = await AsyncStorage.getItem(PREFER_UNEXPLORED_KEY);
      return value === 'true';
    } catch (error) {
      logger.error('Failed to get prefer unexplored setting', error, {
        component: 'DeveloperSettingsService',
        action: 'getPreferUnexplored',
      });
      return false;
    }
  }
}
