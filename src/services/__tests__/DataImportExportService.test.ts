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

// Mock the store and related services (used by jest.mock calls below)

jest.mock('../../store', () => ({
  store: {
    getState: jest.fn(),
    dispatch: jest.fn(),
  },
}));

jest.mock('../../store/slices/explorationSlice', () => ({
  addPathPoint: jest.fn(() => ({ type: 'exploration/addPathPoint' })),
  clearAllData: jest.fn(() => ({ type: 'exploration/clearAllData' })),
}));

jest.mock('../../store/slices/statsSlice', () => ({
  initializeFromHistory: jest.fn(() => ({ type: 'stats/initializeFromHistory' })),
}));

jest.mock('../StatsPersistenceService', () => ({
  StatsPersistenceService: {
    saveStatsImmediate: jest.fn().mockResolvedValue(undefined),
  },
}));

const mockFileSystem = FileSystem as jest.Mocked<typeof FileSystem>;
const mockSharing = Sharing as jest.Mocked<typeof Sharing>;
const mockDocumentPicker = DocumentPicker as jest.Mocked<typeof DocumentPicker>;
const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

// Get references to the mocked modules
const { store: mockedStore } = jest.requireMock('../../store');
const mockedExplorationSlice = jest.requireMock('../../store/slices/explorationSlice');
const mockedStatsSlice = jest.requireMock('../../store/slices/statsSlice');
const { StatsPersistenceService: mockedStatsPersistenceService } = jest.requireMock(
  '../StatsPersistenceService'
);

describe('DataImportExportService - Comprehensive Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    (mockFileSystem as any).documentDirectory = '/mock/documents/';
    mockSharing.isAvailableAsync.mockResolvedValue(true);

    // Reset store state to default
    mockedStore.getState.mockReturnValue({
      exploration: { path: [], exploredAreas: [] },
      stats: { total: { distance: 0, area: 0, time: 0 } },
    });
  });

  describe('Export Tests', () => {
    describe('Happy Path', () => {
      it('should successfully export exploration data with all components', async () => {
        const mockExplorationPath: GeoPoint[] = [
          { latitude: 40.7128, longitude: -74.006, timestamp: 1000 },
          { latitude: 40.7129, longitude: -74.0061, timestamp: 2000 },
        ];
        const mockExploredAreas: GeoPoint[] = [
          { latitude: 40.7128, longitude: -74.006, timestamp: 1000 },
        ];
        const mockBackgroundLocations: StoredLocationData[] = [
          { latitude: 40.7128, longitude: -74.006, timestamp: 1000, accuracy: 10 },
        ];

        mockedStore.getState.mockReturnValue({
          exploration: { path: mockExplorationPath, exploredAreas: mockExploredAreas },
          stats: { total: { distance: 100, area: 50, time: 30 } },
        });
        mockAsyncStorage.getItem.mockResolvedValue(JSON.stringify(mockBackgroundLocations));
        mockFileSystem.writeAsStringAsync.mockResolvedValue();
        mockSharing.shareAsync.mockResolvedValue({} as any);

        const result = await DataImportExportService.exportData();

        expect(result.success).toBe(true);
        expect(result.filePath).toContain('fogofdog-exploration-data');
        expect(mockFileSystem.writeAsStringAsync).toHaveBeenCalled();
        expect(mockSharing.shareAsync).toHaveBeenCalled();
      });

      it('should generate proper filename with timestamp format', async () => {
        const mockDate = new Date('2024-01-15T10:30:45.123Z');
        jest.useFakeTimers();
        jest.setSystemTime(mockDate);

        mockedStore.getState.mockReturnValue({
          exploration: {
            path: [{ latitude: 40.7128, longitude: -74.006, timestamp: 1000 }],
            exploredAreas: [],
          },
          stats: { total: { distance: 100, area: 50, time: 30 } },
        });
        mockAsyncStorage.getItem.mockResolvedValue('[]');
        mockFileSystem.writeAsStringAsync.mockResolvedValue();
        mockSharing.shareAsync.mockResolvedValue({} as any);

        const result = await DataImportExportService.exportData();

        expect(result.success).toBe(true);
        expect(result.filePath).toContain('fogofdog-exploration-data-2024-01-15T10-30-45');

        jest.useRealTimers();
      });

      it('should create valid export data structure with correct metadata', async () => {
        const mockPath: GeoPoint[] = [
          { latitude: 40.7128, longitude: -74.006, timestamp: 1000 },
          { latitude: 40.7129, longitude: -74.0061, timestamp: 3000 },
        ];

        mockedStore.getState.mockReturnValue({
          exploration: { path: mockPath, exploredAreas: [] },
          stats: { total: { distance: 100, area: 50, time: 30 } },
        });
        mockAsyncStorage.getItem.mockResolvedValue('[]');
        mockFileSystem.writeAsStringAsync.mockResolvedValue();
        mockSharing.shareAsync.mockResolvedValue({} as any);

        await DataImportExportService.exportData();

        const writeCall = mockFileSystem.writeAsStringAsync.mock.calls[0];
        expect(writeCall).toBeDefined();
        const exportedData = JSON.parse(writeCall![1]);

        expect(exportedData).toMatchObject({
          version: '1.0.0',
          exportDate: expect.any(Number),
          explorationPath: mockPath,
          exploredAreas: [],
          backgroundLocations: [],
          metadata: {
            totalPoints: 2,
            dateRange: { earliest: 1000, latest: 3000 },
            exportSource: 'fogofdog-app',
          },
        });
      });
    });

    describe('Export Failure Cases', () => {
      it('should fail when no data to export', async () => {
        mockedStore.getState.mockReturnValue({
          exploration: { path: [], exploredAreas: [] },
          stats: { total: { distance: 0, area: 0, time: 0 } },
        });
        mockAsyncStorage.getItem.mockResolvedValue('[]');

        const result = await DataImportExportService.exportData();

        expect(result.success).toBe(false);
        expect(result.error).toBe('No exploration data to export');
      });

      it('should handle FileSystem write failure gracefully', async () => {
        global.expectConsoleErrors = true;

        mockedStore.getState.mockReturnValue({
          exploration: {
            path: [{ latitude: 40.7128, longitude: -74.006, timestamp: 1000 }],
            exploredAreas: [],
          },
          stats: { total: { distance: 100, area: 50, time: 30 } },
        });
        mockAsyncStorage.getItem.mockResolvedValue('[]');
        mockFileSystem.writeAsStringAsync.mockRejectedValue(new Error('Disk full'));

        const result = await DataImportExportService.exportData();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Disk full');
      });

      it('should handle sharing service unavailable', async () => {
        mockedStore.getState.mockReturnValue({
          exploration: {
            path: [{ latitude: 40.7128, longitude: -74.006, timestamp: 1000 }],
            exploredAreas: [],
          },
          stats: { total: { distance: 100, area: 50, time: 30 } },
        });
        mockAsyncStorage.getItem.mockResolvedValue('[]');
        mockFileSystem.writeAsStringAsync.mockResolvedValue();
        mockSharing.isAvailableAsync.mockResolvedValue(false);

        const result = await DataImportExportService.exportData();

        expect(result.success).toBe(true); // Export still succeeds
        expect(mockSharing.shareAsync).not.toHaveBeenCalled();
      });

      it('should handle sharing service failure', async () => {
        global.expectConsoleErrors = true;

        mockedStore.getState.mockReturnValue({
          exploration: {
            path: [{ latitude: 40.7128, longitude: -74.006, timestamp: 1000 }],
            exploredAreas: [],
          },
          stats: { total: { distance: 100, area: 50, time: 30 } },
        });
        mockAsyncStorage.getItem.mockResolvedValue('[]');
        mockFileSystem.writeAsStringAsync.mockResolvedValue();
        mockSharing.shareAsync.mockRejectedValue(new Error('Share failed'));

        const result = await DataImportExportService.exportData();

        expect(result.success).toBe(false); // Export fails if sharing fails
        expect(result.error).toBe('Share failed');
      });

      it('should handle AsyncStorage read failure during data gathering', async () => {
        global.expectConsoleErrors = true;

        mockedStore.getState.mockReturnValue({
          exploration: {
            path: [{ latitude: 40.7128, longitude: -74.006, timestamp: 1000 }],
            exploredAreas: [],
          },
          stats: { total: { distance: 100, area: 50, time: 30 } },
        });
        mockAsyncStorage.getItem.mockRejectedValue(new Error('Storage error'));

        const result = await DataImportExportService.exportData();

        expect(result.success).toBe(false);
        expect(result.error).toBe('No exploration data to export');
      });
    });
  });

  describe('Import Tests', () => {
    const validExportData: ExplorationExportData = {
      version: '1.0.0',
      exportDate: Date.now(),
      explorationPath: [
        { latitude: 40.7128, longitude: -74.006, timestamp: 1000 },
        { latitude: 40.7129, longitude: -74.0061, timestamp: 2000 },
      ],
      exploredAreas: [{ latitude: 40.7128, longitude: -74.006, timestamp: 1000 }],
      backgroundLocations: [
        { latitude: 40.7128, longitude: -74.006, timestamp: 1000, accuracy: 10 },
      ],
      metadata: {
        totalPoints: 2,
        dateRange: { earliest: 1000, latest: 2000 },
        exportSource: 'fogofdog-app',
      },
    };

    describe('Happy Path', () => {
      it('should successfully import in merge mode', async () => {
        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [
            { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
          ],
        } as any);
        mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(validExportData));
        mockAsyncStorage.getItem.mockResolvedValue('[]'); // For existing background locations
        mockAsyncStorage.setItem.mockResolvedValue(); // For storing merged data
        mockedStore.getState.mockReturnValue({
          exploration: { path: validExportData.explorationPath, exploredAreas: [] },
          stats: { total: { distance: 0, area: 0, time: 0 } },
        });

        const result = await DataImportExportService.importData(false);

        expect(result.success).toBe(true);
        expect(result.pointsImported).toBe(2);
        expect(mockedStore.dispatch).toHaveBeenCalled();
      });

      it('should successfully import in replace mode', async () => {
        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [
            { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
          ],
        } as any);
        mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(validExportData));
        mockAsyncStorage.setItem.mockResolvedValue(); // For storing replaced data
        mockAsyncStorage.getItem.mockResolvedValue(
          JSON.stringify(validExportData.backgroundLocations)
        ); // For stats recalc
        mockedStore.getState.mockReturnValue({
          exploration: { path: validExportData.explorationPath, exploredAreas: [] },
          stats: { total: { distance: 0, area: 0, time: 0 } },
        });

        const result = await DataImportExportService.importData(true);

        expect(result.success).toBe(true);
        expect(result.pointsImported).toBe(2);
        expect(mockedStore.dispatch).toHaveBeenCalledWith(mockedExplorationSlice.clearAllData());
      });

      it('should trigger stats recalculation after successful import', async () => {
        mockedStore.getState.mockReturnValue({
          exploration: { path: validExportData.explorationPath, exploredAreas: [] },
          stats: { total: { distance: 0, area: 0, time: 0 } },
        });
        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [
            { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
          ],
        } as any);
        mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(validExportData));
        mockAsyncStorage.setItem.mockResolvedValue();
        mockAsyncStorage.getItem.mockResolvedValue(
          JSON.stringify(validExportData.backgroundLocations)
        );

        await DataImportExportService.importData(false);

        expect(mockedStore.dispatch).toHaveBeenCalledWith(
          mockedStatsSlice.initializeFromHistory(expect.any(Array))
        );
        expect(mockedStatsPersistenceService.saveStatsImmediate).toHaveBeenCalled();
      });

      it('should handle empty data import successfully', async () => {
        const emptyData: ExplorationExportData = {
          ...validExportData,
          explorationPath: [],
          exploredAreas: [],
          backgroundLocations: [],
          metadata: { ...validExportData.metadata, totalPoints: 0 },
        };

        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [
            { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
          ],
        } as any);
        mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(emptyData));
        mockAsyncStorage.setItem.mockResolvedValue();

        const result = await DataImportExportService.importData(false);

        expect(result.success).toBe(true);
        expect(result.pointsImported).toBe(0);
      });
    });

    describe('Import Cancellation', () => {
      it('should handle user cancelling file picker', async () => {
        mockDocumentPicker.getDocumentAsync.mockResolvedValue({ canceled: true } as any);

        const result = await DataImportExportService.importData();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Import cancelled by user');
      });
    });

    describe('File System Errors', () => {
      it('should handle file read failure', async () => {
        global.expectConsoleErrors = true;

        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [
            { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
          ],
        } as any);
        mockFileSystem.readAsStringAsync.mockRejectedValue(new Error('File not found'));

        const result = await DataImportExportService.importData();

        expect(result.success).toBe(false);
        expect(result.error).toBe('File not found');
      });

      it('should handle invalid file URI', async () => {
        global.expectConsoleErrors = true;

        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [{ uri: '', name: 'test.json', size: 1000, mimeType: 'application/json' }],
        } as any);
        mockFileSystem.readAsStringAsync.mockRejectedValue(new Error('Invalid URI'));

        const result = await DataImportExportService.importData();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Invalid URI');
      });

      it('should handle AsyncStorage write failure during import', async () => {
        global.expectConsoleErrors = true;

        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [
            { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
          ],
        } as any);
        mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(validExportData));
        mockAsyncStorage.getItem.mockResolvedValue('[]'); // For existing data read
        mockAsyncStorage.setItem.mockRejectedValue(new Error('Storage full'));

        const result = await DataImportExportService.importData();

        expect(result.success).toBe(false);
        expect(result.error).toBe('Storage full');
      });
    });

    describe('Data Validation Tests', () => {
      describe('JSON Structure Validation', () => {
        it('should reject invalid JSON format', async () => {
          global.expectConsoleErrors = true;

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue('invalid json {');

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toContain('Unexpected');
        });

        it('should reject empty object', async () => {
          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue('{}');

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });

        it('should reject data missing version field', async () => {
          const invalidData = { ...validExportData };
          delete (invalidData as any).version;

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });

        it('should reject data missing explorationPath field', async () => {
          const invalidData = { ...validExportData };
          delete (invalidData as any).explorationPath;

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });

        it('should reject data with invalid field types', async () => {
          const invalidData = {
            ...validExportData,
            version: 123, // Should be string
            exportDate: 'invalid', // Should be number
          };

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });
      });

      describe('GeoPoint Validation', () => {
        it('should reject invalid latitude range', async () => {
          const invalidData = {
            ...validExportData,
            explorationPath: [{ latitude: 91, longitude: -74.006, timestamp: 1000 }], // lat > 90
          };

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });

        it('should reject invalid longitude range', async () => {
          const invalidData = {
            ...validExportData,
            explorationPath: [{ latitude: 40.7128, longitude: -181, timestamp: 1000 }], // lon < -180
          };

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });

        it('should reject non-numeric coordinates', async () => {
          const invalidData = {
            ...validExportData,
            explorationPath: [{ latitude: 'invalid', longitude: -74.006, timestamp: 1000 }],
          };

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });

        it('should reject missing timestamp', async () => {
          const invalidData = {
            ...validExportData,
            explorationPath: [{ latitude: 40.7128, longitude: -74.006 }], // Missing timestamp
          };

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });

        it('should reject invalid timestamp', async () => {
          const invalidData = {
            ...validExportData,
            explorationPath: [{ latitude: 40.7128, longitude: -74.006, timestamp: 'invalid' }],
          };

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });
      });

      describe('Metadata Validation', () => {
        it('should reject invalid totalPoints', async () => {
          const invalidData = {
            ...validExportData,
            metadata: { ...validExportData.metadata, totalPoints: 'invalid' },
          };

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });

        it('should reject invalid dateRange', async () => {
          const invalidData = {
            ...validExportData,
            metadata: {
              ...validExportData.metadata,
              dateRange: { earliest: 'invalid', latest: 2000 },
            },
          };

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });

        it('should reject invalid exportSource', async () => {
          const invalidData = {
            ...validExportData,
            metadata: { ...validExportData.metadata, exportSource: 123 },
          };

          mockDocumentPicker.getDocumentAsync.mockResolvedValue({
            canceled: false,
            assets: [
              {
                uri: '/mock/file.json',
                name: 'test.json',
                size: 1000,
                mimeType: 'application/json',
              },
            ],
          } as any);
          mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(invalidData));

          const result = await DataImportExportService.importData();

          expect(result.success).toBe(false);
          expect(result.error).toBe('Invalid or corrupted exploration data file');
        });
      });
    });

    describe('Edge Cases', () => {
      it('should handle future timestamps', async () => {
        const futureTimestamp = 1640995200000 + 86400000; // Tomorrow from a fixed date
        const futureData = {
          ...validExportData,
          explorationPath: [{ latitude: 40.7128, longitude: -74.006, timestamp: futureTimestamp }],
        };

        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [
            { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
          ],
        } as any);
        mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(futureData));
        mockAsyncStorage.setItem.mockResolvedValue();

        const result = await DataImportExportService.importData();

        expect(result.success).toBe(true); // Should accept future dates
      });

      it('should handle ancient timestamps', async () => {
        const ancientData = {
          ...validExportData,
          explorationPath: [{ latitude: 40.7128, longitude: -74.006, timestamp: 0 }], // Unix epoch
        };

        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [
            { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
          ],
        } as any);
        mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(ancientData));
        mockAsyncStorage.getItem.mockImplementation((key) => {
          if (key === 'background_locations') {
            return Promise.resolve('[]'); // For existing background locations
          }
          return Promise.resolve('[]');
        });
        mockAsyncStorage.setItem.mockResolvedValue(); // For storing data
        mockedStore.getState.mockReturnValue({
          exploration: { path: ancientData.explorationPath, exploredAreas: [] },
          stats: { total: { distance: 0, area: 0, time: 0 } },
        });

        const result = await DataImportExportService.importData(false);

        expect(result.success).toBe(true); // Should accept old dates
      });

      it('should handle future version import', async () => {
        const futureVersionData = { ...validExportData, version: '2.0.0' };

        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [
            { uri: '/mock/file.json', name: 'test.json', size: 1000, mimeType: 'application/json' },
          ],
        } as any);
        mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(futureVersionData));
        mockAsyncStorage.setItem.mockResolvedValue();

        const result = await DataImportExportService.importData();

        expect(result.success).toBe(true); // Should accept future versions
      });

      it('should handle massive dataset import', async () => {
        // Create a large dataset
        const largeDataset = {
          ...validExportData,
          explorationPath: Array.from({ length: 10000 }, (_, i) => ({
            latitude: 40.7128 + i * 0.0001,
            longitude: -74.006 + i * 0.0001,
            timestamp: 1000 + i * 1000,
          })),
          metadata: { ...validExportData.metadata, totalPoints: 10000 },
        };

        mockDocumentPicker.getDocumentAsync.mockResolvedValue({
          canceled: false,
          assets: [
            {
              uri: '/mock/file.json',
              name: 'test.json',
              size: 1000000,
              mimeType: 'application/json',
            },
          ],
        } as any);
        mockFileSystem.readAsStringAsync.mockResolvedValue(JSON.stringify(largeDataset));
        mockAsyncStorage.setItem.mockResolvedValue();

        const result = await DataImportExportService.importData();

        expect(result.success).toBe(true);
        expect(result.pointsImported).toBe(10000);
      });
    });
  });
});
