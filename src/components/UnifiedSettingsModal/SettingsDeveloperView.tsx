import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  DeveloperSettingsService,
  DeveloperSettings,
} from '../../services/DeveloperSettingsService';
import { DataClearingService } from '../../services/DataClearingService';
import { logger } from '../../utils/logger';

interface SettingsDeveloperViewProps {
  onBack: () => void;
  styles: any;
}

// Handler for onboarding toggle
const useOnboardingToggle = (
  setSettings: React.Dispatch<React.SetStateAction<DeveloperSettings>>
) => {
  return async (enabled: boolean) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      await DeveloperSettingsService.toggleOnboarding(enabled);
      setSettings((prev) => ({ ...prev, onboardingEnabled: enabled }));

      Alert.alert(
        'Onboarding Updated',
        enabled
          ? 'Onboarding will show on next app restart.'
          : 'Onboarding has been marked as completed.',
        [{ text: 'OK', style: 'default' }]
      );
    } catch (error) {
      logger.error('Failed to toggle onboarding', error, {
        component: 'SettingsDeveloperView',
        action: 'handleOnboardingToggle',
      });
      Alert.alert('Error', 'Failed to update onboarding setting. Please try again.');
    }
  };
};

// Handler for fresh install toggle
const useFreshInstallToggle = (
  setSettings: React.Dispatch<React.SetStateAction<DeveloperSettings>>
) => {
  return async (enabled: boolean) => {
    try {
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      if (enabled) {
        Alert.alert(
          'Fresh Install Mode',
          'This will clear all app data including GPS tracking history, settings, and onboarding state. The app will behave as if freshly installed.\n\nThis action cannot be undone.',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Clear Data',
              style: 'destructive',
              onPress: () => {
                const clearData = async () => {
                  try {
                    await DataClearingService.clearAllData();
                    setSettings({ onboardingEnabled: false, freshInstallMode: false });

                    Alert.alert(
                      'Fresh Install Mode Enabled',
                      'App data has been cleared. Reload the app to experience the fresh install flow including GPS permissions.',
                      [{ text: 'OK', style: 'default' }]
                    );
                  } catch (_error) {
                    Alert.alert('Error', 'Failed to enable fresh install mode. Please try again.');
                  }
                };
                clearData();
              },
            },
          ]
        );
      } else {
        await DeveloperSettingsService.setFreshInstallMode(false);
        setSettings((prev) => ({ ...prev, freshInstallMode: false }));

        Alert.alert('Fresh Install Mode Disabled', 'Fresh install mode has been disabled.', [
          { text: 'OK', style: 'default' },
        ]);
      }
    } catch (error) {
      logger.error('Failed to toggle fresh install mode', error, {
        component: 'SettingsDeveloperView',
        action: 'handleFreshInstallToggle',
      });
      Alert.alert('Error', 'Failed to update fresh install setting. Please try again.');
    }
  };
};

// Hook to load developer settings
const useLoadSettings = (setSettings: React.Dispatch<React.SetStateAction<DeveloperSettings>>) => {
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadSettings = async () => {
      try {
        const currentSettings = await DeveloperSettingsService.getDeveloperSettings();
        setSettings(currentSettings);
      } catch (error) {
        logger.error('Failed to load developer settings', error, {
          component: 'SettingsDeveloperView',
          action: 'loadSettings',
        });
      } finally {
        setIsLoading(false);
      }
    };

    loadSettings();
  }, [setSettings]);

  return isLoading;
};

export const SettingsDeveloperView: React.FC<SettingsDeveloperViewProps> = ({ onBack, styles }) => {
  const [settings, setSettings] = useState<DeveloperSettings>({
    onboardingEnabled: false,
    freshInstallMode: false,
  });

  const isLoading = useLoadSettings(setSettings);
  const handleOnboardingToggle = useOnboardingToggle(setSettings);
  const handleFreshInstallToggle = useFreshInstallToggle(setSettings);

  return (
    <>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backButton} onPress={onBack} testID="back-button">
          <MaterialIcons name="arrow-back" size={24} color="#007AFF" />
        </TouchableOpacity>
        <Text style={styles.title}>Developer Settings</Text>
        <View style={styles.headerSpacer} />
      </View>

      <View style={styles.content}>
        <Text style={styles.sectionHeader}>Testing & Debugging</Text>

        {/* Onboarding Toggle */}
        <View style={styles.settingItem}>
          <View style={styles.settingContent}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Show Onboarding</Text>
              <Text style={styles.settingDescription}>
                Enable to show the tutorial overlay on app restart
              </Text>
            </View>
            <Switch
              value={settings.onboardingEnabled}
              onValueChange={handleOnboardingToggle}
              disabled={isLoading}
              testID="onboarding-toggle"
            />
          </View>
        </View>

        {/* Fresh Install Mode Toggle */}
        <View style={styles.settingItem}>
          <View style={styles.settingContent}>
            <View style={styles.settingTextContainer}>
              <Text style={styles.settingTitle}>Fresh Install Mode</Text>
              <Text style={styles.settingDescription}>
                Simulate fresh app installation with GPS permission flow
              </Text>
            </View>
            <Switch
              value={settings.freshInstallMode}
              onValueChange={handleFreshInstallToggle}
              disabled={isLoading}
              testID="fresh-install-toggle"
            />
          </View>
        </View>

        <View style={styles.warningContainer}>
          <MaterialIcons name="warning" size={20} color="#FF9500" />
          <Text style={styles.warningText}>
            These settings are for development and testing purposes only. Fresh install mode will
            clear all app data.
          </Text>
        </View>
      </View>
    </>
  );
};
