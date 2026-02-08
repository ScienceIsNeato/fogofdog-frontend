import { Alert } from 'react-native';
import * as Haptics from 'expo-haptics';
import { logger } from '../../utils/logger';

type SettingsView = 'main' | 'history' | 'developer' | 'skin';

export const useSettingsHandlers = (
  onClose: () => void,
  setCurrentView: (view: SettingsView) => void
) => {
  const handleClose = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentView('main'); // Reset to main view when closing
    onClose();
  };

  const handleBackToMain = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCurrentView('main');
  };

  const handleUserProfile = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    Alert.alert('Coming Soon', 'User profile features are coming in a future update!');
  };

  const handleHistoryManagement = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    logger.info('Navigating to history management submenu', {
      component: 'UnifiedSettingsModal',
      action: 'handleHistoryManagement',
    });
    setCurrentView('history');
  };

  const handleDeveloperSettings = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    logger.info('Navigating to developer settings submenu', {
      component: 'UnifiedSettingsModal',
      action: 'handleDeveloperSettings',
    });
    setCurrentView('developer');
  };

  const handleMapSkins = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    logger.info('Navigating to map skins submenu', {
      component: 'UnifiedSettingsModal',
      action: 'handleMapSkins',
    });
    setCurrentView('skin');
  };

  return {
    handleClose,
    handleBackToMain,
    handleUserProfile,
    handleHistoryManagement,
    handleDeveloperSettings,
    handleMapSkins,
  };
};
