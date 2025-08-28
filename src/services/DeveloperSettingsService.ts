import { logger } from '../utils/logger';
import { OnboardingService } from './OnboardingService';

export interface DeveloperSettings {
  onboardingEnabled: boolean;
}

export class DeveloperSettingsService {
  /**
   * Get current developer settings state
   */
  static async getDeveloperSettings(): Promise<DeveloperSettings> {
    try {
      const isFirstTimeUser = await OnboardingService.isFirstTimeUser();

      return {
        onboardingEnabled: isFirstTimeUser,
      };
    } catch (error) {
      logger.error('Failed to get developer settings', error, {
        component: 'DeveloperSettingsService',
        action: 'getDeveloperSettings',
      });

      // Return default state on error
      return {
        onboardingEnabled: false,
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
}
