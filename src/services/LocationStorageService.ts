import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeoPoint } from '../types/user';
import { logger } from '../utils/logger';

export interface StoredLocationData {
  latitude: number;
  longitude: number;
  timestamp: number;
  accuracy?: number;
}

const BACKGROUND_LOCATIONS_KEY = 'background_locations';

export class LocationStorageService {
  /**
   * Store a location point from background tracking
   */
  static async storeBackgroundLocation(location: StoredLocationData): Promise<void> {
    try {
      const existingData = await this.getStoredBackgroundLocations();
      const updatedData = [...existingData, location];

      await AsyncStorage.setItem(BACKGROUND_LOCATIONS_KEY, JSON.stringify(updatedData));

      logger.info(`Stored background location: ${location.latitude}, ${location.longitude}`, {
        component: 'LocationStorageService',
        action: 'storeBackgroundLocation',
        timestamp: location.timestamp,
      });
    } catch (error) {
      logger.error('Failed to store background location', error, {
        component: 'LocationStorageService',
        action: 'storeBackgroundLocation',
      });
    }
  }

  /**
   * Get all stored background locations
   */
  static async getStoredBackgroundLocations(): Promise<StoredLocationData[]> {
    try {
      const data = await AsyncStorage.getItem(BACKGROUND_LOCATIONS_KEY);
      if (!data) {
        return [];
      }

      const locations = JSON.parse(data) as StoredLocationData[];
      return Array.isArray(locations) ? locations : [];
    } catch (error) {
      logger.error('Failed to retrieve stored background locations', error, {
        component: 'LocationStorageService',
        action: 'getStoredBackgroundLocations',
      });
      return [];
    }
  }

  /**
   * Clear all stored background locations (called after successful Redux update)
   */
  static async clearStoredBackgroundLocations(): Promise<void> {
    try {
      await AsyncStorage.removeItem(BACKGROUND_LOCATIONS_KEY);
      logger.info('Cleared stored background locations', {
        component: 'LocationStorageService',
        action: 'clearStoredBackgroundLocations',
      });
    } catch (error) {
      logger.error('Failed to clear stored background locations', error, {
        component: 'LocationStorageService',
        action: 'clearStoredBackgroundLocations',
      });
    }
  }

  /**
   * Get count of stored background locations
   */
  static async getStoredLocationCount(): Promise<number> {
    try {
      const locations = await this.getStoredBackgroundLocations();
      return locations.length;
    } catch (error) {
      logger.error('Failed to get stored location count', error, {
        component: 'LocationStorageService',
        action: 'getStoredLocationCount',
      });
      return 0;
    }
  }

  /**
   * Convert stored location data to GeoPoint format for Redux
   */
  static convertToGeoPoints(locations: StoredLocationData[]): GeoPoint[] {
    return locations.map((location) => ({
      latitude: location.latitude,
      longitude: location.longitude,
      timestamp: location.timestamp,
    }));
  }
}
