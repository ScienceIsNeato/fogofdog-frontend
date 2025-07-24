import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle, Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface LocationButtonProps {
  onPress: () => void;
  isCentered: boolean;
  isFollowModeActive: boolean;
  style?: ViewStyle;
}

const LocationButton: React.FC<LocationButtonProps> = ({
  onPress,
  isCentered,
  isFollowModeActive,
  style,
}) => {
  const getContainerStyle = () => {
    const styles: ViewStyle[] = [baseStyles.container];

    // Show blue background if centered OR if follow mode is active
    if (isCentered || isFollowModeActive) {
      styles.push({ backgroundColor: '#007AFF' });
    } else {
      styles.push({ backgroundColor: 'rgba(0, 0, 0, 0.6)' });
    }

    if (style) {
      styles.push(style);
    }

    return styles;
  };

  const getAccessibilityState = () => {
    if (isCentered || isFollowModeActive) {
      return { selected: true };
    }
    return {};
  };

  return (
    <Pressable
      testID="location-button"
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="Center on current location"
      accessibilityHint="Double tap to center the map on your current location"
      accessibilityState={getAccessibilityState()}
      style={({ pressed }) => {
        const baseStyle = getContainerStyle();
        if (pressed) {
          return [...baseStyle, baseStyles.pressed];
        }
        return baseStyle;
      }}
    >
      <View testID="location-button-container">
        <MaterialIcons name="my-location" size={24} color="white" />
      </View>
    </Pressable>
  );
};

const baseStyles = StyleSheet.create({
  container: {
    width: 44,
    height: 44,
    borderRadius: 22,
    justifyContent: 'center',
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
      },
      android: {
        elevation: 5,
      },
    }),
  },
  pressed: {
    opacity: 0.8,
    transform: [{ scale: 0.95 }],
  },
});

export default LocationButton;
