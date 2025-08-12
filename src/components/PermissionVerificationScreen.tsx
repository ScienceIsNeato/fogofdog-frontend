import React from 'react';
import { View, Text, ActivityIndicator, StyleSheet } from 'react-native';
import { logger } from '../utils/logger';

interface PermissionVerificationScreenProps {
  isVisible: boolean;
  message?: string;
}

/**
 * Blocking screen shown during permission verification process
 * This replaces the "getting your location" loading screen with proper permission flow
 */
export const PermissionVerificationScreen: React.FC<PermissionVerificationScreenProps> = ({
  isVisible,
  message = 'Verifying location permissions...',
}) => {
  if (!isVisible) {
    return null;
  }

  logger.debug('Rendering permission verification screen', {
    component: 'PermissionVerificationScreen',
    message,
  });

  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <ActivityIndicator size="large" color="#007AFF" style={styles.spinner} />
        <Text style={styles.message}>{message}</Text>
        <Text style={styles.subtitle}>
          FogOfDog needs location access to track your exploration
        </Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(255, 255, 255, 0.95)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000, // Ensure it appears above other content
  },
  content: {
    alignItems: 'center',
    paddingHorizontal: 40,
  },
  spinner: {
    marginBottom: 20,
  },
  message: {
    fontSize: 18,
    fontWeight: '600',
    color: '#333',
    textAlign: 'center',
    marginBottom: 10,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
    textAlign: 'center',
    lineHeight: 20,
  },
});
