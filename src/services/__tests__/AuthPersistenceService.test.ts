import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  AuthPersistenceService,
  PersistedAuthState,
  PersistedExplorationState,
} from '../AuthPersistenceService';
import { User } from '../../types/user';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  setItem: jest.fn(),
  getItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock logger
jest.mock('../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
  },
}));

const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('AuthPersistenceService', () => {
  const mockUser: User = {
    id: 'test-user-123',
    email: 'test@example.com',
    displayName: 'Test User',
  };

  const mockExplorationState: PersistedExplorationState = {
    currentLocation: { latitude: 37.7749, longitude: -122.4194 },
    path: [
      { latitude: 37.7749, longitude: -122.4194 },
      { latitude: 37.7849, longitude: -122.4294 },
    ],
    exploredAreas: [{ latitude: 37.7749, longitude: -122.4194 }],
    zoomLevel: 14,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset Date.now for consistent testing
    jest.spyOn(Date, 'now').mockReturnValue(1000000000000); // Fixed timestamp
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('saveAuthState', () => {
    it('should save auth state with keep logged in enabled (30 days)', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();

      await AuthPersistenceService.saveAuthState(mockUser, true);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@fogofdog_auth_state',
        JSON.stringify({
          user: mockUser,
          expiresAt: 1000000000000 + 30 * 24 * 60 * 60 * 1000,
          keepLoggedIn: true,
        })
      );
    });

    it('should save auth state with keep logged in disabled (1 day)', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();

      await AuthPersistenceService.saveAuthState(mockUser, false);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@fogofdog_auth_state',
        JSON.stringify({
          user: mockUser,
          expiresAt: 1000000000000 + 24 * 60 * 60 * 1000,
          keepLoggedIn: false,
        })
      );
    });

    it('should throw error if AsyncStorage fails', async () => {
      const error = new Error('Storage error');
      mockAsyncStorage.setItem.mockRejectedValue(error);

      await expect(AuthPersistenceService.saveAuthState(mockUser, true)).rejects.toThrow(
        'Storage error'
      );
    });
  });

  describe('getAuthState', () => {
    it('should return null if no stored data exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await AuthPersistenceService.getAuthState();

      expect(result).toBeNull();
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@fogofdog_auth_state');
    });

    it('should return valid auth state if not expired', async () => {
      const futureTimestamp = 1000000000000 + 10 * 24 * 60 * 60 * 1000; // 10 days in future
      const authState: PersistedAuthState = {
        user: mockUser,
        expiresAt: futureTimestamp,
        keepLoggedIn: true,
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(authState));

      const result = await AuthPersistenceService.getAuthState();

      expect(result).toEqual(authState);
    });

    it('should clear and return null if auth state is expired', async () => {
      const pastTimestamp = 1000000000000 - 24 * 60 * 60 * 1000; // 1 day in past
      const expiredAuthState: PersistedAuthState = {
        user: mockUser,
        expiresAt: pastTimestamp,
        keepLoggedIn: true,
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(expiredAuthState));
      mockAsyncStorage.removeItem.mockResolvedValue();

      const result = await AuthPersistenceService.getAuthState();

      expect(result).toBeNull();
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@fogofdog_auth_state');
    });

    it('should return null if JSON parsing fails', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid-json');

      const result = await AuthPersistenceService.getAuthState();

      expect(result).toBeNull();
    });
  });

  describe('clearAuthState', () => {
    it('should remove auth state from storage', async () => {
      mockAsyncStorage.removeItem.mockResolvedValue();

      await AuthPersistenceService.clearAuthState();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@fogofdog_auth_state');
    });

    it('should throw error if removal fails', async () => {
      const error = new Error('Removal error');
      mockAsyncStorage.removeItem.mockRejectedValue(error);

      await expect(AuthPersistenceService.clearAuthState()).rejects.toThrow('Removal error');
    });
  });

  describe('shouldAutoLogin', () => {
    it('should return true if valid auth state exists', async () => {
      const futureTimestamp = 1000000000000 + 10 * 24 * 60 * 60 * 1000;
      const authState: PersistedAuthState = {
        user: mockUser,
        expiresAt: futureTimestamp,
        keepLoggedIn: true,
      };

      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(authState));

      const result = await AuthPersistenceService.shouldAutoLogin();

      expect(result).toBe(true);
    });

    it('should return false if no valid auth state exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await AuthPersistenceService.shouldAutoLogin();

      expect(result).toBe(false);
    });
  });

  describe('saveExplorationState', () => {
    it('should save exploration state to storage', async () => {
      mockAsyncStorage.setItem.mockResolvedValue();

      await AuthPersistenceService.saveExplorationState(mockExplorationState);

      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        '@fogofdog_exploration_state',
        JSON.stringify(mockExplorationState)
      );
    });

    it('should throw error if storage fails', async () => {
      const error = new Error('Storage error');
      mockAsyncStorage.setItem.mockRejectedValue(error);

      await expect(
        AuthPersistenceService.saveExplorationState(mockExplorationState)
      ).rejects.toThrow('Storage error');
    });
  });

  describe('getExplorationState', () => {
    it('should return exploration state if it exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockExplorationState));

      const result = await AuthPersistenceService.getExplorationState();

      expect(result).toEqual(mockExplorationState);
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('@fogofdog_exploration_state');
    });

    it('should return null if no exploration state exists', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await AuthPersistenceService.getExplorationState();

      expect(result).toBeNull();
    });

    it('should return null if JSON parsing fails', async () => {
      mockAsyncStorage.getItem.mockResolvedValue('invalid-json');

      const result = await AuthPersistenceService.getExplorationState();

      expect(result).toBeNull();
    });
  });

  describe('clearExplorationState', () => {
    it('should remove exploration state from storage', async () => {
      mockAsyncStorage.removeItem.mockResolvedValue();

      await AuthPersistenceService.clearExplorationState();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@fogofdog_exploration_state');
    });
  });

  describe('clearAllPersistedData', () => {
    it('should clear both auth and exploration state', async () => {
      mockAsyncStorage.removeItem.mockResolvedValue();

      await AuthPersistenceService.clearAllPersistedData();

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledTimes(2);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@fogofdog_auth_state');
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('@fogofdog_exploration_state');
    });
  });
});
