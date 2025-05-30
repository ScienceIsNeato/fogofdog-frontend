import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

export const MapScreen = () => {
  return (
    <View style={styles.container}>
      <Text>Map Screen Placeholder</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#FFFFFF', // Use white background for visibility
  },
});
