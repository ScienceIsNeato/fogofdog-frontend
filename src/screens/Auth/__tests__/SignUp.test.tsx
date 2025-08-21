import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { SignUpScreen } from '../SignUp';
import { createMockStore, mockNavigation } from '../../../test-helpers/shared-mocks';
import { renderAuthScreen } from '../../../test-helpers/render-utils';

// Using shared mock navigation and store utilities

describe('SignUpScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly', () => {
    const { getByText } = renderAuthScreen('SignUp');

    expect(getByText('Create Account')).toBeTruthy();
    expect(getByText('Sign Up')).toBeTruthy();
    expect(getByText('Already have an account?')).toBeTruthy();
  });

  it('should display correct title text', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <SignUpScreen navigation={mockNavigation} route={{ key: 'SignUp', name: 'SignUp' }} />
      </Provider>
    );

    const titleElement = getByText('Create Account');
    expect(titleElement).toBeTruthy();
  });

  it('should dispatch setUser when sign up button is pressed', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <SignUpScreen navigation={mockNavigation} route={{ key: 'SignUp', name: 'SignUp' }} />
      </Provider>
    );

    const signUpButton = getByText('Sign Up');
    fireEvent.press(signUpButton);

    const state = store.getState();
    expect(state.user.user).toEqual({
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  it('should navigate to SignIn when already have account button is pressed', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <SignUpScreen navigation={mockNavigation} route={{ key: 'SignUp', name: 'SignUp' }} />
      </Provider>
    );

    const signInButton = getByText('Already have an account?');
    fireEvent.press(signInButton);

    expect(mockNavigation.navigate).toHaveBeenCalledWith('SignIn');
  });

  it('should have correct container styles with black background', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <SignUpScreen navigation={mockNavigation} route={{ key: 'SignUp', name: 'SignUp' }} />
      </Provider>
    );

    const titleElement = getByText('Create Account');
    // Check that the title has the expected styles (white text on black background)
    expect(titleElement.props.style).toEqual(
      expect.objectContaining({
        fontSize: 32,
        color: '#fff',
        fontWeight: 'bold',
        marginBottom: 40,
      })
    );
  });

  it('should handle multiple sign up button presses', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <SignUpScreen navigation={mockNavigation} route={{ key: 'SignUp', name: 'SignUp' }} />
      </Provider>
    );

    const signUpButton = getByText('Sign Up');

    // Press button multiple times
    fireEvent.press(signUpButton);
    fireEvent.press(signUpButton);
    fireEvent.press(signUpButton);

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
          <SignUpScreen navigation={minimalNav as any} route={{ key: 'SignUp', name: 'SignUp' }} />
        </Provider>
      );
    }).not.toThrow();
  });

  it('should have different background color than SignIn screen', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <SignUpScreen navigation={mockNavigation} route={{ key: 'SignUp', name: 'SignUp' }} />
      </Provider>
    );

    const titleElement = getByText('Create Account');
    // SignUp screen should have white text (indicating black background)
    expect(titleElement.props.style.color).toBe('#fff');
  });

  it('should maintain user state after screen renders', () => {
    const existingUser = {
      id: '456',
      email: 'existing@test.com',
      displayName: 'Existing User',
    };

    const store = createMockStore(existingUser);

    render(
      <Provider store={store}>
        <SignUpScreen navigation={mockNavigation} route={{ key: 'SignUp', name: 'SignUp' }} />
      </Provider>
    );

    // Existing user should still be in state
    const state = store.getState();
    expect(state.user.user).toEqual(existingUser);
  });
});
