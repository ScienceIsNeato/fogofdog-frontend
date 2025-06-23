import type { User, UserState, AuthCredentials, GeoPoint } from '../user';

describe('User Types', () => {
  describe('User interface', () => {
    it('should allow valid User objects', () => {
      const validUser: User = {
        id: '123',
        email: 'test@example.com',
        displayName: 'Test User',
        photoURL: 'https://example.com/photo.jpg',
      };

      expect(validUser.id).toBe('123');
      expect(validUser.email).toBe('test@example.com');
      expect(validUser.displayName).toBe('Test User');
      expect(validUser.photoURL).toBe('https://example.com/photo.jpg');
    });

    it('should allow User objects without optional photoURL', () => {
      const userWithoutPhoto: User = {
        id: '456',
        email: 'user@example.com',
        displayName: 'Another User',
      };

      expect(userWithoutPhoto.id).toBe('456');
      expect(userWithoutPhoto.email).toBe('user@example.com');
      expect(userWithoutPhoto.displayName).toBe('Another User');
      expect(userWithoutPhoto.photoURL).toBeUndefined();
    });
  });

  describe('UserState interface', () => {
    it('should allow valid UserState with user', () => {
      const userState: UserState = {
        user: {
          id: '123',
          email: 'test@example.com',
          displayName: 'Test User',
        },
        isLoading: false,
        error: null,
      };

      expect(userState.user).toBeDefined();
      expect(userState.user?.id).toBe('123');
      expect(userState.isLoading).toBe(false);
      expect(userState.error).toBeNull();
    });

    it('should allow UserState with null user', () => {
      const emptyUserState: UserState = {
        user: null,
        isLoading: true,
        error: 'Authentication failed',
      };

      expect(emptyUserState.user).toBeNull();
      expect(emptyUserState.isLoading).toBe(true);
      expect(emptyUserState.error).toBe('Authentication failed');
    });
  });

  describe('AuthCredentials interface', () => {
    it('should allow valid AuthCredentials', () => {
      const credentials: AuthCredentials = {
        email: 'user@example.com',
        password: 'securePassword123',
      };

      expect(credentials.email).toBe('user@example.com');
      expect(credentials.password).toBe('securePassword123');
    });

    it('should work with different email formats', () => {
      const credentials: AuthCredentials = {
        email: 'user.name+tag@domain.co.uk',
        password: 'anotherPassword',
      };

      expect(credentials.email).toBe('user.name+tag@domain.co.uk');
      expect(credentials.password).toBe('anotherPassword');
    });
  });

  describe('GeoPoint interface', () => {
    it('should allow valid GeoPoint coordinates', () => {
      const location: GeoPoint = {
        latitude: 37.7749,
        longitude: -122.4194,
      };

      expect(location.latitude).toBe(37.7749);
      expect(location.longitude).toBe(-122.4194);
    });

    it('should allow edge case coordinates', () => {
      const northPole: GeoPoint = {
        latitude: 90,
        longitude: 0,
      };

      const southPole: GeoPoint = {
        latitude: -90,
        longitude: 180,
      };

      expect(northPole.latitude).toBe(90);
      expect(northPole.longitude).toBe(0);
      expect(southPole.latitude).toBe(-90);
      expect(southPole.longitude).toBe(180);
    });

    it('should work with decimal precision', () => {
      const preciseLocation: GeoPoint = {
        latitude: 40.712775,
        longitude: -74.005973,
      };

      expect(preciseLocation.latitude).toBe(40.712775);
      expect(preciseLocation.longitude).toBe(-74.005973);
    });
  });

  describe('Type compatibility', () => {
    it('should allow GeoPoint in User-related contexts', () => {
      const userLocation: GeoPoint = {
        latitude: 51.5074,
        longitude: -0.1278,
      };

      const userWithLocation = {
        user: {
          id: '789',
          email: 'london@example.com',
          displayName: 'London User',
        } as User,
        currentLocation: userLocation,
      };

      expect(userWithLocation.user.id).toBe('789');
      expect(userWithLocation.currentLocation.latitude).toBe(51.5074);
      expect(userWithLocation.currentLocation.longitude).toBe(-0.1278);
    });
  });
});
