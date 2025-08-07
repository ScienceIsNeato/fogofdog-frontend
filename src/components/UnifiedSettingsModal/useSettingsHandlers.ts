import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { OnboardingService } from '../../services/OnboardingService';
import { logger } from '../../utils/logger';

type SettingsView = 'main' | 'history';

export const useSettingsHandlers = (
  onClose: () => void,
  setCurrentView: (view: SettingsView) => void
) => {
  const handleClose = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentView('main'); // Reset to main view when closing
    onClose();
  };

  const handleBackToMain = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentView('main');
  };

  const handleUserProfile = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Coming Soon', 'User profile features are coming in a future update!');
  };

  const handleHistoryManagement = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    logger.info('Navigating to history management submenu', {
      component: 'UnifiedSettingsModal',
      action: 'handleHistoryManagement',
    });
    setCurrentView('history');
  };

  const handleDeveloperSettings = async () => {
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    Alert.alert(
      'Reset Onboarding',
      "This will reset the onboarding sequence. You'll see the tutorial again when you restart the app.",
      [
        {
          text: 'Cancel',
          style: 'cancel',
        },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await OnboardingService.resetOnboarding();
              logger.info('Onboarding reset successfully', {
                component: 'UnifiedSettingsModal',
                action: 'handleDeveloperSettings',
              });
              Alert.alert(
                'Success',
                'Onboarding has been reset. The tutorial will show when you restart the app.',
                [{ text: 'OK', style: 'default' }]
              );
            } catch (error) {
              logger.error('Failed to reset onboarding', {
                component: 'UnifiedSettingsModal',
                action: 'handleDeveloperSettings',
                error,
              });
              Alert.alert('Error', 'Failed to reset onboarding. Please try again.', [
                { text: 'OK', style: 'default' },
              ]);
            }
          },
        },
      ]
    );
  };

  return {
    handleClose,
    handleBackToMain,
    handleUserProfile,
    handleHistoryManagement,
    handleDeveloperSettings,
  };
};
