import { store } from '../store';
import { clearRecentData, clearAllData } from '../store/slices/explorationSlice';
import { LocationStorageService } from './LocationStorageService';
import { AuthPersistenceService } from './AuthPersistenceService';
import { logger } from '../utils/logger';
import { DataStats, TimeRange } from '../types/dataClear';

const DEFAULT_TIME_RANGE_HOURS = 24;

export class DataClearingService {
  /**
   * Clear exploration data by time range
   */
  static async clearDataByTimeRange(startTime: number, endTime?: number): Promise<void> {
    try {
      logger.info('Clearing data by time range', {
        component: 'DataClearingService',
        action: 'clearDataByTimeRange',
        startTime: new Date(startTime).toISOString(),
        endTime: endTime ? new Date(endTime).toISOString() : 'present',
      });

      // Clear stored locations within time range
      const timeRange: TimeRange = { startTime };
      if (endTime !== undefined) {
        timeRange.endTime = endTime;
      }
      await this.clearStoredLocations(timeRange);

      // Update Redux state
      const hoursBack = endTime
        ? Math.round((endTime - startTime) / (1000 * 60 * 60))
        : DEFAULT_TIME_RANGE_HOURS;
      store.dispatch(clearRecentData(hoursBack));

      // Update persisted exploration state
      await this.updatePersistedState();

      logger.info('Successfully cleared data by time range', {
        component: 'DataClearingService',
        action: 'clearDataByTimeRange',
        hoursCleared: hoursBack,
      });
    } catch (error) {
      logger.error('Failed to clear data by time range', error, {
        component: 'DataClearingService',
        action: 'clearDataByTimeRange',
      });
      throw error;
    }
  }

  /**
   * Clear all exploration data
   */
  static async clearAllData(): Promise<void> {
    try {
      logger.info('Clearing all exploration data', {
        component: 'DataClearingService',
        action: 'clearAllData',
      });

      // Clear all stored locations
      await this.clearStoredLocations();

      // Clear background location data
      await this.clearBackgroundData();

      // Update Redux state
      store.dispatch(clearAllData());

      // Update persisted exploration state
      await this.updatePersistedState();

      logger.info('Successfully cleared all exploration data', {
        component: 'DataClearingService',
        action: 'clearAllData',
      });
    } catch (error) {
      logger.error('Failed to clear all exploration data', error, {
        component: 'DataClearingService',
        action: 'clearAllData',
      });
      throw error;
    }
  }

  /**
   * Get data statistics
   */
  static async getDataStats(): Promise<DataStats> {
    try {
      const explorationState = store.getState().exploration;
      const storedLocations = await LocationStorageService.getStoredBackgroundLocations();

      const allPoints = [
        ...explorationState.path,
        ...explorationState.exploredAreas,
        ...storedLocations.map((loc) => ({ latitude: loc.latitude, longitude: loc.longitude })),
      ];

      const now = Date.now();
      const twentyFourHoursAgo = now - 24 * 60 * 60 * 1000;

      // Calculate recent points (last 24 hours)
      const recentStoredPoints = storedLocations.filter(
        (loc) => loc.timestamp > twentyFourHoursAgo
      );

      // Find oldest and newest dates
      const timestamps = storedLocations.map((loc) => loc.timestamp).filter(Boolean);
      const oldestDate = timestamps.length > 0 ? new Date(Math.min(...timestamps)) : null;
      const newestDate = timestamps.length > 0 ? new Date(Math.max(...timestamps)) : null;

      const stats: DataStats = {
        totalPoints: allPoints.length,
        recentPoints: recentStoredPoints.length,
        oldestDate,
        newestDate,
      };

      logger.info('Retrieved data statistics', {
        component: 'DataClearingService',
        action: 'getDataStats',
        stats,
      });

      return stats;
    } catch (error) {
      logger.error('Failed to get data statistics', error, {
        component: 'DataClearingService',
        action: 'getDataStats',
      });
      return {
        totalPoints: 0,
        recentPoints: 0,
        oldestDate: null,
        newestDate: null,
      };
    }
  }

  /**
   * Clear stored locations from LocationStorageService
   */
  static async clearStoredLocations(timeRange?: TimeRange): Promise<void> {
    try {
      if (!timeRange) {
        // Clear all stored locations
        await LocationStorageService.clearStoredBackgroundLocations();
        return;
      }

      // Clear locations within time range
      const storedLocations = await LocationStorageService.getStoredBackgroundLocations();
      const filteredLocations = storedLocations.filter((location) => {
        return (
          location.timestamp < timeRange.startTime ||
          (timeRange.endTime && location.timestamp > timeRange.endTime)
        );
      });

      // Clear all and restore filtered locations
      await LocationStorageService.clearStoredBackgroundLocations();

      // Re-store the locations that should be kept
      for (const location of filteredLocations) {
        await LocationStorageService.storeBackgroundLocation(location);
      }

      logger.info('Cleared stored locations by time range', {
        component: 'DataClearingService',
        action: 'clearStoredLocations',
        originalCount: storedLocations.length,
        remainingCount: filteredLocations.length,
      });
    } catch (error) {
      logger.error('Failed to clear stored locations', error, {
        component: 'DataClearingService',
        action: 'clearStoredLocations',
      });
      throw error;
    }
  }

  /**
   * Clear background location data
   */
  static async clearBackgroundData(timeRange?: TimeRange): Promise<void> {
    try {
      // For now, this delegates to clearStoredLocations since background data
      // is stored via LocationStorageService
      await this.clearStoredLocations(timeRange);

      logger.info('Cleared background location data', {
        component: 'DataClearingService',
        action: 'clearBackgroundData',
        timeRange,
      });
    } catch (error) {
      logger.error('Failed to clear background data', error, {
        component: 'DataClearingService',
        action: 'clearBackgroundData',
      });
      throw error;
    }
  }

  /**
   * Update persisted exploration state after clearing
   */
  private static async updatePersistedState(): Promise<void> {
    try {
      const currentState = store.getState().exploration;
      await AuthPersistenceService.saveExplorationState(currentState);

      logger.info('Updated persisted exploration state after clearing', {
        component: 'DataClearingService',
        action: 'updatePersistedState',
      });
    } catch (error) {
      logger.error('Failed to update persisted state', error, {
        component: 'DataClearingService',
        action: 'updatePersistedState',
      });
      // Don't throw here - clearing was successful even if persistence failed
    }
  }
}
