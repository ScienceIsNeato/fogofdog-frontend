/**
 * LocationDataSourceService - Abstraction layer for GPS data sources
 *
 * This service provides a unified interface for obtaining GPS coordinates,
 * abstracting away the source (real GPS, file injection, or AsyncStorage injection).
 *
 * Priority order for getCurrentPosition:
 *   1. File-based injection (gps-injection.json in document directory)
 *   2. AsyncStorage injection (@fogofdog:gps_injection_data)
 *   3. Real GPS (expo-location)
 *
 * This allows development/testing to use mock GPS data while production uses real GPS.
 */

import * as Location from 'expo-location';
import * as FileSystem from 'expo-file-system';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { logger } from '../utils/logger';
import { GeoPoint } from '../types/user';

const GPS_INJECTION_KEY = '@fogofdog:gps_injection_data';
const GPS_INJECTION_FILE_PATH = `${FileSystem.documentDirectory}gps-injection.json`;

export type LocationDataSourceType = 'real-gps' | 'file-injection' | 'async-storage-injection';

export interface LocationResult {
  location: GeoPoint;
  source: LocationDataSourceType;
}

interface InjectionFileFormat {
  coordinates: {
    latitude: number;
    longitude: number;
    timestamp: number;
  }[];
}

export class LocationDataSourceService {
  private static currentSourceType: LocationDataSourceType = 'real-gps';
  private static injectedCoordinates: GeoPoint[] = [];
  private static currentCoordinateIndex = 0;

  /**
   * Get the current position from the best available source.
   *
   * Priority:
   *   1. File-based injection (for Maestro/integration tests)
   *   2. AsyncStorage injection (for external tools)
   *   3. Real GPS (production)
   *
   * @param options Options for GPS accuracy (used only for real GPS)
   */
  static async getCurrentPosition(options?: {
    accuracy?: Location.Accuracy;
    timeout?: number;
  }): Promise<LocationResult | null> {
    logger.info('📍 LocationDataSource: Getting current position', {
      component: 'LocationDataSourceService',
      action: 'getCurrentPosition',
    });

    // 1. Check for file-based injection
    const fileInjection = await this.checkFileInjection();
    if (fileInjection) {
      logger.info('📍 LocationDataSource: Using file injection', {
        component: 'LocationDataSourceService',
        source: 'file-injection',
        coordinate: `${fileInjection.latitude}, ${fileInjection.longitude}`,
      });
      return { location: fileInjection, source: 'file-injection' };
    }

    // 2. Check for AsyncStorage injection
    const asyncStorageInjection = await this.checkAsyncStorageInjection();
    if (asyncStorageInjection) {
      logger.info('📍 LocationDataSource: Using AsyncStorage injection', {
        component: 'LocationDataSourceService',
        source: 'async-storage-injection',
        coordinate: `${asyncStorageInjection.latitude}, ${asyncStorageInjection.longitude}`,
      });
      return { location: asyncStorageInjection, source: 'async-storage-injection' };
    }

    // 3. Fall back to real GPS
    const realGPS = await this.getRealGPSLocation(options);
    if (realGPS) {
      logger.info('📍 LocationDataSource: Using real GPS', {
        component: 'LocationDataSourceService',
        source: 'real-gps',
        coordinate: `${realGPS.latitude}, ${realGPS.longitude}`,
      });
      return { location: realGPS, source: 'real-gps' };
    }

    logger.warn('📍 LocationDataSource: No location source available', {
      component: 'LocationDataSourceService',
      action: 'getCurrentPosition',
    });
    return null;
  }

  /**
   * Check for GPS injection from a file.
   * Returns the first coordinate if available.
   */
  private static async checkFileInjection(): Promise<GeoPoint | null> {
    try {
      const fileInfo = await FileSystem.getInfoAsync(GPS_INJECTION_FILE_PATH);

      if (!fileInfo.exists) {
        logger.debug('📁 No GPS injection file found at document directory', {
          component: 'LocationDataSourceService',
          action: 'checkFileInjection',
          path: GPS_INJECTION_FILE_PATH,
        });
        return null;
      }

      const fileContent = await FileSystem.readAsStringAsync(GPS_INJECTION_FILE_PATH);
      const fileData: InjectionFileFormat = JSON.parse(fileContent);

      if (
        !fileData.coordinates ||
        !Array.isArray(fileData.coordinates) ||
        fileData.coordinates.length === 0
      ) {
        logger.warn('📁 GPS injection file has invalid or empty coordinates', {
          component: 'LocationDataSourceService',
          action: 'checkFileInjection',
        });
        return null;
      }

      // Store all coordinates for potential sequential access
      this.injectedCoordinates = fileData.coordinates.map((coord) => ({
        latitude: coord.latitude,
        longitude: coord.longitude,
        timestamp: coord.timestamp || Date.now(),
      }));
      this.currentSourceType = 'file-injection';

      // Return the first coordinate (or current index for sequential access)
      const currentCoord = this.injectedCoordinates[this.currentCoordinateIndex];
      if (!currentCoord) {
        return null;
      }

      logger.info('📁 GPS injection file found with coordinates', {
        component: 'LocationDataSourceService',
        action: 'checkFileInjection',
        coordinateCount: this.injectedCoordinates.length,
        currentIndex: this.currentCoordinateIndex,
      });

      return currentCoord;
    } catch (error) {
      logger.debug('📁 Error reading GPS injection file', {
        component: 'LocationDataSourceService',
        action: 'checkFileInjection',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Check for GPS injection from AsyncStorage.
   * Returns the first coordinate if available.
   */
  private static async checkAsyncStorageInjection(): Promise<GeoPoint | null> {
    try {
      const injectionData = await AsyncStorage.getItem(GPS_INJECTION_KEY);

      if (!injectionData) {
        return null;
      }

      const coordinates = JSON.parse(injectionData);

      if (!Array.isArray(coordinates) || coordinates.length === 0) {
        return null;
      }

      // Store all coordinates for potential sequential access
      this.injectedCoordinates = coordinates.map(
        (coord: { latitude: number; longitude: number; timestamp?: number }) => ({
          latitude: coord.latitude,
          longitude: coord.longitude,
          timestamp: coord.timestamp ?? Date.now(),
        })
      );
      this.currentSourceType = 'async-storage-injection';

      const currentCoord = this.injectedCoordinates[this.currentCoordinateIndex];
      if (!currentCoord) {
        return null;
      }

      logger.info('📦 AsyncStorage GPS injection found', {
        component: 'LocationDataSourceService',
        action: 'checkAsyncStorageInjection',
        coordinateCount: this.injectedCoordinates.length,
      });

      return currentCoord;
    } catch (error) {
      logger.debug('📦 Error reading AsyncStorage GPS injection', {
        component: 'LocationDataSourceService',
        action: 'checkAsyncStorageInjection',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      return null;
    }
  }

  /**
   * Get real GPS location using expo-location with retry logic.
   * Retries are essential for emulators/simulators where location may take time to initialize.
   * First tries getLastKnownPositionAsync (faster, can pick up mock locations),
   * then falls back to getCurrentPositionAsync if needed.
   */
  private static async getRealGPSLocation(options?: {
    accuracy?: Location.Accuracy;
    timeout?: number;
  }): Promise<GeoPoint | null> {
    const accuracy = options?.accuracy ?? Location.Accuracy.High;
    const maxRetries = 3;
    const baseDelayMs = 1000;

    // First, try getLastKnownPositionAsync - this is faster and can pick up
    // mock locations that are already set in the emulator
    try {
      logger.debug('🛰️ Checking last known position (for mock/cached location)', {
        component: 'LocationDataSourceService',
        action: 'getRealGPSLocation',
      });

      const lastKnown = await Location.getLastKnownPositionAsync();

      if (lastKnown) {
        logger.info('🛰️ Using last known position', {
          component: 'LocationDataSourceService',
          action: 'getRealGPSLocation',
          source: 'lastKnown',
          coordinate: `${lastKnown.coords.latitude}, ${lastKnown.coords.longitude}`,
        });

        this.currentSourceType = 'real-gps';
        return {
          latitude: lastKnown.coords.latitude,
          longitude: lastKnown.coords.longitude,
          timestamp: lastKnown.timestamp,
        };
      }
    } catch (error) {
      logger.debug('🛰️ Last known position not available, trying getCurrentPosition', {
        component: 'LocationDataSourceService',
        action: 'getRealGPSLocation',
        error: error instanceof Error ? error.message : 'Unknown error',
      });
    }

    // Fall back to getCurrentPositionAsync with retries
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        logger.debug(`🛰️ Requesting real GPS location (attempt ${attempt}/${maxRetries})`, {
          component: 'LocationDataSourceService',
          action: 'getRealGPSLocation',
          accuracy,
          attempt,
        });

        const location = await Location.getCurrentPositionAsync({
          accuracy,
        });

        this.currentSourceType = 'real-gps';

        logger.info(`🛰️ Real GPS location acquired on attempt ${attempt}`, {
          component: 'LocationDataSourceService',
          action: 'getRealGPSLocation',
          coordinate: `${location.coords.latitude}, ${location.coords.longitude}`,
        });

        return {
          latitude: location.coords.latitude,
          longitude: location.coords.longitude,
          timestamp: location.timestamp,
        };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : 'Unknown error';

        if (attempt < maxRetries) {
          const delay = baseDelayMs * attempt; // Linear backoff: 1s, 2s, 3s
          logger.warn(`🛰️ GPS attempt ${attempt} failed, retrying in ${delay}ms...`, {
            component: 'LocationDataSourceService',
            action: 'getRealGPSLocation',
            error: errorMessage,
            nextAttemptIn: delay,
          });

          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          logger.warn('🛰️ Real GPS location request failed after all retries', {
            component: 'LocationDataSourceService',
            action: 'getRealGPSLocation',
            error: errorMessage,
            totalAttempts: maxRetries,
          });
        }
      }
    }

    return null;
  }

  /**
   * Get the next coordinate from injection data (for simulating movement).
   * Only works when using file or AsyncStorage injection.
   */
  static getNextInjectedCoordinate(): GeoPoint | null {
    if (this.injectedCoordinates.length === 0) {
      return null;
    }

    this.currentCoordinateIndex =
      (this.currentCoordinateIndex + 1) % this.injectedCoordinates.length;
    return this.injectedCoordinates[this.currentCoordinateIndex] ?? null;
  }

  /**
   * Get the current data source type.
   */
  static getCurrentSourceType(): LocationDataSourceType {
    return this.currentSourceType;
  }

  /**
   * Check if we're using injected GPS (for UI indicators).
   */
  static isUsingInjectedGPS(): boolean {
    return this.currentSourceType !== 'real-gps';
  }

  /**
   * Reset the injection state (useful for testing).
   */
  static reset(): void {
    this.currentSourceType = 'real-gps';
    this.injectedCoordinates = [];
    this.currentCoordinateIndex = 0;
  }

  /**
   * Write GPS injection data to the file location.
   * This is useful for Maestro tests to inject GPS before app startup.
   */
  static async writeInjectionFile(coordinates: GeoPoint[]): Promise<boolean> {
    try {
      const fileData: InjectionFileFormat = {
        coordinates: coordinates.map((coord) => ({
          latitude: coord.latitude,
          longitude: coord.longitude,
          timestamp: coord.timestamp || Date.now(),
        })),
      };

      await FileSystem.writeAsStringAsync(
        GPS_INJECTION_FILE_PATH,
        JSON.stringify(fileData, null, 2)
      );

      logger.info('📁 GPS injection file written successfully', {
        component: 'LocationDataSourceService',
        action: 'writeInjectionFile',
        coordinateCount: coordinates.length,
        path: GPS_INJECTION_FILE_PATH,
      });

      return true;
    } catch (error) {
      logger.error('📁 Failed to write GPS injection file', error, {
        component: 'LocationDataSourceService',
        action: 'writeInjectionFile',
      });
      return false;
    }
  }

  /**
   * Clear injection data from both file and AsyncStorage.
   */
  static async clearInjectionData(): Promise<void> {
    try {
      // Clear file
      const fileInfo = await FileSystem.getInfoAsync(GPS_INJECTION_FILE_PATH);
      if (fileInfo.exists) {
        await FileSystem.deleteAsync(GPS_INJECTION_FILE_PATH);
      }

      // Clear AsyncStorage
      await AsyncStorage.removeItem(GPS_INJECTION_KEY);

      // Reset state
      this.reset();

      logger.info('🗑️ GPS injection data cleared', {
        component: 'LocationDataSourceService',
        action: 'clearInjectionData',
      });
    } catch (error) {
      logger.error('🗑️ Failed to clear GPS injection data', error, {
        component: 'LocationDataSourceService',
        action: 'clearInjectionData',
      });
    }
  }
}
