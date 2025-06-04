import React from 'react';
import { render } from '@testing-library/react-native';
import { Provider } from 'react-redux';
import { configureStore } from '@reduxjs/toolkit';
import FogOverlay from '../FogOverlay';
import { FOG_CONFIG, FOG_VALIDATION } from '../../config/fogConfig';
import type { ViewProps } from 'react-native';

// Mock console methods to prevent noise in tests
const mockConsoleLog = jest.spyOn(console, 'log').mockImplementation();

// Mock Date.now for testing throttling
const mockDateNow = jest.spyOn(Date, 'now');

// Mock Skia components
jest.mock('@shopify/react-native-skia', () => {
  const React = jest.requireActual<typeof import('react')>('react');
  const { View } = jest.requireActual<typeof import('react-native')>('react-native');

  return {
    Canvas: (props: ViewProps) =>
      React.createElement(View, { testID: 'mock-skia-canvas', ...props }),
    Mask: (props: ViewProps) => React.createElement(View, { testID: 'mock-skia-mask', ...props }),
    Group: (props: ViewProps) => React.createElement(View, { testID: 'mock-skia-group', ...props }),
    Fill: (props: ViewProps) => React.createElement(View, { testID: 'mock-skia-fill', ...props }),
    Path: (props: ViewProps) => React.createElement(View, { testID: 'mock-skia-path', ...props }),
    Rect: (props: ViewProps & { color?: string; opacity?: number }) => {
      const rectProps = {
        testID: 'mock-skia-rect',
        'data-color': props.color,
        'data-opacity': props.opacity,
        ...props,
      };
      return React.createElement(View, rectProps as any);
    },
    Circle: (props: ViewProps) =>
      React.createElement(View, { testID: 'mock-skia-circle', ...props }),
    Skia: {
      Path: {
        Make: jest.fn().mockReturnValue({
          moveTo: jest.fn(),
          lineTo: jest.fn(),
        }),
      },
    },
  };
});

// Setup mock Redux store with exploration slice
const createMockStore = (
  initialPath?: ({ latitude: number; longitude: number } | null | undefined)[]
) => {
  return configureStore({
    reducer: {
      exploration: (state, _action) => state ?? { path: initialPath ?? [] },
    },
  });
};

describe('FogOverlay', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockDateNow.mockReturnValue(0);
  });

  afterAll(() => {
    mockConsoleLog.mockRestore();
    mockDateNow.mockRestore();
  });

  const defaultMapRegion = {
    latitude: 41.6867,
    longitude: -91.5802,
    latitudeDelta: 0.01,
    longitudeDelta: 0.01,
    width: 400,
    height: 800,
  };

  // UPDATED TEST: Fog Visibility Regression Test using Configuration
  describe('Fog Visibility Configuration', () => {
    it('should use properly configured fog color and opacity for visibility', () => {
      const store = createMockStore([{ latitude: 41.6867, longitude: -91.5802 }]);

      const { getByTestId } = render(
        <Provider store={store}>
          <FogOverlay mapRegion={defaultMapRegion} />
        </Provider>
      );

      const fogRect = getByTestId('mock-skia-rect');
      const fogColor = fogRect.props['data-color'];
      const fogOpacity = fogRect.props['data-opacity'];

      // Test against expected configuration values
      expect(fogColor).toBe(FOG_CONFIG.COLOR);
      expect(fogOpacity).toBe(FOG_CONFIG.OPACITY);

      // Use validation helpers to ensure visibility
      expect(FOG_VALIDATION.isVisibleColor(fogColor)).toBe(true);
      expect(FOG_VALIDATION.isVisibleOpacity(fogOpacity)).toBe(true);
      expect(FOG_VALIDATION.isProblematicConfig(fogColor, fogOpacity)).toBe(false);
    });

    it('should detect problematic fog configurations that cause barely visible fog', () => {
      // Test the validation helpers themselves with known bad values
      const problematicColor = 'rgba(128, 128, 128, 0.3)';
      const problematicOpacity = 0.85;

      expect(FOG_VALIDATION.isVisibleColor(problematicColor)).toBe(false);
      expect(FOG_VALIDATION.isVisibleOpacity(problematicOpacity)).toBe(false);
      expect(FOG_VALIDATION.isProblematicConfig(problematicColor, problematicOpacity)).toBe(true);
    });

    it('should verify current configuration is not problematic', () => {
      // Ensure our current config passes validation
      expect(FOG_VALIDATION.isProblematicConfig(FOG_CONFIG.COLOR, FOG_CONFIG.OPACITY)).toBe(false);
      expect(FOG_VALIDATION.isVisibleColor(FOG_CONFIG.COLOR)).toBe(true);
      expect(FOG_VALIDATION.isVisibleOpacity(FOG_CONFIG.OPACITY)).toBe(true);
    });
  });

  it('renders correctly with empty path', () => {
    const store = createMockStore([]);

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={defaultMapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });

  it('renders correctly with a single point', () => {
    const testPath = [{ latitude: 41.6867, longitude: -91.5802 }];

    const store = createMockStore(testPath);

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={defaultMapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });

  it('renders correctly with multiple points (path)', () => {
    const testPath = [
      { latitude: 41.6867, longitude: -91.5802 },
      { latitude: 41.6877, longitude: -91.5812 },
      { latitude: 41.6887, longitude: -91.5822 },
    ];

    const store = createMockStore(testPath);

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={defaultMapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });

  it('handles null/undefined points in path gracefully', () => {
    const testPath = [
      { latitude: 41.6867, longitude: -91.5802 },
      null,
      { latitude: 41.6877, longitude: -91.5812 },
      undefined,
      { latitude: 41.6887, longitude: -91.5822 },
    ];

    const store = createMockStore(testPath);

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={defaultMapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });

  it('handles path with first point as null/undefined', () => {
    const testPath = [
      null,
      { latitude: 41.6867, longitude: -91.5802 },
      { latitude: 41.6877, longitude: -91.5812 },
    ];

    const store = createMockStore(testPath);

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={defaultMapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });

  it('handles very small map region (high zoom)', () => {
    const store = createMockStore([
      { latitude: 41.6867, longitude: -91.5802 },
      { latitude: 41.6868, longitude: -91.5803 },
    ]);

    const smallMapRegion = {
      ...defaultMapRegion,
      latitudeDelta: 0.0001, // Very small delta = high zoom
      longitudeDelta: 0.0001,
    };

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={smallMapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });

  it('handles very large map region (low zoom)', () => {
    const store = createMockStore([
      { latitude: 41.6867, longitude: -91.5802 },
      { latitude: 41.7867, longitude: -91.6802 },
    ]);

    const largeMapRegion = {
      ...defaultMapRegion,
      latitudeDelta: 1.0, // Large delta = low zoom
      longitudeDelta: 1.0,
    };

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={largeMapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });

  it('tests performance throttling behavior', () => {
    const store = createMockStore([
      { latitude: 41.6867, longitude: -91.5802 },
      { latitude: 41.6877, longitude: -91.5812 },
    ]);

    // First render at time 0
    mockDateNow.mockReturnValue(0);
    const { rerender } = render(
      <Provider store={store}>
        <FogOverlay mapRegion={defaultMapRegion} />
      </Provider>
    );

    // Second render at time 10 (within throttle window)
    mockDateNow.mockReturnValue(10);
    rerender(
      <Provider store={store}>
        <FogOverlay mapRegion={{ ...defaultMapRegion, latitude: 41.6868 }} />
      </Provider>
    );

    // Third render at time 20 (outside throttle window)
    mockDateNow.mockReturnValue(20);
    rerender(
      <Provider store={store}>
        <FogOverlay mapRegion={{ ...defaultMapRegion, latitude: 41.6869 }} />
      </Provider>
    );

    // Verify component still renders correctly despite throttling
    expect(store.getState().exploration.path).toHaveLength(2);
  });

  it('renders with different canvas dimensions', () => {
    const store = createMockStore([{ latitude: 41.6867, longitude: -91.5802 }]);

    const customMapRegion = {
      ...defaultMapRegion,
      width: 300,
      height: 600,
    };

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={customMapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });

  it('handles edge case with zero dimensions', () => {
    const store = createMockStore([]);

    const zeroMapRegion = {
      ...defaultMapRegion,
      width: 0,
      height: 0,
    };

    const result = render(
      <Provider store={store}>
        <FogOverlay mapRegion={zeroMapRegion} />
      </Provider>
    );

    expect(result.getByTestId('mock-skia-canvas')).toBeDefined();
  });
});
