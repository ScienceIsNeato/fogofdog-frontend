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
  requestBackgroundPermissionsAsync: jest.fn().mockResolvedValue(createCompletePermissionResponse('granted')),
  getBackgroundPermissionsAsync: jest.fn().mockResolvedValue(createCompletePermissionResponse('granted')),
  requestForegroundPermissionsAsync: jest.fn().mockResolvedValue(createCompletePermissionResponse('granted')),
  getCurrentPositionAsync: jest.fn().mockResolvedValue({
    coords: { latitude: 40.7128, longitude: -74.006 },
  }),
  startLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
  stopLocationUpdatesAsync: jest.fn().mockResolvedValue(undefined),
};