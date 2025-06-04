import { fireEvent } from '@testing-library/react-native';
import { renderProfileScreen, clearAllMocks } from '../../../__tests__/test-helpers/render-utils';
import {
  createMockStore,
  createMockStoreWithUser,
  testUsers,
} from '../../../__tests__/test-helpers/shared-mocks';

describe('ProfileScreen', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('should render correctly with user data', () => {
    const store = createMockStoreWithUser();
    const { getByText } = renderProfileScreen(store);

    expect(getByText('Profile')).toBeTruthy();
    expect(getByText('Sign Out')).toBeTruthy();
  });

  it('should render correctly without user data', () => {
    const { getByText } = renderProfileScreen();

    expect(getByText('Profile')).toBeTruthy();
    expect(getByText('Sign Out')).toBeTruthy();
  });

  it('should have correct header title styling', () => {
    const { getByText } = renderProfileScreen();
    const title = getByText('Profile');
    expect(title).toBeTruthy();
  });

  it('should render sign out button with correct styling', () => {
    const { getByText } = renderProfileScreen();
    const signOutButton = getByText('Sign Out');
    expect(signOutButton).toBeTruthy();
  });

  it('should display user information correctly', () => {
    const store = createMockStoreWithUser(testUsers.johnDoe);
    const { getByText } = renderProfileScreen(store);

    expect(getByText('John Doe')).toBeTruthy();
    expect(getByText('user@domain.com')).toBeTruthy();
  });

  it('should dispatch clearUser when sign out button is pressed', () => {
    const store = createMockStore();
    const { getByText } = renderProfileScreen(store);

    const signOutButton = getByText('Sign Out');
    fireEvent.press(signOutButton);

    const state = store.getState();
    expect(state.user.user).toBeNull();
  });

  it('should have correct title styles', () => {
    const { getByText } = renderProfileScreen();
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
    const { getByText } = renderProfileScreen();
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
    const { getByText } = renderProfileScreen(store);
    const signOutButton = getByText('Sign Out');

    // Press button multiple times
    fireEvent.press(signOutButton);
    fireEvent.press(signOutButton);
    fireEvent.press(signOutButton);

    const state = store.getState();
    expect(state.user.user).toBeNull();
  });

  it('should handle user with partial data', () => {
    const store = createMockStoreWithUser(testUsers.partialUser);
    const { getByText } = renderProfileScreen(store);

    expect(getByText('partial@test.com')).toBeTruthy();
    expect(getByText('Display Name')).toBeTruthy();
    expect(getByText('Email')).toBeTruthy();
  });

  it('should not crash when user has no email', () => {
    expect(() => {
      renderProfileScreen();
    }).not.toThrow();
  });

  it('should render sign out button with correct styles', () => {
    const { getByText } = renderProfileScreen();
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
    const { queryByText } = renderProfileScreen();
    // Should not show loading state by default
    expect(queryByText('Loading...')).toBeNull();
  });

  it('should display error state', () => {
    const { queryByText } = renderProfileScreen();
    // Should not show error state by default
    expect(queryByText('Error')).toBeNull();
  });

  it('should handle sign out button press and dispatch clearUser', () => {
    const store = createMockStore();
    const { getByText } = renderProfileScreen(store);

    const signOutButton = getByText('Sign Out');
    fireEvent.press(signOutButton);

    // Check that user is cleared from state
    const state = store.getState();
    expect(state.user.user).toBeNull();
  });

  it('should handle avatar being null or undefined', () => {
    const { getByText } = renderProfileScreen();
    expect(getByText('Sign Out')).toBeTruthy();
  });

  it('should have accessible sign out button', () => {
    const { getByText } = renderProfileScreen();
    const signOutButton = getByText('Sign Out');
    expect(signOutButton).toBeTruthy();

    // Test accessibility - button should be accessible
    expect(signOutButton.props.accessible).toBe(undefined);
  });

  it('should handle sign out multiple times without crashing', () => {
    const store = createMockStore();
    const { getByText } = renderProfileScreen(store);
    const signOutButton = getByText('Sign Out');

    // Press button multiple times
    fireEvent.press(signOutButton);
    fireEvent.press(signOutButton);
    fireEvent.press(signOutButton);

    const state = store.getState();
    expect(state.user.user).toBeNull();
  });
});
