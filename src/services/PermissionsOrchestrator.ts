import * as Location from 'expo-location';
import { AppState } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export type PermissionMode = 'full' | 'limited' | 'denied' | 'once_only';

export interface PermissionResult {
  canProceed: boolean;
  hasBackgroundPermission: boolean;
  mode: PermissionMode;
  error?: string; // Critical error message for denied permissions
}

export interface PersistedPermissionState {
  result: PermissionResult;
  timestamp: number;
  appVersion?: string; // For future use if we need to invalidate on app updates
}

/**
 * PermissionsOrchestrator manages the complete permission flow with proper event coordination
 *
 * Three conditions must be met for completion:
 * 1. Dialog 1 response (necessary) - user grants foreground permission
 * 2. Dialog 2 response (necessary) - user responds to background permission (or iOS skips it)
 * 3. App state change (sufficient) - app becomes active after all dialogs are dismissed
 */
export class PermissionsOrchestrator {
  private static isInitialized = false;
  private static readonly PERMISSION_STATE_KEY = '@permission_state';
  private static appStateSubscription: any = null;
  private static currentResolver: ((result: PermissionResult) => void) | null = null;

  /**
   * Initialize the orchestrator - sets up app state monitoring
   */
  static async initialize(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    logger.info('Initializing PermissionsOrchestrator');

    // Set up app state listener for the third condition
    this.appStateSubscription = AppState.addEventListener('change', this.handleAppStateChange);
    this.isInitialized = true;
  }

  /**
   * Clean up the orchestrator
   */
  static cleanup(): void {
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    this.currentResolver = null;
    this.isInitialized = false;
    logger.info('PermissionsOrchestrator cleaned up');
  }

  /**
   * Handle app state changes - this is the third condition
   */
  private static readonly handleAppStateChange = async (nextAppState: string) => {
    logger.info('App state changed', {
      nextAppState,
      hasResolver: !!this.currentResolver,
      component: 'PermissionsOrchestrator',
    });

    if (nextAppState === 'active' && this.currentResolver) {
      logger.info('App became active during permission flow - checking if dialogs are complete');

      // Longer delay to ensure all permission dialogs are fully dismissed and states stabilized
      setTimeout(async () => {
        try {
          const result = await this.checkFinalPermissionState();

          logger.info('Permission flow completed via app state change', {
            result,
            trigger: 'app_became_active',
            component: 'PermissionsOrchestrator',
          });

          if (this.currentResolver) {
            await this.saveStateAndResolve(result, this.currentResolver);
            this.currentResolver = null;
          }
        } catch (error) {
          logger.error('Error checking final permission state after app became active', { error });

          if (this.currentResolver) {
            const result = {
              canProceed: false,
              hasBackgroundPermission: false,
              mode: 'denied' as const,
            };
            await this.saveStateAndResolve(result, this.currentResolver);
            this.currentResolver = null;
          }
        }
      }, 1000); // Longer delay - 1 second to ensure iOS has fully processed the dialogs
    }
  };

  /**
   * Execute the complete permission flow
   *
   * Note: This function is necessarily complex as it handles multiple permission states,
   * persistence, validation, and iOS dialog coordination. Breaking it down would lose
   * the critical flow control needed for proper permission handling.
   */

  static async requestPermissions(): Promise<PermissionResult> {
    await this.initialize();

    logger.info('Starting orchestrated permission flow');

    // First, check if we have stored permission state from previous runs
    const validatedStoredResult = await this.validateStoredPermissionState();
    if (validatedStoredResult) {
      return validatedStoredResult;
    }

    // Check if we already have sufficient permissions
    const existingPermissionsResult = await this.checkExistingPermissions();
    if (existingPermissionsResult) {
      return existingPermissionsResult;
    }

    return new Promise((resolve) => {
      this.currentResolver = resolve;

      const executePermissionFlow = async () => {
        try {
          // Condition 1: Dialog 1 - Request foreground permission
          logger.info('Condition 1: Requesting foreground permission');
          const foregroundResult = await Location.requestForegroundPermissionsAsync();

          logger.info('Foreground permission result', {
            granted: foregroundResult.granted,
            status: foregroundResult.status,
            canAskAgain: foregroundResult.canAskAgain,
          });

          if (!foregroundResult.granted) {
            logger.error(
              'CRITICAL: Foreground location permission denied - FogOfDog cannot function without GPS access',
              {
                component: 'PermissionsOrchestrator',
                action: 'requestPermissions',
                foregroundStatus: foregroundResult.status,
                canAskAgain: foregroundResult.canAskAgain,
                severity: 'critical',
              }
            );
            const result = {
              canProceed: false,
              hasBackgroundPermission: false,
              mode: 'denied' as const,
              error:
                'Location permission is required for FogOfDog to function. Please enable location access in Settings.',
            };
            await this.saveStateAndResolve(result, resolve);
            return;
          }

          // Check if user selected "Allow Once" - this is problematic for the app
          if (foregroundResult.status === 'granted' && foregroundResult.canAskAgain === false) {
            logger.warn('User selected "Allow Once" - app functionality will be severely limited');
            const result = {
              canProceed: false,
              hasBackgroundPermission: false,
              mode: 'once_only' as const, // Special mode for "Allow Once"
            };
            await this.saveStateAndResolve(result, resolve);
            return;
          }

          logger.info('Condition 1 met: Foreground permission granted with sufficient scope');

          // Condition 2: Dialog 2 - Request background permission (if iOS shows dialog)
          logger.info('Condition 2: Requesting background permission');
          await Location.requestBackgroundPermissionsAsync();

          logger.info('Condition 2 initiated: Background permission requested');
          logger.info('Waiting for Condition 3: App state change indicating dialog completion');

          // Condition 3 will be handled by the app state listener
          // Extended timeout as absolute last resort - user might take time to read and decide
          setTimeout(() => this.handlePermissionTimeout(), 60000); // 60 second timeout - much more generous
        } catch (error) {
          logger.error('Permission flow error', { error });
          const result = {
            canProceed: false,
            hasBackgroundPermission: false,
            mode: 'denied' as const,
          };
          await this.saveStateAndResolve(result, resolve);
        }
      };

      executePermissionFlow();
    });
  }

  /**
   * Helper method to interpret foreground permission status
   */
  private static getForegroundInterpretation(foreground: any): string {
    if (!foreground.granted) {
      return 'Denied/Not Set';
    }

    if (foreground.canAskAgain === false) {
      return 'Allow Once (temporary)';
    }

    return 'While Using App';
  }

  /**
   * Validate stored permission state against current live permissions
   * Returns the stored result if valid, null if invalid or no stored state
   */
  private static async validateStoredPermissionState(): Promise<PermissionResult | null> {
    const storedState = await this.loadPermissionState();
    if (!storedState) {
      logger.info('No stored permission state found');
      return null;
    }

    // Perform live permission check to validate stored state
    const livePermissions = await this.getLivePermissionStatus();

    logger.info('📦 Found Stored Permission State - Validating with Live Check', {
      stored: {
        mode: storedState.result.mode,
        canProceed: storedState.result.canProceed,
        hasBackground: storedState.result.hasBackgroundPermission,
        ageMs: Date.now() - storedState.timestamp,
        storedAt: new Date(storedState.timestamp).toISOString(),
      },
      live: {
        foreground: {
          ...livePermissions.foreground,
          interpretation: this.getForegroundInterpretation(livePermissions.foreground),
        },
        background: {
          ...livePermissions.background,
          interpretation: livePermissions.background.granted ? 'Always Allow' : 'Not Granted',
        },
        summary: this.getPermissionSummary(livePermissions.foreground, livePermissions.background),
      },
    });

    // Check if stored state is still valid (especially important for "Allow Once")
    if (this.isStoredStateValid(storedState.result, livePermissions)) {
      logger.info('Stored permission state validated - skipping orchestration');
      return storedState.result;
    } else {
      logger.warn(
        'Stored permission state is stale (likely Allow Once revoked) - clearing and re-running verification'
      );
      await this.clearStoredPermissionState();
      return null;
    }
  }

  /**
   * Check if existing permissions are sufficient to skip the dialog flow
   * Returns the result if sufficient, null if dialogs are needed
   */
  private static async checkExistingPermissions(): Promise<PermissionResult | null> {
    logger.info('No stored permission state found - proceeding with verification');

    const currentResult = await this.checkFinalPermissionState();

    if (currentResult.canProceed && currentResult.mode !== 'once_only') {
      logger.info('Permissions already sufficient - skipping flow', {
        mode: currentResult.mode,
        hasBackground: currentResult.hasBackgroundPermission,
        canProceed: currentResult.canProceed,
      });
      // Save this state so we don't need to check again
      await this.savePermissionState(currentResult);
      return currentResult;
    }

    // If we detected "Allow Once", return immediately to show the warning
    if (currentResult.mode === 'once_only') {
      logger.info('Detected "Allow Once" permission - returning warning result');
      const result = {
        canProceed: false, // Don't proceed with full functionality
        hasBackgroundPermission: false,
        mode: 'once_only' as const,
      };
      // Save this state so we don't need to check again
      await this.savePermissionState(result);
      return result;
    }

    // Permissions are not sufficient, need to run dialog flow
    return null;
  }

  /**
   * Handle permission flow timeout
   */
  private static async handlePermissionTimeout(): Promise<void> {
    if (this.currentResolver) {
      logger.warn('Permission flow timeout after 60 seconds - resolving with current state', {
        note: 'This should rarely happen - indicates user abandoned the dialog or iOS issue',
      });
      const result = await this.checkFinalPermissionState();
      if (this.currentResolver) {
        await this.saveStateAndResolve(result, this.currentResolver);
        this.currentResolver = null;
      }
    }
  }

  /**
   * Check the final permission state and determine result
   */
  private static async checkFinalPermissionState(): Promise<PermissionResult> {
    try {
      const foregroundStatus = await Location.getForegroundPermissionsAsync();
      const backgroundStatus = await Location.getBackgroundPermissionsAsync();

      logger.info('📍 Live Permission Status Check', {
        foreground: {
          granted: foregroundStatus.granted,
          status: foregroundStatus.status,
          canAskAgain: foregroundStatus.canAskAgain,
          interpretation: this.getForegroundInterpretation(foregroundStatus),
        },
        background: {
          granted: backgroundStatus.granted,
          status: backgroundStatus.status,
          interpretation: backgroundStatus.granted ? 'Always Allow' : 'Not Granted',
        },
        summary: this.getPermissionSummary(foregroundStatus, backgroundStatus),
      });

      const canProceed = foregroundStatus.granted;
      const hasBackgroundPermission = backgroundStatus.granted;

      let mode: PermissionMode;
      if (!canProceed) {
        mode = 'denied';
      } else if (foregroundStatus.status === 'granted' && foregroundStatus.canAskAgain === false) {
        // User selected "Allow Once" - this is problematic for the app
        logger.warn('Detected "Allow Once" permission in final state check');
        mode = 'once_only';
      } else if (hasBackgroundPermission) {
        mode = 'full';
      } else {
        mode = 'limited';
      }

      return {
        canProceed,
        hasBackgroundPermission,
        mode,
      };
    } catch (error) {
      logger.error('Error checking permission state', { error });
      return {
        canProceed: false,
        hasBackgroundPermission: false,
        mode: 'denied',
      };
    }
  }

  /**
   * Generate a human-readable summary of permission status
   */
  private static getPermissionSummary(foregroundStatus: any, backgroundStatus: any): string {
    if (!foregroundStatus.granted) {
      return 'No location access';
    }

    if (foregroundStatus.canAskAgain === false) {
      return 'Allow Once (temporary, will be revoked on app restart)';
    }

    if (backgroundStatus.granted) {
      return 'Always Allow (full location access)';
    }

    return 'While Using App (foreground only)';
  }

  /**
   * Get live permission status from iOS (not cached/stored)
   */
  private static async getLivePermissionStatus(): Promise<{
    foreground: {
      granted: boolean;
      status: string;
      canAskAgain: boolean;
    };
    background: {
      granted: boolean;
      status: string;
    };
  }> {
    try {
      const [foregroundStatus, backgroundStatus] = await Promise.all([
        Location.getForegroundPermissionsAsync(),
        Location.getBackgroundPermissionsAsync(),
      ]);

      return {
        foreground: {
          granted: foregroundStatus.granted,
          status: foregroundStatus.status,
          canAskAgain: foregroundStatus.canAskAgain ?? true,
        },
        background: {
          granted: backgroundStatus.granted,
          status: backgroundStatus.status,
        },
      };
    } catch (error) {
      logger.error('Failed to get live permission status', { error });
      // Return safe defaults
      return {
        foreground: {
          granted: false,
          status: 'undetermined',
          canAskAgain: true,
        },
        background: {
          granted: false,
          status: 'undetermined',
        },
      };
    }
  }

  /**
   * Validate stored permission state against live iOS permissions
   * Returns false if stored state is stale (e.g., Allow Once was revoked)
   */
  private static isStoredStateValid(
    storedResult: PermissionResult,
    livePermissions: Awaited<ReturnType<typeof this.getLivePermissionStatus>>
  ): boolean {
    // If stored state says we can proceed but live permissions show we can't, it's stale
    if (storedResult.canProceed && !livePermissions.foreground.granted) {
      logger.warn(
        'Stored state says canProceed=true but live foreground permission is not granted'
      );
      return false;
    }

    // If stored state says we have background but live permissions show we don't, it's stale
    if (storedResult.hasBackgroundPermission && !livePermissions.background.granted) {
      logger.warn(
        'Stored state says hasBackground=true but live background permission is not granted'
      );
      return false;
    }

    // Additional validation for "Allow Once" detection - if previously detected but now denied, it was revoked
    if (storedResult.mode === 'once_only' && !livePermissions.foreground.granted) {
      logger.warn('Allow Once permission was revoked (as expected on app restart)');
      return false;
    }

    return true;
  }

  /**
   * Helper method to save permission state and resolve the promise
   */
  private static async saveStateAndResolve(
    result: PermissionResult,
    resolver: ((result: PermissionResult) => void) | null
  ): Promise<void> {
    // Save the state to storage
    await this.savePermissionState(result);

    // Resolve the promise
    if (resolver) {
      resolver(result);
    }
  }

  /**
   * Save permission state to persistent storage
   */
  private static async savePermissionState(result: PermissionResult): Promise<void> {
    try {
      const persistedState: PersistedPermissionState = {
        result,
        timestamp: Date.now(),
        // Could add app version here in the future
      };

      await AsyncStorage.setItem(this.PERMISSION_STATE_KEY, JSON.stringify(persistedState));

      logger.info('Permission state saved to storage', {
        component: 'PermissionsOrchestrator',
        action: 'savePermissionState',
        mode: result.mode,
        canProceed: result.canProceed,
      });
    } catch (error) {
      logger.error('Failed to save permission state', {
        component: 'PermissionsOrchestrator',
        error,
      });
    }
  }

  /**
   * Load permission state from persistent storage
   */
  private static async loadPermissionState(): Promise<PersistedPermissionState | null> {
    try {
      const stored = await AsyncStorage.getItem(this.PERMISSION_STATE_KEY);
      if (!stored) {
        logger.info('No stored permission state found');
        return null;
      }

      const persistedState: PersistedPermissionState = JSON.parse(stored);

      logger.info('Permission state loaded from storage', {
        component: 'PermissionsOrchestrator',
        action: 'loadPermissionState',
        mode: persistedState.result.mode,
        canProceed: persistedState.result.canProceed,
        age: Date.now() - persistedState.timestamp,
      });

      return persistedState;
    } catch (error) {
      logger.error('Failed to load permission state', {
        component: 'PermissionsOrchestrator',
        error,
      });
      return null;
    }
  }

  /**
   * Clear stored permission state (useful for testing or reset)
   */
  static async clearStoredPermissionState(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.PERMISSION_STATE_KEY);
      logger.info('Stored permission state cleared');
    } catch (error) {
      logger.error('Failed to clear stored permission state', { error });
    }
  }

  /**
   * Force a fresh permission check by clearing stored state and re-running verification
   * Useful when user manually changes permission settings in iOS Settings
   */
  static async forcePermissionRefresh(): Promise<PermissionResult> {
    logger.info('Forcing permission refresh - clearing stored state');
    await this.clearStoredPermissionState();
    return this.requestPermissions();
  }

  /**
   * Legacy compatibility method
   */
  static async completePermissionVerification(): Promise<{
    canProceed: boolean;
    backgroundGranted: boolean;
    mode: PermissionMode;
    error?: string;
  }> {
    const result = await this.requestPermissions();

    const returnValue: {
      canProceed: boolean;
      backgroundGranted: boolean;
      mode: PermissionMode;
      error?: string;
    } = {
      canProceed: result.canProceed,
      backgroundGranted: result.hasBackgroundPermission,
      mode: result.mode,
    };

    if (result.error) {
      returnValue.error = result.error;
    }

    return returnValue;
  }
}
