import { configureStore } from '@reduxjs/toolkit';
import streetReducer, {
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
} from '../streetSlice';
import type { StreetSegment, Intersection } from '../../../types/street';

jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

// Minimal inline fixtures — no dependency on StreetDataService
const testSegments: StreetSegment[] = [
  {
    id: 'seg_a',
    name: 'Maple St',
    points: [
      { latitude: 44.0, longitude: -123.0 },
      { latitude: 44.0, longitude: -123.01 },
    ],
    startNodeId: 'int_1',
    endNodeId: 'int_2',
    lengthMeters: 200,
  },
  {
    id: 'seg_b',
    name: 'Oak Ave',
    points: [
      { latitude: 44.0, longitude: -123.0 },
      { latitude: 44.01, longitude: -123.0 },
    ],
    startNodeId: 'int_1',
    endNodeId: 'int_3',
    lengthMeters: 180,
  },
];

const testIntersections: Intersection[] = [
  {
    id: 'int_1',
    latitude: 44.0,
    longitude: -123.0,
    streetNames: ['Maple St', 'Oak Ave'],
    connectedSegmentIds: ['seg_a', 'seg_b'],
  },
  {
    id: 'int_2',
    latitude: 44.0,
    longitude: -123.01,
    streetNames: ['Maple St'],
    connectedSegmentIds: ['seg_a'],
  },
  {
    id: 'int_3',
    latitude: 44.01,
    longitude: -123.0,
    streetNames: ['Oak Ave'],
    connectedSegmentIds: ['seg_b'],
  },
];

describe('street slice', () => {
  const store = configureStore({
    reducer: { street: streetReducer },
  });

  beforeEach(() => {
    store.dispatch(resetStreetSlice());
    jest.clearAllMocks();
  });

  it('should handle initial state', () => {
    expect(store.getState().street).toEqual({
      segments: {},
      intersections: {},
      exploredSegmentIds: [],
      exploredIntersectionIds: [],
      preferStreets: false,
      preferUnexplored: false,
      isLoading: false,
      lastFetchedAt: null,
      error: null,
    });
  });

  describe('loadStreetData', () => {
    it('should populate segments and intersections keyed by id', () => {
      store.dispatch(loadStreetData({ segments: testSegments, intersections: testIntersections }));

      const state = store.getState().street;
      expect(Object.keys(state.segments)).toHaveLength(2);
      expect(Object.keys(state.intersections)).toHaveLength(3);
      expect(state.segments['seg_a']?.name).toBe('Maple St');
      expect(state.intersections['int_1']?.streetNames).toEqual(['Maple St', 'Oak Ave']);
    });

    it('should set lastFetchedAt and clear loading / error', () => {
      store.dispatch(setStreetLoading(true));
      store.dispatch(setStreetError('prior error'));

      store.dispatch(loadStreetData({ segments: testSegments, intersections: testIntersections }));

      const state = store.getState().street;
      expect(state.isLoading).toBe(false);
      expect(state.error).toBeNull();
      expect(state.lastFetchedAt).toBeLessThanOrEqual(Date.now());
    });

    it('should log on load', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      store.dispatch(loadStreetData({ segments: testSegments, intersections: testIntersections }));
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Loaded 2 street segments'),
        expect.any(Object)
      );
    });
  });

  describe('loading and error states', () => {
    it('should toggle isLoading', () => {
      store.dispatch(setStreetLoading(true));
      expect(store.getState().street.isLoading).toBe(true);

      store.dispatch(setStreetLoading(false));
      expect(store.getState().street.isLoading).toBe(false);
    });

    it('should set error and clear isLoading', () => {
      store.dispatch(setStreetLoading(true));
      store.dispatch(setStreetError('network timeout'));

      const state = store.getState().street;
      expect(state.error).toBe('network timeout');
      expect(state.isLoading).toBe(false);
    });

    it('should clear error when set to null', () => {
      store.dispatch(setStreetError('oops'));
      store.dispatch(setStreetError(null));
      expect(store.getState().street.error).toBeNull();
    });
  });

  describe('segment exploration marking', () => {
    it('should mark a single segment explored', () => {
      store.dispatch(markSegmentExplored('seg_a'));
      expect(store.getState().street.exploredSegmentIds).toContain('seg_a');
    });

    it('should not duplicate segment IDs', () => {
      store.dispatch(markSegmentExplored('seg_a'));
      store.dispatch(markSegmentExplored('seg_a'));
      expect(store.getState().street.exploredSegmentIds).toHaveLength(1);
    });

    it('should batch-mark multiple segments', () => {
      store.dispatch(markSegmentsExplored(['seg_a', 'seg_b']));
      expect(store.getState().street.exploredSegmentIds).toHaveLength(2);
    });

    it('should deduplicate when batch includes already-explored IDs', () => {
      store.dispatch(markSegmentExplored('seg_a'));
      store.dispatch(markSegmentsExplored(['seg_a', 'seg_b']));
      expect(store.getState().street.exploredSegmentIds).toHaveLength(2);
    });
  });

  describe('intersection exploration marking', () => {
    it('should mark a single intersection explored', () => {
      store.dispatch(markIntersectionExplored('int_1'));
      expect(store.getState().street.exploredIntersectionIds).toContain('int_1');
    });

    it('should not duplicate intersection IDs', () => {
      store.dispatch(markIntersectionExplored('int_1'));
      store.dispatch(markIntersectionExplored('int_1'));
      expect(store.getState().street.exploredIntersectionIds).toHaveLength(1);
    });

    it('should batch-mark and deduplicate intersections', () => {
      store.dispatch(markIntersectionExplored('int_1'));
      store.dispatch(markIntersectionsExplored(['int_1', 'int_2', 'int_3']));
      expect(store.getState().street.exploredIntersectionIds).toHaveLength(3);
    });
  });

  describe('preference toggles', () => {
    it('should set preferStreets true then false', () => {
      store.dispatch(setPreferStreets(true));
      expect(store.getState().street.preferStreets).toBe(true);

      store.dispatch(setPreferStreets(false));
      expect(store.getState().street.preferStreets).toBe(false);
    });

    it('should set preferUnexplored', () => {
      store.dispatch(setPreferUnexplored(true));
      expect(store.getState().street.preferUnexplored).toBe(true);
    });

    it('should log preference changes', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      store.dispatch(setPreferStreets(true));
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Prefer streets set to true'),
        expect.any(Object)
      );

      store.dispatch(setPreferUnexplored(true));
      expect(logger.info).toHaveBeenCalledWith(
        expect.stringContaining('Prefer unexplored set to true'),
        expect.any(Object)
      );
    });
  });

  describe('clearStreetExplorationData', () => {
    it('should clear explored IDs without touching loaded streets', () => {
      store.dispatch(loadStreetData({ segments: testSegments, intersections: testIntersections }));
      store.dispatch(markSegmentsExplored(['seg_a', 'seg_b']));
      store.dispatch(markIntersectionsExplored(['int_1']));

      store.dispatch(clearStreetExplorationData());

      const state = store.getState().street;
      expect(state.exploredSegmentIds).toHaveLength(0);
      expect(state.exploredIntersectionIds).toHaveLength(0);
      expect(Object.keys(state.segments)).toHaveLength(2); // data remains
    });
  });

  describe('resetStreetSlice', () => {
    it('should reset all state to initial values', () => {
      store.dispatch(loadStreetData({ segments: testSegments, intersections: testIntersections }));
      store.dispatch(setPreferStreets(true));
      store.dispatch(markSegmentExplored('seg_a'));

      store.dispatch(resetStreetSlice());

      expect(store.getState().street).toEqual({
        segments: {},
        intersections: {},
        exploredSegmentIds: [],
        exploredIntersectionIds: [],
        preferStreets: false,
        preferUnexplored: false,
        isLoading: false,
        lastFetchedAt: null,
        error: null,
      });
    });
  });
});
