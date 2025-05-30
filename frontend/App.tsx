import React from 'react';
import { Text, View } from 'react-native';

/**
 * Root component of the FogOfDog app
 * Provides:
 * - Redux store integration
 * - Navigation setup (handles both web and native)
 */
export default function App() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      <Text>Hello, World!</Text>
    </View>
  );
}
