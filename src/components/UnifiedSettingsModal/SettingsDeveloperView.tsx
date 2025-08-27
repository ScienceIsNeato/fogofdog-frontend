import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, Alert } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  DeveloperSettingsService,
  DeveloperSettings,
} from '../../services/DeveloperSettingsService';
import { logger } from '../../utils/logger';
import { SimplePerformancePanel } from '../SimplePerformancePanel';

interface SettingsDeveloperViewProps {
  onBack: () => void;
  onClose?: () => void;
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

export const SettingsDeveloperView: React.FC<SettingsDeveloperViewProps> = ({
  onBack,
  onClose,
  styles,
}) => {
  const [settings, setSettings] = useState<DeveloperSettings>({
    onboardingEnabled: false,
  });

  const isLoading = useLoadSettings(setSettings);
  const handleOnboardingToggle = useOnboardingToggle(setSettings);

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

        {/* Performance Testing Panel */}
        <SimplePerformancePanel onCloseModal={onClose} />
      </View>
    </>
  );
};
