import { GPSDiagnosticsService } from '../GPSDiagnosticsService';
import * as Location from 'expo-location';
import { Platform } from 'react-native';

jest.mock('expo-location');
jest.mock('../../utils/logger');

const mockLocation = Location as jest.Mocked<typeof Location>;

describe('GPSDiagnosticsService', () => {
  const originalPlatform = Platform.OS;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default: everything healthy
    mockLocation.hasServicesEnabledAsync.mockResolvedValue(true);
    (mockLocation.getProviderStatusAsync as jest.Mock).mockResolvedValue({
      locationServicesEnabled: true,
      gpsAvailable: true,
      networkAvailable: true,
      passiveAvailable: true,
    });
  });

  afterEach(() => {
    // @ts-expect-error - restoring read-only
    Platform.OS = originalPlatform;
  });

  describe('healthy environment', () => {
    it('should report all-clear when GPS and network are available', async () => {
      const result = await GPSDiagnosticsService.diagnose();

      expect(result.locationServicesEnabled).toBe(true);
      expect(result.gpsProviderAvailable).toBe(true);
      expect(result.networkProviderAvailable).toBe(true);
      expect(result.isLikelyEmulator).toBe(false);
      expect(result.summary).toContain('OK');
    });
  });

  describe('Android emulator detection', () => {
    beforeEach(() => {
      // @ts-expect-error - overriding read-only for test
      Platform.OS = 'android';
    });

    it('should detect likely emulator when GPS and network are both unavailable', async () => {
      (mockLocation.getProviderStatusAsync as jest.Mock).mockResolvedValue({
        locationServicesEnabled: true,
        gpsAvailable: false,
        networkAvailable: false,
        passiveAvailable: true,
      });

      const result = await GPSDiagnosticsService.diagnose();

      expect(result.gpsProviderAvailable).toBe(false);
      expect(result.networkProviderAvailable).toBe(false);
      expect(result.isLikelyEmulator).toBe(true);
      expect(result.summary).toContain('emulator');
    });

    it('should NOT flag emulator when GPS is available', async () => {
      (mockLocation.getProviderStatusAsync as jest.Mock).mockResolvedValue({
        locationServicesEnabled: true,
        gpsAvailable: true,
        networkAvailable: false,
        passiveAvailable: true,
      });

      const result = await GPSDiagnosticsService.diagnose();

      expect(result.gpsProviderAvailable).toBe(true);
      expect(result.isLikelyEmulator).toBe(false);
    });
  });

  describe('location services disabled', () => {
    it('should report when location services are disabled at the OS level', async () => {
      mockLocation.hasServicesEnabledAsync.mockResolvedValue(false);

      const result = await GPSDiagnosticsService.diagnose();

      expect(result.locationServicesEnabled).toBe(false);
      expect(result.summary).toContain('DISABLED');
    });
  });

  describe('iOS behavior', () => {
    beforeEach(() => {
      // @ts-expect-error - overriding read-only for test
      Platform.OS = 'ios';
    });

    it('should never flag emulator on iOS', async () => {
      // iOS always reports gpsAvailable/networkAvailable as true
      (mockLocation.getProviderStatusAsync as jest.Mock).mockResolvedValue({
        locationServicesEnabled: true,
        gpsAvailable: true,
        networkAvailable: true,
        passiveAvailable: true,
      });

      const result = await GPSDiagnosticsService.diagnose();

      expect(result.isLikelyEmulator).toBe(false);
    });
  });

  describe('error handling', () => {
    it('should handle Location API errors gracefully', async () => {
      mockLocation.hasServicesEnabledAsync.mockRejectedValue(new Error('API unavailable'));

      const result = await GPSDiagnosticsService.diagnose();

      expect(result.summary).toContain('failed');
      expect(result.locationServicesEnabled).toBe(false);
    });
  });
});
