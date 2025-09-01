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
  startGPSInjection,
  stopGPSInjection,
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
      gpsInjectionStatus: {
        isRunning: false,
        type: null,
        message: '',
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

  it('should store all path points (filtering happens at render time)', () => {
    const locations = [
      { latitude: 41.6867, longitude: -91.5802, timestamp: Date.now() },
      // All points stored regardless of distance (filtering at render time)
      { latitude: 41.6877, longitude: -91.5812, timestamp: Date.now() + 1000 },
      // Close point - now stored (was previously filtered out)
      { latitude: 41.6878, longitude: -91.5813, timestamp: Date.now() + 2000 },
      // Distant point - always stored
      { latitude: 41.689, longitude: -91.5825, timestamp: Date.now() + 3000 },
    ];

    locations.forEach((location) => {
      store.dispatch(updateLocation(location));
    });

    const state = store.getState().exploration;
    // Should have all 4 points (store all, filter at render time)
    expect(state.path).toHaveLength(4);
    expect(state.path[0]).toEqual(locations[0]);
    expect(state.path[1]).toEqual(locations[1]);
    expect(state.path[2]).toEqual(locations[2]);
    expect(state.path[3]).toEqual(locations[3]);
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

    it('should store all valid background locations', () => {
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
      expect(state.path).toHaveLength(2); // All valid points stored
      expect(state.currentLocation).toEqual({
        latitude: 41.6877,
        longitude: -91.5812,
        timestamp: 1640995260000,
      });
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

  describe('GPS point storage', () => {
    it('should store all valid GPS points without distance filtering', () => {
      // Add first point
      store.dispatch(
        updateLocation({ latitude: 41.6867, longitude: -91.5802, timestamp: Date.now() })
      );

      // Add second point (very close to first)
      store.dispatch(
        updateLocation({ latitude: 41.6868, longitude: -91.5803, timestamp: Date.now() + 1000 })
      );

      const state = store.getState().exploration;
      expect(state.path).toHaveLength(2); // Both points stored (no distance filtering)
      expect(state.currentLocation).toEqual({
        latitude: 41.6868,
        longitude: -91.5803,
        timestamp: expect.any(Number),
      });
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

    it('should use last known location from GPS history when currentLocation is null', () => {
      const persistedStateWithoutCurrentLocation = {
        currentLocation: null,
        path: [
          { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() },
          { latitude: 37.775, longitude: -122.4195, timestamp: Date.now() },
          { latitude: 37.776, longitude: -122.4196, timestamp: Date.now() },
        ],
        exploredAreas: [{ latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() }],
        zoomLevel: 15,
        isTrackingPaused: false,
      };

      store.dispatch({
        type: 'exploration/restorePersistedState',
        payload: persistedStateWithoutCurrentLocation,
      });
      const state = store.getState().exploration;

      // Should use the last point in the path as currentLocation
      expect(state.currentLocation).toEqual(persistedStateWithoutCurrentLocation.path[2]);
      expect(state.path).toEqual(persistedStateWithoutCurrentLocation.path);
      expect(state.exploredAreas).toEqual(persistedStateWithoutCurrentLocation.exploredAreas);
      expect(state.zoomLevel).toBe(15);
      expect(state.isTrackingPaused).toBe(false);
    });

    it('should keep currentLocation null when no GPS history exists', () => {
      const persistedStateWithoutData = {
        currentLocation: null,
        path: [],
        exploredAreas: [],
        zoomLevel: 14,
        isTrackingPaused: false,
      };

      store.dispatch({
        type: 'exploration/restorePersistedState',
        payload: persistedStateWithoutData,
      });
      const state = store.getState().exploration;

      // Should remain null when no GPS history exists
      expect(state.currentLocation).toBeNull();
      expect(state.path).toEqual([]);
      expect(state.exploredAreas).toEqual([]);
      expect(state.zoomLevel).toBe(14);
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

      // Should use last valid point as currentLocation since we have valid GPS history
      expect(state.currentLocation).toEqual({
        latitude: 37.775,
        longitude: -122.4195,
        timestamp: expect.any(Number),
      });
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

  describe('GPS Injection Status', () => {
    it('should initialize with GPS injection inactive', () => {
      const state = store.getState().exploration;
      expect(state.gpsInjectionStatus.isRunning).toBe(false);
      expect(state.gpsInjectionStatus.type).toBeNull();
      expect(state.gpsInjectionStatus.message).toBe('');
    });

    it('should start GPS injection with real-time type', () => {
      store.dispatch(
        startGPSInjection({
          type: 'real-time',
          message: 'Injecting 100 points over 5 minutes',
        })
      );

      const state = store.getState().exploration;
      expect(state.gpsInjectionStatus.isRunning).toBe(true);
      expect(state.gpsInjectionStatus.type).toBe('real-time');
      expect(state.gpsInjectionStatus.message).toBe('Injecting 100 points over 5 minutes');
    });

    it('should start GPS injection with historical type', () => {
      store.dispatch(
        startGPSInjection({
          type: 'historical',
          message: 'Injecting 500 points over 25 minutes',
        })
      );

      const state = store.getState().exploration;
      expect(state.gpsInjectionStatus.isRunning).toBe(true);
      expect(state.gpsInjectionStatus.type).toBe('historical');
      expect(state.gpsInjectionStatus.message).toBe('Injecting 500 points over 25 minutes');
    });

    it('should stop GPS injection and clear status', () => {
      // Start injection first
      store.dispatch(
        startGPSInjection({
          type: 'real-time',
          message: 'Injecting points',
        })
      );

      // Stop injection
      store.dispatch(stopGPSInjection());

      const state = store.getState().exploration;
      expect(state.gpsInjectionStatus.isRunning).toBe(false);
      expect(state.gpsInjectionStatus.type).toBeNull();
      expect(state.gpsInjectionStatus.message).toBe('');
    });

    it('should reset GPS injection status on slice reset', () => {
      // Start injection
      store.dispatch(
        startGPSInjection({
          type: 'historical',
          message: 'Test injection',
        })
      );

      // Reset slice
      store.dispatch(reset());

      const state = store.getState().exploration;
      expect(state.gpsInjectionStatus.isRunning).toBe(false);
      expect(state.gpsInjectionStatus.type).toBeNull();
      expect(state.gpsInjectionStatus.message).toBe('');
    });
  });
});
