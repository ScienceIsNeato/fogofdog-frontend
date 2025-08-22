import React from 'react';
import { View, Text, StyleSheet, ActivityIndicator } from 'react-native';

interface GPSInjectionIndicatorProps {
  isVisible: boolean;
  message?: string;
}

export const GPSInjectionIndicator: React.FC<GPSInjectionIndicatorProps> = ({
  isVisible,
  message = 'GPS Injection Running...',
}) => {
  if (!isVisible) {
    return null;
  }

  return (
    <View style={styles.container}>
      <View style={styles.indicator}>
        <ActivityIndicator size="small" color="#007AFF" />
        <Text style={styles.text}>{message}</Text>
      </View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 60, // Below the status bar
    right: 16,
    zIndex: 1000, // High z-index to appear above other components
  },
  indicator: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  text: {
    color: 'white',
    fontSize: 12,
    marginLeft: 8,
    fontWeight: '500',
  },
});
