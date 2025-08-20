import AsyncStorage from '@react-native-async-storage/async-storage';
import { ExplorationStats } from './StatsCalculationService';
import { logger } from '../utils/logger';

const UNKNOWN_ERROR_MESSAGE = 'Unknown error';

/**
 * Persistent stats data structure for local storage
 */
interface PersistentStatsData {
  totalStats: ExplorationStats;
  lastUpdated: number;
  version: string; // For future data migration if needed
}

/**
 * Service for persisting exploration statistics to local device storage
 * Handles save/load operations for lifetime statistics
 */
export class StatsPersistenceService {
  private static readonly STORAGE_KEY = 'fogofdog_exploration_stats';
  private static readonly CURRENT_VERSION = '1.0.0';
  private static readonly SAVE_DEBOUNCE_MS = 5000; // Debounce saves to avoid excessive writes

  private static saveTimeout: NodeJS.Timeout | null = null;

  /**
   * Load persistent statistics from local storage
   */
  static async loadStats(): Promise<ExplorationStats | null> {
    try {
      logger.debug('Loading persistent exploration stats', {
        component: 'StatsPersistenceService',
        action: 'loadStats',
      });

      const rawData = await AsyncStorage.getItem(this.STORAGE_KEY);

      if (!rawData) {
        logger.debug('No persistent stats found, returning null', {
          component: 'StatsPersistenceService',
        });
        return null;
      }

      const parsedData: PersistentStatsData = JSON.parse(rawData);

      // Validate data structure
      if (!this.isValidPersistentData(parsedData)) {
        logger.warn('Invalid persistent stats data found, ignoring', {
          component: 'StatsPersistenceService',
          data: parsedData,
        });
        return null;
      }

      logger.info('Successfully loaded persistent exploration stats', {
        component: 'StatsPersistenceService',
        totalDistance: parsedData.totalStats.distance,
        totalArea: parsedData.totalStats.area,
        totalTime: parsedData.totalStats.time,
        lastUpdated: parsedData.lastUpdated,
        version: parsedData.version,
      });

      return parsedData.totalStats;
    } catch (error) {
      logger.error('Failed to load persistent stats', {
        component: 'StatsPersistenceService',
        action: 'loadStats',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      });
      return null;
    }
  }

  /**
   * Save statistics to local storage with debouncing
   */
  static async saveStats(stats: ExplorationStats): Promise<void> {
    // Clear existing timeout to debounce saves
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
    }

    // Set new timeout for debounced save
    this.saveTimeout = setTimeout(() => {
      this.performSave(stats).catch(() => {
        // Errors are already logged in performSave, this prevents unhandled rejection
      });
    }, this.SAVE_DEBOUNCE_MS);
  }

  /**
   * Save statistics immediately (bypass debouncing)
   */
  static async saveStatsImmediate(stats: ExplorationStats): Promise<void> {
    // Clear any pending debounced save
    if (this.saveTimeout) {
      clearTimeout(this.saveTimeout);
      this.saveTimeout = null;
    }

    await this.performSave(stats);
  }

  /**
   * Perform the actual save operation
   */
  private static async performSave(stats: ExplorationStats): Promise<void> {
    try {
      logger.debug('Saving persistent exploration stats', {
        component: 'StatsPersistenceService',
        action: 'saveStats',
        totalDistance: stats.distance,
        totalArea: stats.area,
        totalTime: stats.time,
      });

      const persistentData: PersistentStatsData = {
        totalStats: stats,
        lastUpdated: Date.now(),
        version: this.CURRENT_VERSION,
      };

      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(persistentData));

      logger.debug('Successfully saved persistent exploration stats', {
        component: 'StatsPersistenceService',
      });
    } catch (error) {
      logger.error('Failed to save persistent stats', {
        component: 'StatsPersistenceService',
        action: 'saveStats',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      });
      throw error; // Re-throw so caller can handle if needed
    }
  }

  /**
   * Clear all persistent statistics
   */
  static async clearStats(): Promise<void> {
    try {
      logger.info('Clearing persistent exploration stats', {
        component: 'StatsPersistenceService',
        action: 'clearStats',
      });

      await AsyncStorage.removeItem(this.STORAGE_KEY);

      // Clear any pending saves
      if (this.saveTimeout) {
        clearTimeout(this.saveTimeout);
        this.saveTimeout = null;
      }

      logger.debug('Successfully cleared persistent exploration stats', {
        component: 'StatsPersistenceService',
      });
    } catch (error) {
      logger.error('Failed to clear persistent stats', {
        component: 'StatsPersistenceService',
        action: 'clearStats',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
        errorType: error instanceof Error ? error.constructor.name : 'Unknown',
      });
      throw error;
    }
  }

  /**
   * Check if persistent data exists
   */
  static async hasPersistedStats(): Promise<boolean> {
    try {
      const rawData = await AsyncStorage.getItem(this.STORAGE_KEY);
      return rawData !== null;
    } catch (error) {
      logger.error('Failed to check for persisted stats', {
        component: 'StatsPersistenceService',
        action: 'hasPersistedStats',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      });
      return false;
    }
  }

  /**
   * Get metadata about persistent stats without loading the full data
   */
  static async getStatsMetadata(): Promise<{ lastUpdated: number; version: string } | null> {
    try {
      const rawData = await AsyncStorage.getItem(this.STORAGE_KEY);

      if (!rawData) {
        return null;
      }

      const parsedData: PersistentStatsData = JSON.parse(rawData);

      return {
        lastUpdated: parsedData.lastUpdated,
        version: parsedData.version,
      };
    } catch (error) {
      logger.error('Failed to get stats metadata', {
        component: 'StatsPersistenceService',
        action: 'getStatsMetadata',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      });
      return null;
    }
  }

  /**
   * Validate persistent data structure
   */
  private static isValidPersistentData(data: any): data is PersistentStatsData {
    return (
      data &&
      typeof data === 'object' &&
      data.totalStats &&
      typeof data.totalStats === 'object' &&
      typeof data.totalStats.distance === 'number' &&
      typeof data.totalStats.area === 'number' &&
      typeof data.totalStats.time === 'number' &&
      typeof data.lastUpdated === 'number' &&
      typeof data.version === 'string' &&
      data.totalStats.distance >= 0 &&
      data.totalStats.area >= 0 &&
      data.totalStats.time >= 0 &&
      data.lastUpdated > 0
    );
  }

  // Note: Migration logic removed for now - can be added back when needed

  /**
   * Export stats data for debugging or backup purposes
   */
  static async exportStatsData(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(this.STORAGE_KEY);
    } catch (error) {
      logger.error('Failed to export stats data', {
        component: 'StatsPersistenceService',
        action: 'exportStatsData',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      });
      return null;
    }
  }

  /**
   * Import stats data from backup
   */
  static async importStatsData(rawData: string): Promise<boolean> {
    try {
      const parsedData: PersistentStatsData = JSON.parse(rawData);

      if (!this.isValidPersistentData(parsedData)) {
        logger.warn('Invalid import data provided', {
          component: 'StatsPersistenceService',
          action: 'importStatsData',
        });
        return false;
      }

      await AsyncStorage.setItem(this.STORAGE_KEY, rawData);

      logger.info('Successfully imported stats data', {
        component: 'StatsPersistenceService',
        action: 'importStatsData',
      });

      return true;
    } catch (error) {
      logger.error('Failed to import stats data', {
        component: 'StatsPersistenceService',
        action: 'importStatsData',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      });
      return false;
    }
  }
}
