import { renderHook, waitFor, act } from '@testing-library/react-native';
import { usePermissionVerification } from '../usePermissionVerification';
import { PermissionsOrchestrator } from '../../../../services/PermissionsOrchestrator';

// Mock the PermissionsOrchestrator
jest.mock('../../../../services/PermissionsOrchestrator', () => ({
  PermissionsOrchestrator: {
    completePermissionVerification: jest.fn(),
    cleanup: jest.fn(),
  },
}));

const mockCompletePermissionVerification =
  PermissionsOrchestrator.completePermissionVerification as jest.Mock;
const mockCleanup = PermissionsOrchestrator.cleanup as jest.Mock;

describe('usePermissionVerification', () => {
  let originalConsoleError: any;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Temporarily disable console error checking for these tests
    originalConsoleError = console.error;
    console.error = jest.fn();
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();

    // Restore console error
    console.error = originalConsoleError;
  });

  it('should initialize with unknown state when shouldVerify is false', () => {
    const { result } = renderHook(() => usePermissionVerification(false));

    expect(result.current).toEqual(
      expect.objectContaining({
        isVerifying: false,
        isVerified: false,
        hasPermissions: false,
        backgroundGranted: false,
        mode: 'unknown',
        error: null,
      })
    );
  });

  it('should start verifying when shouldVerify is true', () => {
    const { result } = renderHook(() => usePermissionVerification(true));

    expect(result.current.isVerifying).toBe(true);
    expect(result.current.mode).toBe('unknown');
  });

  it('should call orchestrator when verification starts', async () => {
    const mockResult = {
      canProceed: true,
      mode: 'full' as const,
      backgroundGranted: true,
    };

    mockCompletePermissionVerification.mockResolvedValue(mockResult);

    renderHook(() => usePermissionVerification(true));

    // Verify the orchestrator was called
    await waitFor(
      () => {
        expect(mockCompletePermissionVerification).toHaveBeenCalled();
      },
      { timeout: 1000 }
    );
  });

  it('should initialize correctly and call orchestrator', async () => {
    const mockResult = {
      canProceed: true,
      mode: 'full' as const,
      backgroundGranted: true,
    };

    mockCompletePermissionVerification.mockResolvedValue(mockResult);

    const { result } = renderHook(() => usePermissionVerification(true));

    // Should start in verifying state
    expect(result.current.isVerifying).toBe(true);

    // Wait for the hook to call the orchestrator
    await waitFor(
      () => {
        expect(mockCompletePermissionVerification).toHaveBeenCalled();
      },
      { timeout: 1000 }
    );
  });

  it('should provide reset functionality', () => {
    const { result } = renderHook(() => usePermissionVerification(false));

    expect(typeof result.current.resetVerification).toBe('function');
    expect(typeof result.current.startVerification).toBe('function');
  });

  it('should clean up on unmount', () => {
    const { unmount } = renderHook(() => usePermissionVerification(false));

    unmount();

    expect(mockCleanup).toHaveBeenCalled();
  });

  it('should not start verification when already verifying', async () => {
    const { result } = renderHook(() => usePermissionVerification(true));

    // Start verification
    await act(async () => {
      result.current.startVerification();
    });

    // Try to start again while verifying - should return early
    await act(async () => {
      result.current.startVerification();
    });

    // PermissionsOrchestrator should only be called once
    expect(mockCompletePermissionVerification).toHaveBeenCalledTimes(1);
  });

  it('should reset verification state when resetVerification is called', () => {
    const { result } = renderHook(() => usePermissionVerification(false));

    act(() => {
      result.current.resetVerification();
    });

    expect(result.current.isVerifying).toBe(false);
    expect(result.current.isVerified).toBe(false);
  });
});
