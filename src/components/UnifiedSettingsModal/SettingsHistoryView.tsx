/* eslint-disable max-lines-per-function */
import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import { DataStats, ClearOption } from '../../types/dataClear';
import { DataImportExportService } from '../../services/DataImportExportService';
import { ALERT_TEXT } from '../../constants/alertText';

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
  onDataImported?: (() => void) | undefined; // Optional callback when data is imported
}

// Hook for handling export/import operations
const useDataImportExport = (onDataImported?: () => void) => {
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);

  const handleExportData = async () => {
    if (isExporting || isImporting) return;

    setIsExporting(true);
    try {
      const result = await DataImportExportService.exportData();

      if (result.success) {
        Alert.alert(ALERT_TEXT.EXPORT.SUCCESS_TITLE, ALERT_TEXT.EXPORT.SUCCESS_MESSAGE, [
          { text: ALERT_TEXT.BUTTONS.OK },
        ]);
      } else {
        Alert.alert(
          ALERT_TEXT.EXPORT.FAILED_TITLE,
          result.error ?? 'Failed to export exploration data',
          [{ text: ALERT_TEXT.BUTTONS.OK }]
        );
      }
    } catch (_error) {
      Alert.alert(ALERT_TEXT.EXPORT.ERROR_TITLE, ALERT_TEXT.EXPORT.ERROR_MESSAGE, [
        { text: ALERT_TEXT.BUTTONS.OK },
      ]);
    } finally {
      setIsExporting(false);
    }
  };

  const performImport = async (replaceExisting: boolean) => {
    setIsImporting(true);
    try {
      const result = await DataImportExportService.importData(replaceExisting);

      if (result.success) {
        const mode = replaceExisting ? 'replaced' : 'merged with';
        Alert.alert(
          'Import Successful',
          `Successfully ${mode} ${result.pointsImported ?? 0} data points.`,
          [
            {
              text: 'OK',
              onPress: () => {
                // Trigger refresh of data stats if callback provided
                onDataImported?.();
              },
            },
          ]
        );
      } else {
        Alert.alert('Import Failed', result.error ?? 'Failed to import exploration data', [
          { text: 'OK' },
        ]);
      }
    } catch (_error) {
      Alert.alert('Import Error', 'An unexpected error occurred while importing your data.', [
        { text: 'OK' },
      ]);
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportData = async () => {
    if (isExporting || isImporting) return;

    // Show import mode selection
    Alert.alert('Import Exploration Data', 'Choose how to import the data:', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Merge with Current Data',
        onPress: () => performImport(false),
      },
      {
        text: 'Replace All Data',
        style: 'destructive',
        onPress: () => {
          Alert.alert(
            'Confirm Replace',
            'This will completely replace your current exploration data. Your existing data will be lost. Are you sure?',
            [
              { text: 'Cancel', style: 'cancel' },
              {
                text: 'Replace All',
                style: 'destructive',
                onPress: () => performImport(true),
              },
            ]
          );
        },
      },
    ]);
  };

  return {
    isExporting,
    isImporting,
    handleExportData,
    handleImportData,
  };
};

export const SettingsHistoryView: React.FC<SettingsHistoryViewProps> = ({
  dataStats,
  onClearData,
  isClearing,
  onBackToMain,
  styles,
  onDataImported,
}) => {
  const { isExporting, isImporting, handleExportData, handleImportData } =
    useDataImportExport(onDataImported);
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
        <Text style={styles.title}>Exploration Data Management</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <View style={styles.statsContainer}>
          <Text style={styles.statsTitle}>Current Data</Text>
          <Text style={styles.statsText}>Total points: {dataStats.totalPoints}</Text>
          <Text style={styles.statsText}>Recent points: {dataStats.recentPoints}</Text>
          <Text style={styles.statsText}>Oldest: {formatDate(dataStats.oldestDate)}</Text>
          <Text style={styles.statsText}>Newest: {formatDate(dataStats.newestDate)}</Text>
        </View>

        {/* Data Import/Export Section */}
        <View style={[styles.statsContainer, { marginBottom: 20 }]}>
          <Text style={styles.statsTitle}>Data Backup & Restore</Text>

          <TouchableOpacity
            style={[styles.menuItem, (isExporting || isImporting) && styles.disabledMenuItem]}
            onPress={handleExportData}
            disabled={isExporting || isImporting}
          >
            <MaterialIcons
              name="backup"
              size={20}
              color={isExporting || isImporting ? '#999' : '#007AFF'}
            />
            <View style={styles.menuItemContent}>
              <Text
                style={[
                  styles.menuItemText,
                  (isExporting || isImporting) && styles.disabledMenuItemText,
                ]}
              >
                Export Data
              </Text>
              <Text style={styles.menuItemDescription}>
                Save your exploration data to a file for backup
              </Text>
            </View>
            {isExporting && (
              <ActivityIndicator size="small" color="#007AFF" testID="export-loading" />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.menuItem, (isExporting || isImporting) && styles.disabledMenuItem]}
            onPress={handleImportData}
            disabled={isExporting || isImporting}
          >
            <MaterialIcons
              name="restore"
              size={20}
              color={isExporting || isImporting ? '#999' : '#007AFF'}
            />
            <View style={styles.menuItemContent}>
              <Text
                style={[
                  styles.menuItemText,
                  (isExporting || isImporting) && styles.disabledMenuItemText,
                ]}
              >
                Import Data
              </Text>
              <Text style={styles.menuItemDescription}>
                Restore exploration data from a backup file
              </Text>
            </View>
            {isImporting && (
              <ActivityIndicator size="small" color="#007AFF" testID="import-loading" />
            )}
          </TouchableOpacity>
        </View>

        {/* Data Clearing Section */}
        <Text style={styles.sectionHeader}>Clear Data</Text>

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
