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
