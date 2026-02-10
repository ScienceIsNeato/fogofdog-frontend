import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { DeviceEventEmitter } from 'react-native';
import { StoredLocationData } from './LocationStorageService';
import * as FileSystem from 'expo-file-system/legacy';

const GPS_INJECTION_KEY_ALT = '@fogofdog:gps_injection_data'; // External tools use this exact key
const GPS_INJECTION_EVENT = 'GPS_COORDINATES_INJECTED';

// Helper to get GPS injection file path (documentDirectory can be null on Android during early init)
function getGPSInjectionFilePath(): string | null {
  if (!FileSystem.documentDirectory) {
    return null;
  }
  return `${FileSystem.documentDirectory}gps-injection.json`;
}

export class GPSInjectionService {
  /**
   * Check for GPS injection data from file
   */
  private static async checkGPSInjectionFile(): Promise<string | null> {
    const filePath = getGPSInjectionFilePath();

    // documentDirectory not available yet (early Android init)
    if (!filePath) {
      logger.debug('📁 GPS injection file check skipped - documentDirectory not available', {
        component: 'GPSInjectionService',
        action: 'checkGPSInjectionFile',
      });
      return null;
    }

    try {
      logger.debug(`📁 Checking GPS injection file at: ${filePath}`, {
        component: 'GPSInjectionService',
        action: 'checkGPSInjectionFile',
        filePath,
      });

      const fileInfo = await FileSystem.getInfoAsync(filePath);
      logger.debug(`📁 File info result:`, {
        component: 'GPSInjectionService',
        action: 'checkGPSInjectionFile',
        exists: fileInfo.exists,
        fileInfo,
      });

      if (!fileInfo.exists) {
        return null;
      }

      const fileContent = await FileSystem.readAsStringAsync(filePath);
      const fileData = JSON.parse(fileContent);

      // GPS injector tool wraps coordinates in a structure, extract the coordinates array
      if (!fileData.coordinates || !Array.isArray(fileData.coordinates)) {
        return null;
      }

      // Delete the file after reading to prevent reprocessing
      await FileSystem.deleteAsync(filePath);

      logger.info('Found GPS injection file, processing coordinates', {
        component: 'GPSInjectionService',
        action: 'checkGPSInjectionFile',
        coordinateCount: fileData.coordinates.length,
      });

      return JSON.stringify(fileData.coordinates);
    } catch (fileError) {
      // File doesn't exist or can't be read - this is expected and not an error
      logger.debug('GPS injection file not found or unreadable', {
        component: 'GPSInjectionService',
        action: 'checkGPSInjectionFile',
        error: fileError instanceof Error ? fileError.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Simplified GPS injection - check for new coordinates and emit directly
   */
  static async checkAndProcessInjectedGPS(): Promise<StoredLocationData[]> {
    try {
      // First check AsyncStorage for injected GPS data
      let injectionDataString = await AsyncStorage.getItem(GPS_INJECTION_KEY_ALT);
      let dataSource = 'AsyncStorage';

      // If no AsyncStorage data, check the file created by GPS injector tool
      if (!injectionDataString) {
        injectionDataString = await this.checkGPSInjectionFile();
        if (injectionDataString) {
          dataSource = 'file';
        }
      }

      if (!injectionDataString) {
        return [];
      }

      logger.info(`Found GPS injection data from ${dataSource}`, {
        component: 'GPSInjectionService',
        action: 'checkAndProcessInjectedGPS',
        dataSource,
      });

      // Parse the coordinates
      const coordinates: StoredLocationData[] = JSON.parse(injectionDataString);

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
        logger.info(`🎯 Emitting GPS injection event ${index + 1}/${coordinates.length}`, {
          component: 'GPSInjectionService',
          action: 'checkAndProcessInjectedGPS',
          coordinate: `${coord.latitude}, ${coord.longitude}`,
          timestamp: new Date(coord.timestamp).toISOString(),
          event: GPS_INJECTION_EVENT,
        });

        DeviceEventEmitter.emit(GPS_INJECTION_EVENT, coord);

        logger.info(`✅ GPS injection event emitted for coordinate ${index + 1}`, {
          component: 'GPSInjectionService',
          action: 'checkAndProcessInjectedGPS',
        });
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
   * Check for GPS injection data once (event-driven, not polling)
   * This should be called when the app starts or when external tools trigger injection
   */
  static async checkForInjectionOnce(): Promise<StoredLocationData[]> {
    logger.info('Checking for GPS injection data (one-time check)', {
      component: 'GPSInjectionService',
      action: 'checkForInjectionOnce',
    });

    return await this.checkAndProcessInjectedGPS();
  }

  /**
   * @deprecated Use checkForInjectionOnce() instead
   * Periodic checking is a code smell - we should use event-driven architecture
   */
  static startPeriodicCheck(intervalMs: number = 5000): () => void {
    logger.warn('startPeriodicCheck is deprecated - use event-driven checkForInjectionOnce()', {
      component: 'GPSInjectionService',
      action: 'startPeriodicCheck',
      intervalMs,
    });

    const interval = setInterval(() => {
      this.checkAndProcessInjectedGPS();
    }, intervalMs);

    return () => {
      clearInterval(interval);
      logger.info('Stopped deprecated periodic GPS injection check', {
        component: 'GPSInjectionService',
        action: 'startPeriodicCheck',
      });
    };
  }
}
