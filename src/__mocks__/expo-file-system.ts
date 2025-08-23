// Mock for expo-file-system
export const documentDirectory = '/mock/documents/';

export const getInfoAsync = jest.fn().mockResolvedValue({
  exists: false,
  isDirectory: false,
  uri: '/mock/documents/gps-injection.json',
});

export const readAsStringAsync = jest.fn().mockResolvedValue('[]');

export const writeAsStringAsync = jest.fn().mockResolvedValue(undefined);

export const deleteAsync = jest.fn().mockResolvedValue(undefined);

export default {
  documentDirectory,
  getInfoAsync,
  readAsStringAsync,
  writeAsStringAsync,
  deleteAsync,
};
