const { defaults } = require('jest-config');

module.exports = {
  preset: 'react-native',
  roots: ['<rootDir>/src'],
  testMatch: [
    '<rootDir>/src/**/__tests__/**/*.{js,jsx,ts,tsx}',
    '<rootDir>/src/**/*.(test|spec).{js,jsx,ts,tsx}'
  ],
  testEnvironment: 'node',
  setupFilesAfterEnv: [
    '<rootDir>/jest.setup.js',
  ],
  moduleFileExtensions: [...defaults.moduleFileExtensions, 'ts', 'tsx'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest',
  },
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|react-redux|@reduxjs/toolkit|@expo|expo|@shopify/react-native-skia|react-native-maps|react-native-gesture-handler|react-native-reanimated|react-native-screens|react-native-safe-area-context)/)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/**/__tests__/**',
    '!src/**/__mocks__/**',
    '!src/**/index.{js,ts}',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: [
    'text',
    'text-summary', 
    'lcov',
    'html'
  ],
  coverageThreshold: {
    global: {
      branches: 64,
      functions: 65,
      lines: 70,
      statements: 70
    }
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  testTimeout: 30000,
  maxWorkers: '50%', // Optimize for CI speed
  watchman: false, // Disable watchman entirely
};
