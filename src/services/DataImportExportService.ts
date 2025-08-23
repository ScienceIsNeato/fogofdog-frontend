import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { GeoPoint } from '../types/user';
import { StoredLocationData } from './LocationStorageService';
import { logger } from '../utils/logger';

const UNKNOWN_ERROR_MESSAGE = 'Unknown error';

/**
 * Complete exploration data structure for import/export
 */
export interface ExplorationExportData {
  version: string;
  exportDate: number; // Unix timestamp
  explorationPath: GeoPoint[];
  exploredAreas: GeoPoint[];
  backgroundLocations: StoredLocationData[];
  metadata: {
    totalPoints: number;
    dateRange: {
      earliest: number;
      latest: number;
    };
    exportSource: 'fogofdog-app';
  };
}

/**
 * Service for importing and exporting GPS exploration data
 * Handles save/load operations for complete exploration history
 */
export class DataImportExportService {
  private static readonly CURRENT_VERSION = '1.0.0';
  private static readonly EXPORT_FILENAME_PREFIX = 'fogofdog-exploration-data';

  /**
   * Export all exploration data to a file
   */
  static async exportData(): Promise<{ success: boolean; filePath?: string; error?: string }> {
    try {
      logger.info('Starting exploration data export', {
        component: 'DataImportExportService',
        action: 'exportData',
      });

      // Gather all exploration data
      const explorationData = await this.gatherExplorationData();

      if (explorationData.totalPoints === 0) {
        return {
          success: false,
          error: 'No exploration data to export',
        };
      }

      // Create export data structure
      const exportData: ExplorationExportData = {
        version: this.CURRENT_VERSION,
        exportDate: Date.now(),
        explorationPath: explorationData.explorationPath,
        exploredAreas: explorationData.exploredAreas,
        backgroundLocations: explorationData.backgroundLocations,
        metadata: {
          totalPoints: explorationData.totalPoints,
          dateRange: explorationData.dateRange,
          exportSource: 'fogofdog-app',
        },
      };

      // Generate filename with timestamp
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
      const filename = `${this.EXPORT_FILENAME_PREFIX}-${timestamp}.json`;
      const filePath = `${FileSystem.documentDirectory}${filename}`;

      // Write to file
      await FileSystem.writeAsStringAsync(filePath, JSON.stringify(exportData, null, 2));

      // Share the file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: 'Export Exploration Data',
        });
      }

      logger.info('Successfully exported exploration data', {
        component: 'DataImportExportService',
        action: 'exportData',
        filename,
        totalPoints: explorationData.totalPoints,
      });

      return {
        success: true,
        filePath,
      };
    } catch (error) {
      logger.error('Failed to export exploration data', {
        component: 'DataImportExportService',
        action: 'exportData',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      };
    }
  }

  /**
   * Import exploration data from a file
   */
  static async importData(): Promise<{
    success: boolean;
    data?: ExplorationExportData;
    error?: string;
    pointsImported?: number;
  }> {
    try {
      logger.info('Starting exploration data import', {
        component: 'DataImportExportService',
        action: 'importData',
      });

      // Pick a file
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
        copyToCacheDirectory: true,
      });

      if (result.canceled) {
        return {
          success: false,
          error: 'Import cancelled by user',
        };
      }

      // Read file content
      const fileContent = await FileSystem.readAsStringAsync(result.assets[0].uri);
      const importData: ExplorationExportData = JSON.parse(fileContent);

      // Validate the import data
      if (!this.isValidExportData(importData)) {
        return {
          success: false,
          error: 'Invalid or corrupted exploration data file',
        };
      }

      // Store the imported data
      await this.storeImportedData(importData);

      logger.info('Successfully imported exploration data', {
        component: 'DataImportExportService',
        action: 'importData',
        pointsImported: importData.metadata.totalPoints,
        version: importData.version,
      });

      return {
        success: true,
        data: importData,
        pointsImported: importData.metadata.totalPoints,
      };
    } catch (error) {
      logger.error('Failed to import exploration data', {
        component: 'DataImportExportService',
        action: 'importData',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      };
    }
  }

  /**
   * Gather all exploration data from various storage locations
   */
  private static async gatherExplorationData(): Promise<{
    explorationPath: GeoPoint[];
    exploredAreas: GeoPoint[];
    backgroundLocations: StoredLocationData[];
    totalPoints: number;
    dateRange: { earliest: number; latest: number };
  }> {
    try {
      // Get data from Redux store state (via AsyncStorage)
      const explorationStateData = await AsyncStorage.getItem('persist:exploration');
      let explorationPath: GeoPoint[] = [];
      let exploredAreas: GeoPoint[] = [];

      if (explorationStateData) {
        const parsedState = JSON.parse(explorationStateData);
        if (parsedState.path) {
          explorationPath = JSON.parse(parsedState.path);
        }
        if (parsedState.exploredAreas) {
          exploredAreas = JSON.parse(parsedState.exploredAreas);
        }
      }

      // Get background locations
      const backgroundLocationsData = await AsyncStorage.getItem('background_locations');
      let backgroundLocations: StoredLocationData[] = [];
      if (backgroundLocationsData) {
        backgroundLocations = JSON.parse(backgroundLocationsData);
      }

      // Calculate metadata
      const allPoints = [...explorationPath, ...backgroundLocations];
      const totalPoints = allPoints.length;

      let dateRange = { earliest: Date.now(), latest: 0 };
      if (totalPoints > 0) {
        const timestamps = allPoints.map((p) => p.timestamp);
        dateRange = {
          earliest: Math.min(...timestamps),
          latest: Math.max(...timestamps),
        };
      }

      return {
        explorationPath,
        exploredAreas,
        backgroundLocations,
        totalPoints,
        dateRange,
      };
    } catch (error) {
      logger.error('Failed to gather exploration data', {
        component: 'DataImportExportService',
        action: 'gatherExplorationData',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      });

      return {
        explorationPath: [],
        exploredAreas: [],
        backgroundLocations: [],
        totalPoints: 0,
        dateRange: { earliest: 0, latest: 0 },
      };
    }
  }

  /**
   * Store imported data back to the appropriate storage locations
   */
  private static async storeImportedData(importData: ExplorationExportData): Promise<void> {
    try {
      // Store exploration path and explored areas back to Redux persistence
      const explorationState = {
        path: JSON.stringify(importData.explorationPath),
        exploredAreas: JSON.stringify(importData.exploredAreas),
      };

      await AsyncStorage.setItem('persist:exploration', JSON.stringify(explorationState));

      // Store background locations
      await AsyncStorage.setItem(
        'background_locations',
        JSON.stringify(importData.backgroundLocations)
      );

      logger.info('Successfully stored imported exploration data', {
        component: 'DataImportExportService',
        action: 'storeImportedData',
        pathPoints: importData.explorationPath.length,
        exploredAreas: importData.exploredAreas.length,
        backgroundLocations: importData.backgroundLocations.length,
      });
    } catch (error) {
      logger.error('Failed to store imported data', {
        component: 'DataImportExportService',
        action: 'storeImportedData',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      });
      throw error;
    }
  }

  /**
   * Validate the structure of imported exploration data
   */
  private static isValidExportData(data: any): data is ExplorationExportData {
    try {
      return (
        data &&
        typeof data === 'object' &&
        typeof data.version === 'string' &&
        typeof data.exportDate === 'number' &&
        Array.isArray(data.explorationPath) &&
        Array.isArray(data.exploredAreas) &&
        Array.isArray(data.backgroundLocations) &&
        data.metadata &&
        typeof data.metadata === 'object' &&
        typeof data.metadata.totalPoints === 'number' &&
        typeof data.metadata.exportSource === 'string' &&
        data.metadata.dateRange &&
        typeof data.metadata.dateRange.earliest === 'number' &&
        typeof data.metadata.dateRange.latest === 'number' &&
        data.explorationPath.every((point: any) => this.isValidGeoPoint(point)) &&
        data.exploredAreas.every((point: any) => this.isValidGeoPoint(point)) &&
        data.backgroundLocations.every((point: any) => this.isValidStoredLocation(point))
      );
    } catch (error) {
      logger.warn('Error validating export data structure', {
        component: 'DataImportExportService',
        action: 'isValidExportData',
        errorMessage: error instanceof Error ? error.message : UNKNOWN_ERROR_MESSAGE,
      });
      return false;
    }
  }

  /**
   * Validate a GeoPoint structure
   */
  private static isValidGeoPoint(point: any): point is GeoPoint {
    return (
      point &&
      typeof point === 'object' &&
      typeof point.latitude === 'number' &&
      typeof point.longitude === 'number' &&
      typeof point.timestamp === 'number' &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Number.isFinite(point.timestamp) &&
      point.latitude >= -90 &&
      point.latitude <= 90 &&
      point.longitude >= -180 &&
      point.longitude <= 180 &&
      point.timestamp > 0
    );
  }

  /**
   * Validate a StoredLocationData structure
   */
  private static isValidStoredLocation(point: any): point is StoredLocationData {
    return (
      point &&
      typeof point === 'object' &&
      typeof point.latitude === 'number' &&
      typeof point.longitude === 'number' &&
      typeof point.timestamp === 'number' &&
      Number.isFinite(point.latitude) &&
      Number.isFinite(point.longitude) &&
      Number.isFinite(point.timestamp) &&
      point.latitude >= -90 &&
      point.latitude <= 90 &&
      point.longitude >= -180 &&
      point.longitude <= 180 &&
      point.timestamp > 0 &&
      (point.accuracy === undefined || typeof point.accuracy === 'number')
    );
  }
}
