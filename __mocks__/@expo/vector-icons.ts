import React from 'react';
import { Text } from 'react-native';

// Mock MaterialIcons component
export const MaterialIcons = ({ name, size, color, testID, ...props }: any) => {
  return React.createElement(
    Text,
    {
      testID: testID || `icon-${name}`,
      style: { fontSize: size, color },
      ...props,
    },
    name
  );
};

// Mock other icon sets if needed
export const AntDesign = MaterialIcons;
export const FontAwesome = MaterialIcons;
export const Ionicons = MaterialIcons;
export const Feather = MaterialIcons;
export const Entypo = MaterialIcons;

export default {
  MaterialIcons,
  AntDesign,
  FontAwesome,
  Ionicons,
  Feather,
  Entypo,
};
