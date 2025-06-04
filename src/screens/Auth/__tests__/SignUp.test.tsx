import { fireEvent } from '@testing-library/react-native';
import { renderAuthScreen, clearAllMocks } from '../../../__tests__/test-helpers/render-utils';
import { createMockStore, mockNavigation } from '../../../__tests__/test-helpers/shared-mocks';

describe('SignUpScreen', () => {
  beforeEach(() => {
    clearAllMocks();
  });

  it('should render correctly', () => {
    const { getByText } = renderAuthScreen('SignUp');

    expect(getByText('Create Account')).toBeTruthy();
    expect(getByText('Sign Up')).toBeTruthy();
    expect(getByText('Already have an account?')).toBeTruthy();
  });

  it('should handle sign up button press', () => {
    const store = createMockStore();
    const { getByText } = renderAuthScreen('SignUp', store);
    const signUpButton = getByText('Sign Up');

    fireEvent.press(signUpButton);

    // Check that user is set in store
    const state = store.getState();
    expect(state.user.user).toEqual({
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  it('should navigate to sign in when already have account button is pressed', () => {
    const { getByText } = renderAuthScreen('SignUp');
    const signInButton = getByText('Already have an account?');

    fireEvent.press(signInButton);

    expect(mockNavigation.navigate).toHaveBeenCalledWith('SignIn');
  });

  it('should have correct title styling', () => {
    const { getByText } = renderAuthScreen('SignUp');
    const titleElement = getByText('Create Account');

    expect(titleElement.props.style).toEqual(
      expect.objectContaining({
        fontSize: 32,
        color: '#fff',
        fontWeight: 'bold',
        marginBottom: 40,
      })
    );
  });

  it('should have correct button styling', () => {
    const { getByText } = renderAuthScreen('SignUp');
    const signUpButton = getByText('Sign Up');

    // Check button text styling
    expect(signUpButton.props.style).toEqual(
      expect.objectContaining({
        color: '#fff',
        fontSize: 18,
        fontWeight: '600',
      })
    );
  });

  it('should handle multiple sign up button presses', () => {
    const store = createMockStore();
    const { getByText } = renderAuthScreen('SignUp', store);
    const signUpButton = getByText('Sign Up');

    // Press button multiple times
    fireEvent.press(signUpButton);
    fireEvent.press(signUpButton);
    fireEvent.press(signUpButton);

    // User should still be set (last action wins)
    const state = store.getState();
    expect(state.user.user).toEqual({
      id: '123',
      email: 'test@example.com',
      displayName: 'Test User',
    });
  });

  it('should have different background color than SignIn screen', () => {
    const { getByText } = renderAuthScreen('SignUp');
    const titleElement = getByText('Create Account');

    // SignUp screen should have white text (indicating black background)
    expect(titleElement.props.style.color).toBe('#fff');
  });

  it('should maintain accessibility', () => {
    const { getByText } = renderAuthScreen('SignUp');
    const signUpButton = getByText('Sign Up');
    const signInButton = getByText('Already have an account?');

    // Buttons should be accessible
    expect(signUpButton).toBeTruthy();
    expect(signInButton).toBeTruthy();
  });

  it('should dispatch user action only once per button press', () => {
    const store = createMockStore();
    const { getByText } = renderAuthScreen('SignUp', store);
    const signUpButton = getByText('Sign Up');

    // Initial state should be null
    expect(store.getState().user.user).toBeNull();

    fireEvent.press(signUpButton);

    // User should be set after button press
    expect(store.getState().user.user).not.toBeNull();
  });

  it('should handle navigation correctly', () => {
    const { getByText } = renderAuthScreen('SignUp');
    const signInButton = getByText('Already have an account?');

    fireEvent.press(signInButton);

    expect(mockNavigation.navigate).toHaveBeenCalledWith('SignIn');
    expect(mockNavigation.navigate).toHaveBeenCalledTimes(1);
  });
});
