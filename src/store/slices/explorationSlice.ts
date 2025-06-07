import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { GeoPoint } from '../../types/user';
import { logger } from '../../utils/logger';
import { StoredLocationData } from '../../services/LocationStorageService';

interface ExplorationState {
  currentLocation: GeoPoint | null;
  zoomLevel: number;
  path: GeoPoint[];
  exploredAreas: GeoPoint[];
  isMapCenteredOnUser: boolean;
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
    point.longitude <= 180
  );
};

// Reduced minimum distance to ensure more regular fog holes
const MIN_DISTANCE_FOR_NEW_AREA = 20; // Only add new circle if current point is this far from an existing center

const initialState: ExplorationState = {
  currentLocation: null,
  zoomLevel: 14,
  path: [],
  exploredAreas: [],
  isMapCenteredOnUser: false,
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

      state.currentLocation = newPoint;

      const lastPoint = state.path.length > 0 ? state.path[state.path.length - 1] : null;

      if (!lastPoint) {
        // console.log(`[explorationSlice] Adding first path point at: ${newPoint.latitude}, ${newPoint.longitude}`);
        state.path.push({ ...newPoint });
        return;
      }

      try {
        const distance = haversineDistance(newPoint, lastPoint);

        if (distance >= MIN_DISTANCE_FOR_NEW_AREA) {
          // Note: This constant was MIN_DISTANCE_FOR_NEW_AREA, might relate to explored area logic if path drives it
          // console.log(`[explorationSlice] Adding new path point at: ${newPoint.latitude}, ${newPoint.longitude}. Distance from last: ${distance.toFixed(2)}m. Total points: ${state.path.length + 1}`);
          state.path.push({ ...newPoint });
        } else {
          // console.log(`[explorationSlice] New point is too close to last point (${distance.toFixed(2)}m). Not adding to path. Total points: ${state.path.length}`);
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
        // console.log(`[explorationSlice] Manually adding path point at: ${point.latitude}, ${point.longitude}`);
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
    processBackgroundLocations: (state, action: PayloadAction<StoredLocationData[]>) => {
      const backgroundLocations = action.payload;

      if (backgroundLocations.length === 0) {
        return;
      }

      logger.info(`Processing ${backgroundLocations.length} background locations in Redux`, {
        component: 'explorationSlice',
        action: 'processBackgroundLocations',
        count: backgroundLocations.length,
      });

      let latestValidLocation: GeoPoint | null = null;

      // Convert stored locations to GeoPoints and process them
      for (const storedLocation of backgroundLocations) {
        const geoPoint: GeoPoint = {
          latitude: storedLocation.latitude,
          longitude: storedLocation.longitude,
        };

        if (!isValidGeoPoint(geoPoint)) {
          logger.warn(`Invalid background geo point: ${JSON.stringify(geoPoint)}. Skipping.`, {
            component: 'explorationSlice',
            action: 'processBackgroundLocations',
          });
          continue;
        }

        // Track the most recent valid location
        latestValidLocation = geoPoint;

        // Add to path if it meets distance requirements
        const lastPoint = state.path.length > 0 ? state.path[state.path.length - 1] : null;

        if (!lastPoint) {
          state.path.push({ ...geoPoint });
        } else {
          try {
            const distance = haversineDistance(geoPoint, lastPoint);
            if (distance >= MIN_DISTANCE_FOR_NEW_AREA) {
              state.path.push({ ...geoPoint });
            }
          } catch (error) {
            logger.error(`Error calculating distance for background location: ${error}`, error, {
              component: 'explorationSlice',
              action: 'processBackgroundLocations',
            });
          }
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
  },
});

export const {
  updateLocation,
  updateZoom,
  reset,
  addPathPoint,
  setCenterOnUser,
  processBackgroundLocations,
  updateBackgroundLocationStatus,
} = explorationSlice.actions;
export default explorationSlice.reducer;
