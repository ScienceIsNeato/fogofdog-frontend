import { store } from '../store';
import { updateLocation } from '../store/slices/explorationSlice';
import {
  TestDatasets,
  TestPatterns,
  generatePerformanceTestData,
  describeDataset,
} from './performanceTestData';
import { logger } from './logger';

// Re-export for external use
export { TestDatasets, describeDataset };

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
   * Inject a predefined dataset
   */
  async injectDataset(datasetName: keyof typeof TestDatasets): Promise<void> {
    if (this.isInjecting) {
      logger.warn('Data injection already in progress');
      return;
    }

    this.isInjecting = true;

    try {
      const dataset = TestDatasets[datasetName]();
      const description = describeDataset(datasetName);

      logger.info(`🚀 Starting injection of ${description}...`);

      await this.injectPoints(dataset, datasetName);

      logger.info(`✅ Successfully injected ${description}`);
    } catch (error) {
      logger.error('Failed to inject dataset', error);
    } finally {
      this.isInjecting = false;
    }
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

  /**
   * Performance test helper - measure rendering performance
   */
  measureRenderingPerformance(): Promise<{ avgFrameTime: number; fps: number }> {
    return new Promise((resolve) => {
      const frameTimes: number[] = [];
      let lastTime = performance.now();
      let frameCount = 0;
      const maxFrames = 60; // Measure for 60 frames

      const measureFrame = () => {
        const currentTime = performance.now();
        const frameTime = currentTime - lastTime;
        frameTimes.push(frameTime);
        lastTime = currentTime;
        frameCount++;

        if (frameCount < maxFrames) {
          requestAnimationFrame(measureFrame);
        } else {
          const avgFrameTime = frameTimes.reduce((sum, time) => sum + time, 0) / frameTimes.length;
          const fps = 1000 / avgFrameTime;

          logger.info(
            `📊 Rendering performance: ${avgFrameTime.toFixed(2)}ms avg frame time, ${fps.toFixed(1)} FPS`
          );
          resolve({ avgFrameTime, fps });
        }
      };

      requestAnimationFrame(measureFrame);
    });
  }
}

// Export singleton instance
export const performanceTestInjector = PerformanceTestDataInjector.getInstance();

// Global helpers for easy access in development
if (__DEV__) {
  // Make available globally for easy console access
  (global as any).performanceTest = {
    // Quick dataset injection
    inject: {
      minimal: () => performanceTestInjector.injectDataset('minimal'),
      veryLight: () => performanceTestInjector.injectDataset('veryLight'),
      light: () => performanceTestInjector.injectDataset('light'),
      medium: () => performanceTestInjector.injectDataset('medium'),
      heavy: () => performanceTestInjector.injectDataset('heavy'),
      veryHeavy: () => performanceTestInjector.injectDataset('veryHeavy'),
      extreme: () => performanceTestInjector.injectDataset('extreme'),
      maximum: () => performanceTestInjector.injectDataset('maximum'),
      stressTest: () => performanceTestInjector.injectDataset('stressTest'),
    },

    // Custom injection
    custom: (count: number, pattern?: keyof typeof TestPatterns) =>
      performanceTestInjector.injectCustomData(count, pattern),

    // Utilities
    clear: () => performanceTestInjector.clearData(),
    count: () => performanceTestInjector.getCurrentDataCount(),
    measure: () => performanceTestInjector.measureRenderingPerformance(),

    // Helper to show available commands
    help: () => {
      logger.info(`
🧪 Performance Test Helper Commands:

📊 Quick Dataset Injection:
  performanceTest.inject.minimal()     - 1 point
  performanceTest.inject.veryLight()   - 10 points  
  performanceTest.inject.light()       - 100 points
  performanceTest.inject.medium()      - 500 points
  performanceTest.inject.heavy()       - 1000 points
  performanceTest.inject.veryHeavy()   - 2500 points
  performanceTest.inject.extreme()     - 5000 points
  performanceTest.inject.maximum()     - 10000 points
  performanceTest.inject.stressTest()  - 25000 points

🎯 Custom Injection:
  performanceTest.custom(count, pattern)
  
  Patterns: 'RANDOM_WALK', 'CIRCULAR_PATH', 'GRID_PATTERN', 
           'REALISTIC_DRIVE', 'HIKING_TRAIL', 'SINGLE_POINT'

🛠️  Utilities:
  performanceTest.clear()    - Clear all GPS data
  performanceTest.count()    - Get current point count
  performanceTest.measure()  - Measure rendering performance
  performanceTest.help()     - Show this help

Example usage:
  performanceTest.clear()
  performanceTest.inject.heavy()  // Inject 1000 points
  performanceTest.measure()       // Check performance
      `);
    },
  };

  logger.info('Performance test helpers loaded');
}
