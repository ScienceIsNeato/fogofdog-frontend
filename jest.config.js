module.exports = {
  preset: 'react-native',
  roots: ['<rootDir>/src'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.(test|spec).{js,jsx,ts,tsx}',
  ],
  testEnvironment: 'node',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js', '<rootDir>/jest.console-setup.js'],
  testPathIgnorePatterns: [
    '/node_modules/',
    '/android/',
    '/ios/',
    '<rootDir>/src/__tests__/test-helpers/',
  ],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-clone-referenced-element|@react-native-community|expo(nent)?|@expo(nent)?/.*|@expo-google-fonts/.*|react-navigation|@react-navigation/.*|@unimodules/.*|unimodules|sentry-expo|native-base|react-native-svg|@shopify/react-native-skia|react-native-reanimated|react-native-gesture-handler|react-native-screens|react-native-safe-area-context|react-native-vector-icons|@maplibre).*)',
  ],
  collectCoverageFrom: [
    'src/**/*.{js,jsx,ts,tsx}',
    '!src/**/*.d.ts',
    '!src/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/**/index.{js,ts}',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'text-summary', 'lcov', 'html'],
  coverageThreshold: {
    global: {
      functions: 78,
      lines: 78,
      statements: 78,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
    '^expo-location$': '<rootDir>/__mocks__/expo-location.ts',
    '^expo-modules-core$': '<rootDir>/__mocks__/expo-modules-core.ts',
    '^expo-task-manager$': '<rootDir>/__mocks__/expo-task-manager.ts',
    '^expo-constants$': '<rootDir>/__mocks__/expo-constants.ts',
    '^expo-asset$': '<rootDir>/__mocks__/expo-asset.ts',
    '^expo-font$': '<rootDir>/__mocks__/expo-font.ts',
    '^@expo/vector-icons$': '<rootDir>/__mocks__/@expo/vector-icons.ts',
    '^expo-haptics$': '<rootDir>/__mocks__/expo-haptics.ts',
    '^@shopify/react-native-skia$': '<rootDir>/__mocks__/@shopify/react-native-skia.ts',
    '^@maplibre/maplibre-react-native$': '<rootDir>/__mocks__/@maplibre/maplibre-react-native.tsx',
  },
  testTimeout: 30000,
  maxWorkers: process.env.CI ? 1 : '50%', // Single worker in CI to avoid resource issues
  watchman: false, // Disable watchman entirely
  forceExit: !!process.env.CI, // Force exit in CI to prevent hanging
  verbose: !!process.env.CI, // Verbose output in CI for debugging
  bail: !!process.env.CI, // Stop on first failure in CI to get clearer logs
};
