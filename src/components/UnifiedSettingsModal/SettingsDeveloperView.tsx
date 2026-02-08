import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, Switch, Alert, ActivityIndicator } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  DeveloperSettingsService,
  DeveloperSettings,
} from '../../services/DeveloperSettingsService';
import { logger } from '../../utils/logger';
import { SimplePerformancePanel } from '../SimplePerformancePanel';
import { useAppDispatch, useAppSelector } from '../../store/hooks';
import {
  setPreferStreets,
  setPreferUnexplored,
  loadStreetData,
} from '../../store/slices/streetSlice';
import { getSampleStreetData } from '../../services/StreetDataService';
import { fetchStreetGraph } from '../../services/OverpassClient';

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

// Hook to manage street-navigation toggle state
const useStreetNavigationSettings = () => {
  const dispatch = useAppDispatch();
  const preferStreets = useAppSelector((s) => s.street.preferStreets);
  const preferUnexplored = useAppSelector((s) => s.street.preferUnexplored);
  const segmentCount = useAppSelector((s) => Object.keys(s.street.segments).length);
  const exploredCount = useAppSelector((s) => s.street.exploredSegmentIds.length);
  const currentLocation = useAppSelector((s) => s.exploration.currentLocation);
  const [isLoadingRealStreets, setIsLoadingRealStreets] = useState(false);

  const handlePreferStreets = (enabled: boolean) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(setPreferStreets(enabled));
  };

  const handlePreferUnexplored = (enabled: boolean) => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    dispatch(setPreferUnexplored(enabled));
  };

  const handleLoadSampleStreets = () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    dispatch(loadStreetData(getSampleStreetData()));
    Alert.alert('Sample Streets', '3×3 street grid loaded for testing.');
  };

  const handleLoadRealStreets = async () => {
    void Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    const centre = currentLocation ?? { latitude: 44.0462, longitude: -123.0236 };
    const radiusMeters = 500;

    setIsLoadingRealStreets(true);
    try {
      const result = await fetchStreetGraph(centre, radiusMeters);
      if (result.isOfflineFallback) {
        Alert.alert('Offline', 'Could not reach Overpass API. Using cached data if available.');
      }
      dispatch(loadStreetData({ segments: result.segments, intersections: result.intersections }));
      Alert.alert(
        'Real Streets Loaded',
        `Loaded ${result.segments.length} segments from Overpass API.`
      );
    } catch (err) {
      logger.error('Failed to load real streets', err);
      Alert.alert('Error', 'Failed to fetch streets from Overpass API.');
    } finally {
      setIsLoadingRealStreets(false);
    }
  };

  return {
    preferStreets,
    preferUnexplored,
    segmentCount,
    exploredCount,
    isLoadingRealStreets,
    handlePreferStreets,
    handlePreferUnexplored,
    handleLoadSampleStreets,
    handleLoadRealStreets,
  };
};

type StreetNavSettings = ReturnType<typeof useStreetNavigationSettings>;

// Extracted section component to stay under max-lines-per-function
const StreetNavigationSection: React.FC<{ nav: StreetNavSettings; styles: any }> = ({
  nav,
  styles,
}) => (
  <>
    <Text style={styles.sectionHeader}>Street Navigation</Text>

    <View style={styles.settingItem}>
      <View style={styles.settingContent}>
        <View style={styles.settingTextContainer}>
          <Text style={styles.settingTitle}>Prefer Streets</Text>
          <Text style={styles.settingDescription}>
            Generate test paths along loaded street data
          </Text>
        </View>
        <Switch
          value={nav.preferStreets}
          onValueChange={nav.handlePreferStreets}
          testID="prefer-streets-toggle"
        />
      </View>
    </View>

    <View style={styles.settingItem}>
      <View style={styles.settingContent}>
        <View style={styles.settingTextContainer}>
          <Text style={styles.settingTitle}>Prefer Unexplored</Text>
          <Text style={styles.settingDescription}>
            Prioritise unexplored streets when generating paths
          </Text>
        </View>
        <Switch
          value={nav.preferUnexplored}
          onValueChange={nav.handlePreferUnexplored}
          disabled={!nav.preferStreets}
          testID="prefer-unexplored-toggle"
        />
      </View>
    </View>

    <TouchableOpacity
      style={styles.settingItem}
      onPress={nav.handleLoadSampleStreets}
      testID="load-sample-streets"
    >
      <View style={styles.settingContent}>
        <View style={styles.settingTextContainer}>
          <Text style={styles.settingTitle}>Load Sample Streets</Text>
          <Text style={styles.settingDescription}>Load a 3×3 grid of streets for testing</Text>
        </View>
        <MaterialIcons name="chevron-right" size={24} color="#8E8E93" />
      </View>
    </TouchableOpacity>

    <TouchableOpacity
      style={styles.settingItem}
      onPress={nav.handleLoadRealStreets}
      disabled={nav.isLoadingRealStreets}
      testID="load-real-streets"
    >
      <View style={styles.settingContent}>
        <View style={styles.settingTextContainer}>
          <Text style={styles.settingTitle}>Load Real Streets (Overpass)</Text>
          <Text style={styles.settingDescription}>
            Fetch streets from OpenStreetMap within 500m
          </Text>
        </View>
        {nav.isLoadingRealStreets ? (
          <ActivityIndicator size="small" color="#007AFF" />
        ) : (
          <MaterialIcons name="cloud-download" size={24} color="#8E8E93" />
        )}
      </View>
    </TouchableOpacity>

    {nav.segmentCount > 0 && (
      <View style={styles.settingItem} testID="street-info-loaded">
        <Text style={styles.settingDescription}>
          {nav.segmentCount} segments loaded · {nav.exploredCount} explored
        </Text>
      </View>
    )}
  </>
);

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
  const streetNav = useStreetNavigationSettings();

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

        {/* Street Navigation */}
        <StreetNavigationSection nav={streetNav} styles={styles} />
      </View>
    </>
  );
};
