import React from 'react';
import { View, Text, TouchableOpacity, Linking } from 'react-native';
import { logger } from '../../../utils/logger';
import { styles } from '../styles';

interface AllowOnceWarningOverlayProps {
  visible: boolean;
  onDismiss: () => void;
}

/**
 * Warning overlay displayed when user selects "Allow Once" permission
 * Explains limitations and provides option to change settings
 */
export const AllowOnceWarningOverlay: React.FC<AllowOnceWarningOverlayProps> = ({
  visible,
  onDismiss,
}) => {
  if (!visible) {
    return null;
  }

  const handleContinueAnyway = () => {
    logger.info('User dismissed Allow Once warning');
    // Reset verification to hide the warning
    // This allows the user to continue with limited functionality
    onDismiss();
  };

  const handleOpenSettings = () => {
    logger.info('User chose to open settings from Allow Once warning');
    Linking.openSettings();
  };

  return (
    <View style={styles.warningContainer}>
      <View style={styles.warningBox}>
        <Text style={styles.warningTitle}>⚠️ Limited Functionality</Text>
        <Text style={styles.warningText}>
          You selected &ldquo;Allow Once&rdquo; which only provides a single location. FogOfDog needs continuous
          location access to track your exploration and clear the fog.
        </Text>
        <Text style={styles.warningText}>
          To use the app properly, please go to Settings → Privacy & Security → Location Services →
          FogOfDog and select &ldquo;While Using App&rdquo; or &ldquo;Always&rdquo;.
        </Text>
        <View style={styles.warningButtons}>
          <TouchableOpacity style={styles.warningButtonSecondary} onPress={handleContinueAnyway}>
            <Text style={styles.warningButtonSecondaryText}>Continue Anyway</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.warningButtonPrimary} onPress={handleOpenSettings}>
            <Text style={styles.warningButtonPrimaryText}>Open Settings</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
};
