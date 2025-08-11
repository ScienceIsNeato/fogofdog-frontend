import { Alert, Platform, Linking } from 'react-native';

// Guard to prevent permission alert spam
class PermissionAlertGuard {
  private isShowing = false;
  private lastShownTime = 0;
  private readonly COOLDOWN_MS = 3000; // 3 second cooldown between alerts
  private testMode = false;

  canShow(): boolean {
    // In test mode, always allow showing
    if (this.testMode) {
      return true;
    }

    if (this.isShowing) {
      return false;
    }
    
    const now = Date.now();
    if (now - this.lastShownTime < this.COOLDOWN_MS) {
      return false;
    }
    
    return true;
  }

  setShowing(isShowing: boolean): void {
    this.isShowing = isShowing;
    if (isShowing) {
      this.lastShownTime = Date.now();
    }
  }

  setTestMode(testMode: boolean): void {
    this.testMode = testMode;
  }

  reset(): void {
    this.isShowing = false;
    this.lastShownTime = 0;
  }
}

const alertGuard = new PermissionAlertGuard();

export interface PermissionAlertProps {
  errorMessage: string;
  onDismiss?: () => void;
}

/**
 * Helper function to open device settings
 */
const openSettings = (onDismiss?: () => void): void => {
  if (Platform.OS === 'ios') {
    Linking.openURL('app-settings:');
  } else {
    Linking.openSettings();
  }
  onDismiss?.();
};

/**
 * Helper function to create settings button
 */
const createSettingsButton = (onDismiss?: () => void) => ({
  text: 'Open Settings',
  onPress: () => openSettings(onDismiss),
});

export const PermissionAlert = {
  /**
   * Show an alert for location permission issues - with spam protection
   */
  show: (props: PermissionAlertProps & { permissionStatus?: string }) => {
    const { errorMessage, onDismiss, permissionStatus } = props;

    // Only show alert for 'never allow' or 'denied' status when permissionStatus is provided
    if (permissionStatus && !['denied', 'undetermined'].includes(permissionStatus)) {
      console.warn('Location permission not optimal but not critical:', permissionStatus);
      return;
    }

    if (!alertGuard.canShow()) {
      console.log('Permission alert blocked by guard - preventing spam');
      return;
    }

    alertGuard.setShowing(true);

    const wrappedOnDismiss = () => {
      alertGuard.setShowing(false);
      onDismiss?.();
    };

    Alert.alert(
      'Location Permission Required',
      errorMessage,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: wrappedOnDismiss,
        },
        createSettingsButton(wrappedOnDismiss),
      ],
      { cancelable: false }
    );
  },

  /**
   * Show a critical alert when the app cannot function without permissions
   */
  showCritical: (props: PermissionAlertProps & { permissionStatus?: string }) => {
    const { errorMessage, onDismiss, permissionStatus } = props;

    // Only show for truly critical cases when permissionStatus is provided
    if (permissionStatus && !['denied'].includes(permissionStatus)) {
      if (permissionStatus === 'granted') {
        console.log('Permission granted, no need for critical alert');
        return;
      }
      console.warn('Location permission suboptimal but not critical:', permissionStatus);
      return;
    }

    if (!alertGuard.canShow()) {
      console.log('Critical permission alert blocked by guard - preventing spam');
      return;
    }

    alertGuard.setShowing(true);

    const wrappedOnDismiss = () => {
      alertGuard.setShowing(false);
      onDismiss?.();
    };

    Alert.alert(
      'FogOfDog Cannot Function',
      `${errorMessage}\n\nFogOfDog is a location-based exploration game that requires location access to work. Without location permissions, the app cannot track your exploration or clear the fog of war.`,
      [createSettingsButton(wrappedOnDismiss)],
      { cancelable: false }
    );
  },

  // Expose guard for testing
  _testGuard: alertGuard,
};
