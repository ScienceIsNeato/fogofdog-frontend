import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { GeoPoint } from '../../types/user';
import { logger } from '../../utils/logger';
import { StoredLocationData } from '../../services/LocationStorageService';

const HOURS_PER_WEEK = 168;

interface ExplorationState {
  currentLocation: GeoPoint | null;
  zoomLevel: number;
  path: GeoPoint[];
  exploredAreas: GeoPoint[];
  isMapCenteredOnUser: boolean;
  isFollowModeActive: boolean;
  isTrackingPaused: boolean;
  backgroundLocationStatus: {
    isRunning: boolean;
    hasPermission: boolean;
    storedLocationCount: number;
  };
}

// Helper function to calculate distance between two geo-points (Haversine formula)
const haversineDistance = (coords1: GeoPoint, coords2: GeoPoint): number => {
  const R = 6371e3; // Earth radius in meters
  const lat1 = (coords1.latitude * Math.PI) / 180;
  const lat2 = (coords2.latitude * Math.PI) / 180;
  const deltaLat = ((coords2.latitude - coords1.latitude) * Math.PI) / 180;
  const deltaLon = ((coords2.longitude - coords1.longitude) * Math.PI) / 180;

  const a =
    Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
};

// Helper function to validate a GeoPoint
const isValidGeoPoint = (point: GeoPoint): boolean => {
  return (
    Number.isFinite(point.latitude) &&
    Number.isFinite(point.longitude) &&
    point.latitude >= -90 &&
    point.latitude <= 90 &&
    point.longitude >= -180 &&
    point.longitude <= 180 &&
    Number.isFinite(point.timestamp) &&
    point.timestamp > 0
  );
};

// Reduced minimum distance to ensure more regular fog holes
const MIN_DISTANCE_FOR_NEW_AREA = 20; // Only add new circle if current point is this far from an existing center

// Helper function to process a single background location
const processLocationForPath = (
  geoPoint: GeoPoint,
  currentPath: GeoPoint[]
): { shouldAdd: boolean; distance?: number } => {
  const lastPoint = currentPath.length > 0 ? currentPath[currentPath.length - 1] : null;

  if (!lastPoint) {
    return { shouldAdd: true };
  }

  try {
    const distance = haversineDistance(geoPoint, lastPoint);
    return {
      shouldAdd: distance >= MIN_DISTANCE_FOR_NEW_AREA,
      distance,
    };
  } catch (error) {
    logger.error(`Error calculating distance for background location: ${error}`, error, {
      component: 'explorationSlice',
      action: 'processBackgroundLocations',
    });
    return { shouldAdd: false };
  }
};

// Helper function to convert and validate stored location
const convertStoredLocation = (storedLocation: StoredLocationData): GeoPoint | null => {
  const geoPoint: GeoPoint = {
    latitude: storedLocation.latitude,
    longitude: storedLocation.longitude,
    timestamp: storedLocation.timestamp,
  };

  if (!isValidGeoPoint(geoPoint)) {
    logger.warn(`Invalid background geo point: ${JSON.stringify(geoPoint)}. Skipping.`, {
      component: 'explorationSlice',
      action: 'processBackgroundLocations',
    });
    return null;
  }

  return geoPoint;
};

const initialState: ExplorationState = {
  currentLocation: null,
  zoomLevel: 14,
  path: [],
  exploredAreas: [],
  isMapCenteredOnUser: false,
  isFollowModeActive: false,
  isTrackingPaused: false,
  backgroundLocationStatus: {
    isRunning: false,
    hasPermission: false,
    storedLocationCount: 0,
  },
};

const explorationSlice = createSlice({
  name: 'exploration',
  initialState,
  reducers: {
    reset: () => initialState,
    updateLocation: (state, action: PayloadAction<GeoPoint>) => {
      const newPoint = action.payload;

      if (!isValidGeoPoint(newPoint)) {
        logger.warn(`Invalid geo point received: ${JSON.stringify(newPoint)}. Skipping.`, {
          component: 'explorationSlice',
          action: 'updateLocation',
        });
        return;
      }

      // Check if this is the exact same location as current location (avoid redundant processing)
      if (
        state.currentLocation &&
        state.currentLocation.latitude === newPoint.latitude &&
        state.currentLocation.longitude === newPoint.longitude
      ) {
        // Skip logging for identical location updates to reduce log noise
        // Only log significant location changes
        return;
      }

      logger.info('📍 Processing location update', {
        component: 'explorationSlice',
        action: 'updateLocation',
        currentLocation: state.currentLocation
          ? `${state.currentLocation.latitude}, ${state.currentLocation.longitude}`
          : 'null',
        newPoint: `${newPoint.latitude}, ${newPoint.longitude}`,
        areIdentical: false,
      });

      // Auto-center on user location when first valid location is received
      if (!state.currentLocation && !state.isMapCenteredOnUser) {
        state.isMapCenteredOnUser = true;
        logger.info('Auto-centering map on first location received', {
          component: 'explorationSlice',
          action: 'updateLocation',
          location: newPoint,
        });
      }

      state.currentLocation = newPoint;

      const lastPoint = state.path.length > 0 ? state.path[state.path.length - 1] : null;

      if (!lastPoint) {
        logger.info(`📍 Adding first path point at: ${newPoint.latitude}, ${newPoint.longitude}`, {
          component: 'explorationSlice',
          action: 'updateLocation',
        });
        state.path.push({ ...newPoint });
        return;
      }

      try {
        const distance = haversineDistance(newPoint, lastPoint);

        if (distance >= MIN_DISTANCE_FOR_NEW_AREA) {
          state.path.push({ ...newPoint });
          logger.debug(
            `Added new path point at: ${newPoint.latitude}, ${newPoint.longitude}. Distance: ${distance.toFixed(2)}m. Total points: ${state.path.length}`,
            {
              component: 'explorationSlice',
              action: 'updateLocation',
            }
          );
        } else {
          // Log once, but don't spam logs for the same location
          logger.debug(
            `New point is too close to last point (${distance.toFixed(2)}m). Not adding to path. Total points: ${state.path.length}`,
            {
              component: 'explorationSlice',
              action: 'updateLocation',
            }
          );
        }
      } catch (error) {
        logger.error(`Error calculating distance: ${error}. Not adding to path.`, error, {
          component: 'explorationSlice',
          action: 'updateLocation',
        });
      }
    },
    updateZoom: (state, action: PayloadAction<number>) => {
      state.zoomLevel = action.payload;
    },
    addPathPoint: (state, action: PayloadAction<GeoPoint>) => {
      const point = action.payload;
      if (isValidGeoPoint(point)) {
        logger.debug(`Manually adding path point at: ${point.latitude}, ${point.longitude}`, {
          component: 'explorationSlice',
          action: 'addPathPoint',
        });
        state.path.push({ ...point });
      } else {
        logger.error('addPathPoint: Invalid position provided', {
          component: 'explorationSlice',
          action: 'addPathPoint',
          point,
        });
      }
    },
    setCenterOnUser: (state, action: PayloadAction<boolean>) => {
      state.isMapCenteredOnUser = action.payload;
    },
    toggleTracking: (state) => {
      state.isTrackingPaused = !state.isTrackingPaused;
      logger.info(`Tracking ${state.isTrackingPaused ? 'paused' : 'resumed'}`, {
        component: 'explorationSlice',
        action: 'toggleTracking',
        isTrackingPaused: state.isTrackingPaused,
      });
    },
    setTrackingPaused: (state, action: PayloadAction<boolean>) => {
      state.isTrackingPaused = action.payload;
      logger.info(`Tracking set to ${action.payload ? 'paused' : 'active'}`, {
        component: 'explorationSlice',
        action: 'setTrackingPaused',
        isTrackingPaused: action.payload,
      });
    },
    processBackgroundLocations: (state, action: PayloadAction<StoredLocationData[]>) => {
      const backgroundLocations = action.payload;

      if (backgroundLocations.length === 0) {
        return;
      }

      logger.debug('GPS INJECTION: Redux processing background locations', {
        component: 'explorationSlice',
        action: 'processBackgroundLocations',
        count: backgroundLocations.length,
        locations: backgroundLocations.map(
          (l) => `${l.latitude.toFixed(6)}, ${l.longitude.toFixed(6)}`
        ),
      });

      logger.info(`Processing ${backgroundLocations.length} background locations in Redux`, {
        component: 'explorationSlice',
        action: 'processBackgroundLocations',
        count: backgroundLocations.length,
      });

      let latestValidLocation: GeoPoint | null = null;

      // Process each stored location
      for (const storedLocation of backgroundLocations) {
        const geoPoint = convertStoredLocation(storedLocation);

        if (!geoPoint) {
          continue;
        }

        // Track the most recent valid location
        latestValidLocation = geoPoint;

        // Check if we should add this point to the path
        const pathResult = processLocationForPath(geoPoint, state.path);

        if (pathResult.shouldAdd) {
          state.path.push({ ...geoPoint });
        }
      }

      // Update current location to the most recent valid location
      if (latestValidLocation) {
        state.currentLocation = latestValidLocation;
      }
    },
    updateBackgroundLocationStatus: (
      state,
      action: PayloadAction<{
        isRunning: boolean;
        hasPermission: boolean;
        storedLocationCount: number;
      }>
    ) => {
      state.backgroundLocationStatus = action.payload;
    },
    restorePersistedState: (
      state,
      action: PayloadAction<{
        currentLocation: GeoPoint | null;
        path: GeoPoint[];
        exploredAreas: GeoPoint[];
        zoomLevel: number;
        isTrackingPaused?: boolean;
      }>
    ) => {
      const { currentLocation, path, exploredAreas, zoomLevel, isTrackingPaused } = action.payload;

      // Validate and restore the persisted state
      if (currentLocation && isValidGeoPoint(currentLocation)) {
        state.currentLocation = currentLocation;
      }

      // Validate and restore path points
      state.path = path.filter((point) => isValidGeoPoint(point));

      // Validate and restore explored areas
      state.exploredAreas = exploredAreas.filter((point) => isValidGeoPoint(point));

      // Restore zoom level with bounds checking
      if (zoomLevel >= 1 && zoomLevel <= 20) {
        state.zoomLevel = zoomLevel;
      }

      // Restore tracking pause state
      if (typeof isTrackingPaused === 'boolean') {
        state.isTrackingPaused = isTrackingPaused;
      }

      logger.info('Exploration state restored from persistence', {
        component: 'explorationSlice',
        action: 'restorePersistedState',
        pathPoints: state.path.length,
        exploredAreas: state.exploredAreas.length,
        hasCurrentLocation: state.currentLocation !== null,
        zoomLevel: state.zoomLevel,
        isTrackingPaused: state.isTrackingPaused,
      });
    },
    clearRecentData: (state, action: PayloadAction<number>) => {
      const hoursBack = action.payload;

      // For path and exploredAreas, we don't have timestamps, so we clear a percentage
      // This is a simplified approach - in a real implementation, you'd want timestamps on all points
      const clearRatio = Math.min(hoursBack / HOURS_PER_WEEK, 1); // Assume max 1 week for full clear
      const pointsToClear = Math.floor(state.path.length * clearRatio);

      if (pointsToClear > 0) {
        state.path = state.path.slice(0, -pointsToClear);
        state.exploredAreas = state.exploredAreas.slice(
          0,
          -Math.floor(state.exploredAreas.length * clearRatio)
        );

        logger.info(`Cleared recent exploration data (${hoursBack} hours)`, {
          component: 'explorationSlice',
          action: 'clearRecentData',
          hoursBack,
          pointsCleared: pointsToClear,
          remainingPathPoints: state.path.length,
          remainingExploredAreas: state.exploredAreas.length,
        });
      }
    },
    clearAllData: (state) => {
      const originalPathCount = state.path.length;
      const originalExploredCount = state.exploredAreas.length;

      state.path = [];
      state.exploredAreas = [];
      state.currentLocation = null;

      logger.info('Cleared all exploration data', {
        component: 'explorationSlice',
        action: 'clearAllData',
        clearedPathPoints: originalPathCount,
        clearedExploredAreas: originalExploredCount,
      });
    },
    toggleFollowMode: (state) => {
      state.isFollowModeActive = !state.isFollowModeActive;
    },
    setFollowMode: (state, action: PayloadAction<boolean>) => {
      state.isFollowModeActive = action.payload;
    },

    /**
     * Prepend historical GPS data to the beginning of the path
     * Used for performance testing with historical sessions
     */
    prependHistoricalData: (state, action: PayloadAction<{ historicalPoints: GeoPoint[] }>) => {
      const { historicalPoints } = action.payload;
      
      logger.info('Prepending historical GPS data to exploration path', {
        component: 'explorationSlice',
        action: 'prependHistoricalData',
        historicalPointsCount: historicalPoints.length,
        existingPathLength: state.path.length,
      });

      // Validate all historical points
      const validHistoricalPoints = historicalPoints.filter(point => {
        if (!isValidGeoPoint(point)) {
          logger.warn(`Invalid historical GPS point: ${JSON.stringify(point)}. Skipping.`, {
            component: 'explorationSlice',
            action: 'prependHistoricalData',
          });
          return false;
        }
        return true;
      });

      // Prepend historical points to the beginning of the path
      state.path = [...validHistoricalPoints, ...state.path];

      logger.info(`Historical data prepended successfully`, {
        component: 'explorationSlice',
        action: 'prependHistoricalData',
        validPointsAdded: validHistoricalPoints.length,
        newTotalPathLength: state.path.length,
      });
    },
  },
});

export const {
  updateLocation,
  updateZoom,
  reset,
  addPathPoint,
  setCenterOnUser,
  toggleTracking,
  setTrackingPaused,
  processBackgroundLocations,
  updateBackgroundLocationStatus,
  restorePersistedState,
  clearRecentData,
  clearAllData,
  toggleFollowMode,
  setFollowMode,
  prependHistoricalData,
} = explorationSlice.actions;
export default explorationSlice.reducer;
