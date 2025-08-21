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

  const injectRealTimeData = async (count: number) => {
    if (isLoading) return;

    Alert.alert(
      'Real-Time GPS Injection',
      `This will inject ${count} GPS points in real-time with current timestamps. The GPS beacon will act as the "head" of the worm. This will take about ${Math.round(count / 60)} minutes.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Start Real-Time',
          onPress: () => {
            if (onCloseModal) {
              onCloseModal();
            }
            performRealTimeInjection(count);
          },
        },
      ]
    );
  };

  const injectHistoricalData = async (count: number) => {
    if (isLoading) return;

    Alert.alert(
      'Historical GPS Data',
      `This will prepend ${count} historical GPS points to the beginning of your record as a complete session. This happens instantly.`,
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Add Historical',
          onPress: () => {
            if (onCloseModal) {
              onCloseModal();
            }
            performHistoricalInjection(count);
          },
        },
      ]
    );
  };

  const performRealTimeInjection = async (count: number) => {
    setIsLoading(true);
    try {
      await performanceTestInjector.injectRealTimeData(count, 'REALISTIC_DRIVE', {
        intervalMs: 1000, // 1 second between points
      });
      updateCount();
    } catch (error) {
      Alert.alert('Error', 'Failed to inject real-time data');
      logger.error('Failed to inject real-time data', error);
    } finally {
      setIsLoading(false);
    }
  };

  const performHistoricalInjection = async (count: number) => {
    setIsLoading(true);
    try {
      await performanceTestInjector.prependHistoricalData(count, 'REALISTIC_DRIVE', {
        sessionDurationHours: 2, // 2-hour historical session
      });
      updateCount();
    } catch (error) {
      Alert.alert('Error', 'Failed to inject historical data');
      logger.error('Failed to inject historical data', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>Performance Testing</Text>

      <View style={styles.statusRow}>
        <Text style={styles.statusText}>GPS Points: {currentCount.toLocaleString()}</Text>
      </View>

      <View style={styles.buttonContainer}>
        <Text style={styles.sectionLabel}>Real-Time Injection</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.realTimeButton}
            onPress={() => injectRealTimeData(100)}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>+100 Live</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.realTimeButton}
            onPress={() => injectRealTimeData(500)}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>+500 Live</Text>
          </TouchableOpacity>
        </View>
        
        <Text style={styles.sectionLabel}>Historical Data</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.historicalButton}
            onPress={() => injectHistoricalData(100)}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>+100 History</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.historicalButton}
            onPress={() => injectHistoricalData(500)}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>+500 History</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.buttonRow}>
          <TouchableOpacity
            style={styles.clearButton}
            onPress={() => handleClearData(updateCount)}
            disabled={isLoading}
          >
            <Text style={styles.buttonText}>Clear All Data</Text>
          </TouchableOpacity>
        </View>
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
  buttonContainer: {
    gap: 8,
  },
  sectionLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#495057',
    marginTop: 8,
    marginBottom: 4,
  },
  buttonRow: {
    flexDirection: 'row',
    gap: 8,
  },
  realTimeButton: {
    flex: 1,
    backgroundColor: '#28a745', // Green for real-time
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 6,
    alignItems: 'center',
  },
  historicalButton: {
    flex: 1,
    backgroundColor: '#6f42c1', // Purple for historical
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
