import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { GPSEvent } from '../../types/GPSEvent';
import { GeoPoint } from '../../types/user';
import {
  StatsCalculationService,
  StatsState as CalculationStatsState,
  ExplorationStats,
  SerializableGPSPoint,
} from '../../services/StatsCalculationService';
import { logger } from '../../utils/logger';

/**
 * Redux state for exploration statistics
 * Extends the calculation service state with UI-specific properties
 */
interface StatsState extends CalculationStatsState {
  // UI state
  isLoading: boolean;
  lastError: string | null;
  lastSaveTime: number | null;

  // Display formatting cache (to avoid recalculating on every render)
  formattedStats: {
    totalDistance: string;
    totalArea: string;
    totalTime: string;
    sessionDistance: string;
    sessionArea: string;
    sessionTime: string;
  };
}

/**
 * Payload for processing new GPS data
 */
interface ProcessGPSPointPayload {
  gpsEvent: GPSEvent;
}

/**
 * Payload for processing GeoPoint data (for compatibility with existing code)
 */
interface ProcessGeoPointPayload {
  geoPoint: GeoPoint;
}

/**
 * Payload for loading persisted stats
 */
interface LoadPersistedStatsPayload {
  totalStats: ExplorationStats;
}

const initialState: StatsState = {
  ...StatsCalculationService.createInitialState(),
  isLoading: false,
  lastError: null,
  lastSaveTime: null,
  formattedStats: {
    totalDistance: StatsCalculationService.formatDistance(0),
    totalArea: StatsCalculationService.formatArea(0),
    totalTime: StatsCalculationService.formatTimeAsTimer(0),
    sessionDistance: StatsCalculationService.formatDistance(0),
    sessionArea: StatsCalculationService.formatArea(0),
    sessionTime: StatsCalculationService.formatTimeAsTimer(0),
  },
};

/**
 * Helper function to update formatted stats
 */
const updateFormattedStats = (state: StatsState): void => {
  // Calculate total time including current session if active
  let totalTimeToDisplay = state.total.time;
  if (state.currentSession && !state.currentSession.endTime) {
    // Add current session time to total for display consistency with timer
    totalTimeToDisplay = state.total.time + state.session.time;
  }

  state.formattedStats = {
    totalDistance: StatsCalculationService.formatDistance(state.total.distance),
    totalArea: StatsCalculationService.formatArea(state.total.area),
    totalTime: StatsCalculationService.formatTimeAsTimer(totalTimeToDisplay),
    sessionDistance: StatsCalculationService.formatDistance(state.session.distance),
    sessionArea: StatsCalculationService.formatArea(state.session.area),
    sessionTime: StatsCalculationService.formatTimeAsTimer(state.session.time),
  };
};

const statsSlice = createSlice({
  name: 'stats',
  initialState,
  reducers: {
    /**
     * Process a new GPS point and update statistics
     */
    processGPSPoint: (state, action: PayloadAction<ProcessGPSPointPayload>) => {
      const { gpsEvent } = action.payload;

      logger.debug('Processing GPS point in Redux', {
        component: 'statsSlice',
        action: 'processGPSPoint',
        latitude: gpsEvent.latitude,
        longitude: gpsEvent.longitude,
      });

      // Use the calculation service to update stats
      const updatedStats = StatsCalculationService.incrementStats(state, gpsEvent);

      // Update state with new values
      Object.assign(state, updatedStats);

      // Update formatted strings
      updateFormattedStats(state);

      // Clear any previous errors
      state.lastError = null;
    },

    /**
     * Process a GeoPoint (for compatibility with existing Redux patterns)
     */
    processGeoPoint: (state, action: PayloadAction<ProcessGeoPointPayload>) => {
      const { geoPoint } = action.payload;

      // Convert GeoPoint to GPSEvent and process
      const gpsEvent = StatsCalculationService.geoPointToGPSEvent(geoPoint);

      logger.debug('Processing GeoPoint in Redux', {
        component: 'statsSlice',
        action: 'processGeoPoint',
        latitude: geoPoint.latitude,
        longitude: geoPoint.longitude,
      });

      const updatedStats = StatsCalculationService.incrementStats(state, gpsEvent);
      Object.assign(state, updatedStats);
      updateFormattedStats(state);
      state.lastError = null;
    },

    /**
     * Start a new exploration session
     */
    startNewSession: (state) => {
      logger.info('Starting new session in Redux', {
        component: 'statsSlice',
        action: 'startNewSession',
      });

      const updatedStats = StatsCalculationService.startNewSession(state);
      Object.assign(state, updatedStats);
      updateFormattedStats(state);
      state.lastError = null;
    },

    /**
     * End the current session
     */
    endSession: (state) => {
      logger.debug('Ending session in Redux', {
        component: 'statsSlice',
        action: 'endSession',
      });

      const updatedStats = StatsCalculationService.endCurrentSession(state);
      Object.assign(state, updatedStats);
      state.lastError = null;
    },

    /**
     * Initialize stats from GPS history
     */
    initializeFromHistory: (state, action: PayloadAction<{ gpsHistory: any[] }>) => {
      const { gpsHistory } = action.payload;

      logger.info('Initializing stats from GPS history', {
        component: 'statsSlice',
        action: 'initializeFromHistory',
        historyLength: gpsHistory.length,
      });

      // Convert GeoPoints to GPSEvents if needed
      const gpsEvents = gpsHistory.map((point) =>
        StatsCalculationService.geoPointToGPSEvent(point)
      );

      const initializedStats = StatsCalculationService.calculateTotalsFromHistory(gpsEvents);
      Object.assign(state, initializedStats);
      updateFormattedStats(state);
      state.isLoading = false;
      state.lastError = null;
    },

    /**
     * Load persisted total stats from storage
     */
    loadPersistedStats: (state, action: PayloadAction<LoadPersistedStatsPayload>) => {
      const { totalStats } = action.payload;

      logger.info('Loading persisted stats in Redux', {
        component: 'statsSlice',
        action: 'loadPersistedStats',
        totalDistance: totalStats.distance,
        totalArea: totalStats.area,
        totalTime: totalStats.time,
      });

      state.total = totalStats;
      updateFormattedStats(state);
      state.isLoading = false;
      state.lastError = null;
    },

    /**
     * Set loading state
     */
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    /**
     * Set error state
     */
    setError: (state, action: PayloadAction<string>) => {
      state.lastError = action.payload;
      state.isLoading = false;

      logger.error('Stats error set', {
        component: 'statsSlice',
        action: 'setError',
        error: action.payload,
      });
    },

    /**
     * Clear error state
     */
    clearError: (state) => {
      state.lastError = null;
    },

    /**
     * Update last save time
     */
    updateLastSaveTime: (state) => {
      state.lastSaveTime = Date.now();
    },

    /**
     * Reset all statistics (both session and total)
     */
    resetAllStats: (state) => {
      logger.warn('Resetting all stats in Redux', {
        component: 'statsSlice',
        action: 'resetAllStats',
      });

      const freshState = StatsCalculationService.createInitialState();
      Object.assign(state, freshState);
      updateFormattedStats(state);
      state.lastError = null;
      state.lastSaveTime = null;
    },

    /**
     * Reset only session statistics
     */
    resetSessionStats: (state) => {
      logger.info('Resetting session stats in Redux', {
        component: 'statsSlice',
        action: 'resetSessionStats',
      });

      // First, accumulate the current session time into total time
      if (state.currentSession && !state.currentSession.endTime) {
        const now = Date.now();
        const sessionStartTime = state.currentSession.startTime;
        const totalPausedTime = state.currentSession.totalPausedTime;
        const totalElapsedTime = now - sessionStartTime;
        const activeElapsedTime = totalElapsedTime - totalPausedTime;

        // Add current session active time to total time
        state.total.time += activeElapsedTime;
      }

      // Then start a new session (this resets session stats but preserves total)
      const updatedStats = StatsCalculationService.startNewSession(state);
      Object.assign(state, updatedStats);
      updateFormattedStats(state);
      state.lastError = null;
    },

    /**
     * Update formatted stats manually (if needed for performance optimization)
     */
    refreshFormattedStats: (state) => {
      updateFormattedStats(state);
    },

    /**
     * Handle tracking pause - record when pause started
     */
    pauseTracking: (state) => {
      logger.debug('Pausing tracking in stats', {
        component: 'statsSlice',
        action: 'pauseTracking',
      });

      const updatedStats = StatsCalculationService.pauseSession(state);
      Object.assign(state, updatedStats);
    },

    /**
     * Handle tracking resume - calculate and add paused time
     */
    resumeTracking: (state) => {
      logger.debug('Resuming tracking in stats', {
        component: 'statsSlice',
        action: 'resumeTracking',
      });

      const updatedStats = StatsCalculationService.resumeSession(state);
      Object.assign(state, updatedStats);
    },

    /**
     * Update the current session time for real-time timer
     * This action is called every second when tracking is active
     */
    /**
     * Recalculate area from current GPS path (called periodically during active sessions)
     */
    recalculateArea: (state, action: PayloadAction<SerializableGPSPoint[]>) => {
      logger.debug('Recalculating area from current GPS path', {
        component: 'statsSlice',
        action: 'recalculateArea',
        pathLength: action.payload.length,
      });

      const updatedStats = StatsCalculationService.recalculateAreaFromSerializablePoints(
        state,
        action.payload
      );
      Object.assign(state, updatedStats);
      updateFormattedStats(state);
    },

    updateSessionTimer: (state) => {
      // Only update if we have an active session and tracking is not paused
      if (state.currentSession && !state.currentSession.endTime) {
        const now = Date.now();
        const sessionStartTime = state.currentSession.startTime;
        const totalPausedTime = state.currentSession.totalPausedTime;

        // Calculate active elapsed time (excluding paused periods)
        const totalElapsedTime = now - sessionStartTime;
        const activeElapsedTime = totalElapsedTime - totalPausedTime;

        // Update session time with active time only (in milliseconds)
        state.session.time = activeElapsedTime;

        // Update formatted time displays with progressive formatting
        state.formattedStats.sessionTime =
          StatsCalculationService.formatTimeAsTimer(activeElapsedTime);

        // Total time = stored historical total + current session active elapsed time
        const currentTotalTime = state.total.time + activeElapsedTime;
        state.formattedStats.totalTime =
          StatsCalculationService.formatTimeAsTimer(currentTotalTime);
      }
    },
  },
});

export const {
  processGPSPoint,
  processGeoPoint,
  startNewSession,
  endSession,
  initializeFromHistory,
  loadPersistedStats,
  setLoading,
  setError,
  clearError,
  updateLastSaveTime,
  resetAllStats,
  resetSessionStats,
  refreshFormattedStats,
  pauseTracking,
  resumeTracking,
  updateSessionTimer,
  recalculateArea,
} = statsSlice.actions;

export default statsSlice.reducer;

// Selectors
export const selectStats = (state: { stats: StatsState }) => state.stats;
export const selectFormattedStats = (state: { stats: StatsState }) => state.stats.formattedStats;
export const selectTotalStats = (state: { stats: StatsState }) => state.stats.total;
export const selectSessionStats = (state: { stats: StatsState }) => state.stats.session;
export const selectIsStatsLoading = (state: { stats: StatsState }) => state.stats.isLoading;
export const selectStatsError = (state: { stats: StatsState }) => state.stats.lastError;
export const selectIsSessionActive = (state: { stats: StatsState }) =>
  state.stats.currentSession && !state.stats.currentSession.endTime;
