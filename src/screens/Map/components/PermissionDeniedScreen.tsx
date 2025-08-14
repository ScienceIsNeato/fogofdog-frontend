import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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
    <View
      style={styles.criticalErrorContainer}
      testID="permission-denied-screen"
      accessibilityLabel="Permission denied screen"
    >
      <Text style={styles.criticalErrorTitle}>Location Permission Required</Text>
      <Text style={styles.criticalErrorMessage}>
        This app requires location permission to track your exploration and create your fog map.
      </Text>
      {error && <Text style={styles.criticalErrorDetails}>{error}</Text>}
      <View style={styles.criticalErrorButtons}>
        <TouchableOpacity
          style={styles.criticalErrorButtonSecondary}
          onPress={handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry permission request"
        >
          <Text style={styles.criticalErrorButtonSecondaryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
};
