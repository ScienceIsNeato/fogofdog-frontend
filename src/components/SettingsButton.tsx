import React from 'react';
import { TouchableOpacity, StyleSheet, ViewStyle, StyleProp } from 'react-native';
import { MaterialIcons } from '@expo/vector-icons';

interface SettingsButtonProps {
  onPress: () => void;
  style?: StyleProp<ViewStyle>;
  disabled?: boolean;
}

export const SettingsButton: React.FC<SettingsButtonProps> = ({
  onPress,
  style,
  disabled = false,
}) => {
  return (
    <TouchableOpacity
      style={[styles.button, disabled && styles.disabled, style]}
      onPress={onPress}
      disabled={disabled}
      accessibilityLabel="Open settings menu"
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      testID="settings-button"
    >
      <MaterialIcons
        name="settings"
        size={24}
        color={disabled ? '#999999' : '#FFFFFF'}
        testID="settings-icon"
      />
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 4,
    elevation: 5,
  },
  disabled: {
    opacity: 0.5,
  },
});
