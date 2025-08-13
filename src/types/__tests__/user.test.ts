import type { User, UserState, AuthCredentials, GeoPoint } from '../user';

describe('user types', () => {
  it('should define User interface correctly', () => {
    const user: User = {
      id: 'user123',
      email: 'test@example.com',
      displayName: 'Test User',
      photoURL: 'https://example.com/photo.jpg',
    };

    expect(user.id).toBe('user123');
    expect(user.email).toBe('test@example.com');
    expect(user.displayName).toBe('Test User');
    expect(user.photoURL).toBe('https://example.com/photo.jpg');
  });

  it('should define User interface with optional photoURL', () => {
    const user: User = {
      id: 'user123',
      email: 'test@example.com',
      displayName: 'Test User',
    };

    expect(user.photoURL).toBeUndefined();
  });

  it('should define UserState interface correctly', () => {
    const userState: UserState = {
      user: {
        id: 'user123',
        email: 'test@example.com',
        displayName: 'Test User',
      },
      isLoading: false,
      error: null,
    };

    expect(userState.user?.id).toBe('user123');
    expect(userState.isLoading).toBe(false);
    expect(userState.error).toBeNull();
  });

  it('should define UserState with error', () => {
    const userState: UserState = {
      user: null,
      isLoading: false,
      error: 'Authentication failed',
    };

    expect(userState.user).toBeNull();
    expect(userState.error).toBe('Authentication failed');
  });

  it('should define AuthCredentials interface correctly', () => {
    const credentials: AuthCredentials = {
      email: 'user@example.com',
      password: 'secretPassword',
    };

    expect(credentials.email).toBe('user@example.com');
    expect(credentials.password).toBe('secretPassword');
  });

  it('should define GeoPoint interface correctly', () => {
    const geoPoint: GeoPoint = {
      latitude: 41.6867,
      longitude: -91.5802,
      timestamp: Date.now(),
    };

    expect(typeof geoPoint.latitude).toBe('number');
    expect(typeof geoPoint.longitude).toBe('number');
    expect(typeof geoPoint.timestamp).toBe('number');
    expect(geoPoint.latitude).toBe(41.6867);
    expect(geoPoint.longitude).toBe(-91.5802);
  });
});
