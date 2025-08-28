import { DeveloperSettingsService } from '../DeveloperSettingsService';
import { OnboardingService } from '../OnboardingService';

// Mock OnboardingService
jest.mock('../OnboardingService', () => ({
  OnboardingService: {
    isFirstTimeUser: jest.fn(),
    resetOnboarding: jest.fn(),
    markOnboardingCompleted: jest.fn(),
  },
}));

const mockedOnboardingService = OnboardingService as jest.Mocked<typeof OnboardingService>;

describe('DeveloperSettingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getDeveloperSettings', () => {
    it('should return current settings', async () => {
      mockedOnboardingService.isFirstTimeUser.mockResolvedValue(true);

      const result = await DeveloperSettingsService.getDeveloperSettings();

      expect(result).toEqual({
        onboardingEnabled: true,
      });
    });

    it('should return default settings on error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedOnboardingService.isFirstTimeUser.mockRejectedValue(new Error('Service error'));

      const result = await DeveloperSettingsService.getDeveloperSettings();

      expect(result).toEqual({
        onboardingEnabled: false,
      });
      consoleSpy.mockRestore();
    });

    it('should handle service error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedOnboardingService.isFirstTimeUser.mockRejectedValue(new Error('Network error'));

      const result = await DeveloperSettingsService.getDeveloperSettings();

      expect(result.onboardingEnabled).toBe(false);
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Failed to get developer settings'),
        expect.any(Error),
        expect.any(Object)
      );
      consoleSpy.mockRestore();
    });
  });

  describe('toggleOnboarding', () => {
    it('should reset onboarding when enabled', async () => {
      mockedOnboardingService.resetOnboarding.mockResolvedValue(undefined);

      await DeveloperSettingsService.toggleOnboarding(true);

      expect(mockedOnboardingService.resetOnboarding).toHaveBeenCalled();
    });

    it('should mark onboarding as completed when disabled', async () => {
      mockedOnboardingService.markOnboardingCompleted.mockResolvedValue(undefined);

      await DeveloperSettingsService.toggleOnboarding(false);

      expect(mockedOnboardingService.markOnboardingCompleted).toHaveBeenCalled();
    });

    it('should throw error on failure', async () => {
      (global as any).expectConsoleErrors = true;
      mockedOnboardingService.resetOnboarding.mockRejectedValue(new Error('Toggle error'));

      await expect(DeveloperSettingsService.toggleOnboarding(true)).rejects.toThrow('Toggle error');
    });

    it('should handle toggle error when disabling onboarding', async () => {
      (global as any).expectConsoleErrors = true;
      mockedOnboardingService.markOnboardingCompleted.mockRejectedValue(new Error('Disable error'));

      await expect(DeveloperSettingsService.toggleOnboarding(false)).rejects.toThrow(
        'Disable error'
      );
    });
  });
});
