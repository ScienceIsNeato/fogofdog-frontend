/**
 * useStatsInitialization
 *
 * Manages stats system initialisation and periodic update effects for MapScreen.
 * Extracted from Map/index.tsx to keep that file within the LOC budget.
 */
import { useEffect } from 'react';
import { useAppDispatch, useAppSelector } from '../../../store/hooks';
import {
  setLoading,
  initializeFromHistory,
  recalculateArea,
} from '../../../store/slices/statsSlice';
import { StatsPersistenceService } from '../../../services/StatsPersistenceService';
import { AuthPersistenceService } from '../../../services/AuthPersistenceService';
import { logger } from '../../../utils/logger';

export const useStatsInitialization = () => {
  const dispatch = useAppDispatch();
  const totalStats = useAppSelector((state) => state.stats.total);
  const explorationState = useAppSelector((state) => state.exploration);
  const isSessionActive = useAppSelector(
    (state) => state.stats.currentSession && !state.stats.currentSession.endTime
  );

  // Initialize stats system
  useEffect(() => {
    const initializeStats = async () => {
      try {
        dispatch(setLoading(true));

        // Load all GPS history from exploration state and initialize stats from it
        const savedExploration = await AuthPersistenceService.getExplorationState();
        const gpsHistory = savedExploration?.path ?? [];
        dispatch(initializeFromHistory({ gpsHistory }));

        logger.info('Initialized stats from GPS history', {
          component: 'MapScreen',
          action: 'initializeStats',
          historyLength: gpsHistory.length,
        });
      } catch (error) {
        logger.error('Failed to initialize stats system', {
          component: 'MapScreen',
          action: 'initializeStats',
          errorMessage: error instanceof Error ? error.message : 'Unknown error',
        });
        dispatch(setLoading(false));
      }
    };

    initializeStats();
  }, [dispatch]);

  // Periodically recalculate area from current GPS path during active sessions
  useEffect(() => {
    if (!isSessionActive || explorationState.path.length < 3) {
      return; // Need active session and at least 3 points for area calculation
    }

    const recalculateAreaPeriodically = () => {
      // Convert GeoPoint[] to serializable GPS data for area calculation
      const serializableGPSData = explorationState.path.map((point) => ({
        latitude: point.latitude,
        longitude: point.longitude,
        timestamp: point.timestamp || Date.now(),
      }));

      dispatch(recalculateArea(serializableGPSData));

      logger.trace('Triggered periodic area recalculation', {
        component: 'MapScreen',
        action: 'recalculateAreaPeriodically',
        pathLength: explorationState.path.length,
      });
    };

    // Recalculate area every 30 seconds during active sessions
    const areaRecalcInterval = setInterval(recalculateAreaPeriodically, 30000);

    return () => clearInterval(areaRecalcInterval);
  }, [dispatch, isSessionActive, explorationState.path]);

  // Save stats periodically
  useEffect(() => {
    // Only save if we have meaningful stats data
    if (totalStats.distance > 0 || totalStats.area > 0 || totalStats.time > 0) {
      StatsPersistenceService.saveStats(totalStats);
    }
  }, [totalStats]);
};
