import React from 'react';
import { Pressable, StyleSheet, View, ViewStyle, Platform } from 'react-native';
import MaterialIcons from '@expo/vector-icons/MaterialIcons';

interface LocationButtonProps {
  onPress: () => void;
  isLocationAvailable: boolean;
  isCentered: boolean;
  style?: ViewStyle;
}

const LocationButton: React.FC<LocationButtonProps> = ({
  onPress,
  isLocationAvailable,
  isCentered,
  style,
}) => {
  const handlePress = () => {
    if (isLocationAvailable) {
      onPress();
    }
  };

  const getContainerStyle = () => {
    const styles: ViewStyle[] = [baseStyles.container];

    if (!isLocationAvailable) {
      styles.push({ opacity: 0.5 });
    }

    if (isCentered && isLocationAvailable) {
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
    if (!isLocationAvailable) {
      return { disabled: true };
    }
    if (isCentered) {
      return { selected: true };
    }
    return {};
  };

  return (
    <Pressable
      testID="location-button"
      onPress={handlePress}
      accessibilityRole="button"
      accessibilityLabel="Center on current location"
      accessibilityHint="Double tap to center the map on your current location"
      accessibilityState={getAccessibilityState()}
      style={({ pressed }) => {
        const baseStyle = getContainerStyle();
        if (pressed && isLocationAvailable) {
          return [...baseStyle, baseStyles.pressed];
        }
        return baseStyle;
      }}
    >
      <View testID="location-button-container" style={getContainerStyle()}>
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
