import * as Location from 'expo-location';
import { AppState } from 'react-native';
import { logger } from '../utils/logger';

export interface PermissionResult {
  canProceed: boolean;
  hasBackgroundPermission: boolean;
  mode: 'full' | 'limited' | 'denied';
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
  private static handleAppStateChange = async (nextAppState: string) => {
    logger.info('App state changed', { 
      nextAppState, 
      hasResolver: !!this.currentResolver,
      component: 'PermissionsOrchestrator'
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
            component: 'PermissionsOrchestrator'
          });
          
          if (this.currentResolver) {
            this.currentResolver(result);
            this.currentResolver = null;
          }
        } catch (error) {
          logger.error('Error checking final permission state after app became active', { error });
          
          if (this.currentResolver) {
            this.currentResolver({
              canProceed: false,
              hasBackgroundPermission: false,
              mode: 'denied'
            });
            this.currentResolver = null;
          }
        }
      }, 1000); // Longer delay - 1 second to ensure iOS has fully processed the dialogs
    }
  };

  /**
   * Execute the complete permission flow
   */
  static async requestPermissions(): Promise<PermissionResult> {
    await this.initialize();

    logger.info('Starting orchestrated permission flow');

    // Check if we already have sufficient permissions
    const currentResult = await this.checkFinalPermissionState();
    if (currentResult.canProceed && currentResult.hasBackgroundPermission) {
      logger.info('Permissions already sufficient - skipping flow');
      return currentResult;
    }

    return new Promise(async (resolve) => {
      this.currentResolver = resolve;

      try {
        // Condition 1: Dialog 1 - Request foreground permission
        logger.info('Condition 1: Requesting foreground permission');
        const foregroundResult = await Location.requestForegroundPermissionsAsync();
        
        if (!foregroundResult.granted) {
          logger.info('Foreground permission denied - flow complete');
          resolve({
            canProceed: false,
            hasBackgroundPermission: false,
            mode: 'denied'
          });
          return;
        }

        logger.info('Condition 1 met: Foreground permission granted');

        // Condition 2: Dialog 2 - Request background permission (if iOS shows dialog)
        logger.info('Condition 2: Requesting background permission');
        await Location.requestBackgroundPermissionsAsync();
        
        logger.info('Condition 2 initiated: Background permission requested');
        logger.info('Waiting for Condition 3: App state change indicating dialog completion');
        
        // Condition 3 will be handled by the app state listener
        // Extended timeout as absolute last resort - user might take time to read and decide
        setTimeout(() => {
          if (this.currentResolver) {
            logger.warn('Permission flow timeout after 60 seconds - resolving with current state', {
              note: 'This should rarely happen - indicates user abandoned the dialog or iOS issue'
            });
            this.checkFinalPermissionState().then((result) => {
              if (this.currentResolver) {
                this.currentResolver(result);
                this.currentResolver = null;
              }
            });
          }
        }, 60000); // 60 second timeout - much more generous

      } catch (error) {
        logger.error('Permission flow error', { error });
        resolve({
          canProceed: false,
          hasBackgroundPermission: false,
          mode: 'denied'
        });
      }
    });
  }

  /**
   * Check the final permission state and determine result
   */
  private static async checkFinalPermissionState(): Promise<PermissionResult> {
    try {
      const foregroundStatus = await Location.getForegroundPermissionsAsync();
      const backgroundStatus = await Location.getBackgroundPermissionsAsync();

      logger.info('Checking final permission state', {
        foreground: {
          granted: foregroundStatus.granted,
          status: foregroundStatus.status
        },
        background: {
          granted: backgroundStatus.granted,
          status: backgroundStatus.status
        }
      });

      const canProceed = foregroundStatus.granted;
      const hasBackgroundPermission = backgroundStatus.granted;

      let mode: 'full' | 'limited' | 'denied';
      if (!canProceed) {
        mode = 'denied';
      } else if (hasBackgroundPermission) {
        mode = 'full';
      } else {
        mode = 'limited';
      }

      return {
        canProceed,
        hasBackgroundPermission,
        mode
      };
    } catch (error) {
      logger.error('Error checking permission state', { error });
      return {
        canProceed: false,
        hasBackgroundPermission: false,
        mode: 'denied'
      };
    }
  }

  /**
   * Legacy compatibility method
   */
  static async completePermissionVerification(): Promise<{
    canProceed: boolean;
    backgroundGranted: boolean;
    mode: 'full' | 'limited' | 'denied';
  }> {
    const result = await this.requestPermissions();
    
    return {
      canProceed: result.canProceed,
      backgroundGranted: result.hasBackgroundPermission,
      mode: result.mode
    };
  }
}
