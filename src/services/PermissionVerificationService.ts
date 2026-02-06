import * as Location from 'expo-location';
import { Platform } from 'react-native';
import { logger } from '../utils/logger';

export type PermissionLevel = 'always' | 'whenInUse' | 'denied' | 'undetermined';

export interface PermissionVerificationResult {
  canProceed: boolean;
  hasBackgroundPermission: boolean;
  warningMessage?: string;
}

/**
 * Simplified permission verification service that handles the two-dialog flow:
 * Dialog 1: System location permission (3 options)
 * Dialog 2: System background permission upgrade (2 options)
 */
export class PermissionVerificationService {
  /**
   * Main permission verification flow - handles the conceptual two-dialog sequence
   */
  static async verifyAndRequestPermissions(): Promise<PermissionVerificationResult> {
    logger.info('Starting permission verification flow');

    // Check if permissions are already granted
    if (await this.arePermissionsSufficient()) {
      return {
        canProceed: true,
        hasBackgroundPermission: await this.hasBackgroundPermission(),
      };
    }

    // Dialog 1: Request initial location permission
    const dialog1Result = await this.handleDialog1();

    if (!dialog1Result.canProceed) {
      return dialog1Result;
    }

    // Dialog 2: Request background permission upgrade (if applicable)
    return await this.handleDialog2();
  }

  /**
   * Check if current permissions are sufficient to proceed
   * Only return true if we have BOTH foreground and background permissions
   */
  private static async arePermissionsSufficient(): Promise<boolean> {
    try {
      const foregroundStatus = await Location.getForegroundPermissionsAsync();
      const backgroundStatus = await Location.getBackgroundPermissionsAsync();

      logger.info('Checking current permission status', {
        foreground: foregroundStatus.granted,
        background: backgroundStatus.granted,
      });

      // Only sufficient if we have both - otherwise we need to go through the dialog flow
      return foregroundStatus.granted && backgroundStatus.granted;
    } catch (error) {
      logger.error('Failed to check permission status', { error });
      return false;
    }
  }

  /**
   * Check if we have background permission
   */
  private static async hasBackgroundPermission(): Promise<boolean> {
    try {
      const backgroundStatus = await Location.getBackgroundPermissionsAsync();
      return backgroundStatus.granted;
    } catch (error) {
      logger.error('Failed to check background permission status', { error });
      return false;
    }
  }

  /**
   * Dialog 1: Handle initial location permission request
   * System shows: "Allow FogOfDog to access your location?"
   * Options: "Allow While Using App", "Allow Once", "Don't Allow"
   */
  private static async handleDialog1(): Promise<PermissionVerificationResult> {
    try {
      logger.info('Requesting foreground location permission');

      const result = await Location.requestForegroundPermissionsAsync();

      if (!result.granted) {
        return {
          canProceed: false,
          hasBackgroundPermission: false,
          warningMessage:
            'Location access is required for FogOfDog to function. Please enable location permissions in your device settings.',
        };
      }

      // User selected "Allow While Using App" or "Allow Once"
      return {
        canProceed: true,
        hasBackgroundPermission: false,
      };
    } catch (error) {
      logger.error('Dialog 1 failed', { error });
      return {
        canProceed: false,
        hasBackgroundPermission: false,
        warningMessage: 'Failed to request location permissions. Please try again.',
      };
    }
  }

  /**
   * Dialog 2: Handle background permission upgrade request
   *
   * Platform differences:
   * - iOS: May show an inline dialog ("Change to Always Allow" / "Keep Only While Using").
   *   requestBackgroundPermissionsAsync() doesn't block, so we poll for the result.
   * - Android: requestBackgroundPermissionsAsync() returns the result directly.
   *   On Android 11+ (API 30+), this opens the Settings app for "Allow all the time"
   *   permission — the result reflects whether permission was already granted.
   *   The user may need to manually toggle the setting and return to the app.
   */
  private static async handleDialog2(): Promise<PermissionVerificationResult> {
    try {
      // First, check current background permission status
      const initialBackgroundStatus = await Location.getBackgroundPermissionsAsync();

      logger.info('Checking background permission status for upgrade dialog', {
        platform: Platform.OS,
        initialStatus: initialBackgroundStatus.status,
        granted: initialBackgroundStatus.granted,
      });

      // If background permission is already determined (granted or denied), no dialog will show
      if (initialBackgroundStatus.status !== 'undetermined') {
        logger.info('Background permission already determined - no dialog needed', {
          platform: Platform.OS,
          status: initialBackgroundStatus.status,
          granted: initialBackgroundStatus.granted,
        });

        const result: PermissionVerificationResult = {
          canProceed: true,
          hasBackgroundPermission: initialBackgroundStatus.granted,
        };

        if (!initialBackgroundStatus.granted) {
          result.warningMessage =
            'FogOfDog works best with "Always Allow" location access. With "While Using App" permission, the app won\'t track your activities when your phone is locked or the app is in the background.';
        }

        return result;
      }

      // Background permission is undetermined — request it
      logger.info('Background permission undetermined - requesting upgrade', {
        platform: Platform.OS,
      });

      if (Platform.OS === 'android') {
        return await this.handleDialog2Android();
      } else {
        return await this.handleDialog2iOS();
      }
    } catch (error) {
      logger.error('Dialog 2 failed', { error, platform: Platform.OS });
      // Even if dialog 2 fails, we can proceed with foreground permission
      return {
        canProceed: true,
        hasBackgroundPermission: false,
        warningMessage:
          'Background location permission could not be requested. The app will work with limited functionality.',
      };
    }
  }

  /**
   * Android-specific background permission handling.
   *
   * On Android 11+ (API 30+), requestBackgroundPermissionsAsync() opens the
   * system Settings screen for "Allow all the time". The API returns the current
   * state immediately — it does NOT block until the user returns.
   *
   * We request once, check the result, and move on. The app works in
   * foreground-only mode until the user manually enables background access.
   */
  private static async handleDialog2Android(): Promise<PermissionVerificationResult> {
    const requestResult = await Location.requestBackgroundPermissionsAsync();

    logger.info('Android background permission request result', {
      status: requestResult.status,
      granted: requestResult.granted,
      canAskAgain: requestResult.canAskAgain,
    });

    if (requestResult.granted) {
      logger.info('Android background permission granted');
      return {
        canProceed: true,
        hasBackgroundPermission: true,
      };
    }

    // On Android, if not granted, the user may need to go to Settings manually.
    // We don't poll — just proceed with foreground-only mode.
    logger.info('Android background permission not granted - proceeding with foreground only', {
      status: requestResult.status,
      canAskAgain: requestResult.canAskAgain,
      note: 'User can enable "Allow all the time" in Settings > Location > FogOfDog',
    });

    return {
      canProceed: true,
      hasBackgroundPermission: false,
      warningMessage:
        'FogOfDog works best with "Always Allow" location access. To enable background tracking, go to Settings > Location > FogOfDog and select "Allow all the time".',
    };
  }

  /**
   * iOS-specific background permission handling.
   *
   * iOS may show an inline dialog after foreground permission is granted:
   * "Allow FogOfDog to also use your location even when not using the app?"
   * Options: "Keep Only While Using", "Change to Always Allow"
   *
   * requestBackgroundPermissionsAsync() doesn't block on iOS, so we poll
   * to detect when the user responds to the dialog.
   */
  private static async handleDialog2iOS(): Promise<PermissionVerificationResult> {
    await Location.requestBackgroundPermissionsAsync();

    // Wait for iOS to show and the user to respond to the dialog
    await this.waitForBackgroundDialogCompletion();

    // Check final permission status after potential user response
    const finalResult = await Location.getBackgroundPermissionsAsync();

    if (finalResult.granted) {
      logger.info('iOS background permission granted by user');
      return {
        canProceed: true,
        hasBackgroundPermission: true,
      };
    } else {
      logger.info('iOS background permission not granted', {
        finalStatus: finalResult.status,
        reason: finalResult.status === 'denied' ? 'user_denied' : 'no_dialog_shown',
      });
      return {
        canProceed: true,
        hasBackgroundPermission: false,
        warningMessage:
          'FogOfDog works best with "Always Allow" location access. With "While Using App" permission, the app won\'t track your activities when your phone is locked or the app is in the background.',
      };
    }
  }

  /**
   * Wait for user to complete the iOS background permission dialog.
   * This is iOS-only because requestBackgroundPermissionsAsync doesn't block on iOS.
   * Uses shorter timeout since iOS might not show the dialog at all.
   *
   * Note: This method is NOT used on Android — Android's request returns immediately.
   */
  private static async waitForBackgroundDialogCompletion(): Promise<void> {
    return new Promise((resolve) => {
      logger.info('Starting wait for iOS background dialog completion');

      let checkCount = 0;
      const maxChecks = 20; // 10 seconds maximum wait

      const checkPermissionStatus = async () => {
        checkCount++;

        try {
          const backgroundStatus = await Location.getBackgroundPermissionsAsync();

          logger.debug('Checking background permission status during iOS dialog wait', {
            checkCount,
            granted: backgroundStatus.granted,
            status: backgroundStatus.status,
          });

          // If status is no longer undetermined, user has responded or iOS decided not to show dialog
          if (backgroundStatus.status !== 'undetermined') {
            logger.info('iOS background dialog completed - permission status determined', {
              granted: backgroundStatus.granted,
              status: backgroundStatus.status,
              checksRequired: checkCount,
            });
            resolve();
            return;
          }

          if (checkCount < maxChecks) {
            setTimeout(checkPermissionStatus, 500);
          } else {
            logger.info('iOS background dialog wait timeout - iOS likely did not show dialog', {
              maxChecksReached: maxChecks,
              note: 'This is normal - iOS may not show background permission dialog in all cases',
            });
            resolve();
          }
        } catch (error) {
          logger.error('Error checking background permission during iOS dialog wait', { error });
          resolve(); // Resolve anyway to prevent hanging
        }
      };

      // Start checking after a brief delay
      setTimeout(checkPermissionStatus, 500);
    });
  }

  /**
   * Complete permission verification - returns simplified result for app usage
   */
  static async completePermissionVerification(): Promise<{
    canProceed: boolean;
    backgroundGranted: boolean;
    mode: 'full' | 'limited' | 'denied';
  }> {
    try {
      const result = await this.verifyAndRequestPermissions();

      if (!result.canProceed) {
        return {
          canProceed: false,
          backgroundGranted: false,
          mode: 'denied',
        };
      }

      if (result.hasBackgroundPermission) {
        return {
          canProceed: true,
          backgroundGranted: true,
          mode: 'full',
        };
      }

      return {
        canProceed: true,
        backgroundGranted: false,
        mode: 'limited',
      };
    } catch (error) {
      logger.error('Permission verification failed', { error });
      return {
        canProceed: false,
        backgroundGranted: false,
        mode: 'denied',
      };
    }
  }
}
