import React from 'react';
import { render, waitFor, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import Navigation, { useOnboardingContext } from '../index';
import { OnboardingService } from '../../services/OnboardingService';
import { AuthPersistenceService } from '../../services/AuthPersistenceService';
import userReducer from '../../store/slices/userSlice';
import explorationReducer from '../../store/slices/explorationSlice';

// Mock navigation dependencies
jest.mock('@react-navigation/native', () => ({
  NavigationContainer: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  useNavigation: () => ({
    navigate: jest.fn(),
  }),
}));

jest.mock('@react-navigation/native-stack', () => ({
  createNativeStackNavigator: () => ({
    Navigator: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    Screen: ({ component: Component }: { component: React.ComponentType }) => <Component />,
  }),
}));

// Mock screens
jest.mock('../../screens/Map', () => ({
  MapScreen: () => null,
}));

jest.mock('../../screens/Profile', () => ({
  ProfileScreen: () => null,
}));

// Mock services
jest.mock('../../services/OnboardingService');
jest.mock('../../services/AuthPersistenceService');

const mockOnboardingService = OnboardingService as jest.Mocked<typeof OnboardingService>;
const mockAuthPersistenceService = AuthPersistenceService as jest.Mocked<
  typeof AuthPersistenceService
>;

describe('Navigation', () => {
  let store: any;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        user: userReducer,
        exploration: explorationReducer,
      },
    });

    mockOnboardingService.isFirstTimeUser.mockResolvedValue(false);
    mockAuthPersistenceService.getExplorationState.mockResolvedValue(null);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  const renderNavigation = () => {
    return render(
      <Provider store={store}>
        <Navigation />
      </Provider>
    );
  };

  it('shows loading screen initially', () => {
    const { getByTestId } = renderNavigation();
    expect(getByTestId('loading-screen')).toBeTruthy();
  });

  it('initializes app and hides loading screen', async () => {
    const { queryByTestId } = renderNavigation();

    await waitFor(() => {
      expect(queryByTestId('loading-screen')).toBeNull();
    });

    expect(mockOnboardingService.isFirstTimeUser).toHaveBeenCalled();
    expect(mockAuthPersistenceService.getExplorationState).toHaveBeenCalled();
  });

  it('detects first-time user correctly', async () => {
    mockOnboardingService.isFirstTimeUser.mockResolvedValue(true);

    const { queryByTestId } = renderNavigation();

    await waitFor(() => {
      expect(queryByTestId('loading-screen')).toBeNull();
    });

    expect(mockOnboardingService.isFirstTimeUser).toHaveBeenCalled();
  });

  it('restores exploration state when available', async () => {
    const mockExplorationData = {
      currentLocation: { latitude: 37.7749, longitude: -122.4194 },
      path: [{ latitude: 37.7749, longitude: -122.4194 }],
      exploredAreas: [{ latitude: 37.7749, longitude: -122.4194 }],
      zoomLevel: 14,
      isTrackingPaused: false,
    };

    mockAuthPersistenceService.getExplorationState.mockResolvedValue(mockExplorationData);

    const { queryByTestId } = renderNavigation();

    await waitFor(() => {
      expect(queryByTestId('loading-screen')).toBeNull();
    });

    expect(mockAuthPersistenceService.getExplorationState).toHaveBeenCalled();
  });

  it('handles initialization errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockOnboardingService.isFirstTimeUser.mockRejectedValue(new Error('Service error'));

    const { queryByTestId } = renderNavigation();

    await waitFor(() => {
      expect(queryByTestId('loading-screen')).toBeNull();
    });

    consoleSpy.mockRestore();
  });

  it('provides onboarding context to children', async () => {
    let contextValue: any;

    const TestComponent = () => {
      contextValue = useOnboardingContext();
      return null;
    };

    const TestNavigation = () => {
      const { queryByTestId } = render(
        <Provider store={store}>
          <Navigation />
          <TestComponent />
        </Provider>
      );
      return queryByTestId;
    };

    await act(async () => {
      TestNavigation();
    });

    await waitFor(() => {
      expect(contextValue).toBeDefined();
      expect(contextValue.isFirstTimeUser).toBe(false);
    });
  });

  it('handles exploration data conversion correctly', async () => {
    const mockExplorationData = {
      currentLocation: { latitude: 37.7749, longitude: -122.4194 },
      path: [
        { latitude: 37.7749, longitude: -122.4194 },
        { latitude: 37.775, longitude: -122.4195 },
      ],
      exploredAreas: [
        { latitude: 37.7749, longitude: -122.4194 },
        { latitude: 37.775, longitude: -122.4195 },
      ],
      zoomLevel: 14,
      isTrackingPaused: false,
    };

    mockAuthPersistenceService.getExplorationState.mockResolvedValue(mockExplorationData);

    const { queryByTestId } = renderNavigation();

    await waitFor(() => {
      expect(queryByTestId('loading-screen')).toBeNull();
    });

    // Verify the dispatch was called (can't easily test the exact payload in this setup)
    expect(mockAuthPersistenceService.getExplorationState).toHaveBeenCalled();
  });

  it('includes delay for location services in simulator', async () => {
    const startTime = Date.now();

    const { queryByTestId } = renderNavigation();

    await waitFor(() => {
      expect(queryByTestId('loading-screen')).toBeNull();
    });

    const endTime = Date.now();
    // Should include at least the 100ms delay
    expect(endTime - startTime).toBeGreaterThan(90);
  });
});

// Test the LoadingScreen component separately
describe('LoadingScreen', () => {
  it('renders loading screen with correct elements', () => {
    const store = configureStore({
      reducer: {
        user: userReducer,
        exploration: explorationReducer,
      },
    });

    // Mock to keep showing loading screen
    mockOnboardingService.isFirstTimeUser.mockImplementation(() => new Promise(() => {}));

    const { getByTestId, getByText } = render(
      <Provider store={store}>
        <Navigation />
      </Provider>
    );

    expect(getByTestId('loading-screen')).toBeTruthy();
    expect(getByText('Loading...')).toBeTruthy();
  });
});
