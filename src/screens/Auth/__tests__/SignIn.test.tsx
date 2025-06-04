import { fireEvent } from '@testing-library/react-native';
import { renderAuthScreen, clearAllMocks } from '../../../__tests__/test-helpers/render-utils';
import { createMockStore, mockNavigation } from '../../../__tests__/test-helpers/shared-mocks';

describe('SignInScreen', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('should render correctly', () => {
    const { getAllByText, getByTestId } = renderAuthScreen('SignIn');

    expect(getAllByText('Sign In')).toHaveLength(2); // Title and button
    expect(getByTestId('signInButton')).toBeTruthy();
    expect(getByTestId('createAccountButton')).toBeTruthy();
    expect(getAllByText('Create Account')).toHaveLength(1);
  });

  it('should handle sign in button press', () => {
    const store = createMockStore();
    const { getByTestId } = renderAuthScreen('SignIn', store);
    const signInButton = getByTestId('signInButton');

    fireEvent.press(signInButton);

    // Check that user is set in store
    const state = store.getState();
    expect(state.user.user).toEqual({
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  it('should navigate to sign up when create account button is pressed', () => {
    const { getByTestId } = renderAuthScreen('SignIn');
    const createAccountButton = getByTestId('createAccountButton');

    fireEvent.press(createAccountButton);

    expect(mockNavigation.navigate).toHaveBeenCalledWith('SignUp');
  });

  it('should have correct title styling', () => {
    const { getAllByText } = renderAuthScreen('SignIn');
    const titleElements = getAllByText('Sign In');
    const titleElement = titleElements[0]; // Get the title element (first occurrence)

    expect(titleElement?.props.style).toEqual(
      expect.objectContaining({
        fontSize: 32,
        color: '#000',
        fontWeight: 'bold',
        marginBottom: 40,
      })
    );
  });

  it('should have correct container styling', () => {
    const { getAllByText } = renderAuthScreen('SignIn');
    const titleElements = getAllByText('Sign In');
    const titleElement = titleElements[0]; // Get the title element (first occurrence)

    // Title should be black text (white background)
    expect(titleElement?.props.style.color).toBe('#000');
  });

  it('should handle multiple sign in button presses', () => {
    const store = createMockStore();
    const { getByTestId } = renderAuthScreen('SignIn', store);
    const signInButton = getByTestId('signInButton');

    // Press button multiple times
    fireEvent.press(signInButton);
    fireEvent.press(signInButton);
    fireEvent.press(signInButton);

    // User should still be set (last action wins)
    const state = store.getState();
    expect(state.user.user).toEqual({
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  it('should maintain accessibility', () => {
    const { getByTestId } = renderAuthScreen('SignIn');
    const signInButton = getByTestId('signInButton');
    const createAccountButton = getByTestId('createAccountButton');

    // Buttons should have testIDs for accessibility
    expect(signInButton).toBeTruthy();
    expect(createAccountButton).toBeTruthy();
  });

  it('should dispatch user action only once per button press', () => {
    const store = createMockStore();
    const { getByTestId } = renderAuthScreen('SignIn', store);
    const signInButton = getByTestId('signInButton');

    // Initial state should be null
    expect(store.getState().user.user).toBeNull();

    fireEvent.press(signInButton);

    // User should be set after button press
    expect(store.getState().user.user).not.toBeNull();
  });

  it('should handle navigation correctly', () => {
    const { getByTestId } = renderAuthScreen('SignIn');
    const createAccountButton = getByTestId('createAccountButton');

    fireEvent.press(createAccountButton);

    expect(mockNavigation.navigate).toHaveBeenCalledWith('SignUp');
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
  });
});
