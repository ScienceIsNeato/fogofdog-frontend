import { DeveloperSettingsService } from '../DeveloperSettingsService';
import { OnboardingService } from '../OnboardingService';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage');

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
    (AsyncStorage.getItem as jest.Mock).mockClear();
    (AsyncStorage.setItem as jest.Mock).mockClear();
  });

  describe('getDeveloperSettings', () => {
    beforeEach(() => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    });

    it('should return current settings', async () => {
      mockedOnboardingService.isFirstTimeUser.mockResolvedValue(true);
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      const result = await DeveloperSettingsService.getDeveloperSettings();

      expect(result).toEqual({
        onboardingEnabled: true,
        preferStreets: false,
        preferUnexplored: false,
      });
    });

    it('should return settings with prefer streets enabled', async () => {
      mockedOnboardingService.isFirstTimeUser.mockResolvedValue(false);
      (AsyncStorage.getItem as jest.Mock)
        .mockResolvedValueOnce('true') // preferStreets
        .mockResolvedValueOnce('false'); // preferUnexplored

      const result = await DeveloperSettingsService.getDeveloperSettings();

      expect(result).toEqual({
        onboardingEnabled: false,
        preferStreets: true,
        preferUnexplored: false,
      });
    });

    it('should return default settings on error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedOnboardingService.isFirstTimeUser.mockRejectedValue(new Error('Service error'));

      const result = await DeveloperSettingsService.getDeveloperSettings();

      expect(result).toEqual({
        onboardingEnabled: false,
        preferStreets: false,
        preferUnexplored: false,
      });
      consoleSpy.mockRestore();
    });

    it('should handle service error gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedOnboardingService.isFirstTimeUser.mockRejectedValue(new Error('Network error'));

      const result = await DeveloperSettingsService.getDeveloperSettings();

      expect(result.onboardingEnabled).toBe(false);
      expect(result.preferStreets).toBe(false);
      expect(result.preferUnexplored).toBe(false);
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

  describe('togglePreferStreets', () => {
    it('should save prefer streets setting', async () => {
      await DeveloperSettingsService.togglePreferStreets(true);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('dev_prefer_streets', 'true');
    });

    it('should handle errors gracefully', async () => {
      (global as any).expectConsoleErrors = true;
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await expect(DeveloperSettingsService.togglePreferStreets(true)).rejects.toThrow(
        'Storage error'
      );
    });
  });

  describe('togglePreferUnexplored', () => {
    it('should save prefer unexplored setting', async () => {
      await DeveloperSettingsService.togglePreferUnexplored(true);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('dev_prefer_unexplored', 'true');
    });

    it('should handle errors gracefully', async () => {
      (global as any).expectConsoleErrors = true;
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await expect(DeveloperSettingsService.togglePreferUnexplored(true)).rejects.toThrow(
        'Storage error'
      );
    });
  });

  describe('getPreferStreets', () => {
    it('should return true when setting is enabled', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');

      const result = await DeveloperSettingsService.getPreferStreets();

      expect(result).toBe(true);
    });

    it('should return false when setting is disabled', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');

      const result = await DeveloperSettingsService.getPreferStreets();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const result = await DeveloperSettingsService.getPreferStreets();

      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('getPreferUnexplored', () => {
    it('should return true when setting is enabled', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('true');

      const result = await DeveloperSettingsService.getPreferUnexplored();

      expect(result).toBe(true);
    });

    it('should return false when setting is disabled', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('false');

      const result = await DeveloperSettingsService.getPreferUnexplored();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const result = await DeveloperSettingsService.getPreferUnexplored();

      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });
});
