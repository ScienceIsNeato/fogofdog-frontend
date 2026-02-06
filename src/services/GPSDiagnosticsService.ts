import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { logger } from '../utils/logger';

export interface GPSDiagnosticResult {
  /** Whether the device has location services enabled at the OS level */
  locationServicesEnabled: boolean;
  /** Whether GPS hardware provider is available (Android-specific) */
  gpsProviderAvailable: boolean;
  /** Whether network-based location is available */
  networkProviderAvailable: boolean;
  /** Whether this appears to be running on an emulator/simulator */
  isLikelyEmulator: boolean;
  /** Platform-specific provider status details */
  providerDetails: Record<string, unknown>;
  /** Human-readable summary for debugging */
  summary: string;
}

/**
 * GPS diagnostics service — surfaces location hardware/services status.
 *
 * This is primarily useful on Android where GPS acquisition can silently
 * fail on emulators that have no location source configured.
 */
export class GPSDiagnosticsService {
  /**
   * Run a full diagnostic check on GPS availability.
   * Call this during location service initialization to surface issues early.
   */
  static async diagnose(): Promise<GPSDiagnosticResult> {
    const result: GPSDiagnosticResult = {
      locationServicesEnabled: false,
      gpsProviderAvailable: false,
      networkProviderAvailable: false,
      isLikelyEmulator: false,
      providerDetails: {},
      summary: '',
    };

    try {
      // Check if location services are enabled at the OS level
      result.locationServicesEnabled = await Location.hasServicesEnabledAsync();

      // Get detailed provider status (includes GPS/network/passive providers on Android)
      const providerStatus = await Location.getProviderStatusAsync();
      result.providerDetails = { ...providerStatus };

      // expo-location's LocationProviderStatus has these fields:
      //   locationServicesEnabled, gpsAvailable, networkAvailable, passiveAvailable
      // (gpsAvailable/networkAvailable/passiveAvailable are Android-only, always true on iOS)
      const status = providerStatus as {
        locationServicesEnabled: boolean;
        gpsAvailable?: boolean;
        networkAvailable?: boolean;
        passiveAvailable?: boolean;
      };

      result.gpsProviderAvailable = status.gpsAvailable ?? true;
      result.networkProviderAvailable = status.networkAvailable ?? true;

      // Heuristic: on Android, if GPS provider is reported as unavailable
      // AND network provider is also unavailable, this is likely an
      // emulator with no location source configured.
      if (Platform.OS === 'android') {
        result.isLikelyEmulator = !result.gpsProviderAvailable && !result.networkProviderAvailable;
      }

      result.summary = this.buildSummary(result);

      // Log the diagnostic results
      logger.info('📡 GPS diagnostic check complete', {
        component: 'GPSDiagnosticsService',
        action: 'diagnose',
        platform: Platform.OS,
        locationServicesEnabled: result.locationServicesEnabled,
        gpsProviderAvailable: result.gpsProviderAvailable,
        networkProviderAvailable: result.networkProviderAvailable,
        isLikelyEmulator: result.isLikelyEmulator,
        providerDetails: result.providerDetails,
      });

      // Surface warnings for common issues
      if (!result.locationServicesEnabled) {
        logger.warn('⚠️ Location services are DISABLED at the OS level', {
          component: 'GPSDiagnosticsService',
          action: 'diagnose',
          platform: Platform.OS,
          recommendation:
            Platform.OS === 'android'
              ? 'Enable Location in Android Settings > Location, or for emulator: adb emu geo fix <longitude> <latitude>'
              : 'Enable Location Services in iOS Settings > Privacy & Security > Location Services',
        });
      }

      if (Platform.OS === 'android' && !result.gpsProviderAvailable) {
        logger.warn('⚠️ Android GPS provider not available', {
          component: 'GPSDiagnosticsService',
          action: 'diagnose',
          networkAvailable: result.networkProviderAvailable,
          recommendation: result.isLikelyEmulator
            ? 'Emulator detected with no GPS source. Use: adb emu geo fix <longitude> <latitude>'
            : 'GPS hardware may be disabled. Check Settings > Location.',
        });
      }
    } catch (error) {
      logger.error('GPS diagnostic check failed', error, {
        component: 'GPSDiagnosticsService',
        action: 'diagnose',
        platform: Platform.OS,
      });
      result.summary = 'GPS diagnostic check failed — could not query provider status';
    }

    return result;
  }

  /**
   * Build a human-readable summary of the diagnostic result.
   */
  private static buildSummary(result: GPSDiagnosticResult): string {
    const parts: string[] = [];

    if (!result.locationServicesEnabled) {
      parts.push('Location services DISABLED');
    }
    if (!result.gpsProviderAvailable) {
      parts.push('GPS provider unavailable');
    }
    if (!result.networkProviderAvailable) {
      parts.push('Network location unavailable');
    }
    if (result.isLikelyEmulator) {
      parts.push('Likely emulator with no GPS source');
    }

    if (parts.length === 0) {
      return `GPS diagnostics OK (${Platform.OS})`;
    }

    return `GPS issues (${Platform.OS}): ${parts.join(', ')}`;
  }
}
