import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { PermissionsOrchestrator } from '../../../services/PermissionsOrchestrator';
import { logger } from '../../../utils/logger';
import { styles } from '../styles';

interface PermissionDeniedScreenProps {
  error?: string | null;
  onRetry: () => void;
}

/**
 * Screen displayed when location permissions are critically denied
 * Provides options to open settings or retry permission verification
 */
export const PermissionDeniedScreen: React.FC<PermissionDeniedScreenProps> = ({
  error,
  onRetry,
}) => {
  const handleOpenSettings = () => {
    logger.info('User opening Settings to fix location permissions');
    Linking.openSettings();
  };

  const handleRetry = async () => {
    logger.info('User going back to retry permission verification after updating settings');
    onRetry();

    // Clear any cached permission state since user may have changed settings
    try {
      await PermissionsOrchestrator.clearStoredPermissionState();
      logger.info('Cleared cached permission state for fresh verification');
    } catch (error) {
      logger.warn('Failed to clear cached permission state', { error });
    }
    // The useEffect in usePermissionVerification will automatically restart verification
    // when shouldVerifyPermissions is true and state is reset
  };

  return (
    <View style={styles.criticalErrorContainer}>
      <Text style={styles.criticalErrorTitle}>📍 Location Access Required</Text>
      <Text style={styles.criticalErrorMessage}>
        FogOfDog needs location access to track your exploration and create your fog map. Without
        location permissions, the app cannot function.
      </Text>
      {error && <Text style={styles.criticalErrorDetails}>{error}</Text>}
      <View style={styles.criticalErrorButtons}>
        <TouchableOpacity style={styles.criticalErrorButtonPrimary} onPress={handleOpenSettings}>
          <Text style={styles.criticalErrorButtonPrimaryText}>Open Settings</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.criticalErrorButtonSecondary} onPress={handleRetry}>
          <Text style={styles.criticalErrorButtonSecondaryText}>Back</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
