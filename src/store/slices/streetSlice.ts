import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { StreetSegment, Intersection } from '../../types/street';
import { logger } from '../../utils/logger';

interface StreetSliceState {
  segments: Record<string, StreetSegment>;
  intersections: Record<string, Intersection>;
  exploredSegmentIds: string[];
  exploredIntersectionIds: string[];
  preferStreets: boolean;
  preferUnexplored: boolean;
  isLoading: boolean;
  lastFetchedAt: number | null;
  error: string | null;
}

const initialState: StreetSliceState = {
  segments: {},
  intersections: {},
  exploredSegmentIds: [],
  exploredIntersectionIds: [],
  preferStreets: false,
  preferUnexplored: false,
  isLoading: false,
  lastFetchedAt: null,
  error: null,
};

const streetSlice = createSlice({
  name: 'street',
  initialState,
  reducers: {
    loadStreetData: (
      state,
      action: PayloadAction<{ segments: StreetSegment[]; intersections: Intersection[] }>
    ) => {
      const { segments, intersections } = action.payload;
      state.segments = Object.fromEntries(segments.map((s) => [s.id, s]));
      state.intersections = Object.fromEntries(intersections.map((i) => [i.id, i]));
      state.lastFetchedAt = Date.now();
      state.isLoading = false;
      state.error = null;
      logger.info(
        `Loaded ${segments.length} street segments and ${intersections.length} intersections`,
        { component: 'streetSlice', action: 'loadStreetData' }
      );
    },

    setStreetLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },

    setStreetError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },

    markSegmentExplored: (state, action: PayloadAction<string>) => {
      if (!state.exploredSegmentIds.includes(action.payload)) {
        state.exploredSegmentIds.push(action.payload);
      }
    },

    markIntersectionExplored: (state, action: PayloadAction<string>) => {
      if (!state.exploredIntersectionIds.includes(action.payload)) {
        state.exploredIntersectionIds.push(action.payload);
      }
    },

    markSegmentsExplored: (state, action: PayloadAction<string[]>) => {
      for (const id of action.payload) {
        if (!state.exploredSegmentIds.includes(id)) {
          state.exploredSegmentIds.push(id);
        }
      }
    },

    markIntersectionsExplored: (state, action: PayloadAction<string[]>) => {
      for (const id of action.payload) {
        if (!state.exploredIntersectionIds.includes(id)) {
          state.exploredIntersectionIds.push(id);
        }
      }
    },

    setPreferStreets: (state, action: PayloadAction<boolean>) => {
      state.preferStreets = action.payload;
      logger.info(`Prefer streets set to ${String(action.payload)}`, {
        component: 'streetSlice',
        action: 'setPreferStreets',
      });
    },

    setPreferUnexplored: (state, action: PayloadAction<boolean>) => {
      state.preferUnexplored = action.payload;
      logger.info(`Prefer unexplored set to ${String(action.payload)}`, {
        component: 'streetSlice',
        action: 'setPreferUnexplored',
      });
    },

    clearStreetExplorationData: (state) => {
      state.exploredSegmentIds = [];
      state.exploredIntersectionIds = [];
    },

    resetStreetSlice: () => initialState,
  },
});

export const {
  loadStreetData,
  setStreetLoading,
  setStreetError,
  markSegmentExplored,
  markIntersectionExplored,
  markSegmentsExplored,
  markIntersectionsExplored,
  setPreferStreets,
  setPreferUnexplored,
  clearStreetExplorationData,
  resetStreetSlice,
} = streetSlice.actions;

export default streetSlice.reducer;
