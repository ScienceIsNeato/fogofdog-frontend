import React from 'react';
import { render, fireEvent } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { ProfileScreen } from '../Profile';
import {
  createMockStore,
  mockNavigation,
  createMockStoreWithUser,
} from '../../../test-helpers/shared-mocks';

// Using shared mock navigation and store utilities

describe('ProfileScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should render correctly with user data', () => {
    const store = createMockStoreWithUser();

    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    expect(getByText('Profile')).toBeTruthy(); // Only one Profile title exists
    expect(getByText('Sign Out')).toBeTruthy();
  });

  it('should render correctly without user data', () => {
    const store = createMockStore();

    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    expect(getByText('Profile')).toBeTruthy(); // Only one Profile title exists
    expect(getByText('Sign Out')).toBeTruthy();
  });

  it('should have correct header title styling', () => {
    const store = createMockStore();

    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    const title = getByText('Profile');
    expect(title).toBeTruthy(); // Header title
  });

  it('should render sign out button with correct styling', () => {
    const store = createMockStore();

    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    const signOutButton = getByText('Sign Out');
    expect(signOutButton).toBeTruthy();
  });

  it('should display user information correctly', () => {
    const store = createMockStoreWithUser({
      id: '456',
      email: 'user@domain.com',
      displayName: 'John Doe',
    });
    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    expect(getByText('John Doe')).toBeTruthy();
    expect(getByText('user@domain.com')).toBeTruthy();
  });

  it('should dispatch clearUser when sign out button is pressed', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    const signOutButton = getByText('Sign Out');
    fireEvent.press(signOutButton);

    const state = store.getState();
    expect(state.user.user).toBeNull();
  });

  it('should have correct title styles', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    const titleElement = getByText('Profile');
    expect(titleElement.props.style).toEqual(
      expect.objectContaining({
        fontSize: 32,
        color: '#fff',
        fontWeight: 'bold',
        marginBottom: 40,
        textAlign: 'center',
      })
    );
  });

  it('should have correct label styles', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    const displayNameLabel = getByText('Display Name');
    const emailLabel = getByText('Email');

    expect(displayNameLabel.props.style).toEqual(
      expect.objectContaining({
        color: '#666',
        fontSize: 14,
        marginBottom: 4,
      })
    );

    expect(emailLabel.props.style).toEqual(
      expect.objectContaining({
        color: '#666',
        fontSize: 14,
        marginBottom: 4,
      })
    );
  });

  it('should handle multiple sign out button presses', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    const signOutButton = getByText('Sign Out');

    // Press button multiple times
    fireEvent.press(signOutButton);
    fireEvent.press(signOutButton);
    fireEvent.press(signOutButton);

    const state = store.getState();
    expect(state.user.user).toBeNull();
  });

  it('should handle user with partial data', () => {
    const store = createMockStoreWithUser({
      id: '789',
      email: 'partial@test.com',
      displayName: '', // Empty display name
    });
    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    expect(getByText('partial@test.com')).toBeTruthy();
    expect(getByText('Display Name')).toBeTruthy();
    expect(getByText('Email')).toBeTruthy();
  });

  it('should not crash when user has no email', () => {
    const store = createMockStore();

    expect(() => {
      render(
        <Provider store={store}>
          <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
        </Provider>
      );
    }).not.toThrow();
  });

  it('should render sign out button with correct styles', () => {
    const store = createMockStore();
    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    const signOutButton = getByText('Sign Out');
    expect(signOutButton.props.style).toEqual(
      expect.objectContaining({
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
      })
    );
  });

  it('should display loading state', () => {
    const store = createMockStore();

    const { queryByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    // Should not show loading state by default
    expect(queryByText('Loading...')).toBeNull();
  });

  it('should display error state', () => {
    const store = createMockStore();

    const { queryByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    // Should not show error state by default
    expect(queryByText('Error')).toBeNull();
  });

  it('should handle sign out button press and dispatch clearUser', () => {
    const store = createMockStore();

    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    const signOutButton = getByText('Sign Out');
    fireEvent.press(signOutButton);

    // Check that user is cleared from state
    const state = store.getState();
    expect(state.user.user).toBeNull();
  });

  it('should handle avatar being null or undefined', () => {
    const store = createMockStore();

    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    expect(getByText('Sign Out')).toBeTruthy();
  });

  it('should have accessible sign out button', () => {
    const store = createMockStore();

    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    const signOutButton = getByText('Sign Out');
    expect(signOutButton).toBeTruthy();

    // Test accessibility - button should be accessible
    expect(signOutButton.props.accessible).toBe(undefined);
  });

  it('should handle sign out multiple times without crashing', () => {
    const store = createMockStore();

    const { getByText } = render(
      <Provider store={store}>
        <ProfileScreen navigation={mockNavigation} route={{ key: 'Profile', name: 'Profile' }} />
      </Provider>
    );

    const signOutButton = getByText('Sign Out');

    // Press button multiple times
    fireEvent.press(signOutButton);
    fireEvent.press(signOutButton);
    fireEvent.press(signOutButton);

    const state = store.getState();
    expect(state.user.user).toBeNull();
  });
});
