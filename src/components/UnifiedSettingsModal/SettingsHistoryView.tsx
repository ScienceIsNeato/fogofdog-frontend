import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { DataStats, ClearOption } from '../../types/dataClear';

const DATA_CLEAR_OPTIONS: ClearOption[] = [
  {
    type: 'hour',
    label: 'Last Hour',
    description: 'Clear exploration data from the past hour',
  },
  {
    type: 'day',
    label: 'Last Day',
    description: 'Clear exploration data from the past 24 hours',
  },
  {
    type: 'all',
    label: 'All Time',
    description: 'Clear all exploration data permanently',
  },
];

interface SettingsHistoryViewProps {
  dataStats: DataStats;
  onClearData: (option: ClearOption['type']) => void;
  isClearing: boolean;
  onBackToMain: () => void;
  styles: any;
}

export const SettingsHistoryView: React.FC<SettingsHistoryViewProps> = ({
  dataStats,
  onClearData,
  isClearing,
  onBackToMain,
  styles,
}) => {
  const formatDate = (date: Date | null) =>
    date
      ? date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
      : 'No data';

  const handleClearPress = (type: ClearOption['type']) => {
    const option = DATA_CLEAR_OPTIONS.find((opt) => opt.type === type);
    if (!option) return;

    const confirmationAlert = {
      title: `Clear ${option.label}?`,
      message: `This will permanently delete ${option.label.toLowerCase()} of exploration data. This action cannot be undone.`,
      buttons: [
        { text: 'Cancel', style: 'cancel' as const },
        {
          text: 'Clear Data',
          style: 'destructive' as const,
          onPress: () => onClearData(type),
        },
      ],
    };

    // We can't import Alert here directly, so we'll pass the alert config up
    // This is a workaround for the component extraction
    (global as any).showAlert?.(
      confirmationAlert.title,
      confirmationAlert.message,
      confirmationAlert.buttons
    );
  };

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBackToMain} testID="back-button">
          <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Clear Exploration Data</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.content}>
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Current Data</Text>
          <Text style={styles.statsText}>Total points: {dataStats.totalPoints}</Text>
          <Text style={styles.statsText}>Recent points: {dataStats.recentPoints}</Text>
          <Text style={styles.statsText}>Oldest: {formatDate(dataStats.oldestDate)}</Text>
          <Text style={styles.statsText}>Newest: {formatDate(dataStats.newestDate)}</Text>
        </View>

        {DATA_CLEAR_OPTIONS.map((option) => (
          <TouchableOpacity
            key={option.type}
            style={[styles.menuItem, isClearing && styles.disabledMenuItem]}
            onPress={() => handleClearPress(option.type)}
            disabled={isClearing}
          >
            <MaterialIcons name="delete" size={20} color={isClearing ? '#999' : '#FF3B30'} />
            <View style={styles.menuItemContent}>
              <Text style={[styles.menuItemText, isClearing && styles.disabledMenuItemText]}>
                {option.label}
              </Text>
              <Text style={styles.menuItemDescription}>{option.description}</Text>
            </View>
            {isClearing && (
              <MaterialIcons
                name="hourglass-empty"
                size={20}
                color="#999"
                testID="loading-indicator"
              />
            )}
          </TouchableOpacity>
        ))}
      </View>
    </>
  );
};
