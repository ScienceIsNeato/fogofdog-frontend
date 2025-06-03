import { View, Text } from 'react-native';

export const createAnimatedComponent = (Component: any) => Component;

export const useAnimatedStyle = () => ({});
export const useSharedValue = (value: any) => ({ value });
export const withSpring = (toValue: any) => toValue;
export const withTiming = (toValue: any) => toValue;
export const withRepeat = () => {};
export const withSequence = () => {};
export const withDelay = () => {};
export const runOnJS = (fn: Function) => fn;
export const runOnUI = (fn: Function) => fn;

// Mock Animated components
export const Animated = {
  View: View,
  Text: Text,
  ScrollView: View,
  Image: View,
  createAnimatedComponent,
};

// Mock hooks and functions
export const useAnimatedGestureHandler = () => ({});
export const useAnimatedScrollHandler = () => ({});
export const useAnimatedRef = () => ({
  current: null,
});
export const useDerivedValue = (getter: any) => ({ value: getter() });
export const interpolate = () => 0;
export const Extrapolate = { CLAMP: 'clamp' };

// Default export
export default {
  createAnimatedComponent,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
  withRepeat,
  withSequence,
  withDelay,
  runOnJS,
  runOnUI,
  Animated,
  useAnimatedGestureHandler,
  useAnimatedScrollHandler,
  useAnimatedRef,
  useDerivedValue,
  interpolate,
  Extrapolate,
};
