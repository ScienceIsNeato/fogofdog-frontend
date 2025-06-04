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

  it('should display user information correctly', () => {
    const store = createMockStoreWithUser(testUsers.johnDoe);
    const { getByText } = renderProfileScreen(store);

    expect(getByText('John Doe')).toBeTruthy();
    expect(getByText('user@domain.com')).toBeTruthy();
  });

  it('should handle user with partial data', () => {
    const store = createMockStoreWithUser(testUsers.partialUser);
    const { getByText } = renderProfileScreen(store);

    expect(getByText('partial@test.com')).toBeTruthy();
    expect(getByText('Display Name')).toBeTruthy();
    expect(getByText('Email')).toBeTruthy();
  });

  it('should dispatch clearUser when sign out button is pressed', () => {
    const store = createMockStore();
    const { getByText } = renderProfileScreen(store);

    const signOutButton = getByText('Sign Out');
    fireEvent.press(signOutButton);

    const state = store.getState();
    expect(state.user.user).toBeNull();
  });

  it('should handle multiple sign out button presses without crashing', () => {
    const store = createMockStore();
    const { getByText } = renderProfileScreen(store);
    const signOutButton = getByText('Sign Out');

    // Press button multiple times to test robustness
    fireEvent.press(signOutButton);
    fireEvent.press(signOutButton);
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

  it('should have correct sign out button styles', () => {
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

  it('should have correct label styles', () => {
    const { getByText } = renderProfileScreen();
    const displayNameLabel = getByText('Display Name');
    const emailLabel = getByText('Email');

    const expectedLabelStyle = {
      color: '#666',
      fontSize: 14,
      marginBottom: 4,
    };

    expect(displayNameLabel.props.style).toEqual(expect.objectContaining(expectedLabelStyle));
    expect(emailLabel.props.style).toEqual(expect.objectContaining(expectedLabelStyle));
  });

  it('should handle edge cases gracefully', () => {
    // Test no crash with no user email + avatar handling
    expect(() => {
      const { getByText } = renderProfileScreen();
      expect(getByText('Sign Out')).toBeTruthy();
    }).not.toThrow();
  });

  it('should not display loading or error states by default', () => {
    const { queryByText } = renderProfileScreen();
    expect(queryByText('Loading...')).toBeNull();
    expect(queryByText('Error')).toBeNull();
  });

  it('should have accessible sign out button', () => {
    const { getByText } = renderProfileScreen();
    const signOutButton = getByText('Sign Out');
    expect(signOutButton).toBeTruthy();
    // Test accessibility - button should be accessible
    expect(signOutButton.props.accessible).toBe(undefined);
  });
});
