import { configureStore } from '@reduxjs/toolkit';
import explorationReducer, {
  updateLocation,
  updateZoom,
  reset,
  setCenterOnUser,
  addPathPoint,
  toggleTracking,
  setTrackingPaused,
  processBackgroundLocations,
  updateBackgroundLocationStatus,
  toggleFollowMode,
  setFollowMode,
} from '../explorationSlice';
import type { StoredLocationData } from '../../../services/LocationStorageService';

// Mock the logger
jest.mock('../../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

describe('exploration slice', () => {
  const store = configureStore({
    reducer: {
      exploration: explorationReducer,
    },
  });

  beforeEach(() => {
    store.dispatch(reset());
    jest.clearAllMocks();
  });

  it('should handle initial state', () => {
    expect(store.getState().exploration).toEqual({
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
    });
  });

  it('should handle updateLocation - first point', () => {
    const location = {
      latitude: 41.6867,
      longitude: -91.5802,
      timestamp: Date.now(),
    };

    store.dispatch(updateLocation(location));
    const state = store.getState().exploration;

    expect(state.currentLocation).toEqual(location);
    expect(state.path).toHaveLength(1);
    expect(state.path[0]).toEqual(location);
  });

  it('should handle updateZoom', () => {
    store.dispatch(updateZoom(16));
    expect(store.getState().exploration.zoomLevel).toBe(16);
  });

  it('should accumulate path points when far enough apart', () => {
    const locations = [
      { latitude: 41.6867, longitude: -91.5802, timestamp: Date.now() },
      // This point is far enough away to be added
      { latitude: 41.6877, longitude: -91.5812, timestamp: Date.now() + 1000 },
      // This point is too close to the previous one and should be skipped
      { latitude: 41.6878, longitude: -91.5813, timestamp: Date.now() + 2000 },
      // This point is far enough from the last added point
      { latitude: 41.689, longitude: -91.5825, timestamp: Date.now() + 3000 },
    ];

    locations.forEach((location) => {
      store.dispatch(updateLocation(location));
    });

    const state = store.getState().exploration;
    // Should only have 3 points (not 4) because one was too close
    expect(state.path).toHaveLength(3);
    expect(state.path[0]).toEqual(locations[0]);
    expect(state.path[1]).toEqual(locations[1]);
    expect(state.path[2]).toEqual(locations[3]); // Skipped locations[2]
  });

  it('should handle setCenterOnUser', () => {
    // Initially false
    expect(store.getState().exploration.isMapCenteredOnUser).toBe(false);

    // Set to true
    store.dispatch(setCenterOnUser(true));
    expect(store.getState().exploration.isMapCenteredOnUser).toBe(true);

    // Set back to false
    store.dispatch(setCenterOnUser(false));
    expect(store.getState().exploration.isMapCenteredOnUser).toBe(false);
  });

  it('should reset isMapCenteredOnUser when reset is called', () => {
    // Set some state
    store.dispatch(setCenterOnUser(true));
    store.dispatch(
      updateLocation({ latitude: 41.6867, longitude: -91.5802, timestamp: Date.now() })
    );

    // Reset
    store.dispatch(reset());

    // Check all state is reset including isMapCenteredOnUser
    const state = store.getState().exploration;
    expect(state.isMapCenteredOnUser).toBe(false);
    expect(state.currentLocation).toBeNull();
    expect(state.path).toHaveLength(0);
  });

  describe('updateLocation validation', () => {
    it('should reject invalid GeoPoint with invalid latitude', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      const invalidLocation = {
        latitude: 91, // Invalid: exceeds 90
        longitude: -91.5802,
        timestamp: Date.now(),
      };

      store.dispatch(updateLocation(invalidLocation));
      const state = store.getState().exploration;

      expect(state.currentLocation).toBeNull();
      expect(state.path).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid geo point received'),
        expect.objectContaining({
          component: 'explorationSlice',
          action: 'updateLocation',
        })
      );
    });

    it('should reject invalid GeoPoint with invalid longitude', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      const invalidLocation = {
        latitude: 41.6867,
        longitude: -181, // Invalid: less than -180
        timestamp: Date.now(),
      };

      store.dispatch(updateLocation(invalidLocation));
      const state = store.getState().exploration;

      expect(state.currentLocation).toBeNull();
      expect(state.path).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid geo point received'),
        expect.any(Object)
      );
    });

    it('should reject non-finite coordinates', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      const invalidLocation = {
        latitude: NaN,
        longitude: -91.5802,
        timestamp: Date.now(),
      };

      store.dispatch(updateLocation(invalidLocation));
      const state = store.getState().exploration;

      expect(state.currentLocation).toBeNull();
      expect(state.path).toHaveLength(0);
      expect(logger.warn).toHaveBeenCalled();
    });
  });

  describe('addPathPoint', () => {
    it('should add valid path point', () => {
      const point = { latitude: 41.6867, longitude: -91.5802, timestamp: Date.now() };

      store.dispatch(addPathPoint(point));
      const state = store.getState().exploration;

      expect(state.path).toHaveLength(1);
      expect(state.path[0]).toEqual(point);
    });

    it('should reject invalid path point and log error', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      const invalidPoint = { latitude: 91, longitude: -91.5802, timestamp: Date.now() };

      store.dispatch(addPathPoint(invalidPoint));
      const state = store.getState().exploration;

      expect(state.path).toHaveLength(0);
      expect(logger.error).toHaveBeenCalledWith(
        'addPathPoint: Invalid position provided',
        expect.objectContaining({
          component: 'explorationSlice',
          action: 'addPathPoint',
          point: invalidPoint,
        })
      );
    });
  });

  describe('processBackgroundLocations', () => {
    it('should process empty array without errors', () => {
      const emptyLocations: StoredLocationData[] = [];

      store.dispatch(processBackgroundLocations(emptyLocations));
      const state = store.getState().exploration;

      expect(state.currentLocation).toBeNull();
      expect(state.path).toHaveLength(0);
    });

    it('should process valid background locations', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      const backgroundLocations: StoredLocationData[] = [
        {
          latitude: 41.6867,
          longitude: -91.5802,
          timestamp: 1640995200000,
        },
        {
          latitude: 41.6877,
          longitude: -91.5812,
          timestamp: 1640995260000,
        },
      ];

      store.dispatch(processBackgroundLocations(backgroundLocations));
      const state = store.getState().exploration;

      expect(state.currentLocation).toEqual({
        latitude: 41.6877,
        longitude: -91.5812,
        timestamp: 1640995260000,
      });
      expect(state.path).toHaveLength(2);
      expect(logger.info).toHaveBeenCalledWith(
        'Processing 2 background locations in Redux',
        expect.objectContaining({
          component: 'explorationSlice',
          action: 'processBackgroundLocations',
          count: 2,
        })
      );
    });

    it('should skip invalid background locations', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      const backgroundLocations: StoredLocationData[] = [
        {
          latitude: 41.6867,
          longitude: -91.5802,
          timestamp: 1640995200000,
        },
        {
          latitude: 91, // Invalid
          longitude: -91.5812,
          timestamp: 1640995260000,
        },
        {
          latitude: 41.6877,
          longitude: -91.5822,
          timestamp: 1640995320000,
        },
      ];

      store.dispatch(processBackgroundLocations(backgroundLocations));
      const state = store.getState().exploration;

      expect(state.currentLocation).toEqual({
        latitude: 41.6877,
        longitude: -91.5822,
        timestamp: 1640995320000,
      });
      expect(state.path).toHaveLength(2); // Only valid locations added
      expect(logger.warn).toHaveBeenCalledWith(
        expect.stringContaining('Invalid background geo point'),
        expect.objectContaining({
          component: 'explorationSlice',
          action: 'processBackgroundLocations',
        })
      );
    });

    it('should handle distance calculation errors', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      // Mock haversineDistance to throw an error
      const originalMath = Math.sqrt;
      Math.sqrt = jest.fn(() => {
        throw new Error('Math error');
      });

      const backgroundLocations: StoredLocationData[] = [
        {
          latitude: 41.6867,
          longitude: -91.5802,
          timestamp: 1640995200000,
        },
        {
          latitude: 41.6877,
          longitude: -91.5812,
          timestamp: 1640995260000,
        },
      ];

      store.dispatch(processBackgroundLocations(backgroundLocations));

      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error calculating distance for background location'),
        expect.any(Error),
        expect.objectContaining({
          component: 'explorationSlice',
          action: 'processBackgroundLocations',
        })
      );

      // Restore Math.sqrt
      Math.sqrt = originalMath;
    });
  });

  describe('updateBackgroundLocationStatus', () => {
    it('should update background location status', () => {
      const status = {
        isRunning: true,
        hasPermission: true,
        storedLocationCount: 5,
      };

      store.dispatch(updateBackgroundLocationStatus(status));
      const state = store.getState().exploration;

      expect(state.backgroundLocationStatus).toEqual(status);
    });

    it('should update with different status values', () => {
      const status1 = {
        isRunning: false,
        hasPermission: true,
        storedLocationCount: 0,
      };

      const status2 = {
        isRunning: true,
        hasPermission: false,
        storedLocationCount: 10,
      };

      store.dispatch(updateBackgroundLocationStatus(status1));
      expect(store.getState().exploration.backgroundLocationStatus).toEqual(status1);

      store.dispatch(updateBackgroundLocationStatus(status2));
      expect(store.getState().exploration.backgroundLocationStatus).toEqual(status2);
    });
  });

  describe('distance calculation error handling', () => {
    it('should handle error in updateLocation distance calculation', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      // Add first point
      store.dispatch(
        updateLocation({ latitude: 41.6867, longitude: -91.5802, timestamp: Date.now() })
      );

      // Mock Math.sqrt to throw an error for the second point
      const originalMath = Math.sqrt;
      Math.sqrt = jest.fn(() => {
        throw new Error('Distance calculation error');
      });

      // Try to add second point
      store.dispatch(
        updateLocation({ latitude: 41.6877, longitude: -91.5812, timestamp: Date.now() + 1000 })
      );

      const state = store.getState().exploration;
      expect(state.path).toHaveLength(1); // Second point not added due to error
      expect(logger.error).toHaveBeenCalledWith(
        expect.stringContaining('Error calculating distance'),
        expect.any(Error),
        expect.objectContaining({
          component: 'explorationSlice',
          action: 'updateLocation',
        })
      );

      // Restore Math.sqrt
      Math.sqrt = originalMath;
    });
  });

  describe('tracking control', () => {
    it('should handle toggleTracking', () => {
      // Initially not paused
      expect(store.getState().exploration.isTrackingPaused).toBe(false);

      // Toggle to paused
      store.dispatch(toggleTracking());
      expect(store.getState().exploration.isTrackingPaused).toBe(true);

      // Toggle back to active
      store.dispatch(toggleTracking());
      expect(store.getState().exploration.isTrackingPaused).toBe(false);
    });

    it('should handle setTrackingPaused', () => {
      // Initially not paused
      expect(store.getState().exploration.isTrackingPaused).toBe(false);

      // Set to paused
      store.dispatch(setTrackingPaused(true));
      expect(store.getState().exploration.isTrackingPaused).toBe(true);

      // Set to active
      store.dispatch(setTrackingPaused(false));
      expect(store.getState().exploration.isTrackingPaused).toBe(false);
    });

    it('should log tracking state changes', () => {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { logger } = require('../../../utils/logger');

      store.dispatch(toggleTracking());
      expect(logger.info).toHaveBeenCalledWith(
        'Tracking paused',
        expect.objectContaining({
          component: 'explorationSlice',
          action: 'toggleTracking',
          isTrackingPaused: true,
        })
      );

      store.dispatch(setTrackingPaused(false));
      expect(logger.info).toHaveBeenCalledWith(
        'Tracking set to active',
        expect.objectContaining({
          component: 'explorationSlice',
          action: 'setTrackingPaused',
          isTrackingPaused: false,
        })
      );
    });

    it('should reset tracking pause state on reset', () => {
      // Set to paused
      store.dispatch(setTrackingPaused(true));
      expect(store.getState().exploration.isTrackingPaused).toBe(true);

      // Reset
      store.dispatch(reset());
      expect(store.getState().exploration.isTrackingPaused).toBe(false);
    });
  });

  describe('Follow Mode Actions', () => {
    it('should initialize with follow mode inactive', () => {
      expect(store.getState().exploration.isFollowModeActive).toBe(false);
    });

    it('should toggle follow mode from false to true', () => {
      store.dispatch(toggleFollowMode());
      expect(store.getState().exploration.isFollowModeActive).toBe(true);
    });

    it('should toggle follow mode from true to false', () => {
      // Set to true first
      store.dispatch(setFollowMode(true));
      expect(store.getState().exploration.isFollowModeActive).toBe(true);

      // Toggle should set to false
      store.dispatch(toggleFollowMode());
      expect(store.getState().exploration.isFollowModeActive).toBe(false);
    });

    it('should set follow mode to true with setFollowMode', () => {
      store.dispatch(setFollowMode(true));
      expect(store.getState().exploration.isFollowModeActive).toBe(true);
    });

    it('should set follow mode to false with setFollowMode', () => {
      // Set to true first
      store.dispatch(setFollowMode(true));
      expect(store.getState().exploration.isFollowModeActive).toBe(true);

      // Set to false
      store.dispatch(setFollowMode(false));
      expect(store.getState().exploration.isFollowModeActive).toBe(false);
    });

    it('should reset follow mode state on reset', () => {
      // Set to active
      store.dispatch(setFollowMode(true));
      expect(store.getState().exploration.isFollowModeActive).toBe(true);

      // Reset
      store.dispatch(reset());
      expect(store.getState().exploration.isFollowModeActive).toBe(false);
    });
  });

  describe('restorePersistedState', () => {
    it('should restore valid persisted state', () => {
      const validPersistedState = {
        currentLocation: { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
        path: [
          { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
          { latitude: 37.775, longitude: -122.4195, timestamp: Date.now() },
        ],
        exploredAreas: [{ latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() }],
        zoomLevel: 15,
        isTrackingPaused: false,
      };

      store.dispatch({ type: 'exploration/restorePersistedState', payload: validPersistedState });
      const state = store.getState().exploration;

      expect(state.currentLocation).toEqual(validPersistedState.currentLocation);
      expect(state.path).toEqual(validPersistedState.path);
      expect(state.exploredAreas).toEqual(validPersistedState.exploredAreas);
      expect(state.zoomLevel).toBe(15);
      expect(state.isTrackingPaused).toBe(false);
    });

    it('should filter invalid points during restoration', () => {
      const invalidPersistedState = {
        currentLocation: null, // Invalid
        path: [
          { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() }, // Valid
          { latitude: 'invalid', longitude: -122.4194, timestamp: Date.now() }, // Invalid
          { latitude: 37.775, longitude: -122.4195, timestamp: Date.now() }, // Valid
        ],
        exploredAreas: [
          { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() }, // Valid
          { latitude: null, longitude: -122.4194, timestamp: Date.now() }, // Invalid
        ],
        zoomLevel: 25, // Invalid (too high)
        isTrackingPaused: true,
      };

      store.dispatch({ type: 'exploration/restorePersistedState', payload: invalidPersistedState });
      const state = store.getState().exploration;

      expect(state.currentLocation).toBeNull(); // Should remain null
      expect(state.path).toHaveLength(2); // Only valid points
      expect(state.exploredAreas).toHaveLength(1); // Only valid points
      expect(state.zoomLevel).toBe(14); // Should remain default, not 25
      expect(state.isTrackingPaused).toBe(true); // Should be restored
    });
  });

  describe('clearRecentData', () => {
    beforeEach(() => {
      // Set up test data using restorePersistedState to simulate a realistic scenario
      store.dispatch({
        type: 'exploration/restorePersistedState',
        payload: {
          currentLocation: { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
          path: [
            { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
            { latitude: 37.775, longitude: -122.4195, timestamp: Date.now() },
            { latitude: 37.7751, longitude: -122.4196, timestamp: Date.now() },
          ],
          exploredAreas: [
            { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
            { latitude: 37.775, longitude: -122.4195, timestamp: Date.now() },
          ],
          zoomLevel: 14,
          isTrackingPaused: false,
        },
      });
    });

    it('should clear portion of path and explored areas based on hours', () => {
      const initialState = store.getState().exploration;
      expect(initialState.path).toHaveLength(3);
      expect(initialState.exploredAreas).toHaveLength(2);

      // Clear 50% of data (assuming 1 week = 168 hours, so 84 hours = 50%)
      store.dispatch({ type: 'exploration/clearRecentData', payload: 84 });

      const state = store.getState().exploration;
      expect(state.path.length).toBeLessThan(initialState.path.length);
      expect(state.exploredAreas.length).toBeLessThan(initialState.exploredAreas.length);
    });

    it('should clear all data when hours exceed max threshold', () => {
      // Clear more than a week's worth (200 hours)
      store.dispatch({ type: 'exploration/clearRecentData', payload: 200 });

      const state = store.getState().exploration;
      expect(state.path).toHaveLength(0);
      expect(state.exploredAreas).toHaveLength(0);
    });

    it('should not clear data when no hours specified', () => {
      const initialState = store.getState().exploration;

      // Clear 0 hours
      store.dispatch({ type: 'exploration/clearRecentData', payload: 0 });

      const state = store.getState().exploration;
      expect(state.path).toHaveLength(initialState.path.length);
      expect(state.exploredAreas).toHaveLength(initialState.exploredAreas.length);
    });
  });
});
