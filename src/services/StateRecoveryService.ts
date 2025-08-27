/**
 * State Recovery Service
 *
 * Handles detection and recovery from corrupted app state that can cause:
 * - Follow mode to stop working
 * - GPS centering to fail on startup
 * - Cinematic animations to not play
 * - General map interaction issues
 */

import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';

export interface StateHealthCheck {
  isHealthy: boolean;
  issues: string[];
  recommendations: string[];
}

export interface CorruptionDetectionResult {
  asyncStorageCorrupted: boolean;
  reduxStateCorrupted: boolean;
  permissionsCorrupted: boolean;
  detectedIssues: string[];
}

export class StateRecoveryService {
  private static readonly RECOVERY_STORAGE_KEY = '@fogofdog_state_recovery';
  private static readonly AUTH_STORAGE_KEY = '@fogofdog_auth_state';
  private static readonly EXPLORATION_STORAGE_KEY = '@fogofdog_exploration_state';

  /**
   * Perform comprehensive state health check
   */
  static async performHealthCheck(): Promise<StateHealthCheck> {
    const issues: string[] = [];
    const recommendations: string[] = [];

    try {
      // Check AsyncStorage integrity
      const asyncStorageCheck = await this.checkAsyncStorageIntegrity();
      if (!asyncStorageCheck.isHealthy) {
        issues.push('AsyncStorage corruption detected');
        recommendations.push('Clear corrupted AsyncStorage data');
      }

      // Check for known corruption patterns
      const corruptionCheck = await this.detectKnownCorruptionPatterns();
      issues.push(...corruptionCheck.detectedIssues);

      if (corruptionCheck.asyncStorageCorrupted) {
        recommendations.push('Reset exploration state');
      }

      if (corruptionCheck.reduxStateCorrupted) {
        recommendations.push('Reset Redux state to defaults');
      }

      if (corruptionCheck.permissionsCorrupted) {
        recommendations.push('Re-request location permissions');
      }

      logger.info('State health check completed', {
        component: 'StateRecoveryService',
        action: 'performHealthCheck',
        issuesFound: issues.length,
        issues,
        recommendations,
      });

      return {
        isHealthy: issues.length === 0,
        issues,
        recommendations,
      };
    } catch (error) {
      logger.error('Health check failed', error, {
        component: 'StateRecoveryService',
        action: 'performHealthCheck',
      });

      return {
        isHealthy: false,
        issues: ['Health check failed to run'],
        recommendations: ['Perform manual state recovery'],
      };
    }
  }

  /**
   * Check AsyncStorage for corruption or invalid data
   */
  private static async checkAsyncStorageIntegrity(): Promise<{
    isHealthy: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    try {
      // Check exploration state
      const explorationData = await AsyncStorage.getItem(this.EXPLORATION_STORAGE_KEY);
      if (explorationData) {
        try {
          const parsed = JSON.parse(explorationData);

          // Validate structure
          if (typeof parsed !== 'object' || parsed === null) {
            issues.push('Exploration state is not an object');
          } else {
            // Check for required properties
            if (parsed.path && !Array.isArray(parsed.path)) {
              issues.push('Exploration path is not an array');
            }

            // Check for corrupted GPS points
            if (Array.isArray(parsed.path)) {
              const invalidPoints = parsed.path.filter(
                (point: any) =>
                  !point ||
                  typeof point.latitude !== 'number' ||
                  typeof point.longitude !== 'number' ||
                  isNaN(point.latitude) ||
                  isNaN(point.longitude) ||
                  Math.abs(point.latitude) > 90 ||
                  Math.abs(point.longitude) > 180
              );

              if (invalidPoints.length > 0) {
                issues.push(`${invalidPoints.length} corrupted GPS points found`);
              }
            }
          }
        } catch {
          issues.push('Exploration state JSON is corrupted');
        }
      }

      // Check auth state
      const authData = await AsyncStorage.getItem(this.AUTH_STORAGE_KEY);
      if (authData) {
        try {
          const parsed = JSON.parse(authData);
          if (!parsed.user || !parsed.expiresAt) {
            issues.push('Auth state structure is invalid');
          }
        } catch {
          issues.push('Auth state JSON is corrupted');
        }
      }
    } catch (error) {
      issues.push('Failed to access AsyncStorage');
      logger.error('AsyncStorage integrity check failed', error, {
        component: 'StateRecoveryService',
        action: 'checkAsyncStorageIntegrity',
      });
    }

    return {
      isHealthy: issues.length === 0,
      issues,
    };
  }

  /**
   * Detect known patterns that cause GPS/follow mode corruption
   */
  private static async detectKnownCorruptionPatterns(): Promise<CorruptionDetectionResult> {
    const detectedIssues: string[] = [];
    let asyncStorageCorrupted = false;
    let reduxStateCorrupted = false;
    let permissionsCorrupted = false;

    try {
      const explorationData = await AsyncStorage.getItem(this.EXPLORATION_STORAGE_KEY);

      if (explorationData) {
        const parsed = JSON.parse(explorationData);

        // Pattern 1: Massive path arrays (>10k points) can cause memory issues
        if (parsed.path && Array.isArray(parsed.path) && parsed.path.length > 10000) {
          detectedIssues.push(`Excessive path points: ${parsed.path.length} (>10k)`);
          asyncStorageCorrupted = true;
        }

        // Pattern 2: Invalid current location causing centering failures
        if (parsed.currentLocation) {
          const loc = parsed.currentLocation;
          if (
            typeof loc.latitude !== 'number' ||
            typeof loc.longitude !== 'number' ||
            isNaN(loc.latitude) ||
            isNaN(loc.longitude)
          ) {
            detectedIssues.push('Invalid current location coordinates');
            asyncStorageCorrupted = true;
          }
        }

        // Pattern 3: Corrupted zoom levels causing animation issues
        if (parsed.zoomLevel && (typeof parsed.zoomLevel !== 'number' || isNaN(parsed.zoomLevel))) {
          detectedIssues.push('Invalid zoom level data');
          asyncStorageCorrupted = true;
        }
      }
    } catch (error) {
      detectedIssues.push('Failed to analyze stored state patterns');
      logger.error('Corruption pattern detection failed', error, {
        component: 'StateRecoveryService',
        action: 'detectKnownCorruptionPatterns',
      });
    }

    return {
      asyncStorageCorrupted,
      reduxStateCorrupted,
      permissionsCorrupted,
      detectedIssues,
    };
  }

  /**
   * Perform emergency state recovery - clears all potentially corrupted data
   */
  static async performEmergencyRecovery(): Promise<void> {
    logger.warn('🚨 Performing emergency state recovery', {
      component: 'StateRecoveryService',
      action: 'performEmergencyRecovery',
    });

    try {
      // Clear potentially corrupted AsyncStorage data
      await AsyncStorage.multiRemove([
        this.EXPLORATION_STORAGE_KEY,
        this.AUTH_STORAGE_KEY,
        this.RECOVERY_STORAGE_KEY,
      ]);

      // Record recovery event
      await AsyncStorage.setItem(
        this.RECOVERY_STORAGE_KEY,
        JSON.stringify({
          recoveryPerformed: true,
          timestamp: Date.now(),
          reason: 'Emergency state recovery',
        })
      );

      logger.info('✅ Emergency state recovery completed', {
        component: 'StateRecoveryService',
        action: 'performEmergencyRecovery',
      });
    } catch (error) {
      logger.error('❌ Emergency recovery failed', error, {
        component: 'StateRecoveryService',
        action: 'performEmergencyRecovery',
      });
      throw error;
    }
  }

  /**
   * Selective recovery - only clears exploration state, preserves auth
   */
  static async performSelectiveRecovery(): Promise<void> {
    logger.warn('🔄 Performing selective state recovery', {
      component: 'StateRecoveryService',
      action: 'performSelectiveRecovery',
    });

    try {
      // Only clear exploration state, keep auth
      await AsyncStorage.removeItem(this.EXPLORATION_STORAGE_KEY);

      // Record recovery event
      await AsyncStorage.setItem(
        this.RECOVERY_STORAGE_KEY,
        JSON.stringify({
          recoveryPerformed: true,
          timestamp: Date.now(),
          reason: 'Selective exploration state recovery',
        })
      );

      logger.info('✅ Selective state recovery completed', {
        component: 'StateRecoveryService',
        action: 'performSelectiveRecovery',
      });
    } catch (error) {
      logger.error('❌ Selective recovery failed', error, {
        component: 'StateRecoveryService',
        action: 'performSelectiveRecovery',
      });
      throw error;
    }
  }

  /**
   * Check if a recovery was recently performed
   */
  static async wasRecoveryRecentlyPerformed(): Promise<boolean> {
    try {
      const recoveryData = await AsyncStorage.getItem(this.RECOVERY_STORAGE_KEY);
      if (!recoveryData) return false;

      const parsed = JSON.parse(recoveryData);
      const recoveryTime = parsed.timestamp;
      const now = Date.now();

      // Consider "recent" as within last 24 hours
      return now - recoveryTime < 24 * 60 * 60 * 1000;
    } catch (error) {
      logger.error('Failed to check recovery status', error, {
        component: 'StateRecoveryService',
        action: 'wasRecoveryRecentlyPerformed',
      });
      return false;
    }
  }

  /**
   * Create a backup of current state before recovery
   */
  static async createStateBackup(): Promise<void> {
    try {
      const explorationData = await AsyncStorage.getItem(this.EXPLORATION_STORAGE_KEY);
      const authData = await AsyncStorage.getItem(this.AUTH_STORAGE_KEY);

      const backup = {
        timestamp: Date.now(),
        explorationState: explorationData ? JSON.parse(explorationData) : null,
        authState: authData ? JSON.parse(authData) : null,
      };

      await AsyncStorage.setItem('@fogofdog_state_backup', JSON.stringify(backup));

      logger.info('State backup created successfully', {
        component: 'StateRecoveryService',
        action: 'createStateBackup',
        hasExplorationData: !!explorationData,
        hasAuthData: !!authData,
      });
    } catch (error) {
      logger.error('Failed to create state backup', error, {
        component: 'StateRecoveryService',
        action: 'createStateBackup',
      });
    }
  }
}
