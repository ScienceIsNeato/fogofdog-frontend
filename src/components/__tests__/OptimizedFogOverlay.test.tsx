import React from 'react';
import OptimizedFogOverlay from '../OptimizedFogOverlay';
import { renderWithProviders } from '../../utils/test-utils';
import { GeoPoint } from '../../types/user';
import type { FogRenderConfig } from '../../types/graphics';

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

  describe('fog effect configs', () => {
    it('renders without fogEffectConfig (classic behaviour)', () => {
      const { getByTestId } = renderWithProviders(
        <OptimizedFogOverlay mapRegion={mockMapRegion} />,
        { preloadedState: mockState }
      );
      expect(getByTestId('optimized-fog-overlay-canvas')).toBeTruthy();
    });

    it('renders with vignette config and shows BlurMask for edge blur', () => {
      const vignetteConfig: FogRenderConfig = {
        fogColor: 'black',
        fogOpacity: 1,
        edgeBlurSigma: 8,
        animationType: 'none',
        animationDuration: 0,
        animationAmplitude: 0,
      };
      const { getByTestId, queryAllByTestId } = renderWithProviders(
        <OptimizedFogOverlay mapRegion={mockMapRegion} fogEffectConfig={vignetteConfig} />,
        { preloadedState: mockState }
      );
      expect(getByTestId('optimized-fog-overlay-canvas')).toBeTruthy();
      expect(queryAllByTestId('mock-skia-blur-mask').length).toBeGreaterThan(0);
    });

    it('does not render BlurMask when edgeBlurSigma is 0', () => {
      const classicConfig: FogRenderConfig = {
        fogColor: 'black',
        fogOpacity: 1,
        edgeBlurSigma: 0,
        animationType: 'none',
        animationDuration: 0,
        animationAmplitude: 0,
      };
      const { queryAllByTestId } = renderWithProviders(
        <OptimizedFogOverlay mapRegion={mockMapRegion} fogEffectConfig={classicConfig} />,
        { preloadedState: mockState }
      );
      expect(queryAllByTestId('mock-skia-blur-mask').length).toBe(0);
    });

    it('renders without crashing with pulse animation config', () => {
      const pulseConfig: FogRenderConfig = {
        fogColor: 'black',
        fogOpacity: 1,
        edgeBlurSigma: 3,
        animationType: 'pulse',
        animationDuration: 2400,
        animationAmplitude: 0.12,
      };
      const { getByTestId } = renderWithProviders(
        <OptimizedFogOverlay mapRegion={mockMapRegion} fogEffectConfig={pulseConfig} />,
        { preloadedState: mockState }
      );
      expect(getByTestId('optimized-fog-overlay-canvas')).toBeTruthy();
    });

    it('renders extra tint Rect for haunted config with tintColor', () => {
      const hauntedConfig: FogRenderConfig = {
        fogColor: '#0a0020',
        fogOpacity: 1,
        edgeBlurSigma: 5,
        tintColor: '#1a0050',
        tintOpacity: 0.35,
        animationType: 'tint-cycle',
        animationDuration: 4000,
        animationAmplitude: 0.2,
      };
      const { getByTestId, queryAllByTestId } = renderWithProviders(
        <OptimizedFogOverlay mapRegion={mockMapRegion} fogEffectConfig={hauntedConfig} />,
        { preloadedState: mockState }
      );
      expect(getByTestId('optimized-fog-overlay-canvas')).toBeTruthy();
      // fog Rect + tint Rect = at least 2
      expect(queryAllByTestId('mock-skia-rect').length).toBeGreaterThanOrEqual(2);
    });

    it('renders only the fog Rect when no tintColor is set', () => {
      const classicConfig: FogRenderConfig = {
        fogColor: 'black',
        fogOpacity: 1,
        edgeBlurSigma: 0,
        animationType: 'none',
        animationDuration: 0,
        animationAmplitude: 0,
      };
      const { queryAllByTestId } = renderWithProviders(
        <OptimizedFogOverlay mapRegion={mockMapRegion} fogEffectConfig={classicConfig} />,
        { preloadedState: mockState }
      );
      // Only the fog Rect; no tint Rect
      expect(queryAllByTestId('mock-skia-rect').length).toBe(1);
    });
  });
});
