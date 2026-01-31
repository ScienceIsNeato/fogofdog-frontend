// Mock expo-asset to prevent Expo global errors
export const Asset = {
  fromModule: jest.fn(() => ({
    uri: 'mock-asset-uri',
    downloadAsync: jest.fn().mockResolvedValue(undefined),
  })),
  fromURI: jest.fn(() => ({
    uri: 'mock-asset-uri',
    downloadAsync: jest.fn().mockResolvedValue(undefined),
  })),
  loadAsync: jest.fn().mockResolvedValue(undefined),
};

// Mock the Expo global that expo-asset expects
(global as any).Expo = {
  Asset,
};

export default Asset;
