import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { GPSEvent } from '../../types/GPSEvent';
import { GeoPoint } from '../../types/user';
import {
  StatsCalculationService,
  StatsState as CalculationStatsState,
  ExplorationStats,
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
    totalDistance: '0m',
    totalArea: '0m²',
    totalTime: '0m',
    sessionDistance: '0m',
    sessionArea: '0m²',
    sessionTime: '0m',
  },
};

/**
 * Helper function to update formatted stats
 */
const updateFormattedStats = (state: StatsState): void => {
  state.formattedStats = {
    totalDistance: StatsCalculationService.formatDistance(state.total.distance),
    totalArea: StatsCalculationService.formatArea(state.total.area),
    totalTime: StatsCalculationService.formatTime(state.total.time),
    sessionDistance: StatsCalculationService.formatDistance(state.session.distance),
    sessionArea: StatsCalculationService.formatArea(state.session.area),
    sessionTime: StatsCalculationService.formatTime(state.session.time),
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
     * Update the current session time for real-time timer
     * This action is called every second when tracking is active
     */
    updateSessionTimer: (state) => {
      // Only update if we have an active session
      if (state.currentSession && !state.currentSession.endTime) {
        const now = Date.now();
        const sessionStartTime = state.currentSession.startTime;
        const elapsedTime = now - sessionStartTime;

        // Update session time (in milliseconds)
        state.session.time = elapsedTime;

        // Update formatted time display with MM:SS format for active sessions
        state.formattedStats.sessionTime = StatsCalculationService.formatTimeAsTimer(elapsedTime);

        logger.debug('Updated session timer', {
          component: 'statsSlice',
          action: 'updateSessionTimer',
          elapsedTime,
          formattedTime: state.formattedStats.sessionTime,
        });
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
  updateSessionTimer,
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
