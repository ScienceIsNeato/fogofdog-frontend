import React from 'react';
import { Text, TouchableOpacity } from 'react-native';
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
    <>
      <Text style={styles.loadingText}>
        {error ? `Permission error: ${error}` : 'Verifying location permissions...'}
      </Text>
      {error && (
        <TouchableOpacity style={styles.retryButton} onPress={handleRetry}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      )}
    </>
  );
};
