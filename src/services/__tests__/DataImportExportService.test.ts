import { DataImportExportService, ExplorationExportData } from '../DataImportExportService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as FileSystem from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { GeoPoint } from '../../types/user';
import { StoredLocationData } from '../LocationStorageService';

// Mock the expo modules
jest.mock('expo-file-system');
jest.mock('expo-sharing');
jest.mock('expo-document-picker');
jest.mock('@react-native-async-storage/async-storage');

const mockFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;
const mockSharing = Sharing as jest.Mocked<typeof Sharing>;
const mockDocumentPicker = DocumentPicker as jest.Mocked<typeof DocumentPicker>;
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

describe('DataImportExportService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFileSystem.documentDirectory = '/mock/documents/';
    mockSharing.isAvailableAsync.mockResolvedValue(true);
  });

  describe('exportData', () => {
    it('should successfully export exploration data', async () => {
      const mockExplorationPath: GeoPoint[] = [
        { latitude: 40.7128, longitude: -74.006, timestamp: 1000 },
        { latitude: 40.7129, longitude: -74.0061, timestamp: 2000 },
      ];

      const mockBackgroundLocations: StoredLocationData[] = [
        { latitude: 40.713, longitude: -74.0062, timestamp: 3000, accuracy: 5 },
      ];

      // Mock AsyncStorage data
      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'persist:exploration') {
          return Promise.resolve(
            JSON.stringify({
              path: JSON.stringify(mockExplorationPath),
              exploredAreas: JSON.stringify([]),
            })
          );
        }
        if (key === 'background_locations') {
          return Promise.resolve(JSON.stringify(mockBackgroundLocations));
        }
        return Promise.resolve(null);
      });

      mockFileSystem.writeAsStringAsync.mockResolvedValue();
      mockSharing.shareAsync.mockResolvedValue({ action: 'shared' as const });

      const result = await DataImportExportService.exportData();

      expect(result.success).toBe(true);
      expect(result.filePath).toContain('fogofdog-exploration-data');
      expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
      expect(mockSharing.shareAsync).toHaveBeenCalled();
    });

    it('should fail when no data to export', async () => {
      mockAsyncStorage.getItem.mockResolvedValue(null);

      const result = await DataImportExportService.exportData();

      expect(result.success).toBe(false);
      expect(result.error).toBe('No exploration data to export');
    });

    it('should handle export errors gracefully', async () => {
      global.expectConsoleErrors = true; // We expect error logging in this test

      mockAsyncStorage.getItem.mockImplementation((key) => {
        if (key === 'persist:exploration') {
          return Promise.resolve(
            JSON.stringify({
              path: JSON.stringify([{ latitude: 40.7128, longitude: -74.006, timestamp: 1000 }]),
              exploredAreas: JSON.stringify([]),
            })
          );
        }
        return Promise.resolve(null);
      });

      mockFileSystem.writeAsStringAsync.mockRejectedValue(new Error('File write failed'));

      const result = await DataImportExportService.exportData();

      expect(result.success).toBe(false);
      expect(result.error).toBe('File write failed');
    });
  });

  describe('importData', () => {
    const validExportData: ExplorationExportData = {
      version: '1.0.0',
      exportDate: Date.now(),
      explorationPath: [{ latitude: 40.7128, longitude: -74.006, timestamp: 1000 }],
      exploredAreas: [],
      backgroundLocations: [
        { latitude: 40.713, longitude: -74.0062, timestamp: 3000, accuracy: 5 },
      ],
      metadata: {
        totalPoints: 2,
        dateRange: { earliest: 1000, latest: 3000 },
        exportSource: 'fogofdog-app',
      },
    };

    it('should successfully import valid exploration data', async () => {
      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [
          { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
        ],
      } as any);

      mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(validExportData));
      mockAsyncStorage.setItem.mockResolvedValue();

      const result = await DataImportExportService.importData();

      expect(result.success).toBe(true);
      expect(result.pointsImported).toBe(2);
      expect(mockAsyncStorage.setItem).toHaveBeenCalledTimes(2); // exploration state + background locations
    });

    it('should handle cancelled import', async () => {
      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: true,
      } as any);

      const result = await DataImportExportService.importData();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Import cancelled by user');
    });

    it('should reject invalid import data', async () => {
      const invalidData = { invalid: 'data' };

      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [
          { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
        ],
      } as any);

      mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

      const result = await DataImportExportService.importData();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Invalid or corrupted exploration data file');
    });

    it('should handle file read errors', async () => {
      global.expectConsoleErrors = true; // We expect error logging in this test

      mockDocumentPicker.getDocumentAsync.mockResolvedValue({
        canceled: false,
        assets: [
          { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
        ],
      } as any);

      mockFileSystem.readAsStringAsync.mockRejectedValue(new Error('File read failed'));

      const result = await DataImportExportService.importData();

      expect(result.success).toBe(false);
      expect(result.error).toBe('File read failed');
    });
  });

  describe('data validation', () => {
    it('should validate valid GeoPoint', () => {
      const validPoint = { latitude: 40.7128, longitude: -74.006, timestamp: 1000 };

      // Access private method through type assertion for testing
      const isValid = (DataImportExportService as any).isValidGeoPoint(validPoint);
      expect(isValid).toBe(true);
    });

    it('should reject invalid GeoPoint', () => {
      const invalidPoints = [
        { latitude: 'invalid', longitude: -74.006, timestamp: 1000 },
        { latitude: 91, longitude: -74.006, timestamp: 1000 }, // latitude out of range
        { latitude: 40.7128, longitude: 181, timestamp: 1000 }, // longitude out of range
        { latitude: 40.7128, longitude: -74.006, timestamp: -1 }, // invalid timestamp
        { latitude: 40.7128, longitude: -74.006 }, // missing timestamp
      ];

      invalidPoints.forEach((point) => {
        const isValid = (DataImportExportService as any).isValidGeoPoint(point);
        expect(isValid).toBe(false);
      });
    });

    it('should validate complete export data structure', () => {
      const validData: ExplorationExportData = {
        version: '1.0.0',
        exportDate: Date.now(),
        explorationPath: [{ latitude: 40.7128, longitude: -74.006, timestamp: 1000 }],
        exploredAreas: [],
        backgroundLocations: [],
        metadata: {
          totalPoints: 1,
          dateRange: { earliest: 1000, latest: 1000 },
          exportSource: 'fogofdog-app',
        },
      };

      const isValid = (DataImportExportService as any).isValidExportData(validData);
      expect(isValid).toBe(true);
    });

    it('should reject invalid export data structure', () => {
      const invalidData = {
        version: '1.0.0',
        // missing required fields
      };

      const isValid = (DataImportExportService as any).isValidExportData(invalidData);
      expect(isValid).toBe(false);
    });
  });
});
