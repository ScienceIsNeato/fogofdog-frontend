import AsyncStorage from '@react-native-async-storage/async-storage';
import { OnboardingService } from '../OnboardingService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('OnboardingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isFirstTimeUser', () => {
    it('should return true when no onboarding completion is stored', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);

      const result = await OnboardingService.isFirstTimeUser();

      expect(result).toBe(true);
      expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith('@fogofdog_onboarding_completed');
    });

    it('should return false when onboarding completion is stored', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue('true');

      const result = await OnboardingService.isFirstTimeUser();

      expect(result).toBe(false);
      expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith('@fogofdog_onboarding_completed');
    });

    it('should return true when AsyncStorage throws an error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await OnboardingService.isFirstTimeUser();

      expect(result).toBe(true);
      consoleSpy.mockRestore();
    });

    it('should return true when stored value is invalid', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue('invalid_value');

      const result = await OnboardingService.isFirstTimeUser();

      expect(result).toBe(true);
    });
  });

  describe('markOnboardingCompleted', () => {
    it('should store onboarding completion state', async () => {
      mockedAsyncStorage.setItem.mockResolvedValue(undefined);

      await OnboardingService.markOnboardingCompleted();

      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        '@fogofdog_onboarding_completed',
        'true'
      );
    });

    it('should handle storage errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw error
      await expect(OnboardingService.markOnboardingCompleted()).resolves.toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  describe('resetOnboarding', () => {
    it('should remove onboarding completion state for testing purposes', async () => {
      mockedAsyncStorage.removeItem.mockResolvedValue(undefined);

      await OnboardingService.resetOnboarding();

      expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith('@fogofdog_onboarding_completed');
    });

    it('should handle removal errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.removeItem.mockRejectedValue(new Error('Storage error'));

      // Should not throw error
      await expect(OnboardingService.resetOnboarding()).resolves.toBeUndefined();
      consoleSpy.mockRestore();
    });
  });

  describe('integration with first-time user flow', () => {
    it('should correctly transition from first-time to returning user', async () => {
      // Initially first time user
      mockedAsyncStorage.getItem.mockResolvedValue(null);
      let isFirstTime = await OnboardingService.isFirstTimeUser();
      expect(isFirstTime).toBe(true);

      // Mark as completed
      mockedAsyncStorage.setItem.mockResolvedValue(undefined);
      await OnboardingService.markOnboardingCompleted();

      // Now should be returning user
      mockedAsyncStorage.getItem.mockResolvedValue('true');
      isFirstTime = await OnboardingService.isFirstTimeUser();
      expect(isFirstTime).toBe(false);
    });
  });
});
