import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface SettingsMainViewProps {
  onClose: () => void;
  onUserProfile: () => void;
  onHistoryManagement: () => void;
  onDeveloperSettings: () => void;
  styles: any;
}

export const SettingsMainView: React.FC<SettingsMainViewProps> = ({
  onClose,
  onUserProfile,
  onHistoryManagement,
  onDeveloperSettings,
  styles,
}) => (
  <>
    <View style={styles.header}>
      <MaterialIcons name="settings" size={24} color="#666" />
      <Text style={styles.title}>Settings</Text>
      <TouchableOpacity style={styles.closeButton} onPress={onClose} testID="close-button">
        <MaterialIcons name="close" size={24} color="#666" />
      </TouchableOpacity>
    </View>

    <View style={styles.content}>
      <TouchableOpacity style={[styles.menuItem, styles.disabledMenuItem]} onPress={onUserProfile}>
        <MaterialIcons name="person" size={20} color="#999" />
        <View style={styles.menuItemContent}>
          <Text style={[styles.menuItemText, styles.disabledMenuItemText]}>User Profile</Text>
          <Text style={styles.comingSoonText}>Coming Soon</Text>
        </View>
      </TouchableOpacity>

      <TouchableOpacity style={styles.menuItem} onPress={onHistoryManagement}>
        <MaterialIcons name="history" size={20} color="#007AFF" />
        <Text style={styles.menuItemText}>Exploration History Management</Text>
        <MaterialIcons name="chevron-right" size={20} color="#ccc" />
      </TouchableOpacity>

      <TouchableOpacity style={styles.menuItem} onPress={onDeveloperSettings}>
        <MaterialIcons name="developer-mode" size={20} color="#007AFF" />
        <Text style={styles.menuItemText}>Developer Settings</Text>
        <MaterialIcons name="chevron-right" size={20} color="#ccc" />
      </TouchableOpacity>
    </View>
  </>
);
