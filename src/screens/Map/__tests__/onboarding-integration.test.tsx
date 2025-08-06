import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { configureStore } from '@reduxjs/toolkit';
import { MapScreen } from '../index';
import { OnboardingService } from '../../../services/OnboardingService';
import userSlice from '../../../store/slices/userSlice';
import explorationSlice from '../../../store/slices/explorationSlice';
import { MainStackParamList } from '../../../types/navigation';

// Mock the services and dependencies
jest.mock('../../../services/OnboardingService');
jest.mock('../../../services/BackgroundLocationService');
jest.mock('../../../services/AuthPersistenceService');
jest.mock('../../../services/GPSInjectionService');
jest.mock('../../../services/DataClearingService');

// Mock location services
jest.mock('expo-location', () => ({
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue({ status: 'granted' }),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: {
      latitude: 37.7749,
      longitude: -122.4194,
      accuracy: 10,
    },
  }),
}));

// Mock react-native-maps
jest.mock('react-native-maps', () => {
  const { View } = require('react-native');
  const MockMapView = (props: any) => <View testID="mock-map-view" {...props} />;
  MockMapView.Marker = (props: any) => <View testID="mock-marker" {...props} />;
  return {
    __esModule: true,
    default: MockMapView,
    Marker: MockMapView.Marker,
  };
});

// Mock OptimizedFogOverlay
jest.mock('../../../components/OptimizedFogOverlay', () => {
  const { View } = require('react-native');
  return (props: any) => <View testID="mock-fog-overlay" {...props} />;
});

const mockedOnboardingService = OnboardingService as jest.Mocked<typeof OnboardingService>;

const Stack = createNativeStackNavigator<MainStackParamList>();

// Helper to create test store
const createTestStore = () => {
  return configureStore({
    reducer: {
      user: userSlice,
      exploration: explorationSlice,
    },
    preloadedState: {
      exploration: {
        currentLocation: { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
        zoomLevel: 14,
        path: [],
        exploredAreas: [],
        isMapCenteredOnUser: false,
        isFollowModeActive: false,
        isTrackingPaused: false,
        backgroundLocationStatus: {
          isRunning: false,
          hasPermission: false,
          storedLocationCount: 0,
        },
      },
    },
  });
};

// Helper component to render MapScreen with navigation
const MapScreenWithNavigation: React.FC<{ isFirstTimeUser?: boolean }> = ({ 
  isFirstTimeUser = false 
}) => {
  const store = createTestStore();
  
  return (
    <Provider store={store}>
      <NavigationContainer>
        <Stack.Navigator screenOptions={{ headerShown: false }}>
          <Stack.Screen 
            name="Map" 
            component={MapScreen}
            initialParams={{ isFirstTimeUser }}
          />
        </Stack.Navigator>
      </NavigationContainer>
    </Provider>
  );
};

describe('MapScreen Onboarding Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedOnboardingService.markOnboardingCompleted.mockResolvedValue(undefined);
  });

  it('should show onboarding overlay for first-time users', async () => {
    render(<MapScreenWithNavigation isFirstTimeUser={true} />);

    // Should show onboarding overlay
    expect(screen.getByTestId('onboarding-overlay')).toBeTruthy();
    expect(screen.getByText('Welcome to FogOfDog!')).toBeTruthy();
  });

  it('should not show onboarding overlay for returning users', async () => {
    render(<MapScreenWithNavigation isFirstTimeUser={false} />);

    // Should not show onboarding overlay
    expect(screen.queryByTestId('onboarding-overlay')).toBeNull();
  });

  it('should hide onboarding overlay when completed', async () => {
    render(<MapScreenWithNavigation isFirstTimeUser={true} />);

    // Onboarding should be visible initially
    expect(screen.getByTestId('onboarding-overlay')).toBeTruthy();

    // Navigate to last step and complete
    for (let i = 0; i < 5; i++) {
      fireEvent.press(screen.getByText('Continue'));
    }
    fireEvent.press(screen.getByText('Get Started!'));

    // Wait for onboarding to be marked complete and overlay to hide
    await waitFor(() => {
      expect(mockedOnboardingService.markOnboardingCompleted).toHaveBeenCalled();
      expect(screen.queryByTestId('onboarding-overlay')).toBeNull();
    });
  });

  it('should hide onboarding overlay when skipped', async () => {
    render(<MapScreenWithNavigation isFirstTimeUser={true} />);

    // Onboarding should be visible initially
    expect(screen.getByTestId('onboarding-overlay')).toBeTruthy();

    // Skip onboarding
    fireEvent.press(screen.getByText('Skip Tutorial'));

    // Wait for onboarding to be marked complete and overlay to hide
    await waitFor(() => {
      expect(mockedOnboardingService.markOnboardingCompleted).toHaveBeenCalled();
      expect(screen.queryByTestId('onboarding-overlay')).toBeNull();
    });
  });

  it('should show map screen behind onboarding overlay', async () => {
    render(<MapScreenWithNavigation isFirstTimeUser={true} />);

    // Should show both map screen and onboarding overlay
    expect(screen.getByTestId('map-screen')).toBeTruthy();
    expect(screen.getByTestId('onboarding-overlay')).toBeTruthy();
  });

  it('should handle onboarding service errors gracefully', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    mockedOnboardingService.markOnboardingCompleted.mockRejectedValue(new Error('Storage error'));

    render(<MapScreenWithNavigation isFirstTimeUser={true} />);

    // Skip onboarding
    fireEvent.press(screen.getByText('Skip Tutorial'));

    // Should still hide overlay even if service fails
    await waitFor(() => {
      expect(screen.queryByTestId('onboarding-overlay')).toBeNull();
    });

    consoleSpy.mockRestore();
  });
}); 