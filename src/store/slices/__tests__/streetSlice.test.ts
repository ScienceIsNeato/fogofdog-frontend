import reducer, {
  markStreetExplored,
  markIntersectionExplored,
  bulkMarkExplored,
  addStreets,
  addIntersections,
  resetExplorationData,
  clearAllStreetData,
  setError,
  clearError,
  fetchStreets,
  fetchIntersections,
  StreetState,
} from '../streetSlice';
import { StreetSegment, StreetIntersection, StreetType } from '../../../types/street';
import { configureStore } from '@reduxjs/toolkit';

// Mock the StreetDataService
jest.mock('../../../services/StreetDataService', () => ({
  streetDataService: {
    fetchStreetsInBoundingBox: jest.fn(),
    fetchIntersectionsInBoundingBox: jest.fn(),
  },
}));

// Mock logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('streetSlice', () => {
  const mockStreet: StreetSegment = {
    id: '1',
    name: 'Main Street',
    type: StreetType.Residential,
    coordinates: [
      { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
      { latitude: 44.0463, longitude: -123.0235, timestamp: Date.now() },
    ],
    isExplored: false,
  };

  const mockIntersection: StreetIntersection = {
    id: 'int1',
    location: { latitude: 44.0462, longitude: -123.0236, timestamp: Date.now() },
    streetNames: ['Main St', 'First Ave'],
    streetIds: ['1', '2'],
    isExplored: false,
  };

  const initialState: StreetState = {
    streets: {},
    intersections: {},
    exploredStreetIds: [],
    exploredIntersectionIds: [],
    lastFetchTimestamp: 0,
    isLoading: false,
    error: null,
  };

  describe('initial state', () => {
    it('should return initial state', () => {
      expect(reducer(undefined, { type: 'unknown' })).toEqual(initialState);
    });
  });

  describe('markStreetExplored', () => {
    it('should mark street as explored', () => {
      const stateWithStreet = {
        ...initialState,
        streets: { [mockStreet.id]: mockStreet },
      };

      const timestamp = Date.now();
      const nextState = reducer(
        stateWithStreet,
        markStreetExplored({ streetId: mockStreet.id, timestamp })
      );

      expect(nextState.streets[mockStreet.id]?.isExplored).toBe(true);
      expect(nextState.streets[mockStreet.id]?.exploredAt).toBe(timestamp);
      expect(nextState.exploredStreetIds).toContain(mockStreet.id);
    });

    it('should not add duplicate to explored list', () => {
      const stateWithExploredStreet = {
        ...initialState,
        streets: { [mockStreet.id]: { ...mockStreet, isExplored: true } },
        exploredStreetIds: [mockStreet.id],
      };

      const nextState = reducer(
        stateWithExploredStreet,
        markStreetExplored({ streetId: mockStreet.id })
      );

      expect(nextState.exploredStreetIds).toHaveLength(1);
    });
  });

  describe('markIntersectionExplored', () => {
    it('should mark intersection as explored', () => {
      const stateWithIntersection = {
        ...initialState,
        intersections: { [mockIntersection.id]: mockIntersection },
      };

      const timestamp = Date.now();
      const nextState = reducer(
        stateWithIntersection,
        markIntersectionExplored({ intersectionId: mockIntersection.id, timestamp })
      );

      expect(nextState.intersections[mockIntersection.id]?.isExplored).toBe(true);
      expect(nextState.intersections[mockIntersection.id]?.exploredAt).toBe(timestamp);
      expect(nextState.exploredIntersectionIds).toContain(mockIntersection.id);
    });
  });

  describe('bulkMarkExplored', () => {
    it('should mark multiple streets and intersections as explored', () => {
      const street2: StreetSegment = { ...mockStreet, id: '2', name: 'Second St' };
      const intersection2: StreetIntersection = {
        ...mockIntersection,
        id: 'int2',
      };

      const stateWithData = {
        ...initialState,
        streets: {
          [mockStreet.id]: mockStreet,
          [street2.id]: street2,
        },
        intersections: {
          [mockIntersection.id]: mockIntersection,
          [intersection2.id]: intersection2,
        },
      };

      const nextState = reducer(
        stateWithData,
        bulkMarkExplored({
          streetIds: [mockStreet.id, street2.id],
          intersectionIds: [mockIntersection.id, intersection2.id],
        })
      );

      expect(nextState.exploredStreetIds).toHaveLength(2);
      expect(nextState.exploredIntersectionIds).toHaveLength(2);
      expect(nextState.streets[mockStreet.id]?.isExplored).toBe(true);
      expect(nextState.streets[street2.id]?.isExplored).toBe(true);
    });
  });

  describe('addStreets', () => {
    it('should add streets to state', () => {
      const streets = [mockStreet];
      const nextState = reducer(initialState, addStreets(streets));

      expect(nextState.streets[mockStreet.id]).toEqual(mockStreet);
    });

    it('should add explored street to explored list', () => {
      const exploredStreet = { ...mockStreet, isExplored: true };
      const nextState = reducer(initialState, addStreets([exploredStreet]));

      expect(nextState.exploredStreetIds).toContain(mockStreet.id);
    });
  });

  describe('addIntersections', () => {
    it('should add intersections to state', () => {
      const intersections = [mockIntersection];
      const nextState = reducer(initialState, addIntersections(intersections));

      expect(nextState.intersections[mockIntersection.id]).toEqual(mockIntersection);
    });
  });

  describe('resetExplorationData', () => {
    it('should reset exploration status of all streets and intersections', () => {
      const exploredStreet = { ...mockStreet, isExplored: true, exploredAt: Date.now() };
      const exploredIntersection = {
        ...mockIntersection,
        isExplored: true,
        exploredAt: Date.now(),
      };

      const stateWithExploredData = {
        ...initialState,
        streets: { [exploredStreet.id]: exploredStreet },
        intersections: { [exploredIntersection.id]: exploredIntersection },
        exploredStreetIds: [exploredStreet.id],
        exploredIntersectionIds: [exploredIntersection.id],
      };

      const nextState = reducer(stateWithExploredData, resetExplorationData());

      expect(nextState.streets[exploredStreet.id]?.isExplored).toBe(false);
      expect(nextState.streets[exploredStreet.id]?.exploredAt).toBeUndefined();
      expect(nextState.intersections[exploredIntersection.id]?.isExplored).toBe(false);
      expect(nextState.exploredStreetIds).toHaveLength(0);
      expect(nextState.exploredIntersectionIds).toHaveLength(0);
    });
  });

  describe('clearAllStreetData', () => {
    it('should clear all street and intersection data', () => {
      const stateWithData = {
        ...initialState,
        streets: { [mockStreet.id]: mockStreet },
        intersections: { [mockIntersection.id]: mockIntersection },
        exploredStreetIds: [mockStreet.id],
        exploredIntersectionIds: [mockIntersection.id],
        lastFetchTimestamp: Date.now(),
        error: 'Some error',
      };

      const nextState = reducer(stateWithData, clearAllStreetData());

      expect(nextState).toEqual(initialState);
    });
  });

  describe('setError', () => {
    it('should set error message', () => {
      const nextState = reducer(initialState, setError('Test error'));

      expect(nextState.error).toBe('Test error');
    });

    it('should clear error message', () => {
      const stateWithError = { ...initialState, error: 'Test error' };
      const nextState = reducer(stateWithError, setError(null));

      expect(nextState.error).toBeNull();
    });
  });

  describe('clearError', () => {
    it('should clear error message', () => {
      const stateWithError = { ...initialState, error: 'Test error' };
      const nextState = reducer(stateWithError, clearError());

      expect(nextState.error).toBeNull();
    });
  });

  describe('fetchStreets async thunk', () => {
    beforeEach(() => {
      configureStore({
        reducer: { street: reducer },
      });
    });

    it('should handle fetchStreets pending', () => {
      const action = { type: fetchStreets.pending.type };
      const nextState = reducer(initialState, action);

      expect(nextState.isLoading).toBe(true);
      expect(nextState.error).toBeNull();
    });

    it('should handle fetchStreets fulfilled', () => {
      const streets = [mockStreet];
      const action = {
        type: fetchStreets.fulfilled.type,
        payload: streets,
      };

      const nextState = reducer(initialState, action);

      expect(nextState.isLoading).toBe(false);
      expect(nextState.streets[mockStreet.id]).toEqual(mockStreet);
      expect(nextState.lastFetchTimestamp).toBeGreaterThan(0);
    });

    it('should handle fetchStreets rejected', () => {
      const action = {
        type: fetchStreets.rejected.type,
        payload: 'Network error',
      };

      const nextState = reducer(initialState, action);

      expect(nextState.isLoading).toBe(false);
      expect(nextState.error).toBe('Network error');
    });
  });

  describe('fetchIntersections async thunk', () => {
    it('should handle fetchIntersections pending', () => {
      const action = { type: fetchIntersections.pending.type };
      const nextState = reducer(initialState, action);

      expect(nextState.isLoading).toBe(true);
      expect(nextState.error).toBeNull();
    });

    it('should handle fetchIntersections fulfilled', () => {
      const intersections = [mockIntersection];
      const action = {
        type: fetchIntersections.fulfilled.type,
        payload: intersections,
      };

      const nextState = reducer(initialState, action);

      expect(nextState.isLoading).toBe(false);
      expect(nextState.intersections[mockIntersection.id]).toEqual(mockIntersection);
    });

    it('should handle fetchIntersections rejected', () => {
      const action = {
        type: fetchIntersections.rejected.type,
        payload: 'Network error',
      };

      const nextState = reducer(initialState, action);

      expect(nextState.isLoading).toBe(false);
      expect(nextState.error).toBe('Network error');
    });
  });

  describe('complex scenarios', () => {
    it('should handle multiple operations in sequence', () => {
      let state = initialState;

      // Add streets
      state = reducer(state, addStreets([mockStreet]));

      // Mark as explored
      state = reducer(state, markStreetExplored({ streetId: mockStreet.id }));

      // Verify final state
      expect(state.streets[mockStreet.id]?.isExplored).toBe(true);
      expect(state.exploredStreetIds).toContain(mockStreet.id);

      // Reset exploration
      state = reducer(state, resetExplorationData());

      expect(state.streets[mockStreet.id]?.isExplored).toBe(false);
      expect(state.exploredStreetIds).toHaveLength(0);
    });
  });
});
