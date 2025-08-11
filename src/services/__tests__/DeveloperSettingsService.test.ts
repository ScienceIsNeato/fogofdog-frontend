import AsyncStorage from '@react-native-async-storage/async-storage';
import { DeveloperSettingsService } from '../DeveloperSettingsService';
import { OnboardingService } from '../OnboardingService';
import { AuthPersistenceService } from '../AuthPersistenceService';
import { DataClearingService } from '../DataClearingService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock other services
jest.mock('../OnboardingService', () => ({
  OnboardingService: {
    isFirstTimeUser: jest.fn(),
    resetOnboarding: jest.fn(),
    markOnboardingCompleted: jest.fn(),
  },
}));

jest.mock('../AuthPersistenceService', () => ({
  AuthPersistenceService: {
    clearAllPersistedData: jest.fn(),
  },
}));

jest.mock('../DataClearingService', () => ({
  DataClearingService: {
    clearAllData: jest.fn(),
  },
}));

const mockedAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;
const mockedOnboardingService = OnboardingService as jest.Mocked<typeof OnboardingService>;
const mockedAuthPersistenceService = AuthPersistenceService as jest.Mocked<
  typeof AuthPersistenceService
>;
const mockedDataClearingService = DataClearingService as jest.Mocked<typeof DataClearingService>;

describe('DeveloperSettingsService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('isFreshInstallMode', () => {
    it('should return true when fresh install mode is enabled', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue('true');

      const result = await DeveloperSettingsService.isFreshInstallMode();

      expect(result).toBe(true);
      expect(mockedAsyncStorage.getItem).toHaveBeenCalledWith('@fogofdog_fresh_install_mode');
    });

    it('should return false when fresh install mode is not set', async () => {
      mockedAsyncStorage.getItem.mockResolvedValue(null);

      const result = await DeveloperSettingsService.isFreshInstallMode();

      expect(result).toBe(false);
    });

    it('should return false on error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

      const result = await DeveloperSettingsService.isFreshInstallMode();

      expect(result).toBe(false);
      consoleSpy.mockRestore();
    });
  });

  describe('setFreshInstallMode', () => {
    it('should enable fresh install mode', async () => {
      mockedAsyncStorage.setItem.mockResolvedValue(undefined);

      await DeveloperSettingsService.setFreshInstallMode(true);

      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        '@fogofdog_fresh_install_mode',
        'true'
      );
    });

    it('should disable fresh install mode', async () => {
      mockedAsyncStorage.removeItem.mockResolvedValue(undefined);

      await DeveloperSettingsService.setFreshInstallMode(false);

      expect(mockedAsyncStorage.removeItem).toHaveBeenCalledWith('@fogofdog_fresh_install_mode');
    });

    it('should throw error on failure', async () => {
      (global as any).expectConsoleErrors = true;
      mockedAsyncStorage.setItem.mockRejectedValue(new Error('Storage error'));

      await expect(DeveloperSettingsService.setFreshInstallMode(true)).rejects.toThrow(
        'Storage error'
      );
    });
  });

  describe('getDeveloperSettings', () => {
    it('should return current settings', async () => {
      mockedOnboardingService.isFirstTimeUser.mockResolvedValue(true);
      mockedAsyncStorage.getItem.mockResolvedValue('true');

      const result = await DeveloperSettingsService.getDeveloperSettings();

      expect(result).toEqual({
        onboardingEnabled: true,
        freshInstallMode: true,
      });
    });

    it('should return default settings on error', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockedOnboardingService.isFirstTimeUser.mockRejectedValue(new Error('Service error'));

      const result = await DeveloperSettingsService.getDeveloperSettings();

      expect(result).toEqual({
        onboardingEnabled: false,
        freshInstallMode: false,
      });
      consoleSpy.mockRestore();
    });
  });

  describe('resetToFreshInstall', () => {
    it('should reset app to fresh install state', async () => {
      mockedOnboardingService.resetOnboarding.mockResolvedValue(undefined);
      mockedAuthPersistenceService.clearAllPersistedData.mockResolvedValue(undefined);
      mockedDataClearingService.clearAllData.mockResolvedValue(undefined);
      mockedAsyncStorage.setItem.mockResolvedValue(undefined);

      await DeveloperSettingsService.resetToFreshInstall();

      expect(mockedOnboardingService.resetOnboarding).toHaveBeenCalled();
      expect(mockedAuthPersistenceService.clearAllPersistedData).toHaveBeenCalled();
      expect(mockedDataClearingService.clearAllData).toHaveBeenCalled();
      expect(mockedAsyncStorage.setItem).toHaveBeenCalledWith(
        '@fogofdog_fresh_install_mode',
        'true'
      );
    });

    it('should throw error on failure', async () => {
      (global as any).expectConsoleErrors = true;
      mockedOnboardingService.resetOnboarding.mockRejectedValue(new Error('Reset error'));

      await expect(DeveloperSettingsService.resetToFreshInstall()).rejects.toThrow('Reset error');
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
  });
});
