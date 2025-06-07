/**
 * Test helpers for BackgroundLocationService tests
 * Reduces code duplication by providing common mock setup and task data
 */

export const createMockPermissionResponse = (status: 'granted' | 'denied') => ({
  status: status as any,
  granted: status === 'granted',
  expires: 'never' as any,
  canAskAgain: true,
});

export const createMockTaskData = (options: {
  hasLocations?: boolean;
  hasError?: boolean;
  locationsWithoutAccuracy?: boolean;
}) => {
  const { hasLocations = true, hasError = false, locationsWithoutAccuracy = false } = options;

  if (hasError) {
    return {
      data: null,
      error: { message: 'Task execution error', code: 'TASK_ERROR' },
      executionInfo: {
        taskName: 'background-location-task',
        taskInstanceId: 'test-instance',
        eventId: 'test-event',
        appState: 'background' as const,
      },
    };
  }

  if (!hasLocations) {
    return {
      data: null,
      error: null,
      executionInfo: {
        taskName: 'background-location-task',
        taskInstanceId: 'test-instance',
        eventId: 'test-event',
        appState: 'background' as const,
      },
    };
  }

  return {
    data: {
      locations: [
        {
          coords: {
            latitude: 40.7128,
            longitude: -74.006,
            altitude: null,
            accuracy: locationsWithoutAccuracy ? null : 5,
            altitudeAccuracy: null,
            heading: null,
            speed: null,
          },
          timestamp: Date.now(),
        },
      ],
    },
    error: null,
    executionInfo: {
      taskName: 'background-location-task',
      taskInstanceId: 'test-instance',
      eventId: 'test-event',
      appState: 'background' as const,
    },
  };
};

export const setupTaskManagerMocks = (
  mockedTaskManager: any,
  mockedLocationStorageService: any
) => {
  // Reset mocks
  mockedTaskManager.defineTask.mockClear();

  // Set up common mock implementations
  mockedTaskManager.isTaskRegisteredAsync.mockResolvedValue(false);
  mockedLocationStorageService.storeBackgroundLocation.mockResolvedValue(undefined);
  mockedLocationStorageService.clearStoredBackgroundLocations.mockResolvedValue(undefined);
};

export const getTaskCallbackFromMock = (mockedTaskManager: any) => {
  const defineTaskCall = mockedTaskManager.defineTask.mock.calls[0];
  return defineTaskCall![1];
};
