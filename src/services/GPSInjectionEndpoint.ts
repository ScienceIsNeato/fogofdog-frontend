import AsyncStorage from '@react-native-async-storage/async-storage';
import { StoredLocationData } from './LocationStorageService';
import { logger } from '../utils/logger';

/**
 * Development-only HTTP endpoint for GPS coordinate injection
 * Allows external tools to inject GPS coordinates directly into the app
 */
export class GPSInjectionEndpoint {
  private static server: any = null;

  /**
   * Start the GPS injection HTTP server (development only)
   */
  static async startServer(): Promise<void> {
    if (!__DEV__) {
      return; // Only run in development
    }

    try {
      // For React Native, we'll use the event-driven approach
      await this.startPollingForInjection();
    } catch (error) {
      logger.error('Failed to start GPS injection endpoint', error, {
        component: 'GPSInjectionEndpoint',
        action: 'startServer',
      });
    }
  }

  /**
   * Poll for GPS injection requests using a simple file-based approach
   */
  private static async startPollingForInjection(): Promise<void> {
    // This will be handled by the existing GPSInjectionService.processInjectedGPS()
    // which is called during app state changes
    logger.info('GPS injection polling started - will process via app state changes', {
      component: 'GPSInjectionEndpoint',
      action: 'startPollingForInjection',
    });
  }

  /**
   * Stop the GPS injection server
   */
  static stopServer(): void {
    if (this.server) {
      logger.info('GPS Injection endpoint stopped', {
        component: 'GPSInjectionEndpoint',
        action: 'stopServer',
      });
      this.server = null;
    }
  }

  /**
   * Inject GPS coordinates directly (for internal use)
   */
  static async injectCoordinates(coordinates: StoredLocationData[]): Promise<void> {
    try {
      // Convert to simple coordinates format for the simplified service
      const simpleCoords = coordinates.map((coord) => ({
        latitude: coord.latitude,
        longitude: coord.longitude,
      }));

      // Store in AsyncStorage for the simplified GPS injection service to pick up
      await AsyncStorage.setItem('@fogofdog:gps_injection_data', JSON.stringify(simpleCoords));
      logger.info(`Injected ${coordinates.length} GPS coordinates`, {
        component: 'GPSInjectionEndpoint',
        action: 'injectCoordinates',
        count: coordinates.length,
      });
    } catch (error) {
      logger.error('Failed to inject GPS coordinates', error, {
        component: 'GPSInjectionEndpoint',
        action: 'injectCoordinates',
      });
      throw error;
    }
  }
}
