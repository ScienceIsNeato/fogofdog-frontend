// Mock EventEmitter to prevent expo-modules-core errors
jest.mock('expo-modules-core', () => ({
  EventEmitter: jest.fn().mockImplementation(() => ({
    addListener: jest.fn(),
    removeListener: jest.fn(),
    removeAllListeners: jest.fn(),
  })),
  NativeModulesProxy: {},
}));

const actual = jest.requireActual('expo-location');

// Create complete permission response objects that match what the service expects
const createCompletePermissionResponse = (status: string) => ({
  status: status as any,
  granted: status === 'granted',
  expires: 'never' as any,
  canAskAgain: true,
});

module.exports = {
  ...actual,
  PermissionStatus: {
    GRANTED: 'granted',
    DENIED: 'denied',
    UNDETERMINED: 'undetermined',
  },
  Accuracy: {
    Lowest: 1,
    Low: 2,
    Balanced: 3,
    High: 4,
    Highest: 5,
    BestForNavigation: 6,
  },
  requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue(createCompletePermissionResponse('granted')),
  getBackgroundPermissionsAsync: jest.fn().mockResolvedValue(createCompletePermissionResponse('granted')),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue(createCompletePermissionResponse('granted')),
  getForegroundPermissionsAsync: jest.fn().mockResolvedValue(createCompletePermissionResponse('granted')),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 40.7128, longitude: -74.006 },
  }),
  startLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
  stopLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
};