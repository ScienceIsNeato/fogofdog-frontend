import React, { useState, useEffect } from 'react';
import { Modal, View, StyleSheet, Alert } from 'react-native';

import { ClearType, DataStats } from '../types/dataClear';
import { SettingsMainView } from './UnifiedSettingsModal/SettingsMainView';
import { SettingsHistoryView } from './UnifiedSettingsModal/SettingsHistoryView';
import { SettingsDeveloperView } from './UnifiedSettingsModal/SettingsDeveloperView';
import { useSettingsHandlers } from './UnifiedSettingsModal/useSettingsHandlers';

type SettingsView = 'main' | 'history' | 'developer';

interface UnifiedSettingsModalProps {
  visible: boolean;
  onClose: () => void;
  dataStats: DataStats;
  onClearData: (type: ClearType) => Promise<void>;
  isClearing: boolean;
  onRefreshDataStats?: () => void; // Optional callback to refresh data stats after import
}

const UnifiedSettingsModal: React.FC<UnifiedSettingsModalProps> = ({
  visible,
  onClose,
  dataStats,
  onClearData,
  isClearing,
  onRefreshDataStats,
}) => {
  const [currentView, setCurrentView] = useState<SettingsView>('main');

  // Reset to main view when modal becomes visible
  useEffect(() => {
    if (visible) {
      setCurrentView('main');
    }
  }, [visible]);

  const {
    handleClose,
    handleBackToMain,
    handleUserProfile,
    handleHistoryManagement,
    handleDeveloperSettings,
  } = useSettingsHandlers(onClose, setCurrentView);

  if (!visible) return null;

  // Set up global alert function for the extracted component
  (global as any).showAlert = (title: string, message: string, buttons: any[]) => {
    Alert.alert(title, message, buttons);
  };

  const renderCurrentView = () => {
    if (currentView === 'main') {
      return (
        <SettingsMainView
          onClose={handleClose}
          onUserProfile={handleUserProfile}
          onHistoryManagement={handleHistoryManagement}
          onDeveloperSettings={handleDeveloperSettings}
          styles={styles}
        />
      );
    }

    if (currentView === 'history') {
      return (
        <SettingsHistoryView
          dataStats={dataStats}
          onClearData={onClearData}
          isClearing={isClearing}
          onBackToMain={handleBackToMain}
          styles={styles}
          onDataImported={onRefreshDataStats}
        />
      );
    }

    return (
      <SettingsDeveloperView onBack={handleBackToMain} onClose={handleClose} styles={styles} />
    );
  };

  return (
    <Modal transparent animationType="fade" visible={visible} onRequestClose={handleClose}>
      <View style={styles.overlay}>
        <View style={styles.dialog}>{renderCurrentView()}</View>
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
    position: 'relative',
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
    color: '#333',
    flex: 1,
  },
  closeButton: {
    position: 'absolute',
    right: 0,
    padding: 4,
  },
  backButton: {
    marginRight: 8,
    padding: 4,
  },
  content: {
    marginBottom: 20,
  },
  subtitle: {
    fontSize: 16,
    color: '#666',
    marginBottom: 16,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 16,
    paddingHorizontal: 12,
    borderRadius: 8,
    marginBottom: 8,
    backgroundColor: '#f8f9fa',
  },
  disabledMenuItem: {
    opacity: 0.6,
  },
  developerMenuItem: {
    backgroundColor: '#fff3e0',
  },
  menuItemContent: {
    flex: 1,
    marginLeft: 12,
  },
  menuItemText: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    flex: 1,
    marginLeft: 12,
  },
  disabledMenuItemText: {
    color: '#999',
  },
  developerMenuItemText: {
    color: '#FF9500',
  },
  comingSoonText: {
    fontSize: 12,
    color: '#999',
    fontStyle: 'italic',
  },
  statsContainer: {
    backgroundColor: '#f8f9fa',
    borderRadius: 8,
    padding: 12,
    marginBottom: 20,
  },
  statsTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: '#333',
    marginBottom: 8,
  },
  statsText: {
    fontSize: 14,
    color: '#666',
    marginBottom: 2,
  },
  menuItemDescription: {
    fontSize: 12,
    color: '#999',
    marginTop: 2,
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
  cancelButton: {
    backgroundColor: '#f8f9fa',
    borderWidth: 1,
    borderColor: '#dee2e6',
    borderRadius: 8,
    padding: 12,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 44,
  },
  cancelButtonText: {
    color: '#666',
    fontSize: 16,
    fontWeight: '500',
  },
  headerSpacer: {
    width: 32, // Same width as close button for centering
  },
  sectionHeader: {
    fontSize: 14,
    fontWeight: '600',
    color: '#666',
    marginBottom: 12,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
  settingItem: {
    marginBottom: 16,
  },
  settingContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  settingTextContainer: {
    flex: 1,
    marginRight: 16,
  },
  settingTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: '#333',
    marginBottom: 4,
  },
  settingDescription: {
    fontSize: 14,
    color: '#666',
    lineHeight: 20,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 12,
    marginTop: 20,
  },
  warningText: {
    fontSize: 12,
    color: '#E65100',
    marginLeft: 8,
    flex: 1,
    lineHeight: 16,
  },
});

export default UnifiedSettingsModal;
