import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { DeviceEventEmitter } from 'react-native';

interface SimpleCoordinate {
  latitude: number;
  longitude: number;
}

const GPS_INJECTION_KEY_ALT = '@fogofdog:gps_injection_data'; // External tools use this exact key
const GPS_INJECTION_EVENT = 'GPS_COORDINATES_INJECTED';

export class GPSInjectionService {
  /**
   * Simplified GPS injection - check for new coordinates and emit directly
   */
  static async checkAndProcessInjectedGPS(): Promise<SimpleCoordinate[]> {
    try {
      // Check for injected GPS data from command line tools
      const injectionDataString = await AsyncStorage.getItem(GPS_INJECTION_KEY_ALT);

      if (!injectionDataString) {
        return [];
      }

      logger.info('Found GPS injection data', {
        component: 'GPSInjectionService',
        action: 'checkAndProcessInjectedGPS',
      });

      // Parse the coordinates
      const coordinates: SimpleCoordinate[] = JSON.parse(injectionDataString);

      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        logger.warn('Invalid GPS injection data format', {
          component: 'GPSInjectionService',
          action: 'checkAndProcessInjectedGPS',
        });
        return [];
      }

      // Clear the data so it doesn't get processed again
      await AsyncStorage.removeItem(GPS_INJECTION_KEY_ALT);

      // Emit each coordinate directly to the unified location system
      coordinates.forEach((coord, index) => {
        setTimeout(() => {
          logger.info(`Injecting GPS coordinate ${index + 1}/${coordinates.length}`, {
            component: 'GPSInjectionService',
            action: 'checkAndProcessInjectedGPS',
            coordinate: `${coord.latitude}, ${coord.longitude}`,
          });

          DeviceEventEmitter.emit(GPS_INJECTION_EVENT, coord);
        }, index * 100); // Small delay between coordinates
      });

      return coordinates;
    } catch (error) {
      logger.error('Error processing injected GPS data', error, {
        component: 'GPSInjectionService',
        action: 'checkAndProcessInjectedGPS',
      });
      return [];
    }
  }

  /**
   * Start periodic checking for injected GPS coordinates
   */
  static startPeriodicCheck(intervalMs: number = 5000): () => void {
    const interval = setInterval(() => {
      this.checkAndProcessInjectedGPS();
    }, intervalMs);

    logger.info('Started periodic GPS injection check', {
      component: 'GPSInjectionService',
      action: 'startPeriodicCheck',
      intervalMs,
    });

    return () => {
      clearInterval(interval);
      logger.info('Stopped periodic GPS injection check', {
        component: 'GPSInjectionService',
        action: 'startPeriodicCheck',
      });
    };
  }
}
