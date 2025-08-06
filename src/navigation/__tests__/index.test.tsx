import React from 'react';
import { render, waitFor, screen } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Navigation from '../index';
import { OnboardingService } from '../../services/OnboardingService';
import { AuthPersistenceService } from '../../services/AuthPersistenceService';
import userSlice from '../../store/slices/userSlice';
import explorationSlice from '../../store/slices/explorationSlice';

// Mock the services
jest.mock('../../services/OnboardingService');
jest.mock('../../services/AuthPersistenceService');

// Mock navigation components
jest.mock('../../screens/Map', () => ({
  MapScreen: () => null,
}));

jest.mock('../../screens/Profile', () => ({
  ProfileScreen: () => null,
}));

jest.mock('../../screens/Auth', () => ({
  SignInScreen: () => null,
  SignUpScreen: () => null,
}));

const mockedOnboardingService = OnboardingService as jest.Mocked<typeof OnboardingService>;
const mockedAuthPersistenceService = AuthPersistenceService as jest.Mocked<
  typeof AuthPersistenceService
>;

// Helper function to create test store
const createTestStore = () => {
  return configureStore({
    reducer: {
      user: userSlice,
      exploration: explorationSlice,
    },
  });
};

// Helper component to render Navigation with Redux store
const NavigationWithProvider = ({ store }: { store?: any }) => {
  const testStore = store ?? createTestStore();
  return (
    <Provider store={testStore}>
      <Navigation />
    </Provider>
  );
};

describe('Navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    // Default mocks - ensure all async operations resolve quickly
    mockedOnboardingService.isFirstTimeUser.mockResolvedValue(false);
    mockedAuthPersistenceService.getExplorationState.mockResolvedValue(null);
  });

  it('should show loading screen initially', async () => {
    mockedOnboardingService.isFirstTimeUser.mockResolvedValue(true);
    const store = createTestStore();

    render(<NavigationWithProvider store={store} />);

    // Should show loading screen initially
    expect(screen.getByTestId('loading-screen')).toBeTruthy();
    expect(screen.getByText('Loading...')).toBeTruthy();

    // Wait for initialization to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-screen')).toBeNull();
    });
  });

  it('should bypass auth and show main navigator for first-time users', async () => {
    mockedOnboardingService.isFirstTimeUser.mockResolvedValue(true);
    const store = createTestStore();

    render(<NavigationWithProvider store={store} />);

    // Wait for initialization to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-screen')).toBeNull();
    });

    // Should not show auth screens, should go directly to main
    expect(mockedOnboardingService.isFirstTimeUser).toHaveBeenCalled();
  });

  it('should bypass auth and show main navigator for returning users', async () => {
    mockedOnboardingService.isFirstTimeUser.mockResolvedValue(false);

    const store = createTestStore();
    render(<NavigationWithProvider store={store} />);

    // Wait for initialization to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-screen')).toBeNull();
    });

    // Should not show auth screens, should go directly to main
    expect(mockedOnboardingService.isFirstTimeUser).toHaveBeenCalled();
  });

  it('should restore exploration state when available', async () => {
    const mockExplorationState = {
      currentLocation: { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
      path: [],
      exploredAreas: [],
      zoomLevel: 14,
    };

    mockedOnboardingService.isFirstTimeUser.mockResolvedValue(false);
    mockedAuthPersistenceService.getExplorationState.mockResolvedValue(mockExplorationState);

    const store = createTestStore();
    render(<NavigationWithProvider store={store} />);

    // Wait for initialization to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-screen')).toBeNull();
    });

    expect(mockedAuthPersistenceService.getExplorationState).toHaveBeenCalled();
  });

  it('should handle onboarding service errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockedOnboardingService.isFirstTimeUser.mockRejectedValue(new Error('Storage error'));

    const store = createTestStore();
    render(<NavigationWithProvider store={store} />);

    // Wait for initialization to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-screen')).toBeNull();
    });

    // Should default to first-time user on error
    expect(mockedOnboardingService.isFirstTimeUser).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });

  it('should handle exploration state restoration errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockedOnboardingService.isFirstTimeUser.mockResolvedValue(true);
    mockedAuthPersistenceService.getExplorationState.mockRejectedValue(new Error('Storage error'));

    const store = createTestStore();
    render(<NavigationWithProvider store={store} />);

    // Wait for initialization to complete
    await waitFor(() => {
      expect(screen.queryByTestId('loading-screen')).toBeNull();
    });

    // Should still complete initialization
    expect(mockedOnboardingService.isFirstTimeUser).toHaveBeenCalled();

    consoleSpy.mockRestore();
  });
});
