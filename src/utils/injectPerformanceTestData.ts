import { store } from '../store';
import { DeviceEventEmitter } from 'react-native';
import { TestPatterns, generatePerformanceTestData, TestPattern } from './performanceTestData';
import { logger } from './logger';
import { GeoPoint } from '../types/user';

/**
 * Inject performance test data into the app for interactive testing
 * This allows you to test the app with different amounts of GPS data
 */

export class PerformanceTestDataInjector {
  private static instance: PerformanceTestDataInjector;
  private isInjecting = false;

  static getInstance(): PerformanceTestDataInjector {
    if (!PerformanceTestDataInjector.instance) {
      PerformanceTestDataInjector.instance = new PerformanceTestDataInjector();
    }
    return PerformanceTestDataInjector.instance;
  }

  /**
   * Clear all existing GPS data
   */
  clearData(): void {
    // Clear the exploration state using the proper action
    store.dispatch({ type: 'exploration/clearAllData' });
    // Also clear stats state
    store.dispatch({ type: 'stats/resetAllStats' });
    logger.info('🧹 Cleared all GPS data for performance testing');
  }

  /**
   * Inject GPS data in real-time (current timestamps, proper intervals)
   * GPS beacon acts as the "head" of the worm - production-like behavior
   */
  async injectRealTimeData(
    count: number,
    pattern: keyof typeof TestPatterns = 'REALISTIC_DRIVE',
    options?: {
      radiusKm?: number;
      intervalMs?: number; // Real-time interval between injections
    }
  ): Promise<void> {
    if (this.isInjecting) {
      logger.warn('Data injection already in progress');
      return;
    }

    this.isInjecting = true;

    try {
      const { intervalMs = 1000, ...generateOptions } = options ?? {}; // 1 second between points

      // Get current location from store to start path from there
      const currentState = store.getState();
      const currentLocation = currentState.exploration.currentLocation;

      // Use current location as starting point if available
      const startingLocation = currentLocation
        ? {
            latitude: currentLocation.latitude,
            longitude: currentLocation.longitude,
          }
        : undefined;

      // Generate spatial path (coordinates only, timestamps will be assigned in real-time)
      const spatialPoints = this.generateSpatialPath(count, TestPatterns[pattern], {
        ...generateOptions,
        ...(startingLocation && { startingLocation }),
      });

      logger.info(
        `🎯 Starting REAL-TIME injection: ${count} points with ${intervalMs}ms intervals from ${startingLocation ? 'current location' : 'default location'}`
      );

      await this.injectRealTimePoints(spatialPoints, intervalMs);

      logger.info(
        `✅ Real-time injection complete: ${count} points over ${((count * intervalMs) / 1000 / 60).toFixed(1)} minutes`
      );
    } catch (error) {
      logger.error('Failed to inject real-time data', error);
    } finally {
      this.isInjecting = false;
    }
  }

  /**
   * Prepend historical GPS data to the beginning of the record
   * Creates a complete session with proper stats calculations
   */
  async prependHistoricalData(
    count: number,
    pattern: keyof typeof TestPatterns = 'REALISTIC_DRIVE',
    options?: {
      radiusKm?: number;
      sessionDurationHours?: number; // How long the historical session should span
    }
  ): Promise<void> {
    if (this.isInjecting) {
      logger.warn('Data injection already in progress');
      return;
    }

    this.isInjecting = true;

    try {
      const { sessionDurationHours = 2, ...generateOptions } = options ?? {};

      // Get current GPS history to find the starting point
      const currentState = store.getState();
      const currentPath = currentState.exploration.path;

      // Find the earliest point in current history, or use current location
      const earliestPoint =
        currentPath.length > 0
          ? currentPath.reduce(
              (earliest, point) => (point.timestamp < (earliest?.timestamp ?? Infinity) ? point : earliest),
              currentPath[0]
            )
          : currentState.exploration.currentLocation;

      if (!earliestPoint) {
        logger.warn('No existing GPS data or current location to prepend to');
        return;
      }

      // Generate historical path ending at the earliest existing point
      const historicalPoints = this.generateHistoricalPath(count, TestPatterns[pattern], {
        ...generateOptions,
        endingLocation: {
          latitude: earliestPoint.latitude,
          longitude: earliestPoint.longitude,
        },
        sessionDurationHours,
      });

      logger.info(
        `📚 Prepending HISTORICAL data: ${count} points spanning ${sessionDurationHours}h, ending at first existing GPS point`
      );

      await this.prependHistoricalPoints(historicalPoints);

      logger.info(`✅ Historical data prepended: ${count} points added as Session 0`);
    } catch (error) {
      logger.error('Failed to prepend historical data', error);
    } finally {
      this.isInjecting = false;
    }
  }

  /**
   * Generate spatial path (coordinates only, no timestamps)
   */
  private generateSpatialPath(
    count: number,
    pattern: TestPattern,
    options: { radiusKm?: number; startingLocation?: { latitude: number; longitude: number } }
  ): { latitude: number; longitude: number }[] {
    // Generate with dummy timestamps, we only care about coordinates
    const tempPoints = generatePerformanceTestData(count, pattern, {
      ...options,
      startTime: 0, // Dummy timestamp
      intervalSeconds: 1, // Dummy interval
    });

    return tempPoints.map((point) => ({
      latitude: point.latitude,
      longitude: point.longitude,
    }));
  }

  /**
   * Generate historical path with proper timestamps ending at a specific location
   */
  private generateHistoricalPath(
    count: number,
    pattern: TestPattern,
    options: {
      radiusKm?: number;
      endingLocation: { latitude: number; longitude: number };
      sessionDurationHours: number;
    }
  ): GeoPoint[] {
    const { endingLocation, sessionDurationHours, ...generateOptions } = options;

    // Calculate when the historical session should end (just before earliest existing point)
    const sessionEndTime = Date.now() - 60 * 1000; // End 1 minute ago to avoid conflicts
    const sessionStartTime = sessionEndTime - sessionDurationHours * 60 * 60 * 1000;
    const intervalMs = (sessionEndTime - sessionStartTime) / count;

    // Generate path that ends at the specified location
    const points = generatePerformanceTestData(count, pattern, {
      ...generateOptions,
      startingLocation: endingLocation, // Work backwards from ending location
      startTime: sessionStartTime,
      intervalSeconds: intervalMs / 1000,
    });

    // Reverse the path so it flows towards the ending location
    return points.reverse();
  }

  /**
   * Inject points in real-time with current timestamps
   */
  private async injectRealTimePoints(
    spatialPoints: { latitude: number; longitude: number }[],
    intervalMs: number
  ): Promise<void> {
    for (let i = 0; i < spatialPoints.length; i++) {
      const point = spatialPoints[i];
      if (!point) continue;

      // Inject with current timestamp (no timestamp specified = current time)
      DeviceEventEmitter.emit('GPS_COORDINATES_INJECTED', {
        latitude: point.latitude,
        longitude: point.longitude,
        // No timestamp = will use current time when processed
      });

      // Progress logging every 50 points
      if (i % 50 === 0 || i === spatialPoints.length - 1) {
        const progress = i + 1;
        const percentage = ((progress / spatialPoints.length) * 100).toFixed(1);

        logger.info(`📊 Real-time injection: ${progress}/${spatialPoints.length} (${percentage}%)`);
      }

      // Real-time delay between points (except for last point)
      if (i < spatialPoints.length - 1) {
        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }
  }

  /**
   * Prepend historical points directly to the exploration state
   */
  private async prependHistoricalPoints(historicalPoints: GeoPoint[]): Promise<void> {
    // Dispatch action to prepend historical data to exploration state
    store.dispatch({
      type: 'exploration/prependHistoricalData',
      payload: { historicalPoints },
    });

    // Reinitialize stats to include the new historical session
    const currentState = store.getState();
    const fullPath = currentState.exploration.path;

    store.dispatch({
      type: 'stats/initializeFromHistory',
      payload: { gpsHistory: fullPath },
    });

    logger.info(`📚 Historical data prepended and stats recalculated`, {
      component: 'PerformanceTestDataInjector',
      historicalPointsCount: historicalPoints.length,
      totalPathLength: fullPath.length,
    });
  }

  /**
   * Get current GPS data count
   */
  getCurrentDataCount(): number {
    const state = store.getState();
    return state.exploration.path.length;
  }
}

// Export singleton instance
export const performanceTestInjector = PerformanceTestDataInjector.getInstance();
