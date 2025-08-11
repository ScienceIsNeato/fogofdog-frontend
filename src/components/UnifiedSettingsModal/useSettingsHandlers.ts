import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
// import { OnboardingService } from '../../services/OnboardingService';
import { logger } from '../../utils/logger';

type SettingsView = 'main' | 'history' | 'developer';

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
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    logger.info('Navigating to developer settings submenu', {
      component: 'UnifiedSettingsModal',
      action: 'handleDeveloperSettings',
    });
    setCurrentView('developer');
  };

  return {
    handleClose,
    handleBackToMain,
    handleUserProfile,
    handleHistoryManagement,
    handleDeveloperSettings,
  };
};
