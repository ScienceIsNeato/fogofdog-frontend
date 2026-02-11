import React from 'react';
import { act } from '@testing-library/react-native';
import { ExplorationNudge } from '../ExplorationNudge';
import { renderWithProviders } from '../../utils/test-utils';
import { findClosestStreets, computeExploredIds } from '../../services/StreetDataService';

jest.mock('../../utils/logger', () => ({
  logger: {
    warn: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
    debug: jest.fn(),
  },
}));

jest.mock('../../services/StreetDataService', () => ({
  findClosestStreets: jest.fn(),
  computeExploredIds: jest.fn(),
}));

const mockFindClosestStreets = findClosestStreets as unknown as jest.Mock;
const mockComputeExploredIds = computeExploredIds as unknown as jest.Mock;

const baseExplorationState = {
  path: [],
  currentLocation: null as null | { latitude: number; longitude: number; timestamp: number },
  zoomLevel: 14,
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

const baseStreetState = {
  segments: {} as Record<string, any>,
  intersections: {} as Record<string, any>,
  exploredSegmentIds: [] as string[],
  exploredIntersectionIds: [] as string[],
  preferStreets: false,
  preferUnexplored: false,
  isLoading: false,
  lastFetchedAt: null,
  error: null,
};

const baseGraphicsState = {
  activeFogEffectId: 'fog-classic',
  activeMapEffectId: 'map-none',
  activeScentEffectId: 'scent-dotted',
  isScentVisible: false,
};

const mockNearestResult = {
  streetName: 'Oak Street',
  direction: 'N',
  distance: 150,
};

beforeEach(() => {
  mockFindClosestStreets.mockReturnValue([]);
  mockComputeExploredIds.mockReturnValue({ segmentIds: [], intersectionIds: [] });
});

afterEach(() => {
  jest.clearAllMocks();
});

describe('ExplorationNudge', () => {
  describe('returns null', () => {
    it('when currentLocation is null', async () => {
      const { queryByTestId } = renderWithProviders(<ExplorationNudge />, {
        preloadedState: {
          exploration: { ...baseExplorationState, currentLocation: null },
          street: { ...baseStreetState, segments: { 'seg-1': { id: 'seg-1' } as any } },
          graphics: { ...baseGraphicsState, isScentVisible: false },
        },
      });
      await act(async () => {});
      expect(queryByTestId('exploration-nudge')).toBeNull();
    });

    it('when no streets are loaded', async () => {
      const { queryByTestId } = renderWithProviders(<ExplorationNudge />, {
        preloadedState: {
          exploration: {
            ...baseExplorationState,
            currentLocation: { latitude: 37.7749, longitude: -122.4194, timestamp: 1000 },
          },
          street: { ...baseStreetState, segments: {} },
          graphics: { ...baseGraphicsState, isScentVisible: false },
        },
      });
      await act(async () => {});
      expect(queryByTestId('exploration-nudge')).toBeNull();
    });

    it('when findClosestStreets returns no unexplored streets', async () => {
      mockFindClosestStreets.mockReturnValue([]);
      const { queryByTestId } = renderWithProviders(<ExplorationNudge />, {
        preloadedState: {
          exploration: {
            ...baseExplorationState,
            currentLocation: { latitude: 37.7749, longitude: -122.4194, timestamp: 1000 },
          },
          street: { ...baseStreetState, segments: { 'seg-1': { id: 'seg-1' } as any } },
          graphics: { ...baseGraphicsState, isScentVisible: false },
        },
      });
      await act(async () => {});
      expect(queryByTestId('exploration-nudge')).toBeNull();
    });

    it('when isScentVisible is true even if nearest street exists', async () => {
      mockFindClosestStreets.mockReturnValue([mockNearestResult]);
      const { queryByTestId } = renderWithProviders(<ExplorationNudge />, {
        preloadedState: {
          exploration: {
            ...baseExplorationState,
            currentLocation: { latitude: 37.7749, longitude: -122.4194, timestamp: 1000 },
          },
          street: { ...baseStreetState, segments: { 'seg-1': { id: 'seg-1' } as any } },
          graphics: { ...baseGraphicsState, isScentVisible: true },
        },
      });
      await act(async () => {});
      // ScentTrail is the graphical replacement; ExplorationNudge card is suppressed
      expect(queryByTestId('exploration-nudge')).toBeNull();
    });
  });

  describe('renders the nudge card', () => {
    const locationState = {
      exploration: {
        ...baseExplorationState,
        currentLocation: { latitude: 37.7749, longitude: -122.4194, timestamp: 1000 },
      },
      street: {
        ...baseStreetState,
        segments: { 'seg-1': { id: 'seg-1' } as any },
      },
      graphics: { ...baseGraphicsState, isScentVisible: false },
    };

    beforeEach(() => {
      mockFindClosestStreets.mockReturnValue([mockNearestResult]);
    });

    it('when nearest street found and isScentVisible is false', async () => {
      const { getByTestId } = renderWithProviders(<ExplorationNudge />, {
        preloadedState: locationState,
      });
      await act(async () => {});
      expect(getByTestId('exploration-nudge')).toBeTruthy();
    });

    it('shows the correct street name', async () => {
      const { getByTestId } = renderWithProviders(<ExplorationNudge />, {
        preloadedState: locationState,
      });
      await act(async () => {});
      expect(getByTestId('nudge-street-name').props.children).toBe('Oak Street');
    });

    it('shows the correct direction arrow and distance under 1km', async () => {
      const { getByTestId } = renderWithProviders(<ExplorationNudge />, {
        preloadedState: locationState,
      });
      await act(async () => {});
      const detail = getByTestId('nudge-distance-direction');
      // North arrow, 150m rounded, N direction
      expect(detail.props.children).toEqual(['↑', ' ', '150m', ' ', 'N']);
    });

    it('shows distance in km for results >= 1000m', async () => {
      mockFindClosestStreets.mockReturnValue([
        { streetName: 'Far Street', direction: 'E', distance: 2500 },
      ]);
      const { getByTestId } = renderWithProviders(<ExplorationNudge />, {
        preloadedState: locationState,
      });
      await act(async () => {});
      const detail = getByTestId('nudge-distance-direction');
      expect(detail.props.children).toEqual(['→', ' ', '2.5km', ' ', 'E']);
    });

    it('shows the correct exploration progress', async () => {
      const { getByTestId } = renderWithProviders(<ExplorationNudge />, {
        preloadedState: {
          ...locationState,
          street: {
            ...baseStreetState,
            segments: {
              'seg-1': { id: 'seg-1' } as any,
              'seg-2': { id: 'seg-2' } as any,
            },
            exploredSegmentIds: ['seg-1'],
          },
        },
      });
      await act(async () => {});
      expect(getByTestId('nudge-progress').props.children).toEqual([
        1,
        ' / ',
        2,
        ' streets explored',
      ]);
    });
  });
});
