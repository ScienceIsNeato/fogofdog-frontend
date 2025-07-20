import AsyncStorage from '@react-native-async-storage/async-storage';
import { User } from '../types/user';
import { logger } from '../utils/logger';

export interface PersistedAuthState {
  user: User;
  expiresAt: number;
  keepLoggedIn: boolean;
}

export interface PersistedExplorationState {
  currentLocation: { latitude: number; longitude: number } | null;
  path: { latitude: number; longitude: number }[];
  exploredAreas: { latitude: number; longitude: number }[];
  zoomLevel: number;
  isTrackingPaused?: boolean;
}

const AUTH_STORAGE_KEY = '@fogofdog_auth_state';
const EXPLORATION_STORAGE_KEY = '@fogofdog_exploration_state';
const DEFAULT_LOGIN_DURATION_DAYS = 30;

export class AuthPersistenceService {
  /**
   * Save authentication state with optional "keep me logged in" functionality
   */
  static async saveAuthState(user: User, keepLoggedIn: boolean = true): Promise<void> {
    try {
      const expiresAt = keepLoggedIn
        ? Date.now() + DEFAULT_LOGIN_DURATION_DAYS * 24 * 60 * 60 * 1000
        : Date.now() + 24 * 60 * 60 * 1000; // 1 day if not keeping logged in

      const authState: PersistedAuthState = {
        user,
        expiresAt,
        keepLoggedIn,
      };

      await AsyncStorage.setItem(AUTH_STORAGE_KEY, JSON.stringify(authState));

      logger.info('Authentication state saved', {
        component: 'AuthPersistenceService',
        action: 'saveAuthState',
        userId: user.id,
        keepLoggedIn,
        expiresAt: new Date(expiresAt).toISOString(),
      });
    } catch (error) {
      logger.error('Failed to save authentication state', error, {
        component: 'AuthPersistenceService',
        action: 'saveAuthState',
      });
      throw error;
    }
  }

  /**
   * Retrieve persisted authentication state if still valid
   */
  static async getAuthState(): Promise<PersistedAuthState | null> {
    try {
      const storedData = await AsyncStorage.getItem(AUTH_STORAGE_KEY);

      if (!storedData) {
        return null;
      }

      const authState: PersistedAuthState = JSON.parse(storedData);

      // Check if the auth state has expired
      if (Date.now() > authState.expiresAt) {
        logger.info('Authentication state expired, clearing', {
          component: 'AuthPersistenceService',
          action: 'getAuthState',
          expiredAt: new Date(authState.expiresAt).toISOString(),
        });
        await this.clearAuthState();
        return null;
      }

      logger.info('Valid authentication state retrieved', {
        component: 'AuthPersistenceService',
        action: 'getAuthState',
        userId: authState.user.id,
        expiresAt: new Date(authState.expiresAt).toISOString(),
      });

      return authState;
    } catch (error) {
      logger.error('Failed to retrieve authentication state', error, {
        component: 'AuthPersistenceService',
        action: 'getAuthState',
      });
      return null;
    }
  }

  /**
   * Clear persisted authentication state (logout)
   */
  static async clearAuthState(): Promise<void> {
    try {
      await AsyncStorage.removeItem(AUTH_STORAGE_KEY);
      logger.info('Authentication state cleared', {
        component: 'AuthPersistenceService',
        action: 'clearAuthState',
      });
    } catch (error) {
      logger.error('Failed to clear authentication state', error, {
        component: 'AuthPersistenceService',
        action: 'clearAuthState',
      });
      throw error;
    }
  }

  /**
   * Check if user should be automatically logged in
   */
  static async shouldAutoLogin(): Promise<boolean> {
    const authState = await this.getAuthState();
    return authState !== null;
  }

  /**
   * Save exploration state (path data, current location, etc.)
   */
  static async saveExplorationState(explorationState: PersistedExplorationState): Promise<void> {
    try {
      await AsyncStorage.setItem(EXPLORATION_STORAGE_KEY, JSON.stringify(explorationState));

      logger.info('Exploration state saved', {
        component: 'AuthPersistenceService',
        action: 'saveExplorationState',
        pathPoints: explorationState.path.length,
        hasCurrentLocation: explorationState.currentLocation !== null,
      });
    } catch (error) {
      logger.error('Failed to save exploration state', error, {
        component: 'AuthPersistenceService',
        action: 'saveExplorationState',
      });
      throw error;
    }
  }

  /**
   * Retrieve persisted exploration state
   */
  static async getExplorationState(): Promise<PersistedExplorationState | null> {
    try {
      const storedData = await AsyncStorage.getItem(EXPLORATION_STORAGE_KEY);

      if (!storedData) {
        return null;
      }

      const explorationState: PersistedExplorationState = JSON.parse(storedData);

      logger.info('Exploration state retrieved', {
        component: 'AuthPersistenceService',
        action: 'getExplorationState',
        pathPoints: explorationState.path.length,
        hasCurrentLocation: explorationState.currentLocation !== null,
      });

      return explorationState;
    } catch (error) {
      logger.error('Failed to retrieve exploration state', error, {
        component: 'AuthPersistenceService',
        action: 'getExplorationState',
      });
      return null;
    }
  }

  /**
   * Clear persisted exploration state
   */
  static async clearExplorationState(): Promise<void> {
    try {
      await AsyncStorage.removeItem(EXPLORATION_STORAGE_KEY);
      logger.info('Exploration state cleared', {
        component: 'AuthPersistenceService',
        action: 'clearExplorationState',
      });
    } catch (error) {
      logger.error('Failed to clear exploration state', error, {
        component: 'AuthPersistenceService',
        action: 'clearExplorationState',
      });
      throw error;
    }
  }

  /**
   * Clear all persisted data (complete logout)
   */
  static async clearAllPersistedData(): Promise<void> {
    await Promise.all([this.clearAuthState(), this.clearExplorationState()]);
  }
}
