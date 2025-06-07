import { configureStore } from '@reduxjs/toolkit';
import explorationReducer, {
  updateLocation,
  updateZoom,
  reset,
  setCenterOnUser,
} from '../explorationSlice';

describe('exploration slice', () => {
  const store = configureStore({
    reducer: {
      exploration: explorationReducer,
    },
  });

  beforeEach(() => {
    store.dispatch(reset());
  });

  it('should handle initial state', () => {
    expect(store.getState().exploration).toEqual({
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
    });
  });

  it('should handle updateLocation - first point', () => {
    const location = {
      latitude: 41.6867,
      longitude: -91.5802,
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
      { latitude: 41.6867, longitude: -91.5802 },
      // This point is far enough away to be added
      { latitude: 41.6877, longitude: -91.5812 },
      // This point is too close to the previous one and should be skipped
      { latitude: 41.6878, longitude: -91.5813 },
      // This point is far enough from the last added point
      { latitude: 41.689, longitude: -91.5825 },
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
    store.dispatch(updateLocation({ latitude: 41.6867, longitude: -91.5802 }));

    // Reset
    store.dispatch(reset());

    // Check all state is reset including isMapCenteredOnUser
    const state = store.getState().exploration;
    expect(state.isMapCenteredOnUser).toBe(false);
    expect(state.currentLocation).toBeNull();
    expect(state.path).toHaveLength(0);
  });
});
