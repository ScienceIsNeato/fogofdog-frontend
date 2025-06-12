import AsyncStorage from '@react-native-async-storage/async-storage';
import { StoredLocationData } from './LocationStorageService';
import { CoordinateDeduplicationService } from './CoordinateDeduplicationService';
import { logger } from '../utils/logger';
import { DeviceEventEmitter } from 'react-native';

interface GPSInjectionData {
  coordinates: StoredLocationData[];
  processed: boolean;
  injectedAt: string;
}

const GPS_INJECTION_KEY = 'gps_injection_data';
const GPS_INJECTION_KEY_ALT = '@fogofdog:gps_injection_data'; // External tools use this exact key
const GPS_INJECTION_EVENT = 'GPS_COORDINATES_INJECTED';

export class GPSInjectionService {
  /**
   * Retrieve GPS injection data string from AsyncStorage
   */
  private static async retrieveInjectionDataString(): Promise<{
    data: string | null;
    source: string;
  }> {
    // First try AsyncStorage (for internal app usage)
    let injectionDataString = await AsyncStorage.getItem(GPS_INJECTION_KEY);
    let dataSource = 'AsyncStorage';

    // If not found in AsyncStorage, try the alternative key (external tools)
    if (!injectionDataString) {
      try {
        injectionDataString = await AsyncStorage.getItem(GPS_INJECTION_KEY_ALT);
        dataSource = 'AsyncStorage Alt Key';
      } catch (_error) {
        // Silent fail for external tool detection
      }
    }

    return { data: injectionDataString, source: dataSource };
  }

  /**
   * Parse GPS injection data from string (base64 or JSON)
   */
  private static parseInjectionData(dataString: string): GPSInjectionData {
    try {
      // Try base64 decode first
      const decodedString = atob(dataString);
      const parsed = JSON.parse(decodedString);
      logger.debug('Decoded base64 GPS injection data', {
        component: 'GPSInjectionService',
        action: 'parseInjectionData',
      });
      return parsed;
    } catch (_base64Error) {
      // Fallback to direct JSON parse
      const parsed = JSON.parse(dataString);
      logger.debug('Using direct JSON GPS injection data', {
        component: 'GPSInjectionService',
        action: 'parseInjectionData',
      });
      return parsed;
    }
  }

  /**
   * Mark injection data as processed and save back to storage
   */
  private static async markAsProcessed(injectionData: GPSInjectionData): Promise<void> {
    injectionData.processed = true;
    await AsyncStorage.setItem(GPS_INJECTION_KEY, JSON.stringify(injectionData));
  }

  /**
   * Check if there's GPS injection data and process it
   * This integrates GPS injection with the existing background location flow
   */
  static async processInjectedGPS(): Promise<StoredLocationData[]> {
    try {
      const { data: injectionDataString, source: dataSource } =
        await this.retrieveInjectionDataString();

      if (!injectionDataString) {
        return [];
      }

      logger.debug('Found GPS injection data', {
        component: 'GPSInjectionService',
        action: 'processInjectedGPS',
        source: dataSource,
        length: injectionDataString.length,
      });

      const injectionData = this.parseInjectionData(injectionDataString);

      if (injectionData.processed) {
        return [];
      }

      logger.debug('Processing injected coordinates', {
        component: 'GPSInjectionService',
        action: 'processInjectedGPS',
        count: injectionData.coordinates.length,
        coordinates: injectionData.coordinates.map(
          (c) => `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}`
        ),
        injectedAt: injectionData.injectedAt,
      });

      // Apply deduplication to injected coordinates
      const processedCoordinates: StoredLocationData[] = [];
      let skippedCount = 0;

      for (const coordinate of injectionData.coordinates) {
        const deduplicationResult =
          CoordinateDeduplicationService.shouldProcessCoordinate(coordinate);

        if (deduplicationResult.shouldProcess) {
          processedCoordinates.push(coordinate);
        } else {
          skippedCount++;
          // Log already handled by CoordinateDeduplicationService
        }
      }

      await this.markAsProcessed(injectionData);

      logger.info(
        `🧪 GPS injection: ${processedCoordinates.length} processed, ${skippedCount} skipped (duplicates)`,
        {
          component: 'GPSInjectionService',
          action: 'processInjectedGPS',
          totalReceived: injectionData.coordinates.length,
          processed: processedCoordinates.length,
          skipped: skippedCount,
          injectedAt: injectionData.injectedAt,
        }
      );

      return processedCoordinates;
    } catch (error) {
      logger.error('Failed to process GPS injection', error, {
        component: 'GPSInjectionService',
        action: 'processInjectedGPS',
      });
      return [];
    }
  }

  /**
   * Clear processed GPS injection data (cleanup)
   */
  static async clearProcessedInjections(): Promise<void> {
    try {
      const injectionDataString = await AsyncStorage.getItem(GPS_INJECTION_KEY);
      if (injectionDataString) {
        const injectionData: GPSInjectionData = JSON.parse(injectionDataString);

        if (injectionData.processed) {
          await AsyncStorage.removeItem(GPS_INJECTION_KEY);
          logger.info('Cleared processed GPS injection data', {
            component: 'GPSInjectionService',
            action: 'clearProcessedInjections',
          });
        }
      }
    } catch (error) {
      logger.error('Failed to clear GPS injection data', error, {
        component: 'GPSInjectionService',
        action: 'clearProcessedInjections',
      });
    }
  }

  /**
   * Get the status of GPS injection for debugging
   */
  static async getInjectionStatus(): Promise<{
    hasInjectionData: boolean;
    isProcessed?: boolean;
    coordinateCount?: number;
    injectedAt?: string;
  }> {
    try {
      const injectionDataString = await AsyncStorage.getItem(GPS_INJECTION_KEY);
      if (!injectionDataString) {
        return { hasInjectionData: false };
      }

      const injectionData: GPSInjectionData = JSON.parse(injectionDataString);

      return {
        hasInjectionData: true,
        isProcessed: injectionData.processed,
        coordinateCount: injectionData.coordinates.length,
        injectedAt: injectionData.injectedAt,
      };
    } catch (error) {
      logger.error('Failed to get GPS injection status', error, {
        component: 'GPSInjectionService',
        action: 'getInjectionStatus',
      });
      return { hasInjectionData: false };
    }
  }

  /**
   * Store GPS injection data and immediately trigger processing (used by the injection tool)
   */
  static async storeInjectionData(coordinates: StoredLocationData[]): Promise<void> {
    try {
      const injectionData: GPSInjectionData = {
        coordinates,
        processed: false,
        injectedAt: new Date().toISOString(),
      };

      await AsyncStorage.setItem(GPS_INJECTION_KEY, JSON.stringify(injectionData));

      logger.debug('Stored injection data', {
        component: 'GPSInjectionService',
        action: 'storeInjectionData',
        count: coordinates.length,
        coordinates: coordinates.map((c) => `${c.latitude.toFixed(6)}, ${c.longitude.toFixed(6)}`),
      });

      logger.info(`🧪 Stored GPS injection data with ${coordinates.length} coordinates`, {
        component: 'GPSInjectionService',
        action: 'storeInjectionData',
        count: coordinates.length,
      });

      // Immediately emit event to trigger processing
      DeviceEventEmitter.emit(GPS_INJECTION_EVENT, coordinates);
      logger.debug('Event emitted for immediate processing', {
        component: 'GPSInjectionService',
        action: 'storeInjectionData',
      });
    } catch (error) {
      logger.error('Failed to store GPS injection data', error, {
        component: 'GPSInjectionService',
        action: 'storeInjectionData',
      });
      throw error;
    }
  }

  /**
   * Subscribe to GPS injection events for immediate processing
   */
  static subscribeToInjections(callback: (coordinates: StoredLocationData[]) => void) {
    const subscription = DeviceEventEmitter.addListener(GPS_INJECTION_EVENT, callback);

    logger.info('Subscribed to GPS injection events', {
      component: 'GPSInjectionService',
      action: 'subscribeToInjections',
    });

    return () => {
      subscription.remove();
      logger.info('Unsubscribed from GPS injection events', {
        component: 'GPSInjectionService',
        action: 'subscribeToInjections cleanup',
      });
    };
  }
}
