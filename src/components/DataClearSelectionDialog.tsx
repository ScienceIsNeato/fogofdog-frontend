import React from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { DataClearSelectionDialogProps, ClearOption, DataStats } from '../types/dataClear';

const CLEAR_OPTIONS: ClearOption[] = [
  {
    type: 'hour',
    label: 'Last Hour',
    description: 'Clear data from the last hour',
    timeRange: 60 * 60 * 1000, // 1 hour in milliseconds
  },
  {
    type: 'day',
    label: 'Last Day',
    description: 'Clear data from the last 24 hours',
    timeRange: 24 * 60 * 60 * 1000, // 24 hours in milliseconds
  },
  {
    type: 'all',
    label: 'All Time',
    description: 'Clear all exploration data permanently',
  },
];

// Helper functions for alert messages
const getConfirmationMessage = (option: ClearOption, totalPoints: number): string => {
  switch (option.type) {
    case 'hour':
      return `This will remove exploration data from the last hour. Your fog map will revert to its state from 1 hour ago.`;
    case 'day':
      return `This will remove exploration data from the last day (24 hours). Your fog map will revert to its state from yesterday.`;
    case 'all':
      return `⚠️ This will permanently delete ALL your exploration data (${totalPoints.toLocaleString()} points) and reset your fog map completely. This action cannot be undone.`;
    default:
      return 'This will clear the selected data.';
  }
};

const getAlertTitle = (option: ClearOption): string => {
  switch (option.type) {
    case 'hour':
      return 'Clear Last Hour';
    case 'day':
      return 'Clear Last Day';
    case 'all':
      return 'Clear All Data';
    default:
      return 'Clear Data';
  }
};

// Data statistics component
const DataStatsComponent: React.FC<{
  dataStats: DataStats;
  formatDate: (date: Date | null) => string;
}> = ({ dataStats, formatDate }) => (
  <View style={styles.statsContainer}>
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>Total Points:</Text>
      <Text style={styles.statValue}>{dataStats.totalPoints.toLocaleString()}</Text>
    </View>
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>Recent (24h):</Text>
      <Text style={styles.statValue}>{dataStats.recentPoints.toLocaleString()}</Text>
    </View>
    <View style={styles.statRow}>
      <Text style={styles.statLabel}>Oldest Data:</Text>
      <Text style={styles.statValue}>{formatDate(dataStats.oldestDate)}</Text>
    </View>
  </View>
);

// Clear options component
const ClearOptionsComponent: React.FC<{
  onOptionPress: (option: ClearOption) => void;
  isClearing: boolean;
}> = ({ onOptionPress, isClearing }) => (
  <View style={styles.optionsContainer}>
    {CLEAR_OPTIONS.map((option) => (
      <TouchableOpacity
        key={option.type}
        style={[styles.optionButton, isClearing && styles.disabledButton]}
        onPress={() => onOptionPress(option)}
        disabled={isClearing}
      >
        {isClearing ? (
          <ActivityIndicator size="small" color="white" testID="loading-indicator" />
        ) : (
          <Text style={[styles.optionButtonText, option.type === 'all' && styles.destructiveText]}>
            {option.label}
          </Text>
        )}
      </TouchableOpacity>
    ))}
  </View>
);

const DataClearSelectionDialog: React.FC<DataClearSelectionDialogProps> = ({
  visible,
  dataStats,
  onClear,
  onCancel,
  isClearing,
}) => {
  const formatDate = (date: Date | null): string => {
    if (!date) return 'No data';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
    });
  };

  const handleOptionPress = async (option: ClearOption) => {
    if (isClearing) return;

    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);

    Alert.alert(getAlertTitle(option), getConfirmationMessage(option, dataStats.totalPoints), [
      {
        text: 'Cancel',
        style: 'cancel',
      },
      {
        text: 'Clear Data',
        style: 'destructive',
        onPress: () => {
          onClear(option.type);
        },
      },
    ]);
  };

  const handleCancel = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onCancel();
  };

  if (!visible) return null;

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleCancel}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>
          <View style={styles.header}>
            <MaterialIcons name="clear-all" size={24} color="#666" />
            <Text style={styles.title}>Clear Exploration Data</Text>
          </View>

          <View style={styles.content}>
            <Text style={styles.subtitle}>Choose time range to clear:</Text>

            {/* Data Statistics */}
            <DataStatsComponent dataStats={dataStats} formatDate={formatDate} />

            {/* Clear Options */}
            <ClearOptionsComponent onOptionPress={handleOptionPress} isClearing={isClearing} />
          </View>

          <View style={styles.footer}>
            <TouchableOpacity
              style={[styles.button, styles.cancelButton]}
              onPress={handleCancel}
              disabled={isClearing}
            >
              <Text style={styles.cancelButtonText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  dialog: {
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 20,
    minWidth: 300,
    maxWidth: 400,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 4.65,
    elevation: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
  },
  content: {
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  statsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  statRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  statLabel: {
    fontSize: 14,
    color: '#666',
  },
  statValue: {
    fontSize: 14,
    fontWeight: '500',
    color: '#333',
  },
  optionsContainer: {
    gap: 12,
  },
  optionButton: {
    backgroundColor: '#007AFF',
    borderRadius: 8,
    padding: 16,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  disabledButton: {
    opacity: 0.5,
  },
  optionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
  },
  destructiveText: {
    color: '#FF3B30',
  },
  footer: {
    marginTop: 16,
  },
  button: {
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default DataClearSelectionDialog;
