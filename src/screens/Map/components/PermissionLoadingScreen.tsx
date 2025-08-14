import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { logger } from '../../../utils/logger';
import { styles } from '../styles';

interface PermissionLoadingScreenProps {
  error?: string | null;
  onRetry: () => void;
}

/**
 * Screen displayed while permission verification is in progress
 * Shows loading state or error with retry option
 */
export const PermissionLoadingScreen: React.FC<PermissionLoadingScreenProps> = ({
  error,
  onRetry,
}) => {
  const handleRetry = () => {
    logger.info('User requested permission verification retry');
    onRetry();
  };

  return (
    <View testID="permission-loading-screen" accessibilityLabel="Permission loading screen">
      <Text style={styles.loadingText}>Checking Location Permissions</Text>
      <Text style={styles.loadingText}>Verifying your location settings and permissions...</Text>
      {error && <Text style={styles.loadingText}>{error}</Text>}
      {error && (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={handleRetry}
          accessibilityRole="button"
          accessibilityLabel="Retry permission check"
        >
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};
