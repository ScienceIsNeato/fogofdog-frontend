// Mock expo-modules-core to prevent EventEmitter errors
export const EventEmitter = jest.fn().mockImplementation(() => ({
  addListener: jest.fn(),
  removeListener: jest.fn(),
  removeAllListeners: jest.fn(),
  emit: jest.fn(),
}));

export const NativeModulesProxy = {};

export const requireNativeModule = jest.fn();

export const requireOptionalNativeModule = jest.fn();

export const Platform = {
  OS: 'ios',
};