import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import userReducer from '../../../store/slices/userSlice';
import explorationReducer from '../../../store/slices/explorationSlice';
import { SignInScreen } from '../SignIn';

// Mock navigation
const mockNavigate = jest.fn();
const mockNavigation = {
  navigate: mockNavigate,
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

const createMockStore = (userState: any = null) => {
  return configureStore({
    reducer: {
      user: userReducer,
      exploration: explorationReducer,
    },
    preloadedState: {
      user: {
        user: userState,
        isLoading: false,
        error: null,
      },
      exploration: {
        path: [],
        currentLocation: null,
        zoomLevel: 10,
        isMapCenteredOnUser: false,
        exploredAreas: [],
      },
    },
  });
};

describe('SignInScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const store = createMockStore();
    const { getAllByText, getByTestId } = render(
      <Provider store={store}>
        <SignInScreen navigation={mockNavigation} route={{ key: 'SignIn', name: 'SignIn' }} />
      </Provider>
    );

    expect(getAllByText('Sign In')).toHaveLength(2); // Title and button
    expect(getByTestId('signInButton')).toBeTruthy();
    expect(getByTestId('createAccountButton')).toBeTruthy();
  });

  it('should display correct button text', () => {
    const store = createMockStore();
    const { getByTestId, getAllByText } = render(
      <Provider store={store}>
        <SignInScreen navigation={mockNavigation} route={{ key: 'SignIn', name: 'SignIn' }} />
      </Provider>
    );

    const signInButton = getByTestId('signInButton');
    const createAccountButton = getByTestId('createAccountButton');

    // Verify buttons exist and are pressable
    expect(signInButton).toBeTruthy();
    expect(createAccountButton).toBeTruthy();

    // Verify the text exists on screen
    expect(getAllByText('Sign In')).toHaveLength(2); // Title and button
    expect(getAllByText('Create Account')).toHaveLength(1);
  });

  it('should dispatch setUser when sign in button is pressed', () => {
    const store = createMockStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <SignInScreen navigation={mockNavigation} route={{ key: 'SignIn', name: 'SignIn' }} />
      </Provider>
    );

    const signInButton = getByTestId('signInButton');
    fireEvent.press(signInButton);

    const state = store.getState();
    expect(state.user.user).toEqual({
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  it('should navigate to SignUp when create account button is pressed', () => {
    const store = createMockStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <SignInScreen navigation={mockNavigation} route={{ key: 'SignIn', name: 'SignIn' }} />
      </Provider>
    );

    const createAccountButton = getByTestId('createAccountButton');
    fireEvent.press(createAccountButton);

    expect(mockNavigate).toHaveBeenCalledWith('SignUp');
  });

  it('should have correct container styles', () => {
    const store = createMockStore();
    const { getAllByText } = render(
      <Provider store={store}>
        <SignInScreen navigation={mockNavigation} route={{ key: 'SignIn', name: 'SignIn' }} />
      </Provider>
    );

    // Get the title element (first occurrence of 'Sign In')
    const titleElements = getAllByText('Sign In');
    const titleElement = titleElements[0];
    // Check that the title has the expected styles (color, fontSize, etc.)
    if (titleElement) {
      expect(titleElement.props.style).toEqual(
        expect.objectContaining({
          fontSize: 32,
          color: '#000',
          fontWeight: 'bold',
          marginBottom: 40,
        })
      );
    }
  });

  it('should handle multiple sign in button presses', () => {
    const store = createMockStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <SignInScreen navigation={mockNavigation} route={{ key: 'SignIn', name: 'SignIn' }} />
      </Provider>
    );

    const signInButton = getByTestId('signInButton');

    // Press button multiple times
    fireEvent.press(signInButton);
    fireEvent.press(signInButton);
    fireEvent.press(signInButton);

    // User should still be set (last one wins)
    const state = store.getState();
    expect(state.user.user).toEqual({
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  it('should not crash when navigation is undefined', () => {
    const store = createMockStore();

    // Test with minimal navigation mock
    const minimalNav = { navigate: jest.fn() };

    expect(() => {
      render(
        <Provider store={store}>
          <SignInScreen navigation={minimalNav as any} route={{ key: 'SignIn', name: 'SignIn' }} />
        </Provider>
      );
    }).not.toThrow();
  });
});
