import { jest, describe, it, expect } from '@jest/globals';
import userReducer, { setUser, setLoading, setError, clearUser } from '../userSlice';
import { User, UserState } from '../../../types/user';

describe('userSlice', () => {
  const initialState: UserState = {
    user: null,
    isLoading: false,
    error: null,
  };

  const mockUser: User = {
    id: '123',
    email: 'test@example.com',
    displayName: 'Test User',
    photoURL: 'https://example.com/photo.jpg',
  };

  it('should handle initial state', () => {
    expect(userReducer(undefined, { type: 'unknown' })).toEqual(initialState);
  });

  it('should handle setUser', () => {
    const actual = userReducer(initialState, setUser(mockUser));
    expect(actual.user).toEqual(mockUser);
    expect(actual.error).toBeNull();
  });

  describe('setUser edge cases', () => {
    it('should handle setUser with null while preserving loading state', () => {
      const stateWithUser = {
        user: mockUser,
        isLoading: true,  // Testing that loading state is preserved
        error: null,
      };
      const actual = userReducer(stateWithUser, setUser(null));
      expect(actual.user).toBeNull();
      expect(actual.error).toBeNull();
      expect(actual.isLoading).toBe(true);  // Loading state should be unchanged
    });

    it('should handle setUser with null when error exists', () => {
      const stateWithUserAndError = {
        user: mockUser,
        isLoading: false,
        error: 'Previous error',
      };
      const actual = userReducer(stateWithUserAndError, setUser(null));
      expect(actual.user).toBeNull();
      expect(actual.error).toBeNull();  // Error should be cleared
      expect(actual.isLoading).toBe(false);
    });
  });

  it('should handle setLoading', () => {
    const actual = userReducer(initialState, setLoading(true));
    expect(actual.isLoading).toBe(true);
  });

  it('should handle setError', () => {
    const errorMessage = 'Test error';
    const actual = userReducer(initialState, setError(errorMessage));
    expect(actual.error).toBe(errorMessage);
    expect(actual.isLoading).toBe(false);
  });

  it('should handle clearUser', () => {
    const stateWithUser = {
      user: mockUser,
      isLoading: false,
      error: 'Previous error',
    };
    const actual = userReducer(stateWithUser, clearUser());
    expect(actual.user).toBeNull();
    expect(actual.error).toBeNull();
  });
});