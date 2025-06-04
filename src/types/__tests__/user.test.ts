import { User, UserState, AuthCredentials, GeoPoint } from '../user';

describe('User Types', () => {
  describe('User', () => {
    it('should have correct type structure', () => {
      const mockUser: User = {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
      };

      expect(typeof mockUser.id).toBe('string');
      expect(typeof mockUser.email).toBe('string');
      expect(typeof mockUser.displayName).toBe('string');
      expect(typeof mockUser.photoURL).toBe('string');
    });

    it('should accept user without photoURL', () => {
      const mockUser: User = {
        id: '456',
        email: 'user@test.com',
        displayName: 'John Doe',
      };

      expect(mockUser.id).toBe('456');
      expect(mockUser.email).toBe('user@test.com');
      expect(mockUser.displayName).toBe('John Doe');
      expect(mockUser.photoURL).toBeUndefined();
    });
  });

  describe('UserState', () => {
    it('should have correct type structure with user', () => {
      const mockUser: User = {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
      };

      const mockUserState: UserState = {
        user: mockUser,
        isLoading: false,
        error: null,
      };

      expect(mockUserState.user).toEqual(mockUser);
      expect(typeof mockUserState.isLoading).toBe('boolean');
      expect(mockUserState.error).toBeNull();
    });

    it('should accept null user state', () => {
      const mockUserState: UserState = {
        user: null,
        isLoading: true,
        error: 'Authentication failed',
      };

      expect(mockUserState.user).toBeNull();
      expect(mockUserState.isLoading).toBe(true);
      expect(typeof mockUserState.error).toBe('string');
    });
  });

  describe('AuthCredentials', () => {
    it('should have correct type structure', () => {
      const mockCredentials: AuthCredentials = {
        email: 'test@example.com',
        password: 'secretpassword',
      };

      expect(typeof mockCredentials.email).toBe('string');
      expect(typeof mockCredentials.password).toBe('string');
    });

    it('should accept valid email and password', () => {
      const credentials: AuthCredentials = {
        email: 'user@domain.com',
        password: 'mypassword123',
      };

      expect(credentials.email).toBe('user@domain.com');
      expect(credentials.password).toBe('mypassword123');
    });
  });

  describe('GeoPoint', () => {
    it('should have correct type structure', () => {
      const mockPoint: GeoPoint = {
        latitude: 37.7749,
        longitude: -122.4194,
      };

      expect(typeof mockPoint.latitude).toBe('number');
      expect(typeof mockPoint.longitude).toBe('number');
    });

    it('should accept valid coordinate values', () => {
      const sanFrancisco: GeoPoint = {
        latitude: 37.7749,
        longitude: -122.4194,
      };

      const newYork: GeoPoint = {
        latitude: 40.7128,
        longitude: -74.006,
      };

      expect(sanFrancisco.latitude).toBe(37.7749);
      expect(sanFrancisco.longitude).toBe(-122.4194);
      expect(newYork.latitude).toBe(40.7128);
      expect(newYork.longitude).toBe(-74.006);
    });

    it('should accept negative coordinates', () => {
      const southernPoint: GeoPoint = {
        latitude: -33.8688,
        longitude: 151.2093,
      };

      expect(southernPoint.latitude).toBe(-33.8688);
      expect(southernPoint.longitude).toBe(151.2093);
    });
  });
});
