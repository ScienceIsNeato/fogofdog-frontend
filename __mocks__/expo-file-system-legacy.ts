/**
 * Mock for expo-file-system/legacy
 * SDK 54 moved documentDirectory and other legacy APIs to expo-file-system/legacy.
 * This mock provides the same interface used by the original expo-file-system mock.
 */

export const documentDirectory = 'file:///mock-document-directory/';
export const cacheDirectory = 'file:///mock-cache-directory/';
export const bundleDirectory = 'file:///mock-bundle-directory/';

export const getInfoAsync = jest.fn().mockResolvedValue({
  exists: false,
  isDirectory: false,
  uri: '',
  size: 0,
  modificationTime: 0,
});

export const readAsStringAsync = jest.fn().mockResolvedValue('');
export const writeAsStringAsync = jest.fn().mockResolvedValue(undefined);
export const deleteAsync = jest.fn().mockResolvedValue(undefined);
export const moveAsync = jest.fn().mockResolvedValue(undefined);
export const copyAsync = jest.fn().mockResolvedValue(undefined);
export const makeDirectoryAsync = jest.fn().mockResolvedValue(undefined);
export const readDirectoryAsync = jest.fn().mockResolvedValue([]);
export const downloadAsync = jest.fn().mockResolvedValue({ uri: '', status: 200 });

export const EncodingType = {
  UTF8: 'utf8',
  Base64: 'base64',
};

export const FileSystemSessionType = {
  BACKGROUND: 0,
  FOREGROUND: 1,
};

export const FileSystemUploadType = {
  BINARY_CONTENT: 0,
  MULTIPART: 1,
};
