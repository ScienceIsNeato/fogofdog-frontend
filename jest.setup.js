import { expect } from '@jest/globals';

// Mock React Native Modules
jest.mock('react-native/Libraries/EventEmitter/NativeEventEmitter');

// Mock React Native Platform
jest.mock('react-native', () => {
  const RN = jest.requireActual('react-native');
  
  // Mock Platform
  RN.Platform.OS = 'ios';
  RN.Platform.select = jest.fn((config) => config.ios || config.default);
  
  // Mock Alert
  RN.Alert = {
    alert: jest.fn(),
  };
  
  // Mock Pressable if not available
  if (!RN.Pressable) {
    RN.Pressable = RN.TouchableOpacity;
  }
  
  // Add AppState mock
  RN.AppState = {
    addEventListener: jest.fn(() => ({ remove: jest.fn() })),
    currentState: 'active',
  };
  
  return RN;
});

// Mock react-native-reanimated
jest.mock('react-native-reanimated', () => {
  return {
    useSharedValue: jest.fn((value) => ({ value })),
    useDerivedValue: jest.fn((getter) => ({ value: getter() })),
    useAnimatedStyle: jest.fn(() => ({})),
    withTiming: jest.fn((value) => value),
    withSpring: jest.fn((value) => value),
    runOnUI: jest.fn((fn) => fn),
    runOnJS: jest.fn((fn) => fn),
    createAnimatedComponent: jest.fn((component) => component),
    interpolate: jest.fn(() => 0),
    Extrapolate: { CLAMP: 'clamp' },
  };
});

// Mock navigation
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }) => children,
  useNavigation: () => ({
    navigate: jest.fn(),
    goBack: jest.fn(),
  }),
  useFocusEffect: jest.fn(),
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }) => children,
    Screen: ({ children }) => children,
  }),
}));

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  SafeAreaProvider: ({ children }) => children,
  SafeAreaView: ({ children }) => children,
  useSafeAreaInsets: () => ({ 
    top: 44, 
    bottom: 34, 
    left: 0, 
    right: 0 
  }),
  useSafeAreaFrame: () => ({ 
    x: 0, 
    y: 0, 
    width: 375, 
    height: 812 
  }),
}));

// Mock @expo/vector-icons
jest.mock('@expo/vector-icons/MaterialIcons', () => 'MaterialIcons');

// Mock expo-task-manager
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
  TaskManager: {
    defineTask: jest.fn(),
    isTaskRegisteredAsync: jest.fn().mockResolvedValue(false),
  },
}));

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  __esModule: true,
  default: {
    getItem: jest.fn().mockResolvedValue(null),
    setItem: jest.fn().mockResolvedValue(undefined),
    removeItem: jest.fn().mockResolvedValue(undefined),
    clear: jest.fn().mockResolvedValue(undefined),
    getAllKeys: jest.fn().mockResolvedValue([]),
    multiGet: jest.fn().mockResolvedValue([]),
    multiSet: jest.fn().mockResolvedValue(undefined),
    multiRemove: jest.fn().mockResolvedValue(undefined),
  },
}));

// Configure test environment
global.__DEV__ = true;

// Set up fake timers by default
jest.useFakeTimers();
