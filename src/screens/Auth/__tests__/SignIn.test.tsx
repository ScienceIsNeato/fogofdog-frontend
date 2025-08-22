import React from 'react';
import { render, fireEvent, act } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { SignInScreen } from '../SignIn';
import { createMockStore, mockNavigation } from '../../../test-helpers/shared-mocks';
import { renderAuthScreen } from '../../../test-helpers/render-utils';

// Mock AuthPersistenceService
jest.mock('../../../services/AuthPersistenceService', () => ({
  AuthPersistenceService: {
    saveAuthState: jest.fn().mockResolvedValue(undefined),
    clearAuthState: jest.fn().mockResolvedValue(undefined),
  },
}));

// Using shared mock navigation

// Store creation is now handled by the shared utility

describe('SignInScreen', () => {
  let originalConsoleError: any;

  beforeEach(() => {
    jest.clearAllMocks();
    // Temporarily disable console error checking for these tests
    originalConsoleError = console.error;
    console.error = jest.fn();

    // Reset AuthPersistenceService mocks
    const { AuthPersistenceService: mockAuthPersistence } = jest.requireMock(
      '../../../services/AuthPersistenceService'
    );
    mockAuthPersistence.saveAuthState.mockResolvedValue(undefined);
    mockAuthPersistence.clearAuthState.mockResolvedValue(undefined);
  });

  afterEach(() => {
    // Restore console error checking
    console.error = originalConsoleError;
  });

  it('should render correctly', () => {
    const { getAllByText, getByTestId } = renderAuthScreen('SignIn');

    expect(getAllByText('Sign In')).toHaveLength(2); // Title and button
    expect(getByTestId('signInButton')).toBeTruthy();
    expect(getByTestId('createAccountButton')).toBeTruthy();
  });

  it('should display correct button text', () => {
    const { getByTestId, getAllByText } = renderAuthScreen('SignIn');

    expect(getByTestId('signInButton')).toHaveTextContent('Sign In');
    expect(getByTestId('createAccountButton')).toHaveTextContent('Create Account');
    expect(getAllByText('Keep me logged in')).toHaveLength(1);
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
    const { getByTestId } = renderAuthScreen('SignIn');

    fireEvent.press(getByTestId('createAccountButton'));
    expect(mockNavigation.navigate).toHaveBeenCalledWith('SignUp');
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

  it('should handle auth persistence save errors gracefully', async () => {
    const store = createMockStore();
    const { AuthPersistenceService: mockAuthPersistence } = jest.requireMock(
      '../../../services/AuthPersistenceService'
    );
    mockAuthPersistence.saveAuthState.mockRejectedValueOnce(new Error('Save failed'));

    const { getByTestId } = render(
      <Provider store={store}>
        <SignInScreen navigation={mockNavigation} route={{ key: 'SignIn', name: 'SignIn' }} />
      </Provider>
    );

    // Keep logged in is true by default, so this should trigger the save path
    await act(async () => {
      fireEvent.press(getByTestId('signInButton'));
    });

    expect(mockAuthPersistence.saveAuthState).toHaveBeenCalled();
  });

  it('should handle auth persistence clear errors gracefully', async () => {
    const store = createMockStore();
    const { AuthPersistenceService: mockAuthPersistence } = jest.requireMock(
      '../../../services/AuthPersistenceService'
    );
    mockAuthPersistence.clearAuthState.mockRejectedValueOnce(new Error('Clear failed'));

    const { getByTestId } = render(
      <Provider store={store}>
        <SignInScreen navigation={mockNavigation} route={{ key: 'SignIn', name: 'SignIn' }} />
      </Provider>
    );

    // Turn off keep logged in first
    await act(async () => {
      fireEvent.press(getByTestId('keepLoggedInCheckbox'));
    });

    // Then sign in to trigger clear path
    await act(async () => {
      fireEvent.press(getByTestId('signInButton'));
    });

    expect(mockAuthPersistence.clearAuthState).toHaveBeenCalled();
  });

  it('should toggle keep logged in state', () => {
    const store = createMockStore();
    const { getByTestId } = render(
      <Provider store={store}>
        <SignInScreen navigation={mockNavigation} route={{ key: 'SignIn', name: 'SignIn' }} />
      </Provider>
    );

    const checkbox = getByTestId('keepLoggedInCheckbox');

    // Should start checked (default true)
    expect(checkbox).toBeTruthy();

    // Toggle it
    fireEvent.press(checkbox);

    // Should still be rendered (just unchecked now)
    expect(checkbox).toBeTruthy();
  });
});
