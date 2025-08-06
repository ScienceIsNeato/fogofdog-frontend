import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { DeviceEventEmitter } from 'react-native';
import { StoredLocationData } from './LocationStorageService';
import * as FileSystem from 'expo-file-system';

const GPS_INJECTION_KEY_ALT = '@fogofdog:gps_injection_data'; // External tools use this exact key
const GPS_INJECTION_EVENT = 'GPS_COORDINATES_INJECTED';
// GPS injection file is created in project root, but app runs in sandbox
// We need to copy it to a location the app can access or use a different approach
const GPS_INJECTION_FILE_PATH = `${FileSystem.documentDirectory}gps-injection.json`;

export class GPSInjectionService {
  /**
   * Check for GPS injection data from file
   */
  private static async checkGPSInjectionFile(): Promise<string | null> {
    try {
      logger.debug(`📁 Checking GPS injection file at: ${GPS_INJECTION_FILE_PATH}`, {
        component: 'GPSInjectionService',
        action: 'checkGPSInjectionFile',
        filePath: GPS_INJECTION_FILE_PATH,
      });
      
      const fileInfo = await FileSystem.getInfoAsync(GPS_INJECTION_FILE_PATH);
      logger.debug(`📁 File info result:`, {
        component: 'GPSInjectionService',
        action: 'checkGPSInjectionFile',
        exists: fileInfo.exists,
        fileInfo,
      });
      
      if (!fileInfo.exists) {
        return null;
      }

      const fileContent = await FileSystem.readAsStringAsync(GPS_INJECTION_FILE_PATH);
      const fileData = JSON.parse(fileContent);
      
      // GPS injector tool wraps coordinates in a structure, extract the coordinates array
      if (!fileData.coordinates || !Array.isArray(fileData.coordinates)) {
        return null;
      }

      // Delete the file after reading to prevent reprocessing
      await FileSystem.deleteAsync(GPS_INJECTION_FILE_PATH);
      
      logger.info('Found GPS injection file, processing coordinates', {
        component: 'GPSInjectionService',
        action: 'checkGPSInjectionFile',
        coordinateCount: fileData.coordinates.length,
      });

      return JSON.stringify(fileData.coordinates);
    } catch (fileError) {
      // File doesn't exist or can't be read
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
