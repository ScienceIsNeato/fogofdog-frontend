import { logger } from '../utils/logger';
import { store } from '../store';
import { updateLocation } from '../store/slices/explorationSlice';
import { DeviceEventEmitter } from 'react-native';

/**
 * Development-only API for GPS coordinate injection
 * Allows external tools to inject GPS coordinates directly into the app
 * Uses DeviceEventEmitter for internal communication
 */
export class GPSInjectionEndpoint {
  private static isListening = false;
  private static relativeMovementSubscription: { remove(): void } | null = null;

  /**
   * Start listening for GPS injection commands (development only)
   */
  static async startServer(): Promise<void> {
    if (!__DEV__ || this.isListening) {
      return;
    }

    try {
      // Listen for relative GPS movement commands via DeviceEventEmitter
      this.relativeMovementSubscription = DeviceEventEmitter.addListener(
        'GPS_INJECT_RELATIVE',
        this.handleRelativeMovement
      );

      this.isListening = true;
      logger.info('GPS injection API started - listening for relative movement commands', {
        component: 'GPSInjectionEndpoint',
        action: 'startServer',
      });
    } catch (error) {
      logger.error('Failed to start GPS injection API', error, {
        component: 'GPSInjectionEndpoint',
        action: 'startServer',
      });
    }
  }

  /**
   * Stop the GPS injection API
   */
  static stopServer(): void {
    if (this.isListening) {
      this.relativeMovementSubscription?.remove();
      this.relativeMovementSubscription = null;
      this.isListening = false;
      logger.info('GPS injection API stopped', {
        component: 'GPSInjectionEndpoint',
        action: 'stopServer',
      });
    }
  }

  /**
   * Handle relative GPS movement commands
   */
  private static readonly handleRelativeMovement = (data: {
    angle: number;
    distance: number;
  }): string => {
    try {
      const { angle, distance } = data;

      // Get current location from Redux store
      const currentState = store.getState();
      const currentLocation = currentState.exploration.currentLocation;

      if (!currentLocation) {
        const message = 'No current location available for relative movement';
        logger.warn(message, {
          component: 'GPSInjectionEndpoint',
          action: 'handleRelativeMovement',
        });
        return message;
      }

      // Calculate new coordinates
      const newCoords = this.calculateRelativeCoordinates(
        currentLocation.latitude,
        currentLocation.longitude,
        angle,
        distance
      );

      // Create GPS event and inject directly into Redux
      const gpsEvent = {
        latitude: newCoords.latitude,
        longitude: newCoords.longitude,
        timestamp: Date.now(),
      };

      // Dispatch directly to Redux store
      store.dispatch(updateLocation(gpsEvent));

      const message = `Moved ${distance}m at ${angle}° from ${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)} to ${newCoords.latitude.toFixed(6)}, ${newCoords.longitude.toFixed(6)}`;

      logger.info(`Injected relative GPS movement: ${distance}m at ${angle}°`, {
        component: 'GPSInjectionEndpoint',
        action: 'handleRelativeMovement',
        from: `${currentLocation.latitude.toFixed(6)}, ${currentLocation.longitude.toFixed(6)}`,
        to: `${newCoords.latitude.toFixed(6)}, ${newCoords.longitude.toFixed(6)}`,
        angle,
        distance,
      });

      return message;
    } catch (error) {
      const message = `Failed to handle relative GPS movement: ${error instanceof Error ? error.message : 'Unknown error'}`;
      logger.error(message, error, {
        component: 'GPSInjectionEndpoint',
        action: 'handleRelativeMovement',
      });
      return message;
    }
  };

  /**
   * Calculate new coordinates based on angle and distance from current position
   */
  private static calculateRelativeCoordinates(
    currentLat: number,
    currentLon: number,
    angleDegrees: number,
    distanceMeters: number
  ): { latitude: number; longitude: number } {
    const METERS_PER_DEGREE_LAT = 111320;
    const angleRad = (angleDegrees * Math.PI) / 180;

    // Calculate latitude delta
    const deltaLat = (distanceMeters * Math.sin(angleRad)) / METERS_PER_DEGREE_LAT;

    // Calculate longitude delta (adjust for latitude)
    const metersPerDegreeLon = METERS_PER_DEGREE_LAT * Math.cos((currentLat * Math.PI) / 180);
    const deltaLon = (distanceMeters * Math.cos(angleRad)) / metersPerDegreeLon;

    return {
      latitude: currentLat + deltaLat,
      longitude: currentLon + deltaLon,
    };
  }

  /**
   * Public API for external tools to inject relative movement
   */
  static injectRelativeMovement(angle: number, distance: number): void {
    if (!__DEV__) {
      return;
    }

    logger.info('Injecting relative GPS movement', {
      component: 'GPSInjectionEndpoint',
      action: 'injectRelativeMovement',
      angle,
      distance,
    });

    DeviceEventEmitter.emit('GPS_INJECT_RELATIVE', { angle, distance });
  }
}
