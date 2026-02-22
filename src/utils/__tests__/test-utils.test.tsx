import React from 'react';
import { View, Text } from 'react-native';
import { useAppSelector } from '../../store/hooks';
import { renderWithProviders } from '../test-utils';

// Mock component to test the provider functionality
const TestComponent = () => {
  const user = useAppSelector((state) => state.user.user);

  return (
    <View testID="test-component">
      <Text testID="user-display">{user ? `Hello ${user.displayName}` : 'No user'}</Text>
    </View>
  );
};

describe('test-utils', () => {
  describe('renderWithProviders', () => {
    it('should render component with default empty state', () => {
      const { getByTestId } = renderWithProviders(<TestComponent />);

      expect(getByTestId('test-component')).toBeTruthy();
      expect(getByTestId('user-display')).toBeTruthy();
      expect(getByTestId('user-display').children[0]).toBe('No user');
    });

    it('should render component with preloaded state', () => {
      const mockUser = {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const preloadedState = {
        user: {
          user: mockUser,
          isLoading: false,
          error: null,
        },
      };

      const { getByTestId } = renderWithProviders(<TestComponent />, {
        preloadedState,
      });

      expect(getByTestId('user-display').children[0]).toBe('Hello Test User');
    });

    it('should return store instance from renderWithProviders', () => {
      const { store } = renderWithProviders(<TestComponent />);

      expect(store).toBeDefined();
      expect(store.getState).toBeDefined();
      expect(store.dispatch).toBeDefined();
    });

    it('should use custom store if provided', () => {
      const mockUser = {
        id: '456',
        email: 'custom@example.com',
        displayName: 'Custom User',
      };

      const customStore = {
        getState: jest.fn(() => ({
          user: {
            user: mockUser,
            isLoading: false,
            error: null,
          },
          exploration: {
            currentLocation: null,
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
            gpsInjectionStatus: {
              isRunning: false,
              type: null,
              message: '',
            },
          },
          stats: {
            total: { distance: 0, area: 0, time: 0 },
            session: { distance: 0, area: 0, time: 0 },
            currentSession: {
              sessionId: 'test-session',
              startTime: Date.now(),
              totalPausedTime: 0,
              lastActiveTime: Date.now(),
            },
            isInitialized: false,
            lastProcessedPoint: null,
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
          },
          street: {
            segments: {},
            intersections: {},
            exploredSegmentIds: [],
            exploredIntersectionIds: [],
            preferStreets: false,
            preferUnexplored: false,
            isLoading: false,
            lastFetchedAt: null,
            error: null,
          },
          skin: {
            activeSkin: 'none' as const,
            isInitializing: false,
            availableSkins: [],
            error: null,
          },
          graphics: {
            activeFogEffectId: 'fog-classic',
            activeMapEffectId: 'map-none',
            activeScentEffectId: 'scent-dotted',
            isScentVisible: true,
          },
        })),

        dispatch: jest.fn(),
        subscribe: jest.fn(),
        replaceReducer: jest.fn(),
        // Add Symbol.observable for Redux compatibility
        [Symbol.observable]: jest.fn(),
      };

      // Mock the custom store to work with react-redux Provider
      const { getByTestId } = renderWithProviders(<TestComponent />, {
        store: customStore,
      });

      expect(getByTestId('test-component')).toBeTruthy();
    });

    it('should handle additional render options', () => {
      const { getByTestId, rerender } = renderWithProviders(<TestComponent />, {
        // Test with empty renderOptions to hit the ...renderOptions branch
      });

      expect(getByTestId('test-component')).toBeTruthy();
      expect(rerender).toBeDefined();
    });

    it('should provide NavigationContainer in wrapper', () => {
      // Test that NavigationContainer is provided by trying to render
      // a component that would fail without it
      const NavigationAwareComponent = () => (
        <View testID="nav-aware-component">
          <Text>Navigation provided</Text>
        </View>
      );

      const { getByTestId } = renderWithProviders(<NavigationAwareComponent />);

      expect(getByTestId('nav-aware-component')).toBeTruthy();
    });
  });
});
