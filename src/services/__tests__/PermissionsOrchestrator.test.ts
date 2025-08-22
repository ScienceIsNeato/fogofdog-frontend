import { PermissionsOrchestrator } from '../PermissionsOrchestrator';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Location from 'expo-location';

// Mock dependencies
jest.mock('@react-native-async-storage/async-storage');
jest.mock('expo-location');
jest.mock('../../utils/logger');

const { logger } = jest.requireMock('../../utils/logger');
jest.mock('react-native', () => ({
  AppState: {
    addEventListener: jest.fn(),
    removeEventListener: jest.fn(),
    currentState: 'active',
  },
}));

// AsyncStorage is already mocked globally
const mockLocation = Location as jest.Mocked<typeof Location>;

describe('PermissionsOrchestrator - NEW Persistence Features', () => {
  let originalConsoleError: any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Temporarily disable console error checking for these tests
    originalConsoleError = console.error;
    console.error = jest.fn();

    // Setup default AsyncStorage mocks
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);
    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.removeItem as jest.Mock).mockResolvedValue(undefined);

    // Setup default location mocks
    mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });

    mockLocation.getBackgroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });

    mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });

    mockLocation.requestBackgroundPermissionsAsync.mockResolvedValue({
      status: Location.PermissionStatus.GRANTED,
      granted: true,
      canAskAgain: true,
      expires: 'never',
    });
  });

  describe('Permission State Persistence (NEW)', () => {
    it('should clear stored permission state', async () => {
      await PermissionsOrchestrator.clearStoredPermissionState();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@permission_state');
    });

    it('should force permission refresh', async () => {
      // Mock successful permission request
      mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: Location.PermissionStatus.GRANTED,
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });

      const result = await PermissionsOrchestrator.forcePermissionRefresh();

      expect(result.canProceed).toBe(true);
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@permission_state');
    });
  });

  describe('Permission Verification Flow (NEW)', () => {
    it('should complete permission verification successfully', async () => {
      // Mock successful permission flow
      mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: Location.PermissionStatus.GRANTED,
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });

      mockLocation.getBackgroundPermissionsAsync.mockResolvedValue({
        status: Location.PermissionStatus.GRANTED,
        granted: true,
        canAskAgain: true,
        expires: 'never',
      });

      const result = await PermissionsOrchestrator.completePermissionVerification();

      expect(result.canProceed).toBe(true);
      expect(result.mode).toBeDefined();
      expect(result.backgroundGranted).toBeDefined();
    });
  });

  describe('Enhanced Permission Flow (NEW)', () => {
    it('should handle denied permissions with error message', async () => {
      // Mock denied foreground permission
      mockLocation.getForegroundPermissionsAsync.mockResolvedValue({
        status: Location.PermissionStatus.DENIED,
        granted: false,
        canAskAgain: false,
        expires: 'never',
      });

      mockLocation.requestForegroundPermissionsAsync.mockResolvedValue({
        status: Location.PermissionStatus.DENIED,
        granted: false,
        canAskAgain: false,
        expires: 'never',
      });

      const result = await PermissionsOrchestrator.requestPermissions();

      expect(result.canProceed).toBe(false);
      expect(result.mode).toBe('denied');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Location permission is required');
    });
  });

  afterEach(() => {
    // Restore console error
    console.error = originalConsoleError;
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle invalid stored permission state', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('invalid-json');

      const result = await PermissionsOrchestrator.completePermissionVerification();

      expect(result.canProceed).toBeDefined();
    });

    it('should handle AsyncStorage errors gracefully', async () => {
      (AsyncStorage.getItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const result = await PermissionsOrchestrator.completePermissionVerification();

      expect(result.canProceed).toBeDefined();
    });

    it('should handle clearStoredPermissionState', async () => {
      await PermissionsOrchestrator.clearStoredPermissionState();

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('@permission_state');
    });

    it('should handle AsyncStorage.setItem error in savePermissionState', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValueOnce(new Error('Save error'));

      // This should not throw, just log the error
      const result = await PermissionsOrchestrator.completePermissionVerification();

      expect(result).toBeDefined();
      expect(result.canProceed).toBeDefined();
    });

    it('should handle AsyncStorage.removeItem error in clearStoredPermissionState', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValueOnce(new Error('Remove error'));

      // This should not throw, just log the error
      await expect(PermissionsOrchestrator.clearStoredPermissionState()).resolves.toBeUndefined();
    });

    it('should load valid stored permission state successfully', async () => {
      const mockStoredState = {
        timestamp: Date.now() - 1000, // 1 second ago
        result: {
          canProceed: true,
          mode: 'full' as const,
          backgroundGranted: true,
        },
      };

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify(mockStoredState));

      const result = await PermissionsOrchestrator.completePermissionVerification();

      expect(result.canProceed).toBe(true);
      expect(result.mode).toBe('full');
      // Note: backgroundGranted is not part of the final result interface, it's internal to the flow
    });

    it('should return error field when permission verification fails', async () => {
      // Mock foreground permission denied
      (mockLocation.getForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
        canAskAgain: false,
        expires: 'never',
      });
      (mockLocation.requestForegroundPermissionsAsync as jest.Mock).mockResolvedValue({
        status: 'denied',
        granted: false,
        canAskAgain: false,
        expires: 'never',
      });

      const result = await PermissionsOrchestrator.completePermissionVerification();

      expect(result.canProceed).toBe(false);
      expect(result.mode).toBe('denied');
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Location permission is required');
    });

    it('should handle cleanup method', async () => {
      // Set up subscription to test cleanup
      const mockSubscription = { remove: jest.fn() };
      (PermissionsOrchestrator as any).appStateSubscription = mockSubscription;
      (PermissionsOrchestrator as any).currentResolver = jest.fn();

      const cleanup = PermissionsOrchestrator.cleanup();

      expect(cleanup).toBeUndefined();
      expect(mockSubscription.remove).toHaveBeenCalled();
      expect((PermissionsOrchestrator as any).appStateSubscription).toBeNull();
      expect((PermissionsOrchestrator as any).currentResolver).toBeNull();
    });

    // Note: "Allow Once" detection and complex permission flows are tested through integration tests
  });

  describe('App State Change Handling', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('should handle app becoming active during permission flow', async () => {
      const mockResolver = jest.fn();
      const mockCheckFinalPermissionState = jest.fn().mockResolvedValue({
        canProceed: true,
        hasBackgroundPermission: true,
        mode: 'always',
      });

      // Set up state
      (PermissionsOrchestrator as any).currentResolver = mockResolver;
      jest
        .spyOn(PermissionsOrchestrator as any, 'checkFinalPermissionState')
        .mockImplementation(mockCheckFinalPermissionState);
      jest
        .spyOn(PermissionsOrchestrator as any, 'saveStateAndResolve')
        .mockResolvedValue(undefined);

      // Simulate app state change to 'active'
      const handleAppStateChange = (PermissionsOrchestrator as any).handleAppStateChange;
      handleAppStateChange('active');

      // Fast-forward the setTimeout
      jest.advanceTimersByTime(2000);
      await Promise.resolve(); // Allow async operations to complete

      expect(mockCheckFinalPermissionState).toHaveBeenCalled();
      expect((PermissionsOrchestrator as any).saveStateAndResolve).toHaveBeenCalledWith(
        {
          canProceed: true,
          hasBackgroundPermission: true,
          mode: 'always',
        },
        mockResolver
      );
      // Note: currentResolver is set to null in the actual implementation after saveStateAndResolve
    });

    it('should handle app state change error gracefully', async () => {
      const mockResolver = jest.fn();
      const mockCheckFinalPermissionState = jest
        .fn()
        .mockRejectedValue(new Error('Permission check failed'));

      // Set up state
      (PermissionsOrchestrator as any).currentResolver = mockResolver;
      jest
        .spyOn(PermissionsOrchestrator as any, 'checkFinalPermissionState')
        .mockImplementation(mockCheckFinalPermissionState);
      jest
        .spyOn(PermissionsOrchestrator as any, 'saveStateAndResolve')
        .mockResolvedValue(undefined);

      // Simulate app state change to 'active'
      const handleAppStateChange = (PermissionsOrchestrator as any).handleAppStateChange;
      handleAppStateChange('active');

      // Fast-forward the setTimeout
      jest.advanceTimersByTime(2000);
      await Promise.resolve(); // Allow async operations to complete

      expect(mockCheckFinalPermissionState).toHaveBeenCalled();
      expect((PermissionsOrchestrator as any).saveStateAndResolve).toHaveBeenCalledWith(
        {
          canProceed: false,
          hasBackgroundPermission: false,
          mode: 'denied',
        },
        mockResolver
      );
      // Note: currentResolver is set to null in the actual implementation after saveStateAndResolve
    });

    it('should ignore app state changes when no resolver is active', () => {
      const mockCheckFinalPermissionState = jest.fn();

      // Ensure no resolver is set
      (PermissionsOrchestrator as any).currentResolver = null;
      jest
        .spyOn(PermissionsOrchestrator as any, 'checkFinalPermissionState')
        .mockImplementation(mockCheckFinalPermissionState);

      // Simulate app state change to 'active'
      const handleAppStateChange = (PermissionsOrchestrator as any).handleAppStateChange;
      handleAppStateChange('active');

      // Fast-forward the setTimeout
      jest.advanceTimersByTime(2000);

      expect(mockCheckFinalPermissionState).not.toHaveBeenCalled();
    });

    it('should ignore non-active app state changes', () => {
      const mockCheckFinalPermissionState = jest.fn();
      const mockResolver = jest.fn();

      // Set up state
      (PermissionsOrchestrator as any).currentResolver = mockResolver;
      jest
        .spyOn(PermissionsOrchestrator as any, 'checkFinalPermissionState')
        .mockImplementation(mockCheckFinalPermissionState);

      // Simulate app state change to 'background'
      const handleAppStateChange = (PermissionsOrchestrator as any).handleAppStateChange;
      handleAppStateChange('background');

      // Fast-forward the setTimeout
      jest.advanceTimersByTime(2000);

      expect(mockCheckFinalPermissionState).not.toHaveBeenCalled();
    });
  });

  describe('Error Handling', () => {
    it('should handle AsyncStorage errors in clearStoredPermissionState', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValue(new Error('Storage error'));

      await PermissionsOrchestrator.clearStoredPermissionState();

      expect(logger.error).toHaveBeenCalledWith(
        'Failed to clear stored permission state',
        expect.objectContaining({
          error: expect.any(Error),
        })
      );
    });
  });


});
