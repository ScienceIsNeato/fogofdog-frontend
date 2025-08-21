import { configureStore } from '@reduxjs/toolkit';
import statsReducer, {
  setLoading,
  setError,
  resetSessionStats,
  refreshFormattedStats,
  selectStats,
  selectFormattedStats,
  selectTotalStats,
  selectSessionStats,
  selectIsStatsLoading,
  selectStatsError,
  selectIsSessionActive,
  initializeFromHistory,
  startNewSession,
  endSession,
  processGeoPoint,
  loadPersistedStats,
  updateSessionTimer,
} from '../statsSlice';
import { StatsCalculationService } from '../../../services/StatsCalculationService';
import { defaultStatsState } from '../../../test-helpers/shared-mocks';

// Import types from the slice interface
type StatsState = ReturnType<typeof statsReducer>;

// Mock the StatsCalculationService to avoid complex dependencies
jest.mock('../../../services/StatsCalculationService', () => ({
  StatsCalculationService: {
    createInitialState: jest.fn(() => ({
      total: { distance: 0, area: 0, time: 0 },
      session: { distance: 0, area: 0, time: 0 },
      currentSession: null,
      lastProcessedPoint: null,
      isInitialized: false,
    })),
    formatDistance: jest.fn((distance) => `${distance}m`),
    formatArea: jest.fn((area) => `${area}m²`),
    formatTime: jest.fn((time) => {
      if (time >= 1000) {
        return `${Math.floor(time / 1000)}s`;
      }
      return `${time}ms`;
    }),
    formatTimeAsTimer: jest.fn((time) => {
      if (time === 0) return ':00'; // Handle 0 time case

      const totalSeconds = Math.floor(time / 1000);
      const totalMinutes = Math.floor(totalSeconds / 60);
      const totalHours = Math.floor(totalMinutes / 60);
      const totalDays = Math.floor(totalHours / 24);

      const seconds = totalSeconds % 60;
      const minutes = totalMinutes % 60;
      const hours = totalHours % 24;

      if (totalDays > 0) {
        return `${totalDays} day${totalDays !== 1 ? 's' : ''}, ${hours} hour${hours !== 1 ? 's' : ''}, ${minutes} minute${minutes !== 1 ? 's' : ''} and ${seconds} second${seconds !== 1 ? 's' : ''}`;
      } else if (totalHours > 0) {
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else if (totalMinutes > 0) {
        return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
      } else {
        return `:${seconds.toString().padStart(2, '0')}`;
      }
    }),
    incrementStats: jest.fn(),
    calculateTotalsFromHistory: jest.fn(),
    startNewSession: jest.fn(),
    endCurrentSession: jest.fn(),
    pauseSession: jest.fn((state) => ({
      ...state,
      currentSession: {
        ...state.currentSession,
        lastActiveTime: Date.now(),
      },
    })),
    resumeSession: jest.fn((state) => ({
      ...state,
      currentSession: {
        ...state.currentSession,
        totalPausedTime: (state.currentSession?.totalPausedTime ?? 0) + 10000,
        lastActiveTime: Date.now(),
      },
    })),
    geoPointToGPSEvent: jest.fn(),
  },
}));

describe('statsSlice', () => {
  let store: ReturnType<typeof configureStore<{ stats: any }>>;

  beforeEach(() => {
    store = configureStore({
      reducer: {
        stats: statsReducer,
      },
      middleware: (getDefaultMiddleware) =>
        getDefaultMiddleware({
          serializableCheck: false, // Disable for tests
        }),
    });
    jest.clearAllMocks();
  });

  describe('initial state', () => {
    it('should have correct initial state', () => {
      const state = store.getState().stats;
      expect(state.total).toEqual({ distance: 0, area: 0, time: 0 });
      expect(state.session).toEqual({ distance: 0, area: 0, time: 0 });
      expect(state.currentSession).toBeNull();
      expect(state.lastProcessedPoint).toBeNull();
      expect(state.isInitialized).toBe(false);
      expect(state.isLoading).toBe(false);
      expect(state.lastError).toBeNull();
      expect(state.lastSaveTime).toBeNull();
      expect(state.formattedStats).toEqual({
        totalDistance: '0m',
        totalArea: '0m²',
        totalTime: ':00',
        sessionDistance: '0m',
        sessionArea: '0m²',
        sessionTime: ':00',
      });
    });
  });

  describe('loading actions', () => {
    it('should set loading state', () => {
      store.dispatch(setLoading(true));
      expect(store.getState().stats.isLoading).toBe(true);

      store.dispatch(setLoading(false));
      expect(store.getState().stats.isLoading).toBe(false);
    });
  });

  describe('error actions', () => {
    it('should set error state', () => {
      global.expectConsoleErrors = true; // This test expects console errors

      const error = 'Test error';
      store.dispatch(setError(error));
      expect(store.getState().stats.lastError).toBe(error);

      store.dispatch(setError(''));
      expect(store.getState().stats.lastError).toBe('');
    });
  });

  describe('session management', () => {
    it('should reset session stats', () => {
      // Manually set some session data first
      store.dispatch(setLoading(false)); // Just to trigger a state change

      // Now reset
      store.dispatch(resetSessionStats());

      const newState = store.getState().stats;
      expect(newState.session).toEqual({ distance: 0, area: 0, time: 0 });
      expect(newState.currentSession).toBeNull();
      expect(newState.lastProcessedPoint).toBeNull();
    });
  });

  describe('refreshFormattedStats', () => {
    it('should refresh formatted stats', () => {
      store.dispatch(refreshFormattedStats());

      // The action should trigger the formatting
      const state = store.getState().stats;
      expect(state.formattedStats).toBeDefined();
      expect(typeof state.formattedStats.totalDistance).toBe('string');
      expect(typeof state.formattedStats.totalArea).toBe('string');
      expect(typeof state.formattedStats.totalTime).toBe('string');
    });
  });

  describe('selectors', () => {
    const mockState = {
      stats: {
        total: { distance: 1000, area: 500, time: 60000 },
        session: { distance: 500, area: 250, time: 30000 },
        currentSession: {
          sessionId: 'test-session',
          startTime: Date.now(),
          totalPausedTime: 0,
          lastActiveTime: Date.now(),
        },
        lastProcessedPoint: null,
        isInitialized: true,
        isLoading: false,
        lastError: 'Test error',
        lastSaveTime: Date.now(),
        formattedStats: {
          totalDistance: '1.00km',
          totalArea: '500m²',
          totalTime: '1m',
          sessionDistance: '500m',
          sessionArea: '250m²',
          sessionTime: '30s',
        },
      },
    };

    it('should select stats', () => {
      expect(selectStats(mockState)).toBe(mockState.stats);
    });

    it('should select formatted stats', () => {
      expect(selectFormattedStats(mockState)).toBe(mockState.stats.formattedStats);
    });

    it('should select total stats', () => {
      expect(selectTotalStats(mockState)).toBe(mockState.stats.total);
    });

    it('should select session stats', () => {
      expect(selectSessionStats(mockState)).toBe(mockState.stats.session);
    });

    it('should select loading state', () => {
      expect(selectIsStatsLoading(mockState)).toBe(false);
    });

    it('should select error state', () => {
      expect(selectStatsError(mockState)).toBe('Test error');
    });

    it('should select session active state', () => {
      expect(selectIsSessionActive(mockState)).toBe(true);

      const inactiveState = {
        ...mockState,
        stats: {
          ...mockState.stats,
          currentSession: {
            ...mockState.stats.currentSession,
            endTime: Date.now(),
          },
        },
      };
      expect(selectIsSessionActive(inactiveState)).toBe(false);

      const noSessionState = {
        ...mockState,
        stats: {
          ...mockState.stats,
          currentSession: null,
        },
      } as any;
      expect(selectIsSessionActive(noSessionState)).toBeFalsy();
    });
  });

  describe('state structure validation', () => {
    it('should maintain proper state structure after actions', () => {
      global.expectConsoleErrors = true; // This test expects console errors

      store.dispatch(setLoading(true));
      store.dispatch(setError('test error'));

      const state = store.getState().stats;

      // Verify all required properties exist
      expect(state).toHaveProperty('total');
      expect(state).toHaveProperty('session');
      expect(state).toHaveProperty('currentSession');
      expect(state).toHaveProperty('lastProcessedPoint');
      expect(state).toHaveProperty('isInitialized');
      expect(state).toHaveProperty('isLoading');
      expect(state).toHaveProperty('lastError');
      expect(state).toHaveProperty('lastSaveTime');
      expect(state).toHaveProperty('formattedStats');

      // Verify nested structure
      expect(state.total).toHaveProperty('distance');
      expect(state.total).toHaveProperty('area');
      expect(state.total).toHaveProperty('time');

      expect(state.session).toHaveProperty('distance');
      expect(state.session).toHaveProperty('area');
      expect(state.session).toHaveProperty('time');

      expect(state.formattedStats).toHaveProperty('totalDistance');
      expect(state.formattedStats).toHaveProperty('totalArea');
      expect(state.formattedStats).toHaveProperty('totalTime');
      expect(state.formattedStats).toHaveProperty('sessionDistance');
      expect(state.formattedStats).toHaveProperty('sessionArea');
      expect(state.formattedStats).toHaveProperty('sessionTime');
    });
  });

  describe('additional action coverage', () => {
    it('should handle initializeFromHistory action', () => {
      const mockHistoryData = [
        { latitude: 40.7128, longitude: -74.006, timestamp: 1000 },
        { latitude: 40.7589, longitude: -73.9851, timestamp: 2000 },
      ];

      // Mock the service methods
      const mockCalculatedStats = {
        total: { distance: 1500, area: 750, time: 45000 },
        session: { distance: 0, area: 0, time: 0 },
        currentSession: null,
        lastProcessedPoint: null,
        isInitialized: true,
        isLoading: false,
        lastError: null,
        lastSaveTime: null,
      };

      // Mock the calculation service
      const mockStatsCalculationService = StatsCalculationService as jest.Mocked<
        typeof StatsCalculationService
      >;
      mockStatsCalculationService.geoPointToGPSEvent.mockImplementation(
        () =>
          ({
            latitude: 40.7128,
            longitude: -74.006,
            timestamp: Date.now(),
            distanceTo: jest.fn(),
            isWithinDistance: jest.fn(),
            toCoordinate: jest.fn(),
            toLocationData: jest.fn(),
          }) as any
      );
      mockStatsCalculationService.calculateTotalsFromHistory.mockReturnValue(
        mockCalculatedStats as any
      );

      store.dispatch(initializeFromHistory({ gpsHistory: mockHistoryData }));

      const state = store.getState().stats;
      expect(state.total.distance).toBe(1500);
      expect(state.total.area).toBe(750);
      expect(state.isInitialized).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('should handle startNewSession action', () => {
      const mockNewSessionStats = {
        total: { distance: 1000, area: 500, time: 30000 },
        session: { distance: 0, area: 0, time: 0 },
        currentSession: {
          sessionId: 'new-session-123',
          startTime: Date.now(),
          totalPausedTime: 0,
          lastActiveTime: Date.now(),
        },
        lastProcessedPoint: null,
        isInitialized: true,
        isLoading: false,
        lastError: null,
        lastSaveTime: null,
      };

      const mockStatsCalculationService = StatsCalculationService as jest.Mocked<
        typeof StatsCalculationService
      >;
      mockStatsCalculationService.startNewSession.mockReturnValue(mockNewSessionStats);

      store.dispatch(startNewSession());

      const state = store.getState().stats;
      expect(state.currentSession).toBeTruthy();
      expect(state.currentSession?.sessionId).toBe('new-session-123');
    });

    it('should handle endSession action', () => {
      const mockEndedSessionStats = {
        total: { distance: 1000, area: 500, time: 30000 },
        session: { distance: 200, area: 100, time: 10000 },
        currentSession: {
          sessionId: 'ended-session',
          startTime: Date.now() - 10000,
          endTime: Date.now(),
          totalPausedTime: 0,
          lastActiveTime: Date.now() - 5000,
        },
        lastProcessedPoint: null,
        isInitialized: true,
        isLoading: false,
        lastError: null,
        lastSaveTime: null,
      };

      const mockStatsCalculationService = StatsCalculationService as jest.Mocked<
        typeof StatsCalculationService
      >;
      mockStatsCalculationService.endCurrentSession.mockReturnValue(mockEndedSessionStats);

      store.dispatch(endSession());

      const state = store.getState().stats;
      expect(state.currentSession).toBeTruthy();
      expect(state.currentSession?.endTime).toBeTruthy();
    });

    it('should handle processGeoPoint action', () => {
      const mockUpdatedStats = {
        total: { distance: 300, area: 150, time: 20000 },
        session: { distance: 300, area: 150, time: 20000 },
        currentSession: {
          sessionId: 'active-session',
          startTime: Date.now() - 20000,
          totalPausedTime: 0,
          lastActiveTime: Date.now(),
        },
        lastProcessedPoint: {
          latitude: 40.7589,
          longitude: -73.9851,
          timestamp: Date.now(),
        },
        isInitialized: true,
        isLoading: false,
        lastError: null,
        lastSaveTime: null,
      };

      const mockStatsCalculationService = StatsCalculationService as jest.Mocked<
        typeof StatsCalculationService
      >;
      mockStatsCalculationService.geoPointToGPSEvent.mockReturnValue({
        latitude: 40.7589,
        longitude: -73.9851,
        timestamp: Date.now(),
        distanceTo: jest.fn(),
        isWithinDistance: jest.fn(),
        toCoordinate: jest.fn(),
        toLocationData: jest.fn(),
      } as any);
      mockStatsCalculationService.incrementStats.mockReturnValue(mockUpdatedStats);

      const geoPoint = { latitude: 40.7589, longitude: -73.9851, timestamp: Date.now() };
      store.dispatch(processGeoPoint({ geoPoint }));

      const state = store.getState().stats;
      expect(state.session.distance).toBe(300);
      expect(state.lastProcessedPoint).toBeTruthy();
    });

    it('should handle loadPersistedStats action', () => {
      const persistedStats = { distance: 2000, area: 1000, time: 60000 };

      store.dispatch(loadPersistedStats({ totalStats: persistedStats }));

      const state = store.getState().stats;
      expect(state.total.distance).toBe(2000);
      expect(state.total.area).toBe(1000);
      expect(state.total.time).toBe(60000);
      expect(state.isLoading).toBe(false);
      expect(state.lastError).toBeNull();
    });
  });

  describe('pauseTracking and resumeTracking', () => {
    it('should record pause time when pauseTracking is called', () => {
      const mockTime = 1000000;
      jest.spyOn(Date, 'now').mockReturnValue(mockTime);

      const initialState: StatsState = {
        ...defaultStatsState,
        currentSession: {
          sessionId: 'test-session',
          startTime: mockTime - 5000,
          totalPausedTime: 0,
          lastActiveTime: mockTime - 5000,
        },
      };

      const action = { type: 'stats/pauseTracking' };
      const updatedState = statsReducer(initialState, action);

      expect(updatedState.currentSession.lastActiveTime).toBe(mockTime);
      expect(updatedState.currentSession.totalPausedTime).toBe(0);
    });

    it('should calculate paused duration when resumeTracking is called', () => {
      const sessionStart = 1000000;
      const pauseTime = 1005000; // 5 seconds after start
      const resumeTime = 1015000; // 10 seconds after pause

      jest.spyOn(Date, 'now').mockReturnValue(resumeTime);

      const initialState: StatsState = {
        ...defaultStatsState,
        currentSession: {
          sessionId: 'test-session',
          startTime: sessionStart,
          totalPausedTime: 0,
          lastActiveTime: pauseTime, // When pause was called
        },
      };

      const action = { type: 'stats/resumeTracking' };
      const updatedState = statsReducer(initialState, action);

      expect(updatedState.currentSession.totalPausedTime).toBe(10000); // 10 seconds
      expect(updatedState.currentSession.lastActiveTime).toBe(resumeTime);
    });
  });

  describe('updateSessionTimer', () => {
    it('should update session time for active session', () => {
      const startTime = Date.now() - 5000; // 5 seconds ago
      const initialState: StatsState = {
        ...defaultStatsState,
        currentSession: {
          sessionId: 'test-session-123',
          startTime,
          totalPausedTime: 0,
          lastActiveTime: startTime,
        },
        session: {
          distance: 100,
          area: 50,
          time: 0, // Will be updated by timer
        },
      };

      const action = updateSessionTimer();
      const updatedState = statsReducer(initialState, action);

      expect(updatedState.session.time).toBeGreaterThanOrEqual(4900); // ~5 seconds, allowing for timing variance
      expect(updatedState.session.time).toBeLessThanOrEqual(5100);
      expect(updatedState.formattedStats.sessionTime).toBe(':05'); // < 60s format
    });

    it('should exclude paused time from session duration', () => {
      const sessionStart = Date.now() - 25000; // 25 seconds ago
      const totalPausedTime = 10000; // 10 seconds paused
      // Active time should be 15 seconds

      const initialState: StatsState = {
        ...defaultStatsState,
        currentSession: {
          sessionId: 'test-session',
          startTime: sessionStart,
          totalPausedTime,
          lastActiveTime: Date.now() - 10000, // Last active 10s ago
        },
        session: {
          distance: 100,
          area: 50,
          time: 0,
        },
      };

      const action = updateSessionTimer();
      const updatedState = statsReducer(initialState, action);

      // Should be approximately 15 seconds (25 total - 10 paused)
      expect(updatedState.session.time).toBeGreaterThanOrEqual(14900);
      expect(updatedState.session.time).toBeLessThanOrEqual(15100);
      expect(updatedState.formattedStats.sessionTime).toBe(':15');
    });

    it('should not update time if no active session', () => {
      const initialState: StatsState = {
        ...defaultStatsState,
        currentSession: {
          sessionId: 'inactive-session',
          startTime: Date.now(),
          endTime: Date.now(), // Session has ended
          totalPausedTime: 0,
          lastActiveTime: Date.now(),
        },
        session: {
          distance: 100,
          area: 50,
          time: 1000,
        },
      };

      const action = updateSessionTimer();
      const updatedState = statsReducer(initialState, action);

      expect(updatedState.session.time).toBe(1000); // Unchanged
    });

    it('should not update time if session is ended', () => {
      const initialState: StatsState = {
        ...defaultStatsState,
        currentSession: {
          sessionId: 'ended-session',
          startTime: Date.now() - 5000,
          endTime: Date.now() - 1000, // Session ended 1 second ago
          totalPausedTime: 0,
          lastActiveTime: Date.now() - 1000,
        },
        session: {
          distance: 100,
          area: 50,
          time: 4000, // 4 seconds recorded
        },
      };

      const action = updateSessionTimer();
      const updatedState = statsReducer(initialState, action);

      expect(updatedState.session.time).toBe(4000); // Unchanged
    });

    it('should format different time ranges correctly', () => {
      // Test < 60 seconds - should be :XX format
      let initialState: StatsState = {
        ...defaultStatsState,
        currentSession: {
          sessionId: 'test-session',
          startTime: Date.now() - 30000, // 30 seconds ago
          totalPausedTime: 0,
          lastActiveTime: Date.now() - 30000,
        },
        session: { distance: 0, area: 0, time: 0 },
      };

      let action = updateSessionTimer();
      let updatedState = statsReducer(initialState, action);
      expect(updatedState.formattedStats.sessionTime).toBe(':30');

      // Test 1-60 minutes - should be MM:SS format
      initialState = {
        ...defaultStatsState,
        currentSession: {
          sessionId: 'test-session',
          startTime: Date.now() - 90000, // 90 seconds ago
          totalPausedTime: 0,
          lastActiveTime: Date.now() - 90000,
        },
        session: { distance: 0, area: 0, time: 0 },
      };

      action = updateSessionTimer();
      updatedState = statsReducer(initialState, action);
      expect(updatedState.formattedStats.sessionTime).toBe('01:30');

      // Test 1+ hours - should be HH:MM:SS format
      initialState = {
        ...defaultStatsState,
        currentSession: {
          sessionId: 'test-session',
          startTime: Date.now() - 3900000, // 65 minutes ago
          totalPausedTime: 0,
          lastActiveTime: Date.now() - 3900000,
        },
        session: { distance: 0, area: 0, time: 0 },
      };

      action = updateSessionTimer();
      updatedState = statsReducer(initialState, action);
      expect(updatedState.formattedStats.sessionTime).toBe('01:05:00');
    });
  });
});
