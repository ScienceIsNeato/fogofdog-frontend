import { createSlice, PayloadAction, createAsyncThunk } from '@reduxjs/toolkit';
import { StreetSegment, StreetIntersection, BoundingBox } from '../../types/street';
import { streetDataService } from '../../services/StreetDataService';
import { logger } from '../../utils/logger';

export interface StreetState {
  streets: Record<string, StreetSegment>; // Indexed by ID
  intersections: Record<string, StreetIntersection>; // Indexed by ID
  exploredStreetIds: string[]; // IDs of explored streets
  exploredIntersectionIds: string[]; // IDs of explored intersections
  lastFetchTimestamp: number; // Cache invalidation
  isLoading: boolean;
  error: string | null;
}

const initialState: StreetState = {
  streets: {},
  intersections: {},
  exploredStreetIds: [],
  exploredIntersectionIds: [],
  lastFetchTimestamp: 0,
  isLoading: false,
  error: null,
};

/**
 * Async thunk to fetch streets from Overpass API
 */
export const fetchStreets = createAsyncThunk(
  'street/fetchStreets',
  async (bbox: BoundingBox, { rejectWithValue }) => {
    try {
      return await streetDataService.fetchStreetsInBoundingBox(bbox);
    } catch (error) {
      logger.error('Failed to fetch streets in Redux thunk', error, {
        component: 'streetSlice',
        action: 'fetchStreets',
      });
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

/**
 * Async thunk to fetch intersections from Overpass API
 */
export const fetchIntersections = createAsyncThunk(
  'street/fetchIntersections',
  async (bbox: BoundingBox, { rejectWithValue }) => {
    try {
      return await streetDataService.fetchIntersectionsInBoundingBox(bbox);
    } catch (error) {
      logger.error('Failed to fetch intersections in Redux thunk', error, {
        component: 'streetSlice',
        action: 'fetchIntersections',
      });
      return rejectWithValue(error instanceof Error ? error.message : 'Unknown error');
    }
  }
);

const streetSlice = createSlice({
  name: 'street',
  initialState,
  reducers: {
    /**
     * Mark a street as explored
     */
    markStreetExplored: (
      state,
      action: PayloadAction<{ streetId: string; timestamp?: number }>
    ) => {
      const { streetId, timestamp = Date.now() } = action.payload;
      const street = state.streets[streetId];

      if (street) {
        street.isExplored = true;
        street.exploredAt = timestamp;

        // Add to explored list if not already there
        if (!state.exploredStreetIds.includes(streetId)) {
          state.exploredStreetIds.push(streetId);
        }

        logger.debug(`Marked street as explored: ${street.name}`, {
          component: 'streetSlice',
          action: 'markStreetExplored',
          streetId,
        });
      }
    },

    /**
     * Mark an intersection as explored
     */
    markIntersectionExplored: (
      state,
      action: PayloadAction<{ intersectionId: string; timestamp?: number }>
    ) => {
      const { intersectionId, timestamp = Date.now() } = action.payload;
      const intersection = state.intersections[intersectionId];

      if (intersection) {
        intersection.isExplored = true;
        intersection.exploredAt = timestamp;

        // Add to explored list if not already there
        if (!state.exploredIntersectionIds.includes(intersectionId)) {
          state.exploredIntersectionIds.push(intersectionId);
        }

        logger.debug(`Marked intersection as explored: ${intersection.streetNames.join(' & ')}`, {
          component: 'streetSlice',
          action: 'markIntersectionExplored',
          intersectionId,
        });
      }
    },

    /**
     * Bulk mark streets and intersections as explored
     */
    bulkMarkExplored: (
      state,
      action: PayloadAction<{
        streetIds: string[];
        intersectionIds: string[];
        timestamp?: number;
      }>
    ) => {
      const { streetIds, intersectionIds, timestamp = Date.now() } = action.payload;

      // Mark streets
      for (const streetId of streetIds) {
        const street = state.streets[streetId];
        if (street) {
          street.isExplored = true;
          street.exploredAt = timestamp;

          if (!state.exploredStreetIds.includes(streetId)) {
            state.exploredStreetIds.push(streetId);
          }
        }
      }

      // Mark intersections
      for (const intersectionId of intersectionIds) {
        const intersection = state.intersections[intersectionId];
        if (intersection) {
          intersection.isExplored = true;
          intersection.exploredAt = timestamp;

          if (!state.exploredIntersectionIds.includes(intersectionId)) {
            state.exploredIntersectionIds.push(intersectionId);
          }
        }
      }

      logger.info('Bulk marked streets and intersections as explored', {
        component: 'streetSlice',
        action: 'bulkMarkExplored',
        streetsCount: streetIds.length,
        intersectionsCount: intersectionIds.length,
      });
    },

    /**
     * Add streets to state
     */
    addStreets: (state, action: PayloadAction<StreetSegment[]>) => {
      for (const street of action.payload) {
        state.streets[street.id] = street;

        // Maintain explored list consistency
        if (street.isExplored && !state.exploredStreetIds.includes(street.id)) {
          state.exploredStreetIds.push(street.id);
        }
      }
    },

    /**
     * Add intersections to state
     */
    addIntersections: (state, action: PayloadAction<StreetIntersection[]>) => {
      for (const intersection of action.payload) {
        state.intersections[intersection.id] = intersection;

        // Maintain explored list consistency
        if (intersection.isExplored && !state.exploredIntersectionIds.includes(intersection.id)) {
          state.exploredIntersectionIds.push(intersection.id);
        }
      }
    },

    /**
     * Reset all exploration data (clear explored status)
     */
    resetExplorationData: (state) => {
      // Reset explored status on all streets
      for (const streetId of state.exploredStreetIds) {
        const street = state.streets[streetId];
        if (street) {
          street.isExplored = false;
          delete street.exploredAt;
        }
      }

      // Reset explored status on all intersections
      for (const intersectionId of state.exploredIntersectionIds) {
        const intersection = state.intersections[intersectionId];
        if (intersection) {
          intersection.isExplored = false;
          delete intersection.exploredAt;
        }
      }

      // Clear explored lists
      state.exploredStreetIds = [];
      state.exploredIntersectionIds = [];

      logger.info('Reset all street exploration data', {
        component: 'streetSlice',
        action: 'resetExplorationData',
      });
    },

    /**
     * Clear all street and intersection data
     */
    clearAllStreetData: (state) => {
      state.streets = {};
      state.intersections = {};
      state.exploredStreetIds = [];
      state.exploredIntersectionIds = [];
      state.lastFetchTimestamp = 0;
      state.error = null;

      logger.info('Cleared all street data', {
        component: 'streetSlice',
        action: 'clearAllStreetData',
      });
    },

    /**
     * Set error state
     */
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },

    /**
     * Clear error state
     */
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    // Handle fetchStreets async thunk
    builder
      .addCase(fetchStreets.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchStreets.fulfilled, (state, action) => {
        state.isLoading = false;
        state.lastFetchTimestamp = Date.now();

        // Add streets to state
        for (const street of action.payload) {
          state.streets[street.id] = street;

          if (street.isExplored && !state.exploredStreetIds.includes(street.id)) {
            state.exploredStreetIds.push(street.id);
          }
        }

        logger.info(`Successfully loaded ${action.payload.length} streets`, {
          component: 'streetSlice',
          action: 'fetchStreets.fulfilled',
        });
      })
      .addCase(fetchStreets.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;

        logger.error('Failed to fetch streets', null, {
          component: 'streetSlice',
          action: 'fetchStreets.rejected',
          error: action.payload,
        });
      });

    // Handle fetchIntersections async thunk
    builder
      .addCase(fetchIntersections.pending, (state) => {
        state.isLoading = true;
        state.error = null;
      })
      .addCase(fetchIntersections.fulfilled, (state, action) => {
        state.isLoading = false;

        // Add intersections to state
        for (const intersection of action.payload) {
          state.intersections[intersection.id] = intersection;

          if (intersection.isExplored && !state.exploredIntersectionIds.includes(intersection.id)) {
            state.exploredIntersectionIds.push(intersection.id);
          }
        }

        logger.info(`Successfully loaded ${action.payload.length} intersections`, {
          component: 'streetSlice',
          action: 'fetchIntersections.fulfilled',
        });
      })
      .addCase(fetchIntersections.rejected, (state, action) => {
        state.isLoading = false;
        state.error = action.payload as string;

        logger.error('Failed to fetch intersections', null, {
          component: 'streetSlice',
          action: 'fetchIntersections.rejected',
          error: action.payload,
        });
      });
  },
});

export const {
  markStreetExplored,
  markIntersectionExplored,
  bulkMarkExplored,
  addStreets,
  addIntersections,
  resetExplorationData,
  clearAllStreetData,
  setError,
  clearError,
} = streetSlice.actions;

export default streetSlice.reducer;
