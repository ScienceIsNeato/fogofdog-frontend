import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import ScentTrail from '../ScentTrail';
import explorationReducer from '../../store/slices/explorationSlice';
import streetReducer from '../../store/slices/streetSlice';
import graphicsReducer from '../../store/slices/graphicsSlice';
import userReducer from '../../store/slices/userSlice';
import statsReducer from '../../store/slices/statsSlice';
import skinReducer from '../../store/slices/skinSlice';
import type { ScentRenderConfig } from '../../types/graphics';
import type { GeoPoint } from '../../types/user';
import type { RootState } from '../../store';

import { findClosestStreets } from '../../services/StreetDataService';

// Mock StreetDataService so tests don't depend on real geospatial computation
jest.mock('../../services/StreetDataService', () => ({
  findClosestStreets: jest.fn(),
}));

// Mock geoPointToPixel so pixel calculations are deterministic
jest.mock('../../utils/mapUtils', () => ({
  ...jest.requireActual('../../utils/mapUtils'),
  geoPointToPixel: jest.fn(() => ({ x: 200, y: 400 })),
}));
const mockedFindClosest = findClosestStreets as jest.Mock;

const MOCK_LOCATION: GeoPoint = {
  latitude: 37.7749,
  longitude: -122.4194,
  timestamp: Date.now(),
};

const MAP_REGION = {
  latitude: 37.7749,
  longitude: -122.4194,
  latitudeDelta: 0.01,
  longitudeDelta: 0.01,
  width: 400,
  height: 800,
};

const DOTTED_CONFIG: ScentRenderConfig = {
  trailColor: '#5AC8FA',
  trailWidth: 3,
  trailStyle: 'dotted',
  showEndpoint: true,
  animationType: 'none',
  animationDuration: 0,
  particleCount: 0,
};

const ARROWS_CONFIG: ScentRenderConfig = {
  ...DOTTED_CONFIG,
  trailStyle: 'arrows',
};

const FLOW_CONFIG: ScentRenderConfig = {
  ...DOTTED_CONFIG,
  trailStyle: 'flowing',
  animationType: 'flow',
  animationDuration: 1200,
  particleCount: 8,
};

const PULSE_CONFIG: ScentRenderConfig = {
  ...DOTTED_CONFIG,
  trailStyle: 'pulse-wave',
  animationType: 'pulse',
  animationDuration: 1800,
  particleCount: 3,
};

const MOCK_WAYPOINT_RESULT = {
  closestPoint: { latitude: 37.776, longitude: -122.419 },
  streetName: 'Market St',
  distance: 150,
  direction: 'N',
};

const createStore = (overrides: Partial<RootState> = {}) =>
  configureStore({
    reducer: {
      exploration: explorationReducer,
      street: streetReducer,
      graphics: graphicsReducer,
      user: userReducer,
      stats: statsReducer,
      skin: skinReducer,
    },
    preloadedState: overrides as RootState,
  });

const renderTrail = (config: ScentRenderConfig, storeOverrides: Partial<RootState> = {}) => {
  const store = createStore(storeOverrides);
  return render(
    <Provider store={store}>
      <ScentTrail mapRegion={MAP_REGION} renderConfig={config} />
    </Provider>
  );
};

describe('ScentTrail', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockedFindClosest.mockReturnValue([MOCK_WAYPOINT_RESULT]);
  });

  it('returns null when there is no current location', () => {
    const { toJSON } = renderTrail(DOTTED_CONFIG, {
      exploration: {
        currentLocation: null,
        path: [],
        exploredAreas: [],
        zoomLevel: 14,
        isMapCenteredOnUser: false,
        isFollowModeActive: false,
        isTrackingPaused: false,
        backgroundLocationStatus: {
          isRunning: false,
          hasPermission: false,
          storedLocationCount: 0,
        },
      },
    });
    expect(toJSON()).toBeNull();
  });

  it('returns null when there are no street segments', () => {
    mockedFindClosest.mockReturnValue([]);
    const { toJSON } = renderTrail(DOTTED_CONFIG, {
      exploration: {
        currentLocation: MOCK_LOCATION,
        path: [],
        exploredAreas: [],
        zoomLevel: 14,
        isMapCenteredOnUser: false,
        isFollowModeActive: false,
        isTrackingPaused: false,
        backgroundLocationStatus: {
          isRunning: false,
          hasPermission: false,
          storedLocationCount: 0,
        },
      },
    });
    expect(toJSON()).toBeNull();
  });

  it('renders a canvas for the dotted trail style', () => {
    const { getByTestId } = renderTrail(DOTTED_CONFIG, {
      exploration: {
        currentLocation: MOCK_LOCATION,
        path: [],
        exploredAreas: [],
        zoomLevel: 14,
        isMapCenteredOnUser: false,
        isFollowModeActive: false,
        isTrackingPaused: false,
        backgroundLocationStatus: {
          isRunning: false,
          hasPermission: false,
          storedLocationCount: 0,
        },
      },
      street: {
        segments: {
          seg_a: {
            id: 'seg_a',
            name: 'Market St',
            points: [
              { latitude: 37.776, longitude: -122.419 },
              { latitude: 37.777, longitude: -122.418 },
            ],
            startNodeId: 'n1',
            endNodeId: 'n2',
            lengthMeters: 100,
          },
        },
        intersections: {},
        exploredSegmentIds: [],
        exploredIntersectionIds: [],
        isLoading: false,
        error: null,
        preferStreets: false,
        preferUnexplored: false,
      },
    });
    expect(getByTestId('scent-trail-canvas')).toBeTruthy();
  });

  it('renders a canvas for the arrows trail style', () => {
    const { getByTestId } = renderTrail(ARROWS_CONFIG, {
      exploration: {
        currentLocation: MOCK_LOCATION,
        path: [],
        exploredAreas: [],
        zoomLevel: 14,
        isMapCenteredOnUser: false,
        isFollowModeActive: false,
        isTrackingPaused: false,
        backgroundLocationStatus: {
          isRunning: false,
          hasPermission: false,
          storedLocationCount: 0,
        },
      },
      street: {
        segments: {
          seg_a: {
            id: 'seg_a',
            name: 'Market St',
            points: [
              { latitude: 37.776, longitude: -122.419 },
              { latitude: 37.777, longitude: -122.418 },
            ],
            startNodeId: 'n1',
            endNodeId: 'n2',
            lengthMeters: 100,
          },
        },
        intersections: {},
        exploredSegmentIds: [],
        exploredIntersectionIds: [],
        isLoading: false,
        error: null,
        preferStreets: false,
        preferUnexplored: false,
      },
    });
    expect(getByTestId('scent-trail-canvas')).toBeTruthy();
  });

  it('renders a canvas for the flowing particle animation', () => {
    const { getByTestId } = renderTrail(FLOW_CONFIG, {
      exploration: {
        currentLocation: MOCK_LOCATION,
        path: [],
        exploredAreas: [],
        zoomLevel: 14,
        isMapCenteredOnUser: false,
        isFollowModeActive: false,
        isTrackingPaused: false,
        backgroundLocationStatus: {
          isRunning: false,
          hasPermission: false,
          storedLocationCount: 0,
        },
      },
      street: {
        segments: {
          seg_a: {
            id: 'seg_a',
            name: 'Market St',
            points: [
              { latitude: 37.776, longitude: -122.419 },
              { latitude: 37.777, longitude: -122.418 },
            ],
            startNodeId: 'n1',
            endNodeId: 'n2',
            lengthMeters: 100,
          },
        },
        intersections: {},
        exploredSegmentIds: [],
        exploredIntersectionIds: [],
        isLoading: false,
        error: null,
        preferStreets: false,
        preferUnexplored: false,
      },
    });
    expect(getByTestId('scent-trail-canvas')).toBeTruthy();
  });

  it('renders a canvas for the pulse wave animation', () => {
    const { getByTestId } = renderTrail(PULSE_CONFIG, {
      exploration: {
        currentLocation: MOCK_LOCATION,
        path: [],
        exploredAreas: [],
        zoomLevel: 14,
        isMapCenteredOnUser: false,
        isFollowModeActive: false,
        isTrackingPaused: false,
        backgroundLocationStatus: {
          isRunning: false,
          hasPermission: false,
          storedLocationCount: 0,
        },
      },
      street: {
        segments: {
          seg_a: {
            id: 'seg_a',
            name: 'Market St',
            points: [
              { latitude: 37.776, longitude: -122.419 },
              { latitude: 37.777, longitude: -122.418 },
            ],
            startNodeId: 'n1',
            endNodeId: 'n2',
            lengthMeters: 100,
          },
        },
        intersections: {},
        exploredSegmentIds: [],
        exploredIntersectionIds: [],
        isLoading: false,
        error: null,
        preferStreets: false,
        preferUnexplored: false,
      },
    });
    expect(getByTestId('scent-trail-canvas')).toBeTruthy();
  });
});
