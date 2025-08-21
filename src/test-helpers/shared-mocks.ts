import { configureStore } from '@reduxjs/toolkit';
import userReducer from '../store/slices/userSlice';
import explorationReducer from '../store/slices/explorationSlice';
import statsReducer from '../store/slices/statsSlice';

// Shared mock navigation object
export const mockNavigation = {
  navigate: jest.fn(),
  goBack: jest.fn(),
  canGoBack: jest.fn(),
  dispatch: jest.fn(),
  isFocused: jest.fn(),
  addListener: jest.fn(),
  removeListener: jest.fn(),
  reset: jest.fn(),
  setParams: jest.fn(),
  setOptions: jest.fn(),
  getId: jest.fn(),
  getParent: jest.fn(),
  getState: jest.fn(),
  pop: jest.fn(),
  popToTop: jest.fn(),
  push: jest.fn(),
  replace: jest.fn(),
  preload: jest.fn(),
  navigateDeprecated: jest.fn(),
  setStateForNextRouteNamesChange: jest.fn(),
  replaceParams: jest.fn(),
  popTo: jest.fn(),
};

// Default exploration state
const defaultExplorationState = {
  path: [],
  currentLocation: null,
  zoomLevel: 10,
  isMapCenteredOnUser: false,
  isFollowModeActive: false,
  exploredAreas: [],
  backgroundLocationStatus: {
    isRunning: false,
    hasPermission: false,
    storedLocationCount: 0,
  },
  isTrackingPaused: false,
};

// Default stats state
export const defaultStatsState = {
  total: { distance: 0, area: 0, time: 0 },
  session: { distance: 0, area: 0, time: 0 },
  currentSession: {
    sessionId: 'test-session',
    startTime: Date.now(),
  },
  lastProcessedPoint: null,
  isInitialized: false,
  isLoading: false,
  lastError: null,
  lastSaveTime: null,
  formattedStats: {
    totalDistance: '0m',
    totalArea: '0m²',
    totalTime: '0m',
    sessionDistance: '0m',
    sessionArea: '0m²',
    sessionTime: '0m',
  },
};

// Shared mock store creators
export const createMockStore = (userState: any = null) => {
  return configureStore({
    reducer: {
      user: userReducer,
      exploration: explorationReducer,
      stats: statsReducer,
    },
    preloadedState: {
      user: {
        user: userState,
        isLoading: false,
        error: null,
      },
      exploration: defaultExplorationState,
      stats: defaultStatsState,
    },
  });
};

export const createMockStoreWithUser = (
  userData = {
    id: '123',
    email: 'test@example.com',
    displayName: 'Test User',
  }
) => {
  return configureStore({
    reducer: {
      user: userReducer,
      exploration: explorationReducer,
      stats: statsReducer,
    },
    preloadedState: {
      user: {
        user: userData,
        isLoading: false,
        error: null,
      },
      exploration: defaultExplorationState,
      stats: defaultStatsState,
    },
  });
};

// Common test user data
export const testUsers = {
  defaultUser: {
    id: '123',
    email: 'test@example.com',
    displayName: 'Test User',
  },
  johnDoe: {
    id: '456',
    email: 'user@domain.com',
    displayName: 'John Doe',
  },
  partialUser: {
    id: '789',
    email: 'partial@test.com',
    displayName: '',
  },
} as const;

// Mock route object
export const createMockRoute = (name: string) => ({
  key: name,
  name,
});
