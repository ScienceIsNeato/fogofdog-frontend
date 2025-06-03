import React from 'react';
import { Text } from 'react-native';

const MaterialIcons = ({ name, size, color, ...props }) => (
  <Text {...props}>{name}</Text>
);

export default MaterialIcons; 