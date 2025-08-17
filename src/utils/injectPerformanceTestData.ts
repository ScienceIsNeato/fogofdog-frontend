import { store } from '../store';
import { updateLocation } from '../store/slices/explorationSlice';
import {
  TestPatterns,
  generatePerformanceTestData,
} from './performanceTestData';
import { logger } from './logger';

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
    // Clear the exploration state
    store.dispatch({ type: 'exploration/clearAllData' });
    logger.info('🧹 Cleared all GPS data for performance testing');
  }



  /**
   * Inject custom test data
   */
  async injectCustomData(
    count: number,
    pattern: keyof typeof TestPatterns = 'RANDOM_WALK',
    options?: {
      radiusKm?: number;
      intervalSeconds?: number;
      batchSize?: number;
      delayMs?: number;
    }
  ): Promise<void> {
    if (this.isInjecting) {
      logger.warn('Data injection already in progress');
      return;
    }

    this.isInjecting = true;

    try {
      const { batchSize = 100, delayMs = 10, ...generateOptions } = options ?? {};

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

      const dataOptions = {
        ...generateOptions,
        ...(startingLocation && { startingLocation }),
      };
      const points = generatePerformanceTestData(count, TestPatterns[pattern], dataOptions);

      logger.info(
        `🚀 Starting injection of ${count} custom points (${pattern}) from ${startingLocation ? 'current location' : 'default location'}...`
      );

      await this.injectPoints(points, 'custom', { batchSize, delayMs });

      logger.info(`✅ Successfully injected ${count} custom points`);
    } catch (error) {
      logger.error('Failed to inject custom data', error);
    } finally {
      this.isInjecting = false;
    }
  }

  /**
   * Inject points in batches to avoid blocking the UI
   */
  private async injectPoints(
    points: { latitude: number; longitude: number; timestamp: number }[],
    testName: string,
    options: { batchSize?: number; delayMs?: number } = {}
  ): Promise<void> {
    const { batchSize = 100, delayMs = 10 } = options;

    // Sort points by timestamp to maintain chronological order
    const sortedPoints = [...points].sort((a, b) => a.timestamp - b.timestamp);

    for (let i = 0; i < sortedPoints.length; i += batchSize) {
      const batch = sortedPoints.slice(i, i + batchSize);

      // Inject batch
      batch.forEach((point) => {
        store.dispatch(
          updateLocation({
            latitude: point.latitude,
            longitude: point.longitude,
            timestamp: point.timestamp,
          })
        );
      });

      // Progress logging
      const progress = Math.min(i + batchSize, sortedPoints.length);
      const percentage = ((progress / sortedPoints.length) * 100).toFixed(1);

      logger.debug(
        `📊 Injected ${progress}/${sortedPoints.length} points (${percentage}%) for ${testName}`
      );

      // Small delay to prevent UI blocking
      if (delayMs > 0 && i + batchSize < sortedPoints.length) {
        await new Promise((resolve) => setTimeout(resolve, delayMs));
      }
    }
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


