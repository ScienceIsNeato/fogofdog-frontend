import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
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



  return (
    <TouchableOpacity
      style={styles.warningContainer}
      testID="allow-once-warning-overlay"
      accessibilityLabel="Location permission warning dialog"
      onPress={onDismiss}
      activeOpacity={1}
    >
      <TouchableOpacity style={styles.warningBox} activeOpacity={1}>
        <Text style={styles.warningTitle}>Location Permission Warning</Text>
        <Text style={styles.warningText}>
          You granted &ldquo;Allow Once&rdquo; permission, which means location tracking will stop
          when you close the app.
        </Text>
        <Text style={styles.warningText}>
          For continuous tracking, please go to Settings and select &ldquo;While Using App&rdquo; or
          &ldquo;Always&rdquo;.
        </Text>
        <View style={styles.warningButtons}>
          <TouchableOpacity
            style={styles.warningButtonPrimary}
            onPress={handleContinueAnyway}
            accessibilityRole="button"
            accessibilityLabel="Dismiss warning"
          >
            <Text style={styles.warningButtonPrimaryText}>Understood</Text>
          </TouchableOpacity>
        </View>
      </TouchableOpacity>
    </TouchableOpacity>
  );
};
