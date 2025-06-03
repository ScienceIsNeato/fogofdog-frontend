import { expect } from '@jest/globals';

// Mock React Native
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  RN.Platform.OS = 'ios';
  RN.Platform.select = jest.fn((config) => config.ios || config.default);
  return RN;
});

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => require('../src/__mocks__/react-native-reanimated'));

// Mock navigation
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }) => children,
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }) => children,
    Screen: ({ children }) => children,
  }),
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');

// Mock timers
jest.useFakeTimers();
