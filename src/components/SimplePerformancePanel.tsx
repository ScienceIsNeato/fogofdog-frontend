import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Alert } from 'react-native';
import { performanceTestInjector } from '../utils/injectPerformanceTestData';
import { logger } from '../utils/logger';

interface SimplePerformancePanelProps {
  onCloseModal?: (() => void) | undefined;
}

const handleClearData = (updateCount: () => void) => {
  Alert.alert('Clear Data', 'Remove all GPS points?', [
    { text: 'Cancel', style: 'cancel' },
    {
      text: 'Clear',
      style: 'destructive',
      onPress: () => {
        performanceTestInjector.clearData();
        updateCount();
      },
    },
  ]);
};

export const SimplePerformancePanel: React.FC<SimplePerformancePanelProps> = ({ onCloseModal }) => {
  const [isLoading, setIsLoading] = useState(false);
  const [currentCount, setCurrentCount] = useState(0);

  const updateCount = () => {
    setCurrentCount(performanceTestInjector.getCurrentDataCount());
  };

  React.useEffect(() => {
    updateCount();
  }, []);

  const injectTestData = async (count: number) => {
    if (isLoading) return;

    // Show confirmation dialog before starting injection
    Alert.alert(
      'GPS Injection Ready',
      'Clicking OK will return you to the app and commence adding GPS points. Enjoy the show!',
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'OK',
          onPress: () => {
            // Close the modal immediately as promised in the dialog
            if (onCloseModal) {
              onCloseModal();
            }
            // Start GPS injection after modal is closed
            performGPSInjection(count);
          },
        },
      ]
    );
  };

  const performGPSInjection = async (count: number) => {
    setIsLoading(true);
    try {
      await performanceTestInjector.injectCustomData(count, 'REALISTIC_DRIVE');
      updateCount();
      // No success dialog - user will see the GPS points being added in real-time
    } catch (error) {
      Alert.alert('Error', 'Failed to inject test data');
      logger.error('Failed to inject test data', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Performance Testing</Text>

      <View style={styles.statusRow}>
        <Text style={styles.statusText}>GPS Points: {currentCount.toLocaleString()}</Text>
        <Text style={styles.adaptiveText}>Adaptive Optimization: Active</Text>
      </View>

      <View style={styles.buttonRow}>
        <TouchableOpacity
          style={styles.testButton}
          onPress={() => injectTestData(500)}
          disabled={isLoading}
        >
          <Text style={styles.buttonText}>+500</Text>
        </TouchableOpacity>

        <TouchableOpacity style={styles.clearButton} onPress={() => handleClearData(updateCount)} disabled={isLoading}>
          <Text style={styles.buttonText}>Clear</Text>
        </TouchableOpacity>
      </View>

      {isLoading && <Text style={styles.loadingText}>Loading...</Text>}
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#f8f9fa',
    padding: 16,
    borderRadius: 8,
    marginVertical: 8,
    borderWidth: 1,
    borderColor: '#e9ecef',
  },
  title: {
    fontSize: 16,
    fontWeight: '600',
    color: '#495057',
    marginBottom: 12,
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  statusText: {
    fontSize: 14,
    color: '#6c757d',
  },
  adaptiveText: {
    fontSize: 12,
    color: '#28a745',
    fontWeight: '500',
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  testButton: {
    flex: 1,
    backgroundColor: '#007bff',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  clearButton: {
    flex: 1,
    backgroundColor: '#dc3545',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '500',
  },
  loadingText: {
    textAlign: 'center',
    color: '#6c757d',
    fontSize: 12,
    marginTop: 8,
  },
});
