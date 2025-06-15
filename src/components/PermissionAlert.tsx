import { Alert, Platform, Linking } from 'react-native';

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
   * Show an alert for location permission issues
   */
  show: (props: PermissionAlertProps) => {
    const { errorMessage, onDismiss } = props;

    Alert.alert(
      'Location Permission Required',
      errorMessage,
      [
        {
          text: 'Cancel',
          style: 'cancel',
          onPress: onDismiss,
        },
        createSettingsButton(onDismiss),
      ],
      { cancelable: false }
    );
  },

  /**
   * Show a critical alert when the app cannot function without permissions
   */
  showCritical: (props: PermissionAlertProps) => {
    const { errorMessage, onDismiss } = props;

    Alert.alert(
      'FogOfDog Cannot Function',
      `${errorMessage}\n\nFogOfDog is a location-based exploration game that requires location access to work. Without location permissions, the app cannot track your exploration or clear the fog of war.`,
      [createSettingsButton(onDismiss)],
      { cancelable: false }
    );
  },
};
