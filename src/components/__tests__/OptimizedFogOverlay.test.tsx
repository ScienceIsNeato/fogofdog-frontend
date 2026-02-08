import React from 'react';
import OptimizedFogOverlay from '../OptimizedFogOverlay';
import { renderWithProviders } from '../../utils/test-utils';
import { GeoPoint } from '../../types/user';

// Mock performance.now for consistent testing
global.performance = {
  now: jest.fn(() => Date.now()),
} as any;

describe('OptimizedFogOverlay', () => {
  const mockMapRegion = {
    latitude: 37.7749,
    longitude: -122.4194,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
    width: 400,
    height: 800,
  };

  const createMockPoints = (count: number): GeoPoint[] => {
    const points: GeoPoint[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < count; i++) {
      points.push({
        latitude: 37.7749 + i * 0.001, // Spread points along latitude
        longitude: -122.4194 + i * 0.001, // Spread points along longitude
        timestamp: baseTime + i * 1000,
      });
    }

    return points;
  };

  const mockState = {
    exploration: {
      path: createMockPoints(10), // Start with moderate point count
      currentLocation: null,
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
    },
    user: {
      id: null,
      email: null,
      isAuthenticated: false,
    },
  };

  it('should render with small number of points', () => {
    const { getByTestId } = renderWithProviders(<OptimizedFogOverlay mapRegion={mockMapRegion} />, {
      preloadedState: mockState,
    });

    // Should render the Skia Canvas
    const skiaCanvas = getByTestId('optimized-fog-overlay-canvas');
    expect(skiaCanvas).toBeTruthy();
  });

  it('should handle large number of points efficiently', () => {
    const largePointState = {
      ...mockState,
      exploration: {
        ...mockState.exploration,
        path: createMockPoints(1000), // Large point count
      },
    };

    const { getByTestId } = renderWithProviders(<OptimizedFogOverlay mapRegion={mockMapRegion} />, {
      preloadedState: largePointState,
    });

    // Should still render successfully with large point count
    const skiaCanvas = getByTestId('optimized-fog-overlay-canvas');
    expect(skiaCanvas).toBeTruthy();
  });

  it('should handle empty path array', () => {
    const emptyPathState = {
      ...mockState,
      exploration: {
        ...mockState.exploration,
        path: [], // Empty path
      },
    };

    const { getByTestId } = renderWithProviders(<OptimizedFogOverlay mapRegion={mockMapRegion} />, {
      preloadedState: emptyPathState,
    });

    // Should handle empty path gracefully
    const skiaCanvas = getByTestId('optimized-fog-overlay-canvas');
    expect(skiaCanvas).toBeTruthy();
  });

  it('should adapt to different map regions', () => {
    const differentRegion = {
      latitude: 40.7128, // NYC coordinates
      longitude: -74.006,
      latitudeDelta: 0.05, // Different zoom level
      longitudeDelta: 0.05,
      width: 300,
      height: 600,
    };

    const { getByTestId } = renderWithProviders(
      <OptimizedFogOverlay mapRegion={differentRegion} />,
      { preloadedState: mockState }
    );

    // Should adapt to different regions
    const skiaCanvas = getByTestId('optimized-fog-overlay-canvas');
    expect(skiaCanvas).toBeTruthy();
  });

  it('should handle points outside viewport', () => {
    // Create points that are far outside the viewport
    const outsidePoints = [
      { latitude: 40.0, longitude: -120.0, timestamp: Date.now() }, // Far north-east
      { latitude: 35.0, longitude: -125.0, timestamp: Date.now() + 1000 }, // Far south-west
      { latitude: 37.7749, longitude: -122.4194, timestamp: Date.now() + 2000 }, // In viewport
    ];

    const outsideViewportState = {
      ...mockState,
      exploration: {
        ...mockState.exploration,
        path: outsidePoints,
      },
    };

    const { getByTestId } = renderWithProviders(<OptimizedFogOverlay mapRegion={mockMapRegion} />, {
      preloadedState: outsideViewportState,
    });

    // Should handle out-of-viewport points efficiently
    const skiaCanvas = getByTestId('optimized-fog-overlay-canvas');
    expect(skiaCanvas).toBeTruthy();
  });

  it('should handle very dense point clusters', () => {
    // Create many points very close together
    const densePoints: GeoPoint[] = [];
    const baseTime = Date.now();

    for (let i = 0; i < 100; i++) {
      densePoints.push({
        latitude: 37.7749 + i * 0.0001, // Very small increments
        longitude: -122.4194 + i * 0.0001,
        timestamp: baseTime + i * 100,
      });
    }

    const densePointState = {
      ...mockState,
      exploration: {
        ...mockState.exploration,
        path: densePoints,
      },
    };

    const { getByTestId } = renderWithProviders(<OptimizedFogOverlay mapRegion={mockMapRegion} />, {
      preloadedState: densePointState,
    });

    // Should handle dense clusters efficiently through visual density reduction
    const skiaCanvas = getByTestId('optimized-fog-overlay-canvas');
    expect(skiaCanvas).toBeTruthy();
  });

  it('should not render canvas when dimensions are zero', () => {
    const zeroDimensionRegion = {
      ...mockMapRegion,
      width: 0,
      height: 0,
    };

    const { queryByTestId } = renderWithProviders(
      <OptimizedFogOverlay mapRegion={zeroDimensionRegion} />,
      { preloadedState: mockState }
    );

    // Should return null when dimensions are zero (guard against Skia crash)
    expect(queryByTestId('optimized-fog-overlay-canvas')).toBeNull();
  });

  it('should not render canvas when width is zero', () => {
    const zeroWidthRegion = {
      ...mockMapRegion,
      width: 0,
      height: 800,
    };

    const { queryByTestId } = renderWithProviders(
      <OptimizedFogOverlay mapRegion={zeroWidthRegion} />,
      { preloadedState: mockState }
    );

    expect(queryByTestId('optimized-fog-overlay-canvas')).toBeNull();
  });
});
