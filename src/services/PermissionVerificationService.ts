import * as Location from 'expo-location';
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
        hasBackgroundPermission: await this.hasBackgroundPermission() 
      };
    }

    // Dialog 1: Request initial location permission
    const dialog1Result = await this.handleDialog1();
    
    if (!dialog1Result.canProceed) {
      return dialog1Result;
    }

    // Dialog 2: Request background permission upgrade (if applicable)
    const dialog2Result = await this.handleDialog2();
    
    return dialog2Result;
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
        background: backgroundStatus.granted
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
          warningMessage: 'Location access is required for FogOfDog to function. Please enable location permissions in your device settings.'
        };
      }

      // User selected "Allow While Using App" or "Allow Once"
      return {
        canProceed: true,
        hasBackgroundPermission: false
      };
    } catch (error) {
      logger.error('Dialog 1 failed', { error });
      return {
        canProceed: false,
        hasBackgroundPermission: false,
        warningMessage: 'Failed to request location permissions. Please try again.'
      };
    }
  }

  /**
   * Dialog 2: Handle background permission upgrade request
   * iOS may or may not automatically show this dialog after user grants foreground permission
   * System shows: "Allow FogOfDog to also use your location even when not using the app?"
   * Options: "Keep Only While Using", "Change to Always Allow"
   */
  private static async handleDialog2(): Promise<PermissionVerificationResult> {
    try {
      // First, check current background permission status
      const initialBackgroundStatus = await Location.getBackgroundPermissionsAsync();
      
      logger.info('Checking if iOS will show background permission dialog', {
        initialStatus: initialBackgroundStatus.status,
        granted: initialBackgroundStatus.granted
      });
      
      // If background permission is already determined (granted or denied), no dialog will show
      if (initialBackgroundStatus.status !== 'undetermined') {
        logger.info('Background permission already determined - no dialog needed', {
          status: initialBackgroundStatus.status,
          granted: initialBackgroundStatus.granted
        });
        
        return {
          canProceed: true,
          hasBackgroundPermission: initialBackgroundStatus.granted,
          warningMessage: initialBackgroundStatus.granted ? undefined : 
            'FogOfDog works best with "Always Allow" location access. With "While Using App" permission, the app won\'t track your activities when your phone is locked or the app is in the background.'
        };
      }
      
      // Background permission is undetermined - iOS might show a dialog
      // Try requesting it and see if a dialog appears
      logger.info('Background permission undetermined - requesting and waiting for potential dialog');
      
      await Location.requestBackgroundPermissionsAsync();
      
      // Wait a short time to see if iOS shows the dialog
      await this.waitForBackgroundDialogCompletion();
      
      // Check final permission status after potential user response
      const finalResult = await Location.getBackgroundPermissionsAsync();
      
      if (finalResult.granted) {
        // User selected "Change to Always Allow"
        logger.info('Background permission granted by user');
        return {
          canProceed: true,
          hasBackgroundPermission: true
        };
      } else {
        // User selected "Keep Only While Using" or iOS didn't show dialog
        logger.info('Background permission not granted', {
          finalStatus: finalResult.status,
          reason: finalResult.status === 'denied' ? 'user_denied' : 'no_dialog_shown'
        });
        return {
          canProceed: true,
          hasBackgroundPermission: false,
          warningMessage: 'FogOfDog works best with "Always Allow" location access. With "While Using App" permission, the app won\'t track your activities when your phone is locked or the app is in the background.'
        };
      }
    } catch (error) {
      logger.error('Dialog 2 failed', { error });
      // Even if dialog 2 fails, we can proceed with foreground permission
      return {
        canProceed: true,
        hasBackgroundPermission: false,
        warningMessage: 'Background location permission could not be requested. The app will work with limited functionality.'
      };
    }
  }

  /**
   * Wait for user to complete the background permission dialog
   * This is necessary because requestBackgroundPermissionsAsync doesn't block
   * Uses shorter timeout since iOS might not show the dialog at all
   */
  private static async waitForBackgroundDialogCompletion(): Promise<void> {
    return new Promise((resolve) => {
      logger.info('Starting wait for background dialog completion');
      
      let checkCount = 0;
      const maxChecks = 20; // 10 seconds maximum wait (shorter timeout)
      
      const checkPermissionStatus = async () => {
        checkCount++;
        
        try {
          // Check if permission status has stabilized
          const backgroundStatus = await Location.getBackgroundPermissionsAsync();
          
          logger.debug('Checking background permission status during dialog wait', {
            checkCount,
            granted: backgroundStatus.granted,
            status: backgroundStatus.status
          });
          
          // If status is no longer undetermined, user has responded or iOS decided not to show dialog
          if (backgroundStatus.status !== 'undetermined') {
            logger.info('Background dialog completed - permission status determined', {
              granted: backgroundStatus.granted,
              status: backgroundStatus.status,
              checksRequired: checkCount
            });
            resolve();
            return;
          }
          
          // Continue checking if we haven't exceeded max checks
          if (checkCount < maxChecks) {
            setTimeout(checkPermissionStatus, 500);
          } else {
            logger.info('Background dialog wait timeout - iOS likely did not show dialog', {
              maxChecksReached: maxChecks,
              note: 'This is normal - iOS may not show background permission dialog in all cases'
            });
            resolve();
          }
        } catch (error) {
          logger.error('Error checking background permission during dialog wait', { error });
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
          mode: 'denied'
        };
      }

      if (result.hasBackgroundPermission) {
        return {
          canProceed: true,
          backgroundGranted: true,
          mode: 'full'
        };
      }

      return {
        canProceed: true,
        backgroundGranted: false,
        mode: 'limited'
      };
    } catch (error) {
      logger.error('Permission verification failed', { error });
      return {
        canProceed: false,
        backgroundGranted: false,
        mode: 'denied'
      };
    }
  }
}